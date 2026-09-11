import { redirect } from 'next/navigation'

/** @deprecated Use /admin/ai?tab=guidelines */
export default function GuidelinesRedirectPage() {
  redirect('/admin/ai?tab=guidelines')
}
