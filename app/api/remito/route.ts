import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { estamparRemitoEnFacturaPDF } from "@/lib/supabase-storage"
import { generarRemitoPDF } from "@/lib/pdf/remito-masoil"
import { getCaiConfig, shouldBlockOnExpired } from "@/lib/cai-status"
import type { Empresa } from "@/lib/tusfacturas"

interface BodyInput {
  empresa: Empresa
  orderId: string
  observaciones?: string
}

type Paso = "parse" | "cliente" | "numero" | "pdf" | "storage" | "db"

function fail(paso: Paso, error: string, extra?: Record<string, unknown>, status = 500) {
  return NextResponse.json(
    { success: false, paso, error, ...(extra || {}) },
    { status }
  )
}

function parseDateAR(s: string): Date | null {
  // dd/mm/yyyy → Date
  const [d, m, y] = s.split("/").map((x) => parseInt(x, 10))
  if (!d || !m || !y) return null
  return new Date(y, m - 1, d)
}

export async function POST(request: NextRequest) {
  // ───────── PASO 1: parse + validar ─────────
  let body: BodyInput
  try {
    body = (await request.json()) as BodyInput
  } catch {
    return fail("parse", "JSON inválido", undefined, 400)
  }

  const { empresa, orderId, observaciones } = body
  if (!empresa || !["Aquiles", "Conancap"].includes(empresa)) {
    return fail("parse", "empresa requerida (Aquiles | Conancap)", undefined, 400)
  }
  if (!orderId) return fail("parse", "orderId requerido", undefined, 400)

  const cai = getCaiConfig(empresa)
  const supabase = createServiceClient()

  // ───────── PASO 2: pedido + cliente + items ─────────
  const { data: order, error: orderError } = await supabase
    .from("orders")
    // R.13: Sector/Solicita/Recibe del pedido para imprimirlos en el remito.
    .select("id, client_id, client_name, status, factura_id, sector, solicita, recibe")
    .eq("id", orderId)
    .single()

  if (orderError || !order) {
    return fail("cliente", `Pedido ${orderId} no encontrado`, undefined, 404)
  }

  // S.6: factura asociada al pedido (para cruzar números en ambos comprobantes).
  type FacturaRef = { id: number | string; numero: string; tipo: string; empresa: string; fecha: string }
  let factura: FacturaRef | null = null
  if (order.factura_id) {
    const { data: f } = await supabase
      .from("facturas")
      .select("id, numero, tipo, empresa, fecha")
      .eq("id", order.factura_id)
      .maybeSingle()
    if (f) factura = f as unknown as FacturaRef
  }

  let cliente: { razonSocial: string; cuit: string; domicilio: string } = {
    razonSocial: order.client_name || "",
    cuit: "",
    domicilio: "",
  }
  if (order.client_id) {
    const { data: c } = await supabase
      .from("clients")
      .select("business_name, razon_social, cuit, numero_docum, address, domicilio")
      .eq("id", order.client_id)
      .single()
    if (c) {
      cliente = {
        razonSocial: c.razon_social || c.business_name || order.client_name || "",
        cuit: c.cuit || c.numero_docum || "",
        domicilio: c.domicilio || c.address || "",
      }
    }
  }

  // Items del remito: SOLO los facturados en esta factura específica, no todo
  // el pedido.
  // S.5: en una facturación parcial, los artículos excluidos de la emisión no
  // deben aparecer en el remito de esa factura. Filtramos por factura_id
  // (= order.factura_id, la última factura del pedido). Fallback legacy: si
  // ningún item tiene factura_id (facturas previas al tracking per-item) se
  // incluye todo el pedido. Las líneas de descuento se omiten: el remito
  // documenta entrega física, no ajustes de precio.
  const { data: orderItems } = await supabase
    .from("order_items")
    .select("quantity, cantidad_facturada, factura_id, tipo_linea, producto_nombre, producto_codigo, products(name, code)")
    .eq("order_id", orderId)

  type OrderItemRow = {
    quantity: number
    cantidad_facturada: number | null
    factura_id: number | string | null
    tipo_linea: string | null
    producto_nombre: string | null
    producto_codigo: string | null
    products: { name?: string | null; code?: string | null } | null
  }
  const allRows = (orderItems || []) as unknown as OrderItemRow[]
  const facturaId = order.factura_id != null ? String(order.factura_id) : null
  const rowsDeFactura = facturaId
    ? allRows.filter((oi) => oi.factura_id != null && String(oi.factura_id) === facturaId)
    : []
  const baseRows = rowsDeFactura.length > 0 ? rowsDeFactura : allRows
  const items = baseRows
    .filter((oi) => oi.tipo_linea !== "descuento")
    .map((oi) => {
      const code = oi.products?.code || oi.producto_codigo || ""
      const name = oi.products?.name || oi.producto_nombre || "Producto"
      // Cantidad efectivamente facturada en esta emisión (parcial); si no hay
      // tracking per-item, cae a la cantidad pedida.
      const cant = oi.cantidad_facturada && oi.cantidad_facturada > 0 ? oi.cantidad_facturada : oi.quantity
      return {
        descripcion: `${code} - ${name}`.replace(/^ - /, ""),
        cantidad: cant,
      }
    })

  if (items.length === 0) {
    return fail("cliente", "El pedido no tiene items para remitir", undefined, 400)
  }

  // ───────── PASO 3: número siguiente ─────────
  const { data: lastRemito } = await supabase
    .from("remitos")
    .select("numero_remito")
    .eq("empresa", empresa)
    .order("numero_remito", { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastNumero = lastRemito?.numero_remito ?? null
  const nextNumero = lastNumero !== null && lastNumero >= cai.rangoDesde
    ? lastNumero + 1
    : cai.rangoDesde

  if (nextNumero > cai.rangoHasta) {
    return fail("numero", `Talonario agotado. Rango ${cai.rangoDesde}-${cai.rangoHasta} consumido. Solicitar nuevo CAI a AFIP.`, {
      ultimo_numero: lastNumero,
      rango: { desde: cai.rangoDesde, hasta: cai.rangoHasta },
    })
  }

  const numeroFormateado = `${cai.puntoVenta}-${String(nextNumero).padStart(8, "0")}`
  const fecha = new Date()
  const vencimientoDate = parseDateAR(cai.vencimiento)
  const caiVencido = vencimientoDate ? vencimientoDate < fecha : false

  console.log(`Step 3: Próximo remito ${empresa} → ${numeroFormateado} (CAI ${caiVencido ? "VENCIDO" : "vigente"})`)

  // Bloqueo duro si CAI_BLOCK_ON_EXPIRED=true y el CAI está vencido.
  // Default (false): permite emitir con warning visible en el PDF + UI.
  if (caiVencido && shouldBlockOnExpired()) {
    return fail(
      "numero",
      `CAI de ${empresa} vencido el ${cai.vencimiento}. Renovar en AFIP antes de emitir.`,
      { cai_vencimiento: cai.vencimiento, empresa, blocked: true },
      400,
    )
  }

  // ───────── PASO 4: PDF ─────────
  let pdfBytes: Uint8Array
  try {
    pdfBytes = await generarRemitoPDF({
      empresa,
      numero: numeroFormateado,
      puntoVenta: cai.puntoVenta,
      numeroRemito: nextNumero,
      fecha,
      cliente,
      items,
      observaciones,
      sector: order.sector || null,
      solicita: order.solicita || null,
      recibe: order.recibe || null,
      caiVencido,
      facturaNumero: factura?.numero || null,
    })
    console.log("Step 4: PDF generado, bytes:", pdfBytes.length)
  } catch (e) {
    return fail("pdf", e instanceof Error ? e.message : "Error generando PDF")
  }

  // ───────── PASO 5: Storage ─────────
  const year = fecha.getFullYear()
  const month = String(fecha.getMonth() + 1).padStart(2, "0")
  const safeEmpresa = empresa.toLowerCase()
  const fileName = `REMITO-${numeroFormateado}.pdf`
  const storagePath = `${safeEmpresa}/${year}/${month}/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from("remitos")
    .upload(storagePath, pdfBytes, {
      contentType: "application/pdf",
      upsert: true,
    })
  if (uploadError) {
    return fail("storage", `Error subiendo PDF: ${uploadError.message}`)
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from("remitos")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365) // 1 año

  if (signedError || !signedData?.signedUrl) {
    return fail("storage", `Error generando signedUrl: ${signedError?.message || "sin URL"}`)
  }
  const pdfUrl = signedData.signedUrl
  console.log("Step 5: Storage OK")

  // ───────── PASO 6: DB ─────────
  const { data: remito, error: insertError } = await supabase
    .from("remitos")
    .insert({
      numero: numeroFormateado,
      empresa,
      punto_venta: cai.puntoVenta,
      numero_remito: nextNumero,
      cai: cai.cai,
      cai_vencimiento: vencimientoDate ? vencimientoDate.toISOString().slice(0, 10) : null,
      fecha_emision: fecha.toISOString().slice(0, 10),
      order_id: orderId,
      factura_id: order.factura_id || null,
      client_id: order.client_id,
      cliente_nombre: cliente.razonSocial,
      cliente_cuit: cliente.cuit,
      cliente_domicilio: cliente.domicilio,
      pdf_url: pdfUrl,
      storage_path: storagePath,
    })
    .select()
    .single()

  if (insertError || !remito) {
    return fail("db", `Remito generado pero error guardándolo: ${insertError?.message || "unknown"}`, {
      pdfUrl,
      numero: numeroFormateado,
    })
  }

  // ───────── PASO 7: sellar la factura con el N° de remito (S.6) ─────────
  // La factura ya estaba emitida (PDF sin remito). Le estampamos el N° de
  // remito recién creado. Solo si es el PRIMER remito de la factura, para no
  // sobre-escribir el sello con números distintos. No es crítico: si falla, el
  // remito ya quedó emitido igual.
  if (factura) {
    try {
      const { count } = await supabase
        .from("remitos")
        .select("id", { count: "exact", head: true })
        .eq("factura_id", factura.id)
      if ((count ?? 1) <= 1) {
        const nuevaUrl = await estamparRemitoEnFacturaPDF({
          empresa: factura.empresa,
          tipoFactura: factura.tipo,
          numeroFactura: factura.numero,
          fechaFactura: factura.fecha,
          remitoNumero: numeroFormateado,
        })
        if (nuevaUrl) {
          await supabase.from("facturas").update({ pdf_url: nuevaUrl }).eq("id", factura.id)
          console.log("Step 7: Factura sellada con N° de remito →", numeroFormateado)
        }
      }
    } catch (e) {
      console.error("Step 7: error sellando factura con remito (no crítico):", e)
    }
  }

  return NextResponse.json({
    success: true,
    remitoId: remito.id,
    numero: numeroFormateado,
    cai: cai.cai,
    pdfUrl,
    caiVencido,
    caiVencimiento: cai.vencimiento,
  })
}
