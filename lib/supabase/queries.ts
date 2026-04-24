import { createClient as createSupabaseClient } from "./client"
import type { Order, OrderProduct, StatusChange, Product, Client, Vendedor, OrderStatus, Zona } from "../types"

// ---------------------------------------------------------------------------
// Helpers: snake_case → camelCase mapping
// ---------------------------------------------------------------------------

function mapOrder(row: any): Order {
  return {
    id: row.id,
    orderNumber: row.order_number_serial || row.order_number || row.id.slice(0, 8),
    clientId: row.client_id,
    clientName: row.client_name,
    vendedorId: row.vendedor_id,
    vendedorName: row.vendedor_name,
    zona: row.zona as Zona,
    status: row.status as OrderStatus,
    total: Number(row.total),
    notes: row.notes || "",
    isCustom: row.is_custom,
    isUrgent: row.is_urgent,
    razonSocial: row.razon_social || undefined,
    esIncompleto: row.es_incompleto || false,
    observacionesIncompleto: row.observaciones_incompleto || undefined,
    estimatedDelivery: row.estimated_delivery ? new Date(row.estimated_delivery) : new Date(),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    products: (row.order_items || []).map(mapOrderItem),
    statusHistory: (row.order_status_history || [])
      .map(mapStatusChange)
      .sort((a: StatusChange, b: StatusChange) => a.timestamp.getTime() - b.timestamp.getTime()),
  }
}

function mapOrderItem(row: any): OrderProduct {
  return {
    productId: row.product_id,
    productCode: row.products?.code || row.product_code || "",
    productName: row.products?.name || row.product_name || "",
    quantity: row.quantity,
    price: Number(row.unit_price ?? 0),
    facturado: row.facturado || false,
    cantidadFacturada: row.cantidad_facturada || 0,
    facturaId: row.factura_id || null,
  }
}

function mapStatusChange(row: any): StatusChange {
  return {
    status: row.status as OrderStatus,
    timestamp: new Date(row.created_at),
    userId: row.changed_by || row.user_id || "",
    userName: row.changed_by || row.user_name || "",
    notes: row.notes || undefined,
  }
}

function mapProduct(row: any): Product {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category || null,
    stock: row.stock,
    price: Number(row.price),
    isCustomizable: row.is_customizable,
    customLeadTime: row.custom_lead_time,
    lowStockThreshold: row.low_stock_threshold,
    criticalStockThreshold: row.critical_stock_threshold,
    costoNeto: row.costo_neto ? Number(row.costo_neto) : null,
    grupoRubro: row.grupo_rubro || null,
    ubicacion: row.ubicacion || null,
  }
}

function mapClient(row: any): Client {
  return {
    id: row.id,
    businessName: row.business_name,
    contactName: row.contact_name || "",
    whatsapp: row.whatsapp || "",
    email: row.email || "",
    zona: row.zona as Zona,
    vendedorId: row.vendedor_id || "",
    address: row.address || "",
    paymentTerms: row.payment_terms || "",
    creditLimit: Number(row.credit_limit || 0),
    notes: row.notes || "",
    lastOrderDate: row.last_order_date ? new Date(row.last_order_date) : undefined,
    totalOrders: row.total_orders || 0,
    condicionIva: row.condicion_iva || null,
    condicionPago: row.condicion_pago || null,
    localidad: row.localidad || null,
    vendedorGp: row.contacto || null,
    telefono: row.telefono || null,
    sucursal: row.sucursal || null,
    cuit: row.cuit || null,
    numeroDocum: row.numero_docum || null,
    domicilioEntrega: row.domicilio_entrega || null,
    sucursalEntrega: row.sucursal_entrega || null,
  }
}

function mapVendedor(row: any): Vendedor {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    whatsapp: row.whatsapp || "",
    role: row.role,
    isActive: row.is_active,
    zonas: (row.vendedor_zonas || []).map((vz: any) => vz.zona as Zona),
    iniciales: row.iniciales || null,
  }
}

// Vendedores comerciales (los que aparecen en selects de pedidos/cotizaciones)
export const VENDEDOR_INICIALES_VALIDAS = ["PSG", "JGE", "DDM"] as const
export function esVendedorComercial(v: Pick<Vendedor, "iniciales" | "email">): boolean {
  if (v.iniciales && VENDEDOR_INICIALES_VALIDAS.includes(v.iniciales as any)) return true
  const emails = ["pablo@masoil.com.ar", "jestevez@masoil.com.ar", "cobranzas@masoil.com.ar"]
  return emails.includes((v.email || "").toLowerCase())
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

export async function fetchOrders(): Promise<Order[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*, products(code, name)), order_status_history(*)")
    .order("created_at", { ascending: false })
    .limit(50000)

  if (error) throw error
  return (data || []).map(mapOrder)
}

export async function fetchOrderById(id: string): Promise<Order | null> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*, products(code, name)), order_status_history(*)")
    .eq("id", id)
    .single()

  if (error) return null
  return mapOrder(data)
}

export async function fetchOrdersByVendedor(vendedorId: string): Promise<Order[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*, products(code, name)), order_status_history(*)")
    .eq("vendedor_id", vendedorId)
    .order("created_at", { ascending: false })
    .limit(50000)

  if (error) throw error
  return (data || []).map(mapOrder)
}

