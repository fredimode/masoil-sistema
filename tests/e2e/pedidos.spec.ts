import { test, expect } from "@playwright/test"
import { loginAdmin, TEST_PREFIX } from "./helpers/auth"

test.describe("Flujo de pedidos", () => {
  test("crear pedido → cambiar estado → cancelar", async ({ page }) => {
    await loginAdmin(page)

    await page.goto("/admin/pedidos")
    await expect(page.getByRole("heading", { name: /Pedidos/i }).first()).toBeVisible({ timeout: 10_000 })

    await page.getByRole("link", { name: /Nuevo Pedido|\+ Nuevo/i }).first().click().catch(async () => {
      await page.getByRole("button", { name: /Nuevo Pedido|\+ Nuevo/i }).first().click()
    })
    await expect(page).toHaveURL(/\/admin\/pedidos\/nuevo/)

    // Buscar cliente
    const clienteInput = page.getByPlaceholder(/Buscar cliente|Cliente/i).first()
    await clienteInput.fill("a")
    await page.waitForTimeout(500)
    const firstClientOption = page.locator('[role="option"], [data-cliente-result], button').filter({ hasText: /./ }).first()
    await firstClientOption.click().catch(() => { /* best-effort */ })

    // Razón social (si se pide)
    const razonSelect = page.getByRole("combobox").filter({ hasText: /Razón social/i }).first()
    if (await razonSelect.isVisible().catch(() => false)) {
      await razonSelect.click()
      await page.getByRole("option").first().click().catch(() => {})
    }

    // Buscar producto
    const prodInput = page.getByPlaceholder(/Buscar producto|Producto/i).first()
    if (await prodInput.isVisible().catch(() => false)) {
      await prodInput.fill("a")
      await page.waitForTimeout(500)
      const firstProd = page.locator('[role="option"], [data-producto-result], button').filter({ hasText: /./ }).first()
      await firstProd.click().catch(() => {})
    }

    const cantidadInput = page.getByLabel(/Cantidad/i).first()
    if (await cantidadInput.isVisible().catch(() => false)) {
      await cantidadInput.fill("1")
    }

    // Escuchar alerts accidentales
    let sawAlert = false
    page.on("dialog", async (d) => { sawAlert = true; await d.dismiss().catch(() => {}) })

    // Usar exact match para evitar coincidir con 'Guardar Borrador' también presente
    await page.getByRole("button", { name: "Crear Pedido", exact: true }).click()

    // Esperar redirect a detalle o listado
    await page.waitForURL(/\/admin\/pedidos(\/|$)/, { timeout: 20_000 })
    expect(sawAlert).toBe(false)

    // Volver al listado y verificar presencia
    await page.goto("/admin/pedidos")
    await expect(page.getByText(/INGRESADO/i).first()).toBeVisible({ timeout: 10_000 })

    // Cambio de estado inline (si existe select en la primera fila)
    const statusSelect = page.locator('table [role="combobox"]').first()
    if (await statusSelect.isVisible().catch(() => false)) {
      await statusSelect.click()
      await page.getByRole("option", { name: /En preparación/i }).click().catch(() => {})
      await expect(page.getByText(/En preparación/i).first()).toBeVisible({ timeout: 5_000 })
    }

    // Cancelar pedido (best-effort: abrir detalle y clickear Cancelar)
    const firstRowLink = page.locator('table a').first()
    if (await firstRowLink.isVisible().catch(() => false)) {
      await firstRowLink.click()
      const cancelBtn = page.getByRole("button", { name: /^Cancelar pedido$|Cancelar$/i }).first()
      if (await cancelBtn.isVisible().catch(() => false)) {
        page.once("dialog", (d) => d.accept().catch(() => {}))
        await cancelBtn.click()
        await expect(page.getByText(/CANCELADO/i).first()).toBeVisible({ timeout: 10_000 })
      }
    }
  })
})
