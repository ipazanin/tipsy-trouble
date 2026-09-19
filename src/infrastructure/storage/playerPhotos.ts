import { resizeImage } from './imageProcessing'

export function createPlayerPhoto(file: File): Promise<Blob> {
  return resizeImage(file, 256, 256, 1024 * 1024)
}
