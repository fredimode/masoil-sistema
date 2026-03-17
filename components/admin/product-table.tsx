"use client"
import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { StockIndicator } from "@/components/vendedor/stock-indicator"
import { formatCurrency, cn } from "@/lib/utils"
import type { Product } from "@/lib/types"
import { Edit, Trash2 } from "lucide-react"

interface ProductTableProps {
  products: Product[]
  onUpdate?: (id: string, data: { price: number; stock: number }) => void
  onDelete?: (id: string) => void
}

export function ProductTable({ products, onUpdate, onDelete }: ProductTableProps) {
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null)
  const [editPrice, setEditPrice] = useState("")
  const [editStock, setEditStock] = useState("")

  function openEdit(product: Product) {
    setEditProduct(product)
    setEditPrice(String(product.price))
    setEditStock(String(product.stock))
  }

  function handleSaveEdit() {
    if (!editProduct) return
    onUpdate?.(editProduct.id, {
      price: parseFloat(editPrice) || editProduct.price,
      stock: parseInt(editStock) || editProduct.stock,
    })
    setEditProduct(null)
  }

  function handleConfirmDelete() {
    if (!deleteProduct) return
    onDelete?.(deleteProduct.id)
    setDeleteProduct(null)
  }

  return (
    <>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
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
                  )}
                >
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
                      <Button size="sm" variant="ghost" onClick={() => openEdit(product)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteProduct(product)}>
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

      {/* Edit Dialog */}
      <Dialog open={!!editProduct} onOpenChange={(open) => !open && setEditProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Producto</DialogTitle>
            <DialogDescription>{editProduct?.name} ({editProduct?.code})</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Precio</label>
              <input
                type="number"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                step="0.01"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Stock</label>
              <input
                type="number"
                value={editStock}
                onChange={(e) => setEditStock(e.target.value)}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                step="1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProduct(null)}>Cancelar</Button>
            <Button onClick={handleSaveEdit}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteProduct} onOpenChange={(open) => !open && setDeleteProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar Producto</DialogTitle>
            <DialogDescription>
              Estas seguro de eliminar <strong>{deleteProduct?.name}</strong> ({deleteProduct?.code})?
              Esta accion no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProduct(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
