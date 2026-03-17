"use client"

import { useState, useEffect } from "react"
import { ClientTable } from "@/components/admin/client-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import { fetchClients, fetchVendedores } from "@/lib/supabase/queries"
import { normalizeSearch } from "@/lib/utils"
import type { Client, Vendedor } from "@/lib/types"
import { Search, Plus, Download, Users, TrendingUp } from "lucide-react"
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

  useEffect(() => {
    async function load() {
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
    load()
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

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Gestion de Clientes</h1>
          <p className="text-muted-foreground">Administra la base de datos de clientes</p>
        </div>
        <div className="flex gap-2">
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
              .filter((v) => v.role === "vendedor")
              .map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {/* Clients Table */}
      {paginatedClients.length > 0 ? (
        <>
          <ClientTable clients={paginatedClients} />
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
    </div>
  )
}
