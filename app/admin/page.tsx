"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"
import { StatsCard } from "@/components/admin/stats-card"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { fetchOrders } from "@/lib/supabase/queries"
import type { Order } from "@/lib/types"
import { FileText, Clock, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react"
import Link from "next/link"
import { formatCurrency } from "@/lib/utils"
import { getStatusConfig } from "@/lib/status-config"

// Dynamic import to avoid SSR issues with Recharts
const DashboardCharts = dynamic(
  () => import("@/components/admin/dashboard-charts").then((mod) => mod.DashboardCharts),
  { ssr: false, loading: () => <div className="h-[250px] flex items-center justify-center">Cargando gráficos...</div> }
)

export default function AdminDashboard() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOrders()
      .then(setOrders)
      .catch((err) => console.error("Error fetching orders:", err))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>

  // Calculate stats
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const todayOrders = orders.filter((o) => o.createdAt >= today).length
  const pendingOrders = orders.filter((o) => !["ENTREGADO", "CANCELADO"].includes(o.status)).length
  const completedOrders = orders.filter((o) => o.status === "ENTREGADO").length
  const urgentOrders = orders.filter((o) => o.isUrgent && !["ENTREGADO", "CANCELADO"].includes(o.status)).length

  // Revenue today
  const todayRevenue = orders.filter((o) => o.createdAt >= today).reduce((sum, o) => sum + o.total, 0)

  // Orders by zone
  const ordersByZone = [
    { name: "Norte", value: orders.filter((o) => o.zona === "Norte").length },
    { name: "Capital", value: orders.filter((o) => o.zona === "Capital").length },
    { name: "Sur", value: orders.filter((o) => o.zona === "Sur").length },
    { name: "Oeste", value: orders.filter((o) => o.zona === "Oeste").length },
    { name: "GBA", value: orders.filter((o) => o.zona === "GBA").length },
  ]

  // Orders by status
  const ordersByStatus = [
    { name: "Ingresado", value: orders.filter((o) => o.status === "INGRESADO").length, fill: "#14b8a6" },
    { name: "En preparación", value: orders.filter((o) => o.status === "EN_PREPARACION").length, fill: "#3b82f6" },
    { name: "Facturado", value: orders.filter((o) => o.status === "FACTURADO").length, fill: "#a855f7" },
    { name: "Esp. Mercadería", value: orders.filter((o) => o.status === "ESPERANDO_MERCADERIA").length, fill: "#f59e0b" },
    { name: "Entregado", value: orders.filter((o) => o.status === "ENTREGADO").length, fill: "#10b981" },
    { name: "Cancelado", value: orders.filter((o) => o.status === "CANCELADO").length, fill: "#ef4444" },
  ].filter((s) => s.value > 0)

  // Recent alerts
  const recentOrders = orders.slice(0, 5)

  return (
    <div className="p-4 md:p-8 space-y-6 md:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2">Dashboard Administrativo</h1>
        <p className="text-sm md:text-base text-muted-foreground">Vista general del sistema de pedidos</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <StatsCard title="Pedidos Hoy" value={todayOrders} icon={FileText} trend="+12% vs ayer" trendUp={true} href="/admin/pedidos?filter=hoy" />
        <StatsCard title="Pedidos Pendientes" value={pendingOrders} icon={Clock} href="/admin/pedidos?filter=pendientes" />
        <StatsCard title="Pedidos Completados" value={completedOrders} icon={CheckCircle} href="/admin/pedidos?filter=completados" />
        <StatsCard
          title="Pedidos Urgentes"
          value={urgentOrders}
          icon={AlertTriangle}
          trend="Requieren atención"
          trendUp={false}
          href="/admin/pedidos?filter=urgentes"
        />
      </div>

      {/* Revenue Card */}
      <Card className="p-4 md:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Facturación Hoy</p>
            <p className="text-2xl md:text-3xl font-bold">{formatCurrency(todayRevenue)}</p>
          </div>
          <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-green-100 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 md:h-6 md:w-6 text-green-600" />
          </div>
        </div>
      </Card>

      {/* Charts Grid - Dynamic import to avoid SSR issues */}
      <DashboardCharts ordersByZone={ordersByZone} ordersByStatus={ordersByStatus} />

      {/* Recent Orders */}
      <Card className="p-4 md:p-6">
        <h3 className="text-lg font-semibold mb-4">Pedidos Recientes</h3>
        <div className="space-y-3">
          {recentOrders.map((order) => (
            <Link key={order.id} href={`/admin/pedidos/${order.id}`} className="block">
              <div className="flex flex-col md:flex-row md:items-center justify-between p-3 md:p-4 border rounded-lg gap-3 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer">
                <div className="flex items-center gap-3 md:gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold">#{order.id}</p>
                    <p className="text-sm text-muted-foreground truncate">{order.clientName}</p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {order.zona}
                  </Badge>
                </div>
                <div className="flex items-center justify-between md:justify-end gap-3 md:gap-4">
                  <p className="font-semibold">{formatCurrency(order.total)}</p>
                  <Badge className={`${getStatusConfig(order.status).bgColor} ${getStatusConfig(order.status).color} shrink-0`}>
                    {getStatusConfig(order.status).label}
                  </Badge>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}
