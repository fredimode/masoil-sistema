import { jsPDF } from "jspdf"

const RAZONES_SOCIALES: Record<string, { nombre: string; cuit: string; domicilio: string }> = {
  Masoil: {
    nombre: "MASOIL S.R.L.",
    cuit: "30-71122333-4",
    domicilio: "Av. Corrientes 1234, CABA",
  },
  Aquiles: {
    nombre: "AQUILES S.A.",
    cuit: "30-71222444-5",
    domicilio: "Av. Rivadavia 5678, CABA",
  },
  Conancap: {
    nombre: "CONANCAP S.A.",
    cuit: "30-71333555-6",
    domicilio: "Av. Santa Fe 910, CABA",
  },
}

function fmt(n: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n)
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "-"
  try {
    return new Date(d).toLocaleDateString("es-AR")
  } catch {
    return String(d)
  }
}

export interface CotizacionPDFData {
  numero: string
  fecha: string | null
  validez_fecha: string | null
  forma_pago: string | null
  plazo_entrega: string | null
  observaciones: string | null
  total: number
  razon_social: string | null
  cliente: {
    razon_social: string
    cuit: string
    domicilio: string
    contacto: string
  }
  items: {
    cantidad: number
    producto_nombre: string
    producto_codigo: string
    precio_unitario: number
    subtotal: number
  }[]
}

/**
 * Genera el PDF de una cotización y devuelve un Blob listo para subir o descargar.
 */
export function generateCotizacionPDF(data: CotizacionPDFData): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  let y = margin

  const razon = RAZONES_SOCIALES[data.razon_social || "Masoil"] || RAZONES_SOCIALES.Masoil

  // Header
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text(razon.nombre, margin, y)
  y += 16
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`CUIT: ${razon.cuit}`, margin, y)
  y += 12
  doc.text(razon.domicilio, margin, y)
  y += 20

  // Title + número
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.text("COTIZACIÓN", pageW - margin, margin + 16, { align: "right" })
  doc.setFontSize(11)
  doc.text(data.numero, pageW - margin, margin + 36, { align: "right" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`Emitida: ${fmtDate(data.fecha)}`, pageW - margin, margin + 52, { align: "right" })

  // Horizontal separator
  doc.setDrawColor(200)
  doc.line(margin, y, pageW - margin, y)
  y += 14

  // Cliente
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text("DATOS DEL CLIENTE", margin, y)
  y += 14
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  const clienteLines = [
    `Razón social: ${data.cliente.razon_social}`,
    data.cliente.cuit ? `CUIT: ${data.cliente.cuit}` : null,
    data.cliente.domicilio ? `Domicilio: ${data.cliente.domicilio}` : null,
    data.cliente.contacto ? `Contacto: ${data.cliente.contacto}` : null,
  ].filter(Boolean) as string[]
  for (const l of clienteLines) {
    doc.text(l, margin, y)
    y += 12
  }
  y += 6

  // Items table
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  const cols = [
    { label: "Cant.", w: 50, align: "center" as const },
    { label: "Producto", w: 220, align: "left" as const },
    { label: "Código", w: 80, align: "left" as const },
    { label: "P. Unit (s/IVA)", w: 90, align: "right" as const },
    { label: "Subtotal", w: 95, align: "right" as const },
  ]

  function drawHeader() {
    doc.setFillColor(240, 240, 240)
    doc.rect(margin, y - 10, pageW - margin * 2, 18, "F")
    let x = margin + 4
    for (const c of cols) {
      doc.text(c.label, c.align === "right" ? x + c.w - 6 : c.align === "center" ? x + c.w / 2 : x, y + 2, { align: c.align })
      x += c.w
    }
    y += 12
  }

  drawHeader()

  // Neto base (subtotal sin IVA) — los precios cargados ya son sin IVA por definición
  const neto = data.items.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0)

  doc.setFont("helvetica", "normal")
  for (const it of data.items) {
    if (y > pageH - 140) {
      doc.addPage()
      y = margin
      drawHeader()
    }
    let x = margin + 4
    const row = [
      String(it.cantidad),
      it.producto_nombre,
      it.producto_codigo || "",
      fmt(it.precio_unitario),
      fmt(it.subtotal),
    ]
    // Wrap product name if too long
    cols.forEach((c, i) => {
      const text = row[i]
      const align = c.align
      const xPos = align === "right" ? x + c.w - 6 : align === "center" ? x + c.w / 2 : x
      if (i === 1) {
        // producto: wrap
        const split = doc.splitTextToSize(text, c.w - 6)
        doc.text(split, xPos, y, { align })
      } else {
        doc.text(text, xPos, y, { align })
      }
      x += c.w
    })
    // Line height based on product rows
    const productLines = doc.splitTextToSize(it.producto_nombre, cols[1].w - 6).length
    y += 12 + (productLines > 1 ? (productLines - 1) * 10 : 0)
    doc.setDrawColor(230)
    doc.line(margin, y - 4, pageW - margin, y - 4)
  }

  y += 10

  // Resumen
  const iva = neto * 0.21
  const totalConIva = neto + iva
  const resumenX = pageW - margin - 200
  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  doc.text("Subtotal neto:", resumenX, y)
  doc.text(fmt(neto), pageW - margin, y, { align: "right" })
  y += 14
  doc.text("IVA 21%:", resumenX, y)
  doc.text(fmt(iva), pageW - margin, y, { align: "right" })
  y += 14
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.text("TOTAL:", resumenX, y)
  doc.text(fmt(totalConIva), pageW - margin, y, { align: "right" })
  y += 20

  // Términos
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text("TÉRMINOS Y CONDICIONES", margin, y)
  y += 14
  doc.setFont("helvetica", "normal")
  const terminos: string[] = [
    `1. La cotización tiene validez hasta el ${fmtDate(data.validez_fecha)}.`,
    `2. Forma de pago: ${data.forma_pago || "a convenir"}.`,
    `3. Entrega dentro de ${data.plazo_entrega || "a convenir"}.`,
  ]
  for (const t of terminos) {
    const split = doc.splitTextToSize(t, pageW - margin * 2)
    doc.text(split, margin, y)
    y += 12 * split.length
  }

  // Observaciones
  if (data.observaciones) {
    y += 10
    doc.setFont("helvetica", "bold")
    doc.text("OBSERVACIONES", margin, y)
    y += 14
    doc.setFont("helvetica", "normal")
    const split = doc.splitTextToSize(data.observaciones, pageW - margin * 2)
    doc.text(split, margin, y)
    y += 12 * split.length
  }

  // Footer page number
  const pageCount = (doc as any).getNumberOfPages?.() || 1
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150)
    doc.text(`${razon.nombre} — Página ${i} de ${pageCount}`, pageW / 2, pageH - 20, { align: "center" })
  }

  return doc.output("blob")
}
