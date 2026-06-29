<template>
  <div class="relative" ref="containerRef">
    <!-- ── Botón principal del switcher ── -->
    <button
      class="flex items-center gap-1 hover:underline px-2 py-1 rounded"
      :title="titleText"
      @click="open = !open"
    >
      <i :class="session.isLoggedIn.value ? 'pi pi-user text-base' : 'pi pi-lock text-base'" />
      <span class="hidden md:inline truncate max-w-[160px]">{{ mainLabel }}</span>
      <i class="pi pi-angle-down text-xs" />
    </button>

    <!-- ── Dropdown ── -->
    <div
      v-if="open"
      class="absolute right-0 mt-2 w-80 bg-white text-gray-800 rounded-lg shadow-lg border z-50 overflow-hidden"
    >
      <!-- Info de la cuenta activa -->
      <div v-if="activeAccount" class="p-3 border-b bg-blue-50">
        <p class="text-xs font-semibold text-blue-600 uppercase">Cuenta activa</p>
        <p class="font-mono text-sm truncate mt-1">{{ activeAccount.email }}</p>
        <p v-if="session.isLoggedIn.value && session.userData.value" class="text-xs text-gray-600 mt-1">
          Sesión: {{ session.userData.value.name }} {{ session.userData.value.lastname }}
        </p>
        <p v-else-if="!session.isLoggedIn.value" class="text-xs text-red-600 mt-1">
          ⚠️ Sin sesión activa
        </p>
      </div>

      <!-- Acción de login/logout de la cuenta activa -->
      <div v-if="activeAccount" class="p-2 border-b bg-gray-50 flex gap-2">
        <button
          v-if="!session.isLoggedIn.value"
          class="flex-1 bg-blue-600 text-white text-sm font-semibold px-3 py-1.5 rounded hover:bg-blue-700 disabled:opacity-50"
          :disabled="session.loading.value"
          @click="onLogin"
        >
          <i class="pi pi-sign-in text-xs" />
          {{ session.loading.value ? "…" : "Login" }}
        </button>
        <button
          v-else
          class="flex-1 bg-red-500 text-white text-sm font-semibold px-3 py-1.5 rounded hover:bg-red-600"
          @click="onLogout"
        >
          <i class="pi pi-sign-out text-xs" />
          Cerrar sesión
        </button>
      </div>

      <!-- Lista de cuentas para switchear -->
      <div class="p-3 border-b">
        <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Cambiar cuenta</p>
        <ul class="space-y-1 max-h-48 overflow-y-auto">
          <li v-for="acc in accountList" :key="acc.id">
            <button
              class="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 flex items-center justify-between"
              :class="{ 'bg-blue-50 font-semibold': acc.id === activeAccountId }"
              @click="onSwitch(acc.id)"
            >
              <span class="truncate text-sm">{{ acc.email }}</span>
              <i v-if="acc.id === activeAccountId" class="pi pi-check text-blue-600" />
            </button>
          </li>
          <li v-if="accountList.length === 0" class="text-sm text-gray-400 px-2 py-1">
            Sin cuentas. Agregá una en Configuración.
          </li>
        </ul>
      </div>

      <!-- Acciones auxiliares -->
      <div class="p-2 border-b bg-gray-50">
        <button
          class="w-full text-left px-2 py-1.5 rounded text-sm text-blue-600 hover:bg-blue-50"
          @click="onAddNew"
        >
          <i class="pi pi-plus text-xs" /> Agregar cuenta nueva
        </button>
      </div>

      <!-- Expiración warning -->
      <div
        v-if="expiresInMinValue !== null && expiresInMinValue <= 10"
        class="p-2 bg-yellow-50 text-xs"
      >
        <i class="pi pi-clock" />
        Sesión expira en {{ expiresInMinValue }} min
      </div>

      <!-- Error -->
      <div
        v-if="session.error.value && !session.isLoggedIn.value"
        class="p-2 bg-red-50 text-xs text-red-700"
      >
        {{ session.error.value }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useAccounts } from "../composables/useAccounts.js";
import { useConfiguracion } from "../composables/useConfiguracion.js";
import { usePromoritzSession } from "../composables/usePromoritzSession.js";
import type { Account } from "@echo-alfa-ritz/shared";

const accountsApi = useAccounts();
const cfg = useConfiguracion();
const session = usePromoritzSession();

const open = ref(false);
const containerRef = ref<HTMLElement | null>(null);

const accountList = computed<Account[]>(() => accountsApi.accounts.value);
const activeAccountId = computed(() => cfg.config.value?.activeAccountId);
const activeAccount = computed<Account | null>(() => {
  const id = activeAccountId.value;
  if (!id) return null;
  return accountList.value.find((a) => a.id === id) ?? null;
});

const mainLabel = computed(() => {
  if (!activeAccount.value) return "Sin cuenta";
  if (session.isLoggedIn.value && session.userData.value) {
    return `👤 ${session.userData.value.name}`;
  }
  return activeAccount.value.email;
});

const titleText = computed(() => {
  if (!activeAccount.value) return "Sin cuenta configurada";
  if (session.isLoggedIn.value) {
    return `Sesión activa: ${activeAccount.value.email}`;
  }
  return `Click para login en ${activeAccount.value.email}`;
});

const expiresInMinValue = computed<number | null>(() => {
  const exp = session.sessionExpiresAt.value;
  if (exp == null) return null;
  const ms = exp - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 60_000);
});

function onClickOutside(e: MouseEvent) {
  if (!open.value) return;
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    open.value = false;
  }
}

async function onLogin() {
  open.value = false;
  await session.login();
}

function onLogout() {
  session.logout();
  // No cerramos el dropdown para que el user pueda ver que ya está deslogueado
}

async function onSwitch(accountId: string) {
  if (accountId === activeAccountId.value) {
    open.value = false;
    return;
  }
  open.value = false;
  // Cambiar cuenta activa en DB. El watch de usePromoritzSession:
  //   1. Guarda sesión de cuenta anterior
  //   2. Carga sesión de la nueva cuenta (si existe)
  //   3. Si no hay sesión, isLoggedIn = false → user debe hacer login
  await cfg.setActiveAccount(accountId);
}

function onAddNew() {
  open.value = false;
  window.location.hash = "#/configuracion";
}

onMounted(() => {
  document.addEventListener("click", onClickOutside);
});
onUnmounted(() => {
  document.removeEventListener("click", onClickOutside);
});
</script>
