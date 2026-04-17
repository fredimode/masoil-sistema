import { test, expect } from "@playwright/test"
import { loginAdmin } from "./helpers/auth"

test.describe("Flujo de cotizaciones", () => {
  test("crear → aprobar → convertir a pedido sin errores", async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/cotizaciones-venta")
    await expect(page.getByRole("heading", { name: /Cotizaciones/i }).first()).toBeVisible({ timeout: 10_000 })

    await page.getByRole("link", { name: /Nueva Cotización|\+ Nueva/i }).first().click().catch(async () => {
      await page.getByRole("button", { name: /Nueva Cotización|\+ Nueva/i }).first().click()
    })
    await expect(page).toHaveURL(/\/admin\/cotizaciones-venta\/nueva/)

    // Cliente
    const clienteInput = page.getByPlaceholder(/Buscar cliente|Cliente/i).first()
    await clienteInput.fill("a")
    await page.waitForTimeout(500)
    await page.locator('[role="option"], button').filter({ hasText: /./ }).first().click().catch(() => {})

    // Producto
    const prodInput = page.getByPlaceholder(/Buscar producto|Producto/i).first()
    if (await prodInput.isVisible().catch(() => false)) {
      await prodInput.fill("a")
      await page.waitForTimeout(500)
      await page.locator('[role="option"], button').filter({ hasText: /./ }).first().click().catch(() => {})
    }

    // Términos (best-effort)
    const formaPago = page.getByLabel(/Forma de pago|Forma pago/i).first()
    if (await formaPago.isVisible().catch(() => false)) {
      await formaPago.fill("Contado").catch(() => {})
    }

    let sawAlert = false
    page.on("dialog", async (d) => { sawAlert = true; await d.dismiss().catch(() => {}) })

    await page.getByRole("button", { name: /Crear Cotización|Guardar/i }).first().click()
    await page.waitForURL(/\/admin\/cotizaciones-venta(\/|$)/, { timeout: 15_000 })
    expect(sawAlert).toBe(false)

    // Entrar al primer detalle
    await page.goto("/admin/cotizaciones-venta")
    await page.locator('table a').first().click()

    // Aprobar
    const aprobarBtn = page.getByRole("button", { name: /^Aprobar$/i }).first()
    if (await aprobarBtn.isVisible().catch(() => false)) {
      page.once("dialog", (d) => d.accept().catch(() => {}))
      await aprobarBtn.click()
    }

    // Convertir en pedido
    const convertirBtn = page.getByRole("button", { name: /Convertir en Pedido/i }).first()
    await expect(convertirBtn).toBeVisible({ timeout: 10_000 })

    let convertAlert = ""
    page.once("dialog", async (d) => { convertAlert = d.message(); await d.dismiss().catch(() => {}) })
    await convertirBtn.click()

    // Si se hubiera disparado el error histórico, aparece el alert "Error al convertir en pedido"
    await page.waitForTimeout(3_000)
    expect(convertAlert.toLowerCase()).not.toContain("error al convertir")

    // Debe redirigir al detalle del pedido creado
    await expect(page).toHaveURL(/\/admin\/pedidos\/[^/]+$/, { timeout: 15_000 })
  })
})
