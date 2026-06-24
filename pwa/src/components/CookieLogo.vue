<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    :class="['transition-transform duration-200', spin ? 'group-hover:rotate-12 group-hover:scale-110' : '']"
    role="img"
    aria-label="Galleta"
  >
    <path
      d="M16 2 C8 2, 2 8, 2 16 C2 24, 8 30, 16 30 C24 30, 30 24, 30 16 C30 8, 24 2, 16 2 Z"
      fill="#C8A060"
      stroke="#8B6914"
      stroke-width="1.5"
    />
    <ellipse cx="11" cy="6" rx="3" ry="1.5" fill="#F0D89A" opacity="0.5" />
    <circle cx="11" cy="11" r="1.5" fill="#4A2C0F" />
    <circle cx="20" cy="9" r="1.2" fill="#4A2C0F" />
    <circle cx="22" cy="17" r="1.6" fill="#4A2C0F" />
    <circle cx="14" cy="20" r="1.3" fill="#4A2C0F" />
    <circle cx="9" cy="17" r="1.0" fill="#4A2C0F" />
  </svg>
</template>

<script setup lang="ts">
defineProps<{ size?: number; spin?: boolean }>();
</script>
