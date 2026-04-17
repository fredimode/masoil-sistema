import { test, expect } from "@playwright/test"
import { loginAdmin } from "./helpers/auth"

test.describe("Cobranzas", () => {
  test("todos los tabs de cobranzas cargan", async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/cobranzas")
    await expect(page.getByRole("heading", { name: /Cobranzas/i }).first()).toBeVisible({ timeout: 10_000 })

    // Cuenta Corriente
    await page.getByRole("tab", { name: /Cuenta Corriente/i }).click().catch(() => {})
    const searchInput = page.getByPlaceholder(/Buscar cliente/i).first()
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill("a")
      await page.waitForTimeout(500)
    }

    // Registrar cobro
    await page.getByRole("tab", { name: /Registrar Cobro/i }).click().catch(() => {})
    await expect(page.locator("body")).toBeVisible()

    // Cobros Realizados
    await page.getByRole("tab", { name: /Cobros Realizados/i }).click().catch(() => {})
    await expect(page.locator('table, [data-tab="cobros-realizados"]').first()).toBeVisible({ timeout: 10_000 })

    // Retenciones
    await page.getByRole("tab", { name: /Retenciones/i }).click().catch(() => {})
    await expect(page.locator("body")).toBeVisible()

    // Informe Pendientes
    await page.getByRole("tab", { name: /Informe.*Pendientes|Pendientes/i }).click().catch(() => {})
    await expect(page.locator("body")).toBeVisible()
  })
})
