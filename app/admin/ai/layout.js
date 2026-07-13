import { redirect } from 'next/navigation'

/**
 * Dev-only gate for the AI section. Content lives in page.js under a single /admin/ai URL.
 */
export default function AdminAiLayout({ children }) {
  if (process.env.NODE_ENV === 'production') {
    redirect('/admin')
  }

  return children
}
