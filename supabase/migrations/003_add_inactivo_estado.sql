-- ── Echo-Alfa-Ritz: Agregar estado 'inactivo' al pool de lotes ──
-- La PWA ahora usa checkbox (activo/inactivo) en lugar del dropdown de 3 estados.
-- El CHECK constraint existente solo permite ('activo', 'pagado', 'vencido').

ALTER TABLE pool_lotes DROP CONSTRAINT IF EXISTS pool_lotes_estado_check;
ALTER TABLE pool_lotes ADD CONSTRAINT pool_lotes_estado_check
  CHECK (estado IN ('activo', 'pagado', 'vencido', 'inactivo'));

-- Actualizar los lotes de prueba: el pagado ahora podría ser inactivo
UPDATE pool_lotes SET estado = 'inactivo' WHERE estado = 'pagado' AND numero = 'IJ321654987';
