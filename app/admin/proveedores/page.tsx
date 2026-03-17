"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import { fetchProveedores, updateProveedor, deleteProveedor } from "@/lib/supabase/queries"
import { normalizeSearch, formatCurrency } from "@/lib/utils"
import { Search, Plus, Download, Users, Building2, CreditCard, Eye, Pencil, Trash2 } from "lucide-react"
import Link from "next/link"
import * as XLSX from "xlsx"

export default function AdminProveedoresPage() {
  const [proveedores, setProveedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [empresaFilter, setEmpresaFilter] = useState<string>("todos")
  const [page, setPage] = useState(1)

  // Action dialogs
  const [editingItem, setEditingItem] = useState<any | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [deletingItem, setDeletingItem] = useState<any | null>(null)

  async function loadData() {
    try {
      const data = await fetchProveedores()
      setProveedores(data)
    } catch (err) {
      console.error("Error loading proveedores:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  // Stats
  const totalProveedores = proveedores.length
  const countByEmpresa = (empresa: string) =>
    proveedores.filter((p) => p.empresa === empresa).length
  const conCbu = proveedores.filter((p) => !!p.cbu).length

  // Filter
  let filtered = [...proveedores]

  if (empresaFilter !== "todos") {
    filtered = filtered.filter((p) => p.empresa === empresaFilter)
  }

  if (searchTerm) {
    const term = normalizeSearch(searchTerm)
    filtered = filtered.filter(
      (p) =>
        normalizeSearch(p.nombre || "").includes(term) ||
        normalizeSearch(p.cuit || "").includes(term)
    )
  }

  // Pagination
  const { totalPages, totalItems, pageSize, getPage } = usePagination(filtered, 50)
  const currentPage = Math.min(page, totalPages)
  const paginatedProveedores = getPage(currentPage)

  const handleExport = () => {
    const data = filtered.map((p) => ({
      Nombre: p.nombre,
      CUIT: p.cuit || "",
      Empresa: p.empresa || "",
      "Condicion de Pago": p.condicion_pago || "",
      Telefono: p.telefono || "",
      Email: p.email || "",
      Categoria: p.categoria || "",
      Saldo: p.saldo || 0,
      "Condicion IVA": p.condicion_iva || "",
      Observaciones: p.observaciones || "",
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Proveedores")
    XLSX.writeFile(wb, `proveedores_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  async function handleEdit() {
    if (!editingItem) return
    try {
      await updateProveedor(editingItem.id, editForm)
      setEditingItem(null)
      setLoading(true)
      await loadData()
    } catch (err) {
      console.error("Error actualizando proveedor:", err)
    }
  }

  async function handleDelete() {
    if (!deletingItem) return
    try {
      await deleteProveedor(deletingItem.id)
      setDeletingItem(null)
      setLoading(true)
      await loadData()
    } catch (err) {
      console.error("Error eliminando proveedor:", err)
    }
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Proveedores</h1>
          <p className="text-muted-foreground">Gestion de proveedores del sistema</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button asChild>
            <Link href="/admin/proveedores/nuevo">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Proveedor
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Proveedores</p>
              <p className="text-3xl font-bold">{totalProveedores}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Masoil</p>
              <p className="text-3xl font-bold">{countByEmpresa("Masoil")}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Aquiles / Conancap</p>
              <p className="text-3xl font-bold">
                {countByEmpresa("Aquiles")} / {countByEmpresa("Conancap")}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Con CBU cargado</p>
              <p className="text-3xl font-bold">{conCbu}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o CUIT..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
            className="pl-10"
          />
        </div>
        <Select value={empresaFilter} onValueChange={(v) => { setEmpresaFilter(v); setPage(1) }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las empresas</SelectItem>
            <SelectItem value="Masoil">Masoil</SelectItem>
            <SelectItem value="Aquiles">Aquiles</SelectItem>
            <SelectItem value="Conancap">Conancap</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {paginatedProveedores.length > 0 ? (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>CUIT</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead className="w-[150px]">Condicion de pago</TableHead>
                    <TableHead>Telefono</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Cond. IVA</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedProveedores.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nombre}</TableCell>
                      <TableCell>{p.cuit || "-"}</TableCell>
                      <TableCell>
                        {p.empresa ? (
                          <Badge variant="outline">{p.empresa}</Badge>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate" title={p.condicion_pago || ""}>
                        {p.condicion_pago || "-"}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate" title={p.telefono || ""}>
                        {p.telefono || "-"}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate" title={p.email || ""}>
                        {p.email || "-"}
                      </TableCell>
                      <TableCell className="max-w-[100px] truncate" title={p.categoria || ""}>
                        {p.categoria || "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {p.saldo != null ? formatCurrency(p.saldo) : "-"}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate text-sm" title={p.condicion_iva || ""}>
                        {p.condicion_iva || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button asChild size="sm" variant="ghost" className="h-8 w-8 p-0">
                            <Link href={`/admin/proveedores/${p.id}`} title="Ver">
                              <Eye className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            title="Editar"
                            onClick={() => {
                              setEditingItem(p)
                              setEditForm({
                                nombre: p.nombre || "",
                                cuit: p.cuit || "",
                                empresa: p.empresa || "",
                                condicion_pago: p.condicion_pago || "",
                                cbu: p.cbu || "",
                                contactos: p.contactos || "",
                                observaciones: p.observaciones || "",
                              })
                            }}
                          >
                            <Pencil className="h-4 w-4 text-blue-600" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            title="Eliminar"
                            onClick={() => setDeletingItem(p)}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
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
          <p>No se encontraron proveedores</p>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Proveedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-gray-600 block mb-1">Nombre</label>
              <input type="text" value={editForm.nombre || ""} onChange={(e) => setEditForm((f: any) => ({ ...f, nombre: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">CUIT</label>
              <input type="text" value={editForm.cuit || ""} onChange={(e) => setEditForm((f: any) => ({ ...f, cuit: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Empresa</label>
              <input type="text" value={editForm.empresa || ""} onChange={(e) => setEditForm((f: any) => ({ ...f, empresa: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Condicion de pago</label>
              <input type="text" value={editForm.condicion_pago || ""} onChange={(e) => setEditForm((f: any) => ({ ...f, condicion_pago: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">CBU</label>
              <input type="text" value={editForm.cbu || ""} onChange={(e) => setEditForm((f: any) => ({ ...f, cbu: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Contactos</label>
              <input type="text" value={editForm.contactos || ""} onChange={(e) => setEditForm((f: any) => ({ ...f, contactos: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Observaciones</label>
              <textarea value={editForm.observaciones || ""} onChange={(e) => setEditForm((f: any) => ({ ...f, observaciones: e.target.value }))} className="w-full p-2 border rounded-lg text-sm" rows={3} />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setEditingItem(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancelar</button>
            <button onClick={handleEdit} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm">Guardar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar eliminacion</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Esta seguro que desea eliminar el proveedor <strong>{deletingItem?.nombre}</strong>?
          </p>
          <DialogFooter>
            <button onClick={() => setDeletingItem(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm">Cancelar</button>
            <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">Eliminar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
