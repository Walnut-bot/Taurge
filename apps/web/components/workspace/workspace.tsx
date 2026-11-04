'use client'

import Link from 'next/link'
import { useState, useRef, useEffect, type CSSProperties } from 'react'
import { ChevronRight, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, XOctagon } from 'lucide-react'
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
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [viewMode, setViewMode] = useState<'editor' | 'glossary' | 'team'>('editor')
  const [glossaryEntries, setGlossaryEntries] = useState<GlossaryEntry[]>([])
  const [teamMembers, setTeamMembers] = useState<ProjectMember[]>([])

  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const stageRef = useRef<HTMLDivElement>(null)

  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [jobProgress, setJobProgress] = useState<{
    percent: number
    message: string
    current: number
    total: number
  } | null>(null)
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null)

  const loadGlossary = async () => {
    try {
      const data = await api.listGlossary(projectId)
      setGlossaryEntries(data)
    } catch {}
  }

  const loadTeam = async () => {
    try {
      const members = await api.listMembers(projectId)
      setTeamMembers(members)
    } catch {}
  }

  useEffect(() => {
    loadTeam()
  }, [projectId])

  useEffect(() => {
    if (!activeJobId) return

    // Au-delà de 10 échecs d'affilée (~40 s), le serveur est très
    // probablement mort (crash/redémarrage) : on arrête de boucler
    // au lieu d'afficher « Retrying… » indéfiniment. Au redémarrage,
    // le backend marque de toute façon ces jobs comme échoués.
    let consecutiveFailures = 0

    async function checkStatus() {
      try {
        const job = await api.getJobStatus(activeJobId!)
        consecutiveFailures = 0
        setJobProgress({
          percent: job.progress_percent,
          message: job.message,
          current: job.current_page,
          total: job.total_pages,
        })

        if (job.status === 'completed') {
          setActiveJobId(null)
          setJobProgress(null)
          setBusy(null)
          setNotice({ tone: 'ok', text: job.message })
          await mutate()
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          setActiveJobId(null)
          setJobProgress(null)
          setBusy(null)
          setNotice({ tone: 'error', text: job.message })
          await mutate()
        } else {
          pollTimerRef.current = setTimeout(checkStatus, 1500)
        }
      } catch {
        consecutiveFailures += 1
        if (consecutiveFailures >= 10) {
          setActiveJobId(null)
          setJobProgress(null)
          setBusy(null)
          setNotice({
            tone: 'error',
            text: 'Connection lost while tracking. The server may have restarted — check the project, then retry.',
          })
          return
        }
        setNotice({ tone: 'error', text: 'Connection lost while tracking. Retrying…' })
        pollTimerRef.current = setTimeout(checkStatus, 4000)
      }
    }

    checkStatus()

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    }
  }, [activeJobId, mutate])

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
        setActiveJobId(result.job_id)
        setJobProgress({
          percent: 0,
          message: result.message,
          current: 0,
          total: 0,
        })
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
      setActiveJobId(res.job_id)
      setJobProgress({
        percent: 0,
        message: 'Starting the job...',
        current: 0,
        total: project.pages.length,
      })
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Cannot start processing.' })
    }
  }

  async function handleCancelJob() {
    if (!activeJobId) return
    try {
      await api.cancelJob(activeJobId)
      setActiveJobId(null)
      setJobProgress(null)
      setNotice({ tone: 'ok', text: 'Job stopped successfully.' })
      await mutate()
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Error while cancelling.' })
    }
  }

  return (
    <>
      <AppHeader
        center={
          <div className="flex items-center gap-1 bg-sheet rounded-lg p-1 border border-hairline shadow-xs">
            <button
              type="button"
              onClick={() => setViewMode('editor')}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-all',
                viewMode === 'editor'
                  ? 'bg-ink text-paper shadow-xs font-semibold'
                  : 'text-ink-soft hover:text-ink hover:bg-paper/50'
              )}
            >
              {tEditor('studio')}
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('glossary')
                loadGlossary()
              }}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5',
                viewMode === 'glossary'
                  ? 'bg-ink text-paper shadow-xs font-semibold'
                  : 'text-ink-soft hover:text-ink hover:bg-paper/50'
              )}
            >
              <span>{tEditor('glossary')}</span>
              <span className={cn(
                'font-mono text-[10px] px-1.5 py-0.2 rounded-full',
                viewMode === 'glossary' ? 'bg-paper/20 text-paper' : 'bg-ink/5 dark:bg-ink/10 text-ink-soft'
              )}>
                {glossaryEntries.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('team')
                loadTeam()
              }}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5',
                viewMode === 'team'
                  ? 'bg-ink text-paper shadow-xs font-semibold'
                  : 'text-ink-soft hover:text-ink hover:bg-paper/50'
              )}
            >
              <span>{tEditor('team')}</span>
              <span className={cn(
                'font-mono text-[10px] px-1.5 py-0.2 rounded-full',
                viewMode === 'team' ? 'bg-paper/20 text-paper' : 'bg-ink/5 dark:bg-ink/10 text-ink-soft'
              )}>
                {teamMembers.length}
              </span>
            </button>
          </div>
        }
      >
        <nav aria-label="Fil d'ariane" className="flex min-w-0 items-center gap-1.5 text-sm">
          <Link href="/dashboard" className="shrink-0 text-ink-soft hover:text-ink transition-colors">
            {tEditor('projects')}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-ink-soft/60" aria-hidden="true" />
          <span className="truncate font-semibold max-w-[140px] sm:max-w-[200px] md:max-w-[260px]" title={project?.name} aria-current="page">
            {project?.name ?? '…'}
          </span>
        </nav>
      </AppHeader>

      {/* Barre de navigation mobile pour les 3 modes */}
      <div className="flex md:hidden items-center justify-center p-2 border-b border-hairline bg-sheet/50">
        <div className="flex items-center gap-1 bg-sheet rounded-lg p-1 border border-hairline text-xs">
          <button
            type="button"
            onClick={() => setViewMode('editor')}
            className={cn(
              'px-2.5 py-1 font-medium rounded transition-all',
              viewMode === 'editor' ? 'bg-ink text-paper' : 'text-ink-soft'
            )}
          >
            {tEditor('studio')}
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('glossary')
              loadGlossary()
            }}
            className={cn(
              'px-2.5 py-1 font-medium rounded transition-all',
              viewMode === 'glossary' ? 'bg-ink text-paper' : 'text-ink-soft'
            )}
          >
            {tEditor('glossary')} ({glossaryEntries.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode('team')
              loadTeam()
            }}
            className={cn(
              'px-2.5 py-1 font-medium rounded transition-all',
              viewMode === 'team' ? 'bg-ink text-paper' : 'text-ink-soft'
            )}
          >
            {tEditor('team')} ({teamMembers.length})
          </button>
        </div>
      </div>

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

          {jobProgress && (
            <div className="border-b border-seal/30 bg-seal/10 px-4 py-2.5 sm:px-6 flex items-center justify-between gap-4">
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-seal flex items-center gap-2">
                    <span className="size-2 rounded-full bg-seal animate-ping" />
                    {jobProgress.message}
                  </span>
                  <span className="font-mono">{jobProgress.percent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-paper">
                  <div
                    className="h-full bg-seal transition-all duration-300 ease-out"
                    style={{ width: `${jobProgress.percent}%` }}
                  />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelJob}
                className="text-xs h-7 text-danger border-danger hover:bg-danger-wash"
                title="Stop processing"
              >
                <XOctagon className="size-3.5" />
                <span>Stop</span>
              </Button>
            </div>
          )}

          <div
            role={notice?.tone === 'error' ? 'alert' : 'status'}
            aria-live="polite"
            className="empty:hidden"
          >
            {notice && (
              <p
                className={
                  notice.tone === 'error'
                    ? 'border-b border-danger bg-danger-wash px-4 py-2 text-sm text-danger sm:px-6'
                    : 'border-b border-ok/40 bg-ok-wash px-4 py-2 text-sm text-ok sm:px-6'
                }
              >
                {notice.text}
              </p>
            )}
          </div>

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

