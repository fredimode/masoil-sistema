import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/admin/egresos?mes=YYYY-MM&centro=X&estado=X
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
    const centro = searchParams.get("centro")
    const estado = searchParams.get("estado")

    let query = supabase
      .from("egresos")
      .select("*")
      .order("fecha", { ascending: false })

    if (mes) {
      const [anio, m] = mes.split("-").map(Number)
      const primerDia = `${anio}-${String(m).padStart(2, "0")}-01`
      const ultimoDia = new Date(anio, m, 0).getDate()
      const ultimaFecha = `${anio}-${String(m).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`
      query = query.gte("fecha", primerDia).lte("fecha", ultimaFecha)
    }

    if (centro) {
      query = query.eq("centro_costo", centro)
    }

    if (estado) {
      query = query.eq("estado_pago", estado)
    }

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error("Error en GET /api/admin/egresos:", error)
    return NextResponse.json(
      { success: false, error: "Error obteniendo egresos" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/egresos
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { centro_costo, sub_categoria, descripcion, monto, fecha, tiene_comprobante, notas } = body

    if (!centro_costo || monto === undefined || !fecha) {
      return NextResponse.json(
        { success: false, error: "Faltan campos requeridos: centro_costo, monto, fecha" },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("egresos")
      .insert({
        centro_costo,
        sub_categoria: sub_categoria || null,
        descripcion: descripcion || null,
        monto: parseFloat(monto),
        fecha,
        tiene_comprobante: tiene_comprobante || false,
        estado_pago: "Pendiente",
        notas: notas || null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Error en POST /api/admin/egresos:", error)
    return NextResponse.json(
      { success: false, error: "Error creando egreso" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/egresos?id=123
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
      .from("egresos")
      .delete()
      .eq("id", parseInt(id))

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error en DELETE /api/admin/egresos:", error)
    return NextResponse.json(
      { success: false, error: "Error eliminando egreso" },
      { status: 500 }
    )
  }
}
