"use client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { StockIndicator } from "@/components/vendedor/stock-indicator"
import { formatCurrency, cn } from "@/lib/utils"
import type { Product } from "@/lib/types"
import { Edit, Trash2 } from "lucide-react"

interface ProductTableProps {
  products: Product[]
  onEdit?: (product: Product) => void
  onDelete?: (product: Product) => void
  selectedIds?: Set<string>
  onSelectionChange?: (ids: Set<string>) => void
}

export function ProductTable({ products, onEdit, onDelete, selectedIds, onSelectionChange }: ProductTableProps) {
  const allSelected = products.length > 0 && selectedIds != null && products.every((p) => selectedIds.has(p.id))
  const someSelected = selectedIds != null && products.some((p) => selectedIds.has(p.id)) && !allSelected

  function toggleAll() {
    if (!onSelectionChange) return
    if (allSelected) {
      const next = new Set(selectedIds)
      products.forEach((p) => next.delete(p.id))
      onSelectionChange(next)
    } else {
      const next = new Set(selectedIds)
      products.forEach((p) => next.add(p.id))
      onSelectionChange(next)
    }
  }

  function toggleOne(id: string) {
    if (!onSelectionChange || !selectedIds) return
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {onSelectionChange && (
              <TableHead className="w-12">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Seleccionar todos"
                />
              </TableHead>
            )}
            <TableHead className="w-32">Codigo</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead className="text-right">Costo Neto</TableHead>
            <TableHead>Grupo/Rubro</TableHead>
            <TableHead>Ubicacion</TableHead>
            <TableHead className="w-32">Stock</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-32 text-right">Precio</TableHead>
            <TableHead className="w-24 text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => {
            const isCritical = product.stock < product.criticalStockThreshold && product.stock > 0
            const isLow = product.stock < product.lowStockThreshold && product.stock >= product.criticalStockThreshold
            const isOutOfStock = product.stock === 0 && !product.isCustomizable

            return (
              <TableRow
                key={product.id}
                className={cn(
                  isCritical && "bg-red-50",
                  isLow && "bg-yellow-50",
                  isOutOfStock && "bg-gray-50 opacity-60",
                  selectedIds?.has(product.id) && "bg-blue-50",
                )}
              >
                {onSelectionChange && (
                  <TableCell>
                    <Checkbox
                      checked={selectedIds?.has(product.id) ?? false}
                      onCheckedChange={() => toggleOne(product.id)}
                      aria-label={`Seleccionar ${product.name}`}
                    />
                  </TableCell>
                )}
                <TableCell className="font-mono text-sm font-medium">{product.code}</TableCell>
                <TableCell className="font-medium">{product.name}</TableCell>
                <TableCell>
                  {product.category ? (
                    <Badge variant="outline" className="text-xs">
                      {product.category}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin cat.</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {product.costoNeto != null ? formatCurrency(product.costoNeto) : "-"}
                </TableCell>
                <TableCell className="max-w-[120px] truncate" title={product.grupoRubro || ""}>
                  {product.grupoRubro || "-"}
                </TableCell>
                <TableCell className="max-w-[100px] truncate" title={product.ubicacion || ""}>
                  {product.ubicacion || "-"}
                </TableCell>
                <TableCell className="font-semibold text-lg">{product.stock}</TableCell>
                <TableCell>
                  <StockIndicator product={product} showCount={false} />
                </TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(product.price)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => onEdit?.(product)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete?.(product)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
