"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { fetchCotizaciones, updateCotizacion, fetchProveedores, createCotizacion } from "@/lib/supabase/queries"
import { createClient } from "@/lib/supabase/client"
import { formatCurrency } from "@/lib/utils"
import { Search, Plus, Check, X, Eye } from "lucide-react"

export default function CotizacionesPage() {
  const [cotizaciones, setCotizaciones] = useState<any[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedCot, setSelectedCot] = useState<any | null>(null)

  // New cotizacion dialog
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [newCot, setNewCot] = useState({ order_id: "", proveedor_id: "", proveedor_nombre: "", items: "[]", total: 0, observaciones: "" })
  const [creating, setCreating] = useState(false)

  async function loadData() {
    try {
      const [cots, provs] = await Promise.all([fetchCotizaciones(), fetchProveedores()])
      setCotizaciones(cots)
      setProveedores(provs)
    } catch (err) {
      console.error("Error loading:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  if (loading) return <div className="p-8 flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>

  let filtered = [...cotizaciones]
  if (filtroEstado) filtered = filtered.filter((c) => c.estado === filtroEstado)
  if (searchTerm) {
    const q = searchTerm.toLowerCase()
    filtered = filtered.filter((c) =>
      (c.proveedor_nombre || "").toLowerCase().includes(q) ||
      (c.order_id || "").toLowerCase().includes(q)
    )
  }

  function estadoBadge(estado: string) {
    switch (estado) {
      case "pendiente": return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pendiente</Badge>
      case "aceptada": return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Aceptada</Badge>
      case "rechazada": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rechazada</Badge>
      default: return <Badge variant="outline">{estado}</Badge>
    }
  }

  async function handleAceptar(cot: any) {
    try {
      await updateCotizacion(cot.id, { estado: "aceptada", fecha_respuesta: new Date().toISOString().slice(0, 10) })
      // Update order to ESPERANDO_MERCADERIA
      if (cot.order_id) {
        const supabase = createClient()
        await supabase.from("orders").update({ status: "ESPERANDO_MERCADERIA", cotizacion_aceptada: true }).eq("id", cot.order_id)
      }
      setLoading(true)
      await loadData()
    } catch (err) {
      console.error("Error:", err)
      alert("Error al aceptar cotización")
    }
  }

  async function handleRechazar(cot: any) {
    try {
      await updateCotizacion(cot.id, { estado: "rechazada", fecha_respuesta: new Date().toISOString().slice(0, 10) })
      setLoading(true)
      await loadData()
    } catch (err) {
      console.error("Error:", err)
    }
  }

  async function handleCreate() {
    if (!newCot.order_id || !newCot.proveedor_id) {
      alert("Completá pedido y proveedor")
      return
    }
    setCreating(true)
    try {
      let items: unknown[] = []
      try { items = JSON.parse(newCot.items) } catch { items = [] }
      const prov = proveedores.find((p: any) => p.id === newCot.proveedor_id)
      await createCotizacion({
        order_id: newCot.order_id,
        proveedor_id: newCot.proveedor_id,
        proveedor_nombre: prov?.nombre || newCot.proveedor_nombre,
        items,
        total: newCot.total,
        observaciones: newCot.observaciones,
      })
      setShowNewDialog(false)
      setNewCot({ order_id: "", proveedor_id: "", proveedor_nombre: "", items: "[]", total: 0, observaciones: "" })
      setLoading(true)
      await loadData()
    } catch (err) {
      console.error("Error:", err)
      alert("Error al crear cotización")
    } finally {
      setCreating(false)
    }
  }

  function formatFecha(d: string | null) {
    if (!d) return "-"
    return new Date(d).toLocaleDateString("es-AR")
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Cotizaciones</h1>
          <p className="text-muted-foreground">Gestión de cotizaciones con proveedores</p>
        </div>
        <Button onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Cotización
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Pendientes</p>
          <p className="text-2xl font-bold text-amber-700">{cotizaciones.filter((c) => c.estado === "pendiente").length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Aceptadas</p>
          <p className="text-2xl font-bold text-green-700">{cotizaciones.filter((c) => c.estado === "aceptada").length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">Rechazadas</p>
          <p className="text-2xl font-bold text-red-700">{cotizaciones.filter((c) => c.estado === "rechazada").length}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por proveedor o pedido..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
        </div>
        <Select value={filtroEstado} onValueChange={setFiltroEstado}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="pendiente">Pendiente</SelectItem>
            <SelectItem value="aceptada">Aceptada</SelectItem>
            <SelectItem value="rechazada">Rechazada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No hay cotizaciones
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((cot) => (
                <TableRow key={cot.id}>
                  <TableCell className="text-sm">{formatFecha(cot.created_at)}</TableCell>
                  <TableCell className="font-mono text-sm">{cot.order_id || "-"}</TableCell>
                  <TableCell className="font-medium">{cot.proveedor_nombre || "-"}</TableCell>
                  <TableCell className="text-right font-medium">{cot.total ? formatCurrency(Number(cot.total)) : "-"}</TableCell>
                  <TableCell className="text-center">{estadoBadge(cot.estado)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedCot(cot)} title="Ver detalle">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {cot.estado === "pendiente" && (
                        <>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleAceptar(cot)} title="Aceptar">
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleRechazar(cot)} title="Rechazar">
                            <X className="h-4 w-4 text-red-600" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Detail Dialog */}
      {selectedCot && (
        <Dialog open={!!selectedCot} onOpenChange={() => setSelectedCot(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Detalle de Cotización</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Pedido</span><span className="font-mono">{selectedCot.order_id}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Proveedor</span><span className="font-medium">{selectedCot.proveedor_nombre}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total</span><span className="font-bold">{selectedCot.total ? formatCurrency(Number(selectedCot.total)) : "-"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Estado</span>{estadoBadge(selectedCot.estado)}</div>
              <div className="flex justify-between"><span className="text-muted-foreground">Fecha</span><span>{formatFecha(selectedCot.created_at)}</span></div>
              {selectedCot.observaciones && (
                <div><span className="text-muted-foreground block mb-1">Observaciones</span><p>{selectedCot.observaciones}</p></div>
              )}
              {selectedCot.items && (
                <div>
                  <span className="text-muted-foreground block mb-1">Items</span>
                  <pre className="bg-gray-100 rounded p-2 text-xs overflow-x-auto max-h-40">
                    {JSON.stringify(selectedCot.items, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* New Cotizacion Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva Cotización</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>ID del Pedido *</Label>
              <Input value={newCot.order_id} onChange={(e) => setNewCot((c) => ({ ...c, order_id: e.target.value }))} placeholder="ID del pedido" />
            </div>
            <div>
              <Label>Proveedor *</Label>
              <Select value={newCot.proveedor_id} onValueChange={(v) => setNewCot((c) => ({ ...c, proveedor_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar proveedor..." /></SelectTrigger>
                <SelectContent>
                  {proveedores.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Total</Label>
              <Input type="number" value={newCot.total || ""} onChange={(e) => setNewCot((c) => ({ ...c, total: parseFloat(e.target.value) || 0 }))} />
            </div>
            <div>
              <Label>Observaciones</Label>
              <Textarea value={newCot.observaciones} onChange={(e) => setNewCot((c) => ({ ...c, observaciones: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? "Creando..." : "Crear"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
