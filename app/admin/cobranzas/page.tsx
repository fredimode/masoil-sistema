"use client"

import { useState, useEffect, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  fetchCobranzasPendientes, fetchClients, fetchCuentaCorrienteCliente,
  fetchRetenciones, fetchRecibos, createCobro, createRetencion, createMovimientoCuentaCorriente,
  deleteCobranzaPendiente,
} from "@/lib/supabase/queries"
import { formatCurrency, normalizeSearch, formatDateStr } from "@/lib/utils"
import { TablePagination, usePagination } from "@/components/ui/table-pagination"
import { Search, Download, Plus, Trash2, Eye, Printer, Mail } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import * as XLSX from "xlsx"

// ─── Types ──────────────────────────────────────────────────────────────────

type MedioPago = {
  id: string
  tipo: "Efectivo" | "Transferencia" | "Cheque" | "Echeq" | "Compensación"
  importe: number
  referencia: string
  numero: string
  banco: string
  fecha_emision: string
  fecha_deposito: string
}

type RetencionForm = {
  id: string
  tipo: string
  nro_comprobante: string
  fecha: string
  importe: number
}

const TIPOS_RETENCION = ["ARBA", "ARCA", "IIBB_CABA", "IIBB_BSAS", "IVA", "GANANCIAS", "Otro"]
const RAZONES_SOCIALES = ["Masoil", "Aquiles", "Conancap", "Todas"]

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function emptyMedio(): MedioPago {
  return { id: uid(), tipo: "Efectivo", importe: 0, referencia: "", numero: "", banco: "", fecha_emision: "", fecha_deposito: "" }
}

function emptyRetencion(): RetencionForm {
  return { id: uid(), tipo: "ARBA", nro_comprobante: "", fecha: "", importe: 0 }
}

// ─── Main Component ─────────────────────────────────────────────────────────

const EMPRESAS = ["Todas", "Aquiles", "Conancap", "Masoil"]

