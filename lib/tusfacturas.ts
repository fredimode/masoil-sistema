export type Empresa = "Aquiles" | "Conancap"
export type Modo = "testing" | "produccion"
export type CondicionIvaCliente = "RI" | "M" | "CF" | "EX"
export type TipoFactura =
  | "FACTURA A"
  | "FACTURA B"
  | "NOTA DE CREDITO A"
  | "NOTA DE CREDITO B"
  | "NOTA DE DEBITO A"
  | "NOTA DE DEBITO B"
export type Alicuota = 21 | 10.5 | -1 | -2

export const TIPOS_NC: TipoFactura[] = ["NOTA DE CREDITO A", "NOTA DE CREDITO B"]
export const TIPOS_ND: TipoFactura[] = ["NOTA DE DEBITO A", "NOTA DE DEBITO B"]

export function esNotaCredito(tipo: TipoFactura): boolean {
  return TIPOS_NC.includes(tipo)
}
export function esNotaDebito(tipo: TipoFactura): boolean {
  return TIPOS_ND.includes(tipo)
}

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

export interface ComprobanteAsociado {
  tipo: TipoFactura | string
  puntoVenta: string | number
  numero: string | number
  fecha?: string
  cuit?: string
  // ID local de la factura original (facturas.id BIGINT). Se usa para
  // popular factura_referencia_id en la NC/ND emitida y permitir queries
  // como "todas las NC de esta factura".
  facturaOriginalId?: number | string
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

// Tabla oficial TusFacturas — 1-indexed, CABA=1, resto alfabético 2-24.
// Fuente: https://developers.tusfacturas.app/parametros/tablas-de-referencia#provincias
const PROVINCIA_CODIGO: Record<string, string> = {
  // 1 - CABA (sinónimos)
  'CABA': '1',
  'CAPITAL FEDERAL': '1',
  'CIUDAD AUTONOMA DE BUENOS AIRES': '1',
  'CIUDAD AUTÓNOMA DE BUENOS AIRES': '1',
  'CIUDAD AUTONOMA BUENOS AIRES': '1',
  'CIUDAD AUT.DE BS.AS.': '1',
  // 2-24 alfabético (con/sin tilde)
  'BUENOS AIRES': '2',
  'CATAMARCA': '3',
  'CHACO': '4',
  'CHUBUT': '5',
  'CORDOBA': '6',
  'CÓRDOBA': '6',
  'CORRIENTES': '7',
  'ENTRE RIOS': '8',
  'ENTRE RÍOS': '8',
  'FORMOSA': '9',
  'JUJUY': '10',
  'LA PAMPA': '11',
  'LA RIOJA': '12',
  'MENDOZA': '13',
  'MISIONES': '14',
  'NEUQUEN': '15',
  'NEUQUÉN': '15',
  'RIO NEGRO': '16',
  'RÍO NEGRO': '16',
  'SALTA': '17',
  'SAN JUAN': '18',
  'SAN LUIS': '19',
  'SANTA CRUZ': '20',
  'SANTA FE': '21',
  'SANTIAGO DEL ESTERO': '22',
  'TIERRA DEL FUEGO': '23',
  'TUCUMAN': '24',
  'TUCUMÁN': '24',
}

export function mapProvinciaToCode(provincia?: string | null): string {
  const key = provincia?.toUpperCase().trim()
  if (!key) {
    console.warn(`[mapProvinciaToCode] provincia vacía, usando fallback CIUDAD AUTONOMA BUENOS AIRES`)
    return PROVINCIA_CODIGO['CIUDAD AUTONOMA BUENOS AIRES']
  }
  const code = PROVINCIA_CODIGO[key]
  if (code === undefined) {
    console.warn(`[mapProvinciaToCode] provincia "${provincia}" no reconocida, usando fallback CIUDAD AUTONOMA BUENOS AIRES`)
    return PROVINCIA_CODIGO['CIUDAD AUTONOMA BUENOS AIRES']
  }
  return code
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
  comprobanteAsociado?: ComprobanteAsociado
}) {
  const creds = getCredentials(params.empresa, params.modo)
  const condicionIVA = mapCondicionIVA(params.cliente.condicion_iva)

  const fechaEmision = new Date()
  const fechaVto = new Date(fechaEmision)
  fechaVto.setDate(fechaVto.getDate() + 30)

  const totalCalculado = params.items.reduce((sum, item) => {
    const subtotal = item.precioUnitarioSinIva * item.cantidad
    let iva = 0
    if (item.alicuota === 21) iva = subtotal * 0.21
    else if (item.alicuota === 10.5) iva = subtotal * 0.105
    return sum + subtotal + iva
  }, 0)

  return {
    apitoken: creds.apitoken,
    apikey: creds.apikey,
    usertoken: creds.usertoken,
    cliente: {
      documento_tipo: "CUIT",
      documento_nro: limpiarCuit(params.cliente.numero_docum),
      razon_social: params.cliente.nombre.replace(/['"]/g, ''),
      email: params.cliente.email || "",
      condicion_iva: condicionIVA,
      domicilio: (params.cliente.domicilio || "Sin domicilio").replace(/['"]/g, ''),
      provincia: mapProvinciaToCode(params.cliente.provincia),
      condicion_pago: "210", // Contado
      envia_por_mail: "N",
    },
    comprobante: {
      tipo: params.tipoFactura,
      operacion: "V",
      punto_venta: creds.pdv,
      moneda: "PES",
      cotizacion: 1,
      idioma: 1,
      fecha: formatFechaTusFacturas(fechaEmision),
      vencimiento: formatFechaTusFacturas(fechaVto),
      detalle: params.items.map((item) => ({
        cantidad: item.cantidad,
        afecta_stock: "N",
        leyenda: "",
        producto: {
          descripcion: item.descripcion.replace(/['"]/g, ''),
          alicuota: item.alicuota,
          precio_unitario_sin_iva: round2(item.precioUnitarioSinIva),
          unidad_medida: 7,
          unidad_bulto: 1,
          lista_precios: "MASOIL",
          actualiza_precio: "N",
          rg5329: "N",
        },
      })),
      total: round2(totalCalculado),
      tributos: [] as unknown[],
      ...(params.observaciones ? { observaciones: params.observaciones.replace(/['"]/g, '') } : {}),
      ...(params.comprobanteAsociado
        ? {
            comprobantes_asociados: [
              {
                tipo_comprobante: params.comprobanteAsociado.tipo,
                punto_venta: String(params.comprobanteAsociado.puntoVenta),
                numero: Number(params.comprobanteAsociado.numero),
                ...(params.comprobanteAsociado.fecha
                  ? { comprobante_fecha: params.comprobanteAsociado.fecha }
                  : {}),
                ...(params.comprobanteAsociado.cuit
                  ? { cuit: Number(limpiarCuit(params.comprobanteAsociado.cuit)) }
                  : {}),
              },
            ],
          }
        : {}),
    },
  }
}
