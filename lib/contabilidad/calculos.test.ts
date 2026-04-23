import { describe, it, expect } from "vitest"
import {
  mesAnoToRange,
  fechaEnRango,
  mapFacturaGPToSubdiarioRow,
  mapFacturaNuevaToSubdiarioRow,
  calcularIvaAPagar,
} from "./calculos"

describe("mesAnoToRange", () => {
  it("genera rango para abril 2026", () => {
    expect(mesAnoToRange("4", "2026")).toEqual({ desde: "2026-04-01", hasta: "2026-04-30" })
  })

  it("respeta febrero año bisiesto (29 días)", () => {
    expect(mesAnoToRange("2", "2024")).toEqual({ desde: "2024-02-01", hasta: "2024-02-29" })
  })

  it("febrero año no bisiesto (28 días)", () => {
    expect(mesAnoToRange("2", "2026")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" })
  })

  it("enero tiene 31 días", () => {
    expect(mesAnoToRange("1", "2026")).toEqual({ desde: "2026-01-01", hasta: "2026-01-31" })
  })

  it("diciembre tiene 31 días", () => {
    expect(mesAnoToRange("12", "2026")).toEqual({ desde: "2026-12-01", hasta: "2026-12-31" })
  })

  it("acepta números además de strings", () => {
    expect(mesAnoToRange(4, 2026)).toEqual({ desde: "2026-04-01", hasta: "2026-04-30" })
  })
})

describe("fechaEnRango", () => {
  it("acepta fecha dentro del rango", () => {
    expect(fechaEnRango("2026-04-15", "2026-04-01", "2026-04-30")).toBe(true)
  })
  it("acepta los bordes", () => {
    expect(fechaEnRango("2026-04-01", "2026-04-01", "2026-04-30")).toBe(true)
    expect(fechaEnRango("2026-04-30", "2026-04-01", "2026-04-30")).toBe(true)
  })
  it("rechaza fecha fuera del rango", () => {
    expect(fechaEnRango("2026-03-31", "2026-04-01", "2026-04-30")).toBe(false)
    expect(fechaEnRango("2026-05-01", "2026-04-01", "2026-04-30")).toBe(false)
  })
  it("null/undefined nunca están en rango", () => {
    expect(fechaEnRango(null, "2026-04-01", "2026-04-30")).toBe(false)
    expect(fechaEnRango(undefined, "2026-04-01", "2026-04-30")).toBe(false)
  })
})

describe("mapFacturaNuevaToSubdiarioRow (regresión: columnas reales de tabla facturas)", () => {
  it("lee base_gravada e iva_21 (schema real) — no f.neto ni f.iva", () => {
    const result = mapFacturaNuevaToSubdiarioRow({
      fecha: "2026-04-09",
      tipo: "Factura A",
      numero: "00005-00000006",
      razon_social: "FEDERICO Y MIGUEL TALLER INTEGRAL S.A.",
      cuit_cliente: "30-12345678-9",
      base_gravada: 1000,
      iva_21: 210,
      total: 1210,
    })
    expect(result.neto).toBe(1000)
    expect(result.iva21).toBe(210)
    expect(result.total).toBe(1210)
    expect(result.cuit).toBe("30-12345678-9")
    expect(result.cliente).toBe("FEDERICO Y MIGUEL TALLER INTEGRAL S.A.")
    expect(result.tipo_nro).toBe("Factura A 00005-00000006")
  })

  it("devuelve 0 cuando los montos son null/undefined", () => {
    const result = mapFacturaNuevaToSubdiarioRow({
      fecha: "2026-04-09",
      razon_social: "Cliente X",
      total: 500,
    })
    expect(result.neto).toBe(0)
    expect(result.iva21).toBe(0)
    expect(result.total).toBe(500)
  })

  it("maneja factura completamente vacía sin crashear", () => {
    const result = mapFacturaNuevaToSubdiarioRow({})
    expect(result.fecha).toBe("")
    expect(result.cliente).toBe("")
    expect(result.neto).toBe(0)
    expect(result.total).toBe(0)
    expect(result.tipo_nro).toBe("FC ")
  })
})

describe("mapFacturaGPToSubdiarioRow (facturas_gestionpro: campos viejos)", () => {
  it("lee impuestos (no iva_21) — schema de GestionPro", () => {
    const result = mapFacturaGPToSubdiarioRow({
      fecha: "2026-04-08",
      tipo_comprobante: "Factura A",
      sucursal: "00005",
      nro_comprobante: "00000003",
      letra: "A",
      razon_social: "A RUSSONIELLO SA",
      documento: "30-57501952-4",
      neto: 1130,
      impuestos: 237,
      total: 1367,
    })
    expect(result.neto).toBe(1130)
    expect(result.iva21).toBe(237)
    expect(result.total).toBe(1367)
    expect(result.cuit).toBe("30-57501952-4")
    expect(result.tipo_nro).toBe("Factura A 00005-00000003-A")
  })
})

describe("calcularIvaAPagar (el bug original)", () => {
  it("suma IVA 21 de GP (f.impuestos) + sistema nuevo (f.iva_21)", () => {
    const result = calcularIvaAPagar(
      [{ fecha: "2026-04-05", impuestos: 210 }],
      [{ fecha: "2026-04-10", iva_21: 105 }],
      [],
      "2026-04-01",
      "2026-04-30",
    )
    expect(result.debIVA21).toBe(315)
  })

  it("resta créditos (IVA de compras) y percepciones IVA", () => {
    const result = calcularIvaAPagar(
      [],
      [{ fecha: "2026-04-10", iva_21: 1000 }],
      [{ fecha: "2026-04-15", iva: 200, percepciones_iva: 50 }],
      "2026-04-01",
      "2026-04-30",
    )
    expect(result.credIVA).toBe(200)
    expect(result.percIVA).toBe(50)
    expect(result.total).toBe(750) // 1000 - 200 - 50
  })

  it("excluye facturas fuera del rango", () => {
    const result = calcularIvaAPagar(
      [
        { fecha: "2026-04-05", impuestos: 100 },
        { fecha: "2026-03-30", impuestos: 999 },
        { fecha: "2026-05-01", impuestos: 888 },
      ],
      [],
      [],
      "2026-04-01",
      "2026-04-30",
    )
    expect(result.debIVA21).toBe(100)
  })

  it("maneja todo vacío devolviendo ceros", () => {
    expect(calcularIvaAPagar([], [], [], "2026-04-01", "2026-04-30")).toEqual({
      debIVA21: 0,
      credIVA: 0,
      percIVA: 0,
      total: 0,
    })
  })

  it("reproduce el bug arreglado: si leyera f.iva en vez de f.iva_21, daría 0", () => {
    // Este test existe para bloquear la regresión del commit 79b6d48
    const factura = { fecha: "2026-04-10", iva_21: 500 }
    const result = calcularIvaAPagar([], [factura], [], "2026-04-01", "2026-04-30")
    expect(result.debIVA21).toBe(500) // si el código usara f.iva sería 0
  })
})
