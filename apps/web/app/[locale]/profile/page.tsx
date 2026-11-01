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
  return { title: locale ? getTranslations(locale, 'Nav')('profile') : undefined }
}

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <SettingsView initialTab="profile" />
    </Suspense>
  )
}
