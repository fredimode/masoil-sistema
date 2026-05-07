/**
 * Importa descuentos por (producto, proveedor) desde "Detalle de Compras
 * por Producto" del sistema viejo.
 *
 * Layout del archivo (verificado, no respeta los headers de fila 6):
 *   - 1456 grupos de producto, cada uno con su header repetido
 *   - Por grupo:
 *       fila header "Artículo | Proveedor | Comprobante | Fecha | ..."
 *       fila vacía
 *       primera compra: col 0 = "<num_proveedor> <descripción> (<CODIGO>)"
 *           donde <CODIGO> entre paréntesis al final es el del catálogo
 *           Masoil (formato letras+digitos, ej: BC0023, CA0076).
 *           El número al inicio (14821, 104) es código del proveedor / antiguo
 *           y NO matchea con products.code.
 *       siguientes compras del mismo producto: col 0 vacía
 *       fila de totales al final (solo col 4 cant + col 8 monto)
 *   - Cols de DATOS reales:
 *       0  = código + descripción (solo 1ª fila del grupo)
 *       7  = proveedor (texto)
 *       8  = comprobante (ej "FC 0004-00062382-A")
 *       9  = fecha
 *       11 = costo unitario
 *       12 = bonif % (negativo, "-45" para 45% descuento). Puede ser null.
 *       13 = costo bonif
 *       14 = costo tot
 *
 * Por cada par (producto, proveedor) se queda con el descuento de la compra
 * MÁS RECIENTE (max fecha). Idempotente: si el par ya existe, actualiza solo
 * descuento_porcentaje (preserva precio_proveedor, codigo_proveedor, etc.).
 *
 * Uso:
 *   npx tsx scripts/import-descuentos-proveedor.ts --file <path>
 *   npx tsx scripts/import-descuentos-proveedor.ts --file <path> --apply
 *
 * Sin --apply corre en dry-run (no toca DB).
 * Requiere SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env.local.
 */
import * as XLSX from "xlsx"
import * as path from "path"
import * as dotenv from "dotenv"
import { createClient } from "@supabase/supabase-js"

dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ─── CLI args ────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2)
  let file: string | null = null
  let apply = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file") {
      file = args[i + 1] || null
      i++
    } else if (args[i] === "--apply") {
      apply = true
    } else if (args[i] === "--help" || args[i] === "-h") {
      console.log("Uso: npx tsx scripts/import-descuentos-proveedor.ts --file <path.xlsx> [--apply]")
      process.exit(0)
    }
  }
  return { file, apply }
}

const { file: FILE, apply: APPLY } = parseArgs()
if (!FILE) {
  console.error("Falta argumento --file <path.xlsx>")
  process.exit(1)
}

const MODE = APPLY ? "APPLY (escribe en DB)" : "DRY-RUN (no toca DB)"

// ─── Constantes de layout ────────────────────────────────────────────────────

const COL_PRODUCT = 0
const COL_PROVEEDOR = 7
const COL_COMPROBANTE = 8
const COL_FECHA = 9
const COL_COSTO = 11
const COL_BONIF = 12
const COL_COSTO_BONIF = 13
const COL_COSTO_TOT = 14

// Columnas de la fila de totales (las únicas con valor)
const COL_TOTAL_CANT = 4
const COL_TOTAL_MONTO = 8

// ─── Parsers ─────────────────────────────────────────────────────────────────

function isHeaderRow(row: any[]): boolean {
  const c0 = String(row[0] ?? "").trim()
  return c0.startsWith("Artículo") || c0.startsWith("Articulo")
}

function isTotalsRow(row: any[]): boolean {
  // Fila de totales: solo COL_TOTAL_CANT (4) y COL_TOTAL_MONTO (8) tienen
  // valor, y NO hay proveedor en col 7 ni fecha en col 9.
  const hasCant = row[COL_TOTAL_CANT] != null && String(row[COL_TOTAL_CANT]).trim() !== ""
  const hasMonto = row[COL_TOTAL_MONTO] != null && String(row[COL_TOTAL_MONTO]).trim() !== ""
  const hasProveedor = row[COL_PROVEEDOR] != null && String(row[COL_PROVEEDOR]).trim() !== ""
  const hasFecha = row[COL_FECHA] != null && String(row[COL_FECHA]).trim() !== ""
  return hasCant && hasMonto && !hasProveedor && !hasFecha
}

function isEmptyRow(row: any[]): boolean {
  return !row || row.every((c) => c == null || String(c).trim() === "")
}

