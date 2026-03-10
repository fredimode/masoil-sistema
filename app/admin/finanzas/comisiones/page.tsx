"use client"

import { useState, useEffect } from "react"
import { formatMoney, formatDateStr } from "@/lib/utils"
import * as XLSX from "xlsx"

// TODO: definir porcentaje de comision con Masoil
// Por ahora se usa un placeholder del 5% sobre el margen del pedido
const COMISION_PCT_DEFAULT = 5

interface ComisionFila {
  vendedorId: string
  vendedorName: string
  montoVenta: number
  comisionAPagar: number
  pagado: number
  saldo: number
}

interface ComisionPago {
  id: number
  vendedor_id: string
  vendedor_name: string
  mes: string
  monto: number
  fecha_pago: string
  notas: string | null
}

export default function ComisionesPage() {
  const [loading, setLoading] = useState(true)
  const [filas, setFilas] = useState<ComisionFila[]>([])
  const [pagos, setPagos] = useState<ComisionPago[]>([])
  const [mesSeleccionado, setMesSeleccionado] = useState(() => {
    const ahora = new Date()
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`
  })

  // Modal pago
  const [modalPago, setModalPago] = useState<{ vendedorId: string; vendedorName: string } | null>(null)
  const [montoPago, setMontoPago] = useState("")
  const [notasPago, setNotasPago] = useState("")
  const [guardandoPago, setGuardandoPago] = useState(false)

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  useEffect(() => {
    cargarTodo()
  }, [mesSeleccionado])

  async function cargarTodo() {
    setLoading(true)
    try {
      // TODO: Implementar API que calcule comisiones por vendedor
      // basado en pedidos ENTREGADOS del mes.
      // Por ahora se muestra la estructura con datos de pagos reales.

      const pagosData = await cargarPagos()

      // Placeholder: en el futuro, cargar vendedores y sus pedidos entregados
      // y calcular comision = montoVenta * COMISION_PCT_DEFAULT / 100

      // Agrupar pagos por vendedor
      const pagosMap: Record<string, { pagado: number; name: string }> = {}
      for (const p of pagosData) {
        if (!pagosMap[p.vendedor_id]) {
          pagosMap[p.vendedor_id] = { pagado: 0, name: p.vendedor_name || p.vendedor_id }
        }
        pagosMap[p.vendedor_id].pagado += p.monto
      }

      // TODO: reemplazar con datos reales de pedidos entregados
      // Por ahora solo se muestran vendedores que tienen pagos registrados
      const todasFilas: ComisionFila[] = Object.entries(pagosMap).map(([vendedorId, data]) => ({
        vendedorId,
        vendedorName: data.name,
        montoVenta: 0, // TODO: calcular desde pedidos entregados
        comisionAPagar: 0, // TODO: montoVenta * COMISION_PCT_DEFAULT / 100
        pagado: data.pagado,
        saldo: -data.pagado, // negativo = a favor del vendedor
      }))

      setFilas(todasFilas)
      setPagos(pagosData)
    } catch (error) {
      console.error("Error cargando comisiones:", error)
    } finally {
      setLoading(false)
    }
  }

  async function cargarPagos(): Promise<ComisionPago[]> {
    const res = await fetch(`/api/admin/comisiones-pagos?mes=${mesSeleccionado}`)
    const data = await res.json()
    return data.success ? (data.data || []) : []
  }

  async function guardarPago() {
    if (!modalPago || !montoPago) return
    setGuardandoPago(true)
    try {
      const res = await fetch("/api/admin/comisiones-pagos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendedor_id: modalPago.vendedorId,
          mes: mesSeleccionado,
          monto: parseFloat(montoPago),
          notas: notasPago || null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setModalPago(null)
        setMontoPago("")
        setNotasPago("")
        cargarTodo()
      } else {
        alert("Error: " + (data.error || "Error desconocido"))
      }
    } catch (error) {
      console.error("Error guardando pago:", error)
      alert("Error guardando pago")
    } finally {
      setGuardandoPago(false)
    }
  }

  async function eliminarPago(id: number) {
    try {
      const res = await fetch(`/api/admin/comisiones-pagos?id=${id}`, { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        setConfirmDelete(null)
        cargarTodo()
      }
    } catch (error) {
      console.error("Error eliminando pago:", error)
    }
  }

  const opcionesMeses = () => {
    const opciones = []
    const ahora = new Date()
    for (let i = 0; i < 12; i++) {
      const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1)
      const valor = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`
      const label = fecha.toLocaleDateString("es-AR", { month: "long", year: "numeric" })
      opciones.push({ valor, label })
    }
    return opciones
  }

  const totalComisiones = filas.reduce((s, f) => s + f.comisionAPagar, 0)
  const totalPagado = filas.reduce((s, f) => s + f.pagado, 0)
  const totalSaldo = filas.reduce((s, f) => s + f.saldo, 0)

  const descargarExcel = () => {
    const headers = ["Vendedor", "Monto Venta", "Comision", "Pagado", "Saldo"]
    const rows = filas.map((f) => [f.vendedorName, f.montoVenta, f.comisionAPagar, f.pagado, f.saldo])
    rows.push(["TOTAL", "", totalComisiones, totalPagado, totalSaldo])

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    const mesLabel = opcionesMeses().find((m) => m.valor === mesSeleccionado)?.label || mesSeleccionado
    XLSX.utils.book_append_sheet(wb, ws, "Comisiones")
    XLSX.writeFile(wb, `comisiones_${mesLabel.replace(" ", "_")}.xlsx`)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Comisiones</h2>
          <p className="text-gray-500">Comisiones por vendedor sobre pedidos entregados</p>
        </div>
        <button
          onClick={descargarExcel}
          disabled={filas.length === 0 && pagos.length === 0}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 flex items-center gap-2"
        >
          Descargar Excel
        </button>
      </div>

      {/* Aviso placeholder */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-amber-800">
          <strong>Pendiente:</strong> Definir porcentaje de comision con Masoil. Actualmente se usa {COMISION_PCT_DEFAULT}% como
          placeholder. La logica de calculo automatico desde pedidos entregados se implementara cuando se confirmen las reglas.
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Mes:</label>
          <select
            value={mesSeleccionado}
            onChange={(e) => setMesSeleccionado(e.target.value)}
            className="p-2 border rounded-lg focus:ring-2 focus:ring-primary capitalize"
          >
            {opcionesMeses().map((op) => (
              <option key={op.valor} value={op.valor} className="capitalize">
                {op.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Cards resumen */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-lg p-4 border border-amber-200">
          <p className="text-xs text-amber-600 font-semibold uppercase">Comisiones a Pagar</p>
          <p className="text-lg font-bold text-amber-700">{formatMoney(totalComisiones)}</p>
        </div>
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
          <p className="text-xs text-green-600 font-semibold uppercase">Pagado</p>
          <p className="text-lg font-bold text-green-700">{formatMoney(totalPagado)}</p>
        </div>
        <div
          className={`bg-gradient-to-br rounded-lg p-4 border ${totalSaldo > 0 ? "from-red-50 to-red-100 border-red-200" : "from-green-50 to-green-100 border-green-200"}`}
        >
          <p className={`text-xs font-semibold uppercase ${totalSaldo > 0 ? "text-red-600" : "text-green-600"}`}>Saldo Pendiente</p>
          <p className={`text-lg font-bold ${totalSaldo > 0 ? "text-red-700" : "text-green-700"}`}>{formatMoney(Math.abs(totalSaldo))}</p>
        </div>
      </div>

      {/* Tabla resumen */}
      <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="mt-2 text-gray-600">Cargando...</p>
          </div>
        ) : filas.length === 0 && pagos.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No hay comisiones en este periodo</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Vendedor</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Monto Venta</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Comision ({COMISION_PCT_DEFAULT}%)</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Pagado</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, idx) => (
                  <tr key={f.vendedorId} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">{f.vendedorName}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatMoney(f.montoVenta)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded font-bold">{formatMoney(f.comisionAPagar)}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setModalPago({ vendedorId: f.vendedorId, vendedorName: f.vendedorName })}
                        className="group flex items-center gap-1 ml-auto"
                      >
                        <span className="text-green-600 font-medium">{formatMoney(f.pagado)}</span>
                        <span className="text-gray-400 group-hover:text-primary text-xs">+</span>
                      </button>
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${f.saldo > 0 ? "text-red-600" : "text-green-600"}`}>
                      {formatMoney(Math.abs(f.saldo))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historial de pagos */}
      {pagos.length > 0 && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <h3 className="font-bold text-gray-900">Comprobantes de Pago del Mes</h3>
            <p className="text-xs text-gray-500">{pagos.length} pagos registrados</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Vendedor</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Monto</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Notas</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">Accion</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p, idx) => (
                  <tr key={p.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-3 text-gray-600">{formatDateStr(p.fecha_pago)}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                        {p.vendedor_name || p.vendedor_id}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-600">{formatMoney(p.monto)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.notas || "-"}</td>
                    <td className="px-4 py-3 text-center">
                      {confirmDelete === p.id ? (
                        <div className="flex items-center gap-1 justify-center">
                          <button onClick={() => eliminarPago(p.id)} className="px-2 py-1 bg-red-600 text-white rounded text-xs">
                            Confirmar
                          </button>
                          <button onClick={() => setConfirmDelete(null)} className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs">
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(p.id)} className="text-red-500 hover:text-red-700 text-xs">
                          Eliminar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal registrar pago */}
      {modalPago && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setModalPago(null)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900">Registrar Pago de Comision</h3>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">Vendedor</label>
                    <input value={modalPago.vendedorName} disabled className="w-full p-2 border rounded-lg bg-gray-100 text-gray-600" />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">Mes</label>
                    <input value={mesSeleccionado} disabled className="w-full p-2 border rounded-lg bg-gray-100 text-gray-600" />
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-600 block mb-1">Monto a pagar *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={montoPago}
                    onChange={(e) => setMontoPago(e.target.value)}
                    placeholder="0.00"
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 block mb-1">Notas (opcional)</label>
                  <input
                    value={notasPago}
                    onChange={(e) => setNotasPago(e.target.value)}
                    placeholder="Transferencia, efectivo, etc."
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button onClick={() => setModalPago(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                  Cancelar
                </button>
                <button
                  onClick={guardarPago}
                  disabled={!montoPago || guardandoPago}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400"
                >
                  {guardandoPago ? "Guardando..." : "Registrar Pago"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
