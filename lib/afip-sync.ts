// Sincronización con padrón AFIP vía TusFacturas (/clientes/afip-info).
// Las credenciales viven en el server (no exponemos al browser); el cliente
// solo llama al wrapper /api/afip-padron.

export interface AfipPadronData {
  cuit: string                      // 11 dígitos sin guiones
  razon_social: string
  // String que matchea con clients.condicion_iva / proveedores.condicion_iva
  // existentes ("RESP. INSCRIPTO", "MONOTRIBUTISTA", "EXENTO", "CONSUMIDOR FINAL").
  // null si TusFacturas devuelve algo no mapeable o vacío — el usuario completa.
  condicion_iva: string | null
  domicilio: {
    calle?: string
    localidad?: string
    provincia?: string
    cp?: string
  }
  estado: "ACTIVO" | "INACTIVO"
  apocrifo: {
    es_apocrifo: boolean
    info?: string | null
  }
}

export function limpiarCuit(cuit: string): string {
  return String(cuit || "").replace(/[-\s]/g, "")
}

// Valida formato (11 dígitos) + dígito verificador AFIP.
export function validarCuit(cuit: string): boolean {
  const c = limpiarCuit(cuit)
  if (!/^\d{11}$/.test(c)) return false
  const mults = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  let sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(c[i], 10) * mults[i]
  let expected = 11 - (sum % 11)
  if (expected === 11) expected = 0
  if (expected === 10) return false  // CUIT con DV=10 es inválido en AFIP
  return expected === parseInt(c[10], 10)
}

// Mapea el string que devuelve TusFacturas (campo condicion_impositiva) al
// string que ya está guardado en clients.condicion_iva / proveedores.condicion_iva.
// Mantenemos el formato existente para evitar churn de data.
export function mapCondicionIVA(tf: string | null | undefined): string | null {
  if (!tf) return null
  const up = String(tf).toUpperCase().trim()
  if (up === "RESPONSABLE INSCRIPTO" || up === "RESP. INSCRIPTO" || up === "RI") return "RESP. INSCRIPTO"
  if (up === "MONOTRIBUTO" || up === "MONOTRIBUTISTA" || up === "MT") return "MONOTRIBUTISTA"
  if (up === "EXENTO" || up === "EX" || up === "E") return "EXENTO"
  if (up === "CONSUMIDOR FINAL" || up === "CF") return "CONSUMIDOR FINAL"
  return null
}

// Cliente del wrapper local. Llamar desde browser.
// Devuelve null si AFIP no encuentra el CUIT, lanza Error en otros casos.
export async function sincronizarCUIT(cuit: string): Promise<AfipPadronData | null> {
  const c = limpiarCuit(cuit)
  if (!validarCuit(c)) throw new Error("CUIT inválido (formato o dígito verificador)")
  const res = await fetch(`/api/afip-padron?cuit=${c}`, { method: "GET" })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`)
  }
  return data?.found ? (data.data as AfipPadronData) : null
}
