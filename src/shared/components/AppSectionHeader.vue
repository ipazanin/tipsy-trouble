<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="section-heading">
    <div class="section-heading-copy">
      <h2>{{ title }}</h2>
      <p v-if="description" class="muted">{{ description }}</p>
    </div>
    <slot />
  </div>
</template>
