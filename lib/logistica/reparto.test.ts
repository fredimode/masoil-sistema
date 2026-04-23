import { describe, it, expect } from "vitest"
import { proximoDiaHabil, formatNumeroReparto } from "./reparto"

describe("formatNumeroReparto", () => {
  it("formato DDMMYYYY para una fecha normal", () => {
    expect(formatNumeroReparto(new Date(2026, 3, 23))).toBe("23042026") // abril=3 (0-indexed)
  })

  it("paddea día y mes con cero", () => {
    expect(formatNumeroReparto(new Date(2026, 0, 5))).toBe("05012026") // 5 de enero
  })

  it("diciembre 31", () => {
    expect(formatNumeroReparto(new Date(2026, 11, 31))).toBe("31122026")
  })
})

describe("proximoDiaHabil", () => {
  it("de miércoles devuelve jueves", () => {
    // 2026-04-22 es miércoles
    const next = proximoDiaHabil(new Date(2026, 3, 22))
    expect(next.getDate()).toBe(23)
    expect(next.getDay()).toBe(4) // jueves
  })

  it("de viernes salta el fin de semana y devuelve lunes", () => {
    // 2026-04-24 es viernes
    const next = proximoDiaHabil(new Date(2026, 3, 24))
    expect(next.getDate()).toBe(27) // lunes
    expect(next.getDay()).toBe(1)
  })

  it("de sábado devuelve lunes", () => {
    // 2026-04-25 es sábado
    const next = proximoDiaHabil(new Date(2026, 3, 25))
    expect(next.getDate()).toBe(27)
    expect(next.getDay()).toBe(1)
  })

  it("de domingo devuelve lunes", () => {
    // 2026-04-26 es domingo
    const next = proximoDiaHabil(new Date(2026, 3, 26))
    expect(next.getDate()).toBe(27)
    expect(next.getDay()).toBe(1)
  })

  it("cruza fin de mes: 30 de abril (jueves) → 1 de mayo", () => {
    const next = proximoDiaHabil(new Date(2026, 3, 30))
    expect(next.getMonth()).toBe(4) // mayo
    expect(next.getDate()).toBe(1)
  })

  it("cruza fin de año: 31 de diciembre → día hábil siguiente", () => {
    // 2026-12-31 es jueves
    const next = proximoDiaHabil(new Date(2026, 11, 31))
    expect(next.getFullYear()).toBe(2027)
    expect(next.getMonth()).toBe(0) // enero
    expect(next.getDate()).toBe(1) // jueves 1/ene/2027
  })
})
