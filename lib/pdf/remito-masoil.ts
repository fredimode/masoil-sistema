import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib"
import bwipjs from "bwip-js/node"
import { EMPRESAS_DATA } from "@/lib/pdf/factura-masoil"
import type { Empresa } from "@/lib/tusfacturas"

export interface CaiInfo {
  cai: string
  rangoDesde: number
  rangoHasta: number
  puntoVenta: string
  vencimiento: string                  // dd/mm/yyyy
}

export const CAI_DATA: Record<Empresa, CaiInfo> = {
  Aquiles: {
    cai: "52031216755243",
    rangoDesde: 1,
    rangoHasta: 9900,
    puntoVenta: "0001",
    vencimiento: "19/01/2027",
  },
  Conancap: {
    cai: "52084217247394",
    rangoDesde: 1301,
    rangoHasta: 1400,
    puntoVenta: "0003",
    vencimiento: "22/03/2026",
  },
}

export interface RemitoPDFData {
  empresa: Empresa
  numero: string                       // "0001-00000123"
  puntoVenta: string
  numeroRemito: number
  fecha: Date
  cliente: {
    razonSocial: string
    cuit: string
    domicilio: string
  }
  items: Array<{
    descripcion: string
    cantidad: number
  }>
  observaciones?: string
  caiVencido?: boolean
}

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 30

async function generarBarcodeCAI(cai: string): Promise<Uint8Array> {
  // Interleaved 2 of 5 (ITF) — formato AFIP. CAI son 14 dígitos (par requerido).
  const png = await bwipjs.toBuffer({
    bcid: "interleaved2of5",
    text: cai,
    scale: 2,
    height: 10,
    includetext: false,
    backgroundcolor: "FFFFFF",
  })
  return new Uint8Array(png)
}

function dateAR(d: Date): string {
  return d.toLocaleDateString("es-AR")
}

