'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Lock, LockOpen, Search } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { Link } from '@/i18n/navigation'
import { useTranslations } from '@/i18n/provider'
import { api } from '@/lib/api'
import { useProjects, useRequireAuth } from '@/lib/hooks'
import type { GlossaryEntry } from '@/lib/types'

interface Row extends GlossaryEntry {
  projectName: string
}

/** Glossaire global : agrège les entrées réelles des projets de l'utilisateur. */
export function GlossaryPageView() {
  const t = useTranslations('GlossaryPage')
  const tCommon = useTranslations('Common')
  const authed = useRequireAuth()
  const { data: projects, isLoading: projectsLoading } = useProjects(authed)
  const [query, setQuery] = useState('')

  const { data: rows, isLoading, error, mutate } = useSWR(
    authed && projects ? ['glossary-all', projects.map((p) => p.id).join(',')] : null,
    async (): Promise<Row[]> => {
      const perProject = await Promise.all(
        (projects ?? []).map(async (project) => {
          const entries = await api.listGlossary(project.id).catch(() => [] as GlossaryEntry[])
          return entries.map((entry) => ({ ...entry, projectName: project.name }))
        }),
      )
      return perProject.flat()
    },
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows ?? []
    return (rows ?? []).filter(
      (row) =>
        row.source_term.toLowerCase().includes(q) ||
        row.target_term.toLowerCase().includes(q) ||
        row.projectName.toLowerCase().includes(q),
    )
  }, [rows, query])

  if (!authed) return null

  return (
    <>
      <AppHeader />
      <AppShell>
        <main id="contenu" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <h1 className="text-4xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-2 text-ink-soft">{t('subtitle')}</p>

          <div className="relative mt-8 max-w-md">
            <Label htmlFor="glossary-search" className="sr-only">
              {t('searchPlaceholder')}
            </Label>
            <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-soft" />
            <Input
              id="glossary-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="pl-9"
            />
          </div>

          {(isLoading || projectsLoading) && (
            <p aria-busy="true" className="mt-8 text-ink-soft">
              {tCommon('loading')}
            </p>
          )}

          {error && (
            <div role="alert" className="mt-8 flex flex-wrap items-center gap-4 border-l-2 border-danger bg-danger-wash p-4">
              <p className="text-danger">{error.message}</p>
              <Button variant="outline" size="sm" onClick={() => mutate()}>
                {tCommon('retry')}
              </Button>
            </div>
          )}

          {rows && rows.length === 0 && (
            <div className="tone mt-8 border-[1.5px] border-dashed border-ink-soft p-10">
              <h2 className="text-2xl font-semibold">{t('empty')}</h2>
              <p className="mt-2 max-w-md text-ink-soft">{t('noProjects')}</p>
            </div>
          )}

          {rows && rows.length > 0 && filtered.length === 0 && (
            <p className="mt-8 text-ink-soft">{t('noResult')}</p>
          )}

          {filtered.length > 0 && (
            <div className="mt-8 overflow-x-auto border-[1.5px] border-ink">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-sheet">
                  <tr className="border-b-[1.5px] border-ink">
                    <th scope="col" className="px-4 py-3 font-semibold">{t('title')}</th>
                    <th scope="col" className="px-4 py-3 font-semibold">{t('category')}</th>
                    <th scope="col" className="px-4 py-3 font-semibold">{t('note')}</th>
                    <th scope="col" className="px-4 py-3" aria-label={t('openProject')} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b border-hairline last:border-0">
                      <td className="px-4 py-3">
                        <span className="font-semibold">{row.source_term}</span>
                        <span className="mx-2 text-seal" aria-hidden="true">→</span>
                        <span>{row.target_term}</span>
                        <span className="mt-0.5 block text-xs text-ink-soft">{row.projectName}</span>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{row.category}</td>
                      <td className="px-4 py-3 text-ink-soft">{row.notes ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs text-ink-soft">
                          {row.is_locked ? (
                            <Lock aria-hidden="true" className="size-3.5" />
                          ) : (
                            <LockOpen aria-hidden="true" className="size-3.5" />
                          )}
                          {row.is_locked ? t('locked') : t('unlocked')}
                        </span>
                        <Link href={`/projects/${row.project_id}`} className="ml-3 font-medium text-ink underline underline-offset-4 hover:decoration-seal">
                          {t('openProject')}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </AppShell>
    </>
  )
}
