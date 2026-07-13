import { redirect } from 'next/navigation'

/** @deprecated Use /admin/ai?tab=validar */
export default function ValidarRedirectPage() {
  redirect('/admin/ai')
}
