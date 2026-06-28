"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Search, Trash2, Truck, History } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { HistorialVentasDialog } from "@/components/historial-ventas-dialog"
import {
  fetchClients, fetchProducts, fetchVendedores, esVendedorComercial,
  createCotizacionVenta, getNextCotizacionVentaNumero,
  fetchProveedoresByProducto,
} from "@/lib/supabase/queries"
import { createClient } from "@/lib/supabase/client"
import { useCurrentVendedor } from "@/lib/hooks/useCurrentVendedor"
import type { Client, Product, Vendedor } from "@/lib/types"
import { formatCurrencyExact, normalizeSearch } from "@/lib/utils"

interface CotItem {
  productId: string | null
  productCode: string
  productName: string
  quantity: number
  price: number
  // R.1: stock del producto al momento de agregarlo (igual que en pedidos/nuevo).
  // Líneas sin catálogo (descuento/libre) usan 999999 = no aplica.
  stock: number
  tipoLinea?: "producto" | "descuento" | "libre"
}

const PLAZOS = [
  "7 días hábiles",
  "10 días hábiles",
  "15 días hábiles",
  "20 días hábiles",
  "30 días hábiles",
]
const FORMAS_PAGO = [
  "Contado",
  "Transferencia",
  "Cheque",
  "7 días",
  "15 días",
  "21 días",
  "30 días",
  "45 días",
  "60 días",
  "Cuenta Corriente",
  "Ver observación",
]

