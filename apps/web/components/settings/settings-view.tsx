'use client'

import { AppHeader } from '@/components/app-header'
import { cn } from '@/lib/utils'
import { useSettings, type SettingsTab } from './use-settings'
import { SettingsTabs } from './settings-tabs'
import { ProfileTab } from './profile-tab'
import { PreferencesTab } from './preferences-tab'
import { SecurityTab } from './security-tab'
import { BillingTab } from './billing-tab'

export type { SettingsTab }

interface SettingsViewProps {
  initialTab?: SettingsTab
}

export function SettingsView({ initialTab = 'profile' }: SettingsViewProps) {
  const s = useSettings(initialTab)
  if (!s.authed) return null
  const { notice, me, activeTab } = s

  return (
    <>
      <AppHeader />
      <main id="contenu" className="mx-auto w-full min-w-0 max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
        <div className="mb-6">
          <p className="label-mono text-ink-soft">Compte & Paramètres</p>
          <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-ink">
            Paramètres du compte
          </h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Gérez votre profil public, vos préférences d’atelier, votre sécurité et vos crédits.
          </p>
        </div>

        {notice && (
          <div
            role={notice.error ? 'alert' : 'status'}
            className={cn(
              'mb-6 flex items-center justify-between gap-3 rounded-lg border-l-4 px-4 py-3 text-sm transition-all',
              notice.error
                ? 'border-danger bg-danger-wash text-danger'
                : 'border-ok bg-ok-wash text-ok'
            )}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => s.setNotice(null)}
              className="text-xs font-semibold uppercase opacity-75 hover:opacity-100"
            >
              Fermer
            </button>
          </div>
        )}

        <SettingsTabs s={s} />

        {activeTab === 'profile' && me && <ProfileTab s={s} />}
        {activeTab === 'preferences' && me && <PreferencesTab s={s} />}
        {activeTab === 'security' && me && <SecurityTab s={s} />}
        {activeTab === 'billing' && me && <BillingTab s={s} />}
      </main>
    </>
  )
}
