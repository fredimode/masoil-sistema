"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { formatMoney } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"

interface ClienteDB {
  id: string
  business_name: string
  razon_social: string | null
  cuit: string | null
  numero_docum: string | null
  condicion_iva: string | null
  domicilio: string | null
  provincia: string | null
  email: string | null
}

interface ProductoDB {
  id: string
  code: string
  name: string
  price: number
}

interface ItemFactura {
  productId: string
  codigo: string
  descripcion: string
  cantidad: number
  precioUnitario: number
}

interface FacturaResultado {
  id: number
  numero: string
  tipo: string
  cae: string
  vencimiento_cae: string
  comprobante_nro: string
  total: number
  razon_social: string
}

export default function NuevaFacturaPage() {
  const router = useRouter()
  const supabase = createClient()

  // Estado general
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const [generando, setGenerando] = useState(false)
  const [resultado, setResultado] = useState<{ success: boolean; factura?: FacturaResultado; error?: string; errores?: string[]; tusfacturas_response?: Record<string, unknown> } | null>(null)

  // Paso 1: Seleccionar cliente
  const [clienteSearch, setClienteSearch] = useState("")
  const [clienteResults, setClienteResults] = useState<ClienteDB[]>([])
  const [searchingClientes, setSearchingClientes] = useState(false)
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteDB | null>(null)
  const [showClienteDropdown, setShowClienteDropdown] = useState(false)
  const clienteInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Paso 2: Items
  const [items, setItems] = useState<ItemFactura[]>([])
  const [productoSearch, setProductoSearch] = useState("")
  const [productoResults, setProductoResults] = useState<ProductoDB[]>([])
  const [searchingProductos, setSearchingProductos] = useState(false)
  const [showProductoDropdown, setShowProductoDropdown] = useState(false)

  // Modo: desde pedido o manual
  const [modo, setModo] = useState<"pedido" | "manual">("manual")
  const [orderId, setOrderId] = useState<string | null>(null)

  // Tipo de comprobante: FACTURA, NOTA_CREDITO, NOTA_DEBITO
  const [tipoComprobante, setTipoComprobante] = useState<"FACTURA" | "NOTA_CREDITO" | "NOTA_DEBITO">("FACTURA")
  const [facturaReferenciaId, setFacturaReferenciaId] = useState<string>("")
  const [facturasCliente, setFacturasCliente] = useState<any[]>([])

  // Buscar clientes con debounce
  useEffect(() => {
    if (clienteSearch.length < 2) {
      setClienteResults([])
      return
    }

    const timeout = setTimeout(async () => {
      setSearchingClientes(true)
      try {
        const { data } = await supabase
          .from("clients")
          .select("id, business_name, razon_social, cuit, numero_docum, condicion_iva, domicilio, provincia, email")
          .or(`razon_social.ilike.%${clienteSearch}%,business_name.ilike.%${clienteSearch}%,cuit.ilike.%${clienteSearch}%,numero_docum.ilike.%${clienteSearch}%`)
          .limit(15)

        setClienteResults(data || [])
        setShowClienteDropdown(true)
      } catch (e) {
        console.error("Error buscando clientes:", e)
      } finally {
        setSearchingClientes(false)
      }
    }, 300)

    return () => clearTimeout(timeout)
  }, [clienteSearch])

  // Buscar productos con debounce
  useEffect(() => {
    if (productoSearch.length < 2) {
      setProductoResults([])
      return
    }

    const timeout = setTimeout(async () => {
      setSearchingProductos(true)
      try {
        const { data } = await supabase
          .from("products")
          .select("id, code, name, price")
          .or(`name.ilike.%${productoSearch}%,code.ilike.%${productoSearch}%`)
          .limit(10)

        setProductoResults(data || [])
        setShowProductoDropdown(true)
      } catch (e) {
        console.error("Error buscando productos:", e)
      } finally {
        setSearchingProductos(false)
      }
    }, 300)

    return () => clearTimeout(timeout)
  }, [productoSearch])

  // Click fuera cierra dropdowns
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowClienteDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  async function seleccionarCliente(c: ClienteDB) {
    setClienteSeleccionado(c)
    setClienteSearch(c.razon_social || c.business_name)
    setShowClienteDropdown(false)
    setPaso(2)
    // Load facturas for this client (for NC/ND reference)
    if (tipoComprobante !== "FACTURA") {
      const { data } = await supabase
        .from("facturas")
        .select("id, numero, tipo, total, fecha, comprobante_nro")
        .eq("client_id", c.id)
        .order("fecha", { ascending: false })
        .limit(50)
      setFacturasCliente(data || [])
    }
  }

  function agregarProducto(p: ProductoDB) {
    setItems((prev) => [
      ...prev,
      {
        productId: p.id,
        codigo: p.code,
        descripcion: p.name,
        cantidad: 1,
        precioUnitario: Number(p.price),
      },
    ])
    setProductoSearch("")
    setProductoResults([])
    setShowProductoDropdown(false)
  }

  function actualizarItem(index: number, field: "cantidad" | "precioUnitario", value: number) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)))
  }

  function eliminarItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  // Cálculos
  const baseGravada = items.reduce((sum, it) => sum + it.cantidad * it.precioUnitario, 0)
  const iva21 = Math.round(baseGravada * 0.21 * 100) / 100
  const total = Math.round((baseGravada + iva21) * 100) / 100

  // Determinar tipo de factura según condición IVA y tipo de comprobante
  const condicionIva = (clienteSeleccionado?.condicion_iva || "").toUpperCase().trim()
  const esRI = condicionIva === "RESP. INSCRIPTO" || condicionIva === "RESPONSABLE INSCRIPTO" || condicionIva === "RI"
  const letra = esRI ? "A" : "B"
  const tipoFactura = tipoComprobante === "NOTA_CREDITO"
    ? `NOTA DE CREDITO ${letra}`
    : tipoComprobante === "NOTA_DEBITO"
    ? `NOTA DE DEBITO ${letra}`
    : `FACTURA ${letra}`

  async function generarFactura() {
    if (!clienteSeleccionado || items.length === 0) return
    setGenerando(true)
    setResultado(null)

    try {
      const payload: Record<string, unknown> = {
        clientId: clienteSeleccionado.id,
        tipoComprobante,
        items: items.map((it) => ({
          productId: it.productId,
          producto_nombre: it.descripcion,
          producto_codigo: it.codigo,
          cantidad: it.cantidad,
          precioUnitario: it.precioUnitario,
        })),
      }

      if (orderId) {
        payload.orderId = orderId
      }
      if (facturaReferenciaId) {
        payload.facturaReferenciaId = facturaReferenciaId
      }

      const res = await fetch("/api/facturacion/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      setResultado(data)

      if (data.success) {
        setPaso(3)
      }
    } catch (error) {
      setResultado({ success: false, error: "Error de conexión: " + (error instanceof Error ? error.message : "desconocido") })
    } finally {
      setGenerando(false)
    }
  }

  // Resultado exitoso
  if (paso === 3 && resultado?.success) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-green-800 mb-2">Factura Generada</h2>
          <p className="text-green-700 mb-6">La factura fue procesada exitosamente por TusFacturas</p>

          <div className="bg-white rounded-lg p-6 text-left space-y-3 mb-6">
            <div className="flex justify-between">
              <span className="text-gray-600">Tipo</span>
              <span className="font-bold text-gray-900">{resultado.factura?.tipo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Número de Comprobante</span>
              <span className="font-bold text-gray-900">{resultado.factura?.comprobante_nro || resultado.factura?.numero}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">CAE</span>
              <span className="font-mono font-bold text-green-700">{resultado.factura?.cae || "Testing - sin CAE real"}</span>
            </div>
            {resultado.factura?.vencimiento_cae && (
              <div className="flex justify-between">
                <span className="text-gray-600">Vencimiento CAE</span>
                <span className="font-medium text-gray-900">{resultado.factura.vencimiento_cae}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">Cliente</span>
              <span className="font-medium text-gray-900">{resultado.factura?.razon_social}</span>
            </div>
            <div className="flex justify-between border-t pt-3">
              <span className="text-gray-900 font-bold">Total</span>
              <span className="text-xl font-bold text-primary">{formatMoney(resultado.factura?.total || 0)}</span>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
            <p className="text-sm text-amber-800">
              <strong>Modo Testing:</strong> Esta factura fue generada con el PDV de desarrollo. No genera CAE real en AFIP.
            </p>
          </div>

          <div className="flex justify-center gap-3">
            <button
              onClick={() => {
                setPaso(1)
                setResultado(null)
                setClienteSeleccionado(null)
                setClienteSearch("")
                setItems([])
                setOrderId(null)
              }}
              className="px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Nueva Factura
            </button>
            <Link
              href="/admin/facturacion"
              className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90"
            >
              Volver a Facturación
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/admin/facturacion" className="text-gray-400 hover:text-gray-600">
            ← Facturación
          </Link>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Nueva Factura Electrónica</h2>
        <p className="text-gray-500">Genera una factura a través de TusFacturas (modo testing)</p>
      </div>

      {/* Tipo de comprobante */}
      <div className="flex gap-2 mb-6">
        {(["FACTURA", "NOTA_CREDITO", "NOTA_DEBITO"] as const).map((tipo) => {
          const labels = { FACTURA: "Factura", NOTA_CREDITO: "Nota de Crédito", NOTA_DEBITO: "Nota de Débito" }
          const colors = {
            FACTURA: tipoComprobante === tipo ? "bg-primary text-white" : "bg-white text-gray-700 border",
            NOTA_CREDITO: tipoComprobante === tipo ? "bg-purple-600 text-white" : "bg-white text-purple-700 border border-purple-200",
            NOTA_DEBITO: tipoComprobante === tipo ? "bg-orange-600 text-white" : "bg-white text-orange-700 border border-orange-200",
          }
          return (
            <button
              key={tipo}
              onClick={() => { setTipoComprobante(tipo); setFacturaReferenciaId("") }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${colors[tipo]}`}
            >
              {labels[tipo]}
            </button>
          )
        })}
      </div>

      {/* Indicador de modo */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
        <p className="text-sm text-amber-800">
          <strong>TESTING</strong> — Punto de venta de desarrollo. Las facturas no se envían a AFIP.
        </p>
      </div>

      {/* Paso 1: Seleccionar cliente */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="font-bold text-gray-900 mb-4">1. Seleccionar Cliente</h3>

        <div className="relative" ref={dropdownRef}>
          <input
            ref={clienteInputRef}
            type="text"
            value={clienteSearch}
            onChange={(e) => {
              setClienteSearch(e.target.value)
              if (clienteSeleccionado) {
                setClienteSeleccionado(null)
                setPaso(1)
                setItems([])
              }
            }}
            placeholder="Buscar por razón social, CUIT o nombre..."
            className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
          />
          {searchingClientes && (
            <div className="absolute right-3 top-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
            </div>
          )}

          {showClienteDropdown && clienteResults.length > 0 && !clienteSeleccionado && (
            <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
              {clienteResults.map((c) => (
                <button
                  key={c.id}
                  onClick={() => seleccionarCliente(c)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-b-0"
                >
                  <div className="font-medium text-gray-900">{c.razon_social || c.business_name}</div>
                  <div className="text-xs text-gray-500 flex gap-3">
                    {(c.cuit || c.numero_docum) && <span>CUIT: {c.cuit || c.numero_docum}</span>}
                    {c.condicion_iva && <span>IVA: {c.condicion_iva}</span>}
                    {c.provincia && <span>{c.provincia}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Datos del cliente seleccionado */}
        {clienteSeleccionado && (
          <div className="mt-4 bg-gray-50 rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-gray-500 block">Razón Social</span>
                <span className="font-medium text-gray-900">{clienteSeleccionado.razon_social || clienteSeleccionado.business_name}</span>
              </div>
              <div>
                <span className="text-gray-500 block">CUIT</span>
                <span className="font-medium text-gray-900">{clienteSeleccionado.cuit || clienteSeleccionado.numero_docum || "No registrado"}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Condición IVA</span>
                <span className="font-medium text-gray-900">{clienteSeleccionado.condicion_iva || "No registrada"}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Domicilio</span>
                <span className="font-medium text-gray-900">{clienteSeleccionado.domicilio || "No registrado"}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Provincia</span>
                <span className="font-medium text-gray-900">{clienteSeleccionado.provincia || "No registrada"}</span>
              </div>
              <div>
                <span className="text-gray-500 block">Tipo Factura</span>
                <span className={`font-bold ${tipoFactura === "FACTURA A" ? "text-blue-700" : "text-green-700"}`}>
                  {tipoFactura}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Referencia de factura (solo para NC/ND) */}
      {clienteSeleccionado && tipoComprobante !== "FACTURA" && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="font-bold text-gray-900 mb-4">
            Factura de Referencia {tipoComprobante === "NOTA_CREDITO" ? "(Nota de Crédito)" : "(Nota de Débito)"}
          </h3>
          {facturasCliente.length > 0 ? (
            <select
              value={facturaReferenciaId}
              onChange={(e) => setFacturaReferenciaId(e.target.value)}
              className="w-full p-3 border rounded-lg text-sm"
            >
              <option value="">Seleccionar factura original...</option>
              {facturasCliente.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.tipo} {f.comprobante_nro || f.numero || ""} — {formatMoney(Number(f.total))} ({f.fecha})
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-gray-500">No hay facturas emitidas para este cliente</p>
          )}
        </div>
      )}

      {/* Paso 2: Agregar productos */}
      {clienteSeleccionado && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="font-bold text-gray-900 mb-4">2. Detalle de Productos</h3>

          {/* Buscador de productos */}
          <div className="relative mb-4">
            <input
              type="text"
              value={productoSearch}
              onChange={(e) => setProductoSearch(e.target.value)}
              placeholder="Buscar producto por nombre o código..."
              className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-primary text-sm"
            />
            {searchingProductos && (
              <div className="absolute right-3 top-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
              </div>
            )}

            {showProductoDropdown && productoResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {productoResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => agregarProducto(p)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 border-b last:border-b-0 flex justify-between items-center"
                  >
                    <div>
                      <span className="font-medium text-gray-900">{p.name}</span>
                      <span className="text-xs text-gray-500 ml-2">{p.code}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-700">{formatMoney(Number(p.price))}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tabla de items */}
          {items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700">Producto</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-700 w-20">Código</th>
                    <th className="px-4 py-2 text-center font-semibold text-gray-700 w-24">Cant.</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700 w-36">Precio Unit. (s/IVA)</th>
                    <th className="px-4 py-2 text-right font-semibold text-gray-700 w-28">Subtotal</th>
                    <th className="px-4 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-4 py-2 text-gray-900">{it.descripcion}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{it.codigo}</td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={1}
                          value={it.cantidad}
                          onChange={(e) => actualizarItem(idx, "cantidad", parseInt(e.target.value) || 1)}
                          className="w-20 p-1 border rounded text-center text-sm"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={it.precioUnitario}
                          onChange={(e) => actualizarItem(idx, "precioUnitario", parseFloat(e.target.value) || 0)}
                          className="w-32 p-1 border rounded text-right text-sm"
                        />
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-gray-900">
                        {formatMoney(it.cantidad * it.precioUnitario)}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() => eliminarItem(idx)}
                          className="text-red-500 hover:text-red-700 text-lg"
                          title="Eliminar"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-center py-6">Buscá y agregá productos al detalle</p>
          )}
        </div>
      )}

      {/* Paso 3: Resumen y totales */}
      {items.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="font-bold text-gray-900 mb-4">3. Resumen</h3>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Base Gravada</span>
              <span className="font-medium text-gray-900">{formatMoney(baseGravada)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">IVA 21%</span>
              <span className="font-medium text-gray-900">{formatMoney(iva21)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-3">
              <span className="text-gray-900">TOTAL</span>
              <span className="text-primary">{formatMoney(total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {resultado && !resultado.success && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <h4 className="font-bold text-red-800 mb-2">Error al generar factura</h4>
          <p className="text-red-700 text-sm mb-2">{resultado.error}</p>
          {resultado.errores && resultado.errores.length > 0 && (
            <ul className="list-disc list-inside text-red-600 text-sm mb-3">
              {resultado.errores.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          {resultado.tusfacturas_response && (
            <details className="mt-2">
              <summary className="text-xs text-red-600 cursor-pointer hover:underline">Ver respuesta completa de TusFacturas</summary>
              <pre className="mt-2 bg-red-100 rounded p-3 text-xs overflow-x-auto max-h-48">
                {JSON.stringify(resultado.tusfacturas_response, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Botones */}
      {items.length > 0 && (
        <div className="flex justify-end gap-3">
          <Link
            href="/admin/facturacion"
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Cancelar
          </Link>
          <button
            onClick={generarFactura}
            disabled={generando || !clienteSeleccionado || items.length === 0}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400 font-medium"
          >
            {generando ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                Generando...
              </span>
            ) : (
              "Generar Factura (Testing)"
            )}
          </button>
        </div>
      )}
    </div>
  )
}
