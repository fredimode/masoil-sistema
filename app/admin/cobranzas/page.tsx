"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  fetchCobranzasPendientes,
  fetchClientesConCobranza,
  createCobro,
} from "@/lib/supabase/queries"
import { formatCurrency } from "@/lib/utils"
import {
  Search,
  Download,
  Users,
  DollarSign,
  Building2,
  Plus,
  ArrowUpDown,
  AlertCircle,
} from "lucide-react"
import * as XLSX from "xlsx"

interface CobranzaPendiente {
  id: string
  client_id: string
  cliente_nombre: string
  comprobante: string
  fecha_comprobante: string
  total: number
  saldo: number
  saldo_acumulado: number
  razon_social: string
}

interface ClienteCobranza {
  id: string
  business_name: string
  razon_social: string
  zona: string
  condicion_pago: string
  canal_facturacion: string
  canal_observaciones: string
  telefono: string
  email: string
}

type SortField =
  | "cliente_nombre"
  | "comprobante"
  | "fecha_comprobante"
  | "total"
  | "saldo"
  | "saldo_acumulado"
  | "razon_social"
type SortDir = "asc" | "desc"

export default function CobranzasPage() {
  const [loading, setLoading] = useState(true)
  const [cobranzas, setCobranzas] = useState<CobranzaPendiente[]>([])
  const [clientes, setClientes] = useState<ClienteCobranza[]>([])

  // Filters - clients table
  const [searchTerm, setSearchTerm] = useState("")
  const [razonSocialFilter, setRazonSocialFilter] = useState("todas")
  const [zonaFilter, setZonaFilter] = useState("todas")
  const [canalFilter, setCanalFilter] = useState("todos")

  // Filters - comprobantes table
  const [comprobantesSearch, setComprobantesSearch] = useState("")
  const [comprobantesRazonFilter, setComprobantesRazonFilter] = useState("todas")
  const [sortField, setSortField] = useState<SortField>("fecha_comprobante")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [cobroForm, setCobroForm] = useState({
    clienteId: "",
    monto: "",
    medioPago: "",
    referencia: "",
    notas: "",
    fecha: new Date().toISOString().slice(0, 10),
  })
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState("")

  useEffect(() => {
    async function load() {
      try {
        const [cob, cli] = await Promise.all([
          fetchCobranzasPendientes(),
          fetchClientesConCobranza(),
        ])
        setCobranzas(cob ?? [])
        setClientes(cli ?? [])
      } catch (err) {
        console.error("Error loading cobranzas:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  // --- Stats ---
  const uniqueClientsWithDebt = new Set(cobranzas.map((c) => c.client_id)).size
  const totalPendiente = cobranzas.reduce((sum, c) => sum + (c.saldo ?? 0), 0)
  const breakdownByRazonSocial = cobranzas.reduce<Record<string, number>>(
    (acc, c) => {
      const key = c.razon_social || "Sin razón social"
      acc[key] = (acc[key] ?? 0) + (c.saldo ?? 0)
      return acc
    },
    {}
  )

  // --- Unique filter options ---
  const uniqueRazonesSociales = [
    ...new Set(clientes.map((c) => c.razon_social).filter(Boolean)),
  ].sort()
  const uniqueZonas = [
    ...new Set(clientes.map((c) => c.zona).filter(Boolean)),
  ].sort()
  const uniqueCanales = [
    ...new Set(clientes.map((c) => c.canal_facturacion).filter(Boolean)),
  ].sort()
  const uniqueRazonesCobranzas = [
    ...new Set(cobranzas.map((c) => c.razon_social).filter(Boolean)),
  ].sort()

  // --- Filter clients ---
  let filteredClients = [...clientes]
  if (searchTerm) {
    const q = searchTerm.toLowerCase()
    filteredClients = filteredClients.filter(
      (c) =>
        (c.business_name ?? "").toLowerCase().includes(q) ||
        (c.razon_social ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.telefono ?? "").toLowerCase().includes(q)
    )
  }
  if (razonSocialFilter !== "todas") {
    filteredClients = filteredClients.filter(
      (c) => c.razon_social === razonSocialFilter
    )
  }
  if (zonaFilter !== "todas") {
    filteredClients = filteredClients.filter((c) => c.zona === zonaFilter)
  }
  if (canalFilter !== "todos") {
    filteredClients = filteredClients.filter(
      (c) => c.canal_facturacion === canalFilter
    )
  }

  // --- Filter & sort comprobantes ---
  let filteredCobranzas = [...cobranzas]
  if (comprobantesSearch) {
    const q = comprobantesSearch.toLowerCase()
    filteredCobranzas = filteredCobranzas.filter(
      (c) =>
        (c.cliente_nombre ?? "").toLowerCase().includes(q) ||
        (c.comprobante ?? "").toLowerCase().includes(q)
    )
  }
  if (comprobantesRazonFilter !== "todas") {
    filteredCobranzas = filteredCobranzas.filter(
      (c) => c.razon_social === comprobantesRazonFilter
    )
  }
  filteredCobranzas.sort((a, b) => {
    let valA: string | number = a[sortField] ?? ""
    let valB: string | number = b[sortField] ?? ""
    if (typeof valA === "number" && typeof valB === "number") {
      return sortDir === "asc" ? valA - valB : valB - valA
    }
    valA = String(valA)
    valB = String(valB)
    return sortDir === "asc"
      ? valA.localeCompare(valB)
      : valB.localeCompare(valA)
  })

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortField(field)
      setSortDir("asc")
    }
  }

  // --- Export XLSX ---
  function exportClients() {
    const data = filteredClients.map((c) => ({
      Cliente: c.business_name,
      "Razon Social": c.razon_social,
      Zona: c.zona,
      "Condicion de Pago": c.condicion_pago,
      "Canal Facturacion": c.canal_facturacion,
      "Observaciones Canal": c.canal_observaciones,
      Telefono: c.telefono,
      Email: c.email,
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Clientes Cobranza")
    XLSX.writeFile(
      wb,
      `cobranzas_clientes_${new Date().toISOString().slice(0, 10)}.xlsx`
    )
  }

  // --- Canal badge color ---
  function canalBadge(canal: string) {
    const upper = (canal ?? "").toUpperCase()
    if (upper === "MAIL")
      return <Badge variant="secondary" className="bg-blue-100 text-blue-700 hover:bg-blue-100">{canal}</Badge>
    if (upper === "WEB")
      return <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100">{canal}</Badge>
    if (upper === "PORTAL")
      return <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-100">{canal}</Badge>
    return <Badge variant="secondary">{canal || "-"}</Badge>
  }

  // --- Submit cobro ---
  async function handleSubmitCobro() {
    if (!cobroForm.monto || !cobroForm.medioPago) return
    setSubmitting(true)
    try {
      await createCobro({
        fecha: cobroForm.fecha,
        monto: parseFloat(cobroForm.monto),
        medio_pago: cobroForm.medioPago,
        referencia: cobroForm.referencia || undefined,
        notas: cobroForm.notas || undefined,
      })
      setSuccessMsg("Cobro registrado correctamente")
      setTimeout(() => setSuccessMsg(""), 4000)
      setDialogOpen(false)
      setCobroForm({
        clienteId: "",
        monto: "",
        medioPago: "",
        referencia: "",
        notas: "",
        fecha: new Date().toISOString().slice(0, 10),
      })
      // Reload data
      const [cob, cli] = await Promise.all([
        fetchCobranzasPendientes(),
        fetchClientesConCobranza(),
      ])
      setCobranzas(cob ?? [])
      setClientes(cli ?? [])
    } catch (err) {
      console.error("Error registrando cobro:", err)
      alert("Error al registrar el cobro. Intente nuevamente.")
    } finally {
      setSubmitting(false)
    }
  }

  const hasCobranzas = cobranzas.length > 0

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Cobranzas</h1>
          <p className="text-muted-foreground">
            Gestiona cobros pendientes y facturacion de clientes
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportClients}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Registrar Cobro
          </Button>
        </div>
      </div>

      {/* Success toast */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
          {successMsg}
        </div>
      )}

      {/* Empty cobranzas notice */}
      {!hasCobranzas && (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-lg">
                Sin datos de cobranzas cargados
              </p>
              <p className="text-muted-foreground mt-1">
                No hay comprobantes pendientes de cobro en el sistema. Cuando se
                carguen facturas o comprobantes, apareceran aqui con el detalle
                de saldos pendientes.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Stats cards (only when cobranzas data exists) */}
      {hasCobranzas && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Clientes con deuda
                </p>
                <p className="text-3xl font-bold">{uniqueClientsWithDebt}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  Monto total pendiente
                </p>
                <p className="text-3xl font-bold">
                  {formatCurrency(totalPendiente)}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                <Building2 className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">
                  Deuda por razon social
                </p>
                <div className="space-y-0.5">
                  {Object.entries(breakdownByRazonSocial).map(
                    ([razon, monto]) => (
                      <div
                        key={razon}
                        className="flex justify-between text-sm gap-4"
                      >
                        <span className="truncate">{razon}</span>
                        <span className="font-semibold whitespace-nowrap">
                          {formatCurrency(monto)}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Clients Table */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Clientes</h2>

        {/* Filters */}
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, email, telefono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={razonSocialFilter} onValueChange={setRazonSocialFilter}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Razon Social" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las razones sociales</SelectItem>
              {uniqueRazonesSociales.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={zonaFilter} onValueChange={setZonaFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Zona" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las zonas</SelectItem>
              {uniqueZonas.map((z) => (
                <SelectItem key={z} value={z}>
                  {z}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={canalFilter} onValueChange={setCanalFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Canal Facturacion" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los canales</SelectItem>
              {uniqueCanales.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Razon Social</TableHead>
                <TableHead>Zona</TableHead>
                <TableHead>Condicion de pago</TableHead>
                <TableHead>Canal Facturacion</TableHead>
                <TableHead>Observaciones canal</TableHead>
                <TableHead>Telefono</TableHead>
                <TableHead>Email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No se encontraron clientes
                  </TableCell>
                </TableRow>
              ) : (
                filteredClients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.business_name}
                    </TableCell>
                    <TableCell>{c.razon_social || "-"}</TableCell>
                    <TableCell>{c.zona || "-"}</TableCell>
                    <TableCell>{c.condicion_pago || "-"}</TableCell>
                    <TableCell>{canalBadge(c.canal_facturacion)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {c.canal_observaciones || "-"}
                    </TableCell>
                    <TableCell>{c.telefono || "-"}</TableCell>
                    <TableCell>{c.email || "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Comprobantes Pendientes Table */}
      {hasCobranzas && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Comprobantes Pendientes</h2>

          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por cliente o comprobante..."
                value={comprobantesSearch}
                onChange={(e) => setComprobantesSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={comprobantesRazonFilter}
              onValueChange={setComprobantesRazonFilter}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Razon Social" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">
                  Todas las razones sociales
                </SelectItem>
                {uniqueRazonesCobranzas.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort("cliente_nombre")}
                  >
                    <span className="flex items-center gap-1">
                      Cliente
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort("comprobante")}
                  >
                    <span className="flex items-center gap-1">
                      Comprobante
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort("fecha_comprobante")}
                  >
                    <span className="flex items-center gap-1">
                      Fecha
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-right"
                    onClick={() => toggleSort("total")}
                  >
                    <span className="flex items-center justify-end gap-1">
                      Total
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-right"
                    onClick={() => toggleSort("saldo")}
                  >
                    <span className="flex items-center justify-end gap-1">
                      Saldo
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none text-right"
                    onClick={() => toggleSort("saldo_acumulado")}
                  >
                    <span className="flex items-center justify-end gap-1">
                      Saldo Acumulado
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TableHead>
                  <TableHead
                    className="cursor-pointer select-none"
                    onClick={() => toggleSort("razon_social")}
                  >
                    <span className="flex items-center gap-1">
                      Razon Social
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCobranzas.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No se encontraron comprobantes
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCobranzas.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.cliente_nombre}
                      </TableCell>
                      <TableCell>{c.comprobante}</TableCell>
                      <TableCell>
                        {c.fecha_comprobante
                          ? new Date(
                              c.fecha_comprobante + "T00:00:00"
                            ).toLocaleDateString("es-AR")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(c.total ?? 0)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(c.saldo ?? 0)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(c.saldo_acumulado ?? 0)}
                      </TableCell>
                      <TableCell>{c.razon_social || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Registrar Cobro Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar Cobro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="cobro-cliente">Cliente</Label>
              <Select
                value={cobroForm.clienteId}
                onValueChange={(v) =>
                  setCobroForm((f) => ({ ...f, clienteId: v }))
                }
              >
                <SelectTrigger id="cobro-cliente">
                  <SelectValue placeholder="Seleccionar cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.business_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cobro-fecha">Fecha</Label>
              <Input
                id="cobro-fecha"
                type="date"
                value={cobroForm.fecha}
                onChange={(e) =>
                  setCobroForm((f) => ({ ...f, fecha: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cobro-monto">
                Monto <span className="text-red-500">*</span>
              </Label>
              <Input
                id="cobro-monto"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={cobroForm.monto}
                onChange={(e) =>
                  setCobroForm((f) => ({ ...f, monto: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cobro-medio">
                Medio de pago <span className="text-red-500">*</span>
              </Label>
              <Select
                value={cobroForm.medioPago}
                onValueChange={(v) =>
                  setCobroForm((f) => ({ ...f, medioPago: v }))
                }
              >
                <SelectTrigger id="cobro-medio">
                  <SelectValue placeholder="Seleccionar medio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Efectivo">Efectivo</SelectItem>
                  <SelectItem value="Transferencia">Transferencia</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                  <SelectItem value="Cuenta Corriente">
                    Cuenta Corriente
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cobro-referencia">Referencia</Label>
              <Input
                id="cobro-referencia"
                placeholder="Nro. de transferencia, cheque, etc."
                value={cobroForm.referencia}
                onChange={(e) =>
                  setCobroForm((f) => ({
                    ...f,
                    referencia: e.target.value,
                  }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cobro-notas">Notas</Label>
              <Textarea
                id="cobro-notas"
                placeholder="Observaciones adicionales..."
                rows={3}
                value={cobroForm.notas}
                onChange={(e) =>
                  setCobroForm((f) => ({ ...f, notas: e.target.value }))
                }
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSubmitCobro}
                disabled={submitting || !cobroForm.monto || !cobroForm.medioPago}
              >
                {submitting ? "Registrando..." : "Registrar Cobro"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
