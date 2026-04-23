import { describe, it, expect } from "vitest"
import {
  formatCurrency,
  formatDate,
  formatDateStr,
  getDaysRemaining,
  getStockStatus,
  formatMoney,
  normalizeSearch,
} from "./utils"

describe("formatCurrency", () => {
  it("formato pesos argentinos sin decimales", () => {
    // Intl puede usar U+00A0 (nbsp) entre $ y número
    const result = formatCurrency(1500)
    expect(result).toMatch(/\$\s?1\.500/)
  })

  it("cero", () => {
    expect(formatCurrency(0)).toMatch(/\$\s?0/)
  })

  it("redondea decimales (minimumFractionDigits: 0)", () => {
    expect(formatCurrency(1234.78)).toMatch(/\$\s?1\.235/)
  })

  it("negativos", () => {
    expect(formatCurrency(-500)).toMatch(/-\s?\$\s?500/)
  })
})

describe("formatMoney", () => {
  it("ARS con 2 decimales por default", () => {
    expect(formatMoney(1500)).toMatch(/\$\s?1\.500,00/)
  })

  it("USD con locale en-US", () => {
    expect(formatMoney(1500, "USD")).toBe("$1,500.00")
  })

  it("decimales configurables", () => {
    expect(formatMoney(1500, "ARS", 0)).toMatch(/\$\s?1\.500$/)
  })
})

describe("getStockStatus", () => {
  it("0 stock → sin-stock", () => {
    expect(getStockStatus(0, 10, 5)).toBe("sin-stock")
  })

  it("stock bajo del crítico → critico", () => {
    expect(getStockStatus(3, 10, 5)).toBe("critico")
  })

  it("stock entre crítico y bajo → bajo", () => {
    expect(getStockStatus(7, 10, 5)).toBe("bajo")
  })

  it("stock sobre el umbral bajo → disponible", () => {
    expect(getStockStatus(20, 10, 5)).toBe("disponible")
  })

  it("exactamente el umbral bajo → disponible (no bajo)", () => {
    expect(getStockStatus(10, 10, 5)).toBe("disponible")
  })

  it("exactamente el umbral crítico → bajo (no crítico)", () => {
    expect(getStockStatus(5, 10, 5)).toBe("bajo")
  })
})

describe("normalizeSearch", () => {
  it("quita acentos", () => {
    expect(normalizeSearch("Córdoba")).toBe("cordoba")
    expect(normalizeSearch("JOSÉ")).toBe("jose")
  })

  it("baja a minúsculas", () => {
    expect(normalizeSearch("RUSSONIELLO")).toBe("russoniello")
  })

  it("preserva espacios y signos", () => {
    expect(normalizeSearch("A.H.P. S.A.")).toBe("a.h.p. s.a.")
  })

  it("string vacío", () => {
    expect(normalizeSearch("")).toBe("")
  })
})

describe("formatDateStr", () => {
  it("formato YYYY-MM-DD → DD/MM/YYYY", () => {
    expect(formatDateStr("2026-04-23")).toBe("23/04/2026")
  })

  it("ISO con timestamp → DD/MM/YYYY", () => {
    expect(formatDateStr("2026-04-23T10:30:00.000Z")).toBe("23/04/2026")
  })

  it("ya formateado DD/MM/YYYY se preserva", () => {
    expect(formatDateStr("23/04/2026")).toBe("23/04/2026")
  })

  it("null devuelve guión", () => {
    expect(formatDateStr(null)).toBe("-")
  })

  it("undefined devuelve guión", () => {
    expect(formatDateStr(undefined)).toBe("-")
  })

  it("string vacío devuelve guión", () => {
    expect(formatDateStr("")).toBe("-")
  })

  it('strings "null" o "undefined" devuelven guión', () => {
    expect(formatDateStr("null")).toBe("-")
    expect(formatDateStr("undefined")).toBe("-")
  })

  it("acepta Date", () => {
    expect(formatDateStr(new Date(2026, 3, 23))).toBe("23/04/2026")
  })

  it("Date inválida devuelve guión", () => {
    expect(formatDateStr(new Date("no-valida"))).toBe("-")
  })

  it("basura sin patrón reconocido devuelve guión", () => {
    expect(formatDateStr("no es una fecha")).toBe("-")
  })
})

describe("formatDate", () => {
  it("formato argentino DD/MM/YYYY para Date", () => {
    expect(formatDate(new Date(2026, 3, 23))).toBe("23/04/2026")
  })
})

describe("getDaysRemaining", () => {
  it("fecha futura devuelve positivo", () => {
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    expect(getDaysRemaining(future)).toBeGreaterThanOrEqual(4)
    expect(getDaysRemaining(future)).toBeLessThanOrEqual(5)
  })

  it("fecha pasada devuelve negativo", () => {
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    expect(getDaysRemaining(past)).toBeLessThan(0)
  })
})
