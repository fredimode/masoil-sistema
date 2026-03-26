"use client"

import { useState, useEffect } from "react"
import { OrderTable } from "@/components/admin/order-table"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchOrders } from "@/lib/supabase/queries"
import { normalizeSearch } from "@/lib/utils"
import type { Order } from "@/lib/types"
import { Search, Download, Plus } from "lucide-react"
import Link from "next/link"
import * as XLSX from "xlsx"

export default function AdminPedidosPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<string>("todos")
  const [zonaFilter, setZonaFilter] = useState<string>("todas")

  useEffect(() => {
    fetchOrders()
      .then(setOrders)
      .catch((err) => console.error("Error fetching orders:", err))
      .finally(() => setLoading(false))
  }, [])

  // Filter orders
  let filteredOrders = [...orders]

  if (statusFilter !== "todos") {
    if (statusFilter === "pendientes") {
      filteredOrders = filteredOrders.filter((o) => !["ENTREGADO", "CANCELADO"].includes(o.status))
    } else if (statusFilter === "urgentes") {
      filteredOrders = filteredOrders.filter((o) => o.isUrgent)
    } else {
      filteredOrders = filteredOrders.filter((o) => o.status === statusFilter)
    }
  }

  if (zonaFilter !== "todas") {
    filteredOrders = filteredOrders.filter((o) => o.zona === zonaFilter)
  }

  if (searchTerm) {
    const q = normalizeSearch(searchTerm)
    filteredOrders = filteredOrders.filter(
      (o) =>
        normalizeSearch(o.clientName).includes(q) ||
        normalizeSearch(o.orderNumber).includes(q) ||
        normalizeSearch(o.id).includes(q) ||
        normalizeSearch(o.vendedorName).includes(q),
    )
  }

  const { totalPages, totalItems, pageSize, getPage } = usePagination(filteredOrders, 50)
  const currentPage = Math.min(page, totalPages)
  const paginatedOrders = getPage(currentPage)

  if (loading) return <div className="p-8 flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Gestión de Pedidos</h1>
          <p className="text-muted-foreground">Administra todos los pedidos del sistema</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => {
            const data = filteredOrders.map((o) => ({
              ID: o.orderNumber,
              Cliente: o.clientName,
              Vendedor: o.vendedorName,
              Zona: o.zona,
              Estado: o.status,
              Total: o.total,
              Urgente: o.isUrgent ? "Sí" : "No",
              Fecha: o.createdAt.toLocaleDateString("es-AR"),
            }))
            const ws = XLSX.utils.json_to_sheet(data)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, "Pedidos")
            XLSX.writeFile(wb, `pedidos_${new Date().toISOString().slice(0, 10)}.xlsx`)
          }}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button asChild>
            <Link href="/admin/pedidos/nuevo">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Pedido
            </Link>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por cliente, pedido o vendedor..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1) }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="pendientes">Pendientes</SelectItem>
            <SelectItem value="urgentes">Urgentes</SelectItem>
            <SelectItem value="INGRESADO">Ingresado</SelectItem>
            <SelectItem value="PREPARADO">Preparado</SelectItem>
            <SelectItem value="FACTURADO">Facturado</SelectItem>
            <SelectItem value="ESPERANDO_MERCADERIA">Esperando Mercadería</SelectItem>
            <SelectItem value="ENTREGADO">Entregado</SelectItem>
            <SelectItem value="CANCELADO">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={zonaFilter} onValueChange={(v) => { setZonaFilter(v); setPage(1) }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Zona" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las zonas</SelectItem>
            <SelectItem value="Norte">Norte</SelectItem>
            <SelectItem value="Capital">Capital</SelectItem>
            <SelectItem value="Sur">Sur</SelectItem>
            <SelectItem value="Oeste">Oeste</SelectItem>
            <SelectItem value="GBA">GBA</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Orders Table */}
      {filteredOrders.length > 0 ? (
        <>
          <OrderTable orders={paginatedOrders} />
          <TablePagination currentPage={currentPage} totalPages={totalPages} totalItems={totalItems} pageSize={pageSize} onPageChange={setPage} />
        </>
      ) : (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          <p>No se encontraron pedidos</p>
        </div>
      )}
    </div>
  )
}
