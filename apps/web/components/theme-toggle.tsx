'use client'

import { Sun, Moon } from 'lucide-react'
import { useTranslations } from '@/i18n/provider'
import { useTheme } from '@/lib/use-theme'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { effectiveTheme, toggle } = useTheme()
  const t = useTranslations('Nav')
  const label = effectiveTheme === 'dark' ? t('lightMode') : t('darkMode')

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'relative inline-flex size-8 items-center justify-center rounded-lg border border-hairline bg-sheet text-ink-soft hover:bg-paper hover:text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal cursor-pointer shadow-2xs',
        className
      )}
      title={label}
      aria-label={label}
    >
      {effectiveTheme === 'dark' ? (
        <Sun className="size-4 text-amber-500 transition-transform" />
      ) : (
        <Moon className="size-4 text-seal transition-transform" />
      )}
    </button>
  )
}
