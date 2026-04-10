-- =============================================
-- FIX: Reemplazar todas las policies que usan get_current_user_role()
-- con policies simples para authenticated
-- Fecha: 2026-04-10
-- Motivo: get_current_user_role() falla silenciosamente y bloquea
--         UPDATE/DELETE/INSERT en tablas core
-- =============================================

-- VENDEDORES
DROP POLICY IF EXISTS "admin_full_access_vendedores" ON vendedores;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='vendedores' AND policyname='vendedores_authenticated_all') THEN
    CREATE POLICY "vendedores_authenticated_all" ON vendedores
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- CLIENTS
DROP POLICY IF EXISTS "admin_full_access_clients" ON clients;
DROP POLICY IF EXISTS "vendedor_read_own_clients" ON clients;
DROP POLICY IF EXISTS "vendedor_insert_clients" ON clients;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clients' AND policyname='clients_authenticated_all') THEN
    CREATE POLICY "clients_authenticated_all" ON clients
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ORDERS
DROP POLICY IF EXISTS "admin_full_access_orders" ON orders;
DROP POLICY IF EXISTS "vendedor_read_own_orders" ON orders;
DROP POLICY IF EXISTS "vendedor_insert_orders" ON orders;
DROP POLICY IF EXISTS "vendedor_update_own_orders" ON orders;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='orders' AND policyname='orders_authenticated_all') THEN
    CREATE POLICY "orders_authenticated_all" ON orders
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- PRODUCTS
DROP POLICY IF EXISTS "admin_write_products" ON products;
DROP POLICY IF EXISTS "admin_delete_products" ON products;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='products' AND policyname='products_authenticated_all') THEN
    CREATE POLICY "products_authenticated_all" ON products
      FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
