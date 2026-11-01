'use client'

import NextLink from 'next/link'
import { usePathname as useNextPathname } from 'next/navigation'
import type { ComponentProps } from 'react'
import { isLocale, type Locale } from './config'
import { useLocale } from './provider'

/**
 * Équivalent de `createNavigation` (next-intl) : des liens et des chemins
 * qui connaissent la locale courante. Les hrefs internes s'écrivent sans
 * préfixe (`/dashboard`) et la locale est ajoutée automatiquement.
 */

export function localizeHref(href: string, locale: Locale): string {
  if (!href.startsWith('/') || href.startsWith('//')) return href
  const firstSegment = href.split('/')[1]
  if (isLocale(firstSegment)) return href
  return href === '/' ? `/${locale}` : `/${locale}${href}`
}

export function stripLocale(pathname: string): string {
  const segments = pathname.split('/')
  if (isLocale(segments[1])) {
    const rest = `/${segments.slice(2).join('/')}`
    return rest === '/' ? '/' : rest.replace(/\/$/, '')
  }
  return pathname
}

export function getLocaleFromPathname(pathname: string): Locale | null {
  const first = pathname.split('/')[1]
  return isLocale(first) ? first : null
}

type LinkProps = Omit<ComponentProps<typeof NextLink>, 'href'> & {
  href: string
}

export function Link({ href, ...props }: LinkProps) {
  const locale = useLocale()
  return <NextLink href={localizeHref(href, locale)} {...props} />
}

/** Pathname sans le préfixe de locale (ex : `/fr/dashboard` → `/dashboard`). */
export function usePathname(): string {
  const pathname = useNextPathname() ?? '/'
  return stripLocale(pathname)
}
