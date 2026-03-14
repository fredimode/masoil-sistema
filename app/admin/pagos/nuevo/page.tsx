"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { fetchProveedores, createPagoProveedor } from "@/lib/supabase/queries"

export default function NuevoPagoPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [proveedores, setProveedores] = useState<any[]>([])
  const [guardando, setGuardando] = useState(false)

  const [form, setForm] = useState({
    proveedor_id: "",
    proveedor_nombre: "",
    cuit: "",
    empresa: "",
    fecha_fc: "",
    numero_fc: "",
    importe: "",
    forma_pago: "",
    cbu: "",
    observaciones: "",
    estado_pago: "PENDIENTE",
    nro_cheque: "",
    banco: "",
    origen: "",
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

  function handleProveedorChange(proveedorId: string) {
    const proveedor = proveedores.find((p) => String(p.id) === proveedorId)
    if (proveedor) {
      setForm((prev) => ({
        ...prev,
        proveedor_id: proveedorId,
        proveedor_nombre: proveedor.nombre || proveedor.proveedor_nombre || "",
        cuit: proveedor.cuit || "",
        empresa: proveedor.empresa || "",
        cbu: proveedor.cbu || "",
      }))
    } else {
      setForm((prev) => ({
        ...prev,
        proveedor_id: "",
        proveedor_nombre: "",
        cuit: "",
        empresa: "",
        cbu: "",
      }))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true)
    try {
      await createPagoProveedor({
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
        {/* Proveedor */}
        <div>
          <label className="text-sm text-gray-600 block mb-1 font-medium">Proveedor *</label>
          <select
            value={form.proveedor_id}
            onChange={(e) => handleProveedorChange(e.target.value)}
            className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            required
          >
            <option value="">Seleccionar proveedor...</option>
            {proveedores.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.nombre || p.proveedor_nombre || `Proveedor #${p.id}`}
              </option>
            ))}
          </select>
        </div>

        {/* CUIT y Empresa (auto) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <div>
            <label className="text-sm text-gray-600 block mb-1 font-medium">Empresa</label>
            <input
              type="text"
              value={form.empresa}
              onChange={(e) => setForm((prev) => ({ ...prev, empresa: e.target.value }))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm bg-gray-50"
              placeholder="Auto-completado del proveedor"
            />
          </div>
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
              onChange={(e) => setForm((prev) => ({ ...prev, forma_pago: e.target.value }))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              required
            >
              <option value="">Seleccionar...</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Cheque">Cheque</option>
              <option value="Efectivo">Efectivo</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
        </div>

        {/* CBU (auto) */}
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

        {/* Nro Cheque y Banco */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-gray-600 block mb-1 font-medium">Nro de Cheque</label>
            <input
              type="text"
              value={form.nro_cheque}
              onChange={(e) => setForm((prev) => ({ ...prev, nro_cheque: e.target.value }))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              placeholder="Solo si paga con cheque"
            />
          </div>
          <div>
            <label className="text-sm text-gray-600 block mb-1 font-medium">Banco</label>
            <input
              type="text"
              value={form.banco}
              onChange={(e) => setForm((prev) => ({ ...prev, banco: e.target.value }))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
              placeholder="Nombre del banco"
            />
          </div>
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
            disabled={guardando || !form.proveedor_id || !form.importe || !form.forma_pago}
            className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400 text-sm font-medium"
          >
            {guardando ? "Guardando..." : "Crear Pago"}
          </button>
        </div>
      </form>
    </div>
  )
}
