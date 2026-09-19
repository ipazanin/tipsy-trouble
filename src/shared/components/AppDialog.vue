<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { t } from '@/app/i18n'
import AppButton from './AppButton.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    confirmLabel: string
    cancelLabel?: string
    busy?: boolean
    danger?: boolean
    returnFocus?: HTMLElement | null
  }>(),
  { cancelLabel: undefined, busy: false, danger: false, returnFocus: null },
)
const emit = defineEmits<{ confirm: []; close: [] }>()
const dialog = ref<HTMLDialogElement>()
const titleId = useId()
const descriptionId = useId()
let previousFocus: HTMLElement | null = null

function restoreFocus() {
  if (previousFocus?.isConnected) previousFocus.focus()
  previousFocus = null
}

function containFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return
  const controls = Array.from(
    dialog.value?.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]',
    ) ?? [],
  ).filter(
    (control) =>
      control.tabIndex >= 0 && !control.matches(':disabled') && control.getClientRects().length > 0,
  )
  const first = controls[0]
  const last = controls.at(-1)
  if (!first) {
    event.preventDefault()
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function requestClose(event?: Event) {
  event?.preventDefault()
  if (!props.busy) emit('close')
}

watch(
  () => props.open,
  async (open) => {
    await nextTick()
    if (open && !dialog.value?.open) {
      previousFocus =
        props.returnFocus ??
        (document.activeElement instanceof HTMLElement ? document.activeElement : null)
      dialog.value?.showModal()
    } else if (!open && dialog.value?.open) {
      dialog.value.close()
      restoreFocus()
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  dialog.value?.close()
  restoreFocus()
})
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="app-dialog"
      :aria-labelledby="titleId"
      :aria-describedby="descriptionId"
      :aria-busy="busy || undefined"
      @cancel="requestClose"
      @keydown="containFocus"
    >
      <h2 :id="titleId">{{ title }}</h2>
      <div :id="descriptionId" class="dialog-body"><slot /></div>
      <div class="dialog-actions">
        <AppButton variant="secondary" :disabled="busy" autofocus @click="requestClose()">
          {{ cancelLabel ?? t('common.cancel') }}
        </AppButton>
        <AppButton
          :variant="danger ? 'danger' : 'primary'"
          :loading="busy"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </AppButton>
      </div>
    </dialog>
  </Teleport>
</template>
