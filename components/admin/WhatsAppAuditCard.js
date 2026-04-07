'use client'

import { useSession } from 'next-auth/react'
import { useState, useRef } from 'react'

/**
 * WhatsAppAuditCard - Action card for WhatsApp community membership audit
 *
 * Allows admins to upload a WhatsApp members CSV, which is processed against
 * SAC member data to produce an audit CSV with matched/unknown/missing entries.
 *
 * States:
 * - idle: Ready to upload, button enabled
 * - uploading: Spinner + disabled button
 * - success: Green success message
 * - error: Red error message with retry button
 */
export function WhatsAppAuditCard() {
  const { data: session } = useSession()
  const [status, setStatus] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const fileInputRef = useRef(null)

  const accessibleActions = session?.user?.accessibleActions || []
  const canAudit =
    accessibleActions.includes('write_members') ||
    accessibleActions.includes('download_csv_members')

  if (!canAudit) {
    return null
  }

  const handleButtonClick = () => {
    if (status === 'error') {
      setStatus('idle')
      setErrorMsg('')
    }
    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setStatus('uploading')
    setErrorMsg('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/admin/whatsapp-audit', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Error al procesar el archivo')
      }

      // Download the CSV response
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ||
        'whatsapp-audit.csv'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setStatus('success')
    } catch (err) {
      setErrorMsg(err.message || 'Error desconocido')
      setStatus('error')
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const Spinner = () => (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Label */}
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Auditoría WhatsApp</p>

      {/* Status area */}
      <div className="mt-2 min-h-[1.75rem]">
        {status === 'idle' && (
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Subir CSV de miembros de WhatsApp
          </p>
        )}

        {status === 'uploading' && (
          <p className="text-sm text-gray-500 dark:text-gray-400">Procesando archivo...</p>
        )}

        {status === 'success' && (
          <p className="text-sm text-green-600 dark:text-green-400">
            Auditoría completada — archivo descargado
          </p>
        )}

        {status === 'error' && <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>}
      </div>

      {/* Action button */}
      <button
        onClick={handleButtonClick}
        disabled={status === 'uploading'}
        className="w-full mt-3 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {status === 'uploading' ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Spinner />
            Procesando...
          </span>
        ) : status === 'error' ? (
          'Reintentar'
        ) : (
          'Seleccionar CSV'
        )}
      </button>
    </div>
  )
}

export default WhatsAppAuditCard
