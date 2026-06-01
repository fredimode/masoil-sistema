"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { fetchClients, fetchProducts, fetchVendedores, createOrder, esVendedorComercial, fetchProveedoresByProducto } from "@/lib/supabase/queries"
import { createClient } from "@/lib/supabase/client"
import { useCurrentVendedor } from "@/lib/hooks/useCurrentVendedor"
import type { Client, Product, Vendedor } from "@/lib/types"
import { formatCurrency, formatCurrencyExact } from "@/lib/utils"
import { ArrowLeft, Plus, Trash2, Search, AlertTriangle, PackagePlus, History, CircleDot, Truck } from "lucide-react"
import Link from "next/link"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { HistorialVentasDialog } from "@/components/historial-ventas-dialog"

interface OrderItem {
  productId: string
  productCode: string
  productName: string
  quantity: number
  price: number
  stock: number
  requiereCotizacion: boolean
  tipoLinea?: "producto" | "libre" | "descuento"
}

export default function AdminNuevoPedidoPage() {
  const router = useRouter()
  const supabase = createClient()
  const { vendedor: currentUser } = useCurrentVendedor()

  const [clients, setClients] = useState<Client[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedClientId, setSelectedClientId] = useState("")
  const [histDialog, setHistDialog] = useState<{ open: boolean; productId?: string; productName?: string }>({ open: false })
  const [selectedVendedorId, setSelectedVendedorId] = useState("")
  const [clientSearch, setClientSearch] = useState("")
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [productSearch, setProductSearch] = useState("")
  const [showProductResults, setShowProductResults] = useState(false)
  const [notes, setNotes] = useState("")
  const [isUrgent, setIsUrgent] = useState(false)
  const [isCustom, setIsCustom] = useState(false)
  const [razonSocial, setRazonSocial] = useState("")
  const [observacionesIncompleto, setObservacionesIncompleto] = useState("")
  const [sector, setSector] = useState("")
  const [solicita, setSolicita] = useState("")
  const [recibe, setRecibe] = useState("")
  const [entregaOtraSucursal, setEntregaOtraSucursal] = useState("")
  const [submitting, setSubmitting] = useState(false)

  // Inline product creation
  const [showNewProductDialog, setShowNewProductDialog] = useState(false)
  const [newProduct, setNewProduct] = useState({ code: "", name: "", price: 0, category: "" })
  const [creatingProduct, setCreatingProduct] = useState(false)

  // Price history per product
  const [priceHistory, setPriceHistory] = useState<Record<string, { fecha: string; precio: number }[]>>({})

  // Proveedores asociados al producto (informativo)
  const [provsByProduct, setProvsByProduct] = useState<Record<string, any[]>>({})
  async function loadProveedoresProducto(productId: string) {
    if (provsByProduct[productId]) return
    try {
      const data = await fetchProveedoresByProducto(productId)
      setProvsByProduct((prev) => ({ ...prev, [productId]: data }))
    } catch {
      // non-blocking
    }
  }

  async function loadPriceHistory(productId: string) {
    if (priceHistory[productId]) return
    try {
      const { data } = await supabase
        .from("order_items")
        .select("unit_price, created_at, order_id")
        .eq("product_id", productId)
        .order("created_at", { ascending: false })
        .limit(5)
      setPriceHistory((prev) => ({
        ...prev,
        [productId]: (data || []).map((d: any) => ({
          fecha: new Date(d.created_at).toLocaleDateString("es-AR"),
          precio: Number(d.unit_price),
        })),
      }))
    } catch {
      // non-blocking
    }
  }

  // Pending OC for stock indicator (yellow = mercadería en camino)
  const [pendingOCProducts, setPendingOCProducts] = useState<Set<string>>(new Set())
  useEffect(() => {
    supabase
      .from("compras")
      .select("articulo")
      .in("estado", ["Pendiente", "Realizado"])
      .then(({ data }) => {
        if (data) {
          const arts = new Set(data.map((c: any) => (c.articulo || "").toLowerCase()))
          setPendingOCProducts(arts as any)
        }
      })
  }, [])

  useEffect(() => {
    Promise.all([fetchClients(), fetchProducts(), fetchVendedores()])
      .then(([c, p, v]) => { setClients(c); setProducts(p); setVendedores(v) })
      .catch((err) => console.error("Error:", err))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>

  const activeVendedores = vendedores.filter((v) => v.isActive && esVendedorComercial(v))
  const selectedClient = clients.find((c) => c.id === selectedClientId)

  // Filter clients (solo por búsqueda, no por vendedor seleccionado)
  const filteredClients = clients.filter((c) => {
    if (!clientSearch) return true
    const q = clientSearch.toLowerCase()
    return c.businessName.toLowerCase().includes(q) || c.contactName.toLowerCase().includes(q)
  }).slice(0, 20)

  // Filter products for search
  const filteredProducts = productSearch.length >= 2
    ? products.filter((p) =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.code.toLowerCase().includes(productSearch.toLowerCase())
      ).slice(0, 10)
    : []

  function addProduct(product: Product) {
    const existing = orderItems.find((i) => i.productId === product.id)
    if (existing) {
      setOrderItems(orderItems.map((i) =>
        i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i
      ))
    } else {
      const stockInsuficiente = product.stock < 1
      // J.4: products.price se guarda CON IVA. Mostramos al operador el
      // precio sin IVA (consistencia con /admin/facturacion/nueva post fix
      // A.2). Al persistir multiplicamos x1.21 para mantener la convencion
      // unit_price con IVA en BD — ver handleSubmit.
      const priceSinIva = Math.round((product.price / 1.21) * 100) / 100
      setOrderItems([...orderItems, {
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        quantity: 1,
        price: priceSinIva,
        stock: product.stock,
        requiereCotizacion: stockInsuficiente,
      }])
    }
    setProductSearch("")
    setShowProductResults(false)
  }

  function updateItemQuantity(productId: string, qty: number) {
    if (qty <= 0) {
      setOrderItems(orderItems.filter((i) => i.productId !== productId))
      return
    }
    setOrderItems(orderItems.map((i) => {
      if (i.productId !== productId) return i
      const stockInsuficiente = i.stock < qty
      return { ...i, quantity: qty, requiereCotizacion: stockInsuficiente ? true : i.requiereCotizacion }
    }))
  }

  function toggleCotizacion(productId: string) {
    setOrderItems(orderItems.map((i) =>
      i.productId === productId ? { ...i, requiereCotizacion: !i.requiereCotizacion } : i
    ))
  }

  async function handleCreateProduct() {
    if (!newProduct.name) {
      alert("Completá al menos la descripción del producto")
      return
    }
    setCreatingProduct(true)
    try {
      const { data, error } = await supabase
        .from("products")
        .insert({
          code: newProduct.code || null,
          name: newProduct.name,
          price: newProduct.price || 0,
          category: newProduct.category || null,
          stock: 0,
          is_customizable: false,
          custom_lead_time: 0,
          low_stock_threshold: 5,
          critical_stock_threshold: 2,
        })
        .select()
        .single()

      if (error) throw error

      // Add to local products list
      const created: Product = {
        id: data.id,
        code: data.code,
        name: data.name,
        category: data.category,
        stock: 0,
        price: data.price,
        isCustomizable: false,
        customLeadTime: 0,
        lowStockThreshold: 5,
        criticalStockThreshold: 2,
      }
      setProducts((prev) => [created, ...prev])
      addProduct(created)
      setShowNewProductDialog(false)
      setNewProduct({ code: "", name: "", price: 0, category: "" })
    } catch (err) {
      console.error("Error creating product:", err)
      alert("Error al crear producto")
    } finally {
      setCreatingProduct(false)
    }
  }

  // J.4: el precio mostrado en el form es SIN IVA. subtotalSinIva es la
  // suma de items con su signo (descuentos restan). ivaCalculado se asume
  // 21% (no hay metadata de alicuota por producto). totalConIva es lo que
  // se persiste en orders.total.
  const subtotalSinIva = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const ivaCalculado = Math.round(subtotalSinIva * 0.21 * 100) / 100
  const totalConIva = Math.round((subtotalSinIva + ivaCalculado) * 100) / 100
  // Alias para compat con codigo viejo que referencia "subtotal".
  const subtotal = totalConIva
  const hayItemsCotizacion = orderItems.some((i) => i.requiereCotizacion)

  // Línea libre: producto no catalogado (item Excel #78). product_id null,
  // nombre/precio/cantidad editables, sin stock check ni requiereCotizacion.
  function addLineaLibre() {
    setOrderItems([
      ...orderItems,
      {
        productId: `libre-${Date.now()}`,
        productCode: "",
        productName: "",
        quantity: 1,
        price: 0,
        stock: 999999, // no aplica
        requiereCotizacion: false,
        tipoLinea: "libre",
      },
    ])
  }

  // Línea de descuento general (item Excel #90). Precio negativo editable,
  // cantidad fija en 1, suma algebraica al total.
  function addDescuento() {
    setOrderItems([
      ...orderItems,
      {
        productId: `desc-${Date.now()}`,
        productCode: "DESCUENTO",
        productName: "Descuento",
        quantity: 1,
        price: 0,
        stock: 999999,
        requiereCotizacion: false,
        tipoLinea: "descuento",
      },
    ])
  }

  async function handleSubmit(asDraft: boolean = false) {
    if (!selectedClientId || orderItems.length === 0) {
      alert("Seleccioná un cliente y agregá al menos un producto")
      return
    }
    const vendedor = vendedores.find((v) => v.id === selectedVendedorId)
    const client = clients.find((c) => c.id === selectedClientId)
    if (!client) return

    setSubmitting(true)
    try {
      const orderId = await createOrder({
        clientId: selectedClientId,
        clientName: client.businessName,
        vendedorId: selectedVendedorId || currentUser?.id || "",
        vendedorName: vendedor?.name || currentUser?.name || "Admin",
        zona: client.zona,
        notes,
        isCustom,
        isUrgent,
        total: totalConIva,
        items: orderItems.map((i) => ({
          // productId sintético "libre-…"/"desc-…" se filtra en queries.ts
          // (no es UUID válido) y queda como null en BD.
          productId: i.tipoLinea === "producto" || !i.tipoLinea ? i.productId : null,
          productCode: i.productCode,
          productName: i.productName,
          quantity: i.quantity,
          // J.4: el form muestra precios sin IVA; al persistir multiplicamos
          // x1.21 para mantener la convencion unit_price con IVA en BD (compat
          // con flow de facturacion que divide al emitir FC).
          price: Math.round(i.price * 1.21 * 100) / 100,
          tipoLinea: i.tipoLinea || "producto",
        })),
        razonSocial,
        status: asDraft ? "BORRADOR" : "INGRESADO",
      })

      // Update additional fields
      const updateFields: Record<string, any> = {}
      if (hayItemsCotizacion) updateFields.requiere_cotizacion = true
      if (razonSocial) updateFields.razon_social = razonSocial
      if (sector) updateFields.sector = sector
      if (solicita) updateFields.solicita = solicita
      if (recibe) updateFields.recibe = recibe
      if (entregaOtraSucursal) updateFields.entrega_otra_sucursal = entregaOtraSucursal

      // Check if order is incomplete (items with stock < quantity)
      const itemsSinStock = orderItems.filter((i) => i.stock < i.quantity)
      if (itemsSinStock.length > 0) {
        updateFields.es_incompleto = true
        updateFields.observaciones_incompleto = observacionesIncompleto || `Stock insuficiente para: ${itemsSinStock.map((i) => i.productName).join(", ")}`
      }

      if (Object.keys(updateFields).length > 0) {
        await supabase.from("orders").update(updateFields).eq("id", orderId)
      }

      router.push(`/admin/pedidos/${orderId}`)
    } catch (err) {
      console.error("Error creating order:", err)
      alert("Error al crear el pedido")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <Link href="/admin/pedidos"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Nuevo Pedido</h1>
            <p className="text-muted-foreground">Crear un nuevo pedido</p>
          </div>
        </div>

        {/* 1. Vendedor y Cliente */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">1. Vendedor y Cliente</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="space-y-2">
              <Label>Vendedor</Label>
              <Select value={selectedVendedorId} onValueChange={setSelectedVendedorId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar vendedor..." /></SelectTrigger>
                <SelectContent>
                  {activeVendedores.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name} - {v.zonas.join(", ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Razón Social</Label>
              <Select value={razonSocial} onValueChange={setRazonSocial}>
                <SelectTrigger><SelectValue placeholder="Seleccionar empresa..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Masoil">Masoil</SelectItem>
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
                <Input placeholder="Buscar cliente..." value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} className="pl-10" />
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-lg">
                {filteredClients.map((c) => (
                  <button key={c.id} onClick={() => setSelectedClientId(c.id)} className="w-full p-3 text-left hover:bg-muted border-b last:border-b-0">
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
              {/* Client last orders */}
              <ClientOrderHistory clientId={selectedClient.id} />
            </div>
          )}
        </Card>

        {/* 2. Productos */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-semibold">2. Productos</h2>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                disabled={!selectedClientId}
                title={selectedClientId ? "Ver historial de ventas del cliente" : "Seleccioná un cliente primero"}
                onClick={() => setHistDialog({ open: true })}
              >
                <History className="h-4 w-4 mr-2" /> Historial cliente
              </Button>
              <Button variant="outline" size="sm" onClick={addLineaLibre}>
                + Línea libre
              </Button>
              <Button variant="outline" size="sm" onClick={addDescuento}>
                + Descuento
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowNewProductDialog(true)}>
                <PackagePlus className="h-4 w-4 mr-2" />
                Crear Producto
              </Button>
            </div>
          </div>

          {/* Product search */}
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
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        {p.costoNeto != null && <span>Costo: {formatCurrencyExact(p.costoNeto)}</span>}
                        <span>Venta: {formatCurrencyExact(p.price)}</span>
                        {hasOCPending && <span className="text-amber-600">Mercadería en camino</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Items list - Layout horizontal tipo factura */}
          {orderItems.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs font-medium">
                  <tr>
                    <th className="px-2 py-2 text-center w-20">Cant.</th>
                    <th className="px-2 py-2 text-center w-16">Stock</th>
                    <th className="px-2 py-2 text-left">Producto</th>
                    <th className="px-2 py-2 text-right w-24">Precio s/IVA</th>
                    <th className="px-2 py-2 text-right w-28">Subtotal s/IVA</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item) => {
                    const tipo = item.tipoLinea || "producto"
                    const esCatalogo = tipo === "producto"
                    const esDescuento = tipo === "descuento"
                    const stockOk = !esCatalogo || item.stock >= item.quantity
                    const product = esCatalogo ? products.find((p) => p.id === item.productId) : undefined
                    const history = priceHistory[item.productId]
                    const rowBg = esDescuento
                      ? "bg-amber-50"
                      : tipo === "libre"
                      ? "bg-blue-50/60"
                      : item.requiereCotizacion ? "bg-amber-50" : ""
                    return (
                      <tr key={item.productId} className={`border-t ${rowBg}`}>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            min={1}
                            value={item.quantity}
                            disabled={esDescuento}
                            onChange={(e) => updateItemQuantity(item.productId, parseInt(e.target.value) || 0)}
                            className="h-8 text-center text-sm"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          {esCatalogo ? (
                            stockOk ? (
                              <Badge variant="outline" className="bg-green-50 text-green-700 text-xs">{item.stock}</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-red-50 text-red-700 text-xs">{item.stock}</Badge>
                            )
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {!esCatalogo ? (
                              <>
                                <Badge variant="outline" className={esDescuento ? "bg-amber-100 text-amber-800 border-amber-300 text-xs" : "bg-blue-100 text-blue-800 border-blue-300 text-xs"}>
                                  {esDescuento ? "DESCUENTO" : "LIBRE"}
                                </Badge>
                                {tipo === "libre" && (
                                  <Input
                                    value={item.productCode}
                                    onChange={(e) => setOrderItems(orderItems.map((i) => (i.productId === item.productId ? { ...i, productCode: e.target.value } : i)))}
                                    placeholder="Código (opcional)"
                                    className="h-7 text-xs font-mono w-32"
                                  />
                                )}
                                <Input
                                  value={item.productName}
                                  onChange={(e) => setOrderItems(orderItems.map((i) => (i.productId === item.productId ? { ...i, productName: e.target.value } : i)))}
                                  placeholder={esDescuento ? "Ej: Descuento pago contado" : "Descripción del producto"}
                                  className="h-7 text-sm flex-1 min-w-[200px]"
                                />
                              </>
                            ) : (
                              <>
                                <span className="font-mono text-xs text-muted-foreground">{item.productCode}</span>
                                {/* N.5: descripción editable por línea (default del catálogo) */}
                                <Input
                                  value={item.productName}
                                  onChange={(e) => setOrderItems(orderItems.map((i) => (i.productId === item.productId ? { ...i, productName: e.target.value } : i)))}
                                  className="h-7 text-sm font-medium flex-1 min-w-[200px]"
                                  title="Editable: podés ajustar la descripción de esta línea"
                                />
                                {product?.costoNeto != null && (
                                  <span className="text-xs text-gray-400">(Costo: {formatCurrencyExact(product.costoNeto)})</span>
                                )}
                                {item.requiereCotizacion && (
                                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-xs">Cotizar</Badge>
                                )}
                                <button
                                  type="button"
                                  disabled={!selectedClientId}
                                  title={selectedClientId ? "Historial de este producto al cliente" : "Seleccioná un cliente primero"}
                                  className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-300 disabled:cursor-not-allowed flex items-center gap-0.5"
                                  onClick={() => setHistDialog({ open: true, productId: item.productId, productName: item.productName })}
                                >
                                  <History className="h-3 w-3" /> Hist.
                                </button>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-0.5"
                                        onMouseEnter={() => loadProveedoresProducto(item.productId)}
                                      >
                                        <Truck className="h-3 w-3" /> Prov.
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="bottom" className="max-w-xs">
                                      <p className="font-semibold text-xs mb-1">Proveedores asociados:</p>
                                      {(() => {
                                        const list = provsByProduct[item.productId]
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
                              </>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <Input
                            type="number"
                            step="0.01"
                            min={esDescuento ? undefined : 0}
                            value={item.price}
                            onChange={(e) => {
                              const parsed = parseFloat(e.target.value) || 0
                              // En líneas de descuento el monto SIEMPRE resta: se
                              // coacciona a negativo (el operario tipea "100" y el
                              // total baja $100). Antes se guardaba tal cual y, como
                              // el total es Σ price*qty, un "100" SUMABA.
                              const newPrice = esDescuento ? -Math.abs(parsed) : parsed
                              setOrderItems(orderItems.map((i) =>
                                i.productId === item.productId ? { ...i, price: newPrice } : i
                              ))
                            }}
                            className="h-8 text-right text-sm"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">{formatCurrencyExact(item.price * item.quantity)}</td>
                        <td className="px-1 py-1.5 text-center">
                          <Button variant="ghost" size="icon" onClick={() => setOrderItems(orderItems.filter((i) => i.productId !== item.productId))} className="h-8 w-8 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  {/* J.4: discriminacion de impuestos (idem facturacion/nueva) */}
                  <tr className="bg-muted/50 border-t">
                    <td colSpan={4} className="px-2 py-1.5 text-right text-sm text-muted-foreground">Subtotal (sin IVA)</td>
                    <td className="px-2 py-1.5 text-right text-sm">{formatCurrencyExact(subtotalSinIva)}</td>
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
              <p>Buscá y agregá productos al pedido</p>
            </div>
          )}

          {hayItemsCotizacion && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <p className="text-sm text-amber-800">
                <AlertTriangle className="inline h-4 w-4 mr-1" />
                Stock insuficiente para {orderItems.filter((i) => i.stock < i.quantity).length} producto(s). El pedido se marcará como <strong>INCOMPLETO</strong>.
              </p>
              <div>
                <Label className="text-xs text-amber-700">Observaciones del pedido incompleto</Label>
                <Textarea
                  value={observacionesIncompleto}
                  onChange={(e) => setObservacionesIncompleto(e.target.value)}
                  placeholder="Explicar qué falta o qué productos no tienen stock..."
                  rows={2}
                  className="mt-1 text-sm"
                />
              </div>
            </div>
          )}
        </Card>

        {/* 3. Opciones */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">3. Opciones</h2>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notes">Observaciones</Label>
              <Textarea id="notes" placeholder="Notas adicionales..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sector">Sector</Label>
                <Input id="sector" placeholder="Sector de entrega" value={sector} onChange={(e) => setSector(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="solicita">Solicita</Label>
                <Input id="solicita" placeholder="Quién solicita" value={solicita} onChange={(e) => setSolicita(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recibe">Recibe</Label>
                <Input id="recibe" placeholder="Quién recibe" value={recibe} onChange={(e) => setRecibe(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="entrega-sucursal">Entrega en otra sucursal (dirección)</Label>
                <Input id="entrega-sucursal" placeholder="Dirección de otra sucursal" value={entregaOtraSucursal} onChange={(e) => setEntregaOtraSucursal(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <Checkbox id="urgent" checked={isUrgent} onCheckedChange={(c) => setIsUrgent(c === true)} />
                <div className="flex-1">
                  <Label htmlFor="urgent" className="cursor-pointer flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Pedido Urgente
                  </Label>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <Checkbox id="custom" checked={isCustom} onCheckedChange={(c) => setIsCustom(c === true)} />
                <div className="flex-1">
                  <Label htmlFor="custom" className="cursor-pointer">Pedido Customizado</Label>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex gap-3">
          <Button asChild variant="outline" className="flex-1">
            <Link href="/admin/pedidos">Cancelar</Link>
          </Button>
          <Button
            onClick={() => handleSubmit(true)}
            variant="outline"
            className="flex-1"
            disabled={!selectedClientId || orderItems.length === 0 || submitting}
          >
            {submitting ? "Guardando..." : "Guardar Borrador"}
          </Button>
          <Button
            onClick={() => handleSubmit(false)}
            className="flex-1"
            disabled={!selectedClientId || orderItems.length === 0 || submitting}
          >
            {submitting ? "Creando..." : "Crear Pedido"}
          </Button>
        </div>
      </div>

      {/* New Product Dialog */}
      <Dialog open={showNewProductDialog} onOpenChange={setShowNewProductDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Crear Nuevo Producto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Descripción *</Label>
              <Input value={newProduct.name} onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))} placeholder="Nombre del producto" />
            </div>
            <div>
              <Label>Código <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input value={newProduct.code} onChange={(e) => setNewProduct((p) => ({ ...p, code: e.target.value }))} placeholder="Ej: LUB-001 (se puede completar después)" />
            </div>
            <div>
              <Label>Precio <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input type="number" min={0} step={0.01} value={newProduct.price || ""} onChange={(e) => setNewProduct((p) => ({ ...p, price: parseFloat(e.target.value) || 0 }))} placeholder="Se puede completar después" />
            </div>
            <div>
              <Label>Categoría</Label>
              <Select value={newProduct.category} onValueChange={(v) => setNewProduct((p) => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Limpiadores">Limpiadores</SelectItem>
                  <SelectItem value="Lubricantes">Lubricantes</SelectItem>
                  <SelectItem value="Selladores">Selladores</SelectItem>
                  <SelectItem value="Belleza">Belleza</SelectItem>
                  <SelectItem value="Higiene">Higiene</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewProductDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreateProduct} disabled={creatingProduct}>
              {creatingProduct ? "Creando..." : "Crear y Agregar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

function ClientOrderHistory({ clientId }: { clientId: string }) {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase
      .from("orders")
      .select("id, order_number_serial, status, total, created_at")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        setOrders(data || [])
        setLoading(false)
      })
  }, [clientId])

  if (loading) return null
  if (orders.length === 0) return null

  return (
    <div className="mt-2 p-3 bg-gray-50 rounded-lg border">
      <p className="text-xs font-semibold text-gray-500 mb-2">Últimos pedidos del cliente:</p>
      <div className="space-y-1">
        {orders.map((o) => (
          <div key={o.id} className="flex items-center justify-between text-xs">
            <span className="font-medium">{o.order_number_serial || o.id.slice(0, 8)}</span>
            <span className="text-gray-500">{new Date(o.created_at).toLocaleDateString("es-AR")}</span>
            <Badge variant="outline" className="text-xs">{o.status}</Badge>
            <span className="font-medium">{formatCurrencyExact(Number(o.total) || 0)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
