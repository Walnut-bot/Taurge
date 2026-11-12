import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SettingsView } from '@/components/settings/settings-view'
import type { SettingsTab } from '@/components/settings/use-settings'
import { getTranslations, parseLocale } from '@/i18n/server'

const VALID_TABS: SettingsTab[] = [
  'profile',
  'appearance',
  'preferences',
  'shortcuts',
  'notifications',
  'security',
  'billing',
]

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
  const initialTab: SettingsTab = VALID_TABS.includes(tab as SettingsTab)
    ? (tab as SettingsTab)
    : 'profile'

  return (
    <Suspense fallback={null}>
      <SettingsView initialTab={initialTab} />
    </Suspense>
  )
}
