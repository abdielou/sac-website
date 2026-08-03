'use client'

import { FIELD_LIBRARY } from '@/lib/ai-guidelines-schema'

const inputClass =
  'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed'
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

export function formStateKeyForContentField(key, definition) {
  const eventLike =
    definition?.visual?.template === 'event' ||
    definition?.fields?.some((field) =>
      ['event_name', 'date', 'time', 'location'].includes(field.key)
    )
  const keys = {
    intent: 'intent',
    topic: 'topic',
    event_name: 'eventName',
    date: 'eventDate',
    time: 'eventTime',
    location: 'eventLocation',
    cta: eventLike ? 'eventCta' : 'cta',
    tone: 'tone',
    audience: 'audience',
    known_facts: 'knownFacts',
    hashtags: 'hashtags',
    links: 'links',
    image_style: 'imageStyle',
    image_constraints: 'imageConstraints',
  }
  return keys[key] || null
}

function maxLengthForField(fieldDefinition) {
  if (fieldDefinition.maxLength) return fieldDefinition.maxLength
  if (fieldDefinition.maxItems && fieldDefinition.itemMaxLength) {
    return fieldDefinition.maxItems * fieldDefinition.itemMaxLength + fieldDefinition.maxItems * 2
  }
  return undefined
}

export default function ContentTypeFields({
  definition,
  formState,
  onFormChange,
  disabled = false,
  idPrefix = 'content',
  errors = {},
}) {
  const fields = Array.isArray(definition?.fields)
    ? definition.fields.filter(({ key }) => key !== 'sponsor')
    : []

  if (!fields.length) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Este tipo no tiene campos configurados.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.map((field) => {
        const supported = FIELD_LIBRARY[field.key]
        const stateKey = formStateKeyForContentField(field.key, definition)
        if (!supported || !stateKey) return null
        const id = `${idPrefix}-${field.key}`
        const error = errors[field.key]
        const multiline = supported.inputType === 'textarea' || supported.inputType === 'list'
        const common = {
          id,
          value: formState[stateKey] || '',
          disabled,
          required: field.required,
          maxLength: maxLengthForField(supported),
          placeholder: field.placeholder || '',
          onChange: (event) =>
            onFormChange({
              ...formState,
              [stateKey]: event.target.value,
            }),
          'aria-invalid': Boolean(error),
          'aria-describedby':
            [field.help ? `${id}-help` : null, error ? `${id}-error` : null]
              .filter(Boolean)
              .join(' ') || undefined,
          className: inputClass,
        }

        return (
          <div key={field.key} className={multiline ? 'sm:col-span-2' : ''}>
            <label htmlFor={id} className={labelClass}>
              {field.label || supported.label}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            {multiline ? (
              <textarea {...common} rows={supported.inputType === 'list' ? 3 : 4} />
            ) : (
              <input {...common} type={supported.inputType} />
            )}
            {field.help && (
              <p id={`${id}-help`} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {field.help}
              </p>
            )}
            {error && (
              <p id={`${id}-error`} className="mt-1 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