function parseCodeFromCol0(text: string): string | null {
  if (!text) return null
  // El código real del catálogo está entre paréntesis AL FINAL de la
  // descripción, formato (LETRAS+DIGITOS) — ej: (BC0023), (CD0110), (CA0076).
  // El "número al inicio" (14821, 104, 01/00074/00) es código del proveedor o
  // código antiguo y NO matchea con products.code. Verificado: 1452/1456
  // grupos (99.7%) tienen el código en este formato.
  // Si está en ambos lados (inicio y final), gana el del final.
  const match = text.trim().match(/\(([A-Z0-9]+)\)\s*$/i)
  return match ? match[1].toUpperCase() : null
}

function parseFecha(v: any): string | null {
  if (v == null) return null
  // XLSX a veces da el datetime como string, otras como Date, otras como number.
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  if (!s) return null
  // "2025-06-12 00:00:00" o "2025-06-12"
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
  // "12/06/2025"
  const ddmm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (ddmm) {
    const dd = ddmm[1].padStart(2, "0")
    const mm = ddmm[2].padStart(2, "0")
    let yy = ddmm[3]
    if (yy.length === 2) yy = Number(yy) >= 50 ? `19${yy}` : `20${yy}`
    return `${yy}-${mm}-${dd}`
  }
  return null
}

function parseBonif(v: any): number {
  if (v == null) return 0
  const s = String(v).replace(/,/g, ".").trim()
  if (!s) return 0
  const n = parseFloat(s)
  if (!Number.isFinite(n)) return 0
  // Bonif viene negativo (-45 = 45% descuento). Tomamos el valor absoluto.
  // Si por error vino positivo, también lo aceptamos.
  return Math.abs(n)
}

