import { NextRequest, NextResponse } from "next/server"
import { Resend } from "resend"
import { createServiceClient } from "@/lib/supabase/server"
import { uploadFacturaToStorage } from "@/lib/supabase-storage"
import { generarFacturaPDF } from "@/lib/pdf/factura-masoil"
import {
  buildPayload,
  calcularBasesYTotales,
  esNotaCredito,
  esNotaDebito,
  inferTipoFactura,
  limpiarCuit,
  mapCondicionIVA,
  TUSFACTURAS_URL,
  type ComprobanteAsociado,
  type Empresa,
  type ItemInput,
  type Modo,
  type TipoFactura,
  type TusFacturasResponse,
} from "@/lib/tusfacturas"

const TIPOS_VALIDOS: TipoFactura[] = [
  "FACTURA A",
  "FACTURA B",
  "NOTA DE CREDITO A",
  "NOTA DE CREDITO B",
  "NOTA DE DEBITO A",
  "NOTA DE DEBITO B",
]

interface BodyInput {
  empresa: Empresa
  modo: Modo
  orderId?: string
  clientId: string
  items: ItemInput[]
  observaciones?: string
  tipoComprobante?: TipoFactura
  comprobanteAsociado?: ComprobanteAsociado
  // IDs de fila order_items que se están facturando en esta emisión (parciales).
  // Si vienen, el endpoint marca esos order_items como facturados y los asocia
  // a esta factura. Sin esto, una segunda parcial sobre el mismo pedido
  // mostraría los mismos items en el detalle.
  // S.2: se usa el id de la fila (no product_id, que es null en líneas
  // libre/descuento y marcaba todas las líneas sin catálogo a la vez).
  orderItemIds?: string[]
  // Cantidad facturada por item, paralela a orderItemIds (mismo orden).
  // Si no se pasa, se asume "cantidad pedida" (caso facturación total).
  cantidadesFacturadas?: number[]
}

