<script setup lang="ts">
withDefaults(
  defineProps<{
    name:
      | 'arrow-right'
      | 'arrow-left'
      | 'arrow-up'
      | 'arrow-down'
      | 'library'
      | 'players'
      | 'cards'
      | 'backup'
      | 'plus'
      | 'close'
      | 'edit'
      | 'trash'
      | 'check'
      | 'play'
      | 'info'
      | 'spark'
      | 'download'
      | 'upload'
    size?: number
  }>(),
  { size: 20 },
)
const paths = {
  'arrow-right': 'M4 12h15m-6-6 6 6-6 6',
  'arrow-left': 'M20 12H5m6-6-6 6 6 6',
  'arrow-up': 'M12 20V5m-6 6 6-6 6 6',
  'arrow-down': 'M12 4v15m-6-6 6 6 6-6',
  library: 'M4 4h4v16H4zM11 4h4v16h-4zM18 4l4 15-3 1-4-15',
  players:
    'M15 20v-2a5 5 0 0 0-10 0v2m13-13a3 3 0 0 1 0 6m4 7v-2a5 5 0 0 0-4-5M13 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  cards:
    'M9 3h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2M3 6v13a3 3 0 0 0 3 3h10m-2-15v8m-4-4h8',
  backup: 'M12 15V3m-4 4 4-4 4 4M5 12H3v9h18v-9h-2M8 17h8',
  plus: 'M12 5v14M5 12h14',
  close: 'm6 6 12 12M18 6 6 18',
  edit: 'm15 5 4 4M4 20l4-1L21 6a2.8 2.8 0 0 0-4-4L4 15z',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  check: 'm5 12 4 4L19 6',
  play: 'm8 4 12 8-12 8z',
  info: 'M12 11v6m0-10v.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3z',
  download: 'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',
  upload: 'M12 15V3m-4 4 4-4 4 4M4 16v5h16v-5',
}
</script>

<template>
  <svg
    class="app-icon"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    :width="size"
    :height="size"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="paths[name]" />
  </svg>
</template>
