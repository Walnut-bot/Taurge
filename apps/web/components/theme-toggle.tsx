'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/lib/use-theme'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { effectiveTheme, toggle } = useTheme()

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'relative inline-flex size-8 items-center justify-center rounded-lg border border-hairline bg-sheet text-ink-soft hover:bg-paper hover:text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal cursor-pointer shadow-2xs',
        className
      )}
      title={effectiveTheme === 'dark' ? 'Passer en mode clair (Thème par défaut)' : 'Passer en mode sombre'}
      aria-label={effectiveTheme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
    >
      {effectiveTheme === 'dark' ? (
        <Sun className="size-4 text-amber-500 transition-transform" />
      ) : (
        <Moon className="size-4 text-seal transition-transform" />
      )}
    </button>
  )
}
