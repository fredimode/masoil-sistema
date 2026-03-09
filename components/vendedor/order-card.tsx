import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDate } from "@/lib/utils"
import { getStatusConfig } from "@/lib/status-config"
import { clients } from "@/lib/mock-data"
import type { Order } from "@/lib/types"
import Link from "next/link"
import { MessageCircle } from "lucide-react"

interface OrderCardProps {
  order: Order
}

export function OrderCard({ order }: OrderCardProps) {
  const statusConfig = getStatusConfig(order.status)
  const client = clients.find((c) => c.id === order.clientId)
  const whatsappNumber = client?.whatsapp?.replace(/\D/g, "")

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-muted-foreground">#{order.id}</span>
          {order.isUrgent && (
            <Badge variant="destructive" className="text-xs">
              URGENTE
            </Badge>
          )}
        </div>
        <Badge className={`${statusConfig.bgColor} ${statusConfig.color} border font-medium`} variant="outline">
          <span className="mr-1">{statusConfig.icon}</span>
          {statusConfig.label}
        </Badge>
      </div>

      <div className="space-y-1 mb-3">
        <h3 className="font-semibold text-base">{order.clientName}</h3>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{order.products.length} productos</span>
          <span>•</span>
          <span className="font-semibold">{formatCurrency(order.total)}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="px-2 py-0.5 bg-secondary rounded-full text-xs font-medium">{order.zona}</span>
          <span>•</span>
          <span>{formatDate(order.createdAt)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        <Button asChild size="sm" className="flex-1">
          <Link href={`/vendedor/pedidos/${order.id}`}>Ver detalle</Link>
        </Button>
        {whatsappNumber && (
          <Button asChild size="sm" variant="outline">
            <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4" />
            </a>
          </Button>
        )}
      </div>
    </Card>
  )
}
