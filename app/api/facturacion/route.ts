import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/facturacion?mes=YYYY-MM
 * GET /api/facturacion?action=pedidos-entregados
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get("action")

    // Listar pedidos entregados para facturar
    if (action === "pedidos-entregados") {
      const { data: orders, error } = await supabase
        .from("orders")
        .select("id, client_name, client_id, total, products, status")
        .eq("status", "ENTREGADO")
        .order("updated_at", { ascending: false })

      if (error) throw error

      const pedidos = (orders || []).map((o) => ({
        id: o.id,
        client_name: o.client_name,
        client_id: o.client_id,
        total: o.total,
        products: Array.isArray(o.products)
          ? o.products.map((p: Record<string, unknown>) => ({
              productName: p.product_name || p.productName || "Producto",
              quantity: p.quantity || 1,
              price: p.price || 0,
            }))
          : [],
      }))

      return NextResponse.json({ success: true, data: pedidos })
    }

    // Listar facturas del mes
    const mes = searchParams.get("mes")
    let query = supabase
      .from("facturas")
      .select("*")
      .order("fecha", { ascending: false })

    if (mes) {
      const [anio, m] = mes.split("-").map(Number)
      const primerDia = `${anio}-${String(m).padStart(2, "0")}-01`
      const ultimoDia = new Date(anio, m, 0).getDate()
      const ultimaFecha = `${anio}-${String(m).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`
      query = query.gte("fecha", primerDia).lte("fecha", ultimaFecha)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error("Error en GET /api/facturacion:", error)
    return NextResponse.json(
      { success: false, error: "Error obteniendo datos de facturacion" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/facturacion
 * Crear registro de factura
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const {
      order_id,
      tipo,
      fecha,
      cuit_cliente,
      razon_social,
      base_gravada,
      iva_21,
      total,
      cae,
      vencimiento_cae,
      pdf_url,
    } = body

    if (!order_id || !razon_social || total === undefined) {
      return NextResponse.json(
        { success: false, error: "Faltan campos requeridos: order_id, razon_social, total" },
        { status: 400 }
      )
    }

    // TODO: Cuando se integre TusFacturas.app:
    // 1. Enviar payload a TusFacturas via N8N webhook o API directa
    // 2. Recibir numero de factura y CAE
    // 3. Guardar PDF en storage
    // Por ahora solo se guarda el registro local

    const { data, error } = await supabase
      .from("facturas")
      .insert({
        order_id,
        numero: null, // Se completa con CAE de AFIP
        tipo: tipo || "Factura B",
        fecha: fecha || new Date().toISOString().slice(0, 10),
        cuit_cliente: cuit_cliente || null,
        razon_social,
        base_gravada: parseFloat(base_gravada),
        iva_21: parseFloat(iva_21),
        total: parseFloat(total),
        cae: cae || null,
        vencimiento_cae: vencimiento_cae || null,
        pdf_url: pdf_url || null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Error en POST /api/facturacion:", error)
    return NextResponse.json(
      { success: false, error: "Error creando factura" },
      { status: 500 }
    )
  }
}
