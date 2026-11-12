export const LANGUAGES = [
  { code: 'ja', label: 'Japanese', native: '日本語' },
  { code: 'ko', label: 'Korean', native: '한국어' },
  { code: 'zh', label: 'Chinese', native: '中文' },
  { code: 'zh-Hans', label: 'Chinese (Simplified)', native: '简体中文' },
  { code: 'zh-Hant', label: 'Chinese (Traditional)', native: '繁體中文' },
  { code: 'en', label: 'English', native: 'English' },
  { code: 'es', label: 'Spanish', native: 'Español' },
  { code: 'pt', label: 'Portuguese', native: 'Português' },
  { code: 'fr', label: 'French', native: 'Français' },
  { code: 'de', label: 'German', native: 'Deutsch' },
] as const

export const CONTENT_TYPES = [
  { value: 'manga', label: 'Manga', hint: 'Right-to-left reading', defaultLang: 'ja' },
  { value: 'manhwa', label: 'Manhwa', hint: 'Korean, often vertical', defaultLang: 'ko' },
  { value: 'manhua', label: 'Manhua', hint: 'Chinese', defaultLang: 'zh' },
  { value: 'webtoon', label: 'Webtoon', hint: 'Vertical scroll', defaultLang: 'ko' },
  { value: 'comic', label: 'Comic', hint: 'Left-to-right', defaultLang: 'en' },
  { value: 'autre', label: 'Other', hint: 'Everything else', defaultLang: 'en' },
] as const

const LANGUAGE_ALIASES: Record<string, string> = {
  jp: 'ja', zh_Hans: 'zh-Hans', zh_hans: 'zh-Hans', 'zh-cn': 'zh-Hans',
  zh_Hant: 'zh-Hant', zh_hant: 'zh-Hant', 'zh-tw': 'zh-Hant', 'pt-br': 'pt', 'en-us': 'en',
}

export function languageLabel(code: string) {
  const canonical = LANGUAGE_ALIASES[code] ?? code
  return LANGUAGES.find((l) => l.code === canonical)?.label ?? code
}

export function contentTypeLabel(value: string) {
  return CONTENT_TYPES.find((c) => c.value === value)?.label ?? value
}

export const ACCEPTED_UPLOAD = '.pdf,.png,.jpg,.jpeg,.webp,.zip,.cbz'
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
