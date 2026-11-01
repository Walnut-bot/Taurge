import type { Metadata } from 'next'
import { BillingView } from '@/components/billing-view'
import { getTranslations, parseLocale } from '@/i18n/server'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const locale = parseLocale((await params).locale)
  return { title: locale ? getTranslations(locale, 'Billing')('title') : undefined }
}

export default function BillingPage() {
  return <BillingView />
}
