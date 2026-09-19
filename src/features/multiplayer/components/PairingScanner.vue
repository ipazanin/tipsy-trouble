<script setup lang="ts">
import { nextTick, onScopeDispose, ref, shallowRef, watch } from 'vue'
import jsQR from 'jsqr'
import { t } from '@/app/i18n'
import AppButton from '@/shared/components/AppButton.vue'

const props = withDefaults(
  defineProps<{ active?: boolean; busy?: boolean; title?: string; submitLabel?: string }>(),
  { active: true, busy: false, title: undefined, submitLabel: undefined },
)
const emit = defineEmits<{ decoded: [code: string]; close: [] }>()
const video = ref<HTMLVideoElement>()
const camera = shallowRef<MediaStream | null>(null)
const startingCamera = ref(false)
const readingImage = ref(false)
const error = ref('')
const pastedCode = ref('')
const cameraSupported = Boolean(navigator.mediaDevices?.getUserMedia)
let cameraGeneration = 0
let imageGeneration = 0
const imageUrls = new Set<string>()
let scanTimer: ReturnType<typeof setTimeout> | undefined

function stopCamera() {
  cameraGeneration++
  clearTimeout(scanTimer)
  scanTimer = undefined
  for (const track of camera.value?.getTracks() ?? []) track.stop()
  camera.value = null
  if (video.value) video.value.srcObject = null
  startingCamera.value = false
}
function acceptCode(code: string) {
  if (!props.active || props.busy) return
  const trimmedCode = code.trim()
  if (!trimmedCode || trimmedCode.length > 20_000) {
    error.value = t('multiplayer.scanner.invalidCode')
    return
  }
  stopCamera()
  imageGeneration++
  readingImage.value = false
  error.value = ''
  emit('decoded', trimmedCode)
}
function close() {
  stopCamera()
  imageGeneration++
  readingImage.value = false
  emit('close')
}

async function startCamera() {
  stopCamera()
  imageGeneration++
  readingImage.value = false
  error.value = ''
  if (!props.active || props.busy) return
  if (!cameraSupported) {
    error.value = t('multiplayer.scanner.unavailable')
    return
  }
  const currentGeneration = cameraGeneration
  startingCamera.value = true
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    })
    if (currentGeneration !== cameraGeneration || !props.active || props.busy) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    camera.value = stream
    await nextTick()
    if (!video.value || currentGeneration !== cameraGeneration) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }
    video.value.srcObject = stream
    await video.value.play()
    if (currentGeneration !== cameraGeneration) return
    startingCamera.value = false
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas unavailable')
    for (const track of stream.getVideoTracks()) {
      track.addEventListener(
        'ended',
        () => {
          if (currentGeneration !== cameraGeneration) return
          stopCamera()
          error.value = t('multiplayer.scanner.cameraStopped')
        },
        { once: true },
      )
    }
    function scanFrame() {
      if (currentGeneration !== cameraGeneration || !video.value || !context) return
      const preview = video.value
      try {
        if (preview.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && preview.videoWidth) {
          const scale = Math.min(1, 1280 / Math.max(preview.videoWidth, preview.videoHeight))
          canvas.width = Math.max(1, Math.round(preview.videoWidth * scale))
          canvas.height = Math.max(1, Math.round(preview.videoHeight * scale))
          context.drawImage(preview, 0, 0, canvas.width, canvas.height)
          const frame = context.getImageData(0, 0, canvas.width, canvas.height)
          const decoded = jsQR(frame.data, frame.width, frame.height, {
            inversionAttempts: 'dontInvert',
          })
          if (decoded?.data) {
            acceptCode(decoded.data)
            return
          }
        }
        scanTimer = setTimeout(scanFrame, 200)
      } catch {
        stopCamera()
        error.value = t('multiplayer.scanner.cameraFailed')
      }
    }
    scanFrame()
  } catch (failure) {
    if (currentGeneration !== cameraGeneration) return
    stopCamera()
    error.value = t(
      failure instanceof DOMException && failure.name === 'NotAllowedError'
        ? 'multiplayer.scanner.denied'
        : 'multiplayer.scanner.cameraFailed',
    )
  }
}

