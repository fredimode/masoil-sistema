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
    id: row.id,
    productId: row.product_id,
    // Para lineas libres/descuento product_id es null y los datos viven en
    // las columnas denormalizadas producto_nombre/producto_codigo.
    productCode: row.products?.code || row.producto_codigo || row.product_code || "",
    productName: row.products?.name || row.producto_nombre || row.product_name || "",
    quantity: row.quantity,
    price: Number(row.unit_price ?? 0),
    facturado: row.facturado || false,
    cantidadFacturada: row.cantidad_facturada || 0,
    facturaId: row.factura_id || null,
    tipoLinea: (row.tipo_linea as "producto" | "libre" | "descuento") || "producto",
    movido: row.movido || false,
    movidoAOrderId: row.movido_a_order_id || null,
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
    codigoGestionpro: row.codigo_gestionpro || null,
    // Contactos de Cobranzas (W.4): se mapean para que la ficha del cliente
    // pueda releerlos tras guardar (antes no se mapeaban y el form quedaba vacío).
    cobranzasMail: Array.isArray(row.cobranzas_mail)
      ? row.cobranzas_mail
      : row.cobranzas_mail ? [row.cobranzas_mail] : [],
    cobranzasTelefono: Array.isArray(row.cobranzas_telefono)
      ? row.cobranzas_telefono
      : row.cobranzas_telefono ? [row.cobranzas_telefono] : [],
    cobranzasContacto: row.cobranzas_contacto || null,
    cobranzasObservaciones: row.cobranzas_observaciones || null,
    portalProveedores: row.portal_proveedores || false,
    portalProveedoresUrl: row.portal_proveedores_url || null,
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
    .select("*, order_items!order_items_order_id_fkey(*, products(code, name)), order_status_history(*)")
    .order("created_at", { ascending: false })
    .limit(50000)

  if (error) throw error
  return (data || []).map(mapOrder)
}

export async function fetchOrderById(id: string): Promise<Order | null> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items!order_items_order_id_fkey(*, products(code, name)), order_status_history(*)")
    .eq("id", id)
    .single()

  if (error) return null
  return mapOrder(data)
}

export async function fetchOrdersByVendedor(vendedorId: string): Promise<Order[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items!order_items_order_id_fkey(*, products(code, name)), order_status_history(*)")
    .eq("vendedor_id", vendedorId)
    .order("created_at", { ascending: false })
    .limit(50000)

  if (error) throw error
  return (data || []).map(mapOrder)
}

// R.7: dispara la notificación por email a Matías (vía API server-side, que
// resuelve el envío según EMAIL_ENABLED). No bloquea ni rompe la operación si
// falla — se ejecuta desde el browser tras crear/modificar el pedido.
export async function notificarPedido(
  orderId: string,
  tipo: "creado" | "modificado",
  itemsAgregados?: { nombre: string; cantidad: number }[]
): Promise<void> {
  try {
    await fetch("/api/pedidos/notificar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, tipo, itemsAgregados: itemsAgregados || [] }),
    })
  } catch (e) {
    console.error("notificarPedido:", e)
  }
}

// Plan B: días hasta que vence una reserva de stock no entregada (configurable).
export const RESERVA_EXPIRA_DIAS = 30

// Plan B: helper para ajustar stock de forma atómica vía RPC `ajustar_stock`
// (actualiza fisico/reservado/disponible + escribe en movimientos_stock en una
// sola transacción con lock de fila). Tira si la RPC falla.
async function ajustarStock(
  supabase: ReturnType<typeof createSupabaseClient>,
  args: {
    productId: string | null
    deltaFisico: number
    deltaReservado: number
    tipo: string
    cantidad: number
    usuarioId?: string | null
    usuarioNombre?: string | null
    observacion?: string | null
    referenciaTipo?: string | null
    referenciaId?: string | null
  },
): Promise<void> {
  if (!args.productId) return // líneas libres / descuentos no mueven stock
  const { error } = await supabase.rpc("ajustar_stock", {
    p_product_id: args.productId,
    p_delta_fisico: args.deltaFisico,
    p_delta_reservado: args.deltaReservado,
    p_tipo: args.tipo,
    p_cantidad: args.cantidad,
    p_usuario_id: args.usuarioId ?? null,
    p_usuario_nombre: args.usuarioNombre ?? null,
    p_observacion: args.observacion ?? null,
    p_referencia_tipo: args.referenciaTipo ?? null,
    p_referencia_id: args.referenciaId ?? null,
  })
  if (error) throw error
}

