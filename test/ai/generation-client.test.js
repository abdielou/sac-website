import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import AiGenerationClient from '../../components/admin/ai/AiGenerationClient'
import { getDefaultGuidelines } from '../../lib/ai-guidelines'
import { GenerationDraftProvider } from '../../lib/hooks/GenerationDraftProvider'

let mockActiveGuidelines
let mockGuidelinesHydrated
let mockGenerationRun

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: { user: { accessibleActions: ['write_ai'] } } }),
}))

jest.mock('@/lib/hooks/useActiveGuidelines', () => ({
  useActiveGuidelines: () => ({
    active: mockActiveGuidelines,
    hydrated: mockGuidelinesHydrated,
  }),
}))

jest.mock('@/lib/hooks/useAiGenerationRun', () => ({
  useAiGenerationRun: () => mockGenerationRun,
}))

jest.mock('@/components/admin/ai/GenerationForm', () => {
  const React = require('react')
  const actual = jest.requireActual('@/components/admin/ai/GenerationForm')
  return {
    __esModule: true,
    ...actual,
    default: ({ formState, loading, onFormChange }) =>
      React.createElement(
        'div',
        null,
        React.createElement(
          'button',
          {
            type: 'button',
            disabled: loading,
            'data-testid': 'content-type',
            onClick: () => onFormChange({ ...formState, contentType: 'carousel' }),
          },
          formState.contentType
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'sponsor',
            onClick: () =>
              onFormChange({
                ...formState,
                sponsorLogo: {
                  dataUrl: 'data:image/png;base64,AAAA',
                  mimeType: 'image/png',
                  fileName: 'sponsor.png',
                },
              }),
          },
          'Añadir sponsor'
        ),
        React.createElement(
          'span',
          { 'data-testid': 'sponsor-value' },
          formState.sponsorLogo?.fileName || ''
        ),
        React.createElement(
          'button',
          {
            type: 'button',
            'data-testid': 'image-only',
            onClick: () =>
              onFormChange({
                ...formState,
                generationMode: 'image_only',
                publicationText: '**Texto existente** 🔭\nSegunda línea',
              }),
          },
          'Solo imagen'
        ),
        React.createElement(
          'span',
          { 'data-testid': 'generation-mode-value' },
          formState.generationMode
        ),
        React.createElement(
          'span',
          { 'data-testid': 'publication-text-value' },
          formState.publicationText
        )
      ),
  }
})

jest.mock('@/components/admin/ai/GenerationResult', () => () => null)

function guidelinesWithFirstContentType(id) {
  const document = getDefaultGuidelines()
  const selectedIndex = document.contentTypeCatalog.findIndex((entry) => entry.id === id)
  const [selected] = document.contentTypeCatalog.splice(selectedIndex, 1)
  document.contentTypeCatalog.unshift(selected)
  return document
}

