// scripts/verify-schema.ts
// Ejecuta: pnpm exec tsx scripts/verify-schema.ts
// Verifica que las 3 tablas existen en Supabase.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, "../../.env.local") });

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.VITE_SUPABASE_ANON_KEY!;

if (!url || !key) {
  console.error("❌ Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const TABLAS = ["pool_lotes", "configuracion", "logs_inscripcion"] as const;

async function main() {
  console.log(`📡 Conectando a ${url.replace(/.+@/, "***@")}\n`);

  let ok = 0;
  for (const tabla of TABLAS) {
    const { data, error, count } = await sb
      .from(tabla)
      .select("*", { count: "exact", head: true });

    if (error) {
      console.log(`❌ ${tabla.padEnd(20)} → ${error.message}`);
    } else {
      console.log(`✅ ${tabla.padEnd(20)} → ${count ?? 0} filas`);
      ok++;
    }
  }

  console.log(`\n${ok}/${TABLAS.length} tablas presentes.`);

  if (ok === TABLAS.length) {
    console.log("\n🎉 Schema aplicado correctamente. La PWA puede hablar con Supabase.");
  } else {
    console.log(
      "\n⚠️  Schema incompleto. Aplicá supabase/migrations/001_initial_schema.sql en el SQL Editor.",
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("💥 Error:", e);
  process.exit(1);
});