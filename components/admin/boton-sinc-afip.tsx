"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { sincronizarCUIT, type AfipPadronData } from "@/lib/afip-sync"
import { RefreshCw, AlertTriangle, AlertCircle } from "lucide-react"

export interface ValoresActuales {
  razon_social?: string | null
  condicion_iva?: string | null   // string del padrón (ej "RESP. INSCRIPTO")
  domicilio?: string | null       // calle
  localidad?: string | null
  provincia?: string | null
  cp?: string | null
}

export interface CamposAFIP {
  razon_social?: string
  condicion_iva?: string | null   // null si AFIP devuelve algo no mapeable
  domicilio?: string
  localidad?: string
  provincia?: string
  cp?: string
}

type FieldKey = keyof CamposAFIP

interface Props {
  cuit: string
  valoresActuales: ValoresActuales
  onAplicar: (campos: CamposAFIP) => void
  /** Variante visual: "compact" para usar al lado de inputs, "full" para botones más grandes */
  variant?: "compact" | "full"
  /**
   * Campos del padrón que el form de destino sí puede aplicar.
   * Los NO listados se muestran greyed con label "(no aplicable)" y no se
   * pueden marcar. Útil cuando el form cubre solo un subset de los campos
   * AFIP — ej: form de nuevo proveedor que solo tiene "nombre".
   * Default: todos los campos son aplicables.
   */
  camposAplicables?: FieldKey[]
}

interface FieldRow {
  key: FieldKey
  label: string
  actual: string
  afip: string
}

