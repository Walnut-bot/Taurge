'use client'

import { useState } from 'react'
import { Users, UserPlus, Trash2, Crown, Paintbrush, Feather, CheckCircle, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { ProjectMember, ScanlationRole } from '@/lib/types'
import { cn } from '@/lib/utils'

type Props = {
  projectId: string
  members: ProjectMember[]
  onRefresh: () => void
}

const ROLES: { id: ScanlationRole; label: string; icon: any; color: string; desc: string }[] = [
  { id: 'owner', label: 'Owner', icon: Crown, color: 'bg-amber-500/10 text-amber-600 border-amber-300', desc: 'Full project management' },
  { id: 'cleaner', label: 'Cleaner / Redrawer', icon: Paintbrush, color: 'bg-blue-500/10 text-blue-600 border-blue-300', desc: 'Erases bubbles and rebuilds backgrounds' },
  { id: 'translator', label: 'Translator', icon: Feather, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-300', desc: 'Translates dialogue and adapts the tone' },
  { id: 'proofreader', label: 'Check / QC', icon: CheckCircle, color: 'bg-purple-500/10 text-purple-600 border-purple-300', desc: 'Proofreads spelling and register' },
  { id: 'typesetter', label: 'Typesetter', icon: Type, color: 'bg-rose-500/10 text-rose-600 border-rose-300', desc: 'Sets typography, outlines and angles' },
]

export function TeamPanel({ projectId, members, onRefresh }: Props) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ScanlationRole>('translator')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setLoading(true)
    setError(null)
    try {
      await api.inviteMember(projectId, email.trim(), role)
      setEmail('')
      onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error while inviting.')
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(memberId: string) {
    if (!window.confirm('Remove this member from the team?')) return
    try {
      await api.removeMember(projectId, memberId)
      onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error.')
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between border-b border-hairline pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Users className="size-5 text-seal" />
            Scanlation Team & Roles
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Invite your teammates (cleaners, translators, typesetters). The project will show up directly on their dashboard.
          </p>
        </div>
        <div className="font-mono text-xs text-ink-soft bg-sheet px-3 py-1 rounded">
          {members.length} active member{members.length > 1 ? 's' : ''}
        </div>
      </div>

      {/* Invitation form */}
      <form onSubmit={handleInvite} className="flex flex-wrap items-end gap-3 rounded-lg border border-hairline bg-sheet p-4 shadow-sm">
        <div className="flex flex-1 flex-col gap-1 min-w-[14rem]">
          <label className="text-xs font-semibold text-ink-soft">Teammate’s email (already registered on Taurge)</label>
          <input
            type="email"
            required
            placeholder="collegue@scanlation.team"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-hairline bg-paper px-3 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-col gap-1 min-w-[12rem]">
          <label className="text-xs font-semibold text-ink-soft">Assigned role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as ScanlationRole)}
            className="rounded border border-hairline bg-paper px-3 py-1.5 text-sm font-medium"
          >
            <option value="cleaner">🧹 Cleaner / Redrawer</option>
            <option value="translator">✍️ Translator</option>
            <option value="proofreader">🔍 Check / QC</option>
            <option value="typesetter">🎨 Typesetter</option>
          </select>
        </div>

        <Button type="submit" size="sm" variant="seal" disabled={loading}>
          <UserPlus className="size-4" />
          Add to the team
        </Button>
      </form>

      {error && <p className="text-xs text-danger font-medium">{error}</p>}

      {/* Member list */}
      <div className="flex flex-col rounded-lg border border-hairline bg-paper overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-hairline bg-sheet text-xs font-mono text-ink-soft">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Scanlation role</th>
              <th className="px-4 py-3">Duties</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {members.map((m) => {
              const roleInfo = ROLES.find((r) => r.id === m.role) || ROLES[1]
              const Icon = roleInfo.icon
              return (
                <tr key={m.id} className="hover:bg-sheet/40 transition-colors">
                  <td className="px-4 py-3.5 font-semibold text-ink">{m.email}</td>
                  <td className="px-4 py-3.5">
                    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border', roleInfo.color)}>
                      <Icon className="size-3.5" />
                      {roleInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-ink-soft">{roleInfo.desc}</td>
                  <td className="px-4 py-3.5 text-right">
                    {m.role !== 'owner' && (
                      <button
                        type="button"
                        onClick={() => handleRemove(m.id)}
                        className="rounded p-1 text-ink-soft hover:bg-danger-wash hover:text-danger transition-colors"
                        title="Remove from the team"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}