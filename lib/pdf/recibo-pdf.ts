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

export interface ReciboPDFData {
  numero_completo: string             // "AQ-0001" / "CO-0001" / "MA-0001"
  fecha: string | null
  empresa: string | null              // "Aquiles" | "Conancap" | "Masoil"
  cliente: {
    razon_social: string
    cuit?: string | null
    domicilio?: string | null
  }
  imputaciones: {
    comprobante: string               // "FC A 0001-00000123"
    total: number
    monto_imputado: number
    fecha?: string | null
  }[]
  medios_pago: {
    tipo: string                      // "Efectivo" | "Transferencia" | "Cheque" | ... | "Ajuste"
    importe: number
    referencia?: string | null
    banco?: string | null
    numero?: string | null
  }[]
  total: number
  observaciones?: string | null
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
  y += 8

  // Imputaciones (facturas que paga este recibo)
  if (data.imputaciones.length > 0) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.text("CONCEPTOS IMPUTADOS", margin, y)
    y += 12

    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setFillColor(240, 240, 240)
    doc.rect(margin, y - 10, pageW - margin * 2, 18, "F")
    doc.text("Comprobante", margin + 4, y + 2)
    doc.text("Fecha", margin + 220, y + 2)
    doc.text("Total", pageW - margin - 180, y + 2, { align: "right" })
    doc.text("Imputado", pageW - margin - 4, y + 2, { align: "right" })
    y += 14

    doc.setFont("helvetica", "normal")
    for (const imp of data.imputaciones) {
      if (y > pageH - 180) {
        doc.addPage()
        y = margin
      }
      doc.text(imp.comprobante, margin + 4, y)
      doc.text(fmtDate(imp.fecha), margin + 220, y)
      doc.text(fmt(imp.total), pageW - margin - 180, y, { align: "right" })
      doc.text(fmt(imp.monto_imputado), pageW - margin - 4, y, { align: "right" })
      y += 12
      doc.setDrawColor(230)
      doc.line(margin, y - 4, pageW - margin, y - 4)
    }
    y += 10
  }

  // Medios de pago
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text("MEDIOS DE PAGO", margin, y)
  y += 12

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setFillColor(240, 240, 240)
  doc.rect(margin, y - 10, pageW - margin * 2, 18, "F")
  doc.text("Tipo", margin + 4, y + 2)
  doc.text("Detalle", margin + 130, y + 2)
  doc.text("Importe", pageW - margin - 4, y + 2, { align: "right" })
  y += 14

  doc.setFont("helvetica", "normal")
  for (const m of data.medios_pago) {
    if (y > pageH - 180) {
      doc.addPage()
      y = margin
    }
    const detail = [
      m.banco ? `Banco: ${m.banco}` : null,
      m.numero ? `N° ${m.numero}` : null,
      m.referencia ? `Ref: ${m.referencia}` : null,
    ].filter(Boolean).join(" — ")
    doc.text(m.tipo, margin + 4, y)
    if (detail) {
      const split = doc.splitTextToSize(detail, 240)
      doc.text(split, margin + 130, y)
    }
    doc.text(fmt(m.importe), pageW - margin - 4, y, { align: "right" })
    y += 12
    doc.setDrawColor(230)
    doc.line(margin, y - 4, pageW - margin, y - 4)
  }

  y += 10

  // Total
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.text("TOTAL RECIBO:", pageW - margin - 130, y)
  doc.text(fmt(data.total), pageW - margin, y, { align: "right" })
  y += 24

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
