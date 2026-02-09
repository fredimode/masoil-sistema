import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

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
          cookiesToSet.forEach(({ name, value, options }) =>
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

  // Refresh the session (important for token refresh)
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
      // User exists in auth but not in vendedores table
      const url = request.nextUrl.clone()
      url.pathname = "/"
      url.searchParams.set("error", "Usuario no configurado en el sistema")
      return NextResponse.redirect(url)
    }

    // Admin trying to access vendedor routes -> redirect to admin
    if (vendedor.role === "admin" && pathname.startsWith("/vendedor")) {
      const url = request.nextUrl.clone()
      url.pathname = "/admin"
      return NextResponse.redirect(url)
    }

    // Vendedor trying to access admin routes -> redirect to vendedor
    if (vendedor.role === "vendedor" && pathname.startsWith("/admin")) {
      const url = request.nextUrl.clone()
      url.pathname = "/vendedor"
      return NextResponse.redirect(url)
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
      url.pathname = vendedor.role === "admin" ? "/admin" : "/vendedor"
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
