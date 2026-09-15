import {
  GUIDELINE_VERSION_NAME_MAX_LENGTH,
  normalizeGuidelineVersionName,
  suggestGuidelineVersionName,
  validateGuidelineVersionName,
} from '../../lib/guideline-version-name'

describe('guideline version names', () => {
  test('normalizes whitespace and validates the user-facing name', () => {
    expect(normalizeGuidelineVersionName('  Ajustes   para\nX  ')).toBe('Ajustes para X')
    expect(validateGuidelineVersionName('  Ajustes para X  ')).toMatchObject({
      ok: true,
      versionName: 'Ajustes para X',
    })
    expect(validateGuidelineVersionName('')).toMatchObject({ ok: false })
    expect(
      validateGuidelineVersionName('a'.repeat(GUIDELINE_VERSION_NAME_MAX_LENGTH + 1))
    ).toMatchObject({ ok: false })
  })

  test('suggests a useful name from a single changed social network', () => {
    expect(
      suggestGuidelineVersionName({
        platforms: {
          key: 'platforms',
          label: 'Redes sociales',
          changed: true,
          items: [{ label: 'X' }],
        },
      })
    ).toBe('Ajustes para X')
  })

  test('uses a broad name when several areas changed', () => {
    expect(
      suggestGuidelineVersionName({
        platforms: { key: 'platforms', changed: true, items: [{ label: 'X' }] },
        generalRules: { key: 'generalRules', changed: true, items: [{ label: 'Voz' }] },
      })
    ).toBe('Actualización de guías')
  })
})
