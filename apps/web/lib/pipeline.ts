import type { Page, ProjectDetail } from './types'

export type PageStage = 'extracted' | 'ocr' | 'translated' | 'cleaned'

function detectLocale(explicit?: string): 'fr' | 'en' {
  if (explicit === 'en' || explicit === 'fr') return explicit
  if (typeof window !== 'undefined') {
    const cookie = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('NEXT_LOCALE='))
      ?.split('=')[1]
    if (cookie === 'en' || cookie === 'fr') return cookie
    const segment = window.location.pathname.split('/')[1]
    if (segment === 'en') return 'en'
  }
  return 'fr'
}

export function pageStage(page: Page): PageStage {
  if (page.ocr_blocks.length === 0) return 'extracted'
  const allTranslated = page.ocr_blocks.every((b) => b.translation !== null)
  if (!allTranslated) return 'ocr'
  if (!page.cleaned_at) return 'translated'
  return 'cleaned'
}

export const PAGE_STAGE_LABEL_EN: Record<PageStage, string> = {
  extracted: 'To read',
  ocr: 'To translate',
  translated: 'To clean',
  cleaned: 'Ready',
}

export const PAGE_STAGE_LABEL_FR: Record<PageStage, string> = {
  extracted: 'À lire',
  ocr: 'À traduire',
  translated: 'À nettoyer',
  cleaned: 'Prête',
}

export const PAGE_STAGE_LABEL = PAGE_STAGE_LABEL_EN

export function getPageStageLabel(stage: PageStage, locale?: string): string {
  return (detectLocale(locale) === 'en' ? PAGE_STAGE_LABEL_EN : PAGE_STAGE_LABEL_FR)[stage]
}

export type StepState = 'done' | 'partial' | 'todo'

export type PipelineStep = {
  key: string
  label: string
  done: number
  total: number
  state: StepState
}

function stateOf(done: number, total: number): StepState {
  if (total === 0 || done === 0) return 'todo'
  if (done >= total) return 'done'
  return 'partial'
}

export function projectPipeline(project: ProjectDetail, locale?: string): PipelineStep[] {
  const isEn = detectLocale(locale) === 'en'
  const pages = project.pages
  const pageCount = pages.length
  const filesWithPages = project.files.filter((f) =>
    pages.some((p) => p.source_file_id === f.id),
  ).length
  const ocrDone = pages.filter((p) => p.ocr_blocks.length > 0).length
  const blocks = pages.flatMap((p) => p.ocr_blocks)
  const translated = blocks.filter((b) => b.translation).length
  const cleaned = pages.filter((p) => p.cleaned_at).length

  return [
    {
      key: 'import',
      label: 'Import',
      done: project.files.length,
      total: Math.max(project.files.length, 1),
      state: project.files.length > 0 ? 'done' : 'todo',
    },
    {
      key: 'pages',
      label: 'Pages',
      done: filesWithPages,
      total: project.files.length,
      state: stateOf(filesWithPages, project.files.length),
    },
    { key: 'ocr', label: 'OCR', done: ocrDone, total: pageCount, state: stateOf(ocrDone, pageCount) },
    {
      key: 'translate',
      label: isEn ? 'Translation' : 'Traduction',
      done: translated,
      total: blocks.length,
      state: stateOf(translated, blocks.length),
    },
    {
      key: 'clean',
      label: isEn ? 'Cleaning' : 'Nettoyage',
      done: cleaned,
      total: pageCount,
      state: stateOf(cleaned, pageCount),
    },
    {
      key: 'export',
      label: 'Export',
      done: project.exports.length,
      total: Math.max(project.exports.length, 1),
      state: project.exports.length > 0 ? 'done' : 'todo',
    },
  ]
}

export function safeFilename(name: string) {
  return name.replace(/[^A-Za-z0-9_-]+/g, '_')
}
