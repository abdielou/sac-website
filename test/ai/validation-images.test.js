import { MAX_IMAGE_SIZE_BYTES, MAX_VALIDATION_IMAGES } from '../../lib/ai-constants'
import { mergeValidationImages, validateImageFiles } from '../../lib/ai-validation-images'

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
