"use client"

import React, { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  fetchProveedorById,
  fetchCompras,
  fetchPagosProveedores,
  fetchReclamos,
} from "@/lib/supabase/queries"
import { formatCurrency } from "@/lib/utils"
import { ArrowLeft, Edit, MessageCircle } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"

export default function AdminProveedorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = React.use(params)

  const [proveedor, setProveedor] = useState<any | null>(null)
  const [compras, setCompras] = useState<any[]>([])
  const [pagos, setPagos] = useState<any[]>([])
  const [reclamos, setReclamos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [notFoundState, setNotFoundState] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const [proveedorData, allCompras, allPagos, allReclamos] =
          await Promise.all([
            fetchProveedorById(id),
            fetchCompras(),
            fetchPagosProveedores(),
            fetchReclamos(),
          ])

        if (!proveedorData) {
          setNotFoundState(true)
          return
        }

        setProveedor(proveedorData)

        // Filter by proveedor_id or proveedor_nombre
        setCompras(
          allCompras.filter(
            (c) =>
              c.proveedor_id === id ||
              c.proveedor_nombre === proveedorData.nombre
          )
        )
        setPagos(
          allPagos.filter(
            (p) =>
              p.proveedor_id === id ||
              p.proveedor_nombre === proveedorData.nombre
          )
        )
        setReclamos(
          allReclamos.filter(
            (r) => r.proveedor_nombre === proveedorData.nombre
          )
        )
      } catch (err) {
        console.error("Error loading proveedor:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (notFoundState) {
    notFound()
  }

  if (!proveedor) return null

  // Extract phone number from contactos for WhatsApp
  const phoneMatch = proveedor.contactos
    ? proveedor.contactos.match(
        /(\+?\d[\d\s\-()]{7,})/
      )
    : null
  const phoneNumber = phoneMatch ? phoneMatch[1].replace(/\D/g, "") : null

  return (
    <div className="p-8 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/proveedores">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold mb-1">{proveedor.nombre}</h1>
          <div className="flex items-center gap-2 text-muted-foreground">
            {proveedor.empresa && (
              <Badge variant="outline">{proveedor.empresa}</Badge>
            )}
            {proveedor.cuit && <span>CUIT: {proveedor.cuit}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          {phoneNumber && (
            <Button asChild variant="outline">
              <a
                href={`https://wa.me/${phoneNumber}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle className="h-4 w-4 mr-2" />
                WhatsApp
              </a>
            </Button>
          )}
          <Button variant="outline" disabled>
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
        </div>
      </div>

      {/* Proveedor Info Card */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Datos del Proveedor</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Nombre</p>
            <p className="font-medium">{proveedor.nombre}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">CUIT</p>
            <p className="font-medium">{proveedor.cuit || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Empresa</p>
            <p className="font-medium">{proveedor.empresa || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">
              Condición de Pago
            </p>
            <p className="font-medium">{proveedor.condicion_pago || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">CBU</p>
            <p className="font-medium font-mono text-sm">
              {proveedor.cbu || "-"}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Email Comercial</p>
            <p className="font-medium">{proveedor.email_comercial || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Email Pagos</p>
            <p className="font-medium">{proveedor.email_pagos || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Categoría</p>
            <p className="font-medium">{proveedor.categoria || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Condición de IVA</p>
            <p className="font-medium">{proveedor.condicion_iva || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Contactos</p>
            <p className="font-medium">{proveedor.contactos || "-"}</p>
          </div>
          {proveedor.observaciones && (
            <div className="md:col-span-2 lg:col-span-3">
              <p className="text-sm text-muted-foreground mb-1">
                Observaciones
              </p>
              <p className="font-medium">{proveedor.observaciones}</p>
            </div>
          )}
          {proveedor.fecha_actualizacion && (
            <div>
              <p className="text-sm text-muted-foreground mb-1">
                Ultima actualizacion
              </p>
              <p className="font-medium text-sm">
                {new Date(proveedor.fecha_actualizacion).toLocaleDateString(
                  "es-AR"
                )}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* Historial de Compras */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Historial de Compras</h3>
        {compras.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Articulo</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {compras.map((c, i) => (
                <TableRow key={i}>
                  <TableCell>
                    {c.fecha
                      ? new Date(c.fecha).toLocaleDateString("es-AR")
                      : "-"}
                  </TableCell>
                  <TableCell>{c.articulo || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.estado || "-"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No hay compras registradas</p>
          </div>
        )}
      </Card>

      {/* Historial de Pagos */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Historial de Pagos</h3>
        {pagos.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proveedor</TableHead>
                <TableHead>Importe</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagos.map((p, i) => (
                <TableRow key={i}>
                  <TableCell>{p.proveedor_nombre || "-"}</TableCell>
                  <TableCell>
                    {p.importe != null ? formatCurrency(p.importe) : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{p.estado_pago || "-"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No hay pagos registrados</p>
          </div>
        )}
      </Card>

      {/* Reclamos */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Reclamos</h3>
        {reclamos.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proveedor</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reclamos.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.proveedor_nombre || "-"}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{r.estado || "-"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No hay reclamos registrados</p>
          </div>
        )}
      </Card>
    </div>
  )
}
