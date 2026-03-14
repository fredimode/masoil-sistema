"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import * as XLSX from "xlsx"
import { formatCurrency, formatDateStr } from "@/lib/utils"
import { fetchPagosProveedores, fetchReclamos, updateEstadoPago, createReclamo } from "@/lib/supabase/queries"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog"

export default function PagosPage() {
  const [loading, setLoading] = useState(true)
  const [pagos, setPagos] = useState<any[]>([])
  const [reclamos, setReclamos] = useState<any[]>([])

  // Filtros pagos
  const [busquedaPagos, setBusquedaPagos] = useState("")
  const [filtroEstado, setFiltroEstado] = useState("Todos")
  const [filtroEmpresaPagos, setFiltroEmpresaPagos] = useState("Todos")
  const [filtroFormaPago, setFiltroFormaPago] = useState("Todos")

  // Filtros reclamos
  const [busquedaReclamos, setBusquedaReclamos] = useState("")
  const [filtroEmpresaReclamos, setFiltroEmpresaReclamos] = useState("Todos")

  // Nuevo reclamo
  const [dialogOpen, setDialogOpen] = useState(false)
  const [nuevoReclamo, setNuevoReclamo] = useState({
    proveedor_nombre: "",
    empresa: "",
    forma_pago: "",
    fecha_reclamo: "",
    observaciones: "",
    estado: "PENDIENTE",
  })
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setLoading(true)
    try {
      const [pagosData, reclamosData] = await Promise.all([
        fetchPagosProveedores(),
        fetchReclamos(),
      ])
      setPagos(pagosData)
      setReclamos(reclamosData)
    } catch (error) {
      console.error("Error cargando datos:", error)
    } finally {
      setLoading(false)
    }
  }

  async function marcarPagado(id: string) {
    try {
      await updateEstadoPago(id, "PAGADO")
      await cargarDatos()
    } catch (error) {
      console.error("Error actualizando estado:", error)
    }
  }

  async function handleCrearReclamo() {
    setCreando(true)
    try {
      await createReclamo(nuevoReclamo)
      setNuevoReclamo({
        proveedor_nombre: "",
        empresa: "",
        forma_pago: "",
        fecha_reclamo: "",
        observaciones: "",
        estado: "PENDIENTE",
      })
      setDialogOpen(false)
      await cargarDatos()
    } catch (error) {
      console.error("Error creando reclamo:", error)
    } finally {
      setCreando(false)
    }
  }

  // Valores unicos para filtros
  const empresasPagos = useMemo(() => [...new Set(pagos.map((p) => p.empresa).filter(Boolean))], [pagos])
  const formasPago = useMemo(() => [...new Set(pagos.map((p) => p.forma_pago).filter(Boolean))], [pagos])
  const empresasReclamos = useMemo(() => [...new Set(reclamos.map((r) => r.empresa).filter(Boolean))], [reclamos])

  // Filtrado pagos
  const pagosFiltrados = useMemo(() => {
    return pagos.filter((p) => {
      const matchBusqueda =
        !busquedaPagos ||
        p.proveedor_nombre?.toLowerCase().includes(busquedaPagos.toLowerCase()) ||
        p.cuit?.toLowerCase().includes(busquedaPagos.toLowerCase()) ||
        p.numero_fc?.toLowerCase().includes(busquedaPagos.toLowerCase())
      const matchEstado = filtroEstado === "Todos" || p.estado_pago === filtroEstado
      const matchEmpresa = filtroEmpresaPagos === "Todos" || p.empresa === filtroEmpresaPagos
      const matchForma = filtroFormaPago === "Todos" || p.forma_pago === filtroFormaPago
      return matchBusqueda && matchEstado && matchEmpresa && matchForma
    })
  }, [pagos, busquedaPagos, filtroEstado, filtroEmpresaPagos, filtroFormaPago])

  // Filtrado reclamos
  const reclamosFiltrados = useMemo(() => {
    return reclamos.filter((r) => {
      const matchBusqueda =
        !busquedaReclamos ||
        r.proveedor_nombre?.toLowerCase().includes(busquedaReclamos.toLowerCase()) ||
        r.observaciones?.toLowerCase().includes(busquedaReclamos.toLowerCase())
      const matchEmpresa = filtroEmpresaReclamos === "Todos" || r.empresa === filtroEmpresaReclamos
      return matchBusqueda && matchEmpresa
    })
  }, [reclamos, busquedaReclamos, filtroEmpresaReclamos])

  // Stats
  const totalAPagar = pagos
    .filter((p) => p.estado_pago !== "PAGADO")
    .reduce((sum, p) => sum + (Number(p.importe) || 0), 0)
  const cantPagados = pagos.filter((p) => p.estado_pago === "PAGADO").length
  const cantPendientes = pagos.filter((p) => p.estado_pago === "PENDIENTE").length
  const cantProveedores = new Set(pagos.map((p) => p.proveedor_nombre).filter(Boolean)).size

  function exportarPagosXLSX() {
    const data = pagosFiltrados.map((p) => ({
      Proveedor: p.proveedor_nombre,
      CUIT: p.cuit,
      Empresa: p.empresa,
      "Fecha FC": formatDateStr(p.fecha_fc),
      "Nro FC": p.numero_fc,
      Importe: Number(p.importe) || 0,
      "Forma de pago": p.forma_pago,
      Estado: p.estado_pago,
      Banco: p.banco,
      Origen: p.origen,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Pagos")
    XLSX.writeFile(wb, "pagos_proveedores.xlsx")
  }

  function exportarReclamosXLSX() {
    const data = reclamosFiltrados.map((r) => ({
      Proveedor: r.proveedor_nombre,
      Empresa: r.empresa,
      "Forma de pago": r.forma_pago,
      "Fecha reclamo": formatDateStr(r.fecha_reclamo),
      "Fecha pago": formatDateStr(r.fecha_pago),
      Observaciones: r.observaciones,
      Estado: r.estado,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Reclamos")
    XLSX.writeFile(wb, "reclamos_pagos.xlsx")
  }

  function estadoBadge(estado: string) {
    if (estado === "PAGADO") return <Badge className="bg-green-100 text-green-700 border-green-200">{estado}</Badge>
    if (estado === "PENDIENTE") return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">{estado}</Badge>
    return <Badge className="bg-red-100 text-red-700 border-red-200">{estado}</Badge>
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2 text-gray-600">Cargando pagos...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Pagos a Proveedores</h2>
          <p className="text-gray-500">Gestion de pagos y reclamos</p>
        </div>
      </div>

      <Tabs defaultValue="programacion">
        <TabsList>
          <TabsTrigger value="programacion">Programacion Mensual</TabsTrigger>
          <TabsTrigger value="reclamos">Reclamos</TabsTrigger>
        </TabsList>

        {/* ============ TAB PROGRAMACION MENSUAL ============ */}
        <TabsContent value="programacion">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-xl p-4 border border-indigo-200">
              <p className="text-sm text-indigo-600 font-semibold">Total a pagar</p>
              <p className="text-2xl font-bold text-indigo-700">{formatCurrency(totalAPagar)}</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4 border border-green-200">
              <p className="text-sm text-green-600 font-semibold">Pagados</p>
              <p className="text-2xl font-bold text-green-700">{cantPagados}</p>
            </div>
            <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-4 border border-yellow-200">
              <p className="text-sm text-yellow-600 font-semibold">Pendientes</p>
              <p className="text-2xl font-bold text-yellow-700">{cantPendientes}</p>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4 border border-purple-200">
              <p className="text-sm text-purple-600 font-semibold">Proveedores</p>
              <p className="text-2xl font-bold text-purple-700">{cantProveedores}</p>
            </div>
          </div>

          {/* Filtros + acciones */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Buscar proveedor, CUIT, nro FC..."
                value={busquedaPagos}
                onChange={(e) => setBusquedaPagos(e.target.value)}
                className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm flex-1 min-w-[200px]"
              />
              <select
                value={filtroEstado}
                onChange={(e) => setFiltroEstado(e.target.value)}
                className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              >
                <option value="Todos">Estado: Todos</option>
                <option value="PAGADO">PAGADO</option>
                <option value="PENDIENTE">PENDIENTE</option>
              </select>
              <select
                value={filtroEmpresaPagos}
                onChange={(e) => setFiltroEmpresaPagos(e.target.value)}
                className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              >
                <option value="Todos">Empresa: Todas</option>
                {empresasPagos.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
              <select
                value={filtroFormaPago}
                onChange={(e) => setFiltroFormaPago(e.target.value)}
                className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              >
                <option value="Todos">Forma pago: Todas</option>
                {formasPago.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <button
                onClick={exportarPagosXLSX}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
              >
                Exportar XLSX
              </button>
              <Link
                href="/admin/pagos/nuevo"
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium"
              >
                + Nuevo Pago
              </Link>
            </div>
          </div>

          {/* Tabla pagos */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {pagosFiltrados.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No se encontraron pagos</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Proveedor</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">CUIT</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Empresa</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Fecha FC</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Nro FC</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Importe</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Forma de pago</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700">Estado</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Banco</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Origen</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagosFiltrados.map((p, idx) => (
                      <tr key={p.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-4 py-3 font-medium text-gray-900">{p.proveedor_nombre}</td>
                        <td className="px-4 py-3 text-gray-600">{p.cuit || "-"}</td>
                        <td className="px-4 py-3 text-gray-600">{p.empresa || "-"}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDateStr(p.fecha_fc)}</td>
                        <td className="px-4 py-3 text-gray-600">{p.numero_fc || "-"}</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(Number(p.importe) || 0)}</td>
                        <td className="px-4 py-3 text-gray-600">{p.forma_pago || "-"}</td>
                        <td className="px-4 py-3 text-center">{estadoBadge(p.estado_pago || "")}</td>
                        <td className="px-4 py-3 text-gray-600">{p.banco || "-"}</td>
                        <td className="px-4 py-3 text-gray-600">{p.origen || "-"}</td>
                        <td className="px-4 py-3 text-center">
                          {p.estado_pago !== "PAGADO" && (
                            <button
                              onClick={() => marcarPagado(p.id)}
                              className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 font-medium"
                            >
                              Marcar Pagado
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ============ TAB RECLAMOS ============ */}
        <TabsContent value="reclamos">
          {/* Filtros + acciones */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Buscar proveedor, observaciones..."
                value={busquedaReclamos}
                onChange={(e) => setBusquedaReclamos(e.target.value)}
                className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm flex-1 min-w-[200px]"
              />
              <select
                value={filtroEmpresaReclamos}
                onChange={(e) => setFiltroEmpresaReclamos(e.target.value)}
                className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              >
                <option value="Todos">Empresa: Todas</option>
                {empresasReclamos.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
              <button
                onClick={exportarReclamosXLSX}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
              >
                Exportar XLSX
              </button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <button className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium">
                    + Nuevo Reclamo
                  </button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Nuevo Reclamo</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Proveedor *</label>
                      <input
                        type="text"
                        value={nuevoReclamo.proveedor_nombre}
                        onChange={(e) => setNuevoReclamo((prev) => ({ ...prev, proveedor_nombre: e.target.value }))}
                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                        placeholder="Nombre del proveedor"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Empresa</label>
                      <input
                        type="text"
                        value={nuevoReclamo.empresa}
                        onChange={(e) => setNuevoReclamo((prev) => ({ ...prev, empresa: e.target.value }))}
                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Forma de pago</label>
                      <select
                        value={nuevoReclamo.forma_pago}
                        onChange={(e) => setNuevoReclamo((prev) => ({ ...prev, forma_pago: e.target.value }))}
                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                      >
                        <option value="">Seleccionar...</option>
                        <option value="Transferencia">Transferencia</option>
                        <option value="Cheque">Cheque</option>
                        <option value="Efectivo">Efectivo</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Fecha reclamo *</label>
                      <input
                        type="date"
                        value={nuevoReclamo.fecha_reclamo}
                        onChange={(e) => setNuevoReclamo((prev) => ({ ...prev, fecha_reclamo: e.target.value }))}
                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Observaciones</label>
                      <textarea
                        value={nuevoReclamo.observaciones}
                        onChange={(e) => setNuevoReclamo((prev) => ({ ...prev, observaciones: e.target.value }))}
                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                        rows={3}
                      />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Estado</label>
                      <select
                        value={nuevoReclamo.estado}
                        onChange={(e) => setNuevoReclamo((prev) => ({ ...prev, estado: e.target.value }))}
                        className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                      >
                        <option value="PENDIENTE">PENDIENTE</option>
                        <option value="EN PROCESO">EN PROCESO</option>
                        <option value="RESUELTO">RESUELTO</option>
                      </select>
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">
                        Cancelar
                      </button>
                    </DialogClose>
                    <button
                      onClick={handleCrearReclamo}
                      disabled={creando || !nuevoReclamo.proveedor_nombre || !nuevoReclamo.fecha_reclamo}
                      className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400 text-sm font-medium"
                    >
                      {creando ? "Creando..." : "Crear Reclamo"}
                    </button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Tabla reclamos */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {reclamosFiltrados.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500">No se encontraron reclamos</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Proveedor</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Empresa</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Forma de pago</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Fecha reclamo</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Fecha pago</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-700">Observaciones</th>
                      <th className="px-4 py-3 text-center font-semibold text-gray-700">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reclamosFiltrados.map((r, idx) => (
                      <tr key={r.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-4 py-3 font-medium text-gray-900">{r.proveedor_nombre}</td>
                        <td className="px-4 py-3 text-gray-600">{r.empresa || "-"}</td>
                        <td className="px-4 py-3 text-gray-600">{r.forma_pago || "-"}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDateStr(r.fecha_reclamo)}</td>
                        <td className="px-4 py-3 text-gray-600">{formatDateStr(r.fecha_pago)}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{r.observaciones || "-"}</td>
                        <td className="px-4 py-3 text-center">{estadoBadge(r.estado || "")}</td>
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