export async function generarRemitoPDF(data: RemitoPDFData): Promise<Uint8Array> {
  const empresaData = EMPRESAS_DATA[data.empresa]
  const cai = CAI_DATA[data.empresa]

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([PAGE_W, PAGE_H])
  const fontReg = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const black = rgb(0, 0, 0)
  const gray = rgb(0.45, 0.45, 0.45)
  const lightGray = rgb(0.82, 0.82, 0.82)
  const veryLight = rgb(0.95, 0.95, 0.95)
  const watermarkGray = rgb(0.88, 0.88, 0.88)
  const red = rgb(0.7, 0, 0)

  const LEFT = MARGIN
  const RIGHT = PAGE_W - MARGIN
  const W = RIGHT - LEFT

  // ════════════════ HEADER 3 columnas ════════════════
  const HEADER_H = 90
  const HEADER_TOP = PAGE_H - MARGIN
  const HEADER_BOTTOM = HEADER_TOP - HEADER_H
  const COL2_X = LEFT + 290
  const COL3_X = COL2_X + 75

  page.drawRectangle({
    x: LEFT, y: HEADER_BOTTOM,
    width: W, height: HEADER_H,
    borderColor: black, borderWidth: 1,
  })
  page.drawLine({
    start: { x: COL2_X, y: HEADER_BOTTOM },
    end: { x: COL2_X, y: HEADER_TOP },
    thickness: 1, color: black,
  })
  page.drawLine({
    start: { x: COL3_X, y: HEADER_BOTTOM },
    end: { x: COL3_X, y: HEADER_TOP },
    thickness: 1, color: black,
  })

  // Col 1: Empresa
  page.drawText(empresaData.razonSocial, {
    x: LEFT + 8, y: HEADER_TOP - 18,
    size: 13, font: fontBold, color: black,
  })
  page.drawText(empresaData.condicionIva, {
    x: LEFT + 8, y: HEADER_TOP - 34,
    size: 8, font: fontBold, color: black,
  })
  page.drawText(empresaData.direccion, {
    x: LEFT + 8, y: HEADER_TOP - 48,
    size: 7.5, font: fontReg, color: gray,
  })
  page.drawText(empresaData.localidad, {
    x: LEFT + 8, y: HEADER_TOP - 60,
    size: 7.5, font: fontReg, color: gray,
  })
  page.drawText(`CUIT: ${empresaData.cuit}`, {
    x: LEFT + 8, y: HEADER_TOP - 78,
    size: 8, font: fontBold, color: black,
  })

  // Col 2: letra X (no es comprobante AFIP)
  const col2Center = (COL2_X + COL3_X) / 2
  const xWidth = fontBold.widthOfTextAtSize("X", 42)
  page.drawText("X", {
    x: col2Center - xWidth / 2,
    y: HEADER_TOP - 50,
    size: 42, font: fontBold, color: black,
  })
  const docLabel = "DOC. NO VÁLIDO"
  const docW = fontReg.widthOfTextAtSize(docLabel, 6.5)
  page.drawText(docLabel, {
    x: col2Center - docW / 2,
    y: HEADER_TOP - 70,
    size: 6.5, font: fontReg, color: black,
  })
  const docLabel2 = "COMO FACTURA"
  const doc2W = fontReg.widthOfTextAtSize(docLabel2, 6.5)
  page.drawText(docLabel2, {
    x: col2Center - doc2W / 2,
    y: HEADER_TOP - 80,
    size: 6.5, font: fontReg, color: black,
  })

  // Col 3: tipo + número + fecha + pdv
  page.drawText("REMITO", {
    x: COL3_X + 8, y: HEADER_TOP - 18,
    size: 13, font: fontBold, color: black,
  })
  page.drawText(`Nº: ${data.numero}`, {
    x: COL3_X + 8, y: HEADER_TOP - 36,
    size: 10, font: fontBold, color: black,
  })
  page.drawText(`Fecha: ${dateAR(data.fecha)}`, {
    x: COL3_X + 8, y: HEADER_TOP - 52,
    size: 9, font: fontReg, color: black,
  })
  page.drawText(`Punto Venta: ${data.puntoVenta}`, {
    x: COL3_X + 8, y: HEADER_TOP - 66,
    size: 9, font: fontReg, color: black,
  })

  let y = HEADER_BOTTOM - 16

  // ════════════════ CLIENTE ════════════════
  const CLIENTE_H = 60
  page.drawRectangle({
    x: LEFT, y: y - CLIENTE_H,
    width: W, height: CLIENTE_H,
    borderColor: black, borderWidth: 0.8,
  })
  page.drawText("CLIENTE", {
    x: LEFT + 8, y: y - 14,
    size: 9, font: fontBold, color: black,
  })
  page.drawText(`Razón social: ${data.cliente.razonSocial}`, {
    x: LEFT + 8, y: y - 28,
    size: 9, font: fontReg, color: black,
  })
  page.drawText(`CUIT: ${data.cliente.cuit}`, {
    x: LEFT + 8, y: y - 42,
    size: 9, font: fontReg, color: black,
  })
  page.drawText(`Domicilio: ${data.cliente.domicilio}`, {
    x: LEFT + 280, y: y - 42,
    size: 9, font: fontReg, color: black,
  })
  y = y - CLIENTE_H - 14

  // ════════════════ DETALLE (sin precios) ════════════════
  // Cantidad a la izquierda, descripción después.
  const COL_CANT = LEFT
  const COL_DESC = LEFT + 70

  const HEAD_H = 18
  const headTop = y
  const headBot = y - HEAD_H
  page.drawRectangle({
    x: LEFT, y: headBot,
    width: W, height: HEAD_H,
    color: veryLight,
    borderColor: black, borderWidth: 0.6,
  })
  page.drawText("CANT.", { x: COL_CANT + 8, y: y - 12, size: 8, font: fontBold, color: black })
  page.drawText("DESCRIPCIÓN", { x: COL_DESC + 8, y: y - 12, size: 8, font: fontBold, color: black })
  page.drawLine({
    start: { x: COL_DESC, y: headTop },
    end: { x: COL_DESC, y: headBot },
    thickness: 0.5, color: black,
  })
  y = headBot

  const ROW_H = 14
  const detalleTop = y
  for (const item of data.items) {
    const desc = item.descripcion.length > 75 ? item.descripcion.slice(0, 72) + "..." : item.descripcion
    const rowBaseY = y - 10
    const cantStr = String(item.cantidad)
    // Cantidad alineada al centro del bloque cant (left side)
    const cantW = fontReg.widthOfTextAtSize(cantStr, 8)
    page.drawText(cantStr, {
      x: COL_DESC - cantW - 10,
      y: rowBaseY, size: 8, font: fontReg, color: black,
    })
    page.drawText(desc, { x: COL_DESC + 8, y: rowBaseY, size: 8, font: fontReg, color: black })
    y -= ROW_H
  }

  const detalleBot = y
  page.drawRectangle({
    x: LEFT, y: detalleBot,
    width: W, height: detalleTop - detalleBot,
    borderColor: black, borderWidth: 0.6,
  })
  page.drawLine({
    start: { x: COL_DESC, y: detalleTop },
    end: { x: COL_DESC, y: detalleBot },
    thickness: 0.4, color: lightGray,
  })

  y -= 22

  // ════════════════ OBSERVACIONES ════════════════
  if (data.observaciones) {
    page.drawText("Observaciones:", { x: LEFT, y, size: 8, font: fontBold, color: black })
    y -= 11
    const obsLines = data.observaciones.match(/.{1,90}/g) || [data.observaciones]
    for (const line of obsLines.slice(0, 4)) {
      page.drawText(line, { x: LEFT, y, size: 8, font: fontReg, color: black })
      y -= 11
    }
  }

  // ════════════════ FIRMAS (espacio reservado en remito) ════════════════
  const firmasY = MARGIN + 180
  page.drawLine({ start: { x: LEFT + 30, y: firmasY }, end: { x: LEFT + 220, y: firmasY }, thickness: 0.5, color: black })
  page.drawText("Firma y aclaración receptor", {
    x: LEFT + 70, y: firmasY - 12,
    size: 8, font: fontReg, color: gray,
  })
  page.drawLine({ start: { x: RIGHT - 220, y: firmasY }, end: { x: RIGHT - 30, y: firmasY }, thickness: 0.5, color: black })
  page.drawText("Firma y aclaración entrega", {
    x: RIGHT - 175, y: firmasY - 12,
    size: 8, font: fontReg, color: gray,
  })

  // ════════════════ FOOTER CAI ════════════════
  const FOOTER_H = 130
  const footerBottom = MARGIN
  const footerTop = footerBottom + FOOTER_H

  page.drawRectangle({
    x: LEFT, y: footerBottom,
    width: W, height: FOOTER_H,
    borderColor: black, borderWidth: 1,
  })

  page.drawText("CAI Nº:", {
    x: LEFT + 8, y: footerTop - 22,
    size: 11, font: fontBold, color: black,
  })
  page.drawText(cai.cai, {
    x: LEFT + 60, y: footerTop - 22,
    size: 11, font: fontReg, color: black,
  })
  page.drawText("Vencimiento CAI:", {
    x: LEFT + 8, y: footerTop - 42,
    size: 10, font: fontBold, color: data.caiVencido ? red : black,
  })
  page.drawText(cai.vencimiento, {
    x: LEFT + 110, y: footerTop - 42,
    size: 10, font: fontReg, color: data.caiVencido ? red : black,
  })
  if (data.caiVencido) {
    page.drawText("⚠ VENCIDO", {
      x: LEFT + 200, y: footerTop - 42,
      size: 10, font: fontBold, color: red,
    })
  }
  page.drawText(`Talonario: ${cai.rangoDesde} - ${cai.rangoHasta}`, {
    x: LEFT + 8, y: footerTop - 60,
    size: 8, font: fontReg, color: gray,
  })

  // Barcode del CAI
  try {
    const barcodePng = await generarBarcodeCAI(cai.cai)
    const barcodeImg = await pdf.embedPng(barcodePng)
    const dims = barcodeImg.scale(0.45)
    page.drawImage(barcodeImg, {
      x: RIGHT - dims.width - 8, y: footerBottom + 30,
      width: dims.width, height: dims.height,
    })
    const caiTextW = fontReg.widthOfTextAtSize(cai.cai, 8)
    page.drawText(cai.cai, {
      x: RIGHT - caiTextW - 8 - (dims.width - caiTextW) / 2, y: footerBottom + 18,
      size: 8, font: fontReg, color: black,
    })
  } catch (e) {
    console.error("Error generando barcode CAI:", e)
    page.drawText(`[Barcode: ${cai.cai}]`, {
      x: RIGHT - 200, y: footerBottom + 50,
      size: 9, font: fontReg, color: gray,
    })
  }

  // Watermark "REMITO" (no es factura AFIP)
  page.drawText("REMITO", {
    x: 130, y: PAGE_H / 2 - 60,
    size: 110, font: fontBold,
    color: watermarkGray,
    rotate: degrees(30),
  })

  return await pdf.save()
}
