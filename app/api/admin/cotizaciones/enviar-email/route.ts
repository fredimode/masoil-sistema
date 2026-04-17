import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { createClient } from "@/lib/supabase/server"

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { cotizacionId, email } = body as { cotizacionId?: string; email?: string }

    if (!cotizacionId) {
      return NextResponse.json({ error: "cotizacionId requerido" }, { status: 400 })
    }
    if (!email) {
      return NextResponse.json({ error: "email requerido" }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: cot, error: cotError } = await supabase
      .from("cotizaciones_venta")
      .select("*")
      .eq("id", cotizacionId)
      .single()
    if (cotError || !cot) {
      return NextResponse.json({ error: "Cotización no encontrada" }, { status: 404 })
    }

    // Download PDF from storage if exists
    const attachments: { filename: string; content: Buffer }[] = []
    if (cot.pdf_url) {
      const path = cot.pdf_url.replace(/^.*\/storage\/v1\/object\/[^/]+\//, "")
      const { data: fileData } = await supabase.storage.from("cotizaciones").download(path)
      if (fileData) {
        const buffer = Buffer.from(await fileData.arrayBuffer())
        attachments.push({ filename: `${cot.numero}.pdf`, content: buffer })
      }
    }

    const fechaTxt = cot.fecha ? new Date(cot.fecha).toLocaleDateString("es-AR") : ""
    const totalTxt = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(Number(cot.total) || 0)

    const { error: emailError } = await resend.emails.send({
      from: "Masoil <proveedores@masoil.com.ar>",
      to: email,
      subject: `Cotización ${cot.numero} - ${cot.razon_social || "Masoil"}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Cotización ${cot.numero}</h2>
          <p>Estimado/a <strong>${cot.client_name || "cliente"}</strong>,</p>
          <p>Adjuntamos la cotización solicitada.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px; color: #666;">Número</td>
              <td style="padding: 8px; font-weight: bold;">${cot.numero}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px; color: #666;">Fecha</td>
              <td style="padding: 8px;">${fechaTxt}</td>
            </tr>
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 8px; color: #666;">Total</td>
              <td style="padding: 8px; font-weight: bold;">${totalTxt}</td>
            </tr>
            ${cot.validez_fecha ? `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #666;">Validez hasta</td><td style="padding: 8px;">${new Date(cot.validez_fecha).toLocaleDateString("es-AR")}</td></tr>` : ""}
            ${cot.forma_pago ? `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #666;">Forma de pago</td><td style="padding: 8px;">${cot.forma_pago}</td></tr>` : ""}
            ${cot.plazo_entrega ? `<tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px; color: #666;">Plazo de entrega</td><td style="padding: 8px;">${cot.plazo_entrega}</td></tr>` : ""}
          </table>
          ${cot.observaciones ? `<p style="color: #666;"><em>${cot.observaciones}</em></p>` : ""}
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">${cot.razon_social || "Masoil Lubricantes"}</p>
        </div>
      `,
      ...(attachments.length > 0 ? { attachments } : {}),
    })

    if (emailError) {
      console.error("Error enviando email cotización:", emailError)
      return NextResponse.json({ error: "Error al enviar email: " + emailError.message }, { status: 500 })
    }

    await supabase
      .from("cotizaciones_venta")
      .update({
        enviada: true,
        enviada_at: new Date().toISOString(),
        enviada_medio: "email",
      })
      .eq("id", cotizacionId)

    return NextResponse.json({ success: true, email })
  } catch (err: any) {
    console.error("Error en enviar-email cotización:", err)
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 })
  }
}
