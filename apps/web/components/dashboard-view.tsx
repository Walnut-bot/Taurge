'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Pencil, Plus, Trash2, X } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { AppShell } from '@/components/app-shell'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { EmptyState, ErrorState } from '@/components/ui/status'
import { Link } from '@/i18n/navigation'
import { useTranslations } from '@/i18n/provider'
import { contentTypeLabel, formatDate } from '@/lib/catalog'
import { useProjects, useRequireAuth } from '@/lib/hooks'
import { api } from '@/lib/api'

export function DashboardView() {
  const t = useTranslations('Dashboard')
  const tExtra = useTranslations('DashboardExtra')
  const tCommon = useTranslations('Common')
  const authed = useRequireAuth()
  const { data: projects, error, isLoading, mutate } = useProjects(authed)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  const deletingProject = projects?.find((p) => p.id === deletingId)

  useEffect(() => {
    if (!deletingId) return
    dialogRef.current?.querySelector<HTMLElement>('button')?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setDeletingId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [deletingId])

  async function submitRename(projectId: string) {
    const name = renameValue.trim()
    if (!name) return
    setRenameError(null)
    try {
      await api.renameProject(projectId, name)
      setRenamingId(null)
      await mutate()
    } catch {
      setRenameError(tExtra('renameError'))
    }
  }

  async function confirmDelete() {
    if (!deletingId) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.deleteProject(deletingId)
      setDeletingId(null)
      await mutate()
    } catch (err) {
      // Sans ce catch, un échec serveur laissait la modale ouverte
      // sans aucun message : l'utilisateur croyait que la demande
      // n'était même pas partie.
      setDeleteError(err instanceof Error ? err.message : tExtra('deleteError'))
    } finally {
      setDeleting(false)
    }
  }

  if (!authed) return null

  return (
    <>
      <AppHeader />
      <AppShell>
      <main id="contenu" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-[1.5px] border-ink pb-5">
          <div>
            <p className="label-mono text-ink-soft">{t('studio')}</p>
            <h1 className="mt-1 text-4xl font-bold tracking-tight">
              {t('title')}
              {projects && projects.length > 0 && (
                <span className="ml-3 font-mono text-lg font-normal text-ink-soft">
                  {String(projects.length).padStart(2, '0')}
                </span>
              )}
            </h1>
          </div>
          <Link href="/projects/new" className={buttonVariants({ variant: 'seal' })}>
            <Plus aria-hidden="true" />
            {t('newProject')}
          </Link>
        </div>

        {isLoading && <ListSkeleton label={t('loadingProjects')} />}

        {error && (
          <ErrorState className="mt-8" message={error.message} retryLabel={tCommon('retry')} onRetry={() => mutate()} />
        )}

        {projects && projects.length === 0 && (
          <EmptyState className="mt-8" title={t('emptyTitle')} body={t('emptyBody')}>
            <Link href="/projects/new" className={buttonVariants()}>
              {t('createFirst')}
            </Link>
          </EmptyState>
        )}

        {projects && projects.length > 0 && (
          <ul className="mt-2">
            {projects.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between border-b border-hairline py-2 transition-colors hover:bg-sheet sm:px-3">
                <Link
                  href={`/projects/${p.id}`}
                  className="group grid flex-1 grid-cols-[1fr_auto] items-center gap-x-6 gap-y-1 py-3 sm:grid-cols-[1fr_7rem_6rem_7rem_1.5rem]"
                >
                  <span className="text-lg font-semibold group-hover:underline group-hover:decoration-seal group-hover:underline-offset-4">
                    {p.name}
                  </span>
                  <span className="font-mono text-sm text-ink sm:order-none">
                    {p.source_lang.toUpperCase()}
                    <span className="mx-1.5 text-seal" aria-label={t('to')}>
                      →
                    </span>
                    {p.target_lang.toUpperCase()}
                  </span>
                  <span className="text-sm text-ink-soft max-sm:col-span-2 max-sm:row-start-2">
                    {contentTypeLabel(p.content_type)}
                    <span className="sm:hidden"> · {formatDate(p.created_at)}</span>
                  </span>
                  <span className="hidden font-mono text-xs text-ink-soft sm:block">{formatDate(p.created_at)}</span>
                  <ArrowUpRight
                    className="hidden size-5 text-ink-soft transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-seal sm:block"
                    aria-hidden="true"
                  />
                </Link>
                <div className="ml-4 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-ink-soft hover:text-ink"
                    title={tExtra('rename')}
                    aria-label={`${tExtra('rename')} — ${p.name}`}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setRenameError(null)
                      setRenameValue(p.name)
                      setRenamingId(renamingId === p.id ? null : p.id)
                    }}
                  >
                    <Pencil aria-hidden="true" />
                    <span className="max-sm:hidden">{tExtra('rename')}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-ink-soft hover:bg-danger-wash hover:text-danger"
                    title={t('deleteTitle')}
                    aria-label={`${tExtra('deleteProject')} — ${p.name}`}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setDeleteError(null)
                      setDeletingId(p.id)
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                    <span className="max-sm:hidden">{tCommon('delete')}</span>
                  </Button>
                </div>
                {renamingId === p.id && (
                  <form
                    className="flex w-full flex-wrap items-end gap-2 py-3 sm:col-span-full"
                    onSubmit={(e) => {
                      e.preventDefault()
                      submitRename(p.id)
                    }}
                  >
                    <div className="flex min-w-52 flex-1 flex-col gap-1.5">
                      <Label htmlFor={`rename-${p.id}`}>{tExtra('projectName')}</Label>
                      <Input
                        id={`rename-${p.id}`}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        maxLength={200}
                        autoFocus
                      />
                    </div>
                    <Button type="submit" size="sm" variant="seal">
                      {tExtra('save')}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRenamingId(null)}>
                      {tCommon('cancel')}
                    </Button>
                    {renameError && (
                      <p role="alert" className="w-full text-sm text-danger">
                        {renameError}
                      </p>
                    )}
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
      </AppShell>

      {deletingProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="presentation" onClick={() => setDeletingId(null)}>
          <div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            aria-describedby="delete-body"
            className="w-full max-w-md rounded-xl border border-hairline bg-sheet p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 id="delete-title" className="text-xl font-bold tracking-tight">
                {tExtra('deleteConfirmTitle')}
              </h2>
              <button
                type="button"
                aria-label={tCommon('cancel')}
                onClick={() => setDeletingId(null)}
                className="rounded-full p-1 text-ink-soft hover:bg-paper hover:text-ink"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
            <p id="delete-body" className="mt-3 text-sm leading-relaxed text-ink-soft">
              {tExtra('deleteConfirmBody', { name: deletingProject.name })}
            </p>
            {deleteError && (
              <p role="alert" className="mt-3 text-sm text-danger">
                {tExtra('deleteError')} {deleteError}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeletingId(null)}>
                {tCommon('cancel')}
              </Button>
              <Button variant="danger" disabled={deleting} onClick={confirmDelete}>
                {tExtra('confirmDelete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <ul className="mt-2" aria-label={label} aria-busy="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-6 border-b border-hairline py-6">
          <span className="h-4 w-1/3 animate-pulse bg-muted" />
          <span className="ml-auto h-3 w-16 animate-pulse bg-muted" />
        </li>
      ))}
    </ul>
  )
}
