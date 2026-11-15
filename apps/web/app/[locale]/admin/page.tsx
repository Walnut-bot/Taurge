import type { Metadata } from 'next'
import { AdminView } from '@/components/admin-view'
import { parseLocale } from '@/i18n/server'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const locale = parseLocale((await params).locale)
  return { title: locale === 'en' ? 'Administration' : 'Administration' }
}

export default function AdminPage() {
  return <AdminView />
}
