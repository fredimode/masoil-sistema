"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { fetchProveedores, fetchCompras, createCompra } from "@/lib/supabase/queries"
import { normalizeSearch } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Paperclip } from "lucide-react"

const ESTADOS_OC = ["Pendiente", "Realizado", "Recibido Completo", "Recibido Incompleto", "Factura Cargada", "Cancelado"]

export default function NuevaCompraPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [proveedores, setProveedores] = useState<any[]>([])
  const [provSearch, setProvSearch] = useState("")
  const [showProvDropdown, setShowProvDropdown] = useState(false)
  const [nextNP, setNextNP] = useState("NP-0001")

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
  })

  useEffect(() => {
    async function loadData() {
      try {
        const [provs, compras] = await Promise.all([fetchProveedores(), fetchCompras()])
        setProveedores(provs)

        // Calculate next NP number
        const npNumbers = compras
          .map((c: any) => c.nro_nota_pedido)
          .filter((np: string) => np && /^NP-\d+$/.test(np))
          .map((np: string) => parseInt(np.replace("NP-", ""), 10))
        const maxNP = npNumbers.length > 0 ? Math.max(...npNumbers) : 0
        const next = `NP-${String(maxNP + 1).padStart(4, "0")}`
        setNextNP(next)
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

  function selectProveedor(prov: any) {
    setForm((prev) => ({
      ...prev,
      proveedor_id: String(prov.id),
      proveedor_nombre: prov.nombre || prov.razon_social || "",
    }))
    setProvSearch(prov.nombre || prov.razon_social || "")
    setShowProvDropdown(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.articulo.trim()) return

    setSubmitting(true)
    try {
      await createCompra({
        proveedor_nombre: form.proveedor_nombre,
        proveedor_id: form.proveedor_id || undefined,
        articulo: form.articulo,
        medio_solicitud: form.medio_solicitud || undefined,
        solicitado_por: form.solicitado_por || undefined,
        vendedor: form.vendedor || undefined,
        nro_cotizacion: form.nro_cotizacion || undefined,
        nro_nota_pedido: form.nro_nota_pedido || undefined,
        estado: form.estado || undefined,
        fecha: form.fecha || undefined,
        fecha_estimada_ingreso: form.fecha_estimada_ingreso || undefined,
      })
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
        <Link
          href="/admin/compras"
          className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
        >
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
              <Input
                id="fecha"
                type="date"
                value={form.fecha}
                onChange={(e) => setForm((prev) => ({ ...prev, fecha: e.target.value }))}
              />
            </div>

            {/* Proveedor - Autocomplete */}
            <div className="space-y-2 relative">
              <Label htmlFor="proveedor">Proveedor</Label>
              <Input
                id="proveedor"
                placeholder="Buscar proveedor por nombre, CUIT o empresa..."
                value={provSearch}
                onChange={(e) => {
                  setProvSearch(e.target.value)
                  setShowProvDropdown(true)
                  if (!e.target.value.trim()) {
                    setForm((prev) => ({ ...prev, proveedor_id: "", proveedor_nombre: "" }))
                  }
                }}
                onFocus={() => provSearch.trim() && setShowProvDropdown(true)}
                autoComplete="off"
              />
              {showProvDropdown && filteredProveedores.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto mt-1">
                  {filteredProveedores.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm border-b last:border-b-0"
                      onClick={() => selectProveedor(p)}
                    >
                      <span className="font-medium">{p.nombre || p.razon_social}</span>
                      {p.cuit && <span className="text-gray-500 ml-2">CUIT: {p.cuit}</span>}
                      {p.empresa && <span className="text-gray-400 ml-2">({p.empresa})</span>}
                    </button>
                  ))}
                </div>
              )}
              {form.proveedor_nombre && (
                <p className="text-xs text-green-600">Seleccionado: {form.proveedor_nombre}</p>
              )}
            </div>

            {/* Articulo */}
            <div className="space-y-2">
              <Label htmlFor="articulo">
                Articulo / Detalle <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="articulo"
                placeholder="Pegar detalle de WhatsApp, email, etc..."
                value={form.articulo}
                onChange={(e) => setForm((prev) => ({ ...prev, articulo: e.target.value }))}
                required
                rows={4}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => alert("TODO: Integrar con Google Drive para adjuntar presupuesto")}
              >
                <Paperclip className="h-3 w-3 mr-1" />
                Adjuntar presupuesto
              </Button>
            </div>

            {/* Medio de solicitud + Solicitado por */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="medio_solicitud">Medio de solicitud</Label>
                <Input
                  id="medio_solicitud"
                  placeholder="Email, telefono, etc."
                  value={form.medio_solicitud}
                  onChange={(e) => setForm((prev) => ({ ...prev, medio_solicitud: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="solicitado_por">Solicitado por</Label>
                <Input
                  id="solicitado_por"
                  placeholder="Nombre de quien solicita"
                  value={form.solicitado_por}
                  onChange={(e) => setForm((prev) => ({ ...prev, solicitado_por: e.target.value }))}
                />
              </div>
            </div>

            {/* Vendedor */}
            <div className="space-y-2">
              <Label htmlFor="vendedor">Vendedor</Label>
              <Input
                id="vendedor"
                placeholder="Nombre del vendedor"
                value={form.vendedor}
                onChange={(e) => setForm((prev) => ({ ...prev, vendedor: e.target.value }))}
              />
            </div>

            {/* Nro Cotizacion + Nro Nota Pedido (auto) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nro_cotizacion">Nro Cotizacion</Label>
                <Input
                  id="nro_cotizacion"
                  placeholder="Numero de cotizacion"
                  value={form.nro_cotizacion}
                  onChange={(e) => setForm((prev) => ({ ...prev, nro_cotizacion: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nro_nota_pedido">Nro Nota de Pedido (auto)</Label>
                <Input
                  id="nro_nota_pedido"
                  value={form.nro_nota_pedido}
                  onChange={(e) => setForm((prev) => ({ ...prev, nro_nota_pedido: e.target.value }))}
                  className="bg-gray-50"
                />
              </div>
            </div>

            {/* Fecha estimada de ingreso */}
            <div className="space-y-2">
              <Label htmlFor="fecha_estimada_ingreso">Fecha estimada de ingreso</Label>
              <Input
                id="fecha_estimada_ingreso"
                type="date"
                value={form.fecha_estimada_ingreso}
                onChange={(e) => setForm((prev) => ({ ...prev, fecha_estimada_ingreso: e.target.value }))}
              />
            </div>

            {/* Estado */}
            <div className="space-y-2">
              <Label htmlFor="estado">Estado</Label>
              <select
                id="estado"
                value={form.estado}
                onChange={(e) => setForm((prev) => ({ ...prev, estado: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              >
                {ESTADOS_OC.map((e) => (
                  <option key={e} value={e}>{e}</option>
                ))}
              </select>
            </div>

            {/* Observaciones si Recibido Incompleto */}
            {form.estado === "Recibido Incompleto" && (
              <div className="space-y-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <Label htmlFor="obs_incompleto" className="text-orange-800">
                  Observaciones (obligatorio) <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="obs_incompleto"
                  placeholder="Detalle de lo faltante..."
                  value={form.observaciones_incompleto}
                  onChange={(e) => setForm((prev) => ({ ...prev, observaciones_incompleto: e.target.value }))}
                  required
                  rows={2}
                />
                <p className="text-xs text-orange-600">
                  {/* TODO: enviar notificación al comprador */}
                  Se notificara al comprador sobre la recepcion incompleta.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/admin/compras")}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting || !form.articulo.trim() || (form.estado === "Recibido Incompleto" && !form.observaciones_incompleto.trim())}>
            {submitting ? "Guardando..." : "Crear Compra"}
          </Button>
        </div>
      </form>
    </div>
  )
}
