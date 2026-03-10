"use client"

import { useState, useEffect, useMemo } from "react"
import { formatMoney, formatDateStr } from "@/lib/utils"
import * as XLSX from "xlsx"

const CENTROS_DE_COSTO = [
  { id: "logistica", nombre: "Logistica" },
  { id: "combustible", nombre: "Combustible" },
  { id: "sueldos", nombre: "Sueldos" },
  { id: "alquiler", nombre: "Alquiler" },
  { id: "servicios", nombre: "Servicios", subcategorias: ["Internet", "Electricidad", "Telefonia", "Agua", "Gas"] },
  { id: "marketing", nombre: "Marketing" },
  { id: "mantenimiento_vehiculos", nombre: "Mantenimiento vehiculos" },
  { id: "sistemas", nombre: "Sistemas" },
  { id: "gastos_generales", nombre: "Gastos generales" },
] as const

type CentroCostoId = (typeof CENTROS_DE_COSTO)[number]["id"]

interface Egreso {
  id: number
  centro_costo: string
  sub_categoria: string | null
  descripcion: string | null
  monto: number
  fecha: string
  tiene_comprobante: boolean
  estado_pago: string
  fecha_pago: string | null
  forma_pago: string | null
  destino_pago: string | null
  notas: string | null
  cuenta_id: number | null
}

interface CuentaPago {
  id: number
  nombre: string
  banco: string | null
  tipo: string
  saldo: number
}

function getCentroNombre(id: string): string {
  return CENTROS_DE_COSTO.find((c) => c.id === id)?.nombre || id
}