// Plan B: al cancelar un pedido, liberar la reserva de stock de los ítems que
// AÚN reservaban (no los ya facturados, cuyo físico ya salió). Físico no cambia;
// disponible sube. Luego marca todos los ítems como no reservados.
export async function cancelarPedidoLiberarStock(orderId: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { data: items } = await supabase
    .from("order_items")
    .select("id, product_id, quantity, tipo_linea, reservado")
    .eq("order_id", orderId)
  for (const it of (items || []) as any[]) {
    if (it.reservado && it.tipo_linea === "producto" && it.product_id) {
      await ajustarStock(supabase, {
        productId: it.product_id,
        deltaFisico: 0,
        deltaReservado: -Number(it.quantity),
        tipo: "LiberaReserva",
        cantidad: Number(it.quantity),
        observacion: "Cancelación de pedido",
        referenciaTipo: "order",
        referenciaId: orderId,
      })
    }
  }
  await supabase.from("order_items").update({ reservado: false }).eq("order_id", orderId)
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
  items: { productId: string | null; productCode: string; productName: string; quantity: number; price: number; tipoLinea?: "producto" | "libre" | "descuento" }[]
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

  // P5: orders.zona es enum NOT NULL (Norte|Capital|Sur|Oeste|GBA). Clientes
  // importados sin zona traen NULL o "" y rompen el insert (23502 / 22P02).
  // Sanitizamos a un valor válido por defecto.
  const ZONAS_VALIDAS = ["Norte", "Capital", "Sur", "Oeste", "GBA"]
  const zonaSafe = ZONAS_VALIDAS.includes(order.zona) ? order.zona : "Capital"

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
      zona: zonaSafe,
      status: order.status || "INGRESADO",
      total: order.total,
      notes: order.notes,
      is_custom: order.isCustom,
      is_urgent: order.isUrgent,
      estimated_delivery: new Date(Date.now() + (order.isCustom ? 15 : 3) * 86400000).toISOString().slice(0, 10),
      razon_social: order.razonSocial || null,
      // Plan B: la reserva de stock vence a los RESERVA_EXPIRA_DIAS (default 30).
      reserva_expira_at: new Date(Date.now() + RESERVA_EXPIRA_DIAS * 86400000).toISOString(),
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

  // Insert order items.
  // Para lineas libres y descuentos, product_id queda null y los datos del
  // item se denormalizan en producto_nombre/producto_codigo (la lectura los
  // recupera via mapOrderItem).
  const items = order.items.map((item) => {
    const tipo = item.tipoLinea || "producto"
    const esCatalogo = tipo === "producto"
    return {
      order_id: orderData.id,
      product_id: esCatalogo && item.productId && item.productId.trim() !== "" ? item.productId : null,
      quantity: item.quantity,
      unit_price: item.price,
      reservado: tipo === "producto", // descuentos/libres no reservan stock
      reservado_at: new Date().toISOString(),
      tipo_linea: tipo,
      producto_nombre: esCatalogo ? null : item.productName,
      producto_codigo: esCatalogo ? null : (item.productCode || (tipo === "descuento" ? "DESCUENTO" : "LIBRE")),
    }
  })

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

  // Plan B: RESERVAR stock (no descuenta físico). reservado += q y el disponible
  // se recalcula (= fisico − reservado) dentro de la RPC atómica. El físico
  // recién baja al facturar. Shortage = no había disponible suficiente al reservar.
  const shortages: { productId: string; originalStock: number; quantity: number; name: string; code: string }[] = []
  for (const item of order.items) {
    if (item.productId) {
      const { data: product } = await supabase
        .from("products")
        .select("stock, name, code")
        .eq("id", item.productId)
        .single()
      if (product) {
        const originalStock = product.stock ?? 0 // disponible antes de reservar
        await ajustarStock(supabase, {
          productId: item.productId,
          deltaFisico: 0,
          deltaReservado: item.quantity,
          tipo: "Reserva",
          cantidad: item.quantity,
          usuarioId: vendedorIdSafe,
          usuarioNombre: order.vendedorName || null,
          referenciaTipo: "order",
          referenciaId: orderData.id,
        })
        // Track items where original disponible < quantity requested
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

  // T.3: marcar el pedido como Incompleto si algún ítem no tenía stock
  // suficiente. Antes esto solo se hacía en el form de Nuevo Pedido (después de
  // createOrder), por lo que la conversión Cotización→Pedido se salteaba el
  // chequeo: el pedido quedaba sin es_incompleto y se podía facturar/repartir
  // sin aviso. Al hacerlo acá, TODOS los caminos de creación quedan cubiertos.
  // No bloquea la creación, solo avisa y marca.
  if (shortages.length > 0) {
    await supabase
      .from("orders")
      .update({
        es_incompleto: true,
        observaciones_incompleto: `Stock insuficiente para: ${shortages.map((s) => s.name).join(", ")}`,
      })
      .eq("id", orderData.id)
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

  // R.7: notificar a Matías el pedido nuevo (no bloqueante).
  await notificarPedido(orderData.id, "creado")

  return orderData.id
}

export async function addItemsToOrder(
  orderId: string,
  items: { productId: string | null; productCode: string; productName: string; quantity: number; price: number; tipoLinea?: "producto" | "libre" | "descuento" }[]
): Promise<void> {
  const supabase = createSupabaseClient()
  if (items.length === 0) return

  const rows = items.map((item) => {
    const tipo = item.tipoLinea || "producto"
    const esCatalogo = tipo === "producto"
    return {
      order_id: orderId,
      product_id: esCatalogo && item.productId && item.productId.trim() !== "" ? item.productId : null,
      quantity: item.quantity,
      unit_price: item.price,
      reservado: tipo === "producto",
      reservado_at: new Date().toISOString(),
      tipo_linea: tipo,
      producto_nombre: esCatalogo ? null : item.productName,
      producto_codigo: esCatalogo ? null : (item.productCode || (tipo === "descuento" ? "DESCUENTO" : "LIBRE")),
    }
  })
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

  // Plan B: reservar stock de los ítems agregados (no descuenta físico).
  for (const item of items) {
    if (!item.productId) continue
    await ajustarStock(supabase, {
      productId: item.productId,
      deltaFisico: 0,
      deltaReservado: item.quantity,
      tipo: "Reserva",
      cantidad: item.quantity,
      referenciaTipo: "order",
      referenciaId: orderId,
    })
  }

  // R.7: notificar a Matías los productos agregados al pedido (no bloqueante).
  await notificarPedido(orderId, "modificado", items.map((i) => ({ nombre: i.productName, cantidad: i.quantity })))
}

// Eliminar un item del pedido. Simetrico a addItemsToOrder: devuelve el stock
// reservado (solo si era un producto de catalogo), resta el subtotal del total
// del pedido y borra la fila. No permite borrar items ya facturados.
export async function removeOrderItem(orderId: string, itemId: string): Promise<void> {
  const supabase = createSupabaseClient()

  const { data: item, error: itemErr } = await supabase
    .from("order_items")
    .select("quantity, unit_price, product_id, tipo_linea, facturado, cantidad_facturada")
    .eq("id", itemId)
    .eq("order_id", orderId)
    .single()
  if (itemErr || !item) throw itemErr || new Error("Item no encontrado")
  if (item.facturado || Number(item.cantidad_facturada || 0) > 0) {
    throw new Error("No se puede eliminar un item que ya fue facturado (total o parcial)")
  }

  const { error: delErr } = await supabase.from("order_items").delete().eq("id", itemId)
  if (delErr) throw delErr

  // Restar el subtotal del total del pedido
  const { data: currentOrder } = await supabase
    .from("orders")
    .select("total")
    .eq("id", orderId)
    .single()
  const delta = Number(item.quantity) * Number(item.unit_price)
  const newTotal = Math.max(0, Number(currentOrder?.total || 0) - delta)
  await supabase
    .from("orders")
    .update({ total: newTotal, updated_at: new Date().toISOString() })
    .eq("id", orderId)

  // Plan B: liberar la reserva (reservado −= q, físico igual → disponible sube).
  if (item.tipo_linea === "producto" && item.product_id) {
    await ajustarStock(supabase, {
      productId: item.product_id,
      deltaFisico: 0,
      deltaReservado: -Number(item.quantity),
      tipo: "LiberaReserva",
      cantidad: Number(item.quantity),
      referenciaTipo: "order",
      referenciaId: orderId,
    })
  }
}

// R.6: editar cantidad y/o precio de un item de un pedido existente. Recalcula
// el total del pedido y ajusta el stock reservado por la diferencia de cantidad
// (solo productos de catálogo). No permite editar items facturados (total o
// parcial), igual que removeOrderItem.
export async function updateOrderItem(
  orderId: string,
  itemId: string,
  updates: { quantity?: number; price?: number }
): Promise<void> {
  const supabase = createSupabaseClient()

  const { data: item, error: itemErr } = await supabase
    .from("order_items")
    .select("quantity, unit_price, product_id, tipo_linea, facturado, cantidad_facturada")
    .eq("id", itemId)
    .eq("order_id", orderId)
    .single()
  if (itemErr || !item) throw itemErr || new Error("Item no encontrado")
  if (item.facturado || Number(item.cantidad_facturada || 0) > 0) {
    throw new Error("No se puede editar un item que ya fue facturado (total o parcial)")
  }

  const newQty = updates.quantity != null ? updates.quantity : Number(item.quantity)
  const newPrice = updates.price != null ? updates.price : Number(item.unit_price)
  if (newQty <= 0) throw new Error("La cantidad debe ser mayor a 0")

  // Plan B: ajustar la RESERVA por la diferencia de cantidad (solo catálogo).
  if (item.tipo_linea === "producto" && item.product_id && newQty !== Number(item.quantity)) {
    const delta = newQty - Number(item.quantity) // + reserva más, − libera
    await ajustarStock(supabase, {
      productId: item.product_id,
      deltaFisico: 0,
      deltaReservado: delta,
      tipo: delta > 0 ? "Reserva" : "LiberaReserva",
      cantidad: Math.abs(delta),
      referenciaTipo: "order",
      referenciaId: orderId,
    })
  }

  const { error: updErr } = await supabase
    .from("order_items")
    .update({ quantity: newQty, unit_price: newPrice })
    .eq("id", itemId)
  if (updErr) throw updErr

  // Recalcular total del pedido desde todos sus items.
  const { data: allItems } = await supabase
    .from("order_items")
    .select("quantity, unit_price")
    .eq("order_id", orderId)
  const total = (allItems || []).reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0)
  await supabase
    .from("orders")
    .update({ total, updated_at: new Date().toISOString() })
    .eq("id", orderId)
}

// R.9: pedidos del mismo cliente a los que se puede mover un item (INGRESADO o
// BORRADOR), excluyendo el pedido de origen.
export async function fetchMovableTargetOrders(
  clientId: string,
  excludeOrderId: string
): Promise<{ id: string; orderNumber: string; status: string; total: number; createdAt: Date }[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number_serial, order_number, status, total, created_at")
    .eq("client_id", clientId)
    .in("status", ["INGRESADO", "BORRADOR"])
    .neq("id", excludeOrderId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data || []).map((o: any) => ({
    id: o.id,
    orderNumber: o.order_number_serial || o.order_number || o.id.slice(0, 8),
    status: o.status,
    total: Number(o.total) || 0,
    createdAt: new Date(o.created_at),
  }))
}

// R.9: mover un item pendiente de un pedido a otro del mismo cliente. El item se
// copia al pedido destino (sumándose a su total) y en el origen queda marcado
// como movido: NO se devuelve stock ni se recalcula el total del origen (el
// stock ya estaba reservado y simplemente "viaja" con el item al destino).
export async function moveOrderItemToOrder(
  itemId: string,
  fromOrderId: string,
  toOrderId: string
): Promise<void> {
  const supabase = createSupabaseClient()
  if (fromOrderId === toOrderId) throw new Error("El pedido destino debe ser distinto al de origen")

  const { data: item, error: itemErr } = await supabase
    .from("order_items")
    .select("quantity, unit_price, product_id, tipo_linea, producto_nombre, producto_codigo, facturado, cantidad_facturada, movido")
    .eq("id", itemId)
    .eq("order_id", fromOrderId)
    .single()
  if (itemErr || !item) throw itemErr || new Error("Item no encontrado")
  if (item.facturado || Number(item.cantidad_facturada || 0) > 0) {
    throw new Error("No se puede mover un item ya facturado")
  }
  if (item.movido) throw new Error("El item ya fue movido a otro pedido")

  // Validar que ambos pedidos sean del mismo cliente.
  const { data: orders } = await supabase
    .from("orders")
    .select("id, client_id, total")
    .in("id", [fromOrderId, toOrderId])
  const fromOrder = (orders || []).find((o: any) => o.id === fromOrderId)
  const toOrder = (orders || []).find((o: any) => o.id === toOrderId)
  if (!fromOrder || !toOrder) throw new Error("Pedido no encontrado")
  if (fromOrder.client_id !== toOrder.client_id) {
    throw new Error("Solo se puede mover a un pedido del mismo cliente")
  }

  // Copiar el item al pedido destino (sin tocar stock: ya estaba reservado).
  const { error: insErr } = await supabase.from("order_items").insert({
    order_id: toOrderId,
    product_id: item.product_id,
    quantity: item.quantity,
    unit_price: item.unit_price,
    reservado: false,
    reservado_at: new Date().toISOString(),
    tipo_linea: item.tipo_linea || "producto",
    producto_nombre: item.producto_nombre,
    producto_codigo: item.producto_codigo,
  })
  if (insErr) throw insErr

  // Sumar al total del pedido destino.
  const nuevoTotalDestino = Number(toOrder.total || 0) + Number(item.quantity) * Number(item.unit_price)
  await supabase
    .from("orders")
    .update({ total: nuevoTotalDestino, updated_at: new Date().toISOString() })
    .eq("id", toOrderId)

  // Marcar el item de origen como movido (no se devuelve stock ni se recalcula
  // el total del origen, según R.9).
  const { error: updErr } = await supabase
    .from("order_items")
    .update({ movido: true, movido_a_order_id: toOrderId })
    .eq("id", itemId)
  if (updErr) throw updErr
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

// Edicion generica de pedido (item Excel #92, D.7). NO toca status — para
// eso usar updateOrderStatus. NO toca productos — la card de productos
// tiene su propio flow (agregar/eliminar). Solo modifica campos generales
// del pedido. La validacion de que se permita editar segun el estado vive
// en el caller (UI condicional).
export async function updateOrder(
  id: string,
  updates: Partial<{
    notes: string | null
    sector: string | null
    solicita: string | null
    recibe: string | null
    entrega_otra_sucursal: string | null
    razon_social: string | null
    is_urgent: boolean
    client_id: string | null
    client_name: string | null
    vendedor_id: string | null
    vendedor_name: string | null
    zona: string | null
    observaciones_incompleto: string | null
  }>
): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase
    .from("orders")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) throw error
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
  // T.1: tolerar drift de schema. En producción faltaba la columna
  // `clients.sucursal` (la migración 20260324 sección D nunca se aplicó), así
  // que cualquier update que la incluyera fallaba con "Error al guardar" y
  // bloqueaba la edición de la ficha del cliente. Si el insert/update falla con
  // 42703 (columna inexistente), removemos esa columna y reintentamos, en vez
  // de tirar todo el guardado abajo por un campo opcional ausente.
  let payload: Record<string, any> = { ...updates }
  for (let attempt = 0; attempt < 6; attempt++) {
    const { error } = await supabase.from("clients").update(payload).eq("id", id)
    if (!error) return
    if (error.code === "42703") {
      const m = /column "?(?:[\w]+\.)?([\w]+)"? does not exist/i.exec(error.message || "")
      const col = m?.[1]
      if (col && col in payload) {
        console.warn(`updateClient: columna '${col}' inexistente en clients, se omite y se reintenta`, error.message)
        delete payload[col]
        continue
      }
    }
    throw error
  }
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
  domicilioEntrega?: string;
  sucursalEntrega?: string;
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
    domicilio_entrega: client.domicilioEntrega || null,
    sucursal_entrega: client.sucursalEntrega || null,
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

// ───── Orden de compra del cliente: archivos adjuntos ─────

export interface OrdenCompraArchivo {
  id: string
  order_id: string
  url: string
  storage_path: string | null
  filename: string | null
  content_type: string | null
  uploaded_at: string
}

export async function fetchOrdenCompraArchivos(orderId: string): Promise<OrdenCompraArchivo[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("orden_compra_archivos")
    .select("*")
    .eq("order_id", orderId)
    .order("uploaded_at", { ascending: true })
  if (error) throw error
  return (data || []) as OrdenCompraArchivo[]
}

export async function createOrdenCompraArchivo(input: {
  order_id: string
  url: string
  storage_path?: string | null
  filename?: string | null
  content_type?: string | null
}): Promise<string> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("orden_compra_archivos")
    .insert(input)
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

export async function deleteOrdenCompraArchivo(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("orden_compra_archivos").delete().eq("id", id)
  if (error) throw error
}

// ───── Orden de pago a proveedor: archivos adjuntos ─────

export interface OrdenPagoArchivo {
  id: string
  pago_id: string
  url: string
  storage_path: string | null
  filename: string | null
  content_type: string | null
  uploaded_at: string
}

export async function fetchOrdenesPagoArchivos(pagoId: string): Promise<OrdenPagoArchivo[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("ordenes_pago_archivos")
    .select("*")
    .eq("pago_id", pagoId)
    .order("uploaded_at", { ascending: true })
  if (error) throw error
  return (data || []) as OrdenPagoArchivo[]
}

export async function createOrdenPagoArchivo(input: {
  pago_id: string
  url: string
  storage_path?: string | null
  filename?: string | null
  content_type?: string | null
}): Promise<string> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("ordenes_pago_archivos")
    .insert(input)
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

export async function deleteOrdenPagoArchivo(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("ordenes_pago_archivos").delete().eq("id", id)
  if (error) throw error
}

export async function fetchProveedorSucursales(proveedorId: string): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("proveedor_sucursales")
    .select("*")
    .eq("proveedor_id", proveedorId)
    .order("nombre", { ascending: true })
  if (error) throw error
  return data || []
}

export async function createProveedorSucursal(input: {
  proveedor_id: string
  nombre: string
  direccion?: string | null
  localidad?: string | null
  provincia?: string | null
  telefono?: string | null
  horario?: string | null
  notas?: string | null
}): Promise<string> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("proveedor_sucursales")
    .insert(input)
    .select("id")
    .single()
  if (error) throw error
  return data.id
}

export async function updateProveedorSucursal(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("proveedor_sucursales").update(updates).eq("id", id)
  if (error) throw error
}

export async function deleteProveedorSucursal(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("proveedor_sucursales").delete().eq("id", id)
  if (error) throw error
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
  // Fuente unificada para el Informe de Saldos Pendientes (bug A.3).
  //
  // Antes leia solo de cobranzas_pendientes, que es snapshot del importador
  // gestionpro (marzo 2026). Las facturas emitidas despues no aparecian en
  // el informe pero si en la cta cte -> los dos numeros divergian.
  //
  // Ahora une:
  //   (a) legacy de cobranzas_pendientes (saldo precalculado por el importador)
  //   (b) facturas FC/ND con saldo imputado FIFO desde cuenta_corriente_cliente
  //
  // Para (b): saldo neto del cliente = sum(debe) - sum(haber). Si es deudor,
  // imputamos ese saldo a las facturas mas antiguas primero (FIFO). Si es
  // <=0, no las incluimos (asumido cobradas).
  //
  // Asuncion: cobranzas_pendientes y cuenta_corriente_cliente son disjuntas
  // (la importacion de gestionpro no metio en cta cte). Si el usuario verifica
  // overlap, hay que descontar para evitar doble conteo.
  const supabase = createSupabaseClient()

  const [legacyRes, facturasRes, ccRes] = await Promise.all([
    supabase
      .from("cobranzas_pendientes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50000),
    supabase
      .from("facturas")
      .select("id, client_id, razon_social, numero, comprobante_nro, fecha, total, tipo, created_at, empresa")
      .order("fecha", { ascending: true })
      .limit(50000),
    supabase
      .from("cuenta_corriente_cliente")
      .select("client_id, debe, haber")
      .limit(100000),
  ])
  if (legacyRes.error) throw legacyRes.error
  if (facturasRes.error) throw facturasRes.error
  if (ccRes.error) throw ccRes.error

  type FactRow = {
    id: number
    client_id: string | null
    razon_social: string | null
    numero: string | null
    comprobante_nro: string | null
    fecha: string | null
    total: number | string
    tipo: string | null
    created_at: string | null
    empresa: string | null
  }
  type CCRow = { client_id: string | null; debe: number | string | null; haber: number | string | null }

  const saldoCliente = new Map<string, number>()
  for (const mov of (ccRes.data || []) as CCRow[]) {
    if (!mov.client_id) continue
    const prev = saldoCliente.get(mov.client_id) || 0
    saldoCliente.set(
      mov.client_id,
      prev + (Number(mov.debe) || 0) - (Number(mov.haber) || 0)
    )
  }

  // K2C.1: incluimos NC junto con FC/ND. Las NC aparecen como filas de la
  // tabla de comprobantes a cobrar para que el operador pueda tildarlas y
  // restarlas al saldo a abonar (totalSeleccionado descuenta su importe).
  const facturasFCND = ((facturasRes.data || []) as FactRow[]).filter((f) => {
    const t = (f.tipo || "").toUpperCase()
    return t.startsWith("FACTURA ") || t.startsWith("NOTA DE DEBITO") || t.startsWith("NOTA DE CREDITO")
  })

  const porCliente = new Map<string, FactRow[]>()
  for (const f of facturasFCND) {
    if (!f.client_id) continue
    const arr = porCliente.get(f.client_id) || []
    arr.push(f)
    porCliente.set(f.client_id, arr)
  }

  const nuevas: any[] = []
  for (const [clientId, fcs] of porCliente) {
    let restante = saldoCliente.get(clientId) || 0
    if (restante <= 0) continue
    fcs.sort((a, b) => {
      const da = a.fecha ? new Date(a.fecha).getTime() : 0
      const db = b.fecha ? new Date(b.fecha).getTime() : 0
      return da - db
    })
    for (const f of fcs) {
      const total = Number(f.total) || 0
      if (total <= 0) continue
      const t = (f.tipo || "").toUpperCase()
      const esNC = t.startsWith("NOTA DE CREDITO")
      let saldoFactura: number
      if (esNC) {
        // NC: aparecen con su total entero. No consumen `restante` porque
        // representan un crédito (haber) que ya está descontado en saldoCliente.
        saldoFactura = total
      } else {
        if (restante <= 0) continue
        saldoFactura = Math.min(restante, total)
        restante -= saldoFactura
      }
      nuevas.push({
        id: `f-${f.id}`,
        client_id: f.client_id,
        cliente_nombre: f.razon_social,
        comprobante: `${f.tipo || "FC"} ${f.comprobante_nro || f.numero || ""}`.trim(),
        fecha_comprobante: f.fecha,
        total,
        saldo: saldoFactura,
        saldo_acumulado: null,
        razon_social: f.razon_social,
        created_at: f.created_at,
        empresa: f.empresa,
        origen: "facturas",
      })
    }
  }

  return [...(legacyRes.data || []), ...nuevas]
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

// Aviso al recibir mercaderia: devuelve los pedidos venta vinculados a
// una OC (via solicitudes_compra). Se usa para mostrar al operador, en
// el dialog que se abre al marcar la OC como "Recibido Completo", la
// lista de pedidos que ya tienen su mercaderia disponible. NO filtra ni
// cambia estado — solo informa. Sprint H eliminó ESPERANDO_MERCADERIA,
// asi que la auto-transicion ya no aplica (los pedidos quedan en
// INGRESADO desde el principio).
export async function fetchPedidosVentaVinculadosAOC(ordenCompraId: string): Promise<{
  orderId: string
  orderNumber: string | null
  clientName: string | null
  status: string | null
}[]> {
  const supabase = createSupabaseClient()
  const { data: sols } = await supabase
    .from("solicitudes_compra")
    .select("order_id")
    .eq("orden_compra_id", ordenCompraId)
  const orderIds = Array.from(
    new Set((sols || []).map((s: any) => s.order_id).filter(Boolean))
  ) as string[]
  if (orderIds.length === 0) return []
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number_serial, order_number, client_name, status")
    .in("id", orderIds)
    // Solo pedidos no terminales — los CANCELADO/ENTREGADO no aplica
    // mostrarlos en un aviso de "mercaderia disponible".
    .not("status", "in", "(CANCELADO,ENTREGADO)")
  return (orders || []).map((o: any) => ({
    orderId: o.id,
    orderNumber: o.order_number_serial || o.order_number || null,
    clientName: o.client_name || null,
    status: o.status || null,
  }))
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
    descuento_porcentaje?: number
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
      descuento_porcentaje: i.descuento_porcentaje ?? 0,
      subtotal: i.subtotal,
    }))
    const { error: itemsError } = await supabase.from("orden_compra_items").insert(itemsInsert)
    if (itemsError) throw itemsError
  }

  return data.id
}

