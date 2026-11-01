'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { Locale } from './config'
import { createTranslator, type Messages, type Translator } from './translator'

/**
 * Équivalent client de `NextIntlClientProvider` (next-intl).
 * Fournit `useLocale()` et `useTranslations(namespace)` aux Client Components.
 */

interface IntlContextValue {
  locale: Locale
  messages: Messages
}

const IntlContext = createContext<IntlContextValue | null>(null)

export function IntlProvider({
  locale,
  messages,
  children,
}: IntlContextValue & { children: ReactNode }) {
  return (
    <IntlContext.Provider value={{ locale, messages }}>
      {children}
    </IntlContext.Provider>
  )
}

function useIntlContext(): IntlContextValue {
  const context = useContext(IntlContext)
  if (!context) {
    throw new Error('useLocale/useTranslations doivent être utilisés sous <IntlProvider>.')
  }
  return context
}

export function useLocale(): Locale {
  return useIntlContext().locale
}

export function useMessages(): Messages {
  return useIntlContext().messages
}

export function useTranslations(namespace?: string): Translator {
  const { messages } = useIntlContext()
  return createTranslator(messages, namespace)
}
