/**
 * Script de migración de datos Excel → Supabase
 *
 * Uso:
 *   pnpm add xlsx
 *   npx tsx scripts/migrate-data.ts
 *
 * Requiere:
 *   - Archivos Excel en scripts/data/
 *   - Variables SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local
 */

import * as XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Cargar .env.local
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const DATA_DIR = path.resolve(__dirname, "data");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readExcel(filename: string): XLSX.WorkBook {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    throw new Error(`Archivo no encontrado: ${filepath}`);
  }
  return XLSX.readFile(filepath);
}

function sheetToRows(wb: XLSX.WorkBook, sheetName: string): Record<string, any>[] {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    console.warn(`⚠️  Hoja "${sheetName}" no encontrada. Hojas disponibles: ${wb.SheetNames.join(", ")}`);
    return [];
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });
  // Filtrar filas completamente vacías
  return rows.filter((row) =>
    Object.values(row).some((v) => v !== null && v !== undefined && String(v).trim() !== "")
  );
}

function clean(val: any): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === "" || s === "-" || s === "N/A" ? null : s;
}

function parseDate(val: any): string | null {
  if (val === null || val === undefined) return null;
  // Excel serial date
  if (typeof val === "number") {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      const y = date.y;
      const m = String(date.m).padStart(2, "0");
      const d = String(date.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  const s = String(val).trim();
  if (!s) return null;
  // Intentar parsear dd/mm/yyyy
  const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    let year = match[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }
  return s;
}

function parseNumber(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  const s = String(val).replace(/[$.]/g, "").replace(",", ".").trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

const ZONA_MAP: Record<string, string> = {
  norte: "Norte",
  capital: "Capital",
  sur: "Sur",
  oeste: "Oeste",
  gba: "GBA",
  "gran buenos aires": "GBA",
  caba: "Capital",
  "zona norte": "Norte",
  "zona sur": "Sur",
  "zona oeste": "Oeste",
};

function mapZona(val: any): string {
  if (!val) return "Capital";
  const normalized = String(val).trim().toLowerCase();
  for (const [key, zona] of Object.entries(ZONA_MAP)) {
    if (normalized.includes(key)) return zona;
  }
  return "Capital";
}

async function upsertBatch<T extends Record<string, any>>(
  table: string,
  rows: T[],
  options?: { onConflict?: string }
): Promise<number> {
  if (rows.length === 0) return 0;

  const BATCH_SIZE = 200;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const query = options?.onConflict
      ? supabase.from(table).upsert(batch, { onConflict: options.onConflict })
      : supabase.from(table).insert(batch);

    const { error, data } = await query.select("id");

    if (error) {
      console.error(`  ❌ Error en ${table} (batch ${i / BATCH_SIZE + 1}): ${error.message}`);
    } else {
      inserted += data?.length ?? batch.length;
    }
  }

  return inserted;
}

// ---------------------------------------------------------------------------
// A) Importar clientes desde CONTACTO DE CLIENTES COBRANZAS.xlsx
// ---------------------------------------------------------------------------
async function importClients() {
  console.log("\n📋 Importando clientes...");

  const filename = "CONTACTO DE CLIENTES COBRANZAS.xlsx";
  let wb: XLSX.WorkBook;
  try {
    wb = readExcel(filename);
  } catch (e: any) {
    console.error(`  ❌ ${e.message}`);
    return;
  }

  const SHEET_RAZON_MAP: Record<string, string> = {
    "CONTACTOS MASOIL": "Masoil",
    "CONTACTOS AQUILES": "Aquiles",
    "CONTACTOS CONANCAP": "Conancap",
  };

  const allClients: any[] = [];

  for (const [sheetName, razonSocial] of Object.entries(SHEET_RAZON_MAP)) {
    const rows = sheetToRows(wb, sheetName);
    console.log(`  📄 Hoja "${sheetName}": ${rows.length} filas`);

    for (const row of rows) {
      const businessName = clean(row["EMPRESA"]);
      if (!businessName) continue;

      allClients.push({
        business_name: businessName,
        razon_social: razonSocial,
        zona: mapZona(row["ZONA/UBICACIÓN"] || row["ZONA"] || row["UBICACIÓN"]),
        email: clean(row["MAILS"] || row["MAIL"] || row["EMAIL"]),
        telefono: clean(row["TELEFONO"] || row["TELÉFONO"]),
        anotaciones: clean(row["ANOTACIONES IMPORTANTES"] || row["ANOTACIONES"]),
        notes: clean(row["OBSERVACIONES"]),
        localidad: clean(row["BARRIO/LOCALIDAD"] || row["BARRIO"] || row["LOCALIDAD"]),
      });
    }
  }

  console.log(`  Total clientes a importar: ${allClients.length}`);

  // Upsert por business_name + razon_social
  // Supabase upsert necesita un UNIQUE constraint; como no lo tenemos,
  // hacemos check manual e insert/update
  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const client of allClients) {
    // Buscar si ya existe
    const { data: existing } = await supabase
      .from("clients")
      .select("id")
      .eq("business_name", client.business_name)
      .eq("razon_social", client.razon_social)
      .limit(1);

    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from("clients")
        .update(client)
        .eq("id", existing[0].id);
      if (error) {
        console.error(`  ❌ Error actualizando "${client.business_name}": ${error.message}`);
        errors++;
      } else {
        updated++;
      }
    } else {
      const { error } = await supabase.from("clients").insert(client);
      if (error) {
        console.error(`  ❌ Error insertando "${client.business_name}": ${error.message}`);
        errors++;
      } else {
        created++;
      }
    }
  }

  console.log(`  ✅ Clientes: ${created} creados, ${updated} actualizados, ${errors} errores`);
}

