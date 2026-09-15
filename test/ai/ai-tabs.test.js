import {
  buildAiTabHref,
  resolveAiTab,
  DEFAULT_AI_TAB,
} from '../../components/admin/ai/AiDesignerTabs'

describe('AiDesignerTabs URL helpers', () => {
  test('resolveAiTab defaults to validar', () => {
    expect(resolveAiTab(null)).toBe(DEFAULT_AI_TAB)
    expect(resolveAiTab('')).toBe('validar')
    expect(resolveAiTab('unknown')).toBe('validar')
    expect(resolveAiTab('generar')).toBe('generar')
    expect(resolveAiTab('guidelines')).toBe('guidelines')
  })

  test('buildAiTabHref carries a run only into its owning tab', () => {
    expect(buildAiTabHref('validar')).toBe('/admin/ai')
    expect(buildAiTabHref('validar', { runId: 'abc' })).toBe('/admin/ai?runId=abc')
    expect(buildAiTabHref('generar')).toBe('/admin/ai?tab=generar')
    expect(buildAiTabHref('generar', { runId: 'abc' })).toBe('/admin/ai?tab=generar')
    expect(buildAiTabHref('generar', { runId: 'abc', runMode: 'generate' })).toBe(
      '/admin/ai?tab=generar&runId=abc'
    )
    expect(buildAiTabHref('validar', { runId: 'abc', runMode: 'generate' })).toBe('/admin/ai')
    expect(buildAiTabHref('guidelines')).toBe('/admin/ai?tab=guidelines')
  })
})
