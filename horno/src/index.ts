import { createClient } from "@supabase/supabase-js";
import { RotacionCiclicaRule } from "@echo-alfa-ritz/shared";
import { DirectInjector } from "./directInjector.js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "[horno] Faltan SUPABASE_URL o SUPABASE_ANON_KEY en las variables de entorno",
  );
  console.error("  Creá un archivo horno/.env con esos valores.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const rule = new RotacionCiclicaRule();

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function run(): Promise<void> {
  console.log("[horno] iniciando horneado batch…");

  const [{ data: lotes }, { data: accounts }] = await Promise.all([
    supabase.from("pool_lotes").select("*").eq("estado", "activo"),
    supabase.from("accounts").select("*"),
  ]);

  if (!lotes?.length) {
    console.log("[horno] sin lotes activos, abortando");
    return;
  }
  if (!accounts?.length) {
    console.log("[horno] sin cuentas configuradas, abortando");
    return;
  }

  const cola = rule
    .calcularCola(
      lotes.map((l) => ({
        id: l.id,
        numero: l.numero,
        estado: l.estado,
        producto: l.producto,
      })),
    )
    .slice(0, 12);

  console.log(
    `[horno] ${accounts.length} cuentas, ${cola.length} lotes por cuenta`,
  );

  for (const acc of accounts) {
    console.log(`[horno] cuenta: ${acc.email}`);
    const injector = new DirectInjector({ email: acc.email });
    const logged = await injector.login();
    if (!logged) {
      console.error(
        `[horno] login falló para ${acc.email}, saltando a la siguiente`,
      );
      continue;
    }

    for (const item of cola) {
      const result = await injector.inyectar(item.lote);
      console.log(`  ${result.numero} → ${result.status}${result.mensaje ? ` — ${result.mensaje}` : ""}`);

      const { error } = await supabase.from("logs_inscripcion").insert({
        id: crypto.randomUUID(),
        lote_id: item.lote.id,
        numero: item.lote.numero,
        fecha: new Date().toISOString(),
        resultado: result.status,
        mensaje: result.mensaje ?? "",
        estrategia: "http",
        account_id: acc.id,
      });
      if (error) {
        console.error("[horno] error al insertar log:", error.message);
      }

      // Delay anti-bot: entre 3 y 7 segundos
      await sleep(3000 + Math.random() * 4000);
    }
  }

  console.log("[horno] horneado completado");
}

run().catch((err) => {
  console.error("[horno] error fatal:", err);
  process.exit(1);
});
