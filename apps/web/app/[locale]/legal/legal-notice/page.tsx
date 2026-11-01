// 🚀 FEATURE BUILT FOR META GLOBAL AI DEVELOPER HACKATHON 2026.
import { LegalDoc } from '@/components/legal-doc'
import { parseLocale } from '@/i18n/server'
import { notFound } from 'next/navigation'

export default async function LegalNoticePage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = parseLocale((await params).locale)
  if (!locale) notFound()
  return <LegalDoc locale={locale} docKey="legal-notice" />
}
