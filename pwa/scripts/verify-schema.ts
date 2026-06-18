// pwa/scripts/verify-schema.ts
// Ejecuta: pnpm verify-schema
// Lista tablas en Supabase + cuenta filas + muestra primeros registros.

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, "../../.env.local") });

const url = process.env.VITE_SUPABASE_URL!;
const key =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  // Fallback para configs con el nombre viejo
  process.env.VITE_SUPABASE_ANON_KEY!;

if (!url || !key) {
  console.error(
    "❌ Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY en .env.local",
  );
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const TABLAS = [
  { name: "pool_lotes", order: "numero", limit: 10 },
  { name: "configuracion", order: "updated_at", limit: 5 },
  { name: "logs_inscripcion", order: "fecha", desc: true, limit: 10 },
] as const;

async function main() {
  console.log(
    `📡 Conectando a ${url.replace(/(.+?)\.supabase\.co/, "***.supabase.co")}\n`,
  );

  let allOk = true;

  for (const { name, order, desc, limit } of TABLAS) {
    const { data, error, count } = await sb
      .from(name)
      .select("*", { count: "exact" })
      .order(order, { ascending: !desc })
      .limit(limit);

    if (error) {
      console.log(`❌ ${name.padEnd(20)} → ${error.message}`);
      allOk = false;
      continue;
    }

    console.log(`✅ ${name.padEnd(20)} → ${count ?? 0} filas totales`);
    for (const row of data ?? []) {
      const preview = previewRow(row);
      console.log(`     • ${preview}`);
    }
    console.log();
  }

  if (allOk) {
    console.log("🎉 Schema aplicado y accesible. La PWA puede leer/escribir.");
  } else {
    console.log(
      "⚠️  Schema incompleto. Aplicá supabase/migrations/*.sql en Supabase.",
    );
    process.exit(1);
  }
}

function previewRow(row: Record<string, unknown>): string {
  const keys = Object.keys(row).slice(0, 4);
  return keys
    .map((k) => {
      const v = row[k];
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return `${k}=${s?.toString().slice(0, 30)}`;
    })
    .join(", ");
}

main().catch((e) => {
  console.error("💥 Error:", e);
  process.exit(1);
});