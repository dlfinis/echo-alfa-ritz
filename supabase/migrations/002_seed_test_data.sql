-- ── Echo-Alfa-Ritz: Datos de prueba ──
-- 5 lotes de muestra + email de configuración inicial.
-- Aplicar después de 001_initial_schema.sql.
-- Idempotente: usa INSERT ... ON CONFLICT DO NOTHING.

-- ════════════════════════════════════════════════════════════════════
-- 1. Sembrar 5 lotes de prueba (formato válido: 2 letras + 9 dígitos)
-- ════════════════════════════════════════════════════════════════════
INSERT INTO pool_lotes (numero, producto, estado) VALUES
  ('AB123456789', 'Mini Ritz',       'activo'),
  ('CD987654321', 'Ritz 120g',       'activo'),
  ('EF456789123', 'Ritz queso 75g',  'activo'),
  ('GH789123456', 'Ritz Jalapeño 75gr', 'activo'),
  ('IJ321654987', 'Ritz 52.5g',      'pagado')     -- uno pagado para probar el filtro
ON CONFLICT (numero, producto) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════
-- 2. Configurar email inicial (placeholder — completar en la PWA)
-- ════════════════════════════════════════════════════════════════════
UPDATE configuracion
SET email = 'demo@promoritz.local'   -- ⚠️  Reemplazar en la PWA
WHERE id = (SELECT id FROM configuracion LIMIT 1);

-- ════════════════════════════════════════════════════════════════════
-- 3. Logs de ejemplo (opcional — para verificar vista Historial)
-- ════════════════════════════════════════════════════════════════════
INSERT INTO logs_inscripcion (numero, resultado, mensaje, estrategia)
SELECT
  'AB' || lpad((random() * 999999999)::int::text, 9, '0'),
  (ARRAY['success', 'failed', 'skipped'])[1 + floor(random() * 3)],
  (ARRAY[
    'Inyectado (id: demo)',
    'Validación rechazada (400): formato inválido',
    'Límite diario alcanzado (12)',
    'Login exitoso en /api/users/login',
    'Sin sesión activa y login falló'
  ])[1 + floor(random() * 5)],
  'http'
FROM generate_series(1, 10)
WHERE NOT EXISTS (SELECT 1 FROM logs_inscripcion LIMIT 1);