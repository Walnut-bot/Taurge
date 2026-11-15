'use client'

import { useState } from 'react'
import useSWR from 'swr'
import {
  Coins,
  Sparkles,
  Zap,
  Check,
  CreditCard,
  Smartphone,
  Calendar,
  Layers,
  Clock,
  ArrowRight,
  ShieldCheck,
  Cpu,
  Filter,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { useLocale, useTranslations } from '@/i18n/provider'
import { api } from '@/lib/api'
import { useDetailedBalance, useMe, useRequireAuth } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import type { CreditPack } from '@/lib/types'

export function BillingView() {
  const tCommon = useTranslations('Common')
  const locale = useLocale()
  const authed = useRequireAuth()
  const { data: me } = useMe(authed)
  const { data: detailedBalance, mutate: refreshBalance } = useDetailedBalance(authed)

  const { data: packsData } = useSWR('billing-packs', () => api.billingPacks())
  const { data: historyData, isLoading: historyLoading } = useSWR(
    authed ? 'billing-history' : null,
    () => api.billingHistory()
  )

  const [paymentProvider, setPaymentProvider] = useState<'fedapay' | 'paddle'>('paddle')
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [planChangeLoading, setPlanChangeLoading] = useState<string | null>(null)
  const [historyFilter, setHistoryFilter] = useState<string>('all')
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  if (!authed) return null

  const currentPlan = (detailedBalance?.plan || me?.plan || 'free').toLowerCase()
  const availableCredits = detailedBalance?.available_credits ?? me?.credits_remaining ?? 100
  const monthlyRemaining = detailedBalance?.monthly_credits_remaining ?? availableCredits
  const monthlyLimit = detailedBalance?.monthly_credits_limit ?? me?.credits_limit ?? 100
  const purchasedRemaining = detailedBalance?.purchased_credits_remaining ?? 0
  const reservedCredits = detailedBalance?.reserved_credits ?? 0

  const monthlyConsumed = Math.max(0, monthlyLimit - monthlyRemaining)
  const consumptionPercent = Math.min(100, Math.round((monthlyConsumed / (monthlyLimit || 1)) * 100))

  const renewalDateStr = detailedBalance?.current_period_end
    ? new Date(detailedBalance.current_period_end).toLocaleDateString(locale === 'en' ? 'en-US' : 'fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  // Lancement du checkout pour un pack de crédits
  async function handleBuyPack(packKey: string) {
    setCheckoutLoading(packKey)
    setFeedbackMessage(null)
    try {
      const res = await api.createCheckout(packKey, paymentProvider)
      if (res.checkout_url) {
        window.location.href = res.checkout_url
      }
    } catch (err: any) {
      setFeedbackMessage({
        type: 'err',
        text: err?.message || 'Erreur lors de l’initialisation du paiement.',
      })
    } finally {
      setCheckoutLoading(null)
    }
  }

  // Changement de forfait direct
  async function handleChangePlan(planId: string) {
    if (planId === currentPlan) return
    setPlanChangeLoading(planId)
    setFeedbackMessage(null)
    try {
      const res = await api.changePlan(planId)
      setFeedbackMessage({
        type: 'ok',
        text: res.message || 'Formule mise à jour avec succès.',
      })
      refreshBalance()
    } catch (err: any) {
      setFeedbackMessage({
        type: 'err',
        text: err?.message || 'Impossible de changer de formule pour le moment.',
      })
    } finally {
      setPlanChangeLoading(null)
    }
  }

  // Packs de crédits
  const defaultPacks: CreditPack[] = [
    {
      key: 'mini',
      name_fr: 'Pack Mini',
      name_en: 'Mini Pack',
      credits: 300,
      price_eur: 3.99,
      price_eur_cents: 399,
      recommended: false,
      unit_price_cents: 1.33,
    },
    {
      key: 'standard',
      name_fr: 'Pack Standard',
      name_en: 'Standard Pack',
      credits: 1000,
      price_eur: 9.99,
      price_eur_cents: 999,
      recommended: true,
      unit_price_cents: 0.999,
    },
    {
      key: 'pro',
      name_fr: 'Pack Pro',
      name_en: 'Pro Pack',
      credits: 3000,
      price_eur: 24.99,
      price_eur_cents: 2499,
      recommended: false,
      unit_price_cents: 0.833,
    },
  ]
  const packs = packsData?.packs?.length ? packsData.packs : defaultPacks

  // Filtrage de l'historique
  const filteredHistory = (historyData?.entries || []).filter((entry) => {
    if (historyFilter === 'all') return true
    return entry.action_type === historyFilter
  })

  return (
    <>
      <AppHeader />
      <AppShell>
        <main id="contenu" className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-12">
          {/* Messages de feedback */}
          {feedbackMessage && (
            <div
              className={cn(
                'rounded-xl border p-4 text-xs font-medium flex items-center justify-between',
                feedbackMessage.type === 'ok'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400'
              )}
            >
              <span>{feedbackMessage.text}</span>
              <button
                onClick={() => setFeedbackMessage(null)}
                className="text-xs opacity-70 hover:opacity-100"
              >
                ✕
              </button>
            </div>
          )}

          {/* ========================================================================= */}
          {/* SECTION A : En-tête professionnel & Statut du compte                      */}
          {/* ========================================================================= */}
          <section className="flex flex-col md:flex-row md:items-center md:justify-between gap-6 pb-6 border-b border-hairline">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  {locale === 'en' ? 'Billing & AI Consumption' : 'Facturation & Consommation IA'}
                </h1>
                <span className="rounded-full bg-seal/10 px-2.5 py-0.5 text-xs font-semibold text-seal uppercase tracking-wider">
                  {currentPlan.toUpperCase()}
                </span>
                <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[11px] font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {locale === 'en' ? 'Active Account' : 'Compte actif'}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-ink-soft max-w-2xl">
                {locale === 'en'
                  ? 'Manage your subscriptions, purchased credit packs, and monitor your monthly translation and cleaning usage in real time.'
                  : 'Gérez vos abonnements, vos packs de crédits rechargeables et suivez en temps réel votre consommation IA pour la traduction et le nettoyage.'}
              </p>
              {renewalDateStr && currentPlan !== 'free' && (
                <p className="mt-2 text-xs text-ink-soft flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-seal" />
                  <span>
                    {locale === 'en' ? 'Next monthly renewal:' : 'Prochain renouvellement mensuel :'}
                  </span>
                  <strong className="text-ink font-semibold">{renewalDateStr}</strong>
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <a
                href="#packs"
                className="flex items-center gap-1.5 rounded-xl bg-seal px-4 py-2 text-xs font-semibold text-seal-ink hover:opacity-90 active:scale-95 transition-all shadow-sm"
              >
                <Coins className="h-4 w-4" />
                <span>{locale === 'en' ? 'Buy credits' : 'Acheter des crédits'}</span>
              </a>
              <a
                href="#plans"
                className="rounded-xl border border-hairline bg-sheet px-4 py-2 text-xs font-semibold text-ink hover:bg-sheet/80 transition-all"
              >
                {locale === 'en' ? 'Change plan' : 'Changer de forfait'}
              </a>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* SECTION B : Synthèse visuelle des crédits (4 cartes + jauge mensuelle)    */}
          {/* ========================================================================= */}
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                <Coins className="h-5 w-5 text-seal" />
                {locale === 'en' ? 'Credit Breakdown' : 'Synthèse des Crédits IA'}
              </h2>
              <button
                onClick={() => refreshBalance()}
                className="flex items-center gap-1 text-xs text-ink-soft hover:text-seal transition-colors"
                title="Actualiser le solde"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>{locale === 'en' ? 'Refresh' : 'Actualiser'}</span>
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Carte 1 : Total disponible */}
              <div className="rounded-2xl border-2 border-seal/40 bg-sheet p-5 shadow-xs relative overflow-hidden">
                <div className="absolute top-0 right-0 h-16 w-16 bg-seal/5 rounded-bl-full pointer-events-none" />
                <span className="text-[11px] font-semibold text-seal uppercase tracking-wider">
                  {locale === 'en' ? 'Total Available' : 'Total Disponible'}
                </span>
                <p className="mt-2 text-3xl font-extrabold font-mono text-ink">
                  {availableCredits.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  {locale === 'en' ? 'Usable for all operations' : 'Utilisables immédiatement'}
                </p>
              </div>

              {/* Carte 2 : Crédits mensuels du forfait */}
              <div className="rounded-2xl border border-hairline bg-sheet p-5 shadow-xs">
                <span className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider flex items-center gap-1">
                  <Clock className="h-3 w-3 text-seal" />
                  {locale === 'en' ? 'Monthly Plan' : 'Forfait Mensuel'}
                </span>
                <p className="mt-2 text-3xl font-extrabold font-mono text-ink">
                  {monthlyRemaining.toLocaleString()}{' '}
                  <span className="text-sm font-normal text-ink-soft">
                    / {monthlyLimit.toLocaleString()}
                  </span>
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  {locale === 'en' ? 'Renews every month' : 'Réinitialisé chaque mois'}
                </p>
              </div>

              {/* Carte 3 : Crédits achetés (ne périment jamais) */}
              <div className="rounded-2xl border border-hairline bg-sheet p-5 shadow-xs">
                <span className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-emerald-500" />
                  {locale === 'en' ? 'Purchased Packs' : 'Packs Achetés'}
                </span>
                <p className="mt-2 text-3xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                  {purchasedRemaining.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-emerald-600/80 dark:text-emerald-400/80 font-medium">
                  ★ {locale === 'en' ? 'Never expire' : 'Ne périment jamais'}
                </p>
              </div>

              {/* Carte 4 : Crédits réservés */}
              <div className="rounded-2xl border border-hairline bg-sheet p-5 shadow-xs">
                <span className="text-[11px] font-semibold text-ink-soft uppercase tracking-wider flex items-center gap-1">
                  <Layers className="h-3 w-3 text-amber-500" />
                  {locale === 'en' ? 'Currently Reserved' : 'En Traitement'}
                </span>
                <p className="mt-2 text-3xl font-extrabold font-mono text-ink">
                  {reservedCredits.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  {locale === 'en' ? 'Secured during AI run' : 'Gelés pendant l’analyse'}
                </p>
              </div>
            </div>

            {/* Jauge visuelle de consommation mensuelle */}
            <div className="rounded-2xl border border-hairline bg-sheet p-5 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-ink">
                  {locale === 'en' ? 'Monthly Quota Utilization' : 'Utilisation du quota mensuel en cours'}
                </span>
                <span className="font-mono text-ink-soft">
                  {monthlyConsumed.toLocaleString()} / {monthlyLimit.toLocaleString()} ({consumptionPercent}%)
                </span>
              </div>
              <div className="w-full bg-paper rounded-full h-2.5 overflow-hidden border border-hairline">
                <div
                  className="bg-seal h-full rounded-full transition-all duration-500"
                  style={{ width: `${consumptionPercent}%` }}
                />
              </div>
              <p className="text-[11px] text-ink-soft">
                {locale === 'en'
                  ? 'Your monthly plan credits are consumed first. When exhausted, operations draw from your lifetime purchased packs.'
                  : 'Vos crédits mensuels sont débités en priorité. Lorsqu’ils sont épuisés, le système utilise automatiquement vos crédits de packs.'}
              </p>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* SECTION C : Barème transparent des opérations                             */}
          {/* ========================================================================= */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
              <Zap className="h-5 w-5 text-seal" />
              {locale === 'en' ? 'Unit Rates & Engine Costs' : 'Barème Officiel des Opérations IA'}
            </h2>
            <p className="text-xs text-ink-soft">
              {locale === 'en'
                ? 'Fixed tariffs per operation. No hidden costs or unlimited surprises.'
                : 'Tarifs transparents à l’unité. Aucun surcoût caché et prévisualisation systématique avant validation.'}
            </p>

            <div className="overflow-x-auto rounded-2xl border border-hairline bg-sheet">
              <table className="w-full text-left text-xs">
                <thead className="bg-sheet/80 border-b border-hairline uppercase text-[10px] tracking-wider text-ink-soft">
                  <tr>
                    <th className="px-4 py-3">Opération</th>
                    <th className="px-4 py-3">Moteur IA</th>
                    <th className="px-4 py-3">Unité de facturation</th>
                    <th className="px-4 py-3 text-right">Tarif</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  <tr className="hover:bg-sheet/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-ink">Reconnaissance de texte (OCR)</td>
                    <td className="px-4 py-3 text-ink-soft">MangaOCR / PaddleOCR / Tesseract</td>
                    <td className="px-4 py-3 text-ink-soft">1 page analysée</td>
                    <td className="px-4 py-3 font-mono font-bold text-seal text-right">1 crédit</td>
                  </tr>
                  <tr className="hover:bg-sheet/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-ink">Traduction Standard</td>
                    <td className="px-4 py-3 text-ink-soft flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 text-seal" />
                      Ollama Local (Llama 3.1)
                    </td>
                    <td className="px-4 py-3 text-ink-soft">1 000 caractères source (arrondi sup.)</td>
                    <td className="px-4 py-3 font-mono font-bold text-seal text-right">1 crédit</td>
                  </tr>
                  <tr className="hover:bg-sheet/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-ink">Traduction Premium</td>
                    <td className="px-4 py-3 text-ink-soft flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      DeepL API Premium
                    </td>
                    <td className="px-4 py-3 text-ink-soft">1 000 caractères source (arrondi sup.)</td>
                    <td className="px-4 py-3 font-mono font-bold text-amber-600 dark:text-amber-400 text-right">4 crédits</td>
                  </tr>
                  <tr className="hover:bg-sheet/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-ink">Nettoyage Standard</td>
                    <td className="px-4 py-3 text-ink-soft flex items-center gap-1.5">
                      <Cpu className="h-3.5 w-3.5 text-seal" />
                      OpenCV (Telea & Topologique)
                    </td>
                    <td className="px-4 py-3 text-ink-soft">1 page nettoyée</td>
                    <td className="px-4 py-3 font-mono font-bold text-seal text-right">1 crédit</td>
                  </tr>
                  <tr className="hover:bg-sheet/40 transition-colors">
                    <td className="px-4 py-3 font-semibold text-ink">Nettoyage Neuronal</td>
                    <td className="px-4 py-3 text-ink-soft flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      LaMa ONNX
                    </td>
                    <td className="px-4 py-3 text-ink-soft">1 page (jusqu’à 5 zones complexes)</td>
                    <td className="px-4 py-3 font-mono font-bold text-amber-600 dark:text-amber-400 text-right">2 crédits</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* SECTION D : Grille des 4 abonnements (Free, Creator, Team, Studio)        */}
          {/* ========================================================================= */}
          <section id="plans" className="space-y-6 pt-6 border-t border-hairline">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-xl font-bold tracking-tight">
                  {locale === 'en' ? 'Subscription Plans' : 'Formules d’Abonnement'}
                </h2>
                <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 font-mono text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                  {locale === 'en'
                    ? 'Initial proposal, not yet validated by actual costs'
                    : 'Proposition de départ, non encore validée par les coûts réels'}
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {locale === 'en'
                  ? 'Predictable monthly allowance tailored to scanlation teams and solo creators.'
                  : 'Choisissez un forfait mensuel adapté au rythme de publication de vos séries.'}
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {/* Formule 1 : Free */}
              <div
                className={cn(
                  'flex flex-col justify-between rounded-2xl border p-6 transition-all',
                  currentPlan === 'free'
                    ? 'border-seal bg-seal/5 ring-1 ring-seal'
                    : 'border-hairline bg-sheet'
                )}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base text-ink">Free</h3>
                    {currentPlan === 'free' && (
                      <span className="rounded-full bg-seal/20 px-2 py-0.5 text-[10px] font-bold text-seal uppercase">
                        {locale === 'en' ? 'Current' : 'Actuel'}
                      </span>
                    )}
                  </div>
                  <p className="mt-4 text-3xl font-extrabold font-mono text-ink">
                    0 € <span className="text-xs font-normal text-ink-soft">/ mois</span>
                  </p>
                  <p className="mt-2 font-mono text-xs font-semibold text-seal">
                    {locale === 'en' ? '100 monthly credits' : '100 crédits mensuels'}
                  </p>
                  <div className="mt-4 border-t border-hairline pt-4">
                    <p className="text-xs text-ink leading-relaxed">
                      1 projet · 50 Mo · Glossaire de 30 entrées
                    </p>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-hairline">
                  {currentPlan === 'free' ? (
                    <Button variant="outline" className="w-full text-xs" disabled>
                      {locale === 'en' ? 'Current plan' : 'Forfait actuel'}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full text-xs"
                      onClick={() => handleChangePlan('free')}
                      disabled={planChangeLoading === 'free'}
                    >
                      {locale === 'en' ? 'Switch to Free' : 'Basculer sur Free'}
                    </Button>
                  )}
                </div>
              </div>

              {/* Formule 2 : Creator */}
              <div
                className={cn(
                  'flex flex-col justify-between rounded-2xl border p-6 transition-all relative',
                  currentPlan === 'creator'
                    ? 'border-seal bg-seal/5 ring-1 ring-seal'
                    : 'border-hairline bg-sheet'
                )}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base text-ink">Creator</h3>
                    {currentPlan === 'creator' && (
                      <span className="rounded-full bg-seal/20 px-2 py-0.5 text-[10px] font-bold text-seal uppercase">
                        {locale === 'en' ? 'Current' : 'Actuel'}
                      </span>
                    )}
                  </div>
                  <p className="mt-4 text-3xl font-extrabold font-mono text-ink">
                    8,99 € <span className="text-xs font-normal text-ink-soft">/ mois</span>
                  </p>
                  <p className="mt-2 font-mono text-xs font-semibold text-seal">
                    {locale === 'en' ? '500 monthly credits' : '500 crédits mensuels'}
                  </p>
                  <div className="mt-4 border-t border-hairline pt-4">
                    <p className="text-xs text-ink leading-relaxed">
                      5 projets · 2 Go · Mémoire de traduction
                    </p>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-hairline">
                  {currentPlan === 'creator' ? (
                    <Button variant="outline" className="w-full text-xs" disabled>
                      {locale === 'en' ? 'Current plan' : 'Forfait actuel'}
                    </Button>
                  ) : (
                    <Button
                      className="w-full text-xs bg-seal text-seal-ink hover:opacity-90"
                      onClick={() => handleChangePlan('creator')}
                      disabled={planChangeLoading === 'creator'}
                    >
                      {planChangeLoading === 'creator' ? (locale === 'en' ? 'Activating...' : 'Activation...') : (locale === 'en' ? 'Choose Creator' : 'Choisir Creator')}
                    </Button>
                  )}
                </div>
              </div>

              {/* Formule 3 : Team */}
              <div
                className={cn(
                  'flex flex-col justify-between rounded-2xl border p-6 transition-all relative',
                  currentPlan === 'team'
                    ? 'border-seal bg-seal/5 ring-1 ring-seal'
                    : 'border-seal/60 bg-sheet'
                )}
              >
                <div className="absolute -top-3 right-4 rounded-full bg-seal px-2.5 py-0.5 text-[10px] font-bold text-seal-ink uppercase shadow-xs">
                  {locale === 'en' ? 'Recommended' : 'Recommandé'}
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base text-ink">Team</h3>
                    {currentPlan === 'team' && (
                      <span className="rounded-full bg-seal/20 px-2 py-0.5 text-[10px] font-bold text-seal uppercase">
                        {locale === 'en' ? 'Current' : 'Actuel'}
                      </span>
                    )}
                  </div>
                  <p className="mt-4 text-3xl font-extrabold font-mono text-ink">
                    24,99 € <span className="text-xs font-normal text-ink-soft">/ mois</span>
                  </p>
                  <p className="mt-2 font-mono text-xs font-semibold text-seal">
                    {locale === 'en' ? '1,500 monthly credits' : '1 500 crédits mensuels'}
                  </p>
                  <div className="mt-4 border-t border-hairline pt-4">
                    <p className="text-xs text-ink leading-relaxed">
                      3 membres · 10 projets · 10 Go partagés
                    </p>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-hairline">
                  {currentPlan === 'team' ? (
                    <Button variant="outline" className="w-full text-xs" disabled>
                      {locale === 'en' ? 'Current plan' : 'Forfait actuel'}
                    </Button>
                  ) : (
                    <Button
                      className="w-full text-xs bg-seal text-seal-ink hover:opacity-90"
                      onClick={() => handleChangePlan('team')}
                      disabled={planChangeLoading === 'team'}
                    >
                      {planChangeLoading === 'team' ? (locale === 'en' ? 'Activating...' : 'Activation...') : (locale === 'en' ? 'Choose Team' : 'Choisir Team')}
                    </Button>
                  )}
                </div>
              </div>

              {/* Formule 4 : Studio */}
              <div
                className={cn(
                  'flex flex-col justify-between rounded-2xl border p-6 transition-all',
                  currentPlan === 'studio'
                    ? 'border-seal bg-seal/5 ring-1 ring-seal'
                    : 'border-hairline bg-sheet'
                )}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-base text-ink">Studio</h3>
                    {currentPlan === 'studio' && (
                      <span className="rounded-full bg-seal/20 px-2 py-0.5 text-[10px] font-bold text-seal uppercase">
                        {locale === 'en' ? 'Current' : 'Actuel'}
                      </span>
                    )}
                  </div>
                  <p className="mt-4 text-3xl font-extrabold font-mono text-ink">
                    79 €+ <span className="text-xs font-normal text-ink-soft">/ mois</span>
                  </p>
                  <p className="mt-2 font-mono text-xs font-semibold text-seal">
                    {locale === 'en' ? 'Custom quotas' : 'Quotas personnalisés'}
                  </p>
                  <div className="mt-4 border-t border-hairline pt-4">
                    <p className="text-xs text-ink-soft leading-relaxed">
                      {locale === 'en'
                        ? 'On quote, based on needs and available capacity.'
                        : 'Sur devis, selon les besoins et les capacités réellement disponibles.'}
                    </p>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-hairline">
                  <a
                    href="mailto:contact@taurge.com?subject=Demande%20Offre%20Studio"
                    className="flex items-center justify-center rounded-xl border border-hairline px-4 py-2 text-xs font-semibold text-ink hover:bg-sheet transition-all"
                  >
                    {locale === 'en' ? 'Contact team' : 'Contacter l’équipe'}
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* ========================================================================= */}
          {/* SECTION E : Achat de packs de crédits supplémentaires                     */}
          {/* ========================================================================= */}
          <section id="packs" className="space-y-6 pt-6 border-t border-hairline">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight">
                  {locale === 'en' ? 'Extra Credit Packs' : 'Recharge de Crédits Supplémentaires'}
                </h2>
                <p className="mt-1 text-xs text-ink-soft">
                  {locale === 'en'
                    ? 'Credits never expire. Top up at any time to handle large chapters.'
                    : 'Les crédits achetés n’expirent jamais et sont conservés d’un mois à l’autre sans limite de temps.'}
                </p>
              </div>

              {/* Sélecteur de méthode de paiement (FedaPay vs Paddle) */}
              <div className="flex items-center gap-2 bg-sheet p-1 rounded-xl border border-hairline shrink-0">
                <button
                  type="button"
                  onClick={() => setPaymentProvider('paddle')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    paymentProvider === 'paddle'
                      ? 'bg-paper text-ink shadow-xs'
                      : 'text-ink-soft hover:text-ink'
                  )}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Carte Bancaire (Paddle)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentProvider('fedapay')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    paymentProvider === 'fedapay'
                      ? 'bg-paper text-ink shadow-xs'
                      : 'text-ink-soft hover:text-ink'
                  )}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  <span>Mobile Money (FedaPay)</span>
                </button>
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {packs.map((pack) => (
                <div
                  key={pack.key}
                  className={cn(
                    'flex flex-col justify-between rounded-2xl border p-6 bg-sheet relative transition-all hover:border-seal/40',
                    pack.recommended ? 'border-seal ring-1 ring-seal' : 'border-hairline'
                  )}
                >
                  {pack.recommended && (
                    <div className="absolute -top-3 right-4 rounded-full bg-seal px-2.5 py-0.5 text-[10px] font-bold text-seal-ink uppercase shadow-xs">
                      Le plus populaire
                    </div>
                  )}

                  <div>
                    <h3 className="font-bold text-base text-ink">
                      {locale === 'en' ? pack.name_en : pack.name_fr}
                    </h3>
                    <p className="mt-1 text-xs text-ink-soft">
                      {pack.key === 'mini' && 'Pour traduire un lot de quelques pages rapidement.'}
                      {pack.key === 'standard' && 'Le meilleur compromis pour plusieurs chapitres complets.'}
                      {pack.key === 'pro' && 'Volume idéal pour un volume entier ou séries longues.'}
                    </p>
                    <p className="mt-4 text-3xl font-extrabold font-mono text-ink">
                      {pack.credits.toLocaleString()}{' '}
                      <span className="text-sm font-normal text-ink-soft">crédits</span>
                    </p>
                    <p className="mt-2 text-xs text-ink-soft font-mono">
                      {pack.price_eur} €{' '}
                      <span className="text-[10px] opacity-75">
                        (~{(pack.price_eur / (pack.credits / 100)).toFixed(2)} c€ / 100 crédits)
                      </span>
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-hairline">
                    <Button
                      onClick={() => handleBuyPack(pack.key)}
                      disabled={checkoutLoading === pack.key}
                      className={cn(
                        'w-full text-xs font-semibold flex items-center justify-center gap-2',
                        pack.recommended
                          ? 'bg-seal text-seal-ink hover:opacity-90'
                          : 'bg-sheet border border-hairline hover:bg-sheet/80 text-ink'
                      )}
                    >
                      {checkoutLoading === pack.key ? (
                        <>
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-seal-ink border-t-transparent" />
                          <span>Redirection...</span>
                        </>
                      ) : (
                        <>
                          <span>Acheter {pack.price_eur} €</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ========================================================================= */}
          {/* SECTION F : Historique détaillé des consommations & audit                 */}
          {/* ========================================================================= */}
          <section className="space-y-4 pt-6 border-t border-hairline">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight">
                  {locale === 'en' ? 'Usage & Transaction History' : 'Historique Détaillé des Débits'}
                </h2>
                <p className="mt-1 text-xs text-ink-soft">
                  {locale === 'en'
                    ? 'Auditable log of each AI operation and recharge.'
                    : 'Registre comptable traçant chaque opération avec le moteur utilisé et les caractères traités.'}
                </p>
              </div>

              {/* Filtre par type d’opération */}
              <div className="flex items-center gap-1.5 bg-sheet p-1 rounded-xl border border-hairline text-xs shrink-0">
                <Filter className="h-3.5 w-3.5 text-ink-soft ml-1.5" />
                <button
                  type="button"
                  onClick={() => setHistoryFilter('all')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg transition-all',
                    historyFilter === 'all' ? 'bg-paper text-ink font-semibold shadow-xs' : 'text-ink-soft'
                  )}
                >
                  Tous
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('ocr')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg transition-all',
                    historyFilter === 'ocr' ? 'bg-paper text-ink font-semibold shadow-xs' : 'text-ink-soft'
                  )}
                >
                  OCR
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('translate')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg transition-all',
                    historyFilter === 'translate' ? 'bg-paper text-ink font-semibold shadow-xs' : 'text-ink-soft'
                  )}
                >
                  Traduction
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryFilter('clean')}
                  className={cn(
                    'px-2.5 py-1 rounded-lg transition-all',
                    historyFilter === 'clean' ? 'bg-paper text-ink font-semibold shadow-xs' : 'text-ink-soft'
                  )}
                >
                  Nettoyage
                </button>
              </div>
            </div>

            {historyLoading ? (
              <div className="p-8 text-center text-xs text-ink-soft">
                {tCommon('loading')}
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="rounded-2xl border border-hairline bg-sheet p-8 text-center text-xs text-ink-soft">
                Aucune opération enregistrée pour ce filtre.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-hairline bg-sheet">
                <table className="w-full text-left text-xs">
                  <thead className="bg-sheet/80 border-b border-hairline uppercase text-[10px] tracking-wider text-ink-soft">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Opération</th>
                      <th className="px-4 py-3">Moteur</th>
                      <th className="px-4 py-3">Détail</th>
                      <th className="px-4 py-3 text-right">Variation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline font-sans">
                    {filteredHistory.map((item) => {
                      const dateFormatted = new Date(item.created_at).toLocaleDateString(
                        locale === 'en' ? 'en-US' : 'fr-FR',
                        {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        }
                      )
                      const isAddition = item.amount < 0
                      return (
                        <tr key={item.id} className="hover:bg-sheet/40 transition-colors">
                          <td className="px-4 py-3 font-mono text-ink-soft whitespace-nowrap">
                            {dateFormatted}
                          </td>
                          <td className="px-4 py-3 font-semibold text-ink uppercase tracking-wider text-[11px]">
                            {item.action_type}
                          </td>
                          <td className="px-4 py-3 text-ink-soft">
                            {item.engine_used || 'standard'}
                          </td>
                          <td className="px-4 py-3 text-ink-soft max-w-xs truncate">
                            {item.description || '—'}
                          </td>
                          <td
                            className={cn(
                              'px-4 py-3 font-mono font-bold text-right whitespace-nowrap',
                              isAddition
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-ink'
                            )}
                          >
                            {isAddition ? `+${Math.abs(item.amount)}` : `-${item.amount}`} crédits
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>
      </AppShell>
    </>
  )
}