export async function createOrder(order: {
  clientId: string
  clientName: string
  vendedorId: string | null
  vendedorName: string
  zona: string
  notes: string
  isCustom: boolean
  isUrgent: boolean
  total: number
  items: { productId: string | null; productCode: string; productName: string; quantity: number; price: number }[]
  razonSocial?: string
  status?: "BORRADOR" | "INGRESADO"
}): Promise<string> {
  const supabase = createSupabaseClient()

  // Generate order number (timestamp + random suffix for uniqueness)
  const now = new Date()
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, "0")
  const orderNumber = `ORD-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${Date.now().toString().slice(-6)}${rand}`

  // Resolve vendor initials (PSG, JGE, DDM) for correlative per vendedor
  let iniciales = ""
  if (order.vendedorId) {
    const { data: vend } = await supabase
      .from("vendedores")
      .select("iniciales, email")
      .eq("id", order.vendedorId)
      .maybeSingle()
    iniciales = (vend?.iniciales || "").trim()
    if (!iniciales && vend?.email) {
      const em = String(vend.email).toLowerCase()
      if (em === "pablo@masoil.com.ar") iniciales = "PSG"
      else if (em === "jestevez@masoil.com.ar") iniciales = "JGE"
      else if (em === "cobranzas@masoil.com.ar") iniciales = "DDM"
    }
  }

  // Generate correlative serial: PED-{INICIALES}-0001 per vendor, fallback PED-0001
  const prefix = iniciales ? `PED-${iniciales}-` : "PED-"
  const { data: lastOrders } = await supabase
    .from("orders")
    .select("order_number_serial")
    .like("order_number_serial", `${prefix}%`)
    .order("created_at", { ascending: false })
    .limit(50)
  let lastNum = 0
  for (const row of lastOrders || []) {
    const serial = row?.order_number_serial as string | null
    if (!serial) continue
    const suffix = serial.replace(prefix, "")
    const n = parseInt(suffix, 10)
    if (!isNaN(n) && n > lastNum) lastNum = n
  }
  const orderNumberSerial = `${prefix}${String(lastNum + 1).padStart(4, "0")}`

  const vendedorIdSafe = order.vendedorId && order.vendedorId.trim() !== "" ? order.vendedorId : null

  // Insert order
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      order_number_serial: orderNumberSerial,
      client_id: order.clientId,
      client_name: order.clientName,
      vendedor_id: vendedorIdSafe,
      vendedor_name: order.vendedorName,
      zona: order.zona,
      status: order.status || "INGRESADO",
      total: order.total,
      notes: order.notes,
      is_custom: order.isCustom,
      is_urgent: order.isUrgent,
      estimated_delivery: new Date(Date.now() + (order.isCustom ? 15 : 3) * 86400000).toISOString().slice(0, 10),
      razon_social: order.razonSocial || null,
    })
    .select("id")
    .single()

  if (orderError) {
    console.error("createOrder: orders insert failed", {
      message: orderError.message,
      code: orderError.code,
      details: orderError.details,
      hint: orderError.hint,
    })
    throw orderError
  }

  // Insert order items
  const items = order.items.map((item) => ({
    order_id: orderData.id,
    product_id: item.productId && item.productId.trim() !== "" ? item.productId : null,
    quantity: item.quantity,
    unit_price: item.price,
    reservado: true,
    reservado_at: new Date().toISOString(),
  }))

  const { error: itemsError } = await supabase.from("order_items").insert(items)
  if (itemsError) {
    console.error("createOrder: order_items insert failed", {
      message: itemsError.message,
      code: itemsError.code,
      details: itemsError.details,
      hint: itemsError.hint,
    })
    throw itemsError
  }

  // Reserve stock: deduct from products and track shortages
  const shortages: { productId: string; originalStock: number; quantity: number; name: string; code: string }[] = []
  for (const item of order.items) {
    if (item.productId) {
      const { data: product } = await supabase
        .from("products")
        .select("stock, name, code")
        .eq("id", item.productId)
        .single()
      if (product) {
        const originalStock = product.stock ?? 0
        const newStock = Math.max(0, originalStock - item.quantity)
        await supabase.from("products").update({ stock: newStock }).eq("id", item.productId)
        // Track items where original stock < quantity requested
        if (originalStock < item.quantity) {
          shortages.push({
            productId: item.productId,
            originalStock,
            quantity: item.quantity,
            name: product.name,
            code: product.code,
          })
        }
      }
    }
  }

  // Create purchase requests for items with insufficient stock
  if (shortages.length > 0) {
    const { data: orderItemsData } = await supabase
      .from("order_items")
      .select("id, product_id, quantity")
      .eq("order_id", orderData.id)

    if (orderItemsData) {
      for (const shortage of shortages) {
        const oi = orderItemsData.find((o) => o.product_id === shortage.productId)
        if (!oi) continue
        await supabase.from("solicitudes_compra").insert({
          order_id: orderData.id,
          order_item_id: oi.id,
          product_id: shortage.productId,
          producto_nombre: shortage.name,
          producto_codigo: shortage.code,
          cantidad_solicitada: shortage.quantity,
          cantidad_stock: shortage.originalStock,
          cantidad_faltante: shortage.quantity - shortage.originalStock,
          estado: "borrador",
        })
      }
    }
  }

  // Insert initial status history
  const { error: histError } = await supabase.from("order_status_history").insert({
    order_id: orderData.id,
    status: "INGRESADO",
    changed_by: vendedorIdSafe,
  })
  if (histError) {
    console.error("createOrder: order_status_history insert failed", {
      message: histError.message,
      code: histError.code,
      details: histError.details,
      hint: histError.hint,
    })
    throw histError
  }

  return orderData.id
}

