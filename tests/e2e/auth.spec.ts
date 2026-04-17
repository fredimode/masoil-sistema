import { test, expect } from "@playwright/test"
import { login, ADMIN_EMAIL, ADMIN_PASSWORD, VENDEDOR_EMAIL, VENDEDOR_PASSWORD } from "./helpers/auth"

test.describe("Autenticación y roles", () => {
  test("admin puede ver Finanzas y Sistema en sidebar", async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASSWORD, "admin")
    await expect(page).toHaveURL(/\/admin/)
    await expect(page.getByText("Finanzas", { exact: false }).first()).toBeVisible()
    await expect(page.getByText("Sistema", { exact: false }).first()).toBeVisible()
  })

  test("vendedor comercial NO ve Finanzas ni Sistema", async ({ page }) => {
    await login(page, VENDEDOR_EMAIL, VENDEDOR_PASSWORD, "admin")
    await expect(page).toHaveURL(/\/admin/)

    // Sidebar puede cargarse un instante después; esperamos a que aparezca algo clave
    await expect(page.getByText(/Pedidos|Clientes|Stock/i).first()).toBeVisible({ timeout: 10_000 })

    await expect(page.getByText("Finanzas", { exact: false })).toHaveCount(0)
    await expect(page.getByText("Sistema", { exact: false })).toHaveCount(0)
  })
})
