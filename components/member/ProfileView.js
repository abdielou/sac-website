'use client'

/**
 * Default avatar SVG as inline data URL.
 */
const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'%3E%3Ccircle cx='64' cy='64' r='64' fill='%23e5e7eb'/%3E%3Ccircle cx='64' cy='48' r='22' fill='%239ca3af'/%3E%3Cellipse cx='64' cy='100' rx='36' ry='24' fill='%239ca3af'/%3E%3C/svg%3E"

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
    <div className="space-y-6">
      {/* Header: Photo + Name + Edit button */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 shrink-0">
            <img
              src={profile.photoUrl || DEFAULT_AVATAR}
              alt="Foto de perfil"
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {display(profile.firstName || profile.name)}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{profile.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shrink-0"
        >
          Editar
        </button>
      </div>

      {/* Personal Info */}
      <Section title="Informacion Personal">
        <dl className="divide-y divide-gray-100 dark:divide-gray-700">
          <Field label="Nombre">{display(profile.firstName || profile.name)}</Field>
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
  )
}

export default ProfileView
