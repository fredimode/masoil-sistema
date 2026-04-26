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
  const png = await QRCode.toBuffer(url, { width: 110, margin: 0 })
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
  const gray = rgb(0.55, 0.55, 0.55)
  const lightGray = rgb(0.85, 0.85, 0.85)

  // ════════════════════════════ HEADER ════════════════════════════
  // Top divider
  page.drawLine({
    start: { x: MARGIN, y: PAGE_H - MARGIN },
    end: { x: PAGE_W - MARGIN, y: PAGE_H - MARGIN },
    thickness: 1, color: black,
  })

  // Empresa (texto bold, sin imagen)
  page.drawText(empresaData.razonSocial, {
    x: MARGIN, y: PAGE_H - MARGIN - 22,
    size: 16, font: fontBold, color: black,
  })
  page.drawText(empresaData.condicionIva, {
    x: MARGIN, y: PAGE_H - MARGIN - 38,
    size: 9, font: fontReg, color: black,
  })
  page.drawText(`${empresaData.direccion} - ${empresaData.localidad}`, {
    x: MARGIN, y: PAGE_H - MARGIN - 50,
    size: 8, font: fontReg, color: gray,
  })
  page.drawText(`CUIT: ${empresaData.cuit}`, {
    x: MARGIN, y: PAGE_H - MARGIN - 62,
    size: 8, font: fontReg, color: gray,
  })

  // Letra A/B (caja centrada)
  const boxW = 50
  const boxH = 55
  const boxX = (PAGE_W / 2) - (boxW / 2)
  const boxY = PAGE_H - MARGIN - boxH - 5
  page.drawRectangle({
    x: boxX, y: boxY,
    width: boxW, height: boxH,
    borderColor: black, borderWidth: 1.5,
  })
  // Centrado aproximado de la letra
  const letterWidth = fontBold.widthOfTextAtSize(letra, 36)
  page.drawText(letra, {
    x: boxX + (boxW - letterWidth) / 2,
    y: boxY + 16,
    size: 36, font: fontBold, color: black,
  })
  const codText = `COD. ${String(tipoCodAFIP(data.tipoFactura)).padStart(2, "0")}`
  const codWidth = fontReg.widthOfTextAtSize(codText, 7)
  page.drawText(codText, {
    x: boxX + (boxW - codWidth) / 2,
    y: boxY + 5,
    size: 7, font: fontReg, color: black,
  })

  // Tipo + número + fecha (derecha)
  const rightX = PAGE_W - MARGIN - 200
  page.drawText(data.tipoFactura, {
    x: rightX, y: PAGE_H - MARGIN - 22,
    size: 14, font: fontBold, color: black,
  })
  page.drawText(`Nº: ${data.numero}`, {
    x: rightX, y: PAGE_H - MARGIN - 38,
    size: 10, font: fontBold, color: black,
  })
  page.drawText(`Fecha: ${data.fecha.toLocaleDateString("es-AR")}`, {
    x: rightX, y: PAGE_H - MARGIN - 52,
    size: 9, font: fontReg, color: black,
  })
  page.drawText(`Punto de Venta: ${String(data.puntoVenta).padStart(5, "0")}`, {
    x: rightX, y: PAGE_H - MARGIN - 64,
    size: 8, font: fontReg, color: gray,
  })

  // Línea divisoria
  let y = PAGE_H - MARGIN - 90
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
    thickness: 0.8, color: black,
  })
  y -= 18

  // ════════════════════════════ CLIENTE ════════════════════════════
  page.drawText("CLIENTE", { x: MARGIN, y, size: 9, font: fontBold, color: black })
  y -= 14
  page.drawText(`Razón social: ${data.cliente.razonSocial}`, {
    x: MARGIN, y, size: 9, font: fontReg, color: black,
  })
  y -= 12
  page.drawText(`CUIT: ${data.cliente.cuit}`, {
    x: MARGIN, y, size: 9, font: fontReg, color: black,
  })
  page.drawText(`Cond. IVA: ${data.cliente.condicionIva}`, {
    x: 300, y, size: 9, font: fontReg, color: black,
  })
  y -= 12
  page.drawText(`Domicilio: ${data.cliente.domicilio}`, {
    x: MARGIN, y, size: 9, font: fontReg, color: black,
  })
  y -= 18

  // ════════════════════════════ DETALLE ════════════════════════════
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
    thickness: 0.5, color: black,
  })
  y -= 14
  page.drawText("DESCRIPCIÓN", { x: MARGIN, y, size: 8, font: fontBold, color: black })
  page.drawText("CANT.", { x: 320, y, size: 8, font: fontBold, color: black })
  page.drawText("P. UNIT.", { x: 370, y, size: 8, font: fontBold, color: black })
  page.drawText("ALÍC.", { x: 440, y, size: 8, font: fontBold, color: black })
  page.drawText("SUBTOTAL", { x: 490, y, size: 8, font: fontBold, color: black })
  y -= 6
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
    thickness: 0.3, color: lightGray,
  })
  y -= 12

  for (const item of data.items) {
    const subtotal = item.cantidad * item.precioUnitarioSinIva
    const desc = item.descripcion.length > 50 ? item.descripcion.slice(0, 47) + "..." : item.descripcion
    page.drawText(desc, { x: MARGIN, y, size: 8, font: fontReg, color: black })
    page.drawText(String(item.cantidad), { x: 320, y, size: 8, font: fontReg, color: black })
    page.drawText(fmt(item.precioUnitarioSinIva), { x: 370, y, size: 8, font: fontReg, color: black })
    page.drawText(alicuotaLabel(item.alicuota), { x: 440, y, size: 8, font: fontReg, color: black })
    page.drawText(fmt(subtotal), { x: 490, y, size: 8, font: fontReg, color: black })
    y -= 12
  }

  y -= 6
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
    thickness: 0.5, color: black,
  })
  y -= 16

  // ════════════════════════════ TOTALES ════════════════════════════
  const labelX = 380
  const valueX = 490

  page.drawText("Subtotal Neto:", { x: labelX, y, size: 9, font: fontReg, color: black })
  page.drawText(`$ ${fmt(data.totalNeto)}`, { x: valueX, y, size: 9, font: fontReg, color: black })
  y -= 12

  for (const b of data.bases) {
    if (b.iva > 0) {
      page.drawText(`IVA ${b.alicuota}%:`, { x: labelX, y, size: 9, font: fontReg, color: black })
      page.drawText(`$ ${fmt(b.iva)}`, { x: valueX, y, size: 9, font: fontReg, color: black })
      y -= 12
    }
  }

  y -= 4
  page.drawLine({
    start: { x: labelX, y }, end: { x: PAGE_W - MARGIN, y },
    thickness: 0.5, color: black,
  })
  y -= 14
  page.drawText("TOTAL:", { x: labelX, y, size: 12, font: fontBold, color: black })
  page.drawText(`$ ${fmt(data.total)}`, { x: valueX, y, size: 12, font: fontBold, color: black })
  y -= 22

  page.drawText(sonPesos(data.total), {
    x: MARGIN, y, size: 8, font: fontReg, color: black,
  })
  y -= 24

  if (data.observaciones) {
    page.drawText("Observaciones:", { x: MARGIN, y, size: 8, font: fontBold, color: black })
    y -= 11
    const obsLines = data.observaciones.match(/.{1,90}/g) || [data.observaciones]
    for (const line of obsLines.slice(0, 4)) {
      page.drawText(line, { x: MARGIN, y, size: 8, font: fontReg, color: black })
      y -= 11
    }
  }

  // ════════════════════════════ FOOTER AFIP ════════════════════════════
  const footerTop = MARGIN + 90
  page.drawLine({
    start: { x: MARGIN, y: footerTop },
    end: { x: PAGE_W - MARGIN, y: footerTop },
    thickness: 0.5, color: black,
  })

  if (data.cae) {
    page.drawText("CAE Nº:", {
      x: MARGIN, y: footerTop - 16,
      size: 9, font: fontBold, color: black,
    })
    page.drawText(data.cae, {
      x: MARGIN + 50, y: footerTop - 16,
      size: 9, font: fontReg, color: black,
    })
    if (data.vencimientoCae) {
      const venc = new Date(data.vencimientoCae).toLocaleDateString("es-AR")
      page.drawText("Vencimiento CAE:", {
        x: MARGIN, y: footerTop - 30,
        size: 9, font: fontBold, color: black,
      })
      page.drawText(venc, {
        x: MARGIN + 100, y: footerTop - 30,
        size: 9, font: fontReg, color: black,
      })
    }

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
        x: PAGE_W - MARGIN - 80, y: footerTop - 85,
        width: 75, height: 75,
      })
    }
  } else {
    page.drawText("Comprobante no autorizado por AFIP (sin CAE)", {
      x: MARGIN, y: footerTop - 16,
      size: 9, font: fontBold, color: rgb(0.7, 0, 0),
    })
  }

  if (data.modo === "testing") {
    page.drawText("** TESTING **", {
      x: 130, y: PAGE_H / 2,
      size: 60, font: fontBold,
      color: rgb(0.92, 0.92, 0.92),
      rotate: degrees(30),
    })
  }

  return await pdf.save()
}
