"use client"

import { useState, useRef } from "react"
import { ProductTable } from "@/components/admin/product-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { products } from "@/lib/mock-data"
import { Search, Plus, Download, Upload } from "lucide-react"
import Link from "next/link"
import * as XLSX from "xlsx"

export default function AdminStockPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("todas")
  const [stockFilter, setStockFilter] = useState<string>("todos")
  const [csvPreview, setCsvPreview] = useState<Record<string, string>[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleExportXlsx() {
    const data = localProducts.map((p) => ({
      Código: p.code,
      Nombre: p.name,
      Categoría: p.category,
      Stock: p.stock,
      "Stock Bajo": p.lowStockThreshold,
      "Stock Crítico": p.criticalStockThreshold,
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

  // Calculate stats
  const totalProducts = localProducts.length
  const lowStock = localProducts.filter((p) => p.stock < p.lowStockThreshold && p.stock > 0).length
  const criticalStock = localProducts.filter((p) => p.stock < p.criticalStockThreshold && p.stock > 0).length
  const outOfStock = localProducts.filter((p) => p.stock === 0 && !p.isCustomizable).length

  // Filter products
  const [localProducts, setLocalProducts] = useState(products)

  function handleUpdateProduct(id: string, data: { price: number; stock: number }) {
    setLocalProducts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, price: data.price, stock: data.stock } : p))
    )
  }

  function handleDeleteProduct(id: string) {
    setLocalProducts((prev) => prev.filter((p) => p.id !== id))
  }

  let filteredProducts = [...localProducts]

  if (categoryFilter !== "todas") {
    filteredProducts = filteredProducts.filter((p) => p.category === categoryFilter)
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
    filteredProducts = filteredProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase()),
    )
  }

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
          <p className="text-sm text-muted-foreground mb-1">Stock Crítico</p>
          <p className="text-2xl font-bold text-red-700">{criticalStock}</p>
        </Card>
        <Card className="p-4 border-gray-200 bg-gray-50">
          <p className="text-sm text-muted-foreground mb-1">Agotados</p>
          <p className="text-2xl font-bold text-gray-700">{outOfStock}</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o código..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las categorías</SelectItem>
            <SelectItem value="Limpiadores">Limpiadores</SelectItem>
            <SelectItem value="Lubricantes">Lubricantes</SelectItem>
            <SelectItem value="Selladores">Selladores</SelectItem>
            <SelectItem value="Belleza">Belleza</SelectItem>
            <SelectItem value="Higiene">Higiene</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stockFilter} onValueChange={setStockFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Estado de Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="disponible">Disponible</SelectItem>
            <SelectItem value="bajo">Stock Bajo</SelectItem>
            <SelectItem value="critico">Stock Crítico</SelectItem>
            <SelectItem value="agotado">Agotado</SelectItem>
            <SelectItem value="customizable">Customizable</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Products Table */}
      {filteredProducts.length > 0 ? (
        <ProductTable products={filteredProducts} onUpdate={handleUpdateProduct} onDelete={handleDeleteProduct} />
      ) : (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          <p>No se encontraron productos</p>
        </div>
      )}

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
              alert("Importación de CSV pendiente de integración con Supabase")
              setCsvPreview(null)
            }}>Importar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
