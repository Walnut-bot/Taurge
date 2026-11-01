'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/use-theme'

/**
 * Light / dark toggle button.
 * Usable in any navigation bar or form header.
 *
 * Safe against hydration mismatches (waits for mount before
 * resolving the effective client-side theme).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false)
  const { effectiveTheme, toggle } = useTheme()

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    // Neutral placeholder identical between SSR and client initial hydration
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        disabled
        suppressHydrationWarning
        className={[
          'flex size-9 items-center justify-center rounded-full border border-hairline',
          'bg-sheet text-ink-soft opacity-60 pointer-events-none',
          className ?? '',
        ].join(' ')}
      >
        <span className="size-4 block" />
      </button>
    )
  }

  const isDark = effectiveTheme === 'dark'

  return (
    <button
      type="button"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
      onClick={toggle}
      suppressHydrationWarning
      className={[
        'flex size-9 items-center justify-center rounded-full border border-hairline',
        'bg-sheet text-ink-soft',
        'hover:border-ink hover:text-ink hover:bg-paper',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal',
        'transition-colors duration-200',
        className ?? '',
      ].join(' ')}
    >
      {isDark ? (
        <Sun aria-hidden="true" className="size-4" />
      ) : (
        <Moon aria-hidden="true" className="size-4" />
      )}
    </button>
  )
}
