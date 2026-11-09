'use client'

import Link from 'next/link'
import { Loader2, Save, ArrowUpRight } from 'lucide-react'
import { ProfileHeader } from '@/components/profile/profile-header'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import type { Settings } from './use-settings'

const roleLabels: Record<string, string> = {
  owner: 'Propriétaire',
  translator: 'Traducteur',
  cleaner: 'Clean',
  typesetter: 'Lettrage',
  proofreader: 'Relecture',
}

export function ProfileTab({ s }: { s: Settings }) {
  const { me } = s
  if (!me) return null
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
        <section className="panel p-5 sm:p-6 rounded-xl">
          <h3 className="text-base font-semibold text-ink">Nom public</h3>
          <p className="mt-1 text-xs text-ink-soft">
            Ce nom sera affiché à votre équipe et dans le menu utilisateur.
          </p>
          <form onSubmit={s.handleSaveDisplayName} className="mt-4 flex flex-col gap-3">
            <Label htmlFor="profile-display-name">Nom ou pseudo</Label>
            <div className="flex gap-2">
              <Input
                id="profile-display-name"
                value={s.displayName}
                onChange={(e) => s.setDisplayName(e.target.value)}
                maxLength={80}
                placeholder="Ex: Shinichi, Alex K."
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
                <span className="hidden sm:inline">Enregistrer</span>
              </Button>
            </div>
          </form>
        </section>
        <section className="panel p-5 sm:p-6 rounded-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-ink">Vos rôles en atelier</h3>
            <Link href="/dashboard" className="text-xs text-seal hover:underline inline-flex items-center gap-1">
              <span>Voir projets</span>
              <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            Rôles qui vous sont attribués dans chaque projet actif.
          </p>
          {me.project_roles && me.project_roles.length > 0 ? (
            <ul className="mt-4 divide-y divide-hairline">
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
        </section>
      </div>
    </div>
  )
}
