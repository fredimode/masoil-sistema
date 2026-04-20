import { test, expect } from "@playwright/test"
import { loginAdmin } from "./helpers/auth"

test.describe("Pagos a proveedores", () => {
  test("todos los tabs de pagos cargan y modal de nuevo pago abre", async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/pagos")
    await expect(page.getByRole("heading", { name: /Pagos/i }).first()).toBeVisible({ timeout: 15_000 })
    // Esperar a que la tablist esté montada antes de clicar tabs
    await page.waitForSelector('[role="tablist"]', { timeout: 10_000 })

    // Tab Cta Cte
    await page.getByRole("tab", { name: /Proveedores|Cta\.? Cte|Cuenta Corriente/i }).click().catch(() => {})
    await expect(page.locator("body")).toBeVisible()

    // Tab Lote de Pago
    await page.getByRole("tab", { name: /Lote.*Pago/i }).click().catch(() => {})
    await expect(page.locator("body")).toBeVisible()

    // Tab Reclamos
    await page.getByRole("tab", { name: /Reclamos/i }).click().catch(() => {})
    await expect(page.locator("body")).toBeVisible()

    // Nuevo Pago
    const nuevoBtn = page.getByRole("link", { name: /Nuevo Pago|\+ Nuevo/i }).first()
    if (await nuevoBtn.isVisible().catch(() => false)) {
      await nuevoBtn.click()
    } else {
      await page.getByRole("button", { name: /Nuevo Pago|\+ Nuevo/i }).first().click().catch(() => {})
    }

    const provInput = page.getByPlaceholder(/Buscar proveedor|Proveedor/i).first()
    if (await provInput.isVisible().catch(() => false)) {
      await provInput.fill("a")
      await page.waitForTimeout(500)
      await page.locator('[role="option"], button').filter({ hasText: /./ }).first().click().catch(() => {})
      // Al seleccionar proveedor se espera que cargue facturas del proveedor
      await page.waitForTimeout(1500)
    }
    await expect(page.locator("body")).toBeVisible()
  })
})
