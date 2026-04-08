"use client"

import { useState, useRef, useEffect } from "react"
import { ProductTable } from "@/components/admin/product-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import { fetchProducts, fetchProductsCount, updateProduct, deleteProduct, deleteProducts } from "@/lib/supabase/queries"
import { normalizeSearch } from "@/lib/utils"
import type { Product } from "@/lib/types"
import { Search, Plus, Download, Upload, Trash2 } from "lucide-react"
import Link from "next/link"
import * as XLSX from "xlsx"

export default function AdminStockPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("todas")
  const [stockFilter, setStockFilter] = useState<string>("todos")
  const [grupoRubroFilter, setGrupoRubroFilter] = useState<string>("todos")
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[] | null>(null)
  const [localProducts, setLocalProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalProductsCount, setTotalProductsCount] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([fetchProducts(), fetchProductsCount()])
      .then(([products, count]) => {
        setLocalProducts(products)
        setTotalProductsCount(count)
      })
      .catch((err) => console.error("Error fetching products:", err))
      .finally(() => setLoading(false))
  }, [])

  async function handleUpdateProduct(id: string, data: { price: number; stock: number }) {
    try {
      await updateProduct(id, { price: data.price, stock: data.stock })
      const updated = await fetchProducts()
      setLocalProducts(updated)
    } catch (err) {
      console.error("Error updating product:", err)
    }
  }

  async function handleDeleteProduct(id: string) {
    try {
      await deleteProduct(id)
      const updated = await fetchProducts()
      setLocalProducts(updated)
      selectedIds.delete(id)
      setSelectedIds(new Set(selectedIds))
    } catch (err) {
      console.error("Error deleting product:", err)
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return
    setBulkDeleting(true)
    try {
      await deleteProducts(Array.from(selectedIds))
      const updated = await fetchProducts()
      setLocalProducts(updated)
      setSelectedIds(new Set())
      setShowBulkDeleteConfirm(false)
    } catch (err) {
      console.error("Error deleting products:", err)
    } finally {
      setBulkDeleting(false)
    }
  }

  function handleExportXlsx() {
    const data = localProducts.map((p) => ({
      Codigo: p.code,
      Nombre: p.name,
      Categoria: p.category,
      Stock: p.stock,
      "Stock Bajo": p.lowStockThreshold,
      "Stock Critico": p.criticalStockThreshold,
      Precio: p.price,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Inventario")
    XLSX.writeFile(wb, `inventario_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const lines = text.split("\n").filter((l) => l.trim())
      if (lines.length < 2) return
      const headers = lines[0].split(",").map((h) => h.trim())
      const rows = lines.slice(1).map((line) => {
        const vals = line.split(",").map((v) => v.trim())
        const row: Record<string, string> = {}
        headers.forEach((h, i) => { row[h] = vals[i] || "" })
        return row
      })
      setCsvPreview(rows.slice(0, 10))
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  if (loading) return <div className="p-8 flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>

  // Calculate stats
  const totalProducts = totalProductsCount || localProducts.length
  const lowStock = localProducts.filter((p) => p.stock < p.lowStockThreshold && p.stock > 0).length
  const criticalStock = localProducts.filter((p) => p.stock < p.criticalStockThreshold && p.stock > 0).length
  const outOfStock = localProducts.filter((p) => p.stock === 0 && !p.isCustomizable).length

  // Compute unique categories and grupo_rubro values
  const uniqueCategories = [...new Set(localProducts.map((p) => p.category).filter(Boolean))].sort() as string[]
  const uniqueGrupoRubro = [...new Set(localProducts.map((p) => p.grupoRubro).filter(Boolean))].sort() as string[]

  // Filter products
  let filteredProducts = [...localProducts]

  if (categoryFilter !== "todas") {
    if (categoryFilter === "sin_categoria") {
      filteredProducts = filteredProducts.filter((p) => p.category === null || p.category === undefined)
    } else {
      filteredProducts = filteredProducts.filter((p) => p.category === categoryFilter)
    }
  }

  if (grupoRubroFilter !== "todos") {
    filteredProducts = filteredProducts.filter((p) => p.grupoRubro === grupoRubroFilter)
  }

  if (stockFilter !== "todos") {
    if (stockFilter === "disponible") {
      filteredProducts = filteredProducts.filter((p) => p.stock >= p.lowStockThreshold)
    } else if (stockFilter === "bajo") {
      filteredProducts = filteredProducts.filter(
        (p) => p.stock < p.lowStockThreshold && p.stock >= p.criticalStockThreshold,
      )
    } else if (stockFilter === "critico") {
      filteredProducts = filteredProducts.filter((p) => p.stock < p.criticalStockThreshold && p.stock > 0)
    } else if (stockFilter === "agotado") {
      filteredProducts = filteredProducts.filter((p) => p.stock === 0 && !p.isCustomizable)
    } else if (stockFilter === "customizable") {
      filteredProducts = filteredProducts.filter((p) => p.isCustomizable)
    }
  }

  if (searchTerm) {
    const q = normalizeSearch(searchTerm)
    filteredProducts = filteredProducts.filter(
      (p) =>
        normalizeSearch(p.name).includes(q) ||
        normalizeSearch(p.code).includes(q),
    )
  }

  // Pagination
  const { totalPages, totalItems, pageSize, getPage } = usePagination(filteredProducts, 50)
  const currentPage = Math.min(page, totalPages)
  const paginatedProducts = getPage(currentPage)

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Control de Inventario</h1>
          <p className="text-muted-foreground">Gestiona el stock de todos los productos</p>
        </div>
        <div className="flex gap-2">
          <input type="file" accept=".csv" ref={fileInputRef} onChange={handleCsvFile} className="hidden" />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            Importar CSV
          </Button>
          <Button variant="outline" onClick={handleExportXlsx}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button asChild>
            <Link href="/admin/stock/nuevo">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Producto
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Total Productos</p>
          <p className="text-2xl font-bold">{totalProducts}</p>
        </Card>
        <Card className="p-4 border-yellow-200 bg-yellow-50">
          <p className="text-sm text-muted-foreground mb-1">Stock Bajo</p>
          <p className="text-2xl font-bold text-yellow-700">{lowStock}</p>
        </Card>
        <Card className="p-4 border-red-200 bg-red-50">
          <p className="text-sm text-muted-foreground mb-1">Stock Critico</p>
          <p className="text-2xl font-bold text-red-700">{criticalStock}</p>
        </Card>
        <Card className="p-4 border-gray-200 bg-gray-50">
          <p className="text-sm text-muted-foreground mb-1">Agotados</p>
          <p className="text-2xl font-bold text-gray-700">{outOfStock}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o codigo..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1) }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las categorias</SelectItem>
            <SelectItem value="sin_categoria">(Sin categoria)</SelectItem>
            {uniqueCategories.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={grupoRubroFilter} onValueChange={(v) => { setGrupoRubroFilter(v); setPage(1) }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Grupo/Rubro" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los rubros</SelectItem>
            {uniqueGrupoRubro.map((gr) => (
              <SelectItem key={gr} value={gr}>{gr}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={stockFilter} onValueChange={(v) => { setStockFilter(v); setPage(1) }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Estado de Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="disponible">Disponible</SelectItem>
            <SelectItem value="bajo">Stock Bajo</SelectItem>
            <SelectItem value="critico">Stock Critico</SelectItem>
            <SelectItem value="agotado">Agotado</SelectItem>
            <SelectItem value="customizable">Customizable</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm font-medium">
            {selectedIds.size} producto{selectedIds.size !== 1 ? "s" : ""} seleccionado{selectedIds.size !== 1 ? "s" : ""}
          </span>
          <Button variant="destructive" size="sm" onClick={() => setShowBulkDeleteConfirm(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            Eliminar seleccionados
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            Deseleccionar todo
          </Button>
        </div>
      )}

      {/* Products Table */}
      {paginatedProducts.length > 0 ? (
        <>
          <ProductTable
            products={paginatedProducts}
            onUpdate={handleUpdateProduct}
            onDelete={handleDeleteProduct}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
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
          <p>No se encontraron productos</p>
        </div>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar productos</DialogTitle>
            <DialogDescription>
              Estas seguro de eliminar <strong>{selectedIds.size}</strong> producto{selectedIds.size !== 1 ? "s" : ""}? Esta accion no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBulkDeleteConfirm(false)} disabled={bulkDeleting}>Cancelar</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? "Eliminando..." : `Eliminar ${selectedIds.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV Preview Dialog */}
      <Dialog open={!!csvPreview} onOpenChange={(open) => !open && setCsvPreview(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Preview CSV Importado</DialogTitle>
            <DialogDescription>Se muestran las primeras 10 filas del archivo</DialogDescription>
          </DialogHeader>
          {csvPreview && csvPreview.length > 0 && (
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-sm border">
                <thead className="bg-gray-100">
                  <tr>
                    {Object.keys(csvPreview[0]).map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-medium border-b">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      {Object.values(row).map((v, j) => (
                        <td key={j} className="px-3 py-2 border-b">{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvPreview(null)}>Cerrar</Button>
            <Button onClick={() => {
              alert("Importacion de CSV pendiente de integracion con Supabase")
              setCsvPreview(null)
            }}>Importar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
