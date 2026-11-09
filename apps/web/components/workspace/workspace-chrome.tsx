'use client'

import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, XOctagon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { JobProgress, Notice } from './use-job-polling'

export type ViewMode = 'editor' | 'glossary' | 'team'

export function ViewModeTabs({
  viewMode,
  glossaryCount,
  teamCount,
  labels,
  onSelect,
  mobile = false,
}: {
  viewMode: ViewMode
  glossaryCount: number
  teamCount: number
  labels: { studio: string; glossary: string; team: string }
  onSelect: (mode: ViewMode) => void
  mobile?: boolean
}) {
  const modes: { key: ViewMode; label: string; count?: number }[] = [
    { key: 'editor', label: labels.studio },
    { key: 'glossary', label: labels.glossary, count: glossaryCount },
    { key: 'team', label: labels.team, count: teamCount },
  ]
  if (mobile) {
    return (
      <div className="flex md:hidden items-center justify-center p-2 border-b border-hairline bg-sheet/50">
        <div className="flex w-full items-center gap-1 bg-sheet rounded-lg p-1 border border-hairline text-xs">
          {modes.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={cn(
                'flex-1 px-1 py-1 text-center text-[11px] font-medium whitespace-nowrap rounded transition-all min-[400px]:px-2.5 min-[400px]:text-xs',
                viewMode === key ? 'bg-ink text-paper' : 'text-ink-soft'
              )}
            >
              {label}{count !== undefined ? ` (${count})` : ''}
            </button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1 bg-sheet rounded-lg p-1 border border-hairline shadow-xs">
      {modes.map(({ key, label, count }) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5',
            viewMode === key
              ? 'bg-ink text-paper shadow-xs font-semibold'
              : 'text-ink-soft hover:text-ink hover:bg-paper/50'
          )}
        >
          <span>{label}</span>
          {count !== undefined && (
            <span className={cn(
              'font-mono text-[10px] px-1.5 py-0.2 rounded-full',
              viewMode === key ? 'bg-paper/20 text-paper' : 'bg-ink/5 dark:bg-ink/10 text-ink-soft'
            )}>
              {count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export function JobProgressBar({ progress, onCancel }: { progress: JobProgress; onCancel: () => void }) {
  return (
    <div className="border-b border-seal/30 bg-seal/10 px-4 py-2.5 sm:px-6 flex items-center justify-between gap-4">
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="text-seal flex items-center gap-2">
            <span className="size-2 rounded-full bg-seal animate-ping" />
            {progress.message}
          </span>
          <span className="font-mono">{progress.percent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-paper">
          <div
            className="h-full bg-seal transition-all duration-300 ease-out"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onCancel}
        className="text-xs h-7 text-danger border-danger hover:bg-danger-wash"
        title="Stop processing"
      >
        <XOctagon className="size-3.5" />
        <span>Stop</span>
      </Button>
    </div>
  )
}

export function NoticeBar({ notice }: { notice: Notice | null }) {
  return (
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
  )
}

export function EdgeToggle({ side, onToggle, label }: { side: 'left' | 'right'; onToggle: () => void; label: string }) {
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

export function CollapsedRail({ side, onExpand, label }: { side: 'left' | 'right'; onExpand: () => void; label: string }) {
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

export function EmptyStage({ hasFiles }: { hasFiles: boolean }) {
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

export function WorkspaceSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading project" className="grid lg:grid-cols-[15rem_1fr_23rem]">
      <div className="h-14 border-b-[1.5px] border-ink lg:col-span-3" />
      <div className="hidden h-[70dvh] border-r-[1.5px] border-ink lg:block" />
      <div className="tone h-[70dvh] animate-pulse" />
      <div className="hidden border-l-[1.5px] border-ink lg:block" />
    </div>
  )
}
