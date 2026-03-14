"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createProduct } from "@/lib/supabase/queries"
import type { ProductCategory } from "@/lib/types"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

const categories: ProductCategory[] = ["Limpiadores", "Lubricantes", "Selladores", "Belleza", "Higiene"]

export default function NuevoProductoPage() {
  const router = useRouter()

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    category: "" as ProductCategory | "",
    price: "",
    stock: "",
    lowStockThreshold: "25",
    criticalStockThreshold: "10",
    description: "",
    isCustomizable: false,
    customLeadTime: "15",
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = "El nombre es requerido"
    }
    if (!formData.code.trim()) {
      newErrors.code = "El código/SKU es requerido"
    }
    if (!formData.category) {
      newErrors.category = "La categoría es requerida"
    }
    if (!formData.price || parseFloat(formData.price) <= 0) {
      newErrors.price = "El precio debe ser mayor a 0"
    }
    if (formData.stock === "" || parseInt(formData.stock) < 0) {
      newErrors.stock = "El stock inicial es requerido"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setSubmitting(true)
    try {
      await createProduct({
        code: formData.code,
        name: formData.name,
        category: formData.category as string,
        price: parseFloat(formData.price),
        stock: parseInt(formData.stock),
        isCustomizable: formData.isCustomizable,
        customLeadTime: formData.isCustomizable ? parseInt(formData.customLeadTime) : 0,
        lowStockThreshold: parseInt(formData.lowStockThreshold),
        criticalStockThreshold: parseInt(formData.criticalStockThreshold),
      })
      router.push("/admin/stock")
    } catch (err) {
      console.error("Error creating product:", err)
      alert("Error al crear el producto. Intente nuevamente.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (typeof value === "string" && errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }))
    }
  }

  return (
    <div className="p-6 md:p-8">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon">
            <Link href="/admin/stock">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Nuevo Producto</h1>
            <p className="text-muted-foreground">Agregar un nuevo producto al inventario</p>
          </div>
        </div>

        {/* Datos básicos */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Información del Producto</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre del Producto *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange("name", e.target.value)}
                placeholder="Ej: Limpia Contactos 220ml"
                className={errors.name ? "border-destructive" : ""}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">Código / SKU *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => handleChange("code", e.target.value.toUpperCase())}
                placeholder="Ej: LMP-220"
                className={errors.code ? "border-destructive" : ""}
              />
              {errors.code && <p className="text-sm text-destructive">{errors.code}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Categoría *</Label>
              <Select
                value={formData.category}
                onValueChange={(value) => handleChange("category", value)}
              >
                <SelectTrigger className={errors.category ? "border-destructive" : ""}>
                  <SelectValue placeholder="Seleccionar categoría..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && <p className="text-sm text-destructive">{errors.category}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="price">Precio ($) *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => handleChange("price", e.target.value)}
                placeholder="Ej: 2850"
                className={errors.price ? "border-destructive" : ""}
              />
              {errors.price && <p className="text-sm text-destructive">{errors.price}</p>}
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
              placeholder="Descripción detallada del producto..."
              rows={3}
            />
          </div>
        </Card>

        {/* Stock */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Inventario</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stock">Stock Inicial *</Label>
              <Input
                id="stock"
                type="number"
                min="0"
                value={formData.stock}
                onChange={(e) => handleChange("stock", e.target.value)}
                placeholder="Ej: 100"
                className={errors.stock ? "border-destructive" : ""}
              />
              {errors.stock && <p className="text-sm text-destructive">{errors.stock}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="lowStockThreshold">Umbral Stock Bajo</Label>
              <Input
                id="lowStockThreshold"
                type="number"
                min="0"
                value={formData.lowStockThreshold}
                onChange={(e) => handleChange("lowStockThreshold", e.target.value)}
                placeholder="25"
              />
              <p className="text-xs text-muted-foreground">Alerta cuando el stock baje de este valor</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="criticalStockThreshold">Umbral Stock Crítico</Label>
              <Input
                id="criticalStockThreshold"
                type="number"
                min="0"
                value={formData.criticalStockThreshold}
                onChange={(e) => handleChange("criticalStockThreshold", e.target.value)}
                placeholder="10"
              />
              <p className="text-xs text-muted-foreground">Alerta crítica cuando baje de este valor</p>
            </div>
          </div>
        </Card>

        {/* Customización */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Opciones de Fabricación</h2>

          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <Checkbox
                id="customizable"
                checked={formData.isCustomizable}
                onCheckedChange={(checked) => handleChange("isCustomizable", checked === true)}
              />
              <div className="flex-1">
                <Label htmlFor="customizable" className="cursor-pointer">
                  Producto Customizable
                </Label>
                <p className="text-sm text-muted-foreground">
                  Este producto puede fabricarse bajo pedido con especificaciones del cliente
                </p>
              </div>
            </div>

            {formData.isCustomizable && (
              <div className="space-y-2 pl-8">
                <Label htmlFor="customLeadTime">Tiempo de Fabricación (días)</Label>
                <Input
                  id="customLeadTime"
                  type="number"
                  min="1"
                  value={formData.customLeadTime}
                  onChange={(e) => handleChange("customLeadTime", e.target.value)}
                  className="w-32"
                />
              </div>
            )}
          </div>
        </Card>

        {/* Acciones */}
        <div className="flex gap-3">
          <Button asChild variant="outline" className="flex-1">
            <Link href="/admin/stock">Cancelar</Link>
          </Button>
          <Button type="submit" className="flex-1" disabled={submitting}>
            {submitting ? "Creando..." : "Crear Producto"}
          </Button>
        </div>
      </form>
    </div>
  )
}
