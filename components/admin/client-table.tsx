"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatCurrency, formatDate } from "@/lib/utils"
import type { Client } from "@/lib/types"
import Link from "next/link"
import { Eye, Edit, MessageCircle } from "lucide-react"

interface ClientTableProps {
  clients: Client[]
}

export function ClientTable({ clients }: ClientTableProps) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Razón Social</TableHead>
            <TableHead>Contacto</TableHead>
            <TableHead className="w-24">Zona</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead>Último Pedido</TableHead>
            <TableHead className="w-28 text-right">Total Pedidos</TableHead>
            <TableHead className="w-32 text-right">Límite Crédito</TableHead>
            <TableHead className="w-32 text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <TableRow key={client.id}>
              <TableCell className="font-medium">{client.businessName}</TableCell>
              <TableCell>
                <div className="space-y-1">
                  <p className="text-sm font-medium">{client.contactName}</p>
                  <p className="text-xs text-muted-foreground">{client.whatsapp}</p>
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {client.zona}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {client.vendedorId === "v1" && "Carlos F."}
                {client.vendedorId === "v2" && "María G."}
                {client.vendedorId === "v3" && "Jorge R."}
                {client.vendedorId === "v4" && "Laura S."}
                {client.vendedorId === "v5" && "Roberto D."}
              </TableCell>
              <TableCell className="text-sm">{client.lastOrderDate ? formatDate(client.lastOrderDate) : "-"}</TableCell>
              <TableCell className="text-right font-semibold">{client.totalOrders}</TableCell>
              <TableCell className="text-right font-medium">{formatCurrency(client.creditLimit)}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/admin/clientes/${client.id}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/admin/clientes/${client.id}`}>
                      <Edit className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <a
                      href={`https://wa.me/${client.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
