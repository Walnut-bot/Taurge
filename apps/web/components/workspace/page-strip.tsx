'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { usePageImage } from '@/lib/hooks'
import { PAGE_STAGE_LABEL, pageStage, type PageStage } from '@/lib/pipeline'
import type { Page } from '@/lib/types'
import { cn } from '@/lib/utils'

const STAGE_DOT: Record<PageStage, string> = {
  extracted: 'bg-hairline',
  ocr: 'bg-caution',
  translated: 'bg-seal',
  cleaned: 'bg-ok',
}

export function PageStrip({
  pages,
  selectedId,
  onSelect,
  onReorder,
  reorderDisabled,
}: {
  pages: Page[]
  selectedId: string | null
  onSelect: (id: string) => void
  onReorder: (pageIds: string[]) => void
  reorderDisabled?: boolean
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  if (pages.length === 0) return null

  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= pages.length || to >= pages.length) return
    const ids = pages.map((p) => p.id)
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    onReorder(ids)
  }

  function resetDrag() {
    setDragIndex(null)
    setDropIndex(null)
  }

  const dragging = dragIndex !== null

  return (
    <nav aria-label="Pages" className="p-4">
      <h2 className="label-mono mb-3 text-ink-soft">
        Pages <span className="text-ink">{pages.length}</span>
      </h2>
      <ol className="flex gap-3 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {pages.map((p, i) => (
          <li
            key={p.id}
            draggable={!reorderDisabled}
            onDragStart={(e) => {
              setDropIndex(null)
              setDragIndex(i)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              if (dragIndex === null) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDropIndex(i)
            }}
            onDrop={(e) => {
              e.preventDefault()
              if (dragIndex !== null) move(dragIndex, i)
              resetDrag()
            }}
            onDragEnd={resetDrag}
            className={cn(
              'shrink-0 rounded-sm transition-opacity',
              dragging && dragIndex === i && 'opacity-40',
              dragging && dropIndex === i && dropIndex !== dragIndex && 'ring-2 ring-seal ring-offset-2 ring-offset-paper',
            )}
          >
            <Thumb
              page={p}
              selected={p.id === selectedId}
              onSelect={() => onSelect(p.id)}
              onMoveUp={i > 0 ? () => move(i, i - 1) : null}
              onMoveDown={i < pages.length - 1 ? () => move(i, i + 1) : null}
              moveDisabled={reorderDisabled}
            />
          </li>
        ))}
      </ol>
    </nav>
  )
}

function Thumb({
  page,
  selected,
  onSelect,
  onMoveUp,
  onMoveDown,
  moveDisabled,
}: {
  page: Page
  selected: boolean
  onSelect: () => void
  onMoveUp: (() => void) | null
  onMoveDown: (() => void) | null
  moveDisabled?: boolean
}) {
  const { url } = usePageImage(page.id, 'original', 'thumb')
  const stage = pageStage(page)
  return (
    <div
      className={cn(
        'group flex w-28 items-stretch gap-0.5 transition-colors lg:w-full',
        selected ? 'bg-ink text-sheet' : 'hover:bg-sheet',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'page' : undefined}
        title="Show this page"
        className="flex min-w-0 flex-1 cursor-grab items-center gap-3 p-1.5 text-left active:cursor-grabbing"
      >
        <span className="relative block w-12 shrink-0 overflow-hidden bg-white ring-1 ring-hairline" style={{ aspectRatio: `${page.width ?? 1000} / ${page.height ?? 1414}` }}>
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="" className="size-full object-cover grayscale" draggable={false} />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-mono text-sm font-semibold">p.{String(page.page_number).padStart(2, '0')}</span>
          <span className={cn('flex items-center gap-1.5 text-[11px]', selected ? 'text-sheet/75' : 'text-ink-soft')}>
            <span className={cn('size-1.5 rounded-full', STAGE_DOT[stage])} aria-hidden="true" />
            {PAGE_STAGE_LABEL[stage]}
          </span>
        </span>
      </button>
      {selected ? (
        <span className="flex flex-col justify-center gap-0.5 py-1 pr-1" role="group" aria-label="Move the page">
          <button
            type="button"
            onClick={onMoveUp ?? undefined}
            disabled={!onMoveUp || moveDisabled}
            aria-label="Move the page up"
            title="Move the page up"
            className="rounded p-0.5 transition-colors hover:bg-sheet/20 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronUp className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onMoveDown ?? undefined}
            disabled={!onMoveDown || moveDisabled}
            aria-label="Move the page down"
            title="Move the page down"
            className="rounded p-0.5 transition-colors hover:bg-sheet/20 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
        </span>
      ) : (
        <GripVertical
          aria-hidden="true"
          className="hidden w-4 shrink-0 self-center text-ink-soft/50 group-hover:block"
        />
      )}
    </div>
  )
}
