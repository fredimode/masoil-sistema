import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { createServiceClient } from "@/lib/supabase/server"
import { uploadFacturaToStorage } from "@/lib/supabase-storage"
import { generarFacturaPDF } from "@/lib/pdf/factura-masoil"
import {
  buildPayload,
  calcularBasesYTotales,
  inferTipoFactura,
  limpiarCuit,
  mapCondicionIVA,
  TUSFACTURAS_URL,
  type Empresa,
  type ItemInput,
  type Modo,
  type TusFacturasResponse,
} from "@/lib/tusfacturas"

interface BodyInput {
  empresa: Empresa
  modo: Modo
  orderId: string
  clientId: string
  items: ItemInput[]
  observaciones?: string
}

type Paso = "parse" | "cliente" | "tusfacturas" | "pdf" | "storage" | "db" | "email"

function fail(
  paso: Paso,
  error: string,
  errores?: string[],
  extra?: Record<string, unknown>,
  status = 500
) {
  return NextResponse.json(
    {
      success: false,
      paso,
      error,
      ...(errores ? { errores } : {}),
      ...(extra || {}),
    },
    { status }
  )
}

export async function POST(request: NextRequest) {
  // ───────────────── PASO 1: parse + validar ─────────────────
  let body: BodyInput
  try {
    body = (await request.json()) as BodyInput
  } catch {
    return fail("parse", "JSON inválido", undefined, undefined, 400)
  }

  const { empresa, modo, orderId, clientId, items, observaciones } = body

  if (!empresa || !["Aquiles", "Conancap"].includes(empresa)) {
    return fail("parse", "empresa requerida (Aquiles | Conancap)", undefined, undefined, 400)
  }
  if (!modo || !["testing", "produccion"].includes(modo)) {
    return fail("parse", "modo requerido (testing | produccion)", undefined, undefined, 400)
  }
  if (!orderId) return fail("parse", "orderId requerido", undefined, undefined, 400)
  if (!clientId) return fail("parse", "clientId requerido", undefined, undefined, 400)
  if (!Array.isArray(items) || items.length === 0) {
    return fail("parse", "items requerido y no vacío", undefined, undefined, 400)
  }
  for (const [i, it] of items.entries()) {
    if (typeof it.cantidad !== "number" || it.cantidad <= 0) {
      return fail("parse", `items[${i}].cantidad inválida`, undefined, undefined, 400)
    }
    if (typeof it.precioUnitarioSinIva !== "number" || it.precioUnitarioSinIva < 0) {
      return fail("parse", `items[${i}].precioUnitarioSinIva inválido`, undefined, undefined, 400)
    }
    if (![21, 10.5, -1, -2].includes(it.alicuota)) {
      return fail("parse", `items[${i}].alicuota inválida (21 | 10.5 | -1 | -2)`, undefined, undefined, 400)
    }
    if (!it.descripcion?.trim()) {
      return fail("parse", `items[${i}].descripcion vacía`, undefined, undefined, 400)
    }
  }

  const supabase = createServiceClient()

  // ───────────────── PASO 2: cliente ─────────────────
  const { data: cliente, error: clienteError } = await supabase
    .from("clients")
    .select("id, business_name, razon_social, numero_docum, cuit, condicion_iva, domicilio, provincia, email")
    .eq("id", clientId)
    .single()

  if (clienteError || !cliente) {
    return fail("cliente", "Cliente no encontrado", undefined, undefined, 404)
  }

  const cuitCliente = limpiarCuit(cliente.cuit || cliente.numero_docum || "")
  if (!cuitCliente || cuitCliente.length < 11) {
    return fail("cliente", "Cliente sin CUIT válido", undefined, undefined, 400)
  }
  if (!cliente.provincia) {
    cliente.provincia = "CIUDAD AUTONOMA BUENOS AIRES"
  }
  const razonSocial = cliente.razon_social || cliente.business_name || ""
  console.log('Step 2: Cliente OK →', razonSocial, '| provincia:', cliente.provincia)

  // ───────────────── PASO 3: pedido ─────────────────
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id")
    .eq("id", orderId)
    .single()

  if (orderError || !order) {
    return fail("cliente", `Pedido ${orderId} no encontrado`, undefined, undefined, 404)
  }

  // ───────────────── PASO 4: tipo factura ─────────────────
  const condicionIVA = mapCondicionIVA(cliente.condicion_iva)
  const tipoFactura = inferTipoFactura(condicionIVA)

  // ───────────────── PASO 5: bases + totales ─────────────────
  const { bases, totalNeto, totalIVA, total } = calcularBasesYTotales(items)

  // ───────────────── PASO 6+7: payload ─────────────────
  let payload
  try {
    payload = buildPayload({
      empresa,
      modo,
      tipoFactura,
      cliente: {
        numero_docum: cuitCliente,
        nombre: razonSocial,
        condicion_iva: cliente.condicion_iva,
        domicilio: cliente.domicilio,
        provincia: cliente.provincia,
        email: cliente.email,
      },
      items,
      total,
      observaciones,
    })
  } catch (e) {
    return fail("parse", e instanceof Error ? e.message : "Error armando payload", undefined, undefined, 500)
  }

  const pdv = payload.comprobante.punto_venta

  // ───────────────── PASO 8: POST TusFacturas ─────────────────
  let tfData: TusFacturasResponse
  try {
    console.log('Payload TusFacturas:', JSON.stringify(payload, null, 2));
    const tfResp = await fetch(TUSFACTURAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    tfData = (await tfResp.json()) as TusFacturasResponse
    console.log('Step 8: TusFacturas response:', JSON.stringify(tfData, null, 2))
  } catch (e) {
    return fail("tusfacturas", e instanceof Error ? e.message : "Error de red con TusFacturas")
  }

  if (tfData.error !== "N") {
    const errores = tfData.errores || [tfData.error_message || "Error desconocido de TusFacturas"]
    return fail("tusfacturas", "Error de TusFacturas: " + errores.join("; "), errores, {
      tusfacturas_response: tfData,
    })
  }

  const cae = tfData.cae || null
  const vencimientoCaeRaw = tfData.vencimiento_cae // DD/MM/YYYY
  const vencimientoCae = vencimientoCaeRaw
    ? vencimientoCaeRaw.split("/").reverse().join("-")
    : null
  const comprobanteNroRaw = tfData.comprobante_nro ?? 0
  const comprobanteNro =
    typeof comprobanteNroRaw === "number"
      ? comprobanteNroRaw
      : parseInt(String(comprobanteNroRaw), 10) || 0
  const numero = `${String(pdv).padStart(4, "0")}-${String(comprobanteNro).padStart(8, "0")}`

  // ───────────────── PASO 9: PDF ─────────────────
  console.log('Step 9: Iniciando generación de PDF...')
  let pdfBytes: Uint8Array
  try {
    pdfBytes = await generarFacturaPDF({
      empresa,
      modo,
      tipoFactura,
      numero,
      puntoVenta: pdv,
      comprobanteNro,
      fecha: new Date(),
      cliente: {
        razonSocial,
        cuit: cuitCliente,
        condicionIva: cliente.condicion_iva || "Consumidor Final",
        domicilio: cliente.domicilio || "Sin domicilio",
      },
      items,
      bases,
      totalNeto,
      totalIVA,
      total,
      cae,
      vencimientoCae,
      observaciones,
    })
    console.log('Step 9: PDF generado, bytes:', pdfBytes.length)
  } catch (e) {
    return fail("pdf", e instanceof Error ? e.message : "Error generando PDF", undefined, {
      tusfacturas_response: tfData,
    })
  }

  // ───────────────── PASO 10: Storage ─────────────────
  console.log('Step 10: Subiendo a Storage...')
  let pdfUrl: string
  try {
    const fileName = `${tipoFactura.replace(/\s+/g, "-")}-${numero}.pdf`
    pdfUrl = await uploadFacturaToStorage(pdfBytes, fileName, empresa)
    console.log('Step 10: Storage OK, URL:', pdfUrl)
  } catch (e) {
    return fail("storage", e instanceof Error ? e.message : "Error subiendo PDF", undefined, {
      tusfacturas_response: tfData,
    })
  }

  // ───────────────── PASO 11: DB (facturas + orders.factura_id) ─────────────────
  console.log('Step 11: Insertando en DB...')
  const { data: factura, error: insertError } = await supabase
    .from("facturas")
    .insert({
      order_id: orderId,
      empresa,
      numero,
      tipo: tipoFactura,
      fecha: new Date().toISOString().slice(0, 10),
      cuit_cliente: cuitCliente,
      razon_social: razonSocial,
      base_gravada: totalNeto,
      iva_21: totalIVA,
      total,
      cae,
      vencimiento_cae: vencimientoCae,
      pdf_url: pdfUrl,
    })
    .select()
    .single()

  if (insertError || !factura) {
    return fail(
      "db",
      "Factura emitida en AFIP pero error guardándola: " + (insertError?.message || "unknown"),
      undefined,
      { tusfacturas_response: tfData, pdfUrl, numero, cae }
    )
  }

  console.log('Step 11: DB OK, factura.id:', factura.id)

  await supabase.from("orders").update({ factura_id: factura.id }).eq("id", orderId)

  // ───────────────── PASO 12: Email (deshabilitado temporalmente para testing) ─────────────────
  const EMAIL_ENABLED = false // cambiar a true cuando esté listo para producción real
  let emailEnviado = false
  let emailError: string | null = null
  if (EMAIL_ENABLED && modo === "produccion" && cliente.email && process.env.RESEND_API_KEY) {
    console.log('Step 12: Email →', cliente.email)
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const { error: sendError } = await resend.emails.send({
        from: "Masoil <proveedores@masoil.com.ar>",
        to: cliente.email,
        subject: `Factura ${numero}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px;">
            <h2>Factura ${numero}</h2>
            <p>Estimado/a <strong>${razonSocial}</strong>,</p>
            <p>Adjuntamos la factura <strong>${tipoFactura} ${numero}</strong> por un total de <strong>$ ${total.toFixed(2)}</strong>.</p>
            ${cae ? `<p><strong>CAE:</strong> ${cae}${vencimientoCaeRaw ? ` (vence ${vencimientoCaeRaw})` : ""}</p>` : ""}
            <p>Saludos cordiales.</p>
          </div>
        `,
        attachments: [
          {
            filename: `${numero}.pdf`,
            content: Buffer.from(pdfBytes),
          },
        ],
      })
      if (sendError) {
        emailError = sendError.message
        console.log('Step 12: Email error:', sendError.message)
      } else {
        emailEnviado = true
        console.log('Step 12: Email enviado OK')
      }
    } catch (e) {
      emailError = e instanceof Error ? e.message : "Error desconocido"
      console.error("Error enviando email factura:", e)
    }
  } else {
    console.log('Step 12: Email skipped (deshabilitado para testing)')
  }

  // ───────────────── PASO 13: Respuesta ─────────────────
  return NextResponse.json({
    success: true,
    facturaId: factura.id,
    numero,
    cae,
    total,
    pdfUrl,
    emailEnviado,
    ...(emailError ? { emailError } : {}),
  })
}
