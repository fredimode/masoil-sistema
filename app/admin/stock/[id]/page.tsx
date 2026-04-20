"use client"

import React, { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ArrowLeft, Search } from "lucide-react"
import { fetchProductById, fetchVentasByProducto } from "@/lib/supabase/queries"
import type { Product } from "@/lib/types"
import { formatCurrency, formatDate, normalizeSearch } from "@/lib/utils"

export default function AdminProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params)

  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFoundState, setNotFoundState] = useState(false)
  const [ventas, setVentas] = useState<any[]>([])
  const [search, setSearch] = useState("")

  useEffect(() => {
    async function load() {
      try {
        const p = await fetchProductById(id)
        if (!p) {
          setNotFoundState(true)
          return
        }
        setProduct(p)
        const v = await fetchVentasByProducto(id, 50)
        setVentas(v)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const ventasFiltradas = useMemo(() => {
    if (!search.trim()) return ventas
    const q = normalizeSearch(search)
    return ventas.filter((v) => normalizeSearch(v.client_name || "").includes(q))
  }, [ventas, search])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (notFoundState) notFound()
  if (!product) return null

  const totalVendido = ventas.reduce((s, v) => s + (Number(v.cantidad) || 0), 0)
  const montoVendido = ventas.reduce((s, v) => s + (Number(v.subtotal) || 0), 0)

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/stock"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold mb-1">{product.name}</h1>
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <span className="font-mono">{product.code}</span>
            {product.category && <><span>•</span><Badge variant="outline">{product.category}</Badge></>}
            {product.grupoRubro && <><span>•</span><span>{product.grupoRubro}</span></>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Stock actual</p>
          <p className="text-2xl font-bold">{product.stock}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Precio venta</p>
          <p className="text-2xl font-bold">{formatCurrency(product.price)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Costo neto</p>
          <p className="text-2xl font-bold">{product.costoNeto != null ? formatCurrency(product.costoNeto) : "-"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-sm text-muted-foreground mb-1">Unidades vendidas</p>
          <p className="text-2xl font-bold">{totalVendido}</p>
          <p className="text-xs text-muted-foreground">{formatCurrency(montoVendido)}</p>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-2">Datos</h3>
        <Separator className="mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Ubicación</p>
            <p className="font-medium">{product.ubicacion || "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Umbral bajo stock</p>
            <p className="font-medium">{product.lowStockThreshold}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Umbral stock crítico</p>
            <p className="font-medium">{product.criticalStockThreshold}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Personalizable</p>
            <p className="font-medium">{product.isCustomizable ? "Sí" : "No"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Lead time custom</p>
            <p className="font-medium">{product.customLeadTime} días</p>
          </div>
        </div>
      </Card>

      {/* Historial de movimientos (ventas) */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Historial de movimientos</h3>
            <p className="text-xs text-muted-foreground">Últimas ventas de este producto (mostrando {ventasFiltradas.length} de {ventas.length})</p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="pl-9 pr-3 py-2 border rounded-md text-sm w-56"
            />
          </div>
        </div>

        {ventasFiltradas.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Precio Unit.</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ventasFiltradas.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>{v.fecha ? formatDate(new Date(v.fecha)) : "-"}</TableCell>
                  <TableCell className="font-medium">
                    {v.client_id ? (
                      <Link href={`/admin/clientes/${v.client_id}`} className="text-blue-600 hover:underline">
                        {v.client_name || "-"}
                      </Link>
                    ) : (v.client_name || "-")}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {v.order_id ? (
                      <Link href={`/admin/pedidos/${v.order_id}`} className="text-blue-600 hover:underline">
                        {v.order_number || v.order_id.slice(0, 8)}
                      </Link>
                    ) : "-"}
                  </TableCell>
                  <TableCell className="text-right">{v.cantidad}</TableCell>
                  <TableCell className="text-right">{formatCurrency(v.precio_unitario)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(v.subtotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-center py-8 text-muted-foreground text-sm">No hay movimientos de este producto</p>
        )}
      </Card>
    </div>
  )
}
