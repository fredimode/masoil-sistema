"use client"

import { useState, useEffect, useMemo } from "react"
import { formatMoney, formatDateStr } from "@/lib/utils"
import * as XLSX from "xlsx"
import { fetchMovimientosCajaChica, createMovimientoCajaChica } from "@/lib/supabase/queries"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"

interface MovimientoCajaChica {
  id: string
  fecha: string | null
  tipo: string | null
  concepto: string | null
  valor: number
  saldo: number | null
  periodo: string | null
}

export default function CajaChicaPage() {
  const [movimientos, setMovimientos] = useState<MovimientoCajaChica[]>([])
  const [loading, setLoading] = useState(true)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    tipo: "REP",
    concepto: "",
    valor: "",
    periodo: String(new Date().getFullYear()),
  })
  const [filtroTipo, setFiltroTipo] = useState("")
  const [filtroPeriodo, setFiltroPeriodo] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => {
    cargar()
  }, [])

  async function cargar() {
    setLoading(true)
    try {
      const data = await fetchMovimientosCajaChica()
      setMovimientos(data || [])
    } catch (err) {
      console.error("Error cargando caja chica:", err)
    } finally {
      setLoading(false)
    }
  }

  const uniqueTipos = useMemo(() => {
    const tipos = new Set<string>()
    movimientos.forEach((m) => { if (m.tipo) tipos.add(m.tipo) })
    return Array.from(tipos).sort()
  }, [movimientos])

  const uniquePeriodos = useMemo(() => {
    const periodos = new Set<string>()
    movimientos.forEach((m) => { if (m.periodo) periodos.add(m.periodo) })
    return Array.from(periodos).sort()
  }, [movimientos])

  const filtrada = useMemo(() => {
    let result = movimientos
    if (filtroTipo) result = result.filter((m) => m.tipo === filtroTipo)
    if (filtroPeriodo) result = result.filter((m) => m.periodo === filtroPeriodo)
    return result
  }, [movimientos, filtroTipo, filtroPeriodo])

  const saldoActual = useMemo(() => {
    const withSaldo = movimientos.filter((m) => m.saldo != null)
    if (withSaldo.length > 0) return withSaldo[withSaldo.length - 1].saldo ?? 0
    return 0
  }, [movimientos])

  const totalIngresos = useMemo(
    () => filtrada.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0),
    [filtrada]
  )
  const totalEgresos = useMemo(
    () => filtrada.filter((m) => m.valor < 0).reduce((s, m) => s + Math.abs(m.valor), 0),
    [filtrada]
  )

  const pagination = usePagination(filtrada, 50)
  const pageData = pagination.getPage(page)

  async function guardar() {
    setGuardando(true)
    try {
      await createMovimientoCajaChica({
        fecha: form.fecha || null,
        tipo: form.tipo,
        concepto: form.concepto || null,
        valor: parseFloat(form.valor) || 0,
        periodo: form.periodo,
      })
      setModalAbierto(false)
      setForm({ fecha: new Date().toISOString().slice(0, 10), tipo: "REP", concepto: "", valor: "", periodo: String(new Date().getFullYear()) })
      cargar()
    } catch (err) {
      console.error(err)
      alert("Error creando movimiento")
    } finally {
      setGuardando(false)
    }
  }

  function descargarExcel() {
    const headers = ["Fecha", "Tipo", "Concepto", "Valor", "Saldo"]
    const rows = filtrada.map((m) => [m.fecha || "", m.tipo || "", m.concepto || "", m.valor, m.saldo ?? ""])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Caja Chica")
    XLSX.writeFile(wb, `caja_chica${filtroPeriodo ? `_${filtroPeriodo}` : ""}.xlsx`)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Caja Chica</h2>
          <p className="text-gray-500">Movimientos de caja chica</p>
        </div>
        <div className="flex gap-2">
          <button onClick={descargarExcel} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
            Descargar Excel
          </button>
          <button onClick={() => setModalAbierto(true)} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
            + Nuevo Movimiento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <p className="text-xs text-blue-600 font-semibold uppercase">Saldo Actual</p>
          <p className="text-2xl font-bold text-blue-700">{formatMoney(saldoActual)}</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
          <p className="text-xs text-green-600 font-semibold uppercase">Total Ingresos</p>
          <p className="text-2xl font-bold text-green-700">{formatMoney(totalIngresos)}</p>
        </div>
        <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-xl p-4 border border-rose-200">
          <p className="text-xs text-rose-600 font-semibold uppercase">Total Egresos</p>
          <p className="text-2xl font-bold text-rose-700">{formatMoney(totalEgresos)}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Tipo:</label>
            <select
              value={filtroTipo}
              onChange={(e) => { setFiltroTipo(e.target.value); setPage(1) }}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary"
            >
              <option value="">Todos</option>
              {uniqueTipos.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Periodo:</label>
            <select
              value={filtroPeriodo}
              onChange={(e) => { setFiltroPeriodo(e.target.value); setPage(1) }}
              className="p-2 border rounded-lg focus:ring-2 focus:ring-primary"
            >
              <option value="">Todos</option>
              {uniquePeriodos.map((p) => (<option key={p} value={p}>{p}</option>))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            <p className="mt-2 text-gray-600">Cargando...</p>
          </div>
        ) : filtrada.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No hay movimientos de caja chica</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Fecha</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Tipo</th>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Concepto</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Valor</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((m, idx) => (
                    <tr key={m.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-4 py-3 text-gray-600">{m.fecha ? formatDateStr(m.fecha) : "-"}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                          {m.tipo || "-"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[250px] truncate" title={m.concepto || ""}>
                        {m.concepto || "-"}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${m.valor > 0 ? "text-green-600" : m.valor < 0 ? "text-red-600" : "text-gray-600"}`}>
                        {formatMoney(m.valor)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {m.saldo != null ? formatMoney(m.saldo) : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              currentPage={page}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              pageSize={pagination.pageSize}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {modalAbierto && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setModalAbierto(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
                <h3 className="text-lg font-bold text-gray-900">Nuevo Movimiento Caja Chica</h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">Fecha</label>
                    <input
                      type="date"
                      value={form.fecha}
                      onChange={(e) => setForm((prev) => ({ ...prev, fecha: e.target.value }))}
                      className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">Tipo *</label>
                    <select
                      value={form.tipo}
                      onChange={(e) => setForm((prev) => ({ ...prev, tipo: e.target.value }))}
                      className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                    >
                      <option value="REP">REP</option>
                      <option value="ADM">ADM</option>
                      <option value="DIST">DIST</option>
                      <option value="VARIOS">VARIOS</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-600 block mb-1">Concepto</label>
                  <input
                    value={form.concepto}
                    onChange={(e) => setForm((prev) => ({ ...prev, concepto: e.target.value }))}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                    placeholder="Descripcion del movimiento..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">Valor *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={form.valor}
                      onChange={(e) => setForm((prev) => ({ ...prev, valor: e.target.value }))}
                      className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                      placeholder="Positivo=ingreso, Negativo=egreso"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">Periodo *</label>
                    <input
                      value={form.periodo}
                      onChange={(e) => setForm((prev) => ({ ...prev, periodo: e.target.value }))}
                      className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                      placeholder="2026"
                    />
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 sticky bottom-0 bg-white">
                <button onClick={() => setModalAbierto(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                  Cancelar
                </button>
                <button
                  onClick={guardar}
                  disabled={guardando || !form.valor}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400"
                >
                  {guardando ? "Guardando..." : "Crear Movimiento"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
