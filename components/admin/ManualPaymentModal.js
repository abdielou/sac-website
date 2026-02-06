'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useManualPayment } from '@/lib/hooks/useAdminData'

/**
 * Get today's date in YYYY-MM-DD format
 */
function todayStr() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const TITLES = {
  GIFT: 'Otorgar Membresia Gratuita',
  MANUAL: 'Registrar Pago de Membresia',
}

const inputClasses =
  'w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

const labelClasses = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

/**
 * Modal dialog for submitting a manual payment or granting a free membership.
 * Rendered via createPortal to document.body.
 *
 * @param {{ isOpen: boolean, onClose: () => void, member: { email: string, phone?: string, name?: string } | null, paymentType: 'GIFT'|'MANUAL'|null }} props
 */
export function ManualPaymentModal({ isOpen, onClose, member, paymentType }) {
  const { mutate, isPending, error, reset: resetMutation } = useManualPayment()

  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')

  // Reset form state when modal opens with new member/paymentType
  useEffect(() => {
    if (isOpen && member && paymentType) {
      setEmail(member.email || '')
      setPhone(member.phone || '')
      setAmount(paymentType === 'GIFT' ? '0' : '25')
      setDate(todayStr())
      setNotes('')
      resetMutation()
    }
  }, [isOpen, member, paymentType, resetMutation])

  // Clear mutation error when user modifies any field
  const clearError = () => {
    if (error) resetMutation()
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    mutate(
      {
        email,
        phone,
        amount: parseFloat(amount),
        date,
        payment_type: paymentType,
        notes,
      },
      {
        onSuccess: () => {
          onClose()
        },
      }
    )
  }

  if (!isOpen) return null

  const title = TITLES[paymentType] || 'Registrar Pago'

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => {
        // Close on backdrop click (not on modal content click)
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
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

            {/* Email */}
            <div>
              <label className={labelClasses}>Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  clearError()
                }}
                className={inputClasses}
              />
            </div>

            {/* Phone */}
            <div>
              <label className={labelClasses}>Telefono</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value)
                  clearError()
                }}
                className={inputClasses}
              />
            </div>

            {/* Amount */}
            <div>
              <label className={labelClasses}>Monto ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  clearError()
                }}
                className={inputClasses}
              />
            </div>

            {/* Date */}
            <div>
              <label className={labelClasses}>Fecha</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => {
                  setDate(e.target.value)
                  clearError()
                }}
                className={inputClasses}
              />
            </div>

            {/* Payment type badge (read-only) */}
            <div>
              <label className={labelClasses}>Tipo</label>
              <span
                className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${
                  paymentType === 'GIFT'
                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                }`}
              >
                {paymentType}
              </span>
            </div>

            {/* Notes */}
            <div>
              <label className={labelClasses}>Notas (opcional)</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value)
                  clearError()
                }}
                className={inputClasses}
              />
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
              disabled={isPending}
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
              {isPending ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  )
}

export default ManualPaymentModal
