'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from 'next-auth/react'
import { GROUP_MIEMBROS, GROUP_PERSONAL } from '@/lib/group-sync'

const REASON_LABELS = {
  unknown: 'desconocido',
  expired: 'expirado',
  'no-payment': 'sin pago',
  applied: 'solicitud',
}

const reasonLabel = (reason) => REASON_LABELS[reason] || reason

const checkboxKey = (group, op, email) => `${group}|${op}|${email}`

/**
 * GroupSyncCard - Action card for syncing Google Groups with active members
 *
 * Same security model as ScanCard: card is hidden unless the session has the
 * 'sync_groups' action permission (granted by write_* or explicitly), and the
 * API route enforces the same permission server-side.
 *
 * Flow: "Comparar grupos" fetches a read-only diff and opens a review modal
 * where the admin unchecks anything they want to keep, then applies.
 */
export function GroupSyncCard() {
  const { data: session } = useSession()
  const [status, setStatus] = useState('idle') // idle | loading | applying
  const [errorMsg, setErrorMsg] = useState('')
  const [diff, setDiff] = useState(null)
  const [unchecked, setUnchecked] = useState(new Set())
  const [applyResults, setApplyResults] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  const accessibleActions = session?.user?.accessibleActions || []
  const canSyncGroups = accessibleActions.includes('sync_groups')

  // If user doesn't have permission to sync groups, don't render the card
  if (!canSyncGroups) {
    return null
  }

  const loadPreview = async (refresh = false) => {
    setStatus('loading')
    setErrorMsg('')
    setApplyResults(null)
    setDiff(null)
    setUnchecked(new Set())
    try {
      const res = await fetch(`/api/admin/groups/sync${refresh ? '?refresh=true' : ''}`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Error al comparar los grupos')
      }
      setDiff(data)
      setModalOpen(true)
    } catch (e) {
      setErrorMsg(e.message)
    } finally {
      setStatus('idle')
    }
  }

  const toggle = (key) => {
    setUnchecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const buildPayload = () => {
    const groups = {}
    for (const group of [GROUP_MIEMBROS, GROUP_PERSONAL]) {
      const g = diff.groups[group]
      const add = g.toAdd
        .filter((item) => !unchecked.has(checkboxKey(group, 'add', item.email)))
        .map((item) => item.email)
      const remove = g.toRemove
        .filter((item) => !unchecked.has(checkboxKey(group, 'remove', item.email)))
        .map((item) => item.email)
      if (add.length > 0 || remove.length > 0) {
        groups[group] = { add, remove }
      }
    }
    return groups
  }

  const totalSelected = () => {
    if (!diff) return 0
    const groups = buildPayload()
    return Object.values(groups).reduce((sum, g) => sum + g.add.length + g.remove.length, 0)
  }

  const applyChanges = async () => {
    const groups = buildPayload()
    const summary = Object.entries(groups)
      .map(([group, g]) => `${group}: añadir ${g.add.length}, remover ${g.remove.length}`)
      .join('\n')
    if (!window.confirm(`¿Aplicar estos cambios?\n\n${summary}`)) return

    setStatus('applying')
    setErrorMsg('')
    try {
      const res = await fetch('/api/admin/groups/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Error al aplicar los cambios')
      }
      setApplyResults(data.results)
      setDiff(null)
      setUnchecked(new Set())
    } catch (e) {
      setErrorMsg(e.message)
    } finally {
      setStatus('idle')
    }
  }

  const closeModal = () => {
    if (status === 'applying') return
    setModalOpen(false)
  }

  const isEmpty =
    diff &&
    [GROUP_MIEMBROS, GROUP_PERSONAL].every(
      (g) => diff.groups[g].toAdd.length === 0 && diff.groups[g].toRemove.length === 0
    )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      {/* Label */}
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Sincronizar Grupos</p>

      {/* Status area */}
      <div className="mt-2 min-h-[1.75rem]">
        {status === 'idle' && !errorMsg && !applyResults && (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Comparar grupos de Google con miembros activos
          </p>
        )}

        {status === 'loading' && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Consultando grupos... puede tardar hasta 30 segundos
          </p>
        )}

        {status === 'idle' && !errorMsg && applyResults && (
          <p className="text-sm text-green-600 dark:text-green-400">Cambios aplicados</p>
        )}

        {errorMsg && <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>}
      </div>

      {/* Action button */}
      <button
        onClick={() => loadPreview(false)}
        disabled={status !== 'idle'}
        className="w-full mt-3 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {status === 'loading' ? 'Comparando...' : errorMsg ? 'Reintentar' : 'Comparar grupos'}
      </button>

      {modalOpen &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeModal()
            }}
          >
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Sincronización de grupos
                </h2>
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  aria-label="Cerrar"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-4">
                {isEmpty && (
                  <div className="mb-4 p-3 rounded-md bg-green-50 dark:bg-green-900/20 text-sm text-green-700 dark:text-green-400">
                    Los grupos están sincronizados ✓
                  </div>
                )}

                {diff && !isEmpty && (
                  <div className="grid gap-6 lg:grid-cols-2">
                    {[GROUP_MIEMBROS, GROUP_PERSONAL].map((group) => (
                      <GroupPanel
                        key={group}
                        group={group}
                        data={diff.groups[group]}
                        unchecked={unchecked}
                        onToggle={toggle}
                      />
                    ))}
                  </div>
                )}

                {diff && diff.missingSacEmail.length > 0 && (
                  <div className="mt-6 p-4 rounded-md bg-yellow-50 dark:bg-yellow-900/20">
                    <h3 className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 mb-2">
                      Miembros activos sin cuenta de Workspace ({diff.missingSacEmail.length})
                    </h3>
                    <p className="text-xs text-yellow-700 dark:text-yellow-400 mb-2">
                      No se pueden añadir a {GROUP_MIEMBROS} hasta que tengan cuenta.
                    </p>
                    <ul className="text-sm text-yellow-800 dark:text-yellow-300 list-disc pl-5">
                      {diff.missingSacEmail.map((m) => (
                        <li key={m.email}>
                          {m.name} ({m.email})
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {applyResults && <ApplyResults results={applyResults} />}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={status === 'applying'}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Cerrar
                </button>
                {diff && !isEmpty && (
                  <button
                    type="button"
                    onClick={applyChanges}
                    disabled={status === 'applying' || totalSelected() === 0}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {status === 'applying'
                      ? 'Aplicando...'
                      : `Aplicar cambios (${totalSelected()})`}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}

function GroupPanel({ group, data, unchecked, onToggle }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <h3 className="font-semibold text-gray-900 dark:text-white mb-3 break-all">{group}</h3>

      <Section
        title={`Añadir (${data.toAdd.length})`}
        emptyText="Nada que añadir"
        items={data.toAdd}
        renderItem={(item) => (
          <CheckboxRow
            key={item.email}
            checked={!unchecked.has(checkboxKey(group, 'add', item.email))}
            onChange={() => onToggle(checkboxKey(group, 'add', item.email))}
          >
            <span className="text-gray-900 dark:text-gray-100">{item.email}</span>
            <span className="text-gray-500 dark:text-gray-400 ml-2">{item.name}</span>
          </CheckboxRow>
        )}
      />

      <Section
        title={`Remover (${data.toRemove.length})`}
        emptyText="Nada que remover"
        items={data.toRemove}
        renderItem={(item) => (
          <CheckboxRow
            key={item.email}
            checked={!unchecked.has(checkboxKey(group, 'remove', item.email))}
            onChange={() => onToggle(checkboxKey(group, 'remove', item.email))}
          >
            <span className="text-gray-900 dark:text-gray-100">{item.email}</span>
            <span className="text-gray-500 dark:text-gray-400 ml-2">
              {reasonLabel(item.reason)}
            </span>
            {item.role !== 'MEMBER' && (
              <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold rounded bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                {item.role}
              </span>
            )}
          </CheckboxRow>
        )}
      />

      {data.protectedOwners && data.protectedOwners.length > 0 && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="font-medium">Se conservan (OWNER):</span>{' '}
          {data.protectedOwners.map((o) => o.email).join(', ')}
        </div>
      )}
    </div>
  )
}

function Section({ title, emptyText, items, renderItem }) {
  return (
    <div className="mb-4">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{emptyText}</p>
      ) : (
        <ul className="space-y-1">{items.map(renderItem)}</ul>
      )}
    </div>
  )
}

function CheckboxRow({ checked, onChange, children }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
      />
      <span className="break-all">{children}</span>
    </li>
  )
}

function ApplyResults({ results }) {
  return (
    <div className="mt-6 space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Resultados</h3>
      {Object.entries(results).map(([group, r]) => (
        <div key={group} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 dark:text-white mb-2 break-all">{group}</h4>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Añadidos: {r.added.length} · Removidos: {r.removed.length} · Fallidos: {r.failed.length}
          </p>
          {r.skipped && r.skipped.length > 0 && (
            <p className="mt-1 text-sm text-orange-700 dark:text-orange-400">
              Omitidos (OWNER protegido): {r.skipped.map((s) => s.email).join(', ')}
            </p>
          )}
          {r.failed.length > 0 && (
            <ul className="mt-2 text-sm text-red-700 dark:text-red-400 list-disc pl-5">
              {r.failed.map((f) => (
                <li key={`${f.op}-${f.email}`}>
                  {f.email} ({f.op === 'add' ? 'añadir' : 'remover'}): {f.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Vuelve a comparar para verificar el estado final.
      </p>
    </div>
  )
}

export default GroupSyncCard
