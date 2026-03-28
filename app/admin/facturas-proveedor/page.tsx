"use client"

import { useState, useEffect, useMemo } from "react"
import { formatCurrency, normalizeSearch } from "@/lib/utils"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import {
  fetchProveedores,
  fetchOrdenesCompra,
  fetchFacturasProveedor,
  createFacturaProveedor,
  updateOrdenCompra,
  deleteFacturaProveedor,
} from "@/lib/supabase/queries"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Eye, Trash2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

function estadoBadge(estado: string) {
  const lower = (estado || "").toLowerCase()
  if (lower === "pendiente")
    return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Pendiente</Badge>
  if (lower === "pagada_parcial")
    return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Pagada Parcial</Badge>
  if (lower === "pagada")
    return <Badge className="bg-green-100 text-green-800 border-green-200">Pagada</Badge>
  return <Badge variant="outline">{estado || "-"}</Badge>
}

const INITIAL_FORM = {
  proveedor_id: "",
  proveedor_nombre: "",
  cuit: "",
  tipo: "FACTURA",
  letra: "A",
  punto_venta: "",
  numero: "",
  fecha: "",
  fecha_vencimiento: "",
  neto: "",
  iva: "",
  percepciones_iva: "",
  percepciones_iibb: "",
  otros_impuestos: "",
  total: "",
  razon_social: "",
  orden_compra_id: "",
  observaciones: "",
}

