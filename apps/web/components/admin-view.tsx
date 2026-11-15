'use client'

import { useEffect, useState } from 'react'
import {
  ShieldAlert,
  Users,
  FolderKanban,
  Activity,
  Coins,
  Loader2,
  PlusCircle,
  Globe,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Save,
  BarChart3,
  Layers,
  Sparkles,
} from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { useLocale } from '@/i18n/provider'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/catalog'
import { useRequireAuth } from '@/lib/hooks'
import type { AdminJob, AdminStats, AdminUser, DeepLQuotaStatus, ProfitabilityMetrics } from '@/lib/types'
import { cn } from '@/lib/utils'

export function AdminView() {
  const authed = useRequireAuth()
  const locale = useLocale()
  const isEn = locale === 'en'
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [jobs, setJobs] = useState<AdminJob[]>([])
  const [deeplQuota, setDeeplQuota] = useState<DeepLQuotaStatus | null>(null)
  const [profitability, setProfitability] = useState<ProfitabilityMetrics | null>(null)
  const [newDeeplLimit, setNewDeeplLimit] = useState<number>(500000)
  const [deeplSaving, setDeeplSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [grantingId, setGrantingId] = useState<string | null>(null)
  const [grantDelta, setGrantDelta] = useState(50)
  const [grantReason, setGrantReason] = useState(
    isEn ? 'Administrator bonus' : 'Bonus administrateur',
  )

  useEffect(() => {
    setGrantReason((prev) => {
      if (prev === 'Bonus administrateur' || prev === 'Administrator bonus') {
        return isEn ? 'Administrator bonus' : 'Bonus administrateur'
      }
      return prev
    })
  }, [isEn])

  useEffect(() => {
    if (!authed) return
    let cancelled = false
    Promise.all([
      api.adminStats(),
      api.adminUsers(),
      api.adminJobs(),
      api.getDeepLQuota().catch(() => null),
      api.getAdminProfitability().catch(() => null),
    ])
      .then(([s, u, j, dq, prof]) => {
        if (cancelled) return
        setStats(s)
        setUsers(u)
        setJobs(j)
        if (dq) {
          setDeeplQuota(dq)
          setNewDeeplLimit(dq.chars_limit)
        }
        if (prof) {
          setProfitability(prof)
        }
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof Error
            ? err.message
            : isEn
              ? 'Admin access denied.'
              : 'Accès administrateur refusé.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authed, isEn])

  if (!authed) return null

  const handleGrant = async (userId: string) => {
    try {
      const updated = await api.adminGrantCredits(userId, grantDelta, grantReason)
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)))
      setGrantingId(null)
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : isEn
            ? 'Failed to grant credits.'
            : 'Impossible d’attribuer les crédits.',
      )
    }
  }

  const handleUpdateDeeplLimit = async () => {
    if (newDeeplLimit < 10000) {
      alert(isEn ? 'Minimum quota is 10,000 characters.' : 'Le contingent minimum est de 10 000 caractères.')
      return
    }
    try {
      setDeeplSaving(true)
      const res = await api.updateDeepLQuotaLimit(newDeeplLimit)
      setDeeplQuota(res)
      alert(
        isEn
          ? `DeepL monthly quota successfully updated to ${newDeeplLimit.toLocaleString()} chars.`
          : `Contingent mensuel DeepL mis à jour à ${newDeeplLimit.toLocaleString()} caractères.`,
      )
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : isEn
            ? 'Failed to update DeepL quota limit.'
            : 'Échec de la mise à jour du quota DeepL.',
      )
    } finally {
      setDeeplSaving(false)
    }
  }

  return (
    <>
      <AppHeader />
      <main id="contenu" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b-[1.5px] border-ink pb-5">
          <div>
            <span className="label-mono text-seal">
              {isEn ? 'Administration Panel' : 'Panneau d’administration'}
            </span>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">
              {isEn ? 'System, Billing & Margins' : 'Système, Facturation & Marges'}
            </h1>
          </div>
          <Link href="/dashboard" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            {isEn ? 'Back to Dashboard' : 'Retour au tableau de bord'}
          </Link>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-16 text-ink-soft">
            <Loader2 className="size-5 animate-spin text-seal" />
            <span>
              {isEn ? 'Loading system metrics…' : 'Chargement des métriques système…'}
            </span>
          </div>
        )}

        {error && (
          <div className="mt-8 border-[1.5px] border-ink bg-sheet p-8 text-center">
            <ShieldAlert className="mx-auto size-8 text-danger" />
            <h2 className="mt-3 text-xl font-bold">
              {isEn ? 'Restricted Access' : 'Accès restreint'}
            </h2>
            <p className="mt-1 text-sm text-ink-soft">{error}</p>
          </div>
        )}

        {stats && !error && (
          <div className="mt-8 flex flex-col gap-10">
            {/* KPI CARDS */}
            <section
              aria-label={isEn ? 'Platform statistics' : 'Statistiques de la plateforme'}
              className="grid grid-cols-2 gap-4 sm:grid-cols-4"
            >
              <div className="border-[1.5px] border-ink bg-sheet p-4">
                <div className="flex items-center gap-2 text-ink-soft">
                  <Users className="size-4 text-seal" />
                  <span className="label-mono">{isEn ? 'Users' : 'Utilisateurs'}</span>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold">{stats.users_count}</p>
              </div>
              <div className="border-[1.5px] border-ink bg-sheet p-4">
                <div className="flex items-center gap-2 text-ink-soft">
                  <FolderKanban className="size-4 text-seal" />
                  <span className="label-mono">
                    {isEn ? 'Projects / Pages' : 'Projets / Planches'}
                  </span>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold">
                  {stats.projects_count} <span className="text-sm font-normal text-ink-soft">/ {stats.pages_count} p.</span>
                </p>
              </div>
              <div className="border-[1.5px] border-ink bg-sheet p-4">
                <div className="flex items-center gap-2 text-ink-soft">
                  <Coins className="size-4 text-seal" />
                  <span className="label-mono">
                    {isEn ? 'Credits Used / Paid Tx' : 'Crédits utilisés / Tx payées'}
                  </span>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold">
                  {stats.total_credits_used} <span className="text-sm font-normal text-ink-soft">({stats.paid_transactions_count} tx)</span>
                </p>
              </div>
              <div className="border-[1.5px] border-ink bg-sheet p-4">
                <div className="flex items-center gap-2 text-ink-soft">
                  <Activity className="size-4 text-seal" />
                  <span className="label-mono">
                    {isEn ? 'Jobs (Active / Failed)' : 'Tâches (Actives / Échecs)'}
                  </span>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold">
                  {stats.active_jobs_count}{' '}
                  <span className={cn('text-sm font-normal', stats.failed_jobs_count > 0 ? 'text-danger' : 'text-ink-soft')}>
                    / {stats.failed_jobs_count} {isEn ? 'failed' : 'en échec'}
                  </span>
                </p>
              </div>
            </section>

            {/* CONTINGENT GLOBAL DEEPL (500K CARACTÈRES) */}
            {deeplQuota && (() => {
              const deeplPercent = deeplQuota.percent_used ?? deeplQuota.usage_percent ?? (deeplQuota.chars_limit ? (deeplQuota.chars_used / deeplQuota.chars_limit * 100) : 0)
              const isExhausted = deeplQuota.is_blocked || deeplPercent >= 100
              const isWarning = !isExhausted && deeplPercent >= 80

              return (
                <section aria-labelledby="admin-deepl-quota-heading" className="border-[1.5px] border-ink bg-sheet p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-4">
                    <div>
                      <h2 id="admin-deepl-quota-heading" className="text-xl font-bold flex items-center gap-2">
                        <Globe className="size-5 text-purple-600" />
                        <span>{isEn ? 'Global DeepL Contingent & Safety Gate' : 'Contingent Global DeepL & Protection Débordement'}</span>
                      </h2>
                      <p className="text-xs text-ink-soft mt-1">
                        {isEn
                          ? 'Protects against API overrun: measured from actual outbound API characters. Auto-blocks when reaching 100%.'
                          : 'Protection anti-dépassement : mesuré sur les requêtes réellement envoyées à DeepL. Bloqué automatiquement à 100%.'}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'px-3 py-1 rounded-full font-mono text-xs font-semibold uppercase tracking-wider',
                        !isWarning && !isExhausted
                          ? 'bg-emerald-100 text-emerald-800'
                          : isWarning
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800',
                      )}
                    >
                      {!isWarning && !isExhausted
                        ? (isEn ? 'Quota OK' : 'Sous contrôle')
                        : isWarning
                          ? (isEn ? 'Warning 80%+' : 'Attention 80%+')
                          : (isEn ? 'Exhausted' : 'Épuisé / Bloqué')}
                    </span>
                  </div>

                  <div className="mt-5 grid gap-5 sm:grid-cols-3">
                    <div className="border border-hairline bg-paper p-4 rounded-lg">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">
                        {isEn ? 'Consumed This Month' : 'Caractères réels envoyés'}
                      </span>
                      <p className="mt-1 font-mono text-2xl font-bold text-ink">
                        {deeplQuota.chars_used.toLocaleString()} <span className="text-xs font-normal text-ink-soft">/ {deeplQuota.chars_limit.toLocaleString()}</span>
                      </p>
                      <p className="text-[11px] text-ink-soft mt-1">
                        {deeplQuota.requests_count ?? 0} {isEn ? 'outbound DeepL requests' : 'requêtes HTTP DeepL'}
                      </p>
                    </div>

                    <div className="border border-hairline bg-paper p-4 rounded-lg">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">
                        {isEn ? 'Remaining in Free Tier' : 'Caractères restants'}
                      </span>
                      <p className="mt-1 font-mono text-2xl font-bold text-emerald-600">
                        {deeplQuota.chars_remaining.toLocaleString()}
                      </p>
                      <p className="text-[11px] text-ink-soft mt-1">
                        {deeplPercent.toFixed(1)}% {isEn ? 'used' : 'consommés'}
                      </p>
                    </div>

                    <div className="border border-hairline bg-paper p-4 rounded-lg flex flex-col justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">
                        {isEn ? 'Configure Monthly Limit' : 'Configurer le plafond'}
                      </span>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          min="10000"
                          step="10000"
                          value={newDeeplLimit}
                          onChange={(e) => setNewDeeplLimit(Number(e.target.value))}
                          className="h-8 w-full rounded border border-hairline bg-sheet px-2 font-mono text-xs"
                        />
                        <Button size="sm" onClick={handleUpdateDeeplLimit} disabled={deeplSaving}>
                          {deeplSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                          <span className="hidden sm:inline">{isEn ? 'Save' : 'Valider'}</span>
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="h-2.5 w-full overflow-hidden rounded-full border border-hairline bg-paper">
                      <div
                        className={cn(
                          'h-full transition-all duration-500',
                          !isWarning && !isExhausted
                            ? 'bg-purple-600'
                            : isWarning
                              ? 'bg-amber-500'
                              : 'bg-rose-600',
                        )}
                        style={{ width: `${Math.min(100, deeplPercent)}%` }}
                      />
                    </div>
                  </div>
                </section>
              )
            })()}

            {/* TABLEAU DE BORD DE RENTABILITÉ & MARGES BRUTES */}
            {profitability && (
              <section aria-labelledby="admin-profit-heading" className="border-[1.5px] border-ink bg-sheet p-6">
                <div className="border-b border-hairline pb-4">
                  <h2 id="admin-profit-heading" className="text-xl font-bold flex items-center gap-2">
                    <TrendingUp className="size-5 text-emerald-600" />
                    <span>{isEn ? 'Gross Margin & Engine Unit Economics' : 'Rentabilité & Marge Brute par Moteur'}</span>
                  </h2>
                  <p className="text-xs text-ink-soft mt-1">
                    {isEn
                      ? 'Monitors revenue collected vs actual infrastructure and provider costs.'
                      : 'Suivi en direct du chiffre d’affaires encaissé face aux coûts réels fournisseurs et infrastructure.'}
                  </p>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <div className="border border-hairline bg-paper p-4 rounded-lg">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">
                      {isEn ? 'Total Revenue (Paid Tx)' : 'Chiffre d’affaires encaissé'}
                    </span>
                    <p className="mt-1 font-mono text-2xl font-bold text-ink">
                      {profitability.total_revenue_eur.toFixed(2)} €
                    </p>
                    <p className="text-[11px] text-ink-soft mt-0.5">
                      {isEn ? 'From credit packs & subscriptions' : 'Via packs de crédits et abonnements'}
                    </p>
                  </div>

                  <div className="border border-hairline bg-paper p-4 rounded-lg">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">
                      {isEn ? 'Provider Costs (Audited)' : 'Coûts Réels Fournisseurs'}
                    </span>
                    <p className="mt-1 font-mono text-2xl font-bold text-rose-600">
                      {profitability.total_provider_cost_eur.toFixed(4)} €
                    </p>
                    <p className="text-[11px] text-ink-soft mt-0.5">
                      {isEn ? 'Direct API consumption recorded' : 'Consommation API réelle comptabilisée'}
                    </p>
                  </div>

                  <div className="border border-hairline bg-paper p-4 rounded-lg">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">
                      {isEn ? 'Gross Margin' : 'Marge Brute Taurge'}
                    </span>
                    <p className="mt-1 font-mono text-2xl font-bold text-emerald-600">
                      {profitability.gross_margin_eur.toFixed(2)} €{' '}
                      <span className="text-sm font-normal text-ink-soft">({profitability.gross_margin_percent.toFixed(1)}%)</span>
                    </p>
                    <p className="text-[11px] text-ink-soft mt-0.5">
                      {isEn ? 'After direct provider debit' : 'Après déduction directe des coûts API'}
                    </p>
                  </div>
                </div>

                {/* Répartition de consommation par moteur */}
                {profitability.engine_stats && Object.keys(profitability.engine_stats).length > 0 && (
                  <div className="mt-5 border border-hairline rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-paper font-mono uppercase text-[10px] text-ink-soft border-b border-hairline">
                        <tr>
                          <th className="px-4 py-2.5">{isEn ? 'Engine / Service' : 'Moteur / Service'}</th>
                          <th className="px-4 py-2.5">{isEn ? 'Total Operations' : 'Opérations réalisées'}</th>
                          <th className="px-4 py-2.5">{isEn ? 'Credits Debited' : 'Crédits débités'}</th>
                          <th className="px-4 py-2.5">{isEn ? 'Provider Cost' : 'Coût Fournisseur'}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline bg-sheet">
                        {Object.entries(profitability.engine_stats).map(([eng, data]) => (
                          <tr key={eng}>
                            <td className="px-4 py-2.5 font-medium">{eng}</td>
                            <td className="px-4 py-2.5 font-mono">{data.count}</td>
                            <td className="px-4 py-2.5 font-mono font-semibold">{data.credits} cr</td>
                            <td className="px-4 py-2.5 font-mono text-ink-soft">{data.provider_cost.toFixed(4)} €</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {/* USERS TABLE */}
            <section aria-labelledby="admin-users-heading">
              <h2 id="admin-users-heading" className="text-xl font-bold tracking-tight mb-3">
                {isEn
                  ? `Accounts & Credit Balances (${users.length})`
                  : `Comptes et soldes de crédits (${users.length})`}
              </h2>
              <div className="overflow-x-auto border-[1.5px] border-ink bg-sheet">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-ink bg-paper font-mono text-xs uppercase text-ink-soft">
                    <tr>
                      <th className="px-4 py-2.5">{isEn ? 'Email' : 'E-mail'}</th>
                      <th className="px-4 py-2.5">{isEn ? 'Plan' : 'Formule'}</th>
                      <th className="px-4 py-2.5">{isEn ? 'Credits' : 'Crédits'}</th>
                      <th className="px-4 py-2.5">{isEn ? 'Projects' : 'Projets'}</th>
                      <th className="px-4 py-2.5">{isEn ? 'Actions' : 'Actions'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {users.map((u) => (
                      <tr key={u.id}>
                        <td className="px-4 py-3 font-medium">
                          {u.email}
                          {u.is_admin && (
                            <span className="ml-2 rounded bg-seal px-1.5 py-0.5 font-mono text-[10px] font-bold text-seal-ink">
                              ADMIN
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs uppercase">{u.plan}</td>
                        <td className="px-4 py-3 font-mono font-bold">{u.credits_remaining}</td>
                        <td className="px-4 py-3 font-mono text-xs">{u.projects_count}</td>
                        <td className="px-4 py-3">
                          {grantingId === u.id ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <input
                                type="number"
                                value={grantDelta}
                                onChange={(e) => setGrantDelta(Number(e.target.value))}
                                className="h-7 w-20 rounded border border-hairline bg-paper px-2 font-mono text-xs"
                              />
                              <input
                                type="text"
                                value={grantReason}
                                onChange={(e) => setGrantReason(e.target.value)}
                                className="h-7 w-40 rounded border border-hairline bg-paper px-2 text-xs"
                                placeholder={isEn ? 'Reason' : 'Motif'}
                              />
                              <Button size="sm" onClick={() => handleGrant(u.id)}>
                                {isEn ? 'Apply' : 'Appliquer'}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setGrantingId(null)}>
                                {isEn ? 'Cancel' : 'Annuler'}
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setGrantingId(u.id)}
                              className="inline-flex items-center gap-1 rounded border border-hairline bg-paper px-2.5 py-1 font-mono text-xs font-semibold hover:bg-muted"
                            >
                              <PlusCircle className="size-3.5 text-seal" />
                              {isEn ? 'Grant Credits' : 'Attribuer des crédits'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* RECENT JOBS */}
            <section aria-labelledby="admin-jobs-heading">
              <h2 id="admin-jobs-heading" className="text-xl font-bold tracking-tight mb-3">
                {isEn
                  ? `Recent Background Jobs (${jobs.length})`
                  : `Tâches d’arrière-plan récentes (${jobs.length})`}
              </h2>
              <div className="overflow-x-auto border-[1.5px] border-ink bg-sheet">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-ink bg-paper font-mono text-xs uppercase text-ink-soft">
                    <tr>
                      <th className="px-4 py-2.5">{isEn ? 'Type' : 'Type'}</th>
                      <th className="px-4 py-2.5">{isEn ? 'Status' : 'Statut'}</th>
                      <th className="px-4 py-2.5">{isEn ? 'Progress' : 'Progression'}</th>
                      <th className="px-4 py-2.5">{isEn ? 'Message / Error' : 'Message / Erreur'}</th>
                      <th className="px-4 py-2.5">{isEn ? 'Created' : 'Créée le'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {jobs.map((j) => (
                      <tr key={j.id}>
                        <td className="px-4 py-2.5 font-mono text-xs">{j.job_type}</td>
                        <td className="px-4 py-2.5 font-mono text-xs font-bold uppercase">{j.status}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{j.progress_percent}%</td>
                        <td className="px-4 py-2.5 text-xs">
                          <p>{j.message}</p>
                          {j.error_message && <p className="text-danger font-mono text-[11px]">{j.error_message}</p>}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-ink-soft">{formatDateTime(j.created_at, locale)}</td>
                      </tr>
                    ))}
                    {jobs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-ink-soft">
                          {isEn
                            ? 'No background jobs recorded yet.'
                            : 'Aucune tâche d’arrière-plan enregistrée pour le moment.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  )
}
