import { test, expect } from "@playwright/test"
import { loginAdmin } from "./helpers/auth"

test.describe("Proveedores", () => {
  test("listado carga y detalle muestra historial", async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/proveedores")
    await expect(page.getByRole("heading", { name: /Proveedores/i }).first()).toBeVisible({ timeout: 10_000 })

    // Tabla carga
    await expect(page.locator("table").first()).toBeVisible({ timeout: 10_000 })

    // Clickear un proveedor → detalle
    const firstRow = page.locator("table tbody tr").first()
    if (await firstRow.isVisible().catch(() => false)) {
      const link = firstRow.locator("a").first()
      if (await link.isVisible().catch(() => false)) {
        await link.click()
      } else {
        await firstRow.click()
      }
      await page.waitForURL(/\/admin\/proveedores\/[^/]+$/, { timeout: 10_000 })
      await expect(page.getByText(/Historial|Cuenta Corriente|Cta\.? Cte/i).first()).toBeVisible({ timeout: 10_000 })
    }
  })
})
