import { test, expect } from "@playwright/test"
import { loginAdmin } from "./helpers/auth"

test.describe("Pagos - Empresa como primer campo", () => {
  test('el form /admin/pagos/nuevo arranca con label "Empresa"', async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/pagos/nuevo")
    await expect(page.getByRole("heading", { name: /Nuevo Pago a Proveedor/i })).toBeVisible({ timeout: 10_000 })

    // Primera label del form debe ser "Empresa *"
    const primerLabel = page.locator("form label, main label").first()
    await expect(primerLabel).toContainText(/Empresa/i)
  })
})
