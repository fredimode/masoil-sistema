/**
 * Script de migración de datos Excel → Supabase
 *
 * Uso:
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
  console.error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
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
    console.warn(`  ⚠️  Hoja "${sheetName}" no encontrada. Hojas disponibles: ${wb.SheetNames.join(", ")}`);
    return [];
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null });
  return rows.filter((row) =>
    Object.values(row).some((v) => v !== null && v !== undefined && String(v).trim() !== "")
  );
}

/** Busca un valor probando múltiples nombres de columna */
function col(row: Record<string, any>, ...names: string[]): any {
  for (const n of names) {
    if (row[n] !== null && row[n] !== undefined) return row[n];
  }
  return null;
}

function clean(val: any): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === "" || s === "-" || s === "N/A" || s === "0" && s.length === 1 ? null : s;
}

function parseDate(val: any): string | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
    }
  }
  const s = String(val).trim();
  if (!s) return null;
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

// Zona: solo mapear las que matchean con el enum. Si no matchea → null.
const ZONA_MAP: Record<string, string> = {
  "capital federal": "Capital",
  "capital": "Capital",
  "caba": "Capital",
  "norte": "Norte",
  "zona norte": "Norte",
  "sur": "Sur",
  "zona sur": "Sur",
  "oeste": "Oeste",
  "zona oeste": "Oeste",
  "gba": "GBA",
  "gran buenos aires": "GBA",
};

function mapZona(val: any): string | null {
  if (!val) return null;
  const normalized = String(val).trim().toLowerCase();
  // Exact match first
  if (ZONA_MAP[normalized]) return ZONA_MAP[normalized];
  // Partial match
  for (const [key, zona] of Object.entries(ZONA_MAP)) {
    if (normalized.includes(key)) return zona;
  }
  // No match → null (la tabla ya acepta null)
  return null;
}

async function insertBatch(table: string, rows: any[]): Promise<number> {
  if (rows.length === 0) return 0;
  const BATCH_SIZE = 200;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error, data } = await supabase.from(table).insert(batch).select("id");
    if (error) {
      console.error(`  ❌ Error en ${table} (batch ${Math.floor(i / BATCH_SIZE) + 1}): ${error.message}`);
    } else {
      inserted += data?.length ?? batch.length;
    }
  }
  return inserted;
}

// ---------------------------------------------------------------------------
// 1) Importar clientes
// ---------------------------------------------------------------------------
async function importClients() {
  console.log("\n📋 Importando clientes...");

  const filename = "CONTACTO DE CLIENTES COBRANZAS.xlsx";
  let wb: XLSX.WorkBook;
  try { wb = readExcel(filename); } catch (e: any) { console.error(`  ❌ ${e.message}`); return; }

  const SHEET_RAZON_MAP: Record<string, string> = {
    "CONTACTOS MASOIL": "Masoil",
    "CONTACTOS AQUILES": "Aquiles",
    "CONTACTOS CONANCAP": "Conancap",
  };

  const allClients: any[] = [];

  for (const [sheetName, razonSocial] of Object.entries(SHEET_RAZON_MAP)) {
    const rows = sheetToRows(wb, sheetName);
    console.log(`  📄 ${sheetName}: ${rows.length} filas`);

    for (const row of rows) {
      const businessName = clean(col(row, "EMPRESA"));
      if (!businessName) continue;

      allClients.push({
        business_name: businessName,
        razon_social: razonSocial,
        zona: mapZona(col(row, "ZONA/UBICACIÓN", "ZONA", "UBICACIÓN")),
        email: clean(col(row, "MAILS", "MAIL", "EMAIL")),
        telefono: clean(col(row, "TELEFONO", "TELÉFONO")),
        anotaciones: clean(col(row, "ANOTACIONES IMPORTANTES", "ANOTACIONES")),
        notes: clean(col(row, "OBSERVACIONES")),
        localidad: clean(col(row, "BARRIO/LOCALIDAD", "BARRIO", "LOCALIDAD")),
        // NO se asigna vendedor_id — se asignan después manualmente
        // NO se asigna contact_name — queda null/default
      });
    }
  }

  // Hoja "cambios de razón social"
  const cambiosSheet = wb.SheetNames.find((s) => s.toLowerCase().includes("cambio"));
  if (cambiosSheet) {
    const cambiosRows = sheetToRows(wb, cambiosSheet);
    console.log(`  📄 ${cambiosSheet}: ${cambiosRows.length} filas`);
    // Guardar info de cambios para aplicar después de insertar clientes
    for (const row of cambiosRows) {
      const empresa = clean(col(row, "EMPRESA", "Empresa"));
      if (!empresa) continue;
      // Buscar si ya está en allClients y agregar el campo
      const existing = allClients.find((c) => c.business_name === empresa);
      const cambioInfo = Object.values(row).filter((v) => v !== null).map(String).join(" | ");
      if (existing) {
        existing.cambio_razon_social = cambioInfo;
      } else {
        // Agregar como cliente nuevo con la info
        allClients.push({
          business_name: empresa,
          cambio_razon_social: cambioInfo,
        });
      }
    }
  }

  console.log(`  Total clientes a importar: ${allClients.length}`);

  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const client of allClients) {
    // Buscar si ya existe por business_name + razon_social
    let query = supabase.from("clients").select("id").eq("business_name", client.business_name);
    if (client.razon_social) query = query.eq("razon_social", client.razon_social);
    const { data: existing } = await query.limit(1);

    if (existing && existing.length > 0) {
      const { error } = await supabase.from("clients").update(client).eq("id", existing[0].id);
      if (error) {
        console.error(`  ❌ Update "${client.business_name}": ${error.message}`);
        errors++;
      } else {
        updated++;
      }
    } else {
      const { error } = await supabase.from("clients").insert(client);
      if (error) {
        console.error(`  ❌ Insert "${client.business_name}": ${error.message}`);
        errors++;
      } else {
        created++;
      }
    }
  }

  console.log(`  ✅ Clientes: ${created} creados, ${updated} actualizados, ${errors} errores`);
}

