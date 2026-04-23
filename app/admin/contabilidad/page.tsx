"use client"

import { useState, useEffect, useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  fetchFacturasGestionpro, fetchFacturasProveedor, fetchIvaPagar, fetchFacturas,
} from "@/lib/supabase/queries"
import {
  mesAnoToRange, calcularIvaAPagar,
  mapFacturaGPToSubdiarioRow, mapFacturaNuevaToSubdiarioRow,
} from "@/lib/contabilidad/calculos"
import { formatCurrency, formatDateStr } from "@/lib/utils"
import { Download } from "lucide-react"
import * as XLSX from "xlsx"

const RAZONES = ["Aquiles", "Masoil", "Conancap", "Todas"]

function currentMesAno() {
  const d = new Date()
  return { mes: String(d.getMonth() + 1), ano: String(d.getFullYear()) }
}

function MonthYearPicker({ mes, ano, setMes, setAno }: any) {
  const meses = [
    ["1", "Enero"], ["2", "Febrero"], ["3", "Marzo"], ["4", "Abril"],
    ["5", "Mayo"], ["6", "Junio"], ["7", "Julio"], ["8", "Agosto"],
    ["9", "Septiembre"], ["10", "Octubre"], ["11", "Noviembre"], ["12", "Diciembre"],
  ]
  const years = Array.from({ length: 10 }, (_, i) => String(2020 + i))
  return (
    <div className="flex gap-2">
      <Select value={mes} onValueChange={setMes}>
        <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
        <SelectContent>
          {meses.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={ano} onValueChange={setAno}>
        <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
        <SelectContent>
          {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

export default function ContabilidadPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Contabilidad</h1>
      <Tabs defaultValue="iva-pagar">
        <TabsList>
          <TabsTrigger value="iva-pagar">IVA a Pagar</TabsTrigger>
          <TabsTrigger value="subd-ventas">Subdiario IVA Ventas</TabsTrigger>
          <TabsTrigger value="subd-compras">Subdiario IVA Compras</TabsTrigger>
          <TabsTrigger value="jurisdiccion">Ventas por Jurisdicción</TabsTrigger>
        </TabsList>
        <TabsContent value="iva-pagar"><TabIvaPagar /></TabsContent>
        <TabsContent value="subd-ventas"><TabSubdiarioVentas /></TabsContent>
        <TabsContent value="subd-compras"><TabSubdiarioCompras /></TabsContent>
        <TabsContent value="jurisdiccion"><TabJurisdiccion /></TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Tab IVA a Pagar ────────────────────────────────────────────────────────

function TabIvaPagar() {
  const [historico, setHistorico] = useState<any[]>([])
  const { mes: mIni, ano: aIni } = currentMesAno()
  const [mes, setMes] = useState(mIni)
  const [ano, setAno] = useState(aIni)
  const [ventas, setVentas] = useState<any[]>([])
  const [compras, setCompras] = useState<any[]>([])
  const [facturasNuevas, setFacturasNuevas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const [iva, gp, fp, fn] = await Promise.all([
          fetchIvaPagar(),
          fetchFacturasGestionpro(),
          fetchFacturasProveedor(),
          fetchFacturas(),
        ])
        setHistorico(iva)
        setVentas(gp)
        setCompras(fp)
        setFacturasNuevas(fn)
      } finally { setLoading(false) }
    })()
  }, [])

  const { desde, hasta } = useMemo(() => mesAnoToRange(mes, ano), [mes, ano])

  // Agrupar histórico por período
  const historicoGrupos = useMemo(() => {
    const map = new Map<string, { razon: string; desde: string; hasta: string; items: any[] }>()
    for (const row of historico) {
      const key = `${row.razon_social}|${row.periodo_desde}|${row.periodo_hasta}`
      if (!map.has(key)) map.set(key, { razon: row.razon_social, desde: row.periodo_desde, hasta: row.periodo_hasta, items: [] })
      map.get(key)!.items.push(row)
    }
    return Array.from(map.values())
  }, [historico])

  const calculado = useMemo(
    () => calcularIvaAPagar(ventas, facturasNuevas, compras, desde, hasta),
    [ventas, facturasNuevas, compras, desde, hasta],
  )

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-sm font-medium mb-1 block">Período</label>
          <MonthYearPicker mes={mes} ano={ano} setMes={setMes} setAno={setAno} />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 text-center py-6">Cargando...</p>
      ) : (
        <>
          <div className="border rounded-md overflow-hidden">
            <h3 className="bg-gray-100 px-4 py-2 font-semibold text-sm">Período actual — {mes}/{ano}</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Débitos fiscales (Ventas)</TableHead>
                  <TableHead className="text-right">Créditos fiscales (Compras)</TableHead>
                  <TableHead className="text-right">IVA a pagar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>IVA por Ventas (21%)</TableCell>
                  <TableCell className="text-right">{formatCurrency(calculado.debIVA21)}</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>IVA por Compras</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right">{formatCurrency(calculado.credIVA)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Percepciones IVA por Compras</TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right">{formatCurrency(calculado.percIVA)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
                <TableRow className="bg-amber-50 font-bold">
                  <TableCell>TOTAL</TableCell>
                  <TableCell className="text-right">{formatCurrency(calculado.debIVA21)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(calculado.credIVA + calculado.percIVA)}</TableCell>
                  <TableCell className="text-right text-amber-700">{formatCurrency(calculado.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {historicoGrupos.length > 0 && (
            <div className="border rounded-md overflow-hidden">
              <h3 className="bg-gray-100 px-4 py-2 font-semibold text-sm">Histórico (importado de GestionPro)</h3>
              {historicoGrupos.map((g, i) => (
                <div key={i} className="border-t">
                  <div className="bg-gray-50 px-4 py-2 text-sm">
                    <strong>{g.razon}</strong> — {formatDateStr(g.desde)} a {formatDateStr(g.hasta)}
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Concepto</TableHead>
                        <TableHead className="text-right">Débitos</TableHead>
                        <TableHead className="text-right">Créditos</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.items.map((r, j) => (
                        <TableRow key={j}>
                          <TableCell>{r.concepto}</TableCell>
                          <TableCell className="text-right">{formatCurrency(r.debitos || 0)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(r.creditos || 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  )
}

// ─── Tab Subdiario IVA Ventas ───────────────────────────────────────────────

function TabSubdiarioVentas() {
  const [facturas, setFacturas] = useState<any[]>([])
  const [facturasNuevas, setFacturasNuevas] = useState<any[]>([])
  const { mes: mIni, ano: aIni } = currentMesAno()
  const [mes, setMes] = useState(mIni)
  const [ano, setAno] = useState(aIni)
  const [empresa, setEmpresa] = useState("Todas")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const [gp, fn] = await Promise.all([fetchFacturasGestionpro(), fetchFacturas()])
        setFacturas(gp)
        setFacturasNuevas(fn)
      } finally { setLoading(false) }
    })()
  }, [])

  const { desde, hasta } = useMemo(() => mesAnoToRange(mes, ano), [mes, ano])
  const rows = useMemo(() => {
    const all = [
      ...facturas.map(mapFacturaGPToSubdiarioRow),
      ...facturasNuevas.map(mapFacturaNuevaToSubdiarioRow),
    ]
    return all.filter((f) => {
      const fecha = String(f.fecha || "")
      if (fecha < desde || fecha > hasta) return false
      return true
    }).sort((a, b) => String(a.fecha || "").localeCompare(String(b.fecha || "")))
  }, [facturas, facturasNuevas, desde, hasta])

  function exportXLSX() {
    const ws = XLSX.utils.json_to_sheet(rows.map((r) => ({
      Fecha: formatDateStr(r.fecha),
      "Tipo y Nº": r.tipo_nro,
      Cliente: r.cliente,
      CUIT: r.cuit,
      "Neto Gravado": r.neto,
      Exento: r.exento,
      "IVA 21%": r.iva21,
      "Percep. IIBB": r.percep_iibb,
      Total: r.total,
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Subdiario IVA Ventas")
    XLSX.writeFile(wb, `subdiario-iva-ventas-${mes}-${ano}.xlsx`)
  }

  const totales = useMemo(() => {
    return rows.reduce((acc, r) => ({
      neto: acc.neto + r.neto,
      exento: acc.exento + r.exento,
      iva21: acc.iva21 + r.iva21,
      percep_iibb: acc.percep_iibb + r.percep_iibb,
      total: acc.total + r.total,
    }), { neto: 0, exento: 0, iva21: 0, percep_iibb: 0, total: 0 })
  }, [rows])

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-sm font-medium mb-1 block">Período</label>
          <MonthYearPicker mes={mes} ano={ano} setMes={setMes} setAno={setAno} />
        </div>
        <div>
          <label className="text-sm font-medium mb-1 block">Empresa</label>
          <Select value={empresa} onValueChange={setEmpresa}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{RAZONES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <button onClick={exportXLSX} disabled={rows.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50">
          <Download className="h-4 w-4" /> XLSX
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-gray-500 text-center py-6">Cargando...</p>
      ) : (
        <div className="border rounded-md overflow-auto max-h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo y Nº</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>CUIT</TableHead>
                <TableHead className="text-right">Neto Gravado</TableHead>
                <TableHead className="text-right">Exento</TableHead>
                <TableHead className="text-right">IVA 21%</TableHead>
                <TableHead className="text-right">Percep. IIBB</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 500).map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{formatDateStr(r.fecha)}</TableCell>
                  <TableCell className="text-xs">{r.tipo_nro}</TableCell>
                  <TableCell className="text-xs">{r.cliente}</TableCell>
                  <TableCell className="text-xs">{r.cuit}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.neto)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.exento)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.iva21)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.percep_iibb)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(r.total)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-gray-50 font-bold">
                <TableCell colSpan={4}>TOTALES ({rows.length})</TableCell>
                <TableCell className="text-right">{formatCurrency(totales.neto)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totales.exento)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totales.iva21)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totales.percep_iibb)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totales.total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {rows.length > 500 && (
            <p className="text-xs text-gray-500 px-4 py-2">Mostrando primeras 500 de {rows.length}. Exportá a XLSX para ver todas.</p>
          )}
        </div>
      )}
    </Card>
  )
}

// ─── Tab Subdiario IVA Compras ──────────────────────────────────────────────

function TabSubdiarioCompras() {
  const [facturas, setFacturas] = useState<any[]>([])
  const { mes: mIni, ano: aIni } = currentMesAno()
  const [mes, setMes] = useState(mIni)
  const [ano, setAno] = useState(aIni)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const fp = await fetchFacturasProveedor()
        setFacturas(fp)
      } finally { setLoading(false) }
    })()
  }, [])

  const { desde, hasta } = useMemo(() => mesAnoToRange(mes, ano), [mes, ano])
  const rows = useMemo(() => facturas.filter((f) => {
    const fecha = String(f.fecha || "")
    return fecha >= desde && fecha <= hasta
  }).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))), [facturas, desde, hasta])

  function exportXLSX() {
    const ws = XLSX.utils.json_to_sheet(rows.map((r) => ({
      Fecha: formatDateStr(r.fecha),
      Comprobante: `${r.tipo || ""} ${r.punto_venta || ""}-${r.numero || ""}-${r.letra || ""}`,
      "Razón Social": r.razon_social || r.proveedor_nombre,
      CUIT: r.cuit || "",
      "Neto Gravado": Number(r.neto || 0),
      "IVA Ins.": Number(r.iva || 0),
      "Percep. IVA": Number(r.percepciones_iva || 0),
      "Percep. IIBB": Number(r.percepciones_iibb || 0),
      "Otros Imp.": Number(r.otros_impuestos || 0),
      Total: Number(r.total || 0),
    })))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Subdiario IVA Compras")
    XLSX.writeFile(wb, `subdiario-iva-compras-${mes}-${ano}.xlsx`)
  }

  const totales = useMemo(() => rows.reduce((a, r) => ({
    neto: a.neto + Number(r.neto || 0),
    iva: a.iva + Number(r.iva || 0),
    percepIva: a.percepIva + Number(r.percepciones_iva || 0),
    percepIibb: a.percepIibb + Number(r.percepciones_iibb || 0),
    total: a.total + Number(r.total || 0),
  }), { neto: 0, iva: 0, percepIva: 0, percepIibb: 0, total: 0 }), [rows])

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-sm font-medium mb-1 block">Período</label>
          <MonthYearPicker mes={mes} ano={ano} setMes={setMes} setAno={setAno} />
        </div>
        <button onClick={exportXLSX} disabled={rows.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50">
          <Download className="h-4 w-4" /> XLSX
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-gray-500 text-center py-6">Cargando...</p>
      ) : (
        <div className="border rounded-md overflow-auto max-h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Comprob.</TableHead>
                <TableHead>Razón Social</TableHead>
                <TableHead>CUIT</TableHead>
                <TableHead className="text-right">Neto Gravado</TableHead>
                <TableHead className="text-right">IVA Ins.</TableHead>
                <TableHead className="text-right">Percep. IVA</TableHead>
                <TableHead className="text-right">Percep. IIBB</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 500).map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{formatDateStr(r.fecha)}</TableCell>
                  <TableCell className="text-xs">{r.tipo} {r.punto_venta}-{r.numero}-{r.letra}</TableCell>
                  <TableCell className="text-xs">{r.razon_social || r.proveedor_nombre}</TableCell>
                  <TableCell className="text-xs">{r.cuit || "-"}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(r.neto || 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(r.iva || 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(r.percepciones_iva || 0))}</TableCell>
                  <TableCell className="text-right">{formatCurrency(Number(r.percepciones_iibb || 0))}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(Number(r.total || 0))}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-gray-50 font-bold">
                <TableCell colSpan={4}>TOTALES ({rows.length})</TableCell>
                <TableCell className="text-right">{formatCurrency(totales.neto)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totales.iva)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totales.percepIva)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totales.percepIibb)}</TableCell>
                <TableCell className="text-right">{formatCurrency(totales.total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  )
}

