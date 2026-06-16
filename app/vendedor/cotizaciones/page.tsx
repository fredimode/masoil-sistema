"use client"

import { useEffect, useState, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCurrentVendedor } from "@/lib/hooks/useCurrentVendedor"
import { fetchCotizacionesVenta } from "@/lib/supabase/queries"
import { Plus, Search, FileText, Calendar } from "lucide-react"
import Link from "next/link"
import { formatCurrencyExact, formatDateStr, normalizeSearch } from "@/lib/utils"

// Estados de cotización (mismas etiquetas que el admin).
const ESTADO_BADGES: Record<string, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  parcialmente_aprobada: { label: "Aprobada parcial", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  no_aprobada: { label: "No aprobada", cls: "bg-red-100 text-red-800 border-red-200" },
  convertida_pedido: { label: "Convertida a pedido", cls: "bg-indigo-100 text-indigo-800 border-indigo-200" },
}

export default function VendedorCotizacionesPage() {
  const { vendedor, loading } = useCurrentVendedor()
  const [cotizaciones, setCotizaciones] = useState<any[]>([])
  const [loadingCots, setLoadingCots] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [estadoFilter, setEstadoFilter] = useState("todos")

  useEffect(() => {
    if (!vendedor?.id) return
    setLoadingCots(true)
    fetchCotizacionesVenta()
      // El vendedor solo ve SUS cotizaciones.
      .then((cots) => setCotizaciones((cots || []).filter((c: any) => c.vendedor_id === vendedor.id)))
      .catch(() => setCotizaciones([]))
      .finally(() => setLoadingCots(false))
  }, [vendedor?.id])

  const q = normalizeSearch(searchTerm)
  const filtered = useMemo(() => {
    let rows = cotizaciones
    if (estadoFilter !== "todos") rows = rows.filter((c) => c.estado === estadoFilter)
    if (q) {
      rows = rows.filter((c) =>
        normalizeSearch(c.numero || "").includes(q) ||
        normalizeSearch(c.client_name || "").includes(q),
      )
    }
    return rows
  }, [cotizaciones, estadoFilter, q])

  if (loading || loadingCots) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-primary text-primary-foreground p-4">
          <Skeleton className="h-7 w-40 mb-4 bg-primary-foreground/20" />
          <Skeleton className="h-10 w-full bg-primary-foreground/20" />
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold">Mis Cotizaciones</h1>
            <Button asChild size="sm" variant="secondary">
              <Link href="/vendedor/cotizaciones/nueva">
                <Plus className="h-4 w-4 mr-1" />
                Nueva
              </Link>
            </Button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente o #cotización..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground placeholder:text-primary-foreground/60"
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="p-4 border-b bg-card sticky top-[136px] z-10">
        <div className="max-w-6xl mx-auto">
          <Select value={estadoFilter} onValueChange={setEstadoFilter}>
            <SelectTrigger className="w-full md:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los estados</SelectItem>
              <SelectItem value="pendiente">Pendientes</SelectItem>
              <SelectItem value="parcialmente_aprobada">Aprobadas parcial</SelectItem>
              <SelectItem value="no_aprobada">No aprobadas</SelectItem>
              <SelectItem value="convertida_pedido">Convertidas a pedido</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lista */}
      <div className="p-4 md:p-6">
        <div className="max-w-6xl mx-auto">
          {filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((c) => {
                const est = ESTADO_BADGES[c.estado] || { label: c.estado, cls: "bg-gray-100 text-gray-700 border-gray-200" }
                return (
                  <Link key={c.id} href={`/vendedor/cotizaciones/${c.id}`}>
                    <Card className="p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-semibold truncate">{c.numero}</p>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDateStr(c.fecha || c.created_at)}</span>
                          </div>
                        </div>
                        <Badge variant="outline" className={`${est.cls} text-xs shrink-0`}>
                          {est.label}
                        </Badge>
                      </div>

                      <div className="mb-3">
                        <p className="font-semibold truncate">{c.client_name || "-"}</p>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <FileText className="h-3 w-3" />
                          <span>Cotización</span>
                        </div>
                        <p className="font-bold text-lg">{formatCurrencyExact(Number(c.total) || 0)}</p>
                      </div>
                    </Card>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
              <p className="text-lg font-medium mb-1">
                {cotizaciones.length === 0 ? "No tenés cotizaciones todavía" : "Sin resultados"}
              </p>
              {cotizaciones.length === 0 && (
                <Button asChild size="sm" className="mt-4">
                  <Link href="/vendedor/cotizaciones/nueva">Crear primera cotización</Link>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
