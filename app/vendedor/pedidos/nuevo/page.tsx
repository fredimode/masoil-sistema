"use client"

import { Suspense, useState, useEffect, useMemo } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCurrentVendedor } from "@/lib/hooks/useCurrentVendedor"
import { fetchClientsByVendedor, fetchProducts, createOrder } from "@/lib/supabase/queries"
import type { Client, Product } from "@/lib/types"
import { formatCurrency } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Plus, Trash2, Search, AlertTriangle } from "lucide-react"
import Link from "next/link"

interface OrderItem {
  productId: string
  productCode: string
  productName: string
  quantity: number
  price: number
}

function NuevoPedidoContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const preselectedClientId = searchParams.get("clientId")
  const { vendedor, loading } = useCurrentVendedor()

  const [clients, setClients] = useState<Client[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const vendedorId = vendedor?.id ?? ""

  useEffect(() => {
    if (!vendedorId) return
    setLoadingData(true)
    Promise.all([
      fetchClientsByVendedor(vendedorId),
      fetchProducts(),
    ])
      .then(([c, p]) => {
        setClients(c)
        setProducts(p)
      })
      .catch(() => {
        setClients([])
        setProducts([])
      })
      .finally(() => setLoadingData(false))
  }, [vendedorId])

  const [selectedClientId, setSelectedClientId] = useState(preselectedClientId || "")
  const [clientSearch, setClientSearch] = useState("")
  const [orderItems, setOrderItems] = useState<OrderItem[]>([])
  const [selectedProductId, setSelectedProductId] = useState("")
  const [quantity, setQuantity] = useState(1)
  const [notes, setNotes] = useState("")
  const [isUrgent, setIsUrgent] = useState(false)
  const [productSearch, setProductSearch] = useState("")

  // Filter clients for search
  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients
    return clients.filter(
      (c) =>
        c.businessName.toLowerCase().includes(clientSearch.toLowerCase()) ||
        c.contactName.toLowerCase().includes(clientSearch.toLowerCase())
    )
  }, [clients, clientSearch])

  // Filter products for search
  const filteredProducts = useMemo(() => {
    if (!productSearch) return products
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        p.code.toLowerCase().includes(productSearch.toLowerCase())
    )
  }, [products, productSearch])

  const selectedClient = clients.find((c) => c.id === selectedClientId)

  const addProduct = () => {
    const product = products.find((p) => p.id === selectedProductId)
    if (!product || quantity <= 0) return

    const existingIndex = orderItems.findIndex((item) => item.productId === selectedProductId)
    if (existingIndex >= 0) {
      const newItems = [...orderItems]
      newItems[existingIndex].quantity += quantity
      setOrderItems(newItems)
    } else {
      setOrderItems([
        ...orderItems,
        {
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          quantity,
          price: product.price,
        },
      ])
    }

    setSelectedProductId("")
    setQuantity(1)
    setProductSearch("")
  }

  const removeProduct = (productId: string) => {
    setOrderItems(orderItems.filter((item) => item.productId !== productId))
  }

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeProduct(productId)
      return
    }
    setOrderItems(
      orderItems.map((item) => (item.productId === productId ? { ...item, quantity: newQuantity } : item))
    )
  }

  const subtotal = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0)

  const hasCustomProduct = orderItems.some((item) => {
    const product = products.find((p) => p.id === item.productId)
    return product?.isCustomizable
  })

  const handleSubmit = async () => {
    if (!selectedClientId || orderItems.length === 0 || !vendedor) {
      alert("Por favor selecciona un cliente y agrega al menos un producto")
      return
    }

    setSubmitting(true)
    try {
      await createOrder({
        clientId: selectedClientId,
        clientName: selectedClient?.businessName ?? "",
        vendedorId: vendedor.id,
        vendedorName: vendedor.name,
        zona: selectedClient?.zona ?? "",
        notes,
        isCustom: hasCustomProduct,
        isUrgent,
        total: subtotal,
        items: orderItems,
      })
      router.push("/vendedor/pedidos")
    } catch (err) {
      alert("Error al crear el pedido. Intenta de nuevo.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || loadingData) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-primary text-primary-foreground p-4">
          <Skeleton className="h-7 w-40 bg-primary-foreground/20" />
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="text-primary-foreground">
            <Link href="/vendedor/pedidos">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-xl font-bold">Nuevo Pedido</h1>
        </div>
      </div>

      <div className="p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Cliente */}
          <Card className="p-4 md:p-6">
            <h2 className="text-lg font-semibold mb-4">1. Seleccionar Cliente</h2>

            {!selectedClient ? (
              <div className="space-y-3">
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
                  {filteredClients.map((client) => (
                    <button
                      key={client.id}
                      onClick={() => setSelectedClientId(client.id)}
                      className="w-full p-3 text-left hover:bg-muted border-b last:border-b-0 transition-colors"
                    >
                      <p className="font-medium">{client.businessName}</p>
                      <p className="text-sm text-muted-foreground">
                        {client.contactName} • {client.zona}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <p className="font-medium">{selectedClient.businessName}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedClient.contactName} • {selectedClient.zona}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedClientId("")}>
                  Cambiar
                </Button>
              </div>
            )}
          </Card>

          {/* Productos */}
          <Card className="p-4 md:p-6">
            <h2 className="text-lg font-semibold mb-4">2. Agregar Productos</h2>

            <div className="grid grid-cols-1 md:grid-cols-[1fr,100px,auto] gap-3 mb-4">
              <div className="space-y-2">
                <Label>Producto</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar producto..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {productSearch && (
                  <div className="max-h-40 overflow-y-auto border rounded-lg absolute bg-background z-10 w-full shadow-lg">
                    {filteredProducts.slice(0, 10).map((product) => (
                      <button
                        key={product.id}
                        onClick={() => {
                          setSelectedProductId(product.id)
                          setProductSearch(product.name)
                        }}
                        className="w-full p-2 text-left hover:bg-muted text-sm border-b last:border-b-0"
                      >
                        <span className="font-mono text-xs text-muted-foreground">{product.code}</span>
                        <span className="ml-2">{product.name}</span>
                        <span className="ml-2 text-muted-foreground">{formatCurrency(product.price)}</span>
                        {product.stock === 0 && (
                          <span className="ml-2 text-destructive text-xs">(Sin stock)</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={addProduct} disabled={!selectedProductId}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Lista de productos */}
            {orderItems.length > 0 ? (
              <div className="border rounded-lg">
                <div className="hidden md:grid grid-cols-[1fr,100px,120px,80px] gap-4 p-3 bg-muted text-sm font-medium">
                  <span>Producto</span>
                  <span className="text-center">Cant.</span>
                  <span className="text-right">Subtotal</span>
                  <span></span>
                </div>
                {orderItems.map((item) => (
                  <div
                    key={item.productId}
                    className="grid grid-cols-1 md:grid-cols-[1fr,100px,120px,80px] gap-2 md:gap-4 p-3 border-t items-center"
                  >
                    <div>
                      <p className="font-medium text-sm">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.productCode} • {formatCurrency(item.price)} c/u
                      </p>
                    </div>
                    <div className="flex items-center gap-2 md:justify-center">
                      <span className="md:hidden text-sm text-muted-foreground">Cantidad:</span>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 0)}
                        className="w-20"
                      />
                    </div>
                    <div className="flex items-center justify-between md:justify-end">
                      <span className="md:hidden text-sm text-muted-foreground">Subtotal:</span>
                      <p className="font-semibold">{formatCurrency(item.price * item.quantity)}</p>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProduct(item.productId)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center p-3 border-t bg-muted">
                  <span className="font-semibold">Total</span>
                  <span className="text-xl font-bold">{formatCurrency(subtotal)}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">
                <p>No hay productos agregados</p>
              </div>
            )}
          </Card>

          {/* Opciones adicionales */}
          <Card className="p-4 md:p-6">
            <h2 className="text-lg font-semibold mb-4">3. Opciones</h2>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notes">Observaciones</Label>
                <Textarea
                  id="notes"
                  placeholder="Notas adicionales para el pedido..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <Checkbox
                  id="urgent"
                  checked={isUrgent}
                  onCheckedChange={(checked) => setIsUrgent(checked === true)}
                />
                <div className="flex-1">
                  <Label htmlFor="urgent" className="cursor-pointer flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    Marcar como urgente
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    El pedido tendrá prioridad en el procesamiento
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Acciones */}
          <div className="flex gap-3 pb-20 md:pb-6">
            <Button asChild variant="outline" className="flex-1">
              <Link href="/vendedor/pedidos">Cancelar</Link>
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1"
              disabled={!selectedClientId || orderItems.length === 0 || submitting}
            >
              {submitting ? "Creando..." : "Crear Pedido"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function NuevoPedidoPage() {
  return (
    <Suspense>
      <NuevoPedidoContent />
    </Suspense>
  )
}
