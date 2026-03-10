"use client"

import { useState, useEffect } from "react"
import { formatMoney, formatDateStr } from "@/lib/utils"
import Link from "next/link"

interface Factura {
  id: number
  order_id: string
  numero: string | null
  tipo: string
  fecha: string
  cuit_cliente: string | null
  razon_social: string
  base_gravada: number
  iva_21: number
  total: number
  cae: string | null
  vencimiento_cae: string | null
  pdf_url: string | null
  created_at: string
}

export default function FacturacionPage() {
  const [loading, setLoading] = useState(true)
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [mesSeleccionado, setMesSeleccionado] = useState(() => {
    const ahora = new Date()
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`
  })

  useEffect(() => {
    cargarFacturas()
  }, [mesSeleccionado])

  async function cargarFacturas() {
    setLoading(true)
    try {
      const res = await fetch(`/api/facturacion?mes=${mesSeleccionado}`)
      const data = await res.json()
      if (data.success) setFacturas(data.data || [])
    } catch (error) {
      console.error("Error cargando facturas:", error)
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

  const totalFacturado = facturas.reduce((s, f) => s + f.total, 0)

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

      {/* Card total */}
      <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-6 border border-indigo-200 mb-6">
        <p className="text-sm text-indigo-600 font-semibold uppercase">Total Facturado</p>
        <p className="text-3xl font-bold text-indigo-700">{formatMoney(totalFacturado)}</p>
        <p className="text-sm text-indigo-500 mt-1">{facturas.length} facturas emitidas</p>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="mt-2 text-gray-600">Cargando...</p>
          </div>
        ) : facturas.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No hay facturas en este periodo</p>
            <Link href="/admin/facturacion/nueva" className="text-primary hover:underline text-sm mt-2 inline-block">
              Generar primera factura
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Numero</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Pedido</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Base Gravada</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">IVA 21%</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Total</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">CAE</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map((f, idx) => (
                  <tr key={f.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-3 font-medium text-gray-900">{f.numero || "Pendiente"}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDateStr(f.fecha)}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-gray-900 font-medium">{f.razon_social}</p>
                        {f.cuit_cliente && <p className="text-xs text-gray-500">CUIT: {f.cuit_cliente}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <a href={`/admin/pedidos/${f.order_id}`} className="text-blue-600 hover:underline">
                        #{f.order_id}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatMoney(f.base_gravada)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{formatMoney(f.iva_21)}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{formatMoney(f.total)}</td>
                    <td className="px-4 py-3 text-center">
                      {f.cae ? (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">OK</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">Pendiente</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-indigo-100 font-bold">
                  <td colSpan={4} className="px-4 py-3 text-gray-900">
                    TOTAL ({facturas.length})
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatMoney(facturas.reduce((s, f) => s + f.base_gravada, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {formatMoney(facturas.reduce((s, f) => s + f.iva_21, 0))}
                  </td>
                  <td className="px-4 py-3 text-right text-indigo-700">{formatMoney(totalFacturado)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
