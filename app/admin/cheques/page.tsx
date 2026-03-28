"use client"

import { useState, useEffect, useMemo } from "react"
import * as XLSX from "xlsx"
import { formatCurrency, formatDateStr, normalizeSearch } from "@/lib/utils"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import { fetchChequesEmitidos, updateChequeEmitido } from "@/lib/supabase/queries"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Eye } from "lucide-react"

const ESTADOS = ["emitido", "depositado", "rechazado"] as const
const TIPOS = ["cheque", "echeq"] as const

function estadoBadge(estado: string) {
  const lower = (estado || "").toLowerCase()
  if (lower === "emitido") return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Emitido</Badge>
  if (lower === "depositado") return <Badge className="bg-green-100 text-green-800 border-green-200">Depositado</Badge>
  if (lower === "rechazado") return <Badge className="bg-red-100 text-red-800 border-red-200">Rechazado</Badge>
  return <Badge variant="outline">{estado || "-"}</Badge>
}

function tipoBadge(tipo: string) {
  const lower = (tipo || "").toLowerCase()
  if (lower === "cheque") return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Cheque</Badge>
  if (lower === "echeq") return <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Echeq</Badge>
  return <Badge variant="outline">{tipo || "-"}</Badge>
}

export default function ChequesPage() {
  const [loading, setLoading] = useState(true)
  const [cheques, setCheques] = useState<any[]>([])

  // Pagination
  const [page, setPage] = useState(1)

  // Filters
  const [busqueda, setBusqueda] = useState("")
  const [filtroEstado, setFiltroEstado] = useState("")
  const [filtroTipo, setFiltroTipo] = useState("")
  const [fechaPagoDesde, setFechaPagoDesde] = useState("")
  const [fechaPagoHasta, setFechaPagoHasta] = useState("")

  // Detail dialog
  const [viewing, setViewing] = useState<any | null>(null)

  // Updaing estado inline
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  async function cargarDatos() {
    setLoading(true)
    try {
      const data = await fetchChequesEmitidos()
      setCheques(data)
    } catch (error) {
      console.error("Error cargando cheques:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarDatos()
  }, [])

  async function handleChangeEstado(id: string, nuevoEstado: string) {
    setUpdatingId(id)
    try {
      await updateChequeEmitido(id, { estado: nuevoEstado })
      setCheques((prev) => prev.map((c) => (c.id === id ? { ...c, estado: nuevoEstado } : c)))
    } catch (error) {
      console.error("Error actualizando estado:", error)
    } finally {
      setUpdatingId(null)
    }
  }

  // Filtered cheques
  const chequesFiltrados = useMemo(() => {
    return cheques.filter((c) => {
      const matchBusqueda =
        !busqueda ||
        normalizeSearch(c.numero || "").includes(normalizeSearch(busqueda)) ||
        normalizeSearch(c.banco || "").includes(normalizeSearch(busqueda))
      const matchEstado = !filtroEstado || (c.estado || "").toLowerCase() === filtroEstado
      const matchTipo = !filtroTipo || (c.tipo || "").toLowerCase() === filtroTipo
      const matchFechaDesde = !fechaPagoDesde || (c.fecha_pago && c.fecha_pago >= fechaPagoDesde)
      const matchFechaHasta = !fechaPagoHasta || (c.fecha_pago && c.fecha_pago <= fechaPagoHasta)
      return matchBusqueda && matchEstado && matchTipo && matchFechaDesde && matchFechaHasta
    })
  }, [cheques, busqueda, filtroEstado, filtroTipo, fechaPagoDesde, fechaPagoHasta])

  // Pagination
  const { totalPages, totalItems, pageSize, getPage } = usePagination(chequesFiltrados, 50)
  const currentPage = Math.min(page, totalPages)
  const paginatedCheques = getPage(currentPage)

  // Stats
  const totalCheques = cheques.length
  const cantEmitidos = cheques.filter((c) => (c.estado || "").toLowerCase() === "emitido").length
  const cantDepositados = cheques.filter((c) => (c.estado || "").toLowerCase() === "depositado").length
  const cantRechazados = cheques.filter((c) => (c.estado || "").toLowerCase() === "rechazado").length

  function exportarXLSX() {
    const data = chequesFiltrados.map((c) => ({
      "Numero": c.numero || "",
      "Banco": c.banco || "",
      "Pago ID": c.pago_id || "",
      "Importe": Number(c.importe) || 0,
      "Fecha Emision": formatDateStr(c.fecha_emision),
      "Fecha Pago": formatDateStr(c.fecha_pago),
      "Tipo": c.tipo || "",
      "Estado": c.estado || "",
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Cheques")
    XLSX.writeFile(wb, "cheques_emitidos.xlsx")
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2 text-gray-600">Cargando cheques...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Cheques y Echeqs Emitidos</h2>
          <p className="text-gray-500">Gestion y seguimiento de cheques emitidos</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-4 border border-indigo-200">
          <p className="text-sm text-indigo-600 font-semibold">Total</p>
          <p className="text-2xl font-bold text-indigo-700">{totalCheques}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <p className="text-sm text-amber-600 font-semibold">Emitidos</p>
          <p className="text-2xl font-bold text-amber-700">{cantEmitidos}</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
          <p className="text-sm text-green-600 font-semibold">Depositados</p>
          <p className="text-2xl font-bold text-green-700">{cantDepositados}</p>
        </div>
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border border-red-200">
          <p className="text-sm text-red-600 font-semibold">Rechazados</p>
          <p className="text-2xl font-bold text-red-700">{cantRechazados}</p>
        </div>
      </div>

      {/* Filtros + acciones */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Buscar por numero o banco..."
            value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setPage(1) }}
            className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm flex-1 min-w-[200px]"
          />
          <select value={filtroEstado} onChange={(e) => { setFiltroEstado(e.target.value); setPage(1) }} className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm">
            <option value="">Estado: Todos</option>
            {ESTADOS.map((e) => (
              <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
            ))}
          </select>
          <select value={filtroTipo} onChange={(e) => { setFiltroTipo(e.target.value); setPage(1) }} className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm">
            <option value="">Tipo: Todos</option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>{t === "echeq" ? "Echeq" : "Cheque"}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 text-sm text-gray-600">
            <span>Fecha pago:</span>
            <input
              type="date"
              value={fechaPagoDesde}
              onChange={(e) => { setFechaPagoDesde(e.target.value); setPage(1) }}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            />
            <span>-</span>
            <input
              type="date"
              value={fechaPagoHasta}
              onChange={(e) => { setFechaPagoHasta(e.target.value); setPage(1) }}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
          <button onClick={exportarXLSX} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">Exportar XLSX</button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {chequesFiltrados.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No se encontraron cheques</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[110px]">Numero</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[120px]">Banco</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[100px]">Pago ID</th>
                  <th className="px-3 py-3 text-right font-semibold text-gray-700 w-[110px]">Importe</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[100px]">Fecha Emision</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[100px]">Fecha Pago</th>
                  <th className="px-3 py-3 text-center font-semibold text-gray-700 w-[80px]">Tipo</th>
                  <th className="px-3 py-3 text-center font-semibold text-gray-700 w-[110px]">Estado</th>
                  <th className="px-3 py-3 text-center font-semibold text-gray-700 w-[80px]">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCheques.map((c: any, idx: number) => (
                  <tr key={c.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-3 py-3 font-medium text-gray-900 truncate" title={c.numero || ""}>{c.numero || "-"}</td>
                    <td className="px-3 py-3 text-gray-600 truncate" title={c.banco || ""}>{c.banco || "-"}</td>
                    <td className="px-3 py-3 text-gray-600 truncate" title={c.pago_id || ""}>{c.pago_id ? c.pago_id.slice(0, 8) + "..." : "-"}</td>
                    <td className="px-3 py-3 text-right font-bold text-gray-900">{formatCurrency(Number(c.importe) || 0)}</td>
                    <td className="px-3 py-3 text-gray-600">{formatDateStr(c.fecha_emision)}</td>
                    <td className="px-3 py-3 text-gray-600">{formatDateStr(c.fecha_pago)}</td>
                    <td className="px-3 py-3 text-center">{tipoBadge(c.tipo)}</td>
                    <td className="px-3 py-3 text-center">
                      <select
                        value={(c.estado || "").toLowerCase()}
                        onChange={(e) => handleChangeEstado(c.id, e.target.value)}
                        disabled={updatingId === c.id}
                        className={`text-xs px-2 py-1 border rounded-lg focus:ring-2 focus:ring-primary ${
                          updatingId === c.id ? "opacity-50 cursor-not-allowed" : ""
                        }`}
                      >
                        {ESTADOS.map((e) => (
                          <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => setViewing(c)}
                        className="p-1.5 hover:bg-gray-200 rounded"
                        title="Ver detalle"
                      >
                        <Eye className="h-4 w-4 text-blue-600" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setPage}
        />
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!viewing} onOpenChange={(open) => { if (!open) setViewing(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalle del Cheque</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-gray-500 font-medium">Numero</p>
                  <p className="text-gray-900">{viewing.numero || "-"}</p>
                </div>
                <div>
                  <p className="text-gray-500 font-medium">Banco</p>
                  <p className="text-gray-900">{viewing.banco || "-"}</p>
                </div>
                <div>
                  <p className="text-gray-500 font-medium">Tipo</p>
                  <div>{tipoBadge(viewing.tipo)}</div>
                </div>
                <div>
                  <p className="text-gray-500 font-medium">Estado</p>
                  <div>{estadoBadge(viewing.estado)}</div>
                </div>
                <div>
                  <p className="text-gray-500 font-medium">Importe</p>
                  <p className="text-gray-900 font-bold">{formatCurrency(Number(viewing.importe) || 0)}</p>
                </div>
                <div>
                  <p className="text-gray-500 font-medium">Pago ID</p>
                  <p className="text-gray-900 text-xs break-all">{viewing.pago_id || "-"}</p>
                </div>
                <div>
                  <p className="text-gray-500 font-medium">Fecha Emision</p>
                  <p className="text-gray-900">{formatDateStr(viewing.fecha_emision)}</p>
                </div>
                <div>
                  <p className="text-gray-500 font-medium">Fecha Pago</p>
                  <p className="text-gray-900">{formatDateStr(viewing.fecha_pago)}</p>
                </div>
              </div>
              {viewing.observaciones && (
                <div>
                  <p className="text-gray-500 font-medium">Observaciones</p>
                  <p className="text-gray-900">{viewing.observaciones}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
