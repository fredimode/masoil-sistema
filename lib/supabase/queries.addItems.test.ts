import { describe, it, expect, beforeEach, vi } from "vitest"

// Captura de lo que addItemsToOrder escribe en la BD, y total actual configurable.
const captured: { orderItemsRows: any[] | null; ordersUpdate: any; rpcCalls: any[] } = {
  orderItemsRows: null,
  ordersUpdate: null,
  rpcCalls: [],
}
let currentOrderTotal = 0

// Builder fluido mínimo que cubre las llamadas de addItemsToOrder:
//  - from("order_items").insert(rows)
//  - from("orders").select("total").eq(...).single()
//  - from("orders").update(vals).eq(...)
function makeBuilder(table: string): any {
  const builder: any = {
    insert: (rows: any) => {
      if (table === "order_items") captured.orderItemsRows = rows
      return Promise.resolve({ error: null })
    },
    update: (vals: any) => {
      if (table === "orders") captured.ordersUpdate = vals
      return { eq: () => Promise.resolve({ error: null }) }
    },
    select: () => builder,
    eq: () => builder,
    single: () => Promise.resolve({ data: { total: currentOrderTotal }, error: null }),
  }
  return builder
}

const mockClient = {
  from: (table: string) => makeBuilder(table),
  rpc: (name: string, args: any) => {
    captured.rpcCalls.push({ name, args })
    return Promise.resolve({ error: null })
  },
}

vi.mock("./client", () => ({ createClient: () => mockClient }))

import { addItemsToOrder } from "./queries"

beforeEach(() => {
  captured.orderItemsRows = null
  captured.ordersUpdate = null
  captured.rpcCalls = []
  currentOrderTotal = 0
})

describe("addItemsToOrder — guarda unit_price CON IVA", () => {
  it("convierte el precio NETO del catálogo a CON IVA (×1.21) al agregar a un pedido existente", async () => {
    await addItemsToOrder("order-1", [
      { productId: "prod-1", productCode: "AB0017", productName: "Producto", quantity: 2, price: 19965, tipoLinea: "producto" },
    ])
    const rows = captured.orderItemsRows!
    expect(rows).toHaveLength(1)
    // 19965 (neto) × 1.21 = 24157.65
    expect(rows[0].unit_price).toBe(24157.65)
    // El que se factura: unit_price / 1.21 recupera el neto (no sub-factura).
    expect(Math.round((rows[0].unit_price / 1.21) * 100) / 100).toBe(19965)
  })

  it("suma al orders.total el delta CON IVA (consistente con unit_price)", async () => {
    currentOrderTotal = 1000 // total previo (ya con IVA)
    await addItemsToOrder("order-1", [
      { productId: "prod-1", productCode: "X", productName: "P", quantity: 2, price: 100, tipoLinea: "producto" },
    ])
    // 2 × (100 × 1.21) = 2 × 121 = 242 → total = 1000 + 242
    expect(captured.ordersUpdate.total).toBe(1242)
  })

  it("preserva el signo negativo de los renglones de descuento (neto → con IVA)", async () => {
    await addItemsToOrder("order-1", [
      { productId: null, productCode: "DESCUENTO", productName: "Descuento", quantity: 1, price: -100, tipoLinea: "descuento" },
    ])
    // -100 × 1.21 = -121
    expect(captured.orderItemsRows![0].unit_price).toBe(-121)
  })
})
