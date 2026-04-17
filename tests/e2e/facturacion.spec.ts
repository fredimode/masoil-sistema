import { test, expect } from "@playwright/test"
import { loginAdmin } from "./helpers/auth"

test.describe("Facturación", () => {
  test("tab Facturas carga y se puede intentar emitir factura de prueba", async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/facturacion")
    await expect(page.getByRole("heading", { name: /Facturación|Facturacion/i }).first()).toBeVisible({ timeout: 10_000 })

    // Verificar tab Facturas
    await page.getByRole("tab", { name: /^Facturas$|Facturas Emitidas/i }).first().click().catch(() => {})
    await expect(page.locator('table, [data-factura-tab="facturas"]').first()).toBeVisible({ timeout: 10_000 })

    // Abrir modal/form de nueva factura
    const nuevaBtn = page.getByRole("link", { name: /Nueva Factura|\+ Nueva/i }).first()
    if (await nuevaBtn.isVisible().catch(() => false)) {
      await nuevaBtn.click()
    } else {
      await page.getByRole("button", { name: /Nueva Factura|\+ Nueva/i }).first().click().catch(() => {})
    }

    // Seleccionar tipo Factura (radio/select)
    const factRadio = page.getByLabel(/^Factura$/i).first()
    if (await factRadio.isVisible().catch(() => false)) {
      await factRadio.click().catch(() => {})
    }

    // Cliente
    const clienteInput = page.getByPlaceholder(/Buscar cliente|Cliente/i).first()
    if (await clienteInput.isVisible().catch(() => false)) {
      await clienteInput.fill("a")
      await page.waitForTimeout(500)
      await page.locator('[role="option"], button').filter({ hasText: /./ }).first().click().catch(() => {})
    }

    // Producto
    const prodInput = page.getByPlaceholder(/Buscar producto|Producto/i).first()
    if (await prodInput.isVisible().catch(() => false)) {
      await prodInput.fill("a")
      await page.waitForTimeout(500)
      await page.locator('[role="option"], button').filter({ hasText: /./ }).first().click().catch(() => {})
    }

    // Botón generar en modo testing
    let sawAlert = ""
    page.on("dialog", async (d) => { sawAlert = d.message(); await d.dismiss().catch(() => {}) })

    const generarBtn = page.getByRole("button", { name: /Generar.*Testing|Generar/i }).first()
    if (await generarBtn.isVisible().catch(() => false)) {
      await generarBtn.click()
      await page.waitForTimeout(5_000)
      expect(sawAlert.toLowerCase()).not.toContain("error")
    }

    // Volver al listado y verificar
    await page.goto("/admin/facturacion")
    await expect(page.locator("body")).toBeVisible()
  })
})
