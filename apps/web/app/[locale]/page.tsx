import { ArrowRight } from 'lucide-react'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Logo, Seal } from '@/components/brand/logo'
import { LandingSpecimen } from '@/components/landing/specimen'
import { LanguageSwitcher } from '@/components/language-switcher'
import { buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { getTranslations, parseLocale } from '@/i18n/server'

interface Step {
  title: string
  body: string
}

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
  const steps = t.raw<Step[]>('steps')
  const features = t.raw<string[]>('features')

  return (
    <div className="min-h-dvh">
      <header className="w-full border-b-[1.5px] border-ink bg-sheet">
        <div className="flex h-16 w-full items-center justify-between px-6 lg:px-10">
          <Logo />
          <nav aria-label="Account" className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link href="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              {tNav('login')}
            </Link>
            <Link href="/register" className={buttonVariants({ size: 'sm' })}>
              {tNav('register')}
            </Link>
          </nav>
        </div>
      </header>

      <main id="contenu">
        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-20">
          <div className="flex flex-col justify-center">
            <p className="label-mono mb-5 flex items-center gap-2 text-ink-soft">
              <span className="inline-block h-px w-6 bg-seal" aria-hidden="true" />
              {t('tagline')}
            </p>
            <h1 className="text-[2.6rem] leading-[1.02] font-bold tracking-[-0.03em] text-balance sm:text-6xl">
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

        <section aria-labelledby="chaine" className="border-y-[1.5px] border-ink bg-sheet">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
              <h2 id="chaine" className="text-3xl font-bold tracking-tight">
                {t('pipelineTitle')}
              </h2>
              <p className="max-w-sm text-ink-soft">{t('pipelineIntro')}</p>
            </div>
            <ol className="grid border-t-[1.5px] border-l-[1.5px] border-ink sm:grid-cols-2 lg:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title} className="border-r-[1.5px] border-b-[1.5px] border-ink p-6">
                  <span className="font-mono text-sm text-seal">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-3 text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 leading-relaxed text-ink-soft">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t('featuresTitle')}</h2>
            <ul className="mt-5 flex flex-col gap-3">
              {features.map((feature) => (
                <li key={feature} className="flex gap-3">
                  <Seal className="mt-0.5 size-5 text-[0.65rem]">✓</Seal>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="tone border-[1.5px] border-dashed border-ink-soft p-6">
            <h2 className="text-2xl font-bold tracking-tight">{t('notYetTitle')}</h2>
            <p className="mt-3 leading-relaxed text-ink-soft">{t('notYetBody')}</p>
          </div>
        </section>
      </main>

    </div>
  )
}