export default function FacturasProveedorPage() {
  const [loading, setLoading] = useState(true)
  const [facturas, setFacturas] = useState<any[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [ordenes, setOrdenes] = useState<any[]>([])

  // Pagination
  const [page, setPage] = useState(1)

  // Filters
  const [busqueda, setBusqueda] = useState("")
  const [filtroEstado, setFiltroEstado] = useState("")
  const [filtroRazonSocial, setFiltroRazonSocial] = useState("")

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ ...INITIAL_FORM })
  const [guardando, setGuardando] = useState(false)
  const [archivo, setArchivo] = useState<File | null>(null)

  // Proveedor autocomplete
  const [proveedorSearch, setProveedorSearch] = useState("")
  const [showProveedorList, setShowProveedorList] = useState(false)

  // View / Delete dialogs
  const [viewing, setViewing] = useState<any | null>(null)
  const [deleting, setDeleting] = useState<any | null>(null)

  async function loadData() {
    setLoading(true)
    try {
      const [f, p, o] = await Promise.all([
        fetchFacturasProveedor(),
        fetchProveedores(),
        fetchOrdenesCompra(),
      ])
      setFacturas(f)
      setProveedores(p)
      setOrdenes(o)
    } catch (err) {
      console.error("Error cargando facturas proveedor:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // --- Derived data ---
  const facturasFiltradas = useMemo(() => {
    return facturas.filter((f) => {
      const matchBusqueda =
        !busqueda ||
        normalizeSearch(f.proveedor_nombre || "").includes(normalizeSearch(busqueda)) ||
        normalizeSearch(f.cuit || "").includes(normalizeSearch(busqueda))
      const matchEstado = !filtroEstado || f.estado === filtroEstado
      const matchRazon = !filtroRazonSocial || f.razon_social === filtroRazonSocial
      return matchBusqueda && matchEstado && matchRazon
    })
  }, [facturas, busqueda, filtroEstado, filtroRazonSocial])

  const { totalPages, totalItems, pageSize, getPage } = usePagination(facturasFiltradas, 50)
  const currentPage = Math.min(page, totalPages)
  const paginatedFacturas = getPage(currentPage)

  const totalFacturas = facturas.length
  const pendientes = facturas.filter((f) => f.estado === "pendiente").length
  const pagadasParcial = facturas.filter((f) => f.estado === "pagada_parcial").length
  const pagadas = facturas.filter((f) => f.estado === "pagada").length

  // Proveedor autocomplete filtered
  const proveedoresFiltrados = useMemo(() => {
    if (!proveedorSearch) return []
    const q = normalizeSearch(proveedorSearch)
    return proveedores.filter(
      (p) =>
        normalizeSearch(p.nombre || "").includes(q) ||
        normalizeSearch(p.cuit || "").includes(q)
    ).slice(0, 10)
  }, [proveedores, proveedorSearch])

  // OC for selected proveedor
  const ordenesProveedor = useMemo(() => {
    if (!form.proveedor_id) return []
    return ordenes.filter((o) => o.proveedor_id === form.proveedor_id)
  }, [ordenes, form.proveedor_id])

  // Auto-calculate IVA when neto changes
  function handleNetoChange(value: string) {
    const neto = parseFloat(value) || 0
    const iva = Math.round(neto * 0.21 * 100) / 100
    setForm((prev) => ({
      ...prev,
      neto: value,
      iva: iva.toString(),
      total: calcTotal(value, iva.toString(), prev.percepciones_iva, prev.percepciones_iibb, prev.otros_impuestos),
    }))
  }

  function handleIvaChange(value: string) {
    setForm((prev) => ({
      ...prev,
      iva: value,
      total: calcTotal(prev.neto, value, prev.percepciones_iva, prev.percepciones_iibb, prev.otros_impuestos),
    }))
  }

  function handleImpuestoChange(field: string, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      next.total = calcTotal(next.neto, next.iva, next.percepciones_iva, next.percepciones_iibb, next.otros_impuestos)
      return next
    })
  }

  function calcTotal(neto: string, iva: string, percIva: string, percIibb: string, otros: string) {
    const sum =
      (parseFloat(neto) || 0) +
      (parseFloat(iva) || 0) +
      (parseFloat(percIva) || 0) +
      (parseFloat(percIibb) || 0) +
      (parseFloat(otros) || 0)
    return (Math.round(sum * 100) / 100).toString()
  }

  function selectProveedor(prov: any) {
    setForm((prev) => ({
      ...prev,
      proveedor_id: prov.id,
      proveedor_nombre: prov.nombre || "",
      cuit: prov.cuit || "",
      razon_social: prov.empresa || "",
    }))
    setProveedorSearch(prov.nombre || "")
    setShowProveedorList(false)
  }

  async function handleGuardar() {
    if (!form.proveedor_nombre || !form.fecha || !form.neto) {
      alert("Completar proveedor, fecha y neto")
      return
    }
    setGuardando(true)
    try {
      const totalNum = parseFloat(form.total) || 0
      const facturaData: Record<string, any> = {
        proveedor_id: form.proveedor_id || null,
        proveedor_nombre: form.proveedor_nombre,
        cuit: form.cuit || null,
        tipo: form.tipo,
        letra: form.letra,
        punto_venta: form.punto_venta || null,
        numero: form.numero || null,
        fecha: form.fecha,
        fecha_vencimiento: form.fecha_vencimiento || null,
        neto: parseFloat(form.neto) || 0,
        iva: parseFloat(form.iva) || 0,
        percepciones_iva: parseFloat(form.percepciones_iva) || 0,
        percepciones_iibb: parseFloat(form.percepciones_iibb) || 0,
        otros_impuestos: parseFloat(form.otros_impuestos) || 0,
        total: totalNum,
        saldo_pendiente: totalNum,
        estado: "pendiente",
        razon_social: form.razon_social || null,
        orden_compra_id: form.orden_compra_id || null,
        observaciones: form.observaciones || null,
      }

      const id = await createFacturaProveedor(facturaData)

      // Upload file if present
      if (archivo && id) {
        const ext = archivo.name.split(".").pop() || "pdf"
        const path = `facturas/${id}/${Date.now()}.${ext}`
        const supabase = createClient()
        await supabase.storage.from("comprobantes").upload(path, archivo)
      }

      // If linked to OC, update OC estado
      if (form.orden_compra_id) {
        try {
          await updateOrdenCompra(form.orden_compra_id, { estado: "Factura Cargada" })
        } catch (err) {
          console.error("Error actualizando OC:", err)
        }
      }

      setForm({ ...INITIAL_FORM })
      setProveedorSearch("")
      setArchivo(null)
      setDialogOpen(false)
      await loadData()
    } catch (err) {
      console.error("Error guardando factura:", err)
      alert("Error al guardar la factura")
    } finally {
      setGuardando(false)
    }
  }

  async function handleDelete() {
    if (!deleting) return
    try {
      await deleteFacturaProveedor(deleting.id)
      setDeleting(null)
      await loadData()
    } catch (err) {
      console.error("Error eliminando factura:", err)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2 text-gray-600">Cargando facturas...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Facturas de Proveedores</h2>
          <p className="text-gray-500">Gestion de facturas recibidas de proveedores</p>
        </div>
        <button
          onClick={() => {
            setForm({ ...INITIAL_FORM })
            setProveedorSearch("")
            setArchivo(null)
            setDialogOpen(true)
          }}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 flex items-center gap-2"
        >
          + Cargar Factura
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border shadow-sm">
          <p className="text-sm text-gray-500">Total Facturas</p>
          <p className="text-2xl font-bold text-gray-900">{totalFacturas}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 shadow-sm">
          <p className="text-sm text-amber-600">Pendientes</p>
          <p className="text-2xl font-bold text-amber-700">{pendientes}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 shadow-sm">
          <p className="text-sm text-blue-600">Pagadas Parcial</p>
          <p className="text-2xl font-bold text-blue-700">{pagadasParcial}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200 shadow-sm">
          <p className="text-sm text-green-600">Pagadas</p>
          <p className="text-2xl font-bold text-green-700">{pagadas}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar proveedor o CUIT..."
          value={busqueda}
          onChange={(e) => { setBusqueda(e.target.value); setPage(1) }}
          className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm flex-1 min-w-[200px]"
        />
        <select
          value={filtroEstado}
          onChange={(e) => { setFiltroEstado(e.target.value); setPage(1) }}
          className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
        >
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="pagada_parcial">Pagada Parcial</option>
          <option value="pagada">Pagada</option>
        </select>
        <select
          value={filtroRazonSocial}
          onChange={(e) => { setFiltroRazonSocial(e.target.value); setPage(1) }}
          className="p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
        >
          <option value="">Todas las razones sociales</option>
          <option value="Masoil">Masoil</option>
          <option value="Aquiles">Aquiles</option>
          <option value="Conancap">Conancap</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {facturasFiltradas.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No se encontraron facturas</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 80 }}>Fecha</th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 130 }}>Proveedor</th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 60 }}>Tipo</th>
                  <th className="px-2 py-3 text-center font-semibold text-gray-700" style={{ width: 40 }}>Letra</th>
                  <th className="px-2 py-3 text-left font-semibold text-gray-700" style={{ width: 100 }}>PV-Numero</th>
                  <th className="px-2 py-3 text-right font-semibold text-gray-700" style={{ width: 90 }}>Neto</th>
                  <th className="px-2 py-3 text-right font-semibold text-gray-700" style={{ width: 80 }}>IVA</th>
                  <th className="px-2 py-3 text-right font-semibold text-gray-700" style={{ width: 90 }}>Total</th>
                  <th className="px-2 py-3 text-center font-semibold text-gray-700" style={{ width: 100 }}>Estado</th>
                  <th className="px-2 py-3 text-right font-semibold text-gray-700" style={{ width: 100 }}>Saldo Pend.</th>
                  <th className="px-2 py-3 text-center font-semibold text-gray-700" style={{ width: 70 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFacturas.map((f: any, idx: number) => (
                  <tr key={f.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-2 py-2 text-gray-600 text-xs">
                      {f.fecha ? new Date(f.fecha).toLocaleDateString("es-AR") : "-"}
                    </td>
                    <td className="px-2 py-2 font-medium text-gray-900 truncate" title={f.proveedor_nombre || ""}>
                      {f.proveedor_nombre || "-"}
                      {f.tipo === "NOTA_CREDITO" && (
                        <Badge className="ml-1 bg-purple-100 text-purple-800 border-purple-200 text-[10px]">NC</Badge>
                      )}
                    </td>
                    <td className="px-2 py-2 text-gray-600 text-xs">
                      {f.tipo === "NOTA_CREDITO" ? (
                        <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px]">Nota de Credito</Badge>
                      ) : (
                        "Factura"
                      )}
                    </td>
                    <td className="px-2 py-2 text-center text-gray-600">{f.letra || "-"}</td>
                    <td className="px-2 py-2 text-gray-600 text-xs">
                      {f.punto_venta || "-"}-{f.numero || "-"}
                    </td>
                    <td className="px-2 py-2 text-right text-gray-600">{formatCurrency(Number(f.neto) || 0)}</td>
                    <td className="px-2 py-2 text-right text-gray-600">{formatCurrency(Number(f.iva) || 0)}</td>
                    <td className="px-2 py-2 text-right font-medium text-gray-900">{formatCurrency(Number(f.total) || 0)}</td>
                    <td className="px-2 py-2 text-center">{estadoBadge(f.estado)}</td>
                    <td className="px-2 py-2 text-right text-gray-600">{formatCurrency(Number(f.saldo_pendiente) || 0)}</td>
                    <td className="px-2 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setViewing(f)}
                          className="p-1 rounded hover:bg-gray-200"
                          title="Ver detalle"
                        >
                          <Eye className="h-4 w-4 text-gray-500" />
                        </button>
                        <button
                          onClick={() => setDeleting(f)}
                          className="p-1 rounded hover:bg-red-100"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </button>
                      </div>
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

      {/* ==================== DIALOG: Cargar Factura ==================== */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cargar Factura de Proveedor</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Proveedor autocomplete */}
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor *</label>
              <input
                type="text"
                placeholder="Buscar por nombre o CUIT..."
                value={proveedorSearch}
                onChange={(e) => {
                  setProveedorSearch(e.target.value)
                  setShowProveedorList(true)
                  if (!e.target.value) {
                    setForm((prev) => ({ ...prev, proveedor_id: "", proveedor_nombre: "", cuit: "" }))
                  }
                }}
                onFocus={() => proveedorSearch && setShowProveedorList(true)}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              />
              {showProveedorList && proveedoresFiltrados.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {proveedoresFiltrados.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => selectProveedor(p)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm border-b last:border-0"
                    >
                      <span className="font-medium">{p.nombre}</span>
                      {p.cuit && <span className="ml-2 text-gray-500">CUIT: {p.cuit}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* CUIT + Razon Social (auto-filled) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CUIT</label>
                <input
                  type="text"
                  value={form.cuit}
                  onChange={(e) => setForm((prev) => ({ ...prev, cuit: e.target.value }))}
                  className="w-full p-2 border rounded-lg bg-gray-50 text-sm"
                  placeholder="Auto-completado"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Razon Social</label>
                <select
                  value={form.razon_social}
                  onChange={(e) => setForm((prev) => ({ ...prev, razon_social: e.target.value }))}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                >
                  <option value="">Seleccionar...</option>
                  <option value="Masoil">Masoil</option>
                  <option value="Aquiles">Aquiles</option>
                  <option value="Conancap">Conancap</option>
                </select>
              </div>
            </div>

            {/* Tipo + Letra */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select
                  value={form.tipo}
                  onChange={(e) => setForm((prev) => ({ ...prev, tipo: e.target.value }))}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                >
                  <option value="FACTURA">Factura</option>
                  <option value="NOTA_CREDITO">Nota de Credito</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Letra</label>
                <select
                  value={form.letra}
                  onChange={(e) => setForm((prev) => ({ ...prev, letra: e.target.value }))}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </div>
            </div>

            {/* Punto de Venta + Numero */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Punto de Venta</label>
                <input
                  type="text"
                  value={form.punto_venta}
                  onChange={(e) => setForm((prev) => ({ ...prev, punto_venta: e.target.value }))}
                  placeholder="0001"
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Numero</label>
                <input
                  type="text"
                  value={form.numero}
                  onChange={(e) => setForm((prev) => ({ ...prev, numero: e.target.value }))}
                  placeholder="00000001"
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
            </div>

            {/* Fechas */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm((prev) => ({ ...prev, fecha: e.target.value }))}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Vencimiento</label>
                <input
                  type="date"
                  value={form.fecha_vencimiento}
                  onChange={(e) => setForm((prev) => ({ ...prev, fecha_vencimiento: e.target.value }))}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
            </div>

            {/* Neto + IVA */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Neto *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.neto}
                  onChange={(e) => handleNetoChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">IVA (21%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.iva}
                  onChange={(e) => handleIvaChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
            </div>

            {/* Percepciones + Otros */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Perc. IVA</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.percepciones_iva}
                  onChange={(e) => handleImpuestoChange("percepciones_iva", e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Perc. IIBB</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.percepciones_iibb}
                  onChange={(e) => handleImpuestoChange("percepciones_iibb", e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Otros Imp.</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.otros_impuestos}
                  onChange={(e) => handleImpuestoChange("otros_impuestos", e.target.value)}
                  placeholder="0.00"
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
            </div>

            {/* Total */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Total</label>
              <input
                type="text"
                value={form.total ? formatCurrency(parseFloat(form.total)) : "$0,00"}
                readOnly
                className="w-full p-2 border rounded-lg bg-gray-100 text-sm font-bold"
              />
            </div>

            {/* Vincular OC */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vincular con Orden de Compra</label>
              <select
                value={form.orden_compra_id}
                onChange={(e) => setForm((prev) => ({ ...prev, orden_compra_id: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              >
                <option value="">Sin vincular</option>
                {ordenesProveedor.map((o) => (
                  <option key={o.id} value={o.id}>
                    OC {o.nro_oc || o.id.slice(0, 8)} - {formatCurrency(Number(o.importe_total) || 0)} ({o.estado})
                  </option>
                ))}
              </select>
            </div>

            {/* Adjuntar factura */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adjuntar Factura</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                className="w-full p-2 border rounded-lg text-sm file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-primary file:text-white hover:file:bg-primary/90"
              />
              {archivo && <p className="text-xs text-gray-500 mt-1">{archivo.name}</p>}
            </div>

            {/* Observaciones */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
              <textarea
                value={form.observaciones}
                onChange={(e) => setForm((prev) => ({ ...prev, observaciones: e.target.value }))}
                rows={3}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                placeholder="Notas adicionales..."
              />
            </div>
          </div>

          <DialogFooter>
            <button
              onClick={() => setDialogOpen(false)}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar Factura"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== DIALOG: Ver Detalle ==================== */}
      <Dialog open={!!viewing} onOpenChange={() => setViewing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Detalle de Factura
              {viewing?.tipo === "NOTA_CREDITO" && (
                <Badge className="ml-2 bg-purple-100 text-purple-800 border-purple-200">(Nota de Credito)</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-gray-500">Proveedor:</span> <span className="font-medium">{viewing.proveedor_nombre}</span></div>
                <div><span className="text-gray-500">CUIT:</span> <span className="font-medium">{viewing.cuit || "-"}</span></div>
                <div><span className="text-gray-500">Tipo:</span> <span className="font-medium">{viewing.tipo === "NOTA_CREDITO" ? "Nota de Credito" : "Factura"}</span></div>
                <div><span className="text-gray-500">Letra:</span> <span className="font-medium">{viewing.letra || "-"}</span></div>
                <div><span className="text-gray-500">PV-Numero:</span> <span className="font-medium">{viewing.punto_venta || "-"}-{viewing.numero || "-"}</span></div>
                <div><span className="text-gray-500">Fecha:</span> <span className="font-medium">{viewing.fecha ? new Date(viewing.fecha).toLocaleDateString("es-AR") : "-"}</span></div>
                <div><span className="text-gray-500">Vencimiento:</span> <span className="font-medium">{viewing.fecha_vencimiento ? new Date(viewing.fecha_vencimiento).toLocaleDateString("es-AR") : "-"}</span></div>
                <div><span className="text-gray-500">Razon Social:</span> <span className="font-medium">{viewing.razon_social || "-"}</span></div>
              </div>
              <hr />
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-gray-500">Neto:</span> <span className="font-medium">{formatCurrency(Number(viewing.neto) || 0)}</span></div>
                <div><span className="text-gray-500">IVA:</span> <span className="font-medium">{formatCurrency(Number(viewing.iva) || 0)}</span></div>
                <div><span className="text-gray-500">Perc. IVA:</span> <span className="font-medium">{formatCurrency(Number(viewing.percepciones_iva) || 0)}</span></div>
                <div><span className="text-gray-500">Perc. IIBB:</span> <span className="font-medium">{formatCurrency(Number(viewing.percepciones_iibb) || 0)}</span></div>
                <div><span className="text-gray-500">Otros Imp.:</span> <span className="font-medium">{formatCurrency(Number(viewing.otros_impuestos) || 0)}</span></div>
                <div><span className="text-gray-500 font-semibold">Total:</span> <span className="font-bold">{formatCurrency(Number(viewing.total) || 0)}</span></div>
              </div>
              <hr />
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-gray-500">Estado:</span> {estadoBadge(viewing.estado)}</div>
                <div><span className="text-gray-500">Saldo Pendiente:</span> <span className="font-bold text-amber-700">{formatCurrency(Number(viewing.saldo_pendiente) || 0)}</span></div>
              </div>
              {viewing.observaciones && (
                <div><span className="text-gray-500">Observaciones:</span> <p className="mt-1 text-gray-700">{viewing.observaciones}</p></div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ==================== DIALOG: Confirmar Eliminar ==================== */}
      <Dialog open={!!deleting} onOpenChange={() => setDeleting(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Eliminar Factura</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Estas seguro de eliminar la factura de <strong>{deleting?.proveedor_nombre}</strong> por{" "}
            <strong>{formatCurrency(Number(deleting?.total) || 0)}</strong>?
          </p>
          <DialogFooter>
            <button
              onClick={() => setDeleting(null)}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
            >
              Eliminar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
