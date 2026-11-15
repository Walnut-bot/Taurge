import { useState, useRef, useEffect } from 'react'
import { Download, Loader2, Sparkles, ChevronDown, FileText, BookOpen, Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocale } from '@/i18n/provider'
import type { PipelineStep } from '@/lib/pipeline'
import { cn } from '@/lib/utils'

type Props = {
  steps: PipelineStep[]
  sourceLang: string
  targetLang: string
  canExport: boolean
  exporting: boolean
  canBatchProcess?: boolean
  batchProcessing?: boolean
  batchProgressText?: string | null
  disabled: boolean
  onExport: (format?: 'zip' | 'cbz' | 'pdf') => void
  onBatchProcess?: () => void
}

export function PipelineBar({
  steps,
  sourceLang,
  targetLang,
  canExport,
  exporting,
  canBatchProcess,
  batchProcessing,
  batchProgressText,
  disabled,
  onExport,
  onBatchProcess,
}: Props) {
  const locale = useLocale()
  const isEn = locale === 'en'
  const [selectedFormat, setSelectedFormat] = useState<'zip' | 'cbz' | 'pdf'>('cbz')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="flex flex-wrap items-stretch border-b-[1.5px] border-ink bg-sheet">
      <div className="flex items-center gap-1.5 border-r-[1.5px] border-ink px-4 font-mono text-sm font-semibold sm:px-6">
        {sourceLang.toUpperCase()}
        <span className="text-seal" aria-label={isEn ? 'to' : 'vers'}>
          →
        </span>
        {targetLang.toUpperCase()}
      </div>

      <ol
        aria-label={isEn ? 'Project progress' : 'Avancement du projet'}
        className="flex min-w-0 flex-1 overflow-x-auto"
      >
        {steps.map((s, i) => (
          <li
            key={s.key}
            className="flex shrink-0 items-center gap-2.5 border-r border-hairline px-3 py-2.5 last:border-r-0 sm:px-4"
          >
            <StepMark index={i + 1} state={s.state} />
            <span className="flex flex-col leading-tight">
              <span className={cn('text-sm font-medium', s.state === 'todo' && 'text-ink-soft')}>{s.label}</span>
              {s.key !== 'import' && s.key !== 'export' && s.total > 0 && (
                <span className="font-mono text-[11px] text-ink-soft">
                  {s.done}/{s.total}
                </span>
              )}
            </span>
            <span className="sr-only">
              {s.state === 'done'
                ? isEn
                  ? 'done'
                  : 'terminé'
                : s.state === 'partial'
                  ? isEn
                    ? 'in progress'
                    : 'en cours'
                  : isEn
                    ? 'to do'
                    : 'à faire'}
            </span>
          </li>
        ))}
      </ol>

      <div className="flex items-center gap-2 border-l-[1.5px] border-ink px-3 max-sm:w-full max-sm:flex-col max-sm:items-stretch max-sm:border-t-[1.5px] max-sm:border-l-0 max-sm:py-2">
        {onBatchProcess && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBatchProcess}
            disabled={!canBatchProcess || disabled}
            className="max-sm:w-full font-semibold border-seal text-seal hover:bg-seal hover:text-white transition-all shadow-sm"
            title={
              canBatchProcess
                ? isEn
                  ? 'Run OCR, AI translation and cleaning on the whole chapter'
                  : 'Lancer l’OCR, la traduction IA et le nettoyage sur tout le chapitre'
                : isEn
                  ? 'No pages available'
                  : 'Aucune planche disponible'
            }
          >
            {batchProcessing ? <Loader2 className="animate-spin size-3.5" aria-hidden="true" /> : <Sparkles className="size-3.5" aria-hidden="true" />}
            {batchProgressText ||
              (batchProcessing
                ? isEn
                  ? 'Processing chapter…'
                  : 'Traitement du chapitre…'
                : isEn
                  ? 'Translate the whole chapter'
                  : 'Traduire tout le chapitre')}
          </Button>
        )}

        <div ref={menuRef} className="relative max-sm:w-full">
          <div className="flex items-center rounded-sm bg-seal shadow-sm max-sm:w-full">
            <Button
              variant="seal"
              size="sm"
              onClick={() => onExport(selectedFormat)}
              disabled={!canExport || disabled || exporting}
              className="max-sm:flex-1 rounded-r-none border-r border-white/20"
              title={
                canExport
                  ? isEn
                    ? `Export the chapter as ${selectedFormat.toUpperCase()}`
                    : `Exporter le chapitre en ${selectedFormat.toUpperCase()}`
                  : isEn
                    ? 'Import pages before exporting'
                    : 'Importez des planches avant d’exporter'
              }
            >
              {exporting ? <Loader2 className="animate-spin size-3.5" aria-hidden="true" /> : <Download className="size-3.5" aria-hidden="true" />}
              <span>
                {isEn
                  ? `Export (${selectedFormat.toUpperCase()})`
                  : `Exporter (${selectedFormat.toUpperCase()})`}
              </span>
            </Button>
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              disabled={!canExport || disabled || exporting}
              className="h-8 px-2 text-seal-ink hover:bg-black/10 transition-colors rounded-r-sm flex items-center justify-center disabled:opacity-50 cursor-pointer"
              title={
                isEn
                  ? 'Choose the export format (CBZ, PDF, ZIP)'
                  : 'Choisir le format d’export (CBZ, PDF, ZIP)'
              }
            >
              <ChevronDown className="size-3.5" />
            </button>
          </div>

          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-64 rounded border border-hairline bg-paper shadow-2xl z-50 py-1 flex flex-col">
              <div className="px-3 py-1.5 border-b border-hairline text-[10px] font-bold text-ink-soft uppercase tracking-wider">
                {isEn ? 'Choose the output format' : 'Choisir le format de sortie'}
              </div>

              <button
                type="button"
                onClick={() => {
                  setSelectedFormat('cbz')
                  setIsMenuOpen(false)
                  onExport('cbz')
                }}
                className={cn(
                  'flex items-start gap-2.5 px-3 py-2 text-left hover:bg-muted transition-colors text-xs cursor-pointer',
                  selectedFormat === 'cbz' && 'bg-seal/10 font-bold'
                )}
              >
                <BookOpen className="size-4 text-seal shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-ink">Manga CBZ (.cbz)</div>
                  <div className="text-[11px] text-ink-soft">
                    {isEn
                      ? 'Recommended for e-readers & Tachiyomi/Mihon'
                      : 'Recommandé pour liseuses & Tachiyomi/Mihon'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedFormat('pdf')
                  setIsMenuOpen(false)
                  onExport('pdf')
                }}
                className={cn(
                  'flex items-start gap-2.5 px-3 py-2 text-left hover:bg-muted transition-colors text-xs cursor-pointer',
                  selectedFormat === 'pdf' && 'bg-seal/10 font-bold'
                )}
              >
                <FileText className="size-4 text-seal shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-ink">
                    {isEn ? 'PDF document (.pdf)' : 'Document PDF (.pdf)'}
                  </div>
                  <div className="text-[11px] text-ink-soft">
                    {isEn
                      ? 'All pages bound into a single file'
                      : 'Toutes les planches reliées en un seul fichier'}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSelectedFormat('zip')
                  setIsMenuOpen(false)
                  onExport('zip')
                }}
                className={cn(
                  'flex items-start gap-2.5 px-3 py-2 text-left hover:bg-muted transition-colors text-xs cursor-pointer',
                  selectedFormat === 'zip' && 'bg-seal/10 font-bold'
                )}
              >
                <Archive className="size-4 text-seal shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-ink">
                    {isEn ? 'ZIP archive (.zip)' : 'Archive ZIP (.zip)'}
                  </div>
                  <div className="text-[11px] text-ink-soft">
                    {isEn
                      ? 'Folder of high-definition PNG images'
                      : 'Dossier d’images PNG haute définition'}
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function StepMark({ index, state }: { index: number; state: PipelineStep['state'] }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-6 place-items-center rounded-full border-[1.5px] font-mono text-[11px] font-bold',
        state === 'done' && 'border-ink bg-ink text-sheet',
        state === 'partial' && 'border-seal text-seal',
        state === 'todo' && 'border-hairline text-ink-soft',
      )}
    >
      {state === 'done' ? '✓' : index}
    </span>
  )
}
