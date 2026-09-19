<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerPhoto } from '@/features/players/composables/usePlayerPhoto'
const props = defineProps<{ name: string; photo?: Blob; large?: boolean }>()
const photoUrl = usePlayerPhoto(() => props.photo)
const initials = computed(() =>
  props.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase(),
)
</script>
<template>
  <span class="avatar" :class="{ 'avatar-large': large }" aria-hidden="true"
    ><img v-if="photoUrl" :src="photoUrl" alt="" /><span v-else>{{ initials }}</span></span
  >
</template>
