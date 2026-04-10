import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Mapeo de provincias argentinas → código TusFacturas
const PROVINCIA_CODIGO: Record<string, string> = {
  "Buenos Aires": "1",
  "Capital Federal": "0",
  "CABA": "0",
  "Catamarca": "2",
  "Chaco": "3",
  "Chubut": "4",
  "Córdoba": "5",
  "Cordoba": "5",
  "Corrientes": "6",
  "Entre Ríos": "7",
  "Entre Rios": "7",
  "Formosa": "8",
  "Jujuy": "9",
  "La Pampa": "10",
  "La Rioja": "11",
  "Mendoza": "12",
  "Misiones": "13",
  "Neuquén": "14",
  "Neuquen": "14",
  "Río Negro": "15",
  "Rio Negro": "15",
  "Salta": "16",
  "San Juan": "17",
  "San Luis": "18",
  "Santa Cruz": "19",
  "Santa Fe": "20",
  "Santiago del Estero": "21",
  "Tierra del Fuego": "22",
  "Tucumán": "23",
  "Tucuman": "23",
}

// Mapeo condición IVA del cliente → código TusFacturas
// Normaliza a uppercase para comparar
const CONDICION_IVA_MAP: Record<string, string> = {
  "RESP. INSCRIPTO": "RI",
  "RESPONSABLE INSCRIPTO": "RI",
  "RI": "RI",
  "MONOTRIBUTISTA": "M",
  "MONOTRIBUTISTA SOCIAL": "M",
  "M": "M",
  "CONSUMIDOR FINAL": "CF",
  "CF": "CF",
  "EXENTO": "E",
  "E": "E",
  "NO CATEGORIZADO": "CF",
}

function formatDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, "0")
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const y = date.getFullYear()
  return `${d}/${m}/${y}`
}

function limpiarCuit(cuit: string): string {
  return cuit.replace(/[-\s]/g, "")
}

interface ItemInput {
  productId?: string
  producto_nombre?: string
  producto_codigo?: string
  cantidad: number
  precioUnitario: number
}

