'use client'

import { useEffect, useState } from 'react'
import { ShieldAlert, Users, FolderKanban, Activity, Coins, Loader2, PlusCircle } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { useLocale } from '@/i18n/provider'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/catalog'
import { useRequireAuth } from '@/lib/hooks'
import type { AdminJob, AdminStats, AdminUser } from '@/lib/types'
import { cn } from '@/lib/utils'

export function AdminView() {
  const authed = useRequireAuth()
  const locale = useLocale()
  const isEn = locale === 'en'
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [jobs, setJobs] = useState<AdminJob[]>([])
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
    Promise.all([api.adminStats(), api.adminUsers(), api.adminJobs()])
      .then(([s, u, j]) => {
        if (cancelled) return
        setStats(s)
        setUsers(u)
        setJobs(j)
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
              {isEn ? 'System & Operations' : 'Système & Opérations'}
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