export async function addItemsToOrder(
  orderId: string,
  items: { productId: string | null; productCode: string; productName: string; quantity: number; price: number }[]
): Promise<void> {
  const supabase = createSupabaseClient()
  if (items.length === 0) return

  const rows = items.map((item) => ({
    order_id: orderId,
    product_id: item.productId && item.productId.trim() !== "" ? item.productId : null,
    quantity: item.quantity,
    unit_price: item.price,
    reservado: true,
    reservado_at: new Date().toISOString(),
  }))
  const { error: itemsError } = await supabase.from("order_items").insert(rows)
  if (itemsError) throw itemsError

  // Recalcular total sumando lo nuevo
  const { data: currentOrder } = await supabase
    .from("orders")
    .select("total")
    .eq("id", orderId)
    .single()
  const delta = items.reduce((s, i) => s + i.quantity * i.price, 0)
  const newTotal = Number(currentOrder?.total || 0) + delta
  await supabase
    .from("orders")
    .update({ total: newTotal, updated_at: new Date().toISOString() })
    .eq("id", orderId)

  // Descontar stock
  for (const item of items) {
    if (!item.productId) continue
    const { data: product } = await supabase
      .from("products")
      .select("stock")
      .eq("id", item.productId)
      .single()
    if (product) {
      const newStock = Math.max(0, (product.stock ?? 0) - item.quantity)
      await supabase.from("products").update({ stock: newStock }).eq("id", item.productId)
    }
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  userId: string,
  userName: string,
  notes?: string
): Promise<void> {
  const supabase = createSupabaseClient()

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", orderId)

  if (updateError) throw updateError

  // Resolver vendedor real desde auth si userId no es UUID válido
  let changedBy: string | null = null
  let resolvedName = userName
  if (userId && UUID_REGEX.test(userId)) {
    changedBy = userId
  } else {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: vend } = await supabase
          .from("vendedores")
          .select("id, name")
          .eq("auth_user_id", user.id)
          .single()
        if (vend) {
          changedBy = vend.id
          resolvedName = vend.name || userName
        }
      }
    } catch {
      // ignore: dejamos changedBy en null
    }
  }

  const { error: histError } = await supabase.from("order_status_history").insert({
    order_id: orderId,
    status: newStatus,
    changed_by: changedBy,
    user_id: changedBy,
    user_name: resolvedName || null,
    notes: notes || null,
  })

  if (histError) throw histError

  // Trigger Logística: al pasar a FACTURADO o FACTURADO_PARCIAL, asignar al reparto del próximo día hábil
  if (newStatus === "FACTURADO" || newStatus === "FACTURADO_PARCIAL") {
    try { await assignOrderToNextReparto(orderId) } catch (e) { console.error("assignOrderToNextReparto:", e) }
  }
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function fetchProducts(): Promise<Product[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("name")
    .limit(50000)

  if (error) throw error
  return (data || []).map(mapProduct)
}

export async function fetchProductsCount(): Promise<number> {
  const supabase = createSupabaseClient()
  const { count, error } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true })
  if (error) throw error
  return count || 0
}

export async function createProduct(product: {
  code: string; name: string; category: string; price: number;
  stock: number; isCustomizable: boolean; customLeadTime: number;
  lowStockThreshold: number; criticalStockThreshold: number;
}): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("products").insert({
    code: product.code,
    name: product.name,
    category: product.category,
    price: product.price,
    stock: product.stock,
    is_customizable: product.isCustomizable,
    custom_lead_time: product.customLeadTime,
    low_stock_threshold: product.lowStockThreshold,
    critical_stock_threshold: product.criticalStockThreshold,
  })
  if (error) throw error
}

export async function updateProduct(id: string, updates: Partial<{
  stock: number; price: number; name: string; code: string; category: string;
}>): Promise<any> {
  const supabase = createSupabaseClient()
  console.log("[updateProduct] id:", id, "updates:", updates)
  const { data, error } = await supabase
    .from("products")
    .update(updates)
    .eq("id", id)
    .select()
    .single()
  console.log("[updateProduct] data:", data, "error:", error)
  if (error) throw error
  return data
}

export async function deleteProduct(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("products").delete().eq("id", id)
  if (error) throw error
}

export async function deleteProducts(ids: string[]): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("products").delete().in("id", ids)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function fetchClients(): Promise<Client[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("business_name")
    .limit(50000)

  if (error) throw error
  return (data || []).map(mapClient)
}

export async function fetchClientById(id: string): Promise<Client | null> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single()

  if (error) return null
  return mapClient(data)
}

export async function updateClient(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("clients").update(updates).eq("id", id)
  if (error) throw error
}

export async function fetchClientsByVendedor(vendedorId: string): Promise<Client[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("vendedor_id", vendedorId)
    .order("business_name")
    .limit(50000)

  if (error) throw error
  return (data || []).map(mapClient)
}

export async function createClient(client: {
  businessName: string; contactName: string; whatsapp: string;
  email: string; zona: string; vendedorId?: string; address: string;
  paymentTerms: string; creditLimit: number; notes: string;
  sucursal?: string;
  sucursalEntrega?: string;
  domicilioEntrega?: string;
  cuit?: string;
  condicionIva?: string;
}): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("clients").insert({
    business_name: client.businessName,
    contact_name: client.contactName,
    whatsapp: client.whatsapp,
    email: client.email,
    zona: client.zona || null,
    vendedor_id: client.vendedorId || null,
    address: client.address,
    payment_terms: client.paymentTerms,
    condicion_pago: client.paymentTerms,
    credit_limit: client.creditLimit,
    notes: client.notes,
    sucursal: client.sucursal || null,
    sucursal_entrega: client.sucursalEntrega || null,
    domicilio_entrega: client.domicilioEntrega || null,
    cuit: client.cuit || null,
    condicion_iva: client.condicionIva || null,
  })
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Vendedores
// ---------------------------------------------------------------------------

export async function fetchVendedores(): Promise<Vendedor[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("vendedores")
    .select("*, vendedor_zonas(zona)")
    .order("name")
    .limit(50000)

  if (error) throw error
  return (data || []).map(mapVendedor)
}

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------

export async function fetchProveedores(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("proveedores")
    .select("*")
    .order("nombre")
    .limit(50000)
  if (error) throw error
  return data || []
}

export async function fetchProveedoresCount(): Promise<number> {
  const supabase = createSupabaseClient()
  const { count, error } = await supabase
    .from("proveedores")
    .select("*", { count: "exact", head: true })
  if (error) throw error
  return count || 0
}

export async function fetchProveedorById(id: string): Promise<any | null> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase.from("proveedores").select("*").eq("id", id).single()
  if (error) return null
  return data
}

export async function createProveedor(prov: {
  nombre: string; cuit?: string; empresa?: string; condicion_pago?: string;
  cbu?: string; email_comercial?: string; email_pagos?: string; contactos?: string; observaciones?: string;
}): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("proveedores").insert(prov)
  if (error) throw error
}

export async function updateProveedor(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("proveedores").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Compras
// ---------------------------------------------------------------------------

export async function fetchCompras(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("compras")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50000)
  if (error) throw error
  return data || []
}

