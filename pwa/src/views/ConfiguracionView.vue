<template>
  <div>
    <h2 class="text-2xl font-semibold mb-4">Configuración</h2>

    <div v-if="cfg.loading.value" class="text-gray-400">Cargando…</div>
    <div v-else-if="!cfg.config.value" class="text-yellow-600">
      No hay fila de configuración en Supabase. Aplicá la migración 001_initial_schema.sql.
    </div>
    <div v-else class="bg-white rounded-lg shadow p-6 space-y-4 max-w-xl">
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          Email (login Promoritz)
        </label>
        <input
          v-model="form.email"
          type="email"
          placeholder="tu-email@ejemplo.com"
          class="w-full border rounded px-3 py-2"
          @blur="save()"
        />
        <p class="text-xs text-gray-500 mt-1">
          Con este email se hace login en promoritz.com antes de cada rotación.
          Se guarda al sacar el foco del campo.
        </p>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Delay mín (s)</label>
          <input
            v-model.number="form.delayMinSegundos"
            type="number"
            min="1"
            max="30"
            class="w-full border rounded px-3 py-2"
            @blur="save()"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Delay máx (s)</label>
          <input
            v-model.number="form.delayMaxSegundos"
            type="number"
            min="1"
            max="60"
            class="w-full border rounded px-3 py-2"
            @blur="save()"
          />
        </div>
      </div>

      <p class="text-xs text-gray-500 pt-2 border-t">
        🍪 La rotación se dispara manualmente desde el botón "Hornear Galletas" del Dashboard.
        No hay cron automático (Cloudflare Pages no soporta tareas programadas del lado del server).
      </p>

      <div v-if="savedAt" class="text-xs text-green-600">Guardado ✓</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useConfiguracion } from "../composables/useConfiguracion.js";
import { usePromoritzSession } from "../composables/usePromoritzSession.js";

const cfg = useConfiguracion();
const session = usePromoritzSession();

const form = ref({
  email: "",
  delayMinSegundos: 3,
  delayMaxSegundos: 7,
});
const savedAt = ref<string | null>(null);
let emailAnterior = "";

watch(
  () => cfg.config.value,
  (c) => {
    if (c) {
      emailAnterior = c.email;
      form.value = {
        email: c.email,
        delayMinSegundos: c.delayMinSegundos,
        delayMaxSegundos: c.delayMaxSegundos,
      };
    }
  },
  { immediate: true },
);

async function save() {
  try {
    await cfg.update({ ...form.value });
    savedAt.value = new Date().toLocaleTimeString("es-EC");
    setTimeout(() => (savedAt.value = null), 2000);

    if (emailAnterior && form.value.email !== emailAnterior && session.isLoggedIn.value) {
      session.logout();
    }
    emailAnterior = form.value.email;
  } catch (e) {
    console.error("Error guardando config:", e);
  }
}
</script>
