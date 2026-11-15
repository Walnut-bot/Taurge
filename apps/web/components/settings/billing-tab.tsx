'use client'

import { Coins, Sparkles, Check, History, Layers, ArrowRight, ShieldCheck, Zap } from 'lucide-react'
import { Link } from '@/i18n/navigation'
import { useTranslations } from '@/i18n/provider'
import { SHOW_PUBLIC_PRICES } from '@/lib/billing-config'
import { useDetailedBalance } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import type { Settings } from './use-settings'

function getPlans(locale: string) {
  const isEn = locale === 'en'
  return [
    {
      id: 'free',
      name: isEn ? 'Free' : 'Gratuit',
      price: SHOW_PUBLIC_PRICES ? (isEn ? '€0' : '0 €') : (isEn ? 'Beta' : 'Bêta'),
      period: SHOW_PUBLIC_PRICES ? (isEn ? '/ mo' : '/ mois') : '',
      credits: isEn ? '100 monthly credits' : '100 crédits mensuels',
      features: isEn
        ? [
            '1 active project',
            '50 MB storage',
            '30-entry glossary',
          ]
        : [
            '1 projet',
            '50 Mo',
            'Glossaire de 30 entrées',
          ],
    },
    {
      id: 'creator',
      name: isEn ? 'Creator' : 'Créateur',
      price: SHOW_PUBLIC_PRICES ? (isEn ? '€8.99' : '8,99 €') : (isEn ? 'Beta' : 'Bêta'),
      period: SHOW_PUBLIC_PRICES ? (isEn ? '/ mo' : '/ mois') : '',
      credits: isEn ? '500 monthly credits' : '500 crédits mensuels',
      features: isEn
        ? [
            '5 active projects',
            '2 GB storage',
            'Translation Memory',
          ]
        : [
            '5 projets',
            '2 Go',
            'Mémoire de traduction',
          ],
    },
    {
      id: 'team',
      name: isEn ? 'Team' : 'Équipe',
      price: SHOW_PUBLIC_PRICES ? (isEn ? '€24.99' : '24,99 €') : (isEn ? 'Beta' : 'Bêta'),
      period: SHOW_PUBLIC_PRICES ? (isEn ? '/ mo' : '/ mois') : '',
      credits: isEn ? '1,500 monthly credits' : '1 500 crédits mensuels',
      features: isEn
        ? [
            '3 team members',
            '10 active projects',
            '10 GB shared storage',
          ]
        : [
            '3 membres',
            '10 projets',
            '10 Go partagés',
          ],
    },
    {
      id: 'studio',
      name: isEn ? 'Studio' : 'Studio',
      price: SHOW_PUBLIC_PRICES ? (isEn ? '€79+' : '79 €+') : (isEn ? 'Custom' : 'Sur devis'),
      period: SHOW_PUBLIC_PRICES ? (isEn ? '/ mo' : '/ mois') : '',
      credits: isEn ? 'Custom quotas' : 'Quotas personnalisés',
      features: isEn
        ? [
            'On quote, based on needs and available capacity.',
          ]
        : [
            'Sur devis, selon les besoins et les capacités réellement disponibles.',
          ],
    },
  ]
}