export async function fetchComprasCount(): Promise<number> {
  const supabase = createSupabaseClient()
  const { count, error } = await supabase
    .from("compras")
    .select("*", { count: "exact", head: true })
  if (error) throw error
  return count || 0
}

export async function fetchOrdenesCompra(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("ordenes_compra")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50000)
  if (error) throw error
  return data || []
}

export async function createCompra(compra: {
  proveedor_nombre: string; proveedor_id?: string; articulo: string;
  medio_solicitud?: string; solicitado_por?: string; vendedor?: string;
  nro_cotizacion?: string; nro_nota_pedido?: string; estado?: string; fecha?: string;
  fecha_estimada_ingreso?: string;
}): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("compras").insert(compra)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Pagos a Proveedores
// ---------------------------------------------------------------------------

export async function fetchPagosProveedores(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("pagos_proveedores")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50000)
  if (error) throw error
  return data || []
}

export async function createPagoProveedor(pago: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("pagos_proveedores").insert(pago)
  if (error) throw error
}

export async function updateEstadoPago(id: string, estado: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("pagos_proveedores").update({ estado_pago: estado }).eq("id", id)
  if (error) throw error
}

export async function fetchReclamos(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("reclamos_pagos_proveedores")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50000)
  if (error) throw error
  return data || []
}

export async function fetchReclamosByProveedor(proveedorId: string, proveedorNombre?: string): Promise<any[]> {
  const supabase = createSupabaseClient()
  let query = supabase.from("reclamos_pagos_proveedores").select("*")
  if (proveedorNombre) {
    query = query.or(`proveedor_id.eq.${proveedorId},proveedor_nombre.eq.${proveedorNombre}`)
  } else {
    query = query.eq("proveedor_id", proveedorId)
  }
  const { data, error } = await query.order("created_at", { ascending: false })
  if (error) throw error
  return data || []
}

export async function createReclamo(reclamo: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("reclamos_pagos_proveedores").insert(reclamo)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Cobranzas
// ---------------------------------------------------------------------------

export async function fetchCobranzasPendientes(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("cobranzas_pendientes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50000)
  if (error) throw error
  return data || []
}

export async function createCobro(cobro: {
  order_id?: string; fecha: string; monto: number; medio_pago: string; referencia?: string; notas?: string;
}): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("ingresos").insert(cobro)
  if (error) throw error
}

export async function fetchClientesConCobranza(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("clients")
    .select("id, business_name, razon_social, zona, condicion_pago, canal_facturacion, canal_observaciones, telefono, email")
    .order("business_name")
    .limit(50000)
  if (error) throw error
  return data || []
}

// ---------------------------------------------------------------------------
// Delete / Update helpers for Operaciones
// ---------------------------------------------------------------------------

export async function deleteCompra(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("compras").delete().eq("id", id)
  if (error) throw error
}

export async function updateCompra(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("compras").update(updates).eq("id", id)
  if (error) throw error
}

export async function deleteOrdenCompra(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("ordenes_compra").delete().eq("id", id)
  if (error) throw error
}

export async function updateOrdenCompra(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("ordenes_compra").update(updates).eq("id", id)
  if (error) throw error
}

export async function deletePagoProveedor(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("pagos_proveedores").delete().eq("id", id)
  if (error) throw error
}

export async function updatePagoProveedor(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("pagos_proveedores").update(updates).eq("id", id)
  if (error) throw error
}

export async function deleteReclamo(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("reclamos_pagos_proveedores").delete().eq("id", id)
  if (error) throw error
}

export async function updateReclamo(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("reclamos_pagos_proveedores").update(updates).eq("id", id)
  if (error) throw error
}

export async function deleteCobranzaPendiente(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("cobranzas_pendientes").delete().eq("id", id)
  if (error) throw error
}

export async function deleteProveedor(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("proveedores").delete().eq("id", id)
  if (error) throw error
}

export async function deleteProveedoresBulk(ids: string[]): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("proveedores").delete().in("id", ids)
  if (error) throw error
}

export async function deleteClient(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("clients").delete().eq("id", id)
  if (error) throw error
}

export async function deleteClientsBulk(ids: string[]): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("clients").delete().in("id", ids)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Cotizaciones
// ---------------------------------------------------------------------------

export async function fetchCotizaciones(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("cotizaciones")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) throw error
  return data || []
}

export async function createCotizacion(cotizacion: {
  order_id: string
  proveedor_id: string
  proveedor_nombre: string
  items: unknown[]
  total: number
  observaciones?: string
}): Promise<string> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("cotizaciones")
    .insert(cotizacion)
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

