'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Columns, Eye, Plus, Layers, RotateCcw, Trash2, FileText, Sparkles, Undo2, Redo2, ShieldCheck, MessageSquare, History, CheckCircle2, Type, Palette } from 'lucide-react'
import { PageCanvas, type ManhwaStyle, type StrokeStyle } from '@/components/page-canvas'
import { Button } from '@/components/ui/button'
import { IS_DEMO, api, ApiError } from '@/lib/api'
import { usePageImage } from '@/lib/hooks'
import { pageStage } from '@/lib/pipeline'
import {
  FONTS_LIST,
  COLOR_SWATCHES,
  FONT_SIZE_SCALES,
  STROKE_OPTIONS,
  STROKE_WIDTHS,
  normalizeFontId,
} from '@/lib/fonts'
import type { Page, QCIssue, PageComment, PageVersion } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { Runner } from './workspace'

type HistoryEntry =
  | {
      kind: 'bbox'
      blockId: string
      before: { bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }
      after: { bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }
    }
  | {
      kind: 'style'
      blockId: string
      before: Record<string, string | number | undefined>
      after: Record<string, string | number | undefined>
    }
  | {
      kind: 'text'
      blockId: string
      translationId: string | null
      before: string
      after: string
    }

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
  const [blockStyles, setBlockStyles] = useState<Record<string, {
    manhwa_style?: string
    font_size_scale?: number
    rotation_angle?: number
    text_color?: string
    stroke_color?: string
    stroke_width?: number
  }>>({})

  const [isQcMode, setIsQcMode] = useState(false)
  const [isPeekingOriginal, setIsPeekingOriginal] = useState(false)
  const [showZones, setShowZones] = useState(true)
  const [isDrawMode, setIsDrawMode] = useState(false)
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([])
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([])
  const [qcOpen, setQcOpen] = useState(false)
  const [qcIssues, setQcIssues] = useState<QCIssue[]>([])
  const [qcLoading, setQcLoading] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState<PageComment[]>([])
  const [commentInput, setCommentInput] = useState('')
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [versions, setVersions] = useState<PageVersion[]>([])
  const [versionLabel, setVersionLabel] = useState('')
  const [workflowStatus, setWorkflowStatus] = useState(page.workflow_status || 'raw')

  // Blocs réactifs isolés : chaque bulle conserve ses propres propriétés de police, taille, couleur, contour
  const effectiveBlocks = useMemo(() => {
    return page.ocr_blocks.map((b) => {
      const override = blockStyles[b.id]
      return override ? { ...b, ...override } : b
    })
  }, [page.ocr_blocks, blockStyles])

  const effectiveView: View = page.cleaned_at ? view : 'original'
  const { url: originalUrl, error: originalError } = usePageImage(page.id, 'original', 'raw')
  const { url: cleanedUrl, error: cleanedError } = usePageImage(
    page.id,
    page.cleaned_at ? 'cleaned' : 'original',
    page.cleaned_at ?? 'raw',
  )
  const displayUrl = isPeekingOriginal ? originalUrl : (effectiveView === 'cleaned' ? (cleanedUrl || originalUrl) : originalUrl)
  const error = isPeekingOriginal ? originalError : (effectiveView === 'cleaned' ? (cleanedError && originalError) : originalError)

  // Synchronise l'inspecteur uniquement pour la bulle actuellement sélectionnée
  useEffect(() => {
    if (!props.activeBlockId) return
    const blk = page.ocr_blocks.find((b) => b.id === props.activeBlockId)
    if (blk) {
      const override = blockStyles[blk.id]
      const style = override?.manhwa_style ?? blk.manhwa_style ?? (blk.bubble_type === 'C' ? 'cinzel' : 'dialogue')
      const scale = override?.font_size_scale ?? blk.font_size_scale ?? 1
      const rot = override?.rotation_angle ?? blk.rotation_angle ?? 0
      const color = override?.text_color ?? blk.text_color ?? (style === 'cinzel' || style === 'system' ? '#ffffff' : '#0d0d0d')
      const stroke = override?.stroke_color ?? blk.stroke_color ?? (style === 'cinzel' || style === 'system' ? '#000000' : '#ffffff')
      const width = override?.stroke_width ?? blk.stroke_width ?? 2

      setManhwaStyle(style)
      setFontSizeScale(scale)
      setRotationAngle(rot)
      setTextColor(color)
      setStrokeStyle(stroke === '#000000' ? 'black' : stroke === 'transparent' ? 'none' : 'white')
      setStrokeWidth(width)
    }
  }, [props.activeBlockId, page.ocr_blocks, blockStyles])

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
    const before: Record<string, string | number | undefined> = {}
    for (const k of Object.keys(updates) as (keyof typeof updates)[]) {
      before[k] = blk[k]
    }

    // 1. Mise à jour locale immédiate et réactive pour CE bloc uniquement (n'affecte aucune autre bulle)
    setBlockStyles((prev) => ({
      ...prev,
      [blockId]: { ...(prev[blockId] || {}), ...updates },
    }))
    Object.assign(blk, updates)

    try {
      await api.updateBlockStyle(blockId, updates)
      setUndoStack((prev) => [...prev.slice(-29), { kind: 'style', blockId, before, after: { ...updates } }])
      setRedoStack([])
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
    const before = blk.translation ? blk.translation.translated_text : blk.text
    if (before === newText) return
    const translationId = blk.translation?.id ?? null
    if (blk.translation) {
      await api.updateTranslation(blk.translation.id, newText)
      blk.translation.translated_text = newText
      blk.translation.edited_by_user = true
    } else {
      await api.updateBlockText(blockId, newText)
      blk.text = newText
    }
    setUndoStack((prev) => [...prev.slice(-29), { kind: 'text', blockId, translationId, before, after: newText }])
    setRedoStack([])
    props.onRefresh?.()
  }

  const applyHistoryEntry = useCallback(
    async (entry: HistoryEntry, direction: 'undo' | 'redo') => {
      const target = direction === 'undo' ? entry.before : entry.after
      const blk = page.ocr_blocks.find((b) => b.id === entry.blockId)
      try {
        if (entry.kind === 'bbox') {
          const bbox = target as { bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }
          await api.updateBlockBbox(entry.blockId, bbox)
          if (blk) Object.assign(blk, bbox)
        } else if (entry.kind === 'style') {
          const styleUpdates = target as Record<string, string | number | undefined>
          await api.updateBlockStyle(entry.blockId, styleUpdates)
          if (blk) Object.assign(blk, styleUpdates)
        } else if (entry.kind === 'text') {
          const textVal = target as string
          if (entry.translationId) {
            await api.updateTranslation(entry.translationId, textVal)
            if (blk?.translation) blk.translation.translated_text = textVal
          } else {
            await api.updateBlockText(entry.blockId, textVal)
            if (blk) blk.text = textVal
          }
        }
        await props.onRefresh?.()
      } catch (err) {
        console.error('History replay failed', err)
      }
    },
    [page.ocr_blocks, props],
  )

  const handleUndo = useCallback(async () => {
    if (undoStack.length === 0) return
    const entry = undoStack[undoStack.length - 1]
    setUndoStack((prev) => prev.slice(0, -1))
    setRedoStack((prev) => [...prev, entry])
    await applyHistoryEntry(entry, 'undo')
  }, [undoStack, applyHistoryEntry])

  const handleRedo = useCallback(async () => {
    if (redoStack.length === 0) return
    const entry = redoStack[redoStack.length - 1]
    setRedoStack((prev) => prev.slice(0, -1))
    setUndoStack((prev) => [...prev, entry])
    await applyHistoryEntry(entry, 'redo')
  }, [redoStack, applyHistoryEntry])

  // C shortcut for RAW peek & Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y for Undo/Redo
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) {
          handleRedo()
        } else {
          handleUndo()
        }
        return
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        handleRedo()
        return
      }
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
  }, [handleUndo, handleRedo])

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
    const blk = page.ocr_blocks.find((b) => b.id === blockId)
    const before = blk
      ? { bbox_x: blk.bbox_x, bbox_y: blk.bbox_y, bbox_w: blk.bbox_w, bbox_h: blk.bbox_h }
      : null
    try {
      const updated = await api.updateBlockBbox(blockId, bbox)
      if (blk) {
        Object.assign(blk, updated)
      }
      if (before && (before.bbox_x !== bbox.bbox_x || before.bbox_y !== bbox.bbox_y || before.bbox_w !== bbox.bbox_w || before.bbox_h !== bbox.bbox_h)) {
        setUndoStack((prev) => [...prev.slice(-29), { kind: 'bbox', blockId, before, after: { ...bbox } }])
        setRedoStack([])
      }
      await props.onRefresh?.()
    } catch (err) {
      console.error(err)
    }
  }

  const handleToggleAiQc = async () => {
    const nextOpen = !qcOpen
    setQcOpen(nextOpen)
    if (nextOpen) {
      setQcLoading(true)
      try {
        const report = await api.getPageQc(projectId, page.id)
        setQcIssues(report.issues)
      } catch (err) {
        console.error(err)
      } finally {
        setQcLoading(false)
      }
    }
  }

  const handleToggleComments = async () => {
    const nextOpen = !commentsOpen
    setCommentsOpen(nextOpen)
    if (nextOpen) {
      setVersionsOpen(false)
      try {
        const list = await api.listPageComments(projectId, page.id)
        setComments(list)
      } catch (err) {
        console.error(err)
      }
    }
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentInput.trim()) return
    try {
      const created = await api.createPageComment(projectId, page.id, commentInput.trim(), props.activeBlockId)
      setComments((prev) => [...prev, created])
      setCommentInput('')
    } catch (err) {
      console.error(err)
    }
  }

  const handleToggleVersions = async () => {
    const nextOpen = !versionsOpen
    setVersionsOpen(nextOpen)
    if (nextOpen) {
      setCommentsOpen(false)
      try {
        const list = await api.listPageVersions(projectId, page.id)
        setVersions(list)
      } catch (err) {
        console.error(err)
      }
    }
  }

  const handleCreateVersion = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const created = await api.createPageVersion(projectId, page.id, versionLabel.trim())
      setVersions((prev) => [created, ...prev])
      setVersionLabel('')
    } catch (err) {
      console.error(err)
    }
  }

  const handleRestoreVersion = async (versionId: string) => {
    await run(`restore:${versionId}`, 'Page version restored.', async () => {
      await api.restorePageVersion(projectId, page.id, versionId)
    })
  }

  const handleWorkflowStatusChange = async (newStatus: string) => {
    setWorkflowStatus(newStatus as NonNullable<Page['workflow_status']>)
    try {
      await api.updatePageWorkflowStatus(projectId, page.id, newStatus)
      await props.onRefresh?.()
    } catch (err) {
      console.error(err)
    }
  }

  const handleCreateBlock = async (bbox: { bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }) => {
    await run(`create-block:${page.id}`, 'Bulle détectée et ajoutée.', async () => {
      const newBlock = await api.createBlock({ page_id: page.id, ...bbox })
      page.ocr_blocks.push(newBlock)
      await props.onRefresh?.()
      props.onSelectBlock(newBlock.id)
    })
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
    <section aria-label={`Page ${page.page_number}`} className="flex min-w-0 w-full max-w-full flex-1 flex-col overflow-x-hidden bg-paper">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-hairline px-3 py-2 sm:px-4">
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

        <div className="flex min-w-0 flex-wrap items-center gap-1.5 border-l border-hairline pl-3">
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
            <>
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoStack.length === 0 || busy !== null}
                className="h-8 px-2 text-xs font-medium flex items-center gap-1 rounded border border-hairline bg-sheet text-ink hover:bg-muted disabled:opacity-40 transition-colors"
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
              >
                <Undo2 className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRedo}
                disabled={redoStack.length === 0 || busy !== null}
                className="h-8 px-2 text-xs font-medium flex items-center gap-1 rounded border border-hairline bg-sheet text-ink hover:bg-muted disabled:opacity-40 transition-colors"
                title="Redo (Ctrl+Shift+Z)"
                aria-label="Redo"
              >
                <Redo2 className="size-3.5" />
              </button>
              <button
                type="button"
                aria-pressed={qcOpen}
                onClick={handleToggleAiQc}
                className={cn(
                  'h-8 px-2.5 text-xs font-medium flex items-center gap-1 rounded border border-hairline transition-colors',
                  qcOpen ? 'bg-ink text-sheet' : 'bg-sheet text-ink hover:bg-muted',
                )}
                title="Run AI Quality Control on this page"
              >
                <ShieldCheck className="size-3.5 text-seal" />
                <span className="hidden sm:inline">AI QC</span>
              </button>
              <button
                type="button"
                aria-pressed={commentsOpen}
                onClick={handleToggleComments}
                className={cn(
                  'h-8 px-2.5 text-xs font-medium flex items-center gap-1 rounded border border-hairline transition-colors',
                  commentsOpen ? 'bg-ink text-sheet' : 'bg-sheet text-ink hover:bg-muted',
                )}
                title="Page comments & review notes"
              >
                <MessageSquare className="size-3.5 text-seal" />
                <span className="hidden sm:inline">Notes</span>
              </button>
              <button
                type="button"
                aria-pressed={versionsOpen}
                onClick={handleToggleVersions}
                className={cn(
                  'h-8 px-2.5 text-xs font-medium flex items-center gap-1 rounded border border-hairline transition-colors',
                  versionsOpen ? 'bg-ink text-sheet' : 'bg-sheet text-ink hover:bg-muted',
                )}
                title="Page snapshots & version history"
              >
                <History className="size-3.5 text-seal" />
                <span className="hidden sm:inline">Versions</span>
              </button>
              <select
                value={workflowStatus}
                onChange={(e) => handleWorkflowStatusChange(e.target.value)}
                aria-label="Page workflow status"
                className="h-8 rounded border border-hairline bg-sheet px-2 text-xs font-mono font-semibold text-ink"
                title="Scanlation workflow stage"
              >
                <option value="raw">RAW</option>
                <option value="cleaned">CLEANED</option>
                <option value="translated">TRANSLATED</option>
                <option value="typeset">TYPESET</option>
                <option value="ready">READY</option>
              </select>
              <button
                type="button"
                onClick={handleExportScript}
                className="h-8 px-2.5 text-xs font-medium flex items-center gap-1 rounded border border-hairline bg-sheet text-ink hover:bg-muted transition-colors"
                title="Download the Photoshop-formatted script (.txt)"
              >
                <FileText className="size-3.5 text-seal" />
                <span className="hidden sm:inline">Script (.txt)</span>
              </button>
            </>
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

      {/* AI QUALITY CONTROL PANEL */}
      {qcOpen && (
        <div className="border-b border-hairline bg-sheet px-4 py-2.5 text-xs">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="font-mono font-semibold uppercase tracking-wider text-ink-soft">
              AI Quality Control — Page {page.page_number}
            </span>
            <button
              type="button"
              onClick={() => setQcOpen(false)}
              className="text-ink-soft hover:text-ink font-mono text-[11px]"
            >
              Close
            </button>
          </div>
          {qcLoading ? (
            <div className="flex items-center gap-2 py-1 text-ink-soft">
              <Loader2 className="size-3.5 animate-spin text-seal" />
              <span>Analyzing bubbles, glossary & overflow risks…</span>
            </div>
          ) : qcIssues.length === 0 ? (
            <p className="text-emerald-700 font-medium py-0.5">
              ✓ No issues detected on this page (translations, locked glossary terms & bubble sizes look good).
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5 max-h-36 overflow-y-auto py-1">
              {qcIssues.map((issue, idx) => (
                <li
                  key={`${issue.code}-${issue.ocr_block_id ?? idx}`}
                  className="flex items-start justify-between gap-3 rounded border border-hairline bg-paper px-2.5 py-1.5"
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span
                      className={cn(
                        'mt-0.5 shrink-0 rounded px-1.5 py-0.2 font-mono text-[10px] font-bold uppercase',
                        issue.severity === 'error'
                          ? 'bg-red-100 text-red-800'
                          : issue.severity === 'warning'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-blue-100 text-blue-800',
                      )}
                    >
                      {issue.severity}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{issue.message}</p>
                      {issue.suggestion && (
                        <p className="text-[11px] text-ink-soft">{issue.suggestion}</p>
                      )}
                    </div>
                  </div>
                  {issue.ocr_block_id && (
                    <button
                      type="button"
                      onClick={() => props.onSelectBlock(issue.ocr_block_id ?? null)}
                      className="shrink-0 rounded border border-hairline bg-sheet px-2 py-0.5 font-mono text-[10px] font-semibold hover:bg-muted"
                    >
                      Inspect
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* COLLABORATION COMMENTS PANEL */}
      {commentsOpen && (
        <div className="border-b border-hairline bg-sheet px-4 py-2.5 text-xs">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="font-mono font-semibold uppercase tracking-wider text-ink-soft">
              Review Notes & Comments ({comments.length})
            </span>
            <button
              type="button"
              onClick={() => setCommentsOpen(false)}
              className="text-ink-soft hover:text-ink font-mono text-[11px]"
            >
              Close
            </button>
          </div>
          <form onSubmit={handleAddComment} className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={commentInput}
              onChange={(e) => setCommentInput(e.target.value)}
              placeholder={props.activeBlockId ? 'Comment on selected bubble…' : 'Add a review note on this page…'}
              className="h-8 flex-1 rounded border border-hairline bg-paper px-2.5 text-xs"
            />
            <Button type="submit" size="sm" variant="default">
              Post
            </Button>
          </form>
          {comments.length > 0 && (
            <ul className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
              {comments.map((c) => (
                <li
                  key={c.id}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded border border-hairline bg-paper px-2.5 py-1.5',
                    c.is_resolved && 'opacity-60',
                  )}
                >
                  <div className="min-w-0">
                    <span className="font-mono text-[10px] font-bold text-ink-soft">{c.author_email}: </span>
                    <span className={cn('text-ink', c.is_resolved && 'line-through')}>{c.content}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.ocr_block_id && (
                      <button
                        type="button"
                        onClick={() => props.onSelectBlock(c.ocr_block_id ?? null)}
                        className="rounded border border-hairline bg-sheet px-1.5 py-0.5 font-mono text-[10px] hover:bg-muted"
                      >
                        Bubble
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        const updated = await api.updatePageComment(projectId, c.id, !c.is_resolved)
                        setComments((prev) => prev.map((item) => (item.id === c.id ? updated : item)))
                      }}
                      className="text-emerald-700 hover:underline font-mono text-[10px] flex items-center gap-0.5"
                    >
                      <CheckCircle2 className="size-3" />
                      {c.is_resolved ? 'Reopen' : 'Resolve'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* PAGE VERSIONING / SNAPSHOTS PANEL */}
      {versionsOpen && (
        <div className="border-b border-hairline bg-sheet px-4 py-2.5 text-xs">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="font-mono font-semibold uppercase tracking-wider text-ink-soft">
              Page Version History ({versions.length})
            </span>
            <button
              type="button"
              onClick={() => setVersionsOpen(false)}
              className="text-ink-soft hover:text-ink font-mono text-[11px]"
            >
              Close
            </button>
          </div>
          <form onSubmit={handleCreateVersion} className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={versionLabel}
              onChange={(e) => setVersionLabel(e.target.value)}
              placeholder="Snapshot label (e.g. Before QC proofread)…"
              className="h-8 flex-1 rounded border border-hairline bg-paper px-2.5 text-xs"
            />
            <Button type="submit" size="sm" variant="default">
              Save Snapshot
            </Button>
          </form>
          {versions.length > 0 && (
            <ul className="flex flex-col gap-1.5 max-h-36 overflow-y-auto">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between gap-2 rounded border border-hairline bg-paper px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <span className="font-mono font-bold text-ink">v{v.version_number} — {v.label}</span>
                    <span className="ml-2 font-mono text-[10px] text-ink-soft">
                      ({v.blocks_count} bubbles · by {v.created_by_email})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestoreVersion(v.id)}
                    className="shrink-0 rounded border border-hairline bg-sheet px-2 py-0.5 font-mono text-[10px] font-semibold hover:bg-muted"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* MANHWA TYPOGRAPHY INSPECTOR WITH DATABASE PERSISTENCE */}
      {activeBlock && (
        <div className="flex min-w-0 max-w-full flex-wrap items-center justify-between gap-3 bg-sheet border-b border-hairline px-3 py-2.5 shadow-sm text-xs sm:px-4">
          {/* Section 1: Choix de la police (Catalogue de styles complet incluant Cinzel) */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-ink">
              <Type className="size-4 text-seal" />
              <span>Police :</span>
            </div>
            <select
              value={normalizeFontId(manhwaStyle)}
              onChange={(e) => {
                const selectedId = e.target.value
                setManhwaStyle(selectedId)
                let nextColor = textColor
                let nextStroke = strokeStyle
                if (selectedId === 'cinzel') {
                  // Norme scanlation pour récitatifs / boîtes noires : texte blanc
                  if (nextColor === '#0d0d0d') nextColor = '#ffffff'
                  if (nextStroke === 'white') nextStroke = 'black'
                } else if (selectedId === 'comic-neue' || selectedId === 'sans') {
                  // Norme dialogue standard : texte noir
                  if (nextColor === '#ffffff') nextColor = '#0d0d0d'
                  if (nextStroke === 'black') nextStroke = 'white'
                }
                setTextColor(nextColor)
                setStrokeStyle(nextStroke)
                persistBlockStyle({
                  manhwa_style: selectedId,
                  text_color: nextColor,
                  stroke_color: nextStroke === 'black' ? '#000000' : nextStroke === 'white' ? '#ffffff' : 'transparent',
                })
              }}
              className="rounded border border-hairline bg-paper px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-seal"
              title="Choisir la police pour cette bulle"
            >
              {FONTS_LIST.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>

            {/* Raccourcis rapides 1-clic pour styles courants */}
            <div className="hidden sm:flex items-center gap-1 rounded bg-paper/80 p-0.5 border border-hairline">
              {[
                { id: 'cinzel', label: 'Carré noir', icon: '🏛️' },
                { id: 'comic-neue', label: 'Dialogue', icon: '💬' },
                { id: 'bangers', label: 'Cris', icon: '💥' },
                { id: 'cormorant', label: 'Pensée', icon: '💭' },
                { id: 'permanent-marker', label: 'SFX', icon: '⚡' },
              ].map((p) => {
                const isCur = normalizeFontId(manhwaStyle) === p.id
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setManhwaStyle(p.id)
                      let nextColor = textColor
                      let nextStroke = strokeStyle
                      if (p.id === 'cinzel') {
                        if (nextColor === '#0d0d0d') nextColor = '#ffffff'
                        if (nextStroke === 'white') nextStroke = 'black'
                      } else if (p.id === 'comic-neue') {
                        if (nextColor === '#ffffff') nextColor = '#0d0d0d'
                        if (nextStroke === 'black') nextStroke = 'white'
                      }
                      setTextColor(nextColor)
                      setStrokeStyle(nextStroke)
                      persistBlockStyle({
                        manhwa_style: p.id,
                        text_color: nextColor,
                        stroke_color: nextStroke === 'black' ? '#000000' : nextStroke === 'white' ? '#ffffff' : 'transparent',
                      })
                    }}
                    className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-medium transition-all flex items-center gap-1',
                      isCur ? 'bg-ink text-sheet shadow-xs font-semibold' : 'text-ink-soft hover:text-ink hover:bg-sheet'
                    )}
                    title={p.label}
                  >
                    <span>{p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Section 2: Taille, Couleur, Contour & Rotation */}
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {/* Taille du texte avec A- et A+ */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-ink-soft">Taille :</span>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  title="Réduire la taille (-15%)"
                  onClick={() => {
                    const next = Math.max(0.5, Math.round((fontSizeScale - 0.15) * 100) / 100)
                    setFontSizeScale(next)
                    persistBlockStyle({ font_size_scale: next })
                  }}
                  className="size-6 rounded border border-hairline bg-paper text-ink hover:bg-muted font-bold text-xs grid place-items-center transition-colors"
                >
                  A-
                </button>
                <select
                  value={fontSizeScale}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setFontSizeScale(val)
                    persistBlockStyle({ font_size_scale: val })
                  }}
                  className="rounded border border-hairline bg-paper px-1.5 py-0.5 text-xs font-semibold"
                  title="Échelle de taille"
                >
                  {FONT_SIZE_SCALES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                  {!FONT_SIZE_SCALES.some((s) => s.value === fontSizeScale) && (
                    <option value={fontSizeScale}>{Math.round(fontSizeScale * 100)}% (Personnalisé)</option>
                  )}
                </select>
                <button
                  type="button"
                  title="Agrandir la taille (+15%)"
                  onClick={() => {
                    const next = Math.min(2.5, Math.round((fontSizeScale + 0.15) * 100) / 100)
                    setFontSizeScale(next)
                    persistBlockStyle({ font_size_scale: next })
                  }}
                  className="size-6 rounded border border-hairline bg-paper text-ink hover:bg-muted font-bold text-xs grid place-items-center transition-colors"
                >
                  A+
                </button>
              </div>
            </div>

            {/* Nuancier de couleurs + Sélecteur personnalisé */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-ink-soft">Couleur :</span>
              <div className="flex items-center gap-1">
                {COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.value}
                    type="button"
                    title={`${swatch.label} (${swatch.value})`}
                    onClick={() => {
                      setTextColor(swatch.value)
                      let nextStroke = strokeStyle
                      if (swatch.value === '#ffffff' && strokeStyle === 'white') {
                        nextStroke = 'black'
                        setStrokeStyle('black')
                      }
                      persistBlockStyle({
                        text_color: swatch.value,
                        stroke_color: nextStroke === 'black' ? '#000000' : nextStroke === 'white' ? '#ffffff' : 'transparent',
                      })
                    }}
                    className={cn(
                      'size-5 rounded-full transition-transform hover:scale-115 active:scale-95 cursor-pointer',
                      swatch.border ? 'border border-hairline' : '',
                      textColor.toLowerCase() === swatch.value.toLowerCase() ? 'ring-2 ring-seal ring-offset-1 scale-110' : ''
                    )}
                    style={{ backgroundColor: swatch.value }}
                  />
                ))}
                <label className="flex items-center cursor-pointer ml-0.5" title="Couleur personnalisée (Palette)">
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
              </div>
            </div>

            {/* Contour (Outline) */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-ink-soft">Contour :</span>
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
                title="Style de contour"
              >
                {STROKE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {strokeStyle !== 'none' && (
                <select
                  value={strokeWidth}
                  onChange={(e) => {
                    const val = Number(e.target.value)
                    setStrokeWidth(val)
                    persistBlockStyle({ stroke_width: val })
                  }}
                  className="rounded border border-hairline bg-paper px-1 py-0.5 text-xs font-semibold"
                  title="Épaisseur du contour"
                >
                  {STROKE_WIDTHS.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Contrôles de rotation (-180° à +180°) */}
            <div className="flex items-center gap-1.5" title="Angle de rotation du texte (-180° à +180°)">
              <span className="text-[11px] font-semibold text-ink-soft">Rotation :</span>
              <div className="flex items-center gap-1">
                {[
                  { label: '↺ -90°', angle: -90 },
                  { label: '-15°', angle: Math.max(-180, rotationAngle - 15) },
                  { label: '0°', angle: 0 },
                  { label: '+15°', angle: Math.min(180, rotationAngle + 15) },
                  { label: '↻ +90°', angle: 90 },
                ].map((btn) => (
                  <button
                    key={btn.label}
                    type="button"
                    onClick={() => {
                      setRotationAngle(btn.angle)
                      persistBlockStyle({ rotation_angle: btn.angle })
                    }}
                    className={cn(
                      'rounded border border-hairline px-1.5 py-0.5 font-mono text-[10px] font-semibold transition-colors',
                      rotationAngle === btn.angle && (btn.angle === 0 || btn.angle === 90 || btn.angle === -90)
                        ? 'bg-seal text-seal-ink border-seal'
                        : 'bg-paper text-ink hover:bg-muted',
                    )}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
              <input
                type="range"
                min={-180}
                max={180}
                value={rotationAngle}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setRotationAngle(val)
                  persistBlockStyle({ rotation_angle: val })
                }}
                className="w-16 accent-seal cursor-pointer"
              />
              <span className="font-mono text-[10px] w-8 text-right">
                {rotationAngle > 0 ? `+${rotationAngle}°` : `${rotationAngle}°`}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!activeBlock) return
                  const pageW = page.width ?? 1000
                  const pageH = page.height ?? 1414
                  const cx = activeBlock.bbox_x + activeBlock.bbox_w / 2
                  const cy = activeBlock.bbox_y + activeBlock.bbox_h / 2
                  const newW = Math.max(30, Math.min(pageW, activeBlock.bbox_h))
                  const newH = Math.max(20, Math.min(pageH, activeBlock.bbox_w))
                  const newX = Math.max(0, Math.min(pageW - newW, Math.round(cx - newW / 2)))
                  const newY = Math.max(0, Math.min(pageH - newH, Math.round(cy - newH / 2)))
                  handleUpdateBbox(activeBlock.id, {
                    bbox_x: newX,
                    bbox_y: newY,
                    bbox_w: newW,
                    bbox_h: newH,
                  })
                }}
                className="rounded border border-hairline bg-paper px-1.5 py-0.5 font-mono text-[10px] font-semibold text-ink hover:bg-muted transition-colors"
                title="Pivoter les dimensions du cadre (Largeur ↔ Hauteur)"
              >
                ⇄ L/H
              </button>
            </div>

            {/* Supprimer cette bulle */}
            <button
              type="button"
              className="h-6 px-2 rounded bg-red-600 hover:bg-red-700 text-white font-medium flex items-center gap-1 text-[11px] transition-colors ml-auto"
              onClick={() => handleDeleteBlock(activeBlock.id)}
              title="Supprimer cette bulle"
            >
              <Trash2 className="size-3" />
              <span>Supprimer</span>
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
            blocks={effectiveBlocks}
            activeId={props.activeBlockId}
            hoverId={props.hoverBlockId}
            onSelect={props.onSelectBlock}
            onHover={props.onHoverBlock}
            onUpdateBbox={handleUpdateBbox}
            onUpdateRotation={(blockId, angle) => {
              setRotationAngle(angle)
              persistBlockStyle({ rotation_angle: angle })
            }}
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