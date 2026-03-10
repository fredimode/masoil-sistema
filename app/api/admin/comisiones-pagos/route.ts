import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/admin/comisiones-pagos?mes=YYYY-MM
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const mes = searchParams.get("mes")

    let query = supabase
      .from("comisiones_pagos")
      .select("*")
      .order("fecha_pago", { ascending: false })

    if (mes) {
      query = query.eq("mes", mes)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error("Error en GET /api/admin/comisiones-pagos:", error)
    return NextResponse.json(
      { success: false, error: "Error obteniendo pagos de comisiones" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/comisiones-pagos
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { vendedor_id, mes, monto, notas } = body

    if (!vendedor_id || !mes || monto === undefined) {
      return NextResponse.json(
        { success: false, error: "Faltan campos requeridos: vendedor_id, mes, monto" },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("comisiones_pagos")
      .insert({
        vendedor_id,
        mes,
        monto: parseFloat(monto),
        fecha_pago: new Date().toISOString().slice(0, 10),
        notas: notas || null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Error en POST /api/admin/comisiones-pagos:", error)
    return NextResponse.json(
      { success: false, error: "Error registrando pago" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/comisiones-pagos?id=123
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ success: false, error: "Falta el ID" }, { status: 400 })
    }

    const { error } = await supabase
      .from("comisiones_pagos")
      .delete()
      .eq("id", parseInt(id))

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error en DELETE /api/admin/comisiones-pagos:", error)
    return NextResponse.json(
      { success: false, error: "Error eliminando pago" },
      { status: 500 }
    )
  }
}
