'use client'

import { Sun, Moon, Monitor, Globe, Check, RotateCcw, Eye, Grid, Trash2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Theme } from '@/lib/theme'
import type { Settings } from './use-settings'

function getThemeOptions(locale: string): {
  value: Theme
  label: string
  subtitle: string
  Icon: typeof Sun
  previewBg: string
  previewCard: string
}[] {
  const isEn = locale === 'en'
  return [
    {
      value: 'light',
      label: isEn ? 'Light (Washi Paper)' : 'Clair (Papier Washi)',
      subtitle: isEn
        ? 'Soft ivory background designed for extended daytime reading.'
        : 'Fond ivoire doux conçu pour la lecture prolongée en journée.',
      Icon: Sun,
      previewBg: 'bg-[#F8F5EE] border-[#DED6C6]',
      previewCard: 'bg-white border-[#E5DEC9] text-[#1C1917]',
    },
    {
      value: 'dark',
      label: isEn ? 'Dark (Sumi Ink)' : 'Sombre (Encre Sumi)',
      subtitle: isEn
        ? 'High contrast for image cleaning and studio lettering.'
        : 'Contraste élevé pour le nettoyage d’images et le lettrage en studio.',
      Icon: Moon,
      previewBg: 'bg-[#121110] border-[#2B2825]',
      previewCard: 'bg-[#1C1A17] border-[#332F2B] text-[#F5F2EB]',
    },
    {
      value: 'system',
      label: isEn ? 'Automatic (System)' : 'Automatique (Système)',
      subtitle: isEn
        ? 'Automatically follows the light or dark mode of your Windows / macOS system.'
        : 'Suit automatiquement le mode clair ou sombre de votre système Windows / macOS.',
      Icon: Monitor,
      previewBg: 'bg-gradient-to-r from-[#F8F5EE] to-[#121110] border-hairline',
      previewCard: 'bg-sheet border-hairline text-ink',
    },
  ]
}

export function AppearanceTab({ s }: { s: Settings }) {
  const { studioSettings } = s
  const isEn = s.locale === 'en'
  const themeOptions = getThemeOptions(s.locale)

  return (
    <div className="space-y-6">
      {/* Thème visuel */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-5">
        <div className="border-b border-hairline pb-4">
          <h2 className="text-lg font-semibold text-ink">
            {isEn ? 'Interface theme' : 'Thème de l’interface'}
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            {isEn
              ? 'Customize the visual look of Taurge across the entire dashboard and studio.'
              : 'Personnalisez l’ambiance visuelle de Taurge sur l’ensemble du tableau de bord et de l’atelier.'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {themeOptions.map(({ value, label, subtitle, Icon, previewBg, previewCard }) => {
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
            <span>
              {isEn ? 'Application display language' : 'Langue d’affichage de l’application'}
            </span>
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            {isEn
              ? 'Choose the language of Taurge menus, buttons and system messages (independent of your project languages).'
              : 'Choisissez la langue des menus, boutons et messages système de Taurge (indépendante des langues de vos projets).'}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              code: 'fr' as const,
              name: 'Français',
              native: isEn ? 'French interface' : 'Interface principale (Recommandé)',
              region: 'FR',
            },
            {
              code: 'en' as const,
              name: 'English',
              native: isEn ? 'International studio interface' : 'Interface internationale en anglais',
              region: 'EN',
            },
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
            <h2 className="text-lg font-semibold text-ink">
              {isEn ? 'Studio & Canvas Ergonomics' : 'Ergonomie de l’Atelier & du Canevas'}
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              {isEn
                ? 'Adjust how the working page behaves during detection, cleaning and lettering.'
                : 'Ajustez le comportement visuel de la planche de travail lors de la détection, du nettoyage et du lettrage.'}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={s.resetStudioSettings} className="self-start sm:self-auto">
            <RotateCcw className="size-3.5" />
            <span>{isEn ? 'Reset' : 'Réinitialiser'}</span>
          </Button>
        </div>

        <div className="divide-y divide-hairline">
          {[
            {
              key: 'showBubbleBadges' as const,
              title: isEn
                ? 'Show bubble numbers on the page'
                : 'Afficher les numéros de bulles sur la planche',
              desc: isEn
                ? 'Displays numbered badges (1, 2, 3…) in the top-left corner of each detected frame.'
                : 'Affiche les pastilles numérotées (1, 2, 3…) dans le coin supérieur gauche de chaque cadre détecté.',
              Icon: Eye,
            },
            {
              key: 'canvasGrid' as const,
              title: isEn
                ? 'Reference grid around the page'
                : 'Grille de repère autour de la page',
              desc: isEn
                ? 'Displays a subtle halftone background behind the page to clearly distinguish white margins.'
                : 'Affiche un fond tramé discret derrière la planche pour mieux distinguer les marges blanches.',
              Icon: Grid,
            },
            {
              key: 'autoPreviewCleaned' as const,
              title: isEn
                ? 'Automatically switch to “Cleaned” view after inpainting'
                : 'Basculer automatiquement sur la vue « Nettoyé » après reconstruction du fond',
              desc: isEn
                ? 'Immediately displays the cleaned page and translated text as soon as page cleaning finishes.'
                : 'Affiche immédiatement la page nettoyée et le texte traduit dès que le nettoyage d’une page se termine.',
              Icon: Sparkles,
            },
            {
              key: 'confirmBeforeDeleteBubble' as const,
              title: isEn
                ? 'Ask for confirmation before deleting a bubble'
                : 'Demander confirmation avant de supprimer une bulle',
              desc: isEn
                ? 'Prevents accidental deletion of an OCR box when clicking the trash icon.'
                : 'Empêche la suppression accidentelle d’une boîte OCR lors d’un clic rapide sur l’icône corbeille.',
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
