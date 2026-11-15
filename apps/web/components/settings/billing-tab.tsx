'use client'

import { Coins, Sparkles, Check, History } from 'lucide-react'
import { useTranslations } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import type { Settings } from './use-settings'

function getPlans(locale: string) {
  const isEn = locale === 'en'
  return [
    {
      id: 'free',
      name: isEn ? 'Free' : 'Gratuit',
      price: isEn ? '€0' : '0 €',
      period: isEn ? '/ mo' : '/ mois',
      credits: isEn ? '30 AI credits / month' : '30 crédits IA / mois',
      features: isEn
        ? [
            'MangaOCR (Japanese) & PaddleOCR (Korean, Chinese, English)',
            'Seamless neural & OpenCV inpainting',
            'Project glossary & Translation Memory',
            'High-definition PNG, ZIP, CBZ & PDF export',
          ]
        : [
            'OCR MangaOCR (Japonais) & PaddleOCR (Coréen, Chinois, Anglais)',
            'Reconstruction de fond neuronale & OpenCV sans trace',
            'Glossaire de projet & Mémoire de traduction',
            'Export PNG, ZIP, CBZ & PDF haute définition',
          ],
    },
    {
      id: 'creator',
      name: isEn ? 'Creator' : 'Créateur',
      price: isEn ? '€8.99' : '8,99 €',
      period: isEn ? '/ mo' : '/ mois',
      credits: isEn ? '500 AI credits / month' : '500 crédits IA / mois',
      features: isEn
        ? [
            '1-click full chapter translation (AI Batch)',
            'Priority in OCR & Inpainting queue',
            'Unlimited AI Quality Check (AI QC)',
            'Extended page version history (30 days)',
          ]
        : [
            'Traduction de chapitres entiers en 1 clic (Lot IA)',
            'Priorité sur la file d’attente OCR & nettoyage',
            'Contrôle Qualité IA illimité',
            'Historique de versions de planches étendu (30 jours)',
          ],
    },
    {
      id: 'team',
      name: isEn ? 'Team & Studio' : 'Équipe & Studio',
      price: isEn ? '€24.99' : '24,99 €',
      period: isEn ? '/ mo' : '/ mois',
      credits: isEn ? '2,000 AI credits / month' : '2 000 crédits IA / mois',
      features: isEn
        ? [
            'Multi-role collaboration (Translator, Cleaner, Typesetter, QC)',
            'Shared glossaries across multiple series',
            'Script .txt export and CBZ/PDF archives',
            'Dedicated priority support',
          ]
        : [
            'Collaboration multi-rôles (Traducteur, Nettoyage, Lettrage, QC)',
            'Glossaires partagés entre plusieurs séries',
            'Export de scripts .txt et archives CBZ/PDF',
            'Support prioritaire dédié',
          ],
    },
  ]
}

export function BillingTab({ s }: { s: Settings }) {
  const isEn = s.locale === 'en'
  const tBilling = useTranslations('Billing')
  const plans = getPlans(s.locale)
  const activeTier = (s.me?.plan || 'free').toLowerCase()
  const usedCredits = s.billingHistory?.month_credits_used ?? Math.max(0, s.limit - s.remaining)
  const entries = s.billingHistory?.entries ?? []

  function actionLabel(actionType: string): string {
    const types = tBilling.raw<Record<string, string>>('types')
    return types[actionType] ?? types.other ?? actionType.replace(/_/g, ' ')
  }

  return (
    <div className="space-y-6">
      {/* 1. Jauge de crédits & Forfait actuel */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-4">
          <div>
            <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
              <Coins className="size-4 text-seal" />
              <span>
                {isEn ? 'Subscription & AI Credit Balance' : 'Abonnement & Solde de Crédits IA'}
              </span>
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              {isEn
                ? 'Track your monthly quota of OCR, contextual translation and image cleaning operations.'
                : 'Suivez votre quota mensuel d’opérations d’OCR, de traduction contextuelle et de nettoyage d’images.'}
            </p>
          </div>
          <span className="rounded-full border border-seal/30 bg-seal-wash px-3.5 py-1 font-mono text-xs font-semibold uppercase tracking-wider text-seal">
            {isEn ? `${activeTier.toUpperCase()} PLAN` : `Forfait ${activeTier.toUpperCase()}`}
          </span>
        </div>

        <div className="rounded-xl border border-hairline bg-sheet p-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-hairline bg-paper p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                {isEn ? 'Available credits' : 'Crédits disponibles'}
              </p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {s.remaining}{' '}
                <span className="text-sm font-normal text-ink-soft">/ {s.limit}</span>
              </p>
            </div>
            <div className="rounded-lg border border-hairline bg-paper p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                {isEn ? 'Used this month' : 'Consommés ce mois-ci'}
              </p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {usedCredits}{' '}
                <span className="text-sm font-normal text-ink-soft">
                  {isEn ? 'credits' : 'crédits'}
                </span>
              </p>
            </div>
            <div className="rounded-lg border border-hairline bg-paper p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                {isEn ? 'Cost per operation' : 'Barème par opération'}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                {isEn ? 'OCR / Translation / Clean: ' : 'OCR / Traduction / Nettoyage : '}
                <strong className="text-ink">{isEn ? '1 credit' : '1 crédit'}</strong>
                <br />
                {isEn ? 'Full auto chapter: ' : 'Chapitre complet auto : '}
                <strong className="text-ink">
                  {isEn ? '2 credits / page' : '2 crédits / page'}
                </strong>
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-ink-soft">
                {isEn ? 'Remaining credits for current period' : 'Crédits restants sur la période en cours'}
              </span>
              <span className="font-mono font-semibold text-ink">
                {s.remaining} / {s.limit} ({s.percentUsed}%)
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full border border-hairline bg-paper">
              <div
                className="h-full bg-seal transition-all duration-500"
                style={{ width: `${s.percentUsed}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 2. Comparatif des forfaits */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-6">
        <div className="border-b border-hairline pb-4">
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <Sparkles className="size-4 text-seal" />
            <span>{isEn ? 'Taurge Studio Plans' : 'Formules Taurge Studio'}</span>
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            {isEn
              ? 'Match your AI credit volume to your team’s publishing pace.'
              : 'Adaptez votre volume de crédits IA à la cadence de publication de votre équipe.'}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
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
                        <Check className="size-3.5 shrink-0 text-moss mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 pt-2">
                  {isCurrent ? (
                    <div className="w-full rounded-lg border border-hairline bg-paper py-2 text-center text-xs font-medium text-ink-soft">
                      {isEn ? 'Active plan on your account' : 'Formule active sur votre compte'}
                    </div>
                  ) : (
                    <div className="w-full rounded-lg border border-hairline bg-paper/60 py-2 text-center font-mono text-[11px] text-ink-faint">
                      {isEn
                        ? 'FedaPay / Paddle checkout opening soon'
                        : 'Passerelle FedaPay / Paddle bientôt ouverte'}
                    </div>
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
