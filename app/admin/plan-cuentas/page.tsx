"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { normalizeSearch } from "@/lib/utils"
import {
  fetchPlanCuentas, createPlanCuenta, updatePlanCuenta, deletePlanCuenta,
} from "@/lib/supabase/queries"
import { Plus, Pencil, Trash2, Search, ArrowLeft } from "lucide-react"

interface PlanCuenta {
  id: string
  codigo: string
  categoria: string
  sub_categoria: string | null
}

export default function PlanCuentasPage() {
  const [loading, setLoading] = useState(true)
  const [cuentas, setCuentas] = useState<PlanCuenta[]>([])
  const [search, setSearch] = useState("")
  const [filterCategoria, setFilterCategoria] = useState("todas")
  const [error, setError] = useState("")

  const [editOpen, setEditOpen] = useState(false)
  const [editing, setEditing] = useState<PlanCuenta | null>(null)
  const [form, setForm] = useState({ codigo: "", categoria: "", sub_categoria: "" })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<PlanCuenta | null>(null)

  async function reload() {
    setLoading(true)
    try {
      const data = await fetchPlanCuentas()
      setCuentas(data as PlanCuenta[])
    } catch (e) {
      console.error("Error cargando plan_cuentas:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const categorias = useMemo(() => {
    const s = new Set<string>()
    for (const c of cuentas) if (c.categoria) s.add(c.categoria)
    return Array.from(s).sort()
  }, [cuentas])

  const filtered = useMemo(() => {
    const q = normalizeSearch(search)
    return cuentas.filter((c) => {
      if (filterCategoria !== "todas" && c.categoria !== filterCategoria) return false
      if (!q) return true
      return (
        normalizeSearch(c.codigo).includes(q) ||
        normalizeSearch(c.categoria).includes(q) ||
        normalizeSearch(c.sub_categoria || "").includes(q)
      )
    })
  }, [cuentas, search, filterCategoria])

  function openNueva() {
    setEditing(null)
    setForm({ codigo: "", categoria: "", sub_categoria: "" })
    setError("")
    setEditOpen(true)
  }

  function openEditar(c: PlanCuenta) {
    setEditing(c)
    setForm({ codigo: c.codigo, categoria: c.categoria, sub_categoria: c.sub_categoria || "" })
    setError("")
    setEditOpen(true)
  }

  async function handleGuardar() {
    if (!form.codigo.trim() || !form.categoria.trim()) {
      setError("Código y categoría son obligatorios.")
      return
    }
    setSaving(true)
    setError("")
    try {
      if (editing) {
        await updatePlanCuenta(editing.id, form)
      } else {
        await createPlanCuenta(form)
      }
      setEditOpen(false)
      await reload()
    } catch (e: any) {
      setError(e?.message || "Error al guardar la cuenta.")
    } finally {
      setSaving(false)
    }
  }

  async function handleEliminar() {
    if (!deleting) return
    try {
      await deletePlanCuenta(deleting.id)
      setDeleting(null)
      await reload()
    } catch (e: any) {
      alert(e?.message || "Error al eliminar la cuenta.")
      setDeleting(null)
    }
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/admin/contabilidad"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Plan de Cuentas Contables</h1>
            <p className="text-muted-foreground">Catálogo de cuentas para imputaciones de facturas de proveedor.</p>
          </div>
        </div>
        <Button onClick={openNueva}>
          <Plus className="h-4 w-4 mr-2" /> Nueva cuenta
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por código, categoría o subcategoría..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <select
            value={filterCategoria}
            onChange={(e) => setFilterCategoria(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm"
          >
            <option value="todas">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {cuentas.length === 0 ? "No hay cuentas cargadas." : "Sin resultados para los filtros aplicados."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold w-32">Código</th>
                  <th className="px-4 py-3 text-left font-semibold">Categoría</th>
                  <th className="px-4 py-3 text-left font-semibold">Subcategoría</th>
                  <th className="px-4 py-3 text-center font-semibold w-28">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, idx) => (
                  <tr key={c.id} className={`border-t ${idx % 2 === 1 ? "bg-muted/30" : ""}`}>
                    <td className="px-4 py-2 font-mono text-sm">{c.codigo}</td>
                    <td className="px-4 py-2">{c.categoria}</td>
                    <td className="px-4 py-2 text-muted-foreground">{c.sub_categoria || "—"}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openEditar(c)} className="p-1.5 rounded hover:bg-gray-100" title="Editar">
                          <Pencil className="h-4 w-4 text-blue-600" />
                        </button>
                        <button onClick={() => setDeleting(c)} className="p-1.5 rounded hover:bg-gray-100" title="Eliminar">
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        {filtered.length} de {cuentas.length} cuenta(s).
      </p>

      {/* Dialog Nueva / Editar */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cuenta" : "Nueva cuenta"}</DialogTitle>
            <DialogDescription>
              El código debe ser único. Si la cuenta está usada en imputaciones, no podrá borrarse hasta limpiar el uso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Código *</Label>
              <Input value={form.codigo} onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value }))} placeholder="Ej: 4.1.1" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Categoría *</Label>
              <Input value={form.categoria} onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))} placeholder="Ej: Gastos Operativos" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Subcategoría</Label>
              <Input value={form.sub_categoria} onChange={(e) => setForm((p) => ({ ...p, sub_categoria: e.target.value }))} placeholder="Ej: Servicios públicos" />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleGuardar} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación de eliminación */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar cuenta</DialogTitle>
            <DialogDescription>
              ¿Eliminar la cuenta <strong>{deleting?.codigo}</strong> — {deleting?.categoria}?
              Si está usada en imputaciones de facturas de proveedor, el sistema bloqueará la eliminación.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleEliminar}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
