"use client"

import React, { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { StatusTimeline } from "@/components/vendedor/status-timeline"
import { CountdownWidget } from "@/components/vendedor/countdown-widget"
import {
  fetchOrderById, fetchClientById, updateOrderStatus, addItemsToOrder, removeOrderItem, updateOrderItem, fetchProducts,
  fetchOrdenCompraArchivos, createOrdenCompraArchivo, deleteOrdenCompraArchivo,
  fetchClients, fetchVendedores, esVendedorComercial, updateOrder,
  fetchMovableTargetOrders, moveOrderItemToOrder, cancelarPedidoLiberarStock,
  type OrdenCompraArchivo,
} from "@/lib/supabase/queries"
import type { Vendedor } from "@/lib/types"
import { getStatusConfig, getNextStatuses } from "@/lib/status-config"
import { formatCurrencyExact, formatDate, formatDateTime } from "@/lib/utils"
import type { Order, Client, OrderStatus, Product, OrderProduct } from "@/lib/types"
import { normalizeSearch } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowLeft, Printer, MessageCircle, Phone, XCircle, FileText, Trash2, Pencil, ArrowRightLeft } from "lucide-react"
import { CaiBanner, useCaiCanEmit } from "@/components/admin/cai-banner"
import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useCurrentVendedor } from "@/lib/hooks/useCurrentVendedor"
import jsPDF from "jspdf"

