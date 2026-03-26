"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import { getStatusConfig, getNextStatuses, statusConfig } from "@/lib/status-config"
import { updateOrderStatus } from "@/lib/supabase/queries"
import type { Order, OrderStatus } from "@/lib/types"
import Link from "next/link"
import { Eye, Printer } from "lucide-react"

interface OrderTableProps {
  orders: Order[]
}

export function OrderTable({ orders: initialOrders }: OrderTableProps) {
  const [orders, setOrders] = useState(initialOrders)

  async function handleStatusChange(order: Order, newStatus: string) {
    if (newStatus === order.status) return
    try {
      await updateOrderStatus(order.id, newStatus as OrderStatus, "Admin", "admin")
      setOrders((prev) =>
        prev.map((o) => o.id === order.id ? { ...o, status: newStatus as OrderStatus } : o)
      )
    } catch (err) {
      console.error("Error updating status:", err)
      alert("Error al actualizar el estado")
    }
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">ID Pedido</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="w-24">Zona</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead className="w-44">Estado</TableHead>
            <TableHead className="w-24">Ingreso</TableHead>
            <TableHead className="w-24">Entrega Est.</TableHead>
            <TableHead className="w-28 text-right">Total</TableHead>
            <TableHead className="w-24 text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const sc = getStatusConfig(order.status)
            const nextStatuses = getNextStatuses(order.status)
            const allStatuses = [order.status, ...nextStatuses]

            return (
              <TableRow key={order.id} className={cn(order.isUrgent && "bg-red-50")}>
                <TableCell className="font-mono text-sm">
                  {order.orderNumber}
                  {order.isUrgent && (
                    <Badge variant="destructive" className="ml-1 text-xs">
                      URG
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-medium">{order.clientName}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {order.zona}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{order.vendedorName}</TableCell>
                <TableCell>
                  {nextStatuses.length > 0 ? (
                    <select
                      value={order.status}
                      onChange={(e) => handleStatusChange(order, e.target.value)}
                      className={`p-1 border rounded text-xs w-full ${sc.bgColor} ${sc.color} font-medium`}
                    >
                      {allStatuses.map((s) => {
                        const cfg = statusConfig[s]
                        return (
                          <option key={s} value={s}>
                            {cfg?.icon} {cfg?.label || s}
                          </option>
                        )
                      })}
                    </select>
                  ) : (
                    <Badge className={`${sc.bgColor} ${sc.color} border text-xs`} variant="outline">
                      {sc.icon} {sc.label}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(order.createdAt)}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(order.estimatedDelivery)}</TableCell>
                <TableCell className="text-right font-semibold">{formatCurrency(order.total)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/admin/pedidos/${order.id}`}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => {
                      const w = window.open(`/admin/pedidos/${order.id}`, "_blank")
                      if (w) w.onload = () => w.print()
                    }}>
                      <Printer className="h-4 w-4" />
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
