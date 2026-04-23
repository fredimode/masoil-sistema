import { test, expect } from "@playwright/test"
import { login, VENDEDOR_EMAIL, VENDEDOR_PASSWORD } from "./helpers/auth"

test.describe("Módulo Vendedor", () => {
  test("todas las páginas principales del módulo vendedor cargan", async ({ page }) => {
    test.setTimeout(180_000)
    await login(page, VENDEDOR_EMAIL, VENDEDOR_PASSWORD, "vendedor")

    // Dashboard
    await expect(page.getByRole("heading", { name: /^Hola,/i })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("heading", { name: /Mis Pedidos Recientes/i })).toBeVisible()

    // Listado de pedidos
    await page.goto("/vendedor/pedidos")
    await expect(page.getByRole("heading", { name: /^Mis Pedidos$/i })).toBeVisible({ timeout: 30_000 })

    // Clientes
    await page.goto("/vendedor/clientes")
    await expect(page.getByRole("heading", { name: /Mis Clientes/i })).toBeVisible({ timeout: 30_000 })

    // Stock
    await page.goto("/vendedor/stock")
    await expect(page.getByRole("heading", { name: /Consulta de Stock/i })).toBeVisible({ timeout: 30_000 })

    // Perfil
    await page.goto("/vendedor/perfil")
    await expect(page.getByRole("heading", { name: /^Mi Perfil$/i }).first()).toBeVisible({ timeout: 30_000 })
  })

  test("nuevo pedido abre con las 3 secciones del wizard", async ({ page }) => {
    test.setTimeout(120_000)
    await login(page, VENDEDOR_EMAIL, VENDEDOR_PASSWORD, "vendedor")

    await page.goto("/vendedor/pedidos/nuevo")
    await expect(page.getByRole("heading", { name: /^Nuevo Pedido$/i })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("heading", { name: /Seleccionar Cliente/i })).toBeVisible()
    await expect(page.getByRole("heading", { name: /Agregar Productos/i })).toBeVisible()
    await expect(page.getByRole("heading", { name: /Opciones/i })).toBeVisible()
  })
})