// ---------------------------------------------------------------------------
// B) Importar proveedores desde PAGO A PROVEEDORES SEGUIMIENTO.xlsx
// ---------------------------------------------------------------------------
async function importProveedores() {
  console.log("\n📋 Importando proveedores...");

  const filename = "PAGO A PROVEEDORES SEGUIMIENTO.xlsx";
  let wb: XLSX.WorkBook;
  try {
    wb = readExcel(filename);
  } catch (e: any) {
    console.error(`  ❌ ${e.message}`);
    return;
  }

  // Buscar la hoja correcta (puede tener variaciones en el nombre)
  const sheetName =
    wb.SheetNames.find((s) => s.toUpperCase().includes("CUENTAS")) ||
    wb.SheetNames.find((s) => s.toUpperCase().includes("CONDICION")) ||
    wb.SheetNames[0];

  const rows = sheetToRows(wb, sheetName);
  console.log(`  📄 Hoja "${sheetName}": ${rows.length} filas`);

  const proveedores: any[] = [];

  for (const row of rows) {
    const nombre = clean(row["Proveedor"] || row["PROVEEDOR"]);
    if (!nombre) continue;

    proveedores.push({
      nombre,
      empresa: clean(row["Empresa"] || row["EMPRESA"]),
      cuit: clean(row["CUIT"] || row["Cuit"]),
      condicion_pago: clean(row["Condición de pago"] || row["CONDICIÓN DE PAGO"] || row["Condicion de pago"]),
      cbu: clean(row["CBU"]),
      observaciones: clean(row["Observaciones"] || row["OBSERVACIONES"]),
      contactos: clean(
        row["Contactos para envío de comprobantes"] ||
          row["Contactos"] ||
          row["CONTACTOS"]
      ),
      fecha_actualizacion: parseDate(row["Fecha actualización"] || row["Fecha actualizacion"]),
    });
  }

  // Upsert por CUIT cuando existe, sino por nombre
  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const prov of proveedores) {
    let existing: any[] | null = null;

    if (prov.cuit) {
      const { data } = await supabase
        .from("proveedores")
        .select("id")
        .eq("cuit", prov.cuit)
        .limit(1);
      existing = data;
    }

    if (!existing || existing.length === 0) {
      const { data } = await supabase
        .from("proveedores")
        .select("id")
        .eq("nombre", prov.nombre)
        .limit(1);
      existing = data;
    }

    if (existing && existing.length > 0) {
      const { error } = await supabase
        .from("proveedores")
        .update(prov)
        .eq("id", existing[0].id);
      if (error) {
        console.error(`  ❌ Error actualizando "${prov.nombre}": ${error.message}`);
        errors++;
      } else {
        updated++;
      }
    } else {
      const { error } = await supabase.from("proveedores").insert(prov);
      if (error) {
        console.error(`  ❌ Error insertando "${prov.nombre}": ${error.message}`);
        errors++;
      } else {
        created++;
      }
    }
  }

  console.log(`  ✅ Proveedores: ${created} creados, ${updated} actualizados, ${errors} errores`);
}