/**
 * POST /api/facturacion/generar
 * Body: { orderId?, clientId, items?: ItemInput[] }
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 })
  }

  const body = await request.json()
  const { orderId, clientId, items: itemsDirectos, tipoComprobante, facturaReferenciaId } = body

  if (!clientId) {
    return NextResponse.json({ success: false, error: "clientId es requerido" }, { status: 400 })
  }

  // Helper para loguear pasos
  async function logPaso(facturaId: number | null, paso: string, estado: string, detalle: unknown, error?: string) {
    try {
      await supabase.from("facturacion_logs").insert({
        factura_id: facturaId,
        paso,
        estado,
        detalle: detalle as Record<string, unknown>,
        error: error || null,
      })
    } catch (e) {
      console.error("Error guardando log de facturación:", e)
    }
  }

  try {
    // ================================================================
    // PASO 1: Preparando datos
    // ================================================================

    // Buscar cliente
    const { data: cliente, error: clienteError } = await supabase
      .from("clients")
      .select("id, business_name, razon_social, numero_docum, tipo_docum, condicion_iva, domicilio, provincia, email, cuit")
      .eq("id", clientId)
      .single()

    if (clienteError || !cliente) {
      await logPaso(null, "preparando_datos", "error", { clientId }, "Cliente no encontrado")
      return NextResponse.json({ success: false, error: "Cliente no encontrado" }, { status: 404 })
    }

    // Resolver items: desde orderId o items directos
    let items: { descripcion: string; codigo: string; cantidad: number; precioUnitario: number }[] = []

    if (orderId) {
      const { data: orderItems, error: oiError } = await supabase
        .from("order_items")
        .select("quantity, unit_price, products(name, code)")
        .eq("order_id", orderId)

      if (oiError || !orderItems || orderItems.length === 0) {
        await logPaso(null, "preparando_datos", "error", { orderId }, "No se encontraron items del pedido")
        return NextResponse.json({ success: false, error: "No se encontraron items del pedido" }, { status: 404 })
      }

      items = orderItems.map((oi: any) => ({
        descripcion: oi.products?.name || "",
        codigo: oi.products?.code || "",
        cantidad: oi.quantity,
        precioUnitario: Number(oi.unit_price),
      }))
    } else if (itemsDirectos && itemsDirectos.length > 0) {
      // Items directos con búsqueda opcional de producto
      for (const item of itemsDirectos as ItemInput[]) {
        if (item.productId) {
          const { data: prod } = await supabase
            .from("products")
            .select("name, code, price")
            .eq("id", item.productId)
            .single()

          items.push({
            descripcion: prod?.name || item.producto_nombre || "Producto",
            codigo: prod?.code || item.producto_codigo || "",
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario || Number(prod?.price || 0),
          })
        } else {
          items.push({
            descripcion: item.producto_nombre || "Producto",
            codigo: item.producto_codigo || "",
            cantidad: item.cantidad,
            precioUnitario: item.precioUnitario,
          })
        }
      }
    } else {
      await logPaso(null, "preparando_datos", "error", body, "Debe enviar orderId o items[]")
      return NextResponse.json({ success: false, error: "Debe enviar orderId o items[]" }, { status: 400 })
    }

    // Determinar tipo de comprobante por condición IVA y tipo solicitado
    const condicionIvaCliente = CONDICION_IVA_MAP[(cliente.condicion_iva || "").toUpperCase().trim()] || "CF"
    const letra = condicionIvaCliente === "RI" ? "A" : "B"
    const tipoComp = tipoComprobante || "FACTURA"
    const tipoFactura = tipoComp === "NOTA_CREDITO"
      ? `NOTA DE CREDITO ${letra}`
      : tipoComp === "NOTA_DEBITO"
      ? `NOTA DE DEBITO ${letra}`
      : `FACTURA ${letra}`

    // Calcular totales - precios son SIN IVA
    const baseGravada = items.reduce((sum, it) => sum + it.cantidad * it.precioUnitario, 0)
    const iva21 = Math.round(baseGravada * 0.21 * 100) / 100
    const total = Math.round((baseGravada + iva21) * 100) / 100
    const baseGravadaRedondeada = Math.round(baseGravada * 100) / 100

    const razonSocial = cliente.razon_social || cliente.business_name || ""
    const cuitCliente = limpiarCuit(cliente.cuit || cliente.numero_docum || "")
    const provinciaCode = PROVINCIA_CODIGO[cliente.provincia || ""] || "1"

    const fechaHoy = new Date()
    const fechaVencimiento = new Date(fechaHoy)
    fechaVencimiento.setDate(fechaVencimiento.getDate() + 30)

    const datosPreparados = {
      cliente: { razonSocial, cuit: cuitCliente, condicionIva: condicionIvaCliente, provincia: provinciaCode },
      tipoFactura,
      items: items.length,
      baseGravada: baseGravadaRedondeada,
      iva21,
      total,
    }

    await logPaso(null, "preparando_datos", "ok", datosPreparados)

    // ================================================================
    // PASO 2: Enviando a TusFacturas
    // ================================================================

    // Build comprobantes_asociados for NC/ND
    let comprobantesAsociados: any[] = []
    if ((tipoComp === "NOTA_CREDITO" || tipoComp === "NOTA_DEBITO") && facturaReferenciaId) {
      const { data: facturaRef } = await supabase
        .from("facturas")
        .select("tipo, numero, comprobante_nro, fecha")
        .eq("id", facturaReferenciaId)
        .single()

      if (facturaRef) {
        const nroRef = facturaRef.comprobante_nro || facturaRef.numero || "0"
        // TusFacturas expects the tipo as text matching the original comprobante type
        const tipoRefText = facturaRef.tipo || `FACTURA ${letra}`

        comprobantesAsociados = [{
          tipo_comprobante: tipoRefText,
          punto_venta: parseInt(process.env.TUSFACTURAS_PUNTO_VENTA || "1"),
          numero: parseInt(nroRef) || 0,
          comprobante_fecha: facturaRef.fecha
            ? formatDate(new Date(facturaRef.fecha))
            : formatDate(fechaHoy),
        }]
      }
    }

    const payload: Record<string, any> = {
      apitoken: process.env.TUSFACTURAS_API_TOKEN,
      usertoken: process.env.TUSFACTURAS_USER_TOKEN,
      apikey: process.env.TUSFACTURAS_API_KEY,
      cliente: {
        documento_tipo: "CUIT",
        documento_nro: cuitCliente,
        razon_social: razonSocial,
        email: cliente.email || "",
        domicilio: cliente.domicilio || "",
        provincia: provinciaCode,
        condicion_iva: condicionIvaCliente,
        condicion_pago: "210", // Contado
      },
      comprobante: {
        fecha: formatDate(fechaHoy),
        tipo: tipoFactura,
        operacion: "V",
        punto_venta: parseInt(process.env.TUSFACTURAS_PUNTO_VENTA || "1"),
        vencimiento: formatDate(fechaVencimiento),
        moneda: "PES",
        idioma: 1,
        detalle: items.map((it) => ({
          cantidad: it.cantidad,
          afecta_stock: "N",
          producto: {
            descripcion: it.descripcion,
            unidad_bulto: 1,
            lista_precios: "MASOIL",
            codigo: it.codigo,
            precio_unitario_sin_iva: Math.round(it.precioUnitario * 100) / 100,
            alicuota: 21,
            unidad_medida: 7,
            actualiza_precio: "N",
            rg5329: "N",
          },
          leyenda: "",
        })),
        observaciones: orderId ? `Pedido ${orderId}` : tipoComp !== "FACTURA" ? `${tipoFactura}` : "Factura directa",
        total,
        comprobantes_asociados: comprobantesAsociados.length > 0 ? comprobantesAsociados : undefined,
      },
    }

    // Log del request (sin tokens sensibles)
    const payloadLog = { ...payload, apitoken: "***", usertoken: "***", apikey: "***" }
    await logPaso(null, "enviando_tusfacturas", "pendiente", { request: payloadLog })

    const tusfacturasUrl = "https://www.tusfacturas.app/app/api/v2/facturacion/nuevo"

    const response = await fetch(tusfacturasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const responseData = await response.json()

    await logPaso(null, "enviando_tusfacturas", response.ok ? "ok" : "error", {
      request: payloadLog,
      response: responseData,
      httpStatus: response.status,
    })

    // ================================================================
    // PASO 3: Procesando respuesta
    // ================================================================

    if (responseData.error === "N") {
      // Éxito - guardar factura en DB
      const { data: factura, error: insertError } = await supabase
        .from("facturas")
        .insert({
          order_id: orderId || null,
          client_id: clientId,
          numero: String(responseData.comprobante_nro || ""),
          comprobante_nro: String(responseData.comprobante_nro || ""),
          tipo: tipoFactura,
          fecha: fechaHoy.toISOString().slice(0, 10),
          cuit_cliente: cuitCliente,
          razon_social: razonSocial,
          base_gravada: baseGravadaRedondeada,
          iva_21: iva21,
          total: tipoComp === "NOTA_CREDITO" ? -Math.abs(total) : total,
          cae: responseData.cae || null,
          vencimiento_cae: responseData.vencimiento_cae
            ? responseData.vencimiento_cae.split("/").reverse().join("-")
            : null,
          factura_referencia_id: facturaReferenciaId || null,
        })
        .select()
        .single()

      if (insertError) {
        await logPaso(null, "procesando_respuesta", "error", { insertError: insertError.message }, "Error guardando factura en DB")
        return NextResponse.json({
          success: false,
          error: "Factura generada en AFIP pero error al guardar en DB: " + insertError.message,
          tusfacturas: responseData,
        }, { status: 500 })
      }

      await logPaso(factura.id, "procesando_respuesta", "ok", {
        factura_id: factura.id,
        numero: factura.numero,
        cae: responseData.cae,
        comprobante_nro: responseData.comprobante_nro,
        response: responseData,
      })

      return NextResponse.json({
        success: true,
        factura: {
          id: factura.id,
          numero: factura.numero,
          tipo: factura.tipo,
          cae: responseData.cae,
          vencimiento_cae: responseData.vencimiento_cae,
          comprobante_nro: responseData.comprobante_nro,
          total: factura.total,
          razon_social: factura.razon_social,
        },
      })
    } else {
      // Error de TusFacturas
      const errores = responseData.errores || [responseData.error_message || "Error desconocido de TusFacturas"]

      await logPaso(null, "procesando_respuesta", "error", {
        response: responseData,
        errores,
      }, errores.join("; "))

      return NextResponse.json({
        success: false,
        error: "Error de TusFacturas: " + errores.join("; "),
        errores,
        tusfacturas_response: responseData,
      })
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Error desconocido"
    await logPaso(null, "enviando_tusfacturas", "error", { error: errorMsg }, errorMsg)
    console.error("Error en /api/facturacion/generar:", error)
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 })
  }
}
