'use client'

import { IdCardPreview } from '@/components/member/IdCardPreview'

/**
 * Status badge configuration matching admin StatusBadge pattern.
 * Inline here to avoid coupling member UI to admin components.
 */
const statusConfig = {
  active: {
    label: 'Activo',
    classes: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  'expiring-soon': {
    label: 'Vence pronto',
    classes: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  expired: {
    label: 'Expirado',
    classes: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  },
}

/**
 * Format a date string in Spanish locale.
 * @param {string|null} dateStr - ISO date string
 * @returns {string} Formatted date or em dash
 */
function formatDate(dateStr) {
  if (!dateStr) return '\u2014'
  try {
    return new Date(dateStr).toLocaleDateString('es-PR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return '\u2014'
  }
}

/**
 * Display a value or em dash for empty fields.
 * @param {*} value
 * @returns {string}
 */
function display(value) {
  return value || '\u2014'
}

/**
 * Section component for grouping profile fields.
 */
function Section({ title, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">
        {title}
      </h3>
      {children}
    </div>
  )
}

/**
 * Single field row with label and value.
 */
function Field({ label, children }) {
  return (
    <div className="py-2 flex flex-col sm:flex-row sm:items-center gap-1">
      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 sm:w-40 shrink-0">
        {label}
      </dt>
      <dd className="text-sm text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  )
}

/**
 * Read-only profile display with all member info sections.
 * Shows photo, personal info, contact, and equipment in card-style sections.
 *
 * @param {Object} props
 * @param {Object} props.profile - Profile data from API
 * @param {() => void} props.onEdit - Callback to switch to edit mode
 */
export function ProfileView({ profile, onEdit }) {
  const statusCfg = statusConfig[profile.status] || statusConfig.expired

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Left column — ID Card + Buttons (sticky on desktop) */}
      <div className="lg:sticky lg:top-6 lg:self-start flex flex-col items-center gap-4 shrink-0">
        <div className="w-64">
          <IdCardPreview profile={profile} />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            Editar
          </button>
          {/* TODO: Re-enable PDF download — swap <span> back to <a href="/api/member/id-card"> */}
          {(profile.status === 'active' || profile.status === 'expiring-soon') && (
            <span
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600/50 rounded-lg cursor-not-allowed"
              title="No disponible en este momento"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Descargar
            </span>
          )}
        </div>
      </div>

      {/* Right column — Info sections */}
      <div className="flex-1 space-y-6 min-w-0">
        {/* Personal Info */}
        <Section title="Informacion Personal">
          <dl className="divide-y divide-gray-100 dark:divide-gray-700">
            <Field label="Nombre">{display(profile.name)}</Field>
            <Field label="Email">
              <span className="flex items-center gap-2">
                {profile.email}
                <span className="inline-flex px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded">
                  Solo lectura
                </span>
              </span>
            </Field>
            <Field label="Estado">
              <span
                className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusCfg.classes}`}
              >
                {statusCfg.label}
              </span>
            </Field>
            <Field label="Vencimiento">{formatDate(profile.expirationDate)}</Field>
            <Field label="Miembro desde">{formatDate(profile.memberSince)}</Field>
          </dl>
        </Section>

        {/* Contact */}
        <Section title="Contacto">
          <dl className="divide-y divide-gray-100 dark:divide-gray-700">
            <Field label="Telefono">{display(profile.phone)}</Field>
            <Field label="Pueblo">{display(profile.town)}</Field>
            <Field label="Direccion postal">{display(profile.postalAddress)}</Field>
            <Field label="Codigo postal">{display(profile.zipcode)}</Field>
          </dl>
        </Section>

        {/* Equipment */}
        <Section title="Equipo">
          <dl className="divide-y divide-gray-100 dark:divide-gray-700">
            <Field label="Modelo telescopio">{display(profile.telescopeModel)}</Field>
            <Field label="Otro equipo">{display(profile.otherEquipment)}</Field>
            {profile.hasTelescope !== undefined && (
              <Field label="Tiene telescopio">{profile.hasTelescope ? 'Si' : 'No'}</Field>
            )}
          </dl>
        </Section>
      </div>
    </div>
  )
}

export default ProfileView
