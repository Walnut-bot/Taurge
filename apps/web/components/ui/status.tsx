// 🚀 FEATURE BUILT FOR META GLOBAL AI DEVELOPER HACKATHON 2026.
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function EmptyState({
  title,
  body,
  children,
  className,
}: {
  title: string
  body?: string
  children?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('tone flex flex-col items-start gap-4 border-[1.5px] border-dashed border-ink-soft p-8 sm:p-10', className)}>
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {body ? <p className="max-w-md leading-relaxed text-ink-soft">{body}</p> : null}
      {children}
    </div>
  )
}

export function ErrorState({
  message,
  retryLabel,
  onRetry,
  className,
}: {
  message: string
  retryLabel: string
  onRetry: () => void
  className?: string
}) {
  return (
    <div role="alert" className={cn('flex flex-wrap items-center gap-4 border-l-2 border-danger bg-danger-wash p-4', className)}>
      <p className="text-danger">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-8 items-center rounded-sm border border-ink bg-transparent px-3 text-[0.8125rem] font-medium text-ink transition-colors hover:bg-ink hover:text-sheet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal"
      >
        {retryLabel}
      </button>
    </div>
  )
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: 'ok' | 'caution' | 'danger' | 'neutral'
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider uppercase',
        tone === 'ok' && 'bg-ok-wash text-ok',
        tone === 'caution' && 'bg-caution-wash text-caution',
        tone === 'danger' && 'bg-danger-wash text-danger',
        tone === 'neutral' && 'bg-paper text-ink-soft',
      )}
    >
      {children}
    </span>
  )
}
