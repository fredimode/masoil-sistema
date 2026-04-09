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
  }
}

function mapStatusChange(row: any): StatusChange {
  return {
    status: row.status as OrderStatus,
    timestamp: new Date(row.created_at),
    userId: row.user_id,
    userName: row.user_name,
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
  }
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
  vendedorId: string
  vendedorName: string
  zona: string
  notes: string
  isCustom: boolean
  isUrgent: boolean
  total: number
  items: { productId: string; productCode: string; productName: string; quantity: number; price: number }[]
  razonSocial?: string
}): Promise<string> {
  const supabase = createSupabaseClient()

  // Generate order number (timestamp + random suffix for uniqueness)
  const now = new Date()
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, "0")
  const orderNumber = `ORD-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${Date.now().toString().slice(-6)}${rand}`

  // Generate correlative serial number PED-0001, PED-0002, etc.
  const { data: lastOrder } = await supabase
    .from("orders")
    .select("order_number_serial")
    .not("order_number_serial", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()
  const lastSerial = lastOrder?.order_number_serial
  const lastNum = lastSerial ? parseInt(lastSerial.replace("PED-", ""), 10) : 0
  const orderNumberSerial = `PED-${String((lastNum || 0) + 1).padStart(4, "0")}`

  // Insert order
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      order_number_serial: orderNumberSerial,
      client_id: order.clientId,
      client_name: order.clientName,
      vendedor_id: order.vendedorId,
      vendedor_name: order.vendedorName,
      zona: order.zona,
      status: "INGRESADO",
      total: order.total,
      notes: order.notes,
      is_custom: order.isCustom,
      is_urgent: order.isUrgent,
      estimated_delivery: new Date(Date.now() + (order.isCustom ? 15 : 3) * 86400000).toISOString().slice(0, 10),
      razon_social: order.razonSocial || null,
    })
    .select("id")
    .single()

  if (orderError) throw orderError

  // Insert order items
  const items = order.items.map((item) => ({
    order_id: orderData.id,
    product_id: item.productId,
    quantity: item.quantity,
    unit_price: item.price,
  }))

  const { error: itemsError } = await supabase.from("order_items").insert(items)
  if (itemsError) throw itemsError

  // Insert initial status history
  const { error: histError } = await supabase.from("order_status_history").insert({
    order_id: orderData.id,
    status: "INGRESADO",
    user_id: order.vendedorId,
    user_name: order.vendedorName,
  })
  if (histError) throw histError

  return orderData.id
}

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

  const { error: histError } = await supabase.from("order_status_history").insert({
    order_id: orderId,
    status: newStatus,
    user_id: userId,
    user_name: userName,
    notes: notes || null,
  })

  if (histError) throw histError
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
}>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("products").update(updates).eq("id", id)
  if (error) throw error
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
    credit_limit: client.creditLimit,
    notes: client.notes,
    sucursal: client.sucursal || null,
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
