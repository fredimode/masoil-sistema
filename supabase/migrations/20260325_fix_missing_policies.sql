-- ============================================================
-- Fix: Recrear policies de lectura perdidas por CASCADE del enum
-- El DROP TYPE user_role_old CASCADE eliminó policies que
-- dependían del enum viejo y solo se recrearon las de admin.
-- ============================================================

-- Clients: vendedores pueden leer sus propios clientes, admin ya tiene full access
CREATE POLICY "vendedor_read_own_clients" ON clients
  FOR SELECT TO authenticated
  USING (
    vendedor_id = (SELECT id FROM vendedores WHERE auth_user_id = auth.uid())
    OR get_current_user_role() = 'admin'
  );

-- Products: todos los autenticados pueden leer
CREATE POLICY "auth_read_products" ON products
  FOR SELECT TO authenticated
  USING (true);

-- Vendedores: todos los autenticados pueden leer (necesario para listados)
CREATE POLICY "auth_read_vendedores" ON vendedores
  FOR SELECT TO authenticated
  USING (true);

-- Orders: vendedores pueden leer sus propios pedidos
CREATE POLICY "vendedor_read_own_orders" ON orders
  FOR SELECT TO authenticated
  USING (
    vendedor_id = (SELECT id FROM vendedores WHERE auth_user_id = auth.uid())
    OR get_current_user_role() = 'admin'
  );

-- Orders: vendedores pueden crear pedidos
CREATE POLICY "vendedor_insert_orders" ON orders
  FOR INSERT TO authenticated
  WITH CHECK (
    get_current_user_role() IN ('admin', 'vendedor')
  );

-- Orders: admin y vendedores pueden actualizar sus pedidos
CREATE POLICY "auth_update_orders" ON orders
  FOR UPDATE TO authenticated
  USING (
    vendedor_id = (SELECT id FROM vendedores WHERE auth_user_id = auth.uid())
    OR get_current_user_role() = 'admin'
  )
  WITH CHECK (
    vendedor_id = (SELECT id FROM vendedores WHERE auth_user_id = auth.uid())
    OR get_current_user_role() = 'admin'
  );

-- NOTA: order_items y order_status_history ya tienen policy FOR ALL
-- via "access_via_order" y "access_via_order_history" (migración 20260324)
