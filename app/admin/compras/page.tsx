"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import * as XLSX from "xlsx"
import { formatCurrencyExact, formatDate, normalizeSearch } from "@/lib/utils"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import {
  fetchCompras,
  fetchComprasCount,
  fetchOrdenesCompra,
  deleteCompra,
  updateCompra,
  updateOrdenCompra,
  fetchSolicitudesCompra,
  updateSolicitudCompra,
  deleteSolicitudCompra,
  createSolicitudCompra,
  createOrdenCompra,
  fetchProveedores,
  fetchProducts,
  fetchOrdenCompraItems,
  fetchPedidosVentaVinculadosAOC,
} from "@/lib/supabase/queries"
import { generateOrdenCompraPDF } from "@/lib/pdf/orden-compra-pdf"
import type { Product } from "@/lib/types"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Eye, Pencil, Trash2, Paperclip, FileText } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

// A.1: estados de la OC, automáticos y NO editables en el listado.
//   Pendiente (default al crear) → Facturado (al contabilizar la factura de
//   compra que levanta la OC) → Eliminado (soft-delete con el ícono).
const ESTADOS_OC = ["Pendiente", "Facturado", "Eliminado"]
// Estados del Seguimiento de Compras (recepción de mercadería). Se derivan de
// las tildes por ítem (todos tildados → Completo; alguno no → Incompleto).
const ESTADOS_SEGUIMIENTO = ["Pendiente", "Recibido Completo", "Recibido Incompleto"]

function estadoBadge(estado: string) {
  const lower = (estado || "").toLowerCase()
  if (lower.includes("pendiente"))
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200">{estado}</Badge>
  if (lower.includes("realizado") || lower.includes("proceso") || lower.includes("en curso"))
    return <Badge className="bg-blue-100 text-blue-800 border-blue-200">{estado}</Badge>
  if (lower.includes("recibido completo") || lower.includes("completad"))
    return <Badge className="bg-green-100 text-green-800 border-green-200">{estado}</Badge>
  if (lower.includes("recibido incompleto"))
    return <Badge className="bg-orange-100 text-orange-800 border-orange-200">{estado}</Badge>
  if (lower.includes("factura cargada"))
    return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">{estado}</Badge>
  if (lower.includes("cancelad"))
    return <Badge className="bg-red-100 text-red-800 border-red-200">{estado}</Badge>
  return <Badge variant="outline">{estado || "-"}</Badge>
}

