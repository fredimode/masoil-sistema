"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createClient } from "@/lib/supabase/client"
import { updateOrdenCompraItems } from "@/lib/supabase/queries"
import { ArrowLeft, Save } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

interface EditItem {
  id: string
  producto_nombre: string
  producto_codigo: string | null
  cantidad: number
  precio_unitario: number
  descuento_porcentaje: number
}

export default function OrdenCompraEditarPage() {
  const params = useParams()
  const router = useRouter()
  const [oc, setOc] = useState<any>(null)
  const [items, setItems] = useState<EditItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: ocData } = await supabase
      .from("ordenes_compra")
      .select("*")
      .eq("id", params.id)
      .single()
    setOc(ocData)
    const { data: itemsData } = await supabase
      .from("orden_compra_items")
      .select("*")
      .eq("orden_compra_id", params.id)
      .order("created_at")
    setItems(
      (itemsData || []).map((it: any) => ({
        id: it.id,
        producto_nombre: it.producto_nombre || "-",
        producto_codigo: it.producto_codigo || null,
        cantidad: Number(it.cantidad) || 0,
        precio_unitario: Number(it.precio_unitario) || 0,
        descuento_porcentaje: Number(it.descuento_porcentaje) || 0,
      })),
    )
    setLoading(false)
  }

  function updateItem(idx: number, field: keyof EditItem, value: number) {
    setItems((prev) => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: value }
      return updated
    })
  }

  function lineSubtotal(it: EditItem) {
    const base = it.cantidad * it.precio_unitario
    const desc = base * ((it.descuento_porcentaje || 0) / 100)
    return Math.round((base - desc) * 100) / 100
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateOrdenCompraItems(
        String(params.id),
        items.map((it) => ({
          id: it.id,
          cantidad: it.cantidad,
          precio_unitario: it.precio_unitario,
          descuento_porcentaje: it.descuento_porcentaje,
        })),
      )
      router.push(`/admin/compras/${params.id}`)
    } catch (e: any) {
      alert("Error al guardar: " + (e?.message || e))
      setSaving(false)
    }
  }

  const sumSub = Math.round(items.reduce((s, it) => s + lineSubtotal(it), 0) * 100) / 100
  const sumIva = Math.round(sumSub * 0.21 * 100) / 100

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/compras/${params.id}`)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl font-bold">Editar Orden de Compra</h1>
          </div>
          <Button onClick={handleSave} disabled={saving || loading}>
            <Save className="h-4 w-4 mr-2" /> {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Cargando...</p>
        ) : !oc ? (
          <p className="text-muted-foreground">No se encontró la orden de compra.</p>
        ) : (
          <div className="space-y-4">
            <Card className="p-4">
              <h2 className="font-semibold mb-3">Datos generales</h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">Nro OC:</span> {oc.nro_oc || "-"}</div>
                <div><span className="text-muted-foreground">Proveedor:</span> {oc.proveedor_nombre || "-"}</div>
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="font-semibold mb-3">Ítems</h2>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin ítems cargados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-xs">
                      <tr>
                        <th className="text-center p-2 w-24">Cantidad</th>
                        <th className="text-left p-2">Código</th>
                        <th className="text-left p-2">Producto</th>
                        <th className="text-right p-2 w-28">Costo</th>
                        <th className="text-right p-2 w-24">Desc.%</th>
                        <th className="text-right p-2 w-28">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => (
                        <tr key={it.id} className="border-t">
                          <td className="p-2">
                            <Input
                              type="number"
                              min={0}
                              value={it.cantidad}
                              onChange={(e) => updateItem(idx, "cantidad", Number(e.target.value))}
                              className="text-center h-8"
                            />
                          </td>
                          <td className="p-2 font-mono text-xs">{it.producto_codigo || "-"}</td>
                          <td className="p-2">{it.producto_nombre}</td>
                          <td className="p-2">
                            <Input
                              type="number"
                              step="0.01"
                              value={it.precio_unitario}
                              onChange={(e) => updateItem(idx, "precio_unitario", Number(e.target.value))}
                              className="text-right h-8"
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={it.descuento_porcentaje}
                              onChange={(e) => updateItem(idx, "descuento_porcentaje", Number(e.target.value))}
                              className="text-right h-8"
                            />
                          </td>
                          <td className="p-2 text-right font-medium">{formatCurrency(lineSubtotal(it))}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t">
                        <td colSpan={5} className="text-right p-2 text-muted-foreground">Subtotal (neto)</td>
                        <td className="text-right p-2">{formatCurrency(sumSub)}</td>
                      </tr>
                      <tr>
                        <td colSpan={5} className="text-right p-2 text-muted-foreground">IVA 21%</td>
                        <td className="text-right p-2">{formatCurrency(sumIva)}</td>
                      </tr>
                      <tr className="font-medium">
                        <td colSpan={5} className="text-right p-2">Total</td>
                        <td className="text-right p-2">{formatCurrency(Math.round((sumSub + sumIva) * 100) / 100)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3">
                El código y el producto no se modifican desde acá. Podés editar cantidad, costo y descuento.
              </p>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
