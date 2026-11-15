'use client'

import { useState, useEffect } from 'react'
import {
  Coins,
  Cpu,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  Info,
  CheckCircle2,
  X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useDetailedBalance } from '@/lib/hooks'
import { useLocale } from '@/i18n/provider'
import { Link as LocaleLink } from '@/i18n/navigation'
import type { CostEstimate } from '@/lib/types'

interface CostPreviewDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (selectedEngine: string) => void
  actionType: 'ocr' | 'translate' | 'clean' | 'batch'
  title: string
  description?: string
  sourceChars?: number
  zonesCount?: number
  pageCount?: number
  isLoading?: boolean
}

export function CostPreviewDialog({
  isOpen,
  onClose,
  onConfirm,
  actionType,
  title,
  description,
  sourceChars = 0,
  zonesCount = 1,
  pageCount = 1,
  isLoading = false,
}: CostPreviewDialogProps) {
  const locale = useLocale()
  const { data: balance } = useDetailedBalance(isOpen)

  // Moteur sélectionné par défaut selon l'action
  const [selectedEngine, setSelectedEngine] = useState<string>(() => {
    if (actionType === 'translate') return 'ollama'
    if (actionType === 'clean') return 'opencv'
    return 'standard'
  })

  const [estimate, setEstimate] = useState<CostEstimate | null>(null)
  const [isEstimating, setIsEstimating] = useState(false)

  // Récupération de l'estimation en direct à chaque changement de moteur ou de paramètres
  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    setIsEstimating(true)

    api
      .getCostEstimate(actionType, {
        source_chars: sourceChars,
        engine: selectedEngine,
        zones_count: zonesCount,
        page_count: pageCount,
      })
      .then((res) => {
        if (!cancelled) {
          setEstimate(res)
          setIsEstimating(false)
        }
      })
      .catch((err) => {
        console.error('Erreur estimation coût:', err)
        if (!cancelled) setIsEstimating(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, actionType, selectedEngine, sourceChars, zonesCount, pageCount])

  if (!isOpen) return null

  const currentAvailable = balance?.available_credits ?? 100
  const cost = estimate?.total_cost ?? 1
  const balanceAfter = currentAvailable - cost
  const hasEnoughCredits = balanceAfter >= 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg rounded-2xl border border-hairline bg-paper shadow-2xl p-6 text-ink overflow-hidden transition-all"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-hairline">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-seal/10 text-seal">
              <Coins className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold leading-tight">{title}</h2>
              <p className="text-xs text-ink-soft mt-0.5">
                {locale === 'en'
                  ? 'Credit cost preview & engine selection'
                  : 'Prévisualisation de la consommation & sélection du moteur'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="rounded-lg p-1.5 text-ink-soft hover:bg-sheet transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Corps principal */}
        <div className="py-4 space-y-4">
          {description && (
            <p className="text-xs text-ink-soft leading-relaxed">{description}</p>
          )}

          {/* Sélecteur de moteur pour la Traduction (Ollama Standard vs DeepL Premium) */}
          {actionType === 'translate' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                {locale === 'en' ? 'Translation engine' : 'Moteur de traduction'}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedEngine('ollama')}
                  className={`flex flex-col p-3 rounded-xl border text-left transition-all ${
                    selectedEngine === 'ollama'
                      ? 'border-seal bg-seal/5 ring-1 ring-seal'
                      : 'border-hairline bg-sheet/40 hover:border-ink/20'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-semibold text-xs text-ink flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 text-seal" />
                      Ollama Local
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sheet border border-hairline text-ink-soft">
                      1 créd / 1k car.
                    </span>
                  </div>
                  <span className="text-[11px] text-ink-soft leading-tight">
                    {locale === 'en'
                      ? 'Standard AI (Llama 3.1) • Economical'
                      : 'IA Standard (Llama 3.1) • Économique'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedEngine('deepl')}
                  className={`flex flex-col p-3 rounded-xl border text-left transition-all ${
                    selectedEngine === 'deepl'
                      ? 'border-seal bg-seal/5 ring-1 ring-seal'
                      : 'border-hairline bg-sheet/40 hover:border-ink/20'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-semibold text-xs text-ink flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      DeepL API
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sheet border border-hairline text-amber-600 dark:text-amber-400">
                      4 créd / 1k car.
                    </span>
                  </div>
                  <span className="text-[11px] text-ink-soft leading-tight">
                    {locale === 'en'
                      ? 'DeepL Premium • High accuracy'
                      : 'DeepL Premium • Nuances littéraires'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Sélecteur de moteur pour le Nettoyage (OpenCV vs LaMa ONNX) */}
          {actionType === 'clean' && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-ink uppercase tracking-wider block">
                {locale === 'en' ? 'Inpainting engine' : 'Moteur de nettoyage'}
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedEngine('opencv')}
                  className={`flex flex-col p-3 rounded-xl border text-left transition-all ${
                    selectedEngine === 'opencv'
                      ? 'border-seal bg-seal/5 ring-1 ring-seal'
                      : 'border-hairline bg-sheet/40 hover:border-ink/20'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-semibold text-xs text-ink flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 text-seal" />
                      OpenCV
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sheet border border-hairline text-ink-soft">
                      1 crédit / page
                    </span>
                  </div>
                  <span className="text-[11px] text-ink-soft leading-tight">
                    {locale === 'en'
                      ? 'Telea & topological • Instant'
                      : 'Reconstruction nette & instantanée'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedEngine('lama')}
                  className={`flex flex-col p-3 rounded-xl border text-left transition-all ${
                    selectedEngine === 'lama'
                      ? 'border-seal bg-seal/5 ring-1 ring-seal'
                      : 'border-hairline bg-sheet/40 hover:border-ink/20'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-semibold text-xs text-ink flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      LaMa ONNX
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sheet border border-hairline text-amber-600 dark:text-amber-400">
                      2 crédits (≤5 zones)
                    </span>
                  </div>
                  <span className="text-[11px] text-ink-soft leading-tight">
                    {locale === 'en'
                      ? 'Neural inpainting • Complex artwork'
                      : 'Inpainting neuronal pour décors'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Tableau récapitulatif des soldes (Comptabilité claire) */}
          <div className="rounded-xl border border-hairline bg-sheet/50 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-soft">
                {locale === 'en' ? 'Current available balance:' : 'Solde actuel disponible :'}
              </span>
              <span className="font-mono font-semibold text-ink">
                {currentAvailable} {locale === 'en' ? 'credits' : 'crédits'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-soft flex items-center gap-1">
                {locale === 'en' ? 'Operation estimated cost:' : 'Coût estimé de l’opération :'}
                {isEstimating && <span className="animate-spin text-seal">⏳</span>}
              </span>
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                - {cost} {locale === 'en' ? 'credit(s)' : 'crédit(s)'}
              </span>
            </div>

            <div className="pt-2 border-t border-hairline flex items-center justify-between text-xs">
              <span className="font-semibold text-ink">
                {locale === 'en' ? 'Projected remaining balance:' : 'Solde restant après opération :'}
              </span>
              <span
                className={`font-mono font-bold text-sm ${
                  hasEnoughCredits ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'
                }`}
              >
                {balanceAfter} {locale === 'en' ? 'credits' : 'crédits'}
              </span>
            </div>
          </div>

          {/* Alerte si solde insuffisant */}
          {!hasEnoughCredits && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 flex items-start gap-2.5 text-xs text-red-600 dark:text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  {locale === 'en' ? 'Insufficient credit balance' : 'Solde de crédits insuffisant'}
                </p>
                <p className="mt-0.5 text-ink-soft">
                  {locale === 'en'
                    ? 'You need to recharge your account or switch to a higher plan to execute this action.'
                    : 'Rechargez des crédits supplémentaires pour exécuter cette opération.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer avec Boutons d'action */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-hairline">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-xl px-4 py-2 text-xs font-semibold text-ink-soft hover:bg-sheet transition-colors"
          >
            {locale === 'en' ? 'Cancel' : 'Annuler'}
          </button>

          {hasEnoughCredits ? (
            <button
              type="button"
              onClick={() => onConfirm(selectedEngine)}
              disabled={isLoading || isEstimating}
              className="flex items-center gap-2 rounded-xl bg-seal px-4 py-2 text-xs font-semibold text-seal-ink hover:opacity-90 active:scale-95 transition-all shadow-sm"
            >
              {isLoading ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-seal-ink border-t-transparent" />
                  <span>{locale === 'en' ? 'Processing...' : 'Traitement en cours...'}</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {locale === 'en'
                      ? `Confirm & Deduct ${cost} credits`
                      : `Confirmer & Débiter ${cost} crédit${cost > 1 ? 's' : ''}`}
                  </span>
                </>
              )}
            </button>
          ) : (
            <LocaleLink
              href="/billing"
              className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-600 active:scale-95 transition-all shadow-sm"
            >
              <Coins className="h-4 w-4" />
              <span>{locale === 'en' ? 'Recharge credits' : 'Recharger des crédits'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </LocaleLink>
          )}
        </div>
      </div>
    </div>
  )
}