// ---------------------------------------------------------------------------
// 2) Importar proveedores
// ---------------------------------------------------------------------------
async function importProveedores() {
  console.log("\n📋 Importando proveedores...");

  const filename = "PAGO A PROVEEDORES SEGUIMIENTO.xlsx";
  let wb: XLSX.WorkBook;
  try { wb = readExcel(filename); } catch (e: any) { console.error(`  ❌ ${e.message}`); return; }

  const sheetName =
    wb.SheetNames.find((s) => s.toUpperCase().includes("CUENTAS")) ||
    wb.SheetNames.find((s) => s.toUpperCase().includes("CONDICION")) ||
    wb.SheetNames[0];

  const rows = sheetToRows(wb, sheetName!);
  console.log(`  📄 ${sheetName}: ${rows.length} filas`);

  let created = 0, updated = 0, errors = 0;

  for (const row of rows) {
    const nombre = clean(col(row, "Proveedor", "PROVEEDOR"));
    if (!nombre) continue;

    const prov = {
      nombre,
      empresa: clean(col(row, "Empresa", "EMPRESA")),
      cuit: clean(col(row, "CUIT", "Cuit")),
      condicion_pago: clean(col(row, "Condición de pago", "CONDICIÓN DE PAGO", "Condicion de pago")),
      cbu: clean(col(row, "CBU")),
      observaciones: clean(col(row, "Observaciones", "OBSERVACIONES")),
      contactos: clean(col(row, "Contactos para envío de comprobantes", "Contactos", "CONTACTOS")),
      fecha_actualizacion: parseDate(col(row, "Fecha actualización", "Fecha actualizacion")),
    };

    // Buscar por CUIT o nombre
    let existing: any[] | null = null;
    if (prov.cuit) {
      const { data } = await supabase.from("proveedores").select("id").eq("cuit", prov.cuit).limit(1);
      existing = data;
    }
    if (!existing || existing.length === 0) {
      const { data } = await supabase.from("proveedores").select("id").eq("nombre", prov.nombre).limit(1);
      existing = data;
    }

    if (existing && existing.length > 0) {
      const { error } = await supabase.from("proveedores").update(prov).eq("id", existing[0].id);
      if (error) { console.error(`  ❌ Update "${nombre}": ${error.message}`); errors++; }
      else { updated++; }
    } else {
      const { error } = await supabase.from("proveedores").insert(prov);
      if (error) { console.error(`  ❌ Insert "${nombre}": ${error.message}`); errors++; }
      else { created++; }
    }
  }

  console.log(`  ✅ Proveedores: ${created} creados, ${updated} actualizados, ${errors} errores`);
}

