<script setup lang="ts">
import type { CardDefinition } from '../domain/cards'
import { useCardArtwork } from '../composables/useCardArtwork'
const props = defineProps<{ card: CardDefinition }>()
const artwork = useCardArtwork(() => props.card)
</script>
<template><img :src="artwork.src" :alt="artwork.alt" loading="lazy" /></template>
