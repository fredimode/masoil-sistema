import { test, expect } from "@playwright/test"
import { loginAdmin } from "./helpers/auth"

test.describe("Ficha proveedor - Reclamos", () => {
  test("detalle de proveedor muestra sección Reclamos", async ({ page }) => {
    await loginAdmin(page)
    await page.goto("/admin/proveedores")
    await expect(page.getByRole("heading", { name: /Proveedores/i }).first()).toBeVisible({ timeout: 10_000 })

    // Abrir primer proveedor via link "Ver"
    const primerVer = page.locator('a[href^="/admin/proveedores/"][title="Ver"]').first()
    await expect(primerVer).toBeVisible({ timeout: 10_000 })
    await primerVer.click()

    // La ficha hace varias queries en paralelo → puede tardar varios segundos
    await expect(page.getByRole("heading", { name: /Datos del Proveedor/i })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("heading", { name: /^Reclamos$/i })).toBeVisible({ timeout: 30_000 })

    // Si hay reclamos, ver las 3 columnas; si no, empty state
    const empty = page.getByText(/No hay reclamos registrados/i)
    const tablaHeader = page.getByRole("columnheader", { name: /Observaciones/i }).first()

    const tieneTabla = await tablaHeader.isVisible().catch(() => false)
    const tieneEmpty = await empty.isVisible().catch(() => false)
    expect(tieneTabla || tieneEmpty).toBe(true)

    if (tieneTabla) {
      await expect(page.getByRole("columnheader", { name: /^Fecha$/i })).toBeVisible()
      await expect(page.getByRole("columnheader", { name: /^Estado$/i })).toBeVisible()
    }
  })
})
