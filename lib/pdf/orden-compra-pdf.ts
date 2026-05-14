import { jsPDF } from "jspdf"
import { EMPRESAS_DATA } from "@/lib/empresas"
import type { Empresa } from "@/lib/tusfacturas"

function fmt(n: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n)
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "-"
  // Postgres devuelve DATE como "YYYY-MM-DD". new Date() lo interpreta UTC
  // y en Argentina muestra dia anterior — parseamos manual como local.
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

export interface OrdenCompraPDFData {
  nro_oc: string
  fecha: string | null
  empresa: string | null            // "Aquiles" | "Conancap" | "Masoil" (otros no soportados aún)
  razon_social_emisor?: string | null
  proveedor: {
    nombre: string
    cuit?: string | null
    domicilio?: string | null
    email?: string | null
  }
  items: {
    codigo: string | null
    descripcion: string
    cantidad: number
    precio_unitario: number
    descuento_porcentaje?: number | null
    subtotal: number
  }[]
  total: number
  observaciones?: string | null
  condicion_pago?: string | null
  estado?: string | null
}

export function generateOrdenCompraPDF(data: OrdenCompraPDFData): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 40
  let y = margin

  // Resolver datos de la empresa emisora. Soportamos Aquiles y Conancap como
  // estan en EMPRESAS_DATA. Para "Masoil" usamos un fallback explicito porque
  // no factura electronicamente pero si emite OCs.
  const empresaKey = (data.empresa || "").trim() as Empresa
  const datosEmpresa = empresaKey in EMPRESAS_DATA
    ? EMPRESAS_DATA[empresaKey]
    : {
        razonSocial: data.razon_social_emisor || data.empresa || "Empresa",
        cuit: "",
        direccion: "",
        localidad: "",
        condicionIva: "",
      }

  // Header — empresa emisora
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

  // Titulo + numero a la derecha
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.text("ORDEN DE COMPRA", pageW - margin, margin + 16, { align: "right" })
  doc.setFontSize(11)
  doc.text(data.nro_oc, pageW - margin, margin + 36, { align: "right" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.text(`Emitida: ${fmtDate(data.fecha)}`, pageW - margin, margin + 52, { align: "right" })
  if (data.estado) {
    doc.text(`Estado: ${data.estado}`, pageW - margin, margin + 64, { align: "right" })
  }

  // Separador
  doc.setDrawColor(200)
  doc.line(margin, y, pageW - margin, y)
  y += 14

  // Datos del proveedor
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text("DATOS DEL PROVEEDOR", margin, y)
  y += 14
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  const provLines = [
    `Razón social: ${data.proveedor.nombre}`,
    data.proveedor.cuit ? `CUIT: ${data.proveedor.cuit}` : null,
    data.proveedor.domicilio ? `Domicilio: ${data.proveedor.domicilio}` : null,
    data.proveedor.email ? `Email: ${data.proveedor.email}` : null,
  ].filter(Boolean) as string[]
  for (const l of provLines) {
    doc.text(l, margin, y)
    y += 12
  }
  y += 6

  // Tabla de items
  const cols = [
    { label: "Código", w: 70, align: "left" as const },
    { label: "Descripción", w: 220, align: "left" as const },
    { label: "Cant.", w: 45, align: "center" as const },
    { label: "P. Unit.", w: 75, align: "right" as const },
    { label: "Desc.", w: 40, align: "right" as const },
    { label: "Subtotal", w: 85, align: "right" as const },
  ]

  function drawHeader() {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setFillColor(240, 240, 240)
    doc.rect(margin, y - 10, pageW - margin * 2, 18, "F")
    let x = margin + 4
    for (const c of cols) {
      const xPos = c.align === "right" ? x + c.w - 6 : c.align === "center" ? x + c.w / 2 : x
      doc.text(c.label, xPos, y + 2, { align: c.align })
      x += c.w
    }
    y += 12
    doc.setFont("helvetica", "normal")
  }

  drawHeader()

  for (const it of data.items) {
    if (y > pageH - 140) {
      doc.addPage()
      y = margin
      drawHeader()
    }
    let x = margin + 4
    const row: string[] = [
      it.codigo || "-",
      it.descripcion,
      String(it.cantidad),
      fmt(it.precio_unitario),
      it.descuento_porcentaje ? `${it.descuento_porcentaje}%` : "-",
      fmt(it.subtotal),
    ]
    cols.forEach((c, i) => {
      const xPos = c.align === "right" ? x + c.w - 6 : c.align === "center" ? x + c.w / 2 : x
      if (i === 1) {
        const split = doc.splitTextToSize(row[i], c.w - 6)
        doc.text(split, xPos, y, { align: c.align })
      } else {
        doc.text(row[i], xPos, y, { align: c.align })
      }
      x += c.w
    })
    const descLines = doc.splitTextToSize(it.descripcion, cols[1].w - 6).length
    y += 12 + (descLines > 1 ? (descLines - 1) * 10 : 0)
    doc.setDrawColor(230)
    doc.line(margin, y - 4, pageW - margin, y - 4)
  }

  // Total
  y += 10
  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.text("TOTAL:", pageW - margin - 100, y)
  doc.text(fmt(data.total), pageW - margin, y, { align: "right" })
  y += 20

  // Condición de pago / Observaciones
  if (data.condicion_pago) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.text("CONDICIÓN DE PAGO", margin, y)
    y += 12
    doc.setFont("helvetica", "normal")
    doc.text(data.condicion_pago, margin, y)
    y += 16
  }
  if (data.observaciones) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.text("OBSERVACIONES", margin, y)
    y += 12
    doc.setFont("helvetica", "normal")
    const split = doc.splitTextToSize(data.observaciones, pageW - margin * 2)
    doc.text(split, margin, y)
    y += 12 * split.length
  }

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
