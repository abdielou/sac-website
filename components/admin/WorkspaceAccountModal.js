'use client'

import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useCreateWorkspaceAccount, useMembers } from '@/lib/hooks/useAdminData'
import { generateEmailCandidates } from '@/lib/workspace-email'

const inputClasses =
  'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

const labelClasses = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

/**
 * Modal dialog for creating a Google Workspace account for a member.
 * Displays email candidates generated from the member's name parts.
 * Rendered via createPortal to document.body.
 *
 * @param {{ isOpen: boolean, onClose: () => void, member: { email: string, phone?: string, name?: string, firstName?: string, initial?: string, lastName?: string, slastName?: string } | null }} props
 */
export function WorkspaceAccountModal({ isOpen, onClose, member }) {
  const { mutate, isPending, error, reset: resetMutation } = useCreateWorkspaceAccount()

  // Fetch all members to check existing sacEmails (only when modal is open)
  const { data: allMembersData } = useMembers({
    pageSize: 1000,
    enabled: isOpen,
  })

  const existingSacEmails = useMemo(() => {
    if (!allMembersData?.members) return new Set()
    return new Set(allMembersData.members.map((m) => m.sacEmail).filter(Boolean))
  }, [allMembersData])

  const [selectedEmail, setSelectedEmail] = useState('')
  const [sendWelcome, setSendWelcome] = useState(false)
  const [sendCredentials, setSendCredentials] = useState(false)
  const [candidates, setCandidates] = useState([])

  // Reset form state when modal opens with a member
  useEffect(() => {
    if (isOpen && member) {
      setSelectedEmail('')
      setSendWelcome(false)
      setSendCredentials(false)
      const generated = generateEmailCandidates({
        firstName: member.firstName,
        initial: member.initial,
        lastName: member.lastName,
        slastName: member.slastName,
      })
      setCandidates(generated || [])
      resetMutation()
    }
  }, [isOpen, member, resetMutation])

  const handleSubmit = (e) => {
    e.preventDefault()
    mutate(
      {
        email: member.email,
        firstName: member.firstName,
        initial: member.initial || '',
        lastName: member.lastName,
        slastName: member.slastName || '',
        sacEmail: selectedEmail,
        phone: member.phone || '',
        sendWelcome,
        sendCredentials,
      },
      {
        onSuccess: () => {
          onClose()
        },
      }
    )
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Generar Cuenta Workspace
          </h2>
          <button
            type="button"
            onClick={onClose}
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
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            {/* Member info display */}
            {member && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {member.name || member.email}
                </p>
                {member.name && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">{member.email}</p>
                )}
              </div>
            )}

            {/* Email candidates section */}
            <div>
              <label className={labelClasses}>Email Workspace</label>

              {candidates.length === 0 ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  No se pudieron generar candidatos. Verifique el nombre del miembro.
                </p>
              ) : (
                <>
                  {/* Email candidate select */}
                  <select
                    value={selectedEmail}
                    onChange={(e) => setSelectedEmail(e.target.value)}
                    className={inputClasses}
                  >
                    <option value="">-- Seleccionar email --</option>
                    {candidates.map((candidate) => {
                      const taken = existingSacEmails.has(candidate)
                      return (
                        <option key={candidate} value={candidate} disabled={taken}>
                          {candidate}
                          {taken ? ' (en uso)' : ''}
                        </option>
                      )
                    })}
                  </select>
                </>
              )}
            </div>

            {/* Email toggles */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendWelcome}
                  onChange={(e) => setSendWelcome(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Enviar email de bienvenida (certificado y carta)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendCredentials}
                  onChange={(e) => setSendCredentials(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Enviar email con credenciales al miembro
                </span>
              </label>
            </div>

            {/* Error display */}
            {error && <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || !selectedEmail}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isPending && (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
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
              {isPending ? 'Creando...' : 'Crear Cuenta'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

export default WorkspaceAccountModal
