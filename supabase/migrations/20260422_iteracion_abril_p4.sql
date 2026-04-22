-- =============================================================================
-- Migration: iteración abril 2026 parte 4
-- Fecha: 2026-04-22
-- Features: movimiento mercadería, logística (repartos), nuevo estado BORRADOR
-- =============================================================================

-- 1) Nuevo estado BORRADOR en enum order_status
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'BORRADOR';

-- 2) MOVIMIENTOS DE MERCADERÍA
CREATE TABLE IF NOT EXISTS movimientos_mercaderia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE DEFAULT CURRENT_DATE,
  tipo TEXT NOT NULL,
  product_id UUID REFERENCES products(id),
  producto_nombre TEXT,
  producto_codigo TEXT,
  cantidad INTEGER NOT NULL,
  mueve_stock BOOLEAN DEFAULT true,
  order_id TEXT REFERENCES orders(id),
  client_id UUID REFERENCES clients(id),
  cliente_nombre TEXT,
  motivo TEXT,
  usuario_id UUID REFERENCES vendedores(id),
  usuario_nombre TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mov_merc_fecha ON movimientos_mercaderia(fecha);
CREATE INDEX IF NOT EXISTS idx_mov_merc_product ON movimientos_mercaderia(product_id);
ALTER TABLE movimientos_mercaderia ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'mov_merc_auth_all') THEN
    CREATE POLICY "mov_merc_auth_all" ON movimientos_mercaderia FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- 3) REPARTOS
CREATE TABLE IF NOT EXISTS repartos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_reparto TEXT NOT NULL UNIQUE,
  fecha DATE NOT NULL,
  estado TEXT DEFAULT 'pendiente',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repartos_fecha ON repartos(fecha);
ALTER TABLE repartos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'repartos_auth_all') THEN
    CREATE POLICY "repartos_auth_all" ON repartos FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- 4) REPARTO_ITEMS
CREATE TABLE IF NOT EXISTS reparto_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reparto_id UUID REFERENCES repartos(id) ON DELETE CASCADE,
  orden_reparto INTEGER,
  order_id TEXT REFERENCES orders(id),
  factura_numero TEXT,
  client_name TEXT,
  zona TEXT,
  repartidor TEXT,
  sucursal_entrega TEXT,
  estado_entrega TEXT DEFAULT 'pendiente',
  es_destino_extra BOOLEAN DEFAULT false,
  descripcion_extra TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rep_items_reparto ON reparto_items(reparto_id);
CREATE INDEX IF NOT EXISTS idx_rep_items_order ON reparto_items(order_id);
ALTER TABLE reparto_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'reparto_items_auth_all') THEN
    CREATE POLICY "reparto_items_auth_all" ON reparto_items FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- 5) Orders: vínculo con reparto
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reparto_id UUID REFERENCES repartos(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS numero_reparto TEXT;

-- 6) IVA A PAGAR histórico (resumen consolidado por período)
CREATE TABLE IF NOT EXISTS iva_a_pagar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  razon_social TEXT,
  periodo_desde DATE,
  periodo_hasta DATE,
  concepto TEXT NOT NULL,
  debitos NUMERIC(14,2) DEFAULT 0,
  creditos NUMERIC(14,2) DEFAULT 0,
  origen TEXT DEFAULT 'GestionPro',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE iva_a_pagar ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'iva_pagar_auth_all') THEN
    CREATE POLICY "iva_pagar_auth_all" ON iva_a_pagar FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- 7) Pagos en Proceso simple (isla de datos)
CREATE TABLE IF NOT EXISTS pagos_en_proceso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor TEXT,
  empresa TEXT,
  forma_pago TEXT,
  fecha_pago DATE,
  observaciones TEXT,
  estado TEXT DEFAULT 'Pendiente',
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE pagos_en_proceso ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pagos_en_proceso_auth_all') THEN
    CREATE POLICY "pagos_en_proceso_auth_all" ON pagos_en_proceso FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;
