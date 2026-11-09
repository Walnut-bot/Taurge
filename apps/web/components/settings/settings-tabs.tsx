'use client'

import { UserRound, Sliders, ShieldCheck, Coins } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Settings, SettingsTab } from './use-settings'

const TABS: { key: SettingsTab; label: string; Icon: typeof UserRound }[] = [
  { key: 'profile', label: 'Profil', Icon: UserRound },
  { key: 'preferences', label: 'Préférences', Icon: Sliders },
  { key: 'security', label: 'Sécurité', Icon: ShieldCheck },
  { key: 'billing', label: 'Facturation & Crédits', Icon: Coins },
]

export function SettingsTabs({ s }: { s: Settings }) {
  return (
    <div className="mb-8 border-b border-hairline">
      <nav aria-label="Sections des paramètres" className="flex flex-wrap gap-x-2 gap-y-0 sm:gap-x-4">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              s.setActiveTab(key)
              s.setNotice(null)
            }}
            className={cn(
              'flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-all',
              s.activeTab === key
                ? 'border-seal text-seal font-semibold'
                : 'border-transparent text-ink-soft hover:text-ink hover:border-hairline'
            )}
          >
            <Icon className="size-4" />
            <span>{label}</span>
            {key === 'billing' && (
              <span className="font-mono text-xs rounded-full bg-sheet border border-hairline px-2 py-0.5">
                {s.remaining}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
