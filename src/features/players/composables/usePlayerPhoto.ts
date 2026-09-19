import { onScopeDispose, readonly, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue'

export function usePlayerPhoto(photo: MaybeRefOrGetter<Blob | undefined>) {
  const photoUrl = shallowRef<string>()

  function releasePhoto(): void {
    if (photoUrl.value) {
      URL.revokeObjectURL(photoUrl.value)
      photoUrl.value = undefined
    }
  }

  watch(
    () => toValue(photo),
    (currentPhoto) => {
      releasePhoto()
      if (currentPhoto) {
        photoUrl.value = URL.createObjectURL(currentPhoto)
      }
    },
    { immediate: true, flush: 'sync' },
  )

  onScopeDispose(releasePhoto)

  return readonly(photoUrl)
}
