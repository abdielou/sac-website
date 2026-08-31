import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import ValidationForm, { DEFAULT_FORM } from '../../components/admin/ai/ValidationForm'
import { getDefaultGuidelines } from '../../lib/ai-guidelines'
import { resolveContentTypeDefinition } from '../../lib/ai-guidelines-schema'

describe('ValidationForm multired package', () => {
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

  test('validates one package across the platforms and image policies from Guidelines', () => {
    const document = getDefaultGuidelines()
    const definition = resolveContentTypeDefinition(document, 'post_educativo')
    definition.platforms = ['instagram', 'facebook']
    const formState = {
      ...DEFAULT_FORM,
      contentType: 'post_educativo',
      draftText: 'Texto compartido.',
      intent: 'Informar',
      topic: 'Actividad del SAC',
    }

    act(() =>
      root.render(
        <ValidationForm
          canValidate
          formState={formState}
          onFormChange={() => {}}
          images={[]}
          onImagesChange={() => {}}
          onSubmit={() => {}}
          platforms={[
            { id: 'x', label: 'X' },
            { id: 'instagram', label: 'Instagram' },
            { id: 'facebook', label: 'Facebook' },
          ]}
          contentTypes={[{ id: 'post_educativo', label: 'Post educativo', definition }]}
        />
      )
    )

    expect(container.querySelector('#ai-platform')).toBeNull()
    expect(container.textContent).toContain(
      'El texto de la publicación se validará para Instagram y Facebook.'
    )
    expect(container.textContent).toContain('Texto de la publicación')
    expect(container.textContent).not.toContain('Pie de foto')
    expect(container.textContent).toContain(
      'La imagen se revisará para Instagram y Facebook, según Guidelines.'
    )

    act(() => container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true })))
    expect(container.textContent).toContain(
      'Se requiere al menos una imagen para este paquete y tipo de contenido.'
    )
  })

  test('explains local retention and provides a confirmed start-blank action', () => {
    const document = getDefaultGuidelines()
    const definition = resolveContentTypeDefinition(document, 'post_educativo')
    const onClearDraft = jest.fn()
    const confirm = jest.spyOn(window, 'confirm').mockReturnValue(true)

    act(() =>
      root.render(
        <ValidationForm
          canValidate
          formState={{ ...DEFAULT_FORM, contentType: 'post_educativo', draftText: 'Conservarme' }}
          onFormChange={() => {}}
          images={[]}
          onImagesChange={() => {}}
          onSubmit={() => {}}
          onClearDraft={onClearDraft}
          draftSaveStatus="saved"
          draftUpdatedAt="2026-08-29T12:00:00.000Z"
          platforms={[{ id: 'x', label: 'X' }]}
          contentTypes={[{ id: 'post_educativo', label: 'Post educativo', definition }]}
        />
      )
    )

    expect(container.textContent).toContain('Borrador guardado solo en este navegador')
    expect(container.textContent).toContain('caducan 30 días después del último cambio')
    expect(container.textContent).toContain('Guardado localmente')

    const clearButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Borrar y empezar en blanco'
    )
    act(() => clearButton.click())
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(onClearDraft).toHaveBeenCalledTimes(1)
  })
})
