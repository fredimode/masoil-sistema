"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useCurrentVendedor } from "@/lib/hooks/useCurrentVendedor"
import { fetchClientsByVendedor } from "@/lib/supabase/queries"
import type { Client } from "@/lib/types"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, Phone, MessageCircle, Plus, MapPin, Mail, Users } from "lucide-react"
import { formatDate } from "@/lib/utils"
import Link from "next/link"

export default function VendedorClientesPage() {
  const { vendedor, loading } = useCurrentVendedor()
  const [clients, setClients] = useState<Client[]>([])
  const [loadingClients, setLoadingClients] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    if (!vendedor?.id) return
    setLoadingClients(true)
    fetchClientsByVendedor(vendedor.id)
      .then(setClients)
      .catch(() => setClients([]))
      .finally(() => setLoadingClients(false))
  }, [vendedor?.id])

  if (loading || loadingClients) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-primary text-primary-foreground p-4">
          <Skeleton className="h-7 w-32 mb-4 bg-primary-foreground/20" />
          <Skeleton className="h-10 w-full bg-primary-foreground/20" />
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    )
  }

  // Filter clients
  let filteredClients = [...clients]

  if (searchTerm) {
    filteredClients = filteredClients.filter(
      (c) =>
        c.businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.contactName.toLowerCase().includes(searchTerm.toLowerCase()),
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold">Mis Clientes</h1>
            <Button asChild size="sm" variant="secondary">
              <Link href="/vendedor/clientes/nuevo">
                <Plus className="h-4 w-4 mr-1" />
                Nuevo
              </Link>
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/60"
            />
          </div>
        </div>
      </div>

      {/* Clients Grid */}
      <div className="p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          {filteredClients.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredClients.map((client) => (
                <Card key={client.id} className="p-4 hover:shadow-md transition-shadow">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-base truncate">{client.businessName}</h3>
                      <p className="text-sm text-muted-foreground">{client.contactName}</p>
                    </div>
                    <Badge variant="outline" className="text-xs ml-2 shrink-0">
                      {client.zona}
                    </Badge>
                  </div>

                  {/* Info */}
                  <div className="space-y-2 text-sm text-muted-foreground mb-4">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{client.address}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span>{client.whatsapp}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pb-3 border-b mb-3">
                    <span>Pedidos: {client.totalOrders}</span>
                    {client.lastOrderDate && <span>Último: {formatDate(client.lastOrderDate)}</span>}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button asChild size="sm" className="flex-1">
                      <Link href={`/vendedor/pedidos/nuevo?clientId=${client.id}`}>
                        <Plus className="h-4 w-4 mr-1" />
                        Nuevo Pedido
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`https://wa.me/${client.whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="text-lg font-medium mb-1">No tenés clientes asignados todavía</p>
              <p className="text-sm">Contactá al administrador para que te asigne clientes.</p>
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>No se encontraron clientes con esa búsqueda</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
