import { test, expect } from "@playwright/test"
import { loginAdmin } from "./helpers/auth"

test.describe("Cobranzas - botón Cargar Retenciones movido", () => {
  test('tab Cuenta Corriente NO tiene botón "Cargar Retenciones"', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAdmin(page)
    await page.goto("/admin/cobranzas")
    // Primera compilación del módulo puede ser lenta en dev
    await expect(page.getByRole("heading", { name: /Cobranzas/i }).first()).toBeVisible({ timeout: 60_000 })

    // Ir a Cuenta Corriente
    await page.getByRole("tab", { name: /Cuenta Corriente/i }).click()
    await page.waitForTimeout(500)

    // En esta tab el botón ya no debe estar (se movió a Registrar Cobro)
    const botonRetenciones = page.getByRole("button", { name: /Cargar Retenciones/i })
    await expect(botonRetenciones).toHaveCount(0)
  })
})
