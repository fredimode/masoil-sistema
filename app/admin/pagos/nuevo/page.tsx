"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { fetchProveedores, fetchFacturasProveedor, createPagoProveedor, createChequeEmitido, updateFacturaProveedor } from "@/lib/supabase/queries"
import { createClient } from "@/lib/supabase/client"
import { normalizeSearch, formatCurrency } from "@/lib/utils"
import { Paperclip, Mail, Upload, Check, Plus, Trash2 } from "lucide-react"

const EMPRESAS = ["Masoil", "Aquiles", "Conancap"]

interface ChequeItem {
  numero: string
  banco: string
  importe: string
  fecha_emision: string
  fecha_pago: string
}

export default function NuevoPagoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [proveedores, setProveedores] = useState<any[]>([])
  const [facturasProveedor, setFacturasProveedor] = useState<any[]>([])
  const [guardando, setGuardando] = useState(false)
  const [provSearch, setProvSearch] = useState("")
  const [showProvDropdown, setShowProvDropdown] = useState(false)
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Selected facturas
  const [selectedFacturaIds, setSelectedFacturaIds] = useState<Set<string>>(new Set())

  // Cheques
  const [cheques, setCheques] = useState<ChequeItem[]>([])

  const [form, setForm] = useState({
    proveedor_id: "",
    proveedor_nombre: "",
    cuit: "",
    empresa: "",
    cbu: "",
    forma_pago: "",
    observaciones: "",
    estado_pago: "PENDIENTE",
    banco_origen: "",
    referencia: "",
    email_pagos: "",
  })

  useEffect(() => {
    Promise.all([fetchProveedores(), fetchFacturasProveedor()])
      .then(([p, f]) => { setProveedores(p); setFacturasProveedor(f) })
      .catch((err) => console.error("Error cargando datos:", err))
      .finally(() => setLoading(false))
  }, [])

  const filteredProveedores = useMemo(() => {
    if (!provSearch.trim()) return []
    const q = normalizeSearch(provSearch)
    return proveedores.filter((p) =>
      normalizeSearch(p.nombre || "").includes(q) ||
      normalizeSearch(p.cuit || "").includes(q)
    ).slice(0, 15)
  }, [provSearch, proveedores])

  function selectProveedor(prov: any) {
    setForm((prev) => ({
      ...prev,
      proveedor_id: String(prov.id),
      proveedor_nombre: prov.nombre || "",
      cuit: prov.cuit || "",
      empresa: prov.empresa || "",
      cbu: prov.cbu || "",
      email_pagos: prov.email_pagos || "",
    }))
    setProvSearch(prov.nombre || "")
    setShowProvDropdown(false)
    setSelectedFacturaIds(new Set())
  }

  // Facturas del proveedor seleccionado (no pagadas)
  const facturasPendientes = useMemo(() => {
    if (!form.proveedor_id) return []
    return facturasProveedor.filter(
      (f) => f.proveedor_id === form.proveedor_id && f.estado !== "pagada"
    )
  }, [form.proveedor_id, facturasProveedor])

  function toggleFactura(id: string) {
    setSelectedFacturaIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalFacturasSeleccionadas = useMemo(() => {
    return facturasPendientes
      .filter((f) => selectedFacturaIds.has(f.id))
      .reduce((sum, f) => sum + (Number(f.saldo_pendiente) || Number(f.total) || 0), 0)
  }, [selectedFacturaIds, facturasPendientes])

  const totalCheques = cheques.reduce((sum, c) => sum + (Number(c.importe) || 0), 0)

  // Cheque management
  function addCheque() {
    setCheques([...cheques, { numero: "", banco: "", importe: "", fecha_emision: "", fecha_pago: "" }])
  }
  function removeCheque(idx: number) {
    setCheques(cheques.filter((_, i) => i !== idx))
  }
  function updateCheque(idx: number, field: keyof ChequeItem, value: string) {
    setCheques(cheques.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  const showCBU = form.forma_pago === "Transferencia"
  const showCheques = form.forma_pago === "Cheque" || form.forma_pago === "Echeq"
  const showCompensacion = form.forma_pago === "Compensación"

  const importeTotal = showCheques ? totalCheques : totalFacturasSeleccionadas

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedFacturaIds.size === 0) {
      alert("Seleccione al menos una factura a pagar")
      return
    }
    setGuardando(true)
    try {
      const supabase = createClient()

      const importe = showCheques ? totalCheques : totalFacturasSeleccionadas

      // Create pago
      const { data: pagoData, error: pagoError } = await supabase
        .from("pagos_proveedores")
        .insert({
          proveedor_id: form.proveedor_id || null,
          proveedor_nombre: form.proveedor_nombre,
          cuit: form.cuit || null,
          empresa: form.empresa || null,
          importe,
          forma_pago: form.forma_pago || null,
          cbu: form.cbu || null,
          observaciones: form.observaciones || null,
          estado_pago: form.estado_pago,
          banco: form.banco_origen || null,
          origen: form.referencia || null,
        })
        .select("id")
        .single()

      if (pagoError) throw pagoError
      const pagoId = pagoData.id

      // Create cheques if applicable
      if (showCheques && cheques.length > 0) {
        for (const cheque of cheques) {
          if (!cheque.numero && !cheque.importe) continue
          await createChequeEmitido({
            pago_id: pagoId,
            numero: cheque.numero,
            banco: cheque.banco,
            importe: Number(cheque.importe) || 0,
            fecha_emision: cheque.fecha_emision || null,
            fecha_pago: cheque.fecha_pago || null,
            tipo: form.forma_pago === "Echeq" ? "echeq" : "cheque",
          })
        }
      }

      // Upload comprobante
      if (comprobanteFile && pagoId) {
        const ext = comprobanteFile.name.split(".").pop()
        const path = `pagos/${pagoId}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from("comprobantes")
          .upload(path, comprobanteFile)
        if (!uploadError) {
          await supabase.from("pagos_proveedores").update({ comprobante_url: path }).eq("id", pagoId)
        }
      }

      // Update facturas status
      for (const facturaId of selectedFacturaIds) {
        const factura = facturasPendientes.find((f) => f.id === facturaId)
        if (!factura) continue
        const saldoActual = Number(factura.saldo_pendiente) || Number(factura.total) || 0
        const nuevoSaldo = Math.max(0, saldoActual - importe)
        await updateFacturaProveedor(facturaId, {
          estado: nuevoSaldo <= 0 ? "pagada" : "pagada_parcial",
          saldo_pendiente: nuevoSaldo,
        })
      }

      // Send email if provided
      if (form.email_pagos && pagoId) {
        try {
          await fetch("/api/admin/pagos/enviar-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pagoId, email: form.email_pagos }),
          })
        } catch {
          // non-blocking
        }
      }

      router.push("/admin/pagos")
    } catch (error) {
      console.error("Error creando pago:", error)
      alert("Error al crear el pago")
    } finally {
      setGuardando(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-20">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2 text-gray-600">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link href="/admin/pagos" className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block">
          &larr; Volver a Pagos
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Nuevo Pago a Proveedor</h2>
        <p className="text-gray-500">Seleccionar facturas pendientes y registrar el pago</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Proveedor Autocomplete */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Proveedor</h3>
          <div className="relative">
            <input
              type="text"
              placeholder="Buscar proveedor por nombre o CUIT..."
              value={provSearch}
              onChange={(e) => {
                setProvSearch(e.target.value)
                setShowProvDropdown(true)
                if (!e.target.value.trim()) {
                  setForm((prev) => ({ ...prev, proveedor_id: "", proveedor_nombre: "", cuit: "", empresa: "", cbu: "", email_pagos: "" }))
                }
              }}
              onFocus={() => provSearch.trim() && setShowProvDropdown(true)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              autoComplete="off"
              required
            />
            {showProvDropdown && filteredProveedores.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto mt-1">
                {filteredProveedores.map((p) => (
                  <button key={p.id} type="button" className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm border-b last:border-b-0" onClick={() => selectProveedor(p)}>
                    <span className="font-medium">{p.nombre}</span>
                    {p.cuit && <span className="text-gray-500 ml-2">CUIT: {p.cuit}</span>}
                    {p.empresa && <span className="text-gray-400 ml-2">({p.empresa})</span>}
                  </button>
                ))}
              </div>
            )}
            {form.proveedor_nombre && (
              <div className="mt-2 flex gap-4 text-xs text-gray-500">
                <span>CUIT: {form.cuit || "-"}</span>
                <span>Empresa: {form.empresa || "-"}</span>
                <span>CBU: {form.cbu ? form.cbu.slice(0, 10) + "..." : "-"}</span>
              </div>
            )}
          </div>
        </div>

        {/* Facturas pendientes del proveedor */}
        {form.proveedor_id && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Facturas Pendientes</h3>
            {facturasPendientes.length === 0 ? (
              <p className="text-sm text-gray-500">No hay facturas pendientes para este proveedor</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left w-10"></th>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-left">Tipo</th>
                        <th className="px-3 py-2 text-left">Comprobante</th>
                        <th className="px-3 py-2 text-right">Total</th>
                        <th className="px-3 py-2 text-right">Saldo Pendiente</th>
                        <th className="px-3 py-2 text-left">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {facturasPendientes.map((f) => (
                        <tr key={f.id} className={selectedFacturaIds.has(f.id) ? "bg-blue-50" : "hover:bg-gray-50"}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedFacturaIds.has(f.id)}
                              onChange={() => toggleFactura(f.id)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-3 py-2 text-gray-600">{f.fecha || "-"}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${f.tipo === "NOTA_CREDITO" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                              {f.tipo === "NOTA_CREDITO" ? "NC" : "FC"} {f.letra || ""}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{f.punto_venta || ""}-{f.numero || ""}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatCurrency(Number(f.total) || 0)}</td>
                          <td className="px-3 py-2 text-right font-bold text-red-600">{formatCurrency(Number(f.saldo_pendiente) || Number(f.total) || 0)}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${f.estado === "pagada_parcial" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                              {f.estado === "pagada_parcial" ? "Parcial" : "Pendiente"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {selectedFacturaIds.size > 0 && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-center">
                    <span className="text-sm text-blue-700">{selectedFacturaIds.size} factura(s) seleccionada(s)</span>
                    <span className="font-bold text-blue-900">Total: {formatCurrency(totalFacturasSeleccionadas)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Forma de pago */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Forma de Pago</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600 block mb-1 font-medium">Forma de Pago *</label>
              <select
                value={form.forma_pago}
                onChange={(e) => {
                  setForm((prev) => ({ ...prev, forma_pago: e.target.value, banco_origen: "", referencia: "" }))
                  if (e.target.value !== "Cheque" && e.target.value !== "Echeq") setCheques([])
                }}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                required
              >
                <option value="">Seleccionar...</option>
                <option value="Efectivo">Efectivo</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Cheque">Cheque</option>
                <option value="Echeq">Echeq</option>
                <option value="Compensación">Compensación</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1 font-medium">Estado</label>
              <select
                value={form.estado_pago}
                onChange={(e) => setForm((prev) => ({ ...prev, estado_pago: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              >
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="PAGADO">PAGADO</option>
              </select>
            </div>
          </div>

          {/* Transferencia fields */}
          {showCBU && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
              <div>
                <label className="text-sm text-blue-800 block mb-1 font-medium">CBU del proveedor</label>
                <input
                  type="text"
                  value={form.cbu}
                  onChange={(e) => setForm((prev) => ({ ...prev, cbu: e.target.value }))}
                  className="w-full p-2 border rounded-lg text-sm"
                  placeholder="Auto-completado del proveedor"
                />
              </div>
              <div>
                <label className="text-sm text-blue-800 block mb-1 font-medium">Banco Origen</label>
                <select
                  value={form.banco_origen}
                  onChange={(e) => setForm((prev) => ({ ...prev, banco_origen: e.target.value }))}
                  className="w-full p-2 border rounded-lg text-sm"
                >
                  <option value="">Seleccionar banco...</option>
                  <option value="Banco Masoil 1">Banco Masoil 1</option>
                  <option value="Banco Masoil 2">Banco Masoil 2</option>
                </select>
              </div>
            </div>
          )}

          {/* Cheque / Echeq fields */}
          {showCheques && (
            <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm text-purple-800 font-medium">
                  {form.forma_pago === "Echeq" ? "Echeqs" : "Cheques"}
                </label>
                <button type="button" onClick={addCheque} className="px-3 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Agregar {form.forma_pago === "Echeq" ? "echeq" : "cheque"}
                </button>
              </div>
              {cheques.length === 0 && (
                <p className="text-sm text-purple-600">Agregue al menos un {form.forma_pago === "Echeq" ? "echeq" : "cheque"}</p>
              )}
              {cheques.map((cheque, idx) => (
                <div key={idx} className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-2 items-end">
                  <div>
                    <label className="text-xs text-purple-700">Número</label>
                    <input type="text" value={cheque.numero} onChange={(e) => updateCheque(idx, "numero", e.target.value)} className="w-full p-1.5 border rounded text-xs" placeholder="Nro" />
                  </div>
                  <div>
                    <label className="text-xs text-purple-700">Banco</label>
                    <input type="text" value={cheque.banco} onChange={(e) => updateCheque(idx, "banco", e.target.value)} className="w-full p-1.5 border rounded text-xs" placeholder="Banco" />
                  </div>
                  <div>
                    <label className="text-xs text-purple-700">Importe</label>
                    <input type="number" step="0.01" value={cheque.importe} onChange={(e) => updateCheque(idx, "importe", e.target.value)} className="w-full p-1.5 border rounded text-xs" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="text-xs text-purple-700">F. Emisión</label>
                    <input type="date" value={cheque.fecha_emision} onChange={(e) => updateCheque(idx, "fecha_emision", e.target.value)} className="w-full p-1.5 border rounded text-xs" />
                  </div>
                  <div>
                    <label className="text-xs text-purple-700">F. Pago</label>
                    <input type="date" value={cheque.fecha_pago} onChange={(e) => updateCheque(idx, "fecha_pago", e.target.value)} className="w-full p-1.5 border rounded text-xs" />
                  </div>
                  <div>
                    <button type="button" onClick={() => removeCheque(idx)} className="p-1.5 text-red-600 hover:bg-red-100 rounded">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {cheques.length > 0 && (
                <div className="mt-2 text-right text-sm font-bold text-purple-800">
                  Total cheques: {formatCurrency(totalCheques)}
                </div>
              )}
            </div>
          )}

          {/* Compensación */}
          {showCompensacion && (
            <div className="mt-4">
              <label className="text-sm text-gray-600 block mb-1 font-medium">Referencia compensación</label>
              <input
                type="text"
                value={form.referencia}
                onChange={(e) => setForm((prev) => ({ ...prev, referencia: e.target.value }))}
                className="w-full p-2 border rounded-lg text-sm"
                placeholder="Referencia de la compensación"
              />
            </div>
          )}
        </div>

        {/* Email & adjuntos */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h3 className="font-semibold text-gray-900 mb-2">Comprobante y Notificación</h3>

          <div>
            <label className="text-sm text-gray-600 block mb-1 font-medium">Email de pagos</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={form.email_pagos}
                onChange={(e) => setForm((prev) => ({ ...prev, email_pagos: e.target.value }))}
                className="flex-1 p-2 border rounded-lg text-sm"
                placeholder="Email del proveedor para enviar comprobante"
              />
              <button type="button" className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm flex items-center gap-1 whitespace-nowrap" disabled={!form.email_pagos}>
                <Mail className="h-4 w-4" /> Enviar mail
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-600 block mb-1 font-medium">Observaciones</label>
            <textarea
              value={form.observaciones}
              onChange={(e) => setForm((prev) => ({ ...prev, observaciones: e.target.value }))}
              className="w-full p-2 border rounded-lg text-sm"
              rows={3}
              placeholder="Notas adicionales..."
            />
          </div>

          <div>
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) setComprobanteFile(file) }} />
            <button
              type="button"
              className={`px-4 py-2 rounded-lg text-sm flex items-center gap-2 ${comprobanteFile ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              onClick={() => fileInputRef.current?.click()}
            >
              {comprobanteFile ? <Check className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
              {comprobanteFile ? comprobanteFile.name : "Adjuntar comprobante (PDF, JPG, PNG)"}
            </button>
            {comprobanteFile && (
              <button type="button" onClick={() => setComprobanteFile(null)} className="text-xs text-red-500 ml-2 hover:underline">Quitar</button>
            )}
          </div>
        </div>

        {/* Resumen y botones */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-lg font-semibold text-gray-900">Total a pagar</span>
            <span className="text-2xl font-bold text-primary">{formatCurrency(importeTotal)}</span>
          </div>
          <div className="flex justify-end gap-3">
            <Link href="/admin/pagos" className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={guardando || !form.proveedor_nombre || !form.forma_pago || selectedFacturaIds.size === 0}
              className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400 text-sm font-medium"
            >
              {guardando ? "Guardando..." : "Registrar Pago"}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
