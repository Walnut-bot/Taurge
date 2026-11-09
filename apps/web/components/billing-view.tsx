'use client'

import useSWR from 'swr'
import { Check } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/status'
import { useLocale, useTranslations } from '@/i18n/provider'
import { api } from '@/lib/api'
import { useMe, useRequireAuth } from '@/lib/hooks'
import { cn } from '@/lib/utils'

type PlanDef = {
  key: 'free' | 'creator' | 'team' | 'studio'
  price: string
  purchasable: boolean
  earlyAccess?: boolean
  onQuote?: boolean
}

const PLANS: readonly PlanDef[] = [
  { key: 'free', price: '0 €', purchasable: false },
  { key: 'creator', price: '8,99 €', purchasable: false },
  { key: 'team', price: '24,99 €', purchasable: false, earlyAccess: true },
  { key: 'studio', price: '79 €', purchasable: false, onQuote: true },
]

const QUOTA_ROWS = {
  projects: '',
  ocr: '',
  chars: '',
  storage: '',
  glossary: '',
  members: '',
  export: '',
  history: '',
} as const

/**
 * Abonnements et consommation.
 * Aucun paiement n'est intégré : les formules sont des hypothèses
 * affichées comme non achetables. Seules les données de consommation
 * réelles du compte (solde, historique) sont présentées comme telles.
 */
