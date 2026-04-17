"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  fetchProductosByProveedor,
  upsertProductoProveedor,
  deleteProductoProveedor,
  fetchProducts,
} from "@/lib/supabase/queries"
import type { Product } from "@/lib/types"
import { formatCurrency, normalizeSearch } from "@/lib/utils"
import { Trash2, Plus, X, Search } from "lucide-react"

interface Props {
  proveedorId: string
}

export function ProveedorProductosSection({ proveedorId }: Props) {
  const [asociaciones, setAsociaciones] = useState<any[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [prodSearch, setProdSearch] = useState("")
  const [selectedProd, setSelectedProd] = useState<Product | null>(null)
  const [precio, setPrecio] = useState<string>("")
  const [codigoProv, setCodigoProv] = useState("")
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [a, prods] = await Promise.all([
        fetchProductosByProveedor(proveedorId),
        fetchProducts(),
      ])
      setAsociaciones(a)
      setProducts(prods)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (proveedorId) load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveedorId])

  const filtered = useMemo(() => {
    if (!prodSearch.trim()) return []
    const q = normalizeSearch(prodSearch)
    const yaAsociados = new Set(asociaciones.map((a) => String(a.product_id)))
    return products.filter((p) =>
      !yaAsociados.has(String(p.id)) &&
      (normalizeSearch(p.name).includes(q) || normalizeSearch(p.code || "").includes(q)),
    ).slice(0, 10)
  }, [prodSearch, products, asociaciones])

  async function handleAgregar() {
    if (!selectedProd) {
      alert("Seleccioná un producto")
      return
    }
    setSaving(true)
    try {
      await upsertProductoProveedor({
        product_id: selectedProd.id,
        proveedor_id: proveedorId,
        precio_proveedor: precio ? parseFloat(precio) : null,
        codigo_proveedor: codigoProv || null,
      })
      setShowAdd(false)
      setSelectedProd(null)
      setProdSearch("")
      setPrecio("")
      setCodigoProv("")
      await load()
    } catch (e: any) {
      console.error(e)
      alert("Error al asociar producto: " + (e?.message || ""))
    } finally {
      setSaving(false)
    }
  }

  async function handleEliminar(id: string) {
    if (!confirm("¿Eliminar esta asociación?")) return
    try {
      await deleteProductoProveedor(id)
      await load()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Productos que provee</h3>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
          >
            <Plus className="h-4 w-4" /> Asociar producto
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : asociaciones.length === 0 && !showAdd ? (
        <p className="text-sm text-muted-foreground">Sin productos asociados</p>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr className="text-left">
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-right">Precio</th>
                <th className="px-3 py-2">Cód. proveedor</th>
                <th className="px-3 py-2">Última actualización</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {asociaciones.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{a.product_code || "-"}</td>
                  <td className="px-3 py-2">
                    <Link href={`/admin/stock?productId=${a.product_id}`} className="hover:underline text-blue-600">
                      {a.product_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {a.precio_proveedor ? formatCurrency(Number(a.precio_proveedor)) : "-"}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{a.codigo_proveedor || "-"}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs">
                    {a.ultimo_precio_fecha ? new Date(a.ultimo_precio_fecha).toLocaleDateString("es-AR") : "-"}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => handleEliminar(a.id)}
                      className="p-1 hover:bg-red-100 rounded"
                      title="Quitar asociación"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <div className="border rounded-md p-3 bg-gray-50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Asociar producto</span>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setSelectedProd(null); setProdSearch(""); setPrecio(""); setCodigoProv("") }}
              className="p-1 hover:bg-gray-200 rounded"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={prodSearch}
              onChange={(e) => { setProdSearch(e.target.value); setSelectedProd(null) }}
              placeholder="Buscar producto por código o nombre..."
              className="w-full pl-9 pr-3 py-2 border rounded text-sm"
            />
            {prodSearch && !selectedProd && filtered.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded shadow max-h-48 overflow-y-auto mt-1">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setSelectedProd(p); setProdSearch(`${p.code || ""} ${p.name}`) }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm border-b last:border-b-0"
                  >
                    <span className="font-mono text-xs text-gray-500 mr-2">{p.code || "S/C"}</span>
                    <span className="font-medium">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Precio</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                className="w-full px-2 py-1.5 border rounded text-sm"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Código proveedor</label>
              <input
                type="text"
                value={codigoProv}
                onChange={(e) => setCodigoProv(e.target.value)}
                className="w-full px-2 py-1.5 border rounded text-sm"
                placeholder="Opcional"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowAdd(false); setSelectedProd(null); setProdSearch(""); setPrecio(""); setCodigoProv("") }}
              className="px-3 py-1.5 text-sm bg-gray-200 rounded hover:bg-gray-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleAgregar}
              disabled={saving || !selectedProd}
              className="px-3 py-1.5 text-sm bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Asociar"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
