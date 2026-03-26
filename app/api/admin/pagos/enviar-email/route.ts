import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { createClient } from "@/lib/supabase/server"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { pagoId } = body

    if (!pagoId) {
      return NextResponse.json({ error: "pagoId requerido" }, { status: 400 })
    }

    const supabase = await createClient()

    // Fetch pago data
    const { data: pago, error: pagoError } = await supabase
      .from("pagos_proveedores")
      .select("*")
      .eq("id", pagoId)
      .single()

    if (pagoError || !pago) {
      return NextResponse.json({ error: "Pago no encontrado" }, { status: 404 })
    }

    // Find proveedor email
    let emailDestino = ""
    if (pago.proveedor_id) {
      const { data: prov } = await supabase
        .from("proveedores")
        .select("contactos, observaciones")
        .eq("id", pago.proveedor_id)
        .single()

      if (prov) {
        const text = `${prov.contactos || ""} ${prov.observaciones || ""}`
        const match = text.match(/[\w.-]+@[\w.-]+\.\w+/)
        if (match) emailDestino = match[0]
      }
    }

    // Use provided email or fallback
    emailDestino = body.email || emailDestino

    if (!emailDestino) {
      return NextResponse.json({ error: "No se encontró email del proveedor" }, { status: 400 })
    }

    const fecha = pago.fecha_fc ? new Date(pago.fecha_fc).toLocaleDateString("es-AR") : new Date().toLocaleDateString("es-AR")
    const importe = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(pago.importe) || 0)

    // Build email attachments if comprobante exists
    const attachments: { filename: string; content: Buffer }[] = []
    if (pago.comprobante_url) {
      try {
        const path = pago.comprobante_url.replace(/^.*\/storage\/v1\/object\/[^/]+\//, "")
        const { data: fileData } = await supabase.storage.from("comprobantes").download(path)
        if (fileData) {
          const buffer = Buffer.from(await fileData.arrayBuffer())
          const filename = path.split("/").pop() || "comprobante"
          attachments.push({ filename, content: buffer })
        }
      } catch {
        // Continue without attachment
      }
    }

    const { error: emailError } = await resend.emails.send({
      from: "Masoil <proveedores@masoil.com.ar>",
      to: emailDestino,
      subject: `Comprobante de pago - ${pago.proveedor_nombre || "Proveedor"} - ${fecha}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Comprobante de Pago</h2>
          <p>Estimado/a <strong>${pago.proveedor_nombre || "Proveedor"}</strong>,</p>
          <p>Le informamos que se ha registrado el siguiente pago:</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px; color: #666;">Importe</td>
              <td style="padding: 8px; font-weight: bold;">${importe}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px; color: #666;">Fecha Factura</td>
              <td style="padding: 8px;">${fecha}</td>
            </tr>
            ${pago.numero_fc ? `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #666;">Nro Factura</td><td style="padding: 8px;">${pago.numero_fc}</td></tr>` : ""}
            ${pago.forma_pago ? `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #666;">Forma de pago</td><td style="padding: 8px;">${pago.forma_pago}</td></tr>` : ""}
            ${pago.empresa ? `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #666;">Empresa</td><td style="padding: 8px;">${pago.empresa}</td></tr>` : ""}
            ${pago.nro_cheque ? `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #666;">Nro Cheque</td><td style="padding: 8px;">${pago.nro_cheque}</td></tr>` : ""}
            ${pago.banco ? `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #666;">Banco</td><td style="padding: 8px;">${pago.banco}</td></tr>` : ""}
          </table>
          ${pago.observaciones ? `<p style="color: #666;"><em>Obs: ${pago.observaciones}</em></p>` : ""}
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">Masoil Lubricantes</p>
        </div>
      `,
      ...(attachments.length > 0 ? { attachments } : {}),
    })

    if (emailError) {
      console.error("Error enviando email:", emailError)
      return NextResponse.json({ error: "Error al enviar email: " + emailError.message }, { status: 500 })
    }

    // Update pago with email sent status
    await supabase
      .from("pagos_proveedores")
      .update({ email_enviado: true, email_enviado_at: new Date().toISOString() })
      .eq("id", pagoId)

    return NextResponse.json({ success: true, email: emailDestino })
  } catch (err: any) {
    console.error("Error en enviar-email:", err)
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 })
  }
}