export function BillingView() {
  const t = useTranslations('Billing')
  const tLegal = useTranslations('Legal')
  const tCommon = useTranslations('Common')
  const locale = useLocale()
  const authed = useRequireAuth()
  const { data: me } = useMe(authed)
  const { data: history, error, isLoading, mutate } = useSWR(
    authed ? 'billing-history' : null,
    () => api.billingHistory(),
  )

  const currentPlan = (me?.plan || 'free').toLowerCase()
  const dateFormat = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  function typeLabel(actionType: string): string {
    const types = t.raw<Record<string, string>>('types')
    return types[actionType] ?? types.other ?? actionType
  }

  if (!authed) return null

  return (
    <>
      <AppHeader />
      <AppShell>
        <main id="contenu" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('title')}</h1>
          <p role="note" className="mt-3 max-w-2xl border-l-2 border-caution bg-caution-wash px-3 py-2 text-sm">
            {t('hypothesis')}
          </p>
          <p className="mt-2 text-xs text-ink-soft">{tLegal('taxIncluded')}</p>

          <section aria-label={t('features')} className="mt-10">
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {PLANS.map((plan) => {
                const isCurrent = currentPlan === plan.key
                const features = t.raw<string[]>(`plans.${plan.key}`)
                return (
                  <li
                    key={plan.key}
                    className={cn(
                      'flex flex-col border-[1.5px] p-6',
                      isCurrent ? 'border-seal bg-sheet' : 'border-ink bg-sheet',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xl font-bold">{t(plan.key)}</h2>
                      {isCurrent && (
                        <span className="rounded-full bg-seal/10 px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-seal uppercase">
                          {t('currentPlan')}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-ink-soft">{t(`${plan.key}Desc`)}</p>
                    <p className="mt-4 text-3xl font-bold tracking-tight">
                      {plan.key === 'studio' ? (
                        <>
                          <span className="text-base font-medium text-ink-soft">{t('fromPrice')}</span>
                          {plan.price}
                        </>
                      ) : (
                        plan.price
                      )}
                      <span className="text-sm font-normal text-ink-soft">{t('perMonth')}</span>
                    </p>
                    <ul className="mt-5 flex flex-1 flex-col gap-2 text-sm">
                      {features.map((feature) => (
                        <li key={feature} className="flex gap-2">
                          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-seal" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-6">
                      {plan.earlyAccess ? (
                        <span className={cn(buttonVariants({ variant: 'outline' }), 'w-full cursor-default opacity-80')}>
                          {t('earlyAccess')}
                        </span>
                      ) : plan.onQuote ? (
                        <span className={cn(buttonVariants({ variant: 'outline' }), 'w-full cursor-default opacity-80')}>
                          {t('onQuote')}
                        </span>
                      ) : (
                        <Button variant="outline" className="w-full" disabled aria-describedby="billing-note">
                          {t('soon')}
                        </Button>
                      )}
                      <p className="mt-2 text-center text-xs text-ink-soft">{t('notPurchasable')}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
            <p id="billing-note" className="sr-only">
              {t('hypothesis')}
            </p>
          </section>

          <section aria-labelledby="compare" className="mt-14">
            <h2 id="compare" className="text-2xl font-bold tracking-tight">
              {t('compareTitle')}
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-soft">{t('compareNote')}</p>
            <div className="mt-5 overflow-x-auto border border-hairline bg-sheet">
              <table className="w-full min-w-[540px] border-collapse text-left text-sm sm:min-w-[640px]">
                <caption className="sr-only">{t('compareTitle')}</caption>
                <thead>
                  <tr className="border-b border-hairline">
                    <th scope="col" className="sticky left-0 bg-sheet px-2.5 py-2.5 font-semibold sm:px-4 sm:py-3">{t('colFeature')}</th>
                    {PLANS.map((plan) => (
                      <th key={plan.key} scope="col" className={cn('px-2.5 py-2.5 font-semibold sm:px-4 sm:py-3', currentPlan === plan.key && 'text-seal')}>
                        {t(plan.key)}
                        {currentPlan === plan.key ? ` — ${t('currentPlan')}` : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(t.raw<Record<string, string>>('rows')) as (keyof typeof QUOTA_ROWS)[]).map((rowKey) => (
                    <tr key={rowKey} className="border-b border-hairline last:border-b-0">
                      <th scope="row" className="sticky left-0 bg-sheet px-2.5 py-2.5 font-medium text-ink-soft sm:px-4">
                        {t(`rows.${rowKey}`)}
                      </th>
                      {PLANS.map((plan) => (
                        <td key={plan.key} className="px-2.5 py-2.5 font-mono text-[0.8125rem] sm:px-4">
                          {t.raw<Record<string, Record<string, string>>>('quotas')[plan.key]?.[rowKey] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-ink-soft">{t('quotasNotEnforced')}</p>
          </section>

          <section aria-labelledby="conso" className="mt-14 border-t-[1.5px] border-ink pt-8">
            <h2 id="conso" className="text-2xl font-bold tracking-tight">
              {t('consumptionTitle')}
            </h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="border border-hairline bg-sheet p-5">
                <p className="label-mono text-ink-soft">{t('balance')}</p>
                <p className="mt-2 font-mono text-3xl font-bold">
                  {me?.credits_remaining ?? '—'}
                  <span className="ml-2 text-sm font-normal text-ink-soft">
                    / {me?.credits_limit ?? '—'} {t('creditsUnit')}
                  </span>
                </p>
              </div>
              <div className="border border-hairline bg-sheet p-5">
                <p className="label-mono text-ink-soft">{t('monthUsed')}</p>
                <p className="mt-2 font-mono text-3xl font-bold">
                  {history ? history.month_credits_used : '—'}
                  <span className="ml-2 text-sm font-normal text-ink-soft">{t('creditsUnit')}</span>
                </p>
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-ink-soft">{t('howItWorks')}</p>

            <h3 className="mt-10 text-xl font-semibold">{t('historyTitle')}</h3>
            {isLoading && (
              <p aria-busy="true" className="mt-4 text-ink-soft">
                {tCommon('loading')}
              </p>
            )}
            {error && (
              <ErrorState className="mt-4" message={error.message} retryLabel={tCommon('retry')} onRetry={() => mutate()} />
            )}
            {history && history.entries.length === 0 && (
              <p className="mt-4 text-ink-soft">{t('historyEmpty')}</p>
            )}
            {history && history.entries.length > 0 && (
              <ul className="mt-4 divide-y divide-hairline border-y border-hairline">
                {history.entries.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <span className="font-medium">{typeLabel(entry.action_type)}</span>
                    <span className="text-ink-soft">
                      {entry.description ?? ''}
                    </span>
                    <span className="ml-auto flex items-center gap-4">
                      <time className="font-mono text-xs text-ink-soft" dateTime={entry.created_at}>
                        {dateFormat.format(new Date(entry.created_at))}
                      </time>
                      <span className={cn('font-mono font-semibold', entry.amount > 0 ? 'text-ink' : 'text-ok')}>
                        {entry.amount > 0 ? `−${entry.amount}` : `+${Math.abs(entry.amount)}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </AppShell>
    </>
  )
}
