"use client"

import { useState, useMemo, useEffect } from "react"
import dynamic from "next/dynamic"
import { Card } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { fetchOrders, fetchProducts, fetchVendedores } from "@/lib/supabase/queries"
import type { Order, Product, Vendedor } from "@/lib/types"
import { formatCurrency } from "@/lib/utils"
import { TrendingUp, TrendingDown, DollarSign, Package, Users, ShoppingCart } from "lucide-react"

// Dynamic import to avoid SSR issues with Recharts
const EstadisticasCharts = dynamic(
  () => import("@/components/admin/estadisticas-charts").then((mod) => mod.EstadisticasCharts),
  { ssr: false, loading: () => <div className="h-[300px] flex items-center justify-center">Cargando gráficos...</div> }
)

function getPeriodRange(period: string): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const now = new Date()
  const end = new Date(now)
  let start: Date
  let prevStart: Date
  let prevEnd: Date

  switch (period) {
    case "semana": {
      start = new Date(now)
      start.setDate(now.getDate() - 7)
      prevEnd = new Date(start)
      prevStart = new Date(prevEnd)
      prevStart.setDate(prevEnd.getDate() - 7)
      break
    }
    case "trimestre": {
      start = new Date(now)
      start.setMonth(now.getMonth() - 3)
      prevEnd = new Date(start)
      prevStart = new Date(prevEnd)
      prevStart.setMonth(prevEnd.getMonth() - 3)
      break
    }
    case "año": {
      start = new Date(now)
      start.setFullYear(now.getFullYear() - 1)
      prevEnd = new Date(start)
      prevStart = new Date(prevEnd)
      prevStart.setFullYear(prevEnd.getFullYear() - 1)
      break
    }
    default: { // mes
      start = new Date(now)
      start.setMonth(now.getMonth() - 1)
      prevEnd = new Date(start)
      prevStart = new Date(prevEnd)
      prevStart.setMonth(prevEnd.getMonth() - 1)
      break
    }
  }

  return { start, end, prevStart, prevEnd }
}

