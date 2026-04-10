/**
 * Importar Plan de Cuentas Contables desde Excel a Supabase
 * Uso: npx tsx scripts/import-plan-cuentas.ts
 */
import * as XLSX from "xlsx"
import { createClient } from "@supabase/supabase-js"
import * as path from "path"
import * as dotenv from "dotenv"

dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  const filepath = path.join(__dirname, "data", "Plan_CtasContables.xlsx")
  console.log("Leyendo", filepath)

  const wb = XLSX.readFile(filepath)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null })
    .filter((row) => Object.values(row).some((v) => v !== null && String(v).trim() !== ""))

  console.log(`Filas encontradas: ${rows.length}`)
  console.log("Columnas:", Object.keys(rows[0] || {}))

  // Map columns - try common names
  const records = rows.map((row) => {
    const codigo = String(
      row["Código"] || row["Codigo"] || row["codigo"] || row["COD"] || row["Cod"] || ""
    ).trim()
    const categoria = String(
      row["Categoría"] || row["Categoria"] || row["categoria"] || row["CATEGORIA"] || ""
    ).trim()
    const sub = String(
      row["Sub_categoría"] || row["Sub_categoria"] || row["sub_categoria"] ||
      row["Subcategoría"] || row["Subcategoria"] || row["SUB_CATEGORIA"] || ""
    ).trim()
    return { codigo, categoria, sub_categoria: sub || null }
  }).filter((r) => r.codigo && r.categoria)

  console.log(`Registros válidos: ${records.length}`)
  if (records.length > 0) {
    console.log("Ejemplo:", records[0])
  }

  // Upsert (delete + insert)
  console.log("Limpiando tabla plan_cuentas...")
  await supabase.from("plan_cuentas").delete().neq("id", "00000000-0000-0000-0000-000000000000")

  // Insert in batches of 50
  let inserted = 0
  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50)
    const { error } = await supabase.from("plan_cuentas").insert(batch)
    if (error) {
      console.error(`Error en batch ${i}:`, error.message)
    } else {
      inserted += batch.length
    }
  }

  console.log(`\n✅ ${inserted} cuentas contables importadas`)
}

main().catch((err) => {
  console.error("Error:", err)
  process.exit(1)
})
