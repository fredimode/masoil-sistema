"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import * as XLSX from "xlsx"
import { formatCurrency, formatDateStr, normalizeSearch } from "@/lib/utils"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import {
  fetchPagosProveedores,
  fetchReclamos,
  fetchProveedores,
  fetchCuentaCorrienteProveedor,
  fetchFacturasProveedor,
  updateEstadoPago,
  createReclamo,
  deletePagoProveedor,
  updatePagoProveedor,
  deleteReclamo,
  updateReclamo,
  fetchLotesPago,
  fetchLotePagoItems,
  createLotePago,
  updateLotePago,
  deleteLotePago,
  updateLotePagoItem,
  enviarFacturaALote,
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
import { Eye, Pencil, Trash2, Paperclip, Mail, RefreshCw, ChevronDown, ChevronUp, Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

// ─── Vencimiento color helpers ──────────────────────────────────────────────

function vencimientoColor(fechaVenc: string | null | undefined): "red" | "yellow" | "green" | "gray" {
  if (!fechaVenc) return "gray"
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const venc = new Date(fechaVenc)
  venc.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((venc.getTime() - hoy.getTime()) / 86400000)
  if (diffDays < 0) return "red"
  if (diffDays <= 7) return "yellow"
  return "green"
}

function vencimientoBg(color: "red" | "yellow" | "green" | "gray") {
  switch (color) {
    case "red": return "bg-red-50 border-l-4 border-l-red-500"
    case "yellow": return "bg-yellow-50 border-l-4 border-l-yellow-400"
    case "green": return "bg-green-50 border-l-4 border-l-green-500"
    default: return ""
  }
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function PagosPage() {
  const [loading, setLoading] = useState(true)
  const [pagos, setPagos] = useState<any[]>([])
  const [reclamos, setReclamos] = useState<any[]>([])
  const [proveedoresList, setProveedoresList] = useState<any[]>([])
  const [facturasProveedor, setFacturasProveedor] = useState<any[]>([])
  const [empresaGlobal, setEmpresaGlobal] = useState("Todos")
  const [expandedProv, setExpandedProv] = useState<string | null>(null)
  const [expandedCC, setExpandedCC] = useState<any[]>([])
  const [loadingCC, setLoadingCC] = useState(false)
  const [provSearch, setProvSearch] = useState("")
  const [filtroVencimiento, setFiltroVencimiento] = useState("Todos")

  // Lotes de pago
  const [lotes, setLotes] = useState<any[]>([])
  const [loteItems, setLoteItems] = useState<Record<string, any[]>>({})
  const [expandedLote, setExpandedLote] = useState<string | null>(null)
  const [loadingLoteItems, setLoadingLoteItems] = useState(false)
  const [filtroLoteFecha, setFiltroLoteFecha] = useState("")
  const [filtroLoteEstado, setFiltroLoteEstado] = useState("Todos")
  const [filtroLoteEmpresa, setFiltroLoteEmpresa] = useState("Todos")
  const [nuevoLoteOpen, setNuevoLoteOpen] = useState(false)
  const [nuevoLoteFecha, setNuevoLoteFecha] = useState(new Date().toISOString().slice(0, 10))
  const [nuevoLoteEmpresa, setNuevoLoteEmpresa] = useState("")
  const [creandoLote, setCreandoLote] = useState(false)

  // Pagination
  const [pagosPage, setPagosPage] = useState(1)
  const [reclamosPage, setReclamosPage] = useState(1)

  // Filtros pagos (programación reemplazada por lotes)
  const [busquedaPagos, setBusquedaPagos] = useState("")
  const [filtroEstado, setFiltroEstado] = useState("Todos")
  const [filtroEmpresaPagos, setFiltroEmpresaPagos] = useState("Todos")
  const [filtroFormaPago, setFiltroFormaPago] = useState("Todos")
  const [filtroFechaDesde, setFiltroFechaDesde] = useState("")
  const [filtroFechaHasta, setFiltroFechaHasta] = useState("")

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

  // Enviar a lote dialog
  const [enviarALoteFC, setEnviarALoteFC] = useState<any | null>(null)
  const [enviarALoteId, setEnviarALoteId] = useState("")
  const [enviandoALote, setEnviandoALote] = useState(false)

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
      const [pagosData, reclamosData, provsData, lotesData, fcProvData] = await Promise.all([
        fetchPagosProveedores(),
        fetchReclamos(),
        fetchProveedores(),
        fetchLotesPago(),
        fetchFacturasProveedor(),
      ])
      setPagos(pagosData)
      setReclamos(reclamosData)
      setProveedoresList(provsData)
      setLotes(lotesData)
      setFacturasProveedor(fcProvData)
    } catch (error) {
      console.error("Error cargando datos:", error)
    } finally {
      setLoading(false)
    }
  }

  async function toggleProveedor(provId: string) {
    if (expandedProv === provId) {
      setExpandedProv(null)
      return
    }
    setExpandedProv(provId)
    setLoadingCC(true)
    try {
      const cc = await fetchCuentaCorrienteProveedor(provId)
      setExpandedCC(cc)
    } catch {
      setExpandedCC([])
    } finally {
      setLoadingCC(false)
    }
  }

  // Facturas pendientes por proveedor (for Proveedores/CtaCte tab with vencimiento colors)
  const facturasPendientesByProv = useMemo(() => {
    const map: Record<string, any[]> = {}
    facturasProveedor
      .filter((f) => f.estado !== "pagada" && (f.saldo_pendiente > 0 || f.total > 0))
      .forEach((f) => {
        const key = f.proveedor_id
        if (!map[key]) map[key] = []
        map[key].push(f)
      })
    return map
  }, [facturasProveedor])

  const proveedoresFiltrados = useMemo(() => {
    let list = proveedoresList
    if (empresaGlobal !== "Todos") {
      list = list.filter((p) => p.empresa === empresaGlobal || !p.empresa)
    }
    if (provSearch.trim()) {
      const q = normalizeSearch(provSearch)
      list = list.filter((p) => normalizeSearch(p.nombre || "").includes(q))
    }
    // Filtro vencimiento
    if (filtroVencimiento !== "Todos") {
      list = list.filter((p) => {
        const fcs = facturasPendientesByProv[p.id] || []
        if (fcs.length === 0) return false
        return fcs.some((f) => {
          const c = vencimientoColor(f.fecha_vencimiento)
          if (filtroVencimiento === "Vencidos") return c === "red"
          if (filtroVencimiento === "Por vencer") return c === "yellow"
          if (filtroVencimiento === "En plazo") return c === "green"
          return true
        })
      })
    }
    return list
  }, [proveedoresList, empresaGlobal, provSearch, filtroVencimiento, facturasPendientesByProv])

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
      setNuevoReclamo({ proveedor_nombre: "", empresa: "", forma_pago: "", fecha_reclamo: "", observaciones: "", estado: "PENDIENTE" })
      setDialogOpen(false)
      await cargarDatos()
    } catch (error) {
      console.error("Error creando reclamo:", error)
    } finally {
      setCreando(false)
    }
  }

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

  // Lotes
  async function handleCrearLote() {
    setCreandoLote(true)
    try {
      await createLotePago({ fecha_lote: nuevoLoteFecha, empresa: nuevoLoteEmpresa || null })
      setNuevoLoteOpen(false)
      await cargarDatos()
    } catch (err) {
      console.error("Error creando lote:", err)
      alert("Error al crear lote")
    } finally {
      setCreandoLote(false)
    }
  }

  async function toggleLote(loteId: string) {
    if (expandedLote === loteId) {
      setExpandedLote(null)
      return
    }
    setExpandedLote(loteId)
    if (!loteItems[loteId]) {
      setLoadingLoteItems(true)
      try {
        const items = await fetchLotePagoItems(loteId)
        setLoteItems((prev) => ({ ...prev, [loteId]: items }))
      } catch {
        setLoteItems((prev) => ({ ...prev, [loteId]: [] }))
      } finally {
        setLoadingLoteItems(false)
      }
    }
  }

  async function handleAprobarLote(loteId: string) {
    try {
      await updateLotePago(loteId, { estado: "aprobado", aprobado_at: new Date().toISOString() })
      await cargarDatos()
    } catch (err) {
      console.error("Error aprobando lote:", err)
    }
  }

  async function handleEnviarALote() {
    if (!enviarALoteFC || !enviarALoteId) return
    setEnviandoALote(true)
    try {
      await enviarFacturaALote(enviarALoteFC.id, enviarALoteId, {
        proveedor_nombre: enviarALoteFC.proveedor_nombre,
        proveedor_cuit: enviarALoteFC.cuit || "",
        empresa: enviarALoteFC.razon_social || "",
        fecha_fc: enviarALoteFC.fecha,
        nro_fc: enviarALoteFC.punto_venta && enviarALoteFC.numero
          ? `${String(enviarALoteFC.punto_venta).padStart(4, "0")}-${String(enviarALoteFC.numero).padStart(8, "0")}`
          : "",
        importe: Number(enviarALoteFC.saldo_pendiente || enviarALoteFC.total || 0),
      })
      setEnviarALoteFC(null)
      setEnviarALoteId("")
      // Refresh lote items if expanded
      if (expandedLote) {
        const items = await fetchLotePagoItems(expandedLote)
        setLoteItems((prev) => ({ ...prev, [expandedLote!]: items }))
      }
      await cargarDatos()
      alert("Factura enviada al lote")
    } catch (err) {
      console.error("Error enviando a lote:", err)
      alert("Error al enviar a lote")
    } finally {
      setEnviandoALote(false)
    }
  }

  function exportarLoteXLSX(loteId: string) {
    const items = loteItems[loteId] || []
    const ws = XLSX.utils.json_to_sheet(items.map((i) => ({
      Proveedor: i.proveedor_nombre,
      CUIT: i.proveedor_cuit,
      Empresa: i.empresa,
      "Fecha FC": formatDateStr(i.fecha_fc),
      "Nro FC": i.nro_fc,
      Importe: Number(i.importe) || 0,
      "Forma pago": i.forma_pago || "",
      Estado: i.estado,
      "Valores utilizados": i.valores_utilizados || "",
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Lote")
    XLSX.writeFile(wb, `lote_pago_${loteId.slice(0, 8)}.xlsx`)
  }

  // Lotes borrador for "enviar a lote"
  const lotesBorrador = useMemo(() => lotes.filter((l) => l.estado === "borrador"), [lotes])

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
      const fechaPago = p.created_at ? p.created_at.slice(0, 10) : ""
      const matchFechaDesde = !filtroFechaDesde || fechaPago >= filtroFechaDesde
      const matchFechaHasta = !filtroFechaHasta || fechaPago <= filtroFechaHasta
      return matchBusqueda && matchEstado && matchEmpresa && matchForma && matchFechaDesde && matchFechaHasta
    })
  }, [pagos, busquedaPagos, filtroEstado, filtroEmpresaPagos, filtroFormaPago, filtroFechaDesde, filtroFechaHasta])

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

  // Filtrado lotes
  const lotesFiltrados = useMemo(() => {
    return lotes.filter((l) => {
      const matchFecha = !filtroLoteFecha || l.fecha_lote === filtroLoteFecha
      const matchEstado = filtroLoteEstado === "Todos" || l.estado === filtroLoteEstado
      const matchEmpresa = filtroLoteEmpresa === "Todos" || l.empresa === filtroLoteEmpresa
      return matchFecha && matchEstado && matchEmpresa
    })
  }, [lotes, filtroLoteFecha, filtroLoteEstado, filtroLoteEmpresa])

  // Pagination
  const { totalPages: pagosTotalPages, totalItems: pagosTotalItems, pageSize: pagosPageSize, getPage: getPagosPage } = usePagination(pagosFiltrados, 50)
  const pagosCurrentPage = Math.min(pagosPage, pagosTotalPages)
  const paginatedPagos = getPagosPage(pagosCurrentPage)

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
    if (estado === "PAGADO" || estado === "pagado") return <Badge className="bg-green-100 text-green-700 border-green-200">{estado}</Badge>
    if (estado === "PENDIENTE" || estado === "pendiente") return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">{estado}</Badge>
    if (estado === "aprobado") return <Badge className="bg-blue-100 text-blue-700 border-blue-200">{estado}</Badge>
    if (estado === "borrador") return <Badge className="bg-gray-100 text-gray-700 border-gray-200">{estado}</Badge>
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
        <Link href="/admin/pagos/nuevo" className="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium flex items-center gap-2">
          <Plus className="h-4 w-4" /> Nuevo Pago
        </Link>
      </div>

      {/* Empresa filter */}
      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm font-medium text-gray-600">Empresa:</label>
        <select
          value={empresaGlobal}
          onChange={(e) => setEmpresaGlobal(e.target.value)}
          className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
        >
          <option value="Todos">Todas</option>
          <option value="Aquiles">Aquiles</option>
          <option value="Conancap">Conancap</option>
          <option value="Masoil">Masoil</option>
        </select>
      </div>

      <Tabs defaultValue="proveedores">
        <TabsList>
          <TabsTrigger value="proveedores">Proveedores / Cta Cte</TabsTrigger>
          <TabsTrigger value="lote-pago">Lote de Pago</TabsTrigger>
          <TabsTrigger value="reclamos">Reclamos</TabsTrigger>
        </TabsList>

        {/* ============ TAB PROVEEDORES / CTA CTE ============ */}
        <TabsContent value="proveedores">
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Buscar proveedor..."
                value={provSearch}
                onChange={(e) => setProvSearch(e.target.value)}
                className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm w-64"
              />
              <select
                value={filtroVencimiento}
                onChange={(e) => setFiltroVencimiento(e.target.value)}
                className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              >
                <option value="Todos">Vencimiento: Todos</option>
                <option value="Vencidos">Vencidos</option>
                <option value="Por vencer">Por vencer (7 días)</option>
                <option value="En plazo">En plazo</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            {proveedoresFiltrados.length === 0 ? (
              <div className="text-center py-12 text-gray-500">No hay proveedores</div>
            ) : (
              proveedoresFiltrados.map((prov) => {
                const provFCs = facturasPendientesByProv[prov.id] || []
                const totalPendiente = provFCs.reduce((s, f) => s + (Number(f.saldo_pendiente || f.total) || 0), 0)
                const isExpanded = expandedProv === prov.id
                // Worst vencimiento color
                const worstColor = provFCs.reduce((worst, f) => {
                  const c = vencimientoColor(f.fecha_vencimiento)
                  if (c === "red") return "red"
                  if (c === "yellow" && worst !== "red") return "yellow"
                  return worst
                }, "green" as "red" | "yellow" | "green")

                return (
                  <div key={prov.id} className="bg-white rounded-lg shadow border">
                    <button
                      onClick={() => toggleProveedor(prov.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
                    >
                      <div>
                        <p className="font-semibold text-gray-900">{prov.nombre}</p>
                        <p className="text-xs text-gray-500">
                          {prov.cuit && <span className="mr-3">CUIT: {prov.cuit}</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        {provFCs.length > 0 && (
                          <Badge className={
                            worstColor === "red" ? "bg-red-100 text-red-700 border-red-200" :
                            worstColor === "yellow" ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
                            "bg-green-100 text-green-700 border-green-200"
                          }>
                            {provFCs.length} FC pend. - {formatCurrency(totalPendiente)}
                          </Badge>
                        )}
                        <span className="text-gray-400">{isExpanded ? "▲" : "▼"}</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="border-t p-4">
                        {/* Facturas pendientes con colores */}
                        {provFCs.length > 0 && (
                          <div className="mb-4">
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Facturas pendientes</h4>
                            <div className="space-y-1">
                              {provFCs.map((f) => {
                                const color = vencimientoColor(f.fecha_vencimiento)
                                return (
                                  <div key={f.id} className={`flex items-center justify-between text-sm px-3 py-2 rounded ${vencimientoBg(color)}`}>
                                    <div className="flex items-center gap-3">
                                      <span>{formatDateStr(f.fecha)}</span>
                                      <span className="font-medium">
                                        {f.tipo || "FC"} {f.punto_venta && f.numero ? `${String(f.punto_venta).padStart(4, "0")}-${String(f.numero).padStart(8, "0")}` : ""}
                                      </span>
                                      <span className="text-xs text-gray-500">
                                        Vto: {f.fecha_vencimiento ? formatDateStr(f.fecha_vencimiento) : "S/D"}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="font-bold">{formatCurrency(Number(f.saldo_pendiente || f.total) || 0)}</span>
                                      {!f.lote_pago_id && lotesBorrador.length > 0 && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setEnviarALoteFC(f) }}
                                          className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200"
                                        >
                                          Enviar a Lote
                                        </button>
                                      )}
                                      {f.lote_pago_id && (
                                        <Badge className="bg-indigo-50 text-indigo-600 border-indigo-200 text-xs">En lote</Badge>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Cuenta corriente */}
                        {loadingCC ? (
                          <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                          </div>
                        ) : expandedCC.length > 0 ? (
                          <div className="overflow-x-auto">
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Cuenta corriente</h4>
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-3 py-2 text-left font-medium text-gray-600">Fecha</th>
                                  <th className="px-3 py-2 text-left font-medium text-gray-600">Tipo</th>
                                  <th className="px-3 py-2 text-left font-medium text-gray-600">Comprobante</th>
                                  <th className="px-3 py-2 text-right font-medium text-gray-600">Debe</th>
                                  <th className="px-3 py-2 text-right font-medium text-gray-600">Haber</th>
                                  <th className="px-3 py-2 text-right font-medium text-gray-600">Saldo</th>
                                </tr>
                              </thead>
                              <tbody>
                                {expandedCC.map((m: any, i: number) => (
                                  <tr key={m.id || i} className={i % 2 ? "bg-gray-50" : ""}>
                                    <td className="px-3 py-2">{m.fecha ? new Date(m.fecha).toLocaleDateString("es-AR") : "-"}</td>
                                    <td className="px-3 py-2">{m.tipo_comprobante || "-"}</td>
                                    <td className="px-3 py-2">{m.numero_comprobante || "-"}</td>
                                    <td className="px-3 py-2 text-right">{m.debe ? formatCurrency(Number(m.debe)) : "-"}</td>
                                    <td className="px-3 py-2 text-right">{m.haber ? formatCurrency(Number(m.haber)) : "-"}</td>
                                    <td className="px-3 py-2 text-right font-medium">{formatCurrency(Number(m.saldo) || 0)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="text-center py-4 text-gray-500 text-sm">
                            Sin movimientos en cuenta corriente
                          </div>
                        )}
                        <div className="mt-3 flex justify-end">
                          <Link
                            href={`/admin/pagos/nuevo?proveedor_id=${prov.id}&proveedor_nombre=${encodeURIComponent(prov.nombre)}`}
                            className="px-3 py-1.5 bg-primary text-white rounded text-sm hover:bg-primary/90"
                          >
                            + Nuevo Pago
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </TabsContent>

        {/* ============ TAB LOTE DE PAGO ============ */}
        <TabsContent value="lote-pago">
          {/* Filtros */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Fecha de lote</label>
                <input type="date" value={filtroLoteFecha} onChange={(e) => setFiltroLoteFecha(e.target.value)} className="p-2 border rounded-lg text-sm" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Estado</label>
                <select value={filtroLoteEstado} onChange={(e) => setFiltroLoteEstado(e.target.value)} className="p-2 border rounded-lg text-sm">
                  <option value="Todos">Todos</option>
                  <option value="borrador">Borrador</option>
                  <option value="aprobado">Aprobado</option>
                  <option value="pagado">Pagado</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Empresa</label>
                <select value={filtroLoteEmpresa} onChange={(e) => setFiltroLoteEmpresa(e.target.value)} className="p-2 border rounded-lg text-sm">
                  <option value="Todos">Todas</option>
                  <option value="Masoil">Masoil</option>
                  <option value="Aquiles">Aquiles</option>
                  <option value="Conancap">Conancap</option>
                </select>
              </div>
              <div className="ml-auto flex gap-2">
                <Dialog open={nuevoLoteOpen} onOpenChange={setNuevoLoteOpen}>
                  <DialogTrigger asChild>
                    <button className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium">+ Crear Lote</button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader><DialogTitle>Crear Lote de Pago</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                      <div>
                        <label className="text-sm text-gray-600 block mb-1">Fecha del lote *</label>
                        <input type="date" value={nuevoLoteFecha} onChange={(e) => setNuevoLoteFecha(e.target.value)} className="w-full p-2 border rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="text-sm text-gray-600 block mb-1">Empresa</label>
                        <select value={nuevoLoteEmpresa} onChange={(e) => setNuevoLoteEmpresa(e.target.value)} className="w-full p-2 border rounded-lg text-sm">
                          <option value="">Todas</option>
                          <option value="Masoil">Masoil</option>
                          <option value="Aquiles">Aquiles</option>
                          <option value="Conancap">Conancap</option>
                        </select>
                      </div>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancelar</button>
                      </DialogClose>
                      <button onClick={handleCrearLote} disabled={creandoLote || !nuevoLoteFecha} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400 text-sm font-medium">
                        {creandoLote ? "Creando..." : "Crear Lote"}
                      </button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>

          {/* Listado de lotes */}
          <div className="space-y-3">
            {lotesFiltrados.length === 0 ? (
              <div className="text-center py-12 text-gray-500 bg-white rounded-lg shadow">No hay lotes de pago</div>
            ) : (
              lotesFiltrados.map((lote) => {
                const isExpanded = expandedLote === lote.id
                const items = loteItems[lote.id] || []
                // Group items by proveedor
                const groupedByProv: Record<string, any[]> = {}
                items.forEach((item) => {
                  const key = item.proveedor_nombre || "Sin proveedor"
                  if (!groupedByProv[key]) groupedByProv[key] = []
                  groupedByProv[key].push(item)
                })

                return (
                  <div key={lote.id} className="bg-white rounded-lg shadow border">
                    <button
                      onClick={() => toggleLote(lote.id)}
                      className="w-full flex items-center justify-between p-4 hover:bg-gray-50 text-left"
                    >
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="font-semibold text-gray-900">{formatDateStr(lote.fecha_lote)}</p>
                          <p className="text-xs text-gray-500">{lote.empresa || "Todas"}</p>
                        </div>
                        {estadoBadge(lote.estado)}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-bold text-gray-900">{formatCurrency(Number(lote.total) || 0)}</span>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t p-4">
                        {loadingLoteItems ? (
                          <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                          </div>
                        ) : items.length === 0 ? (
                          <p className="text-center text-gray-500 py-4 text-sm">Lote vacío — envíe facturas desde Proveedores / Cta Cte</p>
                        ) : (
                          <div className="space-y-4">
                            {Object.entries(groupedByProv).map(([provNombre, provItems]) => (
                              <div key={provNombre}>
                                <h4 className="font-semibold text-sm text-gray-800 mb-1">{provNombre} <span className="text-gray-400 font-normal">({provItems[0]?.proveedor_cuit || ""})</span></h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead className="bg-gray-50">
                                      <tr>
                                        <th className="px-2 py-1.5 text-left font-medium text-gray-600">Empresa</th>
                                        <th className="px-2 py-1.5 text-left font-medium text-gray-600">Fecha FC</th>
                                        <th className="px-2 py-1.5 text-left font-medium text-gray-600">Nro FC</th>
                                        <th className="px-2 py-1.5 text-right font-medium text-gray-600">Importe</th>
                                        <th className="px-2 py-1.5 text-left font-medium text-gray-600">Forma pago</th>
                                        <th className="px-2 py-1.5 text-center font-medium text-gray-600">Estado</th>
                                        <th className="px-2 py-1.5 text-left font-medium text-gray-600">Valores utilizados</th>
                                        <th className="px-2 py-1.5 text-center font-medium text-gray-600">OP</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {provItems.map((item, idx) => (
                                        <tr key={item.id} className={idx % 2 ? "bg-gray-50" : ""}>
                                          <td className="px-2 py-1.5">{item.empresa || "-"}</td>
                                          <td className="px-2 py-1.5">{formatDateStr(item.fecha_fc)}</td>
                                          <td className="px-2 py-1.5">{item.nro_fc || "-"}</td>
                                          <td className="px-2 py-1.5 text-right font-bold">{formatCurrency(Number(item.importe) || 0)}</td>
                                          <td className="px-2 py-1.5">
                                            <input
                                              type="text"
                                              value={item.forma_pago || ""}
                                              onChange={async (e) => {
                                                const val = e.target.value
                                                setLoteItems((prev) => ({
                                                  ...prev,
                                                  [lote.id]: (prev[lote.id] || []).map((i) => i.id === item.id ? { ...i, forma_pago: val } : i)
                                                }))
                                                try { await updateLotePagoItem(item.id, { forma_pago: val }) } catch {}
                                              }}
                                              className="w-full border rounded px-1.5 py-1 text-xs"
                                              placeholder="Transferencia, Cheque..."
                                            />
                                          </td>
                                          <td className="px-2 py-1.5 text-center">{estadoBadge(item.estado)}</td>
                                          <td className="px-2 py-1.5">
                                            <input
                                              type="text"
                                              value={item.valores_utilizados || ""}
                                              onChange={async (e) => {
                                                const val = e.target.value
                                                setLoteItems((prev) => ({
                                                  ...prev,
                                                  [lote.id]: (prev[lote.id] || []).map((i) => i.id === item.id ? { ...i, valores_utilizados: val } : i)
                                                }))
                                                try { await updateLotePagoItem(item.id, { valores_utilizados: val }) } catch {}
                                              }}
                                              className="w-full border rounded px-1.5 py-1 text-xs"
                                              placeholder="Detalles de valores..."
                                            />
                                          </td>
                                          <td className="px-2 py-1.5 text-center">
                                            <Link
                                              href={`/admin/pagos/nuevo?proveedor_nombre=${encodeURIComponent(item.proveedor_nombre || "")}&importe=${item.importe || ""}&nro_fc=${encodeURIComponent(item.nro_fc || "")}`}
                                              className="text-xs text-blue-600 hover:underline"
                                            >
                                              Generar OP
                                            </Link>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Lote actions */}
                        <div className="mt-4 flex justify-end gap-2">
                          {lote.estado === "borrador" && (
                            <button
                              onClick={() => handleAprobarLote(lote.id)}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                            >
                              Aprobar Lote
                            </button>
                          )}
                          <button
                            onClick={() => exportarLoteXLSX(lote.id)}
                            disabled={items.length === 0}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50"
                          >
                            Exportar XLSX
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </TabsContent>

        {/* ============ TAB RECLAMOS ============ */}
        <TabsContent value="reclamos">
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

      {/* ========== DIALOGS ========== */}

      {/* Enviar a Lote Dialog */}
      <Dialog open={!!enviarALoteFC} onOpenChange={(open) => !open && setEnviarALoteFC(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Enviar Factura a Lote de Pago</DialogTitle></DialogHeader>
          {enviarALoteFC && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-gray-600">
                <strong>{enviarALoteFC.proveedor_nombre}</strong> — {formatCurrency(Number(enviarALoteFC.saldo_pendiente || enviarALoteFC.total) || 0)}
              </p>
              <div>
                <label className="text-sm text-gray-600 block mb-1">Seleccionar lote (borrador)</label>
                <select
                  value={enviarALoteId}
                  onChange={(e) => setEnviarALoteId(e.target.value)}
                  className="w-full p-2 border rounded-lg text-sm"
                >
                  <option value="">Seleccionar...</option>
                  {lotesBorrador.map((l) => (
                    <option key={l.id} value={l.id}>
                      {formatDateStr(l.fecha_lote)} - {l.empresa || "Todas"} ({formatCurrency(Number(l.total) || 0)})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <DialogFooter>
            <button onClick={() => setEnviarALoteFC(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancelar</button>
            <button onClick={handleEnviarALote} disabled={enviandoALote || !enviarALoteId} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400 text-sm font-medium">
              {enviandoALote ? "Enviando..." : "Enviar a Lote"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              {viewingPago.orden_pago_numero && (
                <div><strong>Orden de Pago:</strong> {viewingPago.orden_pago_numero}</div>
              )}
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
