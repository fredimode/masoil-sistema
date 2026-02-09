"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Mail, Phone, MapPin, LogOut, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

interface VendedorProfile {
  name: string
  email: string
  whatsapp: string | null
  role: string
  vendedor_zonas: { zona: string }[]
}

export default function VendedorPerfilPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<VendedorProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    async function loadProfile() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from("vendedores")
        .select("name, email, whatsapp, role, vendedor_zonas(zona)")
        .eq("auth_user_id", user.id)
        .single()

      if (data) setProfile(data)
      setLoading(false)
    }
    loadProfile()
  }, [])

  const handleLogout = async () => {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-primary text-primary-foreground p-4">
          <h1 className="text-xl font-bold">Mi Perfil</h1>
        </div>
        <div className="p-4 space-y-4">
          <Card className="p-6">
            <div className="flex flex-col items-center gap-3">
              <Skeleton className="w-20 h-20 rounded-full" />
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-5 w-20" />
            </div>
          </Card>
        </div>
      </div>
    )
  }

  if (!profile) return null

  const initials = profile.name
    .split(" ")
    .map((n) => n[0])
    .join("")

  const zonas = profile.vendedor_zonas.map((vz) => vz.zona)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground p-4">
        <h1 className="text-xl font-bold">Mi Perfil</h1>
      </div>

      <div className="p-4 space-y-4">
        {/* Profile Card */}
        <Card className="p-6">
          <div className="text-center mb-4">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl font-bold text-primary">{initials}</span>
            </div>
            <h2 className="text-xl font-bold">{profile.name}</h2>
            <Badge variant="secondary" className="mt-2">
              Vendedor
            </Badge>
          </div>

          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center gap-3 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{profile.email}</span>
            </div>
            {profile.whatsapp && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{profile.whatsapp}</span>
              </div>
            )}
            {zonas.length > 0 && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>Zonas: {zonas.join(", ")}</span>
              </div>
            )}
          </div>
        </Card>

        {/* Actions */}
        <Card className="p-4">
          <h3 className="font-semibold mb-3">Configuración</h3>
          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start bg-transparent">
              Notificaciones
            </Button>
            <Button variant="outline" className="w-full justify-start bg-transparent">
              Ayuda y soporte
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-destructive bg-transparent"
              onClick={handleLogout}
              disabled={loggingOut}
            >
              {loggingOut ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4 mr-2" />
              )}
              Cerrar sesión
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
