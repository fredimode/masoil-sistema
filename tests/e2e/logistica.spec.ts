import { test, expect } from "@playwright/test"
import { loginAdmin } from "./helpers/auth"

test.describe("Logística", () => {
  test("página carga, muestra N° de reparto y abre dialog de nuevo destino", async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/logistica")
    await expect(page.getByRole("heading", { name: /Logística/i }).first()).toBeVisible({ timeout: 10_000 })

    // Controles principales visibles
    await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/N° de Reparto/i)).toBeVisible()

    // Abrir dialog "Nuevo destino en reparto"
    await page.getByRole("button", { name: /Nuevo destino en reparto/i }).click()
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/Descripción/i).first()).toBeVisible()

    // Cerrar sin guardar
    await page.getByRole("button", { name: /Cancelar/i }).click()
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 })
  })
})
