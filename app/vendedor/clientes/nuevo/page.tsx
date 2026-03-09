"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCurrentVendedor } from "@/lib/hooks/useCurrentVendedor"
import { Skeleton } from "@/components/ui/skeleton"
import type { Zona } from "@/lib/types"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

const zonas: Zona[] = ["Norte", "Capital", "Sur", "Oeste", "GBA"]

export default function NuevoClientePage() {
  const router = useRouter()
  const { vendedor, loading } = useCurrentVendedor()

  const [formData, setFormData] = useState({
    businessName: "",
    contactName: "",
    cuit: "",
    address: "",
    whatsapp: "",
    email: "",
    zona: "" as Zona | "",
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

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    // En un caso real, aquí se enviaría a la API
    console.log({
      ...formData,
      vendedorId: vendedor?.id,
      creditLimit: parseInt(formData.creditLimit) || 0,
    })

    alert("Cliente creado exitosamente!")
    router.push("/vendedor/clientes")
  }

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-primary text-primary-foreground p-4">
          <Skeleton className="h-7 w-40 bg-primary-foreground/20" />
        </div>
        <div className="p-4 space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" className="text-primary-foreground">
            <Link href="/vendedor/clientes">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-xl font-bold">Nuevo Cliente</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 md:p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Datos básicos */}
          <Card className="p-4 md:p-6">
            <h2 className="text-lg font-semibold mb-4">Datos del Cliente</h2>

            <div className="space-y-4">
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
                <Label htmlFor="cuit">CUIT (opcional)</Label>
                <Input
                  id="cuit"
                  value={formData.cuit}
                  onChange={(e) => handleChange("cuit", e.target.value)}
                  placeholder="Ej: 20-12345678-9"
                />
              </div>
            </div>
          </Card>

          {/* Contacto */}
          <Card className="p-4 md:p-6">
            <h2 className="text-lg font-semibold mb-4">Contacto</h2>

            <div className="space-y-4">
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

              <div className="space-y-2">
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
            </div>
          </Card>

          {/* Comercial */}
          <Card className="p-4 md:p-6">
            <h2 className="text-lg font-semibold mb-4">Datos Comerciales</h2>

            <div className="space-y-4">
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

              <div className="space-y-2">
                <Label htmlFor="notes">Notas</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleChange("notes", e.target.value)}
                  placeholder="Observaciones sobre el cliente..."
                  rows={3}
                />
              </div>
            </div>
          </Card>

          {/* Acciones */}
          <div className="flex gap-3 pb-20 md:pb-6">
            <Button asChild variant="outline" className="flex-1">
              <Link href="/vendedor/clientes">Cancelar</Link>
            </Button>
            <Button type="submit" className="flex-1">
              Crear Cliente
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}
