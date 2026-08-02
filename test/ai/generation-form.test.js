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

  test('shows the shared destination and no platform selectors', () => {
    act(() =>
      root.render(
        <GenerationForm
          canGenerate
          formState={DEFAULT_GENERATION_FORM}
          onFormChange={() => {}}
          onSubmit={() => {}}
          contentTypes={[{ id: 'observation_night', label: 'Noche de Observación' }]}
        />
      )
    )

    expect(container.textContent).toContain(
      'El caption y la imagen se compartirán en X, Instagram y Facebook.'
    )
    expect(container.querySelector('[id^="gen-platform-"]')).toBeNull()
  })
})
