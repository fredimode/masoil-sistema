"use client"

import { QuickStats } from "@/components/vendedor/quick-stats"
import { OrderCard } from "@/components/vendedor/order-card"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { orders } from "@/lib/mock-data"
import { useCurrentVendedor } from "@/lib/hooks/useCurrentVendedor"
import { Plus, Search } from "lucide-react"
import Link from "next/link"

export default function VendedorDashboard() {
  const { vendedor, loading } = useCurrentVendedor()

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-primary text-primary-foreground p-4 pb-6">
          <Skeleton className="h-7 w-40 mb-2 bg-primary-foreground/20" />
          <Skeleton className="h-4 w-28 bg-primary-foreground/20" />
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  // Fallback if vendedor not found (shouldn't happen if middleware works)
  const vendedorName = vendedor?.name ?? "Vendedor"
  const vendedorZonas = vendedor?.zonas ?? []
  const vendedorId = vendedor?.id ?? ""

  // Filter orders for current vendedor
  const myOrders = orders.filter((o) => o.vendedorId === vendedorId)

  // Calculate stats
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayOrders = myOrders.filter((o) => o.createdAt >= today).length

  const pendingOrders = myOrders.filter((o) => !["ENTREGADO", "CANCELADO"].includes(o.status)).length

  const urgentOrders = myOrders.filter((o) => o.isUrgent && !["ENTREGADO", "CANCELADO"].includes(o.status)).length

  // Get recent orders
  const recentOrders = myOrders.slice(0, 5)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 pb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">Hola, {vendedorName.split(" ")[0]}</h1>
            <p className="text-sm text-primary-foreground/80">{vendedorZonas.join(", ")}</p>
          </div>
          <Badge variant="secondary" className="text-xs font-medium">
            Vendedor
          </Badge>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-2">
          <Button
            asChild
            size="sm"
            className="flex-1 bg-primary-foreground text-primary hover:bg-primary-foreground/90"
          >
            <Link href="/vendedor/pedidos/nuevo">
              <Plus className="h-4 w-4 mr-1" />
              Nuevo Pedido
            </Link>
          </Button>
          <Button asChild size="sm" variant="secondary">
            <Link href="/vendedor/clientes">
              <Search className="h-4 w-4 mr-1" />
              Buscar Cliente
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 pt-6">
        <QuickStats todayOrders={todayOrders} pendingOrders={pendingOrders} urgentOrders={urgentOrders} />
      </div>

      {/* Recent Orders */}
      <div className="p-4 pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Mis Pedidos Recientes</h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/vendedor/pedidos">Ver todos</Link>
          </Button>
        </div>

        {recentOrders.length > 0 ? (
          <div className="space-y-3">
            {recentOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center text-muted-foreground">
            <p>No tienes pedidos recientes</p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/vendedor/pedidos/nuevo">Crear primer pedido</Link>
            </Button>
          </Card>
        )}
      </div>
    </div>
  )
}
