# Security

## Reporting

Para reportar vulnerabilidades, contactar al maintainer del repo. No abrir issues públicos con detalles explotables.

## Procedimiento

1. Ejecutar `pnpm audit` periódicamente (semanal) y al revisar PRs que tocan dependencias.
2. Para advisories nuevos:
   - Si hay parche disponible y el bump es minor/patch → aplicar en commit dedicado.
   - Si hay parche disponible y es major → evaluar breaking changes, commit dedicado con migration notes.
   - Si NO hay parche disponible → evaluar superficie de ataque vs blast radius, documentar acá si se acepta el riesgo.
3. Forzar versiones de dependencias transitivas vía `pnpm.overrides` en `package.json` cuando el paquete directo no permite el upgrade.

## Riesgos aceptados (sin parche disponible)

### `xlsx` (SheetJS) — `^0.18.5`

**Advisories activos:**
- `GHSA-4r6h-8v6p-xvw6` — Prototype Pollution (high). Versions: `<0.19.3`. Patched: ninguna en npm.
- `GHSA-5pgg-2g8v-p4x9` — ReDoS (high). Versions: `<0.20.2`. Patched: ninguna en npm.

**Por qué no hay parche:** SheetJS dejó de publicar en npm a fines de 2023. Las versiones parcheadas (`0.20.x` y posteriores) están solo en `cdn.sheetjs.com`. Migrar a esa fuente requiere `package.json` con URL HTTP en `dependencies`, lo que rompe la reproducibilidad del lockfile entre máquinas (pnpm/npm tratan distinto las URL deps).

**Mitigación de superficie en Masoil:**
- `xlsx` se usa exclusivamente para exportar (`XLSX.writeFile`) e importar (`XLSX.readFile`) datos en flujos administrativos:
  - Export XLSX desde `/admin/facturacion`, `/admin/cobranzas`, `/admin/pedidos`, `/admin/facturas-proveedor`, `/admin/logistica`.
  - Scripts de importación desde Excel (`scripts/import-*.ts`), corridos manualmente por developers con archivos del cliente.
- **No se invoca con archivos provenientes de usuarios anónimos** — tanto el dashboard como los scripts requieren autenticación admin o ejecución local.
- Los archivos importados son del propio cliente (sistema legacy GestionPro), no de fuentes hostiles.

**Vector residual:** un admin malicioso podría subir un Excel construido para explotar la vulnerabilidad. El riesgo se evalúa como **bajo** porque el set de admins es pequeño y conocido.

**Backlog para resolver:** reemplazar `xlsx` por `exceljs` en un sprint dedicado (~5 archivos, ~2-4h estimado). Tracking: pendiente.

### `lodash` (transitivo vía `recharts@2.15.4`) — `4.17.21`

**Advisories activos:**
- `GHSA-r5fr-rjxr-66jc` — Code Injection via `_.template` import key names (high). Patched: `>=4.18.0`.
- `GHSA-jchw-25xp-jwwc` — Prototype Pollution via array merge (moderate). Patched: `>=4.18.0`.

**Por qué no hay parche:** `lodash@4.18.0` no existe en el registro npm. La última versión publicada es `4.17.21` (2021). El advisory referencia un fix que nunca se publicó como versión nueva — los maintainers parecen haberlo abandonado. No hay `pnpm.overrides` que pueda satisfacerlo.

**Mitigación:**
- `lodash` es dependencia transitiva de `recharts` (gráficos en `/admin/estadisticas` y dashboards). No se usa directamente desde el código de Masoil.
- Recharts encapsula el uso interno; no expone `_.template` ni `_.merge` con datos provenientes de inputs externos.
- El vector requeriría que un atacante controle nombres de propiedades en datos pasados a recharts, lo cual no ocurre en nuestro flujo (los datos vienen de Supabase con schema controlado).

**Vector residual:** mínimo. Se acepta hasta que `recharts` publique versión que internalice los utils o cambie de dep.

**Backlog para resolver:** monitorear `recharts` releases. Si publican `recharts@3.x` con drop de lodash, evaluar upgrade.

## Historial de mitigaciones

| Fecha | Commit | Cambio |
|---|---|---|
| 2026-05-08 | `a34974f` | Bump `next` 16.0.10 → 16.2.3 (cierra 9 advisories de Next: HTTP req deserialization RSC, DoS Server Components, postponed resume, etc.) |
| 2026-05-08 | `f3f4414` | postcss `^8.5.10` + `pnpm.overrides` para `dompurify@^3.4.0` (cierra postcss XSS y 4 advisories de dompurify) |
| 2026-05-08 | (este doc) | Documentación de riesgos aceptados sin path de fix |

## Versiones críticas pinned

- `next`: pin estricto `16.2.3` para evitar drift no intencional. Bump explícito al revisar advisories.
- `react`/`react-dom`: pin estricto `19.2.0` para mantener parity entre dependencies.
- Dependencias en `pnpm.overrides`: ver `package.json`.
