import * as XLSX from "xlsx"
import path from "path"

function inspectFile(relPath: string, maxRows = 30) {
  const file = path.join(process.cwd(), "scripts/data", relPath)
  console.log("\n===========================================")
  console.log("FILE:", relPath)
  console.log("===========================================")
  const wb = XLSX.readFile(file)
  console.log("Sheets:", wb.SheetNames)
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, raw: false })
    console.log(`--- Sheet: ${sheetName} (total rows: ${rows.length}) ---`)
    for (let i = 0; i < Math.min(maxRows, rows.length); i++) {
      console.log(i, JSON.stringify(rows[i]))
    }
  }
}

inspectFile("Cuentas Corrientes.xlsx", 40)
inspectFile("INFORME COBRANZAS PENDIENTES (Semanal).xlsx", 40)
inspectFile("IVA A PAGAR.xlsx", 40)
inspectFile("SUBDIARIO IVA VENTAS.xlsx", 20)
inspectFile("SUBDIARIO IVA COMPRAS.xlsx", 20)
inspectFile("VENTAS POR JURISDICCIÓN.xlsx", 20)
