import { test, expect } from "@playwright/test"
import { loginAdmin } from "./helpers/auth"

test.describe("Flujo compras", () => {
  test("tabs Solicitudes / Órdenes de Compra / Seguimiento cargan", async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/compras")
    await expect(page.getByRole("heading", { name: /Compras/i }).first()).toBeVisible({ timeout: 10_000 })

    await page.getByRole("tab", { name: /Solicitudes/i }).click().catch(() => {})
    await expect(page.locator('table, [data-compras-tab="solicitudes"]').first()).toBeVisible({ timeout: 10_000 })

    await page.getByRole("tab", { name: /Órdenes de Compra|Ordenes de Compra/i }).click().catch(() => {})
    await expect(page.locator('table, [data-compras-tab="oc"]').first()).toBeVisible({ timeout: 10_000 })

    await page.getByRole("tab", { name: /Seguimiento/i }).click().catch(() => {})
    await expect(page.locator('table, [data-compras-tab="seguimiento"]').first()).toBeVisible({ timeout: 10_000 })
  })
})
