/**
 * comparar-saldos.ts — READ-ONLY. NO modifica ninguna tabla.
 *
 * Fase 1 del plan de remediación contable (P1/P2/P3): compara, por CUIT,
 *   - saldo VIEJO según Cuenta Corriente (TabCuentaCorriente: Σdebe−Σhaber por CUIT)
 *   - saldo VIEJO según Informe de Saldos (fetchCobranzasPendientes + TabInforme)
 *   - saldo NUEVO según lib/saldos.ts (calcularSaldoPorCuit)
 *
 * Objetivo: validar que la lógica nueva preserva los saldos reales (iguala a
 * Cta Cte, la fuente correcta) y revela dónde el Informe estaba mal, ANTES de
 * conectar lib/saldos.ts a las pantallas (Fase 2).
 *
 * Uso: npx tsx scripts/comparar-saldos.ts
 */
import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"
import { calcularSaldoPorCuit, normalizarCuit, type MovimientoCC } from "../lib/saldos"

// ── env + cliente service-role (read-only en la práctica) ──
const envPath = path.join(__dirname, "..", ".env.local")
const env: Record<string, string> = {}
fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
  const m = line.match(/^([A-Z_]+)=(.+)$/)
  if (m) env[m[1]] = m[2].trim()
})
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const round2 = (n: number) => Math.round(n * 100) / 100
const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 })

