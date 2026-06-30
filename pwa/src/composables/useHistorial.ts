import { ref, onMounted, onUnmounted } from "vue";
import type { LogInscripcion } from "@echo-alfa-ritz/shared";
import { useSupabase } from "./useSupabase.js";

export interface HistorialEntry extends LogInscripcion {
  /** Email de la cuenta que hizo el log (null para logs legacy pre-multi-cuenta). */
  accountEmail: string | null;
}

export function useHistorial() {
  const sb = useSupabase();
  const logs = ref<HistorialEntry[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);
  let channel: ReturnType<typeof sb.channel> | null = null;

  async function refresh() {
    loading.value = true;
    // Traer los últimos logs y los emails de accounts en una sola query
    // (Supabase hace el join cuando el FK está declarado).
    const { data, error: e } = await sb
      .from("logs_inscripcion")
      .select("*, accounts!logs_inscripcion_account_id_fkey(email)")
      .order("fecha", { ascending: false })
      .limit(100);
    if (e) {
      error.value = e.message;
    } else {
      logs.value = (data ?? []).map((r: Record<string, unknown>) => {
        const acc = r["accounts"] as { email: string } | null;
        return {
          id: r["id"] as string,
          loteId: r["lote_id"] as string,
          numero: r["numero"] as string,
          fecha: r["fecha"] as string,
          resultado: r["resultado"] as "success" | "failed" | "skipped",
          mensaje: r["mensaje"] as string,
          estrategia: r["estrategia"] as string,
          accountId: (r["account_id"] as string) ?? null,
          accountEmail: acc?.email ?? null,
        };
      });
    }
    loading.value = false;
  }

  function subscribe() {
    channel = sb
      .channel("logs_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "logs_inscripcion" },
        () => refresh(),
      )
      .subscribe();
  }

  onMounted(async () => {
    await refresh();
    subscribe();
  });
  onUnmounted(() => {
    if (channel) sb.removeChannel(channel);
  });

  return { logs, loading, error, refresh };
}
