'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Coins,
  Cpu,
  Sparkles,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  X,
  Layers,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useDetailedBalance, useMe } from '@/lib/hooks'
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

/**
 * Calcule instantanément le coût exact selon le barème officiel Taurge.
 */
function calculateLocalCost(
  action: string,
  engine: string,
  chars: number,
  zones: number,
  pages: number,
): number {
  const normEngine = (engine || '').toLowerCase()
  const pCount = Math.max(1, pages)

  if (action === 'ocr') {
    return pCount * 1
  }

  if (action === 'translate') {
    // 1 crédit par 1 000 caractères (arrondi au supérieur) pour Ollama, 4 pour DeepL
    const charCount = Math.max(1, chars)
    const units = Math.max(1, Math.ceil(charCount / 1000))
    const costPerUnit = normEngine === 'deepl' ? 4 : 1
    return units * costPerUnit
  }

  if (action === 'clean') {
    // OpenCV = 1 crédit / page. LaMa = 2 crédits (jusqu'à 5 zones), +1 par 5 zones supplémentaires.
    if (normEngine.includes('lama')) {
      const base = 2
      const extra = zones > 5 ? Math.ceil((zones - 5) / 5) : 0
      return (base + extra) * pCount
    }
    return 1 * pCount
  }

  if (action === 'batch') {
    // Lot complet : OCR (1) + Traduction (1 Ollama ou 4 DeepL) + Clean LaMa (2) = 4 ou 7 crédits / page
    const perPage = normEngine === 'deepl' ? 7 : 4
    return pCount * perPage
  }

  return 1
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
  const { data: balance, mutate: refreshBalance } = useDetailedBalance(isOpen)
  const { data: me } = useMe(isOpen)

  // Moteur sélectionné par défaut selon l'action
  const [selectedEngine, setSelectedEngine] = useState<string>(() => {
    if (actionType === 'translate') return 'ollama'
    if (actionType === 'clean') return 'opencv'
    return 'standard'
  })

  const [estimate, setEstimate] = useState<CostEstimate | null>(null)
  const [isEstimating, setIsEstimating] = useState(false)

  // Forcer la synchronisation du solde réel du compte à l'ouverture de la modale
  useEffect(() => {
    if (isOpen) {
      refreshBalance?.()
    }
  }, [isOpen, refreshBalance])

  // Coût calculé en direct côté client (instantané et infaillible)
  const localCost = calculateLocalCost(actionType, selectedEngine, sourceChars, zonesCount, pageCount)

  // Récupération de l'estimation côté backend en temps réel
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
        console.error('Erreur estimation coût API:', err)
        if (!cancelled) setIsEstimating(false)
      })

    return () => {
      cancelled = true
    }
  }, [isOpen, actionType, selectedEngine, sourceChars, zonesCount, pageCount])

  if (!isOpen) return null

  // Solde réel synchronisé : priorité aux données de l'estimation backend, puis au hook de balance, puis à l'utilisateur
  const currentAvailable =
    estimate?.current_balance ??
    estimate?.available_credits ??
    balance?.available_credits ??
    me?.credits_remaining ??
    0

  const monthlyRemaining =
    estimate?.monthly_remaining ??
    balance?.monthly_credits_remaining ??
    currentAvailable

  const purchasedRemaining =
    estimate?.purchased_remaining ??
    balance?.purchased_credits_remaining ??
    0

  // Coût final : vérifié par le backend ou calculé par le barème officiel
  const finalCost = estimate?.total_cost ?? estimate?.estimated_cost ?? localCost
  const balanceAfter = currentAvailable - finalCost
  const hasEnoughCredits = currentAvailable >= finalCost

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
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sheet border border-hairline text-amber-600 dark:text-amber-400 font-bold">
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
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sheet border border-hairline text-amber-600 dark:text-amber-400 font-bold">
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

          {/* Tableau récapitulatif des soldes (Comptabilité réelle synchronisée) */}
          <div className="rounded-xl border border-hairline bg-sheet/50 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-soft">
                {locale === 'en' ? 'Current available balance:' : 'Solde actuel disponible :'}
              </span>
              <div className="text-right">
                <span className="font-mono font-bold text-sm text-ink">
                  {currentAvailable} {locale === 'en' ? 'credits' : 'crédits'}
                </span>
                {(monthlyRemaining > 0 || purchasedRemaining > 0) && (
                  <p className="text-[10px] text-ink-soft font-mono">
                    {monthlyRemaining} {locale === 'en' ? 'monthly' : 'mensuels'}
                    {purchasedRemaining > 0 ? ` · ${purchasedRemaining} ${locale === 'en' ? 'purchased' : 'achetés'}` : ''}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-soft flex items-center gap-1">
                {locale === 'en' ? 'Operation estimated cost:' : 'Coût estimé de l’opération :'}
                {isEstimating && <span className="animate-spin text-seal">⏳</span>}
              </span>
              <span className="font-mono font-bold text-base text-amber-600 dark:text-amber-400">
                - {finalCost} {locale === 'en' ? 'credit(s)' : 'crédit(s)'}
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
              disabled={isLoading}
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
                      ? `Confirm & Deduct ${finalCost} credits`
                      : `Confirmer & Débiter ${finalCost} crédit${finalCost > 1 ? 's' : ''}`}
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
