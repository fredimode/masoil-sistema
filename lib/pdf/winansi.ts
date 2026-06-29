import type { PDFPage } from "pdf-lib"

// Caracteres del rango 0x80–0x9F de CP1252 que las fuentes estándar de pdf-lib
// (WinAnsi) SÍ pueden codificar. Latin-1 (0x20–0x7E y 0xA0–0xFF) ya entra por
// rango; estos son los "extras" tipográficos de Windows-1252.
const WINANSI_HIGH = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"

// Reemplazos legibles para caracteres frecuentes fuera de WinAnsi. Lo que no
// esté acá ni sea WinAnsi-codificable se descarta.
const REPLACEMENTS: Record<string, string> = {
  "⚠": "", // signo de advertencia: el color rojo del PDF ya marca el aviso
  "✓": "",
  "✔": "",
  "✗": "",
  "→": "->",
  "←": "<-",
}

/**
 * Limpia un string para que pueda renderizarse con la codificación WinAnsi que
 * usan las fuentes estándar de pdf-lib. Los emojis y cualquier carácter fuera
 * de Latin-1 / CP1252 rompen el render con "WinAnsi cannot encode …"; acá se
 * reemplazan o se descartan. SOLO para texto que va al PDF: en pantalla el
 * aviso (p. ej. CAI vencido ⚠️) debe seguir mostrándose con su emoji.
 */
export function sanitizeWinAnsi(text: string): string {
  if (!text) return text
  let out = ""
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0
    if (
      (cp >= 0x20 && cp <= 0x7e) || // ASCII imprimible
      (cp >= 0xa0 && cp <= 0xff) || // Latin-1 suplemento (á, é, ñ, °, ¿, …)
      cp === 0x0a || cp === 0x0d || cp === 0x09 // saltos / tab
    ) {
      out += ch
      continue
    }
    if (WINANSI_HIGH.includes(ch)) {
      out += ch
      continue
    }
    const repl = REPLACEMENTS[ch]
    out += repl !== undefined ? repl : ""
  }
  return out
}

/**
 * Envuelve `page.drawText` para que TODO texto pase por `sanitizeWinAnsi` antes
 * de renderizarse. Llamar una vez por página apenas se crea: así ningún emoji o
 * carácter raro (observaciones, datos del cliente, etc.) vuelve a romper el PDF.
 */
export function guardWinAnsi(page: PDFPage): void {
  const original = page.drawText.bind(page)
  page.drawText = ((text: string, options?: Parameters<typeof original>[1]) =>
    original(sanitizeWinAnsi(text), options)) as typeof page.drawText
}
