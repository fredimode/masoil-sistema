// Funciones puras para logística — extraídas de lib/supabase/queries.ts
// para poder testearlas sin arrastrar el cliente de Supabase.

export function proximoDiaHabil(fecha: Date = new Date()): Date {
  const d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1)
  }
  return d
}

export function formatNumeroReparto(fecha: Date): string {
  const d = String(fecha.getDate()).padStart(2, "0")
  const m = String(fecha.getMonth() + 1).padStart(2, "0")
  const y = String(fecha.getFullYear())
  return `${d}${m}${y}`
}
