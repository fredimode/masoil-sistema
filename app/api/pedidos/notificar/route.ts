import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { createClient, createServiceClient } from "@/lib/supabase/server"

// R.7: notificación por email a Matías cuando se crea un pedido nuevo o se le
// agregan productos a uno existente. Si EMAIL_ENABLED no es "true" (p.ej. en
// Vercel todavía está deshabilitado) se loguea el intento pero no se envía ni
// se bloquea la operación. El envío se activa solo con la variable de entorno.

const DESTINATARIO = "matias@aquilesweb.com"
const FROM = "Masoil <proveedores@masoil.com.ar>"

interface BodyInput {
  orderId: string
  tipo: "creado" | "modificado"
  itemsAgregados?: { nombre: string; cantidad: number }[]
}

export async function POST(request: NextRequest) {
  let body: BodyInput
  try {
    body = (await request.json()) as BodyInput
  } catch {
    return NextResponse.json({ success: false, error: "JSON inválido" }, { status: 400 })
  }
  const { orderId, tipo, itemsAgregados } = body
  if (!orderId || !tipo) {
    return NextResponse.json({ success: false, error: "orderId y tipo requeridos" }, { status: 400 })
  }

  const emailEnabled = process.env.EMAIL_ENABLED === "true"

  // Quién modificó: del usuario autenticado (best-effort).
  let modificadoPor = "—"
  try {
    const authClient = await createClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (user) {
      const { data: vend } = await authClient
        .from("vendedores")
        .select("name, email")
        .eq("auth_user_id", user.id)
        .maybeSingle()
      modificadoPor = vend?.name || vend?.email || user.email || "—"
    }
  } catch {
    // no bloqueante
  }

  // Datos del pedido (service client para no depender de RLS).
  const supabase = createServiceClient()
  const { data: order } = await supabase
    .from("orders")
    .select("id, order_number_serial, order_number, client_name, vendedor_name, total, status")
    .eq("id", orderId)
    .single()

  if (!order) {
    return NextResponse.json({ success: false, error: "Pedido no encontrado" }, { status: 404 })
  }

  const numero = order.order_number_serial || order.order_number || orderId.slice(0, 8)

  // Lista de items: para "modificado" los agregados; para "creado" todos.
  let itemsList: { nombre: string; cantidad: number }[] = itemsAgregados || []
  if (tipo === "creado" || itemsList.length === 0) {
    const { data: items } = await supabase
      .from("order_items")
      .select("quantity, producto_nombre, products(name)")
      .eq("order_id", orderId)
    itemsList = (items || []).map((i: any) => ({
      nombre: i.products?.name || i.producto_nombre || "Producto",
      cantidad: i.quantity,
    }))
  }

  const origin = new URL(request.url).origin
  const link = `${origin}/admin/pedidos/${orderId}`

  const asunto = tipo === "creado"
    ? `Nuevo pedido ${numero} — ${order.client_name || ""}`
    : `Pedido ${numero} modificado — ${order.client_name || ""}`

  const filas = itemsList
    .map((i) => `<tr><td style="padding:4px 8px;border-bottom:1px solid #eee">${i.nombre}</td><td style="padding:4px 8px;border-bottom:1px solid #eee;text-align:right">${i.cantidad}</td></tr>`)
    .join("")

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
      <h2 style="margin:0 0 12px">${tipo === "creado" ? "Nuevo pedido creado" : "Pedido modificado"}</h2>
      <p><strong>N° de pedido:</strong> ${numero}</p>
      <p><strong>Cliente:</strong> ${order.client_name || "—"}</p>
      <p><strong>Vendedor del pedido:</strong> ${order.vendedor_name || "—"}</p>
      <p><strong>${tipo === "creado" ? "Creado/modificado por" : "Modificado por"}:</strong> ${modificadoPor}</p>
      <p><strong>Estado:</strong> ${order.status}</p>
      <h3 style="margin:16px 0 4px">${tipo === "creado" ? "Items del pedido" : "Items agregados/modificados"}</h3>
      <table style="border-collapse:collapse;width:100%;max-width:480px">
        <thead><tr><th style="text-align:left;padding:4px 8px;border-bottom:2px solid #ccc">Producto</th><th style="text-align:right;padding:4px 8px;border-bottom:2px solid #ccc">Cant.</th></tr></thead>
        <tbody>${filas || `<tr><td colspan="2" style="padding:4px 8px">—</td></tr>`}</tbody>
      </table>
      <p style="margin-top:16px"><a href="${link}" style="background:#7c3aed;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none">Ver pedido</a></p>
      <p style="color:#888;font-size:12px">${link}</p>
    </div>
  `

  if (!emailEnabled || !process.env.RESEND_API_KEY) {
    console.log(`[notificar-pedido] EMAIL_ENABLED=${emailEnabled} — intento no enviado:`, { orderId, tipo, numero, destinatario: DESTINATARIO })
    return NextResponse.json({ success: true, enviado: false, motivo: "EMAIL_ENABLED!=true o sin RESEND_API_KEY" })
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await resend.emails.send({
      from: FROM,
      to: [DESTINATARIO],
      subject: asunto,
      html,
    })
    if (error) {
      console.error("[notificar-pedido] Resend error:", error)
      return NextResponse.json({ success: true, enviado: false, motivo: error.message })
    }
    return NextResponse.json({ success: true, enviado: true })
  } catch (e: any) {
    console.error("[notificar-pedido] excepción:", e)
    return NextResponse.json({ success: true, enviado: false, motivo: e?.message || "error" })
  }
}