function calcTrend(current: number, previous: number): { value: string; up: boolean } {
  if (previous === 0) return { value: current > 0 ? "+100%" : "0%", up: current > 0 }
  const pct = ((current - previous) / previous) * 100
  return { value: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`, up: pct >= 0 }
}

export default function AdminEstadisticasPage() {
  const [period, setPeriod] = useState("mes")
  const [orders, setOrders] = useState<Order[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchOrders(), fetchProducts(), fetchVendedores()])
      .then(([o, p, v]) => {
        setOrders(o)
        setProducts(p)
        setVendedores(v)
      })
      .catch((err) => console.error("Error fetching data:", err))
      .finally(() => setLoading(false))
  }, [])

  const { start, end, prevStart, prevEnd } = useMemo(() => getPeriodRange(period), [period])

  const currentOrders = useMemo(() => orders.filter((o) => o.createdAt >= start && o.createdAt <= end), [orders, start, end])
  const prevOrders = useMemo(() => orders.filter((o) => o.createdAt >= prevStart && o.createdAt <= prevEnd), [orders, prevStart, prevEnd])

  // Current period metrics
  const totalRevenue = currentOrders.filter((o) => o.status === "ENTREGADO").reduce((sum, o) => sum + o.total, 0)
  const totalOrdersCount = currentOrders.length
  const completedOrders = currentOrders.filter((o) => o.status === "ENTREGADO").length
  const fulfillmentRate = totalOrdersCount > 0 ? ((completedOrders / totalOrdersCount) * 100).toFixed(1) : "0"
  const avgOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0

  // Previous period metrics
  const prevRevenue = prevOrders.filter((o) => o.status === "ENTREGADO").reduce((sum, o) => sum + o.total, 0)
  const prevTotalOrders = prevOrders.length
  const prevCompleted = prevOrders.filter((o) => o.status === "ENTREGADO").length
  const prevFulfillment = prevTotalOrders > 0 ? (prevCompleted / prevTotalOrders) * 100 : 0
  const prevAvgValue = prevCompleted > 0 ? prevRevenue / prevCompleted : 0

  // Trends
  const revenueTrend = calcTrend(totalRevenue, prevRevenue)
  const ordersTrend = calcTrend(totalOrdersCount, prevTotalOrders)
  const avgTrend = calcTrend(avgOrderValue, prevAvgValue)
  const fulfillTrend = calcTrend(parseFloat(fulfillmentRate), prevFulfillment)

  // Sales by zone (current period)
  const zonas = ["Norte", "Capital", "Sur", "Oeste", "GBA"]
  const salesByZone = zonas.map((zona) => ({
    zona,
    ventas: currentOrders.filter((o) => o.zona === zona && o.status === "ENTREGADO").reduce((sum, o) => sum + o.total, 0),
    pedidos: currentOrders.filter((o) => o.zona === zona && o.status === "ENTREGADO").length,
  }))

  // Sales by category
  const salesByCategory = products.reduce(
    (acc, product) => {
      const cat = product.category || "Sin categoría"
      if (!acc[cat]) {
        acc[cat] = { name: cat, value: 0 }
      }
      currentOrders
        .filter((o) => o.status === "ENTREGADO")
        .forEach((order) => {
          const orderProduct = order.products.find((p) => p.productId === product.id)
          if (orderProduct) {
            acc[cat].value += orderProduct.price * orderProduct.quantity
          }
        })
      return acc
    },
    {} as Record<string, { name: string; value: number }>,
  )
  const categoryData = Object.values(salesByCategory)

  // Sales by vendedor
  const salesByVendedor = vendedores
    .filter((v) => v.role !== "admin")
    .map((vendedor) => ({
      name: vendedor.name.split(" ")[0],
      ventas: currentOrders
        .filter((o) => o.vendedorId === vendedor.id && o.status === "ENTREGADO")
        .reduce((sum, o) => sum + o.total, 0),
      pedidos: currentOrders.filter((o) => o.vendedorId === vendedor.id && o.status === "ENTREGADO").length,
    }))
    .sort((a, b) => b.ventas - a.ventas)

  // Sales trend - group orders by day within the period
  const salesTrend = useMemo(() => {
    const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
    const days = Math.min(7, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
    const result: { dia: string; ventas: number }[] = []

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(end)
      d.setDate(end.getDate() - i)
      d.setHours(0, 0, 0, 0)
      const nextD = new Date(d)
      nextD.setDate(d.getDate() + 1)

      const dayTotal = currentOrders
        .filter((o) => o.status === "ENTREGADO" && o.createdAt >= d && o.createdAt < nextD)
        .reduce((sum, o) => sum + o.total, 0)

      result.push({ dia: dayNames[d.getDay()], ventas: dayTotal })
    }
    return result
  }, [currentOrders, start, end])

  // Top products
  const topProducts = useMemo(() => {
    return products
      .map((product) => {
        const delivered = currentOrders.filter((o) => o.status === "ENTREGADO")
        const unitsSold = delivered.reduce((sum, order) => {
          const op = order.products.find((p) => p.productId === product.id)
          return sum + (op ? op.quantity : 0)
        }, 0)
        const revenue = delivered.reduce((sum, order) => {
          const op = order.products.find((p) => p.productId === product.id)
          return sum + (op ? op.price * op.quantity : 0)
        }, 0)
        return { ...product, unitsSold, revenue }
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)
  }, [products, currentOrders])

  const periodLabel = period === "semana" ? "semana anterior" : period === "mes" ? "mes anterior" : period === "trimestre" ? "trimestre anterior" : "año anterior"

  if (loading) return <div className="p-8 flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-1 md:mb-2">Estadísticas y Reportes</h1>
          <p className="text-sm md:text-base text-muted-foreground">Análisis de rendimiento del negocio</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-full md:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="semana">Esta semana</SelectItem>
            <SelectItem value="mes">Este mes</SelectItem>
            <SelectItem value="trimestre">Este trimestre</SelectItem>
            <SelectItem value="año">Este año</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
        <Card className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs md:text-sm font-medium text-muted-foreground">Facturación Total</p>
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-green-100 flex items-center justify-center">
              <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-green-600" />
            </div>
          </div>
          <p className="text-xl md:text-3xl font-bold mb-1 md:mb-2">{formatCurrency(totalRevenue)}</p>
          <div className={`flex items-center gap-1 text-xs md:text-sm ${revenueTrend.up ? "text-green-600" : "text-red-600"}`}>
            {revenueTrend.up ? <TrendingUp className="h-3 w-3 md:h-4 md:w-4" /> : <TrendingDown className="h-3 w-3 md:h-4 md:w-4" />}
            <span className="hidden md:inline">{revenueTrend.value} vs {periodLabel}</span>
            <span className="md:hidden">{revenueTrend.value}</span>
          </div>
        </Card>

        <Card className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs md:text-sm font-medium text-muted-foreground">Pedidos Totales</p>
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <ShoppingCart className="h-4 w-4 md:h-5 md:w-5 text-blue-600" />
            </div>
          </div>
          <p className="text-xl md:text-3xl font-bold mb-1 md:mb-2">{totalOrdersCount}</p>
          <div className={`flex items-center gap-1 text-xs md:text-sm ${ordersTrend.up ? "text-blue-600" : "text-red-600"}`}>
            {ordersTrend.up ? <TrendingUp className="h-3 w-3 md:h-4 md:w-4" /> : <TrendingDown className="h-3 w-3 md:h-4 md:w-4" />}
            <span className="hidden md:inline">{ordersTrend.value} vs {periodLabel}</span>
            <span className="md:hidden">{ordersTrend.value}</span>
          </div>
        </Card>

        <Card className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs md:text-sm font-medium text-muted-foreground">Ticket Promedio</p>
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <Package className="h-4 w-4 md:h-5 md:w-5 text-purple-600" />
            </div>
          </div>
          <p className="text-xl md:text-3xl font-bold mb-1 md:mb-2">{formatCurrency(avgOrderValue)}</p>
          <div className={`flex items-center gap-1 text-xs md:text-sm ${avgTrend.up ? "text-purple-600" : "text-red-600"}`}>
            {avgTrend.up ? <TrendingUp className="h-3 w-3 md:h-4 md:w-4" /> : <TrendingDown className="h-3 w-3 md:h-4 md:w-4" />}
            <span className="hidden md:inline">{avgTrend.value} vs {periodLabel}</span>
            <span className="md:hidden">{avgTrend.value}</span>
          </div>
        </Card>

        <Card className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs md:text-sm font-medium text-muted-foreground">Tasa Cumplimiento</p>
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Users className="h-4 w-4 md:h-5 md:w-5 text-amber-600" />
            </div>
          </div>
          <p className="text-xl md:text-3xl font-bold mb-1 md:mb-2">{fulfillmentRate}%</p>
          <div className={`flex items-center gap-1 text-xs md:text-sm ${fulfillTrend.up ? "text-green-600" : "text-red-600"}`}>
            {fulfillTrend.up ? <TrendingUp className="h-3 w-3 md:h-4 md:w-4" /> : <TrendingDown className="h-3 w-3 md:h-4 md:w-4" />}
            <span className="hidden md:inline">{fulfillTrend.value} vs {periodLabel}</span>
            <span className="md:hidden">{fulfillTrend.value}</span>
          </div>
        </Card>
      </div>

      {/* Charts - Dynamic import to avoid SSR issues */}
      <EstadisticasCharts
        salesTrend={salesTrend}
        salesByZone={salesByZone}
        categoryData={categoryData}
        salesByVendedor={salesByVendedor}
      />

      {/* Top Products Table */}
      <Card className="p-4 md:p-6">
        <h3 className="text-lg font-semibold mb-4">Top 10 Productos Más Vendidos</h3>
        <div className="space-y-2">
          {topProducts.map((product, index) => (
            <div key={product.id} className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-3 md:p-4 border rounded-lg hover:bg-muted/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{product.name}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-mono">{product.code}</span>
                    <Badge variant="outline" className="text-xs">
                      {product.category}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="text-left md:text-right ml-11 md:ml-0">
                <p className="font-bold text-base md:text-lg">{formatCurrency(product.revenue)}</p>
                <p className="text-xs md:text-sm text-muted-foreground">{product.unitsSold} unidades vendidas</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Zone Performance Details */}
      <Card className="p-4 md:p-6">
        <h3 className="text-lg font-semibold mb-4">Rendimiento Detallado por Zona</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {salesByZone.map((zona) => (
            <Card key={zona.zona} className="p-3 md:p-4 border-2">
              <h4 className="font-semibold mb-2 md:mb-3">{zona.zona}</h4>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">Ventas</p>
                  <p className="text-base md:text-xl font-bold">{formatCurrency(zona.ventas)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pedidos</p>
                  <p className="text-base md:text-lg font-semibold">{zona.pedidos}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Ticket Prom.</p>
                  <p className="text-xs md:text-sm font-medium">{formatCurrency(zona.ventas / (zona.pedidos || 1))}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Card>
    </div>
  )
}
