/**
 * Aplica la migration 20260422_iteracion_abril_p4.sql vía RPC exec_sql.
 * Uso: npx tsx scripts/apply-migration-p4.ts
 */
import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"
import * as dotenv from "dotenv"

dotenv.config({ path: path.resolve(__dirname, "../.env.local") })

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !KEY) {
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, KEY)

async function main() {
  const sqlPath = path.join(__dirname, "../supabase/migrations/20260422_iteracion_abril_p4.sql")
  const sql = fs.readFileSync(sqlPath, "utf8")
  // Separar por bloques que no sean $$
  const { error } = await (supabase.rpc as any)("exec_sql", { sql })
  if (error) {
    console.error("Error:", error)
    console.log("Ejecutá este SQL manualmente en el SQL editor de Supabase.")
    console.log("--- SQL ---\n" + sql)
    process.exit(1)
  }
  console.log("OK migration aplicada.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