type Paso = "parse" | "cliente" | "tusfacturas" | "pdf" | "storage" | "db" | "cta_cte" | "email"

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

  const { empresa, modo, orderId, clientId, items, observaciones, tipoComprobante, comprobanteAsociado, orderItemIds, cantidadesFacturadas } = body

  console.log('Body recibido:', {
    empresa,
    modo,
    orderId: orderId || null,
    clientId,
    tipoComprobante: tipoComprobante || '(no enviado → se infiere FC desde condicion_iva)',
    comprobanteAsociado: comprobanteAsociado || null,
    itemsCount: Array.isArray(items) ? items.length : 0,
  })

  if (!empresa || !["Aquiles", "Conancap"].includes(empresa)) {
    return fail("parse", "empresa requerida (Aquiles | Conancap)", undefined, undefined, 400)
  }
  if (!modo || !["testing", "produccion"].includes(modo)) {
    return fail("parse", "modo requerido (testing | produccion)", undefined, undefined, 400)
  }
  if (!clientId) return fail("parse", "clientId requerido", undefined, undefined, 400)
  if (!Array.isArray(items) || items.length === 0) {
    return fail("parse", "items requerido y no vacío", undefined, undefined, 400)
  }
  if (tipoComprobante && !TIPOS_VALIDOS.includes(tipoComprobante)) {
    return fail("parse", `tipoComprobante inválido. Valores: ${TIPOS_VALIDOS.join(", ")}`, undefined, undefined, 400)
  }
  for (const [i, it] of items.entries()) {
    if (typeof it.cantidad !== "number" || it.cantidad <= 0) {
      return fail("parse", `items[${i}].cantidad inválida`, undefined, undefined, 400)
    }
    if (typeof it.precioUnitarioSinIva !== "number" || !Number.isFinite(it.precioUnitarioSinIva)) {
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
    .select("id, business_name, razon_social, numero_docum, cuit, condicion_iva, condicion_pago, payment_terms, domicilio, provincia, email")
    .eq("id", clientId)
    .single()

  if (clienteError || !cliente) {
    return fail("cliente", "Cliente no encontrado", undefined, undefined, 404)
  }

  console.log("Cliente encontrado:", cliente.id, "| provincia DB:", JSON.stringify(cliente.provincia))

  const cuitCliente = limpiarCuit(cliente.cuit || cliente.numero_docum || "")
  if (!cuitCliente || cuitCliente.length < 11) {
    return fail("cliente", "Cliente sin CUIT válido", undefined, undefined, 400)
  }
  if (!cliente.provincia || !cliente.provincia.trim()) {
    cliente.provincia = "CIUDAD AUTONOMA BUENOS AIRES"
    console.log("Cliente sin provincia → fallback CABA")
  }
  const razonSocial = cliente.razon_social || cliente.business_name || ""
  console.log('Step 2: Cliente OK →', razonSocial, '| provincia final:', cliente.provincia)

  // ───────────────── PASO 3: pedido (opcional) ─────────────────
  // cotizacionId/cotizacionNumero se rellenan si esta factura proviene de
  // una cotización (vía pedido). Se persisten en facturas.cotizacion_id y
  // se muestran en Observaciones del PDF (item Excel #89).
  let cotizacionId: string | null = null
  let cotizacionNumero: string | null = null
  let pedidoNumero: string | null = null
  let pedidoVendedorId: string | null = null
  // R.13: sector y receptor cargados en el pedido deben impactar en la FC.
  let pedidoSector: string | null = null
  let pedidoRecibe: string | null = null
  if (orderId) {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, order_number_serial, order_number, vendedor_id, sector, recibe")
      .eq("id", orderId)
      .single()

    if (orderError || !order) {
      return fail("cliente", `Pedido ${orderId} no encontrado`, undefined, undefined, 404)
    }
    pedidoNumero = order.order_number_serial || order.order_number || null
    pedidoVendedorId = order.vendedor_id || null
    pedidoSector = order.sector || null
    pedidoRecibe = order.recibe || null

    // Lookup automático: si hay cotización con order_id = orderId, asociarla.
    // cotizaciones_venta.order_id es TEXT; orderId puede ser UUID — comparamos
    // como strings.
    const { data: cot } = await supabase
      .from("cotizaciones_venta")
      .select("id, numero")
      .eq("order_id", String(orderId))
      .maybeSingle()
    if (cot) {
      cotizacionId = cot.id as string
      cotizacionNumero = cot.numero as string
      console.log("Step 3: Cotización asociada al pedido →", cotizacionNumero)
    }
  } else {
    console.log('Step 3: Sin orderId — facturación manual')
  }

  // ───────────────── PASO 4: tipo factura ─────────────────
  const condicionIVA = mapCondicionIVA(cliente.condicion_iva)
  const tipoFactura: TipoFactura = tipoComprobante || inferTipoFactura(condicionIVA)
  const esNC = esNotaCredito(tipoFactura)
  const esND = esNotaDebito(tipoFactura)

  if ((esNC || esND) && !comprobanteAsociado) {
    return fail(
      "parse",
      `${tipoFactura} requiere comprobanteAsociado { tipo, puntoVenta, numero }`,
      undefined,
      undefined,
      400
    )
  }
  if (comprobanteAsociado) {
    if (!comprobanteAsociado.tipo || comprobanteAsociado.puntoVenta == null || comprobanteAsociado.numero == null) {
      return fail("parse", "comprobanteAsociado debe incluir tipo, puntoVenta y numero", undefined, undefined, 400)
    }
  }
  console.log(`Step 4: tipoFactura → ${tipoFactura}`)

  // R.13: combinar observaciones del modal con Sector/Receptor del pedido para
  // que impacten en la FC (AFIP no tiene campos nativos de sector/receptor, van
  // como leyenda/observaciones del comprobante y del PDF).
  const datosEntrega = [
    pedidoSector ? `Sector: ${pedidoSector}` : null,
    pedidoRecibe ? `Recibe: ${pedidoRecibe}` : null,
  ].filter(Boolean).join(" | ")
  const observacionesFinal = [observaciones, datosEntrega || null].filter(Boolean).join(" | ") || undefined

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
      observaciones: observacionesFinal,
      comprobanteAsociado,
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
  // TusFacturas devuelve comprobante_nro en formato "PPPPP-NNNNNNNN" (ej: "00009-00000004").
  // Guardamos ese string verbatim y derivamos comprobanteNro como entero para el PDF.
  // Fallback: si por algún motivo viene solo el entero, lo formateamos con el pdv local.
  const tfNumeroRaw = String(tfData.comprobante_nro ?? "").trim()
  let numero: string
  let comprobanteNro: number
  if (tfNumeroRaw.includes("-")) {
    numero = tfNumeroRaw
    comprobanteNro = parseInt(tfNumeroRaw.split("-")[1] || "0", 10) || 0
  } else {
    comprobanteNro = parseInt(tfNumeroRaw, 10) || 0
    numero = `${String(pdv).padStart(4, "0")}-${String(comprobanteNro).padStart(8, "0")}`
  }

  // ───────────────── PASO 9: PDF ─────────────────
  console.log('Step 9: Iniciando generación de PDF...')
  let pdfBytes: Uint8Array
  try {
    // Si la factura proviene de una cotización, agregamos esa info al final
    // de observaciones para que aparezca en el PDF (item Excel #89).
    const observacionesPDF = [
      observacionesFinal,
      cotizacionNumero ? `Cotización N° ${cotizacionNumero}` : null,
    ].filter(Boolean).join(" | ") || undefined

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
        condicionPago: cliente.condicion_pago || cliente.payment_terms || null,
      },
      items,
      bases,
      totalNeto,
      totalIVA,
      total,
      cae,
      vencimientoCae,
      observaciones: observacionesPDF,
      pedidoNumero,
      comprobanteAsociado: comprobanteAsociado
        ? {
            tipo: String(comprobanteAsociado.tipo),
            puntoVenta: comprobanteAsociado.puntoVenta,
            numero: comprobanteAsociado.numero,
          }
        : undefined,
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
  // factura_referencia_id: si esta es una NC/ND emitida sobre una factura local,
  // guardamos el ID de la original para poder listar asociadas desde el detalle.
  const facturaReferenciaId = comprobanteAsociado?.facturaOriginalId
    ? parseInt(String(comprobanteAsociado.facturaOriginalId), 10) || null
    : null
  const { data: factura, error: insertError } = await supabase
    .from("facturas")
    .insert({
      order_id: orderId || null,
      client_id: clientId,
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
      factura_referencia_id: facturaReferenciaId,
      cotizacion_id: cotizacionId,
      // G2.2: hereda vendedor del pedido para que aparezca en el historial
      // del vendedor. Para facturas manuales sin pedido queda null.
      vendedor_id: pedidoVendedorId,
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

  if (orderId) {
    await supabase.from("orders").update({ factura_id: factura.id }).eq("id", orderId)

    // Marcar items como facturados acá (no en el frontend) garantiza que el
    // tracking de parciales no se pierda si el cliente cierra el browser entre
    // AFIP-OK y el UPDATE. Si orderItemIds no vino, no hacemos nada —
    // facturas legacy o emisiones manuales no requieren tracking per-item.
    if (orderItemIds && orderItemIds.length > 0) {
      for (let i = 0; i < orderItemIds.length; i++) {
        const orderItemId = orderItemIds[i]
        if (!orderItemId) continue
        const cantidad = cantidadesFacturadas?.[i]
        const updateFields: Record<string, unknown> = {
          facturado: true,
          factura_id: factura.id,
        }
        if (typeof cantidad === "number" && cantidad > 0) {
          updateFields.cantidad_facturada = cantidad
        }
        // S.2: marcamos por id de fila (único). Antes era por product_id, que
        // es null en líneas libre/descuento → el .eq fallaba silenciosamente y
        // esas líneas reaparecían como pendientes en la próxima parcial.
        const { error: oiErr } = await supabase
          .from("order_items")
          .update(updateFields)
          .eq("order_id", orderId)
          .eq("id", orderItemId)
        if (oiErr) {
          console.error("Step 11c: ERROR marcando order_item facturado:", {
            facturaId: factura.id,
            orderId,
            orderItemId,
            error: oiErr,
          })
        }
      }
    }
  }

  // ───────────────── PASO 11b: Cta cte cliente ─────────────────
  // FC y ND → debe (suma deuda); NC → haber (resta deuda).
  // La factura YA tiene CAE en AFIP. Si este insert falla, devolvemos
  // success:false con facturaId/numero/cae/pdfUrl para que el frontend
  // muestre el error claramente y NO reintente la emisión (eso duplicaría
  // facturas en AFIP). El operador debe insertar el movimiento manualmente
  // o reconciliar con scripts/reconciliar_facturas_cta_cte.sql.
  {
    const [pvCC, nroCC] = String(numero).split("-")
    const tipoCC = esNC ? "NC" : esND ? "ND" : "FC"
    const debe = esNC ? 0 : total
    const haber = esNC ? total : 0
    const { error: ccErr } = await supabase.from("cuenta_corriente_cliente").insert({
      client_id: clientId,
      fecha: new Date().toISOString().slice(0, 10),
      tipo_comprobante: tipoCC,
      punto_venta: pvCC || "",
      numero_comprobante: nroCC || numero,
      debe,
      haber,
      saldo: debe - haber,
      referencia_id: String(factura.id),
      empresa,
      observaciones: `${tipoFactura} generada desde el sistema`,
    })
    if (ccErr) {
      console.error('Step 11b: ERROR cta cte (factura YA emitida en AFIP):', {
        facturaId: factura.id,
        numero,
        clientId,
        cae,
        error: ccErr,
      })
      return fail(
        "cta_cte",
        "Factura emitida en AFIP pero no se pudo registrar en cuenta corriente: " + (ccErr.message || "unknown"),
        undefined,
        { facturaId: factura.id, numero, cae, pdfUrl, facturaEmitida: true }
      )
    }
    console.log('Step 11b: Cta cte OK →', tipoCC, debe || -haber)
  }

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
