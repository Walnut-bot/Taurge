'use client'

import Link from 'next/link'
import { useState, useRef, useEffect, type CSSProperties } from 'react'
import { ChevronRight } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { useTranslations } from '@/i18n/provider'
import { api } from '@/lib/api'
import { useProject, useRequireAuth } from '@/lib/hooks'
import { projectPipeline, safeFilename } from '@/lib/pipeline'
import { BlockList } from './block-list'
import { PageStage } from './page-stage'
import { PipelineBar } from './pipeline-bar'
import { PageStrip } from './page-strip'
import { SourcesPanel } from './sources-panel'
import { GlossaryPanel } from './glossary-panel'
import { TeamPanel } from './team-panel'
import type { ExportRecord, GlossaryEntry, ProjectMember } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useJobPolling, type Notice } from './use-job-polling'
import { useWorkspaceData } from './use-workspace-data'
import {
  CollapsedRail,
  EdgeToggle,
  EmptyStage,
  JobProgressBar,
  NoticeBar,
  ViewModeTabs,
  WorkspaceSkeleton,
  type ViewMode,
} from './workspace-chrome'

export type Runner = (key: string, success: string, fn: () => Promise<unknown>) => Promise<boolean>

export function Workspace({ projectId }: { projectId: string }) {
  const tTabs = useTranslations('EditorTabs')
  const tEditor = useTranslations('Editor')
  const [mobileTab, setMobileTab] = useState<'pages' | 'page' | 'text'>('page')
  const authed = useRequireAuth()
  const { data: project, error, isLoading, mutate } = useProject(projectId, authed)
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [hoverBlockId, setHoverBlockId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('editor')
  const { glossaryEntries, teamMembers, loadGlossary, loadTeam } = useWorkspaceData(projectId) //
  

  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const stageRef = useRef<HTMLDivElement>(null)

  const { activeJobId, jobProgress, handleCancelJob, startJob } =
    useJobPolling({ mutate, setBusy, setNotice })

  if (!authed) return null

  const run: Runner = async (key, success, fn) => {
    setBusy(key)
    setNotice(null)
    try {
      await fn()
      await mutate()
      setNotice({ tone: 'ok', text: success })
      return true
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' })
      return false
    } finally {
      setBusy(null)
    }
  }

  async function handleExtractFile(fileId: string) {
    setBusy(`extract:${fileId}`)
    setNotice(null)
    try {
      const result = await api.extract(projectId, fileId)
      if (result?.job_id) {
        startJob(result.job_id, result.message, 0)
        setBusy('extracting')
      } else {
        await mutate()
        setBusy(null)
        setNotice({ tone: 'ok', text: 'Pages extracted.' })
      }
    } catch (err) {
      setBusy(null)
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Cannot extract this file.' })
    }
  }

  const pages = project?.pages ?? []
  const page = pages.find((p) => p.id === selectedPageId) ?? pages[0] ?? null

  function selectPage(id: string) {
    setSelectedPageId(id)
    setActiveBlockId(null)
    // Scroll the clicked page back to the top of the screen when the stage is
    // out of view (stacked columns on small screens): no manual scrolling needed.
    requestAnimationFrame(() => {
      const el = stageRef.current
      if (!el) return
      const top = el.getBoundingClientRect().top
      if (top < 0 || top > window.innerHeight * 0.5) {
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
      }
    })
  }

  async function handleReorderPages(pageIds: string[]) {
    if (!project) return
    await run('reorder-pages', 'Page order saved.', () => api.reorderPages(project.id, pageIds))
  }

  async function exportProject(format?: 'zip' | 'cbz' | 'pdf') {
    if (!project) return
    const holder: { record: ExportRecord | null } = { record: null }
    const ok = await run('export', `Export ${format ? format.toUpperCase() : ''} ready, downloading...`, async () => {
      holder.record = await api.exportProject(project.id, format)
    })
    const exportRecord = holder.record
    if (ok && exportRecord) {
      const ext = exportRecord.format || format || 'cbz'
      await api.downloadExport(project.id, exportRecord.id, `${safeFilename(project.name)}.${ext}`)
    }
  }

  async function handleStartBatchJob() {
    if (!project || project.pages.length === 0) return
    setNotice(null)
    try {
      const res = await api.startBatchJob(project.id)
      startJob(res.job_id, 'Starting the job...', project.pages.length)
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Cannot start processing.' })
    }
  }

  return (
    <>
      <AppHeader
        center={
          <ViewModeTabs
            viewMode={viewMode}
            glossaryCount={glossaryEntries.length}
            teamCount={teamMembers.length}
            labels={{ studio: tEditor('studio'), glossary: tEditor('glossary'), team: tEditor('team') }}
            onSelect={(mode) => {
              setViewMode(mode)
              if (mode === 'glossary') loadGlossary()
              if (mode === 'team') loadTeam()
            }}
          />
        }
      >
        <nav aria-label="Fil d'ariane" className="flex min-w-0 items-center gap-1.5 text-sm">
          <Link href="/dashboard" className="hidden shrink-0 text-ink-soft hover:text-ink transition-colors sm:inline">
            {tEditor('projects')}
          </Link>
          <ChevronRight className="hidden size-3.5 shrink-0 text-ink-soft/60 sm:block" aria-hidden="true" />
          <span className="truncate font-semibold max-w-[7.5rem] sm:max-w-[200px] md:max-w-[260px]" title={project?.name} aria-current="page">
            {project?.name ?? '…'}
          </span>
        </nav>
      </AppHeader>

      <ViewModeTabs
        mobile
        viewMode={viewMode}
        glossaryCount={glossaryEntries.length}
        teamCount={teamMembers.length}
        labels={{ studio: tEditor('studio'), glossary: tEditor('glossary'), team: tEditor('team') }}
        onSelect={(mode) => {
          setViewMode(mode)
          if (mode === 'glossary') loadGlossary()
          if (mode === 'team') loadTeam()
        }}
      />

      {isLoading && <WorkspaceSkeleton />}

      {error && (
        <main id="contenu" className="mx-auto max-w-xl px-4 py-16 text-center">
          <h1 className="text-2xl font-bold">{tEditor('projectUnavailable')}</h1>
          <p className="mt-2 text-ink-soft">{error.message}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="outline" onClick={() => mutate()}>
              {tEditor('retry')}
            </Button>
            <Link href="/dashboard" className={buttonVariants({ variant: 'ghost' })}>
              {tEditor('backToProjects')}
            </Link>
          </div>
        </main>
      )}

      {project && (
        <main id="contenu" className="flex flex-col">
          <h1 className="sr-only">{project.name}</h1>
          <PipelineBar
            steps={projectPipeline(project)}
            sourceLang={project.source_lang}
            targetLang={project.target_lang}
            canExport={pages.length > 0}
            exporting={busy === 'export'}
            canBatchProcess={pages.length > 0 && !activeJobId}
            batchProcessing={Boolean(activeJobId)}
            batchProgressText={jobProgress ? `${jobProgress.percent}%` : null}
            disabled={busy !== null || Boolean(activeJobId)}
            onExport={exportProject}
            onBatchProcess={handleStartBatchJob}
          />

          {jobProgress && <JobProgressBar progress={jobProgress} onCancel={handleCancelJob} />}

          <NoticeBar notice={notice} />

          {viewMode === 'team' ? (
            <div className="flex-1 bg-sheet/40 min-h-[70vh]">
              <div className="mx-auto max-w-5xl">
                <TeamPanel
                  projectId={project.id}
                  members={teamMembers}
                  onRefresh={loadTeam}
                />
              </div>
            </div>
          ) : viewMode === 'glossary' ? (
            <div className="flex-1 bg-sheet/40 min-h-[70vh]">
              <div className="mx-auto max-w-5xl">
                <GlossaryPanel
                  projectId={project.id}
                  entries={glossaryEntries}
                  onRefresh={loadGlossary}
                />
              </div>
            </div>
          ) : (
            <>
            <div role="tablist" aria-label="Editor panels" className="flex border-b border-hairline bg-sheet lg:hidden">
              {(
                [
                  ['pages', tTabs('pages')],
                  ['page', tTabs('page')],
                  ['text', tTabs('text')],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === key}
                  onClick={() => setMobileTab(key)}
                  className={cn(
                    'flex-1 border-b-2 px-3 py-2.5 text-sm',
                    mobileTab === key
                      ? 'border-seal font-semibold text-ink'
                      : 'border-transparent text-ink-soft',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div
              className="atelier-grid grid flex-1"
              style={
                {
                  '--atelier-left': leftOpen ? '15rem' : '2.75rem',
                  '--atelier-right': !page || rightOpen ? '23rem' : '2.75rem',
                } as CSSProperties
              }
            >
              {leftOpen ? (
                <aside className={cn('relative flex-col border-b-[1.5px] border-ink lg:flex lg:border-r-[1.5px] lg:border-b-0', mobileTab === 'pages' ? 'flex' : 'hidden')}>
                  <EdgeToggle side="left" onToggle={() => setLeftOpen(false)} label="Hide the side panel" />
                  <SourcesPanel
                    project={project}
                    busy={busy ?? (activeJobId ? 'job' : null)}
                    run={run}
                    onExtract={handleExtractFile}
                  />
                  <PageStrip
                    pages={pages}
                    selectedId={page?.id ?? null}
                    onSelect={selectPage}
                    onReorder={handleReorderPages}
                    reorderDisabled={busy !== null}
                  />
                </aside>
              ) : (
                <CollapsedRail side="left" onExpand={() => setLeftOpen(true)} label="Show the side panel" />
              )}

              {page ? (
                <>
                  <div ref={stageRef} className={cn('min-w-0 scroll-mt-4 lg:grid', mobileTab === 'page' ? 'grid' : 'hidden')}>
                    <PageStage
                      key={page.id}
                      page={page}
                      pageIndex={pages.indexOf(page)}
                      pageCount={pages.length}
                      projectId={project.id}
                      busy={busy}
                      run={run}
                      activeBlockId={activeBlockId}
                      hoverBlockId={hoverBlockId}
                      onSelectBlock={setActiveBlockId}
                      onHoverBlock={setHoverBlockId}
                      onNavigate={(dir) => {
                        const next = pages[pages.indexOf(page) + dir]
                        if (next) selectPage(next.id)
                      }}
                      onRefresh={mutate}
                    />
                  </div>
                  {rightOpen ? (
                    <div className={cn('relative min-w-0 lg:grid', mobileTab === 'text' ? 'grid' : 'hidden')}>
                      <EdgeToggle side="right" onToggle={() => setRightOpen(false)} label="Hide the bubbles panel" />
                      <BlockList
                        page={page}
                        sourceLang={project.source_lang}
                        targetLang={project.target_lang}
                        activeId={activeBlockId}
                        hoverId={hoverBlockId}
                        onActivate={setActiveBlockId}
                        onHover={setHoverBlockId}
                        busy={busy}
                        run={run}
                      />
                    </div>
                  ) : (
                    <CollapsedRail side="right" onExpand={() => setRightOpen(true)} label="Show the bubbles panel" />
                  )}
                </>
              ) : (
                <EmptyStage hasFiles={project.files.length > 0} />
              )}
            </div>
            </>
          )}
        </main>
      )}
    </>
  )
}
