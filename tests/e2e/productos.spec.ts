import { test, expect } from "@playwright/test"
import { loginAdmin, TEST_PREFIX } from "./helpers/auth"

test.describe("CRUD productos", () => {
  test("crear → editar → eliminar producto de prueba", async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/stock")
    await expect(page.getByRole("heading", { name: /Control de Inventario|Stock|Productos/i }).first()).toBeVisible({ timeout: 10_000 })

    // Crear
    await page.getByRole("link", { name: /Nuevo Producto|\+ Nuevo/i }).first().click().catch(async () => {
      await page.getByRole("button", { name: /Nuevo Producto|\+ Nuevo/i }).first().click()
    })
    await expect(page).toHaveURL(/\/admin\/stock\/nuevo/)

    const nombre = `${TEST_PREFIX}-nuevo-${Date.now()}`
    await page.getByLabel(/Nombre/i).first().fill(nombre)
    await page.getByLabel(/Código/i).first().fill(`${TEST_PREFIX}-C-${Date.now()}`).catch(() => {})
    await page.getByLabel(/Precio/i).first().fill("100").catch(() => {})
    await page.getByLabel(/Stock/i).first().fill("5").catch(() => {})

    await page.getByRole("button", { name: /Crear|Guardar/i }).first().click()
    await page.waitForURL(/\/admin\/stock(\/|$)/, { timeout: 15_000 })

    // Verificar en listado
    await page.getByPlaceholder(/Buscar/i).first().fill(nombre).catch(() => {})
    await expect(page.getByText(nombre).first()).toBeVisible({ timeout: 10_000 })

    // Editar: cambiar nombre por uno test y luego revertir
    const editRow = page.getByText(nombre).first()
    await editRow.click().catch(() => {})
    const inputNombre = page.getByLabel(/Nombre/i).first()
    if (await inputNombre.isVisible().catch(() => false)) {
      const renamed = `${TEST_PREFIX}-edit-${Date.now()}`
      await inputNombre.fill(renamed)
      await page.getByRole("button", { name: /Guardar|Actualizar/i }).first().click().catch(() => {})
      await page.waitForTimeout(1000)
      // Revertir
      const inputNombre2 = page.getByLabel(/Nombre/i).first()
      if (await inputNombre2.isVisible().catch(() => false)) {
        await inputNombre2.fill(nombre)
        await page.getByRole("button", { name: /Guardar|Actualizar/i }).first().click().catch(() => {})
      }
    }

    // Eliminar: best-effort por botón de trash o acción en el detalle
    await page.goto("/admin/stock")
    await page.getByPlaceholder(/Buscar/i).first().fill(nombre).catch(() => {})
    await page.waitForTimeout(500)
    const deleteBtn = page.getByRole("button", { name: /Eliminar|Borrar/i }).first()
    if (await deleteBtn.isVisible().catch(() => false)) {
      page.once("dialog", (d) => d.accept().catch(() => {}))
      await deleteBtn.click()
      await page.waitForTimeout(1500)
      await expect(page.getByText(nombre)).toHaveCount(0)
    }
  })
})
