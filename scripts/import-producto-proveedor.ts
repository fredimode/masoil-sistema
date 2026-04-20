/**
 * Importa scripts/data/Detalle de Compras por Producto.xlsx al tabla producto_proveedor.
 *
 * Lógica:
 *  - Parsea el XLSX como grilla cruda (el layout tiene headers repetidos y cols offset)
 *  - Por cada compra encontrada: extrae código de producto (entre paréntesis al final),
 *    nombre de proveedor, fecha y costo bonificado
 *  - Matchea producto por code con products.code y proveedor por nombre con proveedores.nombre
 *  - Por cada par (product_id, proveedor_id) se queda con la compra más reciente
 *  - Upsert en producto_proveedor (no borra existentes)
 *
 * Uso: npx tsx scripts/import-producto-proveedor.ts
 * Requiere SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY en .env.local
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

const FILE = path.resolve(__dirname, "data", "Detalle de Compras por Producto.xlsx")

// Posición de columnas en data rows (según inspección):
const COL_PRODUCT = 0
const COL_PROVEEDOR = 7
const COL_COMPROBANTE = 8
const COL_FECHA = 9
const COL_COSTO_BONIF = 13

function parseCodeFromProduct(text: string): string | null {
  if (!text) return null
  // Formato "NOMBRE (CODE)" con posible espacio/trim al final
  const m = text.trim().match(/\(([^()]+)\)\s*$/)
  return m ? m[1].trim() : null
}

function parseDateDDMMYY(s: string | null | undefined): string | null {
  if (!s) return null
  const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (!m) return null
  const dd = m[1].padStart(2, "0")
  const mm = m[2].padStart(2, "0")
  let yy = m[3]
  if (yy.length === 2) yy = Number(yy) >= 50 ? `19${yy}` : `20${yy}`
  return `${yy}-${mm}-${dd}`
}

function parseNumber(s: any): number | null {
  if (s == null) return null
  const clean = String(s).replace(/,/g, "").replace(/\s/g, "").trim()
  if (!clean) return null
  const n = Number(clean)
  return isNaN(n) ? null : n
}

function normalizeNombre(s: string): string {
  return s.trim().replace(/\s+/g, " ").toUpperCase()
}

function isHeaderRow(row: any[]): boolean {
  const c0 = (row[0] || "").toString().trim()
  return c0.startsWith("Artículo") || c0.startsWith("Articulo") || c0.startsWith("AQUILES EQUIPAMIENTOS") || c0.startsWith("Página")
}

async function main() {
  console.log("Leyendo", FILE)
  const wb = XLSX.readFile(FILE)
  const sh = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<any[]>(sh, { header: 1, defval: null, raw: false })
  console.log(`  ${rows.length} filas crudas`)

  // --- 1) Parsear compras ---
  interface Compra {
    code: string
    productName: string
    proveedor: string
    fecha: string | null
    costo: number | null
    comprobante: string | null
  }
  const compras: Compra[] = []
  let currentCode: string | null = null
  let currentName: string | null = null

  for (const row of rows) {
    if (!row || row.every((c) => c == null)) continue
    if (isHeaderRow(row)) continue

    const col0 = row[COL_PRODUCT] ? String(row[COL_PRODUCT]).trim() : ""
    const proveedor = row[COL_PROVEEDOR] ? String(row[COL_PROVEEDOR]).trim() : ""
    const comprobante = row[COL_COMPROBANTE] ? String(row[COL_COMPROBANTE]).trim() : ""
    const fecha = parseDateDDMMYY(row[COL_FECHA])
    const costo = parseNumber(row[COL_COSTO_BONIF])

    // ¿Nueva fila de producto? (col0 tiene nombre+código)
    if (col0) {
      const code = parseCodeFromProduct(col0)
      if (code) {
        currentCode = code
        currentName = col0
      }
    }

    // ¿Fila de compra? (tiene proveedor)
    if (proveedor && currentCode) {
      compras.push({
        code: currentCode,
        productName: currentName || "",
        proveedor,
        fecha,
        costo,
        comprobante: comprobante || null,
      })
    }
  }
  console.log(`Compras parseadas: ${compras.length}`)
  if (compras.length === 0) {
    console.error("No se parsearon compras. Revisar layout del archivo.")
    process.exit(1)
  }

  // --- 2) Cargar products y proveedores ---
  console.log("Cargando products...")
  const { data: allProducts, error: pErr } = await supabase.from("products").select("id, code, name").limit(100000)
  if (pErr) throw pErr
  const productByCode = new Map<string, { id: string; code: string; name: string }>()
  for (const p of allProducts || []) {
    if (p.code) productByCode.set(String(p.code).trim().toUpperCase(), { id: p.id, code: p.code, name: p.name })
  }
  console.log(`  ${allProducts?.length || 0} productos en DB`)

  console.log("Cargando proveedores...")
  const { data: allProvs, error: prErr } = await supabase.from("proveedores").select("id, nombre, razon_social").limit(100000)
  if (prErr) throw prErr
  const provByName = new Map<string, { id: string; nombre: string }>()
  for (const p of allProvs || []) {
    if (p.nombre) provByName.set(normalizeNombre(p.nombre), { id: p.id, nombre: p.nombre })
    if (p.razon_social) provByName.set(normalizeNombre(p.razon_social), { id: p.id, nombre: p.nombre })
  }
  console.log(`  ${allProvs?.length || 0} proveedores en DB`)

  // --- 3) Agrupar por (product_id, proveedor_id) y quedarnos con la compra más reciente ---
  const byPair = new Map<string, { product_id: string; proveedor_id: string; precio: number | null; fecha: string | null; comprobante: string | null; count: number }>()
  let skippedNoProduct = 0
  let skippedNoProveedor = 0
  let skippedNoPrice = 0
  const missingProducts = new Set<string>()
  const missingProveedores = new Set<string>()

  for (const c of compras) {
    const prod = productByCode.get(c.code.trim().toUpperCase())
    if (!prod) {
      skippedNoProduct++
      missingProducts.add(c.code)
      continue
    }
    const prov = provByName.get(normalizeNombre(c.proveedor))
    if (!prov) {
      skippedNoProveedor++
      missingProveedores.add(c.proveedor)
      continue
    }
    if (c.costo == null) {
      skippedNoPrice++
      continue
    }
    const key = `${prod.id}::${prov.id}`
    const existing = byPair.get(key)
    if (!existing) {
      byPair.set(key, {
        product_id: prod.id,
        proveedor_id: prov.id,
        precio: c.costo,
        fecha: c.fecha,
        comprobante: c.comprobante,
        count: 1,
      })
    } else {
      existing.count++
      // Quedarse con la compra más reciente (por fecha; null queda atrás)
      if (c.fecha && (!existing.fecha || c.fecha > existing.fecha)) {
        existing.precio = c.costo
        existing.fecha = c.fecha
        existing.comprobante = c.comprobante
      }
    }
  }

  console.log(`\n=== MATCHING ===`)
  console.log(`Pares únicos (product_id × proveedor_id): ${byPair.size}`)
  console.log(`Skipped por producto no encontrado: ${skippedNoProduct} (${missingProducts.size} códigos distintos)`)
  console.log(`Skipped por proveedor no encontrado: ${skippedNoProveedor} (${missingProveedores.size} nombres distintos)`)
  console.log(`Skipped sin precio: ${skippedNoPrice}`)

  if (missingProducts.size > 0) {
    console.log(`  Ejemplos productos no encontrados: ${[...missingProducts].slice(0, 10).join(", ")}`)
  }
  if (missingProveedores.size > 0) {
    console.log(`  Ejemplos proveedores no encontrados: ${[...missingProveedores].slice(0, 10).join(", ")}`)
  }

  // --- 4) Upsert en producto_proveedor ---
  console.log("\n=== UPSERT ===")
  const rowsToUpsert = [...byPair.values()].map((v) => ({
    product_id: v.product_id,
    proveedor_id: v.proveedor_id,
    precio_proveedor: v.precio,
    ultimo_precio_fecha: v.fecha,
    observaciones: v.comprobante ? `Último comprob.: ${v.comprobante}` : null,
  }))

  let inserted = 0
  let updated = 0
  let errors = 0
  const CHUNK = 500

  for (let i = 0; i < rowsToUpsert.length; i += CHUNK) {
    const chunk = rowsToUpsert.slice(i, i + CHUNK)
    const { data, error } = await supabase
      .from("producto_proveedor")
      .upsert(chunk, { onConflict: "product_id,proveedor_id", ignoreDuplicates: false })
      .select("id")
    if (error) {
      console.error(`  Error en chunk ${i}-${i + chunk.length}:`, error.message)
      errors += chunk.length
    } else {
      // Supabase upsert no distingue insert vs update directamente; contamos como procesadas
      inserted += data?.length || chunk.length
    }
    process.stdout.write(`\r  Procesadas ${Math.min(i + CHUNK, rowsToUpsert.length)}/${rowsToUpsert.length}`)
  }
  console.log("")

  console.log(`\n=== RESULTADO ===`)
  console.log(`Compras leídas:           ${compras.length}`)
  console.log(`Asociaciones a procesar:  ${rowsToUpsert.length}`)
  console.log(`Upsert exitoso:           ${inserted}`)
  console.log(`Errores:                  ${errors}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
