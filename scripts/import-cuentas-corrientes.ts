/**
 * Importar cuentas corrientes históricas desde "Cuentas Corrientes.xlsx"
 * (export del sistema GestionPro) a la tabla cuenta_corriente_cliente.
 *
 * Estructura del Excel:
 *   fila de razón social (p.ej. "AQUILES EQUIPAMIENTOS SRL")
 *   fila de cliente "NOMBRE (Cod.3400) - Tel: ... - LOCALIDAD ..."
 *   fila header "FECHA | COMPROBANTE | | DEBE | HABER | SALDO"
 *   filas de datos + filas vacías intercaladas
 *   carry-forward: empresa y cliente se aplican hasta que cambian
 *
 * Uso: npx tsx scripts/import-cuentas-corrientes.ts [--dry-run]
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

// ---------------------------------------------------------------------------

// Maneja formato US ("285,938.71") y AR ("285.938,71"). Usa la ÚLTIMA ocurrencia
// de . o , como separador decimal; cualquier otra ocurrencia es separador de miles.
function parseMoney(v: any): number {
  if (v === null || v === undefined || v === "") return 0
  let s = String(v).trim()
  const isNeg = s.startsWith("-")
  if (isNeg) s = s.slice(1)
  // Encontrar último . o ,
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
  // dd/mm/yy
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) {
    let [_, d, mo, y] = m
    if (y.length === 2) y = Number(y) < 50 ? `20${y}` : `19${y}`
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
  }
  return null
}

// Extrae código GestionPro de texto tipo "A RUSSONIELLO S A  (Cod.3400)  -  Tel.:..."
function parseClienteHeader(s: string): { nombre: string; codigo: string | null } {
  // El nombre puede contener paréntesis (marcas), así que buscamos el último "(Cod.NNNN)"
  const codMatch = s.match(/\(Cod\.(\d+)\)/i)
  const codigo = codMatch ? codMatch[1].trim() : null
  const nombre = codigo
    ? s.slice(0, s.indexOf(codMatch![0])).trim()
    : s.split("  -  ")[0].trim()
  return { nombre, codigo }
}

// Extrae tipo de comprobante + PV + número + letra
// Ej: "FC - 0002-00008343- A"  →  { tipo: "FC", pv: "0002", nro: "00008343", letra: "A" }
// Ej: "RETENCION"              →  { tipo: "RT" }
// Ej: "RC - 0001-10004472- X"  →  { tipo: "RC", pv: "0001", nro: "10004472", letra: "X" }
function parseComprobante(s: string): {
  tipo: string
  pv: string | null
  nro: string | null
  letra: string | null
} {
  if (!s) return { tipo: "OTRO", pv: null, nro: null, letra: null }
  const up = s.trim().toUpperCase()

  if (/^RETENCI[OÓ]N/.test(up)) return { tipo: "RT", pv: null, nro: null, letra: null }
  if (/^AJUSTE/.test(up)) return { tipo: "AJ", pv: null, nro: null, letra: null }
  if (/^FONDO/.test(up)) return { tipo: "FG", pv: null, nro: null, letra: null }

  // Formato: "TIPO - PV-NRO- LETRA"
  const m = up.match(/^([A-Z]{2})\s*[- ]\s*(\d+)\s*-\s*(\d+)\s*[- ]\s*([A-Z])/)
  if (m) {
    return { tipo: m[1], pv: m[2], nro: m[3], letra: m[4] }
  }

  // Fallback: sólo código de 2 letras
  const m2 = up.match(/^([A-Z]{2})/)
  return { tipo: m2 ? m2[1] : "OTRO", pv: null, nro: null, letra: null }
}

// ---------------------------------------------------------------------------

async function main() {
  const filepath = path.join(__dirname, "data", "Cuentas Corrientes.xlsx")
  console.log(`Leyendo ${filepath}`)
  const wb = XLSX.readFile(filepath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: false })

  // 1) Cargar clientes para matchear por nombre/código
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

  // 2) Parsear filas con carry-forward de empresa y cliente
  let currentEmpresa: string | null = null
  let currentClienteNombre: string | null = null
  let currentClienteCodigo: string | null = null
  let currentClientId: string | null = null

  const EMPRESAS = [
    "AQUILES EQUIPAMIENTOS SRL",
    "MASOIL SRL",
    "CONANCAP S.A.",
    "CONANCAP SA",
    "MASOIL",
  ]

  const toInsert: any[] = []
  const clientesNoEncontrados = new Set<string>()
  let skipped = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || []
    const col0 = row[0] ? String(row[0]).trim() : ""
    const col1 = row[1] ? String(row[1]).trim() : ""

    // Detectar cambio de empresa
    if (col1 && EMPRESAS.some((e) => col1.toUpperCase().includes(e.toUpperCase()))) {
      currentEmpresa = col1
      continue
    }

    // Detectar cambio de cliente (fila con código en col0)
    if (col0 && /\(Cod\.\d+\)/i.test(col0)) {
      const { nombre, codigo } = parseClienteHeader(col0)
      currentClienteNombre = nombre
      currentClienteCodigo = codigo
      // Matchear con BD
      let matched: any = null
      if (codigo && byCodigo.has(codigo)) matched = byCodigo.get(codigo)
      else if (byName.has(nombre.toLowerCase())) matched = byName.get(nombre.toLowerCase())
      currentClientId = matched?.id || null
      if (!matched) clientesNoEncontrados.add(`${codigo || "-"} | ${nombre}`)
      continue
    }

    // Ignorar header
    if (col0 === "FECHA" && col1 === "COMPROBANTE") continue

    // Ignorar filas vacías y de meta (título, "Página -1 de 1", fecha de informe, etc.)
    if (!col0 && !col1 && !row[3] && !row[4]) continue
    if (!col0 || !col1) continue

    // Fila de datos
    const fecha = parseDate(col0)
    if (!fecha) continue

    const { tipo, pv, nro, letra } = parseComprobante(col1)
    const debe = parseMoney(row[3])
    const haber = parseMoney(row[4])
    const saldo = parseMoney(row[5])

    if (!currentClientId) {
      skipped++
      continue
    }

    toInsert.push({
      client_id: currentClientId,
      fecha,
      tipo_comprobante: tipo,
      punto_venta: pv,
      numero_comprobante: nro,
      debe,
      haber,
      saldo,
      observaciones: `GestionPro | ${currentEmpresa || ""} | ${col1}${letra ? " " + letra : ""}`.trim(),
    })
  }

  console.log(`Filas a insertar: ${toInsert.length}`)
  console.log(`Filas sin cliente match: ${skipped}`)
  console.log(`Clientes no encontrados: ${clientesNoEncontrados.size}`)
  if (clientesNoEncontrados.size > 0 && clientesNoEncontrados.size < 30) {
    for (const n of clientesNoEncontrados) console.log("  -", n)
  }

  if (DRY_RUN) {
    console.log("DRY RUN — no se inserta nada.")
    console.log("Primeras 3 filas a insertar:", JSON.stringify(toInsert.slice(0, 3), null, 2))
    return
  }

  // 3) Borrar previos importados por este script (observaciones LIKE GestionPro)
  const { error: errDel } = await supabase
    .from("cuenta_corriente_cliente")
    .delete()
    .like("observaciones", "GestionPro | %")
  if (errDel) console.error("Error borrando previos:", errDel)

  // 4) Insertar por lotes de 500
  const CHUNK = 500
  let ok = 0
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK)
    const { error } = await supabase.from("cuenta_corriente_cliente").insert(chunk)
    if (error) {
      console.error(`Error en chunk ${i}-${i + chunk.length}:`, error.message)
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
