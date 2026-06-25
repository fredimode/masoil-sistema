// ---------------------------------------------------------------------------
// Fuente ÚNICA de cálculo de saldo (P1 + P2 + P3 del plan de remediación).
//
// FASE 1: estas funciones existen pero NO están conectadas a ninguna pantalla
// todavía. Se validan contra la lógica vieja (scripts/comparar-saldos.ts) antes
// de switchear (Fase 2). Son funciones PURAS: no tocan Supabase ni ninguna
// tabla; reciben los datos ya leídos y devuelven los saldos calculados.
//
// Convenciones (sección 2.1/2.2 del plan):
//   - Agrupación SIEMPRE por CUIT (sucursales del mismo CUIT suman juntas).
//   - Fuente del saldo: cuenta_corriente_cliente (debe/haber). Las FC suman al
//     debe, los cobros (RC) al haber, las NC al haber → restan del neto.
//   - En listados de comprobantes individuales, las NC se exponen con saldo
//     NEGATIVO para que todo consumidor pueda SUMAR sin lógica de signo (P3).
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Normaliza un CUIT/identificador fiscal a solo dígitos (los clientes tienen
// el dato en `cuit` o en `numero_docum`, con o sin guiones).
export function normalizarCuit(valor: string | null | undefined): string {
  return (valor || "").replace(/\D/g, "")
}

// ───── Saldo neto por CUIT (reemplaza la divergencia A vs B de P1) ─────

export interface MovimientoCC {
  client_id: string | null
  debe: number | string | null
  haber: number | string | null
}

export interface SaldoCuit {
  cuit: string
  debe: number
  haber: number
  saldo: number // debe - haber  (>0 = deudor)
  clientIds: string[]
}

/**
 * Saldo neto por CUIT a partir de los movimientos de cuenta_corriente_cliente.
 * saldo = Σdebe − Σhaber, agrupando todos los client_id que comparten CUIT.
 *
 * @param movimientos filas de cuenta_corriente_cliente (debe/haber por cliente)
 * @param clientIdToCuit mapa client_id → CUIT normalizado (solo dígitos)
 */
export function calcularSaldoPorCuit(
  movimientos: MovimientoCC[],
  clientIdToCuit: Map<string, string>,
): Map<string, SaldoCuit> {
  const map = new Map<string, SaldoCuit>()
  for (const m of movimientos) {
    if (!m.client_id) continue
    // Si el cliente no tiene CUIT conocido, queda agrupado por su propio id
    // (no se puede unificar con otras sucursales).
    const cuit = clientIdToCuit.get(m.client_id) || `cid:${m.client_id}`
    let e = map.get(cuit)
    if (!e) {
      e = { cuit, debe: 0, haber: 0, saldo: 0, clientIds: [] }
      map.set(cuit, e)
    }
    e.debe += Number(m.debe) || 0
    e.haber += Number(m.haber) || 0
    if (!e.clientIds.includes(m.client_id)) e.clientIds.push(m.client_id)
  }
  for (const e of map.values()) {
    e.debe = round2(e.debe)
    e.haber = round2(e.haber)
    e.saldo = round2(e.debe - e.haber)
  }
  return map
}

// ───── Estado de pago POR FACTURA (resuelve P2 + P3) ─────

export interface FacturaLite {
  id: string | number
  total: number | string | null
  tipo: string | null
}

export interface EstadoFactura {
  total: number // firmado: NC negativo (P3)
  pagado: number // haberes imputados con referencia_id = id de factura
  saldo: number // total firmado − pagado  (>0 = pendiente)
}

/**
 * Estado de pago por factura. El "pagado" sale de los haberes de
 * cuenta_corriente_cliente cuyo referencia_id es el id de la factura
 * (cobro imputado por factura — fix P2). Las NC se firman negativas (P3) para
 * que el consumidor pueda sumar saldos sin lógica de signo especial.
 *
 * @param facturas facturas FC/ND/NC
 * @param movimientosPorFactura mapa String(facturaId) → Σ haberes imputados
 */
export function calcularEstadoFacturas(
  facturas: FacturaLite[],
  movimientosPorFactura: Map<string, number>,
): Map<string, EstadoFactura> {
  const map = new Map<string, EstadoFactura>()
  for (const f of facturas) {
    const bruto = Number(f.total) || 0
    const esNC = (f.tipo || "").toUpperCase().startsWith("NOTA DE CREDITO")
    const totalFirmado = round2(esNC ? -bruto : bruto)
    const pagado = round2(movimientosPorFactura.get(String(f.id)) || 0)
    map.set(String(f.id), {
      total: totalFirmado,
      pagado,
      saldo: round2(totalFirmado - pagado),
    })
  }
  return map
}
