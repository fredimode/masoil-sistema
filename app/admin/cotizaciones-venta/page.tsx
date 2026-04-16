"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import { Plus, Search, Eye, Printer, Send } from "lucide-react"
import { fetchCotizacionesVenta, fetchVendedores, esVendedorComercial } from "@/lib/supabase/queries"
import { formatCurrency, formatDateStr, normalizeSearch } from "@/lib/utils"

const ESTADO_BADGES: Record<string, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  aprobada: { label: "Aprobada", cls: "bg-green-100 text-green-800 border-green-200" },
  parcialmente_aprobada: { label: "Aprobada parcial", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  no_aprobada: { label: "No aprobada", cls: "bg-red-100 text-red-800 border-red-200" },
  convertida_pedido: { label: "Convertida a pedido", cls: "bg-indigo-100 text-indigo-800 border-indigo-200" },
}

export default function CotizacionesVentaPage() {
  const [loading, setLoading] = useState(true)
  const [cotizaciones, setCotizaciones] = useState<any[]>([])
  const [vendedores, setVendedores] = useState<any[]>([])
  const [busqueda, setBusqueda] = useState("")
  const [estado, setEstado] = useState("todos")
  const [vendedorFilter, setVendedorFilter] = useState("todos")
  const [page, setPage] = useState(1)

  useEffect(() => {
    Promise.all([fetchCotizacionesVenta(), fetchVendedores()])
      .then(([c, v]) => {
        setCotizaciones(c)
        setVendedores(v.filter((x: any) => esVendedorComercial(x)))
      })
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    let rows = cotizaciones
    if (estado !== "todos") rows = rows.filter((c) => c.estado === estado)
    if (vendedorFilter !== "todos") rows = rows.filter((c) => c.vendedor_iniciales === vendedorFilter)
    if (busqueda) {
      const q = normalizeSearch(busqueda)
      rows = rows.filter((c) =>
        normalizeSearch(c.numero || "").includes(q) ||
        normalizeSearch(c.client_name || "").includes(q) ||
        normalizeSearch(c.vendedor_nombre || "").includes(q),
      )
    }
    return rows
  }, [cotizaciones, estado, vendedorFilter, busqueda])

  const { totalPages, totalItems, pageSize, getPage } = usePagination(filtered, 50)
  const currentPage = Math.min(page, totalPages)
  const paginated = getPage(currentPage)

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Cotizaciones de Venta</h1>
          <p className="text-muted-foreground">Gestión de cotizaciones enviadas a clientes</p>
        </div>
        <Button asChild>
          <Link href="/admin/cotizaciones-venta/nueva">
            <Plus className="h-4 w-4 mr-2" />
            Nueva Cotización
          </Link>
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, nro o vendedor..."
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setPage(1)
              }}
              className="pl-10"
            />
          </div>
          <Select value={estado} onValueChange={(v) => { setEstado(v); setPage(1) }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="pendiente">Pendientes</SelectItem>
              <SelectItem value="aprobada">Aprobadas</SelectItem>
              <SelectItem value="parcialmente_aprobada">Parcialmente aprobadas</SelectItem>
              <SelectItem value="no_aprobada">No aprobadas</SelectItem>
              <SelectItem value="convertida_pedido">Convertidas a pedido</SelectItem>
            </SelectContent>
          </Select>
          <Select value={vendedorFilter} onValueChange={(v) => { setVendedorFilter(v); setPage(1) }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los vendedores</SelectItem>
              {vendedores.map((v) => (
                <SelectItem key={v.id} value={v.iniciales || v.id}>
                  {v.name}{v.iniciales ? ` (${v.iniciales})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No hay cotizaciones</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr className="text-left">
                  <th className="px-3 py-3 font-medium">Fecha</th>
                  <th className="px-3 py-3 font-medium">Nro Cotización</th>
                  <th className="px-3 py-3 font-medium">Cliente</th>
                  <th className="px-3 py-3 font-medium">Vendedor</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-3 py-3 text-center font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((c, i) => {
                  const est = ESTADO_BADGES[c.estado] || { label: c.estado, cls: "bg-gray-100 text-gray-700" }
                  return (
                    <tr key={c.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-3 py-2">{formatDateStr(c.fecha || c.created_at)}</td>
                      <td className="px-3 py-2 font-mono font-medium text-blue-600">
                        <Link href={`/admin/cotizaciones-venta/${c.id}`} className="hover:underline">
                          {c.numero}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{c.client_name || "-"}</td>
                      <td className="px-3 py-2">
                        {c.vendedor_nombre || "-"}
                        {c.vendedor_iniciales && (
                          <span className="ml-1 text-xs text-muted-foreground">({c.vendedor_iniciales})</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={est.cls}>{est.label}</Badge>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(Number(c.total) || 0)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <Link href={`/admin/cotizaciones-venta/${c.id}`} className="p-1 hover:bg-gray-200 rounded" title="Ver">
                            <Eye className="h-4 w-4 text-gray-600" />
                          </Link>
                          <Link href={`/admin/cotizaciones-venta/${c.id}?print=1`} className="p-1 hover:bg-gray-200 rounded" title="Imprimir">
                            <Printer className="h-4 w-4 text-gray-600" />
                          </Link>
                          <Link href={`/admin/cotizaciones-venta/${c.id}?resend=1`} className="p-1 hover:bg-gray-200 rounded" title="Reenviar">
                            <Send className="h-4 w-4 text-gray-600" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <TablePagination currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} />
      </Card>
    </div>
  )
}
