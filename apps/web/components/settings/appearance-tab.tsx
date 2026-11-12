'use client'

import { Sun, Moon, Monitor, Globe, Check, RotateCcw, Eye, Grid, Trash2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Theme } from '@/lib/theme'
import type { Settings } from './use-settings'

const THEME_OPTIONS: {
  value: Theme
  label: string
  subtitle: string
  Icon: typeof Sun
  previewBg: string
  previewCard: string
}[] = [
  {
    value: 'light',
    label: 'Clair (Papier Washi)',
    subtitle: 'Fond ivoire doux conçu pour la lecture prolongée en journée.',
    Icon: Sun,
    previewBg: 'bg-[#F8F5EE] border-[#DED6C6]',
    previewCard: 'bg-white border-[#E5DEC9] text-[#1C1917]',
  },
  {
    value: 'dark',
    label: 'Sombre (Encre Sumi)',
    subtitle: 'Contraste élevé pour le nettoyage d’images et le lettrage en studio.',
    Icon: Moon,
    previewBg: 'bg-[#121110] border-[#2B2825]',
    previewCard: 'bg-[#1C1A17] border-[#332F2B] text-[#F5F2EB]',
  },
  {
    value: 'system',
    label: 'Automatique (Système)',
    subtitle: 'Suit automatiquement le mode clair ou sombre de votre système Windows / macOS.',
    Icon: Monitor,
    previewBg: 'bg-gradient-to-r from-[#F8F5EE] to-[#121110] border-hairline',
    previewCard: 'bg-sheet border-hairline text-ink',
  },
]

export function AppearanceTab({ s }: { s: Settings }) {
  const { studioSettings } = s

  return (
    <div className="space-y-6">
      {/* Thème visuel */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-5">
        <div className="border-b border-hairline pb-4">
          <h2 className="text-lg font-semibold text-ink">Thème de l’interface</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Personnalisez l’ambiance visuelle de Taurge sur l’ensemble du tableau de bord et de l’atelier.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {THEME_OPTIONS.map(({ value, label, subtitle, Icon, previewBg, previewCard }) => {
            const active = s.themeChoice === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => s.handleSelectTheme(value)}
                className={cn(
                  'group flex flex-col justify-between rounded-xl border p-4 text-left transition-all',
                  active
                    ? 'border-seal bg-seal-wash/30 ring-2 ring-seal/20'
                    : 'border-hairline bg-sheet hover:border-ink-soft',
                )}
              >
                <div>
                  <div className={cn('mb-3 h-16 w-full rounded-lg border p-2.5 flex items-center justify-between', previewBg)}>
                    <div className={cn('rounded-md border px-2.5 py-1 text-[10px] font-mono font-semibold shadow-2xs', previewCard)}>
                      訳 Taurge
                    </div>
                    <Icon className="size-4 text-seal" />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{label}</span>
                    {active && <Check className="size-4 text-seal shrink-0" />}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{subtitle}</p>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Langue de l'interface */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-5">
        <div className="border-b border-hairline pb-4">
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <Globe className="size-4 text-seal" />
            <span>Langue d’affichage de l’application</span>
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            Choisissez la langue des menus, boutons et messages système de Taurge (indépendante des langues de vos projets).
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { code: 'fr' as const, name: 'Français', native: 'Interface principale (Recommandé)', region: 'FR' },
            { code: 'en' as const, name: 'English', native: 'International Studio Interface', region: 'EN' },
          ].map((item) => {
            const active = s.locale === item.code
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => s.handleSelectLocale(item.code)}
                className={cn(
                  'flex items-center justify-between rounded-xl border p-4 text-left transition-all',
                  active
                    ? 'border-seal bg-seal-wash/30 font-semibold text-ink'
                    : 'border-hairline bg-sheet text-ink-soft hover:border-ink-soft hover:text-ink',
                )}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink">{item.name}</span>
                    <span className="rounded border border-hairline bg-paper px-1.5 py-0.5 font-mono text-[10px]">
                      {item.region}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-soft">{item.native}</p>
                </div>
                {active && <Check className="size-4 text-seal shrink-0" />}
              </button>
            )
          })}
        </div>
      </section>

      {/* Affichage et ergonomie du Canvas d'atelier */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-hairline pb-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">Ergonomie de l’Atelier & du Canvas</h2>
            <p className="mt-1 text-xs text-ink-soft">
              Ajustez le comportement visuel de la planche de travail lors de la détection, du nettoyage et du lettrage.
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={s.resetStudioSettings} className="self-start sm:self-auto">
            <RotateCcw className="size-3.5" />
            <span>Réinitialiser</span>
          </Button>
        </div>

        <div className="divide-y divide-hairline">
          {[
            {
              key: 'showBubbleBadges' as const,
              title: 'Afficher les numéros de bulles sur la planche',
              desc: 'Affiche les pastilles numérotées (1, 2, 3…) dans le coin supérieur gauche de chaque cadre détecté.',
              Icon: Eye,
            },
            {
              key: 'canvasGrid' as const,
              title: 'Grille de repère autour de la page',
              desc: 'Affiche un fond tramé discret derrière la planche pour mieux distinguer les marges blanches.',
              Icon: Grid,
            },
            {
              key: 'autoPreviewCleaned' as const,
              title: 'Basculer automatiquement sur la vue « Cleaned » après l’inpainting',
              desc: 'Affiche immédiatement la page nettoyée et le texte traduit dès que le nettoyage d’une page se termine.',
              Icon: Sparkles,
            },
            {
              key: 'confirmBeforeDeleteBubble' as const,
              title: 'Demander confirmation avant de supprimer une bulle',
              desc: 'Empêche la suppression accidentelle d’une boîte OCR lors d’un clic rapide sur l’icône corbeille.',
              Icon: Trash2,
            },
          ].map(({ key, title, desc, Icon }) => {
            const checked = studioSettings[key]
            return (
              <label
                key={key}
                className="flex cursor-pointer items-center justify-between gap-4 py-4 first:pt-1 last:pb-1"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-sheet text-ink-soft">
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink">{title}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">{desc}</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => s.updateStudioSetting(key, e.target.checked)}
                  className="size-4 accent-[var(--color-seal)] rounded cursor-pointer shrink-0"
                />
              </label>
            )
          })}
        </div>
      </section>
    </div>
  )
}
