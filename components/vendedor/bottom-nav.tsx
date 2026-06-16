"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Home, ShoppingCart, FileText, Users, Package, User } from "lucide-react"

const navItems = [
  { href: "/vendedor", label: "Inicio", icon: Home },
  { href: "/vendedor/pedidos", label: "Pedidos", icon: ShoppingCart },
  { href: "/vendedor/cotizaciones", label: "Cotiz.", icon: FileText },
  { href: "/vendedor/clientes", label: "Clientes", icon: Users },
  { href: "/vendedor/stock", label: "Stock", icon: Package },
  { href: "/vendedor/perfil", label: "Perfil", icon: User },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50">
      <div className="flex items-center justify-around h-16">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== "/vendedor" && pathname.startsWith(item.href))

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
