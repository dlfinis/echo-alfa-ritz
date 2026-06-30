<template>
  <div class="relative" ref="containerRef">
    <!-- ── Botón principal del switcher ── -->
    <button
      class="flex items-center gap-1 hover:underline px-2 py-1 rounded"
      :title="titleText"
      @click="open = !open"
    >
      <i :class="session.isLoggedIn ? 'pi pi-user text-base' : 'pi pi-lock text-base'" />
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
      <!-- Info de la cuenta activa -->
      <div v-if="activeAccount" class="p-3 border-b bg-blue-50">
        <p class="text-xs font-semibold text-blue-600 uppercase">Cuenta activa</p>
        <p class="font-mono text-sm truncate mt-1">{{ activeAccount.email }}</p>
        <p v-if="session.isLoggedIn && userName" class="text-xs text-gray-600 mt-1">
          Sesión: {{ userName }}
        </p>
        <p v-else-if="!session.isLoggedIn" class="text-xs text-red-600 mt-1">
          ⚠️ Sin sesión activa
        </p>
      </div>

      <!-- Acción de login/logout de la cuenta activa -->
      <form
        v-if="activeAccount"
        class="p-2 border-b bg-gray-50 flex gap-2"
        @submit.prevent="onFormSubmit"
      >
        <button
          v-if="!session.isLoggedIn"
          type="submit"
          class="flex-1 bg-blue-600 text-white text-sm font-semibold px-3 py-2 rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
          :disabled="isLoading"
        >
          <i class="pi pi-sign-in text-xs" />
          {{ isLoading ? "…" : "Login" }}
        </button>
        <button
          v-else
          type="submit"
          class="flex-1 bg-red-500 text-white text-sm font-semibold px-3 py-2 rounded hover:bg-red-600 cursor-pointer"
        >
          <i class="pi pi-sign-out text-xs" />
          Cerrar sesión
        </button>
      </form>

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
        v-if="session.error && !session.isLoggedIn"
        class="p-2 bg-red-50 text-xs text-red-700"
      >
        {{ session.error }}
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

const titleText = computed(() => {
  if (!activeAccount.value) return "Sin cuenta configurada";
  if (session.isLoggedIn.value) {
    const u = session.userData.value;
    return `Sesión activa: ${u?.name ?? activeAccount.value.email} (${activeAccount.value.email})`;
  }
  return `Click para login en ${activeAccount.value.email}`;
});

// Label principal: nombre del user de promoritz si está logueado,
// email de la cuenta activa si hay activa pero sin sesión, o
// "Sin cuenta" si no hay nada.
const mainLabel = computed(() => {
  if (session.isLoggedIn.value && session.userData.value) {
    return session.userData.value.name || "";
  }
  if (!activeAccount.value) return "Sin cuenta";
  return activeAccount.value.email;
});

const expiresInMinValue = computed<number | null>(() => {
  const exp = session.sessionExpiresAt.value;
  if (exp == null) return null;
  const ms = exp - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 60_000);
});

const userName = computed(() => {
  const u = session.userData.value;
  return u ? `${u.name} ${u.lastname}` : null;
});

const isLoading = computed(() => session.loading.value);

function onClickOutside(e: MouseEvent) {
  if (!open.value) return;
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    open.value = false;
  }
}

async function onFormSubmit(e: Event) {
  // El <form @submit.prevent="onFormSubmit"> se dispara con click
  // en cualquiera de los dos botones (login o logout). Decidimos
  // según el estado de la sesión.
  e.preventDefault();
  if (session.isLoggedIn.value) {
    // Hay sesión real → cerrar
    session.logout();
  } else {
    // No hay sesión → abrir dropdown y dejar que el user vea el botón Login
    // (que se mostrará cuando recargue o cuando llegue el watch de accounts)
    // Por seguridad, no auto-logineamos desde el botón Cerrar sin sesión.
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
  // Logout de la cuenta anterior ANTES de cambiar (no mezclar sesiones)
  if (session.isLoggedIn.value) {
    session.logout();
  }
  // setActiveAccount actualiza active_account_id + email en una
  // operación atómica. Si la cuenta no existe, no hace nada.
  const result = await cfg.setActiveAccount(accountId);
  if (!result) return;
  // El watch de usePromoritzSession carga la sesión de la nueva cuenta
  // (si existe en localStorage). Si no, hay que re-loguear.
  if (!session.isLoggedIn.value) {
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
