"use client"

import React, { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { fetchClientById, fetchOrders, fetchVendedores, updateClient } from "@/lib/supabase/queries"
import type { Client, Order, Vendedor } from "@/lib/types"
import { formatCurrency, formatDate } from "@/lib/utils"
import { getStatusConfig } from "@/lib/status-config"
import { ArrowLeft, Edit, MessageCircle, Phone, Mail, MapPin, CreditCard, FileText, Globe, Save } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

export default function AdminClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params)

  const [client, setClient] = useState<Client | null>(null)
  const [clientOrders, setClientOrders] = useState<Order[]>([])
  const [vendedor, setVendedor] = useState<Vendedor | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFoundState, setNotFoundState] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [allVendedores, setAllVendedores] = useState<Vendedor[]>([])
  const [editForm, setEditForm] = useState({
    businessName: "",
    contactName: "",
    whatsapp: "",
    email: "",
    address: "",
    zona: "" as string,
    vendedorId: "",
    paymentTerms: "",
    creditLimit: 0,
    notes: "",
    domicilioEntrega: "",
  })

  // Contactos de Cobranzas
  const [cobranzasForm, setCobranzasForm] = useState({
    cobranzas_mail: [] as string[],
    cobranzas_telefono: [] as string[],
    cobranzas_contacto: "",
    cobranzas_observaciones: "",
    portal_proveedores: false,
    portal_proveedores_url: "",
  })
  const [savingCobranzas, setSavingCobranzas] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [clientData, allOrders, allVendedoresData] = await Promise.all([
          fetchClientById(id),
          fetchOrders(),
          fetchVendedores(),
        ])
        setAllVendedores(allVendedoresData)
        const allVendedores = allVendedoresData

        if (!clientData) {
          setNotFoundState(true)
          return
        }

        setClient(clientData)
        setClientOrders(allOrders.filter((o) => o.clientId === clientData.id))
        setVendedor(allVendedores.find((v) => v.id === clientData.vendedorId) || null)
        setEditForm({
          businessName: clientData.businessName,
          contactName: clientData.contactName,
          whatsapp: clientData.whatsapp,
          email: clientData.email,
          address: clientData.address,
          zona: clientData.zona || "",
          vendedorId: clientData.vendedorId || "",
          paymentTerms: clientData.condicionPago || clientData.paymentTerms || "",
          creditLimit: clientData.creditLimit || 0,
          notes: clientData.notes || "",
          domicilioEntrega: (clientData as any).domicilioEntrega || "",
        })
        const rawMail = (clientData as any).cobranzas_mail
        const rawTel = (clientData as any).cobranzas_telefono
        setCobranzasForm({
          cobranzas_mail: Array.isArray(rawMail) ? rawMail.filter(Boolean) : rawMail ? [rawMail] : [],
          cobranzas_telefono: Array.isArray(rawTel) ? rawTel.filter(Boolean) : rawTel ? [rawTel] : [],
          cobranzas_contacto: (clientData as any).cobranzas_contacto || "",
          cobranzas_observaciones: (clientData as any).cobranzas_observaciones || "",
          portal_proveedores: (clientData as any).portal_proveedores || false,
          portal_proveedores_url: (clientData as any).portal_proveedores_url || "",
        })
      } catch (err) {
        console.error("Error loading client:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) return <div className="p-8 flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>

  if (notFoundState) {
    notFound()
  }

  if (!client) return null

  async function handleSaveEdit() {
    if (!client) return
    try {
      await updateClient(client.id, {
        business_name: editForm.businessName,
        contact_name: editForm.contactName,
        whatsapp: editForm.whatsapp,
        email: editForm.email,
        address: editForm.address,
        zona: editForm.zona || null,
        vendedor_id: editForm.vendedorId || null,
        condicion_pago: editForm.paymentTerms,
        payment_terms: editForm.paymentTerms,
        credit_limit: editForm.creditLimit,
        notes: editForm.notes,
        domicilio_entrega: editForm.domicilioEntrega,
      })
      setClient((prev) => prev ? {
        ...prev,
        businessName: editForm.businessName,
        contactName: editForm.contactName,
        whatsapp: editForm.whatsapp,
        email: editForm.email,
        address: editForm.address,
        zona: editForm.zona as any,
        vendedorId: editForm.vendedorId,
        paymentTerms: editForm.paymentTerms,
        condicionPago: editForm.paymentTerms,
        creditLimit: editForm.creditLimit,
        notes: editForm.notes,
      } : prev)
      setEditOpen(false)
    } catch (err) {
      console.error("Error saving client:", err)
      alert("Error al guardar")
    }
  }

  function openEditDialog() {
    if (!client) return
    setEditForm({
      businessName: client.businessName,
      contactName: client.contactName,
      whatsapp: client.whatsapp,
      email: client.email,
      address: client.address,
      zona: client.zona || "",
      vendedorId: client.vendedorId || "",
      paymentTerms: client.condicionPago || client.paymentTerms || "",
      creditLimit: client.creditLimit || 0,
      notes: client.notes || "",
      domicilioEntrega: (client as any).domicilioEntrega || "",
    })
    setEditOpen(true)
  }

  async function handleSaveCobranzas() {
    if (!client) return
    setSavingCobranzas(true)
    try {
      await updateClient(client.id, cobranzasForm)
      alert("Contactos de cobranzas guardados")
    } catch (err) {
      console.error("Error guardando contactos cobranzas:", err)
      alert("Error al guardar")
    } finally {
      setSavingCobranzas(false)
    }
  }

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
                <p className="font-medium">{client.condicionPago || client.paymentTerms || "-"}</p>
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

          {/* Contactos de Cobranzas */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Contactos de Cobranzas</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Mail de cobranzas</label>
                {cobranzasForm.cobranzas_mail.map((mail, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input
                      type="email"
                      value={mail}
                      onChange={(e) => {
                        const arr = [...cobranzasForm.cobranzas_mail]
                        arr[idx] = e.target.value
                        setCobranzasForm((f) => ({ ...f, cobranzas_mail: arr }))
                      }}
                      className="flex-1 p-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary"
                      placeholder="cobranzas@empresa.com"
                    />
                    <button
                      type="button"
                      onClick={() => setCobranzasForm((f) => ({ ...f, cobranzas_mail: f.cobranzas_mail.filter((_, i) => i !== idx) }))}
                      className="px-2 text-red-500 hover:text-red-700 text-sm"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setCobranzasForm((f) => ({ ...f, cobranzas_mail: [...f.cobranzas_mail, ""] }))}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  + Agregar mail
                </button>
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Teléfono de cobranzas</label>
                {cobranzasForm.cobranzas_telefono.map((tel, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={tel}
                      onChange={(e) => {
                        const arr = [...cobranzasForm.cobranzas_telefono]
                        arr[idx] = e.target.value
                        setCobranzasForm((f) => ({ ...f, cobranzas_telefono: arr }))
                      }}
                      className="flex-1 p-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary"
                      placeholder="+54 11 1234-5678"
                    />
                    <button
                      type="button"
                      onClick={() => setCobranzasForm((f) => ({ ...f, cobranzas_telefono: f.cobranzas_telefono.filter((_, i) => i !== idx) }))}
                      className="px-2 text-red-500 hover:text-red-700 text-sm"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setCobranzasForm((f) => ({ ...f, cobranzas_telefono: [...f.cobranzas_telefono, ""] }))}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  + Agregar teléfono
                </button>
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Persona de contacto</label>
                <input
                  type="text"
                  value={cobranzasForm.cobranzas_contacto}
                  onChange={(e) => setCobranzasForm((f) => ({ ...f, cobranzas_contacto: e.target.value }))}
                  className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary"
                  placeholder="Nombre del contacto"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-1">Observaciones cobranzas</label>
                <textarea
                  value={cobranzasForm.cobranzas_observaciones}
                  onChange={(e) => setCobranzasForm((f) => ({ ...f, cobranzas_observaciones: e.target.value }))}
                  className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary"
                  rows={2}
                  placeholder="Notas..."
                />
              </div>
              <Separator />
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cobranzasForm.portal_proveedores}
                    onChange={(e) => setCobranzasForm((f) => ({ ...f, portal_proveedores: e.target.checked }))}
                    className="rounded"
                  />
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Portal de proveedores para carga de FC
                </label>
              </div>
              {cobranzasForm.portal_proveedores && (
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">URL del portal</label>
                  <input
                    type="url"
                    value={cobranzasForm.portal_proveedores_url}
                    onChange={(e) => setCobranzasForm((f) => ({ ...f, portal_proveedores_url: e.target.value }))}
                    className="w-full p-2 border rounded-lg text-sm focus:ring-2 focus:ring-primary"
                    placeholder="https://portal.empresa.com"
                  />
                </div>
              )}
              <Button onClick={handleSaveCobranzas} disabled={savingCobranzas} className="w-full" size="sm">
                <Save className="h-4 w-4 mr-2" />
                {savingCobranzas ? "Guardando..." : "Guardar Contactos Cobranzas"}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Edit Client Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>Modificar datos de {client.businessName}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4 max-h-[60vh] overflow-y-auto">
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
            <div className="grid grid-cols-2 gap-3">
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
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Dirección</label>
              <input
                value={editForm.address}
                onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Domicilio de Entrega</label>
              <input
                value={editForm.domicilioEntrega}
                onChange={(e) => setEditForm((f) => ({ ...f, domicilioEntrega: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                placeholder="Dirección de entrega (si difiere de la principal)"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Vendedor</label>
                <select
                  value={editForm.vendedorId}
                  onChange={(e) => setEditForm((f) => ({ ...f, vendedorId: e.target.value }))}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                >
                  <option value="">Sin vendedor</option>
                  {allVendedores.filter((v) => v.isActive).map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Zona</label>
                <select
                  value={editForm.zona}
                  onChange={(e) => setEditForm((f) => ({ ...f, zona: e.target.value }))}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                >
                  <option value="">Sin zona</option>
                  <option value="Norte">Norte</option>
                  <option value="Capital">Capital</option>
                  <option value="Sur">Sur</option>
                  <option value="Oeste">Oeste</option>
                  <option value="GBA">GBA</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Condición de Pago</label>
                <input
                  value={editForm.paymentTerms}
                  onChange={(e) => setEditForm((f) => ({ ...f, paymentTerms: e.target.value }))}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                  placeholder="Ej: 30 días, contado"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Límite de Crédito</label>
                <input
                  type="number"
                  min={0}
                  value={editForm.creditLimit}
                  onChange={(e) => setEditForm((f) => ({ ...f, creditLimit: parseFloat(e.target.value) || 0 }))}
                  className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Notas</label>
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                rows={2}
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
