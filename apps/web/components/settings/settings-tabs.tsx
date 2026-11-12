'use client'

import {
  UserRound,
  Palette,
  Sliders,
  Keyboard,
  Bell,
  ShieldCheck,
  Coins,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Settings, SettingsTab } from './use-settings'

const TABS: {
  key: SettingsTab
  label: string
  subtitle: string
  Icon: typeof UserRound
  group: string
}[] = [
  {
    key: 'profile',
    label: 'Profil & Identité',
    subtitle: 'Avatar, nom public et rôles',
    Icon: UserRound,
    group: 'Compte',
  },
  {
    key: 'appearance',
    label: 'Apparence & Interface',
    subtitle: 'Thème, langue UI et affichage',
    Icon: Palette,
    group: 'Application',
  },
  {
    key: 'preferences',
    label: 'Atelier, OCR & IA',
    subtitle: 'Langues par défaut, lettrage et moteurs IA',
    Icon: Sliders,
    group: 'Application',
  },
  {
    key: 'shortcuts',
    label: 'Raccourcis Clavier',
    subtitle: 'Commandes rapides du studio',
    Icon: Keyboard,
    group: 'Application',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    subtitle: 'Alertes jobs, équipe et e-mails',
    Icon: Bell,
    group: 'Compte',
  },
  {
    key: 'security',
    label: 'Sécurité & RGPD',
    subtitle: 'Mot de passe, session et export de données',
    Icon: ShieldCheck,
    group: 'Sécurité & Facturation',
  },
  {
    key: 'billing',
    label: 'Facturation & Crédits',
    subtitle: 'Formule, quotas et historique IA',
    Icon: Coins,
    group: 'Sécurité & Facturation',
  },
]

export function SettingsTabs({ s }: { s: Settings }) {
  return (
    <aside className="w-full lg:w-64 lg:shrink-0">
      {/* Navigation horizontale compacte sur mobile/tablette */}
      <div className="mb-6 flex gap-1.5 overflow-x-auto pb-2 lg:hidden">
        {TABS.map(({ key, label, Icon }) => {
          const active = s.activeTab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                s.setActiveTab(key)
                s.setNotice(null)
              }}
              className={cn(
                'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all',
                active
                  ? 'border-seal bg-seal-wash text-seal font-semibold'
                  : 'border-hairline bg-sheet text-ink-soft hover:text-ink',
              )}
            >
              <Icon className="size-3.5" />
              <span>{label}</span>
            </button>
          )
        })}
      </div>

      {/* Barre latérale structurée type logiciel pro sur desktop */}
      <nav
        aria-label="Sections des paramètres"
        className="hidden lg:flex lg:flex-col lg:gap-1 rounded-xl border border-hairline bg-sheet/60 p-2"
      >
        {TABS.map(({ key, label, subtitle, Icon }) => {
          const active = s.activeTab === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                s.setActiveTab(key)
                s.setNotice(null)
              }}
              className={cn(
                'group flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-all',
                active
                  ? 'bg-paper shadow-xs border border-hairline text-ink'
                  : 'border border-transparent text-ink-soft hover:bg-paper/50 hover:text-ink',
              )}
            >
              <div
                className={cn(
                  'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors',
                  active
                    ? 'border-seal/40 bg-seal-wash text-seal'
                    : 'border-hairline bg-sheet text-ink-soft group-hover:text-ink',
                )}
              >
                <Icon className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1.5">
                  <span className={cn('truncate text-xs', active ? 'font-semibold text-ink' : 'font-medium')}>
                    {label}
                  </span>
                  {key === 'billing' && (
                    <span className="rounded-full border border-hairline bg-sheet px-1.5 py-0.2 font-mono text-[10px] text-ink-soft">
                      {s.remaining}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-[11px] text-ink-faint">{subtitle}</p>
              </div>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
