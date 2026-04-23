import { test, expect } from "@playwright/test"
import { loginAdmin } from "./helpers/auth"

test.describe("Factura Proveedor - Empresa primer campo", () => {
  test('dialog Cargar Factura arranca con "Empresa" y tiene autocomplete de Proveedor', async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/facturas-proveedor")
    await page.waitForTimeout(500)

    // Abrir dialog
    await page.getByRole("button", { name: /Cargar Factura/i }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("heading", { name: /Cargar Factura de Proveedor/i })).toBeVisible()

    // Primer label del dialog debe ser "Empresa *"
    const primerLabel = page.locator('[role="dialog"] label').first()
    await expect(primerLabel).toContainText(/Empresa/i)

    // Debe existir el autocomplete de Proveedor
    await expect(page.getByPlaceholder(/Buscar por nombre o CUIT/i)).toBeVisible()

    // Cerrar sin guardar
    await page.keyboard.press("Escape")
  })
})
