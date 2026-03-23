"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { Client } from "@/lib/types"
import Link from "next/link"
import { Eye, Edit, MessageCircle } from "lucide-react"

interface ClientTableProps {
  clients: Client[]
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onToggleAll?: () => void
  allSelected?: boolean
}

export function ClientTable({ clients, selectedIds, onToggleSelect, onToggleAll, allSelected }: ClientTableProps) {
  const hasSelection = !!selectedIds

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {hasSelection && (
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => onToggleAll?.()}
                />
              </TableHead>
            )}
            <TableHead>Razon Social</TableHead>
            <TableHead>Localidad</TableHead>
            <TableHead className="w-24">Zona</TableHead>
            <TableHead>Vendedor</TableHead>
            <TableHead className="w-28 text-right">Total Pedidos</TableHead>
            <TableHead>Cond. IVA</TableHead>
            <TableHead>Cond. Pago</TableHead>
            <TableHead className="w-32 text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => (
            <TableRow key={client.id} className={selectedIds?.has(client.id) ? "bg-red-50" : undefined}>
              {hasSelection && (
                <TableCell>
                  <Checkbox
                    checked={selectedIds?.has(client.id) || false}
                    onCheckedChange={() => onToggleSelect?.(client.id)}
                  />
                </TableCell>
              )}
              <TableCell className="font-medium">{client.businessName}</TableCell>
              <TableCell className="text-sm">{client.localidad || "-"}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {client.zona}
                </Badge>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {client.vendedorGp || client.vendedorId || "-"}
              </TableCell>
              <TableCell className="text-right font-semibold">{client.totalOrders}</TableCell>
              <TableCell className="max-w-[100px] truncate text-sm" title={client.condicionIva || ""}>
                {client.condicionIva || "-"}
              </TableCell>
              <TableCell className="max-w-[120px] truncate text-sm" title={client.condicionPago || ""}>
                {client.condicionPago || "-"}
              </TableCell>
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