export function BotonSincAfip({ cuit, valoresActuales, onAplicar, variant = "compact", camposAplicables }: Props) {
  const aplicableSet = camposAplicables ? new Set<FieldKey>(camposAplicables) : null
  const isAplicable = (k: FieldKey) => !aplicableSet || aplicableSet.has(k)
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [padron, setPadron] = useState<AfipPadronData | null>(null)
  const [selected, setSelected] = useState<Partial<Record<FieldKey, boolean>>>({})

  async function handleClick() {
    if (!cuit?.trim()) {
      alert("Ingresá un CUIT antes de sincronizar")
      return
    }
    setLoading(true)
    try {
      const data = await sincronizarCUIT(cuit)
      if (!data) {
        alert("No se encontraron datos en AFIP para este CUIT")
        return
      }
      setPadron(data)
      // Pre-marcar checkboxes para campos donde difiere Y son aplicables.
      const diff = (a: string | null | undefined, b: string | null | undefined) => norm(a) !== norm(b)
      const sel: Partial<Record<FieldKey, boolean>> = {
        razon_social: isAplicable("razon_social") && diff(data.razon_social, valoresActuales.razon_social),
        condicion_iva: isAplicable("condicion_iva") && diff(data.condicion_iva || "", valoresActuales.condicion_iva),
        domicilio: isAplicable("domicilio") && diff(data.domicilio.calle, valoresActuales.domicilio),
        localidad: isAplicable("localidad") && diff(data.domicilio.localidad, valoresActuales.localidad),
        provincia: isAplicable("provincia") && diff(data.domicilio.provincia, valoresActuales.provincia),
        cp: isAplicable("cp") && diff(data.domicilio.cp, valoresActuales.cp),
      }
      setSelected(sel)
      setDialogOpen(true)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert("Error sincronizando con AFIP: " + msg)
    } finally {
      setLoading(false)
    }
  }

  function handleAplicar() {
    if (!padron) return
    const out: CamposAFIP = {}
    if (selected.razon_social) out.razon_social = padron.razon_social
    if (selected.condicion_iva) out.condicion_iva = padron.condicion_iva
    if (selected.domicilio) out.domicilio = padron.domicilio.calle || ""
    if (selected.localidad) out.localidad = padron.domicilio.localidad || ""
    if (selected.provincia) out.provincia = padron.domicilio.provincia || ""
    if (selected.cp) out.cp = padron.domicilio.cp || ""
    onAplicar(out)
    setDialogOpen(false)
    setPadron(null)
  }

  const fields: FieldRow[] = padron ? [
    { key: "razon_social", label: "Razón social", actual: valoresActuales.razon_social || "", afip: padron.razon_social || "" },
    { key: "condicion_iva", label: "Cond. IVA", actual: valoresActuales.condicion_iva || "", afip: padron.condicion_iva || "(no mapeable)" },
    { key: "domicilio", label: "Domicilio", actual: valoresActuales.domicilio || "", afip: padron.domicilio.calle || "" },
    { key: "localidad", label: "Localidad", actual: valoresActuales.localidad || "", afip: padron.domicilio.localidad || "" },
    { key: "provincia", label: "Provincia", actual: valoresActuales.provincia || "", afip: padron.domicilio.provincia || "" },
    { key: "cp", label: "CP", actual: valoresActuales.cp || "", afip: padron.domicilio.cp || "" },
  ] : []

  const algunoNoAplicable = padron != null && fields.some((f) => !isAplicable(f.key))

  const btnSize = variant === "compact"
    ? "px-2 py-1 text-xs"
    : "px-3 py-2 text-sm"

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        title="Sincronizar datos desde el padrón AFIP"
        className={`inline-flex items-center gap-1 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-50 ${btnSize}`}
      >
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Sincronizando..." : "Sincronizar AFIP"}
      </button>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) setDialogOpen(false) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sincronizar datos AFIP</DialogTitle>
          </DialogHeader>
          {padron && (
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                <span className="font-medium">CUIT:</span> {padron.cuit} ·{" "}
                <span className="font-medium">Estado AFIP:</span>{" "}
                <span className={padron.estado === "ACTIVO" ? "text-green-700" : "text-amber-700"}>{padron.estado}</span>
              </div>

              {padron.estado === "INACTIVO" && (
                <div className="bg-amber-50 border border-amber-300 rounded-md p-3 text-sm text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>Este CUIT figura como <strong>INACTIVO</strong> en AFIP. Verificá antes de operar.</span>
                </div>
              )}

              {padron.apocrifo.es_apocrifo && (
                <div className="bg-red-50 border border-red-300 rounded-md p-3 text-sm text-red-900 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <div>
                    <p><strong>ATENCIÓN:</strong> este CUIT figura en la base APOC (apócrifos) de AFIP. Verificar antes de operar.</p>
                    {padron.apocrifo.info && padron.apocrifo.info.trim().length > 0 && (
                      <p className="mt-1 text-xs text-red-700">{padron.apocrifo.info}</p>
                    )}
                  </div>
                </div>
              )}

              {algunoNoAplicable && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-900">
                  Algunos campos del padrón no tienen destino en el form actual.
                  Para cargarlos, editá manualmente después de crear el proveedor.
                </div>
              )}

              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs">
                    <tr>
                      <th className="px-2 py-2 w-8"></th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700">Campo</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700">Actual</th>
                      <th className="px-2 py-2 text-left font-semibold text-gray-700">AFIP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => {
                      const aplicable = isAplicable(f.key)
                      const igual = norm(f.actual) === norm(f.afip)
                      const checked = !!selected[f.key]
                      const dimmed = !aplicable || igual
                      return (
                        <tr key={f.key} className={`border-t ${dimmed ? "opacity-50" : ""}`}>
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!aplicable || igual}
                              onChange={(e) => setSelected((s) => ({ ...s, [f.key]: e.target.checked }))}
                              className="h-4 w-4"
                            />
                          </td>
                          <td className="px-2 py-1.5 font-medium text-gray-700">
                            {f.label}
                            {!aplicable && (
                              <span className="ml-2 text-[10px] font-normal text-blue-700">(no aplicable)</span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-gray-600">{f.actual || <span className="text-gray-400">(vacío)</span>}</td>
                          <td className="px-2 py-1.5 text-gray-900">{f.afip || <span className="text-gray-400">(vacío)</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-gray-500">
                Aplicar actualiza los campos del formulario. <strong>No se guarda</strong> hasta que apriete "Guardar" del form.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDialogOpen(false)}
                  className="px-3 py-2 border rounded-md text-sm hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAplicar}
                  disabled={!Object.values(selected).some(Boolean)}
                  className="px-3 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  Aplicar seleccionados
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function norm(s: string | null | undefined): string {
  return String(s ?? "").trim().toUpperCase()
}
