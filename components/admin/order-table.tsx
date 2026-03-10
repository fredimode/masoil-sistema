"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatDate, cn } from "@/lib/utils"
import { getStatusConfig } from "@/lib/status-config"
import type { Order } from "@/lib/types"
import Link from "next/link"
import { Eye, Printer } from "lucide-react"

interface OrderTableProps {
  orders: Order[]
}

export function OrderTable({ orders: initialOrders }: OrderTableProps) {
  const [orders] = useState(initialOrders)

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">ID Pedido</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead className="w-24">Zona</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="w-28">Fecha</TableHead>
            <TableHead className="w-32 text-right">Total</TableHead>
            <TableHead className="w-32 text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const statusConfig = getStatusConfig(order.status)
            return (
              <TableRow key={order.id} className={cn(order.isUrgent && "bg-red-50")}>
                <TableCell className="font-mono text-sm">
                  #{order.id}
                  {order.isUrgent && (
                    <Badge variant="destructive" className="ml-2 text-xs">
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
                  <Badge className={`${statusConfig.bgColor} ${statusConfig.color} border text-xs`} variant="outline">
                    {statusConfig.icon} {statusConfig.label}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{formatDate(order.createdAt)}</TableCell>
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