// N.2: editar cantidad / costo / descuento por ítem en una OC existente.
// Recalcula subtotal por ítem (neto de descuento) e importe_total de la OC.
export async function updateOrdenCompraItems(
  ordenCompraId: string,
  items: { id: string; cantidad: number; precio_unitario: number; descuento_porcentaje?: number; producto_nombre?: string }[],
): Promise<number> {
  const supabase = createSupabaseClient()
  let importeTotal = 0
  for (const it of items) {
    const base = it.cantidad * it.precio_unitario
    const desc = base * ((it.descuento_porcentaje || 0) / 100)
    const subtotal = Math.round((base - desc) * 100) / 100
    importeTotal += subtotal
    const { error } = await supabase
      .from("orden_compra_items")
      .update({
        cantidad: it.cantidad,
        precio_unitario: it.precio_unitario,
        descuento_porcentaje: it.descuento_porcentaje ?? 0,
        subtotal,
        // A.2: la descripción (producto_nombre) ahora es editable desde la OC.
        ...(it.producto_nombre !== undefined ? { producto_nombre: it.producto_nombre } : {}),
      })
      .eq("id", it.id)
    if (error) throw error
  }
  importeTotal = Math.round(importeTotal * 100) / 100
  const { error: ocError } = await supabase
    .from("ordenes_compra")
    .update({ importe_total: importeTotal })
    .eq("id", ordenCompraId)
  if (ocError) throw ocError
  return importeTotal
}

