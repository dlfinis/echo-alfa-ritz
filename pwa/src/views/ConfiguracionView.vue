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

      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-gray-700">Tarea Automática</span>
        <label class="inline-flex items-center cursor-pointer">
          <input type="checkbox" v-model="form.tareaActivada" class="sr-only peer" @change="save()" />
          <span class="w-11 h-6 bg-gray-200 peer-checked:bg-primary rounded-full relative transition">
            <span class="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition peer-checked:translate-x-5"></span>
          </span>
        </label>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Hora de Ejecución</label>
        <input
          v-model="form.horaEjecucion"
          type="time"
          class="border rounded px-3 py-2"
          @blur="save()"
        />
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Fecha de Caducidad</label>
        <input
          v-model="form.fechaCaducidad"
          type="date"
          class="border rounded px-3 py-2"
          @blur="save()"
        />
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
  tareaActivada: false,
  horaEjecucion: "00:00",
  fechaCaducidad: "2026-12-31",
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
        tareaActivada: c.tareaActivada,
        horaEjecucion: c.horaEjecucion,
        fechaCaducidad: c.fechaCaducidad,
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

    // Si cambió el email, cerrar sesión activa
    if (emailAnterior && form.value.email !== emailAnterior && session.isLoggedIn.value) {
      session.logout();
    }
    emailAnterior = form.value.email;
  } catch (e) {
    console.error("Error guardando config:", e);
  }
}
</script>