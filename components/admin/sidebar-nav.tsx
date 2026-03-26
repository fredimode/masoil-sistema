"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  ClipboardList,
  ClipboardEdit,
  Package,
  Users,
  BarChart3,
  Settings,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Percent,
  FileText,
  Receipt,
  Building2,
  ShoppingCart,
  CreditCard,
  ScrollText,
} from "lucide-react"

type UserRole = "admin" | "vendedor" | "operaciones" | "cobranzas"

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

interface NavSection {
  label: string
  items: NavItem[]
  roles: UserRole[] // roles that can see this section
}

const navSections: NavSection[] = [
  {
    label: "Ventas",
    roles: ["admin", "vendedor", "operaciones", "cobranzas"],
    items: [
      { href: "/admin/pedidos", label: "Pedidos", icon: ClipboardList },
      { href: "/admin/pedidos/customizados", label: "Pedidos Custom", icon: ClipboardEdit },
      { href: "/admin/clientes", label: "Clientes", icon: Users },
      { href: "/admin/facturacion", label: "Facturación", icon: FileText },
      { href: "/admin/cobranzas", label: "Cobranzas", icon: Receipt },
    ],
  },
  {
    label: "Compras",
    roles: ["admin", "operaciones"],
    items: [
      { href: "/admin/proveedores", label: "Proveedores", icon: Building2 },
      { href: "/admin/compras", label: "Órdenes de Compra", icon: ShoppingCart },
      { href: "/admin/pagos", label: "Pagos Proveedores", icon: CreditCard },
    ],
  },
  {
    label: "Inventario",
    roles: ["admin", "vendedor", "operaciones"],
    items: [
      { href: "/admin/stock", label: "Productos", icon: Package },
      { href: "/admin/stock/alertas", label: "Alertas de Stock", icon: AlertTriangle },
    ],
  },
  {
    label: "Finanzas",
    roles: ["admin"],
    items: [
      { href: "/admin/finanzas/egresos", label: "Egresos", icon: TrendingDown },
      { href: "/admin/finanzas/ingresos", label: "Ingresos", icon: TrendingUp },
      { href: "/admin/finanzas/comisiones", label: "Comisiones", icon: Percent },
      { href: "/admin/estadisticas", label: "Estadísticas", icon: BarChart3 },
    ],
  },
  {
    label: "Sistema",
    roles: ["admin"],
    items: [
      { href: "/admin/configuracion", label: "Configuración", icon: Settings },
      { href: "/admin/facturacion/logs", label: "Logs Facturación", icon: ScrollText },
    ],
  },
]

// Filter items by role within Ventas
function getVisibleItems(section: NavSection, role: UserRole): NavItem[] {
  if (role === "admin") return section.items

  if (section.label === "Ventas") {
    if (role === "vendedor") {
      return section.items.filter((i) => ["/admin/pedidos", "/admin/pedidos/customizados", "/admin/clientes"].includes(i.href))
    }
    if (role === "operaciones") {
      return section.items // all ventas visible for operaciones (read)
    }
    if (role === "cobranzas") {
      return section.items.filter((i) => ["/admin/clientes", "/admin/cobranzas"].includes(i.href))
    }
  }

  return section.items
}

interface AdminSidebarContentProps {
  onNavigate?: () => void
  userRole?: UserRole
}

export function AdminSidebarContent({ onNavigate, userRole = "admin" }: AdminSidebarContentProps) {
  const pathname = usePathname()

  const visibleSections = navSections.filter((s) => s.roles.includes(userRole))

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
        {/* Dashboard - always visible */}
        <Link
          href="/admin"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm font-medium",
            pathname === "/admin"
              ? "bg-sidebar-accent text-sidebar-primary"
              : "text-sidebar-foreground hover:bg-sidebar-accent/50",
          )}
        >
          <LayoutDashboard className="h-5 w-5" />
          Dashboard
        </Link>

        {visibleSections.map((section) => {
          const items = getVisibleItems(section, userRole)
          if (items.length === 0) return null

          return (
            <div key={section.label}>
              <div className="pt-4 pb-1 px-4">
                <p className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
                  {section.label}
                </p>
              </div>
              {items.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href))

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-sm font-medium",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                )
              })}
            </div>
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
            <p className="text-xs text-sidebar-foreground/60 capitalize">{userRole}</p>
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
