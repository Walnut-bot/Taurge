'use client'

import { useRef } from 'react'
import { Camera, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { ProfileAvatar } from '@/components/profile-avatar'
import { Button } from '@/components/ui/button'
import type { User } from '@/lib/types'
import { cn } from '@/lib/utils'

interface ProfileHeaderProps {
  user: User
  bannerUrl: string | null
  onUploadBanner: (file?: File) => Promise<void> | void
  onDeleteBanner: () => Promise<void> | void
  onUploadAvatar: (file?: File) => Promise<void> | void
  onDeleteAvatar: () => Promise<void> | void
  busy: 'avatar' | 'banner' | 'delete-avatar' | 'delete-banner' | null
  className?: string
}

export function ProfileHeader({
  user,
  bannerUrl,
  onUploadBanner,
  onDeleteBanner,
  onUploadAvatar,
  onDeleteAvatar,
  busy,
  className,
}: ProfileHeaderProps) {
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className={cn('panel rounded-xl overflow-visible shadow-xs', className)}>
      {/* Bannière de couverture standard SaaS */}
      <div className="relative w-full h-40 sm:h-48 md:h-52 overflow-hidden rounded-t-xl bg-sheet dark:bg-sheet/80 border-b border-hairline">
        {bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerUrl}
            alt="Bannière de profil"
            className="size-full object-cover"
          />
        ) : (
          <div className="size-full bg-gradient-to-r from-seal-wash/30 via-sheet to-hairline/20 flex items-center justify-center">
            <span className="text-xs font-mono text-ink-soft/60 uppercase tracking-widest">
              Atelier Taurge
            </span>
          </div>
        )}

        {/* Gradient subtil pour la lisibilité des boutons */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />

        {/* Actions sur la bannière */}
        <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex items-center gap-2 z-10">
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void onUploadBanner(file)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => bannerInputRef.current?.click()}
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-md px-3 py-1.5 text-xs font-medium transition-all shadow-xs disabled:opacity-50 border border-white/20 active:scale-95"
          >
            {busy === 'banner' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <ImagePlus className="size-3.5" />
            )}
            <span className="hidden sm:inline">
              {bannerUrl ? 'Changer la bannière' : 'Ajouter une bannière'}
            </span>
          </button>

          {user.banner_content_type && (
            <button
              type="button"
              onClick={() => void onDeleteBanner()}
              disabled={busy !== null}
              aria-label="Supprimer la bannière"
              title="Supprimer la bannière"
              className="flex size-7 items-center justify-center rounded-lg bg-black/60 hover:bg-danger/90 text-white backdrop-blur-md transition-all shadow-xs disabled:opacity-50 border border-white/20 active:scale-95"
            >
              {busy === 'delete-banner' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Rangée Avatar + Détails avec superposition nette */}
      <div className="relative px-5 sm:px-7 pb-6 pt-0">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-12 sm:-mt-16">
          {/* Avatar à cheval avec z-10 explicite et bordure franche */}
          <div className="relative z-10 size-24 sm:size-28 shrink-0 rounded-full border-4 border-background bg-sheet shadow-lg overflow-hidden ring-1 ring-hairline">
            <ProfileAvatar user={user} className="size-full bg-sheet text-ink" />
          </div>

          {/* Actions sur l'avatar */}
          <div className="flex items-center gap-2 pt-1 sm:pt-0">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void onUploadAvatar(file)
                e.target.value = ''
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => avatarInputRef.current?.click()}
              disabled={busy !== null}
              className="text-xs h-8"
            >
              {busy === 'avatar' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Camera className="size-3.5" />
              )}
              <span>{user.avatar_content_type ? "Changer l'avatar" : 'Ajouter un avatar'}</span>
            </Button>

            {user.avatar_content_type && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void onDeleteAvatar()}
                disabled={busy !== null}
                aria-label="Supprimer l'avatar"
                title="Supprimer l'avatar"
                className="size-8 text-ink-soft hover:text-danger hover:bg-danger-wash"
              >
                {busy === 'delete-avatar' ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Nom & Email */}
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
              {user.display_name || user.email.split('@')[0]}
            </h2>
            <span className="rounded-full bg-seal-wash px-2.5 py-0.5 text-xs font-medium text-seal capitalize">
              Plan {user.plan || 'Free'}
            </span>
          </div>
          <p className="font-mono text-xs text-ink-soft mt-1">{user.email}</p>
        </div>
      </div>
    </div>
  )
}
