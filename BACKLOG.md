# Backlog técnico

Items conocidos que no entran en sprints actuales pero deben resolverse.
No es exhaustivo — solo cosas detectadas durante sprints recientes.

## Forms y schema

### Dialog de editar proveedor en `/admin/proveedores/[id]`
**Origen:** sprint AFIP sync (mayo 2026).

Hoy la ficha de proveedor solo permite editar `observaciones_pagos`. Los datos
principales (`nombre`, `razon_social`, `cuit`, `condicion_iva`, `domicilio`,
`localidad`, `provincia`, `cp`, `email_comercial`, `condicion_pago`, etc.) no
se pueden modificar desde la UI — sólo desde Supabase Studio o re-creando.

**A hacer:**
- Crear un dialog "Editar proveedor" con los campos principales.
- Integrar el componente `<BotonSincAfip />` al lado del input CUIT, mismo
  patrón que `clientes/[id]`.
- Decidir si el dialog reemplaza la card readonly o convive.

**Workaround actual:** botón "Sincronizar AFIP" solo está en `proveedores/nuevo`.

### Campos faltantes en form de `/admin/proveedores/nuevo`
**Origen:** sprint AFIP sync (mayo 2026).

El form solo captura `nombre`, `cuit`, `condicion_pago`, `cbu`,
`email_comercial`, `email_pagos`, `contactos`, `observaciones`. La columna
`proveedores.condicion_iva` existe en DB y se ve en la ficha, pero no se
puede cargar al crear.

**A hacer:**
- Agregar al form: `condicion_iva` (Select), `domicilio` (texto), `localidad`,
  `provincia`, `cp`.
- Una vez agregados, extender el caller del `<BotonSincAfip />` en
  `proveedores/nuevo` para aplicar también esos campos (hoy solo aplica
  `razon_social → nombre`).
- Considerar también: `razon_social` como campo separado de `nombre`
  (la DB tiene ambas columnas).

**Workaround actual:** los datos se cargan editando manualmente la fila en
Supabase después de crear.

### Mismatch strings de `condicion_iva` entre forms y DB
**Origen:** sprint AFIP sync (mayo 2026).

- DB usa: `"RESP. INSCRIPTO"`, `"MONOTRIBUTISTA"`, `"EXENTO"`,
  `"CONSUMIDOR FINAL"`, `"NO CATEGORIZADO"`, `"NO RESPONSABLE"`,
  `"MONOTRIBUTISTA SOCIAL"`, `"PEQUEÑO CONTR. EVENTUAL"`, `"BIENES DE USO"`.
- Forms (`<Select>` de `clientes/nuevo` línea 205-209 y `clientes/[id]` dialog
  línea 688-692) usan TitleCase: `"Responsable Inscripto"`, `"Monotributo"`,
  `"Exento"`, `"Consumidor Final"`, `"No Responsable"`.

Cuando se carga un cliente con `condicion_iva = "RESP. INSCRIPTO"`, el
`<select>` no encuentra esa opción y muestra vacío.

**A hacer:**
- Decidir el formato canónico (recomendación: el de DB, ya tiene 2.6k filas).
- Migrar las opciones de los `<Select>` para que coincidan con los strings
  reales de DB.
- Eliminar el helper `mapCondicionIvaToSelectOption()` en `lib/afip-sync.ts`
  (queda inocuo pero deja de tener uso).
- Hacer un `UPDATE` masivo de variantes del mismo concepto si aparecen
  (`"Monotributo"` vs `"MONOTRIBUTISTA"` vs `"Monotributista"`).

**Workaround actual:** `mapCondicionIvaToSelectOption()` traduce DB → Select
on-the-fly. Funciona pero los datos guardados quedan en formatos inconsistentes.

## Otros (sin urgencia inmediata)

### `xlsx` sin parche en npm
Ver `SECURITY.md` — riesgo aceptado, backlog para reemplazar por `exceljs`.

### `lodash` via `recharts` sin path de fix
Ver `SECURITY.md` — riesgo aceptado, esperar a que `recharts` actualice.
