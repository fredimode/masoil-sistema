"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { fetchProveedores, fetchCompras, fetchProducts } from "@/lib/supabase/queries"
import { createClient } from "@/lib/supabase/client"
import { normalizeSearch, formatCurrency } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Paperclip, X, Search, Upload, Check } from "lucide-react"
import type { Product } from "@/lib/types"

const ESTADOS_OC = ["Pendiente", "Realizado", "Recibido Completo", "Recibido Incompleto", "Factura Cargada", "Cancelado"]

interface CompraItem {
  productId: string
  code: string
  name: string
  costoNeto: number
  quantity: number
}

export default function NuevaCompraPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [proveedores, setProveedores] = useState<any[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [provSearch, setProvSearch] = useState("")
  const [showProvDropdown, setShowProvDropdown] = useState(false)
  const [prodSearch, setProdSearch] = useState("")
  const [showProdDropdown, setShowProdDropdown] = useState(false)
  const [compraItems, setCompraItems] = useState<CompraItem[]>([])
  const [articuloMode, setArticuloMode] = useState<"productos" | "texto">("productos")
  const [presupuestoFile, setPresupuestoFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    fecha: new Date().toISOString().slice(0, 10),
    proveedor_id: "",
    proveedor_nombre: "",
    articulo: "",
    medio_solicitud: "",
    solicitado_por: "",
    vendedor: "",
    nro_cotizacion: "",
    nro_nota_pedido: "",
    estado: "Pendiente",
    fecha_estimada_ingreso: "",
    observaciones_incompleto: "",
    email_comercial: "",
  })

  useEffect(() => {
    async function loadData() {
      try {
        const [provs, compras, prods] = await Promise.all([fetchProveedores(), fetchCompras(), fetchProducts()])
        setProveedores(provs)
        setProducts(prods)

        const npNumbers = compras
          .map((c: any) => c.nro_nota_pedido)
          .filter((np: string) => np && /^NP-\d+$/.test(np))
          .map((np: string) => parseInt(np.replace("NP-", ""), 10))
        const maxNP = npNumbers.length > 0 ? Math.max(...npNumbers) : 0
        const next = `NP-${String(maxNP + 1).padStart(4, "0")}`
        setForm((prev) => ({ ...prev, nro_nota_pedido: next }))
      } catch (err) {
        console.error("Error cargando datos:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const filteredProveedores = useMemo(() => {
    if (!provSearch.trim()) return []
    const q = normalizeSearch(provSearch)
    return proveedores.filter((p) =>
      normalizeSearch(p.nombre || "").includes(q) ||
      normalizeSearch(p.cuit || "").includes(q) ||
      normalizeSearch(p.empresa || "").includes(q)
    ).slice(0, 15)
  }, [provSearch, proveedores])

  const filteredProducts = useMemo(() => {
    if (!prodSearch.trim()) return []
    const q = normalizeSearch(prodSearch)
    return products.filter((p) =>
      normalizeSearch(p.code || "").includes(q) ||
      normalizeSearch(p.name).includes(q)
    ).slice(0, 15)
  }, [prodSearch, products])

  function selectProveedor(prov: any) {
    setForm((prev) => ({
      ...prev,
      proveedor_id: String(prov.id),
      proveedor_nombre: prov.nombre || prov.razon_social || "",
      email_comercial: prov.email_comercial || prev.email_comercial || "",
    }))
    setProvSearch(prov.nombre || prov.razon_social || "")
    setShowProvDropdown(false)
  }

  function addProduct(product: Product) {
    const existing = compraItems.find((i) => i.productId === product.id)
    if (existing) {
      setCompraItems((prev) => prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      setCompraItems((prev) => [...prev, {
        productId: product.id,
        code: product.code || "",
        name: product.name,
        costoNeto: product.costoNeto ?? product.price ?? 0,
        quantity: 1,
      }])
    }
    setProdSearch("")
    setShowProdDropdown(false)
  }

  function buildArticuloText(): string {
    if (articuloMode === "texto") return form.articulo
    if (compraItems.length === 0) return ""
    return compraItems.map((i) =>
      `${i.quantity}x ${i.code ? `[${i.code}] ` : ""}${i.name}${i.costoNeto ? ` - ${formatCurrency(i.costoNeto)}` : ""}`
    ).join("\n")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const articuloFinal = buildArticuloText()
    if (!articuloFinal.trim()) {
      alert("Agregá al menos un producto o pegá texto del artículo")
      return
    }

    setSubmitting(true)
    try {
      const supabase = createClient()

      // Insert compra and get ID back
      const { data: compraData, error: compraError } = await supabase
        .from("compras")
        .insert({
          proveedor_nombre: form.proveedor_nombre,
          proveedor_id: form.proveedor_id || null,
          articulo: articuloFinal,
          medio_solicitud: form.medio_solicitud || null,
          solicitado_por: form.solicitado_por || null,
          vendedor: form.vendedor || null,
          nro_cotizacion: form.nro_cotizacion || null,
          nro_nota_pedido: form.nro_nota_pedido || null,
          estado: form.estado || null,
          fecha: form.fecha || null,
          fecha_estimada_ingreso: form.fecha_estimada_ingreso || null,
          email_comercial: form.email_comercial || null,
        })
        .select("id")
        .single()

      if (compraError) throw compraError

      // Upload presupuesto if file selected
      if (presupuestoFile && compraData?.id) {
        const ext = presupuestoFile.name.split(".").pop()
        const path = `compras/${compraData.id}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from("comprobantes")
          .upload(path, presupuestoFile)

        if (!uploadError) {
          await supabase.from("compras").update({ cotizacion_ref: path }).eq("id", compraData.id)
        }
      }

      router.push("/admin/compras")
    } catch (err) {
      console.error("Error creando compra:", err)
      alert("Error al crear la compra")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2 text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/compras" className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">
          &larr; Volver
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Nueva Compra</h2>
          <p className="text-gray-500">Registrar una nueva solicitud de compra</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Datos de la compra</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Fecha */}
            <div className="space-y-2">
              <Label htmlFor="fecha">Fecha</Label>
              <Input id="fecha" type="date" value={form.fecha} onChange={(e) => setForm((prev) => ({ ...prev, fecha: e.target.value }))} />
            </div>

            {/* Proveedor - Autocomplete */}
            <div className="space-y-2 relative">
              <Label>Proveedor</Label>
              <Input
                placeholder="Buscar proveedor por nombre, CUIT o empresa..."
                value={provSearch}
                onChange={(e) => { setProvSearch(e.target.value); setShowProvDropdown(true); if (!e.target.value.trim()) setForm((prev) => ({ ...prev, proveedor_id: "", proveedor_nombre: "" })) }}
                onFocus={() => provSearch.trim() && setShowProvDropdown(true)}
                autoComplete="off"
              />
              {showProvDropdown && filteredProveedores.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto mt-1">
                  {filteredProveedores.map((p) => (
                    <button key={p.id} type="button" className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm border-b last:border-b-0" onClick={() => selectProveedor(p)}>
                      <span className="font-medium">{p.nombre || p.razon_social}</span>
                      {p.cuit && <span className="text-gray-500 ml-2">CUIT: {p.cuit}</span>}
                      {p.empresa && <span className="text-gray-400 ml-2">({p.empresa})</span>}
                    </button>
                  ))}
                </div>
              )}
              {form.proveedor_nombre && <p className="text-xs text-green-600">Seleccionado: {form.proveedor_nombre}</p>}
            </div>

            {/* Email comercial */}
            <div className="space-y-2">
              <Label>Email Comercial <span className="text-gray-400 font-normal text-xs">(opcional, para enviar OC)</span></Label>
              <Input
                type="email"
                value={form.email_comercial}
                onChange={(e) => setForm((prev) => ({ ...prev, email_comercial: e.target.value }))}
                placeholder="comercial@proveedor.com"
              />
              {form.proveedor_nombre && !form.email_comercial && (
                <p className="text-xs text-amber-600">Sin email comercial cargado para este proveedor</p>
              )}
            </div>

            {/* Articulo - Tabs: Buscar producto / Pegar texto */}
            <div className="space-y-2">
              <Label>Artículo / Detalle <span className="text-red-500">*</span></Label>
              <Tabs value={articuloMode} onValueChange={(v) => setArticuloMode(v as "productos" | "texto")}>
                <TabsList className="mb-2">
                  <TabsTrigger value="productos"><Search className="h-3 w-3 mr-1" /> Buscar producto</TabsTrigger>
                  <TabsTrigger value="texto"><Paperclip className="h-3 w-3 mr-1" /> Pegar texto libre</TabsTrigger>
                </TabsList>

                <TabsContent value="productos" className="space-y-3">
                  {/* Product search */}
                  <div className="relative">
                    <Input
                      placeholder="Buscar por código o descripción..."
                      value={prodSearch}
                      onChange={(e) => { setProdSearch(e.target.value); setShowProdDropdown(true) }}
                      onFocus={() => prodSearch.trim() && setShowProdDropdown(true)}
                      autoComplete="off"
                    />
                    {showProdDropdown && filteredProducts.length > 0 && (
                      <div className="absolute z-50 top-full left-0 right-0 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto mt-1">
                        {filteredProducts.map((p) => (
                          <button key={p.id} type="button" className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm border-b last:border-b-0" onClick={() => addProduct(p)}>
                            <span className="font-mono text-xs text-gray-500 mr-2">{p.code || "S/C"}</span>
                            <span className="font-medium">{p.name}</span>
                            {(p.costoNeto || p.price) ? (
                              <span className="text-gray-400 ml-2">{formatCurrency(p.costoNeto ?? p.price)}</span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Selected items */}
                  {compraItems.length > 0 && (
                    <div className="border rounded-lg divide-y">
                      {compraItems.map((item) => (
                        <div key={item.productId} className="flex items-center gap-2 px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <span className="font-mono text-xs text-gray-400 mr-1">{item.code || "S/C"}</span>
                            <span className="text-sm font-medium">{item.name}</span>
                            {item.costoNeto > 0 && <span className="text-xs text-gray-400 ml-2">{formatCurrency(item.costoNeto)}</span>}
                          </div>
                          <input
                            type="number"
                            min={1}
                            value={item.quantity}
                            onChange={(e) => setCompraItems((prev) => prev.map((i) => i.productId === item.productId ? { ...i, quantity: parseInt(e.target.value) || 1 } : i))}
                            className="w-16 p-1 border rounded text-center text-sm"
                          />
                          <button type="button" onClick={() => setCompraItems((prev) => prev.filter((i) => i.productId !== item.productId))} className="p-1 hover:bg-red-100 rounded">
                            <X className="h-4 w-4 text-red-500" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {compraItems.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Buscá y agregá productos arriba</p>}
                </TabsContent>

                <TabsContent value="texto">
                  <Textarea
                    placeholder="Pegar detalle de WhatsApp, email, etc..."
                    value={form.articulo}
                    onChange={(e) => setForm((prev) => ({ ...prev, articulo: e.target.value }))}
                    rows={5}
                  />
                </TabsContent>
              </Tabs>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setPresupuestoFile(f) }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={`text-xs ${presupuestoFile ? "bg-green-50 border-green-300 text-green-700" : ""}`}
                onClick={() => fileInputRef.current?.click()}
              >
                {presupuestoFile ? <Check className="h-3 w-3 mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
                {presupuestoFile ? presupuestoFile.name : "Adjuntar presupuesto (PDF, JPG, PNG)"}
              </Button>
              {presupuestoFile && (
                <button type="button" onClick={() => setPresupuestoFile(null)} className="text-xs text-red-500 ml-2 hover:underline">Quitar</button>
              )}
            </div>

            {/* Medio de solicitud + Solicitado por */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Medio de solicitud</Label>
                <Input placeholder="Email, telefono, etc." value={form.medio_solicitud} onChange={(e) => setForm((prev) => ({ ...prev, medio_solicitud: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Solicitado por</Label>
                <Input placeholder="Nombre de quien solicita" value={form.solicitado_por} onChange={(e) => setForm((prev) => ({ ...prev, solicitado_por: e.target.value }))} />
              </div>
            </div>

            {/* Vendedor */}
            <div className="space-y-2">
              <Label>Vendedor</Label>
              <Input placeholder="Nombre del vendedor" value={form.vendedor} onChange={(e) => setForm((prev) => ({ ...prev, vendedor: e.target.value }))} />
            </div>

            {/* Nro Cotizacion + Nro Nota Pedido */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nro Cotizacion</Label>
                <Input placeholder="Numero de cotizacion" value={form.nro_cotizacion} onChange={(e) => setForm((prev) => ({ ...prev, nro_cotizacion: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Nro Nota de Pedido (auto)</Label>
                <Input value={form.nro_nota_pedido} onChange={(e) => setForm((prev) => ({ ...prev, nro_nota_pedido: e.target.value }))} className="bg-gray-50" />
              </div>
            </div>

            {/* Fecha estimada de ingreso */}
            <div className="space-y-2">
              <Label>Fecha estimada de ingreso</Label>
              <Input type="date" value={form.fecha_estimada_ingreso} onChange={(e) => setForm((prev) => ({ ...prev, fecha_estimada_ingreso: e.target.value }))} />
            </div>

            {/* Estado */}
            <div className="space-y-2">
              <Label>Estado</Label>
              <select value={form.estado} onChange={(e) => setForm((prev) => ({ ...prev, estado: e.target.value }))} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm">
                {ESTADOS_OC.map((e) => (<option key={e} value={e}>{e}</option>))}
              </select>
            </div>

            {/* Observaciones si Recibido Incompleto */}
            {form.estado === "Recibido Incompleto" && (
              <div className="space-y-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <Label className="text-orange-800">Observaciones (obligatorio) <span className="text-red-500">*</span></Label>
                <Textarea placeholder="Detalle de lo faltante..." value={form.observaciones_incompleto} onChange={(e) => setForm((prev) => ({ ...prev, observaciones_incompleto: e.target.value }))} required rows={2} />
                <p className="text-xs text-orange-600">Se notificara al comprador sobre la recepcion incompleta.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="outline" onClick={() => router.push("/admin/compras")} disabled={submitting}>Cancelar</Button>
          <Button type="submit" disabled={submitting || (articuloMode === "texto" ? !form.articulo.trim() : compraItems.length === 0) || (form.estado === "Recibido Incompleto" && !form.observaciones_incompleto.trim())}>
            {submitting ? "Guardando..." : "Crear Compra"}
          </Button>
        </div>
      </form>
    </div>
  )
}
