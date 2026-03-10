"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { vendedores as initialVendedores } from "@/lib/mock-data"
import { Settings, Users, MapPin, Package, Bell, Edit, ShieldCheck, UserX } from "lucide-react"

export default function AdminConfiguracionPage() {
  const [vendedoresList, setVendedoresList] = useState(initialVendedores)
  const activeVendedores = vendedoresList.filter((v) => v.role === "vendedor")

  // Agregar usuario dialog
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [newUser, setNewUser] = useState({ name: "", email: "", role: "vendedor" })

  // Editar zonas dialog
  const [zonasOpen, setZonasOpen] = useState(false)

  // Configurar umbrales dialogs
  const [configDialog, setConfigDialog] = useState<{ title: string; label: string; value: string } | null>(null)

  function handleAddUser() {
    console.log("Nuevo usuario:", newUser)
    setAddUserOpen(false)
    setNewUser({ name: "", email: "", role: "vendedor" })
  }

  function handleChangeRole(id: string, newRole: string) {
    setVendedoresList((prev) =>
      prev.map((v) => (v.id === id ? { ...v, role: newRole as "admin" | "vendedor" } : v))
    )
  }

  function handleToggleActive(id: string) {
    setVendedoresList((prev) =>
      prev.map((v) => (v.id === id ? { ...v, isActive: !v.isActive } : v))
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold mb-2">Configuración del Sistema</h1>
        <p className="text-sm md:text-base text-muted-foreground">Administra la configuración general</p>
      </div>

      {/* Quick Settings */}
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="p-4 md:p-6 hover:bg-accent/50 cursor-pointer transition-colors">
          <div className="flex flex-col items-center text-center gap-2 md:gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm md:text-base">Usuarios</h3>
              <p className="text-xs md:text-sm text-muted-foreground">{vendedoresList.length} usuarios</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 md:p-6 hover:bg-accent/50 cursor-pointer transition-colors">
          <div className="flex flex-col items-center text-center gap-2 md:gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <MapPin className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm md:text-base">Zonas</h3>
              <p className="text-xs md:text-sm text-muted-foreground">5 zonas activas</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 md:p-6 hover:bg-accent/50 cursor-pointer transition-colors">
          <div className="flex flex-col items-center text-center gap-2 md:gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Package className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm md:text-base">Productos</h3>
              <p className="text-xs md:text-sm text-muted-foreground">Categorías y stock</p>
            </div>
          </div>
        </Card>

        <Card className="p-4 md:p-6 hover:bg-accent/50 cursor-pointer transition-colors">
          <div className="flex flex-col items-center text-center gap-2 md:gap-3">
            <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Bell className="h-5 w-5 md:h-6 md:w-6 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-sm md:text-base">Notificaciones</h3>
              <p className="text-xs md:text-sm text-muted-foreground">Alertas y avisos</p>
            </div>
          </div>
        </Card>
      </div>

      {/* User Management */}
      <Card className="p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 md:mb-6">
          <h3 className="text-lg font-semibold">Gestión de Usuarios</h3>
          <Button className="w-full md:w-auto" onClick={() => setAddUserOpen(true)}>Agregar Usuario</Button>
        </div>
        <div className="space-y-3">
          {vendedoresList.map((vendedor) => (
            <div key={vendedor.id} className="flex flex-col md:flex-row md:items-center justify-between p-3 md:p-4 border rounded-lg gap-3">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary shrink-0">
                  {vendedor.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div className="min-w-0">
                  <p className="font-medium truncate">{vendedor.name}</p>
                  <p className="text-sm text-muted-foreground truncate">{vendedor.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 md:gap-3 flex-wrap ml-13 md:ml-0">
                <Badge variant={vendedor.role === "admin" ? "default" : "secondary"} className="text-xs">
                  {vendedor.role === "admin" ? "Admin" : "Vendedor"}
                </Badge>
                {vendedor.role === "vendedor" && (
                  <div className="text-xs md:text-sm text-muted-foreground hidden md:block">{vendedor.zonas.join(", ")}</div>
                )}
                <Badge variant={vendedor.isActive ? "outline" : "secondary"} className="text-xs">
                  {vendedor.isActive ? "Activo" : "Inactivo"}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => console.log("Editar", vendedor.id)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleChangeRole(vendedor.id, vendedor.role === "admin" ? "vendedor" : "admin")}>
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      Cambiar a {vendedor.role === "admin" ? "Vendedor" : "Admin"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleToggleActive(vendedor.id)}>
                      <UserX className="h-4 w-4 mr-2" />
                      {vendedor.isActive ? "Desactivar" : "Activar"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Zone Configuration */}
      <Card className="p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 md:mb-6">
          <h3 className="text-lg font-semibold">Configuración de Zonas</h3>
          <Button variant="outline" className="w-full md:w-auto" onClick={() => setZonasOpen(true)}>Editar Zonas</Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          {["Norte", "Capital", "Sur", "Oeste", "GBA"].map((zona) => (
            <Card key={zona} className="p-3 md:p-4">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-sm md:text-base">{zona}</h4>
              </div>
              <p className="text-xs md:text-sm text-muted-foreground">
                {activeVendedores.filter((v) => v.zonas.includes(zona as any)).length} vendedores
              </p>
            </Card>
          ))}
        </div>
      </Card>

      {/* System Settings */}
      <Card className="p-4 md:p-6">
        <h3 className="text-lg font-semibold mb-4 md:mb-6">Configuraciones del Sistema</h3>
        <div className="space-y-3 md:space-y-4">
          {[
            { title: "Alertas de Stock Bajo", desc: "Umbral predeterminado: 25 unidades", label: "Umbral stock bajo", value: "25" },
            { title: "Alertas de Stock Crítico", desc: "Umbral predeterminado: 10 unidades", label: "Umbral stock crítico", value: "10" },
            { title: "Tiempo de Fabricación Customizado", desc: "Predeterminado: 15 días", label: "Días de fabricación", value: "15" },
            { title: "Notificaciones por Email", desc: "Estado de pedidos y alertas", label: "Intervalo notificaciones (horas)", value: "24" },
          ].map((item) => (
            <div key={item.title} className="flex flex-col md:flex-row md:items-center justify-between p-3 md:p-4 border rounded-lg gap-3">
              <div>
                <p className="font-medium text-sm md:text-base">{item.title}</p>
                <p className="text-xs md:text-sm text-muted-foreground">{item.desc}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full md:w-auto"
                onClick={() => setConfigDialog({ title: item.title, label: item.label, value: item.value })}
              >
                Configurar
              </Button>
            </div>
          ))}
        </div>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar Usuario</DialogTitle>
            <DialogDescription>Crear un nuevo usuario del sistema</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium block mb-1">Nombre completo</label>
              <input
                value={newUser.name}
                onChange={(e) => setNewUser((u) => ({ ...u, name: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                placeholder="Juan Pérez"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Email</label>
              <input
                value={newUser.email}
                onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
                placeholder="juan@masoil.com"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">Rol</label>
              <select
                value={newUser.role}
                onChange={(e) => setNewUser((u) => ({ ...u, role: e.target.value }))}
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
              >
                <option value="vendedor">Vendedor</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddUser} disabled={!newUser.name || !newUser.email}>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zonas Info Dialog */}
      <Dialog open={zonasOpen} onOpenChange={setZonasOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Zonas de Entrega</DialogTitle>
            <DialogDescription>Las zonas se gestionan desde la base de datos de Supabase.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-3">
            {["Norte", "Capital", "Sur", "Oeste", "GBA"].map((zona) => (
              <div key={zona} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="font-medium">{zona}</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {activeVendedores.filter((v) => v.zonas.includes(zona as any)).length} vendedores asignados
                </span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setZonasOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Config Value Dialog */}
      <Dialog open={!!configDialog} onOpenChange={(open) => !open && setConfigDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{configDialog?.title}</DialogTitle>
            <DialogDescription>Ajustar valor de configuración</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium block mb-1">{configDialog?.label}</label>
            <input
              type="number"
              value={configDialog?.value || ""}
              onChange={(e) => setConfigDialog((prev) => prev ? { ...prev, value: e.target.value } : null)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-primary"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigDialog(null)}>Cancelar</Button>
            <Button onClick={() => {
              console.log("Config guardada:", configDialog)
              setConfigDialog(null)
            }}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
