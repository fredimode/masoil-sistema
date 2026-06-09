"use client"

import { useState, useEffect, useMemo } from "react"
import { normalizeSearch, formatMoney, formatDateStr } from "@/lib/utils"
import { fetchFacturasGestionpro, fetchFacturasGestionproCount, fetchFacturas, fetchRemitos, getRemitoPdfUrl } from "@/lib/supabase/queries"
import { createClient } from "@/lib/supabase/client"
import { fetchCuentaCorrienteCliente } from "@/lib/supabase/queries"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Eye, Printer, FileText, Undo2 } from "lucide-react"
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
  const [emProductCode, setEmProductCode] = useState("")
  const [emProductFacturaIds, setEmProductFacturaIds] = useState<Set<number> | null>(null)
  const [viewingFactura, setViewingFactura] = useState<any | null>(null)
  const [viewingItems, setViewingItems] = useState<any[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [asociadas, setAsociadas] = useState<any[]>([])  // NC/ND que referencian esta factura
  const [facturaOrigen, setFacturaOrigen] = useState<any | null>(null)  // FC origen si viewingFactura es NC/ND
  const [ccData, setCcData] = useState<any[]>([])  // cuenta corriente for deuda calculation
  // T.4: remitos emitidos
  const [remitos, setRemitos] = useState<any[]>([])
  const [remSearch, setRemSearch] = useState("")
  const [remPage, setRemPage] = useState(1)
  const [openingRemito, setOpeningRemito] = useState<string | null>(null)

  useEffect(() => {
    if (!viewingFactura) {
      setViewingItems([])
      setAsociadas([])
      setFacturaOrigen(null)
      return
    }
    const orderId = viewingFactura.order_id
    if (!orderId) {
      setViewingItems([])
    } else {
      const supabase = createClient()
      setLoadingItems(true)
      // Filtrar items por factura_id para soportar facturas parciales: una
      // factura solo debe mostrar SUS items, no todos los del pedido.
      // Fallback a order_id para facturas legacy (pre migración 20260414) cuyos
      // order_items aún no tengan factura_id seteado.
      supabase
        .from("order_items")
        .select("*, products(code, name)")
        .eq("factura_id", viewingFactura.id)
        .then(async ({ data, error }) => {
          if (error) {
            console.error("Error cargando items por factura_id:", error)
            setViewingItems([])
            setLoadingItems(false)
            return
          }
          if (data && data.length > 0) {
            setViewingItems(data)
            setLoadingItems(false)
            return
          }
          // Fallback legacy
          const { data: legacy, error: legacyErr } = await supabase
            .from("order_items")
            .select("*, products(code, name)")
            .eq("order_id", orderId)
          if (legacyErr) {
            console.error("Error cargando items (fallback order_id):", legacyErr)
            setViewingItems([])
          } else {
            setViewingItems(legacy || [])
          }
          setLoadingItems(false)
        })
    }

    // NC/ND asociadas a esta factura (factura_referencia_id apunta acá)
    const supabase = createClient()
    supabase
      .from("facturas")
      .select("id, numero, tipo, fecha, total")
      .eq("factura_referencia_id", viewingFactura.id)
      .order("fecha", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("Error cargando asociadas:", error)
          setAsociadas([])
        } else {
          setAsociadas(data || [])
        }
      })

    // Si esta factura es NC/ND y tiene factura_referencia_id, cargar la FC origen
    // para mostrar el vinculo inverso (item Excel #37 - reciprocidad).
    const tipoUpper = (viewingFactura.tipo || "").toUpperCase()
    const esNCND = tipoUpper.startsWith("NOTA DE CREDITO") || tipoUpper.startsWith("NOTA DE DEBITO")
    if (esNCND && viewingFactura.factura_referencia_id) {
      supabase
        .from("facturas")
        .select("id, numero, tipo, fecha, total, comprobante_nro, punto_venta")
        .eq("id", viewingFactura.factura_referencia_id)
        .single()
        .then(({ data, error }) => {
          if (error) {
            console.error("Error cargando factura origen:", error)
            setFacturaOrigen(null)
          } else {
            setFacturaOrigen(data || null)
          }
        })
    } else {
      setFacturaOrigen(null)
    }
  }, [viewingFactura])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [data, count, facturasEmitidas, ccAll, remitosData] = await Promise.all([
          fetchFacturasGestionpro(),
          fetchFacturasGestionproCount(),
          fetchFacturas(),
          fetchCuentaCorrienteCliente(),
          fetchRemitos(),
        ])
        setGpData(data as FacturaGP[])
        setTotalCount(count)
        setEmitidas(facturasEmitidas)
        setCcData(ccAll)
        setRemitos(remitosData)
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
  // Las NC restan al total facturado (devoluciones/descuentos). FC y ND suman.
  // El count por tipo NO se afecta — cada documento sigue siendo 1 fila.
  const gpStats = useMemo(() => {
    let totalMonto = 0
    const byTipo: Record<string, number> = {}
    const byVendedorMap: Record<string, number> = {}
    for (const f of gpData) {
      const tipoUp = String(f.tipo_comprobante || "").toUpperCase().trim()
      const esNC = tipoUp.startsWith("NOTA DE CREDITO") || tipoUp.startsWith("NOTA DE CRÉDITO")
      const signo = esNC ? -1 : 1
      const monto = (f.total || 0) * signo
      totalMonto += monto
      const t = f.tipo_comprobante || "Otro"
      byTipo[t] = (byTipo[t] || 0) + 1
      const v = f.vendedor || "Sin vendedor"
      byVendedorMap[v] = (byVendedorMap[v] || 0) + monto
    }
    const topVendedores = Object.entries(byVendedorMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
    return { totalMonto, byTipo, topVendedores }
  }, [gpData])

  // Calculate deuda per factura based on cuenta corriente
  const deudaMap = useMemo(() => {
    const map: Record<string, number> = {}
    // For each factura, check CC payments
    emitidas.forEach((f: any) => {
      const total = Number(f.total) || 0
      // Sum haber (payments) for this factura reference
      const pagos = ccData.filter((cc: any) => cc.referencia_id === String(f.id))
      const totalPagado = pagos.reduce((sum: number, cc: any) => sum + (Number(cc.haber) || 0), 0)
      map[f.id] = Math.max(0, total - totalPagado)
    })
    return map
  }, [emitidas, ccData])

  // Emitidas filtering (must be before early return to maintain hook order)
  useEffect(() => {
    const code = emProductCode.trim()
    if (!code) { setEmProductFacturaIds(null); return }
    const timer = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from("order_items")
        .select("factura_id, products!inner(code)")
        .ilike("products.code", `%${code}%`)
        .not("factura_id", "is", null)
      const ids = new Set((data || []).map((d: any) => d.factura_id as number).filter(Boolean))
      setEmProductFacturaIds(ids)
      setEmPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [emProductCode])

  const emitidasFiltered = useMemo(() => {
    let result = emitidas
    if (emSearch) {
      const q = normalizeSearch(emSearch)
      result = result.filter((f: any) =>
        normalizeSearch(f.razon_social || "").includes(q) ||
        normalizeSearch(f.numero || "").includes(q)
      )
    }
    if (emProductFacturaIds !== null) {
      result = result.filter((f: any) => emProductFacturaIds.has(f.id))
    }
    return result
  }, [emitidas, emSearch, emProductFacturaIds])

  const emPagination = usePagination(emitidasFiltered, 50)
  const emPageData = emPagination.getPage(emPage)

  // T.4: remitos emitidos — filtrado por cliente o número y paginado
  const remitosFiltered = useMemo(() => {
    if (!remSearch.trim()) return remitos
    const q = normalizeSearch(remSearch)
    return remitos.filter((r: any) =>
      normalizeSearch(r.cliente_nombre || "").includes(q) ||
      normalizeSearch(r.numero || "").includes(q) ||
      normalizeSearch(r.pedido_numero || "").includes(q)
    )
  }, [remitos, remSearch])

  const remPagination = usePagination(remitosFiltered, 50)
  const remPageData = remPagination.getPage(remPage)

  useEffect(() => { setRemPage(1) }, [remSearch])

  async function handleVerRemito(r: any) {
    setOpeningRemito(r.id)
    try {
      const url = await getRemitoPdfUrl(r)
      if (url) window.open(url, "_blank")
      else alert("Este remito no tiene PDF disponible")
    } catch (err) {
      console.error("Error abriendo PDF de remito:", err)
      alert("No se pudo abrir el PDF del remito")
    } finally {
      setOpeningRemito(null)
    }
  }

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
          <TabsTrigger value="remitos">Remitos Emitidos ({remitos.length})</TabsTrigger>
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
            <input
              type="text"
              placeholder="Buscar por código de producto..."
              value={emProductCode}
              onChange={(e) => setEmProductCode(e.target.value)}
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
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 w-14">Empresa</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Tipo y Numero</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Cliente</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">Total</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700">Deuda</th>
                        <th className="px-4 py-3 text-left font-semibold text-gray-700">Vendedor</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 w-28">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emPageData.map((f: any, idx: number) => {
                        const deuda = deudaMap[f.id] ?? (Number(f.total) || 0)
                        // Format tipo completo + numero (ej: "NOTA DE CREDITO B 00005-00001234")
                        const tipoCompleto = (f.tipo || "").trim()
                        let nroFmt: string
                        if (f.punto_venta != null && (f.numero_comprobante || f.numero)) {
                          const pv = String(f.punto_venta).padStart(5, "0")
                          const nro = String(f.numero_comprobante || f.numero).padStart(8, "0")
                          nroFmt = `${pv}-${nro}`
                        } else {
                          nroFmt = f.comprobante_nro || f.numero || "-"
                        }
                        const tipoNumero = tipoCompleto ? `${tipoCompleto} ${nroFmt}` : nroFmt
                        const esNC = tipoCompleto.toUpperCase().startsWith("NOTA DE CREDITO")
                        return (
                          <tr key={f.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                              {f.fecha ? formatDateStr(f.fecha) : "-"}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {f.empresa ? (
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                                    f.empresa === "Aquiles"
                                      ? "bg-blue-100 text-blue-800"
                                      : f.empresa === "Conancap"
                                      ? "bg-purple-100 text-purple-800"
                                      : "bg-gray-100 text-gray-700"
                                  }`}
                                  title={f.empresa}
                                >
                                  {f.empresa === "Aquiles" ? "AQ" : f.empresa === "Conancap" ? "CO" : f.empresa.slice(0, 2).toUpperCase()}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-gray-900 font-medium">
                              {tipoNumero}
                            </td>
                            <td className="px-4 py-3">
                              <span className="block truncate max-w-[180px] text-gray-900" title={f.razon_social || ""}>
                                {f.razon_social || "-"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {esNC ? (
                                <span className="inline-flex items-center gap-1 font-bold text-green-700" title="Devolución (Nota de Crédito)">
                                  <Undo2 className="h-3.5 w-3.5" />
                                  {formatMoney(Number(f.total) || 0)}
                                </span>
                              ) : (
                                <span className="font-bold text-gray-900">{formatMoney(Number(f.total) || 0)}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {esNC ? (
                                <span className="text-xs text-gray-400">—</span>
                              ) : deuda > 0 ? (
                                <span className="font-semibold text-red-600">{formatMoney(deuda)}</span>
                              ) : (
                                <span className="font-medium text-green-600">Pagado</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-600">{f.vendedor_name || "-"}</td>
                            <td className="px-4 py-3 text-center">
                              <div className="inline-flex items-center gap-1">
                                <button onClick={() => setViewingFactura(f)} className="p-1 rounded hover:bg-gray-200" title="Ver detalle">
                                  <Eye className="h-4 w-4 text-gray-600" />
                                </button>
                                {f.pdf_url && (
                                  <a
                                    href={f.pdf_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 rounded hover:bg-gray-200 inline-flex"
                                    title="Abrir PDF en nueva pestaña"
                                  >
                                    <FileText className="h-4 w-4 text-blue-600" />
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
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

        {/* T.4: Tab Remitos Emitidos */}
        <TabsContent value="remitos">
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <input
              type="text"
              placeholder="Buscar por cliente, número de remito o pedido..."
              value={remSearch}
              onChange={(e) => setRemSearch(e.target.value)}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm w-80"
            />
          </div>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {remitosFiltered.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No hay remitos emitidos.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr className="text-left text-gray-600">
                        <th className="px-4 py-3 font-medium">Fecha</th>
                        <th className="px-4 py-3 font-medium">N° Remito</th>
                        <th className="px-4 py-3 font-medium">Empresa</th>
                        <th className="px-4 py-3 font-medium">Cliente</th>
                        <th className="px-4 py-3 font-medium">Pedido</th>
                        <th className="px-4 py-3 font-medium text-right">PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {remPageData.map((r: any) => (
                        <tr key={r.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3">{r.fecha_emision ? formatDateStr(r.fecha_emision) : "-"}</td>
                          <td className="px-4 py-3 font-mono">{r.numero || "-"}</td>
                          <td className="px-4 py-3">{r.empresa || "-"}</td>
                          <td className="px-4 py-3">{r.cliente_nombre || "-"}</td>
                          <td className="px-4 py-3">{r.pedido_numero || "-"}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleVerRemito(r)}
                              disabled={openingRemito === r.id}
                              className="inline-flex items-center gap-1 px-2 py-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
                              title="Ver PDF"
                            >
                              <FileText className="h-4 w-4" />
                              {openingRemito === r.id ? "Abriendo..." : "Ver PDF"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  currentPage={remPage}
                  totalPages={remPagination.totalPages}
                  totalItems={remPagination.totalItems}
                  pageSize={remPagination.pageSize}
                  onPageChange={setRemPage}
                />
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Modal Ver Factura Emitida */}
      {viewingFactura && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setViewingFactura(null) }}
        >
          <div className="fixed inset-0 bg-black/50 -z-10" />
          <div
            className="relative bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Detalle de Factura</h3>
              <button onClick={() => setViewingFactura(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="space-y-3 text-sm">
              {/* Cliente */}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 font-medium mb-1">Cliente</p>
                <p className="font-semibold">{viewingFactura.razon_social || "-"}</p>
                {viewingFactura.cuit_cliente && <p className="text-gray-600">CUIT: {viewingFactura.cuit_cliente}</p>}
              </div>

              {/* Comprobante */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Tipo</p>
                  <p className="font-medium">{viewingFactura.tipo || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Numero</p>
                  <p className="font-medium">{viewingFactura.comprobante_nro || viewingFactura.numero || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Fecha Emisión</p>
                  <p className="font-medium">{viewingFactura.fecha ? formatDateStr(viewingFactura.fecha) : "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Vencimiento CAE</p>
                  <p className="font-medium">{viewingFactura.vencimiento_cae ? formatDateStr(viewingFactura.vencimiento_cae) : "-"}</p>
                </div>
              </div>

              {/* Pedido asociado */}
              {viewingFactura.order_id && (
                <div className="border-t pt-3">
                  <p className="text-xs text-gray-500 font-medium mb-1">Pedido asociado</p>
                  <a href={`/admin/pedidos/${viewingFactura.order_id}`} className="text-sm text-blue-600 hover:underline font-medium">
                    Ver pedido →
                  </a>
                </div>
              )}

              {/* Detalle productos */}
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 font-medium mb-2">Detalle de Productos</p>
                {loadingItems ? (
                  <p className="text-xs text-gray-500 py-2">Cargando items...</p>
                ) : viewingItems.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">Sin detalle de productos disponible</p>
                ) : (
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Código</th>
                          <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Descripción</th>
                          <th className="px-2 py-1.5 text-right font-semibold text-gray-600">Cant.</th>
                          <th className="px-2 py-1.5 text-right font-semibold text-gray-600">{(viewingFactura.tipo || "").endsWith("B") ? "Precio Unit." : "Precio Unit. s/IVA"}</th>
                          <th className="px-2 py-1.5 text-right font-semibold text-gray-600">{(viewingFactura.tipo || "").endsWith("B") ? "Subtotal" : "Subtotal s/IVA"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewingItems.map((it: any, idx: number) => {
                          const code = it.products?.code || it.product_code || "-"
                          const name = it.products?.name || it.product_name || "-"
                          const qty = Number(it.quantity) || 0
                          const price = Number(it.unit_price) || 0  // unit_price viene con IVA
                          const esB = (viewingFactura.tipo || "").endsWith("B")
                          // Para B mostramos precio final con IVA (el que ve el consumidor).
                          // Para A mostramos neto (price / 1.21, asumiendo alic 21%).
                          const precioMostrar = esB ? price : Math.round((price / 1.21) * 100) / 100
                          const subtotalMostrar = Math.round((qty * precioMostrar) * 100) / 100
                          return (
                            <tr key={it.id || idx} className="border-t">
                              <td className="px-2 py-1 font-mono text-gray-600">{code}</td>
                              <td className="px-2 py-1 text-gray-800">{name}</td>
                              <td className="px-2 py-1 text-right text-gray-700">{qty}</td>
                              <td className="px-2 py-1 text-right text-gray-700">{formatMoney(precioMostrar)}</td>
                              <td className="px-2 py-1 text-right font-medium text-gray-900">{formatMoney(subtotalMostrar)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Importes — formato fiscal según letra */}
              {(viewingFactura.tipo || "").endsWith("B") ? (
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium">{formatMoney(Number(viewingFactura.total) || 0)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold border-t pt-2">
                    <span>Importe Total</span>
                    <span className="text-primary">{formatMoney(Number(viewingFactura.total) || 0)}</span>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-2">
                    <p className="text-xs font-semibold text-gray-700 mb-1">
                      Régimen de Transparencia Fiscal al Consumidor (Ley 27.743)
                    </p>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">IVA Contenido</span>
                      <span className="font-medium">{formatMoney(Number(viewingFactura.iva_21) || 0)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600">Otros Impuestos Nacionales Indirectos</span>
                      <span className="font-medium">$0,00</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Subtotal neto</span>
                    <span className="font-medium">{formatMoney(Number(viewingFactura.base_gravada) || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">IVA 21%</span>
                    <span className="font-medium">{formatMoney(Number(viewingFactura.iva_21) || 0)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold border-t pt-2">
                    <span>Total</span>
                    <span className="text-primary">{formatMoney(Number(viewingFactura.total) || 0)}</span>
                  </div>
                </div>
              )}

              {/* CAE */}
              {viewingFactura.cae && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <p className="text-xs text-green-600 font-medium">CAE</p>
                  <p className="font-mono font-semibold text-green-800">{viewingFactura.cae}</p>
                </div>
              )}

              {/* Factura origen (cuando esta es NC/ND) — inverso de "asociadas" */}
              {facturaOrigen && (
                <div className="border-t pt-3">
                  <p className="text-xs text-gray-500 font-medium mb-2">
                    Factura asociada (origen)
                  </p>
                  <div className="border rounded-lg p-3 bg-amber-50 border-amber-200 flex items-center justify-between">
                    <div className="text-sm">
                      <p className="font-semibold text-gray-900">{facturaOrigen.tipo || "Factura"}</p>
                      <p className="font-mono text-gray-700">
                        {facturaOrigen.comprobante_nro || facturaOrigen.numero || "-"}
                        {facturaOrigen.fecha && (
                          <span className="text-gray-500 ml-2">{formatDateStr(facturaOrigen.fecha)}</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Total</p>
                      <p className="font-bold text-gray-900">{formatMoney(Number(facturaOrigen.total) || 0)}</p>
                      <button
                        onClick={() => setViewingFactura(facturaOrigen)}
                        className="text-xs text-blue-600 hover:underline mt-1"
                      >
                        Ver detalle →
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Notas de Crédito / Débito asociadas */}
              {asociadas.length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-xs text-gray-500 font-medium mb-2">
                    Notas de Crédito / Débito asociadas
                  </p>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Tipo</th>
                          <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Número</th>
                          <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Fecha</th>
                          <th className="px-2 py-1.5 text-right font-semibold text-gray-600">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {asociadas.map((a) => (
                          <tr key={a.id} className="border-t">
                            <td className="px-2 py-1 text-gray-800">{a.tipo || "-"}</td>
                            <td className="px-2 py-1 font-mono text-gray-700">{a.numero || "-"}</td>
                            <td className="px-2 py-1 text-gray-600">
                              {a.fecha ? formatDateStr(a.fecha) : "-"}
                            </td>
                            <td className="px-2 py-1 text-right font-medium text-gray-900">
                              {formatMoney(Number(a.total) || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-4">
              {viewingFactura.pdf_url && (
                <a
                  href={viewingFactura.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  📄 Descargar PDF
                </a>
              )}
              <button
                onClick={() => {
                  const w = window.open("", "_blank")
                  if (w) {
                    w.document.write(`<html><head><title>Factura ${viewingFactura.numero}</title></head><body style="font-family:sans-serif;max-width:700px;margin:40px auto;">
                      <h2>${viewingFactura.tipo || "Factura"} ${viewingFactura.comprobante_nro || viewingFactura.numero || ""}</h2>
                      <p><strong>Cliente:</strong> ${viewingFactura.razon_social || "-"}</p>
                      <p><strong>CUIT:</strong> ${viewingFactura.cuit_cliente || "-"}</p>
                      <p><strong>Fecha:</strong> ${viewingFactura.fecha || "-"}</p>
                      <hr/>
                      <p><strong>Base Gravada:</strong> $${Number(viewingFactura.base_gravada || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                      <p><strong>IVA 21%:</strong> $${Number(viewingFactura.iva_21 || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                      <p><strong>Total:</strong> $${Number(viewingFactura.total || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                      ${viewingFactura.cae ? `<hr/><p><strong>CAE:</strong> ${viewingFactura.cae}</p>` : ""}
                      <script>window.print()<\/script>
                    </body></html>`)
                  }
                }}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2"
              >
                <Printer className="h-4 w-4" /> Imprimir
              </button>
              <button onClick={() => setViewingFactura(null)} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/90">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