async function readImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !props.active || props.busy) return
  stopCamera()
  const currentGeneration = ++imageGeneration
  error.value = ''
  if (
    file.size > 10 * 1024 * 1024 ||
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
  ) {
    error.value = t('multiplayer.scanner.imageInvalid')
    return
  }
  readingImage.value = true
  const imageUrl = URL.createObjectURL(file)
  imageUrls.add(imageUrl)
  try {
    const image = new Image()
    image.src = imageUrl
    await image.decode()
    if (currentGeneration !== imageGeneration || !props.active || props.busy) return
    const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas unavailable')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const frame = context.getImageData(0, 0, canvas.width, canvas.height)
    const decoded = jsQR(frame.data, frame.width, frame.height)
    if (decoded?.data) acceptCode(decoded.data)
    else error.value = t('multiplayer.scanner.noCode')
  } catch {
    if (currentGeneration === imageGeneration) error.value = t('multiplayer.scanner.imageFailed')
  } finally {
    URL.revokeObjectURL(imageUrl)
    imageUrls.delete(imageUrl)
    if (currentGeneration === imageGeneration) readingImage.value = false
  }
}

function pauseHiddenCamera() {
  if (document.hidden) stopCamera()
}
watch(
  () => [props.active, props.busy],
  () => {
    if (!props.active || props.busy) {
      stopCamera()
      imageGeneration++
      readingImage.value = false
    }
  },
)
document.addEventListener('visibilitychange', pauseHiddenCamera)
onScopeDispose(() => {
  stopCamera()
  imageGeneration++
  document.removeEventListener('visibilitychange', pauseHiddenCamera)
  for (const imageUrl of imageUrls) URL.revokeObjectURL(imageUrl)
  imageUrls.clear()
})
</script>

<template>
  <section class="pairing-scanner" :aria-label="title ?? t('multiplayer.scanner.title')">
    <h2>{{ title ?? t('multiplayer.scanner.title') }}</h2>
    <p class="help-text">{{ t('multiplayer.scanner.intro') }}</p>
    <div v-if="camera || startingCamera" class="camera-preview">
      <video
        ref="video"
        autoplay
        muted
        playsinline
        :aria-label="t('multiplayer.scanner.preview')"
      />
      <p class="camera-hint" role="status">{{ t('multiplayer.scanner.aim') }}</p>
    </div>
    <div class="form-actions">
      <AppButton
        v-if="!camera && !startingCamera"
        variant="secondary"
        :disabled="!active || busy || readingImage || !cameraSupported"
        @click="startCamera"
        >{{ t('multiplayer.scanner.start') }}</AppButton
      >
      <AppButton v-else variant="secondary" @click="stopCamera">{{
        t('multiplayer.scanner.stop')
      }}</AppButton>
      <AppButton variant="quiet" :disabled="busy" @click="close">{{
        t('common.cancel')
      }}</AppButton>
    </div>
    <p v-if="!cameraSupported" class="help-text">{{ t('multiplayer.scanner.unavailable') }}</p>
    <p v-if="error" class="error-message" role="alert">{{ error }}</p>
    <label class="field">
      {{ t('multiplayer.scanner.image') }}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        :disabled="!active || busy || readingImage"
        @change="readImage"
      />
    </label>
    <p v-if="readingImage" class="help-text" role="status">
      {{ t('multiplayer.scanner.readingImage') }}
    </p>
    <form class="pairing-paste" @submit.prevent="acceptCode(pastedCode)">
      <label class="field">
        {{ t('multiplayer.scanner.paste') }}
        <textarea
          v-model="pastedCode"
          rows="3"
          maxlength="20000"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          :disabled="!active || busy"
        />
      </label>
      <AppButton type="submit" :disabled="!active || busy || !pastedCode.trim()" :loading="busy">
        {{ submitLabel ?? t('multiplayer.scanner.useCode') }}
      </AppButton>
    </form>
  </section>
</template>

<style scoped>
.pairing-scanner,
.pairing-paste {
  display: grid;
  gap: var(--space-4);
  min-width: 0;
}
.camera-preview {
  position: relative;
  overflow: hidden;
  border-radius: var(--radius);
  background: var(--ink);
}
.camera-preview video {
  display: block;
  width: 100%;
  max-height: 320px;
  object-fit: cover;
}
.camera-hint {
  padding: var(--space-3);
  color: var(--cream);
  font-size: 0.8rem;
  text-align: center;
}
.pairing-scanner .error-message {
  margin: 0;
}
.pairing-paste textarea {
  font-size: 1rem;
  overflow-wrap: anywhere;
}
</style>
