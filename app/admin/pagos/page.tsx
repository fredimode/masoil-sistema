"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import * as XLSX from "xlsx"
import { formatCurrency, formatDateStr, normalizeSearch } from "@/lib/utils"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import {
  fetchPagosProveedores,
  fetchReclamos,
  updateEstadoPago,
  createReclamo,
  deletePagoProveedor,
  updatePagoProveedor,
  deleteReclamo,
  updateReclamo,
} from "@/lib/supabase/queries"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Eye, Pencil, Trash2, Paperclip, Mail, RefreshCw } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

export default function PagosPage() {
  const [loading, setLoading] = useState(true)
  const [pagos, setPagos] = useState<any[]>([])
  const [reclamos, setReclamos] = useState<any[]>([])

  // Pagination
  const [pagosPage, setPagosPage] = useState(1)
  const [reclamosPage, setReclamosPage] = useState(1)

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

  // Action dialogs - Pagos
  const [viewingPago, setViewingPago] = useState<any | null>(null)
  const [editingPago, setEditingPago] = useState<any | null>(null)
  const [editPagoForm, setEditPagoForm] = useState<any>({})
  const [deletingPago, setDeletingPago] = useState<any | null>(null)

  // Action dialogs - Reclamos
  const [viewingReclamo, setViewingReclamo] = useState<any | null>(null)
  const [editingReclamo, setEditingReclamo] = useState<any | null>(null)
  const [editReclamoForm, setEditReclamoForm] = useState<any>({})
  const [deletingReclamo, setDeletingReclamo] = useState<any | null>(null)
  const [enviandoEmail, setEnviandoEmail] = useState<string | null>(null)

  async function handleReenviarEmail(pago: any) {
    setEnviandoEmail(pago.id)
    try {
      const res = await fetch("/api/admin/pagos/enviar-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pagoId: pago.id }),
      })
      const data = await res.json()
      if (data.success) {
        setPagos((prev) => prev.map((p) => p.id === pago.id ? { ...p, email_enviado: true, email_enviado_at: new Date().toISOString() } : p))
        alert(`Email enviado a ${data.email}`)
      } else {
        alert(data.error || "Error al enviar email")
      }
    } catch {
      alert("Error al enviar email")
    } finally {
      setEnviandoEmail(null)
    }
  }

  async function handleDownloadComprobante(pago: any) {
    if (!pago.comprobante_url) return
    const supabase = createClient()
    const { data } = await supabase.storage.from("comprobantes").createSignedUrl(pago.comprobante_url, 60)
    if (data?.signedUrl) window.open(data.signedUrl, "_blank")
  }

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

  // Actions - Pagos
  async function handleEditPago() {
    if (!editingPago) return
    try {
      await updatePagoProveedor(editingPago.id, editPagoForm)
      setEditingPago(null)
      await cargarDatos()
    } catch (err) {
      console.error("Error actualizando pago:", err)
    }
  }

  async function handleDeletePago() {
    if (!deletingPago) return
    try {
      await deletePagoProveedor(deletingPago.id)
      setDeletingPago(null)
      await cargarDatos()
    } catch (err) {
      console.error("Error eliminando pago:", err)
    }
  }

  // Actions - Reclamos
  async function handleEditReclamo() {
    if (!editingReclamo) return
    try {
      await updateReclamo(editingReclamo.id, editReclamoForm)
      setEditingReclamo(null)
      await cargarDatos()
    } catch (err) {
      console.error("Error actualizando reclamo:", err)
    }
  }

  async function handleDeleteReclamo() {
    if (!deletingReclamo) return
    try {
      await deleteReclamo(deletingReclamo.id)
      setDeletingReclamo(null)
      await cargarDatos()
    } catch (err) {
      console.error("Error eliminando reclamo:", err)
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
        normalizeSearch(p.proveedor_nombre || "").includes(normalizeSearch(busquedaPagos)) ||
        normalizeSearch(p.cuit || "").includes(normalizeSearch(busquedaPagos)) ||
        normalizeSearch(p.numero_fc || "").includes(normalizeSearch(busquedaPagos))
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
        normalizeSearch(r.proveedor_nombre || "").includes(normalizeSearch(busquedaReclamos)) ||
        normalizeSearch(r.observaciones || "").includes(normalizeSearch(busquedaReclamos))
      const matchEmpresa = filtroEmpresaReclamos === "Todos" || r.empresa === filtroEmpresaReclamos
      return matchBusqueda && matchEmpresa
    })
  }, [reclamos, busquedaReclamos, filtroEmpresaReclamos])

  // Pagination - Pagos
  const { totalPages: pagosTotalPages, totalItems: pagosTotalItems, pageSize: pagosPageSize, getPage: getPagosPage } = usePagination(pagosFiltrados, 50)
  const pagosCurrentPage = Math.min(pagosPage, pagosTotalPages)
  const paginatedPagos = getPagosPage(pagosCurrentPage)

  // Pagination - Reclamos
  const { totalPages: reclamosTotalPages, totalItems: reclamosTotalItems, pageSize: reclamosPageSize, getPage: getReclamosPage } = usePagination(reclamosFiltrados, 50)
  const reclamosCurrentPage = Math.min(reclamosPage, reclamosTotalPages)
  const paginatedReclamos = getReclamosPage(reclamosCurrentPage)

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
                onChange={(e) => { setBusquedaPagos(e.target.value); setPagosPage(1) }}
                className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm flex-1 min-w-[200px]"
              />
              <select value={filtroEstado} onChange={(e) => { setFiltroEstado(e.target.value); setPagosPage(1) }} className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm">
                <option value="Todos">Estado: Todos</option>
                <option value="PAGADO">PAGADO</option>
                <option value="PENDIENTE">PENDIENTE</option>
              </select>
              <select value={filtroEmpresaPagos} onChange={(e) => { setFiltroEmpresaPagos(e.target.value); setPagosPage(1) }} className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm">
                <option value="Todos">Empresa: Todas</option>
                {empresasPagos.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
              <select value={filtroFormaPago} onChange={(e) => { setFiltroFormaPago(e.target.value); setPagosPage(1) }} className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm">
                <option value="Todos">Forma pago: Todas</option>
                {formasPago.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
              <button onClick={exportarPagosXLSX} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">Exportar XLSX</button>
              <Link href="/admin/pagos/nuevo" className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium">+ Nuevo Pago</Link>
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
                <table className="w-full text-sm table-fixed">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[140px]">Proveedor</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[100px]">CUIT</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[80px]">Empresa</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[85px]">Fecha FC</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[80px]">Nro FC</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-700 w-[100px]">Importe</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[100px]">Forma pago</th>
                      <th className="px-3 py-3 text-center font-semibold text-gray-700 w-[90px]">Estado</th>
                      <th className="px-3 py-3 text-center font-semibold text-gray-700 w-[50px]" title="Comprobante">Adj</th>
                      <th className="px-3 py-3 text-center font-semibold text-gray-700 w-[80px]">Email</th>
                      <th className="px-3 py-3 text-center font-semibold text-gray-700 w-[100px]">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPagos.map((p, idx) => (
                      <tr key={p.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-3 py-3 font-medium text-gray-900 truncate" title={p.proveedor_nombre || ""}>{p.proveedor_nombre}</td>
                        <td className="px-3 py-3 text-gray-600 truncate">{p.cuit || "-"}</td>
                        <td className="px-3 py-3 text-gray-600 truncate">{p.empresa || "-"}</td>
                        <td className="px-3 py-3 text-gray-600">{formatDateStr(p.fecha_fc)}</td>
                        <td className="px-3 py-3 text-gray-600 truncate">{p.numero_fc || "-"}</td>
                        <td className="px-3 py-3 text-right font-bold text-gray-900">{formatCurrency(Number(p.importe) || 0)}</td>
                        <td className="px-3 py-3 text-gray-600 truncate" title={p.forma_pago || ""}>{p.forma_pago || "-"}</td>
                        <td className="px-3 py-3 text-center">
                          <div className="max-w-[90px] mx-auto truncate">{estadoBadge(p.estado_pago || "")}</div>
                        </td>
                        <td className="px-2 py-3 text-center">
                          {p.comprobante_url ? (
                            <button onClick={() => handleDownloadComprobante(p)} className="p-1 hover:bg-gray-200 rounded" title="Ver comprobante">
                              <Paperclip className="h-4 w-4 text-blue-600" />
                            </button>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        <td className="px-2 py-3 text-center">
                          {p.email_enviado ? (
                            <div className="flex items-center justify-center gap-1">
                              <Badge className="bg-green-100 text-green-700 border-green-200 text-[10px] px-1">Enviado</Badge>
                              <button onClick={() => handleReenviarEmail(p)} className="p-0.5 hover:bg-gray-200 rounded" title="Reenviar email" disabled={enviandoEmail === p.id}>
                                <RefreshCw className={`h-3 w-3 text-gray-500 ${enviandoEmail === p.id ? "animate-spin" : ""}`} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => handleReenviarEmail(p)}
                              className="p-1 hover:bg-blue-100 rounded text-xs text-blue-600"
                              title="Enviar email"
                              disabled={enviandoEmail === p.id}
                            >
                              {enviandoEmail === p.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setViewingPago(p)} className="p-1 hover:bg-gray-200 rounded" title="Ver detalle">
                              <Eye className="h-4 w-4 text-gray-600" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingPago(p)
                                setEditPagoForm({
                                  proveedor_nombre: p.proveedor_nombre || "",
                                  cuit: p.cuit || "",
                                  empresa: p.empresa || "",
                                  numero_fc: p.numero_fc || "",
                                  importe: p.importe || 0,
                                  forma_pago: p.forma_pago || "",
                                  estado_pago: p.estado_pago || "",
                                  banco: p.banco || "",
                                  origen: p.origen || "",
                                })
                              }}
                              className="p-1 hover:bg-gray-200 rounded"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4 text-blue-600" />
                            </button>
                            <button onClick={() => setDeletingPago(p)} className="p-1 hover:bg-gray-200 rounded" title="Eliminar">
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <TablePagination currentPage={pagosCurrentPage} totalPages={pagosTotalPages} totalItems={pagosTotalItems} pageSize={pagosPageSize} onPageChange={setPagosPage} />
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
                onChange={(e) => { setBusquedaReclamos(e.target.value); setReclamosPage(1) }}
                className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm flex-1 min-w-[200px]"
              />
              <select value={filtroEmpresaReclamos} onChange={(e) => { setFiltroEmpresaReclamos(e.target.value); setReclamosPage(1) }} className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm">
                <option value="Todos">Empresa: Todas</option>
                {empresasReclamos.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
              <button onClick={exportarReclamosXLSX} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">Exportar XLSX</button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <button className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium">+ Nuevo Reclamo</button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Nuevo Reclamo</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Proveedor *</label>
                      <input type="text" value={nuevoReclamo.proveedor_nombre} onChange={(e) => setNuevoReclamo((prev) => ({ ...prev, proveedor_nombre: e.target.value }))} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm" placeholder="Nombre del proveedor" />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Empresa</label>
                      <input type="text" value={nuevoReclamo.empresa} onChange={(e) => setNuevoReclamo((prev) => ({ ...prev, empresa: e.target.value }))} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm" />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Forma de pago</label>
                      <select value={nuevoReclamo.forma_pago} onChange={(e) => setNuevoReclamo((prev) => ({ ...prev, forma_pago: e.target.value }))} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm">
                        <option value="">Seleccionar...</option>
                        <option value="Transferencia">Transferencia</option>
                        <option value="Cheque">Cheque</option>
                        <option value="Efectivo">Efectivo</option>
                        <option value="Otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Fecha reclamo *</label>
                      <input type="date" value={nuevoReclamo.fecha_reclamo} onChange={(e) => setNuevoReclamo((prev) => ({ ...prev, fecha_reclamo: e.target.value }))} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm" />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Observaciones</label>
                      <textarea value={nuevoReclamo.observaciones} onChange={(e) => setNuevoReclamo((prev) => ({ ...prev, observaciones: e.target.value }))} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm" rows={3} />
                    </div>
                    <div>
                      <label className="text-sm text-gray-600 block mb-1">Estado</label>
                      <select value={nuevoReclamo.estado} onChange={(e) => setNuevoReclamo((prev) => ({ ...prev, estado: e.target.value }))} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm">
                        <option value="PENDIENTE">PENDIENTE</option>
                        <option value="EN PROCESO">EN PROCESO</option>
                        <option value="RESUELTO">RESUELTO</option>
                      </select>
                    </div>
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancelar</button>
                    </DialogClose>
                    <button onClick={handleCrearReclamo} disabled={creando || !nuevoReclamo.proveedor_nombre || !nuevoReclamo.fecha_reclamo} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400 text-sm font-medium">
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
                <table className="w-full text-sm table-fixed">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[140px]">Proveedor</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[90px]">Empresa</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[100px]">Forma de pago</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[100px]">Fecha reclamo</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700 w-[100px]">Fecha pago</th>
                      <th className="px-3 py-3 text-left font-semibold text-gray-700">Observaciones</th>
                      <th className="px-3 py-3 text-center font-semibold text-gray-700 w-[120px]">Estado</th>
                      <th className="px-3 py-3 text-center font-semibold text-gray-700 w-[100px]">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedReclamos.map((r, idx) => (
                      <tr key={r.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        <td className="px-3 py-3 font-medium text-gray-900 truncate" title={r.proveedor_nombre || ""}>{r.proveedor_nombre}</td>
                        <td className="px-3 py-3 text-gray-600 truncate">{r.empresa || "-"}</td>
                        <td className="px-3 py-3 text-gray-600 truncate">{r.forma_pago || "-"}</td>
                        <td className="px-3 py-3 text-gray-600">{formatDateStr(r.fecha_reclamo)}</td>
                        <td className="px-3 py-3 text-gray-600">{formatDateStr(r.fecha_pago)}</td>
                        <td className="px-3 py-3 text-gray-600 truncate" title={r.observaciones || ""}>{r.observaciones || "-"}</td>
                        <td className="px-3 py-3 text-center" title={r.estado || ""}>
                          <div className="max-w-[120px] mx-auto truncate">{estadoBadge(r.estado || "")}</div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => setViewingReclamo(r)} className="p-1 hover:bg-gray-200 rounded" title="Ver detalle">
                              <Eye className="h-4 w-4 text-gray-600" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingReclamo(r)
                                setEditReclamoForm({
                                  proveedor_nombre: r.proveedor_nombre || "",
                                  empresa: r.empresa || "",
                                  forma_pago: r.forma_pago || "",
                                  observaciones: r.observaciones || "",
                                  estado: r.estado || "",
                                })
                              }}
                              className="p-1 hover:bg-gray-200 rounded"
                              title="Editar"
                            >
                              <Pencil className="h-4 w-4 text-blue-600" />
                            </button>
                            <button onClick={() => setDeletingReclamo(r)} className="p-1 hover:bg-gray-200 rounded" title="Eliminar">
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <TablePagination currentPage={reclamosCurrentPage} totalPages={reclamosTotalPages} totalItems={reclamosTotalItems} pageSize={reclamosPageSize} onPageChange={setReclamosPage} />
          </div>
        </TabsContent>
      </Tabs>

      {/* ========== DIALOGS - PAGOS ========== */}

      {/* View Pago */}
      <Dialog open={!!viewingPago} onOpenChange={(open) => !open && setViewingPago(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Detalle de Pago</DialogTitle></DialogHeader>
          {viewingPago && (
            <div className="space-y-2 text-sm">
              <div><strong>Proveedor:</strong> {viewingPago.proveedor_nombre || "-"}</div>
              <div><strong>CUIT:</strong> {viewingPago.cuit || "-"}</div>
              <div><strong>Empresa:</strong> {viewingPago.empresa || "-"}</div>
              <div><strong>Fecha FC:</strong> {formatDateStr(viewingPago.fecha_fc)}</div>
              <div><strong>Nro FC:</strong> {viewingPago.numero_fc || "-"}</div>
              <div><strong>Importe:</strong> {formatCurrency(Number(viewingPago.importe) || 0)}</div>
              <div><strong>Forma de pago:</strong> {viewingPago.forma_pago || "-"}</div>
              <div><strong>Estado:</strong> {viewingPago.estado_pago || "-"}</div>
              <div><strong>Banco:</strong> {viewingPago.banco || "-"}</div>
              <div><strong>Origen:</strong> {viewingPago.origen || "-"}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Pago */}
      <Dialog open={!!editingPago} onOpenChange={(open) => !open && setEditingPago(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Editar Pago</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600 block mb-1">Proveedor</label>
              <input type="text" value={editPagoForm.proveedor_nombre || ""} onChange={(e) => setEditPagoForm((f: any) => ({ ...f, proveedor_nombre: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Nro FC</label>
              <input type="text" value={editPagoForm.numero_fc || ""} onChange={(e) => setEditPagoForm((f: any) => ({ ...f, numero_fc: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Importe</label>
              <input type="number" value={editPagoForm.importe || 0} onChange={(e) => setEditPagoForm((f: any) => ({ ...f, importe: Number(e.target.value) }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Forma de pago</label>
              <input type="text" value={editPagoForm.forma_pago || ""} onChange={(e) => setEditPagoForm((f: any) => ({ ...f, forma_pago: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Estado</label>
              <select value={editPagoForm.estado_pago || ""} onChange={(e) => setEditPagoForm((f: any) => ({ ...f, estado_pago: e.target.value }))} className="w-full p-2 border rounded-lg text-sm">
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="PAGADO">PAGADO</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Banco</label>
              <input type="text" value={editPagoForm.banco || ""} onChange={(e) => setEditPagoForm((f: any) => ({ ...f, banco: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setEditingPago(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancelar</button>
            <button onClick={handleEditPago} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm">Guardar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Pago */}
      <Dialog open={!!deletingPago} onOpenChange={(open) => !open && setDeletingPago(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Confirmar eliminacion</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">Esta seguro que desea eliminar el pago de <strong>{deletingPago?.proveedor_nombre}</strong> - FC {deletingPago?.numero_fc}?</p>
          <DialogFooter>
            <button onClick={() => setDeletingPago(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancelar</button>
            <button onClick={handleDeletePago} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">Eliminar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== DIALOGS - RECLAMOS ========== */}

      {/* View Reclamo */}
      <Dialog open={!!viewingReclamo} onOpenChange={(open) => !open && setViewingReclamo(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Detalle de Reclamo</DialogTitle></DialogHeader>
          {viewingReclamo && (
            <div className="space-y-2 text-sm">
              <div><strong>Proveedor:</strong> {viewingReclamo.proveedor_nombre || "-"}</div>
              <div><strong>Empresa:</strong> {viewingReclamo.empresa || "-"}</div>
              <div><strong>Forma de pago:</strong> {viewingReclamo.forma_pago || "-"}</div>
              <div><strong>Fecha reclamo:</strong> {formatDateStr(viewingReclamo.fecha_reclamo)}</div>
              <div><strong>Fecha pago:</strong> {formatDateStr(viewingReclamo.fecha_pago)}</div>
              <div><strong>Observaciones:</strong> {viewingReclamo.observaciones || "-"}</div>
              <div><strong>Estado:</strong> {viewingReclamo.estado || "-"}</div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Reclamo */}
      <Dialog open={!!editingReclamo} onOpenChange={(open) => !open && setEditingReclamo(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Editar Reclamo</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600 block mb-1">Proveedor</label>
              <input type="text" value={editReclamoForm.proveedor_nombre || ""} onChange={(e) => setEditReclamoForm((f: any) => ({ ...f, proveedor_nombre: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Empresa</label>
              <input type="text" value={editReclamoForm.empresa || ""} onChange={(e) => setEditReclamoForm((f: any) => ({ ...f, empresa: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Observaciones</label>
              <textarea value={editReclamoForm.observaciones || ""} onChange={(e) => setEditReclamoForm((f: any) => ({ ...f, observaciones: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" rows={3} />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Estado</label>
              <select value={editReclamoForm.estado || ""} onChange={(e) => setEditReclamoForm((f: any) => ({ ...f, estado: e.target.value }))} className="w-full p-2 border rounded-lg text-sm">
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="EN PROCESO">EN PROCESO</option>
                <option value="RESUELTO">RESUELTO</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setEditingReclamo(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancelar</button>
            <button onClick={handleEditReclamo} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm">Guardar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Reclamo */}
      <Dialog open={!!deletingReclamo} onOpenChange={(open) => !open && setDeletingReclamo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Confirmar eliminacion</DialogTitle></DialogHeader>
          <p className="text-sm text-gray-600">Esta seguro que desea eliminar el reclamo de <strong>{deletingReclamo?.proveedor_nombre}</strong>?</p>
          <DialogFooter>
            <button onClick={() => setDeletingReclamo(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancelar</button>
            <button onClick={handleDeleteReclamo} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">Eliminar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
