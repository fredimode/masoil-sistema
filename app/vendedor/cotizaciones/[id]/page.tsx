"use client"

import React, { useEffect, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useCurrentVendedor } from "@/lib/hooks/useCurrentVendedor"
import {
  fetchCotizacionVentaById, fetchCotizacionVentaItems, fetchClientById,
  updateCotizacionVenta, updateCotizacionVentaItem, deleteCotizacionVentaItem,
  createCotizacionVentaItem, fetchProducts, createOrder,
} from "@/lib/supabase/queries"
import { generateCotizacionPDF } from "@/lib/pdf/cotizacion-pdf"
import type { Client, Product } from "@/lib/types"
import { formatCurrencyExact, formatDateStr, normalizeSearch } from "@/lib/utils"
import { ArrowLeft, Pencil, Trash2, Plus, Check, X, Search, ShoppingCart, Download, MapPin, Phone } from "lucide-react"
import Link from "next/link"
import { notFound, useRouter } from "next/navigation"

const ESTADO_BADGES: Record<string, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  parcialmente_aprobada: { label: "Aprobada parcial", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  no_aprobada: { label: "No aprobada", cls: "bg-red-100 text-red-800 border-red-200" },
  convertida_pedido: { label: "Convertida a pedido", cls: "bg-indigo-100 text-indigo-800 border-indigo-200" },
}

