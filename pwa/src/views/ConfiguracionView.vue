<template>
  <div>
    <h2 class="text-2xl font-semibold mb-4">Configuración</h2>

    <div v-if="cfg.loading.value" class="text-gray-400">Cargando…</div>
    <div v-else-if="!cfg.config.value" class="text-yellow-600">
      No hay fila de configuración en Supabase. Aplicá la migración 001_initial_schema.sql.
    </div>
    <div v-else class="space-y-4 max-w-xl">
      <!-- ── Cuentas ── -->
      <div class="bg-white rounded-lg shadow p-4">
        <h3 class="text-lg font-semibold mb-3">Cuentas de email</h3>
        <p class="text-xs text-gray-500 mb-3">
          Cada cuenta mantiene su propia sesión de promoritz. Solo la cuenta
          activa inyecta lotes. Agregá cuentas y activá la que quieras usar.
        </p>

        <ul class="space-y-2 mb-3">
          <li
            v-for="acc in accounts.accounts.value"
            :key="acc.id"
            class="flex items-center justify-between bg-gray-50 px-3 py-2 rounded"
          >
            <div class="flex-1 min-w-0">
              <p class="font-mono text-sm truncate">{{ acc.email }}</p>
              <p v-if="acc.id === activeAccountId" class="text-xs text-blue-600">
                ● Activa
              </p>
            </div>
            <div class="flex items-center gap-2">
              <button
                v-if="acc.id !== activeAccountId"
                class="text-xs text-blue-600 hover:underline"
                @click="onActivate(acc.id)"
              >
                Activar
              </button>
              <button
                v-if="acc.id !== activeAccountId"
                class="text-xs text-red-600 hover:underline"
                @click="onRemove(acc.id, acc.email)"
              >
                Quitar
              </button>
            </div>
          </li>
          <li v-if="accounts.accounts.value.length === 0" class="text-sm text-gray-400">
            Sin cuentas. Agregá una abajo.
          </li>
        </ul>

        <form class="flex gap-2" @submit.prevent="onAdd">
          <input
            v-model="newEmail"
            type="email"
            placeholder="otra-cuenta@email.com"
            class="flex-1 border rounded px-3 py-2 text-sm"
            required
          />
          <button
            type="submit"
            class="bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            :disabled="!newEmail || isAdding"
          >
            <i class="pi pi-plus" />
            Agregar
          </button>
        </form>
        <p v-if="addError" class="text-xs text-red-600 mt-1">{{ addError }}</p>
      </div>

      <!-- ── Configuración de la cuenta activa ── -->
      <div class="bg-white rounded-lg shadow p-4">
        <h3 class="text-lg font-semibold mb-3">Cuenta activa: {{ form.email || "(sin email)" }}</h3>

        <div class="grid grid-cols-2 gap-3 mb-3">
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

        <div v-if="savedAt" class="text-xs text-green-600 mt-2">Guardado ✓</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useConfiguracion } from "../composables/useConfiguracion.js";
import { usePromoritzSession } from "../composables/usePromoritzSession.js";
import { useAccounts } from "../composables/useAccounts.js";

const cfg = useConfiguracion();
const session = usePromoritzSession();
const accounts = useAccounts();

const form = ref({
  email: "",
  delayMinSegundos: 3,
  delayMaxSegundos: 7,
});
const newEmail = ref("");
const isAdding = ref(false);
const addError = ref<string | null>(null);
const savedAt = ref<string | null>(null);
let emailAnterior = "";

const activeAccountId = computed(() => cfg.config.value?.activeAccountId);

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

    if (
      emailAnterior &&
      form.value.email !== emailAnterior &&
      session.isLoggedIn.value
    ) {
      session.logout();
    }
    emailAnterior = form.value.email;
  } catch (e) {
    console.error("Error guardando config:", e);
  }
}

async function onAdd() {
  if (!newEmail.value) return;
  isAdding.value = true;
  addError.value = null;
  try {
    const acc = await accounts.addAccount(newEmail.value);
    // Si no hay activa válida, activar la nueva (también actualiza email)
    const activeId = cfg.config.value?.activeAccountId;
    const activeExists = activeId
      ? accounts.accounts.value.some((a) => a.id === activeId)
      : false;
    if (!activeExists) {
      const result = await cfg.setActiveAccount(acc.id);
      if (result) emailAnterior = result.email;
    }
    newEmail.value = "";
  } catch (e) {
    addError.value = e instanceof Error ? e.message : String(e);
  } finally {
    isAdding.value = false;
  }
}

async function onActivate(accountId: string) {
  // Hacer logout de la cuenta anterior ANTES de cambiar
  if (session.isLoggedIn.value) {
    session.logout();
  }

  // setActiveAccount ahora también actualiza el email en una sola
  // operación atómica. Devuelve null si la cuenta no existe.
  const result = await cfg.setActiveAccount(accountId);
  if (!result) return;
  emailAnterior = result.email;

  // Forzar login con la nueva cuenta
  await session.login();
}

async function onRemove(accountId: string, email: string) {
  if (
    !confirm(
      `¿Quitar la cuenta ${email}? Las sesiones guardadas se perderán.`,
    )
  )
    return;
  try {
    // SIEMPRE limpiar el email y active_account_id si la cuenta borrada
    // coincide con la activa. También si el email de configuracion
    // coincide con el email borrado (independiente de cuál es la activa).
    const current = cfg.config.value;
    if (current?.activeAccountId === accountId || current?.email === email) {
      session.logout();
      await cfg.clearActiveAccount();
      emailAnterior = "";
    }
    await accounts.removeAccount(accountId);
  } catch (e) {
    alert("Error al quitar: " + (e instanceof Error ? e.message : String(e)));
  }
}
</script>
