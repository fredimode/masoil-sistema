export type Empresa = "Aquiles" | "Conancap"
export type Modo = "testing" | "produccion"
export type CondicionIvaCliente = "RI" | "M" | "CF" | "EX"
export type TipoFactura = "FACTURA A" | "FACTURA B"
export type Alicuota = 21 | 10.5 | -1 | -2

export interface ItemInput {
  descripcion: string
  cantidad: number
  precioUnitarioSinIva: number
  alicuota: Alicuota
}

export interface ClienteInput {
  numero_docum: string
  nombre: string
  condicion_iva?: string | null
  domicilio?: string | null
  provincia?: string | null
  email?: string | null
}

export interface BasePorAlicuota {
  alicuota: number
  base: number
  iva: number
}

export interface TusFacturasResponse {
  error?: "S" | "N"
  errores?: string[]
  error_message?: string
  cae?: string
  vencimiento_cae?: string
  comprobante_nro?: string | number
  comprobante_tipo?: string
  comprobante_pdf_url?: string
  [key: string]: unknown
}

export interface Credentials {
  apikey: string
  apitoken: string
  usertoken: string
  pdv: number
}

export const TUSFACTURAS_URL = "https://www.tusfacturas.app/app/api/v2/facturacion/nuevo"

export function getCredentials(empresa: Empresa, modo: Modo): Credentials {
  const empresaUpper = empresa.toUpperCase()
  const modoUpper = modo === "produccion" ? "PROD" : "TEST"

  const usertoken = process.env[`TUSFACTURAS_USERTOKEN_${empresaUpper}_${modoUpper}`]
  const pdvRaw = process.env[`TUSFACTURAS_PDV_${empresaUpper}_${modoUpper}`]
  const apikey = process.env.TUSFACTURAS_APIKEY
  const apitoken = process.env.TUSFACTURAS_APITOKEN

  if (!apikey) throw new Error("Falta env TUSFACTURAS_APIKEY")
  if (!apitoken) throw new Error("Falta env TUSFACTURAS_APITOKEN")
  if (!usertoken) throw new Error(`Falta env TUSFACTURAS_USERTOKEN_${empresaUpper}_${modoUpper}`)
  if (!pdvRaw) throw new Error(`Falta env TUSFACTURAS_PDV_${empresaUpper}_${modoUpper}`)

  const pdv = parseInt(pdvRaw, 10)
  if (Number.isNaN(pdv)) throw new Error(`PDV inválido (${pdvRaw}) para ${empresaUpper}_${modoUpper}`)

  return { apikey, apitoken, usertoken, pdv }
}

const CONDICION_IVA_MAP: Record<string, CondicionIvaCliente> = {
  "RESP. INSCRIPTO": "RI",
  "RESPONSABLE INSCRIPTO": "RI",
  "RI": "RI",
  "MONOTRIBUTISTA": "M",
  "MONOTRIBUTISTA SOCIAL": "M",
  "M": "M",
  "CONSUMIDOR FINAL": "CF",
  "CF": "CF",
  "EXENTO": "EX",
  "E": "EX",
  "EX": "EX",
  "NO CATEGORIZADO": "CF",
}

export function mapCondicionIVA(condicion?: string | null): CondicionIvaCliente {
  if (!condicion) return "CF"
  return CONDICION_IVA_MAP[condicion.toUpperCase().trim()] || "CF"
}

export function inferTipoFactura(condicionIVA: CondicionIvaCliente): TipoFactura {
  return condicionIVA === "RI" ? "FACTURA A" : "FACTURA B"
}

export function limpiarCuit(cuit: string): string {
  return cuit.replace(/[-\s]/g, "")
}

export function formatFechaTusFacturas(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0")
  const m = String(date.getMonth() + 1).padStart(2, "0")
  return `${d}/${m}/${date.getFullYear()}`
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Calcula bases por alícuota y totales.
 * Redondea cada base ANTES de calcular IVA, según AFIP.
 */
export function calcularBasesYTotales(items: ItemInput[]) {
  const grupos = new Map<number, number>()
  for (const item of items) {
    const subtotal = item.cantidad * item.precioUnitarioSinIva
    grupos.set(item.alicuota, (grupos.get(item.alicuota) || 0) + subtotal)
  }

  const bases: BasePorAlicuota[] = []
  let totalNeto = 0
  let totalIVA = 0

  for (const [alicuota, baseRaw] of grupos) {
    const base = round2(baseRaw)
    let iva = 0
    if (alicuota === 21) iva = round2(base * 0.21)
    else if (alicuota === 10.5) iva = round2(base * 0.105)
    bases.push({ alicuota, base, iva })
    totalNeto += base
    totalIVA += iva
  }

  return {
    bases,
    totalNeto: round2(totalNeto),
    totalIVA: round2(totalIVA),
    total: round2(totalNeto + totalIVA),
  }
}

export function buildPayload(params: {
  empresa: Empresa
  modo: Modo
  tipoFactura: TipoFactura
  cliente: ClienteInput
  items: ItemInput[]
  total: number
  observaciones?: string
}) {
  const creds = getCredentials(params.empresa, params.modo)
  const condicionIVA = mapCondicionIVA(params.cliente.condicion_iva)

  return {
    apitoken: creds.apitoken,
    apikey: creds.apikey,
    usertoken: creds.usertoken,
    cliente: {
      documento_tipo: "CUIT",
      documento_nro: limpiarCuit(params.cliente.numero_docum),
      razon_social: params.cliente.nombre.replace(/['"]/g, ''),
      condicion_iva: condicionIVA,
      domicilio: (params.cliente.domicilio || "Sin domicilio").replace(/['"]/g, ''),
      provincia: params.cliente.provincia || "BUENOS AIRES",
      envia_por_mail: "N",
    },
    comprobante: {
      tipo: params.tipoFactura,
      operacion: "V",
      punto_venta: creds.pdv,
      moneda: "PES",
      cotizacion: 1,
      fecha: formatFechaTusFacturas(new Date()),
      detalle: params.items.map((item) => ({
        cantidad: item.cantidad,
        producto: {
          descripcion: item.descripcion.replace(/['"]/g, ''),
          alicuota: item.alicuota,
          precio_unitario_sin_iva: round2(item.precioUnitarioSinIva),
          unidad_medida: 7,
        },
      })),
      total: 0, // TusFacturas lo calcula automático
      tributos: [] as unknown[],
      ...(params.observaciones ? { observaciones: params.observaciones.replace(/['"]/g, '') } : {}),
    },
  }
}
