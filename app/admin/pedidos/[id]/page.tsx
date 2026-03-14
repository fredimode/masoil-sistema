"use client"

import React, { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { StatusTimeline } from "@/components/vendedor/status-timeline"
import { CountdownWidget } from "@/components/vendedor/countdown-widget"
import { fetchOrderById, fetchClientById, updateOrderStatus } from "@/lib/supabase/queries"
import { getStatusConfig } from "@/lib/status-config"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils"
import type { Order, Client, OrderStatus } from "@/lib/types"
import { ArrowLeft, Printer, MessageCircle, Phone } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

const standardFlow: OrderStatus[] = ["RECIBIDO", "CONFIRMADO", "EN_ARMADO", "LISTO", "EN_ENTREGA", "ENTREGADO"]
const customFlow: OrderStatus[] = ["RECIBIDO", "CONFIRMADO", "EN_FABRICACION", "LISTO", "EN_ENTREGA", "ENTREGADO"]
const specialStatuses: OrderStatus[] = ["SIN_STOCK", "CON_PROVEEDOR", "CANCELADO"]

function getNextStatuses(currentStatus: OrderStatus, isCustom: boolean): OrderStatus[] {
  const flow = isCustom ? customFlow : standardFlow
  const currentIndex = flow.indexOf(currentStatus)

  const options: OrderStatus[] = []

  // If in a normal flow, allow advancing to the next step
  if (currentIndex >= 0 && currentIndex < flow.length - 1) {
    options.push(flow[currentIndex + 1])
  }

  // Always allow special statuses (unless already in a terminal state)
  if (!["ENTREGADO", "CANCELADO"].includes(currentStatus)) {
    specialStatuses.forEach((s) => {
      if (s !== currentStatus) options.push(s)
    })
  }

  return options
}

export default function AdminPedidoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params)

  const [order, setOrder] = useState<Order | null>(null)
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentStatus, setCurrentStatus] = useState<OrderStatus>("RECIBIDO")
  const [statusHistory, setStatusHistory] = useState<Order["statusHistory"]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newStatus, setNewStatus] = useState<string>("")
  const [statusNote, setStatusNote] = useState("")
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    async function loadData() {
      try {
        const orderData = await fetchOrderById(id)
        if (!orderData) {
          setOrder(null)
          setLoading(false)
          return
        }
        setOrder(orderData)
        setCurrentStatus(orderData.status)
        setStatusHistory(orderData.statusHistory)

        // Fetch client details for sidebar
        if (orderData.clientId) {
          const clientData = await fetchClientById(orderData.clientId)
          setClient(clientData)
        }
      } catch (err) {
        console.error("Error fetching order:", err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [id])

  if (loading) return <div className="p-8 flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>

  if (!order) {
    notFound()
  }

  const whatsappHref = client ? `https://wa.me/${client.whatsapp.replace(/\D/g, "")}` : null

  const nextStatuses = getNextStatuses(currentStatus, order.isCustom)
  const isTerminal = ["ENTREGADO", "CANCELADO"].includes(currentStatus)

  const handleUpdateStatus = async () => {
    if (!newStatus) return

    setUpdating(true)
    try {
      await updateOrderStatus(order.id, newStatus as OrderStatus, "admin1", "Admin Masoil", statusNote || undefined)

      const now = new Date()
      setCurrentStatus(newStatus as OrderStatus)
      setStatusHistory([
        ...statusHistory,
        {
          status: newStatus as OrderStatus,
          timestamp: now,
          userId: "admin1",
          userName: "Admin Masoil",
          notes: statusNote || undefined,
        },
      ])
      setNewStatus("")
      setStatusNote("")
      setDialogOpen(false)
    } catch (err) {
      console.error("Error updating status:", err)
      alert("Error al actualizar el estado del pedido")
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/pedidos">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">Pedido #{order.id}</h1>
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
          <p className="text-muted-foreground">Creado el {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Printer className="h-4 w-4 mr-2" />
            Imprimir Remito
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={isTerminal}>
                Actualizar Estado
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Actualizar Estado del Pedido</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="text-sm text-muted-foreground">
                  Estado actual: <Badge className={`${getStatusConfig(currentStatus).bgColor} ${getStatusConfig(currentStatus).color} ml-2`}>{getStatusConfig(currentStatus).label}</Badge>
                </div>
                <div className="space-y-2">
                  <Label>Nuevo estado</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar estado..." />
                    </SelectTrigger>
                    <SelectContent>
                      {nextStatuses.map((status) => {
                        const config = getStatusConfig(status)
                        return (
                          <SelectItem key={status} value={status}>
                            {config.icon} {config.label}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nota (opcional)</Label>
                  <Textarea
                    placeholder="Agregar una nota sobre el cambio de estado..."
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleUpdateStatus} disabled={!newStatus || updating}>
                    {updating ? "Actualizando..." : "Confirmar"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Status Timeline */}
      <Card className="p-6">
        <h3 className="font-semibold mb-4">Estado del Pedido</h3>
        <StatusTimeline currentStatus={currentStatus} isCustom={order.isCustom} />
      </Card>

      {/* Countdown for Custom Orders */}
      {order.isCustom && <CountdownWidget estimatedDelivery={order.estimatedDelivery} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Products */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Productos</h3>
            <div className="space-y-3">
              {order.products.map((product, index) => (
                <div key={index} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div className="flex-1">
                    <p className="font-medium">{product.productName}</p>
                    <p className="text-sm text-muted-foreground font-mono">{product.productCode}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">Cant: {product.quantity}</span>
                    <span className="font-semibold">{formatCurrency(product.price * product.quantity)}</span>
                  </div>
                </div>
              ))}
            </div>
            <Separator className="my-4" />
            <div className="flex items-center justify-between">
              <span className="font-semibold text-lg">Total</span>
              <span className="font-bold text-2xl">{formatCurrency(order.total)}</span>
            </div>
          </Card>

          {/* Status History */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Historial de Estados</h3>
            <div className="space-y-4">
              {statusHistory.map((change, index) => (
                <div key={index} className="flex items-start gap-4 pb-4 border-b last:border-0">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge
                        className={`${getStatusConfig(change.status).bgColor} ${getStatusConfig(change.status).color} text-xs`}
                      >
                        {getStatusConfig(change.status).label}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{formatDateTime(change.timestamp)}</span>
                    </div>
                    <p className="text-sm">
                      <span className="font-medium">{change.userName}</span>
                      {change.notes && <span className="text-muted-foreground ml-2">- {change.notes}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Notes */}
          {order.notes && (
            <Card className="p-6">
              <h3 className="font-semibold mb-2">Notas del Pedido</h3>
              <p className="text-sm text-muted-foreground">{order.notes}</p>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Client Info */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Información del Cliente</h3>
            {client && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Cliente</p>
                  <p className="font-medium">{client.businessName}</p>
                  <p className="text-sm">{client.contactName}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Contacto</p>
                  <div className="flex items-center gap-2 text-sm mb-1">
                    <Phone className="h-3 w-3" />
                    <span>{client.whatsapp}</span>
                  </div>
                  <p className="text-sm">{client.email}</p>
                </div>
                <Separator />
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Dirección</p>
                  <p className="text-sm">{client.address}</p>
                </div>
                <Separator />
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{client.zona}</Badge>
                  <Badge variant="outline">{client.paymentTerms}</Badge>
                </div>
                {whatsappHref && (
                  <Button asChild className="w-full bg-transparent" variant="outline">
                    <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-4 w-4 mr-2" />
                      Contactar Cliente
                    </a>
                  </Button>
                )}
              </div>
            )}
          </Card>

          {/* Vendedor Info */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Vendedor Asignado</h3>
            <div>
              <p className="font-medium mb-1">{order.vendedorName}</p>
              <Badge variant="outline" className="text-xs">
                {order.zona}
              </Badge>
            </div>
          </Card>

          {/* Delivery Info */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Información de Entrega</h3>
            <div className="space-y-2">
              <div>
                <p className="text-sm text-muted-foreground">Fecha estimada</p>
                <p className="font-medium">{formatDate(order.estimatedDelivery)}</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground">Zona de entrega</p>
                <p className="font-medium">{order.zona}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
