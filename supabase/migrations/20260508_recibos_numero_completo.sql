-- ============================================================
-- Migration: recibos_cobranza.numero_completo + correlativo por empresa
-- Fecha: 2026-05-08
-- ============================================================
-- Cambia el modelo de numeración:
--   - "numero" deja de ser correlativo global y pasa a correlativo POR
--     EMPRESA (Aquiles tiene su 1..N, Conancap tiene su 1..M, etc).
--   - "numero_completo" guarda la presentación con prefijo: AQ-0001,
--     CO-0001, etc. Para recibos legacy con empresa=NULL queda "REC-0001".
--   - UNIQUE(empresa, numero) previene colisiones futuras. NULLs no
--     colisionan en PostgreSQL UNIQUE.
--
-- Recibos legacy de la tabla `recibos` (820 de GestionPro) NO se tocan —
-- esa tabla tiene su propio `nro_comprobante` con formato del sistema viejo.

ALTER TABLE recibos_cobranza
  ADD COLUMN IF NOT EXISTS numero_completo TEXT;

UPDATE recibos_cobranza
  SET numero_completo = 'REC-' || LPAD(numero::text, 4, '0')
  WHERE numero_completo IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_recibos_cobranza_empresa_numero
  ON recibos_cobranza(empresa, numero);
