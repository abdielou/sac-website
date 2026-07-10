'use client'

import { useState } from 'react'
import { GROUP_MIEMBROS, GROUP_PERSONAL } from '@/lib/group-sync'

const REASON_LABELS = {
  unknown: 'desconocido',
  expired: 'expirado',
  'no-payment': 'sin pago',
  applied: 'solicitud',
}

const reasonLabel = (reason) => REASON_LABELS[reason] || reason

const checkboxKey = (group, op, email) => `${group}|${op}|${email}`

export default function GroupsAdminPage() {
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [diff, setDiff] = useState(null)
  const [error, setError] = useState(null)
  const [unchecked, setUnchecked] = useState(new Set())
  const [applyResults, setApplyResults] = useState(null)

  const loadPreview = async (refresh = false) => {
    setLoading(true)
    setError(null)
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
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
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

    setApplying(true)
    setError(null)
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
      setError(e.message)
    } finally {
      setApplying(false)
    }
  }

  const isEmpty =
    diff &&
    [GROUP_MIEMBROS, GROUP_PERSONAL].every(
      (g) => diff.groups[g].toAdd.length === 0 && diff.groups[g].toRemove.length === 0
    )

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Sincronización de grupos
      </h1>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        Compara los grupos de Google Workspace con la lista de miembros activos y aplica los cambios
        que confirmes.
      </p>

      <div className="flex gap-3 mb-6">
        <button
          onClick={() => loadPreview(false)}
          disabled={loading || applying}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Comparando…' : 'Comparar grupos'}
        </button>
        <button
          onClick={() => loadPreview(true)}
          disabled={loading || applying}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          Comparar (sin caché)
        </button>
      </div>

      {loading && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Consultando los grupos en Google Workspace… esto puede tardar hasta 30 segundos.
        </p>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {isEmpty && (
        <div className="mb-4 p-3 rounded-md bg-green-50 dark:bg-green-900/20 text-sm text-green-700 dark:text-green-400">
          Los grupos están sincronizados ✓
        </div>
      )}

      {diff && !isEmpty && (
        <>
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

          <div className="mt-6">
            <button
              onClick={applyChanges}
              disabled={applying || totalSelected() === 0}
              className="px-4 py-2 bg-red-600 text-white rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {applying ? 'Aplicando…' : `Aplicar cambios (${totalSelected()})`}
            </button>
          </div>
        </>
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
  )
}

function GroupPanel({ group, data, unchecked, onToggle }) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
      <h2 className="font-semibold text-gray-900 dark:text-white mb-3 break-all">{group}</h2>

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
    </div>
  )
}

function Section({ title, emptyText, items, renderItem }) {
  return (
    <div className="mb-4">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{title}</h3>
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
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Resultados</h2>
      {Object.entries(results).map(([group, r]) => (
        <div
          key={group}
          className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800"
        >
          <h3 className="font-medium text-gray-900 dark:text-white mb-2 break-all">{group}</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Añadidos: {r.added.length} · Removidos: {r.removed.length} · Fallidos: {r.failed.length}
          </p>
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
