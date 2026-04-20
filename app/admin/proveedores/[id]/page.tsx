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
  fetchReclamosByProveedor,
  updateProveedor,
} from "@/lib/supabase/queries"
import { formatCurrency } from "@/lib/utils"
import { ArrowLeft, Edit, MessageCircle, Save } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ProveedorProductosSection } from "@/components/admin/proveedor-productos-section"

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
  const [observacionesPagos, setObservacionesPagos] = useState("")
  const [savingObs, setSavingObs] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const proveedorData = await fetchProveedorById(id)
        if (!proveedorData) {
          setNotFoundState(true)
          return
        }

        const [allCompras, allPagos, reclamosProv] = await Promise.all([
          fetchCompras(),
          fetchPagosProveedores(),
          fetchReclamosByProveedor(id, proveedorData.nombre),
        ])

        setProveedor(proveedorData)
        setObservacionesPagos(proveedorData.observaciones_pagos || "")

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
        setReclamos(reclamosProv)
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
          <h1 className="text-2xl font-bold mb-1">
            {proveedor.nombre_fantasia || proveedor.nombre}
          </h1>
          {(proveedor.razon_social || proveedor.nombre_fantasia) && (
            <p className="text-sm text-muted-foreground mb-1">
              {proveedor.nombre_fantasia
                ? `Razón Social: ${proveedor.razon_social || proveedor.nombre}`
                : ""}
            </p>
          )}
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
            <p className="text-sm text-muted-foreground mb-1">Nombre de Fantasía</p>
            <p className="font-medium">{proveedor.nombre_fantasia || proveedor.nombre}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Razón Social</p>
            <p className="font-medium">{proveedor.razon_social || proveedor.nombre}</p>
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
          <div>
            <p className="text-sm text-muted-foreground mb-1">Contacto Cobranzas</p>
            <p className="font-medium">{proveedor.contacto_cobranzas || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground mb-1">Tel/WhatsApp Cobranzas</p>
            <p className="font-medium">{proveedor.tel_cobranzas || "-"}</p>
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

      {/* Productos que provee */}
      <Card className="p-6">
        <ProveedorProductosSection proveedorId={id} />
      </Card>

      {/* Historial de Compras */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-2">Datos de últimas compras</h3>
        <p className="text-xs text-muted-foreground mb-4">Últimas 10 compras / OC</p>
        {compras.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Artículo</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...compras]
                .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")))
                .slice(0, 10)
                .map((c, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      {c.fecha
                        ? new Date(c.fecha).toLocaleDateString("es-AR")
                        : "-"}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate" title={c.articulo || ""}>
                      {c.articulo || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.total != null ? formatCurrency(Number(c.total)) : "-"}
                    </TableCell>
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

      {/* Observaciones de Pagos */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Observaciones de Pagos</h3>
        <textarea
          value={observacionesPagos}
          onChange={(e) => setObservacionesPagos(e.target.value)}
          className="w-full p-3 border rounded-lg text-sm focus:ring-2 focus:ring-primary min-h-[100px]"
          placeholder="Notas sobre pagos a este proveedor..."
          rows={4}
        />
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            disabled={savingObs}
            onClick={async () => {
              setSavingObs(true)
              try {
                await updateProveedor(id, { observaciones_pagos: observacionesPagos })
                alert("Observaciones guardadas")
              } catch (err) {
                console.error("Error guardando observaciones:", err)
                alert("Error al guardar")
              } finally {
                setSavingObs(false)
              }
            }}
          >
            <Save className="h-4 w-4 mr-2" />
            {savingObs ? "Guardando..." : "Guardar Observaciones"}
          </Button>
        </div>
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
