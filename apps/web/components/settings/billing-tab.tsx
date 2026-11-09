'use client'

import { Sparkles, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Settings } from './use-settings'

export function BillingTab({ s }: { s: Settings }) {
  const { me, remaining, limit, percentUsed } = s
  if (!me) return null
  return (
    <div className="space-y-6">
      <section className="panel p-6 sm:p-8 rounded-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-hairline pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">Solde de crédits</h2>
              <span className="rounded-full bg-seal-wash px-2.5 py-0.5 text-xs font-medium text-seal uppercase tracking-wider">
                Plan {me.plan || 'Free'}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              Les crédits sont consommés lors de la traduction IA contextuelle et du nettoyage intelligent.
            </p>
          </div>
          <Button
            variant="seal"
            size="sm"
            disabled
            className="shrink-0"
            title="Recharge bientôt disponible — aucun paiement n'est encore ouvert"
            aria-describedby="refill-soon-note"
          >
            <span>Recharge bientôt disponible</span>
          </Button>
          <span id="refill-soon-note" className="sr-only">
            La recharge de crédits n&apos;est pas encore disponible.
          </span>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="font-medium text-ink">Utilisation actuelle</span>
            <span className="font-mono text-sm font-bold text-ink">
              {remaining} <span className="font-normal text-ink-soft">/ {limit} crédits</span>
            </span>
          </div>
          <div className="h-3 w-full rounded-full bg-sheet border border-hairline overflow-hidden p-0.5">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                percentUsed < 20 ? 'bg-amber-500' : 'bg-seal'
              )}
              style={{ width: `${percentUsed}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-ink-soft">
            <span>0 crédit</span>
            <span>{percentUsed}% disponible</span>
            <span>{limit} crédits max</span>
          </div>
        </div>
      </section>
      <div className="grid gap-6 sm:grid-cols-2">
        <section className="panel p-5 sm:p-6 rounded-xl">
          <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
            <Sparkles className="size-4 text-seal" />
            <span>Avantages de votre formule</span>
          </h3>
          <ul className="mt-3 space-y-2 text-xs text-ink-soft">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-ok shrink-0" />
              <span>OCR adaptatif (PaddleOCR + MangaOCR vertical japonais)</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-ok shrink-0" />
              <span>Traduction contextuelle Ollama (LLM local), fallback DeepL</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-ok shrink-0" />
              <span>Inpainting neuronal &amp; nettoyage intelligent de bulles</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-3.5 text-ok shrink-0" />
              <span>Exports haute résolution CBZ, PDF et ZIP</span>
            </li>
          </ul>
        </section>
        <section className="panel p-5 sm:p-6 rounded-xl">
          <h3 className="text-sm font-semibold text-ink">Barème de consommation</h3>
          <dl className="mt-3 space-y-2.5 text-xs">
            <div className="flex justify-between border-b border-hairline pb-1.5">
              <dt className="text-ink-soft">Détection OCR locale</dt>
              <dd className="font-mono font-medium text-ok">0 crédit (Gratuit)</dd>
            </div>
            <div className="flex justify-between border-b border-hairline pb-1.5">
              <dt className="text-ink-soft">Traduction de bulle via Ollama / DeepL</dt>
              <dd className="font-mono font-medium">1 crédit / page</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-soft">Nettoyage inpainting auto</dt>
              <dd className="font-mono font-medium">1 crédit / page</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  )
}
