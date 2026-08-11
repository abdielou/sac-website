import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import GenerationForm, { DEFAULT_GENERATION_FORM } from '../../components/admin/ai/GenerationForm'

describe('GenerationForm shared platforms', () => {
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
  })

  test('shows the Guidelines-driven shared destination and no platform selectors', () => {
    act(() =>
      root.render(
        <GenerationForm
          canGenerate
          formState={DEFAULT_GENERATION_FORM}
          onFormChange={() => {}}
          onSubmit={() => {}}
          contentTypes={[
            {
              id: 'observation_night',
              label: 'Noche de Observación',
              definition: {
                platforms: ['instagram', 'facebook'],
                visual: {
                  mode: 'template',
                  imagePolicyByPlatform: {
                    x: 'prohibited',
                    instagram: 'required',
                    facebook: 'optional',
                  },
                },
              },
            },
          ]}
          platformOptions={[
            { id: 'x', label: 'X' },
            { id: 'instagram', label: 'Instagram' },
            { id: 'facebook', label: 'Facebook' },
          ]}
        />
      )
    )

    expect(container.textContent).toContain(
      'Se generarán el texto y la imagen de la publicación para Instagram y Facebook, según Guidelines.'
    )
    expect(container.querySelector('[id^="gen-platform-"]')).toBeNull()
  })

  test('shows a loading placeholder instead of the first content type before initialization', () => {
    act(() =>
      root.render(
        <GenerationForm
          canGenerate
          loading
          formState={{ ...DEFAULT_GENERATION_FORM, contentType: '' }}
          onFormChange={() => {}}
          onSubmit={() => {}}
          contentTypes={[
            {
              id: 'observation_night',
              label: 'Noche de Observación',
            },
          ]}
        />
      )
    )

    const select = container.querySelector('#gen-content-type')
    expect(select.disabled).toBe(true)
    expect(select.value).toBe('')
    expect(select.selectedOptions[0].textContent).toBe('Cargando tipos de contenido...')
  })

  test('lets an event generation switch between the divided card and colored pills', () => {
    const onFormChange = jest.fn()
    act(() =>
      root.render(
        <GenerationForm
          canGenerate
          formState={DEFAULT_GENERATION_FORM}
          onFormChange={onFormChange}
          onSubmit={() => {}}
          contentTypes={[
            {
              id: 'observation_night',
              label: 'Noche de Observación',
              definition: {
                id: 'observation_night',
                fields: [],
                platforms: ['instagram', 'facebook'],
                visual: {
                  mode: 'template',
                  template: 'event',
                  backgroundSources: ['stock'],
                  imagePolicyByPlatform: {
                    instagram: 'required',
                    facebook: 'required',
                  },
                },
              },
            },
          ]}
        />
      )
    )

    const rail = container.querySelector('input[name="templatePresentation"][value="rail"]')
    const pills = container.querySelector('input[name="templatePresentation"][value="pills"]')
    expect(rail).not.toBeNull()
    expect(rail.checked).toBe(true)
    expect(pills).not.toBeNull()

    act(() => pills.click())
    expect(onFormChange).toHaveBeenCalledWith(
      expect.objectContaining({ templatePresentation: 'pills' })
    )
  })

  test('offers image-only mode, requires existing publication text, and preserves its raw value', () => {
    const onFormChange = jest.fn()
    const onSubmit = jest.fn()
    const definition = {
      id: 'post_educativo',
      fields: [],
      platforms: ['facebook'],
      visual: {
        mode: 'ai_image',
        imagePolicyByPlatform: { facebook: 'optional' },
      },
    }
    const imageOnlyState = {
      ...DEFAULT_GENERATION_FORM,
      contentType: definition.id,
      generationMode: 'image_only',
      publicationText: '',
    }

    act(() =>
      root.render(
        <GenerationForm
          canGenerate
          formState={imageOnlyState}
          onFormChange={onFormChange}
          onSubmit={onSubmit}
          contentTypes={[{ id: definition.id, label: 'Post educativo', definition }]}
          platforms={['facebook']}
          platformOptions={[{ id: 'facebook', label: 'Facebook' }]}
        />
      )
    )

    const checkbox = container.querySelector('input[type="checkbox"]')
    const textarea = container.querySelector('#gen-publication-text')
    expect(checkbox.checked).toBe(true)
    expect(checkbox.parentElement.textContent).toContain(
      'Ya tengo el texto de la publicación; generar solo la imagen'
    )
    expect(textarea.maxLength).toBe(20_000)
    expect(container.querySelector('#gen-publication-text-count').textContent).toBe('0/20000')
    expect(container.querySelector('button[type="submit"]').textContent).toContain('Generar imagen')
    expect(container.textContent).toContain('El texto de la publicación se conservará sin cambios.')

    act(() => checkbox.click())
    expect(onFormChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ generationMode: 'text_and_image', publicationText: '' })
    )
    onFormChange.mockClear()

    act(() => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true })))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(container.querySelector('#gen-publication-text-error').textContent).toContain(
      'Indica el texto de la publicación'
    )

    const rawText = '  **Mira el cielo** 🔭\n\n- Esta noche  '
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      ).set
      valueSetter.call(textarea, rawText)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onFormChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ publicationText: rawText })
    )

    act(() =>
      root.render(
        <GenerationForm
          canGenerate
          formState={{ ...imageOnlyState, publicationText: rawText }}
          onFormChange={onFormChange}
          onSubmit={onSubmit}
          contentTypes={[{ id: definition.id, label: 'Post educativo', definition }]}
          platforms={['facebook']}
          platformOptions={[{ id: 'facebook', label: 'Facebook' }]}
        />
      )
    )
    act(() => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true })))
    expect(onSubmit).toHaveBeenCalledTimes(1)

    onSubmit.mockClear()
    const overLimitText = 'a'.repeat(20_001)
    act(() =>
      root.render(
        <GenerationForm
          canGenerate
          formState={{ ...imageOnlyState, publicationText: overLimitText }}
          onFormChange={onFormChange}
          onSubmit={onSubmit}
          contentTypes={[{ id: definition.id, label: 'Post educativo', definition }]}
          platforms={['facebook']}
          platformOptions={[{ id: 'facebook', label: 'Facebook' }]}
        />
      )
    )
    act(() => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true })))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(container.querySelector('#gen-publication-text-count').textContent).toBe('20001/20000')
    expect(container.querySelector('#gen-publication-text-error').textContent).toContain(
      'admite hasta 20000 caracteres'
    )
  })

  test('coerces image-only mode when switching to a type without images without erasing text', () => {
    const onFormChange = jest.fn()
    const publicationText = '**Texto guardado** 🌌\nSegunda línea'
    const imageDefinition = {
      id: 'post_educativo',
      fields: [],
      platforms: ['facebook'],
      visual: {
        mode: 'ai_image',
        imagePolicyByPlatform: { facebook: 'optional' },
      },
    }
    const textDefinition = {
      id: 'reel_caption',
      fields: [],
      platforms: ['facebook'],
      visual: {
        mode: 'none',
        imagePolicyByPlatform: { facebook: 'prohibited' },
      },
    }

    act(() =>
      root.render(
        <GenerationForm
          canGenerate
          formState={{
            ...DEFAULT_GENERATION_FORM,
            contentType: imageDefinition.id,
            generationMode: 'image_only',
            publicationText,
          }}
          onFormChange={onFormChange}
          onSubmit={() => {}}
          contentTypes={[
            { id: imageDefinition.id, label: 'Post educativo', definition: imageDefinition },
            { id: textDefinition.id, label: 'Texto del reel', definition: textDefinition },
          ]}
          platforms={['facebook']}
        />
      )
    )

    const select = container.querySelector('#gen-content-type')
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set
      valueSetter.call(select, textDefinition.id)
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(onFormChange).toHaveBeenCalledWith(
      expect.objectContaining({
        contentType: textDefinition.id,
        generationMode: 'text_and_image',
        publicationText,
      })
    )
  })

  test('hides and resets image-only mode when current Guidelines prohibit images', () => {
    const onFormChange = jest.fn()
    const publicationText = 'Texto que no debe borrarse'
    const definition = {
      id: 'reel_caption',
      fields: [],
      platforms: ['facebook'],
      visual: {
        mode: 'none',
        imagePolicyByPlatform: { facebook: 'prohibited' },
      },
    }

    act(() =>
      root.render(
        <GenerationForm
          canGenerate
          formState={{
            ...DEFAULT_GENERATION_FORM,
            contentType: definition.id,
            generationMode: 'image_only',
            publicationText,
          }}
          onFormChange={onFormChange}
          onSubmit={() => {}}
          contentTypes={[{ id: definition.id, label: 'Texto del reel', definition }]}
          platforms={['facebook']}
        />
      )
    )

    expect(container.querySelector('input[type="checkbox"]')).toBeNull()
    expect(container.querySelector('#gen-publication-text')).toBeNull()
    expect(onFormChange).toHaveBeenCalledWith(
      expect.objectContaining({
        generationMode: 'text_and_image',
        publicationText,
      })
    )
  })
})