// ---------------------------------------------------------------------------
// Cargar mapa de proveedores (nombre → id) para linkear FK
// ---------------------------------------------------------------------------
async function loadProveedoresMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const { data } = await supabase.from("proveedores").select("id, nombre");
  if (data) {
    for (const p of data) {
      map.set(p.nombre.toLowerCase().trim(), p.id);
    }
  }
  return map;
}

function findProveedorId(map: Map<string, string>, nombre: string | null): string | null {
  if (!nombre) return null;
  const key = nombre.toLowerCase().trim();
  if (map.has(key)) return map.get(key)!;
  // Buscar match parcial
  for (const [k, id] of map) {
    if (k.includes(key) || key.includes(k)) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// C) Importar compras desde Compras a Proveedores - Seguimiento.xlsx
// ---------------------------------------------------------------------------
async function importCompras(provMap: Map<string, string>) {
  console.log("\n📋 Importando compras...");

  const filename = "Compras a Proveedores - Seguimiento.xlsx";
  let wb: XLSX.WorkBook;
  try {
    wb = readExcel(filename);
  } catch (e: any) {
    console.error(`  ❌ ${e.message}`);
    return;
  }

  const sheetName =
    wb.SheetNames.find((s) => s.toLowerCase().includes("compra a proveedores")) ||
    wb.SheetNames.find((s) => s.toLowerCase().includes("compra")) ||
    wb.SheetNames[0];

  const rows = sheetToRows(wb, sheetName);
  console.log(`  📄 Hoja "${sheetName}": ${rows.length} filas`);

  const compras: any[] = [];

  for (const row of rows) {
    const provNombre = clean(row["Proveedor"] || row["PROVEEDOR"]);
    const articulo = clean(row["Articulo"] || row["ARTICULO"] || row["Ingreso de artículos"]);
    if (!provNombre && !articulo) continue;

    compras.push({
      fecha: parseDate(row["fecha"] || row["Fecha"] || row["FECHA"]),
      proveedor_nombre: provNombre,
      proveedor_id: findProveedorId(provMap, provNombre),
      articulo,
      medio_solicitud: clean(row["Porque medio se solicito"] || row["Medio"]),
      solicitado_por: clean(row["Solicitado por cliente"] || row["Solicitado por"]),
      vendedor: clean(row["Vendedor"] || row["VENDEDOR"]),
      nro_cotizacion: clean(row["Nº de cotizacion"] || row["Nº de cotización"] || row["N° de cotizacion"]),
      nro_nota_pedido: clean(row["Nº nota de pedido"] || row["N° nota de pedido"]),
      estado: clean(row["Estado"] || row["ESTADO"]),
    });
  }

  const inserted = await upsertBatch("compras", compras);
  console.log(`  ✅ Compras: ${inserted} registros insertados`);
}

// ---------------------------------------------------------------------------
// D) Importar ordenes de compra
// ---------------------------------------------------------------------------
async function importOrdenesCompra(provMap: Map<string, string>) {
  console.log("\n📋 Importando órdenes de compra...");

  const filename = "Compras a Proveedores - Seguimiento.xlsx";
  let wb: XLSX.WorkBook;
  try {
    wb = readExcel(filename);
  } catch (e: any) {
    console.error(`  ❌ ${e.message}`);
    return;
  }

  const sheetName =
    wb.SheetNames.find((s) => s.toUpperCase().includes("ORDENES DE COMPRA")) ||
    wb.SheetNames.find((s) => s.toUpperCase().includes("OC")) ||
    wb.SheetNames[1];

  const rows = sheetToRows(wb, sheetName);
  console.log(`  📄 Hoja "${sheetName}": ${rows.length} filas`);

  const ordenes: any[] = [];

  for (const row of rows) {
    const provNombre = clean(row["PROVEEDOR"] || row["Proveedor"]);
    if (!provNombre) continue;

    ordenes.push({
      fecha: parseDate(row["FECHA"] || row["Fecha"]),
      proveedor_nombre: provNombre,
      proveedor_id: findProveedorId(provMap, provNombre),
      importe_total: parseNumber(row["IMPORTE TOTAL"] || row["Importe Total"]),
      estado: clean(row["ESTADO COMPRA"] || row["Estado"]),
      ubicacion_oc: clean(row["UBICACION O.C"] || row["UBICACION OC"]),
      nro_oc: clean(row["Nª OC"] || row["N° OC"] || row["NRO OC"]),
      razon_social: clean(row["RAZON SOCIAL"] || row["Razón Social"]),
    });
  }

  const inserted = await upsertBatch("ordenes_compra", ordenes);
  console.log(`  ✅ Órdenes de compra: ${inserted} registros insertados`);
}

// ---------------------------------------------------------------------------
// E) Importar pagos a proveedores
// ---------------------------------------------------------------------------
async function importPagosProveedores(provMap: Map<string, string>) {
  console.log("\n📋 Importando pagos a proveedores...");

  const filename = "PROGRAMACIÓN MENSUAL PAGO A PROVEEDORES.xlsx";
  let wb: XLSX.WorkBook;
  try {
    wb = readExcel(filename);
  } catch (e: any) {
    console.error(`  ❌ ${e.message}`);
    return;
  }

  // Puede tener múltiples hojas (una por mes); importar todas
  const allPagos: any[] = [];

  for (const sheetName of wb.SheetNames) {
    const rows = sheetToRows(wb, sheetName);
    if (rows.length === 0) continue;

    console.log(`  📄 Hoja "${sheetName}": ${rows.length} filas`);

    for (const row of rows) {
      const provNombre = clean(row["PROVEEDOR"] || row["Proveedor"]);
      if (!provNombre) continue;

      allPagos.push({
        proveedor_nombre: provNombre,
        proveedor_id: findProveedorId(provMap, provNombre),
        cuit: clean(row["CUIT"] || row["Cuit"]),
        empresa: clean(row["EMPRESA"] || row["Empresa"]),
        fecha_fc: parseDate(row["FECHA FC"] || row["Fecha FC"]),
        numero_fc: clean(row["NUMERO FC/OC"] || row["NUMERO FC"] || row["N° FC"]),
        importe: parseNumber(row["IMPORTE"] || row["Importe"]),
        forma_pago: clean(row["FORMA y PLAZO DE PAGO"] || row["FORMA DE PAGO"] || row["Forma de pago"]),
        cbu: clean(row["CBU TRANSFERENCIA"] || row["CBU"]),
        observaciones: clean(row["observaciones"] || row["Observaciones"] || row["OBSERVACIONES"]),
        estado_pago: clean(row["ESTADO DE PAGO"] || row["Estado de pago"]),
        nro_cheque: clean(row["N° CHEQUE/S"] || row["N° CHEQUE"] || row["NRO CHEQUE"]),
        banco: clean(row["BANCO"] || row["Banco"]),
        origen: clean(row["ORIGEN"] || row["Origen"]),
      });
    }
  }

  const inserted = await upsertBatch("pagos_proveedores", allPagos);
  console.log(`  ✅ Pagos a proveedores: ${inserted} registros insertados (de ${allPagos.length} filas)`);
}

// ---------------------------------------------------------------------------
// F) Actualizar canal de facturación en clients
// ---------------------------------------------------------------------------
async function updateCanalFacturacion() {
  console.log("\n📋 Actualizando canal de facturación de clientes...");

  const filename = "ENVÍO_ CARGA DE FACTURAS CLIENTES.xlsx";
  let wb: XLSX.WorkBook;
  try {
    wb = readExcel(filename);
  } catch (e: any) {
    console.error(`  ❌ ${e.message}`);
    return;
  }

  const rows = sheetToRows(wb, wb.SheetNames[0]);
  console.log(`  📄 Hoja "${wb.SheetNames[0]}": ${rows.length} filas`);

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const row of rows) {
    const empresa = clean(row["EMPRESA"] || row["Empresa"]);
    if (!empresa) continue;

    const canal = clean(row["CANAL"] || row["Canal"]);
    const obs = clean(row["OBSERVACIONES"] || row["Observaciones"]);

    // Buscar cliente por business_name
    const { data: clients } = await supabase
      .from("clients")
      .select("id")
      .eq("business_name", empresa)
      .limit(1);

    if (!clients || clients.length === 0) {
      // Intentar match parcial con ilike
      const { data: fuzzyClients } = await supabase
        .from("clients")
        .select("id")
        .ilike("business_name", `%${empresa}%`)
        .limit(1);

      if (!fuzzyClients || fuzzyClients.length === 0) {
        notFound++;
        continue;
      }

      const { error } = await supabase
        .from("clients")
        .update({ canal_facturacion: canal, canal_observaciones: obs })
        .eq("id", fuzzyClients[0].id);

      if (error) {
        errors++;
      } else {
        updated++;
      }
    } else {
      const { error } = await supabase
        .from("clients")
        .update({ canal_facturacion: canal, canal_observaciones: obs })
        .eq("id", clients[0].id);

      if (error) {
        errors++;
      } else {
        updated++;
      }
    }
  }

  console.log(
    `  ✅ Canal facturación: ${updated} actualizados, ${notFound} no encontrados, ${errors} errores`
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("🚀 Iniciando migración de datos Excel → Supabase");
  console.log(`   Supabase URL: ${SUPABASE_URL}`);
  console.log(`   Directorio de datos: ${DATA_DIR}`);
  console.log("");

  // Verificar que el directorio de datos existe
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`❌ Directorio ${DATA_DIR} no existe.`);
    console.log("   Creá la carpeta scripts/data/ y copiá los archivos Excel ahí:");
    console.log("   - CONTACTO DE CLIENTES COBRANZAS.xlsx");
    console.log("   - PAGO A PROVEEDORES SEGUIMIENTO.xlsx");
    console.log("   - Compras a Proveedores - Seguimiento.xlsx");
    console.log("   - PROGRAMACIÓN MENSUAL PAGO A PROVEEDORES.xlsx");
    console.log("   - ENVÍO_ CARGA DE FACTURAS CLIENTES.xlsx");
    process.exit(1);
  }

  // Listar archivos disponibles
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".xlsx"));
  console.log(`📂 Archivos Excel encontrados: ${files.length}`);
  files.forEach((f) => console.log(`   - ${f}`));

  // 1. Clientes (primero, porque otros dependen)
  await importClients();

  // 2. Proveedores (segundo, porque compras/pagos referencian)
  await importProveedores();

  // 3. Cargar mapa de proveedores para linkear FKs
  const provMap = await loadProveedoresMap();
  console.log(`\n🔗 Mapa de proveedores cargado: ${provMap.size} proveedores`);

  // 4. Compras
  await importCompras(provMap);

  // 5. Órdenes de compra
  await importOrdenesCompra(provMap);

  // 6. Pagos a proveedores
  await importPagosProveedores(provMap);

  // 7. Canal de facturación
  await updateCanalFacturacion();

  console.log("\n🎉 Migración completada!");
}

main().catch((err) => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});
