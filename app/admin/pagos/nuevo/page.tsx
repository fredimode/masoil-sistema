"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { fetchProveedores, fetchFacturasProveedor, createPagoProveedor, createChequeEmitido, updateFacturaProveedor, createMovimientoCuentaCorrienteProveedor } from "@/lib/supabase/queries"
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

interface FormaPagoItem {
  id: string
  tipo: string
  importe: string
  banco_entidad: string
  nro_autorizacion: string
  referencia: string
  cbu: string
  banco_origen: string
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function emptyFormaPago(): FormaPagoItem {
  return { id: uid(), tipo: "", importe: "", banco_entidad: "", nro_autorizacion: "", referencia: "", cbu: "", banco_origen: "" }
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

  // Multiple formas de pago
  const [formasPago, setFormasPago] = useState<FormaPagoItem[]>([emptyFormaPago()])

  // Cheques (linked to cheque/echeq formas de pago)
  const [cheques, setCheques] = useState<ChequeItem[]>([])

  const [form, setForm] = useState({
    proveedor_id: "",
    proveedor_nombre: "",
    cuit: "",
    empresa: "",
    cbu: "",
    observaciones: "",
    estado_pago: "PENDIENTE",
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

  // Formas de pago management
  function updateFormaPago(id: string, field: string, value: string) {
    setFormasPago((prev) => prev.map((fp) => fp.id === id ? { ...fp, [field]: value } : fp))
  }
  function removeFormaPago(id: string) {
    setFormasPago((prev) => prev.filter((fp) => fp.id !== id))
  }

  const totalFormasPago = useMemo(() => {
    return formasPago.reduce((sum, fp) => sum + (parseFloat(fp.importe) || 0), 0)
  }, [formasPago])

  const hasChequeFormaPago = formasPago.some((fp) => fp.tipo === "Cheque" || fp.tipo === "Echeq")
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

  const importeTotal = totalFormasPago

  // Validation: total formas de pago should match facturas
  const diferencia = totalFormasPago - totalFacturasSeleccionadas

  async function generateOrdenPagoPDF(pagoId: string, empresa: string) {
    const { default: jsPDF } = await import("jspdf")
    const doc = new jsPDF()

    // Get correlative number
    const supabase = createClient()
    const prefix = `OP-${(empresa || "MASOIL").toUpperCase()}-`
    const { data: lastOP } = await supabase
      .from("pagos_proveedores")
      .select("orden_pago_numero")
      .like("orden_pago_numero", `${prefix}%`)
      .order("orden_pago_numero", { ascending: false })
      .limit(1)
      .single()

    const lastNum = lastOP?.orden_pago_numero
      ? parseInt(lastOP.orden_pago_numero.replace(prefix, ""), 10) || 0
      : 0
    const opNumero = `${prefix}${String(lastNum + 1).padStart(4, "0")}`

    // Header
    doc.setFontSize(18)
    doc.text("ORDEN DE PAGO", 105, 20, { align: "center" })
    doc.setFontSize(12)
    doc.text(opNumero, 105, 28, { align: "center" })
    doc.setFontSize(10)
    doc.text(`Empresa: ${empresa || "-"}`, 14, 40)
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-AR")}`, 140, 40)

    // Proveedor
    doc.setFontSize(11)
    doc.text("Datos del Proveedor", 14, 52)
    doc.setFontSize(9)
    doc.text(`Razon Social: ${form.proveedor_nombre}`, 14, 59)
    doc.text(`CUIT: ${form.cuit || "-"}`, 14, 65)

    // Facturas canceladas (o pago a cuenta)
    const esPagoACuenta = selectedFacturaIds.size === 0
    doc.setFontSize(11)
    doc.text(esPagoACuenta ? "Pago a Cuenta (anticipo)" : "Facturas Canceladas", 14, 78)
    let y = 85
    if (esPagoACuenta) {
      doc.setFontSize(9)
      doc.text(`Importe anticipado: ${formatCurrency(importeTotal)}`, 14, y)
      doc.text("Este pago figurará como DEBE en la cuenta corriente del proveedor.", 14, y + 6)
      y += 16
    } else {
      doc.setFontSize(8)
      doc.text("Tipo", 14, y)
      doc.text("Comprobante", 40, y)
      doc.text("Total", 100, y)
      doc.text("Saldo", 140, y)
      y += 5
      doc.line(14, y, 196, y)
      y += 4

      for (const facturaId of selectedFacturaIds) {
        const f = facturasPendientes.find((fac) => fac.id === facturaId)
        if (!f) continue
        const tipo = f.tipo === "NOTA_CREDITO" ? "NC" : f.tipo === "NOTA_DEBITO" ? "ND" : "FC"
        doc.text(`${tipo} ${f.letra || ""}`, 14, y)
        doc.text(`${f.punto_venta || ""}-${f.numero || ""}`, 40, y)
        doc.text(formatCurrency(Number(f.total) || 0), 100, y)
        doc.text(formatCurrency(Number(f.saldo_pendiente) || Number(f.total) || 0), 140, y)
        y += 5
        if (y > 260) { doc.addPage(); y = 20 }
      }
    }

    // Formas de pago
    y += 8
    doc.setFontSize(11)
    doc.text("Formas de Pago", 14, y)
    y += 7
    doc.setFontSize(8)
    for (const fp of formasPago) {
      if (!fp.tipo) continue
      let detail = fp.tipo
      if (fp.tipo === "Tarjeta de crédito" && fp.banco_entidad) detail += ` - ${fp.banco_entidad}`
      doc.text(detail, 14, y)
      doc.text(formatCurrency(parseFloat(fp.importe) || 0), 140, y)
      y += 5
    }

    // Total
    y += 5
    doc.line(14, y, 196, y)
    y += 6
    doc.setFontSize(12)
    doc.text(`TOTAL: ${formatCurrency(importeTotal)}`, 140, y)

    // Upload to Supabase Storage
    const pdfBlob = doc.output("blob")
    const path = `ordenes-pago/${pagoId}/${opNumero}.pdf`
    await supabase.storage.from("comprobantes").upload(path, pdfBlob, { contentType: "application/pdf" })

    // Update pago record
    await supabase.from("pagos_proveedores").update({
      orden_pago_numero: opNumero,
      orden_pago_url: path,
    }).eq("id", pagoId)

    return opNumero
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const esPagoACuenta = selectedFacturaIds.size === 0
    if (formasPago.every((fp) => !fp.tipo)) {
      alert("Agregue al menos una forma de pago")
      return
    }
    if (esPagoACuenta && importeTotal <= 0) {
      alert("Ingrese un importe válido para el pago a cuenta")
      return
    }
    if (!esPagoACuenta && Math.abs(diferencia) > 0.01 && diferencia < -0.01) {
      alert("El total de formas de pago no cubre las facturas seleccionadas")
      return
    }
    if (esPagoACuenta) {
      const msg = `No seleccionó facturas. Se registrará como Pago a Cuenta por ${formatCurrency(importeTotal)}. ¿Continuar?`
      if (!confirm(msg)) return
    }
    setGuardando(true)
    try {
      const supabase = createClient()

      // Build forma_pago string (main one) and total
      const formasPagoStr = formasPago.filter((fp) => fp.tipo).map((fp) => fp.tipo).join(", ")

      // Create pago
      const { data: pagoData, error: pagoError } = await supabase
        .from("pagos_proveedores")
        .insert({
          proveedor_id: form.proveedor_id || null,
          proveedor_nombre: form.proveedor_nombre,
          cuit: form.cuit || null,
          empresa: form.empresa || null,
          importe: importeTotal,
          forma_pago: formasPagoStr || null,
          cbu: form.cbu || null,
          observaciones: form.observaciones || null,
          estado_pago: form.estado_pago,
          banco: formasPago.find((fp) => fp.banco_origen)?.banco_origen || null,
          origen: formasPago.find((fp) => fp.referencia)?.referencia || null,
          tipo: esPagoACuenta ? "PAGO_A_CUENTA" : "FACTURAS",
        })
        .select("id")
        .single()

      if (pagoError) throw pagoError
      const pagoId = pagoData.id

      // Create cheques if applicable
      if (hasChequeFormaPago && cheques.length > 0) {
        const chequeFormaPago = formasPago.find((fp) => fp.tipo === "Cheque" || fp.tipo === "Echeq")
        for (const cheque of cheques) {
          if (!cheque.numero && !cheque.importe) continue
          await createChequeEmitido({
            pago_id: pagoId,
            numero: cheque.numero,
            banco: cheque.banco,
            importe: Number(cheque.importe) || 0,
            fecha_emision: cheque.fecha_emision || null,
            fecha_pago: cheque.fecha_pago || null,
            tipo: chequeFormaPago?.tipo === "Echeq" ? "echeq" : "cheque",
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

      // Update facturas status (solo si hay facturas seleccionadas)
      if (!esPagoACuenta) {
        for (const facturaId of selectedFacturaIds) {
          const factura = facturasPendientes.find((f) => f.id === facturaId)
          if (!factura) continue
          const saldoActual = Number(factura.saldo_pendiente) || Number(factura.total) || 0
          const nuevoSaldo = Math.max(0, saldoActual - importeTotal)
          await updateFacturaProveedor(facturaId, {
            estado: nuevoSaldo <= 0 ? "pagada" : "pagada_parcial",
            saldo_pendiente: nuevoSaldo,
          })
        }
      }

      // Generate Orden de Pago PDF
      try {
        await generateOrdenPagoPDF(pagoId, form.empresa)
      } catch (err) {
        console.error("Error generando orden de pago:", err)
      }

      // Si es pago a cuenta, registrar movimiento DEBE en cuenta corriente del proveedor
      if (esPagoACuenta && form.proveedor_id) {
        try {
          await createMovimientoCuentaCorrienteProveedor({
            proveedor_id: form.proveedor_id,
            fecha: new Date().toISOString().slice(0, 10),
            tipo_comprobante: "PC",
            numero_comprobante: null,
            debe: importeTotal,
            haber: 0,
            referencia_id: pagoId,
            observaciones: `Pago a cuenta - ${form.observaciones || "anticipo"}`,
          })
        } catch (err) {
          console.error("Error registrando pago a cuenta en cta cte:", err)
        }
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
        {/* Empresa */}
        <div className="bg-white rounded-lg shadow p-6">
          <label className="font-semibold text-gray-900 block mb-2">Empresa *</label>
          <select
            value={form.empresa}
            onChange={(e) => setForm((prev) => ({ ...prev, empresa: e.target.value }))}
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            required
          >
            <option value="">Seleccionar empresa...</option>
            {EMPRESAS.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>

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
                            <span className={`text-xs font-medium px-2 py-0.5 rounded ${f.tipo === "NOTA_CREDITO" ? "bg-orange-100 text-orange-700" : f.tipo === "NOTA_DEBITO" ? "bg-orange-100 text-orange-700" : "bg-blue-100 text-blue-700"}`}>
                              {f.tipo === "NOTA_CREDITO" ? "NC" : f.tipo === "NOTA_DEBITO" ? "ND" : "FC"} {f.letra || ""}
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
                {selectedFacturaIds.size > 0 ? (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex justify-between items-center">
                    <span className="text-sm text-blue-700">{selectedFacturaIds.size} factura(s) seleccionada(s)</span>
                    <span className="font-bold text-blue-900">Total: {formatCurrency(totalFacturasSeleccionadas)}</span>
                  </div>
                ) : (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm text-amber-800">
                      <strong>Sin facturas seleccionadas:</strong> el pago se registrará como <em>Pago a Cuenta</em> (anticipo) y figurará como DEBE en la cuenta corriente del proveedor.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Formas de pago (múltiples) */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Formas de Pago</h3>
            <button
              type="button"
              onClick={() => setFormasPago((prev) => [...prev, emptyFormaPago()])}
              className="px-3 py-1.5 bg-primary text-white rounded text-xs hover:bg-primary/90 flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Agregar forma de pago
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
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

          <div className="space-y-3">
            {formasPago.map((fp) => (
              <div key={fp.id} className="border rounded-lg p-4 bg-gray-50 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-xs text-gray-500">Forma de Pago</label>
                    <select
                      value={fp.tipo}
                      onChange={(e) => updateFormaPago(fp.id, "tipo", e.target.value)}
                      className="w-full p-2 border rounded-lg text-sm"
                    >
                      <option value="">Seleccionar...</option>
                      <option value="Efectivo">Efectivo</option>
                      <option value="Transferencia">Transferencia</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Echeq">Echeq</option>
                      <option value="Tarjeta de crédito">Tarjeta de crédito</option>
                      <option value="Compensación">Compensación</option>
                    </select>
                  </div>
                  <div className="w-40">
                    <label className="text-xs text-gray-500">Importe</label>
                    <input
                      type="number"
                      step="0.01"
                      value={fp.importe}
                      onChange={(e) => updateFormaPago(fp.id, "importe", e.target.value)}
                      placeholder="0.00"
                      className="w-full p-2 border rounded-lg text-sm font-medium"
                    />
                  </div>
                  {formasPago.length > 1 && (
                    <button type="button" onClick={() => removeFormaPago(fp.id)} className="text-red-500 hover:text-red-700 mt-4">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Transferencia: show CBU + banco origen */}
                {fp.tipo === "Transferencia" && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div>
                      <label className="text-xs text-blue-800">CBU del proveedor</label>
                      <input
                        type="text"
                        value={fp.cbu || form.cbu}
                        onChange={(e) => updateFormaPago(fp.id, "cbu", e.target.value)}
                        className="w-full p-1.5 border rounded text-sm"
                        placeholder="Auto-completado"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-blue-800">Banco Origen</label>
                      <select
                        value={fp.banco_origen}
                        onChange={(e) => updateFormaPago(fp.id, "banco_origen", e.target.value)}
                        className="w-full p-1.5 border rounded text-sm"
                      >
                        <option value="">Seleccionar banco...</option>
                        <option value="Banco Masoil 1">Banco Masoil 1</option>
                        <option value="Banco Masoil 2">Banco Masoil 2</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Tarjeta de crédito: banco/entidad + nro autorización */}
                {fp.tipo === "Tarjeta de crédito" && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <div>
                      <label className="text-xs text-indigo-800">Banco / Entidad</label>
                      <input
                        type="text"
                        value={fp.banco_entidad}
                        onChange={(e) => updateFormaPago(fp.id, "banco_entidad", e.target.value)}
                        className="w-full p-1.5 border rounded text-sm"
                        placeholder="Ej: Visa, Mastercard..."
                      />
                    </div>
                    <div>
                      <label className="text-xs text-indigo-800">Nro. Autorización</label>
                      <input
                        type="text"
                        value={fp.nro_autorizacion}
                        onChange={(e) => updateFormaPago(fp.id, "nro_autorizacion", e.target.value)}
                        className="w-full p-1.5 border rounded text-sm"
                        placeholder="Nro. de autorización"
                      />
                    </div>
                  </div>
                )}

                {/* Compensación: referencia */}
                {fp.tipo === "Compensación" && (
                  <div className="p-3 bg-gray-100 border rounded-lg">
                    <label className="text-xs text-gray-600">Referencia compensación</label>
                    <input
                      type="text"
                      value={fp.referencia}
                      onChange={(e) => updateFormaPago(fp.id, "referencia", e.target.value)}
                      className="w-full p-1.5 border rounded text-sm"
                      placeholder="Referencia"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Cheques section (if any forma de pago is Cheque/Echeq) */}
          {hasChequeFormaPago && (
            <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm text-purple-800 font-medium">Cheques / Echeqs</label>
                <button type="button" onClick={addCheque} className="px-3 py-1 bg-purple-600 text-white rounded text-xs hover:bg-purple-700 flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Agregar cheque
                </button>
              </div>
              {cheques.length === 0 && (
                <p className="text-sm text-purple-600">Agregue al menos un cheque</p>
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

          {/* Totals summary */}
          <div className="mt-4 p-3 border-t space-y-1">
            <div className="flex justify-between text-sm">
              <span>Total facturas seleccionadas:</span>
              <span className="font-medium">{formatCurrency(totalFacturasSeleccionadas)}</span>
            </div>
            <div className="flex justify-between text-sm font-bold">
              <span>Total formas de pago:</span>
              <span>{formatCurrency(totalFormasPago)}</span>
            </div>
            {selectedFacturaIds.size > 0 && totalFormasPago > 0 && Math.abs(diferencia) > 0.01 && (
              <div className={`text-xs mt-1 px-2 py-1 rounded ${diferencia > 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {diferencia > 0 ? `Saldo a favor: ${formatCurrency(diferencia)}` : `Falta cubrir: ${formatCurrency(Math.abs(diferencia))}`}
              </div>
            )}
          </div>
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
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg font-semibold text-gray-900">Total a pagar</span>
            <span className="text-2xl font-bold text-primary">{formatCurrency(importeTotal)}</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">Se generará automáticamente una Orden de Pago al guardar</p>
          <div className="flex justify-end gap-3">
            <Link href="/admin/pagos" className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium">
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={guardando || !form.proveedor_nombre || formasPago.every((fp) => !fp.tipo) || importeTotal <= 0}
              className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400 text-sm font-medium"
            >
              {guardando ? "Guardando..." : selectedFacturaIds.size === 0 ? "Registrar Pago a Cuenta" : "Registrar Pago"}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