async function main() {
  // ── 1) leer datos (read-only) ──
  const [ccRes, clientsRes, factRes, legacyRes] = await Promise.all([
    supabase.from("cuenta_corriente_cliente").select("client_id, debe, haber, tipo_comprobante, fecha, observaciones").limit(100000),
    supabase.from("clients").select("id, business_name, cuit, numero_docum").limit(100000),
    supabase.from("facturas").select("id, client_id, razon_social, numero, comprobante_nro, fecha, total, tipo, empresa").limit(100000),
    supabase.from("cobranzas_pendientes").select("*").limit(100000),
  ])
  for (const [name, r] of [["cc", ccRes], ["clients", clientsRes], ["facturas", factRes], ["legacy", legacyRes]] as const) {
    if (r.error) { console.error(`Error leyendo ${name}:`, r.error.message); process.exit(1) }
  }
  const cc = ccRes.data || []
  const clients = clientsRes.data || []
  const facturas = factRes.data || []
  const legacy = legacyRes.data || []
  console.log(`Leídos: cc=${cc.length}  clients=${clients.length}  facturas=${facturas.length}  cobranzas_pendientes=${legacy.length}\n`)

  // ── mapas auxiliares ──
  const clientIdToCuit = new Map<string, string>()
  const cuitToNames = new Map<string, Set<string>>()
  const clientName = new Map<string, string>()
  for (const c of clients) {
    const cuit = normalizarCuit(c.cuit || c.numero_docum)
    clientName.set(c.id, c.business_name || "?")
    if (cuit) {
      clientIdToCuit.set(c.id, cuit)
      if (!cuitToNames.has(cuit)) cuitToNames.set(cuit, new Set())
      cuitToNames.get(cuit)!.add(c.business_name || "?")
    }
  }
  const cuitKey = (clientId: string | null) =>
    (clientId && clientIdToCuit.get(clientId)) || `cid:${clientId}`
  const nameFor = (cuit: string) => {
    const s = cuitToNames.get(cuit)
    if (s && s.size) return [...s].join(" / ")
    const cid = cuit.startsWith("cid:") ? cuit.slice(4) : null
    return (cid && clientName.get(cid)) || cuit
  }

  // ── 2) VIEJO Cta Cte == NUEVO: Σdebe−Σhaber por CUIT (lib/saldos) ──
  const nuevo = calcularSaldoPorCuit(cc as MovimientoCC[], clientIdToCuit)
  // viejoCtaCte se calcula con la MISMA fórmula contable de TabCuentaCorriente.
  const viejoCtaCte = new Map<string, number>()
  for (const [cuit, s] of nuevo) viejoCtaCte.set(cuit, s.saldo)

  // ── 3) VIEJO Informe: replica fetchCobranzasPendientes + TabInforme ──
  // saldoCliente = Σdebe−Σhaber por client_id (gate FIFO)
  const saldoCliente = new Map<string, number>()
  for (const m of cc) {
    if (!m.client_id) continue
    saldoCliente.set(m.client_id, (saldoCliente.get(m.client_id) || 0) + (Number(m.debe) || 0) - (Number(m.haber) || 0))
  }
  // facturas FC/ND/NC agrupadas por client_id, FIFO por fecha asc
  const esTipoFCND = (t: string) =>
    t.startsWith("FACTURA ") || t.startsWith("NOTA DE DEBITO") || t.startsWith("NOTA DE CREDITO")
  const porClienteFC = new Map<string, any[]>()
  for (const f of facturas) {
    const t = (f.tipo || "").toUpperCase()
    if (!f.client_id || !esTipoFCND(t)) continue
    if (!porClienteFC.has(f.client_id)) porClienteFC.set(f.client_id, [])
    porClienteFC.get(f.client_id)!.push(f)
  }
  const nuevasFC: any[] = []
  for (const [clientId, fcs] of porClienteFC) {
    let restante = saldoCliente.get(clientId) || 0
    if (restante <= 0) continue
    fcs.sort((a, b) => (a.fecha ? +new Date(a.fecha) : 0) - (b.fecha ? +new Date(b.fecha) : 0))
    for (const f of fcs) {
      const total = Number(f.total) || 0
      if (total <= 0) continue
      const esNC = (f.tipo || "").toUpperCase().startsWith("NOTA DE CREDITO")
      let saldoFactura: number
      if (esNC) {
        saldoFactura = total // (igual que el código real: NC con saldo positivo)
      } else {
        if (restante <= 0) continue
        saldoFactura = Math.min(restante, total)
        restante -= saldoFactura
      }
      nuevasFC.push({ client_id: f.client_id, total, saldo: saldoFactura, tipo: f.tipo })
    }
  }
  // cobranzas = legacy + nuevasFC ; TabInforme suma (saldo_pendiente ?? total) con ese valor > 0
  const informeCobranzas = [...legacy, ...nuevasFC]
  const informePorClient = new Map<string, number>()
  for (const c of informeCobranzas) {
    const val = Number(c.saldo_pendiente ?? c.total ?? 0) // bug real: saldo_pendiente no existe → total
    if (!(val > 0)) continue
    const id = c.client_id || "sin_cliente"
    informePorClient.set(id, (informePorClient.get(id) || 0) + val)
  }
  // agregar informe a CUIT
  const viejoInforme = new Map<string, number>()
  for (const [clientId, val] of informePorClient) {
    const key = clientId === "sin_cliente" ? "sin_cliente" : cuitKey(clientId)
    viejoInforme.set(key, round2((viejoInforme.get(key) || 0) + val))
  }

  // detección de NC y de cobros in-app por CUIT (para clasificar diferencias)
  const tieneNC = new Set<string>()
  for (const m of cc) {
    if ((m.tipo_comprobante || "").toUpperCase().startsWith("NC")) tieneNC.add(cuitKey(m.client_id))
  }
  for (const f of facturas) {
    if ((f.tipo || "").toUpperCase().startsWith("NOTA DE CREDITO")) tieneNC.add(cuitKey(f.client_id))
  }
  const tieneInApp = new Set<string>() // movimientos no-GestionPro
  for (const m of cc) {
    if (!String(m.observaciones || "").startsWith("GestionPro")) tieneInApp.add(cuitKey(m.client_id))
  }
  const legacyCuits = new Set<string>()
  for (const c of legacy) legacyCuits.add(cuitKey(c.client_id))

  // ── 4) armar tabla comparativa por CUIT ──
  const cuits = new Set<string>([...nuevo.keys(), ...viejoInforme.keys()])
  type Row = { cuit: string; name: string; ctacte: number; informe: number; nuevoSaldo: number; diffCtaCte: number; diffInforme: number }
  const rows: Row[] = []
  for (const cuit of cuits) {
    if (cuit === "sin_cliente") continue
    const ctacte = round2(viejoCtaCte.get(cuit) || 0)
    const informe = round2(viejoInforme.get(cuit) || 0)
    const nuevoSaldo = round2(nuevo.get(cuit)?.saldo || 0)
    rows.push({
      cuit, name: nameFor(cuit), ctacte, informe, nuevoSaldo,
      diffCtaCte: round2(nuevoSaldo - ctacte),
      diffInforme: round2(nuevoSaldo - informe),
    })
  }
  rows.sort((a, b) => Math.max(Math.abs(b.diffCtaCte), Math.abs(b.diffInforme)) - Math.max(Math.abs(a.diffCtaCte), Math.abs(a.diffInforme)))

  const pad = (s: string, n: number) => s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n)
  const padL = (s: string, n: number) => s.padStart(n)

  console.log("=== TOP 30 por diferencia absoluta (nuevo vs viejo) ===")
  console.log(pad("CUIT", 13) + pad("Cliente", 30) + padL("ctacte", 14) + padL("informe", 14) + padL("nuevo", 14) + padL("d.ctacte", 12) + padL("d.informe", 12))
  for (const r of rows.slice(0, 30)) {
    console.log(pad(r.cuit, 13) + pad(r.name, 30) + padL(fmt(r.ctacte), 14) + padL(fmt(r.informe), 14) + padL(fmt(r.nuevoSaldo), 14) + padL(fmt(r.diffCtaCte), 12) + padL(fmt(r.diffInforme), 12))
  }

  // ── 2/3) cuántos coinciden / difieren + por qué ──
  const TOL = 1
  const coincidenLas3 = rows.filter((r) => Math.abs(r.diffCtaCte) < TOL && Math.abs(r.diffInforme) < TOL)
  const difieren = rows.filter((r) => Math.abs(r.diffInforme) >= TOL || Math.abs(r.diffCtaCte) >= TOL)
  console.log(`\n=== Resumen ===`)
  console.log(`CUITs totales comparados: ${rows.length}`)
  console.log(`Coinciden las 3 fuentes (|diff| < $${TOL}): ${coincidenLas3.length}`)
  console.log(`Difieren (Informe ≠ Cta Cte/nuevo): ${difieren.length}`)
  const nuevoVsCtaCteMaxDiff = rows.reduce((m, r) => Math.max(m, Math.abs(r.diffCtaCte)), 0)
  console.log(`Máx |nuevo − ctacte|: $${fmt(nuevoVsCtaCteMaxDiff)}  (debería ser ~0: la lógica nueva reproduce la Cta Cte)`)

  // clasificación de las diferencias del Informe
  let cNC = 0, cInApp = 0, cLegacy = 0, cOtro = 0
  for (const r of difieren) {
    if (tieneNC.has(r.cuit)) cNC++
    else if (tieneInApp.has(r.cuit)) cInApp++
    else if (legacyCuits.has(r.cuit)) cLegacy++
    else cOtro++
  }
  console.log(`\n=== Por qué difiere el Informe (clasificación heurística) ===`)
  console.log(`  con NC (signo invertido / doble conteo P3): ${cNC}`)
  console.log(`  con cobro in-app (imputación P2):           ${cInApp}`)
  console.log(`  con snapshot legacy (no reconciliado/FIFO): ${cLegacy}`)
  console.log(`  otros (saldo_pendiente→total / FIFO):       ${cOtro}`)

  // ── 4) top 20 deudores reales: nuevo debe igualar ctacte ──
  const topDeudores = [...rows].filter((r) => r.nuevoSaldo > 0).sort((a, b) => b.nuevoSaldo - a.nuevoSaldo).slice(0, 20)
  console.log(`\n=== TOP 20 deudores (saldo NUEVO) — validar que nuevo == ctacte ===`)
  console.log(pad("Cliente", 34) + padL("nuevo", 14) + padL("ctacte", 14) + padL("informe", 14) + "  ok?")
  for (const r of topDeudores) {
    const ok = Math.abs(r.diffCtaCte) < TOL ? "OK" : "⚠️ REVISAR"
    console.log(pad(r.name, 34) + padL(fmt(r.nuevoSaldo), 14) + padL(fmt(r.ctacte), 14) + padL(fmt(r.informe), 14) + "  " + ok)
  }

  const totalDeudorNuevo = rows.filter((r) => r.nuevoSaldo > 0).reduce((s, r) => s + r.nuevoSaldo, 0)
  console.log(`\nSaldo deudor TOTAL (nuevo): $${fmt(totalDeudorNuevo)}  (esperado ~$92,7M según Sprint X.3)`)

  // guard: si algún top-20 difiere de ctacte, avisar fuerte
  const sospechosos = topDeudores.filter((r) => Math.abs(r.diffCtaCte) >= TOL)
  if (sospechosos.length) {
    console.log(`\n⚠️⚠️ ATENCIÓN: ${sospechosos.length} deudores grandes donde la lógica nueva NO coincide con Cta Cte. Revisar antes de continuar.`)
  } else {
    console.log(`\n✅ Los top 20 deudores: la lógica nueva coincide con Cta Cte (saldos reales preservados).`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
