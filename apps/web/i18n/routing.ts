import { defaultLocale, LOCALE_COOKIE, locales } from './config'

/**
 * Équivalent de `defineRouting` (next-intl) : la déclaration du routing
 * internationalisé, partagée par le proxy et la navigation.
 */
export const routing = {
  locales,
  defaultLocale,
  localeCookie: { name: LOCALE_COOKIE },
  // La détection est assurée par notre proxy (cookie > géoloc >
  // Accept-Language) : voir `proxy.ts` et `i18n/detect.ts`.
  localeDetection: true,
} as const