// ---------------------------------------------------------------------------
// 3) Importar reclamos de pagos a proveedores
// ---------------------------------------------------------------------------
async function importReclamos() {
  console.log("\n📋 Importando reclamos de pagos a proveedores...");

  const filename = "PAGO A PROVEEDORES SEGUIMIENTO.xlsx";
  let wb: XLSX.WorkBook;
  try { wb = readExcel(filename); } catch (e: any) { console.error(`  ❌ ${e.message}`); return; }

  const sheetName = wb.SheetNames.find((s) => s.toUpperCase().includes("RECLAMO"));
  if (!sheetName) {
    console.log(`  ⚠️  Hoja de reclamos no encontrada. Hojas: ${wb.SheetNames.join(", ")}`);
    return;
  }

  const rows = sheetToRows(wb, sheetName);
  console.log(`  📄 ${sheetName}: ${rows.length} filas`);

  const reclamos: any[] = [];
  for (const row of rows) {
    const proveedor = clean(col(row, "PROVEEDOR", "Proveedor"));
    if (!proveedor) continue;

    reclamos.push({
      proveedor_nombre: proveedor,
      empresa: clean(col(row, "EMPRESA", "Empresa")),
      forma_pago: clean(col(row, "FORMA DE PAGO", "FORMA y PLAZO DE PAGO", "Forma de pago")),
      fecha_reclamo: parseDate(col(row, "FECHA RECLAMO", "Fecha reclamo", "FECHA")),
      fecha_pago: parseDate(col(row, "FECHA PAGO", "Fecha pago")),
      observaciones: clean(col(row, "OBSERVACIONES", "Observaciones", "observaciones")),
      estado: clean(col(row, "ESTADO", "Estado")),
    });
  }

  const inserted = await insertBatch("reclamos_pagos_proveedores", reclamos);
  console.log(`  ✅ Reclamos: ${inserted} registros insertados`);
}

// ---------------------------------------------------------------------------
// Helper: mapa de proveedores (nombre → id) para linkear FK
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
  for (const [k, id] of map) {
    if (k.includes(key) || key.includes(k)) return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 4) Importar compras
// ---------------------------------------------------------------------------
async function importCompras(provMap: Map<string, string>) {
  console.log("\n📋 Importando compras...");

  const filename = "Compras a Proveedores - Seguimiento.xlsx";
  let wb: XLSX.WorkBook;
  try { wb = readExcel(filename); } catch (e: any) { console.error(`  ❌ ${e.message}`); return; }

  const sheetName =
    wb.SheetNames.find((s) => s.toLowerCase().includes("compra a proveedores")) ||
    wb.SheetNames.find((s) => s.toLowerCase().includes("compra")) ||
    wb.SheetNames[0];

  const rows = sheetToRows(wb, sheetName!);
  console.log(`  📄 ${sheetName}: ${rows.length} filas`);

  const compras: any[] = [];
  // Carry-forward: filas agrupadas repiten proveedor/fecha solo en la primera fila
  let lastFecha: string | null = null;
  let lastProveedor: string | null = null;
  let lastMedio: string | null = null;
  let lastSolicitado: string | null = null;
  let lastVendedor: string | null = null;

  for (const row of rows) {
    const fecha = parseDate(col(row, "fecha", "Fecha", "FECHA"));
    const provNombre = clean(col(row, "Proveedor", "PROVEEDOR"));
    const medio = clean(col(row, "Porque medio se solicito", "Medio"));
    const solicitado = clean(col(row, "Solicitado por cliente", "Solicitado por"));
    const vendedor = clean(col(row, "Vendedor", "VENDEDOR"));
    const articulo = clean(col(row, "Articulo", "ARTICULO", "Ingreso de artículos"));

    // Update carry-forward values when present
    if (fecha) lastFecha = fecha;
    if (provNombre) lastProveedor = provNombre;
    if (medio) lastMedio = medio;
    if (solicitado) lastSolicitado = solicitado;
    if (vendedor) lastVendedor = vendedor;

    if (!lastProveedor && !articulo) continue;

    compras.push({
      fecha: fecha || lastFecha,
      proveedor_nombre: provNombre || lastProveedor,
      proveedor_id: findProveedorId(provMap, provNombre || lastProveedor),
      articulo,
      medio_solicitud: medio || lastMedio,
      solicitado_por: solicitado || lastSolicitado,
      vendedor: vendedor || lastVendedor,
      nro_cotizacion: clean(col(row, "Nº de cotizacion", "Nº de cotización", "N° de cotizacion")),
      nro_nota_pedido: clean(col(row, "Nº nota de pedido", "N° nota de pedido")),
      estado: clean(col(row, "Estado", "ESTADO")),
    });
  }

  const inserted = await insertBatch("compras", compras);
  console.log(`  ✅ Compras: ${inserted} registros insertados`);
}

