"use client"

import { useState, useEffect, useMemo } from "react"
import { normalizeSearch, formatMoney, formatDateStr } from "@/lib/utils"
import { fetchFacturasGestionpro, fetchFacturasGestionproCount, fetchFacturas } from "@/lib/supabase/queries"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import * as XLSX from "xlsx"

interface FacturaGP {
  id: string
  fecha: string | null
  tipo_comprobante: string | null
  sucursal: string | null
  nro_comprobante: string | null
  letra: string | null
  cod_cliente: string | null
  razon_social: string | null
  documento: string | null
  resp_iva: string | null
  provincia: string | null
  localidad: string | null
  condicion_pago: string | null
  vendedor: string | null
  neto: number
  impuestos: number
  total: number
  moneda: string | null
  cotizacion: number | null
  cae: string | null
  created_at: string
}

export default function FacturacionPage() {
  const [loading, setLoading] = useState(true)
  const [gpData, setGpData] = useState<FacturaGP[]>([])
  const [emitidas, setEmitidas] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [gpSearch, setGpSearch] = useState("")
  const [gpTipo, setGpTipo] = useState("")
  const [gpVendedor, setGpVendedor] = useState("")
  const [gpPage, setGpPage] = useState(1)
  const [emPage, setEmPage] = useState(1)
  const [emSearch, setEmSearch] = useState("")

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [data, count, facturasEmitidas] = await Promise.all([
          fetchFacturasGestionpro(),
          fetchFacturasGestionproCount(),
          fetchFacturas(),
        ])
        setGpData(data as FacturaGP[])
        setTotalCount(count)
        setEmitidas(facturasEmitidas)
      } catch (error) {
        console.error("Error cargando facturas:", error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // --- Computed ---
  const gpTipos = useMemo(() => {
    const set = new Set<string>()
    gpData.forEach((f) => f.tipo_comprobante && set.add(f.tipo_comprobante))
    return Array.from(set).sort()
  }, [gpData])

  const gpVendedores = useMemo(() => {
    const set = new Set<string>()
    gpData.forEach((f) => f.vendedor && set.add(f.vendedor))
    return Array.from(set).sort()
  }, [gpData])

  const gpFiltered = useMemo(() => {
    let items = gpData
    if (gpSearch) {
      const q = normalizeSearch(gpSearch)
      items = items.filter((f) => normalizeSearch(f.razon_social || "").includes(q))
    }
    if (gpTipo) items = items.filter((f) => f.tipo_comprobante === gpTipo)
    if (gpVendedor) items = items.filter((f) => f.vendedor === gpVendedor)
    return items
  }, [gpData, gpSearch, gpTipo, gpVendedor])

  const gpPagination = usePagination(gpFiltered, 50)
  const gpPageData = gpPagination.getPage(gpPage)

  useEffect(() => {
    setGpPage(1)
  }, [gpSearch, gpTipo, gpVendedor])

  // --- Stats ---
  const gpStats = useMemo(() => {
    const totalMonto = gpData.reduce((s, f) => s + (f.total || 0), 0)
    const byTipo: Record<string, number> = {}
    gpData.forEach((f) => {
      const t = f.tipo_comprobante || "Otro"
      byTipo[t] = (byTipo[t] || 0) + 1
    })
    const byVendedorMap: Record<string, number> = {}
    gpData.forEach((f) => {
      const v = f.vendedor || "Sin vendedor"
      byVendedorMap[v] = (byVendedorMap[v] || 0) + (f.total || 0)
    })
    const topVendedores = Object.entries(byVendedorMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
    return { totalMonto, byTipo, topVendedores }
  }, [gpData])

  // Emitidas filtering (must be before early return to maintain hook order)
  const emitidasFiltered = useMemo(() => {
    if (!emSearch) return emitidas
    const q = normalizeSearch(emSearch)
    return emitidas.filter((f: any) =>
      normalizeSearch(f.razon_social || "").includes(q) ||
      normalizeSearch(f.numero || "").includes(q)
    )
  }, [emitidas, emSearch])

  const emPagination = usePagination(emitidasFiltered, 50)
  const emPageData = emPagination.getPage(emPage)

  function exportXlsx() {
    const rows = gpFiltered.map((f) => ({
      Fecha: f.fecha ? formatDateStr(f.fecha) : "",
      Tipo: f.tipo_comprobante || "",
      Letra: f.letra || "",
      "Nro Comprobante": f.nro_comprobante || "",
      Cliente: f.razon_social || "",
      Vendedor: f.vendedor || "",
      Neto: f.neto || 0,
      Impuestos: f.impuestos || 0,
      Total: f.total || 0,
      CAE: f.cae || "",
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Facturas")
    XLSX.writeFile(wb, "facturas.xlsx")
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2 text-gray-600">Cargando facturas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Facturacion</h2>
          <p className="text-gray-500">Facturas emitidas a clientes</p>
        </div>
        <Link
          href="/admin/facturacion/nueva"
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
        >
          + Nueva Factura
        </Link>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 border shadow-sm">
          <p className="text-sm text-gray-500 font-medium">Total facturas</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{(totalCount || gpData.length).toLocaleString("es-AR")}</p>
        </div>
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-5 border border-indigo-200">
          <p className="text-sm text-indigo-600 font-semibold">Monto total facturado</p>
          <p className="text-2xl font-bold text-indigo-700 mt-1">{formatMoney(gpStats.totalMonto)}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border shadow-sm">
          <p className="text-sm text-gray-500 font-medium mb-2">Por tipo comprobante</p>
          <div className="space-y-1">
            {Object.entries(gpStats.byTipo).map(([tipo, count]) => (
              <div key={tipo} className="flex justify-between text-sm">
                <span className="text-gray-600">{tipo}</span>
                <span className="font-semibold text-gray-900">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border shadow-sm">
          <p className="text-sm text-gray-500 font-medium mb-2">Top vendedores</p>
          <div className="space-y-1">
            {gpStats.topVendedores.map(([name, total]) => (
              <div key={name} className="flex justify-between text-sm">
                <span className="text-gray-600 truncate max-w-[140px]">{name}</span>
                <span className="font-semibold text-gray-900">{formatMoney(total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Tabs defaultValue={emitidas.length > 0 ? "emitidas" : "historial"}>
        <TabsList className="mb-4">
          <TabsTrigger value="emitidas">Facturas Emitidas ({emitidas.length})</TabsTrigger>
          <TabsTrigger value="historial">Historial GestionPro ({totalCount || gpData.length})</TabsTrigger>
        </TabsList>

        {/* Tab Facturas Emitidas */}
        <TabsContent value="emitidas">
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <input
              type="text"
              placeholder="Buscar por razon social o numero..."
              value={emSearch}
              onChange={(e) => { setEmSearch(e.target.value); setEmPage(1) }}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm w-64"
            />
          </div>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {emitidasFiltered.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No hay facturas emitidas desde el sistema</p>
                <Link href="/admin/facturacion/nueva" className="text-primary hover:underline text-sm mt-2 inline-block">
                  Generar primera factura
                </Link>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Fecha</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Tipo</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Numero</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Cliente</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">Base Gravada</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">IVA</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">Total</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700">CAE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emPageData.map((f: any, idx: number) => (
                        <tr key={f.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {f.fecha ? formatDateStr(f.fecha) : "-"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              {f.tipo || "-"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-gray-900 font-medium">{f.numero || "-"}</td>
                          <td className="px-4 py-3">
                            <span className="block truncate max-w-[180px] text-gray-900" title={f.razon_social || ""}>
                              {f.razon_social || "-"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatMoney(Number(f.base_gravada) || 0)}</td>
                          <td className="px-4 py-3 text-right text-gray-600">{formatMoney(Number(f.iva_21) || 0)}</td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900">{formatMoney(Number(f.total) || 0)}</td>
                          <td className="px-4 py-3 text-center">
                            {f.cae ? (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">{f.cae.slice(0, 8)}...</span>
                            ) : (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">Sin CAE</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  currentPage={emPage}
                  totalPages={emPagination.totalPages}
                  totalItems={emPagination.totalItems}
                  pageSize={emPagination.pageSize}
                  onPageChange={setEmPage}
                />
              </>
            )}
          </div>
        </TabsContent>

        {/* Tab Historial GestionPro */}
        <TabsContent value="historial">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Buscar por razon social..."
            value={gpSearch}
            onChange={(e) => setGpSearch(e.target.value)}
            className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm w-64"
          />
          <select
            value={gpTipo}
            onChange={(e) => setGpTipo(e.target.value)}
            className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
          >
            <option value="">Todos los tipos</option>
            {gpTipos.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={gpVendedor}
            onChange={(e) => setGpVendedor(e.target.value)}
            className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
          >
            <option value="">Todos los vendedores</option>
            {gpVendedores.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <div className="ml-auto">
            <button
              onClick={exportXlsx}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
            >
              Exportar XLSX
            </button>
          </div>
        </div>
        {gpFiltered.length !== gpData.length && (
          <p className="text-xs text-gray-500 mt-2">
            Mostrando {gpFiltered.length} de {gpData.length} registros
          </p>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {gpFiltered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No se encontraron facturas con los filtros aplicados</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Fecha</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Tipo</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">Letra</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Nro Comprobante</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Cliente</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Vendedor</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Neto</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Impuestos</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Total</th>
                    <th className="px-4 py-3 text-center font-semibold text-gray-700">CAE</th>
                  </tr>
                </thead>
                <tbody>
                  {gpPageData.map((f, idx) => (
                    <tr key={f.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {f.fecha ? formatDateStr(f.fecha) : "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-900 font-medium">{f.tipo_comprobante || "-"}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{f.letra || "-"}</td>
                      <td className="px-4 py-3 text-gray-600">{f.nro_comprobante || "-"}</td>
                      <td className="px-4 py-3">
                        <span className="block truncate max-w-[180px] text-gray-900" title={f.razon_social || ""}>
                          {f.razon_social || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block truncate max-w-[180px] text-gray-600" title={f.vendedor || ""}>
                          {f.vendedor || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatMoney(f.neto || 0)}</td>
                      <td className="px-4 py-3 text-right text-gray-600">{formatMoney(f.impuestos || 0)}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">{formatMoney(f.total || 0)}</td>
                      <td className="px-4 py-3 text-center">
                        {f.cae ? (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">OK</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">Sin CAE</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={gpPage}
              totalPages={gpPagination.totalPages}
              totalItems={gpPagination.totalItems}
              pageSize={gpPagination.pageSize}
              onPageChange={setGpPage}
            />
          </>
        )}
      </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
