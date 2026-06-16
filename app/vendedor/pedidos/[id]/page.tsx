"use client"

import React, { useEffect, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { StatusTimeline } from "@/components/vendedor/status-timeline"
import { CountdownWidget } from "@/components/vendedor/countdown-widget"
import {
  fetchOrderById, fetchClientById, fetchProducts,
  addItemsToOrder, removeOrderItem, updateOrderItem,
} from "@/lib/supabase/queries"
import { getStatusConfig } from "@/lib/status-config"
import { formatCurrencyExact, formatDate, formatDateTime, normalizeSearch } from "@/lib/utils"
import type { Order, Client, Product, OrderProduct } from "@/lib/types"
import { ArrowLeft, Phone, MessageCircle, MapPin, Pencil, Trash2, Plus, Check, X, Search } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

// Línea en staging para agregar al pedido (mismo shape que el admin).
interface ProdToAdd {
  product: Product | null
  tipoLinea: "producto" | "descuento" | "libre"
  nombre: string
  codigo: string
  qty: number
  price: number
}

export default function VendedorPedidoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params)
  const [order, setOrder] = useState<Order | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)

  // Edición de items (V.1 — paridad con admin, matriz D.7).
  const [products, setProducts] = useState<Product[]>([])
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState(0)
  const [editPrice, setEditPrice] = useState(0)
  const [savingItem, setSavingItem] = useState(false)
  const [quitandoItemId, setQuitandoItemId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [prodSearch, setProdSearch] = useState("")
  const [prodToAdd, setProdToAdd] = useState<ProdToAdd[]>([])
  const [agregando, setAgregando] = useState(false)

  const loadOrder = useCallback(async () => {
    const o = await fetchOrderById(id)
    if (!o) { setOrder(null); setLoading(false); return }
    setOrder(o)
    const c = await fetchClientById(o.clientId)
    setClient(c)
    setLoading(false)
  }, [id])

  useEffect(() => {
    loadOrder()
  }, [loadOrder])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (!order) {
    notFound()
  }

  const o = order!
  const statusConfig = getStatusConfig(o.status)

  // Matriz D.7: items solo editables en BORRADOR / INGRESADO.
  const canEdit = o.status === "BORRADOR" || o.status === "INGRESADO"

  // Carga perezosa del catálogo cuando el vendedor abre el panel de agregar.
  async function ensureProducts() {
    if (products.length === 0) {
      try {
        const p = await fetchProducts()
        setProducts(p)
      } catch {
        // non-blocking: el buscador queda vacío
      }
    }
  }

  function startEdit(item: OrderProduct) {
    if (!item.id) return
    setEditingItemId(item.id)
    setEditQty(item.quantity)
    setEditPrice(item.price)
  }

  async function saveEdit(item: OrderProduct) {
    if (!item.id) return
    if (editQty <= 0) {
      alert("La cantidad debe ser mayor a 0")
      return
    }
    setSavingItem(true)
    try {
      await updateOrderItem(o.id, item.id, { quantity: editQty, price: editPrice })
      setEditingItemId(null)
      await loadOrder()
    } catch (e: any) {
      alert("Error al editar el item: " + (e?.message || ""))
    } finally {
      setSavingItem(false)
    }
  }

  async function quitarItem(item: OrderProduct) {
    if (!item.id) return
    if ((item.cantidadFacturada || 0) > 0 || item.facturado) {
      alert("No se puede eliminar un item que ya fue facturado.")
      return
    }
    if (!confirm(`¿Eliminar "${item.productName}" del pedido? Se devolverá el stock reservado.`)) return
    setQuitandoItemId(item.id)
    try {
      await removeOrderItem(o.id, item.id)
      await loadOrder()
    } catch (e: any) {
      alert("Error al eliminar el item: " + (e?.message || ""))
    } finally {
      setQuitandoItemId(null)
    }
  }

  function addCatalogo(p: Product) {
    if (prodToAdd.find((x) => x.product?.id === p.id)) return
    // El catálogo (products.price) está CON IVA; addItemsToOrder lo guarda tal
    // cual en unit_price, igual que el flujo del admin. El detalle muestra ese
    // precio con IVA, así que no dividimos acá.
    setProdToAdd([...prodToAdd, { product: p, tipoLinea: "producto", nombre: p.name, codigo: p.code || "", qty: 1, price: p.price }])
    setProdSearch("")
  }

  function addLineaLibre() {
    setProdToAdd([...prodToAdd, { product: null, tipoLinea: "libre", nombre: "", codigo: "LIBRE", qty: 1, price: 0 }])
  }

  function addDescuento() {
    setProdToAdd([...prodToAdd, { product: null, tipoLinea: "descuento", nombre: "Descuento", codigo: "DESCUENTO", qty: 1, price: 0 }])
  }

  async function confirmarAgregar() {
    if (prodToAdd.length === 0) return
    // Validación mínima: las líneas libres necesitan descripción.
    const libreSinNombre = prodToAdd.find((x) => x.tipoLinea === "libre" && !x.nombre.trim())
    if (libreSinNombre) {
      alert("Completá la descripción de las líneas libres antes de agregar.")
      return
    }
    setAgregando(true)
    try {
      await addItemsToOrder(o.id, prodToAdd.map((x) => ({
        productId: x.tipoLinea === "producto" && x.product ? x.product.id : null,
        productCode: x.codigo,
        productName: x.nombre,
        quantity: x.qty,
        price: x.price,
        tipoLinea: x.tipoLinea,
      })))
      setProdToAdd([])
      setProdSearch("")
      setAddOpen(false)
      await loadOrder()
    } catch (e: any) {
      alert("Error al agregar productos: " + (e?.message || ""))
    } finally {
      setAgregando(false)
    }
  }

  const filteredProducts = prodSearch.length >= 2
    ? products.filter((p) => {
        const q = normalizeSearch(prodSearch)
        return normalizeSearch(p.name).includes(q) || normalizeSearch(p.code || "").includes(q)
      }).slice(0, 15)
    : []

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
          <div className="flex-1">
            <h1 className="text-xl font-bold">Pedido {o.orderNumber}</h1>
            <p className="text-sm text-primary-foreground/80">{formatDateTime(o.createdAt)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {o.isUrgent && (
              <Badge variant="destructive" className="text-xs">
                URGENTE
              </Badge>
            )}
            {o.isCustom && (
              <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                CUSTOMIZADO
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Status */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Estado del Pedido</h3>
            <StatusTimeline currentStatus={o.status} isCustom={o.isCustom} />
          </Card>

          {/* Countdown for Custom Orders */}
          {o.isCustom && <CountdownWidget estimatedDelivery={o.estimatedDelivery} />}

          {/* Client Info */}
          {client && (
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Cliente</h3>
              <div className="space-y-2">
                <p className="font-medium">{client.businessName}</p>
                <p className="text-sm text-muted-foreground">{client.contactName}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{client.address}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{client.whatsapp}</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Badge variant="outline">{client.zona}</Badge>
                  <Badge variant="outline">{client.paymentTerms}</Badge>
                </div>
              </div>
              {client.whatsapp && (
                <div className="mt-3">
                  <Button asChild size="sm" variant="outline" className="w-full bg-transparent">
                    <a
                      href={`https://wa.me/${client.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Contactar por WhatsApp
                    </a>
                  </Button>
                </div>
              )}
            </Card>
          )}

          {/* Products */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Productos</h3>
              {canEdit && (
                <Badge variant="outline" className="text-xs bg-teal-50 text-teal-700 border-teal-200">
                  Editable
                </Badge>
              )}
            </div>
            <div className="space-y-3">
              {o.products.map((product, index) => {
                const tipo = product.tipoLinea || "producto"
                const esDescuento = tipo === "descuento"
                const facturado = product.facturado || (product.cantidadFacturada || 0) > 0
                const itemEditable = canEdit && !facturado && !product.movido
                const isEditing = editingItemId === product.id

                if (isEditing) {
                  // Edición inline mobile: inputs apilados y táctiles.
                  return (
                    <div key={index} className="rounded-lg border border-teal-200 bg-teal-50/40 p-3 space-y-3">
                      <p className="font-medium text-sm">{product.productName}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs uppercase text-muted-foreground">Cantidad</label>
                          <Input
                            type="number"
                            min={1}
                            inputMode="numeric"
                            value={editQty}
                            disabled={esDescuento}
                            onChange={(e) => setEditQty(parseInt(e.target.value) || 0)}
                            className="h-11 text-center"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs uppercase text-muted-foreground">Precio c/IVA</label>
                          <Input
                            type="number"
                            step={0.01}
                            inputMode="decimal"
                            value={editPrice}
                            onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)}
                            className="h-11 text-right"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 h-10"
                          onClick={() => saveEdit(product)}
                          disabled={savingItem}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          {savingItem ? "Guardando..." : "Guardar"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 h-10"
                          onClick={() => setEditingItemId(null)}
                          disabled={savingItem}
                        >
                          <X className="h-4 w-4 mr-1" />
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={index} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{product.productName}</p>
                        {esDescuento && (
                          <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-200">DESC</Badge>
                        )}
                        {tipo === "libre" && (
                          <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-800 border-blue-200">LIBRE</Badge>
                        )}
                        {facturado && (
                          <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-200">Facturado</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{product.productCode}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm text-muted-foreground">x{product.quantity}</p>
                      <p className="font-semibold text-sm">{formatCurrencyExact(product.price * product.quantity)}</p>
                    </div>
                    {itemEditable && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10"
                          onClick={() => startEdit(product)}
                          aria-label="Editar item"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 text-destructive hover:text-destructive"
                          onClick={() => quitarItem(product)}
                          disabled={quitandoItemId === product.id}
                          aria-label="Eliminar item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <Separator className="my-3" />
            <div className="flex items-center justify-between">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-xl">{formatCurrencyExact(o.total)}</span>
            </div>

            {/* Agregar productos (solo BORRADOR/INGRESADO) */}
            {canEdit && (
              <div className="mt-4 pt-4 border-t">
                {!addOpen ? (
                  <Button
                    variant="outline"
                    className="w-full h-11"
                    onClick={async () => { setAddOpen(true); await ensureProducts() }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar producto
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar producto..."
                        value={prodSearch}
                        onChange={(e) => setProdSearch(e.target.value)}
                        className="pl-10 h-11"
                      />
                      {filteredProducts.length > 0 && (
                        <div className="absolute z-20 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                          {filteredProducts.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => addCatalogo(p)}
                              className="w-full p-3 text-left hover:bg-muted text-sm border-b last:border-b-0 flex items-center justify-between gap-2"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                                <span className="ml-2">{p.name}</span>
                              </span>
                              <span className="flex items-center gap-2 shrink-0">
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${p.stock <= 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                                  Stock: {p.stock}
                                </span>
                                <span className="text-xs text-muted-foreground">{formatCurrencyExact(p.price)}</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 h-10" onClick={addLineaLibre}>+ Línea Libre</Button>
                      <Button variant="outline" size="sm" className="flex-1 h-10" onClick={addDescuento}>+ Descuento</Button>
                    </div>

                    {/* Staging de líneas a agregar */}
                    {prodToAdd.length > 0 && (
                      <div className="border rounded-lg divide-y">
                        {prodToAdd.map((it, i) => {
                          const esDesc = it.tipoLinea === "descuento"
                          const esCatalogo = it.tipoLinea === "producto"
                          const rowBg = esDesc ? "bg-amber-50" : it.tipoLinea === "libre" ? "bg-blue-50/60" : ""
                          return (
                            <div key={it.product?.id ?? `linea-${i}`} className={`p-3 space-y-2 ${rowBg}`}>
                              <div className="flex items-center justify-between gap-2">
                                {esCatalogo ? (
                                  <p className="text-sm font-medium flex-1 min-w-0 truncate">{it.nombre}</p>
                                ) : (
                                  <Input
                                    value={it.nombre}
                                    onChange={(e) => setProdToAdd(prodToAdd.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                                    placeholder={esDesc ? "Ej: Descuento pago contado" : "Descripción del producto"}
                                    className="h-9 text-sm flex-1"
                                  />
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-destructive shrink-0"
                                  onClick={() => setProdToAdd(prodToAdd.filter((_, j) => j !== i))}
                                  aria-label="Quitar línea"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <label className="text-[10px] uppercase text-muted-foreground">Cantidad</label>
                                  <Input
                                    type="number"
                                    min={1}
                                    inputMode="numeric"
                                    value={it.qty}
                                    disabled={esDesc}
                                    onChange={(e) => {
                                      const q = parseInt(e.target.value) || 1
                                      setProdToAdd(prodToAdd.map((x, j) => j === i ? { ...x, qty: q } : x))
                                    }}
                                    className="h-10 text-center"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] uppercase text-muted-foreground">Precio c/IVA</label>
                                  <Input
                                    type="number"
                                    step={0.01}
                                    inputMode="decimal"
                                    value={it.price}
                                    onChange={(e) => {
                                      const parsed = parseFloat(e.target.value) || 0
                                      // En descuentos el monto siempre resta: se coacciona a negativo.
                                      const pr = esDesc ? -Math.abs(parsed) : parsed
                                      setProdToAdd(prodToAdd.map((x, j) => j === i ? { ...x, price: pr } : x))
                                    }}
                                    className="h-10 text-right"
                                  />
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1 h-11"
                        onClick={() => { setAddOpen(false); setProdToAdd([]); setProdSearch("") }}
                        disabled={agregando}
                      >
                        Cancelar
                      </Button>
                      <Button
                        className="flex-1 h-11"
                        onClick={confirmarAgregar}
                        disabled={agregando || prodToAdd.length === 0}
                      >
                        {agregando ? "Agregando..." : "Agregar al pedido"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Delivery Info */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Entrega</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Fecha estimada</p>
                <p className="font-medium">{formatDate(o.estimatedDelivery)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Zona</p>
                <p className="font-medium">{o.zona}</p>
              </div>
            </div>
          </Card>

          {/* Status History */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Historial</h3>
            <div className="space-y-3">
              {o.statusHistory.map((change, index) => (
                <div key={index} className="flex items-start gap-3 pb-3 border-b last:border-0">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge
                        className={`${getStatusConfig(change.status).bgColor} ${getStatusConfig(change.status).color} text-xs`}
                      >
                        {getStatusConfig(change.status).label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDateTime(change.timestamp)}</span>
                    </div>
                    <p className="text-sm">
                      <span className="font-medium">{change.userName}</span>
                      {change.notes && <span className="text-muted-foreground ml-1">- {change.notes}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Notes */}
          {o.notes && (
            <Card className="p-4">
              <h3 className="font-semibold mb-2">Notas</h3>
              <p className="text-sm text-muted-foreground">{o.notes}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
