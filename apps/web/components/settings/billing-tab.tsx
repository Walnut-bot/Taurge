'use client'

import { Coins, Sparkles, Check, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Settings } from './use-settings'

const PLANS = [
  {
    id: 'free',
    name: 'Découverte (Free)',
    price: '0 €',
    period: '/ mois',
    credits: '56 crédits IA / mois',
    features: [
      'OCR MangaOCR (Japonais) & PaddleOCR (Coréen, Chinois, Anglais)',
      'Inpainting neuronal & OpenCV sans trace',
      'Glossaire de projet & Mémoire de traduction',
      'Export PNG, ZIP, CBZ & PDF haute définition',
    ],
  },
  {
    id: 'pro',
    name: 'Scantrad Pro',
    price: '19 €',
    period: '/ mois',
    credits: '500 crédits IA / mois',
    features: [
      'Traduction de chapitres entiers en 1 clic (Batch IA)',
      'Priorité sur la file d’attente OCR & Inpainting',
      'Contrôle Qualité IA (AI QC) illimité',
      'Historique de versions de planches étendu',
    ],
  },
  {
    id: 'team',
    name: 'Équipe & Studio',
    price: '49 €',
    period: '/ mois',
    credits: '2 000 crédits IA / mois',
    features: [
      'Collaboration multi-rôles (Traducteur, Éditeur, QC, Chef)',
      'Glossaires partagés entre plusieurs séries',
      'Export de scripts .txt et archives CBZ/PDF',
      'Support prioritaire dédié',
    ],
  },
]

export function BillingTab({ s }: { s: Settings }) {
  const activeTier = (s.me?.plan || 'free').toLowerCase()
  const usedCredits = s.billingHistory?.month_credits_used ?? Math.max(0, s.limit - s.remaining)
  const entries = s.billingHistory?.entries ?? []

  return (
    <div className="space-y-6">
      {/* 1. Jauge de crédits & Forfait actuel */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-4">
          <div>
            <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
              <Coins className="size-4 text-seal" />
              <span>Abonnement &amp; Solde de Crédits IA</span>
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              Suivez votre quota mensuel d’opérations d’OCR, de traduction contextuelle et de nettoyage d’images.
            </p>
          </div>
          <span className="rounded-full border border-seal/30 bg-seal-wash px-3.5 py-1 font-mono text-xs font-semibold uppercase tracking-wider text-seal">
            Forfait {activeTier.toUpperCase()}
          </span>
        </div>

        <div className="rounded-xl border border-hairline bg-sheet p-5 space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-hairline bg-paper p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                Crédits disponibles
              </p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {s.remaining}{' '}
                <span className="text-sm font-normal text-ink-soft">/ {s.limit}</span>
              </p>
            </div>
            <div className="rounded-lg border border-hairline bg-paper p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                Consommés ce mois-ci
              </p>
              <p className="mt-1 text-2xl font-semibold text-ink">
                {usedCredits}{' '}
                <span className="text-sm font-normal text-ink-soft">crédits</span>
              </p>
            </div>
            <div className="rounded-lg border border-hairline bg-paper p-4">
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                Barème par opération
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
                OCR / Traduction / Clean : <strong className="text-ink">1 crédit</strong>
                <br />
                Chapitre complet auto : <strong className="text-ink">2 crédits / page</strong>
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-ink-soft">Crédits restants sur la période en cours</span>
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
            <span>Formules Taurge Studio</span>
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            Adaptez votre volume de crédits IA à la cadence de publication de votre équipe.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => {
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
                        Actuel
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
                      Formule active sur votre compte
                    </div>
                  ) : (
                    <div className="w-full rounded-lg border border-hairline bg-paper/60 py-2 text-center font-mono text-[11px] text-ink-faint">
                      Passerelle Stripe bientôt ouverte
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
              <span>Journal de consommation IA</span>
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              Dernières opérations d’OCR, de traduction et d’inpainting comptabilisées sur votre compte.
            </p>
          </div>
          <span className="font-mono text-xs text-ink-faint">
            {entries.length} opération{entries.length > 1 ? 's' : ''}
          </span>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-xl border border-hairline bg-sheet p-8 text-center">
            <p className="text-xs text-ink-soft">
              Aucune opération facturée enregistrée sur cette période.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-hairline">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline bg-sheet font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                  <th className="px-4 py-3">Opération</th>
                  <th className="px-4 py-3">Détail</th>
                  <th className="px-4 py-3">Crédits</th>
                  <th className="px-4 py-3 text-right">Date &amp; Heure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline text-xs">
                {entries.slice(0, 15).map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-sheet/60">
                    <td className="px-4 py-3 font-medium text-ink capitalize">
                      {item.action_type.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {item.description || 'Traitement Studio'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded bg-seal-wash px-2 py-0.5 font-mono text-[11px] font-semibold text-seal">
                        -{item.amount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-ink-faint">
                      {new Date(item.created_at).toLocaleString('fr-FR', {
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
