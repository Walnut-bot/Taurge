'use client'

import { ArrowLeft, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { AppShell } from '@/components/app-shell'
import { buttonVariants } from '@/components/ui/button'
import { Link } from '@/i18n/navigation'
import { cn } from '@/lib/utils'
import { useSettings, type SettingsTab } from './use-settings'
import { SettingsTabs } from './settings-tabs'
import { ProfileTab } from './profile-tab'
import { AppearanceTab } from './appearance-tab'
import { PreferencesTab } from './preferences-tab'
import { ShortcutsTab } from './shortcuts-tab'
import { NotificationsTab } from './notifications-tab'
import { SecurityTab } from './security-tab'
import { BillingTab } from './billing-tab'

export function SettingsView({ initialTab = 'profile' }: { initialTab?: SettingsTab }) {
  const s = useSettings(initialTab)

  return (
    <AppShell>
      <AppHeader />
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 sm:py-10">
        {/* En-tête de la page Paramètres */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-hairline pb-6">
          <div>
            <p className="eyebrow">Espace de configuration Taurge</p>
            <h1 className="mt-1 font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
              Paramètres &amp; Préférences Studio
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-ink-soft">
              Gérez votre identité, l’apparence de l’application, vos moteurs OCR/IA, vos raccourcis clavier et la sécurité RGPD de votre compte.
            </p>
          </div>
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'self-start sm:self-center shrink-0')}
          >
            <ArrowLeft className="size-3.5" />
            <span>Retour aux projets</span>
          </Link>
        </div>

        {/* Bannière de retour d'action (Toast / Notice) */}
        {s.notice && (
          <div
            role="status"
            className={cn(
              'mb-6 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs sm:text-sm',
              s.notice.error
                ? 'border-danger/40 bg-danger/10 text-danger'
                : 'border-moss/40 bg-moss/10 text-moss',
            )}
          >
            <div className="flex items-center gap-2.5">
              {s.notice.error ? (
                <AlertCircle className="size-4 shrink-0" />
              ) : (
                <CheckCircle2 className="size-4 shrink-0" />
              )}
              <span className="font-medium">{s.notice.text}</span>
            </div>
            <button
              type="button"
              onClick={() => s.setNotice(null)}
              className="rounded p-1 opacity-75 hover:opacity-100"
              aria-label="Fermer la notification"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Architecture 2 colonnes : Barre latérale à gauche + Panneau actif à droite */}
        <div className="flex flex-col lg:flex-row items-start gap-8">
          <SettingsTabs s={s} />

          <div className="min-w-0 flex-1 w-full">
            {s.activeTab === 'profile' && <ProfileTab s={s} />}
            {s.activeTab === 'appearance' && <AppearanceTab s={s} />}
            {s.activeTab === 'preferences' && <PreferencesTab s={s} />}
            {s.activeTab === 'shortcuts' && <ShortcutsTab />}
            {s.activeTab === 'notifications' && <NotificationsTab s={s} />}
            {s.activeTab === 'security' && <SecurityTab s={s} />}
            {s.activeTab === 'billing' && <BillingTab s={s} />}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
