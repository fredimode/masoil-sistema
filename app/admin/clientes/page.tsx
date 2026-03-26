"use client"

import { useState, useEffect } from "react"
import { ClientTable } from "@/components/admin/client-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { fetchClients, fetchVendedores, deleteClientsBulk } from "@/lib/supabase/queries"
import { normalizeSearch } from "@/lib/utils"
import type { Client, Vendedor } from "@/lib/types"
import { Search, Plus, Download, Users, TrendingUp, Trash2 } from "lucide-react"
import Link from "next/link"
import * as XLSX from "xlsx"

export default function AdminClientesPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [zonaFilter, setZonaFilter] = useState<string>("todas")
  const [vendedorFilter, setVendedorFilter] = useState<string>("todos")
  const [clients, setClients] = useState<Client[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  // Bulk delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function loadData() {
    try {
      const [c, v] = await Promise.all([fetchClients(), fetchVendedores()])
      setClients(c)
      setVendedores(v)
    } catch (err) {
      console.error("Error loading data:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  if (loading) return <div className="p-8 flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>

  // Calculate stats
  const totalClients = clients.length
  const avgOrders = totalClients > 0 ? (clients.reduce((sum, c) => sum + c.totalOrders, 0) / totalClients).toFixed(1) : "0"
  // Filter clients
  let filteredClients = [...clients]

  if (zonaFilter !== "todas") {
    filteredClients = filteredClients.filter((c) => c.zona === zonaFilter)
  }

  if (vendedorFilter !== "todos") {
    filteredClients = filteredClients.filter((c) => c.vendedorId === vendedorFilter)
  }

  if (searchTerm) {
    const q = normalizeSearch(searchTerm)
    filteredClients = filteredClients.filter(
      (c) =>
        normalizeSearch(c.businessName).includes(q) ||
        normalizeSearch(c.contactName).includes(q) ||
        normalizeSearch(c.email).includes(q),
    )
  }

  // Pagination
  const { totalPages, totalItems, pageSize, getPage } = usePagination(filteredClients, 50)
  const currentPage = Math.min(page, totalPages)
  const paginatedClients = getPage(currentPage)

  // Selection helpers
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    const pageIds = paginatedClients.map((c) => c.id)
    const allSelected = pageIds.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        pageIds.forEach((id) => next.delete(id))
      } else {
        pageIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const allPageSelected = paginatedClients.length > 0 && paginatedClients.every((c) => selectedIds.has(c.id))

  async function handleBulkDelete() {
    setDeleting(true)
    try {
      await deleteClientsBulk(Array.from(selectedIds))
      setSelectedIds(new Set())
      setShowDeleteDialog(false)
      setLoading(true)
      await loadData()
    } catch (err) {
      console.error("Error eliminando clientes:", err)
      alert("Error al eliminar: " + (err instanceof Error ? err.message : "Error desconocido"))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Gestion de Clientes</h1>
          <p className="text-muted-foreground">Administra la base de datos de clientes</p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar ({selectedIds.size})
            </Button>
          )}
          <Button variant="outline" onClick={() => {
            const data = filteredClients.map((c) => ({
              "Razon Social": c.businessName,
              Contacto: c.contactName,
              WhatsApp: c.whatsapp,
              Email: c.email,
              Zona: c.zona,
              "Total Pedidos": c.totalOrders,
              "Limite Credito": c.creditLimit,
              Direccion: c.address,
            }))
            const ws = XLSX.utils.json_to_sheet(data)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, "Clientes")
            XLSX.writeFile(wb, `clientes_${new Date().toISOString().slice(0, 10)}.xlsx`)
          }}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button asChild>
            <Link href="/admin/clientes/nuevo">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Cliente
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Clientes</p>
              <p className="text-3xl font-bold">{totalClients}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Promedio Pedidos</p>
              <p className="text-3xl font-bold">{avgOrders}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por razon social, contacto o email..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
            className="pl-10"
          />
        </div>
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
        <Select value={vendedorFilter} onValueChange={(v) => { setVendedorFilter(v); setPage(1) }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Vendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los vendedores</SelectItem>
            {vendedores
              .filter((v) => v.role !== "admin")
              .map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* Selection info bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
          <span className="text-sm font-medium text-red-800">
            {selectedIds.size} cliente{selectedIds.size !== 1 ? "s" : ""} seleccionado{selectedIds.size !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-red-600 hover:underline ml-auto"
          >
            Deseleccionar todos
          </button>
        </div>
      )}

      {/* Clients Table */}
      {paginatedClients.length > 0 ? (
        <>
          <ClientTable
            clients={paginatedClients}
            allClients={clients}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            allSelected={allPageSelected}
          />
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </>
      ) : (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          <p>No se encontraron clientes</p>
        </div>
      )}

      {/* Bulk Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar eliminacion masiva</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Esta seguro que desea eliminar <strong className="text-red-600">{selectedIds.size} cliente{selectedIds.size !== 1 ? "s" : ""}</strong>?
            Esta accion no se puede deshacer.
          </p>
          <DialogFooter>
            <button onClick={() => setShowDeleteDialog(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">
              Cancelar
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={deleting}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-red-400 text-sm"
            >
              {deleting ? "Eliminando..." : `Eliminar ${selectedIds.size}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
