"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency } from "@/lib/utils"
import { Search } from "lucide-react"

interface HistorialVentasProps {
  clientId: string
  /** Si se pasa, filtra el historial a este producto (modo N.3 producto+cliente). */
  productId?: string | null
}

function normalize(it: any) {
  const prod = Array.isArray(it.products) ? it.products[0] : it.products
  const fact = Array.isArray(it.orders) ? it.orders[0] : it.orders
  const factura = fact?.facturas ? (Array.isArray(fact.facturas) ? fact.facturas[0] : fact.facturas) : null
  const fecha = factura?.fecha || it.created_at
  const comprobante = factura ? (factura.numero || factura.comprobante_nro || "-") : "-"
  // order_items.unit_price se guarda CON IVA → mostramos SIN IVA (÷1.21)
  const precioSinIva = Math.round((Number(it.unit_price) / 1.21) * 100) / 100
  return {
    id: it.id,
    fecha,
    cantidad: it.quantity,
    descripcion: prod?.name || "-",
    codigo: prod?.code || "-",
    precioSinIva,
    comprobante,
  }
}

/**
 * Tabla reutilizable de historial de ventas de un cliente.
 * - Sin productId: muestra todo el historial del cliente con buscador (N.4).
 * - Con productId: filtra a las ventas de ese producto a ese cliente (N.3).
 * Columnas: Fecha / Cantidad / Descripción / Código / Precio Unit (SIN IVA) / Comprobante.
 */
export function HistorialVentas({ clientId, productId }: HistorialVentasProps) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const supabase = createClient()
      let query = supabase
        .from("order_items")
        .select(`
          id, quantity, unit_price, created_at,
          products(code, name),
          orders!inner(client_id, factura_id, facturas(numero, comprobante_nro, fecha, tipo))
        `)
        .eq("orders.client_id", clientId)
        .not("orders.factura_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(500)
      if (productId) query = query.eq("product_id", productId)
      const { data } = await query
      if (!cancelled) {
        setRows((data as any) || [])
        setLoading(false)
      }
    }
    if (clientId) load()
    return () => {
      cancelled = true
    }
  }, [clientId, productId])

  const items = rows.map(normalize).filter((r) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return r.codigo.toLowerCase().includes(q) || r.descripcion.toLowerCase().includes(q)
  })

  return (
    <div>
      {!productId && (
        <div className="relative w-full sm:w-64 mb-3">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar código o descripción..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Cargando...</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {productId ? "Sin ventas previas a este cliente." : search ? "Sin resultados." : "Sin artículos facturados."}
        </p>
      ) : (
        <div className="overflow-x-auto max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="bg-muted text-xs sticky top-0">
              <tr>
                <th className="text-left p-2">Fecha</th>
                <th className="text-right p-2">Cantidad</th>
                <th className="text-left p-2">Descripción</th>
                <th className="text-left p-2">Código</th>
                <th className="text-right p-2">Precio Unit. (s/IVA)</th>
                <th className="text-left p-2">Comprobante</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{new Date(r.fecha).toLocaleDateString("es-AR")}</td>
                  <td className="text-right p-2">{r.cantidad}</td>
                  <td className="p-2">{r.descripcion}</td>
                  <td className="p-2 font-mono text-xs">{r.codigo}</td>
                  <td className="text-right p-2">{formatCurrency(r.precioSinIva)}</td>
                  <td className="p-2">{r.comprobante}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

interface HistorialVentasDialogProps extends HistorialVentasProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientName?: string
  productName?: string
}

/** Dialog que envuelve <HistorialVentas> para usarse desde forms sin perder el contexto. */
export function HistorialVentasDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  productId,
  productName,
}: HistorialVentasDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {productId
              ? `Historial: ${productName || "producto"}${clientName ? ` — ${clientName}` : ""}`
              : `Historial de ventas${clientName ? ` — ${clientName}` : ""}`}
          </DialogTitle>
        </DialogHeader>
        {open && <HistorialVentas clientId={clientId} productId={productId} />}
      </DialogContent>
    </Dialog>
  )
}
