const maximumUploadBytes = 10 * 1024 * 1024

export async function decodeImage(
  photo: Blob,
): Promise<{ image: HTMLImageElement; release: () => void }> {
  const sourceUrl = URL.createObjectURL(photo)
  const image = new Image()
  image.src = sourceUrl
  try {
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight) throw new Error()
    return { image, release: () => URL.revokeObjectURL(sourceUrl) }
  } catch {
    URL.revokeObjectURL(sourceUrl)
    throw new Error('This image could not be opened. Try another JPEG, PNG, or WebP image.')
  }
}

export async function resizeImage(
  file: File,
  maximumWidth: number,
  maximumHeight: number,
  maximumBytes: number,
): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Choose a JPEG, PNG, or WebP image.')
  if (!file.size || file.size > maximumUploadBytes)
    throw new Error('Choose an image no larger than 10 MB.')
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const jpeg = signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte)
  const webp =
    String.fromCharCode(...signature.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...signature.slice(8, 12)) === 'WEBP'
  if (!(file.type === 'image/jpeg' ? jpeg : file.type === 'image/png' ? png : webp)) {
    throw new Error('The image contents do not match its JPEG, PNG, or WebP file type.')
  }
  const { image, release } = await decodeImage(file)
  try {
    const scale = Math.min(
      1,
      maximumWidth / image.naturalWidth,
      maximumHeight / image.naturalHeight,
    )
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Your browser could not prepare the image.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const photo = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (photo) =>
            photo ? resolve(photo) : reject(new Error('Your browser could not save the image.')),
          'image/jpeg',
          quality,
        )
      })
      if (photo.size <= maximumBytes) return photo
    }
    throw new Error('This image is too detailed to save offline. Choose a smaller image.')
  } finally {
    release()
  }
}
