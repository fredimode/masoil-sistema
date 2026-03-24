import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

// Route permissions by role
const ROUTE_PERMISSIONS: Record<string, string[]> = {
  "/admin/finanzas": ["admin"],
  "/admin/configuracion": ["admin"],
  "/admin/facturacion/logs": ["admin"],
  "/admin/estadisticas": ["admin"],
  "/admin/compras": ["admin", "operaciones"],
  "/admin/proveedores": ["admin", "operaciones"],
  "/admin/pagos": ["admin", "operaciones"],
  "/admin/cotizaciones": ["admin", "operaciones"],
  "/admin/cobranzas": ["admin", "cobranzas"],
  // /admin/pedidos, /admin/clientes, /admin/stock, /admin/facturacion → all roles
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

    // Vendedor role → vendedor routes only
    if (role === "vendedor" && pathname.startsWith("/admin")) {
      const url = request.nextUrl.clone()
      url.pathname = "/vendedor"
      return NextResponse.redirect(url)
    }

    // Non-vendedor roles accessing vendedor routes → admin
    if (role !== "vendedor" && pathname.startsWith("/vendedor")) {
      const url = request.nextUrl.clone()
      url.pathname = "/admin"
      return NextResponse.redirect(url)
    }

    // Check specific admin route permissions
    if (pathname.startsWith("/admin") && pathname !== "/admin") {
      if (!checkRoutePermission(pathname, role)) {
        const url = request.nextUrl.clone()
        url.pathname = "/admin"
        url.searchParams.set("error", "No tenés permisos para acceder a esa sección")
        return NextResponse.redirect(url)
      }
    }
  }

  // If user is logged in and visits the login page, redirect to their dashboard
  if (user && pathname === "/") {
    const { data: vendedor } = await supabase
      .from("vendedores")
      .select("role")
      .eq("auth_user_id", user.id)
      .single()

    if (vendedor) {
      const url = request.nextUrl.clone()
      url.pathname = vendedor.role === "vendedor" ? "/vendedor" : "/admin"
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
