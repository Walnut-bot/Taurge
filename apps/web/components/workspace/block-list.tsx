'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { StatusBadge } from '@/components/ui/status'
import { useTranslations } from '@/i18n/provider'
import { api } from '@/lib/api'
import type { OcrBlock, Page } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { Runner } from './workspace'

type Props = {
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
      className="flex flex-col border-t-[1.5px] border-ink bg-sheet lg:border-t-0 lg:border-l-[1.5px]"
    >
      <div className="flex items-baseline justify-between border-b border-hairline px-4 py-3">
        <h2 id="blocks-title" className="label-mono text-ink-soft">
          {t('bubbles')} <span className="text-ink">{page.ocr_blocks.length}</span>
        </h2>
        {page.ocr_blocks.length > 0 && (
          <span className="font-mono text-[11px] text-ink-soft">
            {reviewed}/{page.ocr_blocks.length} {t('reviewed')}
          </span>
        )}
      </div>

      <div role="status" aria-live="polite" className="border-b border-hairline px-4 py-2.5 text-sm">
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
        <ol className="flex flex-col">
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
    if (active) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active])

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
        'border-b border-hairline transition-colors',
        active ? 'bg-paper shadow-[inset_3px_0_0_var(--seal)]' : hoverId === block.id && 'bg-paper/60',
      )}
    >
      <button
        type="button"
        onClick={() => onActivate(active ? null : block.id)}
        aria-expanded={active}
        className="flex w-full items-start gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-seal"
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
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="sr-only">Bubble {index + 1}.</span>
          <span lang={sourceLang} className="line-clamp-2 text-sm text-ink-soft">
            {block.text}
          </span>
          {block.translation ? (
            <span lang={targetLang} className="line-clamp-2 leading-snug font-medium">
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
        <div className="flex flex-col gap-4 px-4 pb-4 pl-13">
          {/* Scanlation classification picker (FlameScans / Leviathan style) */}
          <div className="flex flex-col gap-1.5 rounded border border-hairline bg-paper/60 p-2.5">
            <div className="flex items-center justify-between">
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
              <p className="mt-1 text-[11px] text-seal italic">
                💡 Scanlation rule: separate the two sentence parts with a double slash <strong>//</strong>
              </p>
            )}
            {bubbleType === 'HB' && (
              <p className="mt-1 text-[11px] text-amber-800 italic">
                💡 Off-bubble text over artwork: apply an outline (stroke) to keep it readable.
              </p>
            )}
            {bubbleType === 'SFX' && (
              <p className="mt-1 text-[11px] text-rose-800 italic">
                💡 Sound effect / onomatopoeia: adapt or preserve it following the team guidelines.
              </p>
            )}
          </div>
          {lowConfidence && (
            <p className="border-l-2 border-caution bg-caution-wash px-2.5 py-1.5 text-xs text-caution">
              {t('lowConfidence')}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`orig-${block.id}`} className="label-mono text-ink-soft">
              {t('original')} · {sourceLang.toUpperCase()}
            </label>
            <Textarea
              id={`orig-${block.id}`}
              lang={sourceLang}
              value={original}
              onChange={(e) => setOriginal(e.target.value)}
              rows={2}
            />
          </div>

          {block.translation ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
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
                className="font-medium"
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && dirty) {
                    e.preventDefault()
                    save()
                  }
                }}
              />
              {dirtyOriginal && (
                <p className="text-xs text-ink-soft">
                  {t('retranslateHint')}
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-ink-soft">{t('translatePageHint')}</p>
          )}

          <div className="flex items-center gap-2">
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
            <kbd className="ml-auto hidden font-mono text-[10px] text-ink-soft sm:block">⌘/Ctrl + Enter</kbd>
          </div>
        </div>
      )}
    </li>
  )
}