// ---------------------------------------------------------------------------
// 5) Importar ordenes de compra
// ---------------------------------------------------------------------------
async function importOrdenesCompra(provMap: Map<string, string>) {
  console.log("\n📋 Importando órdenes de compra...");

  const filename = "Compras a Proveedores - Seguimiento.xlsx";
  let wb: XLSX.WorkBook;
  try { wb = readExcel(filename); } catch (e: any) { console.error(`  ❌ ${e.message}`); return; }

  const sheetName =
    wb.SheetNames.find((s) => s.toUpperCase().includes("ORDENES DE COMPRA")) ||
    wb.SheetNames.find((s) => s.toUpperCase().includes("OC")) ||
    wb.SheetNames[1];

  const rows = sheetToRows(wb, sheetName!);
  console.log(`  📄 ${sheetName}: ${rows.length} filas`);

  const ordenes: any[] = [];
  // Carry-forward for grouped rows
  let lastOcFecha: string | null = null;
  let lastOcProveedor: string | null = null;
  let lastOcRazon: string | null = null;

  for (const row of rows) {
    const fecha = parseDate(col(row, "FECHA", "Fecha"));
    const provNombre = clean(col(row, "PROVEEDOR", "Proveedor"));
    const razon = clean(col(row, "RAZON SOCIAL", "Razón Social"));

    if (fecha) lastOcFecha = fecha;
    if (provNombre) lastOcProveedor = provNombre;
    if (razon) lastOcRazon = razon;

    // Need at least proveedor or importe to be a valid row
    const importe = parseNumber(col(row, "IMPORTE TOTAL", "Importe Total"));
    if (!provNombre && !lastOcProveedor && importe === null) continue;

    ordenes.push({
      fecha: fecha || lastOcFecha,
      proveedor_nombre: provNombre || lastOcProveedor,
      proveedor_id: findProveedorId(provMap, provNombre || lastOcProveedor),
      importe_total: importe,
      estado: clean(col(row, "ESTADO COMPRA", "Estado")),
      ubicacion_oc: clean(col(row, "UBICACION O.C", "UBICACION OC")),
      nro_oc: clean(col(row, "Nª OC", "N° OC", "NRO OC")),
      razon_social: razon || lastOcRazon,
    });
  }

  const inserted = await insertBatch("ordenes_compra", ordenes);
  console.log(`  ✅ Órdenes de compra: ${inserted} registros insertados`);
}

