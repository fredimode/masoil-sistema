"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { fetchProveedores, createPagoProveedor } from "@/lib/supabase/queries"
import { createClient } from "@/lib/supabase/client"
import { normalizeSearch } from "@/lib/utils"
import { Paperclip, Mail, Upload, Check } from "lucide-react"

const EMPRESAS = ["Masoil", "Aquiles", "Conancap"]

export default function NuevoPagoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [proveedores, setProveedores] = useState<any[]>([])
  const [guardando, setGuardando] = useState(false)
  const [provSearch, setProvSearch] = useState("")
  const [showProvDropdown, setShowProvDropdown] = useState(false)
  const [comprobanteFile, setComprobanteFile] = useState<File | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)
  const [enviandoEmail, setEnviandoEmail] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    proveedor_id: "",
    proveedor_nombre: "",
    cuit: "",
    empresa: "",
    cbu: "",
    fecha_fc: "",
    numero_fc: "",
    importe: "",
    forma_pago: "",
    observaciones: "",
    estado_pago: "PENDIENTE",
    nro_cheque: "",
    banco: "",
    origen: "",
    email_pagos: "",
  })

  useEffect(() => {
    cargarProveedores()
  }, [])

  async function cargarProveedores() {
    setLoading(true)
    try {
      const data = await fetchProveedores()
      setProveedores(data)
    } catch (error) {
      console.error("Error cargando proveedores:", error)
    } finally {
      setLoading(false)
    }
  }

  const filteredProveedores = useMemo(() => {
    if (!provSearch.trim()) return []
    const q = normalizeSearch(provSearch)
    return proveedores.filter((p) =>
      normalizeSearch(p.nombre || "").includes(q) ||
      normalizeSearch(p.cuit || "").includes(q) ||
      normalizeSearch(p.empresa || "").includes(q)
    ).slice(0, 15)
  }, [provSearch, proveedores])

  function selectProveedor(prov: any) {
    // Extract email from contactos field if available
    const contactos = prov.contactos || ""
    const emailMatch = contactos.match(/[\w.-]+@[\w.-]+\.\w+/)
    const email = emailMatch ? emailMatch[0] : ""

    setForm((prev) => ({
      ...prev,
      proveedor_id: String(prov.id),
      proveedor_nombre: prov.nombre || prov.proveedor_nombre || "",
      cuit: prov.cuit || "",
      empresa: prov.empresa || "",
      cbu: prov.cbu || "",
      email_pagos: email,
    }))
    setProvSearch(prov.nombre || prov.proveedor_nombre || "")
    setShowProvDropdown(false)
  }

  // Dynamic field visibility based on forma_pago
  const showCBU = form.forma_pago === "Transferencia"
  const showCheque = form.forma_pago === "Cheque" || form.forma_pago === "Echeq"
  const showBanco = form.forma_pago === "Cheque" || form.forma_pago === "Echeq"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    try {
      const supabase = createClient()

      // Create pago and get ID
      const { data: pagoData, error: pagoError } = await supabase
        .from("pagos_proveedores")
        .insert({
          proveedor_id: form.proveedor_id || null,
          proveedor_nombre: form.proveedor_nombre,
          cuit: form.cuit || null,
          empresa: form.empresa || null,
          fecha_fc: form.fecha_fc || null,
          numero_fc: form.numero_fc || null,
          importe: Number(form.importe) || 0,
          forma_pago: form.forma_pago || null,
          cbu: form.cbu || null,
          observaciones: form.observaciones || null,
          estado_pago: form.estado_pago,
          nro_cheque: form.nro_cheque || null,
          banco: form.banco || null,
          origen: form.origen || null,
        })
        .select("id")
        .single()

      if (pagoError) throw pagoError
      const pagoId = pagoData.id

      // Upload comprobante if file selected
      if (comprobanteFile && pagoId) {
        setUploadingFile(true)
        const ext = comprobanteFile.name.split(".").pop()
        const path = `pagos/${pagoId}/${Date.now()}.${ext}`
        const { error: uploadError } = await supabase.storage
          .from("comprobantes")
          .upload(path, comprobanteFile)

        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("comprobantes").getPublicUrl(path)
          await supabase.from("pagos_proveedores").update({ comprobante_url: path }).eq("id", pagoId)
        }
        setUploadingFile(false)
      }

      // Send email if email provided
      if (form.email_pagos && pagoId) {
        try {
          await fetch("/api/admin/pagos/enviar-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pagoId, email: form.email_pagos }),
          })
        } catch {
          // Email failure is non-blocking
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
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href="/admin/pagos"
          className="text-sm text-gray-500 hover:text-gray-700 mb-2 inline-block"
        >
          &larr; Volver a Pagos
        </Link>
        <h2 className="text-2xl font-bold text-gray-900">Nuevo Pago a Proveedor</h2>
        <p className="text-gray-500">Registrar un nuevo pago programado</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
        {/* Proveedor - Autocomplete */}
        <div className="relative">
          <label className="text-sm text-gray-600 block mb-1 font-medium">Proveedor *</label>
          <input
            type="text"
            placeholder="Buscar proveedor por nombre, CUIT o empresa..."
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
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm border-b last:border-b-0"
                  onClick={() => selectProveedor(p)}
                >
                  <span className="font-medium">{p.nombre || p.proveedor_nombre}</span>
                  {p.cuit && <span className="text-gray-500 ml-2">CUIT: {p.cuit}</span>}
                  {p.empresa && <span className="text-gray-400 ml-2">({p.empresa})</span>}
                </button>
              ))}
            </div>
          )}
          {form.proveedor_nombre && (
            <p className="text-xs text-green-600 mt-1">Seleccionado: {form.proveedor_nombre}</p>
          )}
        </div>

        {/* Empresa */}
        <div>
          <label className="text-sm text-gray-600 block mb-1 font-medium">Empresa</label>
          {form.empresa ? (
            <input
              type="text"
              value={form.empresa}
              onChange={(e) => setForm((prev) => ({ ...prev, empresa: e.target.value }))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm bg-gray-50"
            />
          ) : (
            <select
              value={form.empresa}
              onChange={(e) => setForm((prev) => ({ ...prev, empresa: e.target.value }))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="">Seleccionar empresa...</option>
              {EMPRESAS.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          )}
        </div>

        {/* CBU - moved up */}
        <div>
          <label className="text-sm text-gray-600 block mb-1 font-medium">CBU</label>
          <input
            type="text"
            value={form.cbu}
            onChange={(e) => setForm((prev) => ({ ...prev, cbu: e.target.value }))}
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm bg-gray-50"
            placeholder="Auto-completado del proveedor"
          />
        </div>

        {/* CUIT */}
        <div>
          <label className="text-sm text-gray-600 block mb-1 font-medium">CUIT</label>
          <input
            type="text"
            value={form.cuit}
            onChange={(e) => setForm((prev) => ({ ...prev, cuit: e.target.value }))}
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm bg-gray-50"
            placeholder="Auto-completado del proveedor"
          />
        </div>

        {/* Fecha FC y Numero FC */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-600 block mb-1 font-medium">Fecha Factura</label>
            <input
              type="date"
              value={form.fecha_fc}
              onChange={(e) => setForm((prev) => ({ ...prev, fecha_fc: e.target.value }))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 block mb-1 font-medium">Numero de Factura</label>
            <input
              type="text"
              value={form.numero_fc}
              onChange={(e) => setForm((prev) => ({ ...prev, numero_fc: e.target.value }))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              placeholder="Ej: 0001-00001234"
            />
          </div>
        </div>

        {/* Importe y Forma de pago */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-600 block mb-1 font-medium">Importe *</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.importe}
              onChange={(e) => setForm((prev) => ({ ...prev, importe: e.target.value }))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              placeholder="0.00"
              required
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 block mb-1 font-medium">Forma de Pago *</label>
            <select
              value={form.forma_pago}
              onChange={(e) => setForm((prev) => ({ ...prev, forma_pago: e.target.value, nro_cheque: "", banco: "" }))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              required
            >
              <option value="">Seleccionar...</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Cheque">Cheque</option>
              <option value="Echeq">Echeq</option>
              <option value="Efectivo">Efectivo</option>
              <option value="Pago mis cuentas">Pago mis cuentas</option>
            </select>
          </div>
        </div>

        {/* Dynamic fields based on forma_pago */}
        {showCBU && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <label className="text-sm text-blue-800 block mb-1 font-medium">CBU para transferencia</label>
            <input
              type="text"
              value={form.cbu}
              onChange={(e) => setForm((prev) => ({ ...prev, cbu: e.target.value }))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              placeholder="CBU del proveedor"
            />
          </div>
        )}

        {(showCheque || showBanco) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div>
              <label className="text-sm text-purple-800 block mb-1 font-medium">Nro de Cheque</label>
              <input
                type="text"
                value={form.nro_cheque}
                onChange={(e) => setForm((prev) => ({ ...prev, nro_cheque: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                placeholder="Numero del cheque"
              />
            </div>
            <div>
              <label className="text-sm text-purple-800 block mb-1 font-medium">Banco</label>
              <input
                type="text"
                value={form.banco}
                onChange={(e) => setForm((prev) => ({ ...prev, banco: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
                placeholder="Nombre del banco"
              />
            </div>
          </div>
        )}

        {/* Estado y Origen */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-600 block mb-1 font-medium">Estado de Pago</label>
            <select
              value={form.estado_pago}
              onChange={(e) => setForm((prev) => ({ ...prev, estado_pago: e.target.value }))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            >
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="PAGADO">PAGADO</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-600 block mb-1 font-medium">Origen</label>
            <input
              type="text"
              value={form.origen}
              onChange={(e) => setForm((prev) => ({ ...prev, origen: e.target.value }))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              placeholder="Origen del pago"
            />
          </div>
        </div>

        {/* Email de pagos */}
        <div>
          <label className="text-sm text-gray-600 block mb-1 font-medium">Email de pagos</label>
          <div className="flex gap-2">
            <input
              type="email"
              value={form.email_pagos}
              onChange={(e) => setForm((prev) => ({ ...prev, email_pagos: e.target.value }))}
              className="flex-1 p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              placeholder="Email del proveedor para enviar comprobante"
            />
            <button
              type="button"
              className="px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm flex items-center gap-1 whitespace-nowrap"
              onClick={() => alert("TODO: Integrar con Resend/n8n para enviar comprobante por email")}
              disabled={!form.email_pagos}
            >
              <Mail className="h-4 w-4" />
              Enviar comprobante
            </button>
          </div>
          {form.email_pagos && <p className="text-xs text-gray-400 mt-1">Pre-cargado del proveedor</p>}
        </div>

        {/* Observaciones */}
        <div>
          <label className="text-sm text-gray-600 block mb-1 font-medium">Observaciones</label>
          <textarea
            value={form.observaciones}
            onChange={(e) => setForm((prev) => ({ ...prev, observaciones: e.target.value }))}
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            rows={3}
            placeholder="Notas adicionales..."
          />
        </div>

        {/* Adjuntar comprobante */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) setComprobanteFile(file)
            }}
          />
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

        {/* Botones */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <Link
            href="/admin/pagos"
            className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={guardando || !form.proveedor_nombre || !form.importe || !form.forma_pago}
            className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400 text-sm font-medium"
          >
            {guardando ? "Guardando..." : "Crear Pago"}
          </button>
        </div>
      </form>
    </div>
  )
}
