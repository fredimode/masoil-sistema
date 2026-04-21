/**
 * Test Suite - Operaciones Supabase (CRUD principales).
 *
 * SEGURIDAD:
 *   - SOLO corre contra entornos de desarrollo/staging.
 *   - Si la URL contiene el ID del proyecto de producción, el script aborta.
 *   - Requiere pasar `--confirm` para ejecutar (evita ejecuciones accidentales).
 *
 * Uso:
 *   npx tsx scripts/test-operations.ts --confirm
 *
 * Requiere en .env.local:
 *   - SUPABASE_URL o NEXT_PUBLIC_SUPABASE_URL (NO producción)
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Cada test:
 *   - Crea datos con prefijo "TEST-BORRAR-*".
 *   - Limpia sus propias filas al final.
 *   - Si falla, el script continúa con el próximo test.
 *   - Resumen final: N passed / M failed.
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import * as path from "path"

dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const PROD_URL_FRAGMENT = "hidlasfyvvihounvxrie"
const TEST_PREFIX = "TEST-BORRAR"

const args = process.argv.slice(2)
const confirmed = args.includes("--confirm")

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

if (!supabaseUrl || !serviceKey) {
  console.error("❌ Faltan SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}

if (supabaseUrl.includes(PROD_URL_FRAGMENT)) {
  console.error("⛔ NO correr tests contra producción!")
  console.error(`   URL detectada: ${supabaseUrl}`)
  console.error("   Apuntá a un proyecto Supabase de dev/staging antes de ejecutar este script.")
  process.exit(1)
}

if (!confirmed) {
  console.error("⚠️  Tests destructivos - insertan y borran filas reales en la DB.")
  console.error(`   URL: ${supabaseUrl}`)
  console.error("   Pasá --confirm para ejecutar. Ej: npx tsx scripts/test-operations.ts --confirm")
  process.exit(1)
}

const supabase: SupabaseClient = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ---------------------------------------------------------------------------
// Runner state
// ---------------------------------------------------------------------------

const results: { name: string; status: "pass" | "fail"; error?: any }[] = []
const createdRows: { table: string; ids: string[] }[] = []

function trackForCleanup(table: string, id: string | string[]) {
  const ids = Array.isArray(id) ? id : [id]
  createdRows.push({ table, ids })
}

function formatError(e: any): string {
  if (!e) return "(error vacío)"
  const code = e.code ? ` code=${e.code}` : ""
  const details = e.details ? ` details=${e.details}` : ""
  const hint = e.hint ? ` hint=${e.hint}` : ""
  const msg = e.message || String(e)
  return `${msg}${code}${details}${hint}`
}

async function run(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`✅ PASS: ${name}`)
    results.push({ name, status: "pass" })
  } catch (e: any) {
    console.log(`❌ FAIL: ${name}: ${formatError(e)}`)
    if (process.env.VERBOSE_TESTS) console.error(e)
    results.push({ name, status: "fail", error: e })
  }
}

function rand(): string {
  return Math.random().toString(36).slice(2, 8)
}

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`)
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let fixtureClientId: string | null = null
let fixtureProductId: string | null = null
let fixtureProveedorId: string | null = null
let fixtureVendedorId: string | null = null

async function resolveVendedor(): Promise<string | null> {
  const { data } = await supabase.from("vendedores").select("id").limit(1).maybeSingle()
  return data?.id || null
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function testCreateProduct() {
  const code = `${TEST_PREFIX}-P-${rand()}`
  const { data, error } = await supabase
    .from("products")
    .insert({
      code,
      name: `${TEST_PREFIX}-producto-${rand()}`,
      category: null,
      price: 1000,
      stock: 10,
      is_customizable: false,
      custom_lead_time: 0,
      low_stock_threshold: 5,
      critical_stock_threshold: 2,
    })
    .select("id")
    .single()
  if (error) throw error
  assert(data?.id, "product id missing")
  fixtureProductId = data.id
  trackForCleanup("products", data.id)
}

async function testUpdateProduct() {
  if (!fixtureProductId) throw new Error("fixtureProductId no disponible")
  const newName = `${TEST_PREFIX}-producto-renamed-${rand()}`
  const { data, error } = await supabase
    .from("products")
    .update({ name: newName, price: 1500 })
    .eq("id", fixtureProductId)
    .select("name, price")
    .single()
  if (error) throw error
  assert(data?.name === newName, "name no actualizado")
  assert(Number(data?.price) === 1500, "price no actualizado")
}

async function testDeleteProducts() {
  const codes = [`${TEST_PREFIX}-bulk-${rand()}`, `${TEST_PREFIX}-bulk-${rand()}`]
  const { data, error } = await supabase
    .from("products")
    .insert(codes.map((code) => ({
      code,
      name: code,
      price: 1,
      stock: 0,
      is_customizable: false,
      custom_lead_time: 0,
      low_stock_threshold: 0,
      critical_stock_threshold: 0,
    })))
    .select("id")
  if (error) throw error
  const ids = (data || []).map((r) => r.id)
  const { error: delErr } = await supabase.from("products").delete().in("id", ids)
  if (delErr) throw delErr
  const { data: check } = await supabase.from("products").select("id").in("id", ids)
  assert((check?.length ?? 0) === 0, "productos bulk no fueron eliminados")
}

async function testCreateClient() {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      business_name: `${TEST_PREFIX}-cliente-${rand()}`,
      contact_name: "Contacto Test",
      whatsapp: "",
      email: "",
      zona: null,
      vendedor_id: null,
      address: "Dirección test",
      payment_terms: "30d",
      credit_limit: 0,
      notes: "",
    })
    .select("id")
    .single()
  if (error) throw error
  assert(data?.id, "client id missing")
  fixtureClientId = data.id
  trackForCleanup("clients", data.id)
}

async function testCreateProveedor() {
  const nombre = `${TEST_PREFIX}-prov-${rand()}`
  const { data, error } = await supabase
    .from("proveedores")
    .insert({
      nombre,
      cuit: "30000000000",
      condicion_pago: "30d",
    })
    .select("id")
    .single()
  if (error) throw error
  assert(data?.id, "proveedor id missing")
  fixtureProveedorId = data.id
  trackForCleanup("proveedores", data.id)
}

async function testCreateOrder() {
  if (!fixtureClientId || !fixtureProductId) throw new Error("fixtures no disponibles")
  const orderNumber = `${TEST_PREFIX}-ORD-${rand()}`
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      order_number_serial: `${TEST_PREFIX}-${rand()}`,
      client_id: fixtureClientId,
      client_name: `${TEST_PREFIX}-cliente`,
      vendedor_id: fixtureVendedorId,
      vendedor_name: "",
      zona: null,
      status: "INGRESADO",
      total: 2000,
      notes: `${TEST_PREFIX}`,
      is_custom: false,
      is_urgent: false,
      estimated_delivery: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    })
    .select("id")
    .single()
  if (orderError) throw orderError
  const orderId = orderData.id
  trackForCleanup("orders", orderId)

  const { error: itemsError } = await supabase.from("order_items").insert([{
    order_id: orderId,
    product_id: fixtureProductId,
    quantity: 2,
    unit_price: 1000,
    reservado: true,
    reservado_at: new Date().toISOString(),
  }])
  if (itemsError) throw itemsError

  const { error: histError } = await supabase.from("order_status_history").insert({
    order_id: orderId,
    status: "INGRESADO",
    changed_by: fixtureVendedorId,
  })
  if (histError) throw histError

  const { data: check } = await supabase
    .from("orders")
    .select("id, status, order_items(id), order_status_history(id)")
    .eq("id", orderId)
    .single()
  assert(check?.status === "INGRESADO", "estado orden incorrecto")
  assert((check?.order_items?.length ?? 0) >= 1, "order_items no creados")
  assert((check?.order_status_history?.length ?? 0) >= 1, "order_status_history no creado")
}

async function testUpdateOrderStatus() {
  if (!fixtureClientId) throw new Error("fixtureClientId no disponible")
  const orderNumber = `${TEST_PREFIX}-STATE-${rand()}`
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      order_number_serial: `${TEST_PREFIX}-${rand()}`,
      client_id: fixtureClientId,
      client_name: `${TEST_PREFIX}-cliente`,
      vendedor_id: fixtureVendedorId,
      vendedor_name: "",
      zona: null,
      status: "INGRESADO",
      total: 100,
      notes: TEST_PREFIX,
      is_custom: false,
      is_urgent: false,
    })
    .select("id")
    .single()
  if (orderError) throw orderError
  const orderId = orderData.id
  trackForCleanup("orders", orderId)

  const { error: updErr } = await supabase
    .from("orders")
    .update({ status: "EN_PREPARACION", updated_at: new Date().toISOString() })
    .eq("id", orderId)
  if (updErr) throw updErr

  const { data: after } = await supabase.from("orders").select("status").eq("id", orderId).single()
  assert(after?.status === "EN_PREPARACION", "estado no cambió a PREPARADO")

  const { error: histErr } = await supabase.from("order_status_history").insert({
    order_id: orderId,
    status: "EN_PREPARACION",
    changed_by: fixtureVendedorId,
  })
  if (histErr) throw histErr

  const { error: revertErr } = await supabase.from("orders").update({ status: "INGRESADO" }).eq("id", orderId)
  if (revertErr) throw revertErr
  const { data: reverted } = await supabase.from("orders").select("status").eq("id", orderId).single()
  assert(reverted?.status === "INGRESADO", "revert falló")
}

async function testCreateCotizacionVenta(): Promise<string> {
  if (!fixtureClientId || !fixtureProductId) throw new Error("fixtures no disponibles")
  const numero = `${TEST_PREFIX}-COT-${rand()}`
  const { data: cotData, error: cotErr } = await supabase
    .from("cotizaciones_venta")
    .insert({
      numero,
      fecha: new Date().toISOString().slice(0, 10),
      client_id: fixtureClientId,
      client_name: `${TEST_PREFIX}-cliente`,
      vendedor_id: fixtureVendedorId,
      zona: null,
      total: 2000,
      estado: "pendiente",
      observaciones: TEST_PREFIX,
    })
    .select("id")
    .single()
  if (cotErr) throw cotErr
  const cotId = cotData.id
  trackForCleanup("cotizaciones_venta", cotId)

  const { error: itemsErr } = await supabase.from("cotizacion_venta_items").insert([{
    cotizacion_id: cotId,
    product_id: fixtureProductId,
    producto_nombre: `${TEST_PREFIX}-producto`,
    producto_codigo: `${TEST_PREFIX}-P`,
    cantidad: 2,
    precio_unitario: 1000,
    subtotal: 2000,
    aprobado: true,
  }])
  if (itemsErr) throw itemsErr

  const { data: check } = await supabase
    .from("cotizaciones_venta")
    .select("id, estado")
    .eq("id", cotId)
    .single()
  assert(check?.estado === "pendiente", "cotización no quedó en estado pendiente")
  return cotId
}

async function testConvertCotizacionToPedido() {
  if (!fixtureClientId || !fixtureProductId) throw new Error("fixtures no disponibles")
  // 1. Crear cotización con 1 item aprobado
  const numero = `${TEST_PREFIX}-CONV-${rand()}`
  const { data: cotData, error: cotErr } = await supabase
    .from("cotizaciones_venta")
    .insert({
      numero,
      fecha: new Date().toISOString().slice(0, 10),
      client_id: fixtureClientId,
      client_name: `${TEST_PREFIX}-cliente`,
      vendedor_id: fixtureVendedorId,
      zona: null,
      total: 1500,
      estado: "aprobada",
    })
    .select("id, numero, client_name, vendedor_id, zona, observaciones")
    .single()
  if (cotErr) throw cotErr
  const cotId = cotData.id
  trackForCleanup("cotizaciones_venta", cotId)

  const { data: itemData, error: itemErr } = await supabase
    .from("cotizacion_venta_items")
    .insert([{
      cotizacion_id: cotId,
      product_id: fixtureProductId,
      producto_nombre: "item-convert",
      cantidad: 3,
      precio_unitario: 500,
      subtotal: 1500,
      aprobado: true,
    }])
    .select("id, product_id, producto_nombre, cantidad, precio_unitario, subtotal")
  if (itemErr) throw itemErr
  assert((itemData || []).length === 1, "item cotización no se creó")

  // 2. Crear pedido a partir de los items aprobados
  const orderNumber = `${TEST_PREFIX}-FROM-COT-${rand()}`
  const vendedorIdSafe = fixtureVendedorId && fixtureVendedorId.trim() !== "" ? fixtureVendedorId : null
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      order_number_serial: `${TEST_PREFIX}-${rand()}`,
      client_id: fixtureClientId,
      client_name: cotData.client_name,
      vendedor_id: vendedorIdSafe,
      vendedor_name: "",
      zona: cotData.zona,
      status: "INGRESADO",
      total: 1500,
      notes: `Origen: Cotización ${cotData.numero}`,
      is_custom: false,
      is_urgent: false,
    })
    .select("id")
    .single()
  if (orderError) throw orderError
  const orderId = orderData.id
  trackForCleanup("orders", orderId)

  const { error: oiErr } = await supabase.from("order_items").insert((itemData || []).map((i) => ({
    order_id: orderId,
    product_id: i.product_id || null,
    quantity: i.cantidad,
    unit_price: i.precio_unitario,
    reservado: true,
    reservado_at: new Date().toISOString(),
  })))
  if (oiErr) throw oiErr

  const { error: histErr } = await supabase.from("order_status_history").insert({
    order_id: orderId,
    status: "INGRESADO",
    changed_by: vendedorIdSafe,
  })
  if (histErr) throw histErr

  // 3. Linkear cotización al pedido y marcar como convertida
  const { error: linkErr } = await supabase
    .from("cotizaciones_venta")
    .update({ estado: "convertida_pedido", order_id: orderId })
    .eq("id", cotId)
  if (linkErr) throw linkErr

  const { data: finalCot } = await supabase
    .from("cotizaciones_venta")
    .select("estado, order_id")
    .eq("id", cotId)
    .single()
  assert(finalCot?.estado === "convertida_pedido", "cotización no quedó marcada como convertida")
  assert(finalCot?.order_id === orderId, "cotización no apunta al pedido creado")
}

async function testCreateFactura() {
  if (!fixtureClientId) throw new Error("fixtureClientId no disponible")
  // Pedido base para la factura
  const { data: orderData, error: orderErr } = await supabase
    .from("orders")
    .insert({
      order_number: `${TEST_PREFIX}-FCT-${rand()}`,
      order_number_serial: `${TEST_PREFIX}-${rand()}`,
      client_id: fixtureClientId,
      client_name: `${TEST_PREFIX}-cliente`,
      vendedor_id: fixtureVendedorId,
      vendedor_name: "",
      zona: null,
      status: "INGRESADO",
      total: 1210,
      notes: TEST_PREFIX,
      is_custom: false,
      is_urgent: false,
    })
    .select("id")
    .single()
  if (orderErr) throw orderErr
  const orderId = orderData.id
  trackForCleanup("orders", orderId)

  const { data: facData, error: facErr } = await supabase
    .from("facturas")
    .insert({
      order_id: orderId,
      numero: `${TEST_PREFIX}-FC-${rand()}`,
      tipo: "Factura B",
      fecha: new Date().toISOString().slice(0, 10),
      cuit_cliente: "20000000000",
      razon_social: `${TEST_PREFIX}-razon-social`,
      base_gravada: 1000,
      iva_21: 210,
      total: 1210,
    })
    .select("id")
    .single()
  if (facErr) throw facErr
  assert(facData?.id, "factura id missing")
  trackForCleanup("facturas", facData.id)

  const { data: check } = await supabase.from("facturas").select("total").eq("id", facData.id).single()
  assert(Number(check?.total) === 1210, "total factura incorrecto")
}

async function testCreatePagoProveedor() {
  if (!fixtureProveedorId) throw new Error("fixtureProveedorId no disponible")
  const { data, error } = await supabase
    .from("pagos_proveedores")
    .insert({
      proveedor_id: fixtureProveedorId,
      proveedor_nombre: `${TEST_PREFIX}-prov`,
      cuit: "30000000000",
      fecha_fc: new Date().toISOString().slice(0, 10),
      numero_fc: `${TEST_PREFIX}-NF-${rand()}`,
      importe: 500,
      forma_pago: "transferencia",
      estado_pago: "pendiente",
      observaciones: TEST_PREFIX,
    })
    .select("id")
    .single()
  if (error) throw error
  assert(data?.id, "pago id missing")
  trackForCleanup("pagos_proveedores", data.id)
}

async function testCreateReciboCobro() {
  if (!fixtureClientId) throw new Error("fixtureClientId no disponible")
  const { data: numData, error: numErr } = await supabase.rpc("nextval", { seq_name: "recibo_cobranza_numero_seq" } as any)
  // rpc("nextval",...) puede no estar expuesto; generamos número random en su lugar.
  const numero = !numErr && numData ? Number(numData) : Math.floor(Math.random() * 1000000)

  const { data, error } = await supabase
    .from("recibos_cobranza")
    .insert({
      numero,
      fecha: new Date().toISOString().slice(0, 10),
      client_id: fixtureClientId,
      cuit_cliente: "20000000000",
      razon_social_cliente: `${TEST_PREFIX}-razon-social`,
      vendedor_id: fixtureVendedorId,
      vendedor_nombre: "",
      total_facturas: 500,
      total_retenciones: 0,
      total_valores: 500,
      saldo_a_favor: 0,
      medios_pago: [{ tipo: "transferencia", importe: 500 }],
      facturas_ids: [],
      observaciones: TEST_PREFIX,
      estado: "confirmado",
    })
    .select("id")
    .single()
  if (error) throw error
  assert(data?.id, "recibo id missing")
  trackForCleanup("recibos_cobranza", data.id)
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

async function cleanup() {
  console.log("\n🧹 Limpieza de datos de prueba...")
  // Orden inverso: primero hijos, después padres
  const orderedTables = [
    "cotizacion_venta_items",
    "cotizaciones_venta",
    "order_items",
    "order_status_history",
    "facturas",
    "pagos_proveedores",
    "recibos_cobranza",
    "orders",
    "products",
    "clients",
    "proveedores",
  ]
  // Indexar ids por tabla
  const idsByTable = new Map<string, Set<string>>()
  for (const row of createdRows) {
    const set = idsByTable.get(row.table) || new Set<string>()
    row.ids.forEach((id) => set.add(id))
    idsByTable.set(row.table, set)
  }
  for (const table of orderedTables) {
    const ids = idsByTable.get(table)
    if (!ids || ids.size === 0) continue
    const arr = Array.from(ids)
    const { error } = await supabase.from(table).delete().in("id", arr)
    if (error) {
      console.log(`⚠️  cleanup ${table}: ${formatError(error)}`)
    } else {
      console.log(`   - ${table}: ${arr.length} fila(s) eliminadas`)
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`🚀 Corriendo tests contra: ${supabaseUrl}\n`)

  fixtureVendedorId = await resolveVendedor()
  if (!fixtureVendedorId) {
    console.log("ℹ️  No se encontró ningún vendedor en la tabla; se usarán null en vendedor_id/changed_by.")
  }

  await run("createProduct", testCreateProduct)
  await run("updateProduct", testUpdateProduct)
  await run("deleteProducts (bulk)", testDeleteProducts)
  await run("createClient", testCreateClient)
  await run("createProveedor", testCreateProveedor)
  await run("createOrder (con items + status history)", testCreateOrder)
  await run("updateOrderStatus", testUpdateOrderStatus)
  await run("createCotizacionVenta", async () => { await testCreateCotizacionVenta() })
  await run("convertCotizacionToPedido", testConvertCotizacionToPedido)
  await run("createFactura", testCreateFactura)
  await run("createPagoProveedor", testCreatePagoProveedor)
  await run("createReciboCobro", testCreateReciboCobro)

  await cleanup()

  const passed = results.filter((r) => r.status === "pass").length
  const failed = results.filter((r) => r.status === "fail").length
  console.log(`\n📊 Resumen: ${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log("Tests fallidos:")
    for (const r of results.filter((r) => r.status === "fail")) {
      console.log(`   - ${r.name}: ${formatError(r.error)}`)
    }
    process.exit(1)
  }
}

main().catch((e) => {
  console.error("💥 Error fatal en el runner:", e)
  process.exit(1)
})