export function BillingTab({ s }: { s: Settings }) {
  const isEn = s.locale === 'en'
  const tBilling = useTranslations('Billing')
  const plans = getPlans(s.locale)
  const { data: detailedBalance } = useDetailedBalance(true)

  const activeTier = (detailedBalance?.plan || s.me?.plan || 'free').toLowerCase()
  const availableCredits = detailedBalance?.available_credits ?? s.remaining
  const monthlyRemaining = detailedBalance?.monthly_credits_remaining ?? s.remaining
  const monthlyLimit = detailedBalance?.monthly_credits_limit ?? s.limit
  const purchasedRemaining = detailedBalance?.purchased_credits_remaining ?? 0
  const reservedCredits = detailedBalance?.reserved_credits ?? 0

  const percentUsed =
    monthlyLimit > 0
      ? Math.min(100, Math.round(((monthlyLimit - monthlyRemaining) / monthlyLimit) * 100))
      : 0
  const entries = s.billingHistory?.entries ?? []

  function actionLabel(actionType: string): string {
    const types = tBilling.raw<Record<string, string>>('types')
    return types[actionType] ?? types.other ?? actionType.replace(/_/g, ' ')
  }

  return (
    <div className="space-y-6">
      {/* 1. Jauge de crédits & Forfait actuel avec les 3 poches */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-4">
          <div>
            <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
              <Coins className="size-4 text-seal" />
              <span>
                {isEn ? 'Subscription & 3-Pocket AI Credits' : 'Abonnement & Comptabilité 3 Poches'}
              </span>
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              {isEn
                ? 'Strict separation between monthly subscription credits, permanent purchased packs, and active reserved locks.'
                : 'Séparation stricte des crédits mensuels d’abonnement, packs achetés permanents et réservations en cours.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-seal/30 bg-seal-wash px-3.5 py-1 font-mono text-xs font-semibold uppercase tracking-wider text-seal">
              {isEn ? `${activeTier.toUpperCase()} PLAN` : `Forfait ${activeTier.toUpperCase()}`}
            </span>
            <Link
              href="/billing"
              className="inline-flex items-center gap-1.5 rounded-lg bg-seal px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-seal/90 transition-colors"
            >
              <span>{isEn ? 'Open Billing Portal' : 'Espace Facturation'}</span>
              <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-hairline bg-sheet p-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-4">
            {/* Total disponible */}
            <div className="rounded-lg border border-seal/30 bg-seal-wash/10 p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-seal font-semibold">
                {isEn ? 'Total Available' : 'Total Disponible'}
              </p>
              <p className="mt-1 text-2xl font-bold text-seal">
                {availableCredits}
              </p>
              <p className="mt-1 text-[11px] text-ink-soft">
                {isEn ? 'Monthly + Purchased' : 'Mensuels + Achetés'}
              </p>
            </div>

            {/* Poche 1 : Mensuels */}
            <div className="rounded-lg border border-hairline bg-paper p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                {isEn ? 'Monthly quota' : 'Quota mensuel'}
              </p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {monthlyRemaining}{' '}
                <span className="text-sm font-normal text-ink-soft">/ {monthlyLimit}</span>
              </p>
              <p className="mt-1 text-[11px] text-ink-soft">
                {isEn ? 'Consumed first, resets monthly' : 'Priorité 1 (remis à zéro chaque mois)'}
              </p>
            </div>

            {/* Poche 2 : Achetés permanents */}
            <div className="rounded-lg border border-hairline bg-paper p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                {isEn ? 'Purchased packs' : 'Packs achetés'}
              </p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {purchasedRemaining}{' '}
                <span className="text-sm font-normal text-ink-soft">crédits</span>
              </p>
              <p className="mt-1 text-[11px] text-ink-soft">
                {isEn ? 'Permanent, zero expiry' : 'Permanents, sans expiration'}
              </p>
            </div>

            {/* Poche 3 : Réservés */}
            <div className="rounded-lg border border-hairline bg-paper p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                {isEn ? 'Currently reserved' : 'Réservés en cours'}
              </p>
              <p className="mt-1 text-2xl font-semibold text-amber-600">
                {reservedCredits}{' '}
                <span className="text-sm font-normal text-ink-soft">crédits</span>
              </p>
              <p className="mt-1 text-[11px] text-ink-soft">
                {isEn ? 'Locked during active jobs' : 'Verrouillés pendant les calculs'}
              </p>
            </div>
          </div>

          {/* Barème officiel transparent */}
          <div className="rounded-lg border border-hairline bg-paper p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint font-semibold">
              {isEn ? 'Official AI Tariff (Centralized)' : 'Barème Officiel des Opérations IA (Centralisé)'}
            </p>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded border border-hairline/60 bg-sheet p-2.5">
                <span className="font-mono font-bold text-ink">1 crédit</span>
                <p className="text-[11px] text-ink-soft mt-0.5">OCR standard (1 page)</p>
              </div>
              <div className="rounded border border-hairline/60 bg-sheet p-2.5">
                <span className="font-mono font-bold text-ink">1 crédit / 1k car.</span>
                <p className="text-[11px] text-ink-soft mt-0.5">Traduction Ollama standard</p>
              </div>
              <div className="rounded border border-hairline/60 bg-sheet p-2.5">
                <span className="font-mono font-bold text-purple-700">4 crédits / 1k car.</span>
                <p className="text-[11px] text-ink-soft mt-0.5">Traduction DeepL Premium</p>
              </div>
              <div className="rounded border border-hairline/60 bg-sheet p-2.5">
                <span className="font-mono font-bold text-ink">1 cr (OpenCV) / 2 cr (LaMa)</span>
                <p className="text-[11px] text-ink-soft mt-0.5">Nettoyage bulles & inpainting</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-ink-soft">
                {isEn ? 'Monthly quota consumption' : 'Consommation du quota mensuel'}
              </span>
              <span className="font-mono font-semibold text-ink">
                {monthlyLimit - monthlyRemaining} / {monthlyLimit} ({percentUsed}%)
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full border border-hairline bg-paper">
              <div
                className="h-full bg-seal transition-all duration-500"
                style={{ width: `${percentUsed}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Comparatif des 4 forfaits */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
                <Sparkles className="size-4 text-seal" />
                <span>{isEn ? 'Taurge Studio Plans' : 'Formules Taurge Studio'}</span>
              </h2>
              <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 font-mono text-[9px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                {isEn
                  ? 'Initial proposal — not yet validated by actual costs'
                  : 'Proposition de départ, non encore validée par les coûts réels'}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              {isEn
                ? 'Match your AI credit volume to your team’s publishing pace.'
                : 'Adaptez votre volume de crédits IA à la cadence de publication de votre équipe.'}
            </p>
          </div>
          <Link
            href="/billing"
            className="text-xs font-semibold text-seal hover:underline inline-flex items-center gap-1"
          >
            <span>{isEn ? 'Change plan or buy packs' : 'Changer de formule ou acheter des packs'}</span>
            <ArrowRight className="size-3" />
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const isCurrent = activeTier === plan.id
            return (
              <div
                key={plan.id}
                className={cn(
                  'flex flex-col justify-between rounded-xl border p-5 transition-all',
                  isCurrent ? 'border-seal bg-seal-wash/20 ring-1 ring-seal/20' : 'border-hairline bg-sheet',
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink">{plan.name}</h3>
                    {isCurrent && (
                      <span className="rounded bg-seal px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-white">
                        {isEn ? 'Current' : 'Actuel'}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-2xl font-bold text-ink">{plan.price}</span>
                    <span className="text-xs text-ink-soft">{plan.period}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs font-semibold text-seal">{plan.credits}</p>

                  <ul className="mt-4 space-y-2 border-t border-hairline pt-4">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2 text-xs text-ink-soft">
                        <Check className="size-3.5 shrink-0 text-emerald-600 mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 pt-2">
                  {isCurrent ? (
                    <div className="w-full rounded-lg border border-hairline bg-paper py-2 text-center text-xs font-medium text-ink-soft">
                      {isEn ? 'Active plan' : 'Formule active'}
                    </div>
                  ) : (
                    <Link
                      href="/billing"
                      className="block w-full rounded-lg bg-sheet border border-seal/40 py-2 text-center font-semibold text-xs text-seal hover:bg-seal hover:text-white transition-all shadow-2xs"
                    >
                      {isEn ? 'Select in Billing' : 'Sélectionner dans Facturation'}
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* 3. Journal de consommation IA */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-5">
        <div className="flex items-center justify-between gap-4 border-b border-hairline pb-4">
          <div>
            <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
              <History className="size-4 text-seal" />
              <span>{isEn ? 'AI Consumption Log' : 'Journal de consommation IA'}</span>
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              {isEn
                ? 'Latest OCR, translation and inpainting operations recorded on your account.'
                : 'Dernières opérations d’OCR, de traduction et de nettoyage comptabilisées sur votre compte.'}
            </p>
          </div>
          <span className="font-mono text-xs text-ink-faint">
            {entries.length}{' '}
            {isEn
              ? `operation${entries.length > 1 ? 's' : ''}`
              : `opération${entries.length > 1 ? 's' : ''}`}
          </span>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-sheet p-8 text-center">
            <p className="text-xs text-ink-soft">
              {isEn
                ? 'No billed operations recorded during this period.'
                : 'Aucune opération facturée enregistrée sur cette période.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-hairline">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline bg-sheet font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                  <th className="px-4 py-3">{isEn ? 'Operation' : 'Opération'}</th>
                  <th className="px-4 py-3">{isEn ? 'Details' : 'Détail'}</th>
                  <th className="px-4 py-3">{isEn ? 'Credits' : 'Crédits'}</th>
                  <th className="px-4 py-3 text-right">{isEn ? 'Date & Time' : 'Date & Heure'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline text-xs">
                {entries.slice(0, 15).map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-sheet/60">
                    <td className="px-4 py-3 font-medium text-ink">
                      {actionLabel(item.action_type)}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {item.description || (isEn ? 'Studio processing' : 'Traitement Studio')}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded bg-seal-wash px-2 py-0.5 font-mono text-[11px] font-semibold text-seal">
                        {item.amount > 0 ? `-${item.amount}` : `+${Math.abs(item.amount)}`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-ink-faint">
                      {new Date(item.created_at).toLocaleString(isEn ? 'en-US' : 'fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
