"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fetchProveedores } from "@/lib/supabase/queries"
import { Search, Plus, Download, Users, Building2, CreditCard } from "lucide-react"
import Link from "next/link"
import * as XLSX from "xlsx"

export default function AdminProveedoresPage() {
  const [proveedores, setProveedores] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [empresaFilter, setEmpresaFilter] = useState<string>("todos")

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchProveedores()
        setProveedores(data)
      } catch (err) {
        console.error("Error loading proveedores:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  // Stats
  const totalProveedores = proveedores.length
  const countByEmpresa = (empresa: string) =>
    proveedores.filter((p) => p.empresa === empresa).length
  const conCbu = proveedores.filter((p) => !!p.cbu).length

  // Filter
  let filtered = [...proveedores]

  if (empresaFilter !== "todos") {
    filtered = filtered.filter((p) => p.empresa === empresaFilter)
  }

  if (searchTerm) {
    const term = searchTerm.toLowerCase()
    filtered = filtered.filter(
      (p) =>
        (p.nombre && p.nombre.toLowerCase().includes(term)) ||
        (p.cuit && p.cuit.toLowerCase().includes(term))
    )
  }

  const handleExport = () => {
    const data = filtered.map((p) => ({
      Nombre: p.nombre,
      CUIT: p.cuit || "",
      Empresa: p.empresa || "",
      "Condición de Pago": p.condicion_pago || "",
      CBU: p.cbu || "",
      Contactos: p.contactos || "",
      Observaciones: p.observaciones || "",
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Proveedores")
    XLSX.writeFile(wb, `proveedores_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Proveedores</h1>
          <p className="text-muted-foreground">Gestión de proveedores del sistema</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button asChild>
            <Link href="/admin/proveedores/nuevo">
              <Plus className="h-4 w-4 mr-2" />
              Nuevo Proveedor
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Proveedores</p>
              <p className="text-3xl font-bold">{totalProveedores}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Masoil</p>
              <p className="text-3xl font-bold">{countByEmpresa("Masoil")}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Aquiles / Conancap</p>
              <p className="text-3xl font-bold">
                {countByEmpresa("Aquiles")} / {countByEmpresa("Conancap")}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Con CBU cargado</p>
              <p className="text-3xl font-bold">{conCbu}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o CUIT..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas las empresas</SelectItem>
            <SelectItem value="Masoil">Masoil</SelectItem>
            <SelectItem value="Aquiles">Aquiles</SelectItem>
            <SelectItem value="Conancap">Conancap</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {filtered.length > 0 ? (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>CUIT</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Condición de pago</TableHead>
                <TableHead>CBU</TableHead>
                <TableHead>Contactos</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.nombre}</TableCell>
                  <TableCell>{p.cuit || "-"}</TableCell>
                  <TableCell>
                    {p.empresa ? (
                      <Badge variant="outline">{p.empresa}</Badge>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                  <TableCell>{p.condicion_pago || "-"}</TableCell>
                  <TableCell>
                    <Badge variant={p.cbu ? "default" : "secondary"}>
                      {p.cbu ? "Si" : "No"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {p.contactos || "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/admin/proveedores/${p.id}`}>Ver</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          <p>No se encontraron proveedores</p>
        </div>
      )}
    </div>
  )
}
