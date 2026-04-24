"use client"

import React, { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { StatusTimeline } from "@/components/vendedor/status-timeline"
import { CountdownWidget } from "@/components/vendedor/countdown-widget"
import { fetchOrderById, fetchClientById, updateOrderStatus, addItemsToOrder, fetchProducts } from "@/lib/supabase/queries"
import { getStatusConfig, getNextStatuses } from "@/lib/status-config"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import type { Order, Client, OrderStatus, Product } from "@/lib/types"
import { normalizeSearch } from "@/lib/utils"
import { Checkbox } from "@/components/ui/checkbox"
import { ArrowLeft, Printer, MessageCircle, Phone, XCircle, FileText } from "lucide-react"
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
  const [facturaResult, setFacturaResult] = useState<{ numero: string; tipo: string; cae: string; total: number; razon_social: string; comprobante_nro: string } | null>(null)
  const [facturaDialogOpen, setFacturaDialogOpen] = useState(false)
  const [newStatus, setNewStatus] = useState<string>("")
  const [statusNote, setStatusNote] = useState("")
  const [cancelMotivo, setCancelMotivo] = useState("")
  const [updating, setUpdating] = useState(false)
  const [facturarOpen, setFacturarOpen] = useState(false)
  const [facturarItems, setFacturarItems] = useState<Record<string, boolean>>({})
  const [facturarOverrides, setFacturarOverrides] = useState<Record<string, { nombre: string; precio: number }>>({})
  const [facturando, setFacturando] = useState(false)

  // Agregar productos a pedido existente
  const [agregarOpen, setAgregarOpen] = useState(false)
  const [prodList, setProdList] = useState<Product[]>([])
  const [prodSearch, setProdSearch] = useState("")
  const [prodToAdd, setProdToAdd] = useState<{ product: Product; qty: number; price: number }[]>([])
  const [agregando, setAgregando] = useState(false)

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
          .select("sector, solicita, recibe, entrega_otra_sucursal, hoja_ruta_url, observaciones_entrega")
          .eq("id", id)
          .single()
        if (extraData) setOrderExtra(extraData)

        if (orderData.clientId) {
          const clientData = await fetchClientById(orderData.clientId)
          setClient(clientData)
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

      // Restore reserved stock
      for (const item of o.products) {
        if (item.productId) {
          const { data: product } = await supabase
            .from("products")
            .select("stock")
            .eq("id", item.productId)
            .single()
          if (product) {
            await supabase.from("products").update({ stock: product.stock + item.quantity }).eq("id", item.productId)
          }
        }
      }
      // Mark items as not reserved
      await supabase.from("order_items").update({ reservado: false }).eq("order_id", o.id)

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
      doc.text(`Dirección: ${client.address || "-"}`, margin, y); y += 6
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

  // Items available for invoicing (not yet fully invoiced)
  const itemsPendientesFactura = o.products.filter((p) => !p.facturado)

  function openFacturarDialog() {
    const initial: Record<string, boolean> = {}
    const overrides: Record<string, { nombre: string; precio: number }> = {}
    itemsPendientesFactura.forEach((p) => {
      initial[p.productId] = true
      overrides[p.productId] = { nombre: p.productName, precio: p.price }
    })
    setFacturarItems(initial)
    setFacturarOverrides(overrides)
    setFacturarOpen(true)
  }

  async function handleFacturar() {
    const selectedProducts = itemsPendientesFactura.filter((p) => facturarItems[p.productId])
    if (selectedProducts.length === 0) {
      alert("Seleccioná al menos un item para facturar")
      return
    }
    setFacturando(true)
    try {
      const res = await fetch("/api/facturacion/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: o.id,
          clientId: o.clientId,
          items: selectedProducts.map((p) => {
            const override = facturarOverrides[p.productId]
            return {
              productId: p.productId,
              producto_nombre: override?.nombre || p.productName,
              producto_codigo: p.productCode,
              cantidad: p.quantity,
              precioUnitario: override?.precio ?? p.price,
            }
          }),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setFacturaResult(data.factura)
        setFacturaDialogOpen(true)

        // Mark invoiced items in DB
        const supabase = createClient()
        for (const p of selectedProducts) {
          await supabase
            .from("order_items")
            .update({
              facturado: true,
              factura_id: data.factura.id,
              cantidad_facturada: p.quantity,
            })
            .eq("order_id", o.id)
            .eq("product_id", p.productId)
        }

        // Link factura to order so reparto picks it up
        await supabase
          .from("orders")
          .update({ factura_id: data.factura.id })
          .eq("id", o.id)

        // Update order status
        const allInvoiced = selectedProducts.length === itemsPendientesFactura.length
        const newOrderStatus = allInvoiced ? "FACTURADO" : "FACTURADO_PARCIAL"
        const uid = currentUser?.id || o.vendedorId
        const uname = currentUser?.name || "Admin"
        await updateOrderStatus(o.id, newOrderStatus as OrderStatus, uid, uname, `Factura generada: ${data.factura.comprobante_nro || data.factura.numero}`)

        setCurrentStatus(newOrderStatus as OrderStatus)
        setStatusHistory([
          ...statusHistory,
          {
            status: newOrderStatus as OrderStatus,
            timestamp: new Date(),
            userId: uid,
            userName: uname,
            notes: `Factura generada: ${data.factura.comprobante_nro || data.factura.numero}`,
          },
        ])
      } else {
        alert("Error generando factura: " + (data.error || "Error desconocido"))
      }
    } catch (err) {
      console.error("Error facturando:", err)
      alert("Error de conexión al generar factura")
    } finally {
      setFacturando(false)
      setFacturarOpen(false)
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
          <Button variant="outline">
            <Printer className="h-4 w-4 mr-2" />
            Imprimir Remito
          </Button>

          {/* Facturar button */}
          {itemsPendientesFactura.length > 0 && !isTerminal && (
            <Button variant="default" className="bg-purple-600 hover:bg-purple-700" onClick={openFacturarDialog}>
              <FileText className="h-4 w-4 mr-2" />
              Facturar
            </Button>
          )}

          {/* Agregar productos */}
          {["INGRESADO", "EN_PREPARACION", "BORRADOR"].includes(currentStatus) && (
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
              {o.products.map((product, index) => (
                <div key={index} className={`flex items-center justify-between py-3 border-b last:border-0 ${product.facturado ? "bg-green-50/50" : ""}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{product.productName}</p>
                      {product.facturado && (
                        <Badge variant="outline" className="text-xs bg-green-100 text-green-700 border-green-200">Facturado</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground font-mono">{product.productCode}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">Cant: {product.quantity}</span>
                    <span className="font-semibold">{formatCurrency(product.price * product.quantity)}</span>
                  </div>
                </div>
              ))}
            </div>
            <Separator className="my-4" />
            <div className="flex items-center justify-between">
              <span className="font-semibold text-lg">Total</span>
              <span className="font-bold text-2xl">{formatCurrency(o.total)}</span>
            </div>
          </Card>

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
                  <p className="text-sm text-muted-foreground mb-1">Dirección</p>
                  <p className="text-sm">{client.address}</p>
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
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Facturar Pedido {o.orderNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-muted-foreground">
              Seleccioná los items a facturar y editá nombre o precio si es necesario. El código no se puede modificar. Si no facturás todos, el pedido quedará en estado "Facturado Parcial".
            </p>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {itemsPendientesFactura.map((product) => {
                const override = facturarOverrides[product.productId] || { nombre: product.productName, precio: product.price }
                const subtotal = (Number(override.precio) || 0) * product.quantity
                const isChecked = facturarItems[product.productId] || false
                return (
                  <div key={product.productId} className={`p-3 border rounded-lg ${isChecked ? "bg-white" : "bg-muted/30 opacity-70"}`}>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) =>
                          setFacturarItems((prev) => ({ ...prev, [product.productId]: checked === true }))
                        }
                        className="mt-1"
                      />
                      <div className="flex-1 grid grid-cols-12 gap-2">
                        <div className="col-span-2 text-xs font-mono text-muted-foreground self-center">
                          {product.productCode}
                        </div>
                        <div className="col-span-6">
                          <label className="text-[10px] uppercase text-muted-foreground block">Nombre/descripción</label>
                          <input
                            type="text"
                            value={override.nombre}
                            onChange={(e) =>
                              setFacturarOverrides((prev) => ({
                                ...prev,
                                [product.productId]: { ...override, nombre: e.target.value },
                              }))
                            }
                            disabled={!isChecked}
                            className="w-full p-1 border rounded text-sm"
                          />
                        </div>
                        <div className="col-span-1 text-center self-end">
                          <span className="text-[10px] uppercase text-muted-foreground block">Cant.</span>
                          <span className="text-sm font-medium">{product.quantity}</span>
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] uppercase text-muted-foreground block">Precio</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={override.precio}
                            onChange={(e) =>
                              setFacturarOverrides((prev) => ({
                                ...prev,
                                [product.productId]: { ...override, precio: parseFloat(e.target.value) || 0 },
                              }))
                            }
                            disabled={!isChecked}
                            className="w-full p-1 border rounded text-sm text-right"
                          />
                        </div>
                        <div className="col-span-1 text-right self-end">
                          <span className="text-[10px] uppercase text-muted-foreground block">Subtotal</span>
                          <span className="text-sm font-semibold">{formatCurrency(subtotal)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="font-semibold">Total a facturar</span>
              <span className="text-lg font-bold">
                {formatCurrency(
                  itemsPendientesFactura
                    .filter((p) => facturarItems[p.productId])
                    .reduce((sum, p) => {
                      const ov = facturarOverrides[p.productId]
                      const precio = ov?.precio ?? p.price
                      return sum + precio * p.quantity
                    }, 0)
                )}
              </span>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setFacturarOpen(false)}>Cancelar</Button>
              <Button
                className="bg-purple-600 hover:bg-purple-700"
                onClick={handleFacturar}
                disabled={facturando || !Object.values(facturarItems).some(Boolean)}
              >
                {facturando ? "Generando factura..." : "Generar Factura"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Agregar productos Dialog */}
      <Dialog open={agregarOpen} onOpenChange={setAgregarOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Agregar productos al pedido</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Buscar producto..."
              value={prodSearch}
              onChange={(e) => setProdSearch(e.target.value)}
              className="w-full p-2 border rounded-md text-sm"
            />
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
                        if (prodToAdd.find((x) => x.product.id === p.id)) return
                        setProdToAdd([...prodToAdd, { product: p, qty: 1, price: p.price }])
                        setProdSearch("")
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 border-b"
                    >
                      <div className="flex justify-between">
                        <span>{p.name} <span className="text-xs text-gray-500">{p.code}</span></span>
                        <span className="font-medium">{formatCurrency(p.price)}</span>
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
                  <div key={it.product.id} className="grid grid-cols-[1fr,80px,120px,40px] gap-2 p-2 border-t items-center">
                    <span className="text-sm">{it.product.name}</span>
                    <input
                      type="number" min={1} value={it.qty}
                      onChange={(e) => {
                        const q = parseInt(e.target.value) || 1
                        setProdToAdd(prodToAdd.map((x, j) => j === i ? { ...x, qty: q } : x))
                      }}
                      className="p-1 border rounded text-sm w-16"
                    />
                    <input
                      type="number" step={0.01} value={it.price}
                      onChange={(e) => {
                        const pr = parseFloat(e.target.value) || 0
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
                    productId: x.product.id,
                    productCode: x.product.code || "",
                    productName: x.product.name,
                    quantity: x.qty,
                    price: x.price,
                  })))
                  alert("Productos agregados. TODO: notificar a Matías")
                  // TODO: notificación a Matías cuando se agrega productos a pedido existente
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
                <p className="font-bold text-green-800">Factura procesada correctamente</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tipo</span>
                  <span className="font-medium">{facturaResult.tipo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Numero</span>
                  <span className="font-medium">{facturaResult.comprobante_nro || facturaResult.numero}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">CAE</span>
                  <span className="font-mono font-medium text-green-700">{facturaResult.cae || "Testing"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cliente</span>
                  <span className="font-medium">{facturaResult.razon_social}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base">
                  <span className="font-bold">Total</span>
                  <span className="font-bold text-primary">{formatCurrency(facturaResult.total)}</span>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button asChild className="flex-1">
                  <Link href="/admin/facturacion">Ver Facturas</Link>
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => setFacturaDialogOpen(false)}>
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
