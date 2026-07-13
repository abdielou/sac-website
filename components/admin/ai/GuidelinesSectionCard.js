'use client'

export default function GuidelinesSectionCard({
  title,
  children,
  editable = false,
  editing = false,
  onEdit,
}) {
  return (
    <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 md:p-5 h-full flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
        {editable && !editing && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            aria-label={`Editar ${title}`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </button>
        )}
      </div>
      <div className="flex-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
        {children}
      </div>
    </section>
  )
}
