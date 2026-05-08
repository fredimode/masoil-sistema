"use client"

import { useEffect, useState } from "react"
import { AlertCircle, AlertTriangle } from "lucide-react"

export interface CaiHealth {
  empresa: "Aquiles" | "Conancap"
  status: "vigente" | "por_vencer" | "vencido"
  cai: string
  vencimiento: string
  daysToExpiry: number
}

interface CaiStatusResponse {
  blockOnExpired: boolean
  items: CaiHealth[]
}

interface BannerProps {
  /** Si se especifica, filtra a una sola empresa (uso en dialog de remito).
   *  Si se omite, muestra el peor estado de todas las empresas (uso global). */
  empresa?: "Aquiles" | "Conancap"
}

export function CaiBanner({ empresa }: BannerProps) {
  const [data, setData] = useState<CaiStatusResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/cai-status")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!data) return null

  const items = empresa ? data.items.filter((i) => i.empresa === empresa) : data.items
  if (items.length === 0) return null

  // Solo mostrar banner si hay al menos un vencido o por_vencer.
  const vencidos = items.filter((i) => i.status === "vencido")
  const porVencer = items.filter((i) => i.status === "por_vencer")
  if (vencidos.length === 0 && porVencer.length === 0) return null

  // Banner ROJO si hay alguna vencida.
  if (vencidos.length > 0) {
    return (
      <div className="bg-red-50 border border-red-300 rounded-md px-3 py-2 text-sm text-red-900 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          {vencidos.map((v) => (
            <p key={v.empresa}>
              <strong>⚠ CAI {v.empresa} vencido</strong> el {v.vencimiento}
              {data.blockOnExpired
                ? " — emisión BLOQUEADA. Renovar en AFIP."
                : " — emitir bajo riesgo fiscal. Renovar en AFIP urgente."}
            </p>
          ))}
        </div>
      </div>
    )
  }

  // Banner AMARILLO si solo hay por_vencer.
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-md px-3 py-2 text-sm text-amber-900 flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        {porVencer.map((v) => (
          <p key={v.empresa}>
            CAI {v.empresa} vence en <strong>{v.daysToExpiry} día{v.daysToExpiry === 1 ? "" : "s"}</strong> ({v.vencimiento})
          </p>
        ))}
      </div>
    </div>
  )
}

/**
 * Hook utilitario para el dialog de Emitir Remito: además del banner,
 * el caller necesita saber si el botón "Generar" debe estar deshabilitado
 * (cuando el CAI está vencido y blockOnExpired=true).
 */
export function useCaiCanEmit(empresa: "Aquiles" | "Conancap"): {
  loading: boolean
  canEmit: boolean
  reason?: string
} {
  const [data, setData] = useState<CaiStatusResponse | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch("/api/cai-status")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setData(d) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!data) return { loading: true, canEmit: true }
  const item = data.items.find((i) => i.empresa === empresa)
  if (!item) return { loading: false, canEmit: true }
  if (item.status === "vencido" && data.blockOnExpired) {
    return {
      loading: false,
      canEmit: false,
      reason: `CAI vencido. Renovar en AFIP antes de emitir.`,
    }
  }
  return { loading: false, canEmit: true }
}