// A.3: recepción de mercadería desde el Seguimiento de Compras. Es el ÚNICO
// punto que mueve stock en el circuito de compras (no la factura de proveedor):
// sube `products.stock` por el DELTA de cantidad recibida por ítem, de modo que
// re-guardar o destildar no duplica ni descuenta de más (idempotente). Marca
// orden_compra_items.cantidad_recibida/recibido y el estado del seguimiento.
export async function recibirSeguimiento(params: {
  compraId: string
  ordenCompraId: string
  recepcion: { itemId: string; cantidadRecibida: number; recibido: boolean }[]
  estado: string
  observaciones?: string | null
}): Promise<void> {
  const supabase = createSupabaseClient()
  // Estado previo de los ítems para calcular el delta de stock a mover.
  const { data: rows, error: e0 } = await supabase
    .from("orden_compra_items")
    .select("id, product_id, cantidad_recibida, recibido")
    .eq("orden_compra_id", params.ordenCompraId)
  if (e0) throw e0
  const prevById = new Map((rows || []).map((r: any) => [r.id, r]))

  const stockDelta = new Map<string, number>()
  for (const rec of params.recepcion) {
    const prev = prevById.get(rec.itemId)
    const prevEf = prev?.recibido ? (Number(prev.cantidad_recibida) || 0) : 0
    const newEf = rec.recibido ? (Number(rec.cantidadRecibida) || 0) : 0
    const delta = newEf - prevEf
    const { error } = await supabase
      .from("orden_compra_items")
      .update({ cantidad_recibida: rec.cantidadRecibida, recibido: rec.recibido })
      .eq("id", rec.itemId)
    if (error) throw error
    const pid = prev?.product_id
    if (pid && delta !== 0) stockDelta.set(pid, (stockDelta.get(pid) || 0) + delta)
  }

  // Plan B (rework Plan A): la recepción sube el FÍSICO (+disponible), no el
  // "stock" a secas. Atómico vía RPC + registra en movimientos_stock (tipo Compra).
  for (const [pid, delta] of stockDelta) {
    if (delta === 0) continue
    await ajustarStock(supabase, {
      productId: pid,
      deltaFisico: delta,
      deltaReservado: 0,
      tipo: "Compra",
      cantidad: delta,
      observacion: "Recepción de mercadería (Seguimiento de Compras)",
      referenciaTipo: "orden_compra",
      referenciaId: params.ordenCompraId,
    })
  }

  // Actualizar el seguimiento (estado + observaciones de recepción).
  const upd: Record<string, any> = { estado: params.estado }
  if (params.observaciones !== undefined) upd.observaciones_recepcion = params.observaciones
  const { error: e2 } = await supabase.from("compras").update(upd).eq("id", params.compraId)
  if (e2) throw e2

  // A.5: al recibir mercadería (completa o incompleta con el faltante), impactar
  // los pedidos de venta vinculados a la OC: limpiar es_incompleto (saca el ícono
  // INC y deja el pedido listo para facturar) y registrar el evento en el
  // historial de estados. El vínculo OC→pedido es solicitudes_compra.orden_compra_id.
  if (params.estado === "Recibido Completo" || params.estado === "Recibido Incompleto") {
    const { data: ocRow } = await supabase
      .from("ordenes_compra").select("nro_oc").eq("id", params.ordenCompraId).maybeSingle()
    const nroOc = ocRow?.nro_oc || params.ordenCompraId
    const pedidos = await fetchPedidosVentaVinculadosAOC(params.ordenCompraId)
    for (const p of pedidos) {
      await supabase.from("orders").update({ es_incompleto: false }).eq("id", p.orderId)
      await supabase.from("order_status_history").insert({
        order_id: p.orderId,
        status: p.status, // mantiene el estado actual; solo se registra el evento
        changed_by: null,
        user_name: "Sistema (recepción compras)",
        notes: `Mercadería recibida (OC ${nroOc}) — ${params.estado}. Pedido listo para facturar.`,
      })
    }
  }
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
    .order("id", { ascending: false })
    .limit(50000)
  if (error) throw error
  return data || []
}

