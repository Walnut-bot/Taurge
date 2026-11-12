'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Loader2, Save, ArrowUpRight, Copy, Check, ShieldAlert, Calendar, Mail, Fingerprint } from 'lucide-react'
import { ProfileHeader } from '@/components/profile/profile-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import type { Settings } from './use-settings'

const roleLabels: Record<string, string> = {
  owner: 'Propriétaire',
  admin: 'Admin',
  translator: 'Traducteur',
  cleaner: 'Clean',
  typesetter: 'Lettrage',
  proofreader: 'Relecture / QC',
  viewer: 'Lecteur',
}

export function ProfileTab({ s }: { s: Settings }) {
  const { me } = s
  const [copiedId, setCopiedId] = useState(false)
  if (!me) return null

  function copyUserId() {
    if (!me) return
    navigator.clipboard.writeText(me.id).then(() => {
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 2000)
    })
  }

  const createdDate = me.created_at
    ? new Date(me.created_at).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : 'Compte vérifié'

  return (
    <div className="space-y-6">
      <ProfileHeader
        user={me}
        bannerUrl={s.bannerUrl}
        onUploadBanner={(file) => s.handleUploadImage('banner', file)}
        onDeleteBanner={() => s.handleDeleteImage('banner')}
        onUploadAvatar={(file) => s.handleUploadImage('avatar', file)}
        onDeleteAvatar={() => s.handleDeleteImage('avatar')}
        busy={s.busy}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <section className="panel p-5 sm:p-6 rounded-xl flex flex-col justify-between">
          <div>
            <h3 className="text-base font-semibold text-ink">Identité publique</h3>
            <p className="mt-1 text-xs text-ink-soft">
              Ce nom est affiché à vos collaborateurs dans les notes de relecture, l’historique de versions et le menu d’équipe.
            </p>
            <form onSubmit={s.handleSaveDisplayName} className="mt-4 flex flex-col gap-3">
              <Label htmlFor="profile-display-name">Nom d’affichage ou pseudo</Label>
              <div className="flex gap-2">
                <Input
                  id="profile-display-name"
                  value={s.displayName}
                  onChange={(e) => s.setDisplayName(e.target.value)}
                  maxLength={80}
                  placeholder="Ex: Shinichi, Studio Kumo…"
                  disabled={s.savingName}
                />
                <Button
                  type="submit"
                  variant="seal"
                  size="sm"
                  disabled={s.savingName || s.displayName === (me.display_name ?? '')}
                  className="shrink-0"
                >
                  {s.savingName ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  <span>Enregistrer</span>
                </Button>
              </div>
            </form>
          </div>

          <div className="mt-6 space-y-2.5 border-t border-hairline pt-4 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-ink-soft">
                <Mail className="size-3.5" />
                <span>E-mail du compte</span>
              </span>
              <span className="font-mono font-medium text-ink truncate">{me.email}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-ink-soft">
                <Fingerprint className="size-3.5" />
                <span>Identifiant unique (UUID)</span>
              </span>
              <button
                type="button"
                onClick={copyUserId}
                className="inline-flex items-center gap-1 rounded border border-hairline bg-sheet px-2 py-0.5 font-mono text-[11px] text-ink-soft hover:text-ink"
                title="Copier votre identifiant utilisateur"
              >
                <span>{me.id.slice(0, 8)}…</span>
                {copiedId ? <Check className="size-3 text-ok" /> : <Copy className="size-3" />}
              </button>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-ink-soft">
                <Calendar className="size-3.5" />
                <span>Membre depuis</span>
              </span>
              <span className="text-ink font-medium">{createdDate}</span>
            </div>
          </div>
        </section>

        <section className="panel p-5 sm:p-6 rounded-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-ink">Rôles & Projets actifs</h3>
              <Link href="/dashboard" className="text-xs text-seal hover:underline inline-flex items-center gap-1">
                <span>Tableau de bord</span>
                <ArrowUpRight className="size-3" />
              </Link>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              Permissions qui vous sont attribuées dans vos projets de localisation.
            </p>
            {me.project_roles && me.project_roles.length > 0 ? (
              <ul className="mt-4 max-h-52 overflow-y-auto divide-y divide-hairline pr-1">
                {me.project_roles.map((pr) => (
                  <li key={`${pr.project_id}-${pr.role}`} className="flex items-center justify-between py-2.5 text-xs">
                    <Link href={`/projects/${pr.project_id}`} className="truncate font-medium text-ink hover:underline">
                      {pr.project_name}
                    </Link>
                    <span className="shrink-0 rounded-full border border-hairline bg-sheet px-2.5 py-0.5 text-ink-soft font-mono">
                      {roleLabels[pr.role] ?? pr.role}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-6 rounded-lg border border-dashed border-hairline p-4 text-center">
                <p className="text-xs text-ink-soft">Aucun rôle projet assigné pour l&apos;instant.</p>
              </div>
            )}
          </div>

          {me.is_admin && (
            <div className="mt-5 flex items-center justify-between rounded-lg border border-seal/30 bg-seal-wash/60 px-3.5 py-2.5 text-xs">
              <div className="flex items-center gap-2 text-ink">
                <ShieldAlert className="size-4 text-seal shrink-0" />
                <span className="font-medium">Accès Administrateur global activé</span>
              </div>
              <Link
                href="/admin"
                className="font-semibold text-seal hover:underline inline-flex items-center gap-1 shrink-0"
              >
                <span>Console Admin</span>
                <ArrowUpRight className="size-3" />
              </Link>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
