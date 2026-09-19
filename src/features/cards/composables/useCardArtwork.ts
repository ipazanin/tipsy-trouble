import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { library } from '@/app/library'
import { getCardArtwork, type CardArtwork } from '../artwork'
import type { CardDefinition } from '../domain/cards'

export function useCardArtwork(card: MaybeRefOrGetter<CardDefinition | null | undefined>) {
  const uploadedUrl = ref('')
  let request = 0
  function release() {
    if (uploadedUrl.value) URL.revokeObjectURL(uploadedUrl.value)
    uploadedUrl.value = ''
  }
  watch(
    () => toValue(card)?.imageId,
    async (imageId) => {
      const currentRequest = ++request
      release()
      if (!imageId) return
      try {
        const image = await library.loadCardImage(imageId)
        if (image && currentRequest === request)
          uploadedUrl.value = URL.createObjectURL(new Blob([image.bytes], { type: image.mimeType }))
      } catch {
        // Keep the stock artwork when local storage is temporarily unavailable.
      }
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    request++
    release()
  })
  return computed<CardArtwork>(() => {
    if (uploadedUrl.value) return { src: uploadedUrl.value, alt: '', credit: '', sourceUrl: '' }
    const definition = toValue(card)
    return definition ? getCardArtwork(definition) : { src: '', alt: '', credit: '', sourceUrl: '' }
  })
}