// ─── Tab Ventas por Jurisdicción ────────────────────────────────────────────

function TabJurisdiccion() {
  const [facturas, setFacturas] = useState<any[]>([])
  const [facturasNuevas, setFacturasNuevas] = useState<any[]>([])
  const { mes: mIni, ano: aIni } = currentMesAno()
  const [mes, setMes] = useState(mIni)
  const [ano, setAno] = useState(aIni)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const [gp, fn] = await Promise.all([fetchFacturasGestionpro(), fetchFacturas()])
        setFacturas(gp)
        setFacturasNuevas(fn)
      } finally { setLoading(false) }
    })()
  }, [])

  const { desde, hasta } = useMemo(() => mesAnoToRange(mes, ano), [mes, ano])
  const grouped = useMemo(() => {
    const byProv = new Map<string, any[]>()
    const all = [
      ...facturas.map((f) => ({
        fecha: f.fecha,
        tipo_nro: `${f.tipo_comprobante || "FC"} ${f.sucursal || ""}-${f.nro_comprobante || ""}-${f.letra || ""}`,
        razon_social: f.razon_social,
        cond_iva: f.resp_iva || "-",
        cuit: f.documento,
        neto: Number(f.neto || 0),
        iva21: Number(f.impuestos || 0),
        total: Number(f.total || 0),
        provincia: f.provincia || "SIN JURISDICCIÓN",
      })),
      ...facturasNuevas.map((f) => ({
        fecha: f.fecha,
        tipo_nro: `${f.tipo || "FC"} ${f.numero || ""}`,
        razon_social: f.razon_social,
        cond_iva: "-",
        cuit: f.cuit_cliente || "",
        neto: Number(f.base_gravada || 0),
        iva21: Number(f.iva_21 || 0),
        total: Number(f.total || 0),
        provincia: "SIN JURISDICCIÓN",
      })),
    ].filter((r) => {
      const f = String(r.fecha || "")
      return f >= desde && f <= hasta
    })
    for (const r of all) {
      const key = r.provincia || "SIN JURISDICCIÓN"
      if (!byProv.has(key)) byProv.set(key, [])
      byProv.get(key)!.push(r)
    }
    return Array.from(byProv.entries())
  }, [facturas, facturasNuevas, desde, hasta])

  function exportXLSX() {
    const rows: any[] = []
    for (const [prov, items] of grouped) {
      rows.push({ Jurisdicción: prov })
      for (const r of items) {
        rows.push({
          Fecha: formatDateStr(r.fecha),
          "Tipo/Nº": r.tipo_nro,
          "Razón Social": r.razon_social,
          "Cond. IVA": r.cond_iva,
          CUIT: r.cuit,
          "Neto Gravado": r.neto,
          "IVA 21%": r.iva21,
          Total: r.total,
        })
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Por Jurisdicción")
    XLSX.writeFile(wb, `ventas-por-jurisdiccion-${mes}-${ano}.xlsx`)
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-sm font-medium mb-1 block">Período</label>
          <MonthYearPicker mes={mes} ano={ano} setMes={setMes} setAno={setAno} />
        </div>
        <button onClick={exportXLSX} disabled={grouped.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50">
          <Download className="h-4 w-4" /> XLSX
        </button>
      </div>
      {loading ? (
        <p className="text-sm text-gray-500 text-center py-6">Cargando...</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">Sin ventas en el período</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([provincia, items]) => {
            const tot = items.reduce((a: any, r: any) => ({
              neto: a.neto + r.neto,
              iva21: a.iva21 + r.iva21,
              total: a.total + r.total,
            }), { neto: 0, iva21: 0, total: 0 })
            return (
              <div key={provincia} className="border rounded-md overflow-hidden">
                <h3 className="bg-blue-50 px-4 py-2 font-semibold">{provincia}</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Tipo/Nº</TableHead>
                      <TableHead>Razón Social</TableHead>
                      <TableHead>Cond. IVA</TableHead>
                      <TableHead>CUIT</TableHead>
                      <TableHead className="text-right">Neto</TableHead>
                      <TableHead className="text-right">IVA 21%</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.slice(0, 100).map((r: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell>{formatDateStr(r.fecha)}</TableCell>
                        <TableCell className="text-xs">{r.tipo_nro}</TableCell>
                        <TableCell className="text-xs">{r.razon_social}</TableCell>
                        <TableCell className="text-xs">{r.cond_iva}</TableCell>
                        <TableCell className="text-xs">{r.cuit}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.neto)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.iva21)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(r.total)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-gray-50 font-bold">
                      <TableCell colSpan={5}>SUBTOTAL {provincia}</TableCell>
                      <TableCell className="text-right">{formatCurrency(tot.neto)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(tot.iva21)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(tot.total)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