function normalizeProveedorName(s: string): string {
  return s
    .toUpperCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")  // sin acentos
    // Sufijos de razón social
    .replace(/\b(S\.?A\.?S\.?|S\.?A\.?|S\.?R\.?L\.?|S\.?H\.?|LTDA\.?|LTD\.?)\b\.?/g, "")
    .replace(/[^A-Z0-9]/g, " ")  // colapsar puntuación
    .replace(/\s+/g, " ")
    .trim()
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== IMPORT DESCUENTOS PROVEEDOR (${MODE}) ===`)
  console.log(`Archivo: ${FILE}`)

  // 1) Cargar workbook
  const wb = XLSX.readFile(FILE!)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null, raw: false })
  console.log(`  Filas crudas: ${rows.length}`)

  // 2) Recorrer filas detectando grupos y compras
  interface Compra {
    code: string
    productLabel: string
    proveedor: string
    fecha: string | null
    bonif: number  // 0..100
    rowIdx: number
  }
  const compras: Compra[] = []
  let currentCode: string | null = null
  let currentLabel: string = ""
  let groupCount = 0
  let totalsSkipped = 0
  let emptySkipped = 0
  let headerCount = 0
  let unparsedCol0 = 0  // filas con texto en col 0 pero sin código identificable

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || []
    if (isEmptyRow(row)) { emptySkipped++; continue }
    if (isHeaderRow(row)) {
      headerCount++
      // Nuevo grupo: reset del producto actual
      currentCode = null
      currentLabel = ""
      continue
    }
    if (isTotalsRow(row)) { totalsSkipped++; continue }

    // ¿Esta fila introduce el producto del grupo?
    const col0Text = row[COL_PRODUCT] != null ? String(row[COL_PRODUCT]).trim() : ""
    if (col0Text) {
      const code = parseCodeFromCol0(col0Text)
      if (code) {
        currentCode = code
        currentLabel = col0Text
        groupCount++
      } else {
        unparsedCol0++
      }
    }

    // ¿Es fila de compra? (tiene proveedor)
    const proveedorRaw = row[COL_PROVEEDOR] != null ? String(row[COL_PROVEEDOR]).trim() : ""
    if (!proveedorRaw) continue
    if (!currentCode) {
      // Compra sin grupo identificado (col 0 era texto pero no código). Skip.
      continue
    }

    compras.push({
      code: currentCode,
      productLabel: currentLabel,
      proveedor: proveedorRaw,
      fecha: parseFecha(row[COL_FECHA]),
      bonif: parseBonif(row[COL_BONIF]),
      rowIdx: i + 1,  // 1-indexed para mensajes
    })
  }

  console.log(`\n=== PARSING ===`)
  console.log(`  Headers de grupo: ${headerCount}`)
  console.log(`  Productos identificados: ${groupCount}`)
  console.log(`  Compras parseadas: ${compras.length}`)
  console.log(`  Filas vacías skip: ${emptySkipped}`)
  console.log(`  Filas de totales skip: ${totalsSkipped}`)
  if (unparsedCol0 > 0) {
    console.log(`  Col 0 con texto pero sin código identificable: ${unparsedCol0}`)
  }

  // 3) Cargar productos y proveedores
  console.log(`\n=== CARGA DB ===`)
  const { data: allProducts, error: pErr } = await supabase
    .from("products")
    .select("id, code, name")
    .limit(100000)
  if (pErr) throw pErr
  const productByCode = new Map<string, { id: string; code: string; name: string }>()
  for (const p of allProducts || []) {
    if (p.code) productByCode.set(String(p.code).trim().toUpperCase(), { id: p.id, code: p.code, name: p.name })
  }
  console.log(`  Productos en DB: ${allProducts?.length || 0}`)

  // 3b) Gate de match rate: si <80% de los códigos únicos parseados matchean
  // contra products.code, abortamos con error claro. Esto protege contra
  // ejecuciones accidentales con regex de parseo equivocada.
  const uniqueCodes = new Set(compras.map((c) => c.code.trim().toUpperCase()))
  const matchedCodes = [...uniqueCodes].filter((code) => productByCode.has(code))
  const matchRate = uniqueCodes.size > 0 ? matchedCodes.length / uniqueCodes.size : 0
  console.log(`\n=== VALIDACIÓN MATCH RATE ===`)
  console.log(`  Códigos únicos parseados: ${uniqueCodes.size}`)
  console.log(`  Matchean con products.code: ${matchedCodes.length}`)
  console.log(`  Match rate: ${(matchRate * 100).toFixed(1)}%`)
  if (matchRate < 0.80) {
    console.error(`\n❌ ABORTANDO: match rate ${(matchRate * 100).toFixed(1)}% < 80% mínimo.`)
    console.error(`   Esto sugiere que el regex de parseo de códigos está leyendo mal el archivo`)
    console.error(`   o el archivo no corresponde al catálogo Masoil. Revisar y reintentar.`)
    const noMatch = [...uniqueCodes].filter((c) => !productByCode.has(c)).slice(0, 30)
    console.error(`\n   Primeros 30 códigos parseados que NO matchean:`)
    for (const c of noMatch) console.error(`     ${c}`)
    process.exit(1)
  }
  console.log(`  ✓ Match rate suficiente, sigo con el resto.`)

  const { data: allProvs, error: prErr } = await supabase
    .from("proveedores")
    .select("id, nombre, razon_social")
    .limit(100000)
  if (prErr) throw prErr
  const provByName = new Map<string, { id: string; nombre: string }>()
  for (const p of allProvs || []) {
    if (p.nombre) provByName.set(normalizeProveedorName(p.nombre), { id: p.id, nombre: p.nombre })
    if (p.razon_social) {
      const k = normalizeProveedorName(p.razon_social)
      if (!provByName.has(k)) provByName.set(k, { id: p.id, nombre: p.nombre })
    }
  }
  console.log(`  Proveedores en DB: ${allProvs?.length || 0}`)

  // 4) Match + dedupe por par, quedándonos con la fecha más reciente
  interface ParRow {
    product_id: string
    proveedor_id: string
    descuento: number
    fecha: string | null
    productCode: string
    proveedorNombre: string
    count: number
  }
  const byPair = new Map<string, ParRow>()
  let skippedNoProduct = 0
  let skippedNoProveedor = 0
  const missingProducts = new Map<string, number>()
  const missingProveedores = new Map<string, number>()

  for (const c of compras) {
    const prod = productByCode.get(c.code.trim().toUpperCase())
    if (!prod) {
      skippedNoProduct++
      missingProducts.set(c.code, (missingProducts.get(c.code) || 0) + 1)
      continue
    }
    const provKey = normalizeProveedorName(c.proveedor)
    const prov = provByName.get(provKey)
    if (!prov) {
      skippedNoProveedor++
      missingProveedores.set(c.proveedor, (missingProveedores.get(c.proveedor) || 0) + 1)
      continue
    }
    const key = `${prod.id}::${prov.id}`
    const existing = byPair.get(key)
    if (!existing) {
      byPair.set(key, {
        product_id: prod.id,
        proveedor_id: prov.id,
        descuento: c.bonif,
        fecha: c.fecha,
        productCode: prod.code,
        proveedorNombre: prov.nombre,
        count: 1,
      })
    } else {
      existing.count++
      if (c.fecha && (!existing.fecha || c.fecha > existing.fecha)) {
        existing.descuento = c.bonif
        existing.fecha = c.fecha
      }
    }
  }

  console.log(`\n=== MATCHING ===`)
  console.log(`  Pares (producto × proveedor) únicos: ${byPair.size}`)
  const conDescuento = [...byPair.values()].filter((p) => p.descuento > 0).length
  console.log(`    con descuento > 0: ${conDescuento}`)
  console.log(`    sin descuento (0%): ${byPair.size - conDescuento}`)
  console.log(`  Compras skip — producto no encontrado: ${skippedNoProduct} (${missingProducts.size} códigos distintos)`)
  console.log(`  Compras skip — proveedor no encontrado: ${skippedNoProveedor} (${missingProveedores.size} nombres distintos)`)

  if (missingProducts.size > 0) {
    const top = [...missingProducts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
    console.log(`\n  Top 20 productos no matcheados (código × ocurrencias):`)
    for (const [code, n] of top) console.log(`    ${code.padEnd(20)} ${n}`)
  }
  if (missingProveedores.size > 0) {
    const top = [...missingProveedores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)
    console.log(`\n  Top 20 proveedores no matcheados (nombre × ocurrencias):`)
    for (const [nombre, n] of top) console.log(`    ${nombre.padEnd(40)} ${n}`)
  }

  // 5) Upsert (solo si --apply)
  console.log(`\n=== UPSERT ===`)
  if (!APPLY) {
    console.log(`  DRY-RUN: no se escribe en DB.`)
    console.log(`  Pares listos para upsert si re-corrés con --apply: ${byPair.size}`)
    // Muestra de los primeros 10 pares con descuento > 0
    const sample = [...byPair.values()].filter((p) => p.descuento > 0).slice(0, 10)
    if (sample.length > 0) {
      console.log(`\n  Muestra de pares con descuento (primeros 10):`)
      for (const p of sample) {
        console.log(`    ${p.productCode.padEnd(15)} × ${p.proveedorNombre.padEnd(35)} → ${p.descuento}% (fecha: ${p.fecha || "-"}, ${p.count} compras)`)
      }
    }
    return
  }

  // Upsert. NO usamos onConflict.update con ignoreDuplicates: false porque
  // queremos preservar columnas no incluidas (precio_proveedor, codigo_proveedor).
  // Estrategia: para cada par hacer un UPDATE puntual del descuento. Si la fila
  // no existe, hacemos INSERT con valores mínimos.
  let updated = 0
  let inserted = 0
  let errors = 0
  let processed = 0
  const total = byPair.size

  for (const p of byPair.values()) {
    processed++
    // ¿Existe el par?
    const { data: existing, error: selErr } = await supabase
      .from("producto_proveedor")
      .select("id")
      .eq("product_id", p.product_id)
      .eq("proveedor_id", p.proveedor_id)
      .maybeSingle()
    if (selErr) {
      console.error(`  Error select ${p.productCode}/${p.proveedorNombre}:`, selErr.message)
      errors++
      continue
    }
    if (existing) {
      const { error: upErr } = await supabase
        .from("producto_proveedor")
        .update({ descuento_porcentaje: p.descuento })
        .eq("id", existing.id)
      if (upErr) {
        console.error(`  Error update ${p.productCode}/${p.proveedorNombre}:`, upErr.message)
        errors++
      } else {
        updated++
      }
    } else {
      const { error: insErr } = await supabase
        .from("producto_proveedor")
        .insert({
          product_id: p.product_id,
          proveedor_id: p.proveedor_id,
          descuento_porcentaje: p.descuento,
          ultimo_precio_fecha: p.fecha,
        })
      if (insErr) {
        console.error(`  Error insert ${p.productCode}/${p.proveedorNombre}:`, insErr.message)
        errors++
      } else {
        inserted++
      }
    }
    if (processed % 100 === 0 || processed === total) {
      process.stdout.write(`\r  ${processed}/${total} (ins: ${inserted}, upd: ${updated}, err: ${errors})`)
    }
  }
  console.log("")

  console.log(`\n=== RESULTADO ===`)
  console.log(`  Compras leídas:           ${compras.length}`)
  console.log(`  Pares procesados:         ${byPair.size}`)
  console.log(`  Insertados:               ${inserted}`)
  console.log(`  Actualizados:             ${updated}`)
  console.log(`  Errores:                  ${errors}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
