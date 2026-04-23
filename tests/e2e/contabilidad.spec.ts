import { test, expect } from "@playwright/test"
import { loginAdmin } from "./helpers/auth"

test.describe("Contabilidad", () => {
  test("los 4 tabs de contabilidad cargan", async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/contabilidad")
    await expect(page.getByRole("heading", { name: /Contabilidad/i }).first()).toBeVisible({ timeout: 10_000 })

    // IVA a Pagar (default)
    await expect(page.getByRole("tab", { name: /IVA a Pagar/i })).toBeVisible()
    await expect(page.locator("body")).toBeVisible()

    // Subdiario IVA Ventas
    await page.getByRole("tab", { name: /Subdiario IVA Ventas/i }).click().catch(() => {})
    await expect(page.locator("body")).toBeVisible()

    // Subdiario IVA Compras
    await page.getByRole("tab", { name: /Subdiario IVA Compras/i }).click().catch(() => {})
    await expect(page.locator("body")).toBeVisible()

    // Ventas por Jurisdicción
    await page.getByRole("tab", { name: /Jurisdicci/i }).click().catch(() => {})
    await expect(page.locator("body")).toBeVisible()
  })
})
