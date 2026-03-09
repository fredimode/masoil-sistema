import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { StatusTimeline } from "@/components/vendedor/status-timeline"
import { CountdownWidget } from "@/components/vendedor/countdown-widget"
import { orders, clients } from "@/lib/mock-data"
import { getStatusConfig } from "@/lib/status-config"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import { ArrowLeft, Phone, MessageCircle, MapPin } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

export default function VendedorPedidoDetailPage({ params }: { params: { id: string } }) {
  const order = orders.find((o) => o.id === params.id)

  if (!order) {
    notFound()
  }

  const client = clients.find((c) => c.id === order.clientId)
  const statusConfig = getStatusConfig(order.status)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="text-primary-foreground">
            <Link href="/vendedor/pedidos">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Pedido #{order.id}</h1>
            <p className="text-sm text-primary-foreground/80">{formatDateTime(order.createdAt)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {order.isUrgent && (
              <Badge variant="destructive" className="text-xs">
                URGENTE
              </Badge>
            )}
            {order.isCustom && (
              <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                CUSTOMIZADO
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Status */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Estado del Pedido</h3>
            <StatusTimeline currentStatus={order.status} isCustom={order.isCustom} />
          </Card>

          {/* Countdown for Custom Orders */}
          {order.isCustom && <CountdownWidget estimatedDelivery={order.estimatedDelivery} />}

          {/* Client Info */}
          {client && (
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Cliente</h3>
              <div className="space-y-2">
                <p className="font-medium">{client.businessName}</p>
                <p className="text-sm text-muted-foreground">{client.contactName}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  <span>{client.address}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{client.whatsapp}</span>
                </div>
                <div className="flex gap-2 pt-2">
                  <Badge variant="outline">{client.zona}</Badge>
                  <Badge variant="outline">{client.paymentTerms}</Badge>
                </div>
              </div>
              <div className="mt-3">
                <Button asChild size="sm" variant="outline" className="w-full bg-transparent">
                  <a
                    href={`https://wa.me/${client.whatsapp.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    Contactar por WhatsApp
                  </a>
                </Button>
              </div>
            </Card>
          )}

          {/* Products */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Productos</h3>
            <div className="space-y-3">
              {order.products.map((product, index) => (
                <div key={index} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{product.productName}</p>
                    <p className="text-xs text-muted-foreground font-mono">{product.productCode}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">x{product.quantity}</p>
                    <p className="font-semibold text-sm">{formatCurrency(product.price * product.quantity)}</p>
                  </div>
                </div>
              ))}
            </div>
            <Separator className="my-3" />
            <div className="flex items-center justify-between">
              <span className="font-semibold">Total</span>
              <span className="font-bold text-xl">{formatCurrency(order.total)}</span>
            </div>
          </Card>

          {/* Delivery Info */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Entrega</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Fecha estimada</p>
                <p className="font-medium">{formatDate(order.estimatedDelivery)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Zona</p>
                <p className="font-medium">{order.zona}</p>
              </div>
            </div>
          </Card>

          {/* Status History */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Historial</h3>
            <div className="space-y-3">
              {order.statusHistory.map((change, index) => (
                <div key={index} className="flex items-start gap-3 pb-3 border-b last:border-0">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge
                        className={`${getStatusConfig(change.status).bgColor} ${getStatusConfig(change.status).color} text-xs`}
                      >
                        {getStatusConfig(change.status).label}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatDateTime(change.timestamp)}</span>
                    </div>
                    <p className="text-sm">
                      <span className="font-medium">{change.userName}</span>
                      {change.notes && <span className="text-muted-foreground ml-1">- {change.notes}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Notes */}
          {order.notes && (
            <Card className="p-4">
              <h3 className="font-semibold mb-2">Notas</h3>
              <p className="text-sm text-muted-foreground">{order.notes}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
