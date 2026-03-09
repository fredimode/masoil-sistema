"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { orders } from "@/lib/mock-data"
import { useCurrentVendedor } from "@/lib/hooks/useCurrentVendedor"
import { Plus, Search, Clock, MapPin } from "lucide-react"
import Link from "next/link"
import { formatCurrency, formatDate } from "@/lib/utils"
import { getStatusConfig } from "@/lib/status-config"

export default function VendedorPedidosPage() {
  const { vendedor, loading } = useCurrentVendedor()
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("todos")

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-primary text-primary-foreground p-4">
          <Skeleton className="h-7 w-32 mb-4 bg-primary-foreground/20" />
          <Skeleton className="h-10 w-full bg-primary-foreground/20" />
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    )
  }

  const vendedorId = vendedor?.id ?? ""

  // Filter orders
  let filteredOrders = orders.filter((o) => o.vendedorId === vendedorId)

  if (statusFilter !== "todos") {
    if (statusFilter === "pendientes") {
      filteredOrders = filteredOrders.filter((o) => !["ENTREGADO", "CANCELADO"].includes(o.status))
    } else if (statusFilter === "urgentes") {
      filteredOrders = filteredOrders.filter((o) => o.isUrgent && !["ENTREGADO", "CANCELADO"].includes(o.status))
    } else if (statusFilter === "entregados") {
      filteredOrders = filteredOrders.filter((o) => o.status === "ENTREGADO")
    }
  }

  if (searchTerm) {
    filteredOrders = filteredOrders.filter(
      (o) =>
        o.clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.id.toLowerCase().includes(searchTerm.toLowerCase()),
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold">Mis Pedidos</h1>
            <Button asChild size="sm" variant="secondary">
              <Link href="/vendedor/pedidos/nuevo">
                <Plus className="h-4 w-4 mr-1" />
                Nuevo
              </Link>
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente o #pedido..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/60"
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 border-b bg-card sticky top-[136px] z-10">
        <div className="max-w-6xl mx-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="pendientes">Pendientes</SelectItem>
              <SelectItem value="urgentes">Urgentes</SelectItem>
              <SelectItem value="entregados">Entregados</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Orders Grid */}
      <div className="p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          {filteredOrders.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredOrders.map((order) => {
                const statusConfig = getStatusConfig(order.status)
                return (
                  <Link key={order.id} href={`/vendedor/pedidos/${order.id}`}>
                    <Card className="p-4 hover:shadow-md transition-shadow">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-mono text-sm font-semibold">#{order.id}</p>
                          <p className="text-sm text-muted-foreground">{formatDate(order.createdAt)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge className={`${statusConfig.bgColor} ${statusConfig.color} text-xs`}>
                            {statusConfig.label}
                          </Badge>
                          {order.isUrgent && (
                            <Badge variant="destructive" className="text-xs">
                              Urgente
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Client */}
                      <div className="mb-3">
                        <p className="font-semibold">{order.clientName}</p>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span>{order.zona}</span>
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="flex items-center justify-between pt-3 border-t">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{order.products.length} productos</span>
                        </div>
                        <p className="font-bold text-lg">{formatCurrency(order.total)}</p>
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No se encontraron pedidos</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
