// 🚀 FEATURE BUILT FOR META GLOBAL AI DEVELOPER HACKATHON 2026.
'use client'

import { Link } from '@/i18n/navigation'
import { useTranslations } from '@/i18n/provider'

export function SiteFooter() {
  const t = useTranslations('Legal')
  const links = [
    { href: '/legal/privacy', label: t('privacy') },
    { href: '/legal/terms', label: t('terms') },
    { href: '/legal/refunds', label: t('refunds') },
    { href: '/legal/cookies', label: t('cookies') },
    { href: '/legal/legal-notice', label: t('legalNotice') },
  ]
  return (
    <footer className="mt-auto shrink-0 border-t border-hairline bg-paper">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm text-ink-soft sm:px-6">
        <span className="font-mono text-xs">
          Taurge · {new Date().getFullYear()} · {t('allRights')}
        </span>
        <nav aria-label={t('legalNotice')} className="flex flex-wrap gap-x-5 gap-y-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
