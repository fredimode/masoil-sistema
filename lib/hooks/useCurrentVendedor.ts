"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Zona, UserRole } from "@/lib/types"

interface CurrentVendedor {
  id: string
  authUserId: string
  name: string
  email: string
  whatsapp: string | null
  role: UserRole
  isActive: boolean
  zonas: Zona[]
  iniciales?: string | null
}

interface UseCurrentVendedorReturn {
  vendedor: CurrentVendedor | null
  loading: boolean
  error: string | null
}

export function useCurrentVendedor(): UseCurrentVendedorReturn {
  const [vendedor, setVendedor] = useState<CurrentVendedor | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadVendedor() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
          setError("No hay sesión activa")
          setLoading(false)
          return
        }

        const { data, error: queryError } = await supabase
          .from("vendedores")
          .select("id, auth_user_id, name, email, whatsapp, role, is_active, iniciales, vendedor_zonas(zona)")
          .eq("auth_user_id", user.id)
          .single()

        if (queryError || !data) {
          setError("Usuario no encontrado en el sistema")
          setLoading(false)
          return
        }

        setVendedor({
          id: data.id,
          authUserId: data.auth_user_id,
          name: data.name,
          email: data.email,
          whatsapp: data.whatsapp,
          role: data.role as UserRole,
          isActive: data.is_active,
          iniciales: (data as any).iniciales || null,
          zonas: (data.vendedor_zonas as { zona: string }[]).map((vz) => vz.zona as Zona),
        })
      } catch {
        setError("Error al cargar datos del vendedor")
      } finally {
        setLoading(false)
      }
    }

    loadVendedor()
  }, [])

  return { vendedor, loading, error }
}
