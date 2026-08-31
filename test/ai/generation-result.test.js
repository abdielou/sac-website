import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import GenerationResult from '../../components/admin/ai/GenerationResult'

const IMAGE_DATA_URL = 'data:image/jpeg;base64,aaaa'
const RESULT = {
  drafts: [],
  generatedImage: {
    assetId: 'shared-image',
    status: 'draft',
    dataUrl: IMAGE_DATA_URL,
    downloadFileName: 'sac-borrador-social.jpg',
  },
}

describe('GenerationResult image preview', () => {
  let container
  let root

  beforeAll(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    document.body.style.overflow = ''
  })

  test('opens the same bitmap at viewport size and restores focus after Escape', () => {
    act(() => root.render(<GenerationResult result={RESULT} />))

    const trigger = document.querySelector('button[aria-label="Ampliar imagen generada"]')
    expect(trigger).not.toBeNull()
    expect(trigger.querySelector('img').getAttribute('src')).toBe(IMAGE_DATA_URL)

    act(() => trigger.click())

    const dialog = document.querySelector('[role="dialog"]')
    const closeButton = dialog.querySelector('button')
    expect(dialog.querySelector('img').getAttribute('src')).toBe(IMAGE_DATA_URL)
    expect(document.body.style.overflow).toBe('hidden')
    expect(document.activeElement).toBe(closeButton)

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(trigger)
  })

  test('keeps image clicks open and closes from the dark backdrop', () => {
    act(() => root.render(<GenerationResult result={RESULT} />))
    const trigger = document.querySelector('button[aria-label="Ampliar imagen generada"]')

    act(() => trigger.click())
    let dialog = document.querySelector('[role="dialog"]')
    const expandedImage = dialog.querySelector('img')

    act(() => {
      expandedImage.click()
    })
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()

    dialog = document.querySelector('[role="dialog"]')
    act(() => {
      dialog.parentElement.click()
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  test('confirms the image download in the action itself', () => {
    const anchorClick = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {})
    act(() => root.render(<GenerationResult result={RESULT} />))

    const downloadButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Descargar imagen')
    )

    act(() => downloadButton.click())

    expect(anchorClick).toHaveBeenCalledTimes(1)
    expect(downloadButton.textContent).toContain('Imagen descargada')
    expect(downloadButton.querySelector('svg')).not.toBeNull()
    anchorClick.mockRestore()
  })

  test('shows a gray-policy image but gates download behind human confirmation', () => {
    act(() =>
      root.render(
        <GenerationResult
          result={{
            ...RESULT,
            drafts: [
              {
                platform: 'instagram',
                contentType: 'observation_night',
                draftText: 'Noche de Observación el 15 de agosto.',
              },
            ],
            policyReview: {
              stage: 'result',
              disposition: 'review',
              categories: ['fabricated_facts'],
              reason: 'No pude confirmar si el afiche debía mostrar el año.',
              failClosed: false,
            },
          }}
        />
      )
    )

    expect(container.textContent).toContain('Política: revisar')
    expect(container.querySelector('[data-testid="generation-shared-image"]')).not.toBeNull()
    const download = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Descargar imagen')
    )
    expect(download.disabled).toBe(true)

    act(() => container.querySelector('input[type="checkbox"]').click())
    expect(download.disabled).toBe(false)
  })

  test('presents a fail-closed review as unavailable instead of an invalid request', () => {
    act(() =>
      root.render(
        <GenerationResult
          result={{
            ...RESULT,
            policyReview: {
              stage: 'result',
              disposition: 'review',
              categories: ['invalid_request'],
              reason: 'No fue posible confirmar el cumplimiento de la política base.',
              failClosed: true,
              errorCode: 'response_error',
            },
          }}
        />
      )
    )

    expect(container.textContent).toContain('Revisión de política no disponible')
    expect(container.textContent).toContain('No se confirmó una infracción')
    expect(container.textContent).toContain('Código técnico: response_error')
    expect(container.textContent).not.toContain('invalid_request')
    expect(container.textContent).not.toContain('duda factual')
  })

  test('keeps a guideline-mismatch image as a correctable draft', () => {
    act(() =>
      root.render(
        <GenerationResult
          result={{
            ...RESULT,
            drafts: [
              {
                platform: 'instagram',
                contentType: 'holiday_greeting',
                draftText: 'Feliz Día del Padre.',
              },
            ],
            policyReview: {
              stage: 'result',
              disposition: 'review',
              categories: ['guideline_noncompliance'],
              reason: 'La imagen corresponde al tema, pero omite la felicitación requerida.',
              failClosed: false,
            },
          }}
        />
      )
    )

    expect(container.textContent).toContain('Borrador para corregir')
    expect(container.textContent).toContain('Se conserva para que puedas corregirlo')
    expect(container.textContent).toContain('No cumple una guía (guideline_noncompliance)')
    expect(container.querySelector('[data-testid="generation-shared-image"]')).not.toBeNull()
    expect(container.textContent).not.toContain('La imagen fue descartada')
  })
})

