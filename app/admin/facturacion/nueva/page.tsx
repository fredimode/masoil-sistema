"use client"

import { useState, useEffect } from "react"
import { formatMoney } from "@/lib/utils"
import { useRouter } from "next/navigation"

interface PedidoEntregado {
  id: string
  client_name: string
  client_id: string
  total: number
  products: {
    productName: string
    quantity: number
    price: number
  }[]
}

interface ClienteFacturacion {
  razon_social: string
  cuit: string
  condicion_iva: string
  domicilio: string
}

export default function NuevaFacturaPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [pedidos, setPedidos] = useState<PedidoEntregado[]>([])
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState<PedidoEntregado | null>(null)
  const [generando, setGenerando] = useState(false)

  // Datos de facturacion del cliente
  const [datosCliente, setDatosCliente] = useState<ClienteFacturacion>({
    razon_social: "",
    cuit: "",
    condicion_iva: "Responsable Inscripto",
    domicilio: "",
  })

  // Tipo de factura
  const [tipoFactura, setTipoFactura] = useState("B")

  useEffect(() => {
    cargarPedidosEntregados()
  }, [])

  async function cargarPedidosEntregados() {
    setLoading(true)
    try {
      const res = await fetch("/api/facturacion?action=pedidos-entregados")
      const data = await res.json()
      if (data.success) setPedidos(data.data || [])
    } catch (error) {
      console.error("Error cargando pedidos:", error)
    } finally {
      setLoading(false)
    }
  }

  function seleccionarPedido(pedido: PedidoEntregado) {
    setPedidoSeleccionado(pedido)
    setDatosCliente({
      razon_social: pedido.client_name,
      cuit: "",
      condicion_iva: "Responsable Inscripto",
      domicilio: "",
    })
  }

  // Calculo fiscal
  const subtotal = pedidoSeleccionado?.total || 0
  const baseGravada = subtotal / 1.21 // Base sin IVA (asumiendo precio con IVA incluido)
  const iva21 = baseGravada * 0.21
  const total = baseGravada + iva21

  async function generarFactura() {
    if (!pedidoSeleccionado) return
    setGenerando(true)

    try {
      // Estructura del payload para TusFacturas.app
      // Basado en la integracion de NewBiz Travel
      const payload = {
        // TODO: CUIT Masoil - reemplazar con datos reales
        // TODO: Punto de venta - configurar en TusFacturas
        // TODO: API token TusFacturas - agregar en .env
        usertoken: "PLACEHOLDER_API_TOKEN_TUSFACTURAS",
        apikey: "PLACEHOLDER_API_KEY_TUSFACTURAS",
        apitoken: "PLACEHOLDER_API_TOKEN_TUSFACTURAS",
        comprobante: {
          fecha: new Date().toISOString().slice(0, 10).split("-").reverse().join("/"),
          tipo: tipoFactura === "A" ? "FACTURA A" : "FACTURA B",
          operacion: "V", // Venta
          punto_venta: 1, // TODO: punto de venta Masoil
          numero: 0, // Auto-asignado por AFIP
          periodo_facturado_desde: new Date().toISOString().slice(0, 10).split("-").reverse().join("/"),
          periodo_facturado_hasta: new Date().toISOString().slice(0, 10).split("-").reverse().join("/"),
          rubro: "Productos",
          rubro_grupo_contable: "Ventas",
          detalle: pedidoSeleccionado.products.map((p) => ({
            cantidad: p.quantity,
            afecta_stock: "N",
            bonificacion_porcentaje: 0,
            producto: {
              descripcion: p.productName,
              unidad_bulto: 1,
              lista_precios: "standard",
              codigo: "",
              precio_unitario_sin_iva: p.price / 1.21,
              alicuota: 21,
              unidad_medida: "unidades",
            },
          })),
          bonificacion: 0,
          leyenda_gral: "",
          percepciones_iibb: 0,
          percepciones_iibb_base: 0,
          percepciones_iibb_alicuota: 0,
          percepciones_iva: 0,
          percepciones_iva_base: 0,
          percepciones_iva_alicuota: 0,
          exentos: 0,
          impuestos_internos: 0,
          impuestos_internos_base: 0,
          impuestos_internos_alicuota: 0,
          total: total,
        },
        cliente: {
          documento_tipo: "CUIT",
          documento_nro: datosCliente.cuit || "00000000000", // TODO: CUIT real del cliente
          razon_social: datosCliente.razon_social,
          email: "",
          domicilio: datosCliente.domicilio,
          provincia: "", // TODO: mapear provincia
          envia_por_mail: "N",
          condicion_pago: 210, // TODO: mapear condicion IVA
          condicion_iva: tipoFactura === "A" ? 1 : 5, // 1=RI, 5=CF
        },
      }

      console.log("=== PAYLOAD FACTURA TUSFACTURAS ===")
      console.log(JSON.stringify(payload, null, 2))
      console.log("=== FIN PAYLOAD ===")

      // Guardar registro en Supabase
      const res = await fetch("/api/facturacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: pedidoSeleccionado.id,
          tipo: `Factura ${tipoFactura}`,
          fecha: new Date().toISOString().slice(0, 10),
          cuit_cliente: datosCliente.cuit || null,
          razon_social: datosCliente.razon_social,
          base_gravada: Math.round(baseGravada * 100) / 100,
          iva_21: Math.round(iva21 * 100) / 100,
          total: Math.round(total * 100) / 100,
          // CAE se completa cuando se integre con TusFacturas
          cae: null,
          vencimiento_cae: null,
          pdf_url: null,
        }),
      })

      const data = await res.json()
      if (data.success) {
        alert("Factura registrada. El payload para TusFacturas se mostro en la consola del navegador.")
        router.push("/admin/facturacion")
      } else {
        alert("Error: " + (data.error || "Error desconocido"))
      }
    } catch (error) {
      console.error("Error generando factura:", error)
      alert("Error generando factura")
    } finally {
      setGenerando(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Nueva Factura</h2>
        <p className="text-gray-500">Selecciona un pedido entregado para generar la factura</p>
      </div>

      {/* Aviso placeholders */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-amber-800">
          <strong>Pendiente configurar:</strong> CUIT Masoil, punto de venta, API token de TusFacturas.app. Por ahora la factura se
          registra en el sistema y el payload se muestra en consola.
        </p>
      </div>

      {/* Paso 1: Seleccionar pedido */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h3 className="font-bold text-gray-900 mb-4">1. Seleccionar Pedido Entregado</h3>

        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : pedidos.length === 0 ? (
          <p className="text-gray-500 text-center py-4">No hay pedidos con estado ENTREGADO disponibles</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {pedidos.map((p) => (
              <button
                key={p.id}
                onClick={() => seleccionarPedido(p)}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  pedidoSeleccionado?.id === p.id
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900">Pedido #{p.id}</span>
                    <span className="text-gray-500 ml-2">- {p.client_name}</span>
                  </div>
                  <span className="font-bold text-gray-900">{formatMoney(p.total)}</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {p.products.length} producto{p.products.length !== 1 ? "s" : ""}:{" "}
                  {p.products.map((pr) => `${pr.productName} x${pr.quantity}`).join(", ")}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Paso 2: Datos del cliente */}
      {pedidoSeleccionado && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="font-bold text-gray-900 mb-4">2. Datos de Facturacion del Cliente</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-600 block mb-1">Tipo de Factura *</label>
              <select
                value={tipoFactura}
                onChange={(e) => setTipoFactura(e.target.value)}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
              >
                <option value="A">Factura A (Responsable Inscripto)</option>
                <option value="B">Factura B (Consumidor Final)</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Condicion IVA</label>
              <select
                value={datosCliente.condicion_iva}
                onChange={(e) => setDatosCliente((prev) => ({ ...prev, condicion_iva: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
              >
                <option value="Responsable Inscripto">Responsable Inscripto</option>
                <option value="Monotributista">Monotributista</option>
                <option value="Consumidor Final">Consumidor Final</option>
                <option value="Exento">Exento</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">Razon Social *</label>
              <input
                value={datosCliente.razon_social}
                onChange={(e) => setDatosCliente((prev) => ({ ...prev, razon_social: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-sm text-gray-600 block mb-1">CUIT {tipoFactura === "A" ? "*" : "(opcional)"}</label>
              <input
                value={datosCliente.cuit}
                onChange={(e) => setDatosCliente((prev) => ({ ...prev, cuit: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                placeholder="XX-XXXXXXXX-X"
              />
            </div>
            <div className="col-span-2">
              <label className="text-sm text-gray-600 block mb-1">Domicilio</label>
              <input
                value={datosCliente.domicilio}
                onChange={(e) => setDatosCliente((prev) => ({ ...prev, domicilio: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                placeholder="Direccion del cliente..."
              />
            </div>
          </div>
        </div>
      )}

      {/* Paso 3: Detalle y totales */}
      {pedidoSeleccionado && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="font-bold text-gray-900 mb-4">3. Detalle de la Factura</h3>

          <table className="w-full text-sm mb-4">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">Producto</th>
                <th className="px-4 py-2 text-center font-semibold text-gray-700">Cant.</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-700">Precio Unit.</th>
                <th className="px-4 py-2 text-right font-semibold text-gray-700">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {pedidoSeleccionado.products.map((p, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-4 py-2 text-gray-900">{p.productName}</td>
                  <td className="px-4 py-2 text-center text-gray-600">{p.quantity}</td>
                  <td className="px-4 py-2 text-right text-gray-600">{formatMoney(p.price)}</td>
                  <td className="px-4 py-2 text-right font-medium text-gray-900">{formatMoney(p.price * p.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totales fiscales */}
          <div className="border-t pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Base Gravada (21%)</span>
              <span className="font-medium text-gray-900">{formatMoney(baseGravada)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">IVA 21%</span>
              <span className="font-medium text-gray-900">{formatMoney(iva21)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t pt-2">
              <span className="text-gray-900">TOTAL</span>
              <span className="text-primary">{formatMoney(total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Botones */}
      {pedidoSeleccionado && (
        <div className="flex justify-end gap-3">
          <button
            onClick={() => router.push("/admin/facturacion")}
            className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            onClick={generarFactura}
            disabled={generando || !datosCliente.razon_social}
            className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:bg-gray-400 font-medium"
          >
            {generando ? "Generando..." : "Generar Factura"}
          </button>
        </div>
      )}
    </div>
  )
}