export default function ComprasPage() {
  const [loading, setLoading] = useState(true)
  const [compras, setCompras] = useState<any[]>([])
  const [ordenes, setOrdenes] = useState<any[]>([])
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [totalComprasCount, setTotalComprasCount] = useState(0)
  const [solEstadoFilter, setSolEstadoFilter] = useState("")
  const [solBusqueda, setSolBusqueda] = useState("")
  const [proveedores, setProveedores] = useState<any[]>([])
  const [products, setProducts] = useState<Product[]>([])
  // Pestaña activa (controlada para poder saltar a "ordenes" tras convertir una solicitud)
  const [activeTab, setActiveTab] = useState("solicitudes")
  // Id de la solicitud que se está convirtiendo en OC (deshabilita el botón mientras tanto)
  const [convirtiendoOC, setConvirtiendoOC] = useState<string | null>(null)

  // Nueva solicitud manual
  const [nuevaSolDialog, setNuevaSolDialog] = useState(false)
  const [nuevaSolForm, setNuevaSolForm] = useState({ productSearch: "", product: null as Product | null, cantidad: 1, proveedor_sugerido: "", observaciones: "" })
  const [creandoSol, setCreandoSol] = useState(false)

  // Pagination
  const [comprasPage, setComprasPage] = useState(1)
  const [ordenesPage, setOrdenesPage] = useState(1)

  // Filters - Compras
  const [busquedaCompras, setBusquedaCompras] = useState("")
  const [estadoCompras, setEstadoCompras] = useState("")
  const [vendedorCompras, setVendedorCompras] = useState("")

  // Filters - Ordenes
  const [busquedaOrdenes, setBusquedaOrdenes] = useState("")
  const [razonSocialOrdenes, setRazonSocialOrdenes] = useState("")
  const [estadoOrdenes, setEstadoOrdenes] = useState("")

  // Action dialogs - Compras
  const [viewingCompra, setViewingCompra] = useState<any | null>(null)
  const [editingCompra, setEditingCompra] = useState<any | null>(null)
  const [editCompraForm, setEditCompraForm] = useState<any>({})
  const [deletingCompra, setDeletingCompra] = useState<any | null>(null)

  // Action dialogs - Ordenes
  const [viewingOrden, setViewingOrden] = useState<any | null>(null)
  const [viewingOrdenItems, setViewingOrdenItems] = useState<any[]>([])
  const [editingOrden, setEditingOrden] = useState<any | null>(null)
  const [editOrdenForm, setEditOrdenForm] = useState<any>({})
  // T.2: buscador de proveedor en el modal de edición de OC.
  const [editProvSearch, setEditProvSearch] = useState("")
  const [showEditProvDropdown, setShowEditProvDropdown] = useState(false)
  const [deletingOrden, setDeletingOrden] = useState<any | null>(null)
  // G2.3 (Sprint H) — dialog informativo cuando una OC pasa a "Recibido
  // Completo". Lista los pedidos venta vinculados para que el operador
  // sepa cuales tienen su mercaderia disponible. NO cambia estado de los
  // pedidos — sin ESPERANDO_MERCADERIA, no hay transicion automatica
  // que aplique.
  const [marcarIngresadoOC, setMarcarIngresadoOC] = useState<{
    ocId: string
    pendientes: { orderId: string; orderNumber: string | null; clientName: string | null; status: string | null }[]
  } | null>(null)

  async function loadData() {
    setLoading(true)
    try {
      const [c, o, count, sol, provs, prods] = await Promise.all([
        fetchCompras(),
        fetchOrdenesCompra(),
        fetchComprasCount(),
        fetchSolicitudesCompra(),
        fetchProveedores(),
        fetchProducts(),
      ])
      setCompras(c)
      setOrdenes(o)
      setTotalComprasCount(count)
      setSolicitudes(sol)
      setProveedores(provs)
      setProducts(prods)
    } catch (err) {
      console.error("Error cargando compras:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // --- Compras derived data ---
  const vendedoresUnicos = [...new Set(compras.map((c) => c.vendedor).filter(Boolean))]

  const comprasFiltradas = compras.filter((c) => {
    const matchBusqueda =
      !busquedaCompras ||
      normalizeSearch(c.proveedor_nombre || "").includes(normalizeSearch(busquedaCompras)) ||
      normalizeSearch(c.articulo || "").includes(normalizeSearch(busquedaCompras))
    const matchEstado = !estadoCompras || c.estado === estadoCompras
    const matchVendedor = !vendedorCompras || c.vendedor === vendedorCompras
    return matchBusqueda && matchEstado && matchVendedor
  })

  // Pagination - Compras
  const { totalPages: comprasTotalPages, totalItems: comprasTotalItems, pageSize: comprasPageSize, getPage: getComprasPage } = usePagination(comprasFiltradas, 50)
  const comprasCurrentPage = Math.min(comprasPage, comprasTotalPages)
  const paginatedCompras = getComprasPage(comprasCurrentPage)

  const pendientesCompras = compras.filter((c) =>
    (c.estado || "").toLowerCase().includes("pendiente")
  ).length
  const recibidasCompras = compras.filter((c) =>
    (c.estado || "").toLowerCase().includes("recibid")
  ).length
  const otrasCompras = totalComprasCount - pendientesCompras - recibidasCompras

  // --- Ordenes derived data ---
  const razonesSociales = [...new Set(ordenes.map((o) => o.razon_social).filter(Boolean))]

  const ordenesFiltradas = ordenes.filter((o) => {
    const matchBusqueda =
      !busquedaOrdenes ||
      normalizeSearch(o.proveedor_nombre || "").includes(normalizeSearch(busquedaOrdenes)) ||
      normalizeSearch(o.nro_oc || "").includes(normalizeSearch(busquedaOrdenes))
    const matchRazon = !razonSocialOrdenes || o.razon_social === razonSocialOrdenes
    // A.1: por defecto no se listan las OC eliminadas (soft-delete); aparecen
    // solo si se filtra explícitamente por "Eliminado".
    const matchEstado = estadoOrdenes ? o.estado === estadoOrdenes : o.estado !== "Eliminado"
    return matchBusqueda && matchRazon && matchEstado
  })

  const totalOC = ordenes.length
  const montoTotalOC = ordenes.reduce((sum, o) => sum + (Number(o.importe_total) || 0), 0)
  // Pagination - Ordenes
  const { totalPages: ordenesTotalPages, totalItems: ordenesTotalItems, pageSize: ordenesPageSize, getPage: getOrdenesPage } = usePagination(ordenesFiltradas, 50)
  const ordenesCurrentPage = Math.min(ordenesPage, ordenesTotalPages)
  const paginatedOrdenes = getOrdenesPage(ordenesCurrentPage)

  const montosPorRazon: Record<string, number> = {}
  ordenes.forEach((o) => {
    const key = o.razon_social || "Sin razon social"
    montosPorRazon[key] = (montosPorRazon[key] || 0) + (Number(o.importe_total) || 0)
  })

  // --- Actions ---
  async function handleDeleteCompra() {
    if (!deletingCompra) return
    try {
      await deleteCompra(deletingCompra.id)
      setDeletingCompra(null)
      await loadData()
    } catch (err) {
      console.error("Error eliminando compra:", err)
    }
  }

  async function handleEditCompra() {
    if (!editingCompra) return
    try {
      await updateCompra(editingCompra.id, editCompraForm)
      setEditingCompra(null)
      await loadData()
    } catch (err) {
      console.error("Error actualizando compra:", err)
    }
  }

  async function handleDeleteOrden() {
    if (!deletingOrden) return
    try {
      // A.1: soft-delete — la OC pasa a estado "Eliminado" (queda en la DB y
      // sale del listado activo), en vez de borrarse físicamente.
      await updateOrdenCompra(deletingOrden.id, { estado: "Eliminado" })
      setOrdenes((prev) => prev.map((x) => x.id === deletingOrden.id ? { ...x, estado: "Eliminado" } : x))
      setDeletingOrden(null)
    } catch (err) {
      console.error("Error eliminando orden:", err)
    }
  }

  // T.2: filtrar la base de proveedores (ya cargada en loadData) para el
  // autocomplete del modal de edición de OC.
  const filteredEditProveedores = useMemo(() => {
    if (!editProvSearch.trim()) return []
    const q = normalizeSearch(editProvSearch)
    return proveedores.filter((p) =>
      normalizeSearch(p.nombre || "").includes(q) ||
      normalizeSearch(p.razon_social || "").includes(q) ||
      normalizeSearch(p.cuit || "").includes(q) ||
      normalizeSearch(p.empresa || "").includes(q)
    ).slice(0, 15)
  }, [editProvSearch, proveedores])

  async function handleEditOrden() {
    if (!editingOrden) return
    try {
      await updateOrdenCompra(editingOrden.id, editOrdenForm)
      setEditingOrden(null)
      await loadData()
    } catch (err) {
      console.error("Error actualizando orden:", err)
    }
  }

  async function handleDeleteSolicitud(id: string) {
    if (!confirm("¿Eliminar esta solicitud de compra?")) return
    try {
      await deleteSolicitudCompra(id)
      await loadData()
    } catch (err) {
      console.error("Error eliminando solicitud:", err)
      const msg = err instanceof Error
        ? err.message
        : ((err as any)?.message || (err as any)?.details || "desconocido")
      alert("Error al eliminar la solicitud: " + msg)
    }
  }

  async function handleCrearSolicitudManual() {
    if (!nuevaSolForm.product) {
      alert("Seleccioná un producto")
      return
    }
    setCreandoSol(true)
    try {
      await createSolicitudCompra({
        product_id: nuevaSolForm.product.id,
        producto_nombre: nuevaSolForm.product.name,
        producto_codigo: nuevaSolForm.product.code || null,
        cantidad_solicitada: nuevaSolForm.cantidad,
        cantidad_stock: nuevaSolForm.product.stock ?? 0,
        cantidad_faltante: Math.max(0, nuevaSolForm.cantidad - (nuevaSolForm.product.stock ?? 0)),
        proveedor_sugerido: nuevaSolForm.proveedor_sugerido || null,
        observaciones: nuevaSolForm.observaciones || null,
      })
      setNuevaSolDialog(false)
      setNuevaSolForm({ productSearch: "", product: null, cantidad: 1, proveedor_sugerido: "", observaciones: "" })
      await loadData()
    } catch (err: any) {
      console.error("Error creando solicitud:", err)
      alert("Error al crear la solicitud: " + (err?.message || ""))
    } finally {
      setCreandoSol(false)
    }
  }

  // Q.2 — Convierte la solicitud directamente en una Orden de Compra (1 clic):
  // resuelve proveedor (historial → sugerido), precio (producto_proveedor →
  // costo del producto), crea la OC con su ítem, marca la solicitud como
  // convertido_oc y muestra la OC nueva (pestaña Órdenes).
  async function handleConvertirOC(solicitud: any) {
    if (convirtiendoOC) return

    // Resolver proveedor: habitual (ya se compró antes ese producto) o sugerido
    let proveedor =
      proveedores.find((p) =>
        compras.some((c) =>
          c.proveedor_id === p.id &&
          normalizeSearch(c.articulo || "").includes(normalizeSearch(solicitud.producto_nombre || "")),
        ),
      ) || null
    if (!proveedor && solicitud.proveedor_sugerido) {
      const q = normalizeSearch(solicitud.proveedor_sugerido)
      proveedor =
        proveedores.find((p) =>
          normalizeSearch(p.nombre || p.razon_social || "").includes(q),
        ) || null
    }

    const proveedorNombre =
      proveedor?.nombre || proveedor?.razon_social || solicitud.proveedor_sugerido || ""
    const cantidad = Number(solicitud.cantidad_faltante || solicitud.cantidad_solicitada || 1) || 1

    if (!confirm(
      `¿Convertir la solicitud de "${solicitud.producto_nombre || "este producto"}" en una Orden de Compra?` +
      (proveedorNombre ? `\nProveedor: ${proveedorNombre}` : "\nSin proveedor — podrás cargarlo en la OC."),
    )) return

    setConvirtiendoOC(solicitud.id)
    try {
      const supabase = createClient()

      // Precio: producto_proveedor (producto + proveedor) → costo del producto → 0
      let precioUnitario = 0
      let descuento = 0
      if (solicitud.product_id && proveedor?.id) {
        const { data } = await supabase
          .from("producto_proveedor")
          .select("*")
          .eq("product_id", solicitud.product_id)
          .eq("proveedor_id", proveedor.id)
          .maybeSingle()
        const row = data as Record<string, any> | null
        if (row?.precio_proveedor != null) precioUnitario = Number(row.precio_proveedor) || 0
        if (row?.descuento_porcentaje != null) descuento = Number(row.descuento_porcentaje) || 0
      }
      if (!precioUnitario && solicitud.product_id) {
        const prod = products.find((p) => String(p.id) === String(solicitud.product_id))
        precioUnitario = Number(prod?.costoNeto ?? prod?.price ?? 0) || 0
      }
      const subtotal = precioUnitario * cantidad * (1 - descuento / 100)

      const ocId = await createOrdenCompra({
        proveedor_nombre: proveedorNombre,
        proveedor_id: proveedor?.id || null,
        importe_total: subtotal,
        estado: "Pendiente",
        email_comercial: proveedor?.email_comercial || null,
        items: [{
          product_id: solicitud.product_id || null,
          producto_nombre: solicitud.producto_nombre || "Sin descripción",
          producto_codigo: solicitud.producto_codigo || null,
          cantidad,
          precio_unitario: precioUnitario,
          descuento_porcentaje: descuento,
          subtotal,
        }],
      })

      // A.3: el Seguimiento de Compras se crea automáticamente al convertir la
      // solicitud en OC (antes Q.2 no creaba fila de seguimiento → la OC no
      // aparecía en Seguimiento). Vinculado por orden_compra_id.
      const { data: ocRow } = await supabase.from("ordenes_compra").select("nro_oc").eq("id", ocId).single()
      await supabase.from("compras").insert({
        fecha: new Date().toISOString().slice(0, 10),
        proveedor_id: proveedor?.id || null,
        proveedor_nombre: proveedorNombre,
        articulo: solicitud.producto_nombre || "Sin descripción",
        estado: "Pendiente",
        nro_oc: ocRow?.nro_oc || null,
        orden_compra_id: ocId,
      })

      await updateSolicitudCompra(solicitud.id, { estado: "convertido_oc", orden_compra_id: ocId })
      await loadData()
      setActiveTab("ordenes")
      alert("Solicitud convertida en Orden de Compra correctamente.")
    } catch (err) {
      console.error("Error convirtiendo a OC:", err)
      const msg = err instanceof Error
        ? err.message
        : ((err as any)?.message || (err as any)?.details || "desconocido")
      alert("Error al convertir en OC: " + msg)
    } finally {
      setConvirtiendoOC(null)
    }
  }

  async function handleDownloadAdjunto(path: string) {
    const supabase = createClient()
    const { data } = await supabase.storage.from("comprobantes").createSignedUrl(path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, "_blank")
  }

  // Genera el PDF de OC al vuelo y lo abre en nueva pestaña (item Excel #58).
  // No persiste el blob — si se necesita guardar en Storage, lo agregamos en
  // un sprint posterior. Hoy: el operador lo abre, lo descarga o lo imprime.
  async function handleViewOrdenPDF(orden: any) {
    try {
      const supabase = createClient()
      const items = await fetchOrdenCompraItems(orden.id)
      // Buscar proveedor para enriquecer datos del PDF (CUIT/domicilio/email).
      let proveedorData: any = null
      if (orden.proveedor_id) {
        const { data } = await supabase
          .from("proveedores")
          .select("razon_social, nombre, cuit, domicilio, email_comercial")
          .eq("id", orden.proveedor_id)
          .maybeSingle()
        proveedorData = data
      }
      const blob = generateOrdenCompraPDF({
        nro_oc: orden.nro_oc || `OC-${String(orden.id).slice(0, 8)}`,
        fecha: orden.fecha || null,
        empresa: orden.empresa || null,
        razon_social_emisor: orden.razon_social || null,
        proveedor: {
          nombre: proveedorData?.razon_social || proveedorData?.nombre || orden.proveedor_nombre || "-",
          cuit: proveedorData?.cuit || null,
          domicilio: proveedorData?.domicilio || null,
          email: proveedorData?.email_comercial || orden.email_comercial || null,
        },
        items: items.map((it: any) => ({
          codigo: it.producto_codigo || null,
          descripcion: it.producto_nombre || "Sin descripción",
          cantidad: Number(it.cantidad) || 0,
          precio_unitario: Number(it.precio_unitario) || 0,
          descuento_porcentaje: it.descuento_porcentaje ? Number(it.descuento_porcentaje) : null,
          subtotal: Number(it.subtotal) || 0,
        })),
        total: Number(orden.importe_total) || 0,
        observaciones: orden.observaciones || null,
        condicion_pago: orden.condicion_pago || null,
        estado: orden.estado || null,
      })
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank")
      // Liberar el objectURL despues de un rato (no inmediato porque rompe el tab nuevo).
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      console.error("Error generando PDF de OC:", e)
      alert("Error generando el PDF de la orden de compra.")
    }
  }

  // --- Export ---
  function exportComprasXLSX() {
    const rows = comprasFiltradas.map((c) => ({
      Fecha: c.fecha ? formatDate(new Date(c.fecha)) : "-",
      Proveedor: c.proveedor_nombre || "-",
      Articulo: c.articulo || "-",
      Vendedor: c.vendedor || "-",
      Estado: c.estado || "-",
      "Nro Cotizacion": c.nro_cotizacion || "-",
      "Nro Nota Pedido": c.nro_nota_pedido || "-",
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Compras")
    XLSX.writeFile(wb, "compras.xlsx")
  }

  function exportOrdenesXLSX() {
    const rows = ordenesFiltradas.map((o) => ({
      Fecha: o.fecha ? formatDate(new Date(o.fecha)) : "-",
      Proveedor: o.proveedor_nombre || "-",
      "Importe Total": Number(o.importe_total) || 0,
      Estado: o.estado || "-",
      "Nro OC": o.nro_oc || "-",
      "Razon Social": o.razon_social || "-",
      Ubicacion: o.ubicacion_oc || "-",
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Ordenes de Compra")
    XLSX.writeFile(wb, "ordenes_compra.xlsx")
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2 text-gray-600">Cargando compras...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Compras</h2>
          <p className="text-gray-500">Seguimiento de compras y ordenes de compra</p>
        </div>
        <Link
          href="/admin/compras/nueva"
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
        >
          + Nueva Compra
        </Link>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="solicitudes">Solicitudes de Compra ({solicitudes.length})</TabsTrigger>
          <TabsTrigger value="ordenes">Ordenes de Compra</TabsTrigger>
          <TabsTrigger value="compras">Seguimiento de Compras</TabsTrigger>
        </TabsList>

        {/* ===================== TAB: SOLICITUDES ===================== */}
        <TabsContent value="solicitudes">
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Buscar por producto..."
                value={solBusqueda}
                onChange={(e) => setSolBusqueda(e.target.value)}
                className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm flex-1 min-w-[200px]"
              />
              <select
                value={solEstadoFilter}
                onChange={(e) => setSolEstadoFilter(e.target.value)}
                className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              >
                <option value="">Todos los estados</option>
                <option value="borrador">Borrador</option>
                <option value="aceptado">Aceptado</option>
                <option value="rechazado">Rechazado</option>
                <option value="convertido_oc">Convertido a OC</option>
              </select>
              <button
                onClick={() => setNuevaSolDialog(true)}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm flex items-center gap-1"
              >
                + Nueva Solicitud Manual
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Muestra solicitudes manuales y aquellas provenientes de pedidos en estado INGRESADO.
            </p>
          </div>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {(() => {
              const filtered = solicitudes.filter((s) => {
                const matchEstado = !solEstadoFilter || s.estado === solEstadoFilter
                const matchBusqueda = !solBusqueda || normalizeSearch(s.producto_nombre || "").includes(normalizeSearch(solBusqueda)) || normalizeSearch(s.producto_codigo || "").includes(normalizeSearch(solBusqueda))
                // Solo solicitudes manuales (sin pedido asociado) o de pedidos en estado INGRESADO
                const matchOrigen = !s.order_id || s.pedido_status === "INGRESADO"
                return matchEstado && matchBusqueda && matchOrigen
              })
              if (filtered.length === 0) {
                return (
                  <div className="text-center py-12 text-gray-500">
                    No hay solicitudes de compra
                  </div>
                )
              }
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-3 py-3 text-left font-semibold text-gray-700">Fecha</th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-700">Producto</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">Cant. Pedida</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">Stock Actual</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-700">Faltante</th>
                        <th className="px-3 py-3 text-left font-semibold text-gray-700">Pedido Origen</th>
                        <th className="px-3 py-3 text-center font-semibold text-gray-700">Estado</th>
                        <th className="px-3 py-3 text-center font-semibold text-gray-700">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((s: any, idx: number) => (
                        <tr key={s.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                          <td className="px-3 py-3 text-gray-600 whitespace-nowrap text-xs">
                            {s.created_at ? new Date(s.created_at).toLocaleDateString("es-AR") : "-"}
                          </td>
                          <td className="px-3 py-3">
                            {s.producto_codigo && (
                              <span className="text-xs text-gray-500 font-mono mr-1">{s.producto_codigo}</span>
                            )}
                            <span className="font-medium text-gray-900">{s.producto_nombre || "-"}</span>
                          </td>
                          <td className="px-3 py-3 text-right font-medium text-gray-900">
                            {s.cantidad_solicitada || 0}
                          </td>
                          <td className="px-3 py-3 text-right text-gray-600">
                            {s.cantidad_stock ?? 0}
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-red-600">
                            {s.cantidad_faltante || 0}
                          </td>
                          <td className="px-3 py-3">
                            {s.order_id ? (
                              <Link href={`/admin/pedidos/${s.order_id}`} className="text-blue-600 hover:underline text-xs font-mono font-medium">
                                {s.pedido_serial || s.order_id.slice(0, 8)}
                              </Link>
                            ) : "-"}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {s.estado === "borrador" && <Badge className="bg-gray-100 text-gray-700 border-gray-200">Borrador</Badge>}
                            {s.estado === "aceptado" && <Badge className="bg-green-100 text-green-700 border-green-200">Aceptado</Badge>}
                            {s.estado === "rechazado" && <Badge className="bg-red-100 text-red-700 border-red-200">Rechazado</Badge>}
                            {s.estado === "convertido_oc" && <Badge className="bg-blue-100 text-blue-700 border-blue-200">Convertido a OC</Badge>}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {s.estado === "borrador" && (
                                <>
                                  <button
                                    onClick={async () => {
                                      await updateSolicitudCompra(s.id, { estado: "aceptado" })
                                      await loadData()
                                    }}
                                    className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                                  >
                                    Aprobar
                                  </button>
                                  <button
                                    onClick={async () => {
                                      await updateSolicitudCompra(s.id, { estado: "rechazado" })
                                      await loadData()
                                    }}
                                    className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                                  >
                                    Rechazar
                                  </button>
                                </>
                              )}
                              {(s.estado === "borrador" || s.estado === "aceptado") && (
                                <button
                                  onClick={() => handleConvertirOC(s)}
                                  disabled={convirtiendoOC === s.id}
                                  className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                                >
                                  {convirtiendoOC === s.id ? "Convirtiendo..." : "Convertir en OC"}
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteSolicitud(s.id)}
                                className="p-1 text-red-600 hover:bg-red-100 rounded"
                                title="Eliminar solicitud"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </div>
        </TabsContent>

        {/* ===================== TAB: COMPRAS ===================== */}
        <TabsContent value="compras">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 border shadow-sm">
              <p className="text-sm text-gray-500">Total Compras</p>
              <p className="text-2xl font-bold text-gray-900">{totalComprasCount}</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 shadow-sm">
              <p className="text-sm text-amber-600">Pendientes</p>
              <p className="text-2xl font-bold text-amber-700">{pendientesCompras}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4 border border-green-200 shadow-sm">
              <p className="text-sm text-green-600">Recibidas</p>
              <p className="text-2xl font-bold text-green-700">{recibidasCompras}</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 shadow-sm">
              <p className="text-sm text-blue-600">Otros estados</p>
              <p className="text-2xl font-bold text-blue-700">{otrasCompras}</p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Buscar proveedor o articulo..."
              value={busquedaCompras}
              onChange={(e) => { setBusquedaCompras(e.target.value); setComprasPage(1) }}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm flex-1 min-w-[200px]"
            />
            <select
              value={estadoCompras}
              onChange={(e) => { setEstadoCompras(e.target.value); setComprasPage(1) }}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="">Todos los estados</option>
              {ESTADOS_SEGUIMIENTO.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            <button
              onClick={exportComprasXLSX}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-1"
            >
              Exportar XLSX
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {comprasFiltradas.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No se encontraron compras</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 75 }}>Fecha</th>
                      <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 120 }}>Proveedor</th>
                      <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 160 }}>Articulo</th>
                      <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 120 }}>Estado</th>
                      <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 90 }}>Nro Orden de Compra</th>
                      <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 80 }}>F. Recepción</th>
                      <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 60 }}>Nro NP</th>
                      <th className="px-2 py-3 text-center font-semibold text-gray-700" style={{ width: 70 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedCompras.map((c, idx) => (
                      <tr key={c.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-2 py-2 text-gray-600 text-xs">
                          {c.fecha ? formatDate(new Date(c.fecha)) : "-"}
                        </td>
                        <td className="px-2 py-2 font-medium text-gray-900 truncate" title={c.proveedor_nombre || ""}>
                          {c.proveedor_nombre || "-"}
                        </td>
                        <td className="px-2 py-2 text-gray-600 truncate" title={c.articulo || ""}>
                          {c.articulo || "-"}
                        </td>
                        <td className="px-2 py-1">
                          <select
                            value={c.estado || ""}
                            onChange={async (e) => {
                              const nuevoEstado = e.target.value
                              try {
                                await updateCompra(c.id, { estado: nuevoEstado })
                                setCompras((prev) => prev.map((x) => x.id === c.id ? { ...x, estado: nuevoEstado } : x))
                              } catch (err) {
                                console.error("Error actualizando estado:", err)
                              }
                            }}
                            className="p-1 border rounded text-xs w-full bg-white focus:ring-2 focus:ring-primary"
                          >
                            {ESTADOS_SEGUIMIENTO.map((e) => (
                              <option key={e} value={e}>{e}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="text"
                            value={c.nro_oc || ""}
                            placeholder="OC-XXXX"
                            onChange={(e) => {
                              const val = e.target.value
                              setCompras((prev) => prev.map((x) => x.id === c.id ? { ...x, nro_oc: val } : x))
                            }}
                            onBlur={async (e) => {
                              try {
                                await updateCompra(c.id, { nro_oc: e.target.value || null })
                              } catch (err) {
                                console.error("Error guardando nro OC:", err)
                              }
                            }}
                            className="p-1 border rounded text-xs w-full bg-white focus:ring-2 focus:ring-primary"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="date"
                            value={c.fecha_recepcion || ""}
                            onChange={async (e) => {
                              const val = e.target.value
                              setCompras((prev) => prev.map((x) => x.id === c.id ? { ...x, fecha_recepcion: val } : x))
                              try {
                                await updateCompra(c.id, { fecha_recepcion: val || null })
                              } catch (err) {
                                console.error("Error guardando fecha recepción:", err)
                              }
                            }}
                            className="p-1 border rounded text-xs w-full bg-white focus:ring-2 focus:ring-primary"
                          />
                        </td>
                        <td className="px-2 py-2 text-gray-600 truncate text-xs">{c.nro_nota_pedido || "-"}</td>
                        <td className="px-1 py-2 text-center">
                          <div className="flex items-center justify-center gap-0.5">
                            {c.cotizacion_ref && (
                              <button onClick={() => handleDownloadAdjunto(c.cotizacion_ref)} className="p-1 hover:bg-blue-100 rounded" title="Ver presupuesto adjunto">
                                <Paperclip className="h-3.5 w-3.5 text-blue-600" />
                              </button>
                            )}
                            <button onClick={() => setViewingCompra(c)} className="p-1 hover:bg-gray-200 rounded" title="Ver detalle">
                              <Eye className="h-3.5 w-3.5 text-gray-600" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingCompra(c)
                                setEditCompraForm({
                                  proveedor_nombre: c.proveedor_nombre || "",
                                  articulo: c.articulo || "",
                                  vendedor: c.vendedor || "",
                                  estado: c.estado || "",
                                  nro_cotizacion: c.nro_cotizacion || "",
                                  nro_nota_pedido: c.nro_nota_pedido || "",
                                })
                              }}
                              className="p-1 hover:bg-gray-200 rounded" title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5 text-blue-600" />
                            </button>
                            <button onClick={() => setDeletingCompra(c)} className="p-1 hover:bg-gray-200 rounded" title="Eliminar">
                              <Trash2 className="h-3.5 w-3.5 text-red-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <TablePagination currentPage={comprasCurrentPage} totalPages={comprasTotalPages} totalItems={comprasTotalItems} pageSize={comprasPageSize} onPageChange={setComprasPage} />
          </div>
        </TabsContent>

        {/* ===================== TAB: ORDENES DE COMPRA ===================== */}
        <TabsContent value="ordenes">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 border shadow-sm">
              <p className="text-sm text-gray-500">Total OC</p>
              <p className="text-2xl font-bold text-gray-900">{totalOC}</p>
            </div>
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-4 border border-indigo-200 shadow-sm">
              <p className="text-sm text-indigo-600 font-semibold">Monto Total</p>
              <p className="text-2xl font-bold text-indigo-700">{formatCurrencyExact(montoTotalOC)}</p>
            </div>
            {Object.entries(montosPorRazon)
              .slice(0, 2)
              .map(([razon, monto]) => (
                <div key={razon} className="bg-white rounded-xl p-4 border shadow-sm">
                  <p className="text-sm text-gray-500 truncate" title={razon}>{razon}</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrencyExact(monto)}</p>
                </div>
              ))}
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="Buscar proveedor o nro OC..."
              value={busquedaOrdenes}
              onChange={(e) => { setBusquedaOrdenes(e.target.value); setOrdenesPage(1) }}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm flex-1 min-w-[200px]"
            />
            <select
              value={razonSocialOrdenes}
              onChange={(e) => { setRazonSocialOrdenes(e.target.value); setOrdenesPage(1) }}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="">Todas las razones sociales</option>
              {razonesSociales.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select
              value={estadoOrdenes}
              onChange={(e) => { setEstadoOrdenes(e.target.value); setOrdenesPage(1) }}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="">Todos los estados</option>
              {ESTADOS_OC.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            <button
              onClick={exportOrdenesXLSX}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-1"
            >
              Exportar XLSX
            </button>
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {ordenesFiltradas.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No se encontraron ordenes de compra</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 75 }}>Fecha</th>
                      <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 120 }}>Proveedor</th>
                      <th className="px-2 py-3 text-right font-semibold text-gray-700" style={{ width: 85 }}>Importe</th>
                      <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 120 }}>Estado</th>
                      <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 90 }}>Empresa</th>
                      <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 70 }}>N° OC</th>
                      <th className="px-2 py-3 text-center font-semibold text-gray-700" style={{ width: 75 }}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedOrdenes.map((o, idx) => (
                      <tr key={o.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-2 py-2 text-gray-600 text-xs">
                          {o.fecha ? formatDate(new Date(o.fecha)) : "-"}
                        </td>
                        <td className="px-2 py-2 font-medium text-gray-900 truncate" title={o.proveedor_nombre || ""}>
                          {o.proveedor_nombre || "-"}
                        </td>
                        <td className="px-2 py-2 text-right font-bold text-gray-900">
                          {formatCurrencyExact(Number(o.importe_total) || 0)}
                        </td>
                        {/* A.1: Estado automático, NO editable (badge) */}
                        <td className="px-2 py-2">
                          {(() => {
                            const est = o.estado || "Pendiente"
                            const cls = est === "Facturado" ? "bg-green-100 text-green-700"
                              : est === "Eliminado" ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                            return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{est}</span>
                          })()}
                        </td>
                        {/* A.1: Empresa automática (se levanta al crear la OC), NO editable */}
                        <td className="px-2 py-2 text-gray-600 text-xs">{o.empresa || "-"}</td>
                        <td className="px-2 py-2 text-gray-600 truncate text-xs">{o.nro_oc || "-"}</td>
                        <td className="px-1 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={async () => {
                                setViewingOrden(o)
                                try {
                                  setViewingOrdenItems(await fetchOrdenCompraItems(o.id))
                                } catch {
                                  setViewingOrdenItems([])
                                }
                              }}
                              className="p-1 hover:bg-gray-200 rounded"
                              title="Ver detalle"
                            >
                              <Eye className="h-4 w-4 text-gray-600" />
                            </button>
                            <button
                              onClick={() => handleViewOrdenPDF(o)}
                              className="p-1 hover:bg-gray-200 rounded"
                              title="Ver PDF"
                            >
                              <FileText className="h-4 w-4 text-blue-600" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingOrden(o)
                                setEditProvSearch(o.proveedor_nombre || "")
                                setShowEditProvDropdown(false)
                                setEditOrdenForm({
                                  proveedor_id: o.proveedor_id || "",
                                  proveedor_nombre: o.proveedor_nombre || "",
                                  estado: o.estado || "",
                                  nro_oc: o.nro_oc || "",
                                  razon_social: o.razon_social || "",
                                  importe_total: o.importe_total || 0,
                                  ubicacion_oc: o.ubicacion_oc || "",
                                  email_comercial: o.email_comercial || "",
                                })
                              }}
                              className="p-1 hover:bg-gray-200 rounded"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4 text-blue-600" />
                            </button>
                            <button
                              onClick={() => setDeletingOrden(o)}
                              className="p-1 hover:bg-gray-200 rounded"
                              title="Eliminar"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <TablePagination currentPage={ordenesCurrentPage} totalPages={ordenesTotalPages} totalItems={ordenesTotalItems} pageSize={ordenesPageSize} onPageChange={setOrdenesPage} />
          </div>
        </TabsContent>
      </Tabs>

      {/* ========== DIALOGS - COMPRAS ========== */}

      {/* View Compra */}
      <Dialog open={!!viewingCompra} onOpenChange={(open) => !open && setViewingCompra(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle de Compra</DialogTitle>
          </DialogHeader>
          {viewingCompra && (
            <div className="space-y-2 text-sm">
              <div><strong>Fecha:</strong> {viewingCompra.fecha ? formatDate(new Date(viewingCompra.fecha)) : "-"}</div>
              <div><strong>Proveedor:</strong> {viewingCompra.proveedor_nombre || "-"}</div>
              <div><strong>Articulo:</strong> {viewingCompra.articulo || "-"}</div>
              <div><strong>Estado:</strong> {viewingCompra.estado || "-"}</div>
              <div><strong>Nro Cotizacion:</strong> {viewingCompra.nro_cotizacion || "-"}</div>
              <div><strong>Nro Nota Pedido:</strong> {viewingCompra.nro_nota_pedido || "-"}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Compra */}
      <Dialog open={!!editingCompra} onOpenChange={(open) => !open && setEditingCompra(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600 block mb-1">Proveedor</label>
              <input type="text" value={editCompraForm.proveedor_nombre || ""} onChange={(e) => setEditCompraForm((f: any) => ({ ...f, proveedor_nombre: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Articulo</label>
              <input type="text" value={editCompraForm.articulo || ""} onChange={(e) => setEditCompraForm((f: any) => ({ ...f, articulo: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Estado</label>
              <select value={editCompraForm.estado || ""} onChange={(e) => setEditCompraForm((f: any) => ({ ...f, estado: e.target.value }))} className="w-full p-2 border rounded-lg text-sm">
                {ESTADOS_SEGUIMIENTO.map((e) => (<option key={e} value={e}>{e}</option>))}
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Nro Cotizacion</label>
              <input type="text" value={editCompraForm.nro_cotizacion || ""} onChange={(e) => setEditCompraForm((f: any) => ({ ...f, nro_cotizacion: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Nro Nota Pedido</label>
              <input type="text" value={editCompraForm.nro_nota_pedido || ""} onChange={(e) => setEditCompraForm((f: any) => ({ ...f, nro_nota_pedido: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setEditingCompra(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancelar</button>
            <button onClick={handleEditCompra} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm">Guardar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Compra */}
      <Dialog open={!!deletingCompra} onOpenChange={(open) => !open && setDeletingCompra(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar eliminacion</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Esta seguro que desea eliminar la compra de <strong>{deletingCompra?.proveedor_nombre}</strong> - {deletingCompra?.articulo}?
          </p>
          <DialogFooter>
            <button onClick={() => setDeletingCompra(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancelar</button>
            <button onClick={handleDeleteCompra} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">Eliminar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== DIALOGS - ORDENES ========== */}

      {/* View Orden */}
      <Dialog open={!!viewingOrden} onOpenChange={(open) => !open && setViewingOrden(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Orden de Compra</DialogTitle>
          </DialogHeader>
          {viewingOrden && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                <div><strong>Fecha:</strong> {viewingOrden.fecha ? formatDate(new Date(viewingOrden.fecha)) : "-"}</div>
                <div><strong>Nro OC:</strong> {viewingOrden.nro_oc || "-"}</div>
                <div><strong>Proveedor:</strong> {viewingOrden.proveedor_nombre || "-"}</div>
                <div><strong>Estado:</strong> {viewingOrden.estado || "-"}</div>
                <div><strong>Razon Social:</strong> {viewingOrden.razon_social || "-"}</div>
                <div><strong>Ubicacion:</strong> {viewingOrden.ubicacion_oc || "-"}</div>
              </div>

              {(() => {
                let sumSub = 0
                let sumIva = 0
                const rows = viewingOrdenItems.map((it) => {
                  const sub = Number(it.subtotal) || 0
                  const iva = Math.round(sub * 0.21 * 100) / 100
                  sumSub += sub
                  sumIva += iva
                  return { it, sub, iva, total: Math.round((sub + iva) * 100) / 100 }
                })
                sumSub = Math.round(sumSub * 100) / 100
                sumIva = Math.round(sumIva * 100) / 100
                return (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-muted text-xs">
                        <tr>
                          <th className="text-center p-2">Cantidad</th>
                          <th className="text-left p-2">Código</th>
                          <th className="text-left p-2">Producto</th>
                          <th className="text-right p-2">Costo</th>
                          <th className="text-right p-2">Desc.%</th>
                          <th className="text-right p-2">Subtotal</th>
                          <th className="text-right p-2">IVA</th>
                          <th className="text-right p-2">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 ? (
                          <tr><td colSpan={8} className="p-3 text-center text-muted-foreground">Sin ítems cargados.</td></tr>
                        ) : rows.map(({ it, sub, iva, total }) => (
                          <tr key={it.id} className="border-t">
                            <td className="text-center p-2">{it.cantidad}</td>
                            <td className="p-2 font-mono text-xs">{it.producto_codigo || "-"}</td>
                            <td className="p-2">{it.producto_nombre || "-"}</td>
                            <td className="text-right p-2">{formatCurrencyExact(Number(it.precio_unitario) || 0)}</td>
                            <td className="text-right p-2">{it.descuento_porcentaje ? `${it.descuento_porcentaje}%` : "-"}</td>
                            <td className="text-right p-2">{formatCurrencyExact(sub)}</td>
                            <td className="text-right p-2">{formatCurrencyExact(iva)}</td>
                            <td className="text-right p-2 font-medium">{formatCurrencyExact(total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      {rows.length > 0 && (
                        <tfoot>
                          <tr className="border-t font-medium bg-muted/40">
                            <td colSpan={5} className="text-right p-2">Subtotal (neto) / IVA / Total</td>
                            <td className="text-right p-2">{formatCurrencyExact(sumSub)}</td>
                            <td className="text-right p-2">{formatCurrencyExact(sumIva)}</td>
                            <td className="text-right p-2">{formatCurrencyExact(Math.round((sumSub + sumIva) * 100) / 100)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )
              })()}

              <div className="flex justify-end">
                <Link
                  href={`/admin/compras/${viewingOrden.id}/editar`}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm"
                >
                  Editar ítems
                </Link>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Orden */}
      <Dialog open={!!editingOrden} onOpenChange={(open) => !open && setEditingOrden(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Orden de Compra</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <label className="text-sm text-gray-600 block mb-1">Proveedor</label>
              <input
                type="text"
                placeholder="Buscar proveedor por nombre, CUIT o empresa..."
                value={editProvSearch}
                onChange={(e) => {
                  setEditProvSearch(e.target.value)
                  setShowEditProvDropdown(true)
                  // Mantener el nombre escrito libre por si no selecciona de la lista.
                  setEditOrdenForm((f: any) => ({ ...f, proveedor_nombre: e.target.value, proveedor_id: "" }))
                }}
                onFocus={() => editProvSearch.trim() && setShowEditProvDropdown(true)}
                autoComplete="off"
                className="w-full p-2 border rounded-lg text-sm"
              />
              {showEditProvDropdown && filteredEditProveedores.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto mt-1">
                  {filteredEditProveedores.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm border-b last:border-b-0"
                      onClick={() => {
                        const nombre = p.nombre || p.razon_social || ""
                        setEditOrdenForm((f: any) => ({
                          ...f,
                          proveedor_id: p.id || "",
                          proveedor_nombre: nombre,
                          razon_social: p.razon_social || f.razon_social,
                          email_comercial: p.email_comercial || f.email_comercial,
                        }))
                        setEditProvSearch(nombre)
                        setShowEditProvDropdown(false)
                      }}
                    >
                      <span className="font-medium">{p.nombre || p.razon_social}</span>
                      {p.cuit && <span className="text-gray-500 ml-2">CUIT: {p.cuit}</span>}
                      {p.empresa && <span className="text-gray-400 ml-2">({p.empresa})</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Importe Total</label>
              <input type="number" value={editOrdenForm.importe_total || 0} onChange={(e) => setEditOrdenForm((f: any) => ({ ...f, importe_total: Number(e.target.value) }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            {/* A.1: el Estado de la OC es automático (Pendiente/Facturado/Eliminado),
                no se edita a mano. */}
            <div>
              <label className="text-sm text-gray-600 block mb-1">Nro OC</label>
              <input type="text" value={editOrdenForm.nro_oc || ""} onChange={(e) => setEditOrdenForm((f: any) => ({ ...f, nro_oc: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Razon Social</label>
              <input type="text" value={editOrdenForm.razon_social || ""} onChange={(e) => setEditOrdenForm((f: any) => ({ ...f, razon_social: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Ubicacion</label>
              <input type="text" value={editOrdenForm.ubicacion_oc || ""} onChange={(e) => setEditOrdenForm((f: any) => ({ ...f, ubicacion_oc: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Email Comercial (para enviar OC)</label>
              <input type="email" value={editOrdenForm.email_comercial || ""} onChange={(e) => setEditOrdenForm((f: any) => ({ ...f, email_comercial: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" placeholder="comercial@proveedor.com" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setEditingOrden(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancelar</button>
            <button onClick={handleEditOrden} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm">Guardar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Orden */}
      <Dialog open={!!deletingOrden} onOpenChange={(open) => !open && setDeletingOrden(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar eliminacion</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Esta seguro que desea eliminar la orden de compra <strong>{deletingOrden?.nro_oc}</strong> de {deletingOrden?.proveedor_nombre}?
          </p>
          <DialogFooter>
            <button onClick={() => setDeletingOrden(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancelar</button>
            <button onClick={handleDeleteOrden} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">Eliminar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* G2.3 (Sprint H) — Aviso informativo: pedidos venta con mercaderia disponible */}
      <Dialog open={!!marcarIngresadoOC} onOpenChange={(open) => !open && setMarcarIngresadoOC(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mercadería recibida</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700">
            La OC se marcó como <strong>Recibido Completo</strong>. Los siguientes pedidos venta
            vinculados ya tienen la mercadería disponible y pueden facturarse:
          </p>
          <div className="mt-3 space-y-1 border rounded-lg p-3 bg-green-50 text-sm">
            {marcarIngresadoOC?.pendientes.map((p) => (
              <Link
                key={p.orderId}
                href={`/admin/pedidos/${p.orderId}`}
                className="flex justify-between items-center hover:bg-green-100 rounded px-1 py-0.5"
                onClick={() => setMarcarIngresadoOC(null)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono">{p.orderNumber || p.orderId.slice(0, 8)}</span>
                  <span className="text-gray-700 truncate">{p.clientName || "—"}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {p.status && <span className="text-[10px] text-gray-500">{p.status}</span>}
                  <span className="text-blue-600 text-xs">Abrir →</span>
                </div>
              </Link>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Click en cada pedido para abrirlo y facturarlo si corresponde. Esta acción no modifica
            el estado de los pedidos — solo te muestra cuáles esperaban esta mercadería.
          </p>
          <DialogFooter>
            <button
              onClick={() => setMarcarIngresadoOC(null)}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm"
            >
              Cerrar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nueva Solicitud Manual */}
      <Dialog open={nuevaSolDialog} onOpenChange={(open) => !open && setNuevaSolDialog(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Solicitud Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <label className="text-sm text-gray-600 block mb-1">Producto *</label>
              <input
                type="text"
                value={nuevaSolForm.product ? `${nuevaSolForm.product.code || ""} ${nuevaSolForm.product.name}`.trim() : nuevaSolForm.productSearch}
                onChange={(e) => setNuevaSolForm((f) => ({ ...f, productSearch: e.target.value, product: null }))}
                placeholder="Buscar por código o nombre..."
                className="w-full p-2 border rounded-lg text-sm"
              />
              {nuevaSolForm.productSearch && !nuevaSolForm.product && (
                <div className="absolute z-50 top-full left-0 right-0 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto mt-1">
                  {products
                    .filter((p) =>
                      normalizeSearch(p.name || "").includes(normalizeSearch(nuevaSolForm.productSearch)) ||
                      normalizeSearch(p.code || "").includes(normalizeSearch(nuevaSolForm.productSearch))
                    )
                    .slice(0, 15)
                    .map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm border-b last:border-b-0"
                        onClick={() => setNuevaSolForm((f) => ({ ...f, product: p, productSearch: "" }))}
                      >
                        <span className="font-mono text-xs text-gray-500 mr-2">{p.code || "S/C"}</span>
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-gray-400 ml-2">stock: {p.stock ?? 0}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Cantidad *</label>
              <input
                type="number"
                min={1}
                value={nuevaSolForm.cantidad}
                onChange={(e) => setNuevaSolForm((f) => ({ ...f, cantidad: parseInt(e.target.value) || 1 }))}
                className="w-full p-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Proveedor sugerido (opcional)</label>
              <input
                type="text"
                value={nuevaSolForm.proveedor_sugerido}
                onChange={(e) => setNuevaSolForm((f) => ({ ...f, proveedor_sugerido: e.target.value }))}
                placeholder="Nombre del proveedor"
                className="w-full p-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Observaciones</label>
              <textarea
                value={nuevaSolForm.observaciones}
                onChange={(e) => setNuevaSolForm((f) => ({ ...f, observaciones: e.target.value }))}
                className="w-full p-2 border rounded-lg text-sm"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setNuevaSolDialog(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancelar</button>
            <button
              onClick={handleCrearSolicitudManual}
              disabled={creandoSol || !nuevaSolForm.product}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400 text-sm"
            >
              {creandoSol ? "Creando..." : "Crear Solicitud"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
