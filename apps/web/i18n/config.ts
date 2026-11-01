/**
 * Configuration i18n de Taurge (Section 43 du cahier des charges).
 *
 * Solution retenue : i18n native Next.js (App Router) — mêmes conventions
 * que next-intl (routing `/[locale]`, fichiers `messages/*.json`, cookie
 * `NEXT_LOCALE`), sans dépendance externe. La migration vers next-intl
 * reste possible : `routing`, `request` et `navigation` en reprennent
 * les noms et les formes.
 */

export const locales = ['fr', 'en'] as const

export type Locale = (typeof locales)[number]

/** Langue de repli (fallback) : le produit vise d'abord le marché francophone. */
export const defaultLocale: Locale = 'fr'

/** Cookie qui mémorise le choix manuel de l'utilisateur (voir Étape 3). */
export const LOCALE_COOKIE = 'NEXT_LOCALE'

export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 an

export function isLocale(value: string | null | undefined): value is Locale {
  return value === 'fr' || value === 'en'
}

/**
 * Pays considérés comme francophones pour la géolocalisation IP.
 * Codes ISO 3166-1 alpha-2, en majuscules.
 */
export const FRANCOPHONE_COUNTRIES: ReadonlySet<string> = new Set([
  'FR', // France
  'BE', // Belgique
  'CH', // Suisse
  'CA', // Canada (bilingue — le français y est langue officielle)
  'LU', 'MC', 'AD', // Luxembourg, Monaco, Andorre
  'BJ', 'BF', 'CI', 'SN', 'ML', 'TG', 'NE', 'GN', 'CM', 'GA', 'CG', 'CD',
  'MG', 'MU', 'SC', 'DJ', 'KM', 'GQ', 'HT', 'VU', // Afrique / océan Indien / Pacifique
  'GP', 'MQ', 'GF', 'RE', 'YT', 'NC', 'PF', 'BL', 'MF', 'WF', // Outre-mer FR
])
