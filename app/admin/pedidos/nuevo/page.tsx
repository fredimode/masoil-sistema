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
import { fetchClients, fetchProducts, fetchVendedores, createOrder } from "@/lib/supabase/queries"
import { createClient } from "@/lib/supabase/client"
import { useCurrentVendedor } from "@/lib/hooks/useCurrentVendedor"
import type { Client, Product, Vendedor } from "@/lib/types"
import { formatCurrency } from "@/lib/utils"
import { ArrowLeft, Plus, Trash2, Search, AlertTriangle, PackagePlus } from "lucide-react"
import Link from "next/link"

interface OrderItem {
  productId: string
  productCode: string
  productName: string
  quantity: number
  price: number
  stock: number
  requiereCotizacion: boolean
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
  const [selectedVendedorId, setSelectedVendedorId] = useState("")
  const [clientSearch, setClientSearch] = useState("")
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [productSearch, setProductSearch] = useState("")
  const [showProductResults, setShowProductResults] = useState(false)
  const [notes, setNotes] = useState("")
  const [isUrgent, setIsUrgent] = useState(false)
  const [isCustom, setIsCustom] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  // Inline product creation
  const [showNewProductDialog, setShowNewProductDialog] = useState(false)
  const [newProduct, setNewProduct] = useState({ code: "", name: "", price: 0, category: "" })
  const [creatingProduct, setCreatingProduct] = useState(false)

  useEffect(() => {
    Promise.all([fetchClients(), fetchProducts(), fetchVendedores()])
      .then(([c, p, v]) => { setClients(c); setProducts(p); setVendedores(v) })
      .catch((err) => console.error("Error:", err))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>

  const activeVendedores = vendedores.filter((v) => v.role === "vendedor" && v.isActive)
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
      setOrderItems([...orderItems, {
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        quantity: 1,
        price: product.price,
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

  const subtotal = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const hayItemsCotizacion = orderItems.some((i) => i.requiereCotizacion)

  async function handleSubmit() {
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
        total: subtotal,
        items: orderItems.map((i) => ({
          productId: i.productId,
          productCode: i.productCode,
          productName: i.productName,
          quantity: i.quantity,
          price: i.price,
        })),
      })

      // If items need cotizacion, update the order flag
      if (hayItemsCotizacion) {
        await supabase.from("orders").update({ requiere_cotizacion: true }).eq("id", orderId)
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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
                  <p className="text-sm text-muted-foreground">{selectedClient.contactName} • {selectedClient.zona}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedClientId("")}>Cambiar</Button>
              </div>
            </div>
          )}
        </Card>

        {/* 2. Productos */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">2. Productos</h2>
            <Button variant="outline" size="sm" onClick={() => setShowNewProductDialog(true)}>
              <PackagePlus className="h-4 w-4 mr-2" />
              Crear Producto
            </Button>
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
              <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredProducts.map((p) => {
                  const lowStock = p.stock <= 0
                  return (
                    <button
                      key={p.id}
                      onClick={() => addProduct(p)}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 border-b last:border-b-0 flex items-center justify-between"
                    >
                      <div>
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{p.code}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {lowStock ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                            Sin stock
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                            Stock: {p.stock}
                          </Badge>
                        )}
                        <span className="text-sm font-medium">{formatCurrency(p.price)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Items list */}
          {orderItems.length > 0 ? (
            <div className="border rounded-lg">
              <div className="grid grid-cols-[1fr,80px,80px,100px,40px] gap-2 p-3 bg-muted text-xs font-medium">
                <span>Producto</span>
                <span className="text-center">Stock</span>
                <span className="text-center">Cant.</span>
                <span className="text-right">Subtotal</span>
                <span></span>
              </div>
              {orderItems.map((item) => {
                const stockOk = item.stock >= item.quantity
                return (
                  <div key={item.productId} className={`grid grid-cols-[1fr,80px,80px,100px,40px] gap-2 p-3 border-t items-center ${item.requiereCotizacion ? "bg-amber-50" : ""}`}>
                    <div>
                      <p className="font-medium text-sm">{item.productName}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">{item.productCode} • {formatCurrency(item.price)} c/u</span>
                        {item.requiereCotizacion && (
                          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 text-xs">
                            Cotizar
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-center">
                      {stockOk ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 text-xs">{item.stock}</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50 text-red-700 text-xs">{item.stock}</Badge>
                      )}
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateItemQuantity(item.productId, parseInt(e.target.value) || 0)}
                      className="w-16 h-8 text-center text-sm mx-auto"
                    />
                    <p className="font-semibold text-right text-sm">{formatCurrency(item.price * item.quantity)}</p>
                    <Button variant="ghost" size="icon" onClick={() => setOrderItems(orderItems.filter((i) => i.productId !== item.productId))} className="h-8 w-8 text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )
              })}
              <div className="flex justify-between items-center p-3 border-t bg-muted">
                <span className="font-semibold">Total</span>
                <span className="text-xl font-bold">{formatCurrency(subtotal)}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground border rounded-lg">
              <p>Buscá y agregá productos al pedido</p>
            </div>
          )}

          {hayItemsCotizacion && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                <AlertTriangle className="inline h-4 w-4 mr-1" />
                Hay items con stock insuficiente marcados para cotizar. El pedido se creará con <strong>requiere_cotizacion = true</strong>.
              </p>
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
          <Button onClick={handleSubmit} className="flex-1" disabled={!selectedClientId || orderItems.length === 0 || submitting}>
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
    </div>
  )
}
