"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { products } from "@/lib/mock-data"
import { formatCurrency } from "@/lib/utils"
import { AlertTriangle, Package, ShoppingCart } from "lucide-react"

export default function AdminStockAlertsPage() {
  const [orderDialog, setOrderDialog] = useState<{ name: string; code: string; stock: number } | null>(null)
  // Categorize alerts
  const criticalProducts = products.filter((p) => p.stock < p.criticalStockThreshold && p.stock > 0)
  const lowProducts = products.filter((p) => p.stock < p.lowStockThreshold && p.stock >= p.criticalStockThreshold)
  const outOfStockProducts = products.filter((p) => p.stock === 0 && !p.isCustomizable)

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">Alertas de Stock</h1>
        <p className="text-muted-foreground">Productos que requieren atención inmediata</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 border-red-200 bg-red-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Stock Crítico</p>
              <p className="text-3xl font-bold text-red-700">{criticalProducts.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6 border-yellow-200 bg-yellow-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
              <Package className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Stock Bajo</p>
              <p className="text-3xl font-bold text-yellow-700">{lowProducts.length}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6 border-gray-200 bg-gray-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
              <ShoppingCart className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Agotados</p>
              <p className="text-3xl font-bold text-gray-700">{outOfStockProducts.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Critical Stock Alerts */}
      {criticalProducts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h2 className="text-xl font-bold text-red-700">Stock Crítico - Acción Inmediata Requerida</h2>
          </div>
          <Alert className="border-red-200 bg-red-50">
            <AlertDescription className="text-red-800">
              Los siguientes productos tienen menos de {criticalProducts[0]?.criticalStockThreshold} unidades. Se
              recomienda ordenar urgentemente.
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {criticalProducts.map((product) => (
              <Card key={product.id} className="p-4 border-red-200 bg-red-50">
                <div className="space-y-3">
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm">{product.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{product.code}</p>
                      </div>
                      <Badge variant="destructive" className="text-xs">
                        CRÍTICO
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Stock actual:</span>
                      <span className="text-2xl font-bold text-red-700">{product.stock}</span>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Umbral crítico:</span>
                      <span>{product.criticalStockThreshold}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Precio:</span>
                      <span className="font-semibold">{formatCurrency(product.price)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Categoría:</span>
                      <span>{product.category}</span>
                    </div>
                  </div>
                  <Button size="sm" variant="destructive" className="w-full" onClick={() => setOrderDialog({ name: product.name, code: product.code, stock: product.stock })}>
                    Ordenar Ahora
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Low Stock Alerts */}
      {lowProducts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-yellow-600" />
            <h2 className="text-xl font-bold text-yellow-700">Stock Bajo - Planificar Reposición</h2>
          </div>
          <Alert className="border-yellow-200 bg-yellow-50">
            <AlertDescription className="text-yellow-800">
              Los siguientes productos tienen menos de {lowProducts[0]?.lowStockThreshold} unidades. Considere ordenar
              pronto.
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {lowProducts.map((product) => (
              <Card key={product.id} className="p-4 border-yellow-200 bg-yellow-50">
                <div className="space-y-3">
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm">{product.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{product.code}</p>
                      </div>
                      <Badge variant="outline" className="text-xs bg-yellow-100 text-yellow-700 border-yellow-300">
                        BAJO
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Stock actual:</span>
                      <span className="text-2xl font-bold text-yellow-700">{product.stock}</span>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Umbral bajo:</span>
                      <span>{product.lowStockThreshold}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Precio:</span>
                      <span className="font-semibold">{formatCurrency(product.price)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Categoría:</span>
                      <span>{product.category}</span>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="w-full bg-transparent" onClick={() => setOrderDialog({ name: product.name, code: product.code, stock: product.stock })}>
                    Planificar Pedido
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Out of Stock */}
      {outOfStockProducts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-gray-600" />
            <h2 className="text-xl font-bold text-gray-700">Productos Agotados</h2>
          </div>
          <Alert className="border-gray-200 bg-gray-50">
            <AlertDescription className="text-gray-800">
              Los siguientes productos están completamente agotados y no disponibles para venta.
            </AlertDescription>
          </Alert>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {outOfStockProducts.map((product) => (
              <Card key={product.id} className="p-4 border-gray-200 bg-gray-50">
                <div className="space-y-3">
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm">{product.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{product.code}</p>
                      </div>
                      <Badge variant="outline" className="text-xs bg-gray-100 text-gray-700 border-gray-300">
                        AGOTADO
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Stock actual:</span>
                      <span className="text-2xl font-bold text-gray-700">{product.stock}</span>
                    </div>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Precio:</span>
                      <span className="font-semibold">{formatCurrency(product.price)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Categoría:</span>
                      <span>{product.category}</span>
                    </div>
                  </div>
                  <Button size="sm" className="w-full" onClick={() => setOrderDialog({ name: product.name, code: product.code, stock: product.stock })}>
                    Ordenar Reposición
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* No Alerts */}
      {criticalProducts.length === 0 && lowProducts.length === 0 && outOfStockProducts.length === 0 && (
        <Card className="p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <Package className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">Todo en orden</h3>
              <p className="text-muted-foreground">No hay alertas de stock en este momento</p>
            </div>
          </div>
        </Card>
      )}

      {/* Order/Restock Dialog */}
      <Dialog open={!!orderDialog} onOpenChange={(open) => !open && setOrderDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ordenar Reposición</DialogTitle>
            <DialogDescription>
              {orderDialog?.name} ({orderDialog?.code}) - Stock actual: {orderDialog?.stock}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div>
              <label className="text-sm font-medium block mb-1">Cantidad a ordenar</label>
              <input
                type="number"
                defaultValue={50}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                min={1}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Proveedor</label>
              <input
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                placeholder="Nombre del proveedor..."
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Notas</label>
              <textarea
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                rows={2}
                placeholder="Notas adicionales..."
              />
            </div>
            <p className="text-xs text-muted-foreground">
              La orden de compra se registrará en el sistema. Pendiente de integración con módulo de compras.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderDialog(null)}>Cancelar</Button>
            <Button onClick={() => {
              console.log("Orden de reposición:", orderDialog)
              setOrderDialog(null)
            }}>Confirmar Orden</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
