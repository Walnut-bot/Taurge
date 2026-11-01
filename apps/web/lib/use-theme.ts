'use client'

import { useEffect, useState, useCallback } from 'react'
import { type Theme, getSavedTheme, saveAndApplyTheme, applyTheme, getEffectiveTheme } from '@/lib/theme'

/**
 * Hook to read and change the theme from any component.
 * Returns [current theme, light↔dark toggle function].
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>('system')

  useEffect(() => {
    // Initialize from localStorage
    const saved = getSavedTheme()
    setTheme(saved)
    applyTheme(saved)

    // Listen for changes (other tabs + system preference)
    function onStorage(e: StorageEvent) {
      if (e.key === 'taurge_theme') {
        const next = (e.newValue as Theme) ?? 'system'
        setTheme(next)
        applyTheme(next)
      }
    }
    function onSystemChange() {
      const current = getSavedTheme()
      if (current === 'system') applyTheme('system')
    }

    window.addEventListener('storage', onStorage)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', onSystemChange)
    return () => {
      window.removeEventListener('storage', onStorage)
      mq.removeEventListener('change', onSystemChange)
    }
  }, [])

  const toggle = useCallback(() => {
    const effective = getEffectiveTheme(theme)
    const next: Theme = effective === 'dark' ? 'light' : 'dark'
    setTheme(next)
    saveAndApplyTheme(next)
  }, [theme])

  return { theme, effectiveTheme: getEffectiveTheme(theme), toggle }
}
