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
      'Se generarán un caption y una imagen compartidos para Instagram y Facebook, según Guidelines.'
    )
    expect(container.querySelector('[id^="gen-platform-"]')).toBeNull()
  })
})
