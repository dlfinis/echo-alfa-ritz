<template>
  <div id="app-shell" class="min-h-dvh bg-gray-50">
    <header class="bg-primary text-white p-4 shadow-md">
      <div class="max-w-4xl mx-auto flex items-center justify-between">
        <h1 class="text-xl font-bold font-brandon">Echo-Alfa</h1>
        <nav class="flex gap-4 text-sm">
          <router-link to="/" class="hover:underline">Dashboard</router-link>
          <router-link to="/historial" class="hover:underline">Historial</router-link>
          <router-link to="/configuracion" class="hover:underline">Configuración</router-link>
        </nav>
      </div>
    </header>

    <main class="max-w-4xl mx-auto p-4">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
// App shell — layout persistente
</script>

<style scoped></style>
