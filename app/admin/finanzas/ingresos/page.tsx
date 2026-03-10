"use client"

import { useState, useEffect } from "react"
import { formatMoney, formatDateStr } from "@/lib/utils"
import * as XLSX from "xlsx"

interface PagoIngreso {
  id: number
  orderId: string | null
  fecha: string
  monto: number
  medioPago: string
  referencia: string | null
  notas: string | null
  cliente: string
}

interface IngresosPorMetodo {
  metodo: string
  label: string
  cantidad: number
  total: number
  pagos: PagoIngreso[]
}

const MEDIOS_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  cheque: "Cheque",
  cuenta_corriente_30: "Cuenta Corriente 30 dias",
  cuenta_corriente_60: "Cuenta Corriente 60 dias",
  cuenta_corriente_90: "Cuenta Corriente 90 dias",
}

const getMetodoLabel = (metodo: string): string => {
  return MEDIOS_PAGO[metodo] || metodo
}

const getMetodoColor = (metodo: string): string => {
  if (metodo.includes("efectivo")) return "bg-green-100 text-green-700"
  if (metodo.includes("transferencia")) return "bg-blue-100 text-blue-700"
  if (metodo.includes("cheque")) return "bg-purple-100 text-purple-700"
  if (metodo.includes("cuenta_corriente")) return "bg-amber-100 text-amber-700"
  return "bg-gray-100 text-gray-700"
}

export default function IngresosPage() {
  const [loading, setLoading] = useState(true)
  const [ingresosPorMetodo, setIngresosPorMetodo] = useState<IngresosPorMetodo[]>([])
  const [todosPagos, setTodosPagos] = useState<PagoIngreso[]>([])
  const [metodoExpandido, setMetodoExpandido] = useState<string | null>(null)
  const [mesSeleccionado, setMesSeleccionado] = useState(() => {
    const ahora = new Date()
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`
  })

  useEffect(() => {
    cargarIngresos()
  }, [mesSeleccionado])

  async function cargarIngresos() {
    setLoading(true)
    try {
      const [anio, mes] = mesSeleccionado.split("-").map(Number)
      const primerDia = `${anio}-${String(mes).padStart(2, "0")}-01`
      const ultimoDia = new Date(anio, mes, 0).getDate()
      const ultimaFecha = `${anio}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`

      const params = new URLSearchParams({
        fechaDesde: primerDia,
        fechaHasta: ultimaFecha,
      })

      const res = await fetch(`/api/admin/ingresos?${params.toString()}`)
      const data = await res.json()

      if (!data.success) {
        throw new Error(data.error || "Error cargando ingresos")
      }

      const allPagos: PagoIngreso[] = (data.data || []).map((p: Record<string, unknown>) => ({
        id: p.id as number,
        orderId: p.orderId as string | null,
        fecha: p.fecha as string,
        monto: p.monto as number,
        medioPago: p.medioPago as string,
        referencia: p.referencia as string | null,
        notas: p.notas as string | null,
        cliente: p.cliente as string,
      }))

      // Agrupar por medio de pago
      const agrupados: Record<string, IngresosPorMetodo> = {}
      allPagos.forEach((p) => {
        if (!agrupados[p.medioPago]) {
          agrupados[p.medioPago] = {
            metodo: p.medioPago,
            label: getMetodoLabel(p.medioPago),
            cantidad: 0,
            total: 0,
            pagos: [],
          }
        }
        agrupados[p.medioPago].cantidad++
        agrupados[p.medioPago].total += p.monto
        agrupados[p.medioPago].pagos.push(p)
      })

      const ordenados = Object.values(agrupados).sort((a, b) => b.total - a.total)

      setIngresosPorMetodo(ordenados)
      setTodosPagos(allPagos.sort((a, b) => b.fecha.localeCompare(a.fecha)))
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setLoading(false)
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

  const totalIngresos = ingresosPorMetodo.reduce((sum, g) => sum + g.total, 0)
  const cantidadPagos = ingresosPorMetodo.reduce((sum, g) => sum + g.cantidad, 0)

  const descargarExcel = () => {
    const headers = ["Fecha", "Pedido", "Cliente", "Monto", "Medio de Pago", "Referencia", "Notas"]
    const rows: unknown[][] = todosPagos.map((p) => [
      p.fecha,
      p.orderId || "",
      p.cliente,
      p.monto,
      getMetodoLabel(p.medioPago),
      p.referencia || "",
      p.notas || "",
    ])

    rows.push(Array(7).fill(""))
    rows.push(["RESUMEN POR MEDIO DE PAGO", "", "", "", "", "", ""])
    ingresosPorMetodo.forEach((g) => {
      rows.push([g.label, "", "", g.total, `${g.cantidad} pagos`, "", ""])
    })
    rows.push(["TOTAL", "", "", totalIngresos, `${cantidadPagos} pagos`, "", ""])

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    const mesLabel = opcionesMeses().find((m) => m.valor === mesSeleccionado)?.label || mesSeleccionado
    XLSX.utils.book_append_sheet(wb, ws, "Ingresos")
    XLSX.writeFile(wb, `ingresos_${mesLabel.replace(" ", "_")}.xlsx`)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Ingresos del Mes</h2>
          <p className="text-gray-500">Cobros recibidos agrupados por medio de pago</p>
        </div>
        <button
          onClick={descargarExcel}
          disabled={todosPagos.length === 0}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 flex items-center gap-2"
        >
          Descargar Excel
        </button>
      </div>

      {/* Filtro de mes */}
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

      {/* Total general */}
      <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-blue-600 font-semibold uppercase">Total Ingresos del Mes</p>
            <p className="text-3xl font-bold text-blue-700">{formatMoney(totalIngresos)}</p>
            <p className="text-sm text-blue-500 mt-1">{cantidadPagos} cobros recibidos</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2 text-gray-600">Cargando cobros...</p>
        </div>
      ) : ingresosPorMetodo.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">No hay ingresos en este periodo</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ingresosPorMetodo.map((grupo) => (
            <div key={grupo.metodo} className="bg-white rounded-lg shadow overflow-hidden">
              <button
                onClick={() => setMetodoExpandido(metodoExpandido === grupo.metodo ? null : grupo.metodo)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-lg font-medium ${getMetodoColor(grupo.metodo)}`}>{grupo.label}</span>
                  <span className="text-sm text-gray-500">{grupo.cantidad} cobros</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xl font-bold text-gray-900">{formatMoney(grupo.total)}</span>
                  <span className="text-gray-400">{metodoExpandido === grupo.metodo ? "\u25B2" : "\u25BC"}</span>
                </div>
              </button>

              {metodoExpandido === grupo.metodo && (
                <div className="border-t">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Fecha</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Pedido</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Cliente</th>
                        <th className="px-4 py-2 text-right font-medium text-gray-600">Monto</th>
                        <th className="px-4 py-2 text-left font-medium text-gray-600">Referencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.pagos.map((p) => (
                        <tr key={p.id} className="border-t hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-600">{formatDateStr(p.fecha)}</td>
                          <td className="px-4 py-2">
                            {p.orderId ? (
                              <a href={`/admin/pedidos/${p.orderId}`} className="text-blue-600 hover:underline">
                                #{p.orderId}
                              </a>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-gray-900">{p.cliente}</td>
                          <td className="px-4 py-2 text-right font-medium text-green-600">{formatMoney(p.monto)}</td>
                          <td className="px-4 py-2 text-gray-500 text-xs">{p.referencia || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
