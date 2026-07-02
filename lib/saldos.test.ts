import { describe, it, expect } from "vitest"
import {
  facturaIdsDeRecibo,
  construirMovimientosPorFactura,
  calcularEstadoFacturas,
  type MovimientoHaber,
  type ReciboImputacion,
} from "./saldos"

// Helper: deuda por factura combinando el helper + calcularEstadoFacturas,
// replicando exactamente lo que hace facturacion/page.tsx (deudaMap).
function deudaPorFactura(
  facturas: { id: number; total: number; tipo?: string }[],
  ccData: MovimientoHaber[],
  recibos: ReciboImputacion[],
): Record<number, number> {
  const facturaTotalById = new Map<number, number>()
  for (const f of facturas) facturaTotalById.set(f.id, f.total)
  const movs = construirMovimientosPorFactura(ccData, recibos, facturaTotalById)
  const estados = calcularEstadoFacturas(
    facturas.map((f) => ({ id: f.id, total: f.total, tipo: f.tipo ?? "FACTURA A" })),
    movs,
  )
  const out: Record<number, number> = {}
  for (const f of facturas) out[f.id] = Math.max(0, estados.get(String(f.id))?.saldo ?? f.total)
  return out
}

describe("facturaIdsDeRecibo", () => {
  it("extrae ids con prefijo f- y descarta UUID legacy", () => {
    expect(facturaIdsDeRecibo(["f-137"])).toEqual([137])
    expect(facturaIdsDeRecibo(["f-135", "f-141"])).toEqual([135, 141])
    expect(facturaIdsDeRecibo(["034664e2-854f-4945-9bab-35c31502c846"])).toEqual([])
    expect(facturaIdsDeRecibo(["f-137", "abc-uuid"])).toEqual([137])
  })
  it("tolera valores no-array / vacíos", () => {
    expect(facturaIdsDeRecibo(null)).toEqual([])
    expect(facturaIdsDeRecibo(undefined)).toEqual([])
    expect(facturaIdsDeRecibo("f-1")).toEqual([])
    expect(facturaIdsDeRecibo([])).toEqual([])
  })
})

describe("construirMovimientosPorFactura — patrones reales (deuda → $0)", () => {
  // Patrón 137 (CO-0001): RC directo a la factura + RT vía recibo.
  it("137: RC directo 11,89 + RT 4,00 vía recibo → paga 15,89", () => {
    const cc: MovimientoHaber[] = [
      { referencia_id: "137", haber: 0 }, // FC (debe), haber 0
      { referencia_id: "137", haber: 11.89 }, // RC directo
      { referencia_id: "bed1f33e", haber: 4.0 }, // RT vía recibo
    ]
    const recibos: ReciboImputacion[] = [{ id: "bed1f33e", facturas_ids: ["f-137"] }]
    const deuda = deudaPorFactura([{ id: 137, total: 15.89 }], cc, recibos)
    expect(deuda[137]).toBe(0)
  })

  // Patrón 135 (CO-0002): RC directo + RT vía recibo (con otros totales).
  it("135: RC directo 58,72 + RT 10,00 vía recibo → paga 68,72", () => {
    const cc: MovimientoHaber[] = [
      { referencia_id: "135", haber: 58.72 },
      { referencia_id: "7f3af5b6", haber: 10.0 },
    ]
    const recibos: ReciboImputacion[] = [{ id: "7f3af5b6", facturas_ids: ["f-135"] }]
    const deuda = deudaPorFactura([{ id: 135, total: 68.72 }], cc, recibos)
    expect(deuda[135]).toBe(0)
  })

  // Patrón 141 (AQ-0002): RC íntegro vía recibo, sin referencia directa.
  it("141: RC 15,89 vía recibo (sin ref directa) → paga 15,89", () => {
    const cc: MovimientoHaber[] = [{ referencia_id: "618a32da", haber: 15.89 }]
    const recibos: ReciboImputacion[] = [{ id: "618a32da", facturas_ids: ["f-141"] }]
    const deuda = deudaPorFactura([{ id: 141, total: 15.89 }], cc, recibos)
    expect(deuda[141]).toBe(0)
  })
})

describe("construirMovimientosPorFactura — casos borde", () => {
  it("sin cobrar → deuda = total", () => {
    const deuda = deudaPorFactura([{ id: 200, total: 1000 }], [], [])
    expect(deuda[200]).toBe(1000)
  })

  it("UUID que no es recibo → no se resuelve, queda como deuda", () => {
    const cc: MovimientoHaber[] = [{ referencia_id: "no-es-un-recibo-uuid", haber: 500 }]
    const deuda = deudaPorFactura([{ id: 201, total: 1000 }], cc, [])
    expect(deuda[201]).toBe(1000)
  })

  it("referencia_id NULL → no se resuelve, queda como deuda", () => {
    const cc: MovimientoHaber[] = [{ referencia_id: null, haber: 500 }]
    const deuda = deudaPorFactura([{ id: 202, total: 1000 }], cc, [])
    expect(deuda[202]).toBe(1000)
  })

  it("sobre-imputación → deuda no queda negativa (max(0))", () => {
    const cc: MovimientoHaber[] = [
      { referencia_id: "203", haber: 800 },
      { referencia_id: "rec-x", haber: 500 }, // total acreditado 1300 > 1000
    ]
    const recibos: ReciboImputacion[] = [{ id: "rec-x", facturas_ids: ["f-203"] }]
    const deuda = deudaPorFactura([{ id: 203, total: 1000 }], cc, recibos)
    expect(deuda[203]).toBe(0)
  })

  it("cobro parcial → deuda = remanente", () => {
    const cc: MovimientoHaber[] = [{ referencia_id: "204", haber: 300 }]
    const deuda = deudaPorFactura([{ id: 204, total: 1000 }], cc, [])
    expect(deuda[204]).toBe(700)
  })

  it("recibo multi-factura → reparte proporcional al total de cada factura", () => {
    // Recibo paga 3000 sobre dos facturas (1000 y 2000) → 1000 y 2000.
    const cc: MovimientoHaber[] = [{ referencia_id: "rec-multi", haber: 3000 }]
    const recibos: ReciboImputacion[] = [{ id: "rec-multi", facturas_ids: ["f-300", "f-301"] }]
    const facturas = [
      { id: 300, total: 1000 },
      { id: 301, total: 2000 },
    ]
    const deuda = deudaPorFactura(facturas, cc, recibos)
    expect(deuda[300]).toBe(0)
    expect(deuda[301]).toBe(0)
  })

  it("no doble-cuenta: RC directo y RT vía recibo son filas distintas", () => {
    // Si sumara dos veces, la deuda daría negativa y max(0) la escondería;
    // verificamos el caso de cobro parcial para detectar doble conteo.
    const cc: MovimientoHaber[] = [
      { referencia_id: "137", haber: 5 }, // RC directo parcial
      { referencia_id: "rec", haber: 4 }, // RT vía recibo
    ]
    const recibos: ReciboImputacion[] = [{ id: "rec", facturas_ids: ["f-137"] }]
    const deuda = deudaPorFactura([{ id: 137, total: 15.89 }], cc, recibos)
    expect(deuda[137]).toBe(6.89) // 15.89 - 5 - 4, sin duplicar
  })
})
