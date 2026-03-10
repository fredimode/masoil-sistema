import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/admin/cuentas
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 })
  }

  try {
    const { data, error } = await supabase
      .from("cuentas")
      .select("*")
      .order("nombre", { ascending: true })

    if (error) throw error

    return NextResponse.json({ success: true, data: data || [] })
  } catch (error) {
    console.error("Error en GET /api/admin/cuentas:", error)
    return NextResponse.json(
      { success: false, error: "Error obteniendo cuentas" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/cuentas
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { nombre, banco, tipo, saldo } = body

    if (!nombre || !tipo) {
      return NextResponse.json(
        { success: false, error: "Faltan campos requeridos: nombre, tipo" },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("cuentas")
      .insert({
        nombre,
        banco: banco || null,
        tipo,
        saldo: parseFloat(saldo) || 0,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Error en POST /api/admin/cuentas:", error)
    return NextResponse.json(
      { success: false, error: "Error creando cuenta" },
      { status: 500 }
    )
  }
}
