/**
 * Light / dark theme management.
 * – Saves the choice in localStorage ('taurge_theme')
 * – Applies the .dark class on <html>
 * – Respects the system theme when the user hasn't chosen yet
 *
 * NOTE: this file has NO 'use client' directive since it is also
 * imported in layout.tsx (Server Component) for `themeScript`.
 */

export type Theme = 'light' | 'dark' | 'system'

export const THEME_KEY = 'taurge_theme'

export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getSavedTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return (localStorage.getItem(THEME_KEY) as Theme) ?? 'light'
}

export function getEffectiveTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'dark') return 'dark'
  if (theme === 'light') return 'light'
  return theme === 'system' ? getSystemTheme() : 'light'
}

export function applyTheme(theme: Theme) {
  const effective = getEffectiveTheme(theme)
  document.documentElement.classList.toggle('dark', effective === 'dark')
}

export function saveAndApplyTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme)
  applyTheme(theme)
  // Notify the other tabs
  window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue: theme }))
}

/** Inline script injected into <head> to avoid the white flash on load. Defaults to light. */
export const themeScript = `
(function(){
  var t = localStorage.getItem('taurge_theme') || 'light';
  var d = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (d) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
})();
`