// ---------------------------------------------------------------------------
// 6) Importar pagos a proveedores
// ---------------------------------------------------------------------------
async function importPagosProveedores(provMap: Map<string, string>) {
  console.log("\n📋 Importando pagos a proveedores...");

  const filename = "PROGRAMACIÓN MENSUAL PAGO A PROVEEDORES.xlsx";
  let wb: XLSX.WorkBook;
  try { wb = readExcel(filename); } catch (e: any) { console.error(`  ❌ ${e.message}`); return; }

  const allPagos: any[] = [];

  for (const sheetName of wb.SheetNames) {
    const rows = sheetToRows(wb, sheetName);
    if (rows.length === 0) continue;
    console.log(`  📄 ${sheetName}: ${rows.length} filas`);

    // Carry-forward for grouped rows
    let lastPagoProv: string | null = null;
    let lastPagoCuit: string | null = null;
    let lastPagoEmpresa: string | null = null;
    let lastPagoCbu: string | null = null;

    for (const row of rows) {
      const provNombre = clean(col(row, "PROVEEDOR", "Proveedor"));
      const cuit = clean(col(row, "CUIT", "Cuit"));
      const empresa = clean(col(row, "EMPRESA", "Empresa"));
      const cbu = clean(col(row, "CBU TRANSFERENCIA", "CBU"));

      if (provNombre) lastPagoProv = provNombre;
      if (cuit) lastPagoCuit = cuit;
      if (empresa) lastPagoEmpresa = empresa;
      if (cbu) lastPagoCbu = cbu;

      // Need at least proveedor or importe
      const importe = parseNumber(col(row, "IMPORTE", "Importe"));
      if (!provNombre && !lastPagoProv && importe === null) continue;

      allPagos.push({
        proveedor_nombre: provNombre || lastPagoProv,
        proveedor_id: findProveedorId(provMap, provNombre || lastPagoProv),
        cuit: cuit || lastPagoCuit,
        empresa: empresa || lastPagoEmpresa,
        fecha_fc: parseDate(col(row, "FECHA FC", "Fecha FC")),
        numero_fc: clean(col(row, "NUMERO FC/OC", "NUMERO FC", "N° FC")),
        importe,
        forma_pago: clean(col(row, "FORMA y PLAZO DE PAGO", "FORMA DE PAGO", "Forma de pago")),
        cbu: cbu || lastPagoCbu,
        observaciones: clean(col(row, "observaciones", "Observaciones", "OBSERVACIONES")),
        estado_pago: clean(col(row, "ESTADO DE PAGO", "Estado de pago")),
        nro_cheque: clean(col(row, "N° CHEQUE/S", "N° CHEQUE", "NRO CHEQUE")),
        banco: clean(col(row, "BANCO", "Banco")),
        origen: clean(col(row, "ORIGEN", "Origen")),
      });
    }
  }

  const inserted = await insertBatch("pagos_proveedores", allPagos);
  console.log(`  ✅ Pagos a proveedores: ${inserted} insertados (de ${allPagos.length} filas)`);
}

// ---------------------------------------------------------------------------
// 7) Actualizar canal de facturación en clients
// ---------------------------------------------------------------------------
async function updateCanalFacturacion() {
  console.log("\n📋 Actualizando canal de facturación...");

  const filename = "ENVÍO_ CARGA DE FACTURAS CLIENTES.xlsx";
  let wb: XLSX.WorkBook;
  try { wb = readExcel(filename); } catch (e: any) { console.error(`  ❌ ${e.message}`); return; }

  const rows = sheetToRows(wb, wb.SheetNames[0]);
  console.log(`  📄 ${wb.SheetNames[0]}: ${rows.length} filas`);

  let updated = 0, notFound = 0, errors = 0;

  for (const row of rows) {
    const empresa = clean(col(row, "EMPRESA", "Empresa"));
    if (!empresa) continue;

    const canal = clean(col(row, "CANAL", "Canal"));
    const obs = clean(col(row, "OBSERVACIONES", "Observaciones"));

    // Match exacto
    let { data: found } = await supabase
      .from("clients").select("id").eq("business_name", empresa).limit(1);

    // Match parcial
    if (!found || found.length === 0) {
      const { data } = await supabase
        .from("clients").select("id").ilike("business_name", `%${empresa}%`).limit(1);
      found = data;
    }

    if (!found || found.length === 0) {
      notFound++;
      continue;
    }

    const { error } = await supabase
      .from("clients")
      .update({ canal_facturacion: canal, canal_observaciones: obs })
      .eq("id", found[0].id);

    if (error) { errors++; } else { updated++; }
  }

  console.log(`  ✅ Canal facturación: ${updated} actualizados, ${notFound} no encontrados, ${errors} errores`);
}

