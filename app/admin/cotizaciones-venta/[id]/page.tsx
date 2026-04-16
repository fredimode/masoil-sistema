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
        vendedorId: cot.vendedor_id || "",
        vendedorName: cot.vendedor_nombre || "",
        zona: cot.zona || client.zona || "",
        notes: [cot.observaciones, `Origen: Cotización ${cot.numero}`].filter(Boolean).join(" - "),
        isCustom: false,
        isUrgent: false,
        total: itemsAConvertir.reduce((s, i) => s + (Number(i.subtotal) || 0), 0),
        items: itemsAConvertir.map((i) => ({
          productId: i.product_id || "",
          productCode: i.producto_codigo || "",
          productName: i.producto_nombre,
          quantity: Number(i.cantidad) || 1,
          price: Number(i.precio_unitario) || 0,
        })),
        razonSocial: cot.razon_social || undefined,
      })
      await updateCotizacionVenta(id, { estado: "convertida_pedido", order_id: orderId })
      router.push(`/admin/pedidos/${orderId}`)
    } catch (e) {
      console.error(e)
      alert("Error al convertir en pedido")
      setConverting(false)
    }
  }

  function handleImprimir() {
    const w = window.open("", "_blank")
    if (!w || !cot) return
    const rows = items.map((i) => `
      <tr>
        <td>${i.producto_codigo || ""}</td>
        <td>${i.producto_nombre || ""}</td>
        <td style="text-align:center">${i.cantidad}</td>
        <td style="text-align:right">${formatCurrency(Number(i.precio_unitario) || 0)}</td>
        <td style="text-align:right">${formatCurrency(Number(i.subtotal) || 0)}</td>
      </tr>`).join("")
    w.document.write(`<html><head><title>${cot.numero}</title>
      <style>body{font-family:sans-serif;max-width:900px;margin:30px auto}h1{font-size:20px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ddd;padding:6px 8px;font-size:12px}th{background:#f5f5f5;text-align:left}.totals{font-weight:bold;background:#f0f0f0}.info{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:15px;font-size:13px}</style></head><body>
      <h1>Cotización ${cot.numero}</h1>
      <div class="info">
        <div><strong>Fecha:</strong> ${formatDateStr(cot.fecha)}</div>
        <div><strong>Válida hasta:</strong> ${cot.validez_fecha ? formatDateStr(cot.validez_fecha) : "-"}</div>
        <div><strong>Cliente:</strong> ${cot.client_name || "-"}</div>
        <div><strong>Razón Social:</strong> ${cot.razon_social || "-"}</div>
        <div><strong>Vendedor:</strong> ${cot.vendedor_nombre || "-"} ${cot.vendedor_iniciales ? `(${cot.vendedor_iniciales})` : ""}</div>
        <div><strong>Forma de pago:</strong> ${cot.forma_pago || "-"}</div>
        <div><strong>Plazo de entrega:</strong> ${cot.plazo_entrega || "-"}</div>
      </div>
      <table><thead><tr><th>Código</th><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">P. Unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
      <tbody>${rows}
      <tr class="totals"><td colspan="4" style="text-align:right">TOTAL</td><td style="text-align:right">${formatCurrency(Number(cot.total) || 0)}</td></tr>
      </tbody></table>
      ${cot.observaciones ? `<p style="margin-top:15px"><strong>Observaciones:</strong> ${cot.observaciones}</p>` : ""}
      <script>window.print()<\/script></body></html>`)
  }

  function handleReenviarEmail() {
    if (!client?.email) {
      alert("El cliente no tiene email cargado")
      return
    }
    const subject = encodeURIComponent(`Cotización ${cot?.numero} - ${cot?.razon_social || ""}`)
    const body = encodeURIComponent(`Adjuntamos la cotización ${cot?.numero} por un total de ${formatCurrency(Number(cot?.total) || 0)}.`)
    window.open(`mailto:${client.email}?subject=${subject}&body=${body}`, "_blank")
  }

  function handleReenviarWhatsapp() {
    const tel = (client?.whatsapp || client?.telefono || "").replace(/\D/g, "")
    if (!tel) {
      alert("El cliente no tiene WhatsApp/teléfono cargado")
      return
    }
    const text = encodeURIComponent(`Hola, te envío la cotización ${cot?.numero} por ${formatCurrency(Number(cot?.total) || 0)}.`)
    window.open(`https://wa.me/${tel}?text=${text}`, "_blank")
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
            <Button variant="outline" onClick={handleImprimir}>
              <Printer className="h-4 w-4 mr-2" /> Imprimir
            </Button>
            <Button variant="outline" onClick={() => setResendOpen(true)}>
              <Send className="h-4 w-4 mr-2" /> Reenviar
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
            <DialogTitle>Reenviar cotización</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Elegí el medio para reenviar la cotización al cliente.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={handleReenviarEmail}>
                Email
                {client?.email && <span className="ml-2 text-xs text-muted-foreground truncate">{client.email}</span>}
              </Button>
              <Button variant="outline" onClick={handleReenviarWhatsapp}>
                WhatsApp
                {(client?.whatsapp || client?.telefono) && (
                  <span className="ml-2 text-xs text-muted-foreground truncate">{client.whatsapp || client.telefono}</span>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              El contenido se completa automáticamente. Asegurate de adjuntar el PDF antes de enviar.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResendOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
