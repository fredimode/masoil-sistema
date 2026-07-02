import { describe, it, expect, beforeEach, vi } from "vitest"

// Fila que devuelve el guard (assertRetencionEditable) al re-leer la retención.
let retencionRow: { id: string; recibo_id: string | null } | null = { id: "r1", recibo_id: null }
// Secuencia de mutaciones (insert/update/delete) para verificar orden y filtros.
const ops: { table: string; action: string; filters: [string, any][]; values: any }[] = []

function makeClient() {
  return {
    from(table: string) {
      const state: { action: string | null; filters: [string, any][]; values: any } = {
        action: null,
        filters: [],
        values: null,
      }
      const builder: any = {
        select: () => builder,
        insert: () => { state.action = "insert"; return builder },
        update: (v: any) => { state.action = "update"; state.values = v; return builder },
        delete: () => { state.action = "delete"; return builder },
        eq: (col: string, val: any) => { state.filters.push([col, val]); return builder },
        maybeSingle: () => Promise.resolve({ data: retencionRow, error: null }),
        single: () => Promise.resolve({ data: retencionRow, error: null }),
        // Terminal await para insert/update/delete → registra la mutación.
        then: (resolve: (v: any) => void) => {
          ops.push({ table, action: state.action!, filters: state.filters, values: state.values })
          resolve({ error: null })
        },
      }
      return builder
    },
  }
}

const mockClient = makeClient()
vi.mock("./client", () => ({ createClient: () => mockClient }))

import { esRetencionEditable, deleteRetencion, updateRetencion } from "./queries"

beforeEach(() => {
  ops.length = 0
  retencionRow = { id: "r1", recibo_id: null }
})

describe("esRetencionEditable", () => {
  it("suelta (recibo_id NULL/undefined) → editable", () => {
    expect(esRetencionEditable(null)).toBe(true)
    expect(esRetencionEditable(undefined)).toBe(true)
  })
  it("en recibo (recibo_id poblado) → NO editable", () => {
    expect(esRetencionEditable("bed1f33e-uuid")).toBe(false)
  })
})

describe("deleteRetencion", () => {
  it("suelta: borra el RT PRIMERO (referencia_id + tipo RT) y luego la retención", async () => {
    retencionRow = { id: "r1", recibo_id: null }
    await deleteRetencion("r1")
    expect(ops).toHaveLength(2)
    // 1º cuenta corriente (RT), 2º retención
    expect(ops[0].table).toBe("cuenta_corriente_cliente")
    expect(ops[0].action).toBe("delete")
    expect(ops[0].filters).toEqual([["referencia_id", "r1"], ["tipo_comprobante", "RT"]])
    expect(ops[1].table).toBe("retenciones")
    expect(ops[1].action).toBe("delete")
    expect(ops[1].filters).toEqual([["id", "r1"]])
  })

  it("en recibo: el guard del servidor la rechaza y NO borra nada", async () => {
    retencionRow = { id: "r1", recibo_id: "recibo-uuid" }
    await expect(deleteRetencion("r1")).rejects.toThrow(/recibo/i)
    expect(ops).toHaveLength(0)
  })

  it("inexistente: rechaza sin borrar", async () => {
    retencionRow = null
    await expect(deleteRetencion("r1")).rejects.toThrow(/no existe/i)
    expect(ops).toHaveLength(0)
  })
})

describe("updateRetencion", () => {
  it("suelta: sincroniza el RT (haber=importe, fecha, numero) ANTES de actualizar la retención", async () => {
    retencionRow = { id: "r1", recibo_id: null }
    await updateRetencion("r1", { tipo: "ARBA", numero_comprobante: "101", fecha: "2026-06-24", importe: 50 })
    expect(ops).toHaveLength(2)
    // 1º cuenta corriente (RT)
    expect(ops[0].table).toBe("cuenta_corriente_cliente")
    expect(ops[0].action).toBe("update")
    expect(ops[0].values).toEqual({ haber: 50, fecha: "2026-06-24", numero_comprobante: "101" })
    expect(ops[0].filters).toEqual([["referencia_id", "r1"], ["tipo_comprobante", "RT"]])
    // 2º retención
    expect(ops[1].table).toBe("retenciones")
    expect(ops[1].action).toBe("update")
    expect(ops[1].values).toEqual({ tipo: "ARBA", numero_comprobante: "101", fecha: "2026-06-24", importe: 50 })
  })

  it("numero_comprobante null → el RT guarda '' (no rompe el movimiento)", async () => {
    retencionRow = { id: "r1", recibo_id: null }
    await updateRetencion("r1", { importe: 20, numero_comprobante: null })
    expect(ops[0].values.numero_comprobante).toBe("")
    expect(ops[0].values.haber).toBe(20)
  })

  it("en recibo: el guard del servidor la rechaza y NO actualiza nada", async () => {
    retencionRow = { id: "r1", recibo_id: "recibo-uuid" }
    await expect(updateRetencion("r1", { importe: 999 })).rejects.toThrow(/recibo/i)
    expect(ops).toHaveLength(0)
  })
})
