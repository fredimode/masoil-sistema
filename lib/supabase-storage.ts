import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createServiceClient } from "@/lib/supabase/server"

const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 // 1 año

// Mismo slug que usa uploadFacturaToStorage para armar el path, así la
// reconstrucción del path en el re-sellado coincide siempre.
function safeEmpresaSlug(empresa: string): string {
  return empresa
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export async function uploadFacturaToStorage(
  buffer: Buffer | Uint8Array,
  fileName: string,
  empresa: string
): Promise<string> {
  const supabase = createServiceClient()

  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, "0")

  const safeEmpresa = safeEmpresaSlug(empresa)

  const path = `${safeEmpresa}/${year}/${month}/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from("facturas")
    .upload(path, buffer, {
      contentType: "application/pdf",
      upsert: true,
    })

  if (uploadError) {
    throw new Error(`Error subiendo factura a Storage: ${uploadError.message}`)
  }

  const { data, error: signedError } = await supabase.storage
    .from("facturas")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (signedError || !data?.signedUrl) {
    throw new Error(
      `Error generando signedUrl: ${signedError?.message ?? "sin URL"}`
    )
  }

  return data.signedUrl
}

/**
 * S.6: estampa "Remito Nº: …" sobre el PDF de una factura ya emitida.
 *
 * La factura se genera ANTES que el remito, así que su PDF no puede incluir el
 * número de remito al momento de crearse. Cuando luego se emite el remito,
 * volvemos a abrir el PDF guardado (no se regenera: el contenido fiscal —CAE,
 * ítems, totales— queda intacto) y le dibujamos el número de remito como
 * anotación, re-subiéndolo al mismo path.
 *
 * Reconstruye el path de forma determinística desde los campos de la factura
 * (mismo esquema que uploadFacturaToStorage). Devuelve la nueva signedUrl o
 * null si algo falla (el llamador debe tratar el fallo como no crítico: el
 * remito ya está emitido).
 */
export async function estamparRemitoEnFacturaPDF(params: {
  empresa: string
  tipoFactura: string
  numeroFactura: string // "0001-00000123"
  fechaFactura: string // AAAA-MM-DD (facturas.fecha)
  remitoNumero: string // "0001-00000017"
}): Promise<string | null> {
  const supabase = createServiceClient()

  const [year, month] = params.fechaFactura.split("-")
  if (!year || !month) {
    console.error("estamparRemitoEnFacturaPDF: fecha inválida", params.fechaFactura)
    return null
  }
  const fileName = `${params.tipoFactura.replace(/\s+/g, "-")}-${params.numeroFactura}.pdf`
  const path = `${safeEmpresaSlug(params.empresa)}/${year}/${month}/${fileName}`

  const { data: file, error: downloadError } = await supabase.storage
    .from("facturas")
    .download(path)
  if (downloadError || !file) {
    console.error("estamparRemitoEnFacturaPDF: no se pudo descargar la factura", { path, error: downloadError })
    return null
  }

  let outBytes: Uint8Array
  try {
    const pdf = await PDFDocument.load(new Uint8Array(await file.arrayBuffer()))
    const font = await pdf.embedFont(StandardFonts.HelveticaBold)
    const page = pdf.getPage(0)
    const { height } = page.getSize()
    // Última línea de la columna 3 del header (debajo de "Punto Venta"), dentro
    // del recuadro del header (top = height - 30, alto 90).
    page.drawText(`Remito Nº: ${params.remitoNumero}`, {
      x: 403,
      y: height - 30 - 80,
      size: 8,
      font,
      color: rgb(0, 0, 0),
    })
    outBytes = await pdf.save()
  } catch (e) {
    console.error("estamparRemitoEnFacturaPDF: error sellando PDF", e)
    return null
  }

  const { error: uploadError } = await supabase.storage
    .from("facturas")
    .upload(path, outBytes, { contentType: "application/pdf", upsert: true })
  if (uploadError) {
    console.error("estamparRemitoEnFacturaPDF: error re-subiendo factura", uploadError)
    return null
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from("facturas")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (signedError || !signed?.signedUrl) {
    console.error("estamparRemitoEnFacturaPDF: error generando signedUrl", signedError)
    return null
  }
  return signed.signedUrl
}
