import type { Metadata } from 'next'
import { NewProjectForm } from '@/components/new-project-form'
import { parseLocale } from '@/i18n/server'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const locale = parseLocale((await params).locale)
  return { title: locale === 'en' ? 'New project' : 'Nouveau projet' }
}

export default function NewProjectPage() {
  return <NewProjectForm />
}
