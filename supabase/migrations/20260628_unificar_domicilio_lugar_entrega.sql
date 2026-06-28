-- Unificar domicilio fiscal y lugar de entrega a columnas únicas.
-- Fuente única: clients.domicilio (fiscal) y clients.lugar_entrega (entrega).
-- Rellena la columna nueva SOLO donde está vacía, tomando el dato de las viejas.
-- NO borra las columnas viejas (address, domicilio_entrega, sucursal, sucursal_entrega).
-- Idempotente: re-ejecutar es no-op (los WHERE excluyen las ya rellenas).
--
-- APLICA FREDI. Correr primero las VERIFICACIONES PREVIAS, luego los UPDATE,
-- luego las VERIFICACIONES POSTERIORES.

-- ============ VERIFICACIÓN PREVIA (no modifica nada) ============
-- Cuántas filas rellenaría cada UPDATE:
SELECT count(*) AS domicilio_a_rellenar
FROM clients
WHERE (domicilio IS NULL OR domicilio = '')
  AND address IS NOT NULL AND address <> '';

SELECT count(*) AS lugar_entrega_a_rellenar
FROM clients
WHERE (lugar_entrega IS NULL OR lugar_entrega = '')
  AND COALESCE(NULLIF(domicilio_entrega, ''), NULLIF(sucursal_entrega, '')) IS NOT NULL;

-- Estado actual de cobertura:
SELECT
  count(*) FILTER (WHERE domicilio IS NOT NULL AND domicilio <> '')           AS con_domicilio,
  count(*) FILTER (WHERE lugar_entrega IS NOT NULL AND lugar_entrega <> '')    AS con_lugar_entrega,
  count(*)                                                                     AS total
FROM clients;

-- ============ MIGRACIÓN ============
-- Domicilio fiscal: solo donde domicilio está vacío y address tiene dato.
UPDATE clients
SET domicilio = address
WHERE (domicilio IS NULL OR domicilio = '')
  AND address IS NOT NULL AND address <> '';

-- Lugar de entrega: solo donde lugar_entrega está vacío; toma domicilio_entrega
-- o, en su defecto, sucursal_entrega.
UPDATE clients
SET lugar_entrega = COALESCE(NULLIF(domicilio_entrega, ''), NULLIF(sucursal_entrega, ''))
WHERE (lugar_entrega IS NULL OR lugar_entrega = '')
  AND COALESCE(NULLIF(domicilio_entrega, ''), NULLIF(sucursal_entrega, '')) IS NOT NULL;

-- ============ VERIFICACIÓN POSTERIOR ============
-- Cobertura final (con_domicilio y con_lugar_entrega deberían haber subido):
SELECT
  count(*) FILTER (WHERE domicilio IS NOT NULL AND domicilio <> '')           AS con_domicilio,
  count(*) FILTER (WHERE lugar_entrega IS NOT NULL AND lugar_entrega <> '')    AS con_lugar_entrega,
  count(*)                                                                     AS total
FROM clients;

-- Sanidad: no debería quedar ninguna fila con la vieja llena y la nueva vacía.
SELECT count(*) AS domicilio_pendiente
FROM clients
WHERE (domicilio IS NULL OR domicilio = '')
  AND address IS NOT NULL AND address <> '';

SELECT count(*) AS lugar_entrega_pendiente
FROM clients
WHERE (lugar_entrega IS NULL OR lugar_entrega = '')
  AND COALESCE(NULLIF(domicilio_entrega, ''), NULLIF(sucursal_entrega, '')) IS NOT NULL;
