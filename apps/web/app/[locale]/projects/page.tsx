import { redirect } from 'next/navigation'
import { parseLocale } from '@/i18n/server'

export default async function ProjectsRedirectPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const locale = parseLocale((await params).locale) ?? 'fr'
  redirect(`/${locale}/dashboard`)
}
