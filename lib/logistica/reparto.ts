// Funciones puras para logística — extraídas de lib/supabase/queries.ts
// para poder testearlas sin arrastrar el cliente de Supabase.

export function proximoDiaHabil(fecha: Date = new Date()): Date {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1)
  }
  return d
}

// El N° de reparto SIEMPRE debe ser igual a la fecha de reparto en formato
// DDMMYYYY (T.6). Acepta tanto un Date como un string ISO "YYYY-MM-DD".
//
// IMPORTANTE: cuando recibe un string lo deriva de los dígitos del propio
// string, sin pasar por `new Date(...)`. Esto evita el corrimiento de día por
// zona horaria: `new Date("2026-06-09")` se parsea como UTC medianoche y, al
// leer getDate() en horario local (UTC-3), devuelve el día anterior, dejando el
// N° de reparto un día corrido respecto de la fecha.
export function formatNumeroReparto(fecha: Date | string): string {
  if (typeof fecha === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha)
    if (m) {
      const [, y, mo, d] = m
      return `${d}${mo}${y}`
    }
    fecha = new Date(fecha)
  }
  const d = String(fecha.getDate()).padStart(2, "0")
  const m = String(fecha.getMonth() + 1).padStart(2, "0")
  const y = String(fecha.getFullYear())
  return `${d}${m}${y}`
}
