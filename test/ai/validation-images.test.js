import { MAX_IMAGE_SIZE_BYTES, MAX_VALIDATION_IMAGES } from '../../lib/ai-constants'
import {
  MAX_VALIDATION_IMAGE_DATA_URL_LENGTH,
  mergeValidationImages,
  normalizeSerializedValidationImages,
  validateImageFiles,
  validateSerializedValidationImage,
} from '../../lib/ai-validation-images'

function makeFile({ name = 'photo.png', type = 'image/png', size = 1024 } = {}) {
  const buffer = new Uint8Array(size)
  return new File([buffer], name, { type })
}

describe('ai-validation-images', () => {
  test('accepts a valid image list within the limit', () => {
    const files = [makeFile(), makeFile({ name: 'b.jpg', type: 'image/jpeg' })]
    expect(validateImageFiles(files)).toBeNull()
  })

  test('rejects more than MAX_VALIDATION_IMAGES', () => {
    const files = Array.from({ length: MAX_VALIDATION_IMAGES + 1 }, (_, i) =>
      makeFile({ name: `img-${i}.png` })
    )
    expect(validateImageFiles(files)).toBe(`Máximo ${MAX_VALIDATION_IMAGES} imágenes.`)
  })

  test('rejects oversized images', () => {
    const files = [makeFile({ size: MAX_IMAGE_SIZE_BYTES + 1 })]
    expect(validateImageFiles(files)).toBe(
      `Cada imagen debe ser menor a ${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)} MB.`
    )
  })

  test('rejects non-image mime types', () => {
    const files = [makeFile({ name: 'notes.pdf', type: 'application/pdf' })]
    expect(validateImageFiles(files)).toBe('Solo se permiten archivos de imagen.')
  })

  test('rejects unsupported image formats', () => {
    const files = [makeFile({ name: 'animation.gif', type: 'image/gif' })]
    expect(validateImageFiles(files)).toBe('Solo se permiten imágenes PNG, JPEG o WebP.')
  })

  test('merge appends valid files onto the current selection', () => {
    const current = [makeFile({ name: 'a.png' })]
    const incoming = [makeFile({ name: 'b.png' }), makeFile({ name: 'c.png' })]
    const result = mergeValidationImages(current, incoming)
    expect(result.error).toBeNull()
    expect(result.images).toHaveLength(3)
    expect(result.images.map((f) => f.name)).toEqual(['a.png', 'b.png', 'c.png'])
  })

  test('merge keeps previous images when the combined set exceeds the max', () => {
    const current = Array.from({ length: MAX_VALIDATION_IMAGES - 1 }, (_, i) =>
      makeFile({ name: `kept-${i}.png` })
    )
    const incoming = [makeFile({ name: 'ok.png' }), makeFile({ name: 'too-many.png' })]
    const result = mergeValidationImages(current, incoming)
    expect(result.error).toBe(`Máximo ${MAX_VALIDATION_IMAGES} imágenes.`)
    expect(result.images).toBe(current)
    expect(result.images).toHaveLength(MAX_VALIDATION_IMAGES - 1)
  })

  test('merge keeps previous images when an incoming file is invalid', () => {
    const current = [makeFile({ name: 'kept.png' })]
    const incoming = [makeFile({ name: 'bad.pdf', type: 'application/pdf' })]
    const result = mergeValidationImages(current, incoming)
    expect(result.error).toBe('Solo se permiten archivos de imagen.')
    expect(result.images).toBe(current)
  })
})

describe('serialized (JSON) validation images', () => {
  const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const validImage = {
    dataUrl: `data:image/png;base64,${pngBytes.toString('base64')}`,
    mimeType: 'image/png',
    fileName: 'post.png',
    size: pngBytes.length,
  }

  test('normalizes a valid image and fills the decoded size', () => {
    const result = normalizeSerializedValidationImages([validImage])

    expect(result).toEqual({
      ok: true,
      images: [
        {
          dataUrl: validImage.dataUrl,
          mimeType: 'image/png',
          fileName: 'post.png',
          size: pngBytes.length,
        },
      ],
    })
  })

  test('rejects a non-array images value', () => {
    expect(normalizeSerializedValidationImages({ dataUrl: validImage.dataUrl })).toEqual({
      ok: false,
      error: 'images debe ser una lista.',
    })
    expect(normalizeSerializedValidationImages('data:image/png;base64,AA==').ok).toBe(false)
  })

  test('rejects more than MAX_VALIDATION_IMAGES', () => {
    const images = Array.from({ length: MAX_VALIDATION_IMAGES + 1 }, () => validImage)

    expect(normalizeSerializedValidationImages(images)).toEqual({
      ok: false,
      error: `Máximo ${MAX_VALIDATION_IMAGES} imágenes.`,
    })
  })

  test('rejects a declared MIME that differs from the data URL header', () => {
    expect(validateSerializedValidationImage({ ...validImage, mimeType: 'image/jpeg' })).toEqual({
      ok: false,
      error: 'El tipo declarado no coincide con la imagen.',
    })
  })

  test('rejects a data URL MIME outside the allowlist', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')

    expect(
      validateSerializedValidationImage({
        dataUrl: `data:image/svg+xml;base64,${svg}`,
        mimeType: 'image/svg+xml',
      })
    ).toEqual({ ok: false, error: 'La imagen debe usar un data URL base64 válido.' })
  })

  test('rejects an oversized data URL before decoding it', () => {
    const oversized = {
      dataUrl: `data:image/png;base64,${'A'.repeat(MAX_VALIDATION_IMAGE_DATA_URL_LENGTH)}`,
      mimeType: 'image/png',
    }

    expect(validateSerializedValidationImage(oversized)).toEqual({
      ok: false,
      error: 'La imagen excede el tamaño máximo permitido.',
    })
  })

  test('rejects a decoded payload above MAX_IMAGE_SIZE_BYTES', () => {
    const base64Length = Math.ceil((MAX_IMAGE_SIZE_BYTES + 3) / 3) * 4
    const tooLarge = {
      dataUrl: `data:image/png;base64,${'A'.repeat(base64Length)}`,
      mimeType: 'image/png',
    }

    expect(validateSerializedValidationImage(tooLarge)).toEqual({
      ok: false,
      error: 'Cada imagen debe ser menor a 5 MB.',
    })
  })

  test('rejects a declared size that does not match the decoded bytes', () => {
    expect(validateSerializedValidationImage({ ...validImage, size: 999 })).toEqual({
      ok: false,
      error: 'El tamaño declarado no coincide con la imagen.',
    })
  })

  test('stops at the first invalid image in the list', () => {
    const result = normalizeSerializedValidationImages([validImage, { dataUrl: 'nope' }])

    expect(result.ok).toBe(false)
  })
})