// T.4: listado de remitos emitidos para la pestaña de Facturación.
export async function fetchRemitos(): Promise<any[]> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("remitos")
    .select("*, orders(order_number_serial, order_number)")
    .order("created_at", { ascending: false })
    .limit(50000)
  if (error) throw error
  return (data || []).map((r: any) => ({
    ...r,
    pedido_numero: r.orders?.order_number_serial || r.orders?.order_number || null,
  }))
}

// T.4: genera una signed URL fresca para ver el PDF del remito (bucket privado).
export async function getRemitoPdfUrl(remito: { storage_path?: string | null; pdf_url?: string | null }): Promise<string | null> {
  if (remito.storage_path) {
    const supabase = createSupabaseClient()
    const { data } = await supabase.storage.from("remitos").createSignedUrl(remito.storage_path, 60 * 60)
    if (data?.signedUrl) return data.signedUrl
  }
  return remito.pdf_url || null
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
      orders!order_items_order_id_fkey!inner(id, order_number, order_number_serial, client_id, client_name, factura_id, created_at)
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
  // Derivar el N° del string ISO directamente (TZ-safe, ver formatNumeroReparto).
  const numero = formatNumeroReparto(fechaISO)
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
  // Join con orders y proveedor_sucursales para tener todos los datos del PDF.
  const { data, error } = await supabase
    .from("reparto_items")
    .select("*, orders(order_number_serial, order_number, notes), proveedor_sucursales(nombre, direccion, localidad)")
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

// Iniciar reparto: marca el reparto como en_curso y pasa todos sus pedidos
// no terminales a EN_PROCESO_ENTREGA. Idempotente.
export async function iniciarReparto(
  repartoId: string,
  changedBy: string,
  changedByName?: string,
): Promise<{ updated: number; skipped: number }> {
  const supabase = createSupabaseClient()
  await supabase.from("repartos").update({ estado: "en_curso" }).eq("id", repartoId)

  const { data: items } = await supabase
    .from("reparto_items")
    .select("order_id")
    .eq("reparto_id", repartoId)

  let updated = 0
  let skipped = 0
  for (const it of items || []) {
    if (!it.order_id) { skipped++; continue }
    const { data: ord } = await supabase
      .from("orders")
      .select("status")
      .eq("id", it.order_id)
      .single()
    if (!ord) { skipped++; continue }
    if (ord.status === "EN_PROCESO_ENTREGA" || ord.status === "ENTREGADO" || ord.status === "CANCELADO") {
      skipped++
      continue
    }
    try {
      await updateOrderStatus(
        it.order_id,
        "EN_PROCESO_ENTREGA",
        changedBy,
        changedByName || "Admin",
        "Recorrido iniciado desde Logística",
      )
      updated++
    } catch (e) {
      console.error("iniciarReparto: pedido", it.order_id, e)
      skipped++
    }
  }
  return { updated, skipped }
}

// Al pasar un pedido a FACTURADO o FACTURADO_PARCIAL, asignarlo al reparto
// del próximo día hábil. Permitimos re-asignación: si el pedido ya está en
// un reparto antiguo pero hoy hay items pendientes, lo movemos al nuevo.
// Idempotente: si ya está en el reparto destino, no hacemos nada.
export async function assignOrderToNextReparto(orderId: string): Promise<void> {
  const supabase = createSupabaseClient()
  const { data: order } = await supabase
    .from("orders")
    .select("id, client_name, zona, entrega_otra_sucursal, factura_id, reparto_id, status")
    .eq("id", orderId)
    .single()
  if (!order) return

  const fecha = proximoDiaHabil(new Date())
  const fechaISO = fecha.toISOString().slice(0, 10)
  const repartoId = await ensureRepartoForFecha(fechaISO)

  // R.14: la transición a EN_PROCESO_ENTREGA debe dispararse también para
  // FACTURADO_PARCIAL (p.ej. un pedido que venía de ENTREGADO_PARCIAL y se
  // factura el resto). updateOrderStatus llama a esta función para ambos
  // estados, pero antes solo FACTURADO transicionaba: el pedido quedaba
  // asignado al reparto pero sin pasar a EN_PROCESO_ENTREGA, inconsistente con
  // la hoja de ruta.
  const shouldTransition = order.status === "FACTURADO" || order.status === "FACTURADO_PARCIAL"
  const alreadyInReparto = order.reparto_id === repartoId

  if (!alreadyInReparto) {
    const { data: existing } = await supabase
      .from("reparto_items")
      .select("id")
      .eq("reparto_id", repartoId)
      .eq("order_id", orderId)
      .maybeSingle()

    if (!existing) {
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
    }
  }

  const updateFields: Record<string, unknown> = {
    reparto_id: repartoId,
    numero_reparto: formatNumeroReparto(fechaISO),
  }
  if (shouldTransition) {
    updateFields.status = "EN_PROCESO_ENTREGA"
    console.log(`assignOrderToNextReparto: ${orderId} ${order.status} -> EN_PROCESO_ENTREGA al asignar reparto ${repartoId}`)
  }

  await supabase.from("orders").update(updateFields).eq("id", orderId)

  if (shouldTransition) {
    await supabase.from("order_status_history").insert({
      order_id: orderId,
      status: "EN_PROCESO_ENTREGA",
      changed_by: "sistema",
      user_name: "Sistema",
      notes: `Auto: asignacion a reparto ${formatNumeroReparto(fechaISO)}`,
    })
  }
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

export async function updateMovimientoCajaChica(id: string, updates: Record<string, any>): Promise<void> {
  const supabase = createSupabaseClient()
  const { error } = await supabase.from("movimientos_caja_chica").update(updates).eq("id", id)
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
  if (error) {
    // T.5: loguear los campos del error de Postgres para diagnosticar.
    console.error("createFacturaProveedor: insert failed", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    throw error
  }
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
  if (error) {
    console.error("createMovimientoCuentaCorrienteProveedor: insert failed", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    })
    throw error
  }
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

export async function createPlanCuenta(input: {
  codigo: string
  categoria: string
  sub_categoria?: string | null
}): Promise<any> {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase
    .from("plan_cuentas")
    .insert({
      codigo: input.codigo.trim(),
      categoria: input.categoria.trim(),
      sub_categoria: input.sub_categoria?.trim() || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updatePlanCuenta(id: string, updates: {
  codigo?: string
  categoria?: string
  sub_categoria?: string | null
}): Promise<void> {
  const supabase = createSupabaseClient()
  const cleaned: Record<string, unknown> = {}
  if (updates.codigo !== undefined) cleaned.codigo = updates.codigo.trim()
  if (updates.categoria !== undefined) cleaned.categoria = updates.categoria.trim()
  if (updates.sub_categoria !== undefined) cleaned.sub_categoria = updates.sub_categoria?.trim() || null
  const { error } = await supabase.from("plan_cuentas").update(cleaned).eq("id", id)
  if (error) throw error
}

// Borrar cuenta del plan, validando que no esté usada en imputaciones de
// facturas de proveedor. Imputaciones es JSONB array con shape
// [{ cuenta_codigo, cuenta_categoria, cuenta_sub, debe, haber }] — ver
// app/admin/facturas-proveedor/page.tsx:461. Buscamos por cuenta_codigo
// porque ese es el identificador estable que se persiste en imputaciones.
export async function deletePlanCuenta(id: string): Promise<void> {
  const supabase = createSupabaseClient()
  // 1) Traer el codigo de la cuenta a eliminar (necesario para matchear contra
  //    imputaciones, que guarda cuenta_codigo no id).
  const { data: cuenta, error: cErr } = await supabase
    .from("plan_cuentas")
    .select("codigo")
    .eq("id", id)
    .maybeSingle()
  if (cErr) {
    console.error("deletePlanCuenta: error leyendo cuenta", cErr)
    throw new Error("No se pudo leer la cuenta — abortando borrado por seguridad.")
  }
  if (!cuenta?.codigo) {
    throw new Error("Cuenta no encontrada.")
  }
  // 2) Verificar uso en imputaciones via contains: el JSONB debe contener al
  //    menos un elemento {cuenta_codigo: X}.
  const { data: used, error: usedErr } = await supabase
    .from("facturas_proveedor")
    .select("id")
    .filter("imputaciones", "cs", JSON.stringify([{ cuenta_codigo: cuenta.codigo }]))
    .limit(1)
  if (usedErr) {
    console.error("deletePlanCuenta: error verificando uso", usedErr)
    throw new Error("No se pudo verificar el uso de la cuenta — abortando borrado por seguridad.")
  }
  if (used && used.length > 0) {
    throw new Error(`La cuenta ${cuenta.codigo} está usada en imputaciones de facturas de proveedor. No se puede eliminar.`)
  }
  const { error } = await supabase.from("plan_cuentas").delete().eq("id", id)
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

// Mapeo de prefijos por empresa para el campo numero_completo de recibos.
// Para empresas no listadas (o NULL), cae a "REC".
export const RECIBO_PREFIX_POR_EMPRESA: Record<string, string> = {
  "Aquiles": "AQ",
  "Conancap": "CO",
  "Masoil": "MA",
}

export interface NextReciboNumero {
  numero: number             // correlativo POR empresa
  numero_completo: string    // presentación con prefijo, ej "AQ-0001"
}

/**
 * Próximo correlativo de recibo. POR EMPRESA: cada empresa tiene su propia
 * secuencia 1..N. La empresa NULL cae a la secuencia legacy.
 *
 * Si no se pasa empresa o es null, busca el próximo entre los recibos con
 * empresa NULL (legacy). En general el caller debería pasar empresa siempre.
 */
export async function getNextReciboNumero(empresa?: string | null): Promise<NextReciboNumero> {
  const supabase = createSupabaseClient()
  let query = supabase
    .from("recibos_cobranza")
    .select("numero")
    .order("numero", { ascending: false })
    .limit(1)
  if (empresa) query = query.eq("empresa", empresa)
  else query = query.is("empresa", null)
  const { data, error } = await query
  if (error) throw error
  const numero = data && data.length > 0 ? data[0].numero + 1 : 1
  const prefix = (empresa && RECIBO_PREFIX_POR_EMPRESA[empresa]) || "REC"
  const numero_completo = `${prefix}-${String(numero).padStart(4, "0")}`
  return { numero, numero_completo }
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
    tipo_linea?: "producto" | "descuento" | "libre"
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
      tipo_linea: i.tipo_linea || "producto",
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
  descuento_porcentaje?: number | null
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
      descuento_porcentaje: row.descuento_porcentaje ?? 0,
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
