import {
  FRANCOPHONE_COUNTRIES,
  defaultLocale,
  isLocale,
  type Locale,
} from './config'

/**
 * Détection de la langue — fonctions pures, sans dépendance Next.js,
 * donc testables unitairement et exécutables dans le middleware (Edge).
 *
 * Ordre de priorité (du plus fort au plus faible) :
 *   1. Cookie `NEXT_LOCALE` — choix manuel de l'utilisateur : il ne doit
 *      JAMAIS être écrasé par la détection automatique (Étape 3).
 *   2. Géolocalisation IP — en-tête `x-vercel-ip-country` (Vercel) ou
 *      `cf-ipcountry` (Cloudflare). Pays francophone → `fr`, sinon `en`.
 *   3. En-tête `Accept-Language` du navigateur (Étape 1).
 *   4. Fallback : `fr`.
 */

export interface DetectionInput {
  cookieLocale?: string | null
  country?: string | null
  acceptLanguage?: string | null
}

/** Extrait un code pays exploitable depuis les en-têtes de géolocalisation. */
export function countryFromHeaders(
  getHeader: (name: string) => string | null,
): string | null {
  const country =
    getHeader('x-vercel-ip-country') ?? getHeader('cf-ipcountry')
  const normalized = country?.trim().toUpperCase()
  return normalized && /^[A-Z]{2}$/.test(normalized) ? normalized : null
}

export function localeFromCountry(country: string | null | undefined): Locale | null {
  if (!country) return null
  return FRANCOPHONE_COUNTRIES.has(country.toUpperCase()) ? 'fr' : 'en'
}

/**
 * Analyse `Accept-Language` en respectant les poids `q`
 * (ex : `fr-CA,fr;q=0.9,en;q=0.8`) et ne retient que `fr` / `en`.
 */
export function localeFromAcceptLanguage(
  header: string | null | undefined,
): Locale | null {
  if (!header) return null

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';')
      const qParam = params.find((p) => p.trim().startsWith('q='))
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1
      return { tag: tag.trim().toLowerCase(), q: Number.isNaN(q) ? 0 : q }
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q)

  for (const { tag } of ranked) {
    const primary = tag.split('-')[0]
    if (isLocale(primary)) return primary
    if (tag === '*') return defaultLocale
  }
  return null
}

export function detectLocale(input: DetectionInput): Locale {
  if (isLocale(input.cookieLocale)) return input.cookieLocale
  return (
    localeFromCountry(input.country) ??
    localeFromAcceptLanguage(input.acceptLanguage) ??
    defaultLocale
  )
}
