import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * PUT /api/admin/egresos/[id]
 * Editar egreso o registrar pago
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = await request.json()

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

    // Campos editables
    if (body.centro_costo !== undefined) updates.centro_costo = body.centro_costo
    if (body.sub_categoria !== undefined) updates.sub_categoria = body.sub_categoria
    if (body.descripcion !== undefined) updates.descripcion = body.descripcion
    if (body.monto !== undefined) updates.monto = parseFloat(body.monto)
    if (body.fecha !== undefined) updates.fecha = body.fecha
    if (body.tiene_comprobante !== undefined) updates.tiene_comprobante = body.tiene_comprobante
    if (body.notas !== undefined) updates.notas = body.notas

    // Registrar pago
    if (body.estado_pago !== undefined) updates.estado_pago = body.estado_pago
    if (body.fecha_pago !== undefined) updates.fecha_pago = body.fecha_pago
    if (body.forma_pago !== undefined) updates.forma_pago = body.forma_pago
    if (body.destino_pago !== undefined) updates.destino_pago = body.destino_pago
    if (body.cuenta_id !== undefined) updates.cuenta_id = body.cuenta_id

    const { data, error } = await supabase
      .from("egresos")
      .update(updates)
      .eq("id", parseInt(id))
      .select()
      .single()

    if (error) throw error

    if (!data) {
      return NextResponse.json({ success: false, error: "Egreso no encontrado" }, { status: 404 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Error en PUT /api/admin/egresos/[id]:", error)
    return NextResponse.json(
      { success: false, error: "Error actualizando egreso" },
      { status: 500 }
    )
  }
}
