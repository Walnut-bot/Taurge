import {
  ArrowRight,
  Sparkles,
  Eraser,
  Type,
  SlidersHorizontal,
  Users,
  Download,
  Zap,
  Globe,
  FileCheck,
  Languages,
} from 'lucide-react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Logo } from '@/components/brand/logo'
import { LandingSpecimen } from '@/components/landing/specimen'
import { LanguageSwitcher } from '@/components/language-switcher'
import { buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { getTranslations, parseLocale } from '@/i18n/server'

interface Advantage {
  badge: string
  title: string
  body: string
}

const ADVANTAGE_ICONS = [
  Sparkles,
  Eraser,
  Type,
  SlidersHorizontal,
  Users,
  Download,
]

const CTA_BADGE_ICONS = [
  Zap,
  Globe,
  FileCheck,
  Languages,
]

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const locale = parseLocale((await params).locale)
  if (!locale) return {}
  const t = getTranslations(locale, 'Home')
  return { title: { absolute: t('metaTitle') } }
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const locale = parseLocale((await params).locale)
  if (!locale) notFound()

  const t = getTranslations(locale, 'Home')
  const tNav = getTranslations(locale, 'Nav')
  const advantages = t.raw<Advantage[]>('advantages')
  const ctaBadges = t.raw<string[]>('ctaBadges')

  return (
    <div className="min-h-dvh">
      <header className="w-full border-b-[1.5px] border-ink bg-sheet">
        <div className="flex h-16 w-full items-center justify-between gap-2 px-4 sm:px-6 lg:px-10">
          <Logo />
          <nav aria-label="Account" className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher />
            <Link href="/login" className={`${buttonVariants({ variant: 'ghost', size: 'sm' })} max-sm:hidden`}>
              {tNav('login')}
            </Link>
            <Link href="/register" className={buttonVariants({ size: 'sm' })}>
              {tNav('register')}
            </Link>
          </nav>
        </div>
      </header>

      <main id="contenu">
        {/* Section Hero */}
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-20">
          <div className="flex flex-col justify-center">
            <p className="label-mono mb-5 flex items-center gap-2 text-ink-soft">
              <span className="inline-block h-px w-6 bg-seal" aria-hidden="true" />
              {t('tagline')}
            </p>
            <h1 className="text-4xl leading-[1.05] font-bold tracking-[-0.03em] text-balance sm:text-6xl">
              {t('titleStart')}{' '}
              <span className="relative whitespace-nowrap">
                {t('titleHighlight')}
                <span className="absolute inset-x-0 -bottom-1 h-[0.18em] bg-seal" aria-hidden="true" />
              </span>
              .
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-pretty text-ink-soft">
              {t('subtitle')}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/register" className={buttonVariants({ variant: 'seal', size: 'lg' })}>
                {t('start')}
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link href="/login" className={buttonVariants({ variant: 'link', size: 'lg' })}>
                {t('alreadyHaveAccount')}
              </Link>
            </div>
          </div>

          <LandingSpecimen />
        </section>

        {/* Section Atouts / Fonctionnalités clés */}
        <section aria-labelledby="atouts" className="border-t-[1.5px] border-ink bg-sheet py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="mb-12 max-w-2xl text-center mx-auto">
              <p className="label-mono mb-3 inline-flex items-center gap-2 text-seal">
                <span className="inline-block h-px w-6 bg-seal" aria-hidden="true" />
                Studio de localisation nouvelle génération
                <span className="inline-block h-px w-6 bg-seal" aria-hidden="true" />
              </p>
              <h2 id="atouts" className="text-3xl sm:text-4xl font-bold tracking-tight text-balance">
                {t('whyTitle')}
              </h2>
              <p className="mt-4 text-base sm:text-lg leading-relaxed text-ink-soft text-pretty">
                {t('whySubtitle')}
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {advantages.map((adv, idx) => {
                const Icon = ADVANTAGE_ICONS[idx % ADVANTAGE_ICONS.length]
                return (
                  <div
                    key={adv.title}
                    className="panel group relative flex flex-col justify-between p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:border-seal"
                  >
                    <div>
                      <div className="mb-5 flex items-center justify-between">
                        <div className="grid size-11 place-items-center rounded-lg bg-seal-wash text-seal border border-seal/30 transition-colors group-hover:bg-seal group-hover:text-seal-ink">
                          <Icon className="size-5" aria-hidden="true" />
                        </div>
                        <span className="label-mono rounded-full border border-hairline bg-sheet px-2.5 py-0.5 text-ink-soft">
                          {adv.badge}
                        </span>
                      </div>
                      <h3 className="text-xl font-bold tracking-tight text-ink">
                        {adv.title}
                      </h3>
                      <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">
                        {adv.body}
                      </p>
                    </div>
                    <div className="mt-5 flex items-center gap-1.5 text-xs font-mono text-seal opacity-0 transition-opacity group-hover:opacity-100">
                      <span>Inclus dans Taurge</span>
                      <span aria-hidden="true">→</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Section Call-To-Action finale */}
        <section className="border-t-[1.5px] border-ink bg-paper py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="tone relative overflow-hidden panel p-8 sm:p-12 lg:p-16 text-center border-2 border-ink shadow-2xl">
              <div className="relative z-10 mx-auto max-w-3xl">
                <span className="label-mono inline-block rounded-full bg-seal px-3 py-1 font-bold text-seal-ink shadow-sm mb-6">
                  {t('tagline')}
                </span>
                <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-balance">
                  {t('ctaTitle')}
                </h2>
                <p className="mt-5 text-base sm:text-xl leading-relaxed text-ink-soft text-pretty max-w-2xl mx-auto">
                  {t('ctaSubtitle')}
                </p>

                <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
                  <Link
                    href="/register"
                    className={`${buttonVariants({ variant: 'seal', size: 'lg' })} text-base px-7 py-6 font-semibold shadow-lg hover:shadow-xl`}
                  >
                    {t('ctaButton')}
                    <ArrowRight className="size-5 ml-1" aria-hidden="true" />
                  </Link>
                  <Link
                    href="/login"
                    className={`${buttonVariants({ variant: 'outline', size: 'lg' })} text-base px-6 py-6`}
                  >
                    {t('alreadyHaveAccount')}
                  </Link>
                </div>

                <div className="mt-10 pt-8 border-t border-hairline/60 grid grid-cols-2 gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-6 text-xs text-ink-soft font-mono">
                  {ctaBadges.map((badge, idx) => {
                    const BadgeIcon = CTA_BADGE_ICONS[idx % CTA_BADGE_ICONS.length]
                    return (
                      <div key={badge} className="flex items-center gap-2 justify-center">
                        <BadgeIcon className="size-4 text-seal shrink-0" aria-hidden="true" />
                        <span>{badge}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
