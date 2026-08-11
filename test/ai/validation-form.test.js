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
    const definition = resolveContentTypeDefinition(document, 'regular_post')
    definition.platforms = ['instagram', 'facebook']
    const formState = {
      ...DEFAULT_FORM,
      contentType: 'regular_post',
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
          contentTypes={[{ id: 'regular_post', label: 'Publicación regular', definition }]}
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
})
