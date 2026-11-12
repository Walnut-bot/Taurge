'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { StatusBadge } from '@/components/ui/status'
import { useTranslations } from '@/i18n/provider'
import { api } from '@/lib/api'
import type { OcrBlock, Page, TranslationMemoryMatch } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { Runner } from './workspace'

type Props = {
  projectId?: string
  page: Page
  sourceLang: string
  targetLang: string
  activeId: string | null
  hoverId: string | null
  onActivate: (id: string | null) => void
  onHover: (id: string | null) => void
  busy: string | null
  run: Runner
}

export function BlockList(props: Props) {
  const { page } = props
  const t = useTranslations('Editor')
  const reviewed = page.ocr_blocks.filter((b) => b.translation?.edited_by_user).length
  const busy = props.busy
  const running =
    busy === `ocr:${page.id}` ? t('ocrRunning')
    : busy === `translate:${page.id}` ? t('translateRunning')
    : busy === `clean:${page.id}` ? t('cleanRunning')
    : busy ? t('working')
    : null
  const selectedIndex = props.activeId ? page.ocr_blocks.findIndex((b) => b.id === props.activeId) : -1

  return (
    <section
      aria-labelledby="blocks-title"
      className="flex min-w-0 w-full max-w-full flex-col overflow-x-hidden border-t-[1.5px] border-ink bg-sheet lg:sticky lg:top-0 lg:max-h-screen lg:overflow-y-auto lg:border-t-0 lg:border-l-[1.5px]"
    >
      <div className="flex items-baseline justify-between gap-2 border-b border-hairline px-4 py-3">
        <h2 id="blocks-title" className="label-mono truncate text-ink-soft">
          {t('bubbles')} <span className="text-ink">{page.ocr_blocks.length}</span>
        </h2>
        {page.ocr_blocks.length > 0 && (
          <span className="shrink-0 font-mono text-[11px] text-ink-soft">
            {reviewed}/{page.ocr_blocks.length} {t('reviewed')}
          </span>
        )}
      </div>

      <div role="status" aria-live="polite" className="border-b border-hairline px-4 py-2.5 text-sm break-words">
        {running ? (
          <span className="inline-flex items-center gap-2 font-medium text-ink">
            <Loader2 className="size-4 animate-spin text-seal" aria-hidden="true" />
            {running}
          </span>
        ) : selectedIndex >= 0 ? (
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="neutral">{t('selected', { n: selectedIndex + 1 })}</StatusBadge>
            <span className="text-ink-soft">{t('selectedHint')}</span>
          </span>
        ) : page.ocr_blocks.length > 0 ? (
          <span className="text-ink-soft">{t('ocrDone')} {t('noSelection')}</span>
        ) : null}
      </div>

      {page.ocr_blocks.length === 0 && !running ? (
        <div className="flex flex-col gap-2 p-6 text-sm text-ink-soft">
          <p className="font-medium text-ink">{t('emptyTitle')}</p>
          <p>{t('emptyBody')}</p>
        </div>
      ) : page.ocr_blocks.length === 0 ? (
        <div className="flex flex-col gap-2 p-6 text-sm text-ink-soft" aria-busy="true">
          <p>{running}</p>
        </div>
      ) : (
        <ol className="flex min-w-0 w-full flex-col">
          {page.ocr_blocks.map((b, i) => (
            <BlockItem
              key={`${b.id}:${b.text}:${b.translation?.id}:${b.translation?.translated_text}`}
              block={b}
              index={i}
              {...props}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

function BlockItem({
  projectId,
  block,
  index,
  sourceLang,
  targetLang,
  activeId,
  hoverId,
  onActivate,
  onHover,
  busy,
  run,
}: Props & { block: OcrBlock; index: number }) {
  const t = useTranslations('Editor')
  const active = activeId === block.id
  const ref = useRef<HTMLLIElement>(null)
  const [original, setOriginal] = useState(block.text)
  const [translation, setTranslation] = useState(block.translation?.translated_text ?? '')
  const [bubbleType, setBubbleType] = useState(block.bubble_type || 'B')
  const [rotationAngle, setRotationAngle] = useState(block.rotation_angle ?? 0)
  const [tmMatches, setTmMatches] = useState<TranslationMemoryMatch[]>([])
  const lowConfidence = block.confidence < 0.7
  const dirtyOriginal = original.trim() !== block.text
  const dirtyTranslation = Boolean(block.translation) && translation.trim() !== block.translation!.translated_text
  const dirty = dirtyOriginal || dirtyTranslation
  const saving = busy === `save:${block.id}`
  const retranslating = busy === `retranslate:${block.id}`

  const TYPE_CONFIG = {
    B: { label: 'B', fullName: 'Standard bubble', color: 'bg-muted text-ink' },
    DB: { label: 'DB', fullName: 'Double bubble (//)', color: 'bg-blue-100 text-blue-900 border border-blue-300' },
    C: { label: 'C', fullName: 'Narration box', color: 'bg-indigo-100 text-indigo-900 border border-indigo-300' },
    HB: { label: 'HB', fullName: 'Off-bubble (floating)', color: 'bg-amber-100 text-amber-900 border border-amber-300' },
    SFX: { label: 'SFX', fullName: 'Sound effect', color: 'bg-rose-100 text-rose-900 border border-rose-300' },
  } as const

  async function handleTypeChange(newType: string) {
    setBubbleType(newType)
    block.bubble_type = newType
    try {
      await api.updateBlockType(block.id, newType)
    } catch (err) {
      console.error('Failed to update bubble type', err)
    }
  }

  useEffect(() => {
    setRotationAngle(block.rotation_angle ?? 0)
  }, [block.rotation_angle])

  async function handleRotationChange(nextAngle: number) {
    const clamped = Math.max(-180, Math.min(180, Math.round(nextAngle)))
    setRotationAngle(clamped)
    block.rotation_angle = clamped
    try {
      await api.updateBlockStyle(block.id, { rotation_angle: clamped })
    } catch (err) {
      console.error('Failed to update rotation angle', err)
    }
  }

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active])

  useEffect(() => {
    if (!active || !projectId || !block.text.trim()) {
      setTmMatches([])
      return
    }
    let cancelled = false
    api
      .searchTranslationMemory(projectId, block.text, 3)
      .then((res) => {
        if (!cancelled) setTmMatches(res)
      })
      .catch(() => {
        if (!cancelled) setTmMatches([])
      })
    return () => {
      cancelled = true
    }
  }, [active, projectId, block.text])

  async function save() {
    await run(`save:${block.id}`, `Bubble ${index + 1} saved.`, async () => {
      if (dirtyOriginal) await api.updateBlockText(block.id, original.trim())
      if (dirtyTranslation && block.translation) await api.updateTranslation(block.translation.id, translation.trim())
    })
  }

  return (
    <li
      ref={ref}
      onMouseEnter={() => onHover(block.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'min-w-0 w-full border-b border-hairline transition-colors',
        active ? 'bg-paper shadow-[inset_3px_0_0_var(--seal)]' : hoverId === block.id && 'bg-paper/60',
      )}
    >
      <button
        type="button"
        onClick={() => onActivate(active ? null : block.id)}
        aria-expanded={active}
        className="flex min-w-0 w-full items-start gap-2.5 px-4 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-seal"
      >
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 grid size-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold',
            active ? 'bg-seal text-seal-ink' : 'bg-ink text-sheet',
          )}
        >
          {index + 1}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1 break-words">
          <span className="sr-only">Bubble {index + 1}.</span>
          <span lang={sourceLang} className="line-clamp-2 break-words text-sm text-ink-soft">
            {block.text}
          </span>
          {block.translation ? (
            <span lang={targetLang} className="line-clamp-2 break-words leading-snug font-medium">
              {block.translation.translated_text}
            </span>
          ) : (
            <span className="text-sm text-ink-soft italic">{t('notTranslated')}</span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                'rounded px-1.5 py-0.5 font-mono text-[10px] font-bold tracking-tight',
                TYPE_CONFIG[bubbleType as keyof typeof TYPE_CONFIG]?.color || 'bg-muted text-ink'
              )}
              title={TYPE_CONFIG[bubbleType as keyof typeof TYPE_CONFIG]?.fullName}
            >
              {bubbleType}
            </span>
            <span
              className={cn('font-mono text-[11px]', lowConfidence ? 'font-semibold text-caution' : 'text-ink-soft')}
              title={t('confidence')}
            >
              {Math.round(block.confidence * 100)}%
            </span>
          </div>
          {block.translation?.edited_by_user && (
            <span className="label-mono -rotate-3 border border-seal px-1 text-[9px] text-seal">{t('reviewedBadge')}</span>
          )}
        </span>
      </button>

      {active && (
        <div className="flex min-w-0 w-full flex-col gap-3.5 px-4 pb-4">
          {/* Scanlation classification picker (FlameScans / Leviathan style) */}
          <div className="flex min-w-0 flex-col gap-1.5 rounded border border-hairline bg-paper/60 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="label-mono text-ink-soft">Scanlation classification</span>
              <span className="font-mono text-[11px] font-medium text-seal">
                {TYPE_CONFIG[bubbleType as keyof typeof TYPE_CONFIG]?.fullName}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {(['B', 'DB', 'C', 'HB', 'SFX'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs font-mono font-bold transition-all',
                    bubbleType === t
                      ? 'bg-seal text-seal-ink ring-1 ring-seal shadow-sm'
                      : 'border border-hairline bg-sheet text-ink-soft hover:bg-muted hover:text-ink'
                  )}
                  title={TYPE_CONFIG[t].fullName}
                >
                  {t}
                </button>
              ))}
            </div>
            {bubbleType === 'DB' && (
              <p className="mt-1 text-[11px] text-seal italic break-words">
                💡 Scanlation rule: separate the two sentence parts with a double slash <strong>//</strong>
              </p>
            )}
            {bubbleType === 'HB' && (
              <p className="mt-1 text-[11px] text-amber-800 italic break-words">
                💡 Off-bubble text over artwork: apply an outline (stroke) to keep it readable.
              </p>
            )}
            {bubbleType === 'SFX' && (
              <p className="mt-1 text-[11px] text-rose-800 italic break-words">
                💡 Sound effect / onomatopoeia: adapt or preserve it following the team guidelines.
              </p>
            )}
          </div>

          {/* Contrôle de rotation du texte (-180° à +180°) directement dans la fiche de la bulle */}
          <div className="flex min-w-0 flex-col gap-2 rounded border border-hairline bg-paper/60 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="label-mono text-ink-soft">Rotation du texte</span>
              <span className="font-mono text-[11px] font-bold text-seal">
                {rotationAngle > 0 ? `+${rotationAngle}°` : `${rotationAngle}°`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {[
                { label: '↺ -90°', angle: -90 },
                { label: '-45°', angle: -45 },
                { label: '-15°', angle: Math.max(-180, rotationAngle - 15) },
                { label: '0°', angle: 0 },
                { label: '+15°', angle: Math.min(180, rotationAngle + 15) },
                { label: '+45°', angle: 45 },
                { label: '↻ +90°', angle: 90 },
              ].map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  onClick={() => handleRotationChange(btn.angle)}
                  className={cn(
                    'rounded px-2 py-0.5 font-mono text-[10px] font-semibold transition-all',
                    rotationAngle === btn.angle && (btn.angle === 0 || Math.abs(btn.angle) === 45 || Math.abs(btn.angle) === 90)
                      ? 'bg-seal text-seal-ink shadow-xs'
                      : 'border border-hairline bg-sheet text-ink-soft hover:bg-muted hover:text-ink',
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
              onChange={(e) => handleRotationChange(Number(e.target.value))}
              className="w-full accent-seal cursor-pointer"
              aria-label="Angle de rotation du texte"
            />
          </div>
          {lowConfidence && (
            <p className="border-l-2 border-caution bg-caution-wash px-2.5 py-1.5 text-xs text-caution break-words">
              {t('lowConfidence')}
            </p>
          )}
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`orig-${block.id}`} className="label-mono text-ink-soft">
              {t('original')} · {sourceLang.toUpperCase()}
            </label>
            <Textarea
              id={`orig-${block.id}`}
              lang={sourceLang}
              value={original}
              onChange={(e) => setOriginal(e.target.value)}
              rows={3}
              className="w-full min-w-0 break-words"
            />
          </div>

          {block.translation ? (
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <label htmlFor={`tr-${block.id}`} className="label-mono text-ink-soft">
                  {t('translation')} · {targetLang.toUpperCase()}
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="-mr-2 h-7 text-xs"
                  disabled={busy !== null}
                  onClick={() => run(`retranslate:${block.id}`, `Bubble ${index + 1} retranslated.`, () => api.retranslate(block.id))}
                >
                  {retranslating ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
                  {t('retranslate')}
                </Button>
              </div>
              <Textarea
                id={`tr-${block.id}`}
                lang={targetLang}
                value={translation}
                onChange={(e) => setTranslation(e.target.value)}
                rows={3}
                className="w-full min-w-0 break-words font-medium"
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && dirty) {
                    e.preventDefault()
                    save()
                  }
                }}
              />
              {dirtyOriginal && (
                <p className="text-xs text-ink-soft break-words">
                  {t('retranslateHint')}
                </p>
              )}
              {tmMatches.length > 0 && (
                <div className="mt-1 rounded border border-hairline bg-paper/70 p-2 text-xs">
                  <span className="label-mono block text-[10px] text-ink-soft mb-1">
                    Translation Memory ({tmMatches.length})
                  </span>
                  <ul className="flex flex-col gap-1.5">
                    {tmMatches.map((m, idx) => (
                      <li key={idx} className="flex items-start justify-between gap-2 border-t border-hairline/60 pt-1 first:border-t-0 first:pt-0">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] text-ink-soft" title={m.source_text}>{m.source_text}</p>
                          <p className="font-medium text-ink break-words">{m.translated_text}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTranslation(m.translated_text)}
                          className="shrink-0 rounded border border-hairline bg-sheet px-1.5 py-0.5 font-mono text-[10px] font-semibold hover:bg-muted"
                          title={`Similarity ${Math.round(m.similarity * 100)}% (${m.project_name})`}
                        >
                          {Math.round(m.similarity * 100)}% · Use
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-soft break-words">{t('translatePageHint')}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} disabled={!dirty || busy !== null}>
              {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
              {t('save')}
            </Button>
            {dirty && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOriginal(block.text)
                  setTranslation(block.translation?.translated_text ?? '')
                }}
              >
                {t('cancel')}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:bg-danger-wash"
              title="Skip this bubble (don't clean or translate it)"
              onClick={async () => {
                if (window.confirm('Exclude this bubble? It will not be cleaned when the page is processed.')) {
                  await run(`delete:${block.id}`, 'Bubble excluded from cleaning.', () => api.deleteBlock(block.id))
                  if (activeId === block.id) onActivate(null)
                }
              }}
            >
              {t('skipBubble')}
            </Button>
            <kbd className="ml-auto hidden font-mono text-[10px] text-ink-soft xl:block">⌘/Ctrl + Enter</kbd>
          </div>
        </div>
      )}
    </li>
  )
}
