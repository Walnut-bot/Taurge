'use client'

import { Link } from '@/i18n/navigation'
import { useTranslations } from '@/i18n/provider'
import { cn } from '@/lib/utils'

export function Seal({ className, children = '訳' }: { className?: string; children?: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-grid size-7 shrink-0 -rotate-4 place-items-center rounded-[2px] bg-seal text-[0.95rem] leading-none font-bold text-seal-ink',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Logo({ href = '/', className }: { href?: string; className?: string }) {
  const t = useTranslations('Nav')
  return (
    <Link
      href={href}
      className={cn('group inline-flex items-center gap-2.5 text-ink', className)}
      aria-label={t('home')}
      suppressHydrationWarning
    >
      <Seal className="transition-transform duration-200 group-hover:rotate-0" />
      <span className="text-lg font-bold tracking-tight">Taurge</span>
    </Link>
  )
}
