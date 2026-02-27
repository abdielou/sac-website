'use client'

import { useState, useEffect, useRef } from 'react'
import { PhotoUpload } from './PhotoUpload'

/**
 * Status badge configuration (inline, same as ProfileView).
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
 * Section component for grouping form fields.
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
 * Read-only field display within the form for non-editable values.
 */
function ReadOnlyField({ label, children }) {
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
 * Input styling classes shared across all text inputs.
 */
const inputClasses =
  'w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed'

/**
 * Edit mode form for updating member profile fields and photo.
 * Editable: firstName, phone, town, postalAddress, zipcode, telescopeModel, otherEquipment, photo.
 * Read-only: email, status, expirationDate, memberSince.
 *
 * @param {Object} props
 * @param {Object} props.profile - Current profile data from API
 * @param {() => void} props.onCancel - Return to view mode
 * @param {(fields: Object, photoBlob: Blob|null) => void} props.onSave - Submit edits
 * @param {boolean} props.isSaving - Whether save is in progress
 */
export function ProfileForm({ profile, onCancel, onSave, isSaving }) {
  const [firstName, setFirstName] = useState(profile.firstName || '')
  const [initial, setInitial] = useState(profile.initial || '')
  const [lastName, setLastName] = useState(
    [profile.lastName, profile.slastName].filter(Boolean).join(' ')
  )
  const [town, setTown] = useState(profile.town || '')
  const [postalAddress, setPostalAddress] = useState(profile.postalAddress || '')
  const [zipcode, setZipcode] = useState(profile.zipcode || '')
  const [telescopeModel, setTelescopeModel] = useState(profile.telescopeModel || '')
  const [otherEquipment, setOtherEquipment] = useState(profile.otherEquipment || '')
  const [stagedPhoto, setStagedPhoto] = useState(null)
  const [stagedPhotoPreview, setStagedPhotoPreview] = useState(null)
  const previewUrlRef = useRef(null)

  // Cleanup staged photo preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current)
      }
    }
  }, [])

  const handlePhotoCropped = (blob, previewUrl) => {
    // Revoke previous preview if any
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
    }
    previewUrlRef.current = previewUrl
    setStagedPhoto(blob)
    setStagedPhotoPreview(previewUrl)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave(
      {
        firstName,
        initial,
        lastName,
        town,
        postalAddress,
        zipcode,
        telescopeModel,
        otherEquipment,
      },
      stagedPhoto
    )
  }

  const statusCfg = statusConfig[profile.status] || statusConfig.expired

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Photo upload area */}
      <div className="flex justify-center">
        <PhotoUpload
          currentPhotoUrl={profile.photoUrl}
          stagedPhotoUrl={stagedPhotoPreview}
          onPhotoCropped={handlePhotoCropped}
          disabled={isSaving}
        />
      </div>

      {/* Personal Info */}
      <Section title="Informacion Personal">
        <div className="space-y-4">
          {/* Editable name fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="firstName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Nombre
              </label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isSaving}
                className={inputClasses}
                placeholder="Nombre"
              />
            </div>
            <div>
              <label
                htmlFor="initial"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Inicial
              </label>
              <input
                id="initial"
                type="text"
                value={initial}
                onChange={(e) => setInitial(e.target.value)}
                disabled={isSaving}
                className={inputClasses}
                maxLength={1}
                placeholder="Inicial"
              />
            </div>
            <div>
              <label
                htmlFor="lastName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Apellidos
              </label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isSaving}
                className={inputClasses}
                placeholder="Apellidos"
              />
            </div>
          </div>

          {/* Read-only fields */}
          <dl className="divide-y divide-gray-100 dark:divide-gray-700">
            <ReadOnlyField label="Email">
              <span className="flex items-center gap-2">
                {profile.email}
                <span className="inline-flex px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded">
                  Solo lectura
                </span>
              </span>
            </ReadOnlyField>
            <ReadOnlyField label="Telefono">
              <span className="flex items-center gap-2">
                {profile.phone || '\u2014'}
                <span className="inline-flex px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded">
                  Solo lectura
                </span>
              </span>
            </ReadOnlyField>
            <ReadOnlyField label="Estado">
              <span
                className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusCfg.classes}`}
              >
                {statusCfg.label}
              </span>
            </ReadOnlyField>
            <ReadOnlyField label="Vencimiento">{formatDate(profile.expirationDate)}</ReadOnlyField>
            <ReadOnlyField label="Miembro desde">{formatDate(profile.memberSince)}</ReadOnlyField>
          </dl>
        </div>
      </Section>

      {/* Contact */}
      <Section title="Contacto">
        <div className="space-y-4">
          <div>
            <label
              htmlFor="town"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Pueblo
            </label>
            <input
              id="town"
              type="text"
              value={town}
              onChange={(e) => setTown(e.target.value)}
              disabled={isSaving}
              className={inputClasses}
              placeholder="San Juan"
            />
          </div>
          <div>
            <label
              htmlFor="postalAddress"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Direccion postal
            </label>
            <input
              id="postalAddress"
              type="text"
              value={postalAddress}
              onChange={(e) => setPostalAddress(e.target.value)}
              disabled={isSaving}
              className={inputClasses}
              placeholder="Calle Principal #123"
            />
          </div>
          <div>
            <label
              htmlFor="zipcode"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Codigo postal
            </label>
            <input
              id="zipcode"
              type="text"
              value={zipcode}
              onChange={(e) => setZipcode(e.target.value)}
              disabled={isSaving}
              className={inputClasses}
              placeholder="00901"
            />
          </div>
        </div>
      </Section>

      {/* Equipment */}
      <Section title="Equipo">
        <div className="space-y-4">
          <div>
            <label
              htmlFor="telescopeModel"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Modelo telescopio
            </label>
            <input
              id="telescopeModel"
              type="text"
              value={telescopeModel}
              onChange={(e) => setTelescopeModel(e.target.value)}
              disabled={isSaving}
              className={inputClasses}
              placeholder="Celestron NexStar 8SE"
            />
          </div>
          <div>
            <label
              htmlFor="otherEquipment"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Otro equipo
            </label>
            <textarea
              id="otherEquipment"
              value={otherEquipment}
              onChange={(e) => setOtherEquipment(e.target.value)}
              disabled={isSaving}
              rows={3}
              className={inputClasses}
              placeholder="Binoculares, camara, filtros..."
            />
          </div>
        </div>
      </Section>

      {/* Action buttons */}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {isSaving && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          )}
          Guardar
        </button>
      </div>
    </form>
  )
}

export default ProfileForm
