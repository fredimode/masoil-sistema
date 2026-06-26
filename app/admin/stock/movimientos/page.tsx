"use client"

import { useState, useEffect, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import { fetchMovimientosStock } from "@/lib/supabase/queries"
import { normalizeSearch, formatDateStr } from "@/lib/utils"
import { Search, Download, Printer, ArrowLeft } from "lucide-react"
import Link from "next/link"
import * as XLSX from "xlsx"

// Etiqueta legible + dirección sobre el DISPONIBLE (signo que ve el usuario).
const TIPOS: Record<string, { label: string; pos: boolean }> = {
  Compra: { label: "Compra", pos: true },
  Venta: { label: "Venta", pos: false },
  DevolucionCliente: { label: "Devolución cliente", pos: true },
  DevolucionProveedor: { label: "Devolución proveedor", pos: false },
  AjustePositivo: { label: "Ajuste positivo", pos: true },
  AjusteNegativo: { label: "Ajuste negativo", pos: false },
  Reserva: { label: "Reserva", pos: false },
  LiberaReserva: { label: "Libera reserva", pos: true },
}
function tipoInfo(tipo: string) {
  return TIPOS[tipo] || { label: tipo, pos: true }
}
function cantidadConSigno(m: any): string {
  const info = tipoInfo(m.tipo)
  const n = Math.abs(Number(m.cantidad) || 0)
  return `${info.pos ? "+" : "−"}${n}`
}

export default function MovimientosStockPage() {
  const [movs, setMovs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [tipoFiltro, setTipoFiltro] = useState("todos")
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetchMovimientosStock()
      .then(setMovs)
      .catch((e) => { console.error(e); setMovs([]) })
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let rows = movs
    if (tipoFiltro !== "todos") rows = rows.filter((m) => m.tipo === tipoFiltro)
    if (desde) rows = rows.filter((m) => (m.fecha || "") >= desde)
    if (hasta) rows = rows.filter((m) => (m.fecha || "") <= hasta + "T23:59:59")
    if (search) {
      const q = normalizeSearch(search)
      rows = rows.filter((m) =>
        normalizeSearch(m.producto_nombre || "").includes(q) ||
        normalizeSearch(m.producto_codigo || "").includes(q),
      )
    }
    return rows
  }, [movs, tipoFiltro, desde, hasta, search])

  const pag = usePagination(filtered, 50)
  const currentPage = Math.min(page, pag.totalPages)
  const pageData = pag.getPage(currentPage)

  const tiposPresentes = useMemo(() => [...new Set(movs.map((m) => m.tipo))], [movs])

  function exportXLSX() {
    const data = filtered.map((m) => ({
      Fecha: m.fecha ? formatDateStr(m.fecha) : "",
      Producto: m.producto_nombre || "",
      Codigo: m.producto_codigo || "",
      Cantidad: cantidadConSigno(m),
      Tipo: tipoInfo(m.tipo).label,
      Usuario: m.usuario_nombre || "",
      Observacion: m.observacion || "",
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos")
    XLSX.writeFile(wb, `movimientos_stock_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function exportPDF() {
    const w = window.open("", "_blank")
    if (!w) return
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const rows = filtered.map((m) => `
      <tr>
        <td>${m.fecha ? formatDateStr(m.fecha) : "-"}</td>
        <td>${esc(m.producto_nombre || "-")}</td>
        <td>${esc(m.producto_codigo || "-")}</td>
        <td style="text-align:right;font-weight:bold">${cantidadConSigno(m)}</td>
        <td>${esc(tipoInfo(m.tipo).label)}</td>
        <td>${esc(m.usuario_nombre || "-")}</td>
        <td>${esc(m.observacion || "-")}</td>
      </tr>`).join("")
    w.document.write(`<html><head><title>Historial de Movimientos de Stock</title>
      <style>body{font-family:sans-serif;max-width:1100px;margin:25px auto}h2{margin-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ddd;padding:5px 7px;font-size:11px}
      th{background:#f5f5f5;text-align:left}</style></head><body>
      <h2>Historial de Movimientos de Stock</h2>
      <p>${filtered.length} movimientos${desde || hasta ? ` — ${desde || "..."} a ${hasta || "..."}` : ""}</p>
      <table><thead><tr>
        <th>Fecha</th><th>Producto</th><th>Código</th><th style="text-align:right">Cantidad</th><th>Tipo</th><th>Usuario</th><th>Observación</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <script>window.print()<\/script></body></html>`)
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/admin/stock"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold mb-1">Historial de Movimientos</h1>
            <p className="text-muted-foreground">Control de inventario — todos los movimientos de stock</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportPDF} disabled={filtered.length === 0}>
            <Printer className="h-4 w-4 mr-2" /> PDF
          </Button>
          <Button variant="outline" onClick={exportXLSX} disabled={filtered.length === 0}>
            <Download className="h-4 w-4 mr-2" /> Excel
          </Button>
        </div>
      </div>

      <div className="flex gap-4 flex-wrap items-end">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por producto o código..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} className="pl-10" />
        </div>
        <Select value={tipoFiltro} onValueChange={(v) => { setTipoFiltro(v); setPage(1) }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los tipos</SelectItem>
            {tiposPresentes.map((t) => (<SelectItem key={t} value={t}>{tipoInfo(t).label}</SelectItem>))}
          </SelectContent>
        </Select>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Desde</label>
          <Input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPage(1) }} className="w-40" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Hasta</label>
          <Input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPage(1) }} className="w-40" />
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
      ) : pageData.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">No hay movimientos con los filtros actuales</div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr className="text-left text-gray-700">
                  <th className="px-3 py-2 font-semibold">Fecha</th>
                  <th className="px-3 py-2 font-semibold">Producto</th>
                  <th className="px-3 py-2 font-semibold">Código</th>
                  <th className="px-3 py-2 font-semibold text-right">Cantidad</th>
                  <th className="px-3 py-2 font-semibold">Tipo</th>
                  <th className="px-3 py-2 font-semibold">Usuario</th>
                  <th className="px-3 py-2 font-semibold">Observación</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((m, i) => {
                  const info = tipoInfo(m.tipo)
                  return (
                    <tr key={m.id || i} className="border-t hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{m.fecha ? formatDateStr(m.fecha) : "-"}</td>
                      <td className="px-3 py-2">{m.producto_nombre || "-"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{m.producto_codigo || "-"}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${info.pos ? "text-green-700" : "text-red-700"}`}>{cantidadConSigno(m)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${info.pos ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{info.label}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{m.usuario_nombre || "-"}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[260px] truncate" title={m.observacion || ""}>{m.observacion || "-"}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <TablePagination currentPage={currentPage} totalPages={pag.totalPages} totalItems={pag.totalItems} pageSize={pag.pageSize} onPageChange={setPage} />
        </Card>
      )}
    </div>
  )
}
