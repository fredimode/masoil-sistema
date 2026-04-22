"use client"

import { useState, useEffect, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  fetchMovimientosMercaderia, createMovimientoMercaderia, fetchProducts, fetchClients,
} from "@/lib/supabase/queries"
import { useCurrentVendedor } from "@/lib/hooks/useCurrentVendedor"
import { formatDateStr, normalizeSearch } from "@/lib/utils"
import { Plus, Search } from "lucide-react"

const TIPOS = [
  { value: "REGALO", label: "Regalo", mueveStock: true },
  { value: "DEVOLUCION", label: "Devolución cliente", mueveStock: true },
  { value: "CAMBIO", label: "Cambio", mueveStock: true },
  { value: "AJUSTE", label: "Ajuste de stock", mueveStock: true },
  { value: "CODIGO_OBS", label: "Código OBS (sin mover stock)", mueveStock: false },
]

export default function MovimientoMercaderiaPage() {
  const { vendedor } = useCurrentVendedor()
  const [movs, setMovs] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [openNuevo, setOpenNuevo] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [m, p, c] = await Promise.all([
        fetchMovimientosMercaderia(),
        fetchProducts(),
        fetchClients(),
      ])
      setMovs(m)
      setProducts(p)
      setClients(c)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Movimiento de Mercadería</h1>
        <button onClick={() => setOpenNuevo(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Nuevo Movimiento
        </button>
      </div>

      <Card className="p-4">
        {loading ? (
          <p className="text-sm text-gray-500 text-center py-8">Cargando...</p>
        ) : movs.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">Sin movimientos registrados</p>
        ) : (
          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Usuario</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movs.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{formatDateStr(m.fecha || m.created_at)}</TableCell>
                    <TableCell>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                        {TIPOS.find((t) => t.value === m.tipo)?.label || m.tipo}
                      </span>
                      {!m.mueve_stock && <span className="ml-2 text-xs text-gray-500">(no mueve)</span>}
                    </TableCell>
                    <TableCell>{m.order_id || "-"}</TableCell>
                    <TableCell>
                      <div>{m.producto_nombre}</div>
                      <div className="text-xs text-gray-500">{m.producto_codigo}</div>
                    </TableCell>
                    <TableCell className={`text-right font-medium ${m.cantidad < 0 ? "text-red-600" : "text-green-600"}`}>
                      {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600 max-w-[300px] truncate" title={m.motivo || ""}>
                      {m.motivo || "-"}
                    </TableCell>
                    <TableCell className="text-xs">{m.usuario_nombre || "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <DialogNuevoMov open={openNuevo} onClose={() => setOpenNuevo(false)}
        products={products} clients={clients} vendedor={vendedor}
        onSaved={async () => { setOpenNuevo(false); await load() }} />
    </div>
  )
}

// ─── Dialog Nuevo Movimiento ────────────────────────────────────────────────

function DialogNuevoMov({ open, onClose, products, clients, vendedor, onSaved }: {
  open: boolean
  onClose: () => void
  products: any[]
  clients: any[]
  vendedor: any
  onSaved: () => void | Promise<void>
}) {
  const [tipo, setTipo] = useState("REGALO")
  const [productSearch, setProductSearch] = useState("")
  const [showProdDropdown, setShowProdDropdown] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null)
  const [cantidad, setCantidad] = useState("")
  const [orderId, setOrderId] = useState("")
  const [clientSearch, setClientSearch] = useState("")
  const [showClientDropdown, setShowClientDropdown] = useState(false)
  const [selectedClient, setSelectedClient] = useState<any | null>(null)
  const [motivo, setMotivo] = useState("")
  const [saving, setSaving] = useState(false)

  const productosFiltrados = useMemo(() => {
    if (!productSearch.trim()) return []
    const norm = normalizeSearch(productSearch)
    return products.filter((p: any) =>
      normalizeSearch(p.name || "").includes(norm) || normalizeSearch(p.code || "").includes(norm)
    ).slice(0, 10)
  }, [productSearch, products])

  const clientesFiltrados = useMemo(() => {
    if (!clientSearch.trim()) return []
    const norm = normalizeSearch(clientSearch)
    return clients.filter((c: any) => normalizeSearch(c.businessName || "").includes(norm)).slice(0, 10)
  }, [clientSearch, clients])

  function reset() {
    setTipo("REGALO")
    setProductSearch("")
    setSelectedProduct(null)
    setCantidad("")
    setOrderId("")
    setClientSearch("")
    setSelectedClient(null)
    setMotivo("")
  }

  async function handleGuardar() {
    if (!selectedProduct) { alert("Seleccioná un producto"); return }
    const cant = parseInt(cantidad, 10)
    if (!cant) { alert("Indicá una cantidad (positivo = ingreso, negativo = egreso)"); return }
    setSaving(true)
    try {
      const tipoDef = TIPOS.find((t) => t.value === tipo)!
      await createMovimientoMercaderia({
        fecha: new Date().toISOString().slice(0, 10),
        tipo,
        product_id: selectedProduct.id,
        producto_nombre: selectedProduct.name,
        producto_codigo: selectedProduct.code,
        cantidad: cant,
        mueve_stock: tipoDef.mueveStock,
        order_id: orderId || null,
        client_id: selectedClient?.id || null,
        cliente_nombre: selectedClient?.businessName || null,
        motivo: motivo || null,
        usuario_id: vendedor?.id || null,
        usuario_nombre: vendedor?.name || null,
      })
      reset()
      await onSaved()
    } catch (e: any) {
      alert("Error: " + (e.message || e))
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Nuevo Movimiento de Mercadería</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Tipo</label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              {TIPOS.find((t) => t.value === tipo)?.mueveStock
                ? "Este tipo MUEVE stock (ajusta products.stock)"
                : "Este tipo NO mueve stock (solo queda registrado)"}
            </p>
          </div>

          <div className="relative">
            <label className="text-sm font-medium mb-1 block">Producto *</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input value={productSearch}
                onChange={(e) => { setProductSearch(e.target.value); setShowProdDropdown(true); setSelectedProduct(null) }}
                onFocus={() => setShowProdDropdown(true)}
                placeholder="Código o nombre del producto"
                className="w-full pl-9 pr-3 py-2 border rounded-md text-sm" />
            </div>
            {selectedProduct && (
              <div className="mt-1 text-xs text-green-700">
                Seleccionado: <strong>{selectedProduct.name}</strong> ({selectedProduct.code})
              </div>
            )}
            {showProdDropdown && productosFiltrados.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
                {productosFiltrados.map((p: any) => (
                  <button key={p.id}
                    onClick={() => { setSelectedProduct(p); setProductSearch(`${p.code} - ${p.name}`); setShowProdDropdown(false) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100">
                    <span className="font-mono text-xs text-gray-500">{p.code}</span> — {p.name} <span className="text-xs text-gray-400">(stock: {p.stock})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Cantidad *</label>
              <input type="number" value={cantidad} onChange={(e) => setCantidad(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="+ ingreso / - egreso" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Pedido asociado (opcional)</label>
              <input value={orderId} onChange={(e) => setOrderId(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="Nº de pedido" />
            </div>
          </div>

          <div className="relative">
            <label className="text-sm font-medium mb-1 block">Cliente (opcional)</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <input value={clientSearch}
                onChange={(e) => { setClientSearch(e.target.value); setShowClientDropdown(true); setSelectedClient(null) }}
                onFocus={() => setShowClientDropdown(true)}
                placeholder="Razón social"
                className="w-full pl-9 pr-3 py-2 border rounded-md text-sm" />
            </div>
            {selectedClient && (
              <div className="mt-1 text-xs text-green-700">Seleccionado: <strong>{selectedClient.businessName}</strong></div>
            )}
            {showClientDropdown && clientesFiltrados.length > 0 && (
              <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
                {clientesFiltrados.map((c: any) => (
                  <button key={c.id}
                    onClick={() => { setSelectedClient(c); setClientSearch(c.businessName); setShowClientDropdown(false) }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100">
                    {c.businessName}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Motivo</label>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm" rows={3}
              placeholder="Detalle del movimiento" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => { reset(); onClose() }}
              className="px-3 py-2 border rounded-md text-sm">Cancelar</button>
            <button onClick={handleGuardar} disabled={saving}
              className="px-3 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary/90 disabled:opacity-50">
              {saving ? "Guardando..." : "Guardar movimiento"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
