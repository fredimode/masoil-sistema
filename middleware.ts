import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Route permissions: por role y/o permisos granulares (permisos_extra).
// Cada ruta declara qué roles entran sí o sí (roles) y qué permisos
// extra otorgan acceso adicional (permisos). Usuario pasa si tiene
// alguno: role en roles[] OR cualquiera de sus permisos en permisos[].
type RouteRule = { roles?: string[]; permisos?: string[] }
const ROUTE_PERMISSIONS: Record<string, RouteRule> = {
  "/admin/finanzas":         { roles: ["admin"] },
  "/admin/configuracion":    { roles: ["admin"] },
  "/admin/facturacion/logs": { roles: ["admin"] },
  "/admin/contabilidad":     { roles: ["admin"], permisos: ["contabilidad"] },
  "/admin/plan-cuentas":     { roles: ["admin"], permisos: ["contabilidad"] },
}

function checkRoutePermission(pathname: string, role: string, permisos: string[]): boolean {
  for (const [route, rule] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname.startsWith(route)) {
      const okRole = rule.roles?.includes(role) ?? false
      const okPerm = rule.permisos?.some((p) => permisos.includes(p)) ?? false
      return okRole || okPerm
    }
  }
  // If no specific rule, allow all authenticated admin users
  return true
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh the session
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // If user is not logged in and tries to access protected routes
  if (!user && (pathname.startsWith("/admin") || pathname.startsWith("/vendedor"))) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.searchParams.set("error", "Debés iniciar sesión para acceder")
    return NextResponse.redirect(url)
  }

  // If user is logged in, verify role matches the route
  if (user && (pathname.startsWith("/admin") || pathname.startsWith("/vendedor"))) {
    const { data: vendedor } = await supabase
      .from("vendedores")
      .select("role, permisos_extra")
      .eq("auth_user_id", user.id)
      .single()

    if (!vendedor) {
      const url = request.nextUrl.clone()
      url.pathname = "/"
      url.searchParams.set("error", "Usuario no configurado en el sistema")
      return NextResponse.redirect(url)
    }

    const role = vendedor.role
    const permisos = (vendedor.permisos_extra as string[] | null) || []

    // Check specific admin route permissions (Finanzas/Sistema → admin only,
    // Contabilidad/Plan-Cuentas → admin OR permiso 'contabilidad').
    if (pathname.startsWith("/admin") && pathname !== "/admin") {
      if (!checkRoutePermission(pathname, role, permisos)) {
        const url = request.nextUrl.clone()
        url.pathname = "/admin"
        url.searchParams.set("error", "No tenés permisos para acceder a esa sección")
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