// ---------------------------------------------------------------------------
// 8) Importar gastos de vehículos
// ---------------------------------------------------------------------------
async function importGastosVehiculos() {
  console.log("\n📋 Importando gastos de vehículos...");

  const filename = "Control Gastos y Kilometraje por vendedor.xlsx";
  let wb: XLSX.WorkBook;
  try { wb = readExcel(filename); } catch (e: any) { console.error(`  ❌ ${e.message}`); return; }

  const allGastos: any[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    // Leer como array de arrays para parsear headers no estándar
    const raw = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null });
    if (raw.length < 2) continue;

    // Fila 0 suele tener vehículo, patente, usuario en celdas separadas
    const headerRow = raw[0] as any[];
    let vehiculo: string | null = null;
    let patente: string | null = null;
    let usuario: string | null = null;

    // Extraer info del header: buscar patrones
    const headerText = (headerRow || []).filter(Boolean).map(String).join(" | ");
    const patenteMatch = headerText.match(/([A-Z]{2,3}\d{3}[A-Z]{0,3}|\d{3}[A-Z]{3})/i);
    if (patenteMatch) patente = patenteMatch[1].toUpperCase();

    // Buscar nombres de vehículo y usuario en el header
    for (const cell of headerRow || []) {
      if (!cell) continue;
      const s = String(cell).trim();
      if (s.match(/FORD|FIAT|RENAULT|VOLKSWAGEN|VW|CHEVROLET|TOYOTA|PEUGEOT|CITROEN/i)) {
        vehiculo = s;
      }
      if (s.match(/^[A-ZÁÉÍÓÚ][a-záéíóú]+$/) && !s.match(/FORD|FIAT|Control|Gastos|Fecha/i)) {
        usuario = s;
      }
    }

    // Fila 1 puede ser sub-header con los nombres de columna
    // Buscar la fila que tiene "FECHA" o similar
    let dataStartIdx = 1;
    let colMap: Record<string, number> = {};
    for (let i = 0; i < Math.min(raw.length, 5); i++) {
      const r = raw[i] as any[];
      if (!r) continue;
      const rowStr = r.map(String).join(" ").toUpperCase();
      if (rowStr.includes("FECHA") || rowStr.includes("CONCEPTO")) {
        // Mapear columnas
        for (let c = 0; c < r.length; c++) {
          if (r[c]) colMap[String(r[c]).toUpperCase().trim()] = c;
        }
        dataStartIdx = i + 1;
        break;
      }
    }

    const fechaCol = colMap["FECHA"] ?? 0;
    const conceptoCol = colMap["CONCEPTO"] ?? colMap["DETALLE"] ?? 1;
    const kmInicioCol = colMap["KM INICIO"] ?? colMap["KM.INICIO"] ?? 2;
    const kmFinalCol = colMap["KM FINAL"] ?? colMap["KM.FINAL"] ?? colMap["KM FIN"] ?? 3;
    const montoCol = colMap["MONTO"] ?? colMap["IMPORTE"] ?? colMap["$"] ?? 4;

    let count = 0;
    for (let i = dataStartIdx; i < raw.length; i++) {
      const r = raw[i] as any[];
      if (!r || r.every((v: any) => v === null || v === undefined || String(v).trim() === "")) continue;

      const fecha = parseDate(r[fechaCol]);
      const concepto = clean(r[conceptoCol]);
      const monto = parseNumber(r[montoCol]);
      if (!fecha && !concepto && monto === null) continue;

      allGastos.push({
        vehiculo,
        patente,
        usuario,
        fecha,
        concepto,
        km_inicio: parseNumber(r[kmInicioCol]),
        km_final: parseNumber(r[kmFinalCol]),
        monto,
      });
      count++;
    }

    console.log(`  📄 ${sheetName}: ${count} gastos (${vehiculo || "?"} - ${patente || "?"} - ${usuario || "?"})`);
  }

  const inserted = await insertBatch("gastos_vehiculos", allGastos);
  console.log(`  ✅ Gastos vehículos: ${inserted} registros insertados`);
}

