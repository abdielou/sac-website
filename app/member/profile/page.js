'use client'

import { useState } from 'react'
import { useMemberProfile, useUpdateMemberProfile } from '@/lib/hooks/useMemberProfile'
import { ProfileView } from '@/components/member/ProfileView'
import { ProfileForm } from '@/components/member/ProfileForm'

/**
 * Skeleton placeholder shown while profile data is loading.
 */
function ProfileSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700" />
        <div className="space-y-2">
          <div className="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-56 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3"
        >
          <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      ))}
    </div>
  )
}

/**
 * Member profile page orchestrator.
 * Manages view/edit mode toggling, profile data fetching, and save mutation.
 * Route: /member/profile
 */
export default function ProfilePage() {
  const [isEditing, setIsEditing] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const { data: profile, isLoading, error } = useMemberProfile()
  const { mutate: updateProfile, isPending: isSaving } = useUpdateMemberProfile()

  const handleSave = (fields, photoBlob) => {
    setSaveError(null)
    updateProfile(
      { fields, photo: photoBlob },
      {
        onSuccess: () => {
          setIsEditing(false)
          setSaveSuccess(true)
          // Clear success message after 3 seconds
          setTimeout(() => setSaveSuccess(false), 3000)
        },
        onError: (err) => {
          setSaveError(err.message)
        },
      }
    )
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Mi Perfil</h1>

      {/* Success feedback */}
      {saveSuccess && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-700 dark:text-green-400">
          Perfil actualizado exitosamente.
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {saveError}
        </div>
      )}

      {/* Loading */}
      {isLoading && <ProfileSkeleton />}

      {/* Fetch error */}
      {error && !isLoading && (
        <div className="text-center py-12">
          <p className="text-red-600 dark:text-red-400 mb-4">{error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Profile content */}
      {profile && !isLoading && (
        <>
          {isEditing ? (
            <ProfileForm
              profile={profile}
              onCancel={() => {
                setIsEditing(false)
                setSaveError(null)
              }}
              onSave={handleSave}
              isSaving={isSaving}
            />
          ) : (
            <ProfileView profile={profile} onEdit={() => setIsEditing(true)} />
          )}
        </>
      )}
    </div>
  )
}
