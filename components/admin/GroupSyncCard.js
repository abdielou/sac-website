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

  // Select/unselect an entire section (group + op) at once
  const setSection = (group, op, emails, select) => {
    setUnchecked((prev) => {
      const next = new Set(prev)
      for (const email of emails) {
        const key = checkboxKey(group, op, email)
        if (select) next.delete(key)
        else next.add(key)
      }
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

  // CSV report for auditing: preview (with selections) before apply,
  // actual per-email results after apply.
  const downloadReport = () => {
    const csvEscape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [['grupo', 'seccion', 'correo', 'nombre', 'razon', 'rol', 'seleccionado']]

    if (diff) {
      for (const group of [GROUP_MIEMBROS, GROUP_PERSONAL]) {
        const g = diff.groups[group]
        g.toAdd.forEach((i) =>
          rows.push([
            group,
            'añadir',
            i.email,
            i.name,
            '',
            'MEMBER',
            unchecked.has(checkboxKey(group, 'add', i.email)) ? 'no' : 'sí',
          ])
        )
        g.toRemove.forEach((i) =>
          rows.push([
            group,
            'remover',
            i.email,
            '',
            reasonLabel(i.reason),
            i.role,
            unchecked.has(checkboxKey(group, 'remove', i.email)) ? 'no' : 'sí',
          ])
        )
        ;(g.inSync || []).forEach((i) =>
          rows.push([group, 'sincronizado', i.email, i.name, '', i.role, ''])
        )
        ;(g.protectedOwners || []).forEach((i) =>
          rows.push([group, 'owner_protegido', i.email, '', '', 'OWNER', ''])
        )
      }
      ;(diff.missingSacEmail || []).forEach((i) =>
        rows.push(['', 'sin_cuenta_workspace', i.email, i.name, '', '', ''])
      )
    } else if (applyResults) {
      for (const [group, r] of Object.entries(applyResults)) {
        r.added.forEach((email) => rows.push([group, 'añadido', email, '', '', '', '']))
        r.removed.forEach((email) => rows.push([group, 'removido', email, '', '', '', '']))
        ;(r.skipped || []).forEach((s) =>
          rows.push([group, 'omitido_owner', s.email, '', s.reason, 'OWNER', ''])
        )
        ;(r.resolved || []).forEach((x) =>
          rows.push([
            group,
            'añadido_resuelto_como',
            x.actual,
            '',
            `solicitado: ${x.requested}`,
            '',
            '',
          ])
        )
        r.failed.forEach((f) => rows.push([group, `fallido_${f.op}`, f.email, '', f.error, '', '']))
      }
    } else {
      return
    }

    // BOM so Excel opens accents correctly
    const bom = String.fromCharCode(0xfeff)
    const csv = bom + rows.map((r) => r.map(csvEscape).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    a.download = `${diff ? 'sync-grupos-preview' : 'sync-grupos-resultado'}-${stamp}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
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

                {diff && (
                  <div className="grid gap-6 lg:grid-cols-2">
                    {[GROUP_MIEMBROS, GROUP_PERSONAL].map((group) => (
                      <GroupPanel
                        key={group}
                        group={group}
                        data={diff.groups[group]}
                        unchecked={unchecked}
                        onToggle={toggle}
                        onSetSection={setSection}
                      />
                    ))}
                  </div>
                )}

                {diff && diff.missingSacEmail.length > 0 && (
                  <details className="mt-6 p-4 rounded-md bg-yellow-50 dark:bg-yellow-900/20">
                    <summary className="text-sm font-semibold text-yellow-800 dark:text-yellow-300 cursor-pointer select-none">
                      Miembros activos sin cuenta de Workspace ({diff.missingSacEmail.length})
                    </summary>
                    <p className="mt-2 text-xs text-yellow-700 dark:text-yellow-400 mb-2">
                      No se pueden añadir a {GROUP_MIEMBROS} hasta que tengan cuenta.
                    </p>
                    <ul className="text-sm text-yellow-800 dark:text-yellow-300 list-disc pl-5">
                      {diff.missingSacEmail.map((m) => (
                        <li key={m.email}>
                          {m.name} ({m.email})
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {applyResults && <ApplyResults results={applyResults} />}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center gap-3">
                <button
                  type="button"
                  onClick={downloadReport}
                  className="px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20"
                >
                  Descargar reporte
                </button>
                <div className="flex-1" />
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

function GroupPanel({ group, data, unchecked, onToggle, onSetSection }) {
  const isChecked = (op, email) => !unchecked.has(checkboxKey(group, op, email))

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <h3 className="font-semibold text-gray-900 dark:text-white mb-3 break-all">{group}</h3>

      <SyncTable
        title="Añadir"
        emptyText="Nada que añadir"
        items={data.toAdd}
        headers={['Correo', 'Nombre']}
        isChecked={(item) => isChecked('add', item.email)}
        onToggle={(item) => onToggle(checkboxKey(group, 'add', item.email))}
        onSelectAll={(select) =>
          onSetSection(
            group,
            'add',
            data.toAdd.map((i) => i.email),
            select
          )
        }
        renderCells={(item) => (
          <>
            <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 break-all">
              {item.email}
            </td>
            <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">{item.name}</td>
          </>
        )}
      />

      <SyncTable
        title="Remover"
        emptyText="Nada que remover"
        items={data.toRemove}
        headers={['Correo', 'Razón', 'Rol']}
        isChecked={(item) => isChecked('remove', item.email)}
        onToggle={(item) => onToggle(checkboxKey(group, 'remove', item.email))}
        onSelectAll={(select) =>
          onSetSection(
            group,
            'remove',
            data.toRemove.map((i) => i.email),
            select
          )
        }
        renderCells={(item) => (
          <>
            <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 break-all">
              {item.email}
            </td>
            <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              {reasonLabel(item.reason)}
            </td>
            <td className="px-3 py-2 text-sm">
              {item.role !== 'MEMBER' ? (
                <span className="px-1.5 py-0.5 text-xs font-semibold rounded bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                  {item.role}
                </span>
              ) : (
                <span className="text-gray-400 dark:text-gray-500 text-xs">MEMBER</span>
              )}
            </td>
          </>
        )}
      />

      <InSyncTable items={data.inSync || []} />

      {data.protectedOwners && data.protectedOwners.length > 0 && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="font-medium">Se conservan (OWNER):</span>{' '}
          {data.protectedOwners.map((o) => o.email).join(', ')}
        </div>
      )}
    </div>
  )
}

function InSyncTable({ items }) {
  return (
    <details className="mb-2">
      <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none">
        Ya sincronizados ({items.length})
      </summary>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">Ninguno</p>
      ) : (
        <div className="mt-2 overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Correo
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Rol
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((item) => (
                <tr key={item.email}>
                  <td className="px-3 py-2 text-sm text-gray-900 dark:text-gray-100 break-all">
                    {item.email}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                    {item.name}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-xs">
                    {item.role}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  )
}

function SyncTable({
  title,
  emptyText,
  items,
  headers,
  isChecked,
  onToggle,
  onSelectAll,
  renderCells,
}) {
  const selectedCount = items.filter(isChecked).length
  const allSelected = items.length > 0 && selectedCount === items.length

  return (
    <details open className="mb-4">
      <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none mb-2">
        {title} ({selectedCount}/{items.length})
        {items.length > 0 && (
          <span className="ml-3 text-xs font-normal">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                onSelectAll(true)
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Marcar todos
            </button>
            <span className="mx-1 text-gray-300 dark:text-gray-600">·</span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                onSelectAll(false)
              }}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              Desmarcar todos
            </button>
          </span>
        )}
      </summary>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => onSelectAll(!allSelected)}
                    className="rounded border-gray-300 dark:border-gray-600"
                    aria-label={`Seleccionar todos: ${title}`}
                  />
                </th>
                {headers.map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((item) => (
                <tr
                  key={item.email}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer"
                  onClick={() => onToggle(item)}
                >
                  <td className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={isChecked(item)}
                      onChange={() => onToggle(item)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-gray-300 dark:border-gray-600"
                    />
                  </td>
                  {renderCells(item)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
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
          {r.resolved && r.resolved.length > 0 && (
            <div className="mt-1 text-sm text-yellow-700 dark:text-yellow-400">
              <p className="font-medium">
                ⚠️ Google registró estas direcciones con otro correo (cuenta principal):
              </p>
              <ul className="list-disc pl-5">
                {r.resolved.map((x) => (
                  <li key={x.requested}>
                    {x.requested} → {x.actual} — actualiza la hoja CLEAN con este correo o el sync
                    lo propondrá de nuevo
                  </li>
                ))}
              </ul>
            </div>
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
