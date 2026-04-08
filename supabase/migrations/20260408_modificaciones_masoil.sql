-- =============================================
-- MIGRACIÓN: Modificaciones Masoil Abril 2026
-- =============================================

-- === COBRANZAS: Contactos de cobranzas en clientes ===
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cobranzas_mail TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cobranzas_telefono TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cobranzas_contacto TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS cobranzas_observaciones TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_proveedores BOOLEAN DEFAULT false;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS portal_proveedores_url TEXT;

-- === FACTURAS PROVEEDOR: Nuevos impuestos y Nota de Débito ===
ALTER TABLE facturas_proveedor ADD COLUMN IF NOT EXISTS iva_105 NUMERIC(14,2) DEFAULT 0;
ALTER TABLE facturas_proveedor ADD COLUMN IF NOT EXISTS iva_27 NUMERIC(14,2) DEFAULT 0;
ALTER TABLE facturas_proveedor ADD COLUMN IF NOT EXISTS impuestos_internos NUMERIC(14,2) DEFAULT 0;
ALTER TABLE facturas_proveedor ADD COLUMN IF NOT EXISTS exentos_no_gravados NUMERIC(14,2) DEFAULT 0;
ALTER TABLE facturas_proveedor ADD COLUMN IF NOT EXISTS jurisdiccion_iibb TEXT;

-- === PAGOS PROVEEDORES: Orden de pago ===
ALTER TABLE pagos_proveedores ADD COLUMN IF NOT EXISTS orden_pago_numero TEXT;
ALTER TABLE pagos_proveedores ADD COLUMN IF NOT EXISTS orden_pago_url TEXT;

-- === PROVEEDORES: Observaciones de pagos ===
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS observaciones_pagos TEXT;

-- === PEDIDOS: Razón social y pedido incompleto ===
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razon_social TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS es_incompleto BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS observaciones_incompleto TEXT;
