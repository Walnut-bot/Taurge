'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Columns, Eye, Plus, Layers, RotateCcw, Trash2, FileText, Sparkles } from 'lucide-react'
import { PageCanvas, type ManhwaStyle, type StrokeStyle } from '@/components/page-canvas'
import { Button } from '@/components/ui/button'
import { IS_DEMO, api, ApiError } from '@/lib/api'
import { usePageImage } from '@/lib/hooks'
import { pageStage } from '@/lib/pipeline'
import type { Page } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { Runner } from './workspace'

type View = 'original' | 'cleaned'

type Props = {
  page: Page
  pageIndex: number
  pageCount: number
  projectId: string
  busy: string | null
  run: Runner
  activeBlockId: string | null
  hoverBlockId: string | null
  onSelectBlock: (id: string | null) => void
  onHoverBlock: (id: string | null) => void
  onNavigate: (dir: -1 | 1) => void
  onRefresh?: () => Promise<unknown>
}

const NEXT_ACTION = {
  extracted: { key: 'ocr', label: 'Read bubbles (OCR)', done: 'Bubbles detected.' },
  ocr: { key: 'translate', label: 'Translate the page', done: 'Page translated. Proofread each bubble.' },
  translated: { key: 'clean', label: 'Clean the bubbles', done: 'Bubbles cleaned.' },
} as const

