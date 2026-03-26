"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { LogOut, Menu, Loader2 } from "lucide-react"
import { AdminSidebarContent } from "@/components/admin/sidebar-nav"
import { AiChat } from "@/components/chat/ai-chat"
import { createClient } from "@/lib/supabase/client"

type UserRole = "admin" | "usuario"

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [userRole, setUserRole] = useState<UserRole>("admin")
  const [userName, setUserName] = useState<string>("")

  useEffect(() => {
    async function loadRole() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: vendedor } = await supabase
          .from("vendedores")
          .select("role, name")
          .eq("auth_user_id", user.id)
          .single()
        if (vendedor) {
          setUserRole(vendedor.role as UserRole)
          setUserName(vendedor.name || "")
        }
      }
    }
    loadRole()
  }, [])

  const handleLogout = async () => {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 bg-sidebar border-r border-sidebar-border flex-col">
        <AdminSidebarContent userRole={userRole} userName={userName} />
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-16 border-b bg-background flex items-center justify-between px-4 md:px-6">
          {/* Mobile Menu Button */}
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Abrir menú</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64">
              <AdminSidebarContent onNavigate={() => setSidebarOpen(false)} userRole={userRole} userName={userName} />
            </SheetContent>
          </Sheet>

          {/* Title - visible on mobile */}
          <h1 className="text-lg font-semibold md:hidden">Masoil Admin</h1>

          {/* Spacer for desktop */}
          <div className="hidden md:block" />

          {/* Logout Button */}
          <Button variant="ghost" onClick={handleLogout} disabled={loggingOut} className="gap-2">
            {loggingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">Cerrar Sesión</span>
          </Button>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      <AiChat />
    </div>
  )
}
