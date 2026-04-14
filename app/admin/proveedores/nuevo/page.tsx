"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { createProveedor } from "@/lib/supabase/queries"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function AdminNuevoProveedorPage() {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState("")
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [formData, setFormData] = useState({
    nombre: "",
    cuit: "",
    condicion_pago: "",
    cbu: "",
    email_comercial: "",
    email_pagos: "",
    contactos: "",
    observaciones: "",
  })

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.nombre.trim()) {
      newErrors.nombre = "El nombre es requerido"
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
      await createProveedor({
        nombre: formData.nombre,
        cuit: formData.cuit || undefined,
        condicion_pago: formData.condicion_pago || undefined,
        cbu: formData.cbu || undefined,
        email_comercial: formData.email_comercial || undefined,
        email_pagos: formData.email_pagos || undefined,
        contactos: formData.contactos || undefined,
        observaciones: formData.observaciones || undefined,
      })
      router.push("/admin/proveedores")
    } catch (err) {
      console.error("Error creating proveedor:", err)
      setSubmitError("Error al crear el proveedor. Intente nuevamente.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 md:p-8">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <Link href="/admin/proveedores">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Nuevo Proveedor</h1>
            <p className="text-muted-foreground">
              Crear un nuevo proveedor en el sistema
            </p>
          </div>
        </div>

        {submitError && (
          <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-lg text-sm">
            {submitError}
          </div>
        )}

        {/* Datos básicos */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Datos del Proveedor</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">Nombre *</Label>
              <Input
                id="nombre"
                value={formData.nombre}
                onChange={(e) => handleChange("nombre", e.target.value)}
                placeholder="Ej: YPF S.A."
                className={errors.nombre ? "border-destructive" : ""}
              />
              {errors.nombre && (
                <p className="text-sm text-destructive">{errors.nombre}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="cuit">CUIT</Label>
              <Input
                id="cuit"
                value={formData.cuit}
                onChange={(e) => handleChange("cuit", e.target.value)}
                placeholder="Ej: 30-12345678-9"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="condicion_pago">Condicion de Pago</Label>
              <Input
                id="condicion_pago"
                value={formData.condicion_pago}
                onChange={(e) =>
                  handleChange("condicion_pago", e.target.value)
                }
                placeholder="Ej: 30 dias"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cbu">CBU</Label>
              <Input
                id="cbu"
                value={formData.cbu}
                onChange={(e) => handleChange("cbu", e.target.value)}
                placeholder="Ej: 0000000000000000000000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email_comercial">Email Comercial</Label>
              <Input
                id="email_comercial"
                type="email"
                value={formData.email_comercial}
                onChange={(e) => handleChange("email_comercial", e.target.value)}
                placeholder="comercial@proveedor.com"
              />
              <p className="text-xs text-muted-foreground">Para enviar órdenes de compra</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email_pagos">Email Pagos</Label>
              <Input
                id="email_pagos"
                type="email"
                value={formData.email_pagos}
                onChange={(e) => handleChange("email_pagos", e.target.value)}
                placeholder="pagos@proveedor.com"
              />
              <p className="text-xs text-muted-foreground">Para enviar comprobantes de pago</p>
            </div>
          </div>
        </Card>

        {/* Contacto y observaciones */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">
            Contacto y Observaciones
          </h2>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="contactos">Contactos</Label>
              <Textarea
                id="contactos"
                value={formData.contactos}
                onChange={(e) => handleChange("contactos", e.target.value)}
                placeholder="Ej: Juan Perez - Tel: +54 11 1234-5678 - juan@proveedor.com"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="observaciones">Observaciones</Label>
              <Textarea
                id="observaciones"
                value={formData.observaciones}
                onChange={(e) =>
                  handleChange("observaciones", e.target.value)
                }
                placeholder="Notas adicionales sobre el proveedor..."
                rows={3}
              />
            </div>
          </div>
        </Card>

        {/* Acciones */}
        <div className="flex gap-3">
          <Button asChild variant="outline" className="flex-1">
            <Link href="/admin/proveedores">Cancelar</Link>
          </Button>
          <Button type="submit" className="flex-1" disabled={submitting}>
            {submitting ? "Creando..." : "Crear Proveedor"}
          </Button>
        </div>
      </form>
    </div>
  )
}