export function PageStage(props: Props) {
  const { page, pageIndex, pageCount, projectId, busy, run } = props
  const stage = pageStage(page)
  const [view, setView] = useState<View>(page.cleaned_at ? 'cleaned' : 'original')

  // Manhwa typography settings
  const [lettering, setLettering] = useState(true)
  const [fontSizeScale, setFontSizeScale] = useState(1)
  const [isBold, setIsBold] = useState(true)
  const [isItalic, setIsItalic] = useState(false)
  const [isUppercase, setIsUppercase] = useState(true)
  const [manhwaStyle, setManhwaStyle] = useState<ManhwaStyle>('dialogue')
  const [textColor, setTextColor] = useState('#0d0d0d')
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>('white')
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [rotationAngle, setRotationAngle] = useState(0)

  const [isQcMode, setIsQcMode] = useState(false)
  const [isPeekingOriginal, setIsPeekingOriginal] = useState(false)
  const [showZones, setShowZones] = useState(true)
  const [isDrawMode, setIsDrawMode] = useState(false)

  const effectiveView: View = page.cleaned_at ? view : 'original'
  const { url: originalUrl, error: originalError } = usePageImage(page.id, 'original', 'raw')
  const { url: cleanedUrl, error: cleanedError } = usePageImage(
    page.id,
    page.cleaned_at ? 'cleaned' : 'original',
    page.cleaned_at ?? 'raw',
  )
  const displayUrl = isPeekingOriginal ? originalUrl : (effectiveView === 'cleaned' ? (cleanedUrl || originalUrl) : originalUrl)
  const error = isPeekingOriginal ? originalError : (effectiveView === 'cleaned' ? (cleanedError && originalError) : originalError)

  // Sync the inspector when a bubble is selected
  useEffect(() => {
    if (!props.activeBlockId) return
    const blk = page.ocr_blocks.find((b) => b.id === props.activeBlockId)
    if (blk) {
      setManhwaStyle(blk.manhwa_style || 'dialogue')
      setFontSizeScale(blk.font_size_scale || 1)
      setRotationAngle(blk.rotation_angle || 0)
      setTextColor(blk.text_color || '#0d0d0d')
      setStrokeStyle(blk.stroke_color === '#000000' ? 'black' : blk.stroke_color === 'transparent' ? 'none' : 'white')
      setStrokeWidth(blk.stroke_width || 2)
    }
  }, [props.activeBlockId, page.ocr_blocks])

  // Active block resolved against the current page data: null when the selected
  // ID is stale (deleted block, re-OCR, batch), so the inspector is never
  // shown and the API never called for a ghost block.
  const activeBlock = props.activeBlockId
    ? (page.ocr_blocks.find((b) => b.id === props.activeBlockId) ?? null)
    : null

  // Auto-save the style to the database whenever a setting changes
  async function persistBlockStyle(updates: {
    manhwa_style?: string
    font_size_scale?: number
    rotation_angle?: number
    text_color?: string
    stroke_color?: string
    stroke_width?: number
  }) {
    const blockId = props.activeBlockId
    if (!blockId) return
    const blk = page.ocr_blocks.find((b) => b.id === blockId)
    if (!blk) {
      props.onSelectBlock(null)
      return
    }
    try {
      await api.updateBlockStyle(blockId, updates)
      Object.assign(blk, updates)
    } catch (e) {
      // The block vanished between render and request: absorb the stale
      // state instead of letting the error repeat on every setting.
      if (e instanceof ApiError && e.status === 404) {
        props.onSelectBlock(null)
        return
      }
      console.error(e)
    }
  }

  // Direct editing on the bubble
  const handleUpdateText = async (blockId: string, newText: string) => {
    const blk = page.ocr_blocks.find((b) => b.id === blockId)
    if (!blk) return
    if (blk.translation) {
      await api.updateTranslation(blk.translation.id, newText)
      blk.translation.translated_text = newText
      blk.translation.edited_by_user = true
    } else {
      await api.updateBlockText(blockId, newText)
      blk.text = newText
    }
    props.onRefresh?.()
  }

  // C shortcut for RAW peek
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
      if (e.key === 'c' || e.key === 'C') setIsPeekingOriginal(true)
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === 'c' || e.key === 'C') setIsPeekingOriginal(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  const next = stage === 'cleaned' ? null : NEXT_ACTION[stage]
  const working = busy === `${next?.key}:${page.id}`

  async function runNext() {
    if (!next) return
    const fn =
      next.key === 'ocr'
        ? () => api.runOcr(projectId, page.id)
        : next.key === 'translate'
          ? () => api.translatePage(projectId, page.id)
          : () => api.cleanPage(projectId, page.id)
    const ok = await run(`${next.key}:${page.id}`, next.done, fn)
    if (ok && next.key === 'clean') setView('cleaned')
  }

  const handleUpdateBbox = async (blockId: string, bbox: { bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }) => {
    try {
      await api.updateBlockBbox(blockId, bbox)
      const blk = page.ocr_blocks.find((b) => b.id === blockId)
      if (blk) Object.assign(blk, bbox)
    } catch (err) {
      console.error(err)
    }
  }

  const handleCreateBlock = async (bbox: { bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }) => {
    try {
      const newBlock = await api.createBlock({ page_id: page.id, ...bbox })
      await props.onRefresh?.()
      props.onSelectBlock(newBlock.id)
    } catch (err) {
      console.error(err)
    }
  }

  const handleDeleteBlock = async (blockId: string) => {
    try {
      await api.deleteBlock(blockId)
      props.onSelectBlock(null)
      await props.onRefresh?.()
    } catch (err) {
      console.error(err)
    }
  }

  const handleReClean = async () => {
    const ok = await run(`clean:${page.id}`, 'Cleaning updated with the new bubbles.', () => api.cleanPage(projectId, page.id))
    if (ok) setView('cleaned')
  }

  const handleExportScript = () => {
    let script = `=== PAGE ${String(page.page_number).padStart(2, '0')} ===\n\n`
    page.ocr_blocks.forEach((b, idx) => {
      const tag = b.bubble_type || 'B'
      script += `[${String(idx + 1).padStart(2, '0')}] (${tag})\n`
      script += `Original: ${b.text}\n`
      script += `Translation: ${b.translation?.translated_text || '(Not translated)'}\n\n`
    })

    const blob = new Blob([script], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `script_page_${String(page.page_number).padStart(2, '0')}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalBlocks = page.ocr_blocks.length
  const reviewedBlocks = page.ocr_blocks.filter((b) => b.translation?.edited_by_user).length
  const allReviewed = totalBlocks > 0 && reviewedBlocks === totalBlocks

  return (
    <section aria-label={`Page ${page.page_number}`} className="flex min-w-0 flex-1 flex-col bg-paper">
      <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-3 py-2 sm:px-4">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => props.onNavigate(-1)}
            disabled={pageIndex === 0}
            aria-label="Previous page"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span className="w-16 text-center font-mono text-sm">
            <span className="font-semibold">{String(page.page_number).padStart(2, '0')}</span>
            <span className="text-ink-soft"> / {String(pageCount).padStart(2, '0')}</span>
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => props.onNavigate(1)}
            disabled={pageIndex === pageCount - 1}
            aria-label="Next page"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>

        {page.cleaned_at && (
          <div role="group" aria-label="View" className="flex items-center ring-1 ring-ink">
            {(['original', 'cleaned'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={!isQcMode && effectiveView === v}
                onClick={() => {
                  setIsQcMode(false)
                  setView(v)
                }}
                className={cn(
                  'h-8 px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal',
                  !isQcMode && effectiveView === v ? 'bg-ink text-sheet' : 'hover:bg-muted',
                )}
              >
                {v === 'original' ? 'Original' : 'Cleaned'}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={isQcMode}
              onClick={() => setIsQcMode(!isQcMode)}
              className={cn(
                'h-8 px-3 text-xs font-semibold flex items-center gap-1.5 transition-colors border-l border-ink',
                isQcMode ? 'bg-seal text-seal-ink' : 'hover:bg-muted text-ink'
              )}
              title="Enable the QC curtain comparator"
            >
              <Columns className="size-3.5" />
              <span>QC curtain</span>
            </button>
          </div>
        )}

        {totalBlocks > 0 && (
          <div className="hidden sm:flex items-center gap-2 border-l border-hairline pl-3 font-mono text-[11px]">
            <span
              className={cn(
                'px-2 py-0.5 rounded font-bold',
                allReviewed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
              )}
              title="Review progress"
            >
              QC: {reviewedBlocks}/{totalBlocks} reviewed
            </span>
          </div>
        )}

        <div className="flex items-center gap-1.5 border-l border-hairline pl-3">
          <button
            type="button"
            onClick={() => setIsDrawMode(!isDrawMode)}
            className={cn(
              'h-8 px-2.5 text-xs font-semibold flex items-center gap-1.5 rounded transition-all',
              isDrawMode
                ? 'bg-seal text-seal-ink ring-2 ring-seal/50 shadow-sm'
                : 'border border-hairline bg-sheet text-ink hover:bg-muted'
            )}
            title="Draw a bubble manually"
          >
            <Plus className="size-3.5" />
            <span>{isDrawMode ? 'Drawing…' : '+ Bubble'}</span>
          </button>

          <button
            type="button"
            aria-pressed={showZones}
            onClick={() => setShowZones(!showZones)}
            className={cn(
              'h-8 px-2 text-xs font-semibold flex items-center gap-1 rounded transition-colors border border-hairline',
              showZones ? 'bg-ink text-sheet' : 'bg-sheet text-ink-soft hover:text-ink'
            )}
            title="Show / hide frames"
          >
            <Layers className="size-3.5" />
            <span className="hidden sm:inline">Frames</span>
          </button>

          {totalBlocks > 0 && (
            <button
              type="button"
              onClick={handleExportScript}
              className="h-8 px-2.5 text-xs font-medium flex items-center gap-1 rounded border border-hairline bg-sheet text-ink hover:bg-muted transition-colors"
              title="Download the Photoshop-formatted script (.txt)"
            >
              <FileText className="size-3.5 text-seal" />
              <span className="hidden sm:inline">Script (.txt)</span>
            </button>
          )}

          {page.cleaned_at && (
            <button
              type="button"
              onClick={handleReClean}
              disabled={busy !== null}
              className="h-8 px-2.5 text-xs font-medium flex items-center gap-1 rounded border border-hairline bg-sheet text-ink hover:bg-muted transition-colors"
              title="Regenerate the cleaning"
            >
              <RotateCcw className="size-3.5" />
              <span className="hidden sm:inline">Re-clean</span>
            </button>
          )}

        </div>

        <div className="ml-auto">
          {next ? (
            <Button variant="default" size="sm" onClick={runNext} disabled={busy !== null}>
              {working && <Loader2 className="animate-spin" aria-hidden="true" />}
              {working ? 'Working…' : next.label}
            </Button>
          ) : (
            <span className="label-mono flex items-center gap-2 text-ok">
              <span className="size-1.5 rounded-full bg-ok" aria-hidden="true" />
              Page ready
            </span>
          )}
        </div>
      </div>

      {/* MANHWA TYPOGRAPHY INSPECTOR WITH DATABASE PERSISTENCE */}
      {activeBlock && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-sheet border-b border-hairline px-4 py-2 shadow-sm text-xs">
          <div className="flex items-center gap-2 font-semibold">
            <Sparkles className="size-4 text-seal" />
            <span>Manhwa style:</span>
          </div>

          <div className="flex items-center gap-1 rounded bg-paper p-1 border border-hairline">
            {[
              { id: 'dialogue', label: '💬 Dialogue' },
              { id: 'scream', label: '💥 Shout / Fight' },
              { id: 'system', label: '🎮 System' },
              { id: 'thought', label: '💭 Thought' },
              { id: 'sfx', label: '⚡ SFX' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  const style = p.id as ManhwaStyle
                  setManhwaStyle(style)
                  let color = textColor, stroke = strokeStyle, strkW = strokeWidth
                  if (style === 'system') {
                    color = '#00e5ff'
                    stroke = 'black'
                  } else if (style === 'scream') {
                    color = '#ffffff'
                    stroke = 'black'
                    strkW = 3
                  } else {
                    color = '#0d0d0d'
                    stroke = 'white'
                    strkW = 2
                  }
                  setTextColor(color)
                  setStrokeStyle(stroke)
                  setStrokeWidth(strkW)
                  persistBlockStyle({
                    manhwa_style: style,
                    text_color: color,
                    stroke_color: stroke === 'black' ? '#000000' : '#ffffff',
                    stroke_width: strkW,
                  })
                }}
                className={cn(
                  'px-2.5 py-1 rounded font-medium transition-all',
                  manhwaStyle === p.id ? 'bg-ink text-sheet shadow' : 'hover:bg-sheet text-ink-soft hover:text-ink'
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-ink-soft">Size:</span>
              <select
                value={fontSizeScale}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setFontSizeScale(val)
                  persistBlockStyle({ font_size_scale: val })
                }}
                className="rounded border border-hairline bg-paper px-1.5 py-0.5 text-xs font-semibold"
              >
                <option value={0.75}>75% (Small)</option>
                <option value={1}>100% (Standard)</option>
                <option value={1.3}>130% (Medium)</option>
                <option value={1.6}>160% (Large)</option>
                <option value={2}>200% (Impact)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-ink-soft">Outline:</span>
              <select
                value={strokeStyle}
                onChange={(e) => {
                  const val = e.target.value as StrokeStyle
                  setStrokeStyle(val)
                  persistBlockStyle({
                    stroke_color: val === 'black' ? '#000000' : val === 'white' ? '#ffffff' : 'transparent',
                  })
                }}
                className="rounded border border-hairline bg-paper px-1.5 py-0.5 text-xs font-semibold"
              >
                <option value="white">White</option>
                <option value="black">Black</option>
                <option value="none">None</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5" title="Rotation angle">
              <span className="text-[11px] text-ink-soft">Angle:</span>
              <input
                type="range"
                min={-30}
                max={30}
                value={rotationAngle}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setRotationAngle(val)
                  persistBlockStyle({ rotation_angle: val })
                }}
                className="w-16 accent-seal cursor-pointer"
              />
              <span className="font-mono text-[10px] w-6">{rotationAngle}°</span>
            </div>

            <label className="flex items-center cursor-pointer" title="Color">
              <input
                type="color"
                value={textColor}
                onChange={(e) => {
                  const val = e.target.value
                  setTextColor(val)
                  persistBlockStyle({ text_color: val })
                }}
                className="size-5 cursor-pointer rounded border border-hairline bg-transparent p-0"
              />
            </label>

            <button
              type="button"
              className="h-6 px-2 rounded bg-red-600 hover:bg-red-700 text-white font-medium flex items-center gap-1 text-[11px] transition-colors"
              onClick={() => handleDeleteBlock(activeBlock.id)}
              title="Delete this bubble"
            >
              <Trash2 className="size-3" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      )}

      {/* Canvas with in-place editing */}
      <div className="flex flex-1 relative overflow-hidden">
        {error ? (
          <div className="tone grid place-items-center w-full p-6 text-center text-sm text-danger">
            Image unavailable for this page.
          </div>
        ) : (
          <PageCanvas
            src={isQcMode ? (cleanedUrl || displayUrl) : displayUrl}
            qcOriginalSrc={isQcMode ? originalUrl : null}
            alt={`Page ${page.page_number}${effectiveView === 'cleaned' ? ', cleaned' : ''}`}
            width={page.width ?? 1000}
            height={page.height ?? 1414}
            blocks={page.ocr_blocks}
            activeId={props.activeBlockId}
            hoverId={props.hoverBlockId}
            onSelect={props.onSelectBlock}
            onHover={props.onHoverBlock}
            onUpdateBbox={handleUpdateBbox}
            onUpdateText={handleUpdateText}
            onCreateBlock={handleCreateBlock}
            onDeleteBlock={handleDeleteBlock}
            isDrawMode={isDrawMode}
            onCancelDrawMode={() => setIsDrawMode(false)}
            showZones={showZones}
            maskBubbles={IS_DEMO && effectiveView === 'cleaned'}
            showLettering={lettering}
            fontSizeScale={fontSizeScale}
            isBold={isBold}
            isItalic={isItalic}
            isUppercase={isUppercase}
            manhwaStyle={manhwaStyle}
            textColor={textColor}
            strokeStyle={strokeStyle}
            strokeWidth={strokeWidth}
            rotationAngle={rotationAngle}
          />
        )}

        {isPeekingOriginal && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/90 text-white font-mono text-xs px-3 py-1 rounded-full shadow-lg flex items-center gap-1.5 pointer-events-none z-50">
            <Eye className="size-3.5 text-seal" />
            <span>Showing RAW original (C key)</span>
          </div>
        )}
      </div>
    </section>
  )
}