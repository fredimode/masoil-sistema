import { test, expect } from "@playwright/test"
import { loginAdmin } from "./helpers/auth"

test.describe("Estados de pedido", () => {
  test('filtro de estados usa "En preparación" y no el viejo "PREPARADO"', async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/pedidos")
    await expect(page.getByRole("heading", { name: /Pedidos/i }).first()).toBeVisible({ timeout: 10_000 })

    // Abrir el select de filtro de estado
    const selectEstado = page.getByRole("combobox").filter({ hasText: /Estado|Todos/i }).first()
    await selectEstado.click().catch(async () => {
      // fallback: click en trigger por texto genérico
      await page.locator('[role="combobox"]').first().click()
    })

    // Verificar que aparece "En preparación" (nueva label)
    await expect(page.getByRole("option", { name: /En preparación/i })).toBeVisible({ timeout: 5000 })

    // Verificar que NO aparece la label vieja "Preparado" (exacta, sin "En preparación")
    const preparadoVieja = page.getByRole("option", { name: /^Preparado$/i })
    await expect(preparadoVieja).toHaveCount(0)

    // Cerrar dropdown
    await page.keyboard.press("Escape")
  })
})
