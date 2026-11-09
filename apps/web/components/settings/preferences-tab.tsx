'use client'

import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label, Select } from '@/components/ui/field'
import { CONTENT_TYPES, LANGUAGES, languageLabel } from '@/lib/catalog'
import type { ContentType } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { Settings } from './use-settings'

export function PreferencesTab({ s }: { s: Settings }) {
  if (!s.me) return null
  const { preferences } = s
  return (
    <form onSubmit={s.handleSavePreferences} className="panel p-4 sm:p-8 rounded-xl space-y-6">
      <div className="border-b border-hairline pb-4">
        <h2 className="text-lg font-semibold text-ink">Préférences des projets</h2>
        <p className="mt-1 text-xs text-ink-soft">
          Ces valeurs seront présélectionnées par défaut lors de la création de nouveaux chapitres ou projets.
        </p>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-2 sm:col-span-2">
          <Label htmlFor="pref-content-type">Format de lecture habituel</Label>
          <Select
            id="pref-content-type"
            value={preferences.default_content_type}
            onChange={(e) => s.setPreferences((curr) => ({ ...curr, default_content_type: e.target.value as ContentType }))}
          >
            {CONTENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label} — {type.hint}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="pref-source-lang">Langue source par défaut</Label>
          <Select
            id="pref-source-lang"
            value={preferences.default_source_lang}
            aria-invalid={s.sameLanguage || undefined}
            onChange={(e) => s.setPreferences((curr) => ({ ...curr, default_source_lang: e.target.value }))}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label} ({lang.native})
              </option>
            ))}
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="pref-target-lang">Langue cible par défaut</Label>
          <Select
            id="pref-target-lang"
            value={preferences.default_target_lang}
            aria-invalid={s.sameLanguage || undefined}
            onChange={(e) => s.setPreferences((curr) => ({ ...curr, default_target_lang: e.target.value }))}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label} ({lang.native})
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-hairline pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className={cn('text-xs', s.sameLanguage ? 'text-danger font-medium' : 'text-ink-soft')}>
          {s.sameLanguage
            ? 'La langue source et la langue cible doivent être différentes.'
            : `Traduction configurée : ${languageLabel(preferences.default_source_lang)} vers ${languageLabel(preferences.default_target_lang)}.`}
        </p>
        <Button type="submit" variant="seal" disabled={s.savingPrefs || s.sameLanguage} className="w-full justify-center sm:w-auto">
          {s.savingPrefs ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          <span>Enregistrer les préférences</span>
        </Button>
      </div>
    </form>
  )
}
