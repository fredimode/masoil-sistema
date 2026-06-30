// ============================================================================
// Descuento general por cliente — núcleo de cálculo (fuente única)
// ----------------------------------------------------------------------------
// Las 4 pantallas de armado (admin/vendedor × pedidos/cotizaciones) deben usar
// ESTE helper para el descuento general, en vez de duplicar la lógica.
//
// Reglas (confirmadas con Fredi):
//  - El descuento general es un PORCENTAJE que se aplica sobre el neto (sin IVA)
//    de los PRODUCTOS solamente.
//  - NO se descuenta sobre líneas que ya son descuento (tipo_linea="descuento")
//    ni sobre aportes negativos (p. ej. una línea libre negativa, que de hecho
//    actúa como descuento). Es decir: la base nunca incluye renglones que restan.
//  - Si el operador editó el precio de un producto a mano, el % se aplica sobre
//    ese precio editado (porque la base se arma con el `price` actual de la línea).
//  - El monto del renglón es NEGATIVO (resta del total), igual que los demás
//    descuentos del sistema, así la facturación lo hereda sin cambios.
//  - Redondeo a 2 decimales con `Math.round(x*100)/100`, idéntico al resto del
//    sistema (subtotal/IVA/total).
// ============================================================================

export const IVA_RATE = 0.21

// Código sentinela del renglón de descuento general. Permite a las pantallas
// identificar/regenerar ese renglón sin confundirlo con un descuento manual.
export const CODIGO_DESCUENTO_GENERAL = "DESCUENTO_GENERAL"

export type TipoLinea = "producto" | "libre" | "descuento"

// Forma mínima de una línea que el helper necesita para calcular. Cada pantalla
// mapea su propio item (OrderItem / CotItem) a esto: precio unitario NETO
// (sin IVA) y cantidad.
export interface LineaCalculo {
  price: number
  quantity: number
  tipoLinea?: TipoLinea | null
}

/** Redondeo a 2 decimales, consistente con todo el sistema. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Convierte un precio NETO (sin IVA) a precio CON IVA, redondeado a 2 decimales.
 * Fuente ÚNICA del factor ×1.21 que las pantallas de armado aplican al persistir
 * `orders.unit_price` (convención del sistema: unit_price se guarda CON IVA y la
 * facturación lo divide por 1.21 al emitir). Usar SIEMPRE este helper —nunca el
 * ×1.21 inline— para que pedidos directos y pedidos convertidos desde cotización
 * guarden el precio con la misma base. (La conversión copiaba el neto sin ×1.21,
 * lo que sub-facturaba ~17,4% al dividir por 1.21 en la emisión.)
 */
export function netoAConIva(neto: number): number {
  return round2((Number(neto) || 0) * (1 + IVA_RATE))
}

/**
 * Base sobre la que se aplica el descuento general: neto (sin IVA) de los
 * productos. Excluye los renglones de descuento y cualquier aporte negativo
 * (línea libre negativa), de modo que el descuento general nunca se calcule
 * sobre otros descuentos.
 */
export function baseProductos(items: LineaCalculo[]): number {
  const base = items.reduce((sum, it) => {
    if ((it.tipoLinea ?? "producto") === "descuento") return sum
    const sub = it.price * it.quantity
    return sub > 0 ? sum + sub : sum
  }, 0)
  return round2(base)
}

/**
 * Monto del renglón de descuento general. NEGATIVO (resta del total).
 * Devuelve 0 si el porcentaje es <= 0 o si no hay base de productos positiva.
 * `pct` es el porcentaje (5 = 5 %).
 */
export function montoDescuentoGeneral(items: LineaCalculo[], pct: number): number {
  const p = Number(pct) || 0
  if (p <= 0) return 0
  const base = baseProductos(items)
  if (base <= 0) return 0
  return -round2(base * (p / 100))
}

/** Descriptor del renglón de descuento general, agnóstico de la pantalla. */
export interface LineaDescuentoGeneral {
  descripcion: string
  productCode: string
  quantity: 1
  price: number // monto negativo
  tipoLinea: "descuento"
}

/**
 * Construye el renglón de descuento general a partir de las líneas actuales y
 * el porcentaje. Devuelve `null` cuando no corresponde renglón (pct<=0 o sin
 * base). Cada pantalla mapea este descriptor a su propio shape de item.
 *
 * IMPORTANTE: `items` NO debe incluir un renglón de descuento general previo
 * (las pantallas lo manejan como derivado: lo quitan y lo regeneran). Sí puede
 * incluir descuentos manuales y líneas libres: la base los ignora igual.
 */
export function construirLineaDescuentoGeneral(
  items: LineaCalculo[],
  pct: number,
): LineaDescuentoGeneral | null {
  const monto = montoDescuentoGeneral(items, pct)
  if (monto === 0) return null
  return {
    descripcion: `Descuento general (${formatPct(pct)}%)`,
    productCode: CODIGO_DESCUENTO_GENERAL,
    quantity: 1,
    price: monto,
    tipoLinea: "descuento",
  }
}

export interface Totales {
  subtotalProductos: number // neto de productos (base del descuento general)
  descuentoGeneral: number // <= 0
  subtotalSinIva: number // Σ de todas las líneas + descuento general
  iva: number
  total: number
}

/**
 * Totales completos del documento: subtotal de productos → descuento general →
 * subtotal final (sin IVA) → IVA (21 %) → total.
 *
 * `items` son TODAS las líneas reales del documento (productos, libres y
 * descuentos manuales) SIN el renglón de descuento general (se calcula acá a
 * partir de `pct` para no contarlo dos veces). El subtotal sin IVA suma todas
 * las líneas tal cual (los descuentos manuales y libres negativos ya restan) y
 * luego aplica el descuento general.
 */
export function calcularTotales(items: LineaCalculo[], pct = 0): Totales {
  const subtotalProductos = baseProductos(items)
  const descuentoGeneral = montoDescuentoGeneral(items, pct)
  const subtotalLineas = items.reduce((s, it) => s + it.price * it.quantity, 0)
  const subtotalSinIva = round2(subtotalLineas + descuentoGeneral)
  const iva = round2(subtotalSinIva * IVA_RATE)
  const total = round2(subtotalSinIva + iva)
  return { subtotalProductos, descuentoGeneral, subtotalSinIva, iva, total }
}

/** Formatea el porcentaje sin ceros de más (5 → "5", 5.5 → "5.5"). */
function formatPct(pct: number): string {
  const p = Number(pct) || 0
  return String(round2(p))
}
