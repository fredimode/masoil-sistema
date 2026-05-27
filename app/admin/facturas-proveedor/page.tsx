"use client"

import { useState, useEffect, useMemo } from "react"
import { formatCurrency, normalizeSearch } from "@/lib/utils"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import {
  fetchProveedores,
  fetchOrdenesCompra,
  fetchFacturasProveedor,
  fetchPlanCuentas,
  fetchProducts,
  createFacturaProveedor,
  createFacturaProveedorItems,
  createPlanCuenta,
  updateOrdenCompra,
  deleteFacturaProveedor,
  createMovimientoCuentaCorrienteProveedor,
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

const PROVINCIAS_ARGENTINA = [
  "Buenos Aires", "CABA", "Catamarca", "Chaco", "Chubut", "Córdoba", "Corrientes",
  "Entre Ríos", "Formosa", "Jujuy", "La Pampa", "La Rioja", "Mendoza", "Misiones",
  "Neuquén", "Río Negro", "Salta", "San Juan", "San Luis", "Santa Cruz", "Santa Fe",
  "Santiago del Estero", "Tierra del Fuego", "Tucumán",
]

const EMPRESAS_FACTURA = ["Masoil", "Aquiles", "Conancap"]

const INITIAL_FORM = {
  empresa: "",
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
  iva_105: "",
  iva_27: "",
  percepciones_iva: "",
  percepciones_iibb: "",
  jurisdiccion_iibb: "",
  impuestos_internos: "",
  exentos_no_gravados: "",
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

  // Items de la factura
  const [formItems, setFormItems] = useState<{ id: string; nombre: string; codigo: string; cantidad: string; precio: string }[]>([])
  const [activeProductRow, setActiveProductRow] = useState<string | null>(null)
  const [products, setProducts] = useState<any[]>([])

  // Plan de cuentas e imputaciones
  const [planCuentas, setPlanCuentas] = useState<any[]>([])
  const [imputaciones, setImputaciones] = useState<{ id: string; cuenta_codigo: string; cuenta_categoria: string; cuenta_sub: string }[]>([])
  const [cuentaSearch, setCuentaSearch] = useState("")
  const [showCuentaList, setShowCuentaList] = useState(false)
  const [errorMsg, setErrorMsg] = useState("")

  // Stepper: 1 = datos de factura, 2 = items + imputación
  const [step, setStep] = useState<1 | 2>(1)

  // Percepciones IIBB múltiples
  const [percepcionesIIBB, setPercepcionesIIBB] = useState<{ jurisdiccion: string; monto: string }[]>([])

  // Modal Imputaciones Contables (dedicado)
  const [imputacionesDialogOpen, setImputacionesDialogOpen] = useState(false)

  // Modal "Nueva imputación contable"
  const [nuevaCuentaOpen, setNuevaCuentaOpen] = useState(false)
  const [nuevaCuentaForm, setNuevaCuentaForm] = useState({ codigo: "", categoria: "", sub_categoria: "" })
  const [nuevaCuentaError, setNuevaCuentaError] = useState("")
  const [nuevaCuentaSaving, setNuevaCuentaSaving] = useState(false)
  const [showCategoriaList, setShowCategoriaList] = useState(false)

  // Proveedor autocomplete
  const [proveedorSearch, setProveedorSearch] = useState("")
  const [showProveedorList, setShowProveedorList] = useState(false)

  // View / Delete dialogs
  const [viewing, setViewing] = useState<any | null>(null)
  const [deleting, setDeleting] = useState<any | null>(null)

  async function loadData() {
    setLoading(true)
    try {
      const [f, p, o, pc, pr] = await Promise.all([
        fetchFacturasProveedor(),
        fetchProveedores(),
        fetchOrdenesCompra(),
        fetchPlanCuentas().catch(() => []),
        fetchProducts().catch(() => []),
      ])
      setFacturas(f)
      setProveedores(p)
      setOrdenes(o)
      setPlanCuentas(pc)
      setProducts(pr as any[])
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

  // Vincular OC + autocargar items de esa OC en formItems (item Excel #48).
  // Si el operador ya tenía items cargados, confirma antes de reemplazar.
  async function handleVincularOC(ocId: string) {
    setForm((prev) => ({ ...prev, orden_compra_id: ocId }))
    if (!ocId) return
    if (formItems.length > 0) {
      const ok = confirm("Esto reemplazará los items actuales con los de la OC seleccionada. ¿Continuar?")
      if (!ok) return
    }
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("orden_compra_items")
        .select("producto_nombre, producto_codigo, cantidad, precio_unitario")
        .eq("orden_compra_id", ocId)
      if (error) {
        console.error("Error cargando items de OC:", error)
        return
      }
      if (!data || data.length === 0) {
        alert("La OC seleccionada no tiene items cargados.")
        return
      }
      setFormItems(
        data.map((it) => ({
          id: Math.random().toString(36).slice(2),
          nombre: it.producto_nombre || "",
          codigo: it.producto_codigo || "",
          cantidad: String(it.cantidad || 1),
          precio: String(it.precio_unitario || ""),
        }))
      )
    } catch (e) {
      console.error("Error cargando items de OC:", e)
    }
  }

  // Auto-calculate IVA when neto changes
  function handleNetoChange(value: string) {
    const neto = parseFloat(value) || 0
    const iva = Math.round(neto * 0.21 * 100) / 100
    setForm((prev) => {
      const next = { ...prev, neto: value, iva: iva.toString() }
      next.total = calcTotal(next)
      return next
    })
  }

  function handleIvaChange(value: string) {
    setForm((prev) => {
      const next = { ...prev, iva: value }
      next.total = calcTotal(next)
      return next
    })
  }

  function handleImpuestoChange(field: string, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      next.total = calcTotal(next)
      return next
    })
  }

  function calcTotal(f: typeof INITIAL_FORM, iibbList?: { jurisdiccion: string; monto: string }[]) {
    const iibbTotal = (iibbList || percepcionesIIBB).reduce((s, p) => s + (parseFloat(p.monto) || 0), 0)
    const sum =
      (parseFloat(f.neto) || 0) +
      (parseFloat(f.iva) || 0) +
      (parseFloat(f.iva_105) || 0) +
      (parseFloat(f.iva_27) || 0) +
      (parseFloat(f.percepciones_iva) || 0) +
      iibbTotal +
      (parseFloat(f.impuestos_internos) || 0) +
      (parseFloat(f.exentos_no_gravados) || 0) +
      (parseFloat(f.otros_impuestos) || 0)
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

  const cuentasFiltradas = useMemo(() => {
    if (!cuentaSearch) return planCuentas.slice(0, 30)
    const q = normalizeSearch(cuentaSearch)
    return planCuentas
      .filter((c: any) =>
        normalizeSearch(c.codigo || "").includes(q) ||
        normalizeSearch(c.categoria || "").includes(q) ||
        normalizeSearch(c.sub_categoria || "").includes(q)
      )
      .slice(0, 30)
  }, [planCuentas, cuentaSearch])

  function productosFiltrados(search: string) {
    if (!search) return []
    const q = normalizeSearch(search)
    return products
      .filter((p: any) =>
        normalizeSearch(p.code || "").includes(q) ||
        normalizeSearch(p.name || "").includes(q)
      )
      .slice(0, 10)
  }

  function addImputacion(cuenta: any) {
    if (imputaciones.some((i) => i.cuenta_codigo === cuenta.codigo)) return
    setImputaciones((prev) => [...prev, {
      id: Math.random().toString(36).slice(2),
      cuenta_codigo: cuenta.codigo,
      cuenta_categoria: cuenta.categoria || "",
      cuenta_sub: cuenta.sub_categoria || "",
    }])
    setCuentaSearch("")
    setShowCuentaList(false)
  }

  // Categorías únicas existentes para autocomplete
  const categoriasExistentes = useMemo(() => {
    const set = new Set<string>()
    for (const c of planCuentas) {
      if (c?.categoria) set.add(c.categoria)
    }
    return Array.from(set).sort()
  }, [planCuentas])

  const categoriasFiltradas = useMemo(() => {
    if (!nuevaCuentaForm.categoria) return categoriasExistentes.slice(0, 10)
    const q = normalizeSearch(nuevaCuentaForm.categoria)
    return categoriasExistentes
      .filter((c) => normalizeSearch(c).includes(q) && c !== nuevaCuentaForm.categoria)
      .slice(0, 10)
  }, [categoriasExistentes, nuevaCuentaForm.categoria])

  // Sugerencia de código: max(codigo) parseado como int + 10
  function sugerirCodigo(): string {
    const numericCodes = planCuentas
      .map((c: any) => parseInt(c.codigo, 10))
      .filter((n) => !isNaN(n))
    if (numericCodes.length === 0) return ""
    const max = Math.max(...numericCodes)
    return String(max + 10)
  }

  function abrirNuevaCuenta() {
    setNuevaCuentaForm({ codigo: sugerirCodigo(), categoria: "", sub_categoria: "" })
    setNuevaCuentaError("")
    setShowCategoriaList(false)
    setNuevaCuentaOpen(true)
  }

  async function handleCrearCuenta() {
    setNuevaCuentaError("")
    const codigo = nuevaCuentaForm.codigo.trim()
    const categoria = nuevaCuentaForm.categoria.trim()
    if (!codigo) {
      setNuevaCuentaError("Completar código")
      return
    }
    if (!categoria) {
      setNuevaCuentaError("Completar categoría")
      return
    }
    setNuevaCuentaSaving(true)
    try {
      const nueva = await createPlanCuenta({
        codigo,
        categoria,
        sub_categoria: nuevaCuentaForm.sub_categoria || null,
      })
      // Refrescar plan de cuentas y agregar al form padre
      setPlanCuentas((prev) => [...prev, nueva].sort((a: any, b: any) => (a.codigo || "").localeCompare(b.codigo || "")))
      addImputacion(nueva)
      setNuevaCuentaOpen(false)
    } catch (err: any) {
      const code = err?.code || ""
      const msg = err?.message || ""
      if (code === "23505" || /duplicate|unique/i.test(msg)) {
        setNuevaCuentaError(`Ya existe una cuenta con código "${codigo}"`)
      } else {
        setNuevaCuentaError(msg || "Error al crear la cuenta")
      }
    } finally {
      setNuevaCuentaSaving(false)
    }
  }

  async function handleNext() {
    setErrorMsg("")
    if (!form.empresa) {
      setErrorMsg("Seleccionar empresa")
      return
    }
    if (!form.proveedor_nombre) {
      setErrorMsg("Seleccionar proveedor")
      return
    }
    if (!form.fecha) {
      setErrorMsg("Completar fecha")
      return
    }
    if (!form.neto) {
      setErrorMsg("Completar neto")
      return
    }

    // Validar duplicado: misma combinación (proveedor + nro factura + empresa)
    if (form.proveedor_id && form.numero && form.empresa) {
      const supabaseCheck = createClient()
      const { data: existente } = await supabaseCheck
        .from("facturas_proveedor")
        .select("id, numero")
        .eq("proveedor_id", form.proveedor_id)
        .eq("numero", form.numero)
        .eq("empresa", form.empresa)
        .maybeSingle()
      if (existente) {
        setErrorMsg(`Ya existe la factura N° ${form.numero} de este proveedor para ${form.empresa}`)
        return
      }
    }

    setStep(2)
  }

  async function handleGuardar() {
    setErrorMsg("")
    if (imputaciones.length === 0) {
      setErrorMsg("Debe seleccionar al menos una imputación contable")
      return
    }

    setGuardando(true)
    try {
      const totalNum = parseFloat(form.total) || 0
      const facturaData: Record<string, any> = {
        empresa: form.empresa || null,
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
        iva_105: parseFloat(form.iva_105) || 0,
        iva_27: parseFloat(form.iva_27) || 0,
        percepciones_iva: parseFloat(form.percepciones_iva) || 0,
        percepciones_iibb: percepcionesIIBB.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0),
        jurisdiccion_iibb: percepcionesIIBB.length > 0 ? JSON.stringify(percepcionesIIBB.filter((p) => p.jurisdiccion || p.monto)) : null,
        impuestos_internos: parseFloat(form.impuestos_internos) || 0,
        exentos_no_gravados: parseFloat(form.exentos_no_gravados) || 0,
        otros_impuestos: parseFloat(form.otros_impuestos) || 0,
        total: totalNum,
        saldo_pendiente: totalNum,
        estado: "pendiente",
        razon_social: form.razon_social || null,
        orden_compra_id: form.orden_compra_id || null,
        observaciones: form.observaciones || null,
        imputaciones: imputaciones.filter((imp) => imp.cuenta_codigo).map((imp) => ({
          cuenta_codigo: imp.cuenta_codigo,
          cuenta_categoria: imp.cuenta_categoria,
          cuenta_sub: imp.cuenta_sub,
          debe: 0,
          haber: 0,
        })),
      }

      const id = await createFacturaProveedor(facturaData)

      // L.4: persistir movimiento DEBE en cuenta_corriente_proveedor con empresa.
      // FC y ND suman al saldo (DEBE); NC resta (HABER).
      if (form.proveedor_id && totalNum > 0) {
        try {
          const tipoUpper = (form.tipo || "").toUpperCase()
          const esNC = tipoUpper.includes("CRED")
          const numeroComp = form.punto_venta && form.numero
            ? `${String(form.punto_venta).padStart(4, "0")}-${String(form.numero).padStart(8, "0")}`
            : (form.numero || null)
          await createMovimientoCuentaCorrienteProveedor({
            proveedor_id: form.proveedor_id,
            fecha: form.fecha,
            tipo_comprobante: esNC ? "NC" : (tipoUpper.includes("DEBITO") || tipoUpper.includes("DÉBITO") ? "ND" : "FC"),
            punto_venta: form.punto_venta || null,
            numero_comprobante: numeroComp,
            debe: esNC ? 0 : totalNum,
            haber: esNC ? totalNum : 0,
            empresa: form.empresa || null,
            referencia_id: id,
            observaciones: form.observaciones || null,
          })
        } catch (err) {
          console.error("Error registrando FC en cta cte proveedor:", err)
        }
      }

      // Save items if any
      const validItems = formItems.filter((it) => it.nombre.trim())
      if (validItems.length > 0) {
        const itemsData = validItems.map((it) => ({
          factura_id: id,
          producto_nombre: it.nombre,
          producto_codigo: it.codigo || null,
          cantidad: parseFloat(it.cantidad) || 1,
          precio_unitario: parseFloat(it.precio) || 0,
          subtotal: (parseFloat(it.cantidad) || 1) * (parseFloat(it.precio) || 0),
        }))
        await createFacturaProveedorItems(itemsData)
      }

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
      setFormItems([])
      setImputaciones([])
      setPercepcionesIIBB([])
      setCuentaSearch("")
      setErrorMsg("")
      setStep(1)
      setDialogOpen(false)
      await loadData()
    } catch (err) {
      console.error("Error guardando factura:", err)
      setErrorMsg("Error al guardar la factura")
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
            setFormItems([])
            setImputaciones([])
            setPercepcionesIIBB([])
            setCuentaSearch("")
            setErrorMsg("")
            setStep(1)
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
                      {f.tipo === "NOTA_DEBITO" && (
                        <Badge className="ml-1 bg-orange-100 text-orange-800 border-orange-200 text-[10px]">ND</Badge>
                      )}
                    </td>
                    <td className="px-2 py-2 text-gray-600 text-xs">
                      {f.tipo === "NOTA_CREDITO" ? (
                        <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px]">Nota de Credito</Badge>
                      ) : f.tipo === "NOTA_DEBITO" ? (
                        <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-[10px]">Nota de Debito</Badge>
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
        {/* L.3: dialog a casi pantalla completa para que sea evidente.
            sm:max-w-none override del max-width default de shadcn Dialog. */}
        <DialogContent className="!max-w-[97vw] sm:!max-w-[97vw] w-[97vw] h-[95vh] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cargar Factura de Proveedor</DialogTitle>
          </DialogHeader>

          {/* Stepper */}
          <div className="flex items-center gap-2 px-1 py-2 border-b">
            <button
              type="button"
              onClick={() => { setErrorMsg(""); setStep(1) }}
              className={`flex items-center gap-2 text-sm font-medium px-2 py-1 rounded ${step === 1 ? "text-primary" : "text-gray-500 hover:text-gray-700"}`}
            >
              <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${step === 1 ? "bg-primary text-white" : "bg-gray-200 text-gray-600"}`}>1</span>
              Datos de factura
            </button>
            <span className="flex-1 h-px bg-gray-300" />
            <div
              className={`flex items-center gap-2 text-sm font-medium px-2 py-1 rounded ${step === 2 ? "text-primary" : "text-gray-400"}`}
            >
              <span className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${step === 2 ? "bg-primary text-white" : "bg-gray-200 text-gray-500"}`}>2</span>
              Items + imputación
            </div>
          </div>

          {/* Resumen colapsado en etapa 2 */}
          {step === 2 && (
            <div className="bg-gray-50 border rounded-lg px-3 py-2 text-sm flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <span><span className="text-gray-500">Proveedor:</span> <span className="font-medium">{form.proveedor_nombre}</span></span>
                <span className="text-gray-300">|</span>
                <span><span className="text-gray-500">N°:</span> <span className="font-medium">{form.punto_venta || "-"}-{form.numero || "-"}</span></span>
                <span className="text-gray-300">|</span>
                <span><span className="text-gray-500">Fecha:</span> <span className="font-medium">{form.fecha ? new Date(form.fecha).toLocaleDateString("es-AR") : "-"}</span></span>
                <span className="text-gray-300">|</span>
                <span><span className="text-gray-500">Total:</span> <span className="font-semibold text-primary">{form.total ? formatCurrency(parseFloat(form.total)) : "$0,00"}</span></span>
              </div>
              <button
                type="button"
                onClick={() => { setErrorMsg(""); setStep(1) }}
                className="text-xs text-primary hover:underline whitespace-nowrap"
              >
                Editar datos
              </button>
            </div>
          )}

          {/* === ETAPA 1: Datos de factura === */}
          {step === 1 && (
          <div className="grid gap-5 py-4">
            {/* Razón social facturada — empresa nuestra que registra y paga */}
            <div>
              <label
                className="block text-sm font-medium text-gray-700 mb-1"
                title="Aquiles o Conancap. Empresa que registra y paga."
              >
                Razón social facturada *
              </label>
              <select
                value={form.empresa}
                onChange={(e) => setForm((prev) => ({ ...prev, empresa: e.target.value }))}
                className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                required
              >
                <option value="">Seleccionar empresa...</option>
                {EMPRESAS_FACTURA.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>

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
                className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
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

            {/* Fila 2: Tipo | Letra | Punto Venta | Número | CUIT */}
            <div className="grid grid-cols-5 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Tipo</label>
                <select
                  value={form.tipo}
                  onChange={(e) => setForm((prev) => ({ ...prev, tipo: e.target.value }))}
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                >
                  <option value="FACTURA">Factura</option>
                  <option value="NOTA_CREDITO">Nota de Credito</option>
                  <option value="NOTA_DEBITO">Nota de Debito</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Letra</label>
                <select
                  value={form.letra}
                  onChange={(e) => setForm((prev) => ({ ...prev, letra: e.target.value }))}
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Punto de Venta</label>
                <input
                  type="text"
                  value={form.punto_venta}
                  onChange={(e) => setForm((prev) => ({ ...prev, punto_venta: e.target.value }))}
                  placeholder="0001"
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Número</label>
                <input
                  type="text"
                  value={form.numero}
                  onChange={(e) => setForm((prev) => ({ ...prev, numero: e.target.value }))}
                  placeholder="00000001"
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">CUIT</label>
                <input
                  type="text"
                  value={form.cuit}
                  onChange={(e) => setForm((prev) => ({ ...prev, cuit: e.target.value }))}
                  className="w-full p-2 border rounded-lg bg-gray-50 text-sm"
                  placeholder="Auto"
                />
              </div>
            </div>

            {/* Fila 3: Fecha | Vencimiento | Razón Social */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Fecha *</label>
                <input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm((prev) => ({ ...prev, fecha: e.target.value }))}
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Fecha Vencimiento</label>
                <input
                  type="date"
                  value={form.fecha_vencimiento}
                  onChange={(e) => setForm((prev) => ({ ...prev, fecha_vencimiento: e.target.value }))}
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                  title="A nombre de quién emitió el proveedor (puede ser Masoil)."
                >
                  Razón social facturada
                </label>
                <select
                  value={form.razon_social}
                  onChange={(e) => setForm((prev) => ({ ...prev, razon_social: e.target.value }))}
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                >
                  <option value="">Seleccionar...</option>
                  <option value="Masoil">Masoil</option>
                  <option value="Aquiles">Aquiles</option>
                  <option value="Conancap">Conancap</option>
                </select>
              </div>
            </div>

            {/* Fila 4: Neto | IVA 21% | IVA 10.5% | IVA 27% */}
            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Neto *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.neto}
                  onChange={(e) => handleNetoChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">IVA 21% (auto)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.iva}
                  onChange={(e) => handleIvaChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">IVA 10.5%</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.iva_105}
                  onChange={(e) => handleImpuestoChange("iva_105", e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">IVA 27%</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.iva_27}
                  onChange={(e) => handleImpuestoChange("iva_27", e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
            </div>

            {/* Fila 5: Perc. IVA | Perc. IIBB | Jurisdicción | Imp. Internos | Exentos */}
            <div className="grid grid-cols-5 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Perc. IVA</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.percepciones_iva}
                  onChange={(e) => handleImpuestoChange("percepciones_iva", e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">Percepciones IIBB</label>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = [...percepcionesIIBB, { jurisdiccion: "", monto: "" }]
                      setPercepcionesIIBB(updated)
                    }}
                    className="text-xs text-primary hover:underline"
                  >
                    + Agregar percepción
                  </button>
                </div>
                {percepcionesIIBB.length === 0 ? (
                  <p className="text-xs text-gray-400 py-1">Sin percepciones IIBB. Clic en "+ Agregar percepción".</p>
                ) : (
                  <div className="space-y-2">
                    {percepcionesIIBB.map((perc, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <select
                          value={perc.jurisdiccion}
                          onChange={(e) => {
                            const updated = [...percepcionesIIBB]
                            updated[idx] = { ...updated[idx], jurisdiccion: e.target.value }
                            setPercepcionesIIBB(updated)
                          }}
                          className="flex-1 px-2 py-1.5 border rounded text-sm"
                        >
                          <option value="">Jurisdicción...</option>
                          {PROVINCIAS_ARGENTINA.map((p) => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Monto"
                          value={perc.monto}
                          onChange={(e) => {
                            const updated = [...percepcionesIIBB]
                            updated[idx] = { ...updated[idx], monto: e.target.value }
                            setPercepcionesIIBB(updated)
                            setForm((prev) => ({ ...prev, total: calcTotal(prev, updated) }))
                          }}
                          className="w-28 px-2 py-1.5 border rounded text-sm text-right"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = percepcionesIIBB.filter((_, i) => i !== idx)
                            setPercepcionesIIBB(updated)
                            setForm((prev) => ({ ...prev, total: calcTotal(prev, updated) }))
                          }}
                          className="text-red-500 hover:text-red-700 text-sm px-1"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <p className="text-xs text-gray-500 text-right">
                      Total IIBB: ${percepcionesIIBB.reduce((s, p) => s + (parseFloat(p.monto) || 0), 0).toFixed(2)}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Imp. Internos</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.impuestos_internos}
                  onChange={(e) => handleImpuestoChange("impuestos_internos", e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Exentos / No Grav.</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.exentos_no_gravados}
                  onChange={(e) => handleImpuestoChange("exentos_no_gravados", e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
              </div>
            </div>

            {/* Fila 6: Total destacado */}
            <div className="flex items-center justify-end gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2">
              <span className="text-sm font-medium text-gray-700">Total:</span>
              <span className="text-2xl font-bold text-primary">
                {form.total ? formatCurrency(parseFloat(form.total)) : "$0,00"}
              </span>
            </div>

            {/* Adjuntar + Vincular OC en una línea */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Adjuntar Factura</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                  className="w-full p-2 border rounded-lg text-sm file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-primary file:text-white hover:file:bg-primary/90"
                />
                {archivo && <p className="text-xs text-gray-500 mt-1">{archivo.name}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Vincular con Orden de Compra</label>
                <select
                  value={form.orden_compra_id}
                  onChange={(e) => handleVincularOC(e.target.value)}
                  className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                >
                  <option value="">Sin vincular</option>
                  {ordenesProveedor.map((o) => (
                    <option key={o.id} value={o.id}>
                      OC {o.nro_oc || o.id.slice(0, 8)} - {formatCurrency(Number(o.importe_total) || 0)} ({o.estado})
                    </option>
                  ))}
                </select>
                {form.orden_compra_id && formItems.length > 0 && (
                  <p className="text-[11px] text-blue-600 mt-1">
                    Items de la OC autocargados — editables en la siguiente etapa.
                  </p>
                )}
              </div>
            </div>
          </div>
          )}

          {/* === ETAPA 2: Items + imputación + observaciones === */}
          {step === 2 && (
          <div className="grid gap-5 py-4">
            {/* Detalle de productos/items */}
            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">Detalle de Productos (opcional)</label>
                <button
                  type="button"
                  onClick={() => setFormItems((prev) => [...prev, { id: Math.random().toString(36).slice(2), nombre: "", codigo: "", cantidad: "1", precio: "" }])}
                  className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  + Agregar item
                </button>
              </div>
              {formItems.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-[140px,1fr,90px,130px,130px,32px] gap-3 text-xs font-semibold text-gray-600 uppercase tracking-wide px-1 pb-1 border-b">
                    <span>Código</span>
                    <span>Producto</span>
                    <span className="text-center">Cant.</span>
                    <span className="text-right">Precio Unit.</span>
                    <span className="text-right">Subtotal</span>
                    <span></span>
                  </div>
                  {formItems.map((item) => {
                    const subtotal = (parseFloat(item.cantidad) || 0) * (parseFloat(item.precio) || 0)
                    const nombreMatches = activeProductRow === `${item.id}-n` ? productosFiltrados(item.nombre) : []
                    const codigoMatches = activeProductRow === `${item.id}-c` ? productosFiltrados(item.codigo) : []
                    const selectProducto = (p: any) => {
                      setFormItems((prev) => prev.map((it) => it.id === item.id ? {
                        ...it,
                        nombre: p.name,
                        codigo: p.code ?? "",
                        precio: it.precio || String(p.price ?? ""),
                      } : it))
                      setActiveProductRow(null)
                    }
                    return (
                      <div key={item.id} className="relative grid grid-cols-[140px,1fr,90px,130px,130px,32px] gap-3 items-start">
                        <div className="relative">
                          <input
                            type="text"
                            data-item-field={`${item.id}-codigo`}
                            value={item.codigo}
                            onChange={(e) => {
                              setFormItems((prev) => prev.map((it) => it.id === item.id ? { ...it, codigo: e.target.value } : it))
                              setActiveProductRow(`${item.id}-c`)
                            }}
                            onFocus={() => item.codigo && setActiveProductRow(`${item.id}-c`)}
                            onBlur={() => setTimeout(() => setActiveProductRow((r) => r === `${item.id}-c` ? null : r), 150)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                const next = document.querySelector(`[data-item-field="${item.id}-nombre"]`) as HTMLElement
                                next?.focus()
                              }
                            }}
                            className="w-full p-2 border rounded text-sm font-mono"
                            placeholder="Código"
                          />
                          {codigoMatches.length > 0 && (
                            <div className="absolute z-50 top-full left-0 min-w-[280px] bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                              {codigoMatches.map((p: any) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => selectProducto(p)}
                                  className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-xs border-b last:border-0"
                                >
                                  <span className="font-mono text-gray-700 mr-2">{p.code || "-"}</span>
                                  <span className="text-gray-600">{p.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            data-item-field={`${item.id}-nombre`}
                            value={item.nombre}
                            onChange={(e) => {
                              setFormItems((prev) => prev.map((it) => it.id === item.id ? { ...it, nombre: e.target.value } : it))
                              setActiveProductRow(`${item.id}-n`)
                            }}
                            onFocus={() => setActiveProductRow(`${item.id}-n`)}
                            onBlur={() => setTimeout(() => setActiveProductRow((r) => r === `${item.id}-n` ? null : r), 150)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault()
                                const next = document.querySelector(`[data-item-field="${item.id}-cantidad"]`) as HTMLElement
                                next?.focus()
                              }
                            }}
                            className="w-full p-2 border rounded text-sm"
                            placeholder="Buscar o escribir nombre..."
                          />
                          {nombreMatches.length > 0 && (
                            <div className="absolute z-50 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                              {nombreMatches.map((p: any) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => selectProducto(p)}
                                  className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-xs border-b last:border-0"
                                >
                                  <span className="font-mono text-gray-500 mr-2">{p.code || "-"}</span>
                                  <span>{p.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <input
                          type="number"
                          data-item-field={`${item.id}-cantidad`}
                          value={item.cantidad}
                          onChange={(e) => setFormItems((prev) => prev.map((it) => it.id === item.id ? { ...it, cantidad: e.target.value } : it))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              const next = document.querySelector(`[data-item-field="${item.id}-precio"]`) as HTMLElement
                              next?.focus()
                            }
                          }}
                          className="p-2 border rounded text-sm text-center"
                          min="1"
                        />
                        <input
                          type="number"
                          data-item-field={`${item.id}-precio`}
                          step="0.01"
                          value={item.precio}
                          onChange={(e) => setFormItems((prev) => prev.map((it) => it.id === item.id ? { ...it, precio: e.target.value } : it))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              const nextItem = formItems[formItems.indexOf(item) + 1]
                              if (nextItem) {
                                const next = document.querySelector(`[data-item-field="${nextItem.id}-codigo"]`) as HTMLElement
                                next?.focus()
                              }
                            }
                          }}
                          className="p-2 border rounded text-sm text-right"
                          placeholder="0.00"
                        />
                        <div className="text-right text-sm font-medium text-gray-700 py-2">
                          {formatCurrency(subtotal)}
                        </div>
                        <button
                          type="button"
                          onClick={() => setFormItems((prev) => prev.filter((it) => it.id !== item.id))}
                          className="text-red-500 hover:text-red-700 text-lg self-center"
                          title="Quitar"
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                  {formItems.some((it) => it.nombre.trim()) && (
                    <div className="text-right text-sm text-gray-700 pt-2 border-t mt-2">
                      Subtotal items: <span className="font-semibold">{formatCurrency(formItems.reduce((s, it) => s + (parseFloat(it.cantidad) || 0) * (parseFloat(it.precio) || 0), 0))}</span>
                    </div>
                  )}
                </div>
              )}
              {formItems.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">Sin detalle de productos</p>
              )}
            </div>

            {/* Imputación Contable — abre dialog dedicado */}
            <div className="border rounded-lg p-3 bg-blue-50/50">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Imputación Contable <span className="text-red-600">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setImputacionesDialogOpen(true)}
                  className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {imputaciones.length > 0 ? "Editar imputaciones" : "Agregar imputaciones"}
                </button>
              </div>
              {imputaciones.length > 0 ? (
                <div className="space-y-1">
                  {imputaciones.map((imp) => (
                    <div key={imp.id} className="grid grid-cols-[80px,1fr,1fr] gap-2 items-center bg-white border rounded px-2 py-1.5 text-sm">
                      <span className="font-mono text-gray-500">{imp.cuenta_codigo}</span>
                      <span className="text-gray-700 truncate">{imp.cuenta_categoria}</span>
                      <span className="text-gray-600 truncate">{imp.cuenta_sub || "-"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-2">
                  {planCuentas.length > 0 ? "Debe seleccionar al menos una imputación" : "Plan de cuentas no cargado aún"}
                </p>
              )}
            </div>

            {/* Observaciones */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
              <textarea
                value={form.observaciones}
                onChange={(e) => setForm((prev) => ({ ...prev, observaciones: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                placeholder="Notas adicionales..."
              />
            </div>
          </div>
          )}

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {errorMsg}
            </div>
          )}

          <DialogFooter>
            {step === 1 ? (
              <>
                <button
                  onClick={() => setDialogOpen(false)}
                  className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleNext}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm"
                >
                  Siguiente →
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setErrorMsg(""); setStep(1) }}
                  className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
                >
                  ← Atrás
                </button>
                <button
                  onClick={handleGuardar}
                  disabled={guardando}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm disabled:opacity-50"
                >
                  {guardando ? "Guardando..." : "Guardar Factura"}
                </button>
              </>
            )}
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
              {viewing?.tipo === "NOTA_DEBITO" && (
                <Badge className="ml-2 bg-orange-100 text-orange-800 border-orange-200">(Nota de Debito)</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-gray-500">Proveedor:</span> <span className="font-medium">{viewing.proveedor_nombre}</span></div>
                <div><span className="text-gray-500">CUIT:</span> <span className="font-medium">{viewing.cuit || "-"}</span></div>
                <div><span className="text-gray-500">Tipo:</span> <span className="font-medium">{viewing.tipo === "NOTA_CREDITO" ? "Nota de Credito" : viewing.tipo === "NOTA_DEBITO" ? "Nota de Debito" : "Factura"}</span></div>
                <div><span className="text-gray-500">Letra:</span> <span className="font-medium">{viewing.letra || "-"}</span></div>
                <div><span className="text-gray-500">PV-Numero:</span> <span className="font-medium">{viewing.punto_venta || "-"}-{viewing.numero || "-"}</span></div>
                <div><span className="text-gray-500">Fecha:</span> <span className="font-medium">{viewing.fecha ? new Date(viewing.fecha).toLocaleDateString("es-AR") : "-"}</span></div>
                <div><span className="text-gray-500">Vencimiento:</span> <span className="font-medium">{viewing.fecha_vencimiento ? new Date(viewing.fecha_vencimiento).toLocaleDateString("es-AR") : "-"}</span></div>
                <div><span className="text-gray-500">Razon Social:</span> <span className="font-medium">{viewing.razon_social || "-"}</span></div>
              </div>
              <hr />
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-gray-500">Neto:</span> <span className="font-medium">{formatCurrency(Number(viewing.neto) || 0)}</span></div>
                <div><span className="text-gray-500">IVA 21%:</span> <span className="font-medium">{formatCurrency(Number(viewing.iva) || 0)}</span></div>
                {Number(viewing.iva_105) > 0 && <div><span className="text-gray-500">IVA 10.5%:</span> <span className="font-medium">{formatCurrency(Number(viewing.iva_105))}</span></div>}
                {Number(viewing.iva_27) > 0 && <div><span className="text-gray-500">IVA 27%:</span> <span className="font-medium">{formatCurrency(Number(viewing.iva_27))}</span></div>}
                <div><span className="text-gray-500">Perc. IVA:</span> <span className="font-medium">{formatCurrency(Number(viewing.percepciones_iva) || 0)}</span></div>
                <div>
                  <span className="text-gray-500">Perc. IIBB:</span>{" "}
                  <span className="font-medium">{formatCurrency(Number(viewing.percepciones_iibb) || 0)}</span>
                  {viewing.jurisdiccion_iibb && (() => {
                    try {
                      const parsed = JSON.parse(viewing.jurisdiccion_iibb)
                      if (Array.isArray(parsed)) return (
                        <span className="text-xs text-gray-500 ml-1">
                          ({parsed.map((p: any) => `${p.jurisdiccion}: $${p.monto}`).join(", ")})
                        </span>
                      )
                    } catch {}
                    return <span className="text-xs text-gray-500 ml-1">({viewing.jurisdiccion_iibb})</span>
                  })()}
                </div>
                {Number(viewing.impuestos_internos) > 0 && <div><span className="text-gray-500">Imp. Internos:</span> <span className="font-medium">{formatCurrency(Number(viewing.impuestos_internos))}</span></div>}
                {Number(viewing.exentos_no_gravados) > 0 && <div><span className="text-gray-500">Exentos/No Grav.:</span> <span className="font-medium">{formatCurrency(Number(viewing.exentos_no_gravados))}</span></div>}
                <div><span className="text-gray-500">Otros Imp.:</span> <span className="font-medium">{formatCurrency(Number(viewing.otros_impuestos) || 0)}</span></div>
                <div className="col-span-2"><span className="text-gray-500 font-semibold">Total:</span> <span className="font-bold">{formatCurrency(Number(viewing.total) || 0)}</span></div>
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

      {/* ==================== DIALOG: Imputaciones Contables ==================== */}
      <Dialog open={imputacionesDialogOpen} onOpenChange={setImputacionesDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Imputaciones Contables</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Buscar por código, categoría o subcategoría..."
                value={cuentaSearch}
                onChange={(e) => {
                  setCuentaSearch(e.target.value)
                  setShowCuentaList(true)
                }}
                onFocus={() => setShowCuentaList(true)}
                onBlur={() => setTimeout(() => setShowCuentaList(false), 150)}
                className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              />
              {showCuentaList && cuentasFiltradas.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-56 overflow-y-auto">
                  {cuentasFiltradas.map((c: any) => {
                    const disabled = imputaciones.some((i) => i.cuenta_codigo === c.codigo)
                    return (
                      <button
                        key={c.codigo}
                        type="button"
                        disabled={disabled}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addImputacion(c)}
                        className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-sm border-b last:border-0 disabled:opacity-40 disabled:cursor-not-allowed grid grid-cols-[80px,1fr,1fr] gap-2"
                      >
                        <span className="font-mono text-gray-500">{c.codigo}</span>
                        <span className="text-gray-700 truncate">{c.categoria}</span>
                        <span className="text-gray-600 truncate">{c.sub_categoria || "-"}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {imputaciones.length > 0 ? (
              <div className="space-y-1">
                {imputaciones.map((imp) => (
                  <div key={imp.id} className="grid grid-cols-[80px,1fr,1fr,24px] gap-2 items-center bg-white border rounded px-2 py-1.5 text-sm">
                    <span className="font-mono text-gray-500">{imp.cuenta_codigo}</span>
                    <span className="text-gray-700 truncate">{imp.cuenta_categoria}</span>
                    <span className="text-gray-600 truncate">{imp.cuenta_sub || "-"}</span>
                    <button
                      type="button"
                      onClick={() => setImputaciones((prev) => prev.filter((i) => i.id !== imp.id))}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-4">
                Busque y seleccione imputaciones contables del plan de cuentas.
              </p>
            )}

            <div className="flex justify-between items-center pt-2 border-t">
              <button
                type="button"
                onClick={abrirNuevaCuenta}
                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                + Nueva cuenta
              </button>
              <button
                type="button"
                onClick={() => setImputacionesDialogOpen(false)}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm"
              >
                Listo ({imputaciones.length} seleccionadas)
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== DIALOG: Nueva imputación contable ==================== */}
      <Dialog open={nuevaCuentaOpen} onOpenChange={setNuevaCuentaOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva imputación contable</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 py-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Código *</label>
              <input
                type="text"
                value={nuevaCuentaForm.codigo}
                onChange={(e) => setNuevaCuentaForm((prev) => ({ ...prev, codigo: e.target.value }))}
                placeholder="Ej: 20020"
                className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm font-mono"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Sugerido en base al máximo actual + 10. Editable.
              </p>
            </div>
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Categoría *</label>
              <input
                type="text"
                value={nuevaCuentaForm.categoria}
                onChange={(e) => {
                  setNuevaCuentaForm((prev) => ({ ...prev, categoria: e.target.value }))
                  setShowCategoriaList(true)
                }}
                onFocus={() => setShowCategoriaList(true)}
                onBlur={() => setTimeout(() => setShowCategoriaList(false), 150)}
                placeholder="Ej: ALMACEN"
                className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              />
              {showCategoriaList && categoriasFiltradas.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 bg-white border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {categoriasFiltradas.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setNuevaCuentaForm((prev) => ({ ...prev, categoria: c }))
                        setShowCategoriaList(false)
                      }}
                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-sm border-b last:border-0"
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-gray-500 mt-1">
                Reusá una existente del listado o tipeá una nueva.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Sub-categoría</label>
              <input
                type="text"
                value={nuevaCuentaForm.sub_categoria}
                onChange={(e) => setNuevaCuentaForm((prev) => ({ ...prev, sub_categoria: e.target.value }))}
                placeholder="Opcional"
                className="w-full px-3 py-2.5 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              />
            </div>
          </div>
          {nuevaCuentaError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {nuevaCuentaError}
            </div>
          )}
          <DialogFooter>
            <button
              onClick={() => setNuevaCuentaOpen(false)}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleCrearCuenta}
              disabled={nuevaCuentaSaving}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm disabled:opacity-50"
            >
              {nuevaCuentaSaving ? "Creando..." : "Crear y agregar"}
            </button>
          </DialogFooter>
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
