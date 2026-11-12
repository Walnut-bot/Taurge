'use client'

import { Loader2, Save, Cpu, CheckCircle2, AlertCircle, Sparkles, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label, Select } from '@/components/ui/field'
import { LANGUAGES } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import type { ContentType } from '@/lib/types'
import type { Settings } from './use-settings'

const FORMAT_CARDS: {
  id: ContentType
  title: string
  sub: string
  badge: string
}[] = [
  {
    id: 'manga',
    title: 'Manga Japonais',
    sub: 'Lecture de droite à gauche (RTL) · Vertical JA',
    badge: 'Droite → Gauche',
  },
  {
    id: 'manhwa',
    title: 'Manhwa / Webtoon',
    sub: 'Lecture verticale en continu · Coréen / Anglais',
    badge: 'Scroll Vertical',
  },
  {
    id: 'manhua',
    title: 'Manhua Chinois',
    sub: 'Planches couleur & webtoon chinois (ZH)',
    badge: 'Gauche → Droite',
  },
  {
    id: 'comic',
    title: 'Comics / BD Européenne',
    sub: 'Lecture occidentale classique de gauche à droite',
    badge: 'Gauche → Droite',
  },
]

export function PreferencesTab({ s }: { s: Settings }) {
  return (
    <div className="space-y-6">
      {/* 1. Paramètres par défaut des nouveaux projets */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-6">
        <div className="border-b border-hairline pb-4">
          <h2 className="text-lg font-semibold text-ink">Paramètres des nouveaux projets</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Ces valeurs pré-remplissent automatiquement la fenêtre de création de projet pour accélérer votre flux de travail.
          </p>
        </div>

        <form onSubmit={s.handleSavePreferences} className="space-y-6">
          <div>
            <Label className="mb-2.5 block">Format de lecture habituel</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {FORMAT_CARDS.map((fmt) => {
                const active = s.preferences.default_content_type === fmt.id
                return (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() =>
                      s.setPreferences((prev) => ({ ...prev, default_content_type: fmt.id }))
                    }
                    className={cn(
                      'flex flex-col justify-between rounded-xl border p-4 text-left transition-all',
                      active
                        ? 'border-seal bg-seal-wash/30 ring-2 ring-seal/20'
                        : 'border-hairline bg-sheet hover:border-ink-soft',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="rounded border border-hairline bg-paper px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-soft">
                        {fmt.badge}
                      </span>
                      {active && <span className="size-2 rounded-full bg-seal" />}
                    </div>
                    <p className="text-sm font-semibold text-ink">{fmt.title}</p>
                    <p className="mt-0.5 text-xs text-ink-soft">{fmt.sub}</p>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="pref-source-lang">Langue source par défaut (OCR)</Label>
              <Select
                id="pref-source-lang"
                value={s.preferences.default_source_lang}
                onChange={(e) =>
                  s.setPreferences((prev) => ({ ...prev, default_source_lang: e.target.value }))
                }
                className="mt-1.5"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label} — {l.native} ({l.code.toUpperCase()})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="pref-target-lang">Langue cible par défaut (Traduction)</Label>
              <Select
                id="pref-target-lang"
                value={s.preferences.default_target_lang}
                onChange={(e) =>
                  s.setPreferences((prev) => ({ ...prev, default_target_lang: e.target.value }))
                }
                className="mt-1.5"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label} — {l.native} ({l.code.toUpperCase()})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {s.sameLanguage && (
            <p className="text-xs text-danger">
              La langue source et la langue cible par défaut doivent être différentes.
            </p>
          )}

          <div className="flex items-center justify-end border-t border-hairline pt-4">
            <Button type="submit" size="sm" disabled={s.savingPrefs || s.sameLanguage}>
              {s.savingPrefs ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              <span>Enregistrer les valeurs par défaut</span>
            </Button>
          </div>
        </form>
      </section>

      {/* 2. Lettrage (Typesetting) & Automatisation IA */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-6">
        <div className="border-b border-hairline pb-4">
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <Type className="size-4 text-seal" />
            <span>Lettrage (Typesetting) &amp; Assistants IA</span>
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            Définissez le style typographique appliqué par défaut sur les bulles nettoyées et les automatisations du Studio.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="studio-font-scale">Échelle de police par défaut</Label>
            <Select
              id="studio-font-scale"
              value={s.studioSettings.defaultFontScale}
              onChange={(e) =>
                s.updateStudioSetting(
                  'defaultFontScale',
                  e.target.value as '85' | '100' | '115' | '130',
                )
              }
              className="mt-1.5"
            >
              <option value="85">85% — Compact (Bulles étroites)</option>
              <option value="100">100% — Standard (Recommandé)</option>
              <option value="115">115% — Confort (Lecture mobile / Webtoon)</option>
              <option value="130">130% — Grand (Effets &amp; dialogues expressifs)</option>
            </Select>
          </div>

          <div>
            <Label htmlFor="studio-stroke-color">Contour du texte (Outline) par défaut</Label>
            <Select
              id="studio-stroke-color"
              value={s.studioSettings.defaultStrokeColor}
              onChange={(e) =>
                s.updateStudioSetting(
                  'defaultStrokeColor',
                  e.target.value as 'white' | 'black' | 'none',
                )
              }
              className="mt-1.5"
            >
              <option value="white">Halo Blanc (Idéal sur fonds tramés)</option>
              <option value="black">Contour Noir (Idéal sur textes clairs)</option>
              <option value="none">Aucun contour (Texte plat sur bulle blanche)</option>
            </Select>
          </div>
        </div>

        <div className="divide-y divide-hairline border-t border-hairline pt-2">
          <label className="flex cursor-pointer items-center justify-between gap-4 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-sheet text-ink-soft">
                <Sparkles className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">
                  Suggestions automatiques de la Mémoire de Traduction (TM)
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Propose automatiquement les traductions déjà validées dans vos chapitres précédents lorsqu’une réplique similaire est détectée.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={s.studioSettings.autoEnableTm}
              onChange={(e) => s.updateStudioSetting('autoEnableTm', e.target.checked)}
              className="size-4 accent-[var(--color-seal)] rounded cursor-pointer shrink-0"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-4 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-sheet text-ink-soft">
                <CheckCircle2 className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">
                  Contrôle Qualité IA (AI QC) automatique
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Signale automatiquement les termes du glossaire non respectés et les textes trop longs pour leur bulle.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={s.studioSettings.autoRunQc}
              onChange={(e) => s.updateStudioSetting('autoRunQc', e.target.checked)}
              className="size-4 accent-[var(--color-seal)] rounded cursor-pointer shrink-0"
            />
          </label>
        </div>
      </section>

      {/* 3. Diagnostic en direct des moteurs OCR & IA installés */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
          <div>
            <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
              <Cpu className="size-4 text-seal" />
              <span>État des moteurs OCR &amp; IA du serveur</span>
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              Vérification en temps réel des bibliothèques de vision par ordinateur et de traduction installées sur votre machine.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-moss/30 bg-moss/10 px-2.5 py-1 font-mono text-[11px] font-medium text-moss">
            <span className="size-1.5 rounded-full bg-moss" />
            Pipeline Hybride Actif
          </span>
        </div>

        <div className="grid gap-3.5 md:grid-cols-2">
          {/* MangaOCR */}
          <div className="flex items-start justify-between gap-3 rounded-xl border border-hairline bg-sheet p-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink">MangaOCR (Vision-Transformer)</p>
                <span className="rounded border border-hairline bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                  JA Vertical
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                Reconnaissance haute précision des mangas japonais verticaux, polices manuscrites et kanjis stylisés.
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                s.systemStatus?.manga_ocr_installed
                  ? 'border-moss/30 bg-moss/10 text-moss'
                  : 'border-amber/30 bg-amber/10 text-amber',
              )}
            >
              {s.systemStatus?.manga_ocr_installed ? (
                <>
                  <CheckCircle2 className="size-3" /> Installé
                </>
              ) : (
                <>
                  <AlertCircle className="size-3" /> Absent
                </>
              )}
            </span>
          </div>

          {/* PaddleOCR */}
          <div className="flex items-start justify-between gap-3 rounded-xl border border-hairline bg-sheet p-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink">PaddleOCR PP-OCRv4</p>
                <span className="rounded border border-hairline bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                  KO · ZH · EN
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                Moteur neuronal spécialisé pour les Webtoons coréens (Hangul), Manhuas chinois et Comics anglais.
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                s.systemStatus?.paddle_ocr_installed
                  ? 'border-moss/30 bg-moss/10 text-moss'
                  : 'border-amber/30 bg-amber/10 text-amber',
              )}
            >
              {s.systemStatus?.paddle_ocr_installed ? (
                <>
                  <CheckCircle2 className="size-3" /> Installé
                </>
              ) : (
                <>
                  <AlertCircle className="size-3" /> Absent
                </>
              )}
            </span>
          </div>

          {/* Tesseract OCR */}
          <div className="flex items-start justify-between gap-3 rounded-xl border border-hairline bg-sheet p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Tesseract OCR 5 + Tessdata</p>
              <p className="mt-1 text-xs text-ink-soft">
                Packs de langues détectés :{' '}
                <span className="font-mono text-ink">
                  {s.systemStatus?.tesseract_langs?.length
                    ? s.systemStatus.tesseract_langs.join(', ')
                    : s.loadingStatus
                    ? 'Vérification...'
                    : 'Standard'}
                </span>
              </p>
            </div>
            <span
              className={cn(
                'shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                s.systemStatus?.tesseract_installed
                  ? 'border-moss/30 bg-moss/10 text-moss'
                  : 'border-amber/30 bg-amber/10 text-amber',
              )}
            >
              {s.systemStatus?.tesseract_installed ? (
                <>
                  <CheckCircle2 className="size-3" /> Installé
                </>
              ) : (
                <>
                  <AlertCircle className="size-3" /> Absent
                </>
              )}
            </span>
          </div>

          {/* Inpainting & Traduction */}
          <div className="flex items-start justify-between gap-3 rounded-xl border border-hairline bg-sheet p-4">
            <div>
              <p className="text-sm font-semibold text-ink">Inpainting &amp; Traduction IA</p>
              <p className="mt-1 text-xs text-ink-soft">
                Reconstruction de fond OpenCV Telea/NS sans trace ·{' '}
                {s.systemStatus?.ollama_configured
                  ? `LLM Local (${s.systemStatus.ollama_model})`
                  : 'Traducteur neuronal'}
                {s.systemStatus?.deepl_configured ? ' + DeepL Pro' : ''}
              </p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-moss/30 bg-moss/10 px-2.5 py-0.5 text-[11px] font-medium text-moss">
              <CheckCircle2 className="size-3" /> Actif
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
