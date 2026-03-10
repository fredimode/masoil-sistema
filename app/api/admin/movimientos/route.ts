import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/admin/movimientos?cuenta_id=X&fecha_desde=X&fecha_hasta=X
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const cuentaId = searchParams.get("cuenta_id")
    const fechaDesde = searchParams.get("fecha_desde")
    const fechaHasta = searchParams.get("fecha_hasta")

    let query = supabase
      .from("movimientos")
      .select("*")
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200)

    if (cuentaId) query = query.eq("cuenta_id", parseInt(cuentaId))
    if (fechaDesde) query = query.gte("fecha", fechaDesde)
    if (fechaHasta) query = query.lte("fecha", fechaHasta)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error("Error en GET /api/admin/movimientos:", error)
    return NextResponse.json(
      { success: false, error: "Error obteniendo movimientos" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/movimientos
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { cuenta_id, tipo, monto, concepto, referencia, fecha } = body

    if (!cuenta_id || !tipo || monto === undefined) {
      return NextResponse.json(
        { success: false, error: "Faltan campos requeridos: cuenta_id, tipo, monto" },
        { status: 400 }
      )
    }

    const montoNum = parseFloat(monto)
    if (isNaN(montoNum) || montoNum === 0) {
      return NextResponse.json(
        { success: false, error: "El monto debe ser un numero distinto de 0" },
        { status: 400 }
      )
    }

    // Crear movimiento
    const { data: movimiento, error: movError } = await supabase
      .from("movimientos")
      .insert({
        cuenta_id: parseInt(cuenta_id),
        tipo,
        monto: montoNum,
        concepto: concepto || null,
        referencia: referencia || null,
        fecha: fecha || new Date().toISOString().slice(0, 10),
      })
      .select()
      .single()

    if (movError) throw movError

    // Actualizar saldo de la cuenta
    const delta = tipo === "ingreso" ? montoNum : -montoNum

    const { data: cuenta } = await supabase
      .from("cuentas")
      .select("saldo")
      .eq("id", parseInt(cuenta_id))
      .single()

    if (cuenta) {
      const nuevoSaldo = (Number(cuenta.saldo) || 0) + delta
      await supabase
        .from("cuentas")
        .update({ saldo: nuevoSaldo })
        .eq("id", parseInt(cuenta_id))
    }

    return NextResponse.json({ success: true, data: movimiento })
  } catch (error) {
    console.error("Error en POST /api/admin/movimientos:", error)
    return NextResponse.json(
      { success: false, error: "Error creando movimiento" },
      { status: 500 }
    )
  }
}
