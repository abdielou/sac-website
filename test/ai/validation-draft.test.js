/**
 * @jest-environment jsdom
 */

import {
  DEFAULT_FORM,
  VALIDATION_DRAFT_TTL_MS,
  draftImageToFile,
  fileToDraftImage,
  getValidationDraftUserIdentity,
  isValidationDraftExpired,
  mergeFormState,
  resolveValidationDraftOwnerKey,
  restoreValidationDraftImages,
} from '../../lib/ai-validation-draft'

describe('ai-validation-draft', () => {
  test('mergeFormState fills missing fields from defaults', () => {
    expect(mergeFormState(null)).toEqual(DEFAULT_FORM)
    expect(mergeFormState({ draftText: 'Hola', platform: 'x' })).toEqual({
      ...DEFAULT_FORM,
      draftText: 'Hola',
    })
  })

  test('mergeFormState ignores non-string field values', () => {
    expect(mergeFormState({ draftText: 42, goal: undefined })).toEqual(DEFAULT_FORM)
  })

  test('defaults content type selection to Guidelines and rejects an invalid restored sponsor', () => {
    expect(DEFAULT_FORM.contentType).toBe('')
    expect(
      mergeFormState({
        contentType: 'configured-by-guidelines',
        sponsorLogo: {
          dataUrl: 'data:text/html;base64,PHNjcmlwdD4=',
          mimeType: 'text/html',
        },
      })
    ).toEqual({
      ...DEFAULT_FORM,
      contentType: 'configured-by-guidelines',
      sponsorLogo: null,
    })
  })

  test('derives separate stable keys per authenticated user', async () => {
    expect(getValidationDraftUserIdentity({ id: 'user-a' })).toBe('id:user-a')
    expect(await resolveValidationDraftOwnerKey({ id: 'user-a' })).toBe('user-id:user-a')
    expect(await resolveValidationDraftOwnerKey({ id: 'user-b' })).toBe('user-id:user-b')
    expect(await resolveValidationDraftOwnerKey({})).toBeNull()
  })

  test('hashes an email fallback instead of exposing it in the storage key', async () => {
    const originalCrypto = global.crypto
    const originalTextEncoder = global.TextEncoder
    Object.defineProperty(global, 'crypto', {
      configurable: true,
      value: {
        subtle: {
          digest: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 254, 255]).buffer),
        },
      },
    })
    global.TextEncoder = class {
      encode(value) {
        return new Uint8Array(Array.from(value, (character) => character.charCodeAt(0)))
      }
    }

    try {
      const key = await resolveValidationDraftOwnerKey({ email: ' Editor@Example.COM ' })
      expect(key).toBe('email-sha256:0102feff')
      expect(key).not.toContain('editor@example.com')
    } finally {
      Object.defineProperty(global, 'crypto', { configurable: true, value: originalCrypto })
      global.TextEncoder = originalTextEncoder
    }
  })

  test('expires a draft 30 days after its last save, including legacy records', () => {
    const updatedAt = Date.parse('2026-08-01T00:00:00.000Z')
    const record = { updatedAt: new Date(updatedAt).toISOString() }
    expect(isValidationDraftExpired(record, updatedAt + VALIDATION_DRAFT_TTL_MS - 1)).toBe(false)
    expect(isValidationDraftExpired(record, updatedAt + VALIDATION_DRAFT_TTL_MS)).toBe(true)
    expect(isValidationDraftExpired({ updatedAt: 'invalid' }, updatedAt)).toBe(true)
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

  test('revalidates restored files and omits corrupt or unsupported entries', async () => {
    const valid = await fileToDraftImage(
      new File([new Uint8Array([1, 2, 3])], 'luna.png', { type: 'image/png' })
    )
    const unsupported = { ...valid, name: 'payload.svg', type: 'image/svg+xml' }
    const corrupt = { ...valid, name: 'corrupt.png', buffer: 'not-an-array-buffer' }

    const restored = restoreValidationDraftImages([valid, unsupported, corrupt])
    expect(restored.files).toHaveLength(1)
    expect(restored.files[0].name).toBe('luna.png')
    expect(restored.discarded).toBe(2)
  })
})
