'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname as useNextPathname, useRouter } from 'next/navigation'
import { Check, ChevronDown, Globe } from 'lucide-react'
import {
  locales,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from '@/i18n/config'
import { useLocale, useTranslations } from '@/i18n/provider'
import { cn } from '@/lib/utils'

/**
 * Sélecteur de langue discret (Étape 3).
 *
 * Le choix est volontairement explicite et persistant :
 *  1. on écrit le cookie `NEXT_LOCALE` (1 an) — le middleware le lit en
 *     priorité 1 et ne le remplacera jamais par la détection auto ;
 *  2. on navigue vers la même page préfixée par la nouvelle locale.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale()
  const t = useTranslations('Language')
  const router = useRouter()
  const pathname = useNextPathname() ?? '/'
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function switchLocale(next: Locale) {
    setOpen(false)
    if (next === locale) return
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`
    const segments = pathname.split('/')
    segments[1] = next
    router.replace(segments.join('/') || `/${next}`)
    router.refresh()
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('label')}
        title={t('label')}
        suppressHydrationWarning
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 items-center gap-1.5 rounded-full border border-hairline bg-sheet px-2.5 text-xs font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal"
      >
        <Globe aria-hidden="true" className="size-3.5" />
        <span className="font-mono uppercase">{locale}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn('size-3 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t('label')}
          className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-hairline bg-sheet p-1.5 shadow-xl ring-1 ring-black/5"
        >
          {locales.map((candidate) => {
            const active = candidate === locale
            return (
              <li key={candidate}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  aria-label={t('switchTo', { language: t(candidate) })}
                  onClick={() => switchLocale(candidate)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors',
                    active ? 'font-semibold text-ink' : 'text-ink-soft hover:bg-paper hover:text-ink',
                  )}
                >
                  <span>
                    {t(candidate)}
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-wider">
                      {candidate}
                    </span>
                  </span>
                  {active && <Check aria-hidden="true" className="size-4 text-seal" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
