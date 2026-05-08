// CAI configurable por env vars + cálculo de vigencia.
// Server-side only (lee process.env). El cliente debe consultar
// /api/cai-status para obtener el estado.

import type { Empresa } from "@/lib/tusfacturas"
import type { CaiInfo } from "@/lib/pdf/remito-masoil"

// Hardcoded fallback — usado si las env vars no están definidas.
// Permite seguir funcionando en dev local sin cargar todo el env.
const CAI_FALLBACK: Record<Empresa, CaiInfo> = {
  Aquiles: {
    cai: "52031216755243",
    rangoDesde: 1,
    rangoHasta: 9900,
    puntoVenta: "0001",
    vencimiento: "19/01/2027",
  },
  Conancap: {
    cai: "52084217247394",
    rangoDesde: 1301,
    rangoHasta: 1400,
    puntoVenta: "0003",
    vencimiento: "22/03/2026",
  },
}

// Convierte "YYYY-MM-DD" (env) a "DD/MM/YYYY" (formato interno del PDF).
function isoToDDMMYYYY(iso: string | undefined): string | null {
  if (!iso) return null
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return `${m[3]}/${m[2]}/${m[1]}`
}

function readEnvCai(empresa: Empresa): CaiInfo | null {
  const upper = empresa.toUpperCase()
  const cai = process.env[`CAI_${upper}`]
  const pv = process.env[`CAI_${upper}_PV`]
  const desde = process.env[`CAI_${upper}_DESDE`]
  const hasta = process.env[`CAI_${upper}_HASTA`]
  const vencIso = process.env[`CAI_${upper}_VENCIMIENTO`]
  const venc = isoToDDMMYYYY(vencIso)
  if (!cai || !pv || !desde || !hasta || !venc) return null
  const desdeNum = parseInt(desde, 10)
  const hastaNum = parseInt(hasta, 10)
  if (!Number.isFinite(desdeNum) || !Number.isFinite(hastaNum)) return null
  return { cai, puntoVenta: pv, rangoDesde: desdeNum, rangoHasta: hastaNum, vencimiento: venc }
}

/**
 * Devuelve la config de CAI para una empresa. Lee de env vars; si están
 * incompletas o faltan, usa hardcoded fallback (back-compat para dev).
 */
export function getCaiConfig(empresa: Empresa): CaiInfo {
  return readEnvCai(empresa) || CAI_FALLBACK[empresa]
}

/**
 * Si CAI_BLOCK_ON_EXPIRED === "true", el endpoint de remito debe rechazar
 * con error 400 cuando el CAI está vencido. Default: false (permitir,
 * solo warning visible).
 */
export function shouldBlockOnExpired(): boolean {
  return String(process.env.CAI_BLOCK_ON_EXPIRED || "").toLowerCase() === "true"
}

export type CaiHealthStatus = "vigente" | "por_vencer" | "vencido"

export interface CaiHealth {
  empresa: Empresa
  status: CaiHealthStatus
  cai: string
  vencimiento: string         // DD/MM/YYYY
  daysToExpiry: number        // negativo si está vencido
}

function parseDateAR(s: string): Date | null {
  const [d, m, y] = s.split("/").map((x) => parseInt(x, 10))
  if (!d || !m || !y) return null
  return new Date(y, m - 1, d)
}

const POR_VENCER_DIAS = 30

export function getCaiHealth(empresa: Empresa): CaiHealth {
  const cfg = getCaiConfig(empresa)
  const venc = parseDateAR(cfg.vencimiento)
  const now = new Date()
  // Truncar a día (00:00) para que el cálculo sea estable
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days = venc ? Math.floor((venc.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : -999
  let status: CaiHealthStatus
  if (days < 0) status = "vencido"
  else if (days <= POR_VENCER_DIAS) status = "por_vencer"
  else status = "vigente"
  return {
    empresa,
    status,
    cai: cfg.cai,
    vencimiento: cfg.vencimiento,
    daysToExpiry: days,
  }
}

export function getAllCaiHealth(): CaiHealth[] {
  return (["Aquiles", "Conancap"] as Empresa[]).map(getCaiHealth)
}
