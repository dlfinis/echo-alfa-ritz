<template>
  <div class="relative" ref="containerRef">
    <button
      class="flex items-center gap-1 hover:underline"
      :title="`Sesión actual: ${activeEmail || 'sin cuenta'}`"
      @click="open = !open"
    >
      <i class="pi pi-user text-base" />
      <span class="hidden sm:inline truncate max-w-[140px]">{{ activeEmail || "Sin cuenta" }}</span>
      <i class="pi pi-angle-down text-xs" />
    </button>

    <div
      v-if="open"
      class="absolute right-0 mt-2 w-72 bg-white text-gray-800 rounded-lg shadow-lg border z-50 overflow-hidden"
    >
      <div class="p-3 border-b">
        <p class="text-xs font-semibold text-gray-500 uppercase mb-2">Cuentas</p>
        <ul class="space-y-1 max-h-48 overflow-y-auto">
          <li v-for="acc in accountList" :key="acc.id">
            <button
              class="w-full text-left px-2 py-1.5 rounded hover:bg-gray-100 flex items-center justify-between"
              :class="{ 'bg-blue-50 font-semibold': acc.id === activeAccountId }"
              @click="onSwitch(acc.id)"
            >
              <span class="truncate">{{ acc.email }}</span>
              <i v-if="acc.id === activeAccountId" class="pi pi-check text-blue-600" />
            </button>
          </li>
          <li v-if="accountList.length === 0" class="text-sm text-gray-400 px-2 py-1">
            Sin cuentas. Agregá una en Configuración.
          </li>
        </ul>
      </div>
      <div class="p-2 border-b bg-gray-50">
        <button
          class="w-full text-left px-2 py-1.5 rounded text-sm text-blue-600 hover:bg-blue-50"
          @click="onAddNew"
        >
          <i class="pi pi-plus text-xs" /> Agregar cuenta nueva
        </button>
      </div>
      <div v-if="expiresInMinValue !== null && expiresInMinValue <= 10" class="p-2 bg-yellow-50 text-xs">
        <i class="pi pi-clock" />
        Sesión expira en {{ expiresInMinValue }} min
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
const activeEmail = computed(() => {
  const id = activeAccountId.value;
  if (!id) return null;
  return accountList.value.find((a) => a.id === id)?.email ?? null;
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

function onSwitch(accountId: string) {
  open.value = false;
  if (accountId === activeAccountId.value) return;
  // Cambiar cuenta activa en DB
  cfg.setActiveAccount(accountId);
  // El watch de usePromoritzSession va a:
  //   1. Guardar sesión de cuenta anterior
  //   2. Cargar sesión de la nueva cuenta (si existe en localStorage)
  //   3. Si no hay sesión, el usuario debe hacer login manual
}

function onAddNew() {
  open.value = false;
  // Navegar a Configuración
  window.location.hash = "#/configuracion";
}

onMounted(() => {
  document.addEventListener("click", onClickOutside);
});
onUnmounted(() => {
  document.removeEventListener("click", onClickOutside);
});
</script>