describe('GenerationResult publication text', () => {
  let container
  let root

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  test('renders replicated drafts as one shared publication text', () => {
    const shared = 'El mismo texto para las tres redes.'
    const result = {
      drafts: ['x', 'instagram', 'facebook'].map((platform) => ({
        platform,
        contentType: 'regular_post',
        draftText: shared,
        assumptions: [],
        missingInformation: [],
      })),
    }

    act(() => root.render(<GenerationResult result={result} />))

    expect(container.querySelectorAll('[data-testid="generation-shared-caption"]')).toHaveLength(1)
    expect(container.textContent).toContain('Texto compartido')
    expect(container.querySelector('textarea').value).toBe(shared)
    expect(container.textContent).toContain('X (Twitter) · Instagram · Facebook')
    expect(container.querySelector('textarea').hasAttribute('maxlength')).toBe(false)
    expect(container.textContent).toContain(`${shared.length} caracteres`)
  })

  test('shows the reason and categories while preserving blocked text for correction', () => {
    const result = {
      drafts: [
        {
          platform: 'instagram',
          contentType: 'observation_night',
          draftText: 'Acompáñanos mañana a las 8:00 p. m.',
        },
      ],
      recommendedNextStep: 'Corrige el texto y vuelve a generar.',
      humanReviewRequired: true,
      policyReview: {
        stage: 'caption',
        disposition: 'review',
        categories: ['fabricated_facts', 'deceptive_content'],
        reason: 'La hora no aparece en los datos provistos.',
        failClosed: false,
      },
    }

    act(() => root.render(<GenerationResult result={result} />))

    expect(container.textContent).toContain('Política: revisar')
    expect(container.textContent).toContain('La imagen no se generó')
    expect(container.textContent).toContain('Mostrar el motivo')
    expect(container.textContent).toContain('La hora no aparece en los datos provistos.')
    expect(container.textContent).toContain('Hechos no provistos (fabricated_facts)')
    expect(container.textContent).toContain('Contenido engañoso (deceptive_content)')
    expect(container.querySelector('textarea').value).toContain('Acompáñanos mañana')
    expect(container.querySelector('[data-testid="generation-shared-image"]')).toBeNull()
    const copyButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Copiar texto')
    )
    expect(copyButton.disabled).toBe(true)

    act(() => container.querySelector('input[type="checkbox"]').click())
    expect(copyButton.disabled).toBe(false)
  })

  test('uses the effective Guidelines limit in the shared text editor', () => {
    const shared = 'Texto compartido.'
    const result = {
      captionCharacterLimit: 500,
      drafts: ['instagram', 'facebook'].map((platform) => ({
        platform,
        contentType: 'regular_post',
        draftText: shared,
      })),
    }

    act(() => root.render(<GenerationResult result={result} />))

    expect(container.querySelector('textarea').getAttribute('maxlength')).toBe('500')
    expect(container.querySelector('[data-testid="generation-publication-text-source"]')).toBeNull()
    expect(container.textContent).toContain(`${shared.length}/500`)
    expect(container.textContent).toContain('Instagram · Facebook')
    expect(container.textContent).not.toContain('X · Instagram · Facebook')
  })

  test('uses platform names configured in Guidelines', () => {
    const result = {
      imagePlatforms: ['threads'],
      generatedImage: RESULT.generatedImage,
      drafts: [
        {
          platform: 'threads',
          contentType: 'regular_post',
          draftText: 'Texto para la red configurada.',
        },
      ],
    }

    act(() =>
      root.render(
        <GenerationResult result={result} platformLabels={{ threads: 'Threads de SAC' }} />
      )
    )

    expect(container.textContent).toContain('Threads de SAC')
    expect(container.textContent).toContain('Imagen compartida para Threads de SAC')
  })

  test('edits and copies the shared text, then restores the original', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    const shared = 'Texto listo para compartir.'
    const result = {
      drafts: ['x', 'instagram', 'facebook'].map((platform) => ({
        platform,
        contentType: 'regular_post',
        draftText: shared,
      })),
    }
    act(() => root.render(<GenerationResult result={result} />))
    const textarea = container.querySelector('textarea')
    const edited = 'Texto editado antes de compartir.'

    act(() => {
      const setTextareaValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      ).set
      setTextareaValue.call(textarea, edited)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const copyButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Copiar texto')
    )

    await act(async () => copyButton.click())

    expect(writeText).toHaveBeenCalledWith(edited)
    expect(copyButton.textContent).toContain('Texto copiado')
    expect(copyButton.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('[role="status"]').textContent).toBe('Texto copiado')

    const restoreButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Restaurar original')
    )
    act(() => restoreButton.click())
    expect(textarea.value).toBe(shared)
    expect(container.textContent).not.toContain('Restaurar original')
  })

  test('keeps distinct historical publication texts as separate cards', () => {
    const result = {
      drafts: [
        { platform: 'instagram', contentType: 'regular_post', draftText: 'Texto anterior de IG' },
        { platform: 'facebook', contentType: 'regular_post', draftText: 'Texto anterior de FB' },
      ],
    }

    act(() => root.render(<GenerationResult result={result} />))

    expect(container.querySelector('[data-testid="generation-shared-caption"]')).toBeNull()
    expect(container.textContent).toContain('Textos de la publicación (2)')
    expect(Array.from(container.querySelectorAll('textarea')).map((field) => field.value)).toEqual([
      'Texto anterior de IG',
      'Texto anterior de FB',
    ])
  })

  test('preserves provided publication text and warns without enforcing a destructive limit', () => {
    const providedText =
      'Este texto fue proporcionado por la persona y debe conservarse completo para revisión.'
    const result = {
      publicationTextSource: 'provided',
      captionCharacterLimit: 30,
      generatedImage: RESULT.generatedImage,
      imagePlatforms: ['facebook'],
      drafts: [
        {
          platform: 'facebook',
          contentType: 'regular_post',
          draftText: providedText,
        },
      ],
    }

    act(() => root.render(<GenerationResult result={result} />))

    const textarea = container.querySelector('textarea')
    expect(textarea.value).toBe(providedText)
    expect(textarea.hasAttribute('maxlength')).toBe(false)
    expect(container.textContent).toContain('Texto proporcionado — no modificado por IA')
    expect(container.textContent).toContain('Editar texto')
    expect(container.textContent).toContain('Copiar texto')
    expect(container.textContent).toContain('supera el límite configurado de 30')
    expect(container.textContent).toContain('No se recortó automáticamente')
    expect(container.textContent).toContain(
      'Editar este texto no vuelve a generar, realinear ni revisar la imagen automáticamente.'
    )
    expect(container.textContent).not.toMatch(/\bcaption\b/i)
  })

  test('hides image prompts for template results', () => {
    const result = {
      drafts: [
        {
          platform: 'instagram',
          contentType: 'event_promotion',
          draftText: 'Observa el cielo con SAC.',
          imagePrompt: 'A starry Caribbean backdrop.',
        },
      ],
      templateRequest: {
        layout: 'event',
        textFields: { headline: 'Noche de observación' },
      },
    }

    act(() => root.render(<GenerationResult result={result} />))

    expect(container.querySelector('[data-testid="generation-image-prompt-instagram"]')).toBeNull()
    expect(container.textContent).not.toContain('Prompt de imagen')
  })
})