export default function AdminPedidoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params)

  const [order, setOrder] = useState<Order | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentStatus, setCurrentStatus] = useState<OrderStatus>("INGRESADO")
  const [statusHistory, setStatusHistory] = useState<Order["statusHistory"]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [orderExtra, setOrderExtra] = useState<any>(null)
  const [facturaResult, setFacturaResult] = useState<{ numero: string; cae: string | null; total: number; pdfUrl: string; emailEnviado: boolean; emailError?: string } | null>(null)
  const [facturaDialogOpen, setFacturaDialogOpen] = useState(false)
  const [newStatus, setNewStatus] = useState<string>("")
  const [statusNote, setStatusNote] = useState("")
  const [cancelMotivo, setCancelMotivo] = useState("")
  const [updating, setUpdating] = useState(false)
  const [facturarOpen, setFacturarOpen] = useState(false)
  const [facturarItems, setFacturarItems] = useState<Record<string, boolean>>({})
  const [facturarOverrides, setFacturarOverrides] = useState<Record<string, { nombre: string; precio: number }>>({})
  const [facturarCantidades, setFacturarCantidades] = useState<Record<string, number>>({})
  const [facturando, setFacturando] = useState(false)
  const [facturarEmpresa, setFacturarEmpresa] = useState<"Aquiles" | "Conancap">("Aquiles")
  const [facturarModo, setFacturarModo] = useState<"testing" | "produccion">("testing")
  const [facturarObs, setFacturarObs] = useState("")
  // N.7: descuento al facturar — el operador ingresa monto positivo (con IVA),
  // el sistema lo resta del total agregando una línea negativa.
  const [facturarDescuento, setFacturarDescuento] = useState(0)

  // OC (archivos del cliente — múltiples)
  const [ocUploading, setOcUploading] = useState(false)
  const [ocArchivos, setOcArchivos] = useState<OrdenCompraArchivo[]>([])

  // Remito (CAI)
  const [remitoOpen, setRemitoOpen] = useState(false)
  const [remitoEmpresa, setRemitoEmpresa] = useState<"Aquiles" | "Conancap">("Aquiles")
  const [remitoObs, setRemitoObs] = useState("")
  const [remitoLoading, setRemitoLoading] = useState(false)
  const [remitoResult, setRemitoResult] = useState<{ numero: string; cai: string; pdfUrl: string; caiVencido: boolean; caiVencimiento: string } | null>(null)

  // Agregar productos a pedido existente
  const [agregarOpen, setAgregarOpen] = useState(false)
  const [prodList, setProdList] = useState<Product[]>([])
  const [prodSearch, setProdSearch] = useState("")
  // R.8: prodToAdd soporta líneas de catálogo y de descuento (igual que el
  // form de pedido nuevo). Las de descuento van con product null y precio que
  // se coacciona a negativo.
  const [prodToAdd, setProdToAdd] = useState<{ product: Product | null; tipoLinea: "producto" | "descuento" | "libre"; nombre: string; codigo: string; qty: number; price: number }[]>([])
  const [agregando, setAgregando] = useState(false)
  // Eliminar item del pedido (N.8). Guarda el id de la fila order_items en curso.
  const [quitandoItemId, setQuitandoItemId] = useState<string | null>(null)
  // R.6: edición inline de cantidad/precio de un item del pedido.
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editItemQty, setEditItemQty] = useState(0)
  const [editItemPrice, setEditItemPrice] = useState(0)
  const [savingItem, setSavingItem] = useState(false)
  // R.9: mover un item pendiente a otro pedido del mismo cliente.
  const [moverItem, setMoverItem] = useState<OrderProduct | null>(null)
  const [moverTargets, setMoverTargets] = useState<{ id: string; orderNumber: string; status: string; total: number; createdAt: Date }[]>([])
  const [moverLoadingTargets, setMoverLoadingTargets] = useState(false)
  const [moviendo, setMoviendo] = useState(false)

  // Editar pedido (item Excel #92, D.7)
  const [editOpen, setEditOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editClients, setEditClients] = useState<Client[]>([])
  const [editVendedores, setEditVendedores] = useState<Vendedor[]>([])
  const [editForm, setEditForm] = useState({
    notes: "",
    sector: "",
    solicita: "",
    recibe: "",
    entrega_otra_sucursal: "",
    razon_social: "",
    is_urgent: false,
    client_id: "",
    vendedor_id: "",
    observaciones_incompleto: "",
  })
  const [facturasOrder, setFacturasOrder] = useState<any[]>([])
  const [notasAsociadas, setNotasAsociadas] = useState<Record<number, any[]>>({})

  const { vendedor: currentUser } = useCurrentVendedor()

  useEffect(() => {
    async function loadData() {
      try {
        const orderData = await fetchOrderById(id)
        if (!orderData) {
          setOrder(null)
          setLoading(false)
          return
        }
        setOrder(orderData)
        setCurrentStatus(orderData.status)
        setStatusHistory(orderData.statusHistory)

        // Load extra order fields (sector, solicita, recibe, etc.)
        const supabaseExtra = createClient()
        const { data: extraData } = await supabaseExtra
          .from("orders")
          .select("sector, solicita, recibe, entrega_otra_sucursal, hoja_ruta_url, observaciones_entrega, factura_id")
          .eq("id", id)
          .single()
        if (extraData) setOrderExtra(extraData)

        try {
          const archivos = await fetchOrdenCompraArchivos(id)
          setOcArchivos(archivos)
        } catch (e) {
          console.error("Error cargando archivos OC:", e)
        }

        if (orderData.clientId) {
          const clientData = await fetchClientById(orderData.clientId)
          setClient(clientData)
        }

        // Load facturas for this order + NC/ND asociadas
        const { data: facturas } = await supabaseExtra
          .from("facturas")
          .select("id, numero, comprobante_nro, tipo, fecha, total, punto_venta, empresa")
          .eq("order_id", id)
          .order("fecha", { ascending: true })
        if (facturas && facturas.length > 0) {
          setFacturasOrder(facturas)
          const fcIds = facturas.filter((f: any) => !f.tipo.toLowerCase().includes("nota")).map((f: any) => f.id)
          if (fcIds.length > 0) {
            const { data: notas } = await supabaseExtra
              .from("facturas")
              .select("id, numero, comprobante_nro, tipo, fecha, total, punto_venta, factura_referencia_id")
              .in("factura_referencia_id", fcIds)
              .order("fecha", { ascending: true })
            if (notas) {
              const grouped: Record<number, any[]> = {}
              for (const n of notas) {
                const refId = n.factura_referencia_id as number
                if (!grouped[refId]) grouped[refId] = []
                grouped[refId].push(n)
              }
              setNotasAsociadas(grouped)
            }
          }
        }
      } catch (err) {
        console.error("Error fetching order:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [id])

  if (loading) return <div className="p-8 flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>

  if (!order) {
    notFound()
  }

  // TS doesn't narrow after notFound(), so assert non-null
  const o = order!

  const whatsappHref = client ? `https://wa.me/${client.whatsapp.replace(/\D/g, "")}` : null
  const nextStatuses = getNextStatuses(currentStatus)
  const isTerminal = ["ENTREGADO", "CANCELADO"].includes(currentStatus)
  const canCancel = !isTerminal

  async function handleUpdateStatus() {
    if (!newStatus) return
    setUpdating(true)
    try {
      // If changing to FACTURADO, offer to generate invoice
      if (newStatus === "FACTURADO" && client) {
        const generateInvoice = confirm("¿Generar factura automáticamente?")
        if (generateInvoice) {
          try {
            const res = await fetch("/api/facturacion/generar", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderId: o.id, clientId: o.clientId }),
            })
            const data = await res.json()
            if (data.success) {
              setFacturaResult(data.factura)
              setFacturaDialogOpen(true)
            } else {
              alert("Error generando factura: " + (data.error || "Error desconocido") + "\nEl estado se actualizará de todas formas.")
            }
          } catch {
            alert("Error de conexión al generar factura. El estado se actualizará de todas formas.")
          }
        }
      }

      // If changing to EN_PROCESO_ENTREGA, generate Hoja de Ruta
      if (newStatus === "EN_PROCESO_ENTREGA") {
        try {
          await generateHojaDeRuta()
        } catch (err) {
          console.error("Error generating hoja de ruta:", err)
        }
      }

      const uid = currentUser?.id || o.vendedorId
      const uname = currentUser?.name || "Admin"
      await updateOrderStatus(o.id, newStatus as OrderStatus, uid, uname, statusNote || undefined)

      const now = new Date()
      setCurrentStatus(newStatus as OrderStatus)
      setStatusHistory([
        ...statusHistory,
        {
          status: newStatus as OrderStatus,
          timestamp: now,
          userId: uid,
          userName: uname,
          notes: statusNote || undefined,
        },
      ])
      setNewStatus("")
      setStatusNote("")
      setDialogOpen(false)
    } catch (err) {
      console.error("Error updating status:", err)
      alert("Error al actualizar el estado del pedido")
    } finally {
      setUpdating(false)
    }
  }

  async function handleCancel() {
    if (!cancelMotivo.trim()) {
      alert("Debés ingresar un motivo para cancelar el pedido")
      return
    }
    setUpdating(true)
    try {
      const supabase = createClient()

      // Plan B: liberar la reserva de stock (reservado −= q de los ítems aún
      // reservados; físico igual → disponible sube) y marcar ítems no reservados.
      // Lógica movida a queries.ts (cancelarPedidoLiberarStock) — antes restauraba
      // el "stock" único inline.
      await cancelarPedidoLiberarStock(o.id)

      // Save cancel reason
      await supabase.from("orders").update({
        cancelado_motivo: cancelMotivo,
        cancelado_at: new Date().toISOString(),
      }).eq("id", o.id)

      const uid = currentUser?.id || o.vendedorId
      const uname = currentUser?.name || "Admin"
      await updateOrderStatus(o.id, "CANCELADO", uid, uname, `Cancelado: ${cancelMotivo}`)

      const now = new Date()
      setCurrentStatus("CANCELADO")
      setStatusHistory([
        ...statusHistory,
        {
          status: "CANCELADO" as OrderStatus,
          timestamp: now,
          userId: uid,
          userName: uname,
          notes: `Cancelado: ${cancelMotivo}`,
        },
      ])
      setCancelMotivo("")
      setCancelDialogOpen(false)
    } catch (err) {
      console.error("Error cancelling order:", err)
      alert("Error al cancelar el pedido")
    } finally {
      setUpdating(false)
    }
  }

  function handlePrintPedido() {
    const doc = new jsPDF()
    const margin = 20
    let y = margin

    doc.setFontSize(18)
    doc.text("PEDIDO", 105, y, { align: "center" })
    y += 10

    doc.setFontSize(10)
    doc.text(`Pedido: ${o.orderNumber}`, margin, y)
    doc.text(`Fecha: ${formatDate(o.createdAt)}`, 140, y)
    y += 6
    doc.text(`Estado: ${getStatusConfig(currentStatus).label}`, margin, y)
    if (o.zona) { doc.text(`Zona: ${o.zona}`, 140, y) }
    y += 6
    if (o.vendedorName) { doc.text(`Vendedor: ${o.vendedorName}`, margin, y); y += 6 }

    y += 4
    doc.setFontSize(12)
    doc.text("Datos del Cliente", margin, y)
    y += 7
    doc.setFontSize(10)
    doc.text(`Cliente: ${o.clientName}`, margin, y); y += 6
    if (o.razonSocial) { doc.text(`Razón Social: ${o.razonSocial}`, margin, y); y += 6 }
    if (client) {
      // Dirección de entrega = a dónde se manda la mercadería (lugar_entrega),
      // con fallback al domicilio fiscal si no hay lugar de entrega cargado.
      const entrega = client.lugarEntrega || client.domicilio
      if (entrega) { doc.text(`Dirección de entrega: ${entrega}`, margin, y); y += 6 }
      if (client.contactName) { doc.text(`Contacto: ${client.contactName}`, margin, y); y += 6 }
      if (client.whatsapp) { doc.text(`Teléfono: ${client.whatsapp}`, margin, y); y += 6 }
    }

    y += 4
    doc.setFontSize(12)
    doc.text("Productos", margin, y)
    y += 8
    doc.setFontSize(9)

    doc.setFont("helvetica", "bold")
    doc.text("Código", margin, y)
    doc.text("Producto", margin + 25, y)
    doc.text("Cant.", 130, y, { align: "right" })
    doc.text("P. Unit.", 155, y, { align: "right" })
    doc.text("Subtotal", 185, y, { align: "right" })
    y += 2
    doc.line(margin, y, 190, y)
    y += 5
    doc.setFont("helvetica", "normal")

    let totalPedido = 0
    for (const p of o.products) {
      const sub = p.price * p.quantity
      totalPedido += sub
      doc.text(p.productCode, margin, y)
      doc.text(p.productName.substring(0, 40), margin + 25, y)
      doc.text(String(p.quantity), 130, y, { align: "right" })
      doc.text(p.price.toFixed(2), 155, y, { align: "right" })
      doc.text(sub.toFixed(2), 185, y, { align: "right" })
      y += 6
      if (y > 270) { doc.addPage(); y = margin }
    }

    y += 2
    doc.line(margin, y, 190, y)
    y += 6
    doc.setFont("helvetica", "bold")
    doc.text("TOTAL:", 155, y, { align: "right" })
    doc.text(`$ ${totalPedido.toFixed(2)}`, 185, y, { align: "right" })

    if (o.notes) {
      y += 10
      doc.setFont("helvetica", "normal")
      doc.setFontSize(9)
      doc.text(`Notas: ${o.notes.substring(0, 120)}`, margin, y)
    }

    doc.save(`Pedido-${o.orderNumber}.pdf`)
  }

  async function generateHojaDeRuta() {
    const doc = new jsPDF()
    const margin = 20
    let y = margin

    doc.setFontSize(18)
    doc.text("HOJA DE RUTA", 105, y, { align: "center" })
    y += 12

    doc.setFontSize(10)
    doc.text(`Pedido: ${o.orderNumber}`, margin, y)
    doc.text(`Fecha: ${formatDate(new Date())}`, 140, y)
    y += 8

    // Client info
    doc.setFontSize(12)
    doc.text("Datos del Cliente", margin, y)
    y += 7
    doc.setFontSize(10)
    doc.text(`Cliente: ${o.clientName}`, margin, y); y += 6
    if (client) {
      // Remito/Hoja: la dirección relevante es a dónde se entrega (lugar_entrega),
      // con fallback al domicilio fiscal.
      doc.text(`Dirección de entrega: ${client.lugarEntrega || client.domicilio || "-"}`, margin, y); y += 6
      doc.text(`Contacto: ${client.contactName || "-"}`, margin, y); y += 6
      doc.text(`Teléfono: ${client.whatsapp || "-"}`, margin, y); y += 6
    }

    // Delivery info
    if (orderExtra) {
      y += 4
      if (orderExtra.sector) { doc.text(`Sector: ${orderExtra.sector}`, margin, y); y += 6 }
      if (orderExtra.solicita) { doc.text(`Solicita: ${orderExtra.solicita}`, margin, y); y += 6 }
      if (orderExtra.recibe) { doc.text(`Recibe: ${orderExtra.recibe}`, margin, y); y += 6 }
      if (orderExtra.entrega_otra_sucursal) { doc.text(`Otra sucursal: ${orderExtra.entrega_otra_sucursal}`, margin, y); y += 6 }
    }

    // Products table
    y += 6
    doc.setFontSize(12)
    doc.text("Productos a Entregar", margin, y)
    y += 8
    doc.setFontSize(9)

    // Header
    doc.setFont("helvetica", "bold")
    doc.text("Código", margin, y)
    doc.text("Producto", margin + 30, y)
    doc.text("Cant.", 160, y)
    y += 2
    doc.line(margin, y, 190, y)
    y += 5
    doc.setFont("helvetica", "normal")

    for (const p of o.products) {
      doc.text(p.productCode, margin, y)
      doc.text(p.productName.substring(0, 50), margin + 30, y)
      doc.text(String(p.quantity), 165, y)
      y += 6
      if (y > 260) { doc.addPage(); y = margin }
    }

    // Signature area
    y += 20
    if (y > 240) { doc.addPage(); y = margin + 10 }
    doc.line(margin, y, 90, y)
    doc.text("Firma", 50, y + 5, { align: "center" })
    doc.line(110, y, 190, y)
    doc.text("Aclaración", 150, y + 5, { align: "center" })
    y += 15
    doc.line(margin, y, 90, y)
    doc.text("DNI", 50, y + 5, { align: "center" })
    doc.line(110, y, 190, y)
    doc.text("Fecha de Entrega", 150, y + 5, { align: "center" })

    // Upload to Supabase Storage
    const pdfBlob = doc.output("blob")
    const fileName = `hoja-ruta-${o.id}.pdf`
    const supabase = createClient()

    const { error: uploadError } = await supabase.storage
      .from("documentos")
      .upload(`hojas-ruta/${fileName}`, pdfBlob, { contentType: "application/pdf", upsert: true })

    if (uploadError) {
      console.error("Error uploading PDF:", uploadError)
      // Fallback: download locally
      doc.save(`Hoja-Ruta-${o.orderNumber}.pdf`)
      return
    }

    const { data: urlData } = supabase.storage
      .from("documentos")
      .getPublicUrl(`hojas-ruta/${fileName}`)

    const publicUrl = urlData.publicUrl
    await supabase.from("orders").update({ hoja_ruta_url: publicUrl }).eq("id", o.id)
    setOrderExtra((prev: any) => ({ ...prev, hoja_ruta_url: publicUrl }))

    // Also download for the user
    doc.save(`Hoja-Ruta-${o.orderNumber}.pdf`)
  }

  // Items available for invoicing (not yet fully invoiced). R.9: los items
  // movidos a otro pedido se facturan en el destino, no acá.
  const itemsPendientesFactura = o.products.filter((p) => !p.facturado && !p.movido)

  function openFacturarDialog() {
    const initial: Record<string, boolean> = {}
    const overrides: Record<string, { nombre: string; precio: number }> = {}
    const cantidades: Record<string, number> = {}
    itemsPendientesFactura.forEach((p) => {
      // S.2: keyear por el id de la fila order_items (único). product_id es null
      // en líneas libre/descuento, así que keyear por productId hacía colisionar
      // todas esas líneas en una sola entrada (se pisaban nombre/precio/cantidad
      // y al tildar una se tildaban todas).
      const k = p.id ?? p.productId
      const pendiente = p.quantity - (p.cantidadFacturada || 0)
      initial[k] = true
      // R.10: el modal trabaja en precios SIN IVA. unit_price (p.price) está
      // CON IVA, así que mostramos p.price/1.21. handleFacturar ya no vuelve a
      // dividir (ver más abajo).
      overrides[k] = { nombre: p.productName, precio: Math.round((p.price / 1.21) * 100) / 100 }
      cantidades[k] = pendiente > 0 ? pendiente : p.quantity
    })
    setFacturarItems(initial)
    setFacturarOverrides(overrides)
    setFacturarCantidades(cantidades)
    // Default empresa según razonSocial del pedido
    const rs = (o.razonSocial || "").toLowerCase()
    setFacturarEmpresa(rs.includes("conancap") ? "Conancap" : "Aquiles")
    setFacturarModo("testing")
    // R.13: pre-cargar las observaciones del pedido para que impacten en la FC.
    setFacturarObs(o.notes || "")
    setFacturarDescuento(0)
    setFacturarOpen(true)
  }

  async function handleFacturar() {
    const selectedProducts = itemsPendientesFactura.filter((p) => facturarItems[p.id ?? p.productId])
    if (selectedProducts.length === 0) {
      alert("Seleccioná al menos un item para facturar")
      return
    }
    if (!o.clientId) {
      alert("El pedido no tiene cliente asignado.")
      return
    }
    // Validar precios (sobre los seleccionados con su override aplicado).
    // S.1: las líneas de descuento (y las libres que el usuario use como
    // descuento) llevan precio NEGATIVO legítimo — TusFacturas las acepta. Solo
    // un precio de 0 o no finito es inválido para esas líneas. Para productos de
    // catálogo el precio debe ser estrictamente > 0.
    const itemsPrecioInvalido = selectedProducts.filter((p) => {
      const ov = facturarOverrides[p.id ?? p.productId]
      const precio = ov?.precio ?? p.price
      if (p.tipoLinea === "descuento" || p.tipoLinea === "libre") {
        return !Number.isFinite(precio) || precio === 0
      }
      return !precio || precio <= 0
    })
    if (itemsPrecioInvalido.length > 0) {
      alert(`Hay items con precio en 0 o inválido: ${itemsPrecioInvalido.map((p) => p.productCode).join(", ")}`)
      return
    }

    setFacturando(true)
    try {
      // Validación previa: cliente debe tener CUIT
      const supabase = createClient()
      const { data: clienteCheck } = await supabase
        .from("clients")
        .select("cuit, numero_docum")
        .eq("id", o.clientId)
        .single()
      const cuit = (clienteCheck?.cuit || clienteCheck?.numero_docum || "").replace(/[-\s]/g, "")
      if (!cuit) {
        alert("El cliente no tiene CUIT cargado. Editá la ficha del cliente primero.")
        setFacturando(false)
        return
      }

      // TODO: alícuota hardcoded a 21% — agregar campo products.alicuota_iva
      // TODO: precio_sin_iva calculado como precio/1.21 — asume todo 21%
      const items = selectedProducts.map((p) => {
        const k = p.id ?? p.productId
        const ov = facturarOverrides[k]
        const nombre = ov?.nombre || p.productName
        // R.10: el override.precio ya está SIN IVA (ver openFacturarDialog), no
        // se vuelve a dividir.
        const precio = ov?.precio ?? Math.round((p.price / 1.21) * 100) / 100
        const cant = facturarCantidades[k] ?? p.quantity
        return {
          descripcion: `${p.productCode} - ${nombre}`,
          cantidad: cant,
          precioUnitarioSinIva: Math.round(precio * 100) / 100,
          alicuota: 21 as const,
        }
      })

      // N.7: línea de descuento (monto positivo ingresado → línea negativa que
      // resta del total, mismo criterio que la factura standalone).
      if (facturarDescuento && facturarDescuento > 0) {
        items.push({
          descripcion: "Descuento",
          cantidad: 1,
          precioUnitarioSinIva: -Math.round((facturarDescuento / 1.21) * 100) / 100,
          alicuota: 21 as const,
        })
      }

      const res = await fetch("/api/facturar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa: facturarEmpresa,
          modo: facturarModo,
          orderId: o.id,
          clientId: o.clientId,
          items,
          observaciones: facturarObs || undefined,
          // El endpoint usa estos para marcar order_items.facturado/factura_id
          // de forma transaccional. Antes lo hacíamos acá con un for-loop post
          // AFIP-OK, lo cual era frágil: si el browser se cerraba entre el
          // response y el UPDATE, los items quedaban sin tracking y la próxima
          // parcial los repetía.
          // S.2: enviamos los ids de fila order_items (no product_id, que es
          // null en líneas libre/descuento y marcaba todas a la vez).
          orderItemIds: selectedProducts.map((p) => p.id),
          cantidadesFacturadas: selectedProducts.map((p) => facturarCantidades[p.id ?? p.productId] ?? p.quantity),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setFacturaResult({
          numero: data.numero,
          cae: data.cae,
          total: data.total,
          pdfUrl: data.pdfUrl,
          emailEnviado: data.emailEnviado,
          emailError: data.emailError,
        })
        setFacturaDialogOpen(true)

        // Reflejar en estado local (sino el botón "Facturar" sigue visible
        // hasta el próximo refresh de la página).
        const facturadosIds = new Set(selectedProducts.map((sp) => sp.id ?? sp.productId))
        setOrder((prev) => prev ? {
          ...prev,
          products: prev.products.map((p) => {
            if (!facturadosIds.has(p.id ?? p.productId)) return p
            const cantFacturada = (p.cantidadFacturada || 0) + (facturarCantidades[p.id ?? p.productId] ?? p.quantity)
            return { ...p, facturado: cantFacturada >= p.quantity, cantidadFacturada: cantFacturada, facturaId: data.facturaId }
          }),
        } : prev)

        // El endpoint /api/facturar ya hace UPDATE orders.factura_id
        setOrderExtra((prev: any) => ({ ...prev, factura_id: data.facturaId }))

        // Actualizar status
        const allInvoiced = selectedProducts.length === itemsPendientesFactura.length
        const newOrderStatus = allInvoiced ? "FACTURADO" : "FACTURADO_PARCIAL"
        const uid = currentUser?.id || o.vendedorId
        const uname = currentUser?.name || "Admin"
        // updateOrderStatus dispara la asignación al reparto. Si esa parte falla,
        // la factura YA se emitió y el status ya quedó guardado: avisamos del
        // problema de reparto sin reportar la factura como fallida.
        try {
          await updateOrderStatus(o.id, newOrderStatus as OrderStatus, uid, uname, `Factura ${data.numero}`)
        } catch (statusErr) {
          console.error("updateOrderStatus/reparto:", statusErr)
          alert("La factura se emitió OK, pero falló la asignación al reparto. Avisá a Logística.")
        }

        setCurrentStatus(newOrderStatus as OrderStatus)
        setStatusHistory([
          ...statusHistory,
          {
            status: newOrderStatus as OrderStatus,
            timestamp: new Date(),
            userId: uid,
            userName: uname,
            notes: `Factura ${data.numero}`,
          },
        ])
      } else {
        const erroresStr = data.errores?.length ? "\n\nErrores AFIP:\n- " + data.errores.join("\n- ") : ""
        alert(`Error en paso "${data.paso}":\n${data.error}${erroresStr}`)
      }
    } catch (err) {
      console.error("Error facturando:", err)
      alert("Error de conexión al generar factura: " + (err instanceof Error ? err.message : "desconocido"))
    } finally {
      setFacturando(false)
      setFacturarOpen(false)
    }
  }

  async function handleUploadOC(files: File[]) {
    if (files.length === 0) return
    const invalidos = files.filter((f) => f.type !== "application/pdf")
    if (invalidos.length > 0) {
      alert(`Solo se aceptan PDFs. Archivos rechazados: ${invalidos.map((f) => f.name).join(", ")}`)
      return
    }
    setOcUploading(true)
    try {
      const supabase = createClient()
      const nuevos: OrdenCompraArchivo[] = []
      for (const file of files) {
        const ts = Date.now() + Math.random().toString(36).slice(2, 8)
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
        const path = `ordenes-compra/${o.id}/${ts}_${safeName}`
        const { error: uploadError } = await supabase.storage
          .from("ordenes-compra")
          .upload(path, file, { contentType: "application/pdf", upsert: false })
        if (uploadError) {
          alert(`Error subiendo "${file.name}": ${uploadError.message}`)
          continue
        }
        const { data: signedData, error: signedError } = await supabase.storage
          .from("ordenes-compra")
          .createSignedUrl(path, 60 * 60 * 24 * 365)
        if (signedError || !signedData?.signedUrl) {
          alert(`Error generando URL de "${file.name}": ${signedError?.message || "sin URL"}`)
          continue
        }
        const id = await createOrdenCompraArchivo({
          order_id: o.id,
          url: signedData.signedUrl,
          storage_path: path,
          filename: file.name,
          content_type: file.type,
        })
        nuevos.push({
          id,
          order_id: o.id,
          url: signedData.signedUrl,
          storage_path: path,
          filename: file.name,
          content_type: file.type,
          uploaded_at: new Date().toISOString(),
        })
      }
      setOcArchivos((prev) => [...prev, ...nuevos])
    } catch (e) {
      console.error("Error subiendo OC:", e)
      alert("Error subiendo OC: " + (e instanceof Error ? e.message : "desconocido"))
    } finally {
      setOcUploading(false)
    }
  }

  async function handleDeleteArchivoOC(archivo: OrdenCompraArchivo) {
    if (!confirm(`¿Eliminar el archivo "${archivo.filename || "sin nombre"}"?`)) return
    try {
      const supabase = createClient()
      // Borrar del storage si conocemos el path (los registros legacy migrados pueden no tenerlo)
      if (archivo.storage_path) {
        await supabase.storage.from("ordenes-compra").remove([archivo.storage_path])
      }
      await deleteOrdenCompraArchivo(archivo.id)
      setOcArchivos((prev) => prev.filter((a) => a.id !== archivo.id))
    } catch (e) {
      console.error("Error eliminando archivo OC:", e)
      alert("Error eliminando archivo: " + (e instanceof Error ? e.message : "desconocido"))
    }
  }

  // Abre el dialog de edicion precargando los campos actuales del pedido +
  // los extras de orderExtra. Si los listados de clients/vendedores aun no
  // se cargaron, los carga ahora (lazy, solo cuando hace falta).
  async function openEditDialog() {
    if (!order) return
    if (editClients.length === 0) {
      try {
        const [cs, vs] = await Promise.all([fetchClients(), fetchVendedores()])
        setEditClients(cs)
        setEditVendedores(vs)
      } catch (e) {
        console.error("Error cargando clients/vendedores para edicion:", e)
      }
    }
    setEditForm({
      notes: order.notes || "",
      sector: orderExtra?.sector || "",
      solicita: orderExtra?.solicita || "",
      recibe: orderExtra?.recibe || "",
      entrega_otra_sucursal: orderExtra?.entrega_otra_sucursal || "",
      razon_social: order.razonSocial || "",
      is_urgent: !!order.isUrgent,
      client_id: order.clientId || "",
      vendedor_id: order.vendedorId || "",
      observaciones_incompleto: order.observacionesIncompleto || "",
    })
    setEditOpen(true)
  }

  // Permisos de edicion segun estado (matriz D.7 aprobada).
  // cliente/vendedor solo editables en BORRADOR e INGRESADO.
  // datos generales editables salvo en CANCELADO.
  const puedeEditarClienteVendedor = currentStatus === "BORRADOR" || currentStatus === "INGRESADO"

  async function handleSaveEdit() {
    if (!order) return
    setEditSaving(true)
    try {
      const original = order
      const clientChanged = puedeEditarClienteVendedor && editForm.client_id && editForm.client_id !== original.clientId
      if (clientChanged) {
        const ok = confirm(
          "Cambiar el cliente moverá este pedido a la cta cte del nuevo cliente. ¿Continuar?"
        )
        if (!ok) {
          setEditSaving(false)
          return
        }
      }

      const updates: Parameters<typeof updateOrder>[1] = {
        notes: editForm.notes,
        sector: editForm.sector || null,
        solicita: editForm.solicita || null,
        recibe: editForm.recibe || null,
        entrega_otra_sucursal: editForm.entrega_otra_sucursal || null,
        razon_social: editForm.razon_social || null,
        is_urgent: editForm.is_urgent,
        observaciones_incompleto: editForm.observaciones_incompleto || null,
      }

      if (puedeEditarClienteVendedor) {
        const cli = editClients.find((c) => c.id === editForm.client_id)
        const vend = editVendedores.find((v) => v.id === editForm.vendedor_id)
        if (cli) {
          updates.client_id = cli.id
          updates.client_name = cli.businessName
          updates.zona = cli.zona
        }
        if (vend) {
          updates.vendedor_id = vend.id
          updates.vendedor_name = vend.name
        }
      }

      await updateOrder(order.id, updates)

      // Refresh local
      setOrder((prev) => prev ? {
        ...prev,
        notes: editForm.notes,
        razonSocial: editForm.razon_social || undefined,
        isUrgent: editForm.is_urgent,
        observacionesIncompleto: editForm.observaciones_incompleto || undefined,
        ...(puedeEditarClienteVendedor && updates.client_id ? {
          clientId: updates.client_id!,
          clientName: updates.client_name!,
          zona: updates.zona as Order["zona"],
        } : {}),
        ...(puedeEditarClienteVendedor && updates.vendedor_id ? {
          vendedorId: updates.vendedor_id!,
          vendedorName: updates.vendedor_name!,
        } : {}),
      } : prev)
      setOrderExtra((prev: any) => ({
        ...(prev || {}),
        sector: editForm.sector || null,
        solicita: editForm.solicita || null,
        recibe: editForm.recibe || null,
        entrega_otra_sucursal: editForm.entrega_otra_sucursal || null,
      }))

      setEditOpen(false)
    } catch (e: any) {
      alert("Error al guardar cambios: " + (e?.message || ""))
    } finally {
      setEditSaving(false)
    }
  }

  // N.8: eliminar un item del pedido (solo BORRADOR/INGRESADO, no facturados).
  async function handleQuitarItem(item: OrderProduct) {
    if (!order || !item.id) return
    if ((item.cantidadFacturada || 0) > 0 || item.facturado) {
      alert("No se puede eliminar un item que ya fue facturado.")
      return
    }
    if (!confirm(`¿Eliminar "${item.productName}" del pedido? Se devolverá el stock reservado.`)) return
    setQuitandoItemId(item.id)
    try {
      await removeOrderItem(order.id, item.id)
      setOrder((prev) => prev ? {
        ...prev,
        products: prev.products.filter((p) => p.id !== item.id),
        total: Math.max(0, prev.total - item.price * item.quantity),
      } : prev)
    } catch (e: any) {
      alert("Error al eliminar item: " + (e?.message || ""))
    } finally {
      setQuitandoItemId(null)
    }
  }

  // R.6: iniciar/guardar edición inline de cantidad y precio de un item.
  function startEditItem(item: OrderProduct) {
    if (!item.id) return
    setEditingItemId(item.id)
    setEditItemQty(item.quantity)
    setEditItemPrice(item.price)
  }

  async function handleSaveItemEdit(item: OrderProduct) {
    if (!order || !item.id) return
    if (editItemQty <= 0) {
      alert("La cantidad debe ser mayor a 0")
      return
    }
    setSavingItem(true)
    try {
      await updateOrderItem(order.id, item.id, { quantity: editItemQty, price: editItemPrice })
      setOrder((prev) => {
        if (!prev) return prev
        const products = prev.products.map((p) =>
          p.id === item.id ? { ...p, quantity: editItemQty, price: editItemPrice } : p
        )
        const total = products.reduce((s, p) => s + p.price * p.quantity, 0)
        return { ...prev, products, total }
      })
      setEditingItemId(null)
    } catch (e: any) {
      alert("Error al editar item: " + (e?.message || ""))
    } finally {
      setSavingItem(false)
    }
  }

  // R.9: abrir el diálogo de "Mover a otro pedido" y cargar los pedidos destino.
  async function openMoverDialog(item: OrderProduct) {
    if (!order?.clientId) {
      alert("El pedido no tiene cliente asignado.")
      return
    }
    setMoverItem(item)
    setMoverTargets([])
    setMoverLoadingTargets(true)
    try {
      const targets = await fetchMovableTargetOrders(order.clientId, order.id)
      setMoverTargets(targets)
    } catch (e: any) {
      alert("Error al buscar pedidos destino: " + (e?.message || ""))
    } finally {
      setMoverLoadingTargets(false)
    }
  }

  async function handleMoverItem(toOrderId: string) {
    if (!order || !moverItem?.id) return
    setMoviendo(true)
    try {
      await moveOrderItemToOrder(moverItem.id, order.id, toOrderId)
      setOrder((prev) => prev ? {
        ...prev,
        products: prev.products.map((p) =>
          p.id === moverItem.id ? { ...p, movido: true, movidoAOrderId: toOrderId } : p
        ),
      } : prev)
      setMoverItem(null)
    } catch (e: any) {
      alert("Error al mover el item: " + (e?.message || ""))
    } finally {
      setMoviendo(false)
    }
  }

  function openRemitoDialog() {
    const rs = (o.razonSocial || "").toLowerCase()
    const defaultEmpresa: "Aquiles" | "Conancap" = rs.includes("conancap") ? "Conancap" : "Aquiles"
    setRemitoEmpresa(defaultEmpresa)
    // R.13: pre-cargar observaciones del pedido para que impacten en el remito.
    setRemitoObs(o.notes || "")
    setRemitoResult(null)
    setRemitoOpen(true)
  }

  async function handleGenerarRemito() {
    setRemitoLoading(true)
    try {
      const res = await fetch("/api/remito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa: remitoEmpresa,
          orderId: o.id,
          observaciones: remitoObs || undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setRemitoResult({
          numero: data.numero,
          cai: data.cai,
          pdfUrl: data.pdfUrl,
          caiVencido: data.caiVencido,
          caiVencimiento: data.caiVencimiento,
        })
      } else {
        const extra = data.rango ? `\nRango talonario: ${data.rango.desde}-${data.rango.hasta}\nÚltimo número usado: ${data.ultimo_numero ?? "(ninguno)"}` : ""
        alert(`Error en paso "${data.paso}":\n${data.error}${extra}`)
      }
    } catch (err) {
      console.error("Error generando remito:", err)
      alert("Error de conexión: " + (err instanceof Error ? err.message : "desconocido"))
    } finally {
      setRemitoLoading(false)
    }
  }

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/pedidos">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">Pedido {o.orderNumber}</h1>
            {o.isUrgent && (
              <Badge variant="destructive" className="text-xs">
                URGENTE
              </Badge>
            )}
            {o.isCustom && (
              <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                CUSTOMIZADO
              </Badge>
            )}
            {o.esIncompleto && (
              <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300">
                PEDIDO INCOMPLETO
              </Badge>
            )}
            {o.razonSocial && (
              <Badge variant="outline" className="text-xs">
                {o.razonSocial}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">Creado el {formatDateTime(o.createdAt)}</p>
          {o.esIncompleto && o.observacionesIncompleto && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
              {o.observacionesIncompleto}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrintPedido}>
            <Printer className="h-4 w-4 mr-2" />
            Imprimir Pedido
          </Button>

          {/* Facturar (TusFacturas/AFIP — usa /api/facturar) */}
          {itemsPendientesFactura.length > 0 && !isTerminal && (
            <Button variant="default" className="bg-purple-600 hover:bg-purple-700" onClick={openFacturarDialog}>
              <FileText className="h-4 w-4 mr-2" />
              Facturar
            </Button>
          )}

          {/* Generar Remito (solo post-facturado) */}
          {["FACTURADO", "FACTURADO_PARCIAL", "EN_PROCESO_ENTREGA", "ENTREGADO"].includes(currentStatus) && (
            <Button variant="default" className="bg-blue-600 hover:bg-blue-700" onClick={openRemitoDialog}>
              <FileText className="h-4 w-4 mr-2" />
              Generar Remito
            </Button>
          )}

          {/* Agregar productos */}
          {(["INGRESADO", "BORRADOR"] as string[]).includes(currentStatus) && (
            <Button
              variant="outline"
              onClick={async () => {
                if (prodList.length === 0) setProdList(await fetchProducts())
                setAgregarOpen(true)
              }}
            >
              + Agregar productos
            </Button>
          )}

          {/* Editar pedido (item Excel #92, D.7). Disponible salvo en CANCELADO. */}
          {currentStatus !== "CANCELADO" && (
            <Button variant="outline" onClick={openEditDialog}>
              Editar pedido
            </Button>
          )}

          {/* Confirmar (BORRADOR → INGRESADO) */}
          {currentStatus === "BORRADOR" && (
            <Button
              variant="default"
              onClick={async () => {
                if (!confirm("¿Confirmar pedido y pasarlo a INGRESADO?")) return
                const uid = currentUser?.id || o.vendedorId || ""
                const uname = currentUser?.name || o.vendedorName || "Admin"
                try {
                  await updateOrderStatus(o.id, "INGRESADO", uid, uname, "Confirmación desde borrador")
                  setCurrentStatus("INGRESADO")
                } catch (e: any) {
                  alert("Error: " + (e?.message || ""))
                }
              }}
            >
              Confirmar Pedido
            </Button>
          )}

          {/* Hoja de ruta button */}
          {orderExtra?.hoja_ruta_url && (
            <Button asChild variant="outline">
              <a href={orderExtra.hoja_ruta_url} target="_blank" rel="noopener noreferrer">
                Ver Hoja de Ruta
              </a>
            </Button>
          )}

          {/* Cancel button */}
          {canCancel && (
            <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="default">
                  <XCircle className="h-4 w-4 mr-2" />
                  Cancelar Pedido
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Cancelar Pedido #{o.id}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <p className="text-sm text-muted-foreground">
                    Esta acción no se puede deshacer. Ingresá el motivo de cancelación.
                  </p>
                  <div className="space-y-2">
                    <Label>Motivo de cancelación *</Label>
                    <Textarea
                      placeholder="Ingresá el motivo..."
                      value={cancelMotivo}
                      onChange={(e) => setCancelMotivo(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
                      Volver
                    </Button>
                    <Button variant="destructive" onClick={handleCancel} disabled={!cancelMotivo.trim() || updating}>
                      {updating ? "Cancelando..." : "Confirmar Cancelación"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Update status */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={isTerminal || nextStatuses.length === 0}>
                Actualizar Estado
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Actualizar Estado del Pedido</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="text-sm text-muted-foreground">
                  Estado actual: <Badge className={`${getStatusConfig(currentStatus).bgColor} ${getStatusConfig(currentStatus).color} ml-2`}>{getStatusConfig(currentStatus).label}</Badge>
                </div>
                <div className="space-y-2">
                  <Label>Nuevo estado</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar estado..." />
                    </SelectTrigger>
                    <SelectContent>
                      {nextStatuses.filter((s) => s !== "CANCELADO").map((status) => {
                        const config = getStatusConfig(status)
                        return (
                          <SelectItem key={status} value={status}>
                            {config.icon} {config.label}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nota (opcional)</Label>
                  <Textarea
                    placeholder="Agregar una nota sobre el cambio de estado..."
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleUpdateStatus} disabled={!newStatus || updating}>
                    {updating ? "Actualizando..." : "Confirmar"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Status Timeline */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Estado del Pedido</h3>
        <StatusTimeline currentStatus={currentStatus} isCustom={o.isCustom} />
      </Card>

      {/* Countdown for Custom Orders */}
      {o.isCustom && <CountdownWidget estimatedDelivery={o.estimatedDelivery} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Products */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Productos</h3>
            <div className="space-y-3">
              {o.products.map((product, index) => {
                // Desglose facturado/pendiente (item Excel #76).
                // cantidad_facturada se persiste desde fix A.1.
                const cantFact = Number(product.cantidadFacturada || 0)
                const cantPend = Math.max(0, product.quantity - cantFact)
                const totalmenteFacturado = product.facturado && cantFact >= product.quantity
                const parcial = cantFact > 0 && cantPend > 0
                const rowBg = totalmenteFacturado
                  ? "bg-green-50/50"
                  : parcial
                  ? "bg-amber-50/50"
                  : ""
                return (
                  <div key={index} className={`flex items-center justify-between py-3 border-b last:border-0 ${rowBg}`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{product.productName}</p>
                        {totalmenteFacturado && (
                          <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-200">Facturado completo</Badge>
                        )}
                        {parcial && (
                          <Badge variant="outline" className="text-xs bg-amber-100 text-amber-700 border-amber-200">Parcial</Badge>
                        )}
                        {!product.facturado && cantFact === 0 && !product.movido && (
                          <Badge variant="outline" className="text-xs bg-gray-100 text-gray-600 border-gray-200">Pendiente</Badge>
                        )}
                        {product.movido && (
                          <Badge variant="outline" className="text-xs bg-purple-100 text-purple-700 border-purple-200">Movido a otro pedido</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground font-mono">{product.productCode}</p>
                      {cantFact > 0 && cantFact < product.quantity && (
                        <p className="text-xs text-amber-700 mt-1">
                          Facturado: {cantFact} de {product.quantity} · Pendiente: {cantPend}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      {/* R.6: edición inline de cantidad y precio. Solo
                          BORRADOR/INGRESADO y items no facturados (matriz D.7). */}
                      {editingItemId === product.id ? (
                        <>
                          <div className="flex items-center gap-1">
                            <label className="text-[10px] uppercase text-muted-foreground">Cant.</label>
                            <input
                              type="number"
                              min={1}
                              value={editItemQty}
                              onChange={(e) => setEditItemQty(parseInt(e.target.value) || 0)}
                              className="w-16 p-1 border rounded text-sm text-center"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <label className="text-[10px] uppercase text-muted-foreground">Precio</label>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={editItemPrice}
                              onChange={(e) => setEditItemPrice(parseFloat(e.target.value) || 0)}
                              className="w-24 p-1 border rounded text-sm text-right"
                            />
                          </div>
                          <Button size="sm" onClick={() => handleSaveItemEdit(product)} disabled={savingItem}>
                            {savingItem ? "..." : "Guardar"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingItemId(null)} disabled={savingItem}>
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className={`text-sm text-muted-foreground ${product.movido ? "line-through" : ""}`}>Cant: {product.quantity}</span>
                          <span className={`font-semibold ${product.movido ? "line-through text-muted-foreground" : ""}`}>{formatCurrencyExact(product.price * product.quantity)}</span>
                          {(["BORRADOR", "INGRESADO"] as string[]).includes(currentStatus) && cantFact === 0 && !product.facturado && !product.movido && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              onClick={() => startEditItem(product)}
                              title="Editar cantidad y precio"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {/* R.9: mover item pendiente a otro pedido del mismo cliente */}
                          {cantFact === 0 && !product.facturado && !product.movido && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                              onClick={() => openMoverDialog(product)}
                              title="Mover a otro pedido"
                            >
                              <ArrowRightLeft className="h-4 w-4" />
                            </Button>
                          )}
                          {/* N.8: eliminar item (solo BORRADOR/INGRESADO y no facturado) */}
                          {(["BORRADOR", "INGRESADO"] as string[]).includes(currentStatus) && cantFact === 0 && !product.facturado && !product.movido && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                              disabled={quitandoItemId === product.id}
                              onClick={() => handleQuitarItem(product)}
                              title="Eliminar item del pedido"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <Separator className="my-4" />
            <div className="flex items-center justify-between">
              <span className="font-semibold text-lg">Total</span>
              <span className="font-bold text-2xl">{formatCurrencyExact(o.total)}</span>
            </div>
          </Card>

          {/* Facturación + NC/ND asociadas (M.4) */}
          {facturasOrder.length > 0 && (
            <Card className="p-6">
              <h3 className="font-semibold mb-4">Facturación</h3>
              <div className="space-y-3">
                {facturasOrder.filter((f) => !f.tipo.toLowerCase().includes("nota")).map((fc: any) => {
                  const nro = fc.comprobante_nro || fc.numero || "-"
                  const pv = fc.punto_venta ? String(fc.punto_venta).padStart(5, "0") : ""
                  const num = nro ? String(nro).padStart(8, "0") : ""
                  const display = pv ? `${pv}-${num}` : num
                  const notas = notasAsociadas[fc.id] || []
                  return (
                    <div key={fc.id} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{fc.tipo}</Badge>
                          <Link href={`/admin/facturacion?ver=${fc.id}`} className="font-mono text-sm font-medium hover:underline text-blue-700">{display}</Link>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          {fc.empresa && <Badge variant="outline" className="text-xs">{fc.empresa}</Badge>}
                          <span className="text-muted-foreground">{fc.fecha}</span>
                          <span className="font-semibold">{formatCurrencyExact(Number(fc.total))}</span>
                        </div>
                      </div>
                      {notas.length > 0 && (
                        <div className="mt-2 ml-4 space-y-1">
                          {notas.map((n: any) => {
                            const nNro = n.comprobante_nro || n.numero || "-"
                            const nPv = n.punto_venta ? String(n.punto_venta).padStart(5, "0") : ""
                            const nNum = nNro ? String(nNro).padStart(8, "0") : ""
                            const nDisplay = nPv ? `${nPv}-${nNum}` : nNum
                            const isNC = n.tipo.toLowerCase().includes("crédito") || n.tipo.toLowerCase().includes("credito")
                            return (
                              <div key={n.id} className={`flex items-center justify-between text-sm p-2 rounded ${isNC ? "bg-red-50" : "bg-amber-50"}`}>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={`text-[10px] ${isNC ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>
                                    {n.tipo.includes("Crédito") || n.tipo.includes("Credito") ? "NC" : "ND"}
                                  </Badge>
                                  <Link href={`/admin/facturacion?ver=${n.id}`} className="font-mono hover:underline text-blue-700">{nDisplay}</Link>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-muted-foreground">{n.fecha}</span>
                                  <span className={`font-medium ${isNC ? "text-red-700" : "text-amber-700"}`}>{formatCurrencyExact(Number(n.total))}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Status History */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Historial de Estados</h3>
            <div className="space-y-4">
              {statusHistory.map((change, index) => (
                <div key={index} className="flex items-start gap-4 pb-4 border-b last:border-0">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        className={`${getStatusConfig(change.status).bgColor} ${getStatusConfig(change.status).color} text-xs`}
                      >
                        {getStatusConfig(change.status).label}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{formatDateTime(change.timestamp)}</span>
                    </div>
                    <p className="text-sm">
                      <span className="font-medium">{change.userName}</span>
                      {change.notes && <span className="text-muted-foreground ml-2">- {change.notes}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Notes */}
          {o.notes && (
            <Card className="p-6">
              <h3 className="font-semibold mb-2">Notas del Pedido</h3>
              <p className="text-sm text-muted-foreground">{o.notes}</p>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Client Info */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Información del Cliente</h3>
            {client && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Cliente</p>
                  <p className="font-medium">{client.businessName}</p>
                  <p className="text-sm">{client.contactName}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Contacto</p>
                  <div className="flex items-center gap-2 text-sm mb-1">
                    <Phone className="h-3 w-3" />
                    <span>{client.whatsapp}</span>
                  </div>
                  <p className="text-sm">{client.email}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Domicilio fiscal</p>
                  <p className="text-sm">{client.domicilio || client.address || "-"}</p>
                  {client.lugarEntrega && (
                    <p className="text-sm mt-1"><span className="text-xs text-muted-foreground">Lugar de entrega:</span> {client.lugarEntrega}</p>
                  )}
                </div>
                <Separator />
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{client.zona}</Badge>
                  <Badge variant="outline">{client.paymentTerms}</Badge>
                </div>
                {whatsappHref && (
                  <Button asChild className="w-full bg-transparent" variant="outline">
                    <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Contactar Cliente
                    </a>
                  </Button>
                )}
              </div>
            )}
          </Card>

          {/* Vendedor Info */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Vendedor Asignado</h3>
            <div>
              <p className="font-medium mb-1">{o.vendedorName}</p>
              <Badge variant="outline" className="text-xs">
                {o.zona}
              </Badge>
            </div>
          </Card>

          {/* Orden de Compra (archivos del cliente — múltiples) */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Orden de Compra</h3>
            <div className="space-y-3">
              {ocArchivos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin archivos adjuntos</p>
              ) : (
                <ul className="space-y-2">
                  {ocArchivos.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 border rounded px-3 py-2 text-sm">
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-0 truncate text-primary hover:underline"
                        title={a.filename || ""}
                      >
                        📎 {a.filename || "archivo.pdf"}
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDeleteArchivoOC(a)}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="Eliminar archivo"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="block">
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  multiple
                  className="hidden"
                  disabled={ocUploading}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || [])
                    if (files.length > 0) handleUploadOC(files)
                    e.target.value = ""
                  }}
                />
                <span className={`block text-center text-sm px-3 py-3 border-2 border-dashed border-muted rounded cursor-pointer hover:bg-muted/50 ${ocUploading ? "opacity-50" : ""}`}>
                  {ocUploading ? "Subiendo..." : ocArchivos.length === 0 ? "📎 Adjuntar OC del cliente (PDF)" : "+ Agregar más archivos"}
                </span>
              </label>
            </div>
          </Card>

          {/* Delivery Info */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Información de Entrega</h3>
            <div className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Fecha estimada</p>
                <p className="font-medium">{formatDate(o.estimatedDelivery)}</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">Zona de entrega</p>
                <p className="font-medium">{o.zona}</p>
              </div>
              {orderExtra?.sector && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Sector</p>
                    <p className="font-medium">{orderExtra.sector}</p>
                  </div>
                </>
              )}
              {orderExtra?.solicita && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Solicita</p>
                    <p className="font-medium">{orderExtra.solicita}</p>
                  </div>
                </>
              )}
              {orderExtra?.recibe && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Recibe</p>
                    <p className="font-medium">{orderExtra.recibe}</p>
                  </div>
                </>
              )}
              {orderExtra?.entrega_otra_sucursal && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">Entrega otra sucursal</p>
                    <p className="font-medium">{orderExtra.entrega_otra_sucursal}</p>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Facturar Dialog */}
      <Dialog open={facturarOpen} onOpenChange={setFacturarOpen}>
        {/* R.12: alto máximo + flex-col para que el cuerpo scrollee y los botones
            queden siempre fijos al pie, aunque el pedido tenga muchos items. */}
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Facturar Pedido {o.orderNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2 flex-1 overflow-y-auto pr-1">
            <p className="text-sm text-muted-foreground">
              Seleccioná los items a facturar y editá nombre o precio si es necesario. El código no se puede modificar. Si no facturás todos, el pedido quedará en estado "Facturado Parcial".
            </p>
            <div className="space-y-2">
              {itemsPendientesFactura.map((product) => {
                // S.2: key por id de fila order_items (product_id es null en
                // líneas libre/descuento y las hacía colisionar entre sí).
                const k = product.id ?? product.productId
                const override = facturarOverrides[k] || { nombre: product.productName, precio: product.price }
                const cantPendiente = product.quantity - (product.cantidadFacturada || 0)
                const cant = facturarCantidades[k] ?? (cantPendiente > 0 ? cantPendiente : product.quantity)
                const subtotal = (Number(override.precio) || 0) * cant
                const isChecked = facturarItems[k] || false
                const esLineaSinCatalogo = product.tipoLinea === "descuento" || product.tipoLinea === "libre"
                return (
                  <div key={k} className={`p-3 border rounded-lg ${isChecked ? "bg-white" : "bg-red-50/40 border-red-200"}`}>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) =>
                          setFacturarItems((prev) => ({ ...prev, [k]: checked === true }))
                        }
                        className="mt-1"
                      />
                      <div className="flex-1 grid grid-cols-12 gap-2">
                        <div className="col-span-2 text-xs font-mono text-muted-foreground self-center">
                          {product.productCode}
                          {product.tipoLinea === "libre" && (
                            <Badge variant="outline" className="ml-1 text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                              Libre
                            </Badge>
                          )}
                          {product.tipoLinea === "descuento" && (
                            <Badge variant="outline" className="ml-1 text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                              Descuento
                            </Badge>
                          )}
                          {!isChecked && (
                            <Badge variant="outline" className="ml-1 text-[10px] bg-red-100 text-red-700 border-red-300">
                              Excluido
                            </Badge>
                          )}
                        </div>
                        <div className="col-span-5">
                          <label className="text-[10px] uppercase text-muted-foreground block">Nombre/descripción</label>
                          <input
                            type="text"
                            value={override.nombre}
                            onChange={(e) =>
                              setFacturarOverrides((prev) => ({
                                ...prev,
                                [k]: { ...override, nombre: e.target.value },
                              }))
                            }
                            disabled={!isChecked}
                            className="w-full p-1 border rounded text-sm"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] uppercase text-muted-foreground block">Cant.</label>
                          <input
                            type="number"
                            min={1}
                            max={cantPendiente > 0 ? cantPendiente : product.quantity}
                            value={cant}
                            onChange={(e) => {
                              const max = cantPendiente > 0 ? cantPendiente : product.quantity
                              const v = Math.min(Math.max(1, parseInt(e.target.value) || 1), max)
                              setFacturarCantidades((prev) => ({ ...prev, [k]: v }))
                            }}
                            disabled={!isChecked}
                            className="w-full p-1 border rounded text-sm text-center"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] uppercase text-muted-foreground block">Precio s/IVA</label>
                          <input
                            type="number"
                            min={esLineaSinCatalogo ? undefined : 0}
                            step={0.01}
                            value={override.precio}
                            onChange={(e) =>
                              setFacturarOverrides((prev) => ({
                                ...prev,
                                [k]: { ...override, precio: parseFloat(e.target.value) || 0 },
                              }))
                            }
                            disabled={!isChecked}
                            className="w-full p-1 border rounded text-sm text-right"
                          />
                        </div>
                        <div className="col-span-1 text-right self-end">
                          <span className="text-[10px] uppercase text-muted-foreground block">Subtotal s/IVA</span>
                          <span className="text-sm font-semibold">{formatCurrencyExact(subtotal)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            {/* R.10: desglose Neto / IVA 21% / Total. Los precios del modal son
                SIN IVA, así que el subtotal de cada línea es el neto. */}
            {(() => {
              const neto = itemsPendientesFactura
                .filter((p) => facturarItems[p.id ?? p.productId])
                .reduce((sum, p) => {
                  const ov = facturarOverrides[p.id ?? p.productId]
                  const precio = ov?.precio ?? Math.round((p.price / 1.21) * 100) / 100
                  const pendiente = p.quantity - (p.cantidadFacturada || 0)
                  const c = facturarCantidades[p.id ?? p.productId] ?? (pendiente > 0 ? pendiente : p.quantity)
                  return sum + precio * c
                }, 0)
              const iva = Math.round(neto * 0.21 * 100) / 100
              const total = Math.round((neto + iva) * 100) / 100
              return (
                <div className="pt-2 border-t space-y-1">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Neto (sin IVA)</span>
                    <span>{formatCurrencyExact(neto)}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">IVA 21%</span>
                    <span>{formatCurrencyExact(iva)}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t">
                    <span className="font-semibold">Total a facturar</span>
                    <span className="text-lg font-bold">{formatCurrencyExact(total)}</span>
                  </div>
                </div>
              )
            })()}

            {/* Empresa / Modo / Observaciones */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="space-y-1">
                <Label className="text-xs">Empresa emisora</Label>
                <Select value={facturarEmpresa} onValueChange={(v) => setFacturarEmpresa(v as "Aquiles" | "Conancap")}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Aquiles">Aquiles Equipamientos SRL</SelectItem>
                    <SelectItem value="Conancap">Conancap SRL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Modo</Label>
                <Select value={facturarModo} onValueChange={(v) => setFacturarModo(v as "testing" | "produccion")}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="testing">Testing (no afecta AFIP)</SelectItem>
                    <SelectItem value="produccion">Producción (CAE real)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {facturarModo === "produccion" && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                ⚠ Se emitirá una factura real ante AFIP. Verificá empresa, cliente e items.
              </p>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Descuento (con IVA, opcional)</Label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={facturarDescuento || ""}
                onChange={(e) => setFacturarDescuento(Math.max(0, parseFloat(e.target.value) || 0))}
                placeholder="0.00"
                className="w-full p-2 border rounded-md text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Se agrega como una línea negativa en la factura (monto final con IVA incluido).
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observaciones (opcional)</Label>
              <Textarea
                rows={2}
                value={facturarObs}
                onChange={(e) => setFacturarObs(e.target.value)}
                placeholder="Texto que aparecerá en la factura..."
                className="text-sm"
              />
            </div>

          </div>
          {/* R.12: footer fijo fuera del área scrolleable */}
          <div className="flex gap-2 justify-end pt-3 border-t shrink-0">
            <Button variant="outline" onClick={() => setFacturarOpen(false)}>Cancelar</Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700"
              onClick={handleFacturar}
              disabled={facturando || !Object.values(facturarItems).some(Boolean)}
            >
              {facturando ? "Generando factura..." : "Generar Factura"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* R.9: Mover item a otro pedido Dialog */}
      <Dialog open={moverItem !== null} onOpenChange={(open) => { if (!open) setMoverItem(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Mover item a otro pedido</DialogTitle>
            <DialogDescription>
              {moverItem ? `"${moverItem.productName}" se moverá a otro pedido del mismo cliente (INGRESADO o BORRADOR) para poder facturar todo junto. Quedará marcado como "movido" en este pedido.` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {moverLoadingTargets ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Buscando pedidos del cliente...</p>
            ) : moverTargets.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No hay otros pedidos del cliente en estado INGRESADO o BORRADOR.</p>
            ) : (
              moverTargets.map((t) => (
                <div key={t.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <p className="font-medium">{t.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">{t.status} · {formatCurrencyExact(t.total)} · {formatDate(t.createdAt)}</p>
                  </div>
                  <Button size="sm" disabled={moviendo} onClick={() => handleMoverItem(t.id)}>
                    {moviendo ? "Moviendo..." : "Mover acá"}
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoverItem(null)} disabled={moviendo}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Agregar productos Dialog */}
      <Dialog open={agregarOpen} onOpenChange={setAgregarOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agregar productos al pedido</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Buscar producto..."
                value={prodSearch}
                onChange={(e) => setProdSearch(e.target.value)}
                className="flex-1 p-2 border rounded-md text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setProdToAdd([...prodToAdd, { product: null, tipoLinea: "libre", nombre: "", codigo: "LIBRE", qty: 1, price: 0 }])}
              >
                + Línea Libre
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setProdToAdd([...prodToAdd, { product: null, tipoLinea: "descuento", nombre: "Descuento", codigo: "DESCUENTO", qty: 1, price: 0 }])}
              >
                + Descuento
              </Button>
            </div>
            {prodSearch.length >= 2 && (
              <div className="border rounded-md max-h-48 overflow-auto">
                {prodList
                  .filter((p) => {
                    const q = normalizeSearch(prodSearch)
                    return normalizeSearch(p.name).includes(q) || normalizeSearch(p.code || "").includes(q)
                  })
                  .slice(0, 20)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (prodToAdd.find((x) => x.product?.id === p.id)) return
                        setProdToAdd([...prodToAdd, { product: p, tipoLinea: "producto", nombre: p.name, codigo: p.code || "", qty: 1, price: p.price }])
                        setProdSearch("")
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 border-b"
                    >
                      <div className="flex justify-between items-center gap-2">
                        <span className="flex-1">{p.name} <span className="text-xs text-gray-500">{p.code}</span></span>
                        {/* S.4: mostrar stock existente al agregar producto (igual que en pedido nuevo / cotización) */}
                        <Badge variant="outline" className={`text-[10px] ${p.stock <= 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"}`}>
                          {p.stock <= 0 ? "Sin stock" : `Stock: ${p.stock}`}
                        </Badge>
                        <span className="font-medium">{formatCurrencyExact(p.price)}</span>
                      </div>
                    </button>
                  ))}
              </div>
            )}
            {prodToAdd.length > 0 && (
              <div className="border rounded-md">
                <div className="grid grid-cols-[1fr,80px,120px,40px] gap-2 p-2 bg-gray-50 text-xs font-medium">
                  <span>Producto</span><span>Cant.</span><span>Precio</span><span></span>
                </div>
                {prodToAdd.map((it, i) => (
                  <div key={it.product?.id ?? `linea-${i}`} className={`grid grid-cols-[1fr,80px,120px,40px] gap-2 p-2 border-t items-center ${it.tipoLinea === "descuento" ? "bg-amber-50" : it.tipoLinea === "libre" ? "bg-blue-50" : ""}`}>
                    {it.tipoLinea !== "producto" ? (
                      <input
                        type="text"
                        value={it.nombre}
                        onChange={(e) => setProdToAdd(prodToAdd.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                        placeholder={it.tipoLinea === "descuento" ? "Ej: Descuento por pago contado" : "Descripción del ítem (línea libre)"}
                        className="p-1 border rounded text-sm"
                      />
                    ) : (
                      <span className="text-sm">{it.nombre}</span>
                    )}
                    <input
                      type="number" min={1} value={it.qty}
                      disabled={it.tipoLinea === "descuento"}
                      onChange={(e) => {
                        const q = parseInt(e.target.value) || 1
                        setProdToAdd(prodToAdd.map((x, j) => j === i ? { ...x, qty: q } : x))
                      }}
                      className="p-1 border rounded text-sm w-16 disabled:bg-gray-100"
                    />
                    <input
                      type="number" step={0.01} value={it.price}
                      onChange={(e) => {
                        const parsed = parseFloat(e.target.value) || 0
                        // En descuentos el monto siempre resta: se coacciona a negativo.
                        const pr = it.tipoLinea === "descuento" ? -Math.abs(parsed) : parsed
                        setProdToAdd(prodToAdd.map((x, j) => j === i ? { ...x, price: pr } : x))
                      }}
                      className="p-1 border rounded text-sm"
                    />
                    <button
                      onClick={() => setProdToAdd(prodToAdd.filter((_, j) => j !== i))}
                      className="text-red-600 text-sm"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => { setAgregarOpen(false); setProdToAdd([]); setProdSearch("") }}>Cancelar</Button>
            <Button
              disabled={agregando || prodToAdd.length === 0}
              onClick={async () => {
                setAgregando(true)
                try {
                  await addItemsToOrder(o.id, prodToAdd.map((x) => ({
                    productId: x.tipoLinea === "producto" && x.product ? x.product.id : null,
                    productCode: x.codigo,
                    productName: x.nombre,
                    quantity: x.qty,
                    price: x.price,
                    tipoLinea: x.tipoLinea,
                  })))
                  // R.7: la notificación a Matías se dispara dentro de addItemsToOrder.
                  setAgregarOpen(false)
                  setProdToAdd([])
                  setProdSearch("")
                  window.location.reload()
                } catch (e: any) {
                  alert("Error: " + (e?.message || ""))
                } finally {
                  setAgregando(false)
                }
              }}
            >
              {agregando ? "Agregando..." : "Agregar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Factura Generated Dialog */}
      <Dialog open={facturaDialogOpen} onOpenChange={setFacturaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Factura Generada Exitosamente</DialogTitle>
          </DialogHeader>
          {facturaResult && (
            <div className="space-y-3 py-2">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <svg className="w-10 h-10 text-green-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="font-bold text-green-800">Factura {facturaResult.numero} generada</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Número</span>
                  <span className="font-medium">{facturaResult.numero}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CAE</span>
                  <span className="font-mono font-medium text-green-700">{facturaResult.cae || "(testing)"}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base">
                  <span className="font-bold">Total</span>
                  <span className="font-bold text-primary">{formatCurrencyExact(facturaResult.total)}</span>
                </div>
                <div className="text-xs">
                  Email: {facturaResult.emailEnviado
                    ? <span className="text-green-700">enviado al cliente</span>
                    : <span className="text-amber-700">{facturaResult.emailError || "no enviado"}</span>}
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                {facturaResult.pdfUrl && (
                  <Button asChild className="flex-1">
                    <a href={facturaResult.pdfUrl} target="_blank" rel="noopener noreferrer">Ver PDF</a>
                  </Button>
                )}
                <Button variant="outline" className="flex-1" onClick={() => setFacturaDialogOpen(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Editar Pedido Dialog (D.7) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Pedido {o.orderNumber}</DialogTitle>
            <DialogDescription>
              {puedeEditarClienteVendedor
                ? "Estado actual permite editar cliente, vendedor y datos generales."
                : `Estado ${currentStatus}: solo podés editar datos administrativos (cliente y vendedor están bloqueados).`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2 max-h-[60vh] overflow-y-auto pr-1">
            {/* Cliente / Vendedor (solo en estados editables) */}
            {puedeEditarClienteVendedor && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Cliente</Label>
                  <select
                    value={editForm.client_id}
                    onChange={(e) => setEditForm((p) => ({ ...p, client_id: e.target.value }))}
                    className="w-full p-2 border rounded text-sm"
                  >
                    <option value="">— Sin cambio —</option>
                    {editClients.map((c) => (
                      <option key={c.id} value={c.id}>{c.businessName}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Vendedor</Label>
                  <select
                    value={editForm.vendedor_id}
                    onChange={(e) => setEditForm((p) => ({ ...p, vendedor_id: e.target.value }))}
                    className="w-full p-2 border rounded text-sm"
                  >
                    <option value="">— Sin cambio —</option>
                    {editVendedores.filter((v) => v.isActive).map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Razón social emisora */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Razón social emisora</Label>
                <select
                  value={editForm.razon_social}
                  onChange={(e) => setEditForm((p) => ({ ...p, razon_social: e.target.value }))}
                  className="w-full p-2 border rounded text-sm"
                >
                  <option value="">— Sin asignar —</option>
                  <option value="Aquiles">Aquiles</option>
                  <option value="Conancap">Conancap</option>
                </select>
              </div>
              <div className="space-y-1 flex items-end">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.is_urgent}
                    onChange={(e) => setEditForm((p) => ({ ...p, is_urgent: e.target.checked }))}
                  />
                  Pedido urgente
                </label>
              </div>
            </div>

            {/* Datos de entrega */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Sector</Label>
                <input
                  type="text"
                  value={editForm.sector}
                  onChange={(e) => setEditForm((p) => ({ ...p, sector: e.target.value }))}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Solicita</Label>
                <input
                  type="text"
                  value={editForm.solicita}
                  onChange={(e) => setEditForm((p) => ({ ...p, solicita: e.target.value }))}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Recibe</Label>
                <input
                  type="text"
                  value={editForm.recibe}
                  onChange={(e) => setEditForm((p) => ({ ...p, recibe: e.target.value }))}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Otra sucursal de entrega</Label>
                <input
                  type="text"
                  value={editForm.entrega_otra_sucursal}
                  onChange={(e) => setEditForm((p) => ({ ...p, entrega_otra_sucursal: e.target.value }))}
                  className="w-full p-2 border rounded text-sm"
                />
              </div>
            </div>

            {/* Notas / observaciones */}
            <div className="space-y-1">
              <Label className="text-xs">Notas internas</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observaciones (pedido incompleto / faltantes)</Label>
              <Textarea
                value={editForm.observaciones_incompleto}
                onChange={(e) => setEditForm((p) => ({ ...p, observaciones_incompleto: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="text-xs text-muted-foreground border-t pt-3">
              Para modificar productos o cantidades, usá los botones "Agregar productos" o el modal de
              facturación.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remito Dialog */}
      <Dialog open={remitoOpen} onOpenChange={(open) => { setRemitoOpen(open); if (!open) setRemitoResult(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar Remito — Pedido {o.orderNumber}</DialogTitle>
          </DialogHeader>

          {!remitoResult ? (
            <RemitoForm
              remitoEmpresa={remitoEmpresa}
              setRemitoEmpresa={setRemitoEmpresa}
              remitoObs={remitoObs}
              setRemitoObs={setRemitoObs}
              itemsCount={o.products.length}
              loading={remitoLoading}
              onCancel={() => setRemitoOpen(false)}
              onGenerate={handleGenerarRemito}
            />
          ) : (
            <div className="space-y-3 py-2">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                <svg className="w-10 h-10 text-blue-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="font-bold text-blue-800">Remito {remitoResult.numero} generado</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Número</span>
                  <span className="font-medium">{remitoResult.numero}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CAI</span>
                  <span className="font-mono font-medium">{remitoResult.cai}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vencimiento CAI</span>
                  <span className={`font-medium ${remitoResult.caiVencido ? "text-red-700" : ""}`}>
                    {remitoResult.caiVencimiento}{remitoResult.caiVencido ? " (vencido)" : ""}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Empresa emisora</span>
                  <span className="font-medium">{remitoEmpresa}</span>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                {remitoResult.pdfUrl && (
                  <Button asChild className="flex-1">
                    <a href={remitoResult.pdfUrl} target="_blank" rel="noopener noreferrer">Ver PDF</a>
                  </Button>
                )}
                <Button variant="outline" className="flex-1" onClick={() => setRemitoOpen(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Subcomponente del form para que el hook useCaiCanEmit reaccione al cambio
// de empresa sin que se ejecute en cada render del padre.
function RemitoForm({
  remitoEmpresa, setRemitoEmpresa, remitoObs, setRemitoObs,
  itemsCount, loading, onCancel, onGenerate,
}: {
  remitoEmpresa: "Aquiles" | "Conancap"
  setRemitoEmpresa: (e: "Aquiles" | "Conancap") => void
  remitoObs: string
  setRemitoObs: (v: string) => void
  itemsCount: number
  loading: boolean
  onCancel: () => void
  onGenerate: () => void
}) {
  const cai = useCaiCanEmit(remitoEmpresa)
  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label>Empresa emisora</Label>
        <Select value={remitoEmpresa} onValueChange={(v) => setRemitoEmpresa(v as "Aquiles" | "Conancap")}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Aquiles">Aquiles Equipamientos SRL</SelectItem>
            <SelectItem value="Conancap">Conancap SRL</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <CaiBanner empresa={remitoEmpresa} />

      <div className="space-y-2">
        <Label>Observaciones (opcional)</Label>
        <Textarea
          rows={2}
          value={remitoObs}
          onChange={(e) => setRemitoObs(e.target.value)}
          placeholder="Texto opcional al pie del remito..."
        />
      </div>

      <div className="text-xs text-muted-foreground bg-muted/40 border rounded p-2">
        <strong>Items:</strong> {itemsCount} (sin precios — el remito documenta entrega física)
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button
          className="bg-blue-600 hover:bg-blue-700"
          onClick={onGenerate}
          disabled={loading || !cai.canEmit}
          title={!cai.canEmit ? cai.reason : undefined}
        >
          {loading ? "Generando..." : "Generar Remito"}
        </Button>
      </div>
    </div>
  )
}
