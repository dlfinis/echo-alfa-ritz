<template>
  <div>
    <h2 class="text-2xl font-semibold mb-4">Dashboard de Lotes</h2>

    <div v-if="configError" class="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-4">
      <strong>Supabase no configurado:</strong> {{ configError }}
      <span class="block text-sm">Definí VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local</span>
    </div>

    <div v-if="runner.state.value.running" class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div class="flex items-start justify-between">
        <div>
          <p class="font-semibold">Ejecutando rotación…</p>
          <p>{{ runner.state.value.current }} / {{ cantidadAEnviar }} — ✅ {{ runner.state.value.success }} · ❌ {{ runner.state.value.failed }} · ⏭️ {{ runner.state.value.skipped }}</p>
        </div>
        <button class="bg-red-600 text-white px-3 py-1 rounded text-sm font-bold hover:bg-red-700 transition" @click="runner.cancel()">Cancelar</button>
      </div>
    </div>

    <!-- Agregar lote -->
    <div class="bg-white rounded-lg shadow p-4 mb-4">
      <h3 class="text-lg font-semibold mb-3">Agregar lote al pool</h3>
      <div class="flex flex-col sm:flex-row gap-2">
        <input v-model="nuevoNumero" type="text" placeholder="AB123456789" maxlength="11" class="flex-1 border rounded px-3 py-2 font-mono" />
        <select v-model="nuevoProducto" class="border rounded px-3 py-2 sm:w-56">
          <option v-for="p in PRODUCTOS_VALIDOS" :key="p" :value="p">{{ p }}</option>
        </select>
        <button class="bg-primary text-white px-4 py-2 rounded font-semibold hover:bg-primary/90 transition disabled:opacity-50" :disabled="!nuevoNumero || !nuevoProducto" @click="agregarLote">Agregar</button>
      </div>
    </div>

    <!-- Controles de ejecución -->
    <div class="bg-white rounded-lg shadow p-4 mb-4">
      <h3 class="text-lg font-semibold mb-3">Controles de ejecución</h3>
      <div class="flex flex-wrap items-end gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-600 mb-1">Cantidad a enviar</label>
          <input v-model.number="cantidadAEnviar" type="number" min="1" max="12" class="w-20 border rounded px-3 py-2 text-center" />
        </div>
        <div class="flex items-center gap-2 pb-1">
          <input id="useDelay" type="checkbox" v-model="usarDelayConfig" class="w-4 h-4 accent-primary cursor-pointer" />
          <label for="useDelay" class="text-sm text-gray-600 cursor-pointer select-none">Usar delay configurado</label>
        </div>
        <div class="text-xs text-gray-500 pb-1">
          <span :class="pool.hoyCount.value >= 12 ? 'text-red-600 font-bold' : ''">
            Enviados hoy: {{ pool.hoyCount.value }} / 12
            <span v-if="pool.hoyCount.value >= 12" class="text-red-600"> — ¡Cupo lleno!</span>
            <span v-else class="text-gray-500"> — faltan {{ 12 - pool.hoyCount.value }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- Pool de Lotes -->
    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-lg font-semibold">Pool de Lotes ({{ pool.lotes.value.length }})</h3>
        <span class="text-xs text-gray-500">
          {{ pool.lotesActivos.value.length }} activos
        </span>
      </div>
      <div v-if="pool.loading.value" class="text-gray-400">Cargando…</div>
      <div v-else-if="pool.lotes.value.length === 0" class="text-gray-400">Pool vacío.</div>
      <table v-else class="w-full text-sm">
        <thead class="text-left text-gray-500">
          <tr>
            <th class="py-2 w-10"></th>
            <th class="py-2">Número</th>
            <th>Producto</th>
            <th>Veces enviado</th>
            <th class="text-right">Acción</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in pool.lotes.value" :key="l.id" class="border-t">
            <td class="py-2">
              <input type="checkbox" :checked="l.estado === 'activo'" class="w-4 h-4 accent-primary cursor-pointer" @change="(e) => toggleActivo(l.id, (e.target as HTMLInputElement).checked)" />
            </td>
            <td class="font-mono">{{ l.numero }}</td>
            <td>{{ l.producto }}</td>
            <td class="font-mono text-xs">{{ pool.batchCount.value[l.numero] ?? 0 }}</td>
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
        :disabled="runner.state.value.running || pool.lotesActivos.value.length === 0"
        @click="ejecutar"
      >
        {{ runner.state.value.running ? "Ejecutando…" : "Ejecutar Carga Ahora" }}
      </button>
      <p v-if="pool.lotesActivos.value.length === 0" class="text-xs text-gray-500">Sin lotes activos</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { usePoolLotes } from "../composables/usePoolLotes.js";
import { useRotationRunner } from "../composables/useRotationRunner.js";
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

const cantidadAEnviar = ref(12);
const usarDelayConfig = ref(false);

onMounted(() => {
  pool.loadBatchCounts();
});

async function agregarLote() {
  actionError.value = null;
  try {
    await pool.addLote(nuevoNumero.value, nuevoProducto.value);
    nuevoNumero.value = "";
    await pool.loadBatchCounts();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  }
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
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
    await pool.loadBatchCounts();
  } catch (e) {
    actionError.value = e instanceof Error ? e.message : String(e);
  }
}

async function ejecutar() {
  await session.login();
  await runner.execute(undefined, {
    externalJar: session.jar,
    fastMode: !usarDelayConfig.value,
    cantidad: cantidadAEnviar.value,
  });
  await pool.loadBatchCounts();
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleTimeString("es-EC", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function badgeClass(r: string) {
  if (r === "success") return "bg-green-100 text-green-800 px-1.5 py-0.5 rounded";
  if (r === "failed") return "bg-red-100 text-red-800 px-1.5 py-0.5 rounded";
  return "bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded";
}
</script>
