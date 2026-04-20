/**
 * Inspecciona scripts/data/Detalle de Compras por Producto.xlsx
 */
import * as XLSX from "xlsx"
import * as path from "path"

const FILE = path.resolve(__dirname, "data", "Detalle de Compras por Producto.xlsx")

const wb = XLSX.readFile(FILE)
console.log("=== ARCHIVO ===")
console.log(FILE)
console.log("\n=== HOJAS ===")
console.log(wb.SheetNames)

for (const name of wb.SheetNames) {
  const sh = wb.Sheets[name]
  // Leer como array of arrays para ver la grilla cruda
  const rows = XLSX.utils.sheet_to_json<any[]>(sh, { header: 1, defval: null, raw: false })
  console.log(`\n=== HOJA '${name}' (modo grilla) ===`)
  console.log(`Filas totales: ${rows.length}`)
  console.log(`\nPrimeras 15 filas (índice: valores):`)
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    console.log(`[${i}] ${JSON.stringify(rows[i])}`)
  }
  console.log(`\nFilas 20-60:`)
  for (let i = 20; i < Math.min(60, rows.length); i++) {
    const r = rows[i]
    if (r && r.some((c: any) => c != null)) {
      console.log(`[${i}] ${JSON.stringify(r)}`)
    }
  }
}
