"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as XLSX from "xlsx"
import { formatCurrency, formatDate, normalizeSearch } from "@/lib/utils"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import {
  fetchCompras,
  fetchComprasCount,
  fetchOrdenesCompra,
  deleteCompra,
  updateCompra,
  deleteOrdenCompra,
  updateOrdenCompra,
  fetchSolicitudesCompra,
  updateSolicitudCompra,
  fetchProveedores,
} from "@/lib/supabase/queries"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Eye, Pencil, Trash2, Paperclip } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

const ESTADOS_OC = ["Pendiente", "Realizado", "Recibido Completo", "Recibido Incompleto", "Factura Cargada", "Cancelado"]

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
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [compras, setCompras] = useState<any[]>([])
  const [ordenes, setOrdenes] = useState<any[]>([])
  const [solicitudes, setSolicitudes] = useState<any[]>([])
  const [totalComprasCount, setTotalComprasCount] = useState(0)
  const [solEstadoFilter, setSolEstadoFilter] = useState("")
  const [solBusqueda, setSolBusqueda] = useState("")
  const [proveedores, setProveedores] = useState<any[]>([])

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
  const [editingOrden, setEditingOrden] = useState<any | null>(null)
  const [editOrdenForm, setEditOrdenForm] = useState<any>({})
  const [deletingOrden, setDeletingOrden] = useState<any | null>(null)

  async function loadData() {
    setLoading(true)
    try {
      const [c, o, count, sol, provs] = await Promise.all([
        fetchCompras(),
        fetchOrdenesCompra(),
        fetchComprasCount(),
        fetchSolicitudesCompra(),
        fetchProveedores(),
      ])
      setCompras(c)
      setOrdenes(o)
      setTotalComprasCount(count)
      setSolicitudes(sol)
      setProveedores(provs)
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
    const matchEstado = !estadoOrdenes || o.estado === estadoOrdenes
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
      await deleteOrdenCompra(deletingOrden.id)
      setDeletingOrden(null)
      await loadData()
    } catch (err) {
      console.error("Error eliminando orden:", err)
    }
  }

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

  function handleConvertirOC(solicitud: any) {
    // Find proveedor habitual del producto (si ya se compró antes ese producto)
    const provHabitual = proveedores.find((p) =>
      compras.some((c) =>
        c.proveedor_id === p.id &&
        normalizeSearch(c.articulo || "").includes(normalizeSearch(solicitud.producto_nombre || "")),
      ),
    )
    const params = new URLSearchParams({
      solicitud_id: solicitud.id,
      producto_nombre: solicitud.producto_nombre || "",
      producto_codigo: solicitud.producto_codigo || "",
      product_id: solicitud.product_id || "",
      cantidad: String(solicitud.cantidad_faltante || solicitud.cantidad_solicitada || 1),
    })
    if (provHabitual) {
      params.set("proveedor_id", provHabitual.id || "")
      params.set("proveedor_nombre", provHabitual.nombre || provHabitual.razon_social || "")
    }
    router.push(`/admin/compras/nueva?${params.toString()}`)
  }

  async function handleDownloadAdjunto(path: string) {
    const supabase = createClient()
    const { data } = await supabase.storage.from("comprobantes").createSignedUrl(path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, "_blank")
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

      <Tabs defaultValue="solicitudes">
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
            </div>
          </div>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {(() => {
              const filtered = solicitudes.filter((s) => {
                const matchEstado = !solEstadoFilter || s.estado === solEstadoFilter
                const matchBusqueda = !solBusqueda || normalizeSearch(s.producto_nombre || "").includes(normalizeSearch(solBusqueda)) || normalizeSearch(s.producto_codigo || "").includes(normalizeSearch(solBusqueda))
                return matchEstado && matchBusqueda
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
                                  className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                >
                                  Convertir en OC
                                </button>
                              )}
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
              {ESTADOS_OC.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            <select
              value={vendedorCompras}
              onChange={(e) => { setVendedorCompras(e.target.value); setComprasPage(1) }}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="">Todos los vendedores</option>
              {vendedoresUnicos.map((v) => (
                <option key={v} value={v}>{v}</option>
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
                      <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 75 }}>Vendedor</th>
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
                        <td className="px-2 py-2 text-gray-600 truncate" title={c.vendedor || ""}>
                          {c.vendedor || "-"}
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
                            {ESTADOS_OC.map((e) => (
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
              <p className="text-2xl font-bold text-indigo-700">{formatCurrency(montoTotalOC)}</p>
            </div>
            {Object.entries(montosPorRazon)
              .slice(0, 2)
              .map(([razon, monto]) => (
                <div key={razon} className="bg-white rounded-xl p-4 border shadow-sm">
                  <p className="text-sm text-gray-500 truncate" title={razon}>{razon}</p>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(monto)}</p>
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
                      <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 80 }}>F. Recepción</th>
                      <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 60 }}>Nro OC</th>
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
                          {formatCurrency(Number(o.importe_total) || 0)}
                        </td>
                        <td className="px-2 py-1">
                          <select
                            value={o.estado || ""}
                            onChange={async (e) => {
                              const nuevoEstado = e.target.value
                              try {
                                await updateOrdenCompra(o.id, { estado: nuevoEstado })
                                setOrdenes((prev) => prev.map((x) => x.id === o.id ? { ...x, estado: nuevoEstado } : x))
                              } catch (err) {
                                console.error("Error actualizando estado:", err)
                              }
                            }}
                            className="p-1 border rounded text-xs w-full bg-white focus:ring-2 focus:ring-primary"
                          >
                            {ESTADOS_OC.map((e) => (
                              <option key={e} value={e}>{e}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <select
                            value={o.empresa || ""}
                            onChange={async (e) => {
                              const val = e.target.value
                              setOrdenes((prev) => prev.map((x) => x.id === o.id ? { ...x, empresa: val } : x))
                              try {
                                await updateOrdenCompra(o.id, { empresa: val || null })
                              } catch (err) {
                                console.error("Error guardando empresa:", err)
                              }
                            }}
                            className="p-1 border rounded text-xs w-full bg-white focus:ring-2 focus:ring-primary"
                          >
                            <option value="">-</option>
                            <option value="Masoil">Masoil</option>
                            <option value="Aquiles">Aquiles</option>
                            <option value="Conancap">Conancap</option>
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input
                            type="date"
                            value={o.fecha_recepcion || ""}
                            onChange={async (e) => {
                              const val = e.target.value
                              setOrdenes((prev) => prev.map((x) => x.id === o.id ? { ...x, fecha_recepcion: val } : x))
                              try {
                                await updateOrdenCompra(o.id, { fecha_recepcion: val || null })
                              } catch (err) {
                                console.error("Error guardando fecha recepción:", err)
                              }
                            }}
                            className="p-1 border rounded text-xs w-full bg-white focus:ring-2 focus:ring-primary"
                          />
                        </td>
                        <td className="px-2 py-2 text-gray-600 truncate text-xs">{o.nro_oc || "-"}</td>
                        <td className="px-1 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setViewingOrden(o)}
                              className="p-1 hover:bg-gray-200 rounded"
                              title="Ver detalle"
                            >
                              <Eye className="h-4 w-4 text-gray-600" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingOrden(o)
                                setEditOrdenForm({
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
              <div><strong>Vendedor:</strong> {viewingCompra.vendedor || "-"}</div>
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
              <label className="text-sm text-gray-600 block mb-1">Vendedor</label>
              <input type="text" value={editCompraForm.vendedor || ""} onChange={(e) => setEditCompraForm((f: any) => ({ ...f, vendedor: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Estado</label>
              <select value={editCompraForm.estado || ""} onChange={(e) => setEditCompraForm((f: any) => ({ ...f, estado: e.target.value }))} className="w-full p-2 border rounded-lg text-sm">
                {ESTADOS_OC.map((e) => (<option key={e} value={e}>{e}</option>))}
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle de Orden de Compra</DialogTitle>
          </DialogHeader>
          {viewingOrden && (
            <div className="space-y-2 text-sm">
              <div><strong>Fecha:</strong> {viewingOrden.fecha ? formatDate(new Date(viewingOrden.fecha)) : "-"}</div>
              <div><strong>Proveedor:</strong> {viewingOrden.proveedor_nombre || "-"}</div>
              <div><strong>Importe Total:</strong> {formatCurrency(Number(viewingOrden.importe_total) || 0)}</div>
              <div><strong>Estado:</strong> {viewingOrden.estado || "-"}</div>
              <div><strong>Nro OC:</strong> {viewingOrden.nro_oc || "-"}</div>
              <div><strong>Razon Social:</strong> {viewingOrden.razon_social || "-"}</div>
              <div><strong>Ubicacion:</strong> {viewingOrden.ubicacion_oc || "-"}</div>
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
            <div>
              <label className="text-sm text-gray-600 block mb-1">Proveedor</label>
              <input type="text" value={editOrdenForm.proveedor_nombre || ""} onChange={(e) => setEditOrdenForm((f: any) => ({ ...f, proveedor_nombre: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Importe Total</label>
              <input type="number" value={editOrdenForm.importe_total || 0} onChange={(e) => setEditOrdenForm((f: any) => ({ ...f, importe_total: Number(e.target.value) }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Estado</label>
              <select value={editOrdenForm.estado || ""} onChange={(e) => setEditOrdenForm((f: any) => ({ ...f, estado: e.target.value }))} className="w-full p-2 border rounded-lg text-sm">
                {ESTADOS_OC.map((e) => (<option key={e} value={e}>{e}</option>))}
              </select>
            </div>
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

    </div>
  )
}
