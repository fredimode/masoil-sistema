/**
 * Debug L.4 v3: validar pagos para backfill
 */
import { createClient } from "@supabase/supabase-js"
import * as fs from "fs"
import * as path from "path"

const envPath = path.join(__dirname, "..", ".env.local")
const envContent = fs.readFileSync(envPath, "utf-8")
const env: Record<string, string> = {}
envContent.split("\n").forEach((line) => {
  const m = line.match(/^([A-Z_]+)=(.+)$/)
  if (m) env[m[1]] = m[2].trim()
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function main() {
  const { data: pagos } = await supabase
    .from("pagos_proveedores")
    .select("id, proveedor_id, proveedor_nombre, empresa, importe, created_at, tipo")
    .limit(50000)

  console.log(`Total pagos: ${pagos?.length}`)

  let conImporte = 0
  let conProveedorId = 0
  let conEmpresa = 0
  let conTodo = 0
  let problemas = { sinImporte: 0, sinProveedor: 0, sinEmpresa: 0 }

  ;(pagos || []).forEach((p: any) => {
    const tieneImporte = p.importe !== null && Number(p.importe) > 0
    const tieneProveedor = !!p.proveedor_id
    const tieneEmpresa = !!p.empresa
    if (tieneImporte) conImporte++; else problemas.sinImporte++
    if (tieneProveedor) conProveedorId++; else problemas.sinProveedor++
    if (tieneEmpresa) conEmpresa++; else problemas.sinEmpresa++
    if (tieneImporte && tieneProveedor && tieneEmpresa) conTodo++
  })

  console.log(`\nCon importe > 0: ${conImporte}`)
  console.log(`Con proveedor_id: ${conProveedorId}`)
  console.log(`Con empresa: ${conEmpresa}`)
  console.log(`Backfill-able (importe + proveedor_id + empresa): ${conTodo}`)
  console.log("\nProblemas:")
  console.log(`  Sin importe: ${problemas.sinImporte}`)
  console.log(`  Sin proveedor_id: ${problemas.sinProveedor}`)
  console.log(`  Sin empresa: ${problemas.sinEmpresa}`)

  console.log("\n=== Pagos ya referenciados en cta cte ===")
  const { data: cc } = await supabase
    .from("cuenta_corriente_proveedor")
    .select("referencia_id")
  console.log("IDs referenciados:", cc?.length, JSON.stringify(cc))

  // Distribución de pagos por empresa
  console.log("\n=== Pagos backfill-able por empresa ===")
  const dist: Record<string, number> = {}
  ;(pagos || []).forEach((p: any) => {
    if (Number(p.importe) > 0 && p.proveedor_id && p.empresa) {
      dist[p.empresa] = (dist[p.empresa] || 0) + 1
    }
  })
  Object.entries(dist).forEach(([k, v]) => console.log(`  ${k}: ${v}`))
}

main().catch((e) => { console.error(e); process.exit(1) })
