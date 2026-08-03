import sharp from 'sharp'

const SOCIAL_IMAGE_WIDTH = 1080
const SOCIAL_IMAGE_HEIGHT = 1440
const MAX_PREPARED_IMAGE_BYTES = 2_750_000
const MAX_PROVIDER_DATA_URL_LENGTH = 20_000_000

export function imageBufferFromDataUrl(dataUrl) {
  const value = String(dataUrl || '')
  if (value.length > MAX_PROVIDER_DATA_URL_LENGTH) {
    throw new Error('La imagen generada excede el tamaño máximo de entrada')
  }
  const match = value.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/]+={0,2})$/)
  if (!match || match[2].length % 4 !== 0) {
    throw new Error('La imagen generada no tiene un formato válido')
  }
  return { buffer: Buffer.from(match[2], 'base64'), mimeType: match[1] }
}

function preparedFileName(fileName) {
  const currentName = fileName || 'sac-borrador-social.jpg'
  return currentName.replace(/\.[^.]+$/, '') + '.jpg'
}

export function markGeneratedImageAssetPrepared(asset) {
  if (!asset?.dataUrl) return asset
  const { buffer, mimeType } = imageBufferFromDataUrl(asset.dataUrl)
  if (buffer.length > MAX_PREPARED_IMAGE_BYTES) {
    throw new Error('La imagen generada excede el tamaño seguro de descarga')
  }
  return {
    ...asset,
    mimeType,
    preparedForDisplay: true,
  }
}

export async function normalizeGeneratedImageAsset(asset) {
  if (!asset?.dataUrl) return asset

  const { buffer } = imageBufferFromDataUrl(asset.dataUrl)
  const normalized = await sharp(buffer, {
    failOn: 'error',
    limitInputPixels: 40_000_000,
  })
    .rotate()
    .resize({
      width: SOCIAL_IMAGE_WIDTH,
      height: SOCIAL_IMAGE_HEIGHT,
      fit: 'cover',
      position: 'centre',
    })
    .flatten({ background: '#0B081C' })
    .jpeg({
      quality: 90,
      mozjpeg: true,
      chromaSubsampling: '4:4:4',
    })
    .toBuffer()

  if (normalized.length > MAX_PREPARED_IMAGE_BYTES) {
    throw new Error('La imagen generada excede el tamaño seguro de descarga')
  }

  return {
    ...asset,
    mimeType: 'image/jpeg',
    dataUrl: `data:image/jpeg;base64,${normalized.toString('base64')}`,
    downloadFileName: preparedFileName(asset.downloadFileName),
    preparedForDisplay: true,
  }
}
