// 🚀 FEATURE BUILT FOR META GLOBAL AI DEVELOPER HACKATHON 2026.
'use client'

import { useEffect, useState } from 'react'
import { Analytics } from '@vercel/analytics/next'
import { readCookieConsent } from '@/components/cookie-banner'

/** Vercel Analytics chargé uniquement après consentement explicite. */
export function AnalyticsGate() {
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    setAccepted(readCookieConsent() === 'accepted')
    function onConsent(event: Event) {
      setAccepted((event as CustomEvent<string>).detail === 'accepted')
    }
    window.addEventListener('taurge:cookie-consent', onConsent)
    return () => window.removeEventListener('taurge:cookie-consent', onConsent)
  }, [])

  if (process.env.NODE_ENV !== 'production' || !accepted) return null
  return <Analytics />
}
