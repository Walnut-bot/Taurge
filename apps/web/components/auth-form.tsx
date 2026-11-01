'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Button } from '@/components/ui/button'
import { FormError, Input, Label } from '@/components/ui/field'
import { ThemeToggle } from '@/components/theme-toggle'
import { Link, localizeHref } from '@/i18n/navigation'
import { useLocale, useTranslations } from '@/i18n/provider'
import { IS_DEMO, api } from '@/lib/api'

type Mode = 'login' | 'register'

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('Auth')
  const params = useSearchParams()
  const justRegistered = mode === 'login' && params.get('registered') === '1'
  const [email, setEmail] = useState(IS_DEMO && mode === 'login' ? 'demo@taurge.app' : '')
  const [password, setPassword] = useState(IS_DEMO && mode === 'login' ? 'demodemo' : '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [newsletter, setNewsletter] = useState(false)

  const copy =
    mode === 'login'
      ? {
          title: t('loginTitle'),
          sub: t('loginSubtitle'),
          submit: t('loginSubmit'),
          alt: { text: t('noAccount'), link: t('createAccount'), href: '/register' },
        }
      : {
          title: t('registerTitle'),
          sub: t('registerSubtitle'),
          submit: t('registerSubmit'),
          alt: { text: t('alreadyRegistered'), link: t('loginSubmit'), href: '/login' },
        }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (mode === 'register' && password.length < 8) {
      setError(t('passwordTooShort'))
      return
    }
    if (mode === 'register' && (!acceptedTerms || !ageConfirmed)) {
      setError(t('consentRequired'))
      return
    }
    setPending(true)
    try {
      if (mode === 'login') {
        await api.login(email.trim(), password)
        router.push(localizeHref('/dashboard', locale))
      } else {
        await api.register(email.trim(), password, {
          accepted_terms: acceptedTerms,
          age_confirmed: ageConfirmed,
          newsletter_opt_in: newsletter,
        })
        router.push(`${localizeHref('/login', locale)}?registered=1`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('genericError'))
      setPending(false)
    }
  }

  return (
    <div className="grid min-h-[calc(100dvh-2rem)] lg:grid-cols-[1fr_minmax(0,0.85fr)]">
      <main id="contenu" className="flex flex-col px-4 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-bold tracking-tight">{copy.title}</h1>
          <p className="mt-2 text-ink-soft">{copy.sub}</p>

          {justRegistered && (
            <p role="status" className="mt-6 border-l-2 border-ok bg-ok-wash px-3 py-2 text-sm text-ok">
              {t('accountCreated')}
            </p>
          )}

          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? 'auth-error' : undefined}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={mode === 'register' ? 'pw-hint' : undefined}
              />
              {mode === 'register' && (
                <p id="pw-hint" className="text-xs text-ink-soft">
                  {t('passwordHint')}
                </p>
              )}
            </div>
            {mode === 'register' && (
              <fieldset className="flex flex-col gap-3 text-sm">
                <label htmlFor="consent-terms" className="flex cursor-pointer items-start gap-2.5 leading-relaxed">
                  <input
                    id="consent-terms"
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-seal"
                  />
                  <span>
                    {t('acceptTerms')}{' '}
                    <Link href="/legal/terms" className="font-medium underline underline-offset-4 hover:decoration-seal">CGU</Link>
                    {' · '}
                    <Link href="/legal/privacy" className="font-medium underline underline-offset-4 hover:decoration-seal">Confidentialité</Link>
                  </span>
                </label>
                <label htmlFor="consent-age" className="flex cursor-pointer items-start gap-2.5 leading-relaxed">
                  <input
                    id="consent-age"
                    type="checkbox"
                    checked={ageConfirmed}
                    onChange={(e) => setAgeConfirmed(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-seal"
                  />
                  <span>{t('confirmAge')}</span>
                </label>
                <label htmlFor="consent-newsletter" className="flex cursor-pointer items-start gap-2.5 leading-relaxed text-ink-soft">
                  <input
                    id="consent-newsletter"
                    type="checkbox"
                    checked={newsletter}
                    onChange={(e) => setNewsletter(e.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-seal"
                  />
                  <span>{t('newsletter')}</span>
                </label>
              </fieldset>
            )}
            <FormError id="auth-error">{error}</FormError>
            <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {copy.submit}
            </Button>
          </form>

          <p className="mt-8 text-sm text-ink-soft">
            {copy.alt.text}{' '}
            <Link href={copy.alt.href} className="font-medium text-ink underline underline-offset-4 hover:decoration-seal">
              {copy.alt.link}
            </Link>
          </p>
        </div>
      </main>

      <aside aria-hidden="true" className="relative hidden overflow-hidden border-l-[1.5px] border-ink bg-ink lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/demo/page-02.png" alt="" className="absolute inset-0 size-full object-cover object-top opacity-90 grayscale" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/80 to-transparent p-10 pt-32 text-sheet">
          <p lang="ja" className="text-sm text-sheet/60">
            らっしゃい！特製醤油、お待たせしました！
          </p>
          <p className="mt-2 max-w-sm text-2xl leading-snug font-semibold text-balance">
            “Welcome in! Here comes your house shoyu!”
          </p>
        </div>
      </aside>
    </div>
  )
}