export default function EgresosPage() {
  const [loading, setLoading] = useState(true)
  const [egresos, setEgresos] = useState<Egreso[]>([])
  const [cuentas, setCuentas] = useState<CuentaPago[]>([])

  // Filtros
  const [mesSeleccionado, setMesSeleccionado] = useState(() => {
    const ahora = new Date()
    return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`
  })
  const [filtroCentro, setFiltroCentro] = useState("")
  const [filtroEstado, setFiltroEstado] = useState("")
  const [vistaTab, setVistaTab] = useState<"todos" | "pendientes">("todos")

  // Modal nuevo/editar
  const [modalAbierto, setModalAbierto] = useState(false)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    centro_costo: "" as string,
    sub_categoria: "",
    descripcion: "",
    monto: "",
    fecha: new Date().toISOString().slice(0, 10),
    tiene_comprobante: false,
    notas: "",
  })
  const [guardando, setGuardando] = useState(false)

  // Modal pago
  const [modalPago, setModalPago] = useState<Egreso | null>(null)
  const [pagoData, setPagoData] = useState({
    forma_pago: "Transferencia",
    destino_pago: "",
    fecha_pago: new Date().toISOString().slice(0, 10),
    cuenta_id: "" as string,
  })

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  useEffect(() => {
    cargarDatos()
  }, [mesSeleccionado, filtroCentro, filtroEstado, vistaTab])

  useEffect(() => {
    cargarCuentas()
  }, [])

  async function cargarDatos() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (vistaTab === "pendientes") {
        params.set("estado", "Pendiente")
      } else {
        if (mesSeleccionado) params.set("mes", mesSeleccionado)
        if (filtroCentro) params.set("centro", filtroCentro)
        if (filtroEstado) params.set("estado", filtroEstado)
      }
      const res = await fetch(`/api/admin/egresos?${params}`)
      const data = await res.json()
      if (data.success) setEgresos(data.data || [])
    } catch (error) {
      console.error("Error cargando egresos:", error)
    } finally {
      setLoading(false)
    }
  }

  async function cargarCuentas() {
    try {
      const res = await fetch("/api/admin/cuentas")
      const data = await res.json()
      if (data.success) setCuentas(data.data || [])
    } catch (error) {
      console.error("Error cargando cuentas:", error)
    }
  }

  const centroActual = useMemo(
    () => CENTROS_DE_COSTO.find((c) => c.id === formData.centro_costo),
    [formData.centro_costo]
  )
  const tieneSubcategorias = centroActual && "subcategorias" in centroActual

  function abrirModalNuevo() {
    setEditandoId(null)
    setFormData({
      centro_costo: "",
      sub_categoria: "",
      descripcion: "",
      monto: "",
      fecha: new Date().toISOString().slice(0, 10),
      tiene_comprobante: false,
      notas: "",
    })
    setModalAbierto(true)
  }

  function abrirModalEditar(egreso: Egreso) {
    setEditandoId(egreso.id)
    setFormData({
      centro_costo: egreso.centro_costo,
      sub_categoria: egreso.sub_categoria || "",
      descripcion: egreso.descripcion || "",
      monto: String(egreso.monto),
      fecha: egreso.fecha,
      tiene_comprobante: egreso.tiene_comprobante,
      notas: egreso.notas || "",
    })
    setModalAbierto(true)
  }

  async function guardarEgreso() {
    setGuardando(true)
    try {
      const body = {
        centro_costo: formData.centro_costo,
        sub_categoria: formData.sub_categoria || null,
        descripcion: formData.descripcion || null,
        monto: parseFloat(formData.monto) || 0,
        fecha: formData.fecha,
        tiene_comprobante: formData.tiene_comprobante,
        notas: formData.notas || null,
      }

      let res
      if (editandoId) {
        res = await fetch(`/api/admin/egresos/${editandoId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      } else {
        res = await fetch("/api/admin/egresos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      }

      const data = await res.json()
      if (data.success) {
        setModalAbierto(false)
        cargarDatos()
      } else {
        alert("Error: " + (data.error || "Error desconocido"))
      }
    } catch (error) {
      console.error("Error guardando egreso:", error)
      alert("Error guardando egreso")
    } finally {
      setGuardando(false)
    }
  }

  async function registrarPago() {
    if (!modalPago) return
    setGuardando(true)
    try {
      const cuentaSel = pagoData.cuenta_id ? cuentas.find((c) => c.id === parseInt(pagoData.cuenta_id)) : null
      const formaPago = cuentaSel ? cuentaSel.nombre : pagoData.forma_pago

      const res = await fetch(`/api/admin/egresos/${modalPago.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado_pago: "Pagado",
          fecha_pago: pagoData.fecha_pago,
          forma_pago: formaPago,
          destino_pago: pagoData.destino_pago || null,
          cuenta_id: pagoData.cuenta_id ? parseInt(pagoData.cuenta_id) : null,
        }),
      })
      const data = await res.json()
      if (data.success) {
        // Crear movimiento en la cuenta
        if (pagoData.cuenta_id) {
          try {
            await fetch("/api/admin/movimientos", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                cuenta_id: parseInt(pagoData.cuenta_id),
                tipo: "egreso",
                monto: modalPago.monto,
                concepto: `Egreso: ${getCentroNombre(modalPago.centro_costo)} - ${modalPago.descripcion || ""}`.trim(),
                referencia: String(modalPago.id),
                fecha: pagoData.fecha_pago,
              }),
            })
          } catch (err) {
            console.error("Error creando movimiento:", err)
          }
        }
        setModalPago(null)
        cargarDatos()
      } else {
        alert("Error: " + (data.error || "Error desconocido"))
      }
    } catch (error) {
      console.error("Error registrando pago:", error)
    } finally {
      setGuardando(false)
    }
  }

  async function eliminarEgreso(id: number) {
    try {
      const res = await fetch(`/api/admin/egresos?id=${id}`, { method: "DELETE" })
      const data = await res.json()
      if (data.success) {
        setConfirmDelete(null)
        cargarDatos()
      }
    } catch (error) {
      console.error("Error eliminando:", error)
    }
  }

  function abrirPago(egreso: Egreso) {
    setModalPago(egreso)
    setPagoData({
      forma_pago: "Transferencia",
      destino_pago: "",
      fecha_pago: new Date().toISOString().slice(0, 10),
      cuenta_id: "",
    })
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

  // Totales
  const totalEgresos = egresos.reduce((s, e) => s + e.monto, 0)
  const pendientes = egresos.filter((e) => e.estado_pago === "Pendiente")
  const totalPendientes = pendientes.reduce((s, e) => s + e.monto, 0)

  // Top centros de costo
  const porCentro = egresos.reduce(
    (acc, e) => {
      const key = e.centro_costo
      acc[key] = (acc[key] || 0) + e.monto
      return acc
    },
    {} as Record<string, number>
  )
  const topCentros = Object.entries(porCentro)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  const descargarExcel = () => {
    const headers = ["Centro de Costo", "Subcategoria", "Descripcion", "Monto", "Fecha", "Estado", "Forma Pago", "Notas"]
    const rows = egresos.map((e) => [
      getCentroNombre(e.centro_costo),
      e.sub_categoria || "",
      e.descripcion || "",
      e.monto,
      e.fecha,
      e.estado_pago,
      e.forma_pago || "",
      e.notas || "",
    ])
    rows.push(["TOTAL", "", "", totalEgresos, "", "", "", ""])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Egresos")
    XLSX.writeFile(wb, `egresos_${mesSeleccionado}.xlsx`)
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Egresos</h2>
          <p className="text-gray-500">Gastos y pagos del negocio</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={descargarExcel}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            Descargar Excel
          </button>
          <button
            onClick={abrirModalNuevo}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
          >
            + Nuevo Egreso
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => setVistaTab("todos")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${vistaTab === "todos" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-200"}`}
        >
          Todos
        </button>
        <button
          onClick={() => setVistaTab("pendientes")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition ${vistaTab === "pendientes" ? "bg-primary text-white" : "text-gray-600 hover:bg-gray-200"}`}
        >
          Pendientes de Pago ({pendientes.length})
        </button>
      </div>

      {/* Filtros */}
      {vistaTab === "todos" && (
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
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
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Centro:</label>
              <select
                value={filtroCentro}
                onChange={(e) => setFiltroCentro(e.target.value)}
                className="p-2 border rounded-lg focus:ring-2 focus:ring-primary"
              >
                <option value="">Todos</option>
                {CENTROS_DE_COSTO.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Estado:</label>
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="p-2 border rounded-lg focus:ring-2 focus:ring-primary"
              >
                <option value="">Todos</option>
                <option value="Pendiente">Pendiente</option>
                <option value="Pagado">Pagado</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Cards resumen */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-br from-rose-50 to-rose-100 rounded-xl p-4 border border-rose-200">
          <p className="text-xs text-rose-600 font-semibold uppercase">Total Egresos</p>
          <p className="text-2xl font-bold text-rose-700">{formatMoney(totalEgresos)}</p>
          <p className="text-xs text-rose-500">{egresos.length} registros</p>
        </div>
        <div
          className={`bg-gradient-to-br rounded-xl p-4 border ${totalPendientes > 0 ? "from-amber-50 to-amber-100 border-amber-200" : "from-green-50 to-green-100 border-green-200"}`}
        >
          <p className={`text-xs font-semibold uppercase ${totalPendientes > 0 ? "text-amber-600" : "text-green-600"}`}>
            Pendientes de Pago
          </p>
          <p className={`text-2xl font-bold ${totalPendientes > 0 ? "text-amber-700" : "text-green-700"}`}>
            {formatMoney(totalPendientes)}
          </p>
          <p className={`text-xs ${totalPendientes > 0 ? "text-amber-500" : "text-green-500"}`}>{pendientes.length} pendientes</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <p className="text-xs text-blue-600 font-semibold uppercase">Top Centro de Costo</p>
          {topCentros.length > 0 ? (
            <>
              <p className="text-sm font-bold text-blue-700 truncate">{getCentroNombre(topCentros[0][0])}</p>
              <p className="text-lg font-bold text-blue-800">{formatMoney(topCentros[0][1])}</p>
            </>
          ) : (
            <p className="text-sm text-blue-500">Sin datos</p>
          )}
        </div>
      </div>

      {/* Mini cards por centro */}
      {topCentros.length > 1 && vistaTab === "todos" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-6">
          {topCentros.map(([centro, total]) => (
            <div key={centro} className="bg-white rounded-lg shadow p-3 text-center">
              <p className="text-xs text-gray-500 truncate">{getCentroNombre(centro)}</p>
              <p className="text-sm font-bold text-gray-900">{formatMoney(total)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="mt-2 text-gray-600">Cargando...</p>
          </div>
        ) : egresos.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No hay egresos en este periodo</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Centro de Costo</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Descripcion</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Monto</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Fecha</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">Estado</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-700">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {egresos.map((e, idx) => (
                  <tr key={e.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-3">
                      <div>
                        <span className="font-medium text-gray-900 text-xs">{getCentroNombre(e.centro_costo)}</span>
                        {e.sub_categoria && <p className="text-xs text-gray-500">{e.sub_categoria}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={e.descripcion || ""}>
                      {e.descripcion || "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-rose-600">{formatMoney(e.monto)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDateStr(e.fecha)}</td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          e.estado_pago === "Pagado" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {e.estado_pago}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {e.estado_pago === "Pendiente" && (
                          <button
                            onClick={() => abrirPago(e)}
                            className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
                          >
                            Pagar
                          </button>
                        )}
                        <button
                          onClick={() => abrirModalEditar(e)}
                          className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200"
                        >
                          Editar
                        </button>
                        {confirmDelete === e.id ? (
                          <div className="flex gap-1">
                            <button onClick={() => eliminarEgreso(e.id)} className="px-2 py-1 bg-red-600 text-white rounded text-xs">
                              Si
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="px-2 py-1 bg-gray-200 text-gray-700 rounded text-xs"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(e.id)}
                            className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-rose-100 font-bold">
                  <td colSpan={2} className="px-4 py-3 text-gray-900">
                    TOTAL ({egresos.length})
                  </td>
                  <td className="px-4 py-3 text-right text-rose-700">{formatMoney(totalEgresos)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* MODAL NUEVO/EDITAR EGRESO */}
      {modalAbierto && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setModalAbierto(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div
              className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
                <h3 className="text-lg font-bold text-gray-900">{editandoId ? "Editar Egreso" : "Nuevo Egreso"}</h3>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-sm text-gray-600 block mb-1">Centro de Costo *</label>
                  <select
                    value={formData.centro_costo}
                    onChange={(e) => setFormData((prev) => ({ ...prev, centro_costo: e.target.value, sub_categoria: "" }))}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Seleccionar...</option>
                    {CENTROS_DE_COSTO.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                {tieneSubcategorias && (
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">Subcategoria</label>
                    <select
                      value={formData.sub_categoria}
                      onChange={(e) => setFormData((prev) => ({ ...prev, sub_categoria: e.target.value }))}
                      className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Seleccionar...</option>
                      {(centroActual as { subcategorias: string[] }).subcategorias.map((s: string) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-sm text-gray-600 block mb-1">Descripcion</label>
                  <input
                    value={formData.descripcion}
                    onChange={(e) => setFormData((prev) => ({ ...prev, descripcion: e.target.value }))}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                    placeholder="Detalle del gasto..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">Monto *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.monto}
                      onChange={(e) => setFormData((prev) => ({ ...prev, monto: e.target.value }))}
                      className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-600 block mb-1">Fecha *</label>
                    <input
                      type="date"
                      value={formData.fecha}
                      onChange={(e) => setFormData((prev) => ({ ...prev, fecha: e.target.value }))}
                      className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="comprobante"
                    checked={formData.tiene_comprobante}
                    onChange={(e) => setFormData((prev) => ({ ...prev, tiene_comprobante: e.target.checked }))}
                    className="rounded"
                  />
                  <label htmlFor="comprobante" className="text-sm text-gray-600">
                    Tiene comprobante
                  </label>
                </div>

                <div>
                  <label className="text-sm text-gray-600 block mb-1">Notas (opcional)</label>
                  <textarea
                    value={formData.notas}
                    onChange={(e) => setFormData((prev) => ({ ...prev, notas: e.target.value }))}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                    rows={2}
                    placeholder="Observaciones..."
                  />
                </div>
              </div>

              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 sticky bottom-0 bg-white">
                <button onClick={() => setModalAbierto(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                  Cancelar
                </button>
                <button
                  onClick={guardarEgreso}
                  disabled={guardando || !formData.centro_costo}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400"
                >
                  {guardando ? "Guardando..." : editandoId ? "Guardar Cambios" : "Crear Egreso"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* MODAL REGISTRAR PAGO */}
      {modalPago && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setModalPago(null)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-bold text-gray-900">Registrar Pago</h3>
                <p className="text-sm text-gray-500">
                  {getCentroNombre(modalPago.centro_costo)} - {formatMoney(modalPago.monto)}
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="text-sm text-gray-600 block mb-1">Cuenta</label>
                  <select
                    value={pagoData.cuenta_id}
                    onChange={(e) => setPagoData((prev) => ({ ...prev, cuenta_id: e.target.value }))}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Sin cuenta (no afecta saldo)</option>
                    {cuentas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} {c.banco ? `(${c.banco})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-600 block mb-1">Destino (a quien se pago)</label>
                  <input
                    value={pagoData.destino_pago}
                    onChange={(e) => setPagoData((prev) => ({ ...prev, destino_pago: e.target.value }))}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                    placeholder="Nombre o entidad..."
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 block mb-1">Fecha de Pago</label>
                  <input
                    type="date"
                    value={pagoData.fecha_pago}
                    onChange={(e) => setPagoData((prev) => ({ ...prev, fecha_pago: e.target.value }))}
                    className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button onClick={() => setModalPago(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                  Cancelar
                </button>
                <button
                  onClick={registrarPago}
                  disabled={guardando}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                >
                  {guardando ? "Guardando..." : "Confirmar Pago"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
