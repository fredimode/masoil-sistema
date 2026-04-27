import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib"
import QRCode from "qrcode"
import type { Empresa, Modo, TipoFactura, BasePorAlicuota } from "@/lib/tusfacturas"

export const EMPRESAS_DATA: Record<Empresa, {
  razonSocial: string
  cuit: string
  direccion: string
  localidad: string
  condicionIva: string
}> = {
  Aquiles: {
    razonSocial: "AQUILES EQUIPAMIENTOS SRL",
    cuit: "30-71514134-1",
    direccion: "Campichuelo 260 PB OF 23",
    localidad: "CAPITAL FEDERAL - BUENOS AIRES",
    condicionIva: "IVA RESP. INSCRIPTO",
  },
  Conancap: {
    razonSocial: "CONANCAP SRL",
    cuit: "30-71824287-4",
    direccion: "Campichuelo 260 PB OF 23",
    localidad: "CIUDAD AUTONOMA DE BUENOS AIRES",
    condicionIva: "IVA RESP. INSCRIPTO",
  },
}

export interface FacturaPDFData {
  empresa: Empresa
  modo: Modo
  tipoFactura: TipoFactura
  numero: string                    // formato "0001-00000123"
  puntoVenta: number
  comprobanteNro: number
  fecha: Date
  cliente: {
    razonSocial: string
    cuit: string                    // sin guiones o con guiones, lo normalizamos
    condicionIva: string
    domicilio: string
  }
  items: Array<{
    descripcion: string
    cantidad: number
    precioUnitarioSinIva: number
    alicuota: number
  }>
  bases: BasePorAlicuota[]
  totalNeto: number
  totalIVA: number
  total: number
  cae?: string | null
  vencimientoCae?: string | null    // formato AAAA-MM-DD
  observaciones?: string
}

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 30

function fmt(n: number): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function letraDe(tipo: TipoFactura): "A" | "B" {
  return tipo.endsWith("A") ? "A" : "B"
}

function tipoCodAFIP(tipo: TipoFactura): number {
  if (tipo === "FACTURA A") return 1
  if (tipo === "FACTURA B") return 6
  return 6
}

function alicuotaLabel(a: number): string {
  if (a === 21) return "21%"
  if (a === 10.5) return "10.5%"
  if (a === -1) return "Ex"
  if (a === -2) return "NG"
  return `${a}%`
}

function sonPesos(n: number): string {
  const entero = Math.floor(n)
  const decimal = Math.round((n - entero) * 100)
  return `SON PESOS ${entero.toLocaleString("es-AR")} CON ${String(decimal).padStart(2, "0")}/100`
}

async function generarQRAfip(params: {
  fecha: string                     // AAAA-MM-DD
  cuitEmisor: string                // sin guiones
  ptoVta: number
  tipoCmp: number
  nroCmp: number
  importe: number
  cae: string
  cuitReceptor: string              // sin guiones (puede ser "0")
}): Promise<Uint8Array> {
  const payload = {
    ver: 1,
    fecha: params.fecha,
    cuit: parseInt(params.cuitEmisor, 10),
    ptoVta: params.ptoVta,
    tipoCmp: params.tipoCmp,
    nroCmp: params.nroCmp,
    importe: params.importe,
    moneda: "PES",
    ctz: 1,
    tipoDocRec: 80,
    nroDocRec: parseInt(params.cuitReceptor || "0", 10) || 0,
    tipoCodAut: "E",
    codAut: parseInt(params.cae, 10),
  }
  const base64 = Buffer.from(JSON.stringify(payload)).toString("base64")
  const url = `https://www.afip.gob.ar/fe/qr/?p=${base64}`
  // 240px source → render a 120pt en PDF (2x para nitidez)
  const png = await QRCode.toBuffer(url, { width: 240, margin: 0 })
  return new Uint8Array(png)
}

