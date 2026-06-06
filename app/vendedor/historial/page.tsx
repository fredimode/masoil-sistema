"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useCurrentVendedor } from "@/lib/hooks/useCurrentVendedor"
import {
  fetchCotizacionesVenta, fetchFacturas, fetchRecibosCobranza,
} from "@/lib/supabase/queries"
import { formatCurrencyExact, formatDateStr, normalizeSearch } from "@/lib/utils"

// /vendedor/historial — vista de solo lectura del historial propio del
// vendedor. Item Excel #75: acceso a cotizaciones / facturas / cobros.
// No hay restriccion en DB hoy (RLS permite ALL a authenticated). Filtramos
// en JS por vendedor.id / vendedor.iniciales.

export default function VendedorHistorialPage() {
  const { vendedor, loading: loadingVendedor } = useCurrentVendedor()
  const [loading, setLoading] = useState(true)
  const [cotizaciones, setCotizaciones] = useState<any[]>([])
  const [facturas, setFacturas] = useState<any[]>([])
  const [recibos, setRecibos] = useState<any[]>([])
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!vendedor?.id) return
    setLoading(true)
    Promise.all([
      fetchCotizacionesVenta(),
      fetchFacturas(),
      fetchRecibosCobranza(),
    ])
      .then(([cots, facts, recs]) => {
        // Cotizaciones: filtro por vendedor_id directo en la tabla.
        setCotizaciones((cots || []).filter((c: any) => c.vendedor_id === vendedor.id))
        // Facturas: filtro por vendedor_id (agregado en G2.2). Para facturas
        // legacy sin vendedor_id, fallback por vendedor_name como
        // aproximacion para que no desaparezcan del historial.
        setFacturas((facts || []).filter((f: any) =>
          f.vendedor_id === vendedor.id || (!f.vendedor_id && f.vendedor_name === vendedor.name)
        ))
        // Recibos: filtro por vendedor_id
        setRecibos((recs || []).filter((r: any) => r.vendedor_id === vendedor.id))
      })
      .catch((e) => console.error("Error cargando historial vendedor:", e))
      .finally(() => setLoading(false))
  }, [vendedor?.id, vendedor?.name])

  const q = normalizeSearch(search)

  const filteredCots = useMemo(() => {
    if (!q) return cotizaciones
    return cotizaciones.filter((c) =>
      normalizeSearch(c.numero || "").includes(q) ||
      normalizeSearch(c.client_name || "").includes(q)
    )
  }, [cotizaciones, q])

  const filteredFacts = useMemo(() => {
    if (!q) return facturas
    return facturas.filter((f) =>
      normalizeSearch(f.numero || f.comprobante_nro || "").includes(q) ||
      normalizeSearch(f.razon_social || "").includes(q)
    )
  }, [facturas, q])

  const filteredRecs = useMemo(() => {
    if (!q) return recibos
    return recibos.filter((r) =>
      normalizeSearch(r.numero_completo || r.razon_social_cliente || "").includes(q)
    )
  }, [recibos, q])

  if (loadingVendedor || loading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary text-primary-foreground p-4 flex items-center gap-3">
        <Link href="/vendedor/perfil" className="text-primary-foreground/80 hover:text-primary-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-semibold">Mi Historial</h1>
      </div>

      <div className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por número o cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Tabs defaultValue="cotizaciones">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="cotizaciones">
              Cotizaciones {cotizaciones.length > 0 && <span className="ml-1 text-xs opacity-70">({cotizaciones.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="facturas">
              Facturas {facturas.length > 0 && <span className="ml-1 text-xs opacity-70">({facturas.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="cobros">
              Cobros {recibos.length > 0 && <span className="ml-1 text-xs opacity-70">({recibos.length})</span>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="cotizaciones" className="space-y-2 mt-3">
            {filteredCots.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                {cotizaciones.length === 0 ? "Sin cotizaciones propias." : "Sin resultados."}
              </Card>
            ) : filteredCots.map((c) => (
              <Card key={c.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold">{c.numero}</p>
                    <p className="text-sm truncate">{c.client_name}</p>
                    <p className="text-xs text-muted-foreground">{formatDateStr(c.fecha || c.created_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold">{formatCurrencyExact(Number(c.total) || 0)}</p>
                    <Badge variant="outline" className="text-xs mt-1">{c.estado}</Badge>
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="facturas" className="space-y-2 mt-3">
            {filteredFacts.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                {facturas.length === 0 ? "Sin facturas asociadas a tus pedidos." : "Sin resultados."}
              </Card>
            ) : filteredFacts.map((f) => (
              <Card key={f.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold">
                      {f.tipo || "FC"} {f.comprobante_nro || f.numero || "-"}
                    </p>
                    <p className="text-sm truncate">{f.razon_social || "-"}</p>
                    <p className="text-xs text-muted-foreground">{formatDateStr(f.fecha || f.created_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold">{formatCurrencyExact(Number(f.total) || 0)}</p>
                    {f.pdf_url && (
                      <a href={f.pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                        Ver PDF
                      </a>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="cobros" className="space-y-2 mt-3">
            {filteredRecs.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                {recibos.length === 0 ? "Sin cobros registrados." : "Sin resultados."}
              </Card>
            ) : filteredRecs.map((r) => (
              <Card key={r.id} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold">
                      {r.numero_completo || `REC-${String(r.numero).padStart(4, "0")}`}
                    </p>
                    <p className="text-sm truncate">{r.razon_social_cliente}</p>
                    <p className="text-xs text-muted-foreground">{formatDateStr(r.fecha)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold">{formatCurrencyExact(Number(r.total_valores) || 0)}</p>
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground text-center pt-2">
          Vista de solo lectura. Para emitir nuevos documentos, contactá a Administración.
        </p>
      </div>
    </div>
  )
}
