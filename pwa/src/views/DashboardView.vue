<template>
  <div>
    <h2 class="text-2xl font-semibold mb-4">Dashboard de Lotes</h2>

    <div
      v-if="configError"
      class="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-4"
    >
      <strong>Supabase no configurado:</strong> {{ configError }}
      <span class="block text-sm">Definí VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local</span>
    </div>

    <div
      v-if="!configError && !runner.readiness.value.ready"
      class="bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded mb-4 flex items-start gap-2"
    >
      <span class="text-xl">⚠️</span>
      <div class="flex-1">
        <strong class="block mb-1">{{ readinessLabel(runner.readiness.value.reason) }}</strong>
        <span class="text-sm">{{ runner.readiness.value.message }}</span>
        <router-link to="/configuracion" class="block mt-2 text-sm font-semibold text-amber-900 underline">
          → Ir a Configuración
        </router-link>
      </div>
    </div>

    <div
      v-if="actionError"
      class="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-4 text-sm"
    >
      <strong>Error:</strong> {{ actionError }}
      <button class="float-right text-red-500 font-bold" @click="actionError = null">✕</button>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">Pool Activos</p>
        <p class="text-3xl font-bold">{{ pool.lotesActivos.value.length }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">Total Pool</p>
        <p class="text-3xl font-bold text-gray-700">{{ pool.lotes.value.length }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">En Promoritz hoy</p>
        <p class="text-3xl font-bold" :class="promoritzHoyClass">
          {{ session.profileLoading.value ? "…" : session.promoritzLotesHoy.value }}
        </p>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">Cupo Diario</p>
        <p class="text-3xl font-bold">12</p>
      </div>
    </div>

    <div
      v-if="runner.state.value.running"
      class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4"
    >
      <p class="font-semibold">Ejecutando rotación…</p>
      <p>{{ runner.state.value.current }} / 12 — ✅ {{ runner.state.value.success }} · ❌ {{ runner.state.value.failed }} · ⏭️ {{ runner.state.value.skipped }}</p>
    </div>

    <div class="bg-white rounded-lg shadow p-4 mb-4">
      <h3 class="text-lg font-semibold mb-3">Agregar lote al pool</h3>
      <div class="flex flex-col sm:flex-row gap-2">
        <input
          v-model="nuevoNumero"
          type="text"
          placeholder="AB123456789"
          maxlength="11"
          class="flex-1 border rounded px-3 py-2 font-mono"
        />
        <select v-model="nuevoProducto" class="border rounded px-3 py-2 sm:w-56">
          <option v-for="p in PRODUCTOS_VALIDOS" :key="p" :value="p">{{ p }}</option>
        </select>
        <button
          class="bg-primary text-white px-4 py-2 rounded font-semibold hover:bg-primary/90 transition disabled:opacity-50"
          :disabled="!nuevoNumero || !nuevoProducto"
          @click="agregarLote"
        >
          Agregar
        </button>
      </div>
      <p class="text-xs text-gray-500 mt-1">Cada lote guarda su propio producto.</p>
    </div>

    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-semibold">Pool de Lotes ({{ pool.lotes.value.length }})</h3>
        <button
          class="text-xs underline text-primary hover:text-primary/70"
          @click="session.fetchProfile()"
        >
          Sincronizar perfil
        </button>
      </div>
      <div v-if="pool.loading.value" class="text-gray-400">Cargando desde Supabase…</div>
      <div v-else-if="pool.lotes.value.length === 0" class="text-gray-400">Pool vacío.</div>
      <table v-else class="w-full text-sm">
        <thead class="text-left text-gray-500">
          <tr>
            <th class="py-2 w-10"></th>
            <th class="py-2">Número</th>
            <th>Producto</th>
            <th>Estado</th>
            <th class="text-right">Acción</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in pool.lotes.value" :key="l.id" class="border-t">
            <td class="py-2">
              <input
                type="checkbox"
                :checked="l.estado === 'activo'"
                class="w-4 h-4 accent-primary cursor-pointer"
                @change="(e) => toggleActivo(l.id, (e.target as HTMLInputElement).checked)"
              />
            </td>
            <td class="font-mono">{{ l.numero }}</td>
            <td>{{ l.producto }}</td>
            <td>
              <span :class="l.estado === 'activo' ? 'text-green-600 font-semibold' : 'text-gray-500'">
                {{ l.estado }}
              </span>
            </td>
            <td class="text-right">
              <button class="text-xs text-red-600 hover:underline" @click="borrarLote(l.id, l.numero)">Borrar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="ultimosLogs.length > 0" class="bg-white rounded-lg shadow p-4 mb-6">
      <h3 class="text-lg font-semibold mb-2">Última ejecución</h3>
      <div class="space-y-1 text-xs">
        <div v-for="log in ultimosLogs.slice(0, 12)" :key="log.id" class="flex gap-2 items-center">
          <span :class="badgeClass(log.resultado)">{{ log.resultado }}</span>
          <span class="font-mono w-28">{{ log.numero }}</span>
          <span class="text-gray-500 flex-1 truncate">{{ log.mensaje }}</span>
          <span class="text-gray-400">{{ formatFecha(log.fecha) }}</span>
        </div>
      </div>
    </div>

    <div class="flex flex-col items-center gap-2">
      <button
        class="bg-primary text-white font-bold py-3 px-8 rounded-full text-lg hover:bg-primary/90 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="runner.state.value.running || !runner.readiness.value.ready || pool.lotesActivos.value.length === 0"
        @click="ejecutar"
      >
        {{ runner.state.value.running ? "Ejecutando…" : "Ejecutar Carga Ahora" }}
      </button>
      <p v-if="!runner.readiness.value.ready" class="text-xs text-amber-700">Botón deshabilitado — resolvé la configuración primero</p>
      <p v-else-if="pool.lotesActivos.value.length === 0" class="text-xs text-gray-500">Sin lotes activos</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { usePoolLotes } from "../composables/usePoolLotes.js";
import { useRotationRunner, type ReadinessReason } from "../composables/useRotationRunner.js";
import { usePromoritzSession } from "../composables/usePromoritzSession.js";
import { useHistorial } from "../composables/useHistorial.js";
import { getSupabaseConfigError } from "../composables/useSupabase.js";
import { PRODUCTOS_VALIDOS } from "@echo-alfa-ritz/shared";

const pool = usePoolLotes();
const runner = useRotationRunner();
const session = usePromoritzSession();
const historial = useHistorial();
const configError = getSupabaseConfigError();

const nuevoNumero = ref("");
const nuevoProducto = ref<(typeof PRODUCTOS_VALIDOS)[number]>("Mini Ritz");
const actionError = ref<string | null>(null);
const ultimosLogs = historial.logs;

const promoritzHoyClass = computed(() =>
  session.promoritzLotesHoy.value >= 12 ? "text-red-600" : "text-green-600",
);

onMounted(() => {
  session.fetchProfile();
});

async function agregarLote() {
  actionError.value = null;
  try {
    await pool.addLote(nuevoNumero.value, nuevoProducto.value);
    nuevoNumero.value = "";
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  }
}

function toggleActivo(id: string, activo: boolean) {
  actionError.value = null;
  pool.toggleActivo(id, activo).catch((e: unknown) => {
    actionError.value = e instanceof Error ? e.message : String(e);
  });
}

async function borrarLote(id: string, numero: string) {
  if (!confirm(`¿Borrar ${numero}?`)) return;
  actionError.value = null;
  try {
    await pool.removeLote(id);
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  }
}

async function ejecutar() {
  await session.login();
  await runner.execute(undefined, { externalJar: session.jar, fastMode: true });
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleTimeString("es-EC", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function badgeClass(r: string) {
  if (r === "success") return "bg-green-100 text-green-800 px-1.5 py-0.5 rounded";
  if (r === "failed") return "bg-red-100 text-red-800 px-1.5 py-0.5 rounded";
  return "bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded";
}

function readinessLabel(reason: ReadinessReason): string {
  switch (reason) {
    case "no-email": return "Falta configurar tu email de Promoritz";
    case "placeholder-email": return "Email parece ser un placeholder";
    case "no-pool": return "Pool vacío";
    default: return "Listo para ejecutar";
  }
}
</script>