describe('AiGenerationClient Guidelines defaults', () => {
  let container
  let root

  beforeAll(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    mockActiveGuidelines = null
    mockGuidelinesHydrated = false
    mockGenerationRun = {
      phase: 'idle',
      result: null,
      usage: null,
      guidelineVersion: null,
      policyVersion: null,
      contentTypeIdentity: null,
      error: null,
      failure: null,
      isBusy: false,
      isBlockedByOtherRun: false,
      hasCurrentDraft: true,
      canRetry: false,
      submitGeneration: jest.fn(),
      retryGeneration: jest.fn(),
      resetRun: jest.fn(),
    }

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderPanel(panel = 'generate') {
    act(() =>
      root.render(
        <GenerationDraftProvider>
          {panel === 'generate' ? <AiGenerationClient /> : <div data-testid="validator" />}
        </GenerationDraftProvider>
      )
    )
  }

  test('starts with the first active content type in Guidelines order', () => {
    renderPanel()
    expect(container.querySelector('[data-testid="content-type"]').textContent).toBe('')
    expect(container.querySelector('[data-testid="content-type"]').disabled).toBe(true)

    mockActiveGuidelines = guidelinesWithFirstContentType('regular_post')
    mockGuidelinesHydrated = true
    renderPanel()

    expect(container.querySelector('[data-testid="content-type"]').textContent).toBe('regular_post')
    expect(container.querySelector('[data-testid="content-type"]').disabled).toBe(false)
  })

  test('preserves a manual selection when Guidelines options refresh', () => {
    renderPanel()

    mockActiveGuidelines = guidelinesWithFirstContentType('regular_post')
    mockGuidelinesHydrated = true
    renderPanel()
    act(() => container.querySelector('[data-testid="content-type"]').click())

    mockActiveGuidelines = guidelinesWithFirstContentType('event_promotion')
    renderPanel()

    expect(container.querySelector('[data-testid="content-type"]').textContent).toBe('carousel')
  })

  test('keeps the entire generator draft when the generator panel is unmounted', () => {
    mockActiveGuidelines = guidelinesWithFirstContentType('regular_post')
    mockGuidelinesHydrated = true
    renderPanel()

    act(() => container.querySelector('[data-testid="content-type"]').click())
    act(() => container.querySelector('[data-testid="sponsor"]').click())
    act(() => container.querySelector('[data-testid="image-only"]').click())
    renderPanel('validate')
    expect(container.querySelector('[data-testid="validator"]')).not.toBeNull()

    renderPanel()
    expect(container.querySelector('[data-testid="content-type"]').textContent).toBe('carousel')
    expect(container.querySelector('[data-testid="sponsor-value"]').textContent).toBe('sponsor.png')
    expect(container.querySelector('[data-testid="generation-mode-value"]').textContent).toBe(
      'image_only'
    )
    expect(container.querySelector('[data-testid="publication-text-value"]').textContent).toBe(
      '**Texto existente** 🔭\nSegunda línea'
    )
  })

  test('falls back to the first active type when the saved type is archived while away', () => {
    mockActiveGuidelines = guidelinesWithFirstContentType('regular_post')
    mockGuidelinesHydrated = true
    renderPanel()
    act(() => container.querySelector('[data-testid="content-type"]').click())
    renderPanel('validate')

    mockActiveGuidelines = guidelinesWithFirstContentType('event_promotion')
    mockActiveGuidelines.contentTypeCatalog = mockActiveGuidelines.contentTypeCatalog.map(
      (entry) => (entry.id === 'carousel' ? { ...entry, status: 'archived' } : entry)
    )
    renderPanel()

    expect(container.querySelector('[data-testid="content-type"]').textContent).toBe(
      'event_promotion'
    )
  })

  test('shows only a friendly failure and delegates retry without rebuilding an unvalidated body', () => {
    mockActiveGuidelines = guidelinesWithFirstContentType('regular_post')
    mockGuidelinesHydrated = true
    mockGenerationRun = {
      ...mockGenerationRun,
      phase: 'failed',
      error: 'Workflow run "wrun_01KZPQ2JPVF78SRYBE3YEEY7QS" failed: detalle técnico heredado',
      failure: {
        schemaVersion: 1,
        code: 'policy_classification_unavailable',
        stage: 'request',
        retryable: true,
        message:
          'La revisión de política no pudo completarse. No se confirmó una infracción del contenido; intenta nuevamente.',
      },
      canRetry: true,
    }
    renderPanel()
    act(() => container.querySelector('[data-testid="image-only"]').click())

    expect(container.textContent).toContain(
      'La revisión de política no pudo completarse. No se confirmó una infracción del contenido; intenta nuevamente.'
    )
    expect(container.textContent).not.toMatch(
      /policy_classification_unavailable|stage|request|wrun_01KZPQ2JPVF78SRYBE3YEEY7QS/
    )

    const retryButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Intentar de nuevo'
    )
    const backButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Volver al formulario'
    )
    expect(retryButton).toBeDefined()
    expect(backButton).toBeDefined()

    act(() => retryButton.click())
    expect(mockGenerationRun.retryGeneration).toHaveBeenCalledTimes(1)
    expect(mockGenerationRun.retryGeneration).toHaveBeenCalledWith()

    act(() => backButton.click())
    expect(mockGenerationRun.resetRun).toHaveBeenCalledTimes(1)
  })

  test.each([
    {
      name: 'configuration failure',
      code: 'image_provider_not_configured',
      stage: 'image_prompt',
      retryable: false,
      message:
        'El proveedor de imágenes no está configurado. Un administrador debe completar la configuración.',
      title: 'Falta configurar la generación de imágenes',
      summary: 'Un administrador debe añadir la credencial de OpenRouter.',
      recovery: 'primero debe corregirse la configuración',
      offersRetry: false,
    },
    {
      name: 'exhausted transient failure',
      code: 'image_provider_retry_exhausted',
      stage: 'image_provider',
      retryable: true,
      message: 'El servicio no devolvió una imagen utilizable después de los intentos automáticos.',
      title: 'El servicio de imágenes no respondió',
      summary: 'No recibimos una imagen utilizable después de los intentos automáticos.',
      recovery: 'Ya reintentamos la generación automáticamente',
      offersRetry: true,
    },
    {
      name: 'post-processing failure',
      code: 'image_post_processing_failed',
      stage: 'image_preparation',
      retryable: true,
      message:
        'El proveedor generó un archivo, pero no pudo convertirse en una imagen segura para mostrar.',
      title: 'La imagen se generó, pero no quedó lista',
      summary: 'no pudimos convertirlo en una imagen segura para mostrar y descargar',
      recovery: 'Regeneramos y preparamos la imagen automáticamente',
      offersRetry: true,
    },
    {
      name: 'non-retryable local asset failure',
      code: 'image_asset_processing_failed',
      stage: 'image_generation',
      retryable: false,
      message: 'Ocurrió un fallo interno al preparar el asset.',
      title: 'La respuesta no pudo prepararse como imagen',
      summary: 'ocurrió un fallo interno al preparar el asset',
      recovery: 'no se corrige consumiendo otra generación',
      offersRetry: false,
    },
  ])(
    'explains a $name, the automatic recovery, and the preserved form',
    ({ code, stage, retryable, message, title, summary, recovery, offersRetry }) => {
      mockActiveGuidelines = guidelinesWithFirstContentType('regular_post')
      mockGuidelinesHydrated = true
      mockGenerationRun = {
        ...mockGenerationRun,
        phase: 'failed',
        error: 'La generación falló',
        failure: {
          schemaVersion: 1,
          code,
          stage,
          retryable,
          message,
        },
        // Deliberately true for the configuration case: the presentation must
        // still honor the terminal failure's non-retryable classification.
        canRetry: true,
      }
      renderPanel()

      const assistedFailure = container.querySelector('[data-testid="generation-assisted-failure"]')
      expect(assistedFailure).not.toBeNull()
      expect(assistedFailure.textContent).toContain(title)
      expect(assistedFailure.textContent).toContain(summary)
      expect(assistedFailure.textContent).toContain('Recuperación automática')
      expect(assistedFailure.textContent).toContain(recovery)
      expect(assistedFailure.textContent).toContain('Tu trabajo')
      expect(assistedFailure.textContent).toContain('Tu formulario sigue aquí')
      expect(assistedFailure.textContent).toContain('no necesitas empezar de nuevo')
      expect(assistedFailure.textContent).not.toContain(code)
      expect(assistedFailure.textContent).not.toContain(stage)

      const retryButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Intentar de nuevo'
      )
      const backButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Volver al formulario'
      )
      expect(Boolean(retryButton)).toBe(offersRetry)
      expect(backButton).toBeDefined()

      if (retryButton) {
        act(() => retryButton.click())
        expect(mockGenerationRun.retryGeneration).toHaveBeenCalledTimes(1)
      } else {
        expect(mockGenerationRun.retryGeneration).not.toHaveBeenCalled()
      }
    }
  )

  test('keeps the assisted recovery presentation for a legacy required-image failure', () => {
    mockActiveGuidelines = guidelinesWithFirstContentType('regular_post')
    mockGuidelinesHydrated = true
    mockGenerationRun = {
      ...mockGenerationRun,
      phase: 'failed',
      error: 'La generación falló',
      failure: {
        schemaVersion: 1,
        code: 'required_image_unavailable',
        stage: 'image_generation',
        retryable: true,
        message: 'No se pudo preparar la imagen solicitada. Intenta nuevamente.',
      },
      canRetry: true,
    }
    renderPanel()

    const assistedFailure = container.querySelector('[data-testid="generation-assisted-failure"]')
    expect(assistedFailure.textContent).toContain('No pudimos completar la imagen')
    expect(assistedFailure.textContent).toContain(
      'No se pudo preparar la imagen solicitada. Intenta nuevamente.'
    )
    expect(assistedFailure.textContent).toContain('Tu formulario sigue aquí')
    expect(
      Array.from(container.querySelectorAll('button')).some(
        (button) => button.textContent === 'Intentar de nuevo'
      )
    ).toBe(true)
  })

  test('does not claim that form data survived when a failed run was adopted after leaving', () => {
    mockActiveGuidelines = guidelinesWithFirstContentType('regular_post')
    mockGuidelinesHydrated = true
    mockGenerationRun = {
      ...mockGenerationRun,
      phase: 'failed',
      error: 'La generación falló',
      failure: {
        schemaVersion: 1,
        code: 'image_provider_retry_exhausted',
        stage: 'image_provider',
        retryable: true,
        message: 'El servicio de imágenes no respondió.',
      },
      hasCurrentDraft: false,
      canRetry: false,
    }
    renderPanel()

    const assistedFailure = container.querySelector('[data-testid="generation-assisted-failure"]')
    expect(assistedFailure.textContent).toContain('esta ejecución se recuperó después de salir')
    expect(assistedFailure.textContent).toContain('revisa el formulario actual')
    expect(assistedFailure.textContent).not.toContain('Tu formulario sigue aquí')
    expect(assistedFailure.textContent).not.toContain('no necesitas empezar de nuevo')
  })

  test('offers only the reset action when a failed run has no same-session retry', () => {
    mockActiveGuidelines = guidelinesWithFirstContentType('regular_post')
    mockGuidelinesHydrated = true
    mockGenerationRun = {
      ...mockGenerationRun,
      phase: 'failed',
      error: 'La generación falló',
      failure: {
        schemaVersion: 1,
        code: 'provider_generation_failed',
        stage: 'generation',
        retryable: true,
        message: 'No se pudieron generar los borradores. Intenta nuevamente.',
      },
      canRetry: false,
    }
    renderPanel()

    const labels = Array.from(container.querySelectorAll('button')).map(
      (button) => button.textContent
    )
    expect(labels).not.toContain('Intentar de nuevo')
    expect(labels).toContain('Volver al formulario')

    const backButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Volver al formulario'
    )
    act(() => backButton.click())
    expect(mockGenerationRun.resetRun).toHaveBeenCalledTimes(1)
    expect(mockGenerationRun.retryGeneration).not.toHaveBeenCalled()
  })
})
