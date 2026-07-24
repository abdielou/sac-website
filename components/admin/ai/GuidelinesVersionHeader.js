'use client'

function formatDate(iso) {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('es-PR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export default function GuidelinesVersionHeader({
  active,
  basedOn,
  isEditing,
  canWrite,
  hasDraft,
  loading = false,
  onCreateDraft,
  onSaveDraft,
  onActivate,
  onDiscard,
}) {
  const doc = active

  return (
    <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 md:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {isEditing ? 'Editando borrador' : 'Versión activa'}
          </p>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEditing
              ? `Borrador (basado en ${basedOn || doc?.version || '—'})`
              : `${doc?.version} — Activa`}
          </h2>
          {!isEditing && doc?.updatedAt && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Actualizado el {formatDate(doc.updatedAt)}
              {doc.updatedBy ? ` por ${doc.updatedBy}` : ''}
            </p>
          )}
        </div>

        {canWrite && (
          <div className="flex flex-wrap gap-2">
            {!hasDraft && (
              <button
                type="button"
                onClick={onCreateDraft}
                disabled={loading}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Crear borrador desde activa
              </button>
            )}
            {hasDraft && (
              <>
                <button
                  type="button"
                  onClick={onSaveDraft}
                  disabled={loading}
                  className="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Guardar borrador
                </button>
                <button
                  type="button"
                  onClick={onActivate}
                  disabled={loading}
                  className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  Activar borrador
                </button>
                <button
                  type="button"
                  onClick={onDiscard}
                  disabled={loading}
                  className="rounded-md px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:underline disabled:opacity-50"
                >
                  Descartar
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
