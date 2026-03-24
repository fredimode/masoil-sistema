"use client"

import { useMemo } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { Client } from "@/lib/types"
import Link from "next/link"
import { Eye, Edit, MessageCircle } from "lucide-react"

interface ClientTableProps {
  clients: Client[]
  allClients?: Client[] // all clients for CUIT grouping count
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onToggleAll?: () => void
  allSelected?: boolean
}

export function ClientTable({ clients, allClients, selectedIds, onToggleSelect, onToggleAll, allSelected }: ClientTableProps) {
  const hasSelection = !!selectedIds

  // Count how many clients share the same CUIT
  const cuitCounts = useMemo(() => {
    const source = allClients || clients
    const counts: Record<string, number> = {}
    source.forEach((c) => {
      const doc = c.cuit || c.numeroDocum || ""
      const clean = doc.replace(/[-\s]/g, "")
      if (clean && clean.length >= 8) {
        counts[clean] = (counts[clean] || 0) + 1
      }
    })
    return counts
  }, [allClients, clients])

  function getSucursalCount(client: Client): number {
    const doc = (client.cuit || client.numeroDocum || "").replace(/[-\s]/g, "")
    return doc ? (cuitCounts[doc] || 1) : 1
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {hasSelection && (
              <TableHead className="w-10">
                <Checkbox checked={allSelected} onCheckedChange={() => onToggleAll?.()} />
              </TableHead>
            )}
            <TableHead>Razon Social</TableHead>
            <TableHead>Sucursal</TableHead>
            <TableHead>Localidad</TableHead>
            <TableHead className="w-24">Zona</TableHead>
            <TableHead>Cond. IVA</TableHead>
            <TableHead>Cond. Pago</TableHead>
            <TableHead className="w-28 text-right">Pedidos</TableHead>
            <TableHead className="w-32 text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((client) => {
            const sucCount = getSucursalCount(client)
            return (
              <TableRow key={client.id} className={selectedIds?.has(client.id) ? "bg-red-50" : undefined}>
                {hasSelection && (
                  <TableCell>
                    <Checkbox checked={selectedIds?.has(client.id) || false} onCheckedChange={() => onToggleSelect?.(client.id)} />
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {client.businessName}
                    {sucCount > 1 && (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                        {sucCount} suc.
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm">{client.sucursal || "-"}</TableCell>
                <TableCell className="text-sm">{client.localidad || "-"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">{client.zona}</Badge>
                </TableCell>
                <TableCell className="max-w-[100px] truncate text-sm" title={client.condicionIva || ""}>
                  {client.condicionIva || "-"}
                </TableCell>
                <TableCell className="max-w-[120px] truncate text-sm" title={client.condicionPago || ""}>
                  {client.condicionPago || "-"}
                </TableCell>
                <TableCell className="text-right font-semibold">{client.totalOrders}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/admin/clientes/${client.id}`}><Eye className="h-4 w-4" /></Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/admin/clientes/${client.id}`}><Edit className="h-4 w-4" /></Link>
                    </Button>
                    <Button asChild size="sm" variant="ghost">
                      <a href={`https://wa.me/${(client.whatsapp || "").replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="h-4 w-4" />
                      </a>
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
