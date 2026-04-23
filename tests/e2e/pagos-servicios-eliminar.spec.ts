import { test, expect } from "@playwright/test"
import { loginAdmin } from "./helpers/auth"

test.describe("Pagos - Servicios Administración", () => {
  test("tab Servicios Admin tiene columna Acciones", async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/pagos")
    await expect(page.getByRole("heading", { name: /Pagos a Proveedores/i })).toBeVisible({ timeout: 10_000 })

    await page.getByRole("tab", { name: /Servicios Administración/i }).click()
    await page.waitForTimeout(500)

    // Debe haber botón "+ Nuevo Servicio"
    await expect(page.getByRole("button", { name: /Nuevo Servicio/i })).toBeVisible({ timeout: 10_000 })

    // Si hay servicios cargados, debe existir el botón eliminar (no lo clickeamos)
    const filas = page.locator('tbody tr')
    const cant = await filas.count()
    if (cant > 0) {
      await expect(page.locator('button[title="Eliminar"]').first()).toBeVisible()
    } else {
      await expect(page.getByText(/No hay servicios registrados/i)).toBeVisible()
    }
  })
})
