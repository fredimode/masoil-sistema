"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { fetchVendedores, createClient } from "@/lib/supabase/queries"
import type { Vendedor, Zona } from "@/lib/types"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

const zonas: Zona[] = ["Norte", "Capital", "Sur", "Oeste", "GBA"]

export default function AdminNuevoClientePage() {
  const router = useRouter()
  const [vendedores, setVendedores] = useState<Vendedor[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")

  useEffect(() => {
    async function load() {
      try {
        const v = await fetchVendedores()
        setVendedores(v)
      } catch (err) {
        console.error("Error loading vendedores:", err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const activeVendedores = vendedores.filter((v) => v.role !== "admin" && v.isActive)

  const [formData, setFormData] = useState({
    businessName: "",
    contactName: "",
    cuit: "",
    condicionIva: "",
    address: "",
    whatsapp: "",
    email: "",
    zona: "" as Zona | "",
    vendedorId: "",
    paymentTerms: "30 días",
    creditLimit: "",
    notes: "",
  })

  const [errors, setErrors] = useState<Record<string, string>>({})

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.businessName.trim()) {
      newErrors.businessName = "El nombre es requerido"
    }
    if (!formData.contactName.trim()) {
      newErrors.contactName = "El contacto es requerido"
    }
    if (!formData.whatsapp.trim()) {
      newErrors.whatsapp = "El teléfono es requerido"
    }
    if (!formData.email.trim()) {
      newErrors.email = "El email es requerido"
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Email inválido"
    }
    if (!formData.address.trim()) {
      newErrors.address = "La dirección es requerida"
    }
    if (!formData.zona) {
      newErrors.zona = "La zona es requerida"
    }
    if (!formData.vendedorId) {
      newErrors.vendedorId = "El vendedor es requerido"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setSubmitting(true)
    setSubmitError("")

    try {
      await createClient({
        businessName: formData.businessName,
        contactName: formData.contactName,
        whatsapp: formData.whatsapp,
        email: formData.email,
        zona: formData.zona as string,
        vendedorId: formData.vendedorId,
        address: formData.address,
        paymentTerms: formData.paymentTerms,
        creditLimit: parseInt(formData.creditLimit) || 0,
        notes: formData.notes,
        cuit: formData.cuit,
        condicionIva: formData.condicionIva,
      })
      router.push("/admin/clientes")
    } catch (err) {
      console.error("Error creating client:", err)
      setSubmitError("Error al crear el cliente. Intente nuevamente.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
  }

  if (loading) return <div className="p-8 flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>

  return (
    <div className="p-6 md:p-8">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <Link href="/admin/clientes">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Nuevo Cliente</h1>
            <p className="text-muted-foreground">Crear un nuevo cliente en el sistema</p>
          </div>
        </div>

        {submitError && (
          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg text-sm">
            {submitError}
          </div>
        )}

        {/* Datos básicos */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Datos del Cliente</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="businessName">Razón Social / Nombre *</Label>
              <Input
                id="businessName"
                value={formData.businessName}
                onChange={(e) => handleChange("businessName", e.target.value)}
                placeholder="Ej: Taller Mecánico López"
                className={errors.businessName ? "border-destructive" : ""}
              />
              {errors.businessName && (
                <p className="text-sm text-destructive">{errors.businessName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactName">Nombre del Contacto *</Label>
              <Input
                id="contactName"
                value={formData.contactName}
                onChange={(e) => handleChange("contactName", e.target.value)}
                placeholder="Ej: Juan López"
                className={errors.contactName ? "border-destructive" : ""}
              />
              {errors.contactName && (
                <p className="text-sm text-destructive">{errors.contactName}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cuit">CUIT</Label>
              <Input
                id="cuit"
                value={formData.cuit}
                onChange={(e) => handleChange("cuit", e.target.value)}
                placeholder="Ej: 20-12345678-9"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="condicionIva">Condición IVA</Label>
              <Select
                value={formData.condicionIva}
                onValueChange={(value) => handleChange("condicionIva", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Responsable Inscripto">Responsable Inscripto</SelectItem>
                  <SelectItem value="Monotributo">Monotributo</SelectItem>
                  <SelectItem value="Exento">Exento</SelectItem>
                  <SelectItem value="Consumidor Final">Consumidor Final</SelectItem>
                  <SelectItem value="No Responsable">No Responsable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Dirección *</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => handleChange("address", e.target.value)}
                placeholder="Ej: Av. San Martín 1234, CABA"
                className={errors.address ? "border-destructive" : ""}
              />
              {errors.address && <p className="text-sm text-destructive">{errors.address}</p>}
            </div>
          </div>
        </Card>

        {/* Contacto */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Contacto</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="whatsapp">WhatsApp / Teléfono *</Label>
              <Input
                id="whatsapp"
                value={formData.whatsapp}
                onChange={(e) => handleChange("whatsapp", e.target.value)}
                placeholder="Ej: +54 11 1234-5678"
                className={errors.whatsapp ? "border-destructive" : ""}
              />
              {errors.whatsapp && <p className="text-sm text-destructive">{errors.whatsapp}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="Ej: contacto@taller.com"
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>
          </div>
        </Card>

        {/* Asignación */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Asignación</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="zona">Zona *</Label>
              <Select value={formData.zona} onValueChange={(value) => handleChange("zona", value)}>
                <SelectTrigger className={errors.zona ? "border-destructive" : ""}>
                  <SelectValue placeholder="Seleccionar zona..." />
                </SelectTrigger>
                <SelectContent>
                  {zonas.map((zona) => (
                    <SelectItem key={zona} value={zona}>
                      {zona}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.zona && <p className="text-sm text-destructive">{errors.zona}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="vendedorId">Vendedor Asignado *</Label>
              <Select
                value={formData.vendedorId}
                onValueChange={(value) => handleChange("vendedorId", value)}
              >
                <SelectTrigger className={errors.vendedorId ? "border-destructive" : ""}>
                  <SelectValue placeholder="Seleccionar vendedor..." />
                </SelectTrigger>
                <SelectContent>
                  {activeVendedores.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} - {v.zonas.join(", ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.vendedorId && <p className="text-sm text-destructive">{errors.vendedorId}</p>}
            </div>
          </div>
        </Card>

        {/* Comercial */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Datos Comerciales</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="paymentTerms">Condición de Pago</Label>
              <Select
                value={formData.paymentTerms}
                onValueChange={(value) => handleChange("paymentTerms", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Contado">Contado</SelectItem>
                  <SelectItem value="15 días">15 días</SelectItem>
                  <SelectItem value="30 días">30 días</SelectItem>
                  <SelectItem value="45 días">45 días</SelectItem>
                  <SelectItem value="60 días">60 días</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="creditLimit">Límite de Crédito ($)</Label>
              <Input
                id="creditLimit"
                type="number"
                value={formData.creditLimit}
                onChange={(e) => handleChange("creditLimit", e.target.value)}
                placeholder="Ej: 100000"
              />
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              placeholder="Observaciones sobre el cliente..."
              rows={3}
            />
          </div>
        </Card>

        {/* Acciones */}
        <div className="flex gap-3">
          <Button asChild variant="outline" className="flex-1">
            <Link href="/admin/clientes">Cancelar</Link>
          </Button>
          <Button type="submit" className="flex-1" disabled={submitting}>
            {submitting ? "Creando..." : "Crear Cliente"}
          </Button>
        </div>
      </form>
    </div>
  )
}
