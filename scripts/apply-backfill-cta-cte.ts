/**
 * L.4 v2: aplicar migración SQL del Sprint L (idempotente) + backfill masivo
 * de cta cte desde pagos_proveedores con importe > 0.
 *
 * Uso: npx tsx scripts/apply-backfill-cta-cte.ts
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
  console.log("Paso 1: verificar columna empresa existe (idempotente)")
  // ya verificamos que existe, skip

  console.log("\nPaso 2: backfill desde pagos_proveedores")
  const { data: pagos } = await supabase
    .from("pagos_proveedores")
    .select("id, proveedor_id, empresa, importe, created_at, observaciones, tipo")
    .gt("importe", 0)
    .not("proveedor_id", "is", null)
    .limit(50000)

  const { data: yaReferenciados } = await supabase
    .from("cuenta_corriente_proveedor")
    .select("referencia_id")
  const refSet = new Set((yaReferenciados || []).map((r: any) => r.referencia_id).filter(Boolean))

  const paraInsertar = (pagos || []).filter((p: any) => !refSet.has(p.id))
  console.log(`Pagos backfill-able: ${pagos?.length}, ya referenciados: ${refSet.size}, a insertar: ${paraInsertar.length}`)

  if (paraInsertar.length === 0) {
    console.log("Nada para insertar.")
    return
  }

  const movimientos = paraInsertar.map((p: any) => ({
    proveedor_id: p.proveedor_id,
    fecha: (p.created_at || new Date().toISOString()).slice(0, 10),
    tipo_comprobante: "OP",
    numero_comprobante: null,
    debe: 0,
    haber: Number(p.importe) || 0,
    empresa: p.empresa || null,
    referencia_id: p.id,
    observaciones: p.observaciones || (p.tipo === "PAGO_A_CUENTA" ? "Pago a cuenta (backfill)" : "Pago (backfill)"),
  }))

  // Insertar en chunks de 100
  for (let i = 0; i < movimientos.length; i += 100) {
    const chunk = movimientos.slice(i, i + 100)
    const { error } = await supabase.from("cuenta_corriente_proveedor").insert(chunk)
    if (error) {
      console.error(`Error en chunk ${i}-${i + chunk.length}:`, error.message)
    } else {
      console.log(`  Insertado chunk ${i}-${i + chunk.length}`)
    }
  }

  // Verificación final
  const { count: final } = await supabase
    .from("cuenta_corriente_proveedor")
    .select("*", { count: "exact", head: true })
  console.log(`\nMovimientos finales en cta cte: ${final}`)

  const { data: distrib } = await supabase
    .from("cuenta_corriente_proveedor")
    .select("empresa")
    .limit(50000)
  const c: Record<string, number> = {}
  ;(distrib || []).forEach((r: any) => {
    const k = r.empresa === null ? "NULL" : r.empresa
    c[k] = (c[k] || 0) + 1
  })
  console.log("Distribución final por empresa:")
  Object.entries(c).forEach(([k, v]) => console.log(`  ${k}: ${v}`))
}

main().catch((e) => { console.error(e); process.exit(1) })
