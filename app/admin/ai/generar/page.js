import { redirect } from 'next/navigation'

/** @deprecated Use /admin/ai?tab=generar */
export default function GenerarRedirectPage() {
  redirect('/admin/ai?tab=generar')
}