export default function VendedorCotizacionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params)
  const router = useRouter()
  const { vendedor, loading: loadingVendedor } = useCurrentVendedor()

  const [cot, setCot] = useState<any | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFoundFlag, setNotFoundFlag] = useState(false)

  // Edición de items
  const [editMode, setEditMode] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState(1)
  const [editPrice, setEditPrice] = useState(0)
  const [savingItem, setSavingItem] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [addSearch, setAddSearch] = useState("")
  const [converting, setConverting] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)

  const loadAll = useCallback(async () => {
    const c = await fetchCotizacionVentaById(id)
    if (!c) { setNotFoundFlag(true); setLoading(false); return }
    setCot(c)
    const its = await fetchCotizacionVentaItems(id)
    setItems(its)
    if (c.client_id) {
      const cl = await fetchClientById(c.client_id)
      setClient(cl)
    }
    setLoading(false)
  }, [id])

  useEffect(() => { loadAll() }, [loadAll])

  if (loading || loadingVendedor) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (notFoundFlag || !cot) {
    notFound()
  }

  const estado = cot.estado as string
  const convertida = estado === "convertida_pedido"
  const isOwner = !!vendedor && cot.vendedor_id === vendedor.id
  const canEdit = isOwner && !convertida
  const est = ESTADO_BADGES[estado] || { label: estado, cls: "bg-gray-100 text-gray-700 border-gray-200" }

  // Totales recalculados desde los items (precio_unitario es SIN IVA / neto).
  const neto = items.reduce((s, i) => s + (Number(i.precio_unitario) || 0) * (Number(i.cantidad) || 0), 0)
  const iva = Math.round(neto * 0.21 * 100) / 100
  const totalConIva = Math.round((neto + iva) * 100) / 100

  async function ensureProducts() {
    if (products.length === 0) {
      try { setProducts(await fetchProducts()) } catch { /* non-blocking */ }
    }
  }

  async function recalcTotal() {
    const its = await fetchCotizacionVentaItems(id)
    const nuevoNeto = its.reduce((s, i) => s + (Number(i.precio_unitario) || 0) * (Number(i.cantidad) || 0), 0)
    await updateCotizacionVenta(id, { total: Math.round(nuevoNeto * 100) / 100 })
    setItems(its)
    setCot((prev: any) => prev ? { ...prev, total: Math.round(nuevoNeto * 100) / 100 } : prev)
  }

  function startEdit(item: any) {
    setEditingItemId(item.id)
    setEditQty(Number(item.cantidad) || 1)
    setEditPrice(Number(item.precio_unitario) || 0)
  }

  async function saveEdit(item: any) {
    if (editQty <= 0) { alert("La cantidad debe ser mayor a 0"); return }
    setSavingItem(true)
    try {
      const esDesc = item.tipo_linea === "descuento"
      const precio = esDesc ? -Math.abs(editPrice) : editPrice
      await updateCotizacionVentaItem(item.id, {
        cantidad: editQty,
        precio_unitario: precio,
        subtotal: Math.round(precio * editQty * 100) / 100,
      })
      setEditingItemId(null)
      await recalcTotal()
    } catch (e: any) {
      alert("Error al editar el item: " + (e?.message || ""))
    } finally {
      setSavingItem(false)
    }
  }

  async function quitarItem(item: any) {
    if (!confirm(`¿Eliminar "${item.producto_nombre}" de la cotización?`)) return
    try {
      await deleteCotizacionVentaItem(item.id)
      await recalcTotal()
    } catch (e: any) {
      alert("Error al eliminar el item: " + (e?.message || ""))
    }
  }

  async function addCatalogo(p: Product) {
    try {
      // Catálogo CON IVA → la cotización guarda precio_unitario SIN IVA.
      const precioSinIva = Math.round((p.price / 1.21) * 100) / 100
      await createCotizacionVentaItem({
        cotizacion_id: id,
        product_id: p.id,
        producto_nombre: p.name,
        producto_codigo: p.code || "",
        cantidad: 1,
        precio_unitario: precioSinIva,
        subtotal: precioSinIva,
      })
      setAddSearch("")
      await recalcTotal()
    } catch (e: any) {
      alert("Error al agregar producto: " + (e?.message || ""))
    }
  }

  async function handleConvertir() {
    if (!cot || !client) return
    if (items.length === 0) { alert("La cotización no tiene items"); return }
    if (!confirm("¿Convertir esta cotización en pedido?")) return
    setConverting(true)
    try {
      const orderId = await createOrder({
        clientId: cot.client_id,
        clientName: cot.client_name || client.businessName,
        vendedorId: cot.vendedor_id || null,
        vendedorName: cot.vendedor_nombre || vendedor?.name || "",
        zona: cot.zona || client.zona || "Capital",
        notes: [cot.observaciones, `Origen: Cotización ${cot.numero}`].filter(Boolean).join(" - "),
        isCustom: false,
        isUrgent: false,
        total: items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0),
        items: items.map((i) => ({
          productId: i.product_id || null,
          productCode: i.producto_codigo || "",
          productName: i.producto_nombre,
          quantity: Number(i.cantidad) || 1,
          price: Number(i.precio_unitario) || 0,
          tipoLinea: (i.tipo_linea as "producto" | "libre" | "descuento") || "producto",
        })),
        razonSocial: cot.razon_social || undefined,
      })
      await updateCotizacionVenta(id, { estado: "convertida_pedido", order_id: orderId })
      router.push(`/vendedor/pedidos/${orderId}`)
    } catch (e: any) {
      alert("Error al convertir en pedido: " + (e?.message || ""))
      setConverting(false)
    }
  }

  function handleExportPDF() {
    if (!cot) return
    setPdfBusy(true)
    try {
      const blob = generateCotizacionPDF({
        numero: cot.numero,
        fecha: cot.fecha || cot.created_at,
        validez_fecha: cot.validez_fecha,
        forma_pago: cot.forma_pago,
        plazo_entrega: cot.plazo_entrega,
        observaciones: cot.observaciones,
        total: Number(cot.total) || 0,
        razon_social: cot.razon_social,
        cliente: {
          razon_social: cot.client_name || client?.businessName || "",
          cuit: (client as any)?.cuit || (client as any)?.numeroDocum || "",
          domicilio: client?.address || (client as any)?.domicilioEntrega || "",
          sucursal_entrega: (client as any)?.sucursalEntrega || null,
          contacto: client?.contactName || "",
        },
        items: items.map((i) => ({
          cantidad: Number(i.cantidad) || 0,
          producto_nombre: i.producto_nombre || "",
          producto_codigo: i.producto_codigo || "",
          precio_unitario: Number(i.precio_unitario) || 0,
          subtotal: Number(i.subtotal) || 0,
        })),
      })
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank")
    } catch (e) {
      alert("Error al generar el PDF")
    } finally {
      setPdfBusy(false)
    }
  }

  const filteredProducts = addSearch.length >= 2
    ? products.filter((p) => {
        const q = normalizeSearch(addSearch)
        return normalizeSearch(p.name).includes(q) || normalizeSearch(p.code || "").includes(q)
      }).slice(0, 15)
    : []

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
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">Cotización {cot.numero}</h1>
            <p className="text-sm text-primary-foreground/80">{formatDateStr(cot.fecha || cot.created_at)}</p>
          </div>
          <Badge variant="outline" className={`${est.cls} text-xs shrink-0`}>{est.label}</Badge>
        </div>
      </div>

      <div className="p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {convertida && cot.order_id && (
            <Card className="p-3 bg-indigo-50 border-indigo-200">
              <p className="text-sm text-indigo-800">
                Esta cotización fue convertida en pedido.{" "}
                <Link href={`/vendedor/pedidos/${cot.order_id}`} className="font-semibold underline">
                  Ver pedido
                </Link>
              </p>
            </Card>
          )}

          {/* Cliente */}
          {client && (
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Cliente</h3>
              <div className="space-y-2">
                <p className="font-medium">{client.businessName}</p>
                <p className="text-sm text-muted-foreground">{client.contactName}</p>
                {client.address && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /><span>{client.address}</span>
                  </div>
                )}
                {client.whatsapp && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" /><span>{client.whatsapp}</span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Items */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Productos</h3>
              {canEdit && (
                <Button
                  variant={editMode ? "secondary" : "outline"}
                  size="sm"
                  className="h-9"
                  onClick={async () => { const next = !editMode; setEditMode(next); if (next) await ensureProducts() }}
                >
                  {editMode ? "Listo" : (<><Pencil className="h-4 w-4 mr-1" /> Editar</>)}
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {items.map((item) => {
                const esDesc = item.tipo_linea === "descuento"
                const esLibre = item.tipo_linea === "libre"
                const lineSub = (Number(item.precio_unitario) || 0) * (Number(item.cantidad) || 0)
                const isEditing = editingItemId === item.id

                if (isEditing) {
                  return (
                    <div key={item.id} className="rounded-lg border border-teal-200 bg-teal-50/40 p-3 space-y-3">
                      <p className="font-medium text-sm">{item.producto_nombre}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs uppercase text-muted-foreground">Cantidad</label>
                          <Input type="number" min={1} inputMode="numeric" value={editQty} disabled={esDesc}
                            onChange={(e) => setEditQty(parseInt(e.target.value) || 0)} className="h-11 text-center" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs uppercase text-muted-foreground">Precio s/IVA</label>
                          <Input type="number" step={0.01} inputMode="decimal" value={editPrice}
                            onChange={(e) => setEditPrice(parseFloat(e.target.value) || 0)} className="h-11 text-right" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" className="flex-1 h-10" onClick={() => saveEdit(item)} disabled={savingItem}>
                          <Check className="h-4 w-4 mr-1" />{savingItem ? "Guardando..." : "Guardar"}
                        </Button>
                        <Button size="sm" variant="outline" className="flex-1 h-10" onClick={() => setEditingItemId(null)} disabled={savingItem}>
                          <X className="h-4 w-4 mr-1" />Cancelar
                        </Button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={item.id} className="flex items-center justify-between gap-2 py-2 border-b last:border-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{item.producto_nombre}</p>
                        {esDesc && <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-200">DESC</Badge>}
                        {esLibre && <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-800 border-blue-200">LIBRE</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono">{item.producto_codigo}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm text-muted-foreground">x{item.cantidad}</p>
                      <p className="font-semibold text-sm">{formatCurrencyExact(lineSub)}</p>
                    </div>
                    {editMode && canEdit && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => startEdit(item)} aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive hover:text-destructive" onClick={() => quitarItem(item)} aria-label="Eliminar">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
              {items.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-4">Sin items</p>
              )}
            </div>

            {/* Agregar producto (catálogo) en modo edición */}
            {editMode && canEdit && (
              <div className="mt-4 pt-4 border-t">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Agregar producto del catálogo..." value={addSearch}
                    onChange={(e) => setAddSearch(e.target.value)} className="pl-10 h-11" />
                  {filteredProducts.length > 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                      {filteredProducts.map((p) => (
                        <button key={p.id} onClick={() => addCatalogo(p)}
                          className="w-full p-3 text-left hover:bg-muted text-sm border-b last:border-b-0 flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1">
                            <span className="font-mono text-xs text-muted-foreground">{p.code}</span>
                            <span className="ml-2">{p.name}</span>
                          </span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${p.stock <= 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                            Stock: {p.stock}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Totales */}
            <Separator className="my-3" />
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal (sin IVA)</span>
                <span>{formatCurrencyExact(neto)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">IVA 21%</span>
                <span>{formatCurrencyExact(iva)}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="font-semibold">Total</span>
                <span className="font-bold text-xl">{formatCurrencyExact(totalConIva)}</span>
              </div>
            </div>
          </Card>

          {/* Términos */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Términos</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Validez</p>
                <p className="font-medium">{cot.validez_fecha ? formatDateStr(cot.validez_fecha) : "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Forma de pago</p>
                <p className="font-medium">{cot.forma_pago || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Plazo de entrega</p>
                <p className="font-medium">{cot.plazo_entrega || "-"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Razón social</p>
                <p className="font-medium">{cot.razon_social || "-"}</p>
              </div>
            </div>
            {cot.observaciones && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-muted-foreground text-sm">Observaciones</p>
                <p className="text-sm">{cot.observaciones}</p>
              </div>
            )}
          </Card>

          {/* Acciones */}
          <div className="space-y-2 pb-20 md:pb-6">
            <Button variant="outline" className="w-full h-11" onClick={handleExportPDF} disabled={pdfBusy}>
              <Download className="h-4 w-4 mr-2" />
              {pdfBusy ? "Generando..." : "Exportar PDF"}
            </Button>
            {canEdit && (
              <Button className="w-full h-11" onClick={handleConvertir} disabled={converting || items.length === 0}>
                <ShoppingCart className="h-4 w-4 mr-2" />
                {converting ? "Convirtiendo..." : "Convertir en Pedido"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
