const maximumUploadBytes = 10 * 1024 * 1024
const maximumPhotoSide = 256

export async function createPlayerPhoto(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, or WebP photo.')
  }

  if (file.size === 0 || file.size > maximumUploadBytes) {
    throw new Error('Choose a photo smaller than 10 MB.')
  }

  const sourceUrl = URL.createObjectURL(file)
  const sourcePhoto = new Image()

  try {
    sourcePhoto.src = sourceUrl
    try {
      await sourcePhoto.decode()
    } catch {
      throw new Error('This photo could not be opened. Try another image.')
    }

    if (!sourcePhoto.naturalWidth || !sourcePhoto.naturalHeight) {
      throw new Error('This photo has no usable image dimensions.')
    }

    const scale = Math.min(
      1,
      maximumPhotoSide / Math.max(sourcePhoto.naturalWidth, sourcePhoto.naturalHeight),
    )
    const thumbnail = document.createElement('canvas')
    thumbnail.width = Math.max(1, Math.round(sourcePhoto.naturalWidth * scale))
    thumbnail.height = Math.max(1, Math.round(sourcePhoto.naturalHeight * scale))
    const context = thumbnail.getContext('2d')
    if (!context) {
      throw new Error('Your browser could not prepare the photo.')
    }

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, thumbnail.width, thumbnail.height)
    context.drawImage(sourcePhoto, 0, 0, thumbnail.width, thumbnail.height)

    return await new Promise<Blob>((resolve, reject) => {
      thumbnail.toBlob(
        (photo) => {
          if (photo) {
            resolve(photo)
          } else {
            reject(new Error('Your browser could not save the photo.'))
          }
        },
        'image/jpeg',
        0.85,
      )
    })
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}
