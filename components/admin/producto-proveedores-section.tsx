"use client"

import { useEffect, useMemo, useState } from "react"
import {
  fetchProveedoresByProducto,
  upsertProductoProveedor,
  deleteProductoProveedor,
  fetchProveedores,
} from "@/lib/supabase/queries"
import { formatCurrency, normalizeSearch } from "@/lib/utils"
import { Trash2, Plus, X, Search } from "lucide-react"

interface Props {
  productId: string
  productPrice?: number
}

export function ProductoProveedoresSection({ productId }: Props) {
  const [asociaciones, setAsociaciones] = useState<any[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [provSearch, setProvSearch] = useState("")
  const [selectedProv, setSelectedProv] = useState<any | null>(null)
  const [precio, setPrecio] = useState<string>("")
  const [codigoProv, setCodigoProv] = useState("")
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [a, provs] = await Promise.all([
        fetchProveedoresByProducto(productId),
        fetchProveedores(),
      ])
      setAsociaciones(a)
      setProveedores(provs)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (productId) load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  const filtered = useMemo(() => {
    if (!provSearch.trim()) return []
    const q = normalizeSearch(provSearch)
    const yaAsociados = new Set(asociaciones.map((a) => String(a.proveedor_id)))
    return proveedores.filter((p) =>
      !yaAsociados.has(String(p.id)) &&
      (normalizeSearch(p.nombre || "").includes(q) ||
        normalizeSearch(p.razon_social || "").includes(q) ||
        normalizeSearch(p.cuit || "").includes(q)),
    ).slice(0, 10)
  }, [provSearch, proveedores, asociaciones])

  async function handleAgregar() {
    if (!selectedProv) {
      alert("Seleccioná un proveedor")
      return
    }
    setSaving(true)
    try {
      await upsertProductoProveedor({
        product_id: productId,
        proveedor_id: selectedProv.id,
        precio_proveedor: precio ? parseFloat(precio) : null,
        codigo_proveedor: codigoProv || null,
      })
      setShowAdd(false)
      setSelectedProv(null)
      setProvSearch("")
      setPrecio("")
      setCodigoProv("")
      await load()
    } catch (e: any) {
      console.error(e)
      alert("Error al asociar proveedor: " + (e?.message || ""))
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
        <h4 className="font-semibold text-sm">Proveedores de este producto</h4>
        {!showAdd && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
          >
            <Plus className="h-3 w-3" /> Asociar proveedor
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Cargando...</p>
      ) : asociaciones.length === 0 && !showAdd ? (
        <p className="text-xs text-muted-foreground">Sin proveedores asociados</p>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-100">
              <tr className="text-left">
                <th className="px-2 py-2">Proveedor</th>
                <th className="px-2 py-2">Cód. Prov.</th>
                <th className="px-2 py-2 text-right">Precio</th>
                <th className="px-2 py-2">Última actualización</th>
                <th className="px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {asociaciones.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-2 py-2">
                    <div className="font-medium">{a.proveedor_nombre}</div>
                    {a.proveedor_cuit && <div className="text-[10px] text-muted-foreground">CUIT: {a.proveedor_cuit}</div>}
                  </td>
                  <td className="px-2 py-2 font-mono">{a.codigo_proveedor || "-"}</td>
                  <td className="px-2 py-2 text-right font-medium">
                    {a.precio_proveedor ? formatCurrency(Number(a.precio_proveedor)) : "-"}
                  </td>
                  <td className="px-2 py-2 text-muted-foreground">
                    {a.ultimo_precio_fecha ? new Date(a.ultimo_precio_fecha).toLocaleDateString("es-AR") : "-"}
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => handleEliminar(a.id)}
                      className="p-1 hover:bg-red-100 rounded"
                      title="Quitar asociación"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
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
            <span className="text-xs font-medium">Asociar proveedor</span>
            <button
              type="button"
              onClick={() => { setShowAdd(false); setSelectedProv(null); setProvSearch(""); setPrecio(""); setCodigoProv("") }}
              className="p-1 hover:bg-gray-200 rounded"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              value={provSearch}
              onChange={(e) => { setProvSearch(e.target.value); setSelectedProv(null) }}
              placeholder="Buscar proveedor por nombre o CUIT..."
              className="w-full pl-8 pr-3 py-1.5 border rounded text-xs"
            />
            {provSearch && !selectedProv && filtered.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 bg-white border rounded shadow max-h-48 overflow-y-auto mt-1">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { setSelectedProv(p); setProvSearch(p.nombre || p.razon_social) }}
                    className="w-full text-left px-2 py-1.5 hover:bg-gray-100 text-xs border-b last:border-b-0"
                  >
                    <span className="font-medium">{p.nombre || p.razon_social}</span>
                    {p.cuit && <span className="ml-2 text-muted-foreground">CUIT: {p.cuit}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] text-muted-foreground">Precio</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={precio}
                onChange={(e) => setPrecio(e.target.value)}
                className="w-full px-2 py-1 border rounded text-xs"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground">Código proveedor</label>
              <input
                type="text"
                value={codigoProv}
                onChange={(e) => setCodigoProv(e.target.value)}
                className="w-full px-2 py-1 border rounded text-xs"
                placeholder="Opcional"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowAdd(false); setSelectedProv(null); setProvSearch(""); setPrecio(""); setCodigoProv("") }}
              className="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleAgregar}
              disabled={saving || !selectedProv}
              className="px-2 py-1 text-xs bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Asociar"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
