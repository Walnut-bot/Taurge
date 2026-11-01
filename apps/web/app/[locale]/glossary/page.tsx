import type { Metadata } from 'next'
import { GlossaryPageView } from '@/components/glossary-page-view'
import { getTranslations, parseLocale } from '@/i18n/server'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const locale = parseLocale((await params).locale)
  return { title: locale ? getTranslations(locale, 'GlossaryPage')('title') : undefined }
}

export default function GlossaryPage() {
  return <GlossaryPageView />
}
