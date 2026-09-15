import { buildAiClientStorageUserKey } from '../../lib/ai-run-client-identity'

describe('AI run client identity', () => {
  test('produces a stable opaque namespace without exposing email or id', () => {
    const first = buildAiClientStorageUserKey({ id: 'Google-ID-123', email: 'USER@example.com' })
    const second = buildAiClientStorageUserKey({ id: 'google-id-123' })

    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(first).not.toContain('google-id-123')
    expect(first).not.toContain('user@example.com')
  })

  test('falls back to normalized email and rejects missing identity', () => {
    expect(buildAiClientStorageUserKey({ email: ' USER@example.com ' })).toBe(
      buildAiClientStorageUserKey({ email: 'user@example.com' })
    )
    expect(() => buildAiClientStorageUserKey({})).toThrow(/identificar la cuenta/)
  })
})