// Default validez = hoy + 3 días, en formato YYYY-MM-DD local.
// Usamos getFullYear/getMonth/getDate (NO toISOString) para no caer en
// el bug de timezone que hace que la fecha salga -1 día en zonas UTC-.
function defaultValidez(): string {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

export default function NuevaCotizacionVentaPage() {
  const router = useRouter()
  const supabase = createClient()
  const { vendedor: currentUser } = useCurrentVendedor()

  const [clients, setClients] = useState<Client[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedClientId, setSelectedClientId] = useState("")
  const [histDialog, setHistDialog] = useState<{ open: boolean; productId?: string; productName?: string }>({ open: false })
  const [clientSearch, setClientSearch] = useState("")
  const [selectedVendedorId, setSelectedVendedorId] = useState("")
  const [razonSocial, setRazonSocial] = useState("")
  const [items, setItems] = useState<CotItem[]>([])
  const [productSearch, setProductSearch] = useState("")
  const [showProductResults, setShowProductResults] = useState(false)

  const [validezFecha, setValidezFecha] = useState<string>(defaultValidez)
  const [formaPago, setFormaPago] = useState("")
  const [plazoEntrega, setPlazoEntrega] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [provsByProduct, setProvsByProduct] = useState<Record<string, any[]>>({})

  // R.1: indicador de stock idéntico a pedidos/nuevo. pendingOCProducts marca
  // los productos con OC en camino (🟡) cuando el stock está bajo.
  const [pendingOCProducts, setPendingOCProducts] = useState<Set<string>>(new Set())
  useEffect(() => {
    supabase
      .from("compras")
      .select("articulo")
      .in("estado", ["Pendiente", "Realizado"])
      .then(({ data }) => {
        if (data) {
          setPendingOCProducts(new Set(data.map((c: any) => (c.articulo || "").toLowerCase())))
        }
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadProveedoresProducto(productId: string) {
    if (provsByProduct[productId]) return
    try {
      const data = await fetchProveedoresByProducto(productId)
      setProvsByProduct((prev) => ({ ...prev, [productId]: data }))
    } catch {
      // non-blocking
    }
  }

  useEffect(() => {
    Promise.all([fetchClients(), fetchProducts(), fetchVendedores()])
      .then(([c, p, v]) => {
        setClients(c)
        setProducts(p)
        setVendedores(v)
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  // Solo vendedores comerciales reales (Diego/Jonatan/Pablo) aparecen en el
  // selector. esVendedorComercial filtra por iniciales válidas (PSG/JGE/DDM) y
  // excluye back-office (Administrador, Agustín/compras, Matías). Mismo criterio
  // que pedidos/nuevo.
  const activeVendedores = vendedores.filter((v) => v.isActive && esVendedorComercial(v))
  const selectedClient = clients.find((c) => c.id === selectedClientId)

  // Autofill forma_pago cuando se selecciona cliente
  useEffect(() => {
    if (selectedClient?.condicionPago && !formaPago) setFormaPago(selectedClient.condicionPago)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClient?.id])

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients.slice(0, 15)
    const q = normalizeSearch(clientSearch)
    return clients.filter((c) =>
      normalizeSearch(c.businessName).includes(q) || normalizeSearch(c.contactName).includes(q),
    ).slice(0, 20)
  }, [clientSearch, clients])

  const filteredProducts = useMemo(() => {
    if (productSearch.length < 2) return []
    const q = normalizeSearch(productSearch)
    return products.filter((p) =>
      normalizeSearch(p.name).includes(q) || normalizeSearch(p.code || "").includes(q),
    ).slice(0, 10)
  }, [productSearch, products])

  function addProduct(p: Product) {
    const existing = items.find((i) => i.productId === p.id)
    if (existing) {
      setItems(items.map((i) => (i.productId === p.id ? { ...i, quantity: i.quantity + 1 } : i)))
    } else {
      setItems([...items, {
        productId: p.id,
        productCode: p.code || "",
        productName: p.name,
        quantity: 1,
        // R.2: products.price se guarda CON IVA. El modelo de cotización trata
        // precio_unitario como SIN IVA por definición (ver cotizacion-pdf.ts y la
        // export XLSX: neto = Σ precio_unitario·cant, luego +21%). Por eso al
        // agregar dividimos /1.21, igual que pedidos/nuevo. Antes se guardaba el
        // precio con IVA y el PDF le sumaba 21% encima (total ~21% inflado).
        price: Math.round((p.price / 1.21) * 100) / 100,
        stock: p.stock,
        tipoLinea: "producto",
      }])
    }
    setProductSearch("")
    setShowProductResults(false)
  }

  // Línea de descuento general (item Excel #82). Sin product_id, descripción
  // editable, cantidad fija en 1, precio editable que debería ser negativo
  // para descontar (sin validación dura — el operador puede usarlo también
  // como recargo si quiere).
  function addDescuento() {
    setItems([...items, {
      productId: `desc-${Date.now()}`,
      productCode: "DESCUENTO",
      productName: "Descuento",
      quantity: 1,
      price: 0,
      stock: 999999,
      tipoLinea: "descuento",
    }])
  }

  // R.3: línea libre = producto no catalogado (igual que pedidos/nuevo, Sprint
  // C.1). product_id null, nombre/código/precio/cantidad editables, sin stock
  // ni proveedores. Al persistir se manda product_id null (el id sintético
  // "libre-…" no es UUID válido).
  function addLineaLibre() {
    setItems([...items, {
      productId: `libre-${Date.now()}`,
      productCode: "",
      productName: "",
      quantity: 1,
      price: 0,
      stock: 999999,
      tipoLinea: "libre",
    }])
  }

  // R.2: discriminación de IVA igual que pedidos/nuevo. Los precios de línea son
  // SIN IVA; el subtotal es el neto, el IVA 21% se calcula encima y el total es
  // con IVA. El campo `total` que se persiste sigue siendo el neto (sin IVA),
  // consistente con el detalle/PDF que recalculan el IVA a partir de los items.
  const subtotal = useMemo(() => items.reduce((s, i) => s + i.price * i.quantity, 0), [items])
  const ivaCalculado = useMemo(() => Math.round(subtotal * 0.21 * 100) / 100, [subtotal])
  const totalConIva = useMemo(() => Math.round((subtotal + ivaCalculado) * 100) / 100, [subtotal, ivaCalculado])

  async function handleSubmit() {
    if (!selectedClientId || items.length === 0) {
      alert("Seleccioná un cliente y agregá al menos un producto")
      return
    }
    if (!razonSocial) {
      alert("Seleccioná la razón social emisora (Aquiles o Conancap)")
      return
    }
    const vendedor = vendedores.find((v) => v.id === selectedVendedorId) || currentUser
    if (!vendedor) {
      alert("Seleccioná un vendedor")
      return
    }
    // Todos los vendedores pueden cotizar. Usamos sus iniciales si las tiene;
    // si no, las derivamos del nombre (fallback) para el correlativo COT-XXX-NNNN.
    const iniciales = (vendedor.iniciales && vendedor.iniciales.trim())
      ? vendedor.iniciales.trim().toUpperCase()
      : ((vendedor.name || "").split(/\s+/).filter(Boolean).slice(0, 3).map((w) => w[0]).join("").toUpperCase() || "VEN")

    setSubmitting(true)
    try {
      const numero = await getNextCotizacionVentaNumero(iniciales)
      const client = clients.find((c) => c.id === selectedClientId)!
      const id = await createCotizacionVenta({
        numero,
        client_id: selectedClientId,
        client_name: client.businessName,
        vendedor_id: vendedor.id || null,
        vendedor_nombre: vendedor.name || null,
        vendedor_iniciales: iniciales,
        razon_social: razonSocial || null,
        zona: client.zona || null,
        validez_fecha: validezFecha || null,
        forma_pago: formaPago || null,
        plazo_entrega: plazoEntrega || null,
        observaciones: observaciones || null,
        total: subtotal,
        items: items.map((i) => ({
          // Líneas descuento/libre usan productId sintético "desc-…"/"libre-…"
          // en el form para tracking; al persistir lo enviamos como null para no
          // romper la FK contra products(id). Solo las líneas de catálogo guardan
          // product_id real.
          product_id: i.tipoLinea === "producto" || !i.tipoLinea ? i.productId : null,
          producto_nombre: i.productName,
          producto_codigo: i.productCode,
          cantidad: i.quantity,
          precio_unitario: i.price,
          subtotal: i.price * i.quantity,
          tipo_linea: i.tipoLinea || "producto",
        })),
      })
      router.push(`/admin/cotizaciones-venta/${id}`)
    } catch (e: any) {
      console.error("Error creando cotización:", {
        message: e?.message,
        code: e?.code,
        details: e?.details,
        hint: e?.hint,
        full: e,
      })
      alert(`Error al crear la cotización: ${e?.message || e?.details || e?.hint || "desconocido"}`)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <Link href="/admin/cotizaciones-venta"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Nueva Cotización</h1>
            <p className="text-muted-foreground">El número se genera automáticamente según el vendedor</p>
          </div>
        </div>

        {/* Vendedor y Cliente */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">1. Vendedor y Cliente</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <Label>Vendedor</Label>
              <Select value={selectedVendedorId} onValueChange={setSelectedVendedorId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar vendedor..." /></SelectTrigger>
                <SelectContent>
                  {activeVendedores.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}{v.iniciales ? ` (${v.iniciales})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Razón Social</Label>
              <Select value={razonSocial} onValueChange={setRazonSocial}>
                <SelectTrigger><SelectValue placeholder="Seleccionar empresa..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Aquiles">Aquiles</SelectItem>
                  <SelectItem value="Conancap">Conancap</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!selectedClient ? (
            <div className="space-y-3">
              <Label>Cliente</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar cliente..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-lg">
                {filteredClients.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedClientId(c.id)}
                    className="w-full p-3 text-left hover:bg-muted border-b last:border-b-0"
                  >
                    <p className="font-medium">{c.businessName}</p>
                    <p className="text-sm text-muted-foreground">{c.contactName} • {c.zona}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Cliente</Label>
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <p className="font-medium">{selectedClient.businessName}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedClient.contactName} • {selectedClient.zona}
                    {selectedClient.condicionPago && <span className="ml-2">• Pago: {selectedClient.condicionPago}</span>}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedClientId("")}>Cambiar</Button>
              </div>
            </div>
          )}
        </Card>

        {/* Productos */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">2. Productos</h2>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedClientId}
                title={selectedClientId ? "Ver historial de ventas del cliente" : "Seleccioná un cliente primero"}
                onClick={() => setHistDialog({ open: true })}
              >
                <History className="h-4 w-4 mr-1" /> Historial cliente
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={addLineaLibre}>
                + Línea libre
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={addDescuento}>
                + Línea de descuento
              </Button>
            </div>
          </div>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar producto por nombre o código..."
              value={productSearch}
              onChange={(e) => { setProductSearch(e.target.value); setShowProductResults(true) }}
              onFocus={() => setShowProductResults(true)}
              className="pl-10"
            />
            {showProductResults && filteredProducts.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {filteredProducts.map((p) => {
                  // R.1: indicador de stock idéntico a pedidos/nuevo
                  const noStock = p.stock <= 0
                  const hasOCPending = pendingOCProducts.has((p.name || "").toLowerCase()) || pendingOCProducts.has((p.code || "").toLowerCase())
                  const stockColor = noStock
                    ? "bg-red-100 text-red-700 border-red-200"
                    : hasOCPending && p.stock < 10
                    ? "bg-amber-100 text-amber-700 border-amber-200"
                    : "bg-green-100 text-green-700 border-green-200"
                  const stockIcon = noStock ? "🔴" : hasOCPending && p.stock < 10 ? "🟡" : "🟢"
                  return (
                    <button
                      key={p.id}
                      onClick={() => addProduct(p)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 border-b last:border-b-0"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium">{p.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">{p.code}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{stockIcon}</span>
                          <Badge variant="outline" className={`${stockColor} text-xs`}>
                            {noStock ? "Sin stock" : `Stock: ${p.stock}`}
                          </Badge>
                          <span className="text-sm font-medium">{formatCurrencyExact(p.price)}</span>
                        </div>
                      </div>
                      {hasOCPending && (
                        <div className="mt-1 text-xs text-amber-600">Mercadería en camino</div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {items.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs font-medium">
                  <tr>
                    <th className="px-2 py-2 text-center w-20">Cant.</th>
                    <th className="px-2 py-2 text-center w-16">Stock</th>
                    <th className="px-2 py-2 text-left">Producto</th>
                    <th className="px-2 py-2 text-right w-28">Precio s/IVA</th>
                    <th className="px-2 py-2 text-right w-32">Subtotal s/IVA</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.productId || item.productCode || item.productName}
                      className={`border-t ${item.tipoLinea === "descuento" ? "bg-amber-50" : item.tipoLinea === "libre" ? "bg-blue-50/60" : ""}`}
                    >
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          disabled={item.tipoLinea === "descuento"}
                          onChange={(e) => {
                            const q = parseInt(e.target.value) || 0
                            if (q <= 0) setItems(items.filter((i) => i.productId !== item.productId))
                            else setItems(items.map((i) => (i.productId === item.productId ? { ...i, quantity: q } : i)))
                          }}
                          className="h-8 text-center text-sm"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {item.tipoLinea === "producto" || !item.tipoLinea ? (
                          <Badge
                            variant="outline"
                            className={`text-xs ${item.stock >= item.quantity ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}
                          >
                            {item.stock}
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {item.tipoLinea === "libre" ? (
                            <>
                              {/* R.3: línea libre — código y descripción editables */}
                              <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300 text-xs">LIBRE</Badge>
                              <Input
                                value={item.productCode}
                                onChange={(e) => setItems(items.map((i) => (i.productId === item.productId ? { ...i, productCode: e.target.value } : i)))}
                                placeholder="Código (opcional)"
                                className="h-7 text-xs font-mono w-32"
                              />
                              <Input
                                value={item.productName}
                                onChange={(e) => setItems(items.map((i) => (i.productId === item.productId ? { ...i, productName: e.target.value } : i)))}
                                placeholder="Descripción del producto"
                                className="h-7 text-sm flex-1 min-w-[200px]"
                              />
                            </>
                          ) : item.tipoLinea === "descuento" ? (
                            <>
                              <span className="font-mono text-xs text-muted-foreground">{item.productCode}</span>
                              <Input
                                value={item.productName}
                                onChange={(e) => setItems(items.map((i) => (i.productId === item.productId ? { ...i, productName: e.target.value } : i)))}
                                placeholder="Ej: Descuento por pago contado"
                                className="h-7 text-sm flex-1 min-w-[200px]"
                              />
                            </>
                          ) : (
                            <>
                              <span className="font-mono text-xs text-muted-foreground">{item.productCode}</span>
                              {/* N.5: descripción editable por línea (default del catálogo) */}
                              <Input
                                value={item.productName}
                                onChange={(e) => setItems(items.map((i) => (i.productId === item.productId ? { ...i, productName: e.target.value } : i)))}
                                className="h-7 text-sm font-medium flex-1 min-w-[200px]"
                                title="Editable: podés ajustar la descripción de esta línea"
                              />
                              <button
                                type="button"
                                disabled={!selectedClientId}
                                title={selectedClientId ? "Historial de este producto al cliente" : "Seleccioná un cliente primero"}
                                className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-300 disabled:cursor-not-allowed flex items-center gap-0.5"
                                onClick={() => setHistDialog({ open: true, productId: item.productId as string, productName: item.productName })}
                              >
                                <History className="h-3 w-3" /> Hist.
                              </button>
                            </>
                          )}
                          {item.productId && item.tipoLinea === "producto" && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-0.5"
                                    onMouseEnter={() => loadProveedoresProducto(item.productId as string)}
                                  >
                                    <Truck className="h-3 w-3" /> Prov.
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="max-w-xs">
                                  <p className="font-semibold text-xs mb-1">Proveedores asociados:</p>
                                  {(() => {
                                    const list = provsByProduct[item.productId as string]
                                    if (!list) return <p className="text-xs text-gray-400">Cargando...</p>
                                    if (list.length === 0) return <p className="text-xs text-gray-400">Sin proveedores asociados</p>
                                    return list.map((p, i) => (
                                      <p key={i} className="text-xs">
                                        {p.proveedor_nombre}{p.precio_proveedor ? ` - ${formatCurrencyExact(Number(p.precio_proveedor))}` : ""}
                                      </p>
                                    ))
                                  })()}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          step={0.01}
                          // Descuentos permiten negativos (eso es su propósito).
                          // Productos siguen con min 0.
                          min={item.tipoLinea === "descuento" ? undefined : 0}
                          value={item.price}
                          onChange={(e) => {
                            const parsed = parseFloat(e.target.value) || 0
                            // En descuentos el monto SIEMPRE resta: se coacciona a
                            // negativo (el operario tipea "100" y el subtotal baja
                            // $100). Antes guardaba tal cual y "100" SUMABA.
                            const price = item.tipoLinea === "descuento" ? -Math.abs(parsed) : parsed
                            setItems(items.map((i) => (i.productId === item.productId ? { ...i, price } : i)))
                          }}
                          className="h-8 text-right text-sm"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{formatCurrencyExact(item.price * item.quantity)}</td>
                      <td className="px-1 py-1.5 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setItems(items.filter((i) => i.productId !== item.productId))}
                          className="h-8 w-8 text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {/* R.2: discriminación de impuestos idéntica a pedidos/nuevo */}
                  <tr className="bg-muted/50 border-t">
                    <td colSpan={4} className="px-2 py-1.5 text-right text-sm text-muted-foreground">Subtotal (sin IVA)</td>
                    <td className="px-2 py-1.5 text-right text-sm">{formatCurrencyExact(subtotal)}</td>
                    <td />
                  </tr>
                  <tr className="bg-muted/50">
                    <td colSpan={4} className="px-2 py-1.5 text-right text-sm text-muted-foreground">IVA 21%</td>
                    <td className="px-2 py-1.5 text-right text-sm">{formatCurrencyExact(ivaCalculado)}</td>
                    <td />
                  </tr>
                  <tr className="bg-muted border-t">
                    <td colSpan={4} className="px-2 py-2 text-right font-semibold">Total</td>
                    <td className="px-2 py-2 text-right text-xl font-bold">{formatCurrencyExact(totalConIva)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground border rounded-lg">
              <p>Buscá y agregá productos a la cotización</p>
            </div>
          )}
        </Card>

        {/* Términos y Condiciones */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">3. Términos y Condiciones</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="space-y-2">
              <Label>Validez (hasta)</Label>
              <Input type="date" value={validezFecha} onChange={(e) => setValidezFecha(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Forma de pago</Label>
              <Select value={formaPago} onValueChange={setFormaPago}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {FORMAS_PAGO.map((fp) => (<SelectItem key={fp} value={fp}>{fp}</SelectItem>))}
                  {formaPago && !FORMAS_PAGO.includes(formaPago) && (
                    <SelectItem value={formaPago}>{formaPago}</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plazo de entrega</Label>
              <Select value={plazoEntrega} onValueChange={setPlazoEntrega}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {PLAZOS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observaciones</Label>
            <Textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3} placeholder="Notas adicionales..." />
          </div>
        </Card>

        <div className="flex gap-3">
          <Button asChild variant="outline" className="flex-1">
            <Link href="/admin/cotizaciones-venta">Cancelar</Link>
          </Button>
          <Button onClick={handleSubmit} className="flex-1" disabled={submitting || !selectedClientId || items.length === 0}>
            {submitting ? "Creando..." : "Crear Cotización"}
          </Button>
        </div>
      </div>

      <HistorialVentasDialog
        open={histDialog.open}
        onOpenChange={(o) => setHistDialog((prev) => ({ ...prev, open: o }))}
        clientId={selectedClientId}
        clientName={clients.find((c) => c.id === selectedClientId)?.businessName}
        productId={histDialog.productId}
        productName={histDialog.productName}
      />
    </div>
  )
}
