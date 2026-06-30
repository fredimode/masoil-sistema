import { describe, it, expect } from "vitest"
import {
  baseProductos,
  montoDescuentoGeneral,
  construirLineaDescuentoGeneral,
  calcularTotales,
  netoAConIva,
  CODIGO_DESCUENTO_GENERAL,
  type LineaCalculo,
} from "./descuentos"

const prod = (price: number, quantity = 1): LineaCalculo => ({ price, quantity, tipoLinea: "producto" })
const libre = (price: number, quantity = 1): LineaCalculo => ({ price, quantity, tipoLinea: "libre" })
const desc = (price: number): LineaCalculo => ({ price, quantity: 1, tipoLinea: "descuento" })

describe("netoAConIva", () => {
  it("aplica el 21% y redondea a 2 decimales", () => {
    expect(netoAConIva(100)).toBe(121)
    expect(netoAConIva(554.28)).toBe(670.68) // 554.28 × 1.21 = 670.6788 → 670.68
  })

  it("preserva el signo negativo (líneas de descuento)", () => {
    expect(netoAConIva(-30)).toBe(-36.3)
  })

  it("tolera 0 / valores inválidos", () => {
    expect(netoAConIva(0)).toBe(0)
    expect(netoAConIva(NaN)).toBe(0)
  })

  it("revierte exacto al dividir por 1.21 en la facturación (no sub-factura)", () => {
    // El bug: la conversión guardaba neto sin ×1.21 y la FC dividía /1.21.
    // Con el helper, neto→conIVA→/1.21 recupera el neto (módulo redondeo).
    const neto = 19965
    expect(Math.round((netoAConIva(neto) / 1.21) * 100) / 100).toBe(neto)
  })
})

describe("baseProductos", () => {
  it("suma el neto de los productos", () => {
    expect(baseProductos([prod(100), prod(50, 2)])).toBe(200)
  })

  it("excluye renglones de descuento (no descuenta sobre descuentos)", () => {
    expect(baseProductos([prod(100), desc(-20)])).toBe(100)
  })

  it("excluye líneas libres NEGATIVAS (actúan como descuento)", () => {
    expect(baseProductos([prod(100), libre(-30)])).toBe(100)
  })

  it("incluye líneas libres POSITIVAS (cargo/producto manual)", () => {
    expect(baseProductos([prod(100), libre(40)])).toBe(140)
  })

  it("usa el precio editado a mano de la línea", () => {
    expect(baseProductos([prod(90)])).toBe(90)
  })
})

describe("montoDescuentoGeneral", () => {
  it("caso de prueba: 5% sobre $100 → -5", () => {
    expect(montoDescuentoGeneral([prod(100)], 5)).toBe(-5)
  })

  it("caso de prueba: precio editado a $90, 5% → -4.5", () => {
    expect(montoDescuentoGeneral([prod(90)], 5)).toBe(-4.5)
  })

  it("0% → 0 (sin renglón)", () => {
    expect(montoDescuentoGeneral([prod(100)], 0)).toBe(0)
  })

  it("pct negativo o inválido → 0", () => {
    expect(montoDescuentoGeneral([prod(100)], -3)).toBe(0)
    expect(montoDescuentoGeneral([prod(100)], NaN)).toBe(0)
  })

  it("base 0 (sin productos) → 0", () => {
    expect(montoDescuentoGeneral([desc(-10)], 5)).toBe(0)
  })

  it("no descuenta sobre el descuento manual: 10% de $100 (con desc -20) → -10, no -8", () => {
    // base = 100 (el -20 manual no entra), 10% = -10
    expect(montoDescuentoGeneral([prod(100), desc(-20)], 10)).toBe(-10)
  })

  it("redondea a 2 decimales", () => {
    // 333.33 * 5% = 16.6665 → -16.67
    expect(montoDescuentoGeneral([prod(333.33)], 5)).toBe(-16.67)
  })
})

describe("construirLineaDescuentoGeneral", () => {
  it("arma el renglón negativo con código sentinela y descripción", () => {
    const linea = construirLineaDescuentoGeneral([prod(100)], 5)
    expect(linea).toEqual({
      descripcion: "Descuento general (5%)",
      productCode: CODIGO_DESCUENTO_GENERAL,
      quantity: 1,
      price: -5,
      tipoLinea: "descuento",
    })
  })

  it("porcentaje con decimales en la descripción", () => {
    const linea = construirLineaDescuentoGeneral([prod(100)], 7.5)
    expect(linea?.descripcion).toBe("Descuento general (7.5%)")
    expect(linea?.price).toBe(-7.5)
  })

  it("devuelve null cuando no corresponde (0%)", () => {
    expect(construirLineaDescuentoGeneral([prod(100)], 0)).toBeNull()
  })
})

describe("calcularTotales", () => {
  it("caso de prueba completo: 5% sobre producto $100 neto", () => {
    // Renglón -$5, subtotal $95, IVA $19,95, total $114,95
    const t = calcularTotales([prod(100)], 5)
    expect(t.subtotalProductos).toBe(100)
    expect(t.descuentoGeneral).toBe(-5)
    expect(t.subtotalSinIva).toBe(95)
    expect(t.iva).toBe(19.95)
    expect(t.total).toBe(114.95)
  })

  it("caso con precio editado a $90 + 5%", () => {
    const t = calcularTotales([prod(90)], 5)
    expect(t.descuentoGeneral).toBe(-4.5)
    expect(t.subtotalSinIva).toBe(85.5)
    // 85.5 * 0.21 = 17.955, pero en float es 17.9549… → Math.round → 17.95.
    // Idéntico al redondeo Math.round(x*100)/100 que usa todo el sistema.
    expect(t.iva).toBe(17.95)
    expect(t.total).toBe(103.45)
  })

  it("combina descuento de línea manual + descuento general (sin descontar sobre el descuento)", () => {
    // Producto $100 + descuento manual -$10. Base general = 100 (no incluye el -10).
    // General 5% = -5. subtotalSinIva = 100 - 10 - 5 = 85.
    const t = calcularTotales([prod(100), desc(-10)], 5)
    expect(t.subtotalProductos).toBe(100)
    expect(t.descuentoGeneral).toBe(-5)
    expect(t.subtotalSinIva).toBe(85)
    expect(t.iva).toBe(17.85)
    expect(t.total).toBe(102.85)
  })

  it("sin descuento general (0%) se comporta como hoy", () => {
    const t = calcularTotales([prod(100), prod(50, 2)], 0)
    expect(t.descuentoGeneral).toBe(0)
    expect(t.subtotalSinIva).toBe(200)
    expect(t.iva).toBe(42)
    expect(t.total).toBe(242)
  })
})
