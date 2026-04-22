/**
 * Importa "INFORME COBRANZAS PENDIENTES (Semanal).xlsx" a cobranzas_pendientes.
 *
 * Estructura del Excel:
 *   fila "Cliente: NOMBRE (código) Domicilio: ..."
 *   fila header "| FECHA | COMPROBANTE | | | $TOTAL | $Saldo | | $Saldo acum."
 *   filas de datos: | fecha | tipo (FC/NC/ND) | PV | NRO | - | letra | total | saldo | saldo_acum
 *   fila resumen: "Tel: ... Contacto: ... COND.PAGO: ... CUIT ..."
 *
 * Uso: npx tsx scripts/import-cobranzas-pendientes.ts [--dry-run]
 */
import * as XLSX from "xlsx"
import { createClient } from "@supabase/supabase-js"
import * as path from "path"
import * as dotenv from "dotenv"

dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !KEY) {
  console.error("Faltan credenciales en .env.local")
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, KEY)
const DRY_RUN = process.argv.includes("--dry-run")

function parseMoney(v: any): number {
  if (v === null || v === undefined || v === "") return 0
  let s = String(v).trim()
  const isNeg = s.startsWith("-")
  if (isNeg) s = s.slice(1)
  const lastDot = s.lastIndexOf(".")
  const lastCom = s.lastIndexOf(",")
  const decIdx = Math.max(lastDot, lastCom)
  let intPart = s
  let decPart = ""
  if (decIdx >= 0) {
    intPart = s.slice(0, decIdx)
    decPart = s.slice(decIdx + 1)
  }
  const intClean = intPart.replace(/[.,\s]/g, "")
  const decClean = decPart.replace(/\D/g, "")
  const num = Number(intClean + (decClean ? "." + decClean : ""))
  if (!Number.isFinite(num)) return 0
  return isNeg ? -num : num
}

function parseDate(v: any): string | null {
  if (!v) return null
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    let [_, d, mo, y] = m
    if (y.length === 2) y = Number(y) < 50 ? `20${y}` : `19${y}`
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
  }
  return null
}

// "Cliente: A RUSSONIELLO S A (3,400) Domicilio: ..."
function parseClienteRow(s: string): { nombre: string; codigo: string | null; razon_social: string | null } {
  const mCodigo = s.match(/Cliente:\s*(.+?)\s*\(([\d,]+)\)/i)
  if (mCodigo) {
    return {
      nombre: mCodigo[1].trim(),
      codigo: mCodigo[2].replace(/,/g, "").trim(),
      razon_social: null,
    }
  }
  const mNombre = s.match(/Cliente:\s*(.+?)\s*Domicilio:/i)
  if (mNombre) return { nombre: mNombre[1].trim(), codigo: null, razon_social: null }
  return { nombre: "", codigo: null, razon_social: null }
}

async function main() {
  const filepath = path.join(__dirname, "data", "INFORME COBRANZAS PENDIENTES (Semanal).xlsx")
  console.log(`Leyendo ${filepath}`)
  const wb = XLSX.readFile(filepath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: false })

  const { data: clients, error: errC } = await supabase
    .from("clients")
    .select("id, business_name, codigo_gestionpro")
  if (errC) throw errC
  const byCodigo = new Map<string, any>()
  const byName = new Map<string, any>()
  for (const c of clients || []) {
    if (c.codigo_gestionpro) byCodigo.set(String(c.codigo_gestionpro).trim(), c)
    if (c.business_name) byName.set(c.business_name.toLowerCase().trim(), c)
  }

  let razonSocialActual: string | null = null
  let clienteNombreActual: string | null = null
  let clienteCodigoActual: string | null = null
  let clientIdActual: string | null = null

  const toInsert: any[] = []
  const noEncontrados = new Set<string>()
  let skipped = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || []
    const col0 = row[0] ? String(row[0]).trim() : ""

    // Razón social de la empresa emisora
    if (col0 && /^(AQUILES|MASOIL|CONANCAP)/i.test(col0)) {
      razonSocialActual = col0
      continue
    }

    // Cambio de cliente
    if (col0.startsWith("Cliente:")) {
      const { nombre, codigo } = parseClienteRow(col0)
      clienteNombreActual = nombre
      clienteCodigoActual = codigo
      let matched: any = null
      if (codigo && byCodigo.has(codigo)) matched = byCodigo.get(codigo)
      else if (byName.has(nombre.toLowerCase())) matched = byName.get(nombre.toLowerCase())
      clientIdActual = matched?.id || null
      if (!matched) noEncontrados.add(`${codigo || "-"} | ${nombre}`)
      continue
    }

    // Ignorar headers y filas vacías
    if (!row[1] || String(row[1]).trim() === "FECHA") continue

    const fecha = parseDate(row[1])
    if (!fecha) continue

    const tipo = row[2] ? String(row[2]).trim() : null
    const pv = row[3] ? String(row[3]).trim() : null
    const nro = row[4] ? String(row[4]).trim() : null
    const letra = row[6] ? String(row[6]).trim() : null
    const total = parseMoney(row[7])
    const saldo = parseMoney(row[8])
    const saldoAcum = parseMoney(row[9])

    if (!clientIdActual) {
      skipped++
      continue
    }

    const comprobante = [tipo, pv && nro ? `${pv}-${nro}` : null, letra].filter(Boolean).join(" ")

    toInsert.push({
      client_id: clientIdActual,
      cliente_nombre: clienteNombreActual,
      comprobante,
      fecha_comprobante: fecha,
      total,
      saldo,
      saldo_acumulado: saldoAcum,
      razon_social: razonSocialActual,
    })
  }

  console.log(`Filas a insertar: ${toInsert.length}`)
  console.log(`Filas sin cliente match: ${skipped}`)
  console.log(`Clientes no encontrados: ${noEncontrados.size}`)
  if (noEncontrados.size > 0 && noEncontrados.size < 30) {
    for (const n of noEncontrados) console.log("  -", n)
  }

  if (DRY_RUN) {
    console.log("DRY RUN — no se inserta nada.")
    console.log("Primeras 3 filas:", JSON.stringify(toInsert.slice(0, 3), null, 2))
    return
  }

  // Reemplazar data previa importada de GestionPro (filtramos por razon_social LIKE)
  await supabase.from("cobranzas_pendientes").delete().not("razon_social", "is", null)

  const CHUNK = 500
  let ok = 0
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK)
    const { error } = await supabase.from("cobranzas_pendientes").insert(chunk)
    if (error) {
      console.error(`Error chunk ${i}:`, error.message)
      continue
    }
    ok += chunk.length
    process.stdout.write(`\rInsertadas ${ok}/${toInsert.length}`)
  }
  process.stdout.write("\n")
  console.log("Listo.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
