/**
 * Ejecuta la migración 20260422_iteracion_abril_p4.sql.
 * Supabase JS no permite ejecutar DDL arbitrario vía SDK; este script imprime el SQL
 * para que lo ejecutes en el SQL Editor del panel de Supabase.
 *
 * Uso: npx tsx scripts/apply-migration-p4.ts
 */
import * as fs from "fs"
import * as path from "path"

const sqlPath = path.join(__dirname, "../supabase/migrations/20260422_iteracion_abril_p4.sql")
const sql = fs.readFileSync(sqlPath, "utf8")
console.log("─".repeat(80))
console.log("Pegá este SQL en el SQL Editor de Supabase y ejecutá:")
console.log("─".repeat(80))
console.log(sql)
console.log("─".repeat(80))
