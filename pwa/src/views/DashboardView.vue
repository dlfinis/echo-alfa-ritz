<template>
  <div>
    <h2 class="text-2xl font-semibold mb-4">Dashboard de Lotes</h2>

    <div v-if="configError" class="bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded mb-4">
      <strong>Supabase no configurado:</strong> {{ configError }}
      <br />
      <span class="text-sm">Definí VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local</span>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">Lotes Activos</p>
        <p class="text-3xl font-bold">{{ pool.lotesActivos.value.length }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">Total Pool</p>
        <p class="text-3xl font-bold text-gray-700">{{ pool.lotes.value.length }}</p>
      </div>
      <div class="bg-white rounded-lg shadow p-4">
        <p class="text-sm text-gray-500">Cupo Diario</p>
        <p class="text-3xl font-bold">12</p>
      </div>
    </div>

    <div v-if="runner.state.value.running" class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <p class="font-semibold">Ejecutando rotación…</p>
      <p>{{ runner.state.value.current }} / 12 — ✅ {{ runner.state.value.success }} · ❌ {{ runner.state.value.failed }} · ⏭️ {{ runner.state.value.skipped }}</p>
    </div>

    <div v-if="runner.state.value.error" class="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 mb-4">
      <strong>Error:</strong> {{ runner.state.value.error }}
    </div>

    <div class="bg-white rounded-lg shadow p-4 mb-6">
      <h3 class="text-lg font-semibold mb-3">Pool de Lotes</h3>
      <div v-if="pool.loading.value" class="text-gray-400">Cargando desde Supabase…</div>
      <div v-else-if="pool.lotes.value.length === 0" class="text-gray-400">
        Pool vacío. Agregá lotes desde Configuración o importa desde CSV.
      </div>
      <table v-else class="w-full text-sm">
        <thead class="text-left text-gray-500">
          <tr>
            <th class="py-2">Número</th>
            <th>Producto</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in pool.lotes.value" :key="l.id" class="border-t">
            <td class="py-2 font-mono">{{ l.numero }}</td>
            <td>{{ l.producto }}</td>
            <td>
              <span :class="estadoClass(l.estado)">{{ l.estado }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex justify-center">
      <button
        class="bg-primary text-white font-bold py-3 px-8 rounded-full text-lg hover:bg-primary/90 transition shadow-lg disabled:opacity-50"
        :disabled="runner.state.value.running || pool.lotesActivos.value.length === 0"
        @click="runner.execute()"
      >
        {{ runner.state.value.running ? "Ejecutando…" : "Ejecutar Carga Ahora" }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePoolLotes } from "../composables/usePoolLotes.js";
import { useRotationRunner } from "../composables/useRotationRunner.js";
import { getSupabaseConfigError } from "../composables/useSupabase.js";

const pool = usePoolLotes();
const runner = useRotationRunner();
const configError = getSupabaseConfigError();

function estadoClass(estado: string) {
  if (estado === "activo") return "text-green-600 font-semibold";
  if (estado === "pagado") return "text-gray-500";
  return "text-red-600";
}
</script>