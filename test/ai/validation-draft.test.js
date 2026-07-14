/**
 * @jest-environment jsdom
 */

import {
  DEFAULT_FORM,
  draftImageToFile,
  fileToDraftImage,
  mergeFormState,
} from '../../lib/ai-validation-draft'

describe('ai-validation-draft', () => {
  test('mergeFormState fills missing fields from defaults', () => {
    expect(mergeFormState(null)).toEqual(DEFAULT_FORM)
    expect(mergeFormState({ draftText: 'Hola', platform: 'x' })).toEqual({
      ...DEFAULT_FORM,
      draftText: 'Hola',
      platform: 'x',
    })
  })

  test('mergeFormState ignores non-string field values', () => {
    expect(mergeFormState({ draftText: 42, goal: undefined })).toEqual(DEFAULT_FORM)
  })

  test('fileToDraftImage / draftImageToFile round-trip preserves bytes and metadata', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5])
    const file = new File([bytes], 'luna.png', {
      type: 'image/png',
      lastModified: 1_700_000_000_000,
    })

    const stored = await fileToDraftImage(file)
    expect(stored.name).toBe('luna.png')
    expect(stored.type).toBe('image/png')
    expect(stored.lastModified).toBe(1_700_000_000_000)
    expect(stored.buffer).toBeInstanceOf(ArrayBuffer)
    expect(new Uint8Array(stored.buffer)).toEqual(bytes)

    const restored = draftImageToFile(stored)
    expect(restored).toBeInstanceOf(File)
    expect(restored.name).toBe('luna.png')
    expect(restored.type).toBe('image/png')
    expect(restored.lastModified).toBe(1_700_000_000_000)

    const restoredBuffer = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(restored)
    })
    expect(new Uint8Array(restoredBuffer)).toEqual(bytes)
  })
})