export default function CobranzasPage() {
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<any[]>([])
  const [cobranzas, setCobranzas] = useState<any[]>([])
  const [retenciones, setRetenciones] = useState<any[]>([])
  const [recibos, setRecibos] = useState<any[]>([])
  const [empresaFilter, setEmpresaFilter] = useState("Todas")

  useEffect(() => {
    async function load() {
      try {
        const [cl, cp, ret, rec] = await Promise.all([
          fetchClients(),
          fetchCobranzasPendientes(),
          fetchRetenciones(),
          fetchRecibos(),
        ])
        setClients(cl)
        setCobranzas(cp)
        setRetenciones(ret)
        setRecibos(rec)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cobranzas</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Empresa:</label>
          <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EMPRESAS.map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="cuenta-corriente">
        <TabsList>
          <TabsTrigger value="cuenta-corriente">Cuenta Corriente</TabsTrigger>
          <TabsTrigger value="registrar-cobro">Registrar Cobro</TabsTrigger>
          <TabsTrigger value="cobros-realizados">Cobros Realizados</TabsTrigger>
          <TabsTrigger value="retenciones">Retenciones</TabsTrigger>
          <TabsTrigger value="informe">Informe Cobranzas Pendientes</TabsTrigger>
        </TabsList>

        <TabsContent value="cuenta-corriente">
          <TabCuentaCorriente clients={clients} />
        </TabsContent>

        <TabsContent value="registrar-cobro">
          <TabRegistrarCobro clients={clients} cobranzas={cobranzas} setCobranzas={setCobranzas} />
        </TabsContent>

        <TabsContent value="cobros-realizados">
          <TabCobrosRealizados recibos={recibos} />
        </TabsContent>

        <TabsContent value="retenciones">
          <TabRetenciones retenciones={retenciones} clients={clients} />
        </TabsContent>

        <TabsContent value="informe">
          <TabInforme cobranzas={cobranzas} clients={clients} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Tab 1: Cuenta Corriente ────────────────────────────────────────────────

function TabCuentaCorriente({ clients }: { clients: any[] }) {
  const [search, setSearch] = useState("")
  const [selectedClient, setSelectedClient] = useState<any | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [loadingMov, setLoadingMov] = useState(false)
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [todos, setTodos] = useState(false)
  const [page, setPage] = useState(1)

  const filteredClients = useMemo(() => {
    if (!search.trim()) return []
    const norm = normalizeSearch(search)
    return clients.filter((c) => normalizeSearch(c.businessName || "").includes(norm)).slice(0, 10)
  }, [search, clients])

  async function loadMovimientos(clientId?: string) {
    setLoadingMov(true)
    try {
      const data = await fetchCuentaCorrienteCliente(clientId)
      setMovimientos(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingMov(false)
    }
  }

  function handleSelectClient(client: any) {
    setSelectedClient(client)
    setSearch(client.businessName)
    setShowDropdown(false)
    setTodos(false)
    loadMovimientos(client.id)
  }

  function handleTodosChange(checked: boolean) {
    setTodos(checked)
    if (checked) {
      setSelectedClient(null)
      setSearch("")
      loadMovimientos()
    } else {
      setMovimientos([])
    }
  }

  const filtered = useMemo(() => {
    let rows = movimientos
    if (desde) rows = rows.filter((m) => (m.fecha || "") >= desde)
    if (hasta) rows = rows.filter((m) => (m.fecha || "") <= hasta)
    return rows
  }, [movimientos, desde, hasta])

  const pag = usePagination(filtered, 50)

  // Running saldo
  const withSaldo = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""))
    let saldo = 0
    return sorted.map((m) => {
      saldo += (m.debe || 0) - (m.haber || 0)
      return { ...m, saldo }
    }).reverse()
  }, [filtered])

  const pageRows = pag.getPage(page)
  // map pageRows to withSaldo by index offset
  const startIdx = (page - 1) * 50
  const displayRows = withSaldo.slice(startIdx, startIdx + 50)

  function exportXLSX() {
    const ws = XLSX.utils.json_to_sheet(
      withSaldo.map((m) => ({
        Fecha: formatDateStr(m.fecha),
        "Tipo Comprobante": m.tipo_comprobante || "",
        "PV-Número": m.pv_numero || "",
        Debe: m.debe || 0,
        Haber: m.haber || 0,
        Saldo: m.saldo,
      }))
    )
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Cuenta Corriente")
    XLSX.writeFile(wb, "cuenta_corriente.xlsx")
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[250px]">
          <label className="text-sm font-medium mb-1 block">Buscar cliente</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setShowDropdown(true) }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Razón social..."
              className="w-full pl-9 pr-3 py-2 border rounded-md text-sm"
              disabled={todos}
            />
          </div>
          {showDropdown && filteredClients.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
              {filteredClients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelectClient(c)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                >
                  {c.businessName}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="border rounded-md px-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer pb-2">
          <input type="checkbox" checked={todos} onChange={(e) => handleTodosChange(e.target.checked)} />
          Todos los clientes
        </label>
        <button onClick={exportXLSX} className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700" disabled={withSaldo.length === 0}>
          <Download className="h-4 w-4" /> XLSX
        </button>
      </div>

      {loadingMov ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : displayRows.length > 0 ? (
        <>
          <div className="border rounded-md overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo Comprobante</TableHead>
                  <TableHead>PV-Número</TableHead>
                  <TableHead className="text-right">Debe</TableHead>
                  <TableHead className="text-right">Haber</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((m, i) => (
                  <TableRow key={m.id || i}>
                    <TableCell>{formatDateStr(m.fecha)}</TableCell>
                    <TableCell>{m.tipo_comprobante || "-"}</TableCell>
                    <TableCell>{m.pv_numero || "-"}</TableCell>
                    <TableCell className="text-right">{m.debe ? formatCurrency(m.debe) : "-"}</TableCell>
                    <TableCell className="text-right">{m.haber ? formatCurrency(m.haber) : "-"}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(m.saldo)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <TablePagination currentPage={page} totalPages={pag.totalPages} totalItems={pag.totalItems} pageSize={pag.pageSize} onPageChange={setPage} />
        </>
      ) : (
        <p className="text-sm text-gray-500 text-center py-8">
          {selectedClient || todos ? "Sin movimientos" : "Seleccione un cliente o marque \"Todos los clientes\""}
        </p>
      )}
    </Card>
  )
}

// ─── Tab 2: Registrar Cobro ─────────────────────────────────────────────────

function TabRegistrarCobro({
  clients, cobranzas, setCobranzas,
}: {
  clients: any[]; cobranzas: any[]; setCobranzas: (c: any[]) => void
}) {
  const [search, setSearch] = useState("")
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedClient, setSelectedClient] = useState<any | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [medios, setMedios] = useState<MedioPago[]>([emptyMedio()])
  const [rets, setRets] = useState<RetencionForm[]>([])
  const [confirmando, setConfirmando] = useState(false)

  const filteredClients = useMemo(() => {
    if (!search.trim()) return []
    const norm = normalizeSearch(search)
    return clients.filter((c) => normalizeSearch(c.businessName || "").includes(norm)).slice(0, 10)
  }, [search, clients])

  const pendientesCliente = useMemo(() => {
    if (!selectedClient) return []
    return cobranzas.filter((c) => c.client_id === selectedClient.id)
  }, [cobranzas, selectedClient])

  const totalSeleccionado = useMemo(() => {
    return pendientesCliente
      .filter((c) => selectedIds.has(c.id))
      .reduce((sum, c) => sum + (c.saldo_pendiente || c.total || 0), 0)
  }, [pendientesCliente, selectedIds])

  const totalMedios = useMemo(() => medios.reduce((s, m) => s + (m.importe || 0), 0), [medios])
  const totalRets = useMemo(() => rets.reduce((s, r) => s + (r.importe || 0), 0), [rets])
  const totalValores = totalMedios + totalRets

  function handleSelectClient(client: any) {
    setSelectedClient(client)
    setSearch(client.businessName)
    setShowDropdown(false)
    setSelectedIds(new Set())
  }

  function toggleFactura(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function updateMedio(id: string, field: string, value: any) {
    setMedios((prev) => prev.map((m) => m.id === id ? { ...m, [field]: value } : m))
  }

  function removeMedio(id: string) {
    setMedios((prev) => prev.filter((m) => m.id !== id))
  }

  function updateRet(id: string, field: string, value: any) {
    setRets((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r))
  }

  function removeRet(id: string) {
    setRets((prev) => prev.filter((r) => r.id !== id))
  }

  async function handleConfirmar() {
    if (!selectedClient || totalValores < totalSeleccionado) return
    setConfirmando(true)
    try {
      // Generate recibo number
      const reciboNum = `REC-${String(Date.now()).slice(-6)}`

      // Create cobro
      await createCobro({
        fecha: new Date().toISOString().slice(0, 10),
        monto: totalValores,
        medio_pago: medios.map((m) => m.tipo).join(", "),
        referencia: reciboNum,
        notas: `Cobro a ${selectedClient.businessName}`,
      })

      // Create retenciones
      for (const r of rets) {
        if (r.importe > 0) {
          await createRetencion({
            client_id: selectedClient.id,
            tipo: r.tipo,
            nro_comprobante: r.nro_comprobante,
            fecha: r.fecha || new Date().toISOString().slice(0, 10),
            importe: r.importe,
          })
        }
      }

      // Create movimiento en cuenta corriente
      await createMovimientoCuentaCorriente({
        client_id: selectedClient.id,
        fecha: new Date().toISOString().slice(0, 10),
        tipo_comprobante: "RECIBO",
        pv_numero: reciboNum,
        haber: totalValores,
        debe: 0,
      })

      // Update local cobranzas state - remove fully paid, update partial
      const updatedCobranzas = cobranzas.map((c) => {
        if (!selectedIds.has(c.id)) return c
        return { ...c, saldo_pendiente: 0 }
      })
      setCobranzas(updatedCobranzas)

      // Reset form
      setSelectedClient(null)
      setSearch("")
      setSelectedIds(new Set())
      setMedios([emptyMedio()])
      setRets([])
      alert("Cobro registrado exitosamente")
    } catch (e: any) {
      console.error(e)
      alert("Error al registrar cobro: " + (e.message || ""))
    } finally {
      setConfirmando(false)
    }
  }

  const diff = totalValores - totalSeleccionado

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* LEFT - Cuenta Corriente del Cliente */}
      <Card className="p-4 space-y-4">
        <h3 className="font-semibold text-lg">Cuenta Corriente del Cliente</h3>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowDropdown(true) }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Buscar cliente por razón social..."
            className="w-full pl-9 pr-3 py-2 border rounded-md text-sm"
          />
          {showDropdown && filteredClients.length > 0 && (
            <div className="absolute z-50 mt-1 w-full bg-white border rounded-md shadow-lg max-h-48 overflow-auto">
              {filteredClients.map((c) => (
                <button
                  key={c.id}
                  onClick={() => handleSelectClient(c)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                >
                  {c.businessName}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedClient && pendientesCliente.length > 0 ? (
          <>
            <div className="border rounded-md overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Comprobante</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Saldo Pend.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendientesCliente.map((c) => (
                    <TableRow key={c.id} className={selectedIds.has(c.id) ? "bg-blue-50" : ""}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleFactura(c.id)}
                        />
                      </TableCell>
                      <TableCell>{formatDateStr(c.fecha || c.created_at)}</TableCell>
                      <TableCell>{c.comprobante || c.tipo_comprobante || "-"}</TableCell>
                      <TableCell className="text-right">{formatCurrency(c.total || 0)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(c.saldo_pendiente || c.total || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="text-right font-semibold text-sm">
              Total seleccionado: {formatCurrency(totalSeleccionado)}
            </div>
          </>
        ) : selectedClient ? (
          <p className="text-sm text-gray-500 py-4">Sin facturas pendientes para este cliente</p>
        ) : (
          <p className="text-sm text-gray-500 py-4">Seleccione un cliente para ver sus facturas pendientes</p>
        )}
      </Card>

      {/* RIGHT - Valores de Pago */}
      <Card className="p-4 space-y-4">
        <h3 className="font-semibold text-lg">Valores de Pago</h3>

        {/* Medios de pago */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Medios de pago</label>
            <button
              onClick={() => setMedios((prev) => [...prev, emptyMedio()])}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              <Plus className="h-3 w-3" /> Agregar medio de pago
            </button>
          </div>

          {medios.map((m) => (
            <div key={m.id} className="border rounded-md p-3 space-y-2 bg-gray-50">
              <div className="flex items-center gap-2">
                <select
                  value={m.tipo}
                  onChange={(e) => updateMedio(m.id, "tipo", e.target.value)}
                  className="border rounded-md px-2 py-1.5 text-sm flex-1"
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Echeq">Echeq</option>
                  <option value="Compensación">Compensación</option>
                </select>
                {medios.length > 1 && (
                  <button onClick={() => removeMedio(m.id)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Importe</label>
                  <input
                    type="number"
                    step="0.01"
                    value={m.importe || ""}
                    onChange={(e) => updateMedio(m.id, "importe", parseFloat(e.target.value) || 0)}
                    className="w-full border rounded-md px-2 py-1.5 text-sm"
                    placeholder="0.00"
                  />
                </div>

                {(m.tipo === "Transferencia" || m.tipo === "Compensación") && (
                  <div>
                    <label className="text-xs text-gray-500">Referencia</label>
                    <input
                      type="text"
                      value={m.referencia}
                      onChange={(e) => updateMedio(m.id, "referencia", e.target.value)}
                      className="w-full border rounded-md px-2 py-1.5 text-sm"
                    />
                  </div>
                )}
              </div>

              {(m.tipo === "Cheque" || m.tipo === "Echeq") && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">Número</label>
                    <input
                      type="text"
                      value={m.numero}
                      onChange={(e) => updateMedio(m.id, "numero", e.target.value)}
                      className="w-full border rounded-md px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Banco</label>
                    <input
                      type="text"
                      value={m.banco}
                      onChange={(e) => updateMedio(m.id, "banco", e.target.value)}
                      className="w-full border rounded-md px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Fecha emisión</label>
                    <input
                      type="date"
                      value={m.fecha_emision}
                      onChange={(e) => updateMedio(m.id, "fecha_emision", e.target.value)}
                      className="w-full border rounded-md px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Fecha depósito</label>
                    <input
                      type="date"
                      value={m.fecha_deposito}
                      onChange={(e) => updateMedio(m.id, "fecha_deposito", e.target.value)}
                      className="w-full border rounded-md px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Retenciones */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Retenciones</label>
            <button
              onClick={() => setRets((prev) => [...prev, emptyRetencion()])}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
            >
              <Plus className="h-3 w-3" /> Agregar retención
            </button>
          </div>

          {rets.map((r) => (
            <div key={r.id} className="border rounded-md p-3 space-y-2 bg-gray-50">
              <div className="flex items-center gap-2">
                <select
                  value={r.tipo}
                  onChange={(e) => updateRet(r.id, "tipo", e.target.value)}
                  className="border rounded-md px-2 py-1.5 text-sm flex-1"
                >
                  {TIPOS_RETENCION.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button onClick={() => removeRet(r.id)} className="text-red-500 hover:text-red-700">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-gray-500">Nro Comprobante</label>
                  <input
                    type="text"
                    value={r.nro_comprobante}
                    onChange={(e) => updateRet(r.id, "nro_comprobante", e.target.value)}
                    className="w-full border rounded-md px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Fecha</label>
                  <input
                    type="date"
                    value={r.fecha}
                    onChange={(e) => updateRet(r.id, "fecha", e.target.value)}
                    className="w-full border rounded-md px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Importe</label>
                  <input
                    type="number"
                    step="0.01"
                    value={r.importe || ""}
                    onChange={(e) => updateRet(r.id, "importe", parseFloat(e.target.value) || 0)}
                    className="w-full border rounded-md px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="border-t pt-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Total medios de pago:</span>
            <span className="font-medium">{formatCurrency(totalMedios)}</span>
          </div>
          {totalRets > 0 && (
            <div className="flex justify-between text-sm">
              <span>Total retenciones:</span>
              <span className="font-medium">{formatCurrency(totalRets)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold">
            <span>Total valores:</span>
            <span>{formatCurrency(totalValores)}</span>
          </div>
        </div>

        {/* Validation messages */}
        {selectedIds.size > 0 && totalValores > 0 && diff > 0 && (
          <div className="bg-green-50 border border-green-200 rounded-md px-3 py-2 text-sm text-green-700">
            Saldo a favor: {formatCurrency(diff)} — se registrará como pago a cuenta
          </div>
        )}
        {selectedIds.size > 0 && totalValores > 0 && diff < 0 && (
          <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-sm text-red-600">
            El total de valores no cubre las facturas seleccionadas
          </div>
        )}

        {/* Confirm */}
        <button
          onClick={handleConfirmar}
          disabled={confirmando || !selectedClient || selectedIds.size === 0 || totalValores < totalSeleccionado}
          className="w-full py-2.5 bg-primary text-white rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {confirmando ? "Registrando..." : "Confirmar Cobro"}
        </button>
      </Card>
    </div>
  )
}

// ─── Tab 3: Retenciones ─────────────────────────────────────────────────────

function TabRetenciones({ retenciones, clients }: { retenciones: any[]; clients: any[] }) {
  const [search, setSearch] = useState("")
  const [filtroTipo, setFiltroTipo] = useState("Todos")
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [page, setPage] = useState(1)

  const clientMap = useMemo(() => {
    const map: Record<string, string> = {}
    clients.forEach((c) => { map[c.id] = c.businessName })
    return map
  }, [clients])

  const filtered = useMemo(() => {
    let rows = retenciones
    if (filtroTipo !== "Todos") rows = rows.filter((r) => r.tipo === filtroTipo)
    if (search.trim()) {
      const norm = normalizeSearch(search)
      rows = rows.filter((r) => normalizeSearch(clientMap[r.client_id] || "").includes(norm))
    }
    if (desde) rows = rows.filter((r) => (r.fecha || "") >= desde)
    if (hasta) rows = rows.filter((r) => (r.fecha || "") <= hasta)
    return rows
  }, [retenciones, filtroTipo, search, desde, hasta, clientMap])

  const pag = usePagination(filtered, 50)

  function exportXLSX() {
    const ws = XLSX.utils.json_to_sheet(
      filtered.map((r) => ({
        Fecha: formatDateStr(r.fecha),
        Cliente: clientMap[r.client_id] || "-",
        Tipo: r.tipo || "",
        "Nro Comprobante": r.nro_comprobante || "",
        Importe: r.importe || 0,
      }))
    )
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Retenciones")
    XLSX.writeFile(wb, "retenciones.xlsx")
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <label className="text-sm font-medium mb-1 block">Buscar cliente</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Razón social..."
              className="w-full pl-9 pr-3 py-2 border rounded-md text-sm"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Tipo</label>
          <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="border rounded-md px-3 py-2 text-sm">
            <option value="Todos">Todos</option>
            {TIPOS_RETENCION.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="border rounded-md px-3 py-2 text-sm" />
        </div>
        <button onClick={exportXLSX} className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700" disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> XLSX
        </button>
      </div>

      <div className="border rounded-md overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Nro Comprobante</TableHead>
              <TableHead className="text-right">Importe</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pag.getPage(page).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-500 py-8">Sin retenciones</TableCell>
              </TableRow>
            ) : (
              pag.getPage(page).map((r: any, i: number) => (
                <TableRow key={r.id || i}>
                  <TableCell>{formatDateStr(r.fecha)}</TableCell>
                  <TableCell>{clientMap[r.client_id] || "-"}</TableCell>
                  <TableCell><Badge variant="outline">{r.tipo}</Badge></TableCell>
                  <TableCell>{r.nro_comprobante || "-"}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(r.importe || 0)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <TablePagination currentPage={page} totalPages={pag.totalPages} totalItems={pag.totalItems} pageSize={pag.pageSize} onPageChange={setPage} />
    </Card>
  )
}

// ─── Tab 4: Informe Cobranzas Pendientes ────────────────────────────────────

function TabInforme({ cobranzas, clients }: { cobranzas: any[]; clients: any[] }) {
  const [filtroRS, setFiltroRS] = useState("Todas")
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [page, setPage] = useState(1)

  const clientMap = useMemo(() => {
    const map: Record<string, string> = {}
    clients.forEach((c) => { map[c.id] = c.businessName })
    return map
  }, [clients])

  const filtered = useMemo(() => {
    let rows = cobranzas
    if (filtroRS !== "Todas") {
      rows = rows.filter((c) => (c.razon_social || "").toLowerCase() === filtroRS.toLowerCase())
    }
    if (desde) rows = rows.filter((c) => (c.fecha || c.created_at || "") >= desde)
    if (hasta) rows = rows.filter((c) => (c.fecha || c.created_at || "") <= hasta)
    return rows
  }, [cobranzas, filtroRS, desde, hasta])

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, c) => ({
        total: acc.total + (c.total || 0),
        saldo: acc.saldo + (c.saldo_pendiente || c.total || 0),
      }),
      { total: 0, saldo: 0 }
    )
  }, [filtered])

  const pag = usePagination(filtered, 50)

  function exportXLSX() {
    const ws = XLSX.utils.json_to_sheet(
      filtered.map((c) => ({
        Cliente: clientMap[c.client_id] || c.client_name || "-",
        Comprobante: c.comprobante || c.tipo_comprobante || "",
        Fecha: formatDateStr(c.fecha || c.created_at),
        Total: c.total || 0,
        "Saldo Pendiente": c.saldo_pendiente || c.total || 0,
      }))
    )
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Cobranzas Pendientes")
    XLSX.writeFile(wb, "cobranzas_pendientes.xlsx")
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-sm font-medium mb-1 block">Razón Social</label>
          <select value={filtroRS} onChange={(e) => setFiltroRS(e.target.value)} className="border rounded-md px-3 py-2 text-sm">
            {RAZONES_SOCIALES.map((rs) => (
              <option key={rs} value={rs}>{rs}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="border rounded-md px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="border rounded-md px-3 py-2 text-sm" />
        </div>
        <button onClick={exportXLSX} className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700" disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> XLSX
        </button>
      </div>

      <div className="border rounded-md overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Comprobante</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Saldo Pendiente</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pag.getPage(page).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-500 py-8">Sin cobranzas pendientes</TableCell>
              </TableRow>
            ) : (
              pag.getPage(page).map((c: any, i: number) => (
                <TableRow key={c.id || i}>
                  <TableCell>{clientMap[c.client_id] || c.client_name || "-"}</TableCell>
                  <TableCell>{c.comprobante || c.tipo_comprobante || "-"}</TableCell>
                  <TableCell>{formatDateStr(c.fecha || c.created_at)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(c.total || 0)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(c.saldo_pendiente || c.total || 0)}</TableCell>
                </TableRow>
              ))
            )}
            {filtered.length > 0 && (
              <TableRow className="bg-gray-50 font-bold">
                <TableCell colSpan={3}>TOTALES</TableCell>
                <TableCell className="text-right">{formatCurrency(totals.total)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totals.saldo)}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <TablePagination currentPage={page} totalPages={pag.totalPages} totalItems={pag.totalItems} pageSize={pag.pageSize} onPageChange={setPage} />
    </Card>
  )
}

// ─── Tab 5: Cobros Realizados ─────────────────────────────────────────────

function TabCobrosRealizados({ recibos }: { recibos: any[] }) {
  const [search, setSearch] = useState("")
  const [searchFecha, setSearchFecha] = useState("")
  const [page, setPage] = useState(1)
  const [viewing, setViewing] = useState<any | null>(null)

  const filtered = useMemo(() => {
    let rows = recibos
    if (search.trim()) {
      const norm = normalizeSearch(search)
      rows = rows.filter((r) =>
        normalizeSearch(r.razon_social || "").includes(norm) ||
        normalizeSearch(r.nro_comprobante || "").includes(norm)
      )
    }
    if (searchFecha) {
      rows = rows.filter((r) => (r.fecha || "").startsWith(searchFecha))
    }
    return rows
  }, [recibos, search, searchFecha])

  const pag = usePagination(filtered, 50)

  return (
    <Card className="p-4 space-y-4">
      <h3 className="font-semibold text-lg">Cobros Realizados</h3>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por cliente o nro recibo..."
            className="w-full pl-9 pr-3 py-2 border rounded-md text-sm"
          />
        </div>
        <div>
          <input
            type="date"
            value={searchFecha}
            onChange={(e) => { setSearchFecha(e.target.value); setPage(1) }}
            className="border rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="border rounded-md overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Nro Recibo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead className="text-right">Importe</TableHead>
              <TableHead className="text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pag.getPage(page).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-500 py-8">Sin cobros registrados</TableCell>
              </TableRow>
            ) : (
              pag.getPage(page).map((r: any, i: number) => (
                <TableRow key={r.id || i}>
                  <TableCell>{formatDateStr(r.fecha)}</TableCell>
                  <TableCell className="font-medium">{r.nro_comprobante || "-"}</TableCell>
                  <TableCell>{r.razon_social || "-"}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(Number(r.importe) || 0)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setViewing(r)} className="p-1.5 rounded hover:bg-gray-100" title="Ver Recibo">
                        <Eye className="h-4 w-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => {
                          const w = window.open("", "_blank")
                          if (w) {
                            w.document.write(`<html><head><title>Recibo ${r.nro_comprobante}</title></head><body style="font-family:sans-serif;max-width:600px;margin:40px auto;">
                              <h2>Recibo de Cobro</h2>
                              <p><strong>Nro:</strong> ${r.nro_comprobante || "-"}</p>
                              <p><strong>Fecha:</strong> ${r.fecha ? new Date(r.fecha).toLocaleDateString("es-AR") : "-"}</p>
                              <p><strong>Cliente:</strong> ${r.razon_social || "-"}</p>
                              <p><strong>Importe:</strong> $${Number(r.importe || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
                              <p><strong>Vendedor:</strong> ${r.vendedor || "-"}</p>
                              <script>window.print()<\/script>
                            </body></html>`)
                          }
                        }}
                        className="p-1.5 rounded hover:bg-gray-100"
                        title="Imprimir"
                      >
                        <Printer className="h-4 w-4 text-gray-600" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <TablePagination currentPage={page} totalPages={pag.totalPages} totalItems={pag.totalItems} pageSize={pag.pageSize} onPageChange={setPage} />

      {/* View Dialog */}
      <Dialog open={!!viewing} onOpenChange={() => setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalle de Recibo</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Nro Recibo:</span> <span className="font-medium">{viewing.nro_comprobante || "-"}</span></div>
                <div><span className="text-muted-foreground">Fecha:</span> <span className="font-medium">{viewing.fecha ? new Date(viewing.fecha).toLocaleDateString("es-AR") : "-"}</span></div>
                <div><span className="text-muted-foreground">Cliente:</span> <span className="font-medium">{viewing.razon_social || "-"}</span></div>
                <div><span className="text-muted-foreground">Cod Cliente:</span> <span className="font-medium">{viewing.cod_cliente || "-"}</span></div>
                <div><span className="text-muted-foreground">Vendedor:</span> <span className="font-medium">{viewing.vendedor || "-"}</span></div>
                <div><span className="text-muted-foreground">Sucursal:</span> <span className="font-medium">{viewing.sucursal || "-"}</span></div>
                <div className="col-span-2 border-t pt-2">
                  <span className="text-muted-foreground">Importe:</span>{" "}
                  <span className="font-bold text-lg">{formatCurrency(Number(viewing.importe) || 0)}</span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
