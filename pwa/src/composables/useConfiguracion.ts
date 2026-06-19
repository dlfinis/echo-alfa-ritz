import { ref, onMounted, onUnmounted } from "vue";
import type { ConfiguracionSistema } from "@echo-alfa-ritz/shared";
import { useSupabase } from "./useSupabase.js";

export interface ConfigRow {
  id: string;
  email: string;
  tarea_activada: boolean;
  hora_ejecucion: string;
  fecha_caducidad: string;
  delay_min_segundos: number;
  delay_max_segundos: number;
  updated_at: string;
}

export function useConfiguracion() {
  const sb = useSupabase();
  const config = ref<ConfiguracionSistema | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);
  let channel: ReturnType<typeof sb.channel> | null = null;

  function fromRow(row: ConfigRow): ConfiguracionSistema {
    return {
      id: row.id,
      email: row.email,
      tareaActivada: row.tarea_activada,
      horaEjecucion: row.hora_ejecucion,
      fechaCaducidad: row.fecha_caducidad,
      delayMinSegundos: row.delay_min_segundos,
      delayMaxSegundos: row.delay_max_segundos,
    };
  }

  async function refresh() {
    loading.value = true;
    const { data, error: e } = await sb
      .from("configuracion")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (e) {
      error.value = e.message;
    } else if (data) {
      config.value = fromRow(data as ConfigRow);
      error.value = null;
    }
    loading.value = false;
  }

  async function update(patch: Partial<ConfiguracionSistema>) {
    if (!config.value?.id) throw new Error("Sin id de configuración");
    const update: Partial<ConfigRow> = { updated_at: new Date().toISOString() };
    if (patch.email !== undefined) update.email = patch.email;
    if (patch.tareaActivada !== undefined) update.tarea_activada = patch.tareaActivada;
    if (patch.horaEjecucion !== undefined) update.hora_ejecucion = patch.horaEjecucion;
    if (patch.fechaCaducidad !== undefined) update.fecha_caducidad = patch.fechaCaducidad;
    if (patch.delayMinSegundos !== undefined) update.delay_min_segundos = patch.delayMinSegundos;
    if (patch.delayMaxSegundos !== undefined) update.delay_max_segundos = patch.delayMaxSegundos;

    const { error: e } = await sb
      .from("configuracion")
      .update(update)
      .eq("id", config.value.id);
    if (e) throw e;
    await refresh();
  }

  function subscribe() {
    channel = sb
      .channel("configuracion_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "configuracion" },
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

  return { config, loading, error, refresh, update };
}