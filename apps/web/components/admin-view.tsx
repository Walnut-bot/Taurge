'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShieldAlert, Users, FolderKanban, Activity, Coins, Loader2, PlusCircle } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { api } from '@/lib/api'
import { formatDateTime } from '@/lib/catalog'
import { useRequireAuth } from '@/lib/hooks'
import type { AdminJob, AdminStats, AdminUser } from '@/lib/types'
import { cn } from '@/lib/utils'

export function AdminView() {
  const authed = useRequireAuth()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [jobs, setJobs] = useState<AdminJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [grantingId, setGrantingId] = useState<string | null>(null)
  const [grantDelta, setGrantDelta] = useState(50)
  const [grantReason, setGrantReason] = useState('Bonus administrateur')

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
        setError(err instanceof Error ? err.message : 'Admin access denied.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authed])

  if (!authed) return null

  const handleGrant = async (userId: string) => {
    try {
      const updated = await api.adminGrantCredits(userId, grantDelta, grantReason)
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)))
      setGrantingId(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to grant credits.')
    }
  }

  return (
    <>
      <AppHeader />
      <main id="contenu" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b-[1.5px] border-ink pb-5">
          <div>
            <span className="label-mono text-seal">Administration Panel</span>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">System & Operations</h1>
          </div>
          <Link href="/dashboard" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Back to Dashboard
          </Link>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-16 text-ink-soft">
            <Loader2 className="size-5 animate-spin text-seal" />
            <span>Loading system metrics…</span>
          </div>
        )}

        {error && (
          <div className="mt-8 border-[1.5px] border-ink bg-sheet p-8 text-center">
            <ShieldAlert className="mx-auto size-8 text-danger" />
            <h2 className="mt-3 text-xl font-bold">Restricted Access</h2>
            <p className="mt-1 text-sm text-ink-soft">{error}</p>
          </div>
        )}

        {stats && !error && (
          <div className="mt-8 flex flex-col gap-10">
            {/* KPI CARDS */}
            <section aria-label="Platform statistics" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="border-[1.5px] border-ink bg-sheet p-4">
                <div className="flex items-center gap-2 text-ink-soft">
                  <Users className="size-4 text-seal" />
                  <span className="label-mono">Users</span>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold">{stats.users_count}</p>
              </div>
              <div className="border-[1.5px] border-ink bg-sheet p-4">
                <div className="flex items-center gap-2 text-ink-soft">
                  <FolderKanban className="size-4 text-seal" />
                  <span className="label-mono">Projects / Pages</span>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold">
                  {stats.projects_count} <span className="text-sm font-normal text-ink-soft">/ {stats.pages_count} p.</span>
                </p>
              </div>
              <div className="border-[1.5px] border-ink bg-sheet p-4">
                <div className="flex items-center gap-2 text-ink-soft">
                  <Coins className="size-4 text-seal" />
                  <span className="label-mono">Credits Used / Paid Tx</span>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold">
                  {stats.total_credits_used} <span className="text-sm font-normal text-ink-soft">({stats.paid_transactions_count} tx)</span>
                </p>
              </div>
              <div className="border-[1.5px] border-ink bg-sheet p-4">
                <div className="flex items-center gap-2 text-ink-soft">
                  <Activity className="size-4 text-seal" />
                  <span className="label-mono">Jobs (Active / Failed)</span>
                </div>
                <p className="mt-2 font-mono text-2xl font-bold">
                  {stats.active_jobs_count}{' '}
                  <span className={cn('text-sm font-normal', stats.failed_jobs_count > 0 ? 'text-danger' : 'text-ink-soft')}>
                    / {stats.failed_jobs_count} failed
                  </span>
                </p>
              </div>
            </section>

            {/* USERS TABLE */}
            <section aria-labelledby="admin-users-heading">
              <h2 id="admin-users-heading" className="text-xl font-bold tracking-tight mb-3">
                Accounts & Credit Balances ({users.length})
              </h2>
              <div className="overflow-x-auto border-[1.5px] border-ink bg-sheet">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-ink bg-paper font-mono text-xs uppercase text-ink-soft">
                    <tr>
                      <th className="px-4 py-2.5">Email</th>
                      <th className="px-4 py-2.5">Plan</th>
                      <th className="px-4 py-2.5">Credits</th>
                      <th className="px-4 py-2.5">Projects</th>
                      <th className="px-4 py-2.5">Actions</th>
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
                                placeholder="Reason"
                              />
                              <Button size="sm" onClick={() => handleGrant(u.id)}>
                                Apply
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setGrantingId(null)}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setGrantingId(u.id)}
                              className="inline-flex items-center gap-1 rounded border border-hairline bg-paper px-2.5 py-1 font-mono text-xs font-semibold hover:bg-muted"
                            >
                              <PlusCircle className="size-3.5 text-seal" />
                              Grant Credits
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
                Recent Background Jobs ({jobs.length})
              </h2>
              <div className="overflow-x-auto border-[1.5px] border-ink bg-sheet">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-ink bg-paper font-mono text-xs uppercase text-ink-soft">
                    <tr>
                      <th className="px-4 py-2.5">Type</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Progress</th>
                      <th className="px-4 py-2.5">Message / Error</th>
                      <th className="px-4 py-2.5">Created</th>
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
                        <td className="px-4 py-2.5 font-mono text-xs text-ink-soft">{formatDateTime(j.created_at)}</td>
                      </tr>
                    ))}
                    {jobs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-ink-soft">
                          No background jobs recorded yet.
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