// ---------------------------------------------------------------------------
// 9) Importar mantenimientos de vehículos
// ---------------------------------------------------------------------------
async function importMantenimientos() {
  console.log("\n📋 Importando mantenimientos de vehículos...");

  const filename = "Registro Mantenimientos por vehículo.xlsx";
  let wb: XLSX.WorkBook;
  try { wb = readExcel(filename); } catch (e: any) {
    // Intentar sin tilde
    try { wb = readExcel("Registro Mantenimientos por vehiculo.xlsx"); } catch { console.error(`  ❌ ${e.message}`); return; }
  }

  const allMant: any[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;

    const raw = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null });
    if (raw.length < 2) continue;

    // Fila 0: vehículo y patente
    const headerRow = raw[0] as any[];
    let vehiculo: string | null = null;
    let patente: string | null = null;

    const headerText = (headerRow || []).filter(Boolean).map(String).join(" | ");
    const patenteMatch = headerText.match(/([A-Z]{2,3}\d{3}[A-Z]{0,3}|\d{3}[A-Z]{3})/i);
    if (patenteMatch) patente = patenteMatch[1].toUpperCase();

    for (const cell of headerRow || []) {
      if (!cell) continue;
      const s = String(cell).trim();
      if (s.match(/FORD|FIAT|RENAULT|VOLKSWAGEN|VW|CHEVROLET|TOYOTA|PEUGEOT|CITROEN/i)) {
        vehiculo = s;
      }
    }

    // Buscar fila de headers de datos
    let dataStartIdx = 1;
    let colMap: Record<string, number> = {};
    for (let i = 0; i < Math.min(raw.length, 5); i++) {
      const r = raw[i] as any[];
      if (!r) continue;
      const rowStr = r.map(String).join(" ").toUpperCase();
      if (rowStr.includes("DESCRIPCION") || rowStr.includes("FECHA") || rowStr.includes("DETALLE")) {
        for (let c = 0; c < r.length; c++) {
          if (r[c]) colMap[String(r[c]).toUpperCase().trim()] = c;
        }
        dataStartIdx = i + 1;
        break;
      }
    }

    const descCol = colMap["DESCRIPCION"] ?? colMap["DESCRIPCIÓN"] ?? colMap["DETALLE"] ?? 0;
    const fechaCol = colMap["FECHA"] ?? 1;
    const kmCol = colMap["KILOMETRAJE"] ?? colMap["KM"] ?? 2;
    const provCol = colMap["PROVEEDOR"] ?? colMap["TALLER"] ?? 3;
    const obsCol = colMap["OBSERVACIONES"] ?? colMap["OBS"] ?? 4;

    let count = 0;
    for (let i = dataStartIdx; i < raw.length; i++) {
      const r = raw[i] as any[];
      if (!r || r.every((v: any) => v === null || v === undefined || String(v).trim() === "")) continue;

      const desc = clean(r[descCol]);
      const fecha = parseDate(r[fechaCol]);
      if (!desc && !fecha) continue;

      allMant.push({
        vehiculo,
        patente,
        descripcion: desc,
        fecha,
        kilometraje: clean(r[kmCol]),
        proveedor: clean(r[provCol]),
        observaciones: clean(r[obsCol]),
      });
      count++;
    }

    console.log(`  📄 ${sheetName}: ${count} mantenimientos (${vehiculo || "?"} - ${patente || "?"})`);
  }

  const inserted = await insertBatch("mantenimientos_vehiculos", allMant);
  console.log(`  ✅ Mantenimientos: ${inserted} registros insertados`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("🚀 Iniciando migración de datos Excel → Supabase");
  console.log(`   URL: ${SUPABASE_URL}`);
  console.log(`   Data: ${DATA_DIR}\n`);

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`❌ Directorio ${DATA_DIR} no existe.`);
    process.exit(1);
  }

  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".xlsx"));
  console.log(`📂 Archivos Excel: ${files.length}`);
  files.forEach((f) => console.log(`   - ${f}`));

  // Limpiar tablas sin upsert para evitar duplicados en re-ejecución
  console.log("\n🧹 Limpiando tablas de datos (re-importación segura)...");
  for (const table of ["compras", "ordenes_compra", "pagos_proveedores", "reclamos_pagos_proveedores", "gastos_vehiculos", "mantenimientos_vehiculos"]) {
    const { error } = await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      console.log(`  ⚠️  ${table}: ${error.message} (puede no existir aún)`);
    } else {
      console.log(`  ✓ ${table} limpiada`);
    }
  }

  await importClients();
  await importProveedores();
  await importReclamos();

  const provMap = await loadProveedoresMap();
  console.log(`\n🔗 Mapa de proveedores: ${provMap.size} entries`);

  await importCompras(provMap);
  await importOrdenesCompra(provMap);
  await importPagosProveedores(provMap);
  await updateCanalFacturacion();
  await importGastosVehiculos();
  await importMantenimientos();

  console.log("\n🎉 Migración completada!");
}

main().catch((err) => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});
