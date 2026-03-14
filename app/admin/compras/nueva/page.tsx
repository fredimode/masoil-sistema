"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { fetchProveedores, createCompra } from "@/lib/supabase/queries"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export default function NuevaCompraPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [proveedores, setProveedores] = useState<any[]>([])

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
  })

  useEffect(() => {
    async function loadProveedores() {
      try {
        const data = await fetchProveedores()
        setProveedores(data)
      } catch (err) {
        console.error("Error cargando proveedores:", err)
      } finally {
        setLoading(false)
      }
    }
    loadProveedores()
  }, [])

  function handleProveedorChange(proveedorId: string) {
    const prov = proveedores.find((p) => String(p.id) === proveedorId)
    setForm((prev) => ({
      ...prev,
      proveedor_id: proveedorId,
      proveedor_nombre: prov?.nombre || prov?.razon_social || "",
    }))
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

            {/* Proveedor */}
            <div className="space-y-2">
              <Label htmlFor="proveedor">Proveedor</Label>
              <Select value={form.proveedor_id} onValueChange={handleProveedorChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar proveedor" />
                </SelectTrigger>
                <SelectContent>
                  {proveedores.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.nombre || p.razon_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Articulo */}
            <div className="space-y-2">
              <Label htmlFor="articulo">
                Articulo <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="articulo"
                placeholder="Descripcion del articulo solicitado..."
                value={form.articulo}
                onChange={(e) => setForm((prev) => ({ ...prev, articulo: e.target.value }))}
                required
                rows={3}
              />
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

            {/* Nro Cotizacion + Nro Nota Pedido */}
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
                <Label htmlFor="nro_nota_pedido">Nro Nota de Pedido</Label>
                <Input
                  id="nro_nota_pedido"
                  placeholder="Numero de nota de pedido"
                  value={form.nro_nota_pedido}
                  onChange={(e) => setForm((prev) => ({ ...prev, nro_nota_pedido: e.target.value }))}
                />
              </div>
            </div>

            {/* Estado */}
            <div className="space-y-2">
              <Label htmlFor="estado">Estado</Label>
              <Select
                value={form.estado}
                onValueChange={(val) => setForm((prev) => ({ ...prev, estado: val }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pendiente">Pendiente</SelectItem>
                  <SelectItem value="En proceso">En proceso</SelectItem>
                  <SelectItem value="Recibido">Recibido</SelectItem>
                  <SelectItem value="Cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
          <Button type="submit" disabled={submitting || !form.articulo.trim()}>
            {submitting ? "Guardando..." : "Crear Compra"}
          </Button>
        </div>
      </form>
    </div>
  )
}
