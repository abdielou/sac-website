import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { mergeGuidelineDraftChanges, useGuidelinesDraft } from '../../lib/hooks/useGuidelinesDraft'

function jsonResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(data),
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function draftRecord(document, revision = 1, id = 'draft-1') {
  return {
    id,
    basedOn: 'v1',
    revision,
    updatedAt: '2026-08-02T00:00:00.000Z',
    updatedBy: 'Editor',
    document,
  }
}

function workspace({ document = null, revision = 1, active = null } = {}) {
  return {
    active: active || { version: 'v1', voice: 'Voz activa' },
    draft: document ? draftRecord(document, revision) : null,
    versions: [{ version: 'v1', status: 'active' }],
    auditLog: [],
  }
}

describe('mergeGuidelineDraftChanges', () => {
  test('reapplies only locally changed fields over a newer server document', () => {
    const base = {
      voice: 'Base',
      generation: { global: 'Base', platforms: { x: 'Base' } },
      contentTypes: [{ id: 'event', label: 'Evento' }],
    }
    const local = {
      voice: 'Local',
      generation: { global: 'Base', platforms: { x: 'Base' } },
      contentTypes: [{ id: 'event', label: 'Evento local' }],
    }
    const remote = {
      voice: 'Servidor',
      generation: { global: 'Servidor', platforms: { x: 'Servidor' } },
      contentTypes: [{ id: 'event', label: 'Evento remoto' }],
      restriction: 'Nueva regla remota',
    }

    expect(mergeGuidelineDraftChanges(base, local, remote)).toEqual({
      voice: 'Local',
      generation: { global: 'Servidor', platforms: { x: 'Servidor' } },
      contentTypes: [{ id: 'event', label: 'Evento local' }],
      restriction: 'Nueva regla remota',
    })
  })

  test('merges catalog and field arrays by stable identity', () => {
    const base = {
      contentTypeCatalog: [
        {
          id: 'event',
          label: 'Evento',
          fields: [
            { key: 'title', label: 'Título', required: false },
            { key: 'date', label: 'Fecha', required: false },
          ],
        },
        { id: 'news', label: 'Noticia', fields: [] },
      ],
    }
    const local = {
      contentTypeCatalog: [
        {
          id: 'event',
          label: 'Evento local',
          fields: [
            { key: 'title', label: 'Título local', required: false },
            { key: 'date', label: 'Fecha', required: false },
          ],
        },
        { id: 'news', label: 'Noticia', fields: [] },
      ],
    }
    const remote = {
      contentTypeCatalog: [
        {
          id: 'event',
          label: 'Evento remoto',
          fields: [
            { key: 'title', label: 'Título', required: false },
            { key: 'date', label: 'Fecha', required: true },
            { key: 'venue', label: 'Lugar', required: false },
          ],
        },
        { id: 'news', label: 'Noticia remota', fields: [] },
        { id: 'alert', label: 'Alerta remota', fields: [] },
      ],
    }

    expect(mergeGuidelineDraftChanges(base, local, remote)).toEqual({
      contentTypeCatalog: [
        {
          id: 'event',
          label: 'Evento local',
          fields: [
            { key: 'title', label: 'Título local', required: false },
            { key: 'date', label: 'Fecha', required: true },
            { key: 'venue', label: 'Lugar', required: false },
          ],
        },
        { id: 'news', label: 'Noticia remota', fields: [] },
        { id: 'alert', label: 'Alerta remota', fields: [] },
      ],
    })
  })

  test('reapplies local catalog ordering without dropping remote additions', () => {
    const base = {
      contentTypeCatalog: [
        { id: 'event', label: 'Evento' },
        { id: 'news', label: 'Noticia' },
      ],
    }
    const local = {
      contentTypeCatalog: [
        { id: 'news', label: 'Noticia' },
        { id: 'event', label: 'Evento' },
      ],
    }
    const remote = {
      contentTypeCatalog: [
        { id: 'event', label: 'Evento remoto' },
        { id: 'alert', label: 'Alerta remota' },
        { id: 'news', label: 'Noticia remota' },
        { id: 'report', label: 'Reporte remoto' },
      ],
    }

    expect(mergeGuidelineDraftChanges(base, local, remote).contentTypeCatalog).toEqual([
      { id: 'news', label: 'Noticia remota' },
      { id: 'event', label: 'Evento remoto' },
      { id: 'alert', label: 'Alerta remota' },
      { id: 'report', label: 'Reporte remoto' },
    ])
  })
})

