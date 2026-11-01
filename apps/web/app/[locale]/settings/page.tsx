import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SettingsView } from '@/components/settings/settings-view'
import { getTranslations, parseLocale } from '@/i18n/server'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const locale = parseLocale((await params).locale)
  return { title: locale ? getTranslations(locale, 'Nav')('settings') : undefined }
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const initialTab =
    tab === 'preferences' || tab === 'security' || tab === 'billing' || tab === 'profile'
      ? tab
      : 'preferences'

  return (
    <Suspense fallback={null}>
      <SettingsView initialTab={initialTab} />
    </Suspense>
  )
}
