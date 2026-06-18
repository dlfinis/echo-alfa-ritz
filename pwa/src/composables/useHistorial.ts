import { ref, onMounted, onUnmounted } from "vue";
import type { LogInscripcion } from "@echo-alfa-ritz/shared";
import { useSupabase } from "./useSupabase.js";

export function useHistorial() {
  const sb = useSupabase();
  const logs = ref<LogInscripcion[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);
  let channel: ReturnType<typeof sb.channel> | null = null;

  async function refresh() {
    loading.value = true;
    const { data, error: e } = await sb
      .from("logs_inscripcion")
      .select("*")
      .order("fecha", { ascending: false })
      .limit(100);
    if (e) {
      error.value = e.message;
    } else {
      logs.value = (data ?? []).map((r) => ({
        id: r.id,
        loteId: r.lote_id,
        numero: r.numero,
        fecha: r.fecha,
        resultado: r.resultado,
        mensaje: r.mensaje,
        estrategia: r.estrategia,
      }));
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