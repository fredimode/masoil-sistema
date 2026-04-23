import { test, expect } from "@playwright/test"
import { loginAdmin } from "./helpers/auth"

test.describe("Cobranzas - rango default", () => {
  test("filtro de fecha desde arranca en 2000-01-01", async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/cobranzas")
    await expect(page.getByRole("heading", { name: /Cobranzas/i }).first()).toBeVisible({ timeout: 10_000 })

    // Ir a tab Cuenta Corriente donde hay filtro de fecha
    await page.getByRole("tab", { name: /Cuenta Corriente/i }).click().catch(() => {})

    // Debe haber al menos un input type=date con value 2000-01-01
    const fechaDesde = page.locator('input[type="date"][value="2000-01-01"]').first()
    await expect(fechaDesde).toBeVisible({ timeout: 10_000 })
  })
})
