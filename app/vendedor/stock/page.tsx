"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { StockIndicator } from "@/components/vendedor/stock-indicator"
import { Skeleton } from "@/components/ui/skeleton"
import { fetchProducts } from "@/lib/supabase/queries"
import type { Product } from "@/lib/types"
import { Search } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

export default function VendedorStockPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState<string>("todos")

  useEffect(() => {
    fetchProducts()
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false))
  }, [])

  if (loadingProducts) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-primary text-primary-foreground p-4">
          <Skeleton className="h-7 w-48 mb-4 bg-primary-foreground/20" />
          <Skeleton className="h-10 w-full bg-primary-foreground/20" />
        </div>
        <div className="p-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  // Filter products
  let filteredProducts = [...products]

  if (categoryFilter !== "todos") {
    filteredProducts = filteredProducts.filter((p) => p.category === categoryFilter)
  }

  if (searchTerm) {
    filteredProducts = filteredProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase()),
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 sticky top-0 z-10">
        <h1 className="text-xl font-bold mb-4">Consulta de Stock</h1>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar producto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/60"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 border-b bg-card sticky top-[136px] z-10">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las categorías</SelectItem>
            <SelectItem value="Limpiadores">Limpiadores</SelectItem>
            <SelectItem value="Lubricantes">Lubricantes</SelectItem>
            <SelectItem value="Selladores">Selladores</SelectItem>
            <SelectItem value="Belleza">Belleza</SelectItem>
            <SelectItem value="Higiene">Higiene</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Products List */}
      <div className="p-4 space-y-3">
        {filteredProducts.length > 0 ? (
          filteredProducts.map((product) => (
            <Card key={product.id} className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-base">{product.name}</h3>
                  <p className="text-sm text-muted-foreground font-mono">{product.code}</p>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg">{formatCurrency(product.price)}</div>
                  <div className="text-xs text-muted-foreground">{product.category}</div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <StockIndicator product={product} showCount={true} />
                {!product.isCustomizable && product.stock > 0 && (
                  <div className="text-sm font-medium text-muted-foreground">{product.stock} unidades</div>
                )}
              </div>
            </Card>
          ))
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>No se encontraron productos</p>
          </div>
        )}
      </div>
    </div>
  )
}
