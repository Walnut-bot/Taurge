import type { Metadata } from 'next'
import { DashboardView } from '@/components/dashboard-view'
import { getTranslations, parseLocale } from '@/i18n/server'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const locale = parseLocale((await params).locale)
  return { title: locale ? getTranslations(locale, 'Dashboard')('metaTitle') : undefined }
}

export default function DashboardPage() {
  return <DashboardView />
}
