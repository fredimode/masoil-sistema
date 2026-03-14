import { createClient as createSupabaseClient } from "./client"
import type { Order, OrderProduct, StatusChange, Product, Client, Vendedor, OrderStatus, Zona } from "../types"

// ---------------------------------------------------------------------------
// Helpers: snake_case → camelCase mapping
// ---------------------------------------------------------------------------

function mapOrder(row: any): Order {
  return {
    id: row.id,
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
    productCode: row.product_code,
    productName: row.product_name,
    quantity: row.quantity,
    price: Number(row.price),
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
    category: row.category,
    stock: row.stock,
    price: Number(row.price),
    isCustomizable: row.is_customizable,
    customLeadTime: row.custom_lead_time,
    lowStockThreshold: row.low_stock_threshold,
    criticalStockThreshold: row.critical_stock_threshold,
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
    .select("*, order_items(*), order_status_history(*)")
    .order("created_at", { ascending: false })

  if (error) throw error
  return (data || []).map(mapOrder)
}

export async function fetchOrderById(id: string): Promise<Order | null> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*), order_status_history(*)")
    .eq("id", id)
    .single()

  if (error) return null
  return mapOrder(data)
}

export async function fetchOrdersByVendedor(vendedorId: string): Promise<Order[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*), order_status_history(*)")
    .eq("vendedor_id", vendedorId)
    .order("created_at", { ascending: false })

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
}): Promise<string> {
  const supabase = createSupabaseClient()

  // Insert order
  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .insert({
      client_id: order.clientId,
      client_name: order.clientName,
      vendedor_id: order.vendedorId,
      vendedor_name: order.vendedorName,
      zona: order.zona,
      status: "RECIBIDO",
      total: order.total,
      notes: order.notes,
      is_custom: order.isCustom,
      is_urgent: order.isUrgent,
      estimated_delivery: new Date(Date.now() + (order.isCustom ? 15 : 3) * 86400000).toISOString().slice(0, 10),
    })
    .select("id")
    .single()

  if (orderError) throw orderError

  // Insert order items
  const items = order.items.map((item) => ({
    order_id: orderData.id,
    product_id: item.productId,
    product_code: item.productCode,
    product_name: item.productName,
    quantity: item.quantity,
    price: item.price,
  }))

  const { error: itemsError } = await supabase.from("order_items").insert(items)
  if (itemsError) throw itemsError

  // Insert initial status history
  const { error: histError } = await supabase.from("order_status_history").insert({
    order_id: orderData.id,
    status: "RECIBIDO",
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

  if (error) throw error
  return (data || []).map(mapProduct)
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

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

export async function fetchClients(): Promise<Client[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("business_name")

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

export async function fetchClientsByVendedor(vendedorId: string): Promise<Client[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("vendedor_id", vendedorId)
    .order("business_name")

  if (error) throw error
  return (data || []).map(mapClient)
}

export async function createClient(client: {
  businessName: string; contactName: string; whatsapp: string;
  email: string; zona: string; vendedorId?: string; address: string;
  paymentTerms: string; creditLimit: number; notes: string;
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

  if (error) throw error
  return (data || []).map(mapVendedor)
}
