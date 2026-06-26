import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

// Plan B Fase 4: libera el stock reservado de pedidos cuya reserva venció.
// Opción (a): el pedido SIGUE activo; solo se libera el reservado y se marca
// reserva_expirada=true. Pensado para Vercel Cron (diario).
export const dynamic = "force-dynamic"
export const maxDuration = 60

// Estados que aún reservan stock (mismo criterio que el backfill de Fase 1).
const ESTADOS_ABIERTOS = ["BORRADOR", "INGRESADO", "FACTURADO_PARCIAL"]

export async function GET(request: NextRequest) {
  // Auth fail-closed: Vercel envía Authorization: Bearer $CRON_SECRET.
  const auth = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const dryRun = request.nextUrl.searchParams.get("dry_run") === "true"
  const supabase = createServiceClient()
  const ahora = new Date().toISOString()

  // Pedidos con reserva vencida, aún abiertos y no marcados como expirados.
  // Los pedidos viejos (reserva_expira_at NULL) NO entran (no expiran).
  const { data: pedidos, error } = await supabase
    .from("orders")
    .select("id, order_number_serial, order_number, status, reserva_expira_at")
    .lte("reserva_expira_at", ahora)
    .eq("reserva_expirada", false)
    .in("status", ESTADOS_ABIERTOS)
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }

  let itemsLiberados = 0
  const detalle: Array<{ orderId: string; numero: string | null; items: Array<{ itemId: string; productId: string; cantidad: number }> }> = []

  for (const o of pedidos || []) {
    // Ítems de catálogo que AÚN reservan; la cantidad pendiente a liberar es
    // lo no facturado todavía (quantity − cantidad_facturada).
    const { data: items } = await supabase
      .from("order_items")
      .select("id, product_id, quantity, cantidad_facturada, tipo_linea")
      .eq("order_id", o.id)
      .eq("reservado", true)

    const liberar = (items || [])
      .filter((it: any) => it.product_id && it.tipo_linea === "producto")
      .map((it: any) => ({
        id: it.id,
        product_id: it.product_id,
        pendiente: Number(it.quantity) - Number(it.cantidad_facturada || 0),
      }))
      .filter((it) => it.pendiente > 0)

    detalle.push({
      orderId: o.id,
      numero: o.order_number_serial || o.order_number || null,
      items: liberar.map((it) => ({ itemId: it.id, productId: it.product_id, cantidad: it.pendiente })),
    })

    if (dryRun) {
      itemsLiberados += liberar.length
      continue
    }

    // Liberar reserva por ítem (reservado −= pendiente, físico igual → disp +).
    for (const it of liberar) {
      const { error: rpcErr } = await supabase.rpc("ajustar_stock", {
        p_product_id: it.product_id,
        p_delta_fisico: 0,
        p_delta_reservado: -it.pendiente,
        p_tipo: "LiberaReserva",
        p_cantidad: it.pendiente,
        p_usuario_nombre: "Sistema (expiración de reserva)",
        p_observacion: "Reserva vencida — stock liberado automáticamente",
        p_referencia_tipo: "order",
        p_referencia_id: o.id,
      })
      if (rpcErr) {
        console.error("expirar-reservas: ajustar_stock falló", { orderId: o.id, itemId: it.id, error: rpcErr })
        continue
      }
      itemsLiberados++
    }

    // Limpiar el flag reservado de los ítems del pedido, marcar el pedido y
    // registrar el evento (el pedido SIGUE activo, opción a).
    await supabase.from("order_items").update({ reservado: false }).eq("order_id", o.id).eq("reservado", true)
    await supabase.from("orders").update({ reserva_expirada: true }).eq("id", o.id)
    await supabase.from("order_status_history").insert({
      order_id: o.id,
      status: o.status,
      changed_by: null,
      user_name: "Sistema (expiración de reserva)",
      notes: "Reserva vencida — stock liberado automáticamente. El pedido sigue activo.",
    })
  }

  return NextResponse.json({
    success: true,
    dry_run: dryRun,
    pedidos_procesados: (pedidos || []).length,
    items_liberados: itemsLiberados,
    detalle,
  })
}
