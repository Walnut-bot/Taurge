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

export const LANGUAGES_EN = [
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

export const LANGUAGES_FR = [
  { code: 'ja', label: 'Japonais', native: '日本語' },
  { code: 'ko', label: 'Coréen', native: '한국어' },
  { code: 'zh', label: 'Chinois', native: '中文' },
  { code: 'zh-Hans', label: 'Chinois (simplifié)', native: '简体中文' },
  { code: 'zh-Hant', label: 'Chinois (traditionnel)', native: '繁體中文' },
  { code: 'en', label: 'Anglais', native: 'English' },
  { code: 'es', label: 'Espagnol', native: 'Español' },
  { code: 'pt', label: 'Portugais', native: 'Português' },
  { code: 'fr', label: 'Français', native: 'Français' },
  { code: 'de', label: 'Allemand', native: 'Deutsch' },
] as const

export const LANGUAGES = LANGUAGES_EN

export function getLanguages(locale?: string) {
  return detectLocale(locale) === 'en' ? LANGUAGES_EN : LANGUAGES_FR
}

export const CONTENT_TYPES_EN = [
  { value: 'manga', label: 'Manga', hint: 'Right-to-left reading', defaultLang: 'ja' },
  { value: 'manhwa', label: 'Manhwa', hint: 'Korean, often vertical', defaultLang: 'ko' },
  { value: 'manhua', label: 'Manhua', hint: 'Chinese', defaultLang: 'zh' },
  { value: 'webtoon', label: 'Webtoon', hint: 'Vertical scroll', defaultLang: 'ko' },
  { value: 'comic', label: 'Comic', hint: 'Left-to-right', defaultLang: 'en' },
  { value: 'autre', label: 'Other', hint: 'Everything else', defaultLang: 'en' },
] as const

export const CONTENT_TYPES_FR = [
  { value: 'manga', label: 'Manga', hint: 'Lecture de droite à gauche', defaultLang: 'ja' },
  { value: 'manhwa', label: 'Manhwa', hint: 'Coréen, souvent vertical', defaultLang: 'ko' },
  { value: 'manhua', label: 'Manhua', hint: 'Chinois', defaultLang: 'zh' },
  { value: 'webtoon', label: 'Webtoon', hint: 'Défilement vertical', defaultLang: 'ko' },
  { value: 'comic', label: 'Comic / BD', hint: 'Lecture de gauche à droite', defaultLang: 'en' },
  { value: 'autre', label: 'Autre', hint: 'Tout autre format', defaultLang: 'en' },
] as const

export const CONTENT_TYPES = CONTENT_TYPES_EN

export function getContentTypes(locale?: string) {
  return detectLocale(locale) === 'en' ? CONTENT_TYPES_EN : CONTENT_TYPES_FR
}

const LANGUAGE_ALIASES: Record<string, string> = {
  jp: 'ja',
  zh_Hans: 'zh-Hans',
  zh_hans: 'zh-Hans',
  'zh-cn': 'zh-Hans',
  zh_Hant: 'zh-Hant',
  zh_hant: 'zh-Hant',
  'zh-tw': 'zh-Hant',
  'pt-br': 'pt',
  'en-us': 'en',
}

export function languageLabel(code: string, locale?: string) {
  const canonical = LANGUAGE_ALIASES[code] ?? code
  const list = getLanguages(locale)
  return list.find((l) => l.code === canonical)?.label ?? code
}

export function contentTypeLabel(value: string, locale?: string) {
  const list = getContentTypes(locale)
  return list.find((c) => c.value === value)?.label ?? value
}

export const ACCEPTED_UPLOAD = '.pdf,.png,.jpg,.jpeg,.webp,.zip,.cbz'
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

export function formatSize(bytes: number, locale?: string) {
  const isEn = detectLocale(locale) === 'en'
  if (bytes < 1024) return `${bytes} ${isEn ? 'B' : 'o'}`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ${isEn ? 'KB' : 'Ko'}`
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${isEn ? 'MB' : 'Mo'}`
}

export function formatDate(iso: string, locale?: string) {
  const tag = detectLocale(locale) === 'en' ? 'en-US' : 'fr-FR'
  return new Date(iso).toLocaleDateString(tag, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateTime(iso: string, locale?: string) {
  const tag = detectLocale(locale) === 'en' ? 'en-US' : 'fr-FR'
  return new Date(iso).toLocaleString(tag, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
