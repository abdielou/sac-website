import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import GuidelinesActivityFeed from '../../components/admin/ai/GuidelinesActivityFeed'
import GuidelinesActivationReview from '../../components/admin/ai/GuidelinesActivationReview'
import GuidelinesContentTypeCatalog from '../../components/admin/ai/GuidelinesContentTypeCatalog'
import GuidelinesTemplatePreview from '../../components/admin/ai/GuidelinesTemplatePreview'
import GuidelinesDraftActionBar from '../../components/admin/ai/GuidelinesDraftActionBar'
import GuidelinesGeneralRules from '../../components/admin/ai/GuidelinesGeneralRules'
import GuidelinesPlatforms from '../../components/admin/ai/GuidelinesPlatforms'
import GuidelinesPolicyNotice from '../../components/admin/ai/GuidelinesPolicyNotice'
import GuidelinesVersionHeader from '../../components/admin/ai/GuidelinesVersionHeader'
import GuidelinesVersionHistory from '../../components/admin/ai/GuidelinesVersionHistory'
import GuidelinesWorkspaceNav from '../../components/admin/ai/GuidelinesWorkspaceNav'
import { getDefaultGuidelines } from '../../lib/ai-guidelines'
import { createContentType } from '../../lib/ai-guidelines-schema'

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

  test('presents general rules for reading without editing instructions or orphan labels', () => {
    const document = getDefaultGuidelines()
    act(() => root.render(<GuidelinesGeneralRules document={document} editable={false} />))

    expect(container.querySelectorAll('section[id$="-section"]')).toHaveLength(4)
    expect(container.querySelectorAll('section[id$="-section"] textarea')).toHaveLength(0)
    expect(container.querySelector('#guidelines-brand-voice')).toBeNull()
    expect(
      Array.from(container.querySelectorAll('section[id$="-section"] h4')).map((title) =>
        title.textContent.trim()
      )
    ).toEqual(['Voz y tono general', 'Qué debe evitar', 'Al revisar imágenes', 'Al crear imágenes'])
    expect(container.textContent).toContain('Cómo debe sonar el contenido y representar')
    expect(container.textContent).not.toContain('Explica cómo debe sonar')

    expect(container.querySelectorAll('button[aria-controls$="-content"]')).toHaveLength(0)
    expect(container.textContent).not.toContain('de 5 con contenido')
    expect(container.textContent).not.toContain('caracteres')
    expect(container.textContent).not.toContain('Campo obligatorio')
  })

  test('edits the four general-rule fields and preserves nested image settings', () => {
    const document = getDefaultGuidelines()
    const onChange = jest.fn()
    act(() =>
      root.render(<GuidelinesGeneralRules document={document} editable onChange={onChange} />)
    )

    const ruleFields = container.querySelectorAll('section[id$="-section"] textarea')
    expect(ruleFields).toHaveLength(4)
    expect(Array.from(ruleFields).every((field) => field.maxLength === 20_000)).toBe(true)
    expect(container.querySelector('#guidelines-generation-global')).toBeNull()

    const generationField = container.querySelector('#guidelines-image-generation')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      ).set
      setter.call(generationField, 'Usa escenas astronómicas sencillas.')
      generationField.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(onChange).toHaveBeenCalledWith({
      generation: {
        ...document.generation,
        imagePrompt: 'Usa escenas astronómicas sencillas.',
      },
    })
    expect(container.textContent).not.toContain('Probar cómo se combinan estas reglas')
  })

  test('does not embed the technical simulator in the instruction editor', () => {
    act(() => root.render(<GuidelinesGeneralRules document={getDefaultGuidelines()} />))

    expect(container.querySelector('#guidelines-preview-mode')).toBeNull()
    expect(container.textContent).not.toContain('Simulación local')
    expect(container.textContent).not.toContain('Abrir simulador')
  })

  test('lets the team edit and stop using observation night like any other type', () => {
    const document = getDefaultGuidelines()
    act(() =>
      root.render(
        <GuidelinesContentTypeCatalog
          document={document}
          editable
          selectedId="observation_night"
          onChange={() => {}}
        />
      )
    )

    expect(container.textContent).not.toContain('tipo esencial')
    expect(container.querySelector('#content-type-observation_night-label').disabled).toBe(false)

    const fieldsTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (tab) => tab.textContent === 'Campos'
    )
    act(() => fieldsTab.click())
    const requiredControls = Array.from(container.querySelectorAll('input[type="checkbox"]'))
    expect(requiredControls.some((control) => control.disabled === false)).toBe(true)
    expect(container.textContent).not.toContain('Información técnica')
    expect(container.querySelectorAll('details dl')).toHaveLength(0)
    const removeField = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Quitar'
    )
    expect(removeField.disabled).toBe(false)

    const archive = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Dejar de usar este tipo'
    )
    act(() => archive.click())
    expect(container.querySelector('[role="dialog"]')).not.toBeNull()
    expect(container.textContent).toContain('Dejará de aparecer en Generar y Validar')
  })

  test('shows only the product name and generates the internal ID when creating a type', () => {
    const document = getDefaultGuidelines()
    const onChange = jest.fn()
    act(() =>
      root.render(
        <GuidelinesContentTypeCatalog
          document={document}
          editable
          selectedId="regular_post"
          onChange={onChange}
        />
      )
    )

    const nameInput = container.querySelector('#content-type-regular_post-label')
    expect(nameInput.labels[0].textContent.trim()).toBe('Nombre')
    expect(container.textContent).not.toContain('Nombre para el equipo')
    expect(container.textContent).not.toContain('Identificador interno')
    expect(container.querySelector('#content-type-regular_post-id')).toBeNull()

    const createButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.type === 'button' && button.textContent.includes('Crear tipo')
    )
    act(() => createButton.click())

    const createDialog = container.querySelector('[role="dialog"]')
    const newNameInput = createDialog.querySelector('#new-content-type-name')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(newNameInput, 'Actividad educativa')
      newNameInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => createDialog.requestSubmit())

    const nextDocument = onChange.mock.calls.at(-1)[0]
    expect(nextDocument.contentTypeCatalog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'actividad_educativa', label: 'Actividad educativa' }),
      ])
    )
  })

  test('treats image as a progressive type decision instead of a separate tab', () => {
    const document = getDefaultGuidelines()
    const onChange = jest.fn()
    act(() =>
      root.render(
        <GuidelinesContentTypeCatalog
          document={document}
          editable
          selectedId="regular_post"
          onChange={onChange}
        />
      )
    )

    const tabs = Array.from(container.querySelectorAll('[role="tab"]')).map((tab) =>
      tab.textContent.trim()
    )
    expect(tabs).toEqual(['Información', 'Campos', 'Asistente'])
    expect(container.textContent).toContain('¿Este tipo lleva imagen?')
    expect(container.textContent).toContain('¿Esta generación sigue un diseño del SAC?')
    expect(container.textContent).toContain('Se generará un cartel con la marca del SAC.')
    expect(container.textContent).toContain('De dónde puede salir el fondo')
    expect(container.querySelector('[data-template-preview="simple"]')).not.toBeNull()
    expect(container.textContent).toContain('Así se verá el cartel')
    expect(container.textContent).toContain('Datos opcionales para crear la imagen')
    expect(container.textContent).toContain('¿En qué redes se publica este tipo?')
    expect(container.textContent).toContain(
      'Solo se generará y validará contenido para las redes marcadas.'
    )
    expect(container.textContent).not.toContain('Ajustar por red')
    expect(container.textContent).not.toContain('Cómo se prepara la imagen')
    expect(container.textContent).not.toContain('Modo interno')
    expect(container.textContent).not.toContain('Plantilla interna')

    const requirement = container.querySelector('#content-type-regular_post-image-requirement')
    expect(requirement.value).toBe('required')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
      ).set
      setter.call(requirement, 'required')
      requirement.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const requiredType = onChange.mock.calls
      .at(-1)[0]
      .contentTypeCatalog.find(({ id }) => id === 'regular_post')
    expect(Object.values(requiredType.visual.imagePolicyByPlatform)).toEqual([
      'required',
      'required',
      'required',
    ])

    const sacDesign = container.querySelector('#content-type-regular_post-visual-mode')
    expect(sacDesign.value).toBe('yes')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
      ).set
      setter.call(sacDesign, 'no')
      sacDesign.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const nextDocument = onChange.mock.calls.at(-1)[0]
    const nextType = nextDocument.contentTypeCatalog.find(({ id }) => id === 'regular_post')
    expect(nextType.visual).toMatchObject({ mode: 'ai_image', template: null })

    const fieldsTab = Array.from(container.querySelectorAll('[role="tab"]')).find(
      (tab) => tab.textContent === 'Campos'
    )
    act(() => fieldsTab.click())
    expect(container.textContent).not.toContain('Estilo de imagen')
    expect(container.textContent).not.toContain('Restricciones visuales')
  })

  test('edits validation and generation as two modes of one assistant', () => {
    const document = getDefaultGuidelines()
    const original = document.contentTypeCatalog.find(({ id }) => id === 'regular_post')
    const onChange = jest.fn()
    act(() =>
      root.render(
        <GuidelinesContentTypeCatalog
          document={document}
          editable
          selectedId="regular_post"
          initialPanel="validation"
          onChange={onChange}
        />
      )
    )

    expect(container.textContent).toContain('Cómo debe trabajar el asistente')
    expect(container.textContent).toContain('¿Qué debe revisar?')
    expect(container.querySelector('#content-type-regular_post-validation-rules')).not.toBeNull()
    expect(container.querySelector('#content-type-regular_post-generation-rules')).toBeNull()

    const generateMode = container.querySelector('#content-type-assistant-mode-generation')
    act(() => generateMode.click())
    expect(container.textContent).toContain('¿Qué debe crear y cómo?')

    const generationRules = container.querySelector('#content-type-regular_post-generation-rules')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value'
      ).set
      setter.call(generationRules, 'Crea una publicación clara para la comunidad.')
      generationRules.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const updated = onChange.mock.calls
      .at(-1)[0]
      .contentTypeCatalog.find(({ id }) => id === 'regular_post')
    expect(updated.generation.rules).toBe('Crea una publicación clara para la comunidad.')
    expect(updated.validation.rules).toBe(original.validation.rules)
  })

  test('keeps image options hidden when a type does not carry an image', () => {
    const onChange = jest.fn()
    act(() =>
      root.render(
        <GuidelinesContentTypeCatalog
          document={getDefaultGuidelines()}
          editable
          selectedId="reel_caption"
          onChange={onChange}
        />
      )
    )

    const requirement = container.querySelector('#content-type-reel_caption-image-requirement')
    expect(requirement.value).toBe('prohibited')
    expect(container.querySelector('#content-type-reel_caption-visual-mode')).toBeNull()
    expect(container.textContent).not.toContain('cartel con la marca del SAC')
    expect(container.textContent).not.toContain('Ajustar por red')

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
      ).set
      setter.call(requirement, 'optional')
      requirement.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const nextType = onChange.mock.calls
      .at(-1)[0]
      .contentTypeCatalog.find(({ id }) => id === 'reel_caption')
    expect(nextType.visual.mode).toBe('template')
    expect(nextType.visual.imagePolicyByPlatform).toMatchObject({
      x: 'optional',
      facebook: 'optional',
      instagram: 'prohibited',
    })

    const instagram = container.querySelector('#content-type-reel_caption-platform-instagram')
    act(() => instagram.click())
    const instagramType = onChange.mock.calls
      .at(-1)[0]
      .contentTypeCatalog.find(({ id }) => id === 'reel_caption')
    expect(instagramType.platforms).toContain('instagram')
    expect(instagramType.visual.mode).toBe('template')
    expect(
      instagramType.platforms.every(
        (platform) => instagramType.visual.imagePolicyByPlatform[platform] === 'required'
      )
    ).toBe(true)
  })

  test('previews the real SVG template over selectable stock backgrounds in the client', () => {
    act(() => root.render(<GuidelinesTemplatePreview layoutId="event" />))

    const preview = container.querySelector('[data-template-preview="event"]')
    expect(preview.querySelector('svg')).not.toBeNull()
    expect(preview.textContent).toContain('Noche de')
    expect(preview.textContent).toContain('Observación')
    expect(preview.textContent).toContain('Así se verá el cartel')
    expect(preview.querySelectorAll('img')[0].getAttribute('src')).toContain('telescope-nebula')

    const background = preview.querySelector('#template-preview-background-event')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
      ).set
      setter.call(background, 'moon-diagrams')
      background.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(preview.querySelectorAll('img')[0].getAttribute('src')).toContain('moon-diagrams')
  })

  test('prevents duplicate names when creating a content type', () => {
    const document = getDefaultGuidelines()
    const onChange = jest.fn()
    act(() =>
      root.render(<GuidelinesContentTypeCatalog document={document} editable onChange={onChange} />)
    )

    const createButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.type === 'button' && button.textContent.includes('Crear tipo')
    )
    act(() => createButton.click())
    const input = container.querySelector('#new-content-type-name')
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, document.contentTypeCatalog[0].label.toLocaleUpperCase('es-PR'))
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(container.textContent).toContain('Ya existe un tipo con ese nombre.')
    expect(container.querySelector('button[type="submit"]').disabled).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })

  test('removes a published type from the new version when the team stops using it', () => {
    const document = getDefaultGuidelines()
    const onChange = jest.fn()
    act(() =>
      root.render(
        <GuidelinesContentTypeCatalog
          document={document}
          editable
          selectedId="observation_night"
          onChange={onChange}
        />
      )
    )

    const stopUsing = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Dejar de usar este tipo'
    )
    act(() => stopUsing.click())
    const confirm = Array.from(container.querySelectorAll('[role="dialog"] button')).find(
      (button) => button.textContent === 'Dejar de usar'
    )
    act(() => confirm.click())

    const nextDocument = onChange.mock.calls.at(-1)[0]
    expect(nextDocument.contentTypeCatalog.some(({ id }) => id === 'observation_night')).toBe(false)
  })

  test('removes a never-published type from the current draft', () => {
    const active = getDefaultGuidelines()
    const document = createContentType(active, { id: 'temporary_type', label: 'Tipo temporal' })
    const onChange = jest.fn()
    act(() =>
      root.render(
        <GuidelinesContentTypeCatalog
          document={document}
          editable
          selectedId="temporary_type"
          onChange={onChange}
        />
      )
    )

    const stopUsing = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Dejar de usar este tipo'
    )
    act(() => stopUsing.click())
    const confirm = Array.from(container.querySelectorAll('[role="dialog"] button')).find(
      (button) => button.textContent === 'Dejar de usar'
    )
    act(() => confirm.click())

    const nextDocument = onChange.mock.calls.at(-1)[0]
    expect(nextDocument.contentTypeCatalog.some(({ id }) => id === 'temporary_type')).toBe(false)
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

  test('shows the human name and technical id of the active version', () => {
    act(() =>
      root.render(
        <GuidelinesVersionHeader
          active={{ version: 'v7', versionName: 'Ajustes para X' }}
          viewMode="active"
        />
      )
    )

    expect(container.textContent).toContain('Ajustes para X · v7')
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

  test('requires and exposes an editable version name before activation', () => {
    const onActivate = jest.fn()
    const onVersionNameChange = jest.fn()
    act(() =>
      root.render(
        <GuidelinesActivationReview
          validation={{ ok: true, issues: [], errors: [] }}
          summary={{
            hasChanges: true,
            totalChanges: 1,
            contentTypes: { changed: false },
            generalRules: { changed: false },
            platforms: { changed: true, count: 1, label: 'Redes sociales', items: [] },
            images: { changed: false },
          }}
          canWrite
          versionName="Ajustes para X"
          onVersionNameChange={onVersionNameChange}
          onNavigate={() => {}}
          onBack={() => {}}
          onActivate={onActivate}
        />
      )
    )

    const input = container.querySelector('#guidelines-version-name')
    const activate = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Activar cambios')
    )
    expect(input.value).toBe('Ajustes para X')
    expect(activate.disabled).toBe(false)

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, 'Límites de X')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(onVersionNameChange).toHaveBeenCalledWith('Límites de X')
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
              versionName: 'Ajustes para X',
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
    expect(container.textContent).toContain('Ajustes para X')
    expect(container.textContent).toContain('v2 · Luis')

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
