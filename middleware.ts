import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Route permissions by role
// usuario can access everything EXCEPT Finanzas and Sistema
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  "/admin/finanzas": ["admin"],
  "/admin/configuracion": ["admin"],
  "/admin/facturacion/logs": ["admin"],
  // Everything else (pedidos, clientes, stock, compras, proveedores, pagos, cobranzas, facturacion, estadisticas) → all roles
}

function checkRoutePermission(pathname: string, role: string): boolean {
  // Check from most specific to least specific
  for (const [route, allowedRoles] of Object.entries(ROUTE_PERMISSIONS)) {
    if (pathname.startsWith(route)) {
      return allowedRoles.includes(role)
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
      .select("role")
      .eq("auth_user_id", user.id)
      .single()

    if (!vendedor) {
      const url = request.nextUrl.clone()
      url.pathname = "/"
      url.searchParams.set("error", "Usuario no configurado en el sistema")
      return NextResponse.redirect(url)
    }

    const role = vendedor.role

    // Check specific admin route permissions (Finanzas/Sistema → admin only)
    if (pathname.startsWith("/admin") && pathname !== "/admin") {
      if (!checkRoutePermission(pathname, role)) {
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
