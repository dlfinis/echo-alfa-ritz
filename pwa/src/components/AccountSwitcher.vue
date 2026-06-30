<template>
  <div class="relative" ref="containerRef">
    <!-- ── Botón principal del switcher ── -->
    <button
      class="flex items-center gap-1 hover:underline px-2 py-1 rounded"
      :title="titleText"
      @click="open = !open"
    >
      <i :class="isLoggedIn ? 'pi pi-user text-base' : 'pi pi-lock text-base'" />
      <span class="hidden md:inline truncate max-w-[160px]">
        {{ mainLabel }}
      </span>
      <i class="pi pi-angle-down text-xs" />
    </button>

    <!-- ── Dropdown ── -->
    <div
      v-if="open"
      class="absolute right-0 mt-2 w-80 bg-white text-gray-800 rounded-lg shadow-lg border z-50 overflow-hidden"
    >
      <!-- Info de la cuenta activa: solo visible cuando hay sesión real -->
      <div v-if="isLoggedIn && activeAccount" class="p-3 border-b bg-blue-50">
        <p class="text-xs font-semibold text-blue-600 uppercase">Cuenta activa</p>
        <p class="font-mono text-sm truncate mt-1">{{ activeAccount.email }}</p>
        <p v-if="userName" class="text-xs text-gray-600 mt-1">
          Sesión: {{ userName }}
        </p>
      </div>
      <!-- Cuando hay cuenta activa pero sin sesión, mostrar solo el warning -->
      <div
        v-else-if="activeAccount && !isLoggedIn"
        class="p-3 border-b bg-yellow-50"
      >
        <p class="text-xs font-semibold text-yellow-700 uppercase">⚠️ Sin sesión activa</p>
        <p class="text-xs text-gray-600 mt-1">
          Hay una cuenta configurada pero no hay sesión. Hacé click en Login abajo.
        </p>
      </div>
      <!-- Sin cuenta configurada -->
      <div v-else class="p-3 border-b bg-gray-50">
        <p class="text-xs font-semibold text-gray-500 uppercase">Sin cuenta configurada</p>
        <p class="text-xs text-gray-600 mt-1">
          Agregá una cuenta en Configuración para empezar.
        </p>
      </div>

      <!-- Acción de login/logout de la cuenta activa -->
      <div
        v-if="activeAccount"
        :key="`login-${isLoggedIn ? 'in' : 'out'}`"
        class="p-2 border-b bg-gray-50 flex gap-2"
      >
        <button
          v-if="!isLoggedIn"
          type="button"
          class="flex-1 bg-blue-600 text-white text-sm font-semibold px-3 py-2 rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          :disabled="isLoading"
          @click="onLogin"
        >
          <i class="pi pi-sign-in text-xs" />
          {{ isLoading ? "…" : "Login" }}
        </button>
        <button
          v-else
          type="button"
          class="flex-1 bg-red-500 text-white text-sm font-semibold px-3 py-2 rounded hover:bg-red-600 cursor-pointer"
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
        v-if="sessionError && !isLoggedIn"
        class="p-2 bg-red-50 text-xs text-red-700"
      >
        {{ sessionError }}
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
// Destructurar para que isLoggedIn, error, userData, sessionExpiresAt
// sean top-level refs (Vue 3 los auto-unwrappea en template).
const {
  isLoggedIn,
  error: sessionError,
  userData: sessionUserData,
  sessionExpiresAt: rawExpiresAt,
  loading: sessionLoading,
} = session;

const open = ref(false);
const containerRef = ref<HTMLElement | null>(null);

const accountList = computed<Account[]>(() => accountsApi.accounts.value);
const activeAccountId = computed(() => cfg.config.value?.activeAccountId);
const activeAccount = computed<Account | null>(() => {
  const id = activeAccountId.value;
  if (!id) return null;
  return accountList.value.find((a) => a.id === id) ?? null;
});

const titleText = computed(() => {
  if (!activeAccount.value) return "Sin cuenta configurada";
  if (isLoggedIn.value) {
    const u = sessionUserData.value;
    return `Sesión activa: ${u?.name ?? activeAccount.value.email} (${activeAccount.value.email})`;
  }
  return `Click para login en ${activeAccount.value.email}`;
});

// Label principal: nombre del user de promoritz si está logueado,
// "Sin cuenta" si no hay sesión real. Nunca mostramos el email acá
// (solo cuando hay sesión, lo muestra el dropdown con la info completa).
const mainLabel = computed(() => {
  if (isLoggedIn.value) {
    return sessionUserData.value?.name || "";
  }
  return "Sin cuenta";
});

const expiresInMinValue = computed<number | null>(() => {
  const exp = rawExpiresAt.value;
  if (exp == null) return null;
  const ms = exp - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 60_000);
});

const userName = computed(() => {
  const u = sessionUserData.value;
  return u ? `${u.name} ${u.lastname}` : null;
});

const isLoading = computed(() => sessionLoading.value);

function onClickOutside(e: MouseEvent) {
  if (!open.value) return;
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    open.value = false;
  }
}

async function onFormSubmit(e: Event) {
  e.preventDefault();
  if (isLoggedIn.value) {
    session.logout();
  } else {
    open.value = false;
  }
}

async function onLogin() {
  open.value = false;
  await session.login();
}

async function onLogout() {
  session.logout();
}

async function onSwitch(accountId: string) {
  if (accountId === activeAccountId.value) {
    open.value = false;
    return;
  }
  open.value = false;
  if (isLoggedIn.value) {
    session.logout();
  }
  const result = await cfg.setActiveAccount(accountId);
  if (!result) return;
  if (!isLoggedIn.value) {
    await session.login();
  }
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
