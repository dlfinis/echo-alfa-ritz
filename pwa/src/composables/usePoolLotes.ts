import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import type { Lote } from "@echo-alfa-ritz/shared";
import {
  LOTE_ESTADO,
  esProductoValido,
  esFormatoLoteValido,
} from "@echo-alfa-ritz/shared";
import { useSupabase } from "./useSupabase.js";
import { useConfiguracion } from "./useConfiguracion.js";

export interface LoteRow {
  id: string;
  numero: string;
  producto: string;
  estado: "activo" | "pagado" | "vencido" | "inactivo";
  created_at: string;
  updated_at: string;
  account_id?: string | null;
}

/**
 * Composable: pool de lotes desde Supabase con suscripción Realtime.
 */
export function usePoolLotes() {
  const sb = useSupabase();
  const lotes = ref<LoteRow[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  const lotesActivos = computed(() =>
    lotes.value.filter((l) => l.estado === LOTE_ESTADO.ACTIVO),
  );

  async function refresh() {
    loading.value = true;
    const { data, error: e } = await sb
      .from("pool_lotes")
      .select("*")
      .order("numero");
    if (e) {
      error.value = e.message;
    } else {
      lotes.value = data ?? [];
      error.value = null;
    }
    loading.value = false;
  }

  let channel: ReturnType<typeof sb.channel> | null = null;
  function subscribe() {
    channel = sb
      .channel("pool_lotes_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pool_lotes" },
        () => refresh(),
      )
      .subscribe();
  }
  function unsubscribe() {
    if (channel) sb.removeChannel(channel);
    channel = null;
  }

  onMounted(async () => {
    await refresh();
    subscribe();
    // Cargar contadores iniciales. loadBatchCounts usa config.activeAccountId
    // que puede llegar DESPUÉS de onMounted (carga async de Supabase). El
    // watch de abajo se encarga de actualizar cuando config cargue.
    await loadBatchCounts();
  });
  onUnmounted(unsubscribe);

  // Reaccionar a cambios en la cuenta activa para actualizar contadores.
  // Sin esto, si config todavía no cargó en onMounted, hoyCount queda en 0
  // para siempre hasta que el usuario ejecute alguna acción manual.
  const { config: _cfg } = useConfiguracion();
  watch(
    () => _cfg.value?.activeAccountId,
    async () => {
      await loadBatchCounts();
    },
  );

  async function addLote(numero: string, producto: string) {
    const { error: e } = await sb
      .from("pool_lotes")
      .insert({ numero, producto, estado: "activo" });
    if (e) throw e;
    await refresh();
  }

  async function toggleEstado(id: string, estado: "activo" | "pagado" | "vencido") {
    const { error: e } = await sb
      .from("pool_lotes")
      .update({ estado, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (e) throw e;
    await refresh();
  }

  async function toggleActivo(id: string, activo: boolean) {
    const estado = activo ? "activo" : "inactivo";
    // Optimista: actualizar local primero (sin flick)
    const idx = lotes.value.findIndex((l) => l.id === id);
    if (idx >= 0) lotes.value[idx] = { ...lotes.value[idx], estado };
    const { error: e } = await sb
      .from("pool_lotes")
      .update({ estado, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (e) {
      // Revertir si falla
      if (idx >= 0) lotes.value[idx] = { ...lotes.value[idx], estado: activo ? "inactivo" : "activo" };
      throw e;
    }
  }

  async function removeLote(id: string) {
    const { error: e } = await sb.from("pool_lotes").delete().eq("id", id);
    if (e) throw e;
    await refresh();
  }

  async function editProducto(id: string, producto: string) {
    if (!esProductoValido(producto)) {
      throw new Error(`Producto inválido: "${producto}"`);
    }
    const { error: e } = await sb
      .from("pool_lotes")
      .update({ producto, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (e) throw e;
    await refresh();
  }

  // ── Operaciones batch ──

  async function updateLote(id: string, data: { producto?: string; estado?: string }) {
    if (data.producto && !esProductoValido(data.producto)) {
      throw new Error(`Producto inválido: "${data.producto}"`);
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.producto) patch.producto = data.producto;
    if (data.estado) patch.estado = data.estado;
    const idx = lotes.value.findIndex((l) => l.id === id);
    if (idx >= 0) lotes.value[idx] = { ...lotes.value[idx], ...patch as unknown as Partial<LoteRow> };
    const { error: e } = await sb.from("pool_lotes").update(patch).eq("id", id);
    if (e) {
      await refresh(); // revertir en caso de error
      throw e;
    }
  }

  async function batchToggle(ids: string[], activo: boolean) {
    const estado = activo ? "activo" : "inactivo";
    for (const id of ids) {
      const idx = lotes.value.findIndex((l) => l.id === id);
      if (idx >= 0) lotes.value[idx] = { ...lotes.value[idx], estado };
    }
    const { error: e } = await sb
      .from("pool_lotes")
      .update({ estado, updated_at: new Date().toISOString() })
      .in("id", ids);
    if (e) {
      await refresh();
      throw e;
    }
  }

  async function batchRemove(ids: string[]) {
    lotes.value = lotes.value.filter((l) => !ids.includes(l.id));
    const { error: e } = await sb.from("pool_lotes").delete().in("id", ids);
    if (e) {
      await refresh();
      throw e;
    }
  }

  // ── Contador de veces enviado por lote ──
  const batchCount = ref<Record<string, number>>({});
  const hoyCount = ref(0);

  /** Fecha local en formato YYYY-MM-DD (NO UTC). */
  function localToday(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function localTomorrow(): string {
    const now = new Date();
    now.setDate(now.getDate() + 1);
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  async function loadBatchCounts() {
    const { config: cfg } = useConfiguracion();
    const accountId = cfg.value?.activeAccountId;
    if (!accountId) {
      hoyCount.value = 0;
      batchCount.value = {};
      return;
    }
    const today = localToday();
    const tomorrow = localTomorrow();
    const { data, error: e } = await sb
      .from("logs_inscripcion")
      .select("numero, resultado, fecha")
      .eq("resultado", "success")
      .eq("account_id", accountId)
      .gte("fecha", `${today}T00:00:00.000Z`)
      .lt("fecha", `${tomorrow}T00:00:00.000Z`);
    if (e) {
      console.warn("Error cargando batchCount:", e.message);
      return;
    }
    const map: Record<string, number> = {};
    for (const row of data ?? []) {
      map[row.numero] = (map[row.numero] ?? 0) + 1;
    }
    batchCount.value = map;
    hoyCount.value = (data ?? []).length;
  }

  function toDomain(row: LoteRow): Lote {
    return {
      id: row.id,
      numero: row.numero,
      producto: row.producto as Lote["producto"],
      estado: row.estado as Lote["estado"],
    };
  }

  return {
    lotes,
    lotesActivos,
    loading,
    error,
    refresh,
    addLote,
    toggleEstado,
    toggleActivo,
    removeLote,
    editProducto,
    updateLote,
    batchToggle,
    batchRemove,
    toDomain,
    batchCount,
    hoyCount,
    loadBatchCounts,
  };
}