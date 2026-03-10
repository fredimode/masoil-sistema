"use client"

import { useState } from "react"
import { ProductTable } from "@/components/admin/product-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card } from "@/components/ui/card"
import { products } from "@/lib/mock-data"
import { Search, Plus, Download, Upload } from "lucide-react"
import Link from "next/link"

export default function AdminStockPage() {
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("todas")
  const [stockFilter, setStockFilter] = useState<string>("todos")

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
          <Button variant="outline">
            <Upload className="h-4 w-4 mr-2" />
            Importar CSV
          </Button>
          <Button variant="outline">
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
    </div>
  )
}
