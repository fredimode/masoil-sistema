"use client"

import { useState, useEffect, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  fetchRepartos, fetchRepartoItems, ensureRepartoForFecha, createRepartoItem,
  updateRepartoItem, deleteRepartoItem, formatNumeroReparto, proximoDiaHabil,
  updateOrderStatus,
} from "@/lib/supabase/queries"
import { useCurrentVendedor } from "@/lib/hooks/useCurrentVendedor"
import { formatDateStr } from "@/lib/utils"
import { Plus, Printer, Download, Trash2 } from "lucide-react"
import * as XLSX from "xlsx"

const REPARTIDORES = ["Alejandro", "Agustín"]
const ESTADOS_ENTREGA = [
  { value: "pendiente", label: "Pendiente" },
  { value: "entregado", label: "Entregado" },
  { value: "cliente_retira", label: "Cliente lo pasa a buscar" },
]

export default function LogisticaPage() {
  const { vendedor } = useCurrentVendedor()
  const [repartos, setRepartos] = useState<any[]>([])
  const [selectedFecha, setSelectedFecha] = useState<string>(() => proximoDiaHabil().toISOString().slice(0, 10))
  const [currentRepartoId, setCurrentRepartoId] = useState<string | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [openNuevo, setOpenNuevo] = useState(false)

  async function loadRepartos() {
    const r = await fetchRepartos()
    setRepartos(r)
  }

  async function loadItemsForFecha(fechaISO: string) {
    setLoading(true)
    try {
      const existing = repartos.find((r) => r.fecha === fechaISO)
      if (existing) {
        setCurrentRepartoId(existing.id)
        const it = await fetchRepartoItems(existing.id)
        setItems(it)
      } else {
        setCurrentRepartoId(null)
        setItems([])
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { loadRepartos() }, [])
  useEffect(() => { if (repartos.length > 0 || selectedFecha) loadItemsForFecha(selectedFecha) }, [repartos, selectedFecha])

  async function handleUpdateItem(id: string, field: string, value: any) {
    const updates: any = { [field]: value }
    const item = items.find((i) => i.id === id)
    if (field === "estado_entrega") {
      if (value === "entregado" && item?.order_id) {
        try {
          await updateOrderStatus(item.order_id, "ENTREGADO" as any, vendedor?.id || "", vendedor?.name || "Admin", "Entregado desde Logística")
        } catch (e) { console.error(e) }
      }
    }
    await updateRepartoItem(id, updates)
    // Si se marcó como entregado o cliente_retira → lo sacamos de la lista activa
    if (value === "entregado" || value === "cliente_retira") {
      setItems((prev) => prev.filter((i) => i.id !== id))
    } else {
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, ...updates } : i))
    }
  }

  async function handleReorden(id: string, nuevoOrden: number) {
    await updateRepartoItem(id, { orden_reparto: nuevoOrden })
    setItems((prev) => [...prev.map((i) => i.id === id ? { ...i, orden_reparto: nuevoOrden } : i)]
      .sort((a, b) => (a.orden_reparto || 999) - (b.orden_reparto || 999)))
  }

  async function handleEliminar(id: string) {
    if (!confirm("¿Eliminar este destino del reparto?")) return
    await deleteRepartoItem(id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  async function handleAgregarDestinoExtra() { setOpenNuevo(true) }

  const visibles = useMemo(() => items.filter((i) => i.estado_entrega !== "entregado" && i.estado_entrega !== "cliente_retira"), [items])
  const numeroActual = currentRepartoId ? repartos.find((r) => r.id === currentRepartoId)?.numero_reparto : formatNumeroReparto(new Date(selectedFecha))

  function handlePrint() {
    const w = window.open("", "_blank")
    if (!w) return
    const rowsHtml = visibles.map((i) => `
      <tr>
        <td>${i.orden_reparto || "-"}</td>
        <td>${i.client_name || i.descripcion_extra || "-"}</td>
        <td>${i.sucursal_entrega || "-"}</td>
      </tr>`).join("")
    w.document.write(`<html><head><title>Reparto ${numeroActual}</title>
      <style>body{font-family:sans-serif;max-width:900px;margin:30px auto}h2{margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:8px;font-size:13px}th{background:#f5f5f5;text-align:left}</style></head><body>
      <h2>Reparto N° ${numeroActual || "-"}</h2>
      <p>Fecha: ${formatDateStr(selectedFecha)} — Destinos: ${visibles.length}</p>
      <table><thead><tr><th>Orden</th><th>Cliente</th><th>Sucursal Entrega</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
      <script>window.print()<\/script></body></html>`)
  }

  function exportXLSX() {
    const ws = XLSX.utils.json_to_sheet(visibles.map((i) => ({
      Orden: i.orden_reparto || "",
      "N° Pedido": i.order_id || "",
      Factura: i.factura_numero || "",
      Cliente: i.client_name || i.descripcion_extra || "",
      Zona: i.zona || "",
      Repartidor: i.repartidor || "",
      "Sucursal Entrega": i.sucursal_entrega || "",
      Estado: ESTADOS_ENTREGA.find((e) => e.value === i.estado_entrega)?.label || i.estado_entrega,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `Reparto ${numeroActual}`)
    XLSX.writeFile(wb, `reparto-${numeroActual || selectedFecha}.xlsx`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Logística</h1>
      </div>

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-sm font-medium mb-1 block">Fecha del reparto</label>
            <input type="date" value={selectedFecha}
              onChange={(e) => setSelectedFecha(e.target.value)}
              className="border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="text-sm">
            <div className="font-medium">N° de Reparto</div>
            <div className="text-xl font-bold font-mono">{numeroActual || "—"}</div>
          </div>
          <button onClick={handleAgregarDestinoExtra}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Nuevo destino en reparto
          </button>
          <button onClick={handlePrint} disabled={visibles.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-gray-600 text-white rounded-md text-sm hover:bg-gray-700 disabled:opacity-50">
            <Printer className="h-4 w-4" /> Imprimir
          </button>
          <button onClick={exportXLSX} disabled={visibles.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50">
            <Download className="h-4 w-4" /> Exportar
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 text-center py-6">Cargando...</p>
        ) : visibles.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-8">
            {currentRepartoId ? "Sin destinos activos en este reparto" : "Aún no se creó reparto para esta fecha"}
          </p>
        ) : (
          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Orden</TableHead>
                  <TableHead>N° Pedido</TableHead>
                  <TableHead>Factura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Zona</TableHead>
                  <TableHead>Repartidor</TableHead>
                  <TableHead>Sucursal Entrega</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-16"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibles.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <input type="number" value={i.orden_reparto || ""}
                        onChange={(e) => handleReorden(i.id, parseInt(e.target.value, 10) || 0)}
                        className="w-16 border rounded px-2 py-1 text-sm" />
                    </TableCell>
                    <TableCell className="text-xs font-mono">{i.order_id || (i.es_destino_extra ? "(extra)" : "-")}</TableCell>
                    <TableCell className="text-xs">{i.factura_numero || "-"}</TableCell>
                    <TableCell>{i.client_name || i.descripcion_extra || "-"}</TableCell>
                    <TableCell className="text-xs">{i.zona || "-"}</TableCell>
                    <TableCell>
                      <Select value={i.repartidor || ""} onValueChange={(v) => handleUpdateItem(i.id, "repartidor", v)}>
                        <SelectTrigger className="h-8 w-32"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {REPARTIDORES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <input value={i.sucursal_entrega || ""}
                        onChange={(e) => handleUpdateItem(i.id, "sucursal_entrega", e.target.value)}
                        className="w-full border rounded px-2 py-1 text-sm" />
                    </TableCell>
                    <TableCell>
                      <Select value={i.estado_entrega || "pendiente"} onValueChange={(v) => handleUpdateItem(i.id, "estado_entrega", v)}>
                        <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ESTADOS_ENTREGA.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <button onClick={() => handleEliminar(i.id)} className="text-red-600 hover:text-red-800" title="Eliminar">
                        <Trash2 className="h-4 w-4 inline" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <DialogNuevoDestino open={openNuevo} onClose={() => setOpenNuevo(false)}
        selectedFecha={selectedFecha}
        onSaved={async () => {
          setOpenNuevo(false)
          await loadRepartos()
          await loadItemsForFecha(selectedFecha)
        }} />
    </div>
  )
}

// ─── Dialog Nuevo Destino Extra ─────────────────────────────────────────────

function DialogNuevoDestino({ open, onClose, selectedFecha, onSaved }: {
  open: boolean
  onClose: () => void
  selectedFecha: string
  onSaved: () => void | Promise<void>
}) {
  const [descripcion, setDescripcion] = useState("")
  const [sucursal, setSucursal] = useState("")
  const [repartidor, setRepartidor] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleGuardar() {
    if (!descripcion.trim()) { alert("Ingresá una descripción"); return }
    setSaving(true)
    try {
      const repartoId = await ensureRepartoForFecha(selectedFecha)
      await createRepartoItem({
        reparto_id: repartoId,
        orden_reparto: null,
        es_destino_extra: true,
        descripcion_extra: descripcion,
        client_name: descripcion,
        sucursal_entrega: sucursal || null,
        repartidor: repartidor || null,
        estado_entrega: "pendiente",
      })
      setDescripcion(""); setSucursal(""); setRepartidor("")
      await onSaved()
    } catch (e: any) {
      alert("Error: " + (e.message || e))
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo destino en reparto</DialogTitle></DialogHeader>
        <p className="text-xs text-gray-500">
          Para retiros, gestiones u otros destinos sin pedido asociado — se agregará al reparto del {formatDateStr(selectedFecha)}.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Descripción *</label>
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="Ej: Retiro cheque Banco Galicia" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Sucursal / Dirección</label>
            <input value={sucursal} onChange={(e) => setSucursal(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Repartidor</label>
            <Select value={repartidor} onValueChange={setRepartidor}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {REPARTIDORES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-3 py-2 border rounded-md text-sm">Cancelar</button>
            <button onClick={handleGuardar} disabled={saving}
              className="px-3 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary/90 disabled:opacity-50">
              {saving ? "Guardando..." : "Agregar destino"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
