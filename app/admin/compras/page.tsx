"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import * as XLSX from "xlsx"
import { formatCurrency, formatDate } from "@/lib/utils"
import { fetchCompras, fetchOrdenesCompra } from "@/lib/supabase/queries"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"

function estadoBadge(estado: string) {
  const lower = (estado || "").toLowerCase()
  if (lower.includes("pendiente"))
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200">{estado}</Badge>
  if (lower.includes("proceso") || lower.includes("en curso"))
    return <Badge className="bg-blue-100 text-blue-800 border-blue-200">{estado}</Badge>
  if (lower.includes("recibid") || lower.includes("completad"))
    return <Badge className="bg-green-100 text-green-800 border-green-200">{estado}</Badge>
  if (lower.includes("cancelad"))
    return <Badge className="bg-red-100 text-red-800 border-red-200">{estado}</Badge>
  return <Badge variant="outline">{estado || "-"}</Badge>
}

function truncate(text: string | null, max: number) {
  if (!text) return "-"
  return text.length > max ? text.slice(0, max) + "..." : text
}

export default function ComprasPage() {
  const [loading, setLoading] = useState(true)
  const [compras, setCompras] = useState<any[]>([])
  const [ordenes, setOrdenes] = useState<any[]>([])

  // Filters - Compras
  const [busquedaCompras, setBusquedaCompras] = useState("")
  const [estadoCompras, setEstadoCompras] = useState("")
  const [vendedorCompras, setVendedorCompras] = useState("")

  // Filters - Ordenes
  const [busquedaOrdenes, setBusquedaOrdenes] = useState("")
  const [razonSocialOrdenes, setRazonSocialOrdenes] = useState("")
  const [estadoOrdenes, setEstadoOrdenes] = useState("")

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [c, o] = await Promise.all([fetchCompras(), fetchOrdenesCompra()])
        setCompras(c)
        setOrdenes(o)
      } catch (err) {
        console.error("Error cargando compras:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  // --- Compras derived data ---
  const estadosCompras = [...new Set(compras.map((c) => c.estado).filter(Boolean))]
  const vendedoresUnicos = [...new Set(compras.map((c) => c.vendedor).filter(Boolean))]

  const comprasFiltradas = compras.filter((c) => {
    const matchBusqueda =
      !busquedaCompras ||
      (c.proveedor_nombre || "").toLowerCase().includes(busquedaCompras.toLowerCase()) ||
      (c.articulo || "").toLowerCase().includes(busquedaCompras.toLowerCase())
    const matchEstado = !estadoCompras || c.estado === estadoCompras
    const matchVendedor = !vendedorCompras || c.vendedor === vendedorCompras
    return matchBusqueda && matchEstado && matchVendedor
  })

  const totalCompras = compras.length
  const pendientesCompras = compras.filter((c) =>
    (c.estado || "").toLowerCase().includes("pendiente")
  ).length
  const recibidasCompras = compras.filter((c) =>
    (c.estado || "").toLowerCase().includes("recibid")
  ).length
  const otrasCompras = totalCompras - pendientesCompras - recibidasCompras

  // --- Ordenes derived data ---
  const estadosOrdenes = [...new Set(ordenes.map((o) => o.estado).filter(Boolean))]
  const razonesSociales = [...new Set(ordenes.map((o) => o.razon_social).filter(Boolean))]

  const ordenesFiltradas = ordenes.filter((o) => {
    const matchBusqueda =
      !busquedaOrdenes ||
      (o.proveedor_nombre || "").toLowerCase().includes(busquedaOrdenes.toLowerCase()) ||
      (o.nro_oc || "").toLowerCase().includes(busquedaOrdenes.toLowerCase())
    const matchRazon = !razonSocialOrdenes || o.razon_social === razonSocialOrdenes
    const matchEstado = !estadoOrdenes || o.estado === estadoOrdenes
    return matchBusqueda && matchRazon && matchEstado
  })

  const totalOC = ordenes.length
  const montoTotalOC = ordenes.reduce((sum, o) => sum + (Number(o.importe_total) || 0), 0)
  const montosPorRazon: Record<string, number> = {}
  ordenes.forEach((o) => {
    const key = o.razon_social || "Sin razon social"
    montosPorRazon[key] = (montosPorRazon[key] || 0) + (Number(o.importe_total) || 0)
  })

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

      <Tabs defaultValue="compras">
        <TabsList className="mb-4">
          <TabsTrigger value="compras">Seguimiento de Compras</TabsTrigger>
          <TabsTrigger value="ordenes">Ordenes de Compra</TabsTrigger>
        </TabsList>

        {/* ===================== TAB: COMPRAS ===================== */}
        <TabsContent value="compras">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl p-4 border shadow-sm">
              <p className="text-sm text-gray-500">Total Compras</p>
              <p className="text-2xl font-bold text-gray-900">{totalCompras}</p>
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
              onChange={(e) => setBusquedaCompras(e.target.value)}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm flex-1 min-w-[200px]"
            />
            <select
              value={estadoCompras}
              onChange={(e) => setEstadoCompras(e.target.value)}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="">Todos los estados</option>
              {estadosCompras.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <select
              value={vendedorCompras}
              onChange={(e) => setVendedorCompras(e.target.value)}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="">Todos los vendedores</option>
              {vendedoresUnicos.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
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
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Fecha</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Proveedor</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Articulo</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Vendedor</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Estado</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Nro Cotizacion</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Nro Nota Pedido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comprasFiltradas.map((c, idx) => (
                      <tr key={c.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-4 py-3 text-gray-600">
                          {c.fecha ? formatDate(new Date(c.fecha)) : "-"}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{c.proveedor_nombre || "-"}</td>
                        <td className="px-4 py-3 text-gray-600" title={c.articulo || ""}>
                          {truncate(c.articulo, 50)}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{c.vendedor || "-"}</td>
                        <td className="px-4 py-3">{estadoBadge(c.estado)}</td>
                        <td className="px-4 py-3 text-gray-600">{c.nro_cotizacion || "-"}</td>
                        <td className="px-4 py-3 text-gray-600">{c.nro_nota_pedido || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
                  <p className="text-sm text-gray-500 truncate" title={razon}>
                    {razon}
                  </p>
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
              onChange={(e) => setBusquedaOrdenes(e.target.value)}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm flex-1 min-w-[200px]"
            />
            <select
              value={razonSocialOrdenes}
              onChange={(e) => setRazonSocialOrdenes(e.target.value)}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="">Todas las razones sociales</option>
              {razonesSociales.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              value={estadoOrdenes}
              onChange={(e) => setEstadoOrdenes(e.target.value)}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="">Todos los estados</option>
              {estadosOrdenes.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
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
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Fecha</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Proveedor</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Importe Total</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Estado</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Nro OC</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Razon Social</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Ubicacion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenesFiltradas.map((o, idx) => (
                      <tr key={o.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-4 py-3 text-gray-600">
                          {o.fecha ? formatDate(new Date(o.fecha)) : "-"}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{o.proveedor_nombre || "-"}</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">
                          {formatCurrency(Number(o.importe_total) || 0)}
                        </td>
                        <td className="px-4 py-3">{estadoBadge(o.estado)}</td>
                        <td className="px-4 py-3 text-gray-600">{o.nro_oc || "-"}</td>
                        <td className="px-4 py-3 text-gray-600">{o.razon_social || "-"}</td>
                        <td className="px-4 py-3 text-gray-600">{o.ubicacion_oc || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
