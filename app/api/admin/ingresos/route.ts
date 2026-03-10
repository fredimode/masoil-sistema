import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/admin/ingresos?fechaDesde=YYYY-MM-DD&fechaHasta=YYYY-MM-DD
 * Obtener ingresos (pagos de pedidos) en un rango de fechas
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const fechaDesde = searchParams.get("fechaDesde")
    const fechaHasta = searchParams.get("fechaHasta")

    if (!fechaDesde || !fechaHasta) {
      return NextResponse.json(
        { success: false, error: "fechaDesde y fechaHasta son requeridos" },
        { status: 400 }
      )
    }

    const { data: ingresos, error } = await supabase
      .from("ingresos")
      .select("id, order_id, fecha, monto, medio_pago, referencia, notas")
      .gte("fecha", fechaDesde)
      .lte("fecha", fechaHasta)
      .order("fecha", { ascending: false })

    if (error) throw error

    // Obtener order_ids para buscar info de clientes
    const orderIds = [...new Set((ingresos || []).map((i) => i.order_id).filter(Boolean))]

    let clientesMap: Record<string, string> = {}
    if (orderIds.length > 0) {
      const { data: orders } = await supabase
        .from("orders")
        .select("id, client_name")
        .in("id", orderIds)

      if (orders) {
        for (const o of orders) {
          clientesMap[o.id] = o.client_name || "N/A"
        }
      }
    }

    const ingresosConInfo = (ingresos || []).map((i) => ({
      id: i.id,
      orderId: i.order_id,
      fecha: i.fecha,
      monto: i.monto,
      medioPago: i.medio_pago,
      referencia: i.referencia,
      notas: i.notas,
      cliente: i.order_id ? (clientesMap[i.order_id] || "N/A") : "Sin pedido",
    }))

    return NextResponse.json({
      success: true,
      data: ingresosConInfo,
      count: ingresosConInfo.length,
    })
  } catch (error) {
    console.error("Error en GET /api/admin/ingresos:", error)
    return NextResponse.json(
      { success: false, error: "Error obteniendo ingresos" },
      { status: 500 }
    )
  }
}
