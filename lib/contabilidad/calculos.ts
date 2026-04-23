// Funciones puras para los informes contables.
// Extraídas de app/admin/contabilidad/page.tsx para poder testearlas con Vitest.

export type FacturaGestionPro = {
  fecha?: string | null
  tipo_comprobante?: string | null
  sucursal?: string | null
  nro_comprobante?: string | null
  letra?: string | null
  razon_social?: string | null
  documento?: string | null
  resp_iva?: string | null
  provincia?: string | null
  neto?: number | string | null
  impuestos?: number | string | null
  total?: number | string | null
}

export type FacturaSistemaNuevo = {
  fecha?: string | null
  tipo?: string | null
  numero?: string | null
  razon_social?: string | null
  cuit_cliente?: string | null
  base_gravada?: number | string | null
  iva_21?: number | string | null
  total?: number | string | null
}

export type FacturaProveedor = {
  fecha?: string | null
  tipo?: string | null
  punto_venta?: string | null
  numero?: string | null
  letra?: string | null
  razon_social?: string | null
  proveedor_nombre?: string | null
  cuit?: string | null
  neto?: number | string | null
  iva?: number | string | null
  percepciones_iva?: number | string | null
  percepciones_iibb?: number | string | null
  otros_impuestos?: number | string | null
  total?: number | string | null
}

export type SubdiarioVentasRow = {
  fecha: string
  tipo_nro: string
  cliente: string
  cuit: string
  neto: number
  exento: number
  iva21: number
  percep_iibb: number
  total: number
}

export function mesAnoToRange(mes: string | number, ano: string | number): { desde: string; hasta: string } {
  const m = typeof mes === "string" ? parseInt(mes, 10) : mes
  const y = typeof ano === "string" ? parseInt(ano, 10) : ano
  const desde = `${y}-${String(m).padStart(2, "0")}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const hasta = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
  return { desde, hasta }
}

export function fechaEnRango(fecha: string | null | undefined, desde: string, hasta: string): boolean {
  const f = String(fecha || "")
  return f >= desde && f <= hasta
}

export function mapFacturaGPToSubdiarioRow(f: FacturaGestionPro): SubdiarioVentasRow {
  return {
    fecha: String(f.fecha || ""),
    tipo_nro: `${f.tipo_comprobante || "FC"} ${f.sucursal || ""}-${f.nro_comprobante || ""}-${f.letra || ""}`,
    cliente: f.razon_social || "",
    cuit: f.documento || "",
    neto: Number(f.neto || 0),
    exento: 0,
    iva21: Number(f.impuestos || 0),
    percep_iibb: 0,
    total: Number(f.total || 0),
  }
}

export function mapFacturaNuevaToSubdiarioRow(f: FacturaSistemaNuevo): SubdiarioVentasRow {
  return {
    fecha: String(f.fecha || ""),
    tipo_nro: `${f.tipo || "FC"} ${f.numero || ""}`,
    cliente: f.razon_social || "",
    cuit: f.cuit_cliente || "",
    neto: Number(f.base_gravada || 0),
    exento: 0,
    iva21: Number(f.iva_21 || 0),
    percep_iibb: 0,
    total: Number(f.total || 0),
  }
}

export function calcularIvaAPagar(
  ventasGP: FacturaGestionPro[],
  ventasNuevas: FacturaSistemaNuevo[],
  compras: FacturaProveedor[],
  desde: string,
  hasta: string,
): { debIVA21: number; credIVA: number; percIVA: number; total: number } {
  const gp = ventasGP.filter((f) => fechaEnRango(f.fecha, desde, hasta))
  const nuevas = ventasNuevas.filter((f) => fechaEnRango(f.fecha, desde, hasta))
  const comp = compras.filter((f) => fechaEnRango(f.fecha, desde, hasta))

  const debIVA21 =
    gp.reduce((s, f) => s + Number(f.impuestos || 0), 0) +
    nuevas.reduce((s, f) => s + Number(f.iva_21 || 0), 0)

  const credIVA = comp.reduce((s, f) => s + Number(f.iva || 0), 0)
  const percIVA = comp.reduce((s, f) => s + Number(f.percepciones_iva || 0), 0)

  return { debIVA21, credIVA, percIVA, total: debIVA21 - credIVA - percIVA }
}
