"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"

interface LogEntry {
  id: string
  factura_id: number | null
  paso: string
  estado: string
  detalle: Record<string, unknown> | null
  error: string | null
  created_at: string
  // Joined
  razon_social?: string
  tipo?: string
}

function getClienteFromDetalle(detalle: Record<string, unknown> | null): string {
  if (!detalle) return ""
  const cliente = detalle.cliente as Record<string, unknown> | undefined
  return (cliente?.razonSocial as string) || ""
}

export default function FacturacionLogsPage() {
  const supabase = createClient()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState<string>("")
  const [filtroFecha, setFiltroFecha] = useState<string>("")
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)

  useEffect(() => {
    cargarLogs()
  }, [filtroEstado, filtroFecha])

  async function cargarLogs() {
    setLoading(true)
    try {
      let query = supabase
        .from("facturacion_logs")
        .select("*, facturas(razon_social, tipo)")
        .order("created_at", { ascending: false })
        .limit(200)

      if (filtroEstado) {
        query = query.eq("estado", filtroEstado)
      }

      if (filtroFecha) {
        query = query.gte("created_at", `${filtroFecha}T00:00:00`)
          .lte("created_at", `${filtroFecha}T23:59:59`)
      }

      const { data, error } = await query

      if (error) throw error

      const mapped = (data || []).map((row: Record<string, unknown>) => {
        const facturas = row.facturas as Record<string, unknown> | null
        return {
          id: row.id as string,
          factura_id: row.factura_id as number | null,
          paso: row.paso as string,
          estado: row.estado as string,
          detalle: row.detalle as Record<string, unknown> | null,
          error: row.error as string | null,
          created_at: row.created_at as string,
          razon_social: facturas?.razon_social as string | undefined,
          tipo: facturas?.tipo as string | undefined,
        }
      })

      setLogs(mapped)
    } catch (error) {
      console.error("Error cargando logs:", error)
    } finally {
      setLoading(false)
    }
  }

  function formatFecha(dateStr: string) {
    const d = new Date(dateStr)
    return d.toLocaleString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  function estadoBadge(estado: string) {
    switch (estado) {
      case "ok":
        return <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">OK</span>
      case "error":
        return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">Error</span>
      case "pendiente":
        return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">Pendiente</span>
      default:
        return <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">{estado}</span>
    }
  }

  function pasoLabel(paso: string) {
    switch (paso) {
      case "preparando_datos": return "Preparando datos"
      case "enviando_tusfacturas": return "Enviando a TusFacturas"
      case "procesando_respuesta": return "Procesando respuesta"
      default: return paso
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/admin/facturacion" className="text-gray-400 hover:text-gray-600">
              ← Facturación
            </Link>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Logs de Facturación</h2>
          <p className="text-gray-500">Registro detallado de cada operación con TusFacturas</p>
        </div>
        <button
          onClick={cargarLogs}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
        >
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
          >
            <option value="">Todos los estados</option>
            <option value="ok">OK</option>
            <option value="error">Error</option>
            <option value="pendiente">Pendiente</option>
          </select>
          <input
            type="date"
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
            className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
          />
          {(filtroEstado || filtroFecha) && (
            <button
              onClick={() => {
                setFiltroEstado("")
                setFiltroFecha("")
              }}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Limpiar filtros
            </button>
          )}
          <span className="ml-auto text-xs text-gray-500">
            {logs.length} registro{logs.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="mt-2 text-gray-600">Cargando logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No hay logs de facturación</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Tipo</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Paso</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">Estado</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Error</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => (
                  <tr
                    key={log.id}
                    className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50"} hover:bg-blue-50 cursor-pointer transition-colors`}
                    onClick={() => setSelectedLog(log)}
                  >
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">
                      {formatFecha(log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block truncate max-w-[160px] text-gray-900">
                        {log.razon_social || getClienteFromDetalle(log.detalle) || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{log.tipo || "-"}</td>
                    <td className="px-4 py-3 text-gray-700 font-medium">{pasoLabel(log.paso)}</td>
                    <td className="px-4 py-3 text-center">{estadoBadge(log.estado)}</td>
                    <td className="px-4 py-3">
                      <span className="block truncate max-w-[200px] text-red-600 text-xs">
                        {log.error || "-"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedLog(log)
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Ver JSON
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog detalle */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">Detalle del Log</h3>
                <p className="text-xs text-gray-500">
                  {formatFecha(selectedLog.created_at)} — {pasoLabel(selectedLog.paso)} — {estadoBadge(selectedLog.estado)}
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {selectedLog.error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <h4 className="font-semibold text-red-800 text-sm mb-1">Error</h4>
                  <p className="text-red-700 text-sm">{selectedLog.error}</p>
                </div>
              )}

              {selectedLog.factura_id && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <span className="text-sm text-blue-800">Factura ID: <strong>{selectedLog.factura_id}</strong></span>
                </div>
              )}

              <div>
                <h4 className="font-semibold text-gray-700 text-sm mb-2">Detalle completo (JSON)</h4>
                <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-x-auto max-h-96 font-mono">
                  {JSON.stringify(selectedLog.detalle, null, 2)}
                </pre>
              </div>
            </div>

            <div className="px-6 py-3 border-t flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
