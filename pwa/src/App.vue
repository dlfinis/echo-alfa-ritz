<template>
  <div id="app-shell" class="min-h-dvh bg-gray-50">
    <header class="bg-primary text-white p-4 shadow-md">
      <div class="max-w-4xl mx-auto flex items-center justify-between">
        <router-link to="/" class="flex items-center gap-2 group">
          <CookieLogo :size="32" :spin="true" />
          <div class="flex flex-col leading-none">
            <span class="text-lg font-bold font-brandon">Echo-Alfa</span>
            <span class="text-[10px] text-white/70 hidden sm:inline">🍪 tu asistente de galletas</span>
          </div>
        </router-link>
        <nav class="flex gap-3 sm:gap-4 text-sm items-center">
          <router-link to="/" class="hover:underline flex items-center gap-1" active-class="font-bold" exact-active-class="font-bold">
            <i class="pi pi-home text-base" />
            <span class="hidden sm:inline">Dashboard</span>
          </router-link>
          <router-link to="/historial" class="hover:underline flex items-center gap-1" active-class="font-bold">
            <i class="pi pi-list text-base" />
            <span class="hidden sm:inline">Historial</span>
          </router-link>
          <router-link to="/configuracion" class="hover:underline flex items-center gap-1" active-class="font-bold">
            <i class="pi pi-cog text-base" />
            <span class="hidden sm:inline">Config</span>
          </router-link>

          <span class="w-px h-5 bg-white/30 mx-1"></span>

          <!-- ── AccountSwitcher: dropdown de cuenta + login ── -->
          <AccountSwitcher />

          <span
            v-if="session.error.value && !session.isLoggedIn.value"
            class="text-red-200 text-xs hidden md:inline"
          >
            {{ session.error.value }}
          </span>
        </nav>
      </div>
    </header>

    <main class="max-w-4xl mx-auto p-4">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import CookieLogo from "./components/CookieLogo.vue";
import AccountSwitcher from "./components/AccountSwitcher.vue";
// Inicializar el singleton de accounts (suscripción Realtime)
import { useAccounts } from "./composables/useAccounts.js";
import { usePromoritzSession } from "./composables/usePromoritzSession.js";

useAccounts();
const session = usePromoritzSession();
</script>

<style scoped></style>
