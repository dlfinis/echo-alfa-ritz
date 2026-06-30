-- ── Echo-Alfa-Ritz: Multi-account support ──
-- Aplica cambios para soportar múltiples cuentas de email:
--   - Tabla accounts (CRUD de cuentas)
--   - active_account_id en configuracion (cuenta activa actual)
--   - account_id en logs_inscripcion (saber qué cuenta hizo cada log)
--   - Migrar logs legacy a la cuenta activa actual

-- ════════════════════════════════════════════════════════════════════
-- 1. accounts: lista de cuentas de email configuradas
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════════════
-- 2. configuracion: agregar active_account_id
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE configuracion
  ADD COLUMN IF NOT EXISTS active_account_id UUID REFERENCES accounts(id);

-- ════════════════════════════════════════════════════════════════════
-- 3. Sembrar: la cuenta actual desde configuracion
-- ════════════════════════════════════════════════════════════════════
INSERT INTO accounts (email)
SELECT email FROM configuracion WHERE email <> ''
ON CONFLICT (email) DO NOTHING;

UPDATE configuracion
SET active_account_id = (SELECT id FROM accounts WHERE accounts.email = configuracion.email)
WHERE email <> '' AND active_account_id IS NULL;

-- ════════════════════════════════════════════════════════════════════
-- 4. logs_inscripcion: agregar account_id
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE logs_inscripcion
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);

CREATE INDEX IF NOT EXISTS idx_logs_account ON logs_inscripcion (account_id);

-- ════════════════════════════════════════════════════════════════════
-- 5. Asignar logs legacy a la cuenta activa actual
-- ════════════════════════════════════════════════════════════════════
UPDATE logs_inscripcion
SET account_id = (SELECT active_account_id FROM configuracion LIMIT 1)
WHERE account_id IS NULL;

-- ════════════════════════════════════════════════════════════════════
-- 6. Realtime: suscripción a accounts
-- ════════════════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE accounts;

-- ════════════════════════════════════════════════════════════════════
-- 7. RLS
-- ════════════════════════════════════════════════════════════════════
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso público accounts" ON accounts;
CREATE POLICY "Acceso público accounts" ON accounts
  FOR ALL USING (true) WITH CHECK (true);
