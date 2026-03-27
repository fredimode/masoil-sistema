"use client"

import { Suspense, useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, ClipboardList, Users } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import Image from "next/image"
import { cn } from "@/lib/utils"

type Modulo = "admin" | "vendedor"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(true)
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState(searchParams.get("error") || "")
  const [modulo, setModulo] = useState<Modulo>("admin")

  // Check if already logged in → redirect directly
  useEffect(() => {
    async function checkSession() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: vendedor } = await supabase
          .from("vendedores")
          .select("role")
          .eq("auth_user_id", user.id)
          .single()
        if (vendedor) {
          router.push("/admin")
          return
        }
      }
      setLoading(false)
    }
    checkSession()
  }, [router])

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
      .select("role")
      .eq("auth_user_id", user.id)
      .single()

    if (!vendedor) {
      setError("Usuario no configurado en el sistema. Contactá al administrador.")
      await supabase.auth.signOut()
      setLoggingIn(false)
      return
    }

    router.push(modulo === "admin" ? "/admin" : "/vendedor")
    router.refresh()
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <form onSubmit={handleLogin} className="space-y-5 pt-2">
      {/* Module selector */}
      <div>
        <Label className="text-sm font-medium mb-2 block">Módulo</Label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setModulo("admin")}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
              modulo === "admin"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-muted-foreground/30"
            )}
          >
            <ClipboardList className="h-6 w-6" />
            <span className="text-sm font-semibold">Administración</span>
          </button>
          <button
            type="button"
            onClick={() => setModulo("vendedor")}
            className={cn(
              "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all",
              modulo === "vendedor"
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-muted-foreground/30"
            )}
          >
            <Users className="h-6 w-6" />
            <span className="text-sm font-semibold">Vendedores</span>
          </button>
        </div>
      </div>

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

        <div className="text-xs text-muted-foreground text-center pt-2">
          <p>20+ años distribuyendo calidad</p>
        </div>
      </Card>
    </div>
  )
}
