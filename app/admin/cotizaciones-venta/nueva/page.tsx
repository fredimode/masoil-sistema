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
import { ArrowLeft, Search, Trash2, Truck } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import {
  fetchClients, fetchProducts, fetchVendedores,
  createCotizacionVenta, getNextCotizacionVentaNumero, esVendedorComercial,
  fetchProveedoresByProducto,
} from "@/lib/supabase/queries"
import { useCurrentVendedor } from "@/lib/hooks/useCurrentVendedor"
import type { Client, Product, Vendedor } from "@/lib/types"
import { formatCurrency, normalizeSearch } from "@/lib/utils"

interface CotItem {
  productId: string | null
  productCode: string
  productName: string
  quantity: number
  price: number
}

const PLAZOS = ["7 días hábiles", "10 días hábiles", "15 días hábiles"]
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
]

export default function NuevaCotizacionVentaPage() {
  const router = useRouter()
  const { vendedor: currentUser } = useCurrentVendedor()

  const [clients, setClients] = useState<Client[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedClientId, setSelectedClientId] = useState("")
  const [clientSearch, setClientSearch] = useState("")
  const [selectedVendedorId, setSelectedVendedorId] = useState("")
  const [razonSocial, setRazonSocial] = useState("")
  const [items, setItems] = useState<CotItem[]>([])
  const [productSearch, setProductSearch] = useState("")
  const [showProductResults, setShowProductResults] = useState(false)

  const [validezFecha, setValidezFecha] = useState("")
  const [formaPago, setFormaPago] = useState("")
  const [plazoEntrega, setPlazoEntrega] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [submitting, setSubmitting] = useState(false)
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
        price: p.price,
      }])
    }
    setProductSearch("")
    setShowProductResults(false)
  }

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.price * i.quantity, 0), [items])

  async function handleSubmit() {
    if (!selectedClientId || items.length === 0) {
      alert("Seleccioná un cliente y agregá al menos un producto")
      return
    }
    const vendedor = vendedores.find((v) => v.id === selectedVendedorId) || currentUser
    if (!vendedor || !esVendedorComercial(vendedor as any)) {
      alert("Seleccioná un vendedor comercial (PSG, JGE o DDM)")
      return
    }
    const iniciales = vendedor.iniciales || (
      vendedor.email === "pablo@masoil.com.ar" ? "PSG" :
      vendedor.email === "jestevez@masoil.com.ar" ? "JGE" :
      vendedor.email === "cobranzas@masoil.com.ar" ? "DDM" : ""
    )
    if (!iniciales) {
      alert("El vendedor no tiene iniciales configuradas")
      return
    }

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
          product_id: i.productId,
          producto_nombre: i.productName,
          producto_codigo: i.productCode,
          cantidad: i.quantity,
          precio_unitario: i.price,
          subtotal: i.price * i.quantity,
        })),
      })
      router.push(`/admin/cotizaciones-venta/${id}`)
    } catch (e) {
      console.error("Error creando cotización:", e)
      alert("Error al crear la cotización")
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
          <h2 className="text-lg font-semibold mb-4">2. Productos</h2>
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
                {filteredProducts.map((p) => (
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
                      <span className="text-sm font-medium">{formatCurrency(p.price)}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {items.length > 0 ? (
            <div className="border rounded-lg">
              <div className="grid grid-cols-[1fr,70px,100px,110px,40px] gap-2 p-3 bg-muted text-xs font-medium">
                <span>Producto</span>
                <span className="text-center">Cant.</span>
                <span className="text-center">Precio</span>
                <span className="text-right">Subtotal</span>
                <span />
              </div>
              {items.map((item) => (
                <div key={item.productId || item.productCode || item.productName} className="grid grid-cols-[1fr,70px,100px,110px,40px] gap-2 p-3 border-t items-center">
                  <div>
                    <p className="font-medium text-sm">{item.productName}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{item.productCode}</span>
                      {item.productId && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-0.5"
                                onMouseEnter={() => loadProveedoresProducto(item.productId as string)}
                              >
                                <Truck className="h-3 w-3" /> Proveedores
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
                                    {p.proveedor_nombre}{p.precio_proveedor ? ` - ${formatCurrency(Number(p.precio_proveedor))}` : ""}
                                  </p>
                                ))
                              })()}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => {
                      const q = parseInt(e.target.value) || 0
                      if (q <= 0) setItems(items.filter((i) => i.productId !== item.productId))
                      else setItems(items.map((i) => (i.productId === item.productId ? { ...i, quantity: q } : i)))
                    }}
                    className="w-16 h-8 text-center text-sm mx-auto"
                  />
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.price}
                    onChange={(e) => {
                      const price = parseFloat(e.target.value) || 0
                      setItems(items.map((i) => (i.productId === item.productId ? { ...i, price } : i)))
                    }}
                    className="w-24 h-8 text-center text-sm mx-auto"
                  />
                  <p className="font-semibold text-right text-sm">{formatCurrency(item.price * item.quantity)}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setItems(items.filter((i) => i.productId !== item.productId))}
                    className="h-8 w-8 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex justify-between items-center p-3 border-t bg-muted">
                <span className="font-semibold">Total</span>
                <span className="text-xl font-bold">{formatCurrency(subtotal)}</span>
              </div>
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
    </div>
  )
}
