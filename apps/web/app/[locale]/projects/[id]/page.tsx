import type { Metadata } from 'next'
import { Workspace } from '@/components/workspace/workspace'
import { parseLocale } from '@/i18n/server'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}): Promise<Metadata> {
  const locale = parseLocale((await params).locale)
  return { title: locale === 'en' ? 'Studio' : 'Atelier' }
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <Workspace projectId={id} />
}
