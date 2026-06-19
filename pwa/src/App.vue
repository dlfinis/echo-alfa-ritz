<template>
  <div id="app-shell" class="min-h-dvh bg-gray-50">
    <header class="bg-primary text-white p-4 shadow-md">
      <div class="max-w-4xl mx-auto flex items-center justify-between">
        <h1 class="text-xl font-bold font-brandon">Echo-Alfa</h1>
        <nav class="flex gap-4 text-sm items-center">
          <router-link to="/" class="hover:underline">Dashboard</router-link>
          <router-link to="/historial" class="hover:underline">Historial</router-link>
          <router-link to="/configuracion" class="hover:underline">Configuración</router-link>

          <span class="w-px h-5 bg-white/30 mx-2"></span>

          <button
            v-if="!session.isLoggedIn.value"
            class="bg-white text-primary font-semibold px-3 py-1 rounded-full text-xs hover:bg-primary/90 hover:text-white transition"
            :disabled="session.loading.value"
            @click="session.login()"
          >
            {{ session.loading.value ? "…" : "🔐 Iniciar Sesión" }}
          </button>
          <div v-else class="flex items-center gap-2 text-sm">
            <span
              v-if="session.userData.value"
              class="hidden sm:inline"
            >
              👤 {{ session.userData.value.name }}
            </span>
            <button
              class="bg-white/20 font-semibold px-3 py-1 rounded-full text-xs hover:bg-white/30 transition"
              @click="session.logout()"
            >
              Cerrar
            </button>
          </div>
          <span v-if="session.error.value && !session.isLoggedIn.value" class="text-red-200 text-xs">
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
import { usePromoritzSession } from "./composables/usePromoritzSession.js";

const session = usePromoritzSession();
</script>

<style scoped></style>
