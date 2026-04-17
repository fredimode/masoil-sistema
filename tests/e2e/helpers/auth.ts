import { expect, Page } from "@playwright/test"

export const ADMIN_EMAIL = "pablo@masoil.com.ar"
export const ADMIN_PASSWORD = "MasoilAdmin2025!"
export const VENDEDOR_EMAIL = "jestevez@masoil.com.ar"
export const VENDEDOR_PASSWORD = "MasoilUser2026!"

export const TEST_PREFIX = "TEST-BORRAR"

export async function login(page: Page, email: string, password: string, modulo: "admin" | "vendedor" = "admin") {
  await page.goto("/")

  // Si ya hay sesión, la página redirige sola al módulo correspondiente.
  try {
    await page.waitForURL(/\/(admin|vendedor)(\/|$)/, { timeout: 1500 })
    return
  } catch { /* no session -> continúa con el flujo normal de login */ }

  // Seleccionar módulo
  const moduloLabel = modulo === "admin" ? "Administración" : "Vendedores"
  const moduleButton = page.getByRole("button", { name: moduloLabel })
  if (await moduleButton.isVisible().catch(() => false)) {
    await moduleButton.click()
  }

  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Contraseña").fill(password)
  await page.getByRole("button", { name: /Iniciar Sesión|Ingresando/i }).click()

  const targetUrl = modulo === "admin" ? /\/admin(\/|$)/ : /\/vendedor(\/|$)/
  await page.waitForURL(targetUrl, { timeout: 15_000 })
  await expect(page).toHaveURL(targetUrl)
}

export async function loginAdmin(page: Page) {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD, "admin")
}
