import { isLocale, type Locale } from './config'
import { getMessages } from './messages'
import { createTranslator, type Translator } from './translator'

export { getMessages }

/** Valide le segment `[locale]` d'une route ; renvoie null si non supporté. */
export function parseLocale(value: string): Locale | null {
  return isLocale(value) ? value : null
}

/** Équivalent serveur de `getTranslations` (next-intl) pour les Server Components. */
export function getTranslations(locale: Locale, namespace?: string): Translator {
  return createTranslator(getMessages(locale), namespace)
}