export async function generarFacturaPDF(data: FacturaPDFData): Promise<Uint8Array> {
  const empresaData = EMPRESAS_DATA[data.empresa]
  const letra = letraDe(data.tipoFactura)
  const cuitEmisorClean = empresaData.cuit.replace(/-/g, "")
  const cuitClienteClean = data.cliente.cuit.replace(/-/g, "")

  const pdf = await PDFDocument.create()
  const page = pdf.addPage([PAGE_W, PAGE_H])
  const fontReg = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  const black = rgb(0, 0, 0)
  const gray = rgb(0.45, 0.45, 0.45)
  const lightGray = rgb(0.82, 0.82, 0.82)
  const veryLight = rgb(0.95, 0.95, 0.95)
  const watermarkGray = rgb(0.88, 0.88, 0.88)

  const LEFT = MARGIN
  const RIGHT = PAGE_W - MARGIN
  const W = RIGHT - LEFT

  // ════════════════ HEADER (3-column box) ════════════════
  const HEADER_H = 90
  const HEADER_TOP = PAGE_H - MARGIN
  const HEADER_BOTTOM = HEADER_TOP - HEADER_H
  const COL2_X = LEFT + 290    // divisor izq | medio
  const COL3_X = COL2_X + 75   // divisor medio | der

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

  // Columna 1: empresa
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

  // Columna 2: letra A/B + COD
  const col2Center = (COL2_X + COL3_X) / 2
  const letterSize = 42
  const letterW = fontBold.widthOfTextAtSize(letra, letterSize)
  page.drawText(letra, {
    x: col2Center - letterW / 2,
    y: HEADER_TOP - 50,
    size: letterSize, font: fontBold, color: black,
  })
  const codText = `COD. ${String(tipoCodAFIP(data.tipoFactura)).padStart(2, "0")}`
  const codW = fontReg.widthOfTextAtSize(codText, 8)
  page.drawText(codText, {
    x: col2Center - codW / 2,
    y: HEADER_TOP - 70,
    size: 8, font: fontReg, color: black,
  })

  // Columna 3: tipo + número + fecha + pdv
  page.drawText(data.tipoFactura, {
    x: COL3_X + 8, y: HEADER_TOP - 18,
    size: 13, font: fontBold, color: black,
  })
  page.drawText(`Nº: ${data.numero}`, {
    x: COL3_X + 8, y: HEADER_TOP - 36,
    size: 10, font: fontBold, color: black,
  })
  page.drawText(`Fecha: ${data.fecha.toLocaleDateString("es-AR")}`, {
    x: COL3_X + 8, y: HEADER_TOP - 52,
    size: 9, font: fontReg, color: black,
  })
  page.drawText(`Punto Venta: ${String(data.puntoVenta).padStart(5, "0")}`, {
    x: COL3_X + 8, y: HEADER_TOP - 66,
    size: 9, font: fontReg, color: black,
  })

  let y = HEADER_BOTTOM - 16

  // ════════════════ CLIENTE (sección con borde) ════════════════
  const CLIENTE_H = 70
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
  page.drawText(`Cond. IVA: ${data.cliente.condicionIva}`, {
    x: LEFT + 280, y: y - 42,
    size: 9, font: fontReg, color: black,
  })
  page.drawText(`Domicilio: ${data.cliente.domicilio}`, {
    x: LEFT + 8, y: y - 56,
    size: 9, font: fontReg, color: black,
  })
  y = y - CLIENTE_H - 14

  // ════════════════ DETALLE (tabla con divisores) ════════════════
  const COL_DESC = LEFT
  const COL_CANT = LEFT + 290
  const COL_PUNIT = COL_CANT + 50
  const COL_ALIC = COL_PUNIT + 70
  const COL_SUB = COL_ALIC + 50
  // Última columna llega hasta RIGHT (subtotal)

  // Header de tabla con fondo
  const HEAD_H = 18
  const headTop = y
  const headBot = y - HEAD_H
  page.drawRectangle({
    x: LEFT, y: headBot,
    width: W, height: HEAD_H,
    color: veryLight,
    borderColor: black, borderWidth: 0.6,
  })
  const headBaseY = y - 12
  page.drawText("DESCRIPCIÓN", { x: COL_DESC + 8, y: headBaseY, size: 8, font: fontBold, color: black })
  page.drawText("CANT.", { x: COL_CANT + 8, y: headBaseY, size: 8, font: fontBold, color: black })
  page.drawText("P. UNIT.", { x: COL_PUNIT + 8, y: headBaseY, size: 8, font: fontBold, color: black })
  page.drawText("ALÍC.", { x: COL_ALIC + 8, y: headBaseY, size: 8, font: fontBold, color: black })
  page.drawText("SUBTOTAL", { x: COL_SUB + 8, y: headBaseY, size: 8, font: fontBold, color: black })
  for (const lineX of [COL_CANT, COL_PUNIT, COL_ALIC, COL_SUB]) {
    page.drawLine({
      start: { x: lineX, y: headTop },
      end: { x: lineX, y: headBot },
      thickness: 0.5, color: black,
    })
  }
  y = headBot

  // Filas
  const ROW_H = 14
  const detalleTop = y
  for (const item of data.items) {
    const subtotal = item.cantidad * item.precioUnitarioSinIva
    const desc = item.descripcion.length > 55 ? item.descripcion.slice(0, 52) + "..." : item.descripcion
    const rowBaseY = y - 10
    page.drawText(desc, { x: COL_DESC + 8, y: rowBaseY, size: 8, font: fontReg, color: black })
    // Números alineados a la derecha de cada columna
    const cantStr = String(item.cantidad)
    page.drawText(cantStr, {
      x: COL_PUNIT - fontReg.widthOfTextAtSize(cantStr, 8) - 8,
      y: rowBaseY, size: 8, font: fontReg, color: black,
    })
    const punitStr = fmt(item.precioUnitarioSinIva)
    page.drawText(punitStr, {
      x: COL_ALIC - fontReg.widthOfTextAtSize(punitStr, 8) - 8,
      y: rowBaseY, size: 8, font: fontReg, color: black,
    })
    const alicStr = alicuotaLabel(item.alicuota)
    page.drawText(alicStr, {
      x: COL_SUB - fontReg.widthOfTextAtSize(alicStr, 8) - 8,
      y: rowBaseY, size: 8, font: fontReg, color: black,
    })
    const subStr = fmt(subtotal)
    page.drawText(subStr, {
      x: RIGHT - fontReg.widthOfTextAtSize(subStr, 8) - 8,
      y: rowBaseY, size: 8, font: fontReg, color: black,
    })
    y -= ROW_H
  }

  // Borde de la tabla + divisores verticales en el cuerpo
  const detalleBot = y
  page.drawRectangle({
    x: LEFT, y: detalleBot,
    width: W, height: detalleTop - detalleBot,
    borderColor: black, borderWidth: 0.6,
  })
  for (const lineX of [COL_CANT, COL_PUNIT, COL_ALIC, COL_SUB]) {
    page.drawLine({
      start: { x: lineX, y: detalleTop },
      end: { x: lineX, y: detalleBot },
      thickness: 0.4, color: lightGray,
    })
  }
  y -= 16

  // ════════════════ TOTALES (alineados a la derecha) ════════════════
  const totalLabelX = LEFT + 360
  const totalRightX = RIGHT - 8

  function drawTotalRow(label: string, value: string, isFinal = false) {
    const size = isFinal ? 12 : 9
    const valueFont = isFinal ? fontBold : fontReg
    const labelFont = isFinal ? fontBold : fontReg
    page.drawText(label, { x: totalLabelX, y, size, font: labelFont, color: black })
    const vw = valueFont.widthOfTextAtSize(value, size)
    page.drawText(value, { x: totalRightX - vw, y, size, font: valueFont, color: black })
    y -= isFinal ? 18 : 13
  }

  drawTotalRow("Subtotal Neto:", `$ ${fmt(data.totalNeto)}`)
  for (const b of data.bases) {
    if (b.iva > 0) drawTotalRow(`IVA ${b.alicuota}%:`, `$ ${fmt(b.iva)}`)
  }
  // Separador antes del TOTAL
  y += 4
  page.drawLine({
    start: { x: totalLabelX, y }, end: { x: RIGHT, y },
    thickness: 0.8, color: black,
  })
  y -= 12
  drawTotalRow("TOTAL:", `$ ${fmt(data.total)}`, true)
  y -= 6

  // ════════════════ SON PESOS (destacado) ════════════════
  const sonPesosBoxH = 20
  page.drawRectangle({
    x: LEFT, y: y - sonPesosBoxH,
    width: W, height: sonPesosBoxH,
    color: veryLight,
    borderColor: black, borderWidth: 0.6,
  })
  page.drawText(sonPesos(data.total), {
    x: LEFT + 8, y: y - 14,
    size: 10, font: fontBold, color: black,
  })
  y -= sonPesosBoxH + 14

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

  // ════════════════ FOOTER AFIP (posición fija, QR 120x120) ════════════════
  const FOOTER_H = 130
  const footerBottom = MARGIN
  const footerTop = footerBottom + FOOTER_H

  page.drawRectangle({
    x: LEFT, y: footerBottom,
    width: W, height: FOOTER_H,
    borderColor: black, borderWidth: 1,
  })

  if (data.cae) {
    page.drawText("CAE Nº:", {
      x: LEFT + 8, y: footerTop - 22,
      size: 11, font: fontBold, color: black,
    })
    page.drawText(data.cae, {
      x: LEFT + 60, y: footerTop - 22,
      size: 11, font: fontReg, color: black,
    })
    if (data.vencimientoCae) {
      const venc = new Date(data.vencimientoCae).toLocaleDateString("es-AR")
      page.drawText("Vencimiento CAE:", {
        x: LEFT + 8, y: footerTop - 42,
        size: 10, font: fontBold, color: black,
      })
      page.drawText(venc, {
        x: LEFT + 110, y: footerTop - 42,
        size: 10, font: fontReg, color: black,
      })
    }
    page.drawText("Comprobante autorizado", {
      x: LEFT + 8, y: footerTop - 60,
      size: 8, font: fontReg, color: gray,
    })

    if (data.modo === "produccion") {
      const qrPng = await generarQRAfip({
        fecha: data.fecha.toISOString().slice(0, 10),
        cuitEmisor: cuitEmisorClean,
        ptoVta: data.puntoVenta,
        tipoCmp: tipoCodAFIP(data.tipoFactura),
        nroCmp: data.comprobanteNro,
        importe: data.total,
        cae: data.cae,
        cuitReceptor: cuitClienteClean,
      })
      const qrImg = await pdf.embedPng(qrPng)
      page.drawImage(qrImg, {
        x: RIGHT - 128, y: footerBottom + 5,
        width: 120, height: 120,
      })
    }
  } else {
    page.drawText("Comprobante no autorizado por AFIP (sin CAE)", {
      x: LEFT + 8, y: footerTop - 22,
      size: 10, font: fontBold, color: rgb(0.7, 0, 0),
    })
  }

  // ════════════════ WATERMARK TESTING ════════════════
  if (data.modo !== "produccion") {
    page.drawText("** TESTING **", {
      x: 90, y: PAGE_H / 2 - 80,
      size: 90, font: fontBold,
      color: watermarkGray,
      rotate: degrees(30),
    })
  }

  return await pdf.save()
}
