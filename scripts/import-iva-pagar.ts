/**
 * Importa resumen de IVA A PAGAR desde el Excel histórico a iva_a_pagar.
 * Uso: npx tsx scripts/import-iva-pagar.ts
 */
import * as XLSX from "xlsx"
import { createClient } from "@supabase/supabase-js"
import * as path from "path"
import * as dotenv from "dotenv"

dotenv.config({ path: path.resolve(__dirname, "../.env.local") })
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !KEY) {
  console.error("Faltan credenciales")
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, KEY)

function parseMoney(v: any): number {
  if (v === null || v === undefined || v === "") return 0
  let s = String(v).trim()
  const neg = s.startsWith("-"); if (neg) s = s.slice(1)
  const lastDot = s.lastIndexOf("."), lastCom = s.lastIndexOf(",")
  const decIdx = Math.max(lastDot, lastCom)
  const int = (decIdx >= 0 ? s.slice(0, decIdx) : s).replace(/[.,\s]/g, "")
  const dec = (decIdx >= 0 ? s.slice(decIdx + 1) : "").replace(/\D/g, "")
  const n = Number(int + (dec ? "." + dec : ""))
  return Number.isFinite(n) ? (neg ? -n : n) : 0
}

async function main() {
  const filepath = path.join(__dirname, "data", "IVA A PAGAR.xlsx")
  const wb = XLSX.readFile(filepath)
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: false })

  // Título tipo "IVA A PAGAR - AQUILES EQUIPAMIENTOS SRL  Desde 01/03/2026 hasta 17/03/2026"
  const title = String(rows[0]?.[0] || "")
  const razon = title.match(/-\s*(.+?)\s{2}Desde/i)?.[1]?.trim() || "AQUILES EQUIPAMIENTOS SRL"
  const fechasMatch = title.match(/Desde\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+hasta\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i)
  const toISO = (s: string) => {
    const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)!
    let y = m[3]; if (y.length === 2) y = Number(y) < 50 ? `20${y}` : `19${y}`
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`
  }
  const desde = fechasMatch ? toISO(fechasMatch[1]) : null
  const hasta = fechasMatch ? toISO(fechasMatch[2]) : null

  const toInsert: any[] = []
  for (let i = 0; i < rows.length; i++) {
    const concepto = String(rows[i]?.[0] || "").trim()
    if (!concepto) continue
    if (/^IVA POR|PERCEPCION/i.test(concepto) === false) continue
    const debitos = parseMoney(rows[i][1])
    const creditos = parseMoney(rows[i][2])
    toInsert.push({
      razon_social: razon,
      periodo_desde: desde,
      periodo_hasta: hasta,
      concepto,
      debitos,
      creditos,
    })
  }

  console.log(`Razón social: ${razon}`)
  console.log(`Período: ${desde} a ${hasta}`)
  console.log(`Filas a insertar: ${toInsert.length}`)

  await supabase.from("iva_a_pagar").delete().eq("razon_social", razon).eq("periodo_desde", desde)
  const { error } = await supabase.from("iva_a_pagar").insert(toInsert)
  if (error) { console.error(error); process.exit(1) }
  console.log("Listo.")
}

main().catch((e) => { console.error(e); process.exit(1) })
