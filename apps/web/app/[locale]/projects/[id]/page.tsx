import { Workspace } from '@/components/workspace/workspace'

export const metadata = { title: 'Studio' }

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <Workspace projectId={id} />
}
