'use client'

import { AppHeader } from '@/components/app-header'
import { buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { useTranslations } from '@/i18n/provider'

export default function LocaleNotFound() {
  const t = useTranslations('NotFound')
  return (
    <div className="min-h-dvh flex flex-col bg-paper text-ink">
      <AppHeader />
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-4">
          <p className="font-mono text-sm uppercase tracking-wider text-seal">{t('code')}</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h1>
          <p className="text-ink-soft text-sm sm:text-base">{t('body')}</p>
          <div className="pt-4">
            <Link href="/dashboard" className={buttonVariants({ variant: 'seal' })}>
              {t('backToProjects')}
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
