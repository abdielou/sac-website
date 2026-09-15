import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const mockUseCoordinator = jest.fn()

jest.mock('next/link', () => {
  function MockLink({ href, children, ...props }) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    )
  }
  return MockLink
})
jest.mock('../../lib/hooks/AiRunProvider', () => {
  const actual = jest.requireActual('../../lib/hooks/AiRunProvider')
  return { ...actual, useOptionalAiRunCoordinator: () => mockUseCoordinator() }
})
jest.mock(
  '../../components/admin/PermissionGate',
  () =>
    ({ children }) =>
      children
)
jest.mock('../../components/admin/ai/HumanReviewNotice', () => () => null)
jest.mock('../../components/admin/ai/AiDesignerTabs', () => ({
  __esModule: true,
  default: () => null,
  useAiTab: () => 'validar',
}))
jest.mock('../../components/admin/ai/AiValidationClient', () => () => null)
jest.mock('../../components/admin/ai/AiGenerationClient', () => () => null)
jest.mock('../../components/admin/ai/GuidelinesClient', () => () => null)

import { AiRunStatusNotice } from '../../components/admin/ai/AiDesignerShell'

describe('AI run notices', () => {
  test('shows local degradation and a link from a different AI tab', () => {
    mockUseCoordinator.mockReturnValue({
      slot: {
        hydrated: true,
        mode: 'generate',
        runId: 'run-active',
        status: 'running',
        coordination: 'local',
      },
    })

    const html = renderToStaticMarkup(<AiRunStatusNotice activeTab="guidelines" />)

    expect(html).toContain('data-testid="ai-local-coordination-warning"')
    expect(html).toContain('data-testid="ai-run-resume-notice"')
    expect(html).toContain('/admin/ai?tab=generar&amp;runId=run-active')
  })

  test('does not show a resume notice inside the tab that owns the run', () => {
    mockUseCoordinator.mockReturnValue({
      slot: {
        hydrated: true,
        mode: 'validate',
        runId: 'run-validation',
        status: 'completed',
        coordination: 's3',
      },
    })

    const html = renderToStaticMarkup(<AiRunStatusNotice activeTab="validar" />)

    expect(html).not.toContain('ai-run-resume-notice')
    expect(html).not.toContain('ai-local-coordination-warning')
  })
})