export async function updateCotizacion(id: string, updates: Record<string, unknown>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("cotizaciones").update(updates).eq("id", id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Solicitudes de Compra
// ---------------------------------------------------------------------------

export async function fetchSolicitudesCompra(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("solicitudes_compra")
    .select("*, orders:order_id(order_number_serial, status)")
    .order("created_at", { ascending: false })
    .limit(5000)
  if (error) throw error
  return (data || []).map((s: any) => ({
    ...s,
    pedido_serial: s.orders?.order_number_serial || null,
    pedido_status: s.orders?.status || null,
  }))
}

export async function updateSolicitudCompra(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("solicitudes_compra").update(updates).eq("id", id)
  if (error) throw error
}

export async function deleteSolicitudCompra(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("solicitudes_compra").delete().eq("id", id)
  if (error) throw error
}

export async function createSolicitudCompra(data: {
  product_id?: string | null
  producto_nombre: string
  producto_codigo?: string | null
  cantidad_solicitada: number
  cantidad_stock?: number
  cantidad_faltante?: number
  proveedor_sugerido?: string | null
  observaciones?: string | null
}): Promise<string> {
  const supabase = createSupabaseClient()
  const { data: row, error } = await supabase
    .from("solicitudes_compra")
    .insert({
      product_id: data.product_id || null,
      producto_nombre: data.producto_nombre,
      producto_codigo: data.producto_codigo || null,
      cantidad_solicitada: data.cantidad_solicitada,
      cantidad_stock: data.cantidad_stock ?? 0,
      cantidad_faltante: data.cantidad_faltante ?? data.cantidad_solicitada,
      proveedor_sugerido: data.proveedor_sugerido || null,
      observaciones: data.observaciones || null,
      order_id: null,
      estado: "borrador",
    })
    .select("id")
    .single()
  if (error) throw error
  return row.id
}

export async function createOrdenCompra(oc: {
  proveedor_nombre: string
  proveedor_id?: string | null
  importe_total?: number
  estado?: string
  nro_oc?: string
  razon_social?: string
  empresa?: string | null
  articulo?: string
  email_comercial?: string | null
  items?: {
    product_id?: string | null
    producto_nombre: string
    producto_codigo?: string | null
    cantidad: number
    precio_unitario: number
    subtotal: number
  }[]
}): Promise<string> {
  const supabase = createSupabaseClient()

  // Generate next OC number (usa maybeSingle para tolerar ausencia de OCs previas)
  const { data: lastOC } = await supabase
    .from("ordenes_compra")
    .select("nro_oc")
    .not("nro_oc", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastNum = lastOC?.nro_oc ? parseInt(lastOC.nro_oc.replace("OC-", ""), 10) : 0
  const nroOc = `OC-${String((lastNum || 0) + 1).padStart(4, "0")}`

  const { data, error } = await supabase
    .from("ordenes_compra")
    .insert({
      fecha: new Date().toISOString().slice(0, 10),
      proveedor_nombre: oc.proveedor_nombre,
      proveedor_id: oc.proveedor_id || null,
      importe_total: oc.importe_total || 0,
      estado: oc.estado || "Pendiente",
      nro_oc: oc.nro_oc || nroOc,
      razon_social: oc.razon_social || null,
      empresa: oc.empresa || null,
      email_comercial: oc.email_comercial || null,
    })
    .select("id")
    .single()
  if (error) throw error

  // Insert items if provided
  if (oc.items && oc.items.length > 0) {
    const itemsInsert = oc.items.map((i) => ({
      orden_compra_id: data.id,
      product_id: i.product_id || null,
      producto_nombre: i.producto_nombre,
      producto_codigo: i.producto_codigo || null,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      subtotal: i.subtotal,
    }))
    const { error: itemsError } = await supabase.from("orden_compra_items").insert(itemsInsert)
    if (itemsError) throw itemsError
  }

  return data.id
}

// ---------------------------------------------------------------------------
// Facturas (emitidas por el sistema)
// ---------------------------------------------------------------------------

export async function fetchFacturas(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("facturas")
    .select("*")
    .order("fecha", { ascending: false })
    .limit(50000)
  if (error) throw error
  return data || []
}

export async function fetchProductById(id: string): Promise<Product | null> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase.from("products").select("*").eq("id", id).single()
  if (error) return null
  return mapProduct(data)
}

export async function fetchVentasByProducto(productId: string, limit: number = 20): Promise<any[]> {
  const supabase = createSupabaseClient()
  // Ventas vía order_items + orders + facturas
  const { data, error } = await supabase
    .from("order_items")
    .select(`
      id, quantity, unit_price, created_at,
      orders!inner(id, order_number, order_number_serial, client_id, client_name, factura_id, created_at)
    `)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data || []).map((row: any) => {
    const ord = Array.isArray(row.orders) ? row.orders[0] : row.orders
    return {
      id: row.id,
      fecha: row.created_at,
      cantidad: row.quantity,
      precio_unitario: Number(row.unit_price) || 0,
      subtotal: (Number(row.unit_price) || 0) * (Number(row.quantity) || 0),
      order_id: ord?.id || null,
      order_number: ord?.order_number_serial || ord?.order_number || null,
      client_id: ord?.client_id || null,
      client_name: ord?.client_name || "",
      factura_id: ord?.factura_id || null,
    }
  })
}

export async function fetchFacturasByClient(clientId: string, limit: number = 10): Promise<any[]> {
  const supabase = createSupabaseClient()
  // Unifica facturas nuevas (client_id) con GestionPro (client_id)
  const [{ data: newer }, { data: gp }] = await Promise.all([
    supabase.from("facturas").select("*").eq("client_id", clientId).order("fecha", { ascending: false }).limit(limit),
    supabase.from("facturas_gestionpro").select("*").eq("client_id", clientId).order("fecha", { ascending: false }).limit(limit),
  ])
  const all = [...(newer || []), ...(gp || [])]
  all.sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")))
  return all.slice(0, limit)
}

// ---------------------------------------------------------------------------
// Facturas GestionPro
// ---------------------------------------------------------------------------

export async function fetchFacturasGestionpro(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("facturas_gestionpro")
    .select("*")
    .order("fecha", { ascending: false })
    .limit(50000)
  if (error) throw error
  return data || []
}

export async function fetchFacturasGestionproCount(): Promise<number> {
  const supabase = createSupabaseClient()
  const { count, error } = await supabase
    .from("facturas_gestionpro")
    .select("*", { count: "exact", head: true })
  if (error) throw error
  return count || 0
}

// ---------------------------------------------------------------------------
// IVA A PAGAR histórico
// ---------------------------------------------------------------------------

export async function fetchIvaPagar(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("iva_a_pagar")
    .select("*")
    .order("periodo_desde", { ascending: false })
    .limit(500)
  if (error) return []
  return data || []
}

// ---------------------------------------------------------------------------
// Pagos en Proceso (isla de datos simple)
// ---------------------------------------------------------------------------

export async function fetchPagosEnProceso(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("pagos_en_proceso")
    .select("*")
    .order("created_at", { ascending: false })
  if (error) return []
  return data || []
}

export async function createPagoEnProceso(row: Record<string, any>): Promise<string> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("pagos_en_proceso")
    .insert(row)
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

export async function updatePagoEnProceso(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("pagos_en_proceso").update(updates).eq("id", id)
  if (error) throw error
}

export async function deletePagoEnProceso(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("pagos_en_proceso").delete().eq("id", id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Movimientos de Mercadería
// ---------------------------------------------------------------------------

export async function fetchMovimientosMercaderia(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("movimientos_mercaderia")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(2000)
  if (error) return []
  return data || []
}

export async function createMovimientoMercaderia(mov: Record<string, any>): Promise<string> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("movimientos_mercaderia")
    .insert(mov)
    .select("id")
    .single()
  if (error) throw error

  // Si el movimiento mueve stock, actualizamos products.stock
  if (mov.mueve_stock && mov.product_id && mov.cantidad) {
    const { data: prod } = await supabase.from("products").select("stock").eq("id", mov.product_id).single()
    if (prod) {
      await supabase.from("products").update({ stock: (prod.stock || 0) + mov.cantidad }).eq("id", mov.product_id)
    }
  }

  return data.id
}

// ---------------------------------------------------------------------------
// Repartos (Logística)
// ---------------------------------------------------------------------------

// Re-exportadas desde el módulo puro (para tests con Vitest)
import { proximoDiaHabil, formatNumeroReparto } from "@/lib/logistica/reparto"
export { proximoDiaHabil, formatNumeroReparto }

export async function fetchRepartos(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("repartos")
    .select("*")
    .order("fecha", { ascending: false })
    .limit(200)
  if (error) return []
  return data || []
}

export async function fetchRepartoByFecha(fechaISO: string): Promise<any | null> {
  const supabase = createSupabaseClient()
  const { data } = await supabase.from("repartos").select("*").eq("fecha", fechaISO).maybeSingle()
  return data
}

export async function ensureRepartoForFecha(fechaISO: string): Promise<string> {
  const supabase = createSupabaseClient()
  const existing = await fetchRepartoByFecha(fechaISO)
  if (existing) return existing.id
  const fecha = new Date(fechaISO)
  const numero = formatNumeroReparto(fecha)
  const { data, error } = await supabase
    .from("repartos")
    .insert({ numero_reparto: numero, fecha: fechaISO, estado: "pendiente" })
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

export async function fetchRepartoItems(repartoId: string): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("reparto_items")
    .select("*")
    .eq("reparto_id", repartoId)
    .order("orden_reparto", { ascending: true, nullsFirst: false })
  if (error) return []
  return data || []
}

export async function createRepartoItem(item: Record<string, any>): Promise<string> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase.from("reparto_items").insert(item).select("id").single()
  if (error) throw error
  return data.id
}

export async function updateRepartoItem(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("reparto_items").update(updates).eq("id", id)
  if (error) throw error
}

export async function deleteRepartoItem(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("reparto_items").delete().eq("id", id)
  if (error) throw error
}

// Al pasar un pedido a FACTURADO, asignarlo al reparto del próximo día hábil
export async function assignOrderToNextReparto(orderId: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { data: order } = await supabase
    .from("orders")
    .select("id, client_name, zona, entrega_otra_sucursal, factura_id, reparto_id")
    .eq("id", orderId)
    .single()
  if (!order) return
  if (order.reparto_id) return // ya asignado

  const fecha = proximoDiaHabil(new Date())
  const fechaISO = fecha.toISOString().slice(0, 10)
  const repartoId = await ensureRepartoForFecha(fechaISO)

  let facturaNro: string | null = null
  if (order.factura_id) {
    const { data: f } = await supabase.from("facturas").select("numero, punto_venta").eq("id", order.factura_id).single()
    if (f) facturaNro = f.numero ? `${f.punto_venta || ""}-${f.numero}`.replace(/^-/, "") : null
  }

  await supabase.from("reparto_items").insert({
    reparto_id: repartoId,
    order_id: orderId,
    factura_numero: facturaNro,
    client_name: order.client_name,
    zona: order.zona || null,
    sucursal_entrega: order.entrega_otra_sucursal || null,
    estado_entrega: "pendiente",
    es_destino_extra: false,
  })

  await supabase.from("orders").update({
    reparto_id: repartoId,
    numero_reparto: formatNumeroReparto(fecha),
  }).eq("id", orderId)
}

// ---------------------------------------------------------------------------
// Recibos
// ---------------------------------------------------------------------------

export async function fetchRecibos(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("recibos")
    .select("*")
    .order("fecha", { ascending: false })
    .limit(50000)
  if (error) throw error
  return data || []
}

// ---------------------------------------------------------------------------
// Servicios Fijos
// ---------------------------------------------------------------------------

export async function fetchServiciosFijos(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("servicios_fijos")
    .select("*")
    .order("servicio")
    .limit(50000)
  if (error) throw error
  return data || []
}

export async function createServicioFijo(servicio: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("servicios_fijos").insert(servicio)
  if (error) throw error
}

export async function updateServicioFijo(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("servicios_fijos").update(updates).eq("id", id)
  if (error) throw error
}

export async function deleteServicioFijo(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("servicios_fijos").delete().eq("id", id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Movimientos Caja Chica
// ---------------------------------------------------------------------------

export async function fetchMovimientosCajaChica(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("movimientos_caja_chica")
    .select("*")
    .order("fecha", { ascending: false })
    .limit(50000)
  if (error) throw error
  return data || []
}

export async function createMovimientoCajaChica(mov: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("movimientos_caja_chica").insert(mov)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Facturas Proveedor
// ---------------------------------------------------------------------------

export async function fetchFacturasProveedor(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("facturas_proveedor")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000)
  if (error) throw error
  return data || []
}

export async function createFacturaProveedor(factura: Record<string, any>): Promise<string> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("facturas_proveedor")
    .insert(factura)
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

export async function updateFacturaProveedor(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("facturas_proveedor").update(updates).eq("id", id)
  if (error) throw error
}

export async function deleteFacturaProveedor(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("facturas_proveedor").delete().eq("id", id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Cheques Emitidos
// ---------------------------------------------------------------------------

export async function fetchChequesEmitidos(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("cheques_emitidos")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000)
  if (error) throw error
  return data || []
}

export async function createChequeEmitido(cheque: Record<string, any>): Promise<string> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("cheques_emitidos")
    .insert(cheque)
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

export async function updateChequeEmitido(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("cheques_emitidos").update(updates).eq("id", id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Cuenta Corriente Cliente
// ---------------------------------------------------------------------------

export async function fetchCuentaCorrienteCliente(clientId?: string): Promise<any[]> {
  const supabase = createSupabaseClient()
  let query = supabase
    .from("cuenta_corriente_cliente")
    .select("*")
    .order("fecha", { ascending: false })
    .limit(5000)
  if (clientId) query = query.eq("client_id", clientId)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createMovimientoCuentaCorriente(mov: Record<string, any>): Promise<string> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("cuenta_corriente_cliente")
    .insert(mov)
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

// ---------------------------------------------------------------------------
// Cuenta Corriente Proveedor
// ---------------------------------------------------------------------------

export async function fetchCuentaCorrienteProveedor(proveedorId?: string): Promise<any[]> {
  const supabase = createSupabaseClient()
  let query = supabase
    .from("cuenta_corriente_proveedor")
    .select("*")
    .order("fecha", { ascending: false })
    .limit(5000)
  if (proveedorId) query = query.eq("proveedor_id", proveedorId)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createMovimientoCuentaCorrienteProveedor(mov: Record<string, any>): Promise<string> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("cuenta_corriente_proveedor")
    .insert(mov)
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

// ---------------------------------------------------------------------------
// Factura Proveedor Items
// ---------------------------------------------------------------------------

export async function fetchFacturaProveedorItems(facturaId: string): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("factura_proveedor_items")
    .select("*")
    .eq("factura_id", facturaId)
    .order("created_at")
  if (error) throw error
  return data || []
}

export async function createFacturaProveedorItems(items: Record<string, any>[]): Promise<void> {
  if (items.length === 0) return
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("factura_proveedor_items").insert(items)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Plan de Cuentas Contables
// ---------------------------------------------------------------------------

export async function fetchPlanCuentas(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("plan_cuentas")
    .select("*")
    .order("codigo")
  if (error) throw error
  return data || []
}

// ---------------------------------------------------------------------------
// Retenciones
// ---------------------------------------------------------------------------

export async function fetchRetenciones(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("retenciones")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000)
  if (error) throw error
  return data || []
}

export async function createRetencion(retencion: Record<string, any>): Promise<string> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("retenciones")
    .insert(retencion)
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

// ---------------------------------------------------------------------------
// Recibos Cobranza (nuevos con correlativo)
// ---------------------------------------------------------------------------

export async function fetchRecibosCobranza(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("recibos_cobranza")
    .select("*")
    .order("numero", { ascending: false })
    .limit(5000)
  if (error) throw error
  return data || []
}

export async function getNextReciboNumero(): Promise<number> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("recibos_cobranza")
    .select("numero")
    .order("numero", { ascending: false })
    .limit(1)
  if (error) throw error
  return (data && data.length > 0) ? data[0].numero + 1 : 1
}

export async function createReciboCobranza(recibo: Record<string, any>): Promise<string> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("recibos_cobranza")
    .insert(recibo)
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

export async function createChequesRecibidos(cheques: Record<string, any>[]): Promise<void> {
  if (cheques.length === 0) return
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("cheques_recibidos").insert(cheques)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Lotes de Pago
// ---------------------------------------------------------------------------

export async function fetchLotesPago(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("lotes_pago")
    .select("*")
    .order("fecha_lote", { ascending: false })
    .limit(5000)
  if (error) throw error
  return data || []
}

export async function fetchLotePagoItems(loteId: string): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("lote_pago_items")
    .select("*")
    .eq("lote_id", loteId)
    .order("proveedor_nombre")
  if (error) throw error
  return data || []
}

export async function createLotePago(lote: Record<string, any>): Promise<string> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("lotes_pago")
    .insert(lote)
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

export async function updateLotePago(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("lotes_pago").update(updates).eq("id", id)
  if (error) throw error
}

export async function deleteLotePago(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("lotes_pago").delete().eq("id", id)
  if (error) throw error
}

export async function addItemToLote(item: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("lote_pago_items").insert(item)
  if (error) throw error
}

export async function updateLotePagoItem(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("lote_pago_items").update(updates).eq("id", id)
  if (error) throw error
}

export async function removeLotePagoItem(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("lote_pago_items").delete().eq("id", id)
  if (error) throw error
}

export async function enviarFacturaALote(facturaProveedorId: string, loteId: string, item: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  // Add item to lote
  const { error: itemError } = await supabase.from("lote_pago_items").insert({ ...item, lote_id: loteId, factura_proveedor_id: facturaProveedorId })
  if (itemError) throw itemError
  // Mark factura as linked to lote
  const { error: fcError } = await supabase.from("facturas_proveedor").update({ lote_pago_id: loteId }).eq("id", facturaProveedorId)
  if (fcError) throw fcError
  // Update lote total
  const { data: items } = await supabase.from("lote_pago_items").select("importe").eq("lote_id", loteId)
  const total = (items || []).reduce((s: number, i: any) => s + (Number(i.importe) || 0), 0)
  await supabase.from("lotes_pago").update({ total }).eq("id", loteId)
}

// ---------------------------------------------------------------------------
// Cotizaciones de venta
// ---------------------------------------------------------------------------

export async function fetchCotizacionesVenta(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("cotizaciones_venta")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000)
  if (error) throw error
  return data || []
}

export async function fetchCotizacionVentaById(id: string): Promise<any | null> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("cotizaciones_venta")
    .select("*")
    .eq("id", id)
    .single()
  if (error) return null
  return data
}

export async function fetchCotizacionVentaItems(cotizacionId: string): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("cotizacion_venta_items")
    .select("*")
    .eq("cotizacion_id", cotizacionId)
    .order("created_at")
  if (error) throw error
  return data || []
}

export async function getNextCotizacionVentaNumero(iniciales: string): Promise<string> {
  const supabase = createSupabaseClient()
  const prefix = `COT-${iniciales}-`
  const { data } = await supabase
    .from("cotizaciones_venta")
    .select("numero")
    .like("numero", `${prefix}%`)
    .order("created_at", { ascending: false })
    .limit(50)
  let max = 0
  for (const r of data || []) {
    const n = parseInt((r.numero || "").replace(prefix, ""), 10)
    if (!isNaN(n) && n > max) max = n
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`
}

export async function createCotizacionVenta(cot: {
  numero: string
  fecha?: string
  client_id: string
  client_name: string
  vendedor_id?: string | null
  vendedor_nombre?: string | null
  vendedor_iniciales?: string | null
  razon_social?: string | null
  zona?: string | null
  validez_fecha?: string | null
  forma_pago?: string | null
  plazo_entrega?: string | null
  observaciones?: string | null
  total: number
  items: {
    product_id?: string | null
    producto_nombre: string
    producto_codigo?: string | null
    cantidad: number
    precio_unitario: number
    subtotal: number
  }[]
}): Promise<string> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("cotizaciones_venta")
    .insert({
      numero: cot.numero,
      fecha: cot.fecha || new Date().toISOString().slice(0, 10),
      client_id: cot.client_id,
      client_name: cot.client_name,
      vendedor_id: cot.vendedor_id || null,
      vendedor_nombre: cot.vendedor_nombre || null,
      vendedor_iniciales: cot.vendedor_iniciales || null,
      razon_social: cot.razon_social || null,
      zona: cot.zona || null,
      validez_fecha: cot.validez_fecha || null,
      forma_pago: cot.forma_pago || null,
      plazo_entrega: cot.plazo_entrega || null,
      observaciones: cot.observaciones || null,
      total: cot.total,
      estado: "pendiente",
    })
    .select("id")
    .single()
  if (error) throw error
  const cotizacionId = data.id as string

  if (cot.items.length > 0) {
    const itemsInsert = cot.items.map((i) => ({
      cotizacion_id: cotizacionId,
      product_id: i.product_id || null,
      producto_nombre: i.producto_nombre,
      producto_codigo: i.producto_codigo || null,
      cantidad: i.cantidad,
      precio_unitario: i.precio_unitario,
      subtotal: i.subtotal,
      aprobado: true,
    }))
    const { error: itemsError } = await supabase.from("cotizacion_venta_items").insert(itemsInsert)
    if (itemsError) throw itemsError
  }

  return cotizacionId
}

export async function updateCotizacionVenta(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("cotizaciones_venta").update(updates).eq("id", id)
  if (error) throw error
}

export async function updateCotizacionVentaItemAprobado(itemId: string, aprobado: boolean): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("cotizacion_venta_items").update({ aprobado }).eq("id", itemId)
  if (error) throw error
}

export async function updateCotizacionVentaItem(itemId: string, updates: {
  producto_nombre?: string
  producto_codigo?: string | null
  product_id?: string | null
  cantidad?: number
  precio_unitario?: number
  subtotal?: number
}): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("cotizacion_venta_items").update(updates).eq("id", itemId)
  if (error) throw error
}

export async function createCotizacionVentaItem(item: {
  cotizacion_id: string
  product_id?: string | null
  producto_nombre: string
  producto_codigo?: string | null
  cantidad: number
  precio_unitario: number
  subtotal: number
  aprobado?: boolean
}): Promise<string> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("cotizacion_venta_items")
    .insert({ ...item, aprobado: item.aprobado ?? true })
    .select("id")
    .single()
  if (error) throw error
  return data.id as string
}

export async function deleteCotizacionVentaItem(itemId: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("cotizacion_venta_items").delete().eq("id", itemId)
  if (error) throw error
}

export async function deleteCotizacionVenta(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("cotizaciones_venta").delete().eq("id", id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Orden de Compra Items
// ---------------------------------------------------------------------------

export async function fetchOrdenCompraItems(ordenCompraId: string): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("orden_compra_items")
    .select("*")
    .eq("orden_compra_id", ordenCompraId)
    .order("created_at")
  if (error) throw error
  return data || []
}

export async function createOrdenCompraItems(items: Record<string, any>[]): Promise<void> {
  if (items.length === 0) return
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("orden_compra_items").insert(items)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Producto-Proveedor (asociación con precios)
// ---------------------------------------------------------------------------

export async function fetchProveedoresByProducto(productId: string): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("producto_proveedor")
    .select("*, proveedores:proveedor_id(id, nombre, razon_social, cuit, empresa, email_comercial)")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data || []).map((r: any) => ({
    ...r,
    proveedor_nombre: r.proveedores?.nombre || r.proveedores?.razon_social || "",
    proveedor_cuit: r.proveedores?.cuit || "",
    proveedor_empresa: r.proveedores?.empresa || "",
    proveedor_email: r.proveedores?.email_comercial || "",
  }))
}

export async function fetchProductosByProveedor(proveedorId: string): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("producto_proveedor")
    .select("*, products:product_id(id, code, name, price)")
    .eq("proveedor_id", proveedorId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data || []).map((r: any) => ({
    ...r,
    product_code: r.products?.code || "",
    product_name: r.products?.name || "",
    product_price: r.products?.price || 0,
  }))
}

export async function upsertProductoProveedor(row: {
  product_id: string
  proveedor_id: string
  precio_proveedor?: number | null
  codigo_proveedor?: string | null
  observaciones?: string | null
}): Promise<string> {
  const supabase = createSupabaseClient()
  const hoy = new Date().toISOString().slice(0, 10)
  const { data, error } = await supabase
    .from("producto_proveedor")
    .upsert({
      product_id: row.product_id,
      proveedor_id: row.proveedor_id,
      precio_proveedor: row.precio_proveedor ?? null,
      codigo_proveedor: row.codigo_proveedor ?? null,
      observaciones: row.observaciones ?? null,
      ultimo_precio_fecha: row.precio_proveedor ? hoy : null,
    }, { onConflict: "product_id,proveedor_id" })
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

export async function deleteProductoProveedor(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("producto_proveedor").delete().eq("id", id)
  if (error) throw error
}
