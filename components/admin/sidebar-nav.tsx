"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  FileText,
  Package,
  Users,
  BarChart3,
  Settings,
  Factory,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Percent,
  Receipt,
  Building2,
  ShoppingCart,
  CreditCard,
  ScrollText,
} from "lucide-react"

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/pedidos", label: "Pedidos", icon: FileText },
  { href: "/admin/pedidos/customizados", label: "Pedidos Custom", icon: Factory },
  { href: "/admin/stock", label: "Inventario", icon: Package },
  { href: "/admin/stock/alertas", label: "Alertas de Stock", icon: AlertTriangle },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/estadisticas", label: "Estadísticas", icon: BarChart3 },
  { type: "separator" as const, label: "Operaciones" },
  { href: "/admin/proveedores", label: "Proveedores", icon: Building2 },
  { href: "/admin/compras", label: "Compras", icon: ShoppingCart },
  { href: "/admin/pagos", label: "Pagos Proveedores", icon: CreditCard },
  { href: "/admin/cobranzas", label: "Cobranzas", icon: Receipt },
  { type: "separator" as const, label: "Finanzas" },
  { href: "/admin/finanzas/egresos", label: "Egresos", icon: TrendingDown },
  { href: "/admin/finanzas/ingresos", label: "Ingresos", icon: TrendingUp },
  { href: "/admin/finanzas/comisiones", label: "Comisiones", icon: Percent },
  { href: "/admin/facturacion", label: "Facturación", icon: Receipt },
  { href: "/admin/facturacion/logs", label: "Logs Facturación", icon: ScrollText },
  { type: "separator" as const, label: "Sistema" },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings },
]

interface AdminSidebarContentProps {
  onNavigate?: () => void
}

export function AdminSidebarContent({ onNavigate }: AdminSidebarContentProps) {
  const pathname = usePathname()

  return (
    <>
      <div className="p-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <Image
            src="/iconomasoil.png"
            alt="Masoil"
            width={40}
            height={40}
            className="h-10 w-auto"
            priority
          />
          <span className="text-xl font-bold text-sidebar-primary tracking-tight">masoil</span>
        </div>
        <p className="text-sm text-sidebar-foreground/60 mt-1">Panel Administrativo</p>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item, index) => {
          if ("type" in item && item.type === "separator") {
            return (
              <div key={`sep-${index}`} className="pt-4 pb-1 px-4">
                <p className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">{item.label}</p>
              </div>
            )
          }

          const navItem = item as { href: string; label: string; icon: React.ComponentType<{ className?: string }> }
          const Icon = navItem.icon
          const isActive = pathname === navItem.href || (navItem.href !== "/admin" && pathname.startsWith(navItem.href))

          return (
            <Link
              key={navItem.href}
              href={navItem.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm font-medium",
                isActive
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50",
              )}
            >
              <Icon className="h-5 w-5" />
              {navItem.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-full bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-bold text-sm">
            AM
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">Admin Masoil</p>
            <p className="text-xs text-sidebar-foreground/60">Administrador</p>
          </div>
        </div>
      </div>
    </>
  )
}

// Legacy export for backwards compatibility
export function SidebarNav() {
  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      <AdminSidebarContent />
    </aside>
  )
}
