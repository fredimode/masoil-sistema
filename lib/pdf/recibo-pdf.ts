import { jsPDF } from "jspdf"
import { EMPRESAS_DATA } from "@/lib/empresas"
import type { Empresa } from "@/lib/tusfacturas"

function fmt(n: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n)
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "-"
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    const [, y, mm, dd] = m
    return `${dd}/${mm}/${y}`
  }
  try {
    return new Date(d).toLocaleDateString("es-AR")
  } catch {
    return String(d)
  }
}

// ─── Importe en letras (ARS) ──────────────────────────────────────────────
// Convierte un número a su expresión en letras en español, en MAYÚSCULAS, con
// los centavos como "CON NN CTVS" (ej. 11,89 → "ONCE CON 89 CTVS"). Soporta
// hasta cientos de millones (cubre la deuda migrada ~$92,7M).

const UNIDADES = [
  "", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS",
  "DIECISIETE", "DIECIOCHO", "DIECINUEVE", "VEINTE",
]
const DECENAS = ["", "", "VEINTI", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"]
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"]

function decenaALetras(n: number): string {
  if (n <= 20) return UNIDADES[n]
  const d = Math.floor(n / 10)
  const u = n % 10
  if (d === 2) return u === 0 ? "VEINTE" : "VEINTI" + UNIDADES[u]
  return u > 0 ? `${DECENAS[d]} Y ${UNIDADES[u]}` : DECENAS[d]
}

function tresDigitos(n: number): string {
  // 0..999
  if (n === 0) return ""
  if (n === 100) return "CIEN"
  const c = Math.floor(n / 100)
  const resto = n % 100
  const parts = [c > 0 ? CENTENAS[c] : "", decenaALetras(resto)].filter(Boolean)
  return parts.join(" ")
}

// Apócope de "UNO" → "UN" cuando precede a MIL / MILLONES
// ("VEINTIUNO"→"VEINTIUN", "TREINTA Y UNO"→"TREINTA Y UN").
function apocope(s: string): string {
  return s.replace(/UNO$/, "UN")
}

function enteroALetras(n: number): string {
  if (n === 0) return "CERO"
  if (n < 0) return "MENOS " + enteroALetras(-n)
  if (n >= 1_000_000_000) return String(n) // fuera de rango soportado
  let out = ""
  const millones = Math.floor(n / 1_000_000)
  const miles = Math.floor((n % 1_000_000) / 1000)
  const resto = n % 1000
  if (millones > 0) {
    out += millones === 1 ? "UN MILLON " : `${apocope(tresDigitos(millones))} MILLONES `
  }
  if (miles > 0) {
    out += miles === 1 ? "MIL " : `${apocope(tresDigitos(miles))} MIL `
  }
  if (resto > 0) out += tresDigitos(resto)
  return out.trim().replace(/\s+/g, " ")
}

export function numeroALetras(n: number): string {
  const abs = Math.abs(n)
  const entero = Math.floor(abs)
  const centavos = Math.round((abs - entero) * 100)
  const cc = String(centavos).padStart(2, "0")
  return `${enteroALetras(entero)} CON ${cc} CTVS`
}

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface ReciboPDFData {
  numero_completo: string             // "AQ-0001" / "CO-0001" / "MA-0001"
  fecha: string | null
  empresa: string | null              // "Aquiles" | "Conancap" | "Masoil"
  cliente: {
    razon_social: string
    cuit?: string | null
    domicilio?: string | null
  }
  // Columna izquierda — comprobantes que cancela (líneas positivas)
  imputaciones: {
    comprobante: string               // "FACTURA A 0001-00000123"
    total: number
    monto_imputado: number
    fecha?: string | null
  }[]
  // Columna izquierda — retenciones (líneas negativas)
  retenciones?: {
    tipo: string                      // "IIBB_CABA" | "ARBA" | ...
    numero?: string | null
    fecha?: string | null
    importe: number
  }[]
  // Columna derecha — valores con los que se paga
  medios_pago: {
    tipo: string                      // "Efectivo" | "Transferencia" | "Cheque" | ...
    importe: number
    referencia?: string | null
    banco?: string | null
    numero?: string | null
  }[]
  total: number                       // TOTAL destacado = NETO pagado (facturas − retenciones = Σ medios)
  total_comprobantes?: number         // Σ facturas − Σ retenciones (fallback: se calcula)
  total_pagos?: number                // Σ medios (fallback: se calcula)
  observaciones?: string | null
}

interface ColRow {
  label: string
  sub?: string | null
  amount: number
  negative?: boolean
}

export function generateReciboPDF(data: ReciboPDFData): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  let y = margin

  const empresaKey = (data.empresa || "").trim() as Empresa
  const datosEmpresa = empresaKey in EMPRESAS_DATA
    ? EMPRESAS_DATA[empresaKey]
    : {
        razonSocial: data.empresa || "Empresa",
        cuit: "",
        direccion: "",
        localidad: "",
        condicionIva: "",
      }

  // Header — empresa receptora
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text(datosEmpresa.razonSocial, margin, y)
  y += 16
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  if (datosEmpresa.cuit) {
    doc.text(`CUIT: ${datosEmpresa.cuit}`, margin, y)
    y += 12
  }
  if (datosEmpresa.direccion || datosEmpresa.localidad) {
    doc.text([datosEmpresa.direccion, datosEmpresa.localidad].filter(Boolean).join(" - "), margin, y)
    y += 12
  }
  y += 8

  // Titulo + numero
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.text("RECIBO", pageW - margin, margin + 16, { align: "right" })
  doc.setFontSize(11)
  doc.text(data.numero_completo, pageW - margin, margin + 36, { align: "right" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`Fecha: ${fmtDate(data.fecha)}`, pageW - margin, margin + 52, { align: "right" })

  doc.setDrawColor(200)
  doc.line(margin, y, pageW - margin, y)
  y += 14

  // Datos del cliente
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text("RECIBIMOS DE", margin, y)
  y += 14
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  const clientLines = [
    `Razón social: ${data.cliente.razon_social}`,
    data.cliente.cuit ? `CUIT: ${data.cliente.cuit}` : null,
    data.cliente.domicilio ? `Domicilio: ${data.cliente.domicilio}` : null,
  ].filter(Boolean) as string[]
  for (const l of clientLines) {
    doc.text(l, margin, y)
    y += 12
  }
  y += 10

  // ─── Cuerpo en 2 columnas ───────────────────────────────────────────────
  const gap = 20
  const colW = (pageW - margin * 2 - gap) / 2
  const colLeftX = margin
  const colRightX = margin + colW + gap
  const colTop = y

  const retenciones = data.retenciones || []
  const sumImput = data.imputaciones.reduce((s, i) => s + (i.monto_imputado ?? i.total ?? 0), 0)
  const sumRets = retenciones.reduce((s, r) => s + (r.importe || 0), 0)
  const sumMedios = data.medios_pago.reduce((s, m) => s + (m.importe || 0), 0)
  const totalComprobantes = data.total_comprobantes ?? (sumImput - sumRets)
  const totalPagos = data.total_pagos ?? sumMedios

  // Filas columna izquierda: facturas (+) y retenciones (−)
  const leftRows: ColRow[] = [
    ...data.imputaciones.map((imp) => ({
      label: imp.comprobante,
      sub: fmtDate(imp.fecha),
      amount: imp.monto_imputado ?? imp.total ?? 0,
    })),
    ...retenciones.map((r) => ({
      label: `RET ${r.tipo}`,
      sub: [r.numero ? `N° ${r.numero}` : null, fmtDate(r.fecha)].filter(Boolean).join(" · ") || null,
      amount: r.importe || 0,
      negative: true,
    })),
  ]

  // Filas columna derecha: medios de pago
  const rightRows: ColRow[] = data.medios_pago.map((m) => ({
    label: (m.tipo || "-").toUpperCase(),
    sub: [
      m.banco ? `Banco: ${m.banco}` : null,
      m.numero ? `N° ${m.numero}` : null,
      m.referencia ? `Ref: ${m.referencia}` : null,
    ].filter(Boolean).join(" · ") || null,
    amount: m.importe || 0,
  }))

  // Dibuja una tabla de una columna (título, filas, subtotal). Devuelve la Y final.
  function drawColumn(x: number, startY: number, title: string, rows: ColRow[], totalLabel: string, totalValue: number): number {
    let cy = startY
    const amountX = x + colW - 4

    // Título
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.5)
    doc.setFillColor(225, 225, 225)
    doc.rect(x, cy, colW, 16, "F")
    doc.setTextColor(0)
    doc.text(title, x + 4, cy + 11)
    cy += 16

    // Filas
    if (rows.length === 0) {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(130)
      doc.text("Sin desglose", x + 4, cy + 10)
      doc.setTextColor(0)
      cy += 14
    }
    for (const row of rows) {
      if (cy > pageH - 160) {
        doc.addPage()
        cy = margin
      }
      doc.setFont("helvetica", "normal")
      doc.setFontSize(8)
      doc.setTextColor(0)
      const labelLine = doc.splitTextToSize(row.label, colW - 68)[0]
      doc.text(labelLine, x + 4, cy + 9)
      const amtStr = (row.negative ? "-" : "") + fmt(Math.abs(row.amount))
      doc.text(amtStr, amountX, cy + 9, { align: "right" })
      let rowH = 12
      if (row.sub) {
        doc.setFontSize(7)
        doc.setTextColor(125)
        doc.text(doc.splitTextToSize(row.sub, colW - 8)[0], x + 4, cy + 18)
        doc.setTextColor(0)
        rowH = 21
      }
      cy += rowH
      doc.setDrawColor(235)
      doc.line(x, cy - 3, x + colW, cy - 3)
    }

    // Subtotal
    cy += 4
    doc.setDrawColor(120)
    doc.line(x, cy - 1, x + colW, cy - 1)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.5)
    doc.text(totalLabel, x + 4, cy + 12)
    doc.text(fmt(totalValue), amountX, cy + 12, { align: "right" })
    cy += 18
    return cy
  }

  const endLeft = drawColumn(colLeftX, colTop, "COMPROBANTES", leftRows, "TOTAL COMPROBANTES", totalComprobantes)
  const endRight = drawColumn(colRightX, colTop, "VALORES", rightRows, "TOTAL PAGOS", totalPagos)
  y = Math.max(endLeft, endRight) + 16

  // ─── Importe en letras + TOTAL destacado (ancho completo) ───────────────
  if (y > pageH - 150) {
    doc.addPage()
    y = margin
  }
  doc.setDrawColor(180)
  doc.line(margin, y, pageW - margin, y)
  y += 16

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text("Son pesos:", margin, y)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  const letras = numeroALetras(data.total)
  const letrasLines = doc.splitTextToSize(letras, pageW - margin * 2 - 60)
  doc.text(letrasLines, margin + 55, y)
  y += 12 * letrasLines.length + 10

  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.text("TOTAL:", pageW - margin - 170, y + 2)
  doc.text(fmt(data.total), pageW - margin, y + 2, { align: "right" })
  y += 28

  // Observaciones
  if (data.observaciones) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.text("OBSERVACIONES", margin, y)
    y += 12
    doc.setFont("helvetica", "normal")
    const split = doc.splitTextToSize(data.observaciones, pageW - margin * 2)
    doc.text(split, margin, y)
    y += 12 * split.length + 8
  }

  // Firmas (al final de la página). Forzamos espacio para no pegar al footer.
  const firmasY = Math.max(y + 30, pageH - 110)
  doc.setDrawColor(150)
  doc.line(margin + 20, firmasY, margin + 200, firmasY)
  doc.line(pageW - margin - 200, firmasY, pageW - margin - 20, firmasY)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(80)
  doc.text("Firma del cobrador", margin + 110, firmasY + 12, { align: "center" })
  doc.text("Firma del cliente", pageW - margin - 110, firmasY + 12, { align: "center" })
  doc.setTextColor(0)

  // Footer
  const pageCount = (doc as unknown as { getNumberOfPages?: () => number }).getNumberOfPages?.() || 1
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(`${datosEmpresa.razonSocial} — Página ${i} de ${pageCount}`, pageW / 2, pageH - 20, { align: "center" })
  }

  return doc.output("blob")
}