function EdgeToggle({ side, onToggle, label }: { side: 'left' | 'right'; onToggle: () => void; label: string }) {
  const Icon = side === 'left' ? PanelLeftClose : PanelRightClose
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-expanded={true}
      title={label}
      className={cn(
        'absolute top-2 z-20 rounded-full border-[1.5px] border-ink bg-sheet p-1 text-ink shadow-sm transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal',
        side === 'left' ? 'right-2 lg:-right-3.5' : 'left-2 lg:-left-3.5',
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  )
}

function CollapsedRail({ side, onExpand, label }: { side: 'left' | 'right'; onExpand: () => void; label: string }) {
  const Icon = side === 'left' ? PanelLeftOpen : PanelRightOpen
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2 py-2 lg:flex-col lg:px-0 lg:py-3',
        side === 'left'
          ? 'flex-row border-b-[1.5px] border-ink lg:border-b-0 lg:border-r-[1.5px]'
          : 'flex-row border-t-[1.5px] border-ink lg:border-l-[1.5px] lg:border-t-0',
      )}
    >
      <button
        type="button"
        onClick={onExpand}
        aria-label={label}
        aria-expanded={false}
        title={label}
        className="rounded-full border-[1.5px] border-ink bg-sheet p-1 text-ink shadow-sm transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal"
      >
        <Icon className="size-4" aria-hidden="true" />
      </button>
      <span aria-hidden="true" className="font-mono text-[11px] text-ink-soft lg:[writing-mode:vertical-rl]">
        {side === 'left' ? 'Panel' : 'Bubbles'}
      </span>
    </div>
  )
}

function EmptyStage({ hasFiles }: { hasFiles: boolean }) {
  return (
    <section className="tone flex min-h-[50dvh] flex-col items-center justify-center gap-3 p-10 text-center lg:col-span-2">
      <span className="font-mono text-sm text-seal">{hasFiles ? '02' : '01'}</span>
      <h2 className="text-2xl font-semibold">{hasFiles ? 'Extract the pages' : 'Import a chapter'}</h2>
      <p className="max-w-sm text-ink-soft">
        {hasFiles
          ? 'Your file is in place. Run extraction in the Sources panel to split the pages.'
          : 'Drop a PDF or images in the Sources panel. Pages will appear here.'}
      </p>
    </section>
  )
}

function WorkspaceSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading project" className="grid lg:grid-cols-[15rem_1fr_23rem]">
      <div className="h-14 border-b-[1.5px] border-ink lg:col-span-3" />
      <div className="hidden h-[70dvh] border-r-[1.5px] border-ink lg:block" />
      <div className="tone h-[70dvh] animate-pulse" />
      <div className="hidden border-l-[1.5px] border-ink lg:block" />
    </div>
  )
}