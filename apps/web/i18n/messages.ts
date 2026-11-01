import fr from '../messages/fr.json'
import en from '../messages/en.json'
import type { Locale } from './config'
import type { Messages } from './translator'

/** Équivalent de `i18n/request.ts` chez next-intl : charge le catalogue d'une locale. */
export function getMessages(locale: Locale): Messages {
  return (locale === 'en' ? en : fr) as Messages
}
