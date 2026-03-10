"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { clients, orders, vendedores } from "@/lib/mock-data"
import { formatCurrency, formatDate } from "@/lib/utils"
import { getStatusConfig } from "@/lib/status-config"
import { ArrowLeft, Edit, MessageCircle, Phone, Mail, MapPin, CreditCard, FileText } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

export default function AdminClientDetailPage({ params }: { params: { id: string } }) {
  const clientData = clients.find((c) => c.id === params.id)

  if (!clientData) {
    notFound()
  }

  const [client, setClient] = useState(clientData)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState({
    businessName: client.businessName,
    contactName: client.contactName,
    whatsapp: client.whatsapp,
    email: client.email,
    address: client.address,
  })

  function handleSaveEdit() {
    setClient((prev) => ({ ...prev, ...editForm }))
    setEditOpen(false)
  }

  function openEditDialog() {
    setEditForm({
      businessName: client.businessName,
      contactName: client.contactName,
      whatsapp: client.whatsapp,
      email: client.email,
      address: client.address,
    })
    setEditOpen(true)
  }

  const vendedor = vendedores.find((v) => v.id === client.vendedorId)
  const clientOrders = orders.filter((o) => o.clientId === client.id)

  // Calculate metrics
  const totalSpent = clientOrders.filter((o) => o.status === "ENTREGADO").reduce((sum, o) => sum + o.total, 0)

  const pendingOrders = clientOrders.filter((o) => !["ENTREGADO", "CANCELADO"].includes(o.status)).length

  return (
    <div className="p-8 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/clientes">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold mb-1">{client.businessName}</h1>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Badge variant="outline">{client.zona}</Badge>
            <span>•</span>
            <span>{client.totalOrders} pedidos realizados</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openEditDialog}>
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
          <Button asChild>
            <Link href={`/admin/pedidos/nuevo?clientId=${client.id}`}>
              <FileText className="h-4 w-4 mr-2" />
              Nuevo Pedido
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4">
              <p className="text-sm text-muted-foreground mb-1">Total Gastado</p>
              <p className="text-2xl font-bold">{formatCurrency(totalSpent)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground mb-1">Pedidos Totales</p>
              <p className="text-2xl font-bold">{client.totalOrders}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground mb-1">Pedidos Pendientes</p>
              <p className="text-2xl font-bold">{pendingOrders}</p>
            </Card>
          </div>

          {/* Order History */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Historial de Pedidos</h3>
            {clientOrders.length > 0 ? (
              <div className="space-y-3">
                {clientOrders.map((order) => {
                  const statusConfig = getStatusConfig(order.status)
                  return (
                    <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div>
                          <p className="font-mono text-sm font-semibold">#{order.id}</p>
                          <p className="text-sm text-muted-foreground">{formatDate(order.createdAt)}</p>
                        </div>
                        <div className="text-sm">
                          <p>{order.products.length} productos</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge
                          className={`${statusConfig.bgColor} ${statusConfig.color} border text-xs`}
                          variant="outline"
                        >
                          {statusConfig.icon} {statusConfig.label}
                        </Badge>
                        <p className="font-semibold min-w-[100px] text-right">{formatCurrency(order.total)}</p>
                        <Button asChild size="sm" variant="ghost">
                          <Link href={`/admin/pedidos/${order.id}`}>
                            <FileText className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No hay pedidos registrados</p>
              </div>
            )}
          </Card>

          {/* Notes */}
          {client.notes && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-2">Notas</h3>
              <p className="text-sm text-muted-foreground">{client.notes}</p>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Contact Info */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Información de Contacto</h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Contacto Principal</p>
                <p className="font-medium">{client.contactName}</p>
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{client.whatsapp}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{client.email}</span>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span>{client.address}</span>
                </div>
              </div>
              <Separator />
              <Button asChild className="w-full bg-transparent" variant="outline">
                <a
                  href={`https://wa.me/${client.whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Enviar WhatsApp
                </a>
              </Button>
            </div>
          </Card>

          {/* Payment Terms */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Términos Comerciales</h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Condición de Pago</p>
                <p className="font-medium">{client.paymentTerms}</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-1">Límite de Crédito</p>
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <p className="font-semibold text-lg">{formatCurrency(client.creditLimit)}</p>
                </div>
              </div>
              <Separator />
              <div>
                <p className="text-sm text-muted-foreground mb-1">Zona de Entrega</p>
                <Badge variant="outline">{client.zona}</Badge>
              </div>
            </div>
          </Card>

          {/* Assigned Vendedor */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Vendedor Asignado</h3>
            {vendedor && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                    {vendedor.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </div>
                  <div>
                    <p className="font-medium">{vendedor.name}</p>
                    <p className="text-sm text-muted-foreground">{vendedor.email}</p>
                  </div>
                </div>
                <Separator />
                <div className="text-sm">
                  <p className="text-muted-foreground mb-1">Zonas asignadas</p>
                  <div className="flex flex-wrap gap-1">
                    {vendedor.zonas.map((zona) => (
                      <Badge key={zona} variant="outline" className="text-xs">
                        {zona}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Card>

          {/* Last Order Date */}
          {client.lastOrderDate && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Actividad Reciente</h3>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Último Pedido</p>
                <p className="font-medium">{formatDate(client.lastOrderDate)}</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Edit Client Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>Modificar datos de {client.businessName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Razón Social</label>
              <input
                value={editForm.businessName}
                onChange={(e) => setEditForm((f) => ({ ...f, businessName: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Contacto</label>
              <input
                value={editForm.contactName}
                onChange={(e) => setEditForm((f) => ({ ...f, contactName: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">WhatsApp</label>
              <input
                value={editForm.whatsapp}
                onChange={(e) => setEditForm((f) => ({ ...f, whatsapp: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Email</label>
              <input
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Dirección</label>
              <input
                value={editForm.address}
                onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
