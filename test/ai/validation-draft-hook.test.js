import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import {
  clearValidationDraft,
  readValidationDraft,
  resolveValidationDraftOwnerKey,
  writeValidationDraft,
} from '../../lib/ai-validation-draft'
import { useValidationDraft } from '../../lib/hooks/useValidationDraft'

jest.mock('@/lib/ai-validation-draft', () => {
  const actual = jest.requireActual('@/lib/ai-validation-draft')
  return {
    ...actual,
    clearValidationDraft: jest.fn(),
    readValidationDraft: jest.fn(),
    resolveValidationDraftOwnerKey: jest.fn(),
    writeValidationDraft: jest.fn(),
  }
})

function deferred() {
  let resolve
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('useValidationDraft account isolation', () => {
  let container
  let root
  let current

  function Harness({ user }) {
    const draft = useValidationDraft({ user, enabled: true })
    React.useEffect(() => {
      current = draft
    }, [draft])
    return null
  }

  async function render(user) {
    await act(async () => {
      root.render(<Harness user={user} />)
      for (let index = 0; index < 8; index += 1) await Promise.resolve()
    })
  }

  async function flush() {
    await act(async () => {
      for (let index = 0; index < 8; index += 1) await Promise.resolve()
    })
  }

  beforeAll(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true
  })

  beforeEach(() => {
    jest.useFakeTimers()
    current = null
    resolveValidationDraftOwnerKey.mockImplementation(async ({ id }) => `user-id:${id}`)
    readValidationDraft.mockResolvedValue(null)
    writeValidationDraft.mockResolvedValue({
      updatedAt: '2026-08-29T12:00:00.000Z',
      expiresAt: '2026-09-28T12:00:00.000Z',
    })
    clearValidationDraft.mockResolvedValue(true)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    jest.useRealTimers()
    jest.clearAllMocks()
  })

  test('blanks the previous account while loading and restores only the new owner key', async () => {
    const userBRead = deferred()
    readValidationDraft.mockImplementation((ownerKey) => {
      if (ownerKey === 'user-id:user-a') {
        return Promise.resolve({
          formState: { draftText: 'Privado de A' },
          images: [],
          updatedAt: '2026-08-29T10:00:00.000Z',
          repaired: false,
        })
      }
      return userBRead.promise
    })

    await render({ id: 'user-a' })
    expect(current.hydrated).toBe(true)
    expect(current.formState.draftText).toBe('Privado de A')

    await render({ id: 'user-b' })
    expect(current.hydrated).toBe(false)
    expect(current.formState.draftText).toBe('')
    expect(current.images).toEqual([])

    userBRead.resolve({
      formState: { draftText: 'Privado de B' },
      images: [],
      updatedAt: '2026-08-29T11:00:00.000Z',
      repaired: false,
    })
    await flush()

    expect(current.hydrated).toBe(true)
    expect(current.formState.draftText).toBe('Privado de B')
    expect(readValidationDraft).toHaveBeenNthCalledWith(1, 'user-id:user-a')
    expect(readValidationDraft).toHaveBeenNthCalledWith(2, 'user-id:user-b')
  })

  test('debounces autosave under the owner key and clear does not recreate a blank record', async () => {
    await render({ id: 'user-a' })
    expect(current.saveStatus).toBe('empty')

    act(() => current.setFormState({ ...current.formState, draftText: 'Trabajo recuperable' }))
    await act(async () => {
      jest.advanceTimersByTime(299)
      await Promise.resolve()
    })
    expect(writeValidationDraft).not.toHaveBeenCalled()

    await act(async () => {
      jest.advanceTimersByTime(1)
      for (let index = 0; index < 8; index += 1) await Promise.resolve()
    })
    expect(writeValidationDraft).toHaveBeenCalledTimes(1)
    expect(writeValidationDraft).toHaveBeenCalledWith(
      'user-id:user-a',
      expect.objectContaining({
        formState: expect.objectContaining({ draftText: 'Trabajo recuperable' }),
        images: [],
      })
    )
    expect(current.saveStatus).toBe('saved')

    await act(async () => {
      await current.clearDraft()
    })
    expect(clearValidationDraft).toHaveBeenCalledWith('user-id:user-a')
    expect(current.formState.draftText).toBe('')
    expect(current.saveStatus).toBe('empty')

    await act(async () => {
      jest.advanceTimersByTime(1000)
      await Promise.resolve()
    })
    expect(writeValidationDraft).toHaveBeenCalledTimes(1)
  })

  test('flushes the last debounced edit to the old owner when the account changes', async () => {
    await render({ id: 'user-a' })
    act(() => current.setFormState({ ...current.formState, draftText: 'Último cambio de A' }))
    expect(writeValidationDraft).not.toHaveBeenCalled()

    await render({ id: 'user-b' })

    expect(writeValidationDraft).toHaveBeenCalledWith(
      'user-id:user-a',
      expect.objectContaining({
        formState: expect.objectContaining({ draftText: 'Último cambio de A' }),
      })
    )
    expect(current.formState.draftText).toBe('')
  })
})
