import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import GuidelinesActivityFeed from '../../components/admin/ai/GuidelinesActivityFeed'
import GuidelinesActivationReview from '../../components/admin/ai/GuidelinesActivationReview'
import GuidelinesDraftActionBar from '../../components/admin/ai/GuidelinesDraftActionBar'
import GuidelinesPlatforms from '../../components/admin/ai/GuidelinesPlatforms'
import GuidelinesPolicyNotice from '../../components/admin/ai/GuidelinesPolicyNotice'
import GuidelinesVersionHeader from '../../components/admin/ai/GuidelinesVersionHeader'
import GuidelinesVersionHistory from '../../components/admin/ai/GuidelinesVersionHistory'
import GuidelinesWorkspaceNav from '../../components/admin/ai/GuidelinesWorkspaceNav'

describe('Guidelines workspace UI', () => {
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

  test('uses a content-first, nontechnical navigation', () => {
    const onChange = jest.fn()
    act(() => root.render(<GuidelinesWorkspaceNav activeSection="types" onChange={onChange} />))

    const buttons = Array.from(container.querySelectorAll('button'))
    expect(buttons.map((button) => button.textContent)).toEqual([
      'Tipos de contenido',
      'Reglas generales',
      'Redes sociales',
      'Historial',
    ])
    expect(buttons[0].getAttribute('aria-current')).toBe('page')

    act(() => buttons[2].click())
    expect(onChange).toHaveBeenCalledWith('platforms')
  })

  test('explains the permanent scope without workflow terminology', () => {
    act(() => root.render(<GuidelinesPolicyNotice />))

    expect(container.textContent).toContain('El propósito del agente no cambia')
    expect(container.textContent).toContain('solo ayuda a generar y validar contenido')
    expect(container.textContent).toContain('Identidad del agente: sac-social-policy-v1')
    expect(container.textContent).not.toMatch(/workflow/i)
  })

  test('hides repetitive autosaves from activity by default', () => {
    const events = [
      { id: 'save', action: 'saved', at: '2026-08-02T00:00:00.000Z' },
      { id: 'activate', action: 'activated', at: '2026-08-02T00:01:00.000Z' },
    ]
    act(() => root.render(<GuidelinesActivityFeed events={events} />))

    expect(container.textContent).toContain('Cambios activados')
    expect(container.textContent).not.toContain('Cambios guardados')
  })

  test('shows explicit draft and autosave states', () => {
    const onReview = jest.fn()
    act(() =>
      root.render(
        <GuidelinesVersionHeader
          active={{ version: 'v1' }}
          draft={{ basedOn: 'v1', document: { version: 'draft' } }}
          viewMode="draft"
          autosaveStatus="dirty"
          canWrite
          onReview={onReview}
        />
      )
    )

    expect(container.textContent).toContain('Cambios en curso')
    expect(container.textContent).toContain('Cambios sin guardar')
    const review = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Revisar y activar')
    )
    act(() => review.click())
    expect(onReview).toHaveBeenCalledTimes(1)
  })

  test('blocks review in the global header until a failed save is retried', () => {
    const onRetrySave = jest.fn()
    act(() =>
      root.render(
        <GuidelinesVersionHeader
          active={{ version: 'v1' }}
          draft={{ basedOn: 'v1', document: { version: 'draft' } }}
          viewMode="draft"
          autosaveStatus="error"
          canWrite
          onReview={() => {}}
          onRetrySave={onRetrySave}
        />
      )
    )

    const review = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Revisar y activar')
    )
    expect(review.disabled).toBe(true)

    const retry = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Reintentar'
    )
    act(() => retry.click())
    expect(onRetrySave).toHaveBeenCalledTimes(1)
  })

  test('closes contextual editing with autosave, recovery, and review actions', () => {
    const onReview = jest.fn()
    const onRetrySave = jest.fn()

    act(() =>
      root.render(
        <GuidelinesDraftActionBar
          autosaveStatus="saved"
          onReview={onReview}
          onRetrySave={onRetrySave}
        />
      )
    )

    expect(container.textContent).toContain('Guardado automáticamente como borrador')
    expect(container.textContent).toContain(
      'Estos cambios aún no se aplican al generador ni al validador.'
    )

    let review = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Revisar y activar'
    )
    expect(review.disabled).toBe(false)
    act(() => review.click())
    expect(onReview).toHaveBeenCalledTimes(1)

    act(() =>
      root.render(
        <GuidelinesDraftActionBar
          autosaveStatus="error"
          onReview={onReview}
          onRetrySave={onRetrySave}
        />
      )
    )

    expect(container.textContent).toContain('No se pudo guardar el borrador')
    review = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Revisar y activar'
    )
    expect(review.disabled).toBe(true)

    const retry = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Reintentar'
    )
    act(() => retry.click())
    expect(onRetrySave).toHaveBeenCalledTimes(1)
  })

  test('links review items to their exact field and blocks read-only activation', () => {
    const onNavigate = jest.fn()
    act(() =>
      root.render(
        <GuidelinesActivationReview
          validation={{ ok: true, issues: [], errors: [] }}
          summary={{
            hasChanges: true,
            totalChanges: 1,
            contentTypes: {
              changed: true,
              count: 1,
              label: 'Tipos de contenido',
              section: 'types',
              items: [
                {
                  id: 'event',
                  label: 'Evento',
                  path: 'contentTypeCatalog.0',
                  fields: [
                    {
                      key: 'generation',
                      label: 'Al generar',
                      path: 'contentTypeCatalog.0.generation.rules',
                    },
                  ],
                },
              ],
            },
            generalRules: { changed: false },
            platforms: { changed: false },
            images: { changed: false },
          }}
          onNavigate={onNavigate}
          onBack={() => {}}
          onActivate={() => {}}
        />
      )
    )

    const reviewLink = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Revisar'
    )
    act(() => reviewLink.click())
    expect(onNavigate).toHaveBeenCalledWith(
      'types',
      'event',
      'contentTypeCatalog.0.generation.rules'
    )

    const activate = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Activar cambios')
    )
    expect(activate.disabled).toBe(true)
    expect(container.textContent).toContain('Necesitas permiso de edición')
  })

  test('allows removing any configured network', () => {
    const onSelectedIdChange = jest.fn()
    const onRemove = jest.fn()
    act(() =>
      root.render(
        <GuidelinesPlatforms
          entries={[
            { id: 'x', label: 'X', rules: 'Valida X' },
            { id: 'instagram', label: 'Instagram', rules: 'Valida Instagram' },
            { id: 'facebook', label: 'Facebook', rules: 'Valida Facebook' },
          ]}
          document={{ generation: { platforms: { x: 'Genera X' } } }}
          selectedId="x"
          onSelectedIdChange={onSelectedIdChange}
          onRemove={onRemove}
          editable
        />
      )
    )

    expect(container.textContent).toContain('Dejar de usar esta red')
    expect(container.textContent).toContain('puedes añadir o quitar redes')
    expect(container.querySelector('#platform-x-label')).not.toBeNull()
    expect(container.querySelector('#platform-add-name')).not.toBeNull()

    const remove = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Dejar de usar esta red'
    )
    act(() => remove.click())
    expect(onRemove).toHaveBeenCalledWith('x')

    const instagram = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Instagram'
    )
    act(() => instagram.click())
    expect(onSelectedIdChange).toHaveBeenCalledWith('instagram')
  })

  test('starts editing from the selected network without losing context', () => {
    const onStartEditing = jest.fn()
    const onReview = jest.fn()
    const renderPlatforms = (editable) => (
      <GuidelinesPlatforms
        entries={[
          { id: 'x', label: 'X', rules: 'Contenido esperado en X.' },
          {
            id: 'instagram',
            label: 'Instagram',
            rules: 'Contenido esperado en Instagram.',
          },
        ]}
        document={{ platformConstraints: { instagram: { captionMaxCharacters: 2200 } } }}
        selectedId="instagram"
        editable={editable}
        canStartEditing
        autosaveStatus="saved"
        onStartEditing={onStartEditing}
        onReview={onReview}
      />
    )

    act(() => root.render(renderPlatforms(false)))

    const edit = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent.trim() === 'Editar Instagram'
    )
    expect(edit).toBeDefined()

    act(() => edit.click())
    expect(onStartEditing).toHaveBeenCalledWith('instagram')

    act(() => root.render(renderPlatforms(true)))

    expect(container.textContent).not.toContain('Editar Instagram')
    expect(container.textContent).toContain('Guardado automáticamente como borrador')
    expect(container.querySelector('#platform-instagram-label')).not.toBeNull()
    expect(document.activeElement.textContent).toBe('Instagram')

    const review = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Revisar y activar'
    )
    act(() => review.click())
    expect(onReview).toHaveBeenCalledTimes(1)
  })

  test('uses one expectation to create and review content for a network', () => {
    const onUpdateRules = jest.fn()
    act(() =>
      root.render(
        <GuidelinesPlatforms
          entries={[{ id: 'x', label: 'X', rules: 'Contenido esperado en X.' }]}
          document={{ platformConstraints: { x: { captionMaxCharacters: 280 } } }}
          selectedId="x"
          onUpdateRules={onUpdateRules}
          editable
        />
      )
    )

    expect(container.querySelectorAll('textarea')).toHaveLength(1)
    expect(container.textContent).toContain('Qué debe cumplir el contenido')
    expect(container.textContent).toContain('tanto al crear como al revisar')
    expect(container.textContent).not.toContain('Al validar')
    expect(container.textContent).not.toContain('Al generar')

    const textarea = container.querySelector('#platform-x-rules')
    act(() => {
      const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      ).set
      nativeTextareaValueSetter.call(textarea, 'Nueva expectativa para X.')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(onUpdateRules).toHaveBeenCalledWith('x', 'Nueva expectativa para X.')
  })

  test('adds a network by name only', () => {
    const onAdd = jest.fn(() => 'threads')
    const onSelectedIdChange = jest.fn()
    act(() =>
      root.render(
        <GuidelinesPlatforms
          entries={[
            { id: 'x', label: 'X', rules: 'Valida X' },
            { id: 'instagram', label: 'Instagram', rules: 'Valida Instagram' },
          ]}
          document={{ generation: { platforms: { x: 'Genera X' } } }}
          selectedId="x"
          onSelectedIdChange={onSelectedIdChange}
          onAdd={onAdd}
          editable
        />
      )
    )

    const input = container.querySelector('#platform-add-name')
    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set
      nativeInputValueSetter.call(input, 'Threads')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const add = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Añadir'
    )
    act(() => add.click())
    expect(onAdd).toHaveBeenCalledWith('Threads')
    expect(onSelectedIdChange).toHaveBeenCalledWith('threads')
  })

  test('lets nontechnical editors configure or clear a platform caption limit', () => {
    const onUpdateCaptionLimit = jest.fn()
    act(() =>
      root.render(
        <GuidelinesPlatforms
          entries={[{ id: 'x', label: 'X', rules: 'Valida X' }]}
          document={{
            platformConstraints: { x: { captionMaxCharacters: 280 } },
            generation: { platforms: { x: 'Genera X' } },
          }}
          selectedId="x"
          onUpdateCaptionLimit={onUpdateCaptionLimit}
          editable
        />
      )
    )

    expect(container.textContent).toContain('Déjalo vacío')
    const input = container.querySelector('#platform-x-caption-limit')
    expect(input.value).toBe('280')

    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set
      nativeInputValueSetter.call(input, '')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onUpdateCaptionLimit).toHaveBeenCalledWith('x', null)
  })

  test('allows rolling back to a previous version or drafting from it', () => {
    const onRollbackVersion = jest.fn()
    const onUseVersion = jest.fn()
    act(() =>
      root.render(
        <GuidelinesVersionHistory
          versions={[
            {
              version: 'v2',
              status: 'active',
              activatedAt: '2026-08-02T12:00:00.000Z',
              activatedBy: 'Luis',
            },
            {
              version: 'v1',
              status: 'historical',
              activatedAt: '2026-08-01T12:00:00.000Z',
              activatedBy: 'Luis',
            },
          ]}
          canWrite
          onRollbackVersion={onRollbackVersion}
          onUseVersion={onUseVersion}
        />
      )
    )

    const buttons = Array.from(container.querySelectorAll('button'))
    const useVersion = buttons.find((button) => button.textContent === 'Usar esta versión')
    const useAsBase = buttons.find(
      (button) => button.textContent === 'Usar como base para nuevos cambios'
    )
    expect(useVersion).toBeDefined()
    expect(useAsBase).toBeDefined()

    act(() => useVersion.click())
    expect(onRollbackVersion).toHaveBeenCalledWith('v1')

    act(() => useAsBase.click())
    expect(onUseVersion).toHaveBeenCalledWith('v1')
  })

  test('blocks previous-version actions while a draft is open', () => {
    act(() =>
      root.render(
        <GuidelinesVersionHistory
          versions={[
            { version: 'v2', status: 'active', activatedAt: '2026-08-02T12:00:00.000Z' },
            { version: 'v1', status: 'historical', activatedAt: '2026-08-01T12:00:00.000Z' },
          ]}
          canWrite
          hasDraft
          onRollbackVersion={() => {}}
          onUseVersion={() => {}}
        />
      )
    )

    const buttons = Array.from(container.querySelectorAll('button'))
    expect(buttons.every((button) => button.disabled)).toBe(true)
    expect(buttons[0].getAttribute('title')).toMatch(/Descarta o activa/i)
  })
})
