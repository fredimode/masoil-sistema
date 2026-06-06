"use client"

import React, { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  fetchProveedorById,
  fetchCompras,
  fetchPagosProveedores,
  fetchReclamosByProveedor,
  updateProveedor,
  fetchProveedorSucursales,
  createProveedorSucursal,
  updateProveedorSucursal,
  deleteProveedorSucursal,
} from "@/lib/supabase/queries"
import { formatCurrencyExact, formatDate } from "@/lib/utils"
import { ArrowLeft, Edit, MessageCircle, Save, Plus, Trash2, X, Check } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ProveedorProductosSection } from "@/components/admin/proveedor-productos-section"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export default function AdminProveedorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = React.use(params)

  const [proveedor, setProveedor] = useState<any | null>(null)
  const [compras, setCompras] = useState<any[]>([])
  const [pagos, setPagos] = useState<any[]>([])
  const [reclamos, setReclamos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notFoundState, setNotFoundState] = useState(false)
  const [observacionesPagos, setObservacionesPagos] = useState("")
  const [savingObs, setSavingObs] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const proveedorData = await fetchProveedorById(id)
        if (!proveedorData) {
          setNotFoundState(true)
          return
        }

        const [allCompras, allPagos, reclamosProv] = await Promise.all([
          fetchCompras(),
          fetchPagosProveedores(),
          fetchReclamosByProveedor(id, proveedorData.nombre),
        ])

        setProveedor(proveedorData)
        setObservacionesPagos(proveedorData.observaciones_pagos || "")

        // Filter by proveedor_id or proveedor_nombre
        setCompras(
          allCompras.filter(
            (c) =>
              c.proveedor_id === id ||
              c.proveedor_nombre === proveedorData.nombre
          )
        )
        setPagos(
          allPagos.filter(
            (p) =>
              p.proveedor_id === id ||
              p.proveedor_nombre === proveedorData.nombre
          )
        )
        setReclamos(reclamosProv)
      } catch (err) {
        console.error("Error loading proveedor:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (notFoundState) {
    notFound()
  }

  if (!proveedor) return null

  // Extract phone number from contactos for WhatsApp
  const phoneMatch = proveedor.contactos
    ? proveedor.contactos.match(
        /(\+?\d[\d\s\-()]{7,})/
      )
    : null
  const phoneNumber = phoneMatch ? phoneMatch[1].replace(/\D/g, "") : null

  return (
    <div className="p-8 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/proveedores">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold mb-1">
            {proveedor.nombre_fantasia || proveedor.nombre}
          </h1>
          {(proveedor.razon_social || proveedor.nombre_fantasia) && (
            <p className="text-sm text-muted-foreground mb-1">
              {proveedor.nombre_fantasia
                ? `Razón Social: ${proveedor.razon_social || proveedor.nombre}`
                : ""}
            </p>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            {proveedor.empresa && (
              <Badge variant="outline">{proveedor.empresa}</Badge>
            )}
            {proveedor.cuit && <span>CUIT: {proveedor.cuit}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {phoneNumber && (
            <Button asChild variant="outline">
              <a
                href={`https://wa.me/${phoneNumber}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp
              </a>
            </Button>
          )}
          <Button variant="outline" disabled>
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
        </div>
      </div>

      {/* Proveedor Info Card */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Datos del Proveedor</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Nombre de Fantasía</p>
            <p className="font-medium">{proveedor.nombre_fantasia || proveedor.nombre}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Razón Social</p>
            <p className="font-medium">{proveedor.razon_social || proveedor.nombre}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">CUIT</p>
            <p className="font-medium">{proveedor.cuit || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Empresa</p>
            <p className="font-medium">{proveedor.empresa || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">
              Condición de Pago
            </p>
            <p className="font-medium">{proveedor.condicion_pago || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">CBU</p>
            <p className="font-medium font-mono text-sm">
              {proveedor.cbu || "-"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Email Comercial</p>
            <p className="font-medium">{proveedor.email_comercial || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Email Pagos</p>
            <p className="font-medium">{proveedor.email_pagos || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Categoría</p>
            <p className="font-medium">{proveedor.categoria || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Condición de IVA</p>
            <p className="font-medium">{proveedor.condicion_iva || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Contactos</p>
            <p className="font-medium">{proveedor.contactos || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Contacto Cobranzas</p>
            <p className="font-medium">{proveedor.contacto_cobranzas || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Tel/WhatsApp Cobranzas</p>
            <p className="font-medium">{proveedor.tel_cobranzas || "-"}</p>
          </div>
          {proveedor.observaciones && (
            <div className="md:col-span-2 lg:col-span-3">
              <p className="text-sm text-muted-foreground mb-1">
                Observaciones
              </p>
              <p className="font-medium">{proveedor.observaciones}</p>
            </div>
          )}
          {proveedor.fecha_actualizacion && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                Ultima actualizacion
              </p>
              <p className="font-medium text-sm">
                {new Date(proveedor.fecha_actualizacion).toLocaleDateString(
                  "es-AR"
                )}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Productos que provee */}
      <Card className="p-6">
        <ProveedorProductosSection proveedorId={id} />
      </Card>

      {/* Historial de Compras */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-2">Datos de últimas compras</h3>
        <p className="text-xs text-muted-foreground mb-4">Últimas 10 compras / OC</p>
        {compras.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Artículo</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...compras]
                .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")))
                .slice(0, 10)
                .map((c, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      {c.fecha
                        ? new Date(c.fecha).toLocaleDateString("es-AR")
                        : "-"}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate" title={c.articulo || ""}>
                      {c.articulo || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.total != null ? formatCurrencyExact(Number(c.total)) : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.estado || "-"}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No hay compras registradas</p>
          </div>
        )}
      </Card>

      {/* Historial de Pagos */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Historial de Pagos</h3>
        {pagos.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proveedor</TableHead>
                <TableHead>Importe</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagos.map((p, i) => (
                <TableRow key={i}>
                  <TableCell>{p.proveedor_nombre || "-"}</TableCell>
                  <TableCell>
                    {p.importe != null ? formatCurrencyExact(p.importe) : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{p.estado_pago || "-"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No hay pagos registrados</p>
          </div>
        )}
      </Card>

      {/* Observaciones de Pagos */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Observaciones de Pagos</h3>
        <textarea
          value={observacionesPagos}
          onChange={(e) => setObservacionesPagos(e.target.value)}
          className="w-full p-3 border rounded-lg text-sm focus:ring-2 focus:ring-primary min-h-[100px]"
          placeholder="Notas sobre pagos a este proveedor..."
          rows={4}
        />
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            disabled={savingObs}
            onClick={async () => {
              setSavingObs(true)
              try {
                await updateProveedor(id, { observaciones_pagos: observacionesPagos })
                alert("Observaciones guardadas")
              } catch (err) {
                console.error("Error guardando observaciones:", err)
                alert("Error al guardar")
              } finally {
                setSavingObs(false)
              }
            }}
          >
            <Save className="h-4 w-4 mr-2" />
            {savingObs ? "Guardando..." : "Guardar Observaciones"}
          </Button>
        </div>
      </Card>

      {/* Reclamos */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Reclamos</h3>
        {reclamos.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Observaciones</TableHead>
                <TableHead className="w-36">Fecha</TableHead>
                <TableHead className="w-32">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reclamos.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-pre-wrap">{r.observaciones || "-"}</TableCell>
                  <TableCell className="text-sm">
                    {r.fecha_reclamo ? formatDate(new Date(r.fecha_reclamo)) : r.fecha_pago ? formatDate(new Date(r.fecha_pago)) : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.estado || "-"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No hay reclamos registrados</p>
          </div>
        )}
      </Card>

      {/* Sucursales de retiro */}
      <SucursalesRetiroSection proveedorId={id} />
    </div>
  )
}

// ─── Sucursales de retiro ────────────────────────────────────────────────────

interface Sucursal {
  id: string
  proveedor_id: string
  nombre: string
  direccion: string | null
  localidad: string | null
  provincia: string | null
  telefono: string | null
  horario: string | null
  notas: string | null
}

function SucursalesRetiroSection({ proveedorId }: { proveedorId: string }) {
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Sucursal | null>(null)

  async function reload() {
    setLoading(true)
    try {
      const data = await fetchProveedorSucursales(proveedorId)
      setSucursales(data as Sucursal[])
    } catch (e) {
      console.error("Error cargando sucursales:", e)
    } finally { setLoading(false) }
  }

  useEffect(() => { reload() }, [proveedorId])

  async function handleEliminar(s: Sucursal) {
    if (!confirm(`¿Eliminar la sucursal "${s.nombre}"?`)) return
    try {
      await deleteProveedorSucursal(s.id)
      setSucursales((prev) => prev.filter((x) => x.id !== s.id))
    } catch (e: any) {
      alert("Error eliminando sucursal: " + (e?.message || e))
    }
  }

  function abrirNueva() { setEditing(null); setDialogOpen(true) }
  function abrirEditar(s: Sucursal) { setEditing(s); setDialogOpen(true) }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Sucursales de retiro</h3>
        <Button size="sm" onClick={abrirNueva}>
          <Plus className="h-4 w-4 mr-1" /> Nueva sucursal
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground py-4">Cargando…</p>
      ) : sucursales.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p className="text-sm">No hay sucursales cargadas para este proveedor.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead>Localidad / Provincia</TableHead>
              <TableHead>Teléfono</TableHead>
              <TableHead>Horario</TableHead>
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sucursales.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.nombre}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.direccion || "-"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {[s.localidad, s.provincia].filter(Boolean).join(" / ") || "-"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.telefono || "-"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{s.horario || "-"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => abrirEditar(s)} title="Editar">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleEliminar(s)} title="Eliminar"
                      className="text-red-600 hover:text-red-800">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <SucursalDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        proveedorId={proveedorId}
        editing={editing}
        onSaved={async () => { setDialogOpen(false); await reload() }}
      />
    </Card>
  )
}

function SucursalDialog({ open, onClose, proveedorId, editing, onSaved }: {
  open: boolean
  onClose: () => void
  proveedorId: string
  editing: Sucursal | null
  onSaved: () => void | Promise<void>
}) {
  const [nombre, setNombre] = useState("")
  const [direccion, setDireccion] = useState("")
  const [localidad, setLocalidad] = useState("")
  const [provincia, setProvincia] = useState("")
  const [telefono, setTelefono] = useState("")
  const [horario, setHorario] = useState("")
  const [notas, setNotas] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setNombre(editing?.nombre || "")
      setDireccion(editing?.direccion || "")
      setLocalidad(editing?.localidad || "")
      setProvincia(editing?.provincia || "")
      setTelefono(editing?.telefono || "")
      setHorario(editing?.horario || "")
      setNotas(editing?.notas || "")
    }
  }, [open, editing])

  async function handleGuardar() {
    if (!nombre.trim()) { alert("El nombre es obligatorio"); return }
    setSaving(true)
    try {
      const payload = {
        nombre: nombre.trim(),
        direccion: direccion.trim() || null,
        localidad: localidad.trim() || null,
        provincia: provincia.trim() || null,
        telefono: telefono.trim() || null,
        horario: horario.trim() || null,
        notas: notas.trim() || null,
      }
      if (editing) {
        await updateProveedorSucursal(editing.id, payload)
      } else {
        await createProveedorSucursal({ proveedor_id: proveedorId, ...payload })
      }
      await onSaved()
    } catch (e: any) {
      alert("Error: " + (e?.message || e))
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Editar sucursal" : "Nueva sucursal"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Nombre *</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="Ej: Sucursal Centro, Depósito Norte" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Dirección</label>
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Localidad</label>
              <input value={localidad} onChange={(e) => setLocalidad(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Provincia</label>
              <input value={provincia} onChange={(e) => setProvincia(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Teléfono</label>
              <input value={telefono} onChange={(e) => setTelefono(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Horario</label>
              <input value={horario} onChange={(e) => setHorario(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="Ej: Lun-Vie 8 a 17" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Notas</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)}
              rows={2}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="Indicaciones para el repartidor (opcional)" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-1" /> Cancelar
            </Button>
            <Button onClick={handleGuardar} disabled={saving}>
              <Check className="h-4 w-4 mr-1" /> {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
