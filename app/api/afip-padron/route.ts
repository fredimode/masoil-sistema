import { NextRequest, NextResponse } from "next/server"
import {
  limpiarCuit,
  validarCuit,
  mapCondicionIVA,
  type AfipPadronData,
} from "@/lib/afip-sync"

const TUSFACTURAS_AFIP_INFO_URL = "https://www.tusfacturas.app/app/api/v2/clientes/afip-info"

// Wrapper server-side. Las credenciales TusFacturas no se exponen al browser.
// El frontend llama a /api/afip-padron?cuit=NNNNNNNNNNN.
export async function GET(request: NextRequest) {
  const cuitRaw = request.nextUrl.searchParams.get("cuit") || ""
  const cuit = limpiarCuit(cuitRaw)
  console.log("[afip-padron] consulta CUIT:", cuit)
  if (!validarCuit(cuit)) {
    console.log("[afip-padron] CUIT inválido (formato/DV)")
    return NextResponse.json({ error: "CUIT inválido" }, { status: 400 })
  }

  const apikey = process.env.TUSFACTURAS_APIKEY
  const apitoken = process.env.TUSFACTURAS_APITOKEN
  // El padrón AFIP es nacional: cualquier usertoken enlazado con ARCA sirve.
  // Default: TUSFACTURAS_USERTOKEN_PADRON si está, fallback a Aquiles producción.
  const usertoken =
    process.env.TUSFACTURAS_USERTOKEN_PADRON ||
    process.env.TUSFACTURAS_USERTOKEN_AQUILES_PROD
  if (!apikey || !apitoken || !usertoken) {
    return NextResponse.json(
      { error: "Falta configuración TusFacturas (APIKEY/APITOKEN/USERTOKEN_PADRON o USERTOKEN_AQUILES_PROD)" },
      { status: 500 },
    )
  }

  let tfData: Record<string, unknown>
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 15000)
    const resp = await fetch(TUSFACTURAS_AFIP_INFO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apikey,
        apitoken,
        usertoken,
        cliente: { documento_nro: cuit, documento_tipo: "CUIT" },
      }),
      signal: ctrl.signal,
    })
    clearTimeout(timer)
    tfData = (await resp.json()) as Record<string, unknown>
    console.log("[afip-padron] TF response error:", tfData.error, "razon_social:", tfData.razon_social ? "(presente)" : "(ausente)")
  } catch (e) {
    return NextResponse.json(
      { error: "Timeout o error de red con TusFacturas: " + (e instanceof Error ? e.message : "desconocido") },
      { status: 502 },
    )
  }

  // TusFacturas devuelve error: "S" cuando algo falla, error: "N" cuando OK.
  if (tfData.error === "S" || (Array.isArray(tfData.errores) && tfData.errores.length > 0)) {
    // tfData.errores a veces viene como [[msg1, msg2]] (array de arrays).
    // .flat(Infinity) lo aplana antes del join para no obtener comas raras.
    const erroresRaw = (tfData.errores as unknown[] | undefined) || [
      (tfData.error_message as string) || "Error desconocido",
    ]
    const errores = (erroresRaw.flat(Infinity) as unknown[])
      .map((m) => String(m).trim())
      .filter(Boolean)
    return NextResponse.json(
      { error: "TusFacturas: " + errores.join("; "), tf_response: tfData },
      { status: 422 },
    )
  }

  // Si TF devuelve OK pero sin datos significa que el CUIT no se encontró.
  if (!tfData.razon_social && !tfData.estado) {
    return NextResponse.json({ found: false })
  }

  // TF a veces devuelve "CP: 1405" (con prefijo literal). Strippeamos para
  // que el form de cliente reciba solo el número limpio.
  const cpRaw = (tfData.codigopostal as string) || ""
  const cpClean = cpRaw.replace(/^CP:\s*/i, "").trim() || undefined

  const data: AfipPadronData = {
    cuit,
    razon_social: String(tfData.razon_social || ""),
    condicion_iva: mapCondicionIVA(tfData.condicion_impositiva as string | undefined),
    domicilio: {
      calle: (tfData.direccion as string) || undefined,
      localidad: (tfData.localidad as string) || undefined,
      provincia: (tfData.provincia as string) || undefined,
      cp: cpClean,
    },
    estado: tfData.estado === "INACTIVO" ? "INACTIVO" : "ACTIVO",
    apocrifo: {
      es_apocrifo: tfData.apoc_existe === "SI",
      info: typeof tfData.apoc_info === "string" ? tfData.apoc_info : null,
    },
  }

  return NextResponse.json({ found: true, data })
}
