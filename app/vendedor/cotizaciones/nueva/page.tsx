"use client"

import { Suspense, useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCurrentVendedor } from "@/lib/hooks/useCurrentVendedor"
import {
  fetchClientsByVendedor, fetchProducts,
  createCotizacionVenta, getNextCotizacionVentaNumero,
} from "@/lib/supabase/queries"
import type { Client, Product } from "@/lib/types"
import { formatCurrencyExact, normalizeSearch } from "@/lib/utils"
import { calcularTotales, construirLineaDescuentoGeneral } from "@/lib/descuentos"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Plus, Trash2, Search, History } from "lucide-react"
import Link from "next/link"
import { HistorialVentasDialog } from "@/components/historial-ventas-dialog"

interface CotItem {
  productId: string
  productCode: string
  productName: string
  quantity: number
  price: number
  tipoLinea?: "producto" | "libre" | "descuento"
}

const PLAZOS = ["7 días hábiles", "10 días hábiles", "15 días hábiles", "20 días hábiles", "30 días hábiles"]
const FORMAS_PAGO = ["Contado", "Transferencia", "Cheque", "7 días", "15 días", "21 días", "30 días", "45 días", "60 días", "Cuenta Corriente", "Ver observación"]

// Default validez = hoy + 3 días en formato YYYY-MM-DD local (sin toISOString
// para no desfasar -1 día en zonas UTC-).
function defaultValidez(): string {
  const d = new Date()
  d.setDate(d.getDate() + 3)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

// Iniciales para el correlativo COT-XXX-NNNN. Usa las del vendedor si las tiene;
// si no, las deriva del nombre (fallback para vendedores de campo sin iniciales
// comerciales configuradas — ver nota en el reporte del sprint).
function resolverIniciales(iniciales?: string | null, name?: string): string {
  if (iniciales && iniciales.trim()) return iniciales.trim().toUpperCase()
  const derived = (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
  return derived || "VEN"
}

function NuevaCotizacionContent() {
  const router = useRouter()
  const { vendedor, loading } = useCurrentVendedor()

  const [clients, setClients] = useState<Client[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const vendedorId = vendedor?.id ?? ""

  useEffect(() => {
    if (!vendedorId) return
    setLoadingData(true)
    Promise.all([fetchClientsByVendedor(vendedorId), fetchProducts()])
      .then(([c, p]) => { setClients(c); setProducts(p) })
      .catch(() => { setClients([]); setProducts([]) })
      .finally(() => setLoadingData(false))
  }, [vendedorId])

  const [selectedClientId, setSelectedClientId] = useState("")
  const [histDialog, setHistDialog] = useState<{ open: boolean; productId?: string; productName?: string }>({ open: false })
  const [clientSearch, setClientSearch] = useState("")
  const [items, setItems] = useState<CotItem[]>([])
  // Descuento general (%) del documento: se precarga del cliente y es editable.
  const [descuentoGeneralPct, setDescuentoGeneralPct] = useState(0)
  const [selectedProductId, setSelectedProductId] = useState("")
  const [quantity, setQuantity] = useState(1)
  const [productSearch, setProductSearch] = useState("")
  const [razonSocial, setRazonSocial] = useState("")
  const [validezFecha, setValidezFecha] = useState<string>(defaultValidez)
  const [formaPago, setFormaPago] = useState("")
  const [plazoEntrega, setPlazoEntrega] = useState("")
  const [observaciones, setObservaciones] = useState("")

  const filteredClients = useMemo(() => {
    if (!clientSearch) return clients
    const q = normalizeSearch(clientSearch)
    return clients.filter((c) =>
      normalizeSearch(c.businessName).includes(q) || normalizeSearch(c.contactName).includes(q),
    )
  }, [clients, clientSearch])

  const filteredProducts = useMemo(() => {
    if (!productSearch) return products
    const q = normalizeSearch(productSearch)
    return products.filter((p) =>
      normalizeSearch(p.name).includes(q) || normalizeSearch(p.code || "").includes(q),
    )
  }, [products, productSearch])

  const selectedClient = clients.find((c) => c.id === selectedClientId)

  // Precarga del descuento general del cliente al seleccionarlo (editable después).
  useEffect(() => {
    const c = clients.find((cl) => cl.id === selectedClientId)
    setDescuentoGeneralPct(c?.descuentoGeneralPct || 0)
  }, [selectedClientId, clients])

  const addProduct = () => {
    const product = products.find((p) => p.id === selectedProductId)
    if (!product || quantity <= 0) return
    const existingIndex = items.findIndex((item) => item.productId === selectedProductId)
    if (existingIndex >= 0) {
      const newItems = [...items]
      newItems[existingIndex].quantity += quantity
      setItems(newItems)
    } else {
      // products.price viene CON IVA. La cotización trata precio_unitario como
      // SIN IVA (neto): el detalle/PDF suman 21% encima. Por eso dividimos /1.21
      // al agregar, igual que admin/cotizaciones-venta/nueva.
      const priceSinIva = Math.round((product.price / 1.21) * 100) / 100
      setItems([...items, {
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        quantity,
        price: priceSinIva,
        tipoLinea: "producto",
      }])
    }
    setSelectedProductId("")
    setQuantity(1)
    setProductSearch("")
  }

  const removeItem = (productId: string) => setItems(items.filter((i) => i.productId !== productId))

  const updateQuantity = (productId: string, newQuantity: number) => {
    if (newQuantity <= 0) { removeItem(productId); return }
    setItems(items.map((i) => (i.productId === productId ? { ...i, quantity: newQuantity } : i)))
  }

  const addLineaLibre = () => {
    setItems([...items, {
      productId: `libre-${Date.now()}`,
      productCode: "",
      productName: "",
      quantity: 1,
      price: 0,
      tipoLinea: "libre",
    }])
  }

  const addDescuento = () => {
    setItems([...items, {
      productId: `desc-${Date.now()}`,
      productCode: "DESCUENTO",
      productName: "Descuento",
      quantity: 1,
      price: 0,
      tipoLinea: "descuento",
    }])
  }

  // Precios de línea SIN IVA. subtotalSinIva = Σ items. El descuento general
  // (renglón derivado) y el IVA/total salen del helper común (lib/descuentos).
  const subtotalSinIva = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const lineaDescGeneral = construirLineaDescuentoGeneral(items, descuentoGeneralPct)
  const totalesDoc = calcularTotales(items, descuentoGeneralPct)
  const ivaCalculado = totalesDoc.iva
  const totalConIva = totalesDoc.total

  const handleSubmit = async () => {
    if (!selectedClientId || items.length === 0 || !vendedor) {
      alert("Seleccioná un cliente y agregá al menos un producto")
      return
    }
    const libreSinNombre = items.find((i) => i.tipoLinea === "libre" && !i.productName.trim())
    if (libreSinNombre) {
      alert("Completá la descripción de las líneas libres")
      return
    }

    setSubmitting(true)
    try {
      const iniciales = resolverIniciales(vendedor.iniciales, vendedor.name)
      const numero = await getNextCotizacionVentaNumero(iniciales)
      // Renglón de descuento general como item real (tipo_linea="descuento"),
      // para que el detalle/PDF/export y la facturación lo hereden.
      const itemsToSave: CotItem[] = [...items]
      if (lineaDescGeneral) {
        itemsToSave.push({
          productId: `descgral-${Date.now()}`,
          productCode: lineaDescGeneral.productCode,
          productName: lineaDescGeneral.descripcion,
          quantity: 1,
          price: lineaDescGeneral.price,
          tipoLinea: "descuento",
        })
      }
      const id = await createCotizacionVenta({
        numero,
        client_id: selectedClientId,
        client_name: selectedClient?.businessName ?? "",
        vendedor_id: vendedor.id,
        vendedor_nombre: vendedor.name,
        vendedor_iniciales: iniciales,
        razon_social: razonSocial || null,
        zona: selectedClient?.zona || null,
        validez_fecha: validezFecha || null,
        forma_pago: formaPago || null,
        plazo_entrega: plazoEntrega || null,
        observaciones: observaciones || null,
        // Se persiste el neto (sin IVA) ya con el descuento general, consistente
        // con Σ subtotales de items (que incluyen ese renglón).
        total: totalesDoc.subtotalSinIva,
        descuento_general_pct: descuentoGeneralPct,
        items: itemsToSave.map((i) => ({
          product_id: i.tipoLinea === "producto" || !i.tipoLinea ? i.productId : null,
          producto_nombre: i.productName,
          producto_codigo: i.productCode,
          cantidad: i.quantity,
          precio_unitario: i.price,
          subtotal: Math.round(i.price * i.quantity * 100) / 100,
          tipo_linea: i.tipoLinea || "producto",
        })),
      })
      router.push(`/vendedor/cotizaciones/${id}`)
    } catch (err: any) {
      alert("Error al crear la cotización: " + (err?.message || "intentá de nuevo"))
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
            <Link href="/vendedor/cotizaciones">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-xl font-bold">Nueva Cotización</h1>
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
                      <p className="text-sm text-muted-foreground">{client.contactName} • {client.zona}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div>
                  <p className="font-medium">{selectedClient.businessName}</p>
                  <p className="text-sm text-muted-foreground">{selectedClient.contactName} • {selectedClient.zona}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setSelectedClientId("")}>Cambiar</Button>
              </div>
            )}
          </Card>

          {/* Productos */}
          <Card className="p-4 md:p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-lg font-semibold">2. Agregar Productos</h2>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedClientId}
                  title={selectedClientId ? "Ver historial de ventas del cliente" : "Seleccioná un cliente primero"}
                  onClick={() => setHistDialog({ open: true })}
                >
                  <History className="h-4 w-4 mr-1" /> Historial
                </Button>
                <Button variant="outline" size="sm" onClick={addLineaLibre}>+ Línea libre</Button>
                <Button variant="outline" size="sm" onClick={addDescuento}>+ Descuento</Button>
                <div className="flex items-center gap-1.5 border rounded-md px-2 h-9">
                  <Label className="text-xs whitespace-nowrap text-muted-foreground">Desc. general</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={descuentoGeneralPct}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0
                      setDescuentoGeneralPct(Math.min(100, Math.max(0, v)))
                    }}
                    className="h-7 w-16 text-sm text-right"
                    title="Descuento general del cliente (editable). Se aplica sobre el neto de productos."
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </div>

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
                    {filteredProducts.slice(0, 10).map((product) => {
                      const critico = product.criticalStockThreshold ?? 0
                      const bajo = product.lowStockThreshold ?? 0
                      let stockCls = "bg-gray-100 text-gray-600"
                      if (product.stock <= 0) stockCls = "bg-red-100 text-red-700"
                      else if (product.stock <= critico) stockCls = "bg-red-100 text-red-700"
                      else if (product.stock <= bajo) stockCls = "bg-amber-100 text-amber-700"
                      else stockCls = "bg-green-100 text-green-700"
                      return (
                        <button
                          key={product.id}
                          onClick={() => { setSelectedProductId(product.id); setProductSearch(product.name) }}
                          className="w-full p-2 text-left hover:bg-muted text-sm border-b last:border-b-0 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-mono text-xs text-muted-foreground">{product.code}</span>
                            <span className="ml-2">{product.name}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${stockCls}`}>
                              Stock: {product.stock}
                            </span>
                            <span className="text-xs text-muted-foreground">{formatCurrencyExact(product.price)}</span>
                          </div>
                        </button>
                      )
                    })}
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

            {/* Lista de items */}
            {items.length > 0 ? (
              <div className="border rounded-lg">
                <div className="hidden md:grid grid-cols-[1fr,100px,120px,80px] gap-4 p-3 bg-muted text-sm font-medium">
                  <span>Producto</span>
                  <span className="text-center">Cant.</span>
                  <span className="text-right">Subtotal</span>
                  <span></span>
                </div>
                {items.map((item) => {
                  const tipo = item.tipoLinea || "producto"
                  const esCatalogo = tipo === "producto"
                  const esDescuento = tipo === "descuento"
                  const rowBg = esDescuento ? "bg-amber-50" : tipo === "libre" ? "bg-blue-50/60" : ""
                  return (
                    <div
                      key={item.productId}
                      className={`grid grid-cols-1 md:grid-cols-[1fr,100px,120px,80px] gap-2 md:gap-4 p-3 border-t items-center ${rowBg}`}
                    >
                      <div>
                        {esCatalogo ? (
                          <>
                            <Input
                              value={item.productName}
                              onChange={(e) => setItems(items.map((i) => (i.productId === item.productId ? { ...i, productName: e.target.value } : i)))}
                              className="h-8 text-sm font-medium"
                              title="Editable: podés ajustar la descripción"
                            />
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs text-muted-foreground">
                                {item.productCode} • {formatCurrencyExact(item.price)} c/u s/IVA
                              </p>
                              <button
                                type="button"
                                disabled={!selectedClientId}
                                title={selectedClientId ? "Historial de este producto al cliente" : "Seleccioná un cliente primero"}
                                className="text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-300 disabled:cursor-not-allowed flex items-center gap-0.5"
                                onClick={() => setHistDialog({ open: true, productId: item.productId, productName: item.productName })}
                              >
                                <History className="h-3 w-3" /> Hist.
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 mb-1">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${esDescuento ? "bg-amber-200 text-amber-900" : "bg-blue-200 text-blue-900"}`}>
                                {esDescuento ? "DESCUENTO" : "LIBRE"}
                              </span>
                            </div>
                            <Input
                              value={item.productName}
                              onChange={(e) => setItems(items.map((i) => (i.productId === item.productId ? { ...i, productName: e.target.value } : i)))}
                              placeholder={esDescuento ? "Ej: Descuento pago contado" : "Descripción del producto"}
                              className="h-8 text-sm"
                            />
                            <Input
                              type="number"
                              step="0.01"
                              min={esDescuento ? undefined : 0}
                              value={item.price}
                              onChange={(e) => {
                                const parsed = parseFloat(e.target.value) || 0
                                const price = esDescuento ? -Math.abs(parsed) : parsed
                                setItems(items.map((i) => (i.productId === item.productId ? { ...i, price } : i)))
                              }}
                              placeholder="Precio unitario s/IVA"
                              className="h-8 text-sm"
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 md:justify-center">
                        <span className="md:hidden text-sm text-muted-foreground">Cantidad:</span>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          disabled={esDescuento}
                          onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 0)}
                          className="w-20"
                        />
                      </div>
                      <div className="flex items-center justify-between md:justify-end">
                        <span className="md:hidden text-sm text-muted-foreground">Subtotal:</span>
                        <p className="font-semibold">{formatCurrencyExact(item.price * item.quantity)}</p>
                      </div>
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(item.productId)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
                {/* Discriminación de impuestos */}
                <div className="p-3 border-t bg-muted/50 space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal (sin IVA)</span>
                    <span>{formatCurrencyExact(subtotalSinIva)}</span>
                  </div>
                  {lineaDescGeneral && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Descuento general ({descuentoGeneralPct}%)</span>
                        <span className="text-red-600">{formatCurrencyExact(lineaDescGeneral.price)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal con descuento</span>
                        <span>{formatCurrencyExact(totalesDoc.subtotalSinIva)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IVA 21%</span>
                    <span>{formatCurrencyExact(ivaCalculado)}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center p-3 border-t bg-muted">
                  <span className="font-semibold">Total</span>
                  <span className="text-xl font-bold">{formatCurrencyExact(totalConIva)}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">
                <p>No hay productos agregados</p>
              </div>
            )}
          </Card>

          {/* Términos y condiciones */}
          <Card className="p-4 md:p-6">
            <h2 className="text-lg font-semibold mb-4">3. Términos y Condiciones</h2>
            <div className="space-y-4">
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
                <Label htmlFor="obs">Observaciones</Label>
                <Textarea
                  id="obs"
                  placeholder="Notas adicionales para la cotización..."
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </Card>

          {/* Acciones */}
          <div className="flex gap-3 pb-20 md:pb-6">
            <Button asChild variant="outline" className="flex-1">
              <Link href="/vendedor/cotizaciones">Cancelar</Link>
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1"
              disabled={!selectedClientId || items.length === 0 || submitting}
            >
              {submitting ? "Creando..." : "Crear Cotización"}
            </Button>
          </div>
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

export default function NuevaCotizacionPage() {
  return (
    <Suspense>
      <NuevaCotizacionContent />
    </Suspense>
  )
}
