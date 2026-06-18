-- ── Echo-Alfa-Ritz: Supabase Schema ──
-- Aplicar en el SQL Editor de Supabase (Project → SQL → New query).
-- Idempotente: usa CREATE TABLE IF NOT EXISTS.

-- ════════════════════════════════════════════════════════════════════
-- 1. pool_lotes: los ~30 números de lote que el usuario rota
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS pool_lotes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          TEXT NOT NULL,                       -- "AB123456789"
  producto        TEXT NOT NULL,                       -- "Mini Ritz"
  estado          TEXT NOT NULL DEFAULT 'activo'       -- activo | pagado | vencido
                  CHECK (estado IN ('activo', 'pagado', 'vencido')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (numero, producto)
);

CREATE INDEX IF NOT EXISTS idx_pool_lotes_estado ON pool_lotes (estado);

-- ════════════════════════════════════════════════════════════════════
-- 2. configuracion: parámetros editables desde la PWA
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS configuracion (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 TEXT NOT NULL,
  tarea_activada        BOOLEAN NOT NULL DEFAULT false,
  hora_ejecucion        TEXT NOT NULL DEFAULT '00:00',
  fecha_caducidad       DATE NOT NULL DEFAULT '2026-12-31',
  delay_min_segundos    INT NOT NULL DEFAULT 3 CHECK (delay_min_segundos BETWEEN 1 AND 30),
  delay_max_segundos    INT NOT NULL DEFAULT 7 CHECK (delay_max_segundos BETWEEN 1 AND 60),
  producto_default      TEXT NOT NULL DEFAULT 'Mini Ritz',
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Una sola fila activa (singleton pattern via constraint)
  CONSTRAINT configuracion_singleton CHECK (id IS NOT NULL)
);

-- Sembrar fila inicial si la tabla está vacía
INSERT INTO configuracion (email, tarea_activada, producto_default)
SELECT '', false, 'Mini Ritz'
WHERE NOT EXISTS (SELECT 1 FROM configuracion);

-- ════════════════════════════════════════════════════════════════════
-- 3. logs_inscripcion: histórico de cargas (cada intento del agente)
-- ════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS logs_inscripcion (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lote_id       UUID REFERENCES pool_lotes(id) ON DELETE SET NULL,
  numero        TEXT NOT NULL,
  fecha         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resultado     TEXT NOT NULL CHECK (resultado IN ('success', 'failed', 'skipped')),
  mensaje       TEXT NOT NULL DEFAULT '',
  estrategia    TEXT NOT NULL DEFAULT 'http'
);

CREATE INDEX IF NOT EXISTS idx_logs_fecha ON logs_inscripcion (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_logs_lote  ON logs_inscripcion (lote_id);

-- ════════════════════════════════════════════════════════════════════
-- 4. Realtime: habilitar publicación para las tablas que la PWA escucha
-- ════════════════════════════════════════════════════════════════════
-- Supabase Realtime requiere que la tabla esté en la publicación `supabase_realtime`.
ALTER PUBLICATION supabase_realtime ADD TABLE pool_lotes;
ALTER PUBLICATION supabase_realtime ADD TABLE configuracion;
ALTER PUBLICATION supabase_realtime ADD TABLE logs_inscripcion;

-- ════════════════════════════════════════════════════════════════════
-- 5. RLS (Row Level Security): políticas permisivas para la PWA
-- ════════════════════════════════════════════════════════════════════
-- La PWA es single-user; habilitamos RLS pero dejamos políticas abiertas.
ALTER TABLE pool_lotes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion    ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs_inscripcion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso público pool_lotes"       ON pool_lotes
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso público configuracion"    ON configuracion
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acceso público logs_inscripcion" ON logs_inscripcion
  FOR ALL USING (true) WITH CHECK (true);