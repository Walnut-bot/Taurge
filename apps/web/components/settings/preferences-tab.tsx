'use client'

import { Loader2, Save, Cpu, CheckCircle2, AlertCircle, Sparkles, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label, Select } from '@/components/ui/field'
import { getLanguages } from '@/lib/catalog'
import { cn } from '@/lib/utils'
import type { ContentType } from '@/lib/types'
import type { Settings } from './use-settings'

function getFormatCards(locale: string): {
  id: ContentType
  title: string
  sub: string
  badge: string
}[] {
  const isEn = locale === 'en'
  return [
    {
      id: 'manga',
      title: isEn ? 'Japanese Manga' : 'Manga Japonais',
      sub: isEn
        ? 'Right-to-left reading (RTL) · Vertical JA'
        : 'Lecture de droite à gauche · Vertical JA',
      badge: isEn ? 'Right → Left' : 'Droite → Gauche',
    },
    {
      id: 'manhwa',
      title: isEn ? 'Manhwa / Webtoon' : 'Manhwa / Webtoon',
      sub: isEn
        ? 'Continuous vertical reading · Korean / English'
        : 'Lecture verticale en continu · Coréen / Anglais',
      badge: isEn ? 'Vertical Scroll' : 'Défilement vertical',
    },
    {
      id: 'manhua',
      title: isEn ? 'Chinese Manhua' : 'Manhua Chinois',
      sub: isEn
        ? 'Color pages & Chinese webtoon (ZH)'
        : 'Planches couleur & webtoon chinois (ZH)',
      badge: isEn ? 'Left → Right' : 'Gauche → Droite',
    },
    {
      id: 'comic',
      title: isEn ? 'Comics / European BD' : 'BD Européenne / Bande dessinée',
      sub: isEn
        ? 'Classic western left-to-right reading'
        : 'Lecture occidentale classique de gauche à droite',
      badge: isEn ? 'Left → Right' : 'Gauche → Droite',
    },
  ]
}

export function PreferencesTab({ s }: { s: Settings }) {
  const isEn = s.locale === 'en'
  const formatCards = getFormatCards(s.locale)
  const languages = getLanguages(s.locale)

  return (
    <div className="space-y-6">
      {/* 1. Paramètres par défaut des nouveaux projets */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-6">
        <div className="border-b border-hairline pb-4">
          <h2 className="text-lg font-semibold text-ink">
            {isEn ? 'Default settings for new projects' : 'Paramètres des nouveaux projets'}
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            {isEn
              ? 'These values pre-fill the project creation form automatically to speed up your workflow.'
              : 'Ces valeurs pré-remplissent automatiquement la fenêtre de création de projet pour accélérer votre flux de travail.'}
          </p>
        </div>

        <form onSubmit={s.handleSavePreferences} className="space-y-6">
          <div>
            <Label className="mb-2.5 block">
              {isEn ? 'Usual reading format' : 'Format de lecture habituel'}
            </Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {formatCards.map((fmt) => {
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
              <Label htmlFor="pref-source-lang">
                {isEn ? 'Default source language (OCR)' : 'Langue source par défaut (OCR)'}
              </Label>
              <Select
                id="pref-source-lang"
                value={s.preferences.default_source_lang}
                onChange={(e) =>
                  s.setPreferences((prev) => ({ ...prev, default_source_lang: e.target.value }))
                }
                className="mt-1.5"
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label} — {l.native} ({l.code.toUpperCase()})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="pref-target-lang">
                {isEn ? 'Default target language (Translation)' : 'Langue cible par défaut (Traduction)'}
              </Label>
              <Select
                id="pref-target-lang"
                value={s.preferences.default_target_lang}
                onChange={(e) =>
                  s.setPreferences((prev) => ({ ...prev, default_target_lang: e.target.value }))
                }
                className="mt-1.5"
              >
                {languages.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label} — {l.native} ({l.code.toUpperCase()})
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {s.sameLanguage && (
            <p className="text-xs text-danger">
              {isEn
                ? 'Default source and target languages must be different.'
                : 'La langue source et la langue cible par défaut doivent être différentes.'}
            </p>
          )}

          <div className="flex items-center justify-end border-t border-hairline pt-4">
            <Button type="submit" size="sm" disabled={s.savingPrefs || s.sameLanguage}>
              {s.savingPrefs ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              <span>{isEn ? 'Save defaults' : 'Enregistrer les valeurs par défaut'}</span>
            </Button>
          </div>
        </form>
      </section>

      {/* 2. Lettrage (Typesetting) & Automatisation IA */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-6">
        <div className="border-b border-hairline pb-4">
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <Type className="size-4 text-seal" />
            <span>
              {isEn ? 'Lettering (Typesetting) & AI Assistants' : 'Lettrage & Assistants IA'}
            </span>
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            {isEn
              ? 'Define the default typographic style applied to cleaned bubbles and Studio automations.'
              : 'Définissez le style typographique appliqué par défaut sur les bulles nettoyées et les automatisations du Studio.'}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="studio-font-scale">
              {isEn ? 'Default font scale' : 'Échelle de police par défaut'}
            </Label>
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
              <option value="85">
                {isEn ? '85% — Compact (Narrow bubbles)' : '85 % — Compact (Bulles étroites)'}
              </option>
              <option value="100">
                {isEn ? '100% — Standard (Recommended)' : '100 % — Standard (Recommandé)'}
              </option>
              <option value="115">
                {isEn
                  ? '115% — Comfort (Mobile reading / Webtoon)'
                  : '115 % — Confort (Lecture mobile / Webtoon)'}
              </option>
              <option value="130">
                {isEn
                  ? '130% — Large (Expressive effects & dialogue)'
                  : '130 % — Grand (Effets & dialogues expressifs)'}
              </option>
            </Select>
          </div>

          <div>
            <Label htmlFor="studio-stroke-color">
              {isEn ? 'Default text outline' : 'Contour du texte par défaut'}
            </Label>
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
              <option value="white">
                {isEn
                  ? 'White Halo (Ideal over screentones)'
                  : 'Halo blanc (Idéal sur fonds tramés)'}
              </option>
              <option value="black">
                {isEn
                  ? 'Black Outline (Ideal for light text)'
                  : 'Contour noir (Idéal sur textes clairs)'}
              </option>
              <option value="none">
                {isEn
                  ? 'No outline (Flat text on white bubble)'
                  : 'Aucun contour (Texte plat sur bulle blanche)'}
              </option>
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
                  {isEn
                    ? 'Automatic Translation Memory (TM) suggestions'
                    : 'Suggestions automatiques de la Mémoire de Traduction (MT)'}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {isEn
                    ? 'Automatically suggests translations validated in previous chapters when a similar line is detected.'
                    : 'Propose automatiquement les traductions déjà validées dans vos chapitres précédents lorsqu’une réplique similaire est détectée.'}
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
                  {isEn
                    ? 'Automatic AI Quality Check (AI QC)'
                    : 'Contrôle Qualité IA automatique'}
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {isEn
                    ? 'Automatically flags missed glossary terms and text that is too long for its bubble.'
                    : 'Signale automatiquement les termes du glossaire non respectés et les textes trop longs pour leur bulle.'}
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
              <span>
                {isEn ? 'Server OCR & AI Engine Status' : 'État des moteurs OCR & IA du serveur'}
              </span>
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              {isEn
                ? 'Real-time check of computer vision and translation libraries installed on the server.'
                : 'Vérification en temps réel des bibliothèques de vision par ordinateur et de traduction installées sur le serveur.'}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-moss/30 bg-moss/10 px-2.5 py-1 font-mono text-[11px] font-medium text-moss">
            <span className="size-1.5 rounded-full bg-moss" />
            {isEn ? 'Hybrid Pipeline Active' : 'Chaîne hybride active'}
          </span>
        </div>

        <div className="grid gap-3.5 md:grid-cols-2">
          {/* MangaOCR */}
          <div className="flex items-start justify-between gap-3 rounded-xl border border-hairline bg-sheet p-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-ink">MangaOCR</p>
                <span className="rounded border border-hairline bg-paper px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                  JA Vertical
                </span>
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                {isEn
                  ? 'High-accuracy recognition of vertical Japanese manga, handwritten fonts and stylized kanji.'
                  : 'Reconnaissance haute précision des mangas japonais verticaux, polices manuscrites et kanjis stylisés.'}
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
                  <CheckCircle2 className="size-3" /> {isEn ? 'Installed' : 'Installé'}
                </>
              ) : (
                <>
                  <AlertCircle className="size-3" /> {isEn ? 'Missing' : 'Absent'}
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
                {isEn
                  ? 'Neural engine specialized for Korean Webtoons (Hangul), Chinese Manhua and English Comics.'
                  : 'Moteur neuronal spécialisé pour les Webtoons coréens (Hangul), Manhuas chinois et bandes dessinées en anglais.'}
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
                  <CheckCircle2 className="size-3" /> {isEn ? 'Installed' : 'Installé'}
                </>
              ) : (
                <>
                  <AlertCircle className="size-3" /> {isEn ? 'Missing' : 'Absent'}
                </>
              )}
            </span>
          </div>

          {/* Tesseract OCR */}
          <div className="flex items-start justify-between gap-3 rounded-xl border border-hairline bg-sheet p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Tesseract OCR 5 + Tessdata</p>
              <p className="mt-1 text-xs text-ink-soft">
                {isEn ? 'Detected language packs:' : 'Packs de langues détectés :'}{' '}
                <span className="font-mono text-ink">
                  {s.systemStatus?.tesseract_langs?.length
                    ? s.systemStatus.tesseract_langs.join(', ')
                    : s.loadingStatus
                    ? isEn
                      ? 'Checking…'
                      : 'Vérification…'
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
                  <CheckCircle2 className="size-3" /> {isEn ? 'Installed' : 'Installé'}
                </>
              ) : (
                <>
                  <AlertCircle className="size-3" /> {isEn ? 'Missing' : 'Absent'}
                </>
              )}
            </span>
          </div>

          {/* Inpainting & Traduction */}
          <div className="flex items-start justify-between gap-3 rounded-xl border border-hairline bg-sheet p-4">
            <div>
              <p className="text-sm font-semibold text-ink">
                {isEn
                  ? 'Inpainting & AI Translation'
                  : 'Reconstruction de fond & Traduction IA'}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                {isEn
                  ? 'Seamless OpenCV Telea/NS background reconstruction · '
                  : 'Reconstruction de fond OpenCV Telea/NS sans trace · '}
                {s.systemStatus?.ollama_configured
                  ? `${isEn ? 'Local LLM' : 'Modèle local'} (${s.systemStatus.ollama_model})`
                  : isEn
                    ? 'Neural translator'
                    : 'Traducteur neuronal'}
                {s.systemStatus?.deepl_configured ? ' + DeepL Pro' : ''}
              </p>
            </div>
            <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-moss/30 bg-moss/10 px-2.5 py-0.5 text-[11px] font-medium text-moss">
              <CheckCircle2 className="size-3" /> {isEn ? 'Active' : 'Actif'}
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
