'use client'

import { Keyboard } from 'lucide-react'
import { useLocale } from '@/i18n/provider'

function getShortcutGroups(locale: string) {
  const isEn = locale === 'en'
  return [
    {
      category: isEn ? 'Navigation & Page (Studio)' : 'Navigation & Planche (Atelier)',
      description: isEn
        ? 'Move quickly from one page to another and inspect every detail.'
        : 'Déplacez-vous rapidement d’une planche à l’autre et inspectez les moindres détails.',
      items: [
        {
          keys: ['←', '→'],
          label: isEn
            ? 'Go to the previous / next page of the chapter'
            : 'Passer à la page précédente / suivante du chapitre',
        },
        {
          keys: [isEn ? 'Wheel' : 'Molette', '+', '-'],
          label: isEn
            ? 'Zoom in / Zoom out on the active page'
            : 'Zoomer / Dézoomer sur la planche active',
        },
        {
          keys: [isEn ? 'Space' : 'Espace', isEn ? 'Drag' : 'Glisser'],
          label: isEn
            ? 'Pan the page inside the canvas'
            : 'Déplacer la planche dans le canevas',
        },
        {
          keys: ['F11'],
          label: isEn
            ? 'Enter / Exit full-screen immersion mode'
            : 'Activer / Quitter le mode immersion plein écran',
        },
      ],
    },
    {
      category: isEn ? 'Bubble Editing & Translation' : 'Édition des Bulles & Traduction',
      description: isEn
        ? 'Manipulate detected bubbles and validate your translations without leaving the keyboard.'
        : 'Manipulez les bulles détectées et validez vos traductions sans quitter le clavier.',
      items: [
        {
          keys: [isEn ? 'Click bubble' : 'Clic sur bulle'],
          label: isEn
            ? 'Select the bubble on the page and open its editor'
            : 'Sélectionner la bulle sur la planche et ouvrir son éditeur',
        },
        {
          keys: ['Ctrl', isEn ? 'Enter' : 'Entrée'],
          label: isEn
            ? 'Save the source text or translation of the active bubble'
            : 'Enregistrer le texte source ou la traduction de la bulle active',
        },
        {
          keys: [isEn ? 'Esc' : 'Échap'],
          label: isEn
            ? 'Cancel current edit or deselect the bubble'
            : 'Annuler l’édition en cours ou désélectionner la bulle',
        },
        {
          keys: [isEn ? 'Del' : 'Suppr'],
          label: isEn
            ? 'Delete the selected bubble from the page'
            : 'Supprimer la bulle sélectionnée de la planche',
        },
      ],
    },
    {
      category: isEn ? 'History, Cleaning & Quality Check' : 'Historique, Nettoyage & Contrôle Qualité',
      description: isEn
        ? 'Compare the original and cleaned versions at any time.'
        : 'Comparez l’original et la version nettoyée à tout moment.',
      items: [
        {
          keys: ['Ctrl', 'Z'],
          label: isEn
            ? 'Undo the last change on the page'
            : 'Annuler la dernière modification sur la planche',
        },
        {
          keys: ['Ctrl', 'Y'],
          label: isEn
            ? 'Redo the undone change'
            : 'Rétablir la modification annulée',
        },
        {
          keys: [isEn ? 'Original / Cleaned' : 'Original / Nettoyé'],
          label: isEn
            ? 'Switch between the raw page and the cleaned & lettered page'
            : 'Basculer entre la planche brute et la planche nettoyée & lettrée',
        },
        {
          keys: [isEn ? 'QC Curtain' : 'Rideau QC'],
          label: isEn
            ? 'Compare before/after with the interactive inspection curtain'
            : 'Comparer avant/après avec le rideau d’inspection interactif',
        },
      ],
    },
  ]
}

export function ShortcutsTab() {
  const locale = useLocale()
  const isEn = locale === 'en'
  const shortcutGroups = getShortcutGroups(locale)

  return (
    <div className="space-y-6">
      <section className="panel p-6 sm:p-8 rounded-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-4">
          <div>
            <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
              <Keyboard className="size-4 text-seal" />
              <span>
                {isEn ? 'Studio Keyboard Shortcuts' : 'Raccourcis Clavier de l’Atelier'}
              </span>
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              {isEn
                ? 'Master Taurge Studio quick commands to speed up your OCR, translation and lettering workflow.'
                : 'Maîtrisez les commandes rapides de Taurge Studio pour accélérer votre flux d’OCR, de traduction et de lettrage.'}
            </p>
          </div>
          <span className="rounded-lg border border-hairline bg-sheet px-3 py-1 font-mono text-xs text-ink-soft">
            {isEn ? 'PC (Ctrl) & Mac (⌘ Cmd)' : 'PC (Ctrl) & Mac (⌘ Cmd)'}
          </span>
        </div>

        <div className="space-y-5">
          {shortcutGroups.map((group) => (
            <div key={group.category} className="overflow-hidden rounded-xl border border-hairline bg-sheet/60">
              <div className="border-b border-hairline bg-sheet px-5 py-3.5">
                <h3 className="text-sm font-semibold text-ink">{group.category}</h3>
                <p className="mt-0.5 text-xs text-ink-soft">{group.description}</p>
              </div>
              <div className="divide-y divide-hairline">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-3.5 transition-colors hover:bg-paper/60"
                  >
                    <span className="text-sm text-ink">{item.label}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.keys.map((k, idx) => (
                        <span key={k} className="inline-flex items-center gap-1.5">
                          <kbd className="rounded-md border border-hairline bg-paper px-2.5 py-1 font-mono text-xs font-semibold text-ink shadow-2xs">
                            {k}
                          </kbd>
                          {idx < item.keys.length - 1 && (
                            <span className="text-xs text-ink-faint">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
