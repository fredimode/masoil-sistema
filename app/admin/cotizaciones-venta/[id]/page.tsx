"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ArrowLeft, Printer, Send, CheckCircle2, XCircle, ListChecks, ShoppingCart } from "lucide-react"
import {
  fetchCotizacionVentaById, fetchCotizacionVentaItems, updateCotizacionVenta,
  updateCotizacionVentaItemAprobado, fetchClientById, createOrder,
} from "@/lib/supabase/queries"
import { createClient as createSupabaseClient } from "@/lib/supabase/client"
import { generateCotizacionPDF } from "@/lib/pdf/cotizacion-pdf"
import { formatCurrency, formatDateStr } from "@/lib/utils"

const ESTADO_BADGES: Record<string, { label: string; cls: string }> = {
  pendiente: { label: "Pendiente", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  aprobada: { label: "Aprobada", cls: "bg-green-100 text-green-800 border-green-200" },
  parcialmente_aprobada: { label: "Aprobada parcial", cls: "bg-blue-100 text-blue-800 border-blue-200" },
  no_aprobada: { label: "No aprobada", cls: "bg-red-100 text-red-800 border-red-200" },
  convertida_pedido: { label: "Convertida a pedido", cls: "bg-indigo-100 text-indigo-800 border-indigo-200" },
}

export default function CotizacionVentaDetallePage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [loading, setLoading] = useState(true)
  const [cot, setCot] = useState<any | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [client, setClient] = useState<any | null>(null)

  const [parcialMode, setParcialMode] = useState(false)
  const [resendOpen, setResendOpen] = useState(false)
  const [converting, setConverting] = useState(false)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [sending, setSending] = useState(false)

  function buildPDFData() {
    if (!cot) return null
    return {
      numero: cot.numero,
      fecha: cot.fecha || cot.created_at,
      validez_fecha: cot.validez_fecha,
      forma_pago: cot.forma_pago,
      plazo_entrega: cot.plazo_entrega,
      observaciones: cot.observaciones,
      total: Number(cot.total) || 0,
      razon_social: cot.razon_social,
      cliente: {
        razon_social: cot.client_name || client?.businessName || "",
        cuit: client?.cuit || client?.numeroDocum || "",
        domicilio: client?.address || client?.domicilioEntrega || "",
        contacto: client?.contactName || "",
      },
      items: items.map((i) => ({
        cantidad: Number(i.cantidad) || 0,
        producto_nombre: i.producto_nombre || "",
        producto_codigo: i.producto_codigo || "",
        precio_unitario: Number(i.precio_unitario) || 0,
        subtotal: Number(i.subtotal) || 0,
      })),
    }
  }

  async function ensurePDFUrl(): Promise<string | null> {
    if (!cot) return null
    const pdfData = buildPDFData()
    if (!pdfData) return null
    const blob = generateCotizacionPDF(pdfData)
    const supabase = createSupabaseClient()
    const path = `cotizaciones/${cot.id}.pdf`
    const { error: upErr } = await supabase.storage
      .from("cotizaciones")
      .upload(path, blob, { upsert: true, contentType: "application/pdf" })
    if (upErr) {
      console.error("Error subiendo PDF:", upErr)
      return null
    }
    const { data: signed } = await supabase.storage
      .from("cotizaciones")
      .createSignedUrl(path, 60 * 60 * 24 * 7) // 7 días
    const url = signed?.signedUrl || null
    if (url && url !== cot.pdf_url) {
      await updateCotizacionVenta(cot.id, { pdf_url: url })
      setCot({ ...cot, pdf_url: url })
    }
    return url
  }

  async function loadAll() {
    setLoading(true)
    try {
      const c = await fetchCotizacionVentaById(id)
      setCot(c)
      const its = await fetchCotizacionVentaItems(id)
      setItems(its)
      if (c?.client_id) {
        const cli = await fetchClientById(c.client_id)
        setClient(cli)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (id) loadAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const totalAprobado = useMemo(
    () => items.filter((i) => i.aprobado).reduce((s, i) => s + (Number(i.subtotal) || 0), 0),
    [items],
  )
  const totalNoAprobado = useMemo(
    () => items.filter((i) => !i.aprobado).reduce((s, i) => s + (Number(i.subtotal) || 0), 0),
    [items],
  )

  async function toggleItem(itemId: string, aprobado: boolean) {
    await updateCotizacionVentaItemAprobado(itemId, aprobado)
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, aprobado } : i)))
  }

  async function handleAprobar() {
    await updateCotizacionVenta(id, { estado: "aprobada" })
    await loadAll()
  }

  async function handleNoAprobar() {
    await updateCotizacionVenta(id, { estado: "no_aprobada" })
    await loadAll()
  }

  async function handleAprobarParcialmente() {
    setParcialMode(true)
  }

  async function handleGuardarParcial() {
    const aprobadosCount = items.filter((i) => i.aprobado).length
    const totalCount = items.length
    const estado = aprobadosCount === 0 ? "no_aprobada"
      : aprobadosCount === totalCount ? "aprobada"
      : "parcialmente_aprobada"
    await updateCotizacionVenta(id, { estado })
    setParcialMode(false)
    await loadAll()
  }

  async function handleConvertirPedido() {
    if (!cot || !client) return
    const itemsAConvertir = items.filter((i) => i.aprobado)
    if (itemsAConvertir.length === 0) {
      alert("No hay items aprobados para convertir")
      return
    }
    setConverting(true)
    try {
      const orderId = await createOrder({
        clientId: cot.client_id,
        clientName: cot.client_name || client.businessName,
        vendedorId: cot.vendedor_id || null,
        vendedorName: cot.vendedor_nombre || "",
        zona: cot.zona || client.zona || "",
        notes: [cot.observaciones, `Origen: Cotización ${cot.numero}`].filter(Boolean).join(" - "),
        isCustom: false,
        isUrgent: false,
        total: itemsAConvertir.reduce((s, i) => s + (Number(i.subtotal) || 0), 0),
        items: itemsAConvertir.map((i) => ({
          productId: i.product_id || null,
          productCode: i.producto_codigo || "",
          productName: i.producto_nombre,
          quantity: Number(i.cantidad) || 1,
          price: Number(i.precio_unitario) || 0,
        })),
        razonSocial: cot.razon_social || undefined,
      })
      await updateCotizacionVenta(id, { estado: "convertida_pedido", order_id: orderId })
      router.push(`/admin/pedidos/${orderId}`)
    } catch (e: any) {
      console.error("Error convertir cotización en pedido:", {
        message: e?.message,
        code: e?.code,
        details: e?.details,
        hint: e?.hint,
        full: e,
      })
      alert(`Error al convertir en pedido: ${e?.message || e?.details || "desconocido"}`)
      setConverting(false)
    }
  }

  async function handleImprimir() {
    if (!cot) return
    setPdfBusy(true)
    try {
      const pdfData = buildPDFData()
      if (!pdfData) return
      const blob = generateCotizacionPDF(pdfData)
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank")
      // También sube al storage en background para que quede accesible al reenviar
      ensurePDFUrl().catch(() => {})
    } catch (e) {
      console.error("Error imprimiendo PDF:", e)
      alert("Error al generar PDF")
    } finally {
      setPdfBusy(false)
    }
  }

  async function handleReenviarEmail() {
    if (!cot) return
    if (!client?.email) {
      alert("El cliente no tiene email cargado")
      return
    }
    setSending(true)
    try {
      await ensurePDFUrl()
      const res = await fetch("/api/admin/cotizaciones/enviar-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cotizacionId: cot.id, email: client.email }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Error al enviar")
      setCot({ ...cot, enviada: true, enviada_at: new Date().toISOString(), enviada_medio: "email" })
      setResendOpen(false)
      alert(`Email enviado a ${client.email}`)
    } catch (e: any) {
      console.error(e)
      alert("Error al enviar email: " + (e?.message || ""))
    } finally {
      setSending(false)
    }
  }

  async function handleReenviarWhatsapp() {
    if (!cot) return
    const tel = (client?.whatsapp || client?.telefono || "").replace(/\D/g, "")
    if (!tel) {
      alert("El cliente no tiene WhatsApp/teléfono cargado")
      return
    }
    setSending(true)
    try {
      const url = await ensurePDFUrl()
      const text = encodeURIComponent(
        `Hola, le enviamos la cotización ${cot.numero} por un total de ${formatCurrency(Number(cot.total) || 0)}.${url ? `\n${url}` : ""}`,
      )
      window.open(`https://wa.me/${tel}?text=${text}`, "_blank")
      await updateCotizacionVenta(cot.id, {
        enviada: true,
        enviada_at: new Date().toISOString(),
        enviada_medio: "whatsapp",
      })
      setCot({ ...cot, enviada: true, enviada_at: new Date().toISOString(), enviada_medio: "whatsapp" })
      setResendOpen(false)
    } catch (e: any) {
      console.error(e)
      alert("Error al enviar por WhatsApp: " + (e?.message || ""))
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  if (!cot) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Cotización no encontrada</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/admin/cotizaciones-venta"><ArrowLeft className="h-4 w-4 mr-2" /> Volver</Link>
        </Button>
      </div>
    )
  }

  const est = ESTADO_BADGES[cot.estado] || { label: cot.estado, cls: "bg-gray-100 text-gray-700" }
  const puedeAprobar = cot.estado === "pendiente" || cot.estado === "parcialmente_aprobada"
  const puedeConvertir = (cot.estado === "aprobada" || cot.estado === "parcialmente_aprobada") && !cot.order_id

  return (
    <div className="p-6 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="icon">
              <Link href="/admin/cotizaciones-venta"><ArrowLeft className="h-5 w-5" /></Link>
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold font-mono">{cot.numero}</h1>
                <Badge variant="outline" className={est.cls}>{est.label}</Badge>
              </div>
              <p className="text-muted-foreground">Emitida el {formatDateStr(cot.fecha || cot.created_at)}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleImprimir} disabled={pdfBusy}>
              <Printer className="h-4 w-4 mr-2" />
              {pdfBusy ? "Generando..." : "Imprimir"}
            </Button>
            <Button variant="outline" onClick={() => setResendOpen(true)}>
              <Send className="h-4 w-4 mr-2" /> Reenviar
              {cot.enviada && <span className="ml-1 text-[10px] text-green-600">✓</span>}
            </Button>
          </div>
        </div>

        {cot.order_id && (
          <Card className="p-4 border-indigo-200 bg-indigo-50">
            <p className="text-sm">
              Esta cotización fue convertida en pedido:{" "}
              <Link href={`/admin/pedidos/${cot.order_id}`} className="font-medium text-indigo-700 hover:underline">
                Ver pedido →
              </Link>
            </p>
          </Card>
        )}

        {/* Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-6">
            <h3 className="font-semibold mb-3">Cliente</h3>
            <div className="space-y-1 text-sm">
              <p className="font-medium">{cot.client_name}</p>
              {client?.contactName && <p className="text-muted-foreground">{client.contactName}</p>}
              {client?.email && <p className="text-muted-foreground">Email: {client.email}</p>}
              {(client?.whatsapp || client?.telefono) && (
                <p className="text-muted-foreground">Tel: {client.whatsapp || client.telefono}</p>
              )}
              {cot.razon_social && <p className="text-muted-foreground">Razón social: {cot.razon_social}</p>}
              {cot.zona && <p className="text-muted-foreground">Zona: {cot.zona}</p>}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="font-semibold mb-3">Términos y Condiciones</h3>
            <div className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">Vendedor: </span>{cot.vendedor_nombre || "-"}{cot.vendedor_iniciales ? ` (${cot.vendedor_iniciales})` : ""}</p>
              <p><span className="text-muted-foreground">Validez: </span>{cot.validez_fecha ? formatDateStr(cot.validez_fecha) : "-"}</p>
              <p><span className="text-muted-foreground">Forma de pago: </span>{cot.forma_pago || "-"}</p>
              <p><span className="text-muted-foreground">Plazo de entrega: </span>{cot.plazo_entrega || "-"}</p>
            </div>
          </Card>
        </div>

        {/* Items */}
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold">Productos</h3>
            {parcialMode && (
              <span className="text-xs text-muted-foreground">Desmarcá los ítems que no se aprueban</span>
            )}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr className="text-left">
                {parcialMode && <th className="px-3 py-2 w-10"></th>}
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Producto</th>
                <th className="px-3 py-2 text-center">Cant.</th>
                <th className="px-3 py-2 text-right">P. Unit.</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id} className={`border-t ${!i.aprobado ? "bg-red-50/40 text-muted-foreground line-through" : ""}`}>
                  {parcialMode && (
                    <td className="px-3 py-2">
                      <Checkbox
                        checked={!!i.aprobado}
                        onCheckedChange={(c) => toggleItem(i.id, c === true)}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2 font-mono text-xs">{i.producto_codigo || "-"}</td>
                  <td className="px-3 py-2">{i.producto_nombre}</td>
                  <td className="px-3 py-2 text-center">{i.cantidad}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(Number(i.precio_unitario) || 0)}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatCurrency(Number(i.subtotal) || 0)}</td>
                </tr>
              ))}
              <tr className="border-t bg-muted/50 font-semibold">
                <td className="px-3 py-2" colSpan={parcialMode ? 5 : 4}>Total aprobado</td>
                <td className="px-3 py-2 text-right">{formatCurrency(totalAprobado)}</td>
              </tr>
              {parcialMode && totalNoAprobado > 0 && (
                <tr className="bg-muted/30 text-muted-foreground">
                  <td className="px-3 py-2" colSpan={5}>Total no aprobado</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(totalNoAprobado)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        {cot.observaciones && (
          <Card className="p-4">
            <p className="text-sm"><strong>Observaciones:</strong> {cot.observaciones}</p>
          </Card>
        )}

        {/* Actions */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            {puedeAprobar && !parcialMode && (
              <>
                <Button onClick={handleAprobar} className="bg-green-600 hover:bg-green-700">
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Aprobar
                </Button>
                <Button variant="outline" onClick={handleAprobarParcialmente}>
                  <ListChecks className="h-4 w-4 mr-2" /> Aprobar parcialmente
                </Button>
                <Button variant="outline" onClick={handleNoAprobar} className="text-red-600 hover:text-red-700">
                  <XCircle className="h-4 w-4 mr-2" /> No aprobar
                </Button>
              </>
            )}
            {parcialMode && (
              <>
                <Button onClick={handleGuardarParcial}>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Guardar aprobación parcial
                </Button>
                <Button variant="outline" onClick={() => setParcialMode(false)}>Cancelar</Button>
              </>
            )}
            {puedeConvertir && (
              <Button onClick={handleConvertirPedido} disabled={converting} className="ml-auto bg-indigo-600 hover:bg-indigo-700">
                <ShoppingCart className="h-4 w-4 mr-2" />
                {converting ? "Convirtiendo..." : "Convertir en Pedido"}
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* Resend dialog */}
      <Dialog open={resendOpen} onOpenChange={setResendOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reenviar cotización {cot.numero}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Se genera el PDF, se sube al storage y se envía por el medio elegido.
            </p>
            <div className="grid grid-cols-1 gap-2">
              <Button variant="outline" onClick={handleReenviarEmail} disabled={sending || !client?.email} className="justify-between">
                <span>Enviar por Email</span>
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">{client?.email || "sin email"}</span>
              </Button>
              <Button variant="outline" onClick={handleReenviarWhatsapp} disabled={sending || !(client?.whatsapp || client?.telefono)} className="justify-between">
                <span>Enviar por WhatsApp</span>
                <span className="text-xs text-muted-foreground">{client?.whatsapp || client?.telefono || "sin whatsapp"}</span>
              </Button>
            </div>
            {cot.enviada && (
              <p className="text-xs text-green-700 bg-green-50 p-2 rounded border border-green-200">
                Última vez enviada: {cot.enviada_at ? new Date(cot.enviada_at).toLocaleString("es-AR") : "-"}
                {cot.enviada_medio ? ` por ${cot.enviada_medio}` : ""}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResendOpen(false)} disabled={sending}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
