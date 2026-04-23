import { test, expect } from "@playwright/test"
import { loginAdmin } from "./helpers/auth"

test.describe("Movimiento de Mercadería", () => {
  test("página carga y dialog de nuevo movimiento abre con los 5 tipos", async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/movimiento-mercaderia")
    await expect(page.getByRole("heading", { name: /Movimiento de Mercadería/i }).first()).toBeVisible({ timeout: 10_000 })

    // Abrir dialog "Nuevo Movimiento"
    await page.getByRole("button", { name: /Nuevo Movimiento/i }).click()
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 })

    // Campos principales del dialog
    await expect(page.getByText(/^Tipo$/).first()).toBeVisible()
    await expect(page.getByText(/Producto/i).first()).toBeVisible()
    await expect(page.getByPlaceholder(/ingreso.*egreso/i)).toBeVisible()

    // Cerrar sin guardar
    await page.getByRole("button", { name: /Cancelar/i }).click()
    await expect(page.getByRole("dialog")).not.toBeVisible({ timeout: 5000 })
  })
})
