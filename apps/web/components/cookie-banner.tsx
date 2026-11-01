// 🚀 FEATURE BUILT FOR META GLOBAL AI DEVELOPER HACKATHON 2026.
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { useTranslations } from '@/i18n/provider'

export const COOKIE_CONSENT_KEY = 'taurge_cookie_consent'

export type CookieConsent = 'accepted' | 'refused'

export function readCookieConsent(): CookieConsent | null {
  if (typeof window === 'undefined') return null
  const value = window.localStorage.getItem(COOKIE_CONSENT_KEY)
  return value === 'accepted' || value === 'refused' ? value : null
}

export function CookieBanner() {
  const t = useTranslations('Legal')
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(readCookieConsent() === null)
  }, [])

  if (!visible) return null

  function choose(value: CookieConsent) {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, value)
    window.dispatchEvent(new CustomEvent('taurge:cookie-consent', { detail: value }))
    setVisible(false)
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="cookie-title"
      className="fixed inset-x-0 bottom-0 z-50 border-t-[1.5px] border-ink bg-sheet p-4 shadow-xl sm:p-5"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 lg:flex-row lg:items-center">
        <div className="min-w-0 flex-1">
          <h2 id="cookie-title" className="font-semibold">{t('cookieTitle')}</h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t('cookieBody')}</p>
          <Link href="/legal/cookies" className="mt-1 inline-block text-sm font-medium text-ink underline underline-offset-4 hover:decoration-seal">
            {t('learnMore')}
          </Link>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="outline" size="lg" onClick={() => choose('refused')} className="min-w-32">
            {t('refuse')}
          </Button>
          <Button variant="seal" size="lg" onClick={() => choose('accepted')} className="min-w-32">
            {t('accept')}
          </Button>
        </div>
      </div>
    </div>
  )
}
