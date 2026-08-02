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
})

describe('GenerationResult captions', () => {
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

  test('renders replicated drafts as one shared caption', () => {
    const shared = 'El mismo caption para las tres redes.'
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
    expect(container.textContent).toContain('Caption compartido')
    expect(container.querySelector('textarea').value).toBe(shared)
    expect(container.textContent).toContain('X · Instagram · Facebook')
  })

  test('edits and copies the shared caption, then restores the original', async () => {
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
      button.textContent.includes('Copiar caption')
    )

    await act(async () => copyButton.click())

    expect(writeText).toHaveBeenCalledWith(edited)
    expect(copyButton.textContent).toContain('Caption copiado')
    expect(copyButton.querySelector('svg')).not.toBeNull()
    expect(container.querySelector('[role="status"]').textContent).toBe('Caption copiado')

    const restoreButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Restaurar original')
    )
    act(() => restoreButton.click())
    expect(textarea.value).toBe(shared)
    expect(container.textContent).not.toContain('Restaurar original')
  })

  test('keeps distinct historical captions as separate cards', () => {
    const result = {
      drafts: [
        { platform: 'instagram', contentType: 'regular_post', draftText: 'Caption anterior de IG' },
        { platform: 'facebook', contentType: 'regular_post', draftText: 'Caption anterior de FB' },
      ],
    }

    act(() => root.render(<GenerationResult result={result} />))

    expect(container.querySelector('[data-testid="generation-shared-caption"]')).toBeNull()
    expect(container.textContent).toContain('Borradores generados (2)')
    expect(Array.from(container.querySelectorAll('textarea')).map((field) => field.value)).toEqual([
      'Caption anterior de IG',
      'Caption anterior de FB',
    ])
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
