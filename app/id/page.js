import { redirect } from 'next/navigation'

/**
 * Redirect /id to the new member profile page where the ID card preview lives.
 * Preserves backward compatibility for any existing links to /id.
 */
export default function IdRedirect() {
  redirect('/member/profile')
}