describe('useGuidelinesDraft', () => {
  let container
  let root
  let current

  function Harness({ canWrite = true }) {
    const value = useGuidelinesDraft({ canWrite })
    React.useEffect(() => {
      current = value
    }, [value])
    return null
  }

  async function renderHarness(props) {
    await act(async () => {
      root.render(<Harness {...props} />)
      await Promise.resolve()
      await Promise.resolve()
    })
  }

  async function flushMicrotasks() {
    await act(async () => {
      for (let index = 0; index < 8; index += 1) await Promise.resolve()
    })
  }

  async function advanceAutosave() {
    await act(async () => {
      jest.advanceTimersByTime(1000)
      for (let index = 0; index < 8; index += 1) await Promise.resolve()
    })
  }

  beforeAll(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    jest.useFakeTimers()
    global.fetch = jest.fn()
    current = null
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    if (root) await act(async () => root.unmount())
    container.remove()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  test('opens an existing draft separately from active and supports changing views', async () => {
    fetch.mockResolvedValue(jsonResponse(workspace({ document: { voice: 'Borrador' } })))
    await renderHarness()

    expect(current.hydrated).toBe(true)
    expect(current.viewMode).toBe('draft')
    expect(current.isEditing).toBe(true)
    expect(current.displayDoc.voice).toBe('Borrador')

    act(() => current.setViewMode('active'))
    expect(current.viewMode).toBe('active')
    expect(current.isEditing).toBe(false)
    expect(current.displayDoc.voice).toBe('Voz activa')
    expect(current.draft.document.voice).toBe('Borrador')

    act(() => current.setViewMode('draft'))
    expect(current.displayDoc.voice).toBe('Borrador')
  })

  test('debounces autosave and skips structurally identical documents', async () => {
    const puts = []
    fetch.mockImplementation(async (url, options) => {
      if (!options?.method) {
        return jsonResponse(workspace({ document: { voice: 'Base', nested: { enabled: true } } }))
      }
      if (options.method === 'PUT') {
        const body = JSON.parse(options.body)
        puts.push(body)
        return jsonResponse({
          draft: draftRecord(body.document, body.expectedRevision + 1),
          auditLog: [],
        })
      }
      throw new Error(`Unexpected request: ${options.method} ${url}`)
    })
    await renderHarness()

    act(() => current.updateDraft({ voice: 'Local' }))
    expect(current.autosaveStatus).toBe('dirty')

    await act(async () => {
      jest.advanceTimersByTime(999)
      await Promise.resolve()
    })
    expect(puts).toHaveLength(0)

    await advanceAutosave()
    expect(puts).toHaveLength(1)
    expect(puts[0]).toEqual({
      document: { voice: 'Local', nested: { enabled: true } },
      expectedRevision: 1,
    })
    expect(current.autosaveStatus).toBe('saved')

    act(() => current.updateDraft({ nested: { enabled: true } }))
    await advanceAutosave()
    expect(puts).toHaveLength(1)
  })

  test('starts a pending dirty save when the workspace unmounts', async () => {
    const puts = []
    fetch.mockImplementation(async (url, options) => {
      if (!options?.method) {
        return jsonResponse(workspace({ document: { voice: 'Base' } }))
      }
      if (options.method === 'PUT') {
        const body = JSON.parse(options.body)
        puts.push(body)
        return jsonResponse({
          draft: draftRecord(body.document, body.expectedRevision + 1),
          auditLog: [],
        })
      }
      throw new Error(`Unexpected request: ${options.method} ${url}`)
    })
    await renderHarness()

    act(() => current.updateDraft({ voice: 'Guardar al salir' }))
    expect(puts).toHaveLength(0)

    await act(async () => {
      root.unmount()
      root = null
      for (let index = 0; index < 8; index += 1) await Promise.resolve()
    })

    expect(puts).toEqual([
      {
        document: { voice: 'Guardar al salir' },
        expectedRevision: 1,
      },
    ])
  })

  test('serializes saves when another edit happens during a request', async () => {
    const firstSave = deferred()
    const putBodies = []
    let activeRequests = 0
    let maxActiveRequests = 0

    fetch.mockImplementation((url, options) => {
      if (!options?.method)
        return Promise.resolve(jsonResponse(workspace({ document: { voice: 'Base' } })))
      if (options.method !== 'PUT') throw new Error(`Unexpected request: ${options.method} ${url}`)

      const body = JSON.parse(options.body)
      putBodies.push(body)
      activeRequests += 1
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests)

      if (putBodies.length === 1) {
        return firstSave.promise.finally(() => {
          activeRequests -= 1
        })
      }

      activeRequests -= 1
      return Promise.resolve(
        jsonResponse({ draft: draftRecord(body.document, body.expectedRevision + 1), auditLog: [] })
      )
    })
    await renderHarness()

    act(() => current.updateDraft({ voice: 'Primero' }))
    await advanceAutosave()
    expect(putBodies).toHaveLength(1)

    act(() => current.updateDraft({ voice: 'Segundo' }))
    await advanceAutosave()
    expect(putBodies).toHaveLength(1)

    firstSave.resolve(jsonResponse({ draft: draftRecord({ voice: 'Primero' }, 2), auditLog: [] }))
    await flushMicrotasks()

    expect(putBodies).toHaveLength(2)
    expect(putBodies[1]).toEqual({
      document: { voice: 'Segundo' },
      expectedRevision: 2,
    })
    expect(maxActiveRequests).toBe(1)
    expect(current.autosaveStatus).toBe('saved')
  })

  test('rebases local fields after a 409 and retries once with the latest revision', async () => {
    const initial = workspace({
      document: {
        voice: 'Base',
        generation: { global: 'Base' },
        restriction: 'Base',
      },
    })
    const latest = workspace({
      revision: 2,
      document: {
        voice: 'Cambio remoto',
        generation: { global: 'Cambio remoto' },
        restriction: 'Nueva restricción remota',
      },
    })
    let getCount = 0
    const putBodies = []

    fetch.mockImplementation(async (url, options) => {
      if (!options?.method) {
        getCount += 1
        return jsonResponse(getCount === 1 ? initial : latest)
      }
      if (options.method !== 'PUT') throw new Error(`Unexpected request: ${options.method} ${url}`)

      const body = JSON.parse(options.body)
      putBodies.push(body)
      if (putBodies.length === 1) return jsonResponse({ error: 'Conflicto' }, 409)
      return jsonResponse({
        draft: draftRecord(body.document, 3),
        auditLog: [{ action: 'saved' }],
      })
    })
    await renderHarness()

    act(() => current.updateDraft({ voice: 'Cambio local' }))
    await advanceAutosave()

    expect(putBodies).toHaveLength(2)
    expect(putBodies[1]).toEqual({
      expectedRevision: 2,
      document: {
        voice: 'Cambio local',
        generation: { global: 'Cambio remoto' },
        restriction: 'Nueva restricción remota',
      },
    })
    expect(current.draft.revision).toBe(3)
    expect(current.draft.document).toEqual(putBodies[1].document)
    expect(current.autosaveStatus).toBe('saved')
  })

  test('stops after a repeated conflict and preserves the rebased local document', async () => {
    const workspaces = [
      workspace({ document: { voice: 'Base', serverRule: 'Base' }, revision: 1 }),
      workspace({ document: { voice: 'Remoto 1', serverRule: 'Remoto 1' }, revision: 2 }),
      workspace({ document: { voice: 'Remoto 2', serverRule: 'Remoto 2' }, revision: 3 }),
    ]
    let getCount = 0
    let putCount = 0
    fetch.mockImplementation(async (url, options) => {
      if (!options?.method) return jsonResponse(workspaces[getCount++])
      if (options.method === 'PUT') {
        putCount += 1
        return jsonResponse({ error: 'Conflicto' }, 409)
      }
      throw new Error(`Unexpected request: ${options.method} ${url}`)
    })
    await renderHarness()

    act(() => current.updateDraft({ voice: 'Local' }))
    await advanceAutosave()

    expect(putCount).toBe(2)
    expect(current.autosaveStatus).toBe('conflict')
    expect(current.autosaveError).toContain('Conservamos tus cambios')
    expect(current.draft.revision).toBe(3)
    expect(current.draft.document).toEqual({ voice: 'Local', serverRule: 'Remoto 2' })
  })

  test('recovers a locally edited document after its server draft disappears', async () => {
    const initial = workspace({
      document: { voice: 'Base', serverRule: 'Base' },
      revision: 1,
    })
    const withoutDraft = workspace({
      active: { version: 'v2', voice: 'Activa remota', serverRule: 'Regla remota' },
    })
    const recoveredServerDraft = draftRecord(
      { voice: 'Activa remota', serverRule: 'Regla remota' },
      1,
      'draft-2'
    )
    const puts = []
    let getCount = 0

    fetch.mockImplementation(async (url, options) => {
      if (!options?.method) {
        getCount += 1
        return jsonResponse(getCount === 1 ? initial : withoutDraft)
      }
      if (options.method === 'PUT') {
        const body = JSON.parse(options.body)
        puts.push({ url, body })
        if (puts.length === 1) return jsonResponse({ error: 'Borrador no encontrado' }, 404)
        return jsonResponse({
          draft: draftRecord(body.document, 2, 'draft-2'),
          auditLog: [],
        })
      }
      if (options.method === 'POST' && url === '/api/admin/ai/guidelines/drafts') {
        return jsonResponse({ draft: recoveredServerDraft, auditLog: [] }, 201)
      }
      throw new Error(`Unexpected request: ${options.method} ${url}`)
    })
    await renderHarness()

    act(() => current.updateDraft({ voice: 'Cambio local' }))
    await advanceAutosave()
    await flushMicrotasks()

    expect(current.autosaveStatus).toBe('conflict')
    expect(current.autosaveError).toContain('Recuperamos tus cambios')
    expect(current.draft.id).toBe('draft-2')
    expect(current.draft.document).toEqual({
      voice: 'Cambio local',
      serverRule: 'Regla remota',
    })
    expect(puts).toHaveLength(1)

    await act(async () => current.retryAutosave())

    expect(puts).toHaveLength(2)
    expect(puts[1]).toEqual({
      url: '/api/admin/ai/guidelines/drafts/draft-2',
      body: {
        document: { voice: 'Cambio local', serverRule: 'Regla remota' },
        expectedRevision: 1,
      },
    })
    expect(current.autosaveStatus).toBe('saved')
  })

  test('reuses a replacement server draft during 404 recovery', async () => {
    const initial = workspace({ document: { voice: 'Base', serverRule: 'Base' } })
    const replacement = workspace({
      document: { voice: 'Nuevo borrador', serverRule: 'Regla nueva' },
      revision: 4,
    })
    replacement.draft = draftRecord(replacement.draft.document, 4, 'draft-2')
    let getCount = 0
    let postCount = 0
    let putCount = 0

    fetch.mockImplementation(async (url, options) => {
      if (!options?.method) return jsonResponse(getCount++ === 0 ? initial : replacement)
      if (options.method === 'POST') {
        postCount += 1
        throw new Error('No debe crear otro borrador')
      }
      if (options.method === 'PUT') {
        putCount += 1
        const body = JSON.parse(options.body)
        if (putCount === 1) return jsonResponse({ error: 'Borrador no encontrado' }, 404)
        return jsonResponse({ draft: draftRecord(body.document, 5, 'draft-2'), auditLog: [] })
      }
      throw new Error(`Unexpected request: ${options.method} ${url}`)
    })
    await renderHarness()

    act(() => current.updateDraft({ voice: 'Cambio local' }))
    await advanceAutosave()

    expect(postCount).toBe(0)
    expect(current.draft.id).toBe('draft-2')
    expect(current.draft.document).toEqual({
      voice: 'Cambio local',
      serverRule: 'Regla nueva',
    })

    await act(async () => current.retryAutosave())
    expect(putCount).toBe(2)
    expect(current.autosaveStatus).toBe('saved')
  })

  test('exposes a recoverable initial refresh error', async () => {
    fetch.mockResolvedValueOnce(jsonResponse({ error: 'Servicio no disponible' }, 503))
    await renderHarness()

    expect(current.hydrated).toBe(true)
    expect(current.error).toBe('Servicio no disponible')
    expect(current.displayDoc).toBeNull()

    fetch.mockResolvedValueOnce(jsonResponse(workspace()))
    await act(async () => current.retryRefresh())

    expect(current.error).toBeNull()
    expect(current.displayDoc.version).toBe('v1')
    expect(current.viewMode).toBe('active')
  })

  test('turns a stalled workspace request into a recoverable timeout', async () => {
    fetch.mockImplementation((_url, options) => {
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          reject(error)
        })
      })
    })
    await renderHarness()

    await act(async () => {
      jest.advanceTimersByTime(15000)
      for (let index = 0; index < 8; index += 1) await Promise.resolve()
    })

    expect(current.hydrated).toBe(true)
    expect(current.refreshing).toBe(false)
    expect(current.error).toContain('tardó demasiado')
  })

  test('times out a stalled write and lets retryAutosave finish it', async () => {
    let putCount = 0
    fetch.mockImplementation((url, options) => {
      if (!options?.method) {
        return Promise.resolve(jsonResponse(workspace({ document: { voice: 'Base' } })))
      }
      if (options.method === 'PUT') {
        putCount += 1
        const body = JSON.parse(options.body)
        if (putCount === 1) {
          return new Promise((resolve, reject) => {
            options.signal.addEventListener('abort', () => {
              const error = new Error('aborted')
              error.name = 'AbortError'
              reject(error)
            })
          })
        }
        return Promise.resolve(
          jsonResponse({
            draft: draftRecord(body.document, body.expectedRevision + 1),
            auditLog: [],
          })
        )
      }
      throw new Error(`Unexpected request: ${options.method} ${url}`)
    })
    await renderHarness()

    act(() => current.updateDraft({ voice: 'Cambio local' }))
    await advanceAutosave()
    expect(current.autosaveStatus).toBe('saving')

    await act(async () => {
      jest.advanceTimersByTime(15000)
      for (let index = 0; index < 8; index += 1) await Promise.resolve()
    })

    expect(current.autosaveStatus).toBe('error')
    expect(current.autosaveError).toContain('tardó demasiado')

    await act(async () => current.retryAutosave())
    expect(putCount).toBe(2)
    expect(current.autosaveStatus).toBe('saved')
  })

  test('creates a draft from an optional version and then reuses it', async () => {
    let postCount = 0
    let postBody
    fetch.mockImplementation(async (url, options) => {
      if (!options?.method) return jsonResponse(workspace())
      if (options.method === 'POST') {
        postCount += 1
        postBody = JSON.parse(options.body)
        return jsonResponse({ draft: draftRecord({ voice: 'Histórica' }), auditLog: [] }, 201)
      }
      throw new Error(`Unexpected request: ${options.method} ${url}`)
    })
    await renderHarness()

    await act(async () => current.createDraftFromActive('v0'))
    expect(postBody).toEqual({ basedOnVersion: 'v0' })
    expect(current.viewMode).toBe('draft')
    expect(current.draft.document.voice).toBe('Histórica')

    await act(async () => current.createDraftFromActive('otra-versión'))
    expect(postCount).toBe(1)
  })

  test('flushes before activation and returns to the active view', async () => {
    let activationBody
    let getCount = 0
    fetch.mockImplementation(async (url, options) => {
      if (!options?.method) {
        getCount += 1
        return jsonResponse(
          getCount === 1
            ? workspace({ document: { voice: 'Borrador' } })
            : workspace({ active: { version: 'v2', voice: 'Publicada' } })
        )
      }
      if (options.method === 'PUT') {
        const body = JSON.parse(options.body)
        return jsonResponse({ draft: draftRecord(body.document, 2), auditLog: [] })
      }
      if (options.method === 'POST' && url.endsWith('/activate')) {
        activationBody = JSON.parse(options.body)
        return jsonResponse({ active: { version: 'v2', voice: 'Publicada' }, auditLog: [] })
      }
      throw new Error(`Unexpected request: ${options.method} ${url}`)
    })
    await renderHarness()

    act(() => current.updateDraft({ voice: 'Lista para publicar' }))
    await act(async () => current.activateDraftVersion('  Ajustes para X  '))

    expect(activationBody).toEqual({ expectedRevision: 2, versionName: 'Ajustes para X' })
    expect(current.draft).toBeNull()
    expect(current.viewMode).toBe('active')
    expect(current.displayDoc.voice).toBe('Publicada')
  })
})
