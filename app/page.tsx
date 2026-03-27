"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, ClipboardList, DollarSign, LogOut } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import Image from "next/image"

interface UserInfo {
  name: string
  role: string
}

function ModuleSelector({ user, onLogout }: { user: UserInfo; onLogout: () => void }) {
  const router = useRouter()

  return (
    <div className="space-y-6">
      <div className="text-center space-y-1">
        <p className="text-sm text-muted-foreground">Bienvenido/a,</p>
        <p className="text-lg font-semibold">{user.name}</p>
      </div>

      <div className="grid gap-4">
        <button
          onClick={() => router.push("/admin")}
          className="flex items-center gap-4 p-5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left group"
        >
          <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-base">Administración</p>
            <p className="text-sm text-muted-foreground">Pedidos, clientes, stock, compras, facturación</p>
          </div>
        </button>

        {user.role === "admin" && (
          <button
            onClick={() => router.push("/admin/finanzas/egresos")}
            className="flex items-center gap-4 p-5 rounded-xl border-2 border-border hover:border-emerald-500 hover:bg-emerald-50 transition-all text-left group"
          >
            <div className="w-12 h-12 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-colors">
              <DollarSign className="h-6 w-6" />
            </div>
            <div>
              <p className="font-semibold text-base">Finanzas</p>
              <p className="text-sm text-muted-foreground">Egresos, ingresos, comisiones</p>
            </div>
          </button>
        )}
      </div>

      <Button variant="ghost" size="sm" onClick={onLogout} className="w-full text-muted-foreground">
        <LogOut className="h-4 w-4 mr-2" />
        Cerrar sesión
      </Button>
    </div>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(true)
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState(searchParams.get("error") || "")
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null)

  // Check if already logged in
  useEffect(() => {
    async function checkSession() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: vendedor } = await supabase
          .from("vendedores")
          .select("name, role")
          .eq("auth_user_id", user.id)
          .single()
        if (vendedor) {
          setUserInfo({ name: vendedor.name, role: vendedor.role })
        }
      }
      setLoading(false)
    }
    checkSession()
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoggingIn(true)
    setError("")

    const supabase = createClient()

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError("Email o contraseña incorrectos")
      setLoggingIn(false)
      return
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError("Error al obtener datos del usuario")
      setLoggingIn(false)
      return
    }

    const { data: vendedor } = await supabase
      .from("vendedores")
      .select("name, role")
      .eq("auth_user_id", user.id)
      .single()

    if (!vendedor) {
      setError("Usuario no configurado en el sistema. Contactá al administrador.")
      await supabase.auth.signOut()
      setLoggingIn(false)
      return
    }

    setUserInfo({ name: vendedor.name, role: vendedor.role })
    setLoggingIn(false)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    setUserInfo(null)
    setEmail("")
    setPassword("")
    router.refresh()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (userInfo) {
    return <ModuleSelector user={userInfo} onLogout={handleLogout} />
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="tu@masoil.com.ar"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loggingIn}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={loggingIn}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={loggingIn}>
        {loggingIn ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Ingresando...
          </>
        ) : (
          "Iniciar Sesión"
        )}
      </Button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 via-background to-accent/10 flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-8 space-y-6">
        <div className="text-center space-y-2">
          <Image
            src="/iconomasoil.png"
            alt="Masoil"
            width={64}
            height={64}
            className="h-16 w-auto mx-auto"
            priority
          />
          <h1 className="text-3xl font-bold text-primary">Masoil Lubricantes</h1>
          <p className="text-muted-foreground">Sistema de Gestión</p>
        </div>

        <Suspense>
          <LoginForm />
        </Suspense>

        <div className="text-xs text-muted-foreground text-center pt-4">
          <p>20+ años distribuyendo calidad</p>
        </div>
      </Card>
    </div>
  )
}
