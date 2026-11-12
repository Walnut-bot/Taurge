'use client'

import { Keyboard } from 'lucide-react'

const SHORTCUT_GROUPS = [
  {
    category: 'Navigation & Planche (Studio)',
    description: 'Déplacez-vous rapidement d’une planche à l’autre et inspectez les moindres détails.',
    items: [
      { keys: ['←', '→'], label: 'Passer à la page précédente / suivante du chapitre' },
      { keys: ['Molette', '+', '-'], label: 'Zoomer / Dézoomer sur la planche active' },
      { keys: ['Espace', 'Glisser'], label: 'Déplacer la planche (Pan) dans le canevas' },
      { keys: ['F11'], label: 'Activer / Quitter le mode immersion plein écran' },
    ],
  },
  {
    category: 'Édition des Bulles & Traduction',
    description: 'Manipulez les bulles détectées et validez vos traductions sans quitter le clavier.',
    items: [
      { keys: ['Clic sur bulle'], label: 'Sélectionner la bulle sur la planche et ouvrir son éditeur' },
      { keys: ['Ctrl', 'Entrée'], label: 'Enregistrer le texte source ou la traduction de la bulle active' },
      { keys: ['Échap'], label: 'Annuler l’édition en cours ou désélectionner la bulle' },
      { keys: ['Suppr'], label: 'Supprimer la bulle sélectionnée de la planche' },
    ],
  },
  {
    category: 'Historique, Nettoyage & Contrôle Qualité',
    description: 'Comparez l’original et la version nettoyée à tout moment.',
    items: [
      { keys: ['Ctrl', 'Z'], label: 'Annuler la dernière modification sur la planche (Undo)' },
      { keys: ['Ctrl', 'Y'], label: 'Rétablir la modification annulée (Redo)' },
      { keys: ['Original / Cleaned'], label: 'Basculer entre la planche brute et la planche nettoyée & lettrée' },
      { keys: ['QC Curtain'], label: 'Comparer avant/après avec le rideau d’inspection interactif' },
    ],
  },
]

export function ShortcutsTab() {
  return (
    <div className="space-y-6">
      <section className="panel p-6 sm:p-8 rounded-xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline pb-4">
          <div>
            <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
              <Keyboard className="size-4 text-seal" />
              <span>Raccourcis Clavier de l’Atelier</span>
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              Maîtrisez les commandes rapides de Taurge Studio pour accélérer votre flux d’OCR, de traduction et de lettrage.
            </p>
          </div>
          <span className="rounded-lg border border-hairline bg-sheet px-3 py-1 font-mono text-xs text-ink-soft">
            PC (Ctrl) &amp; Mac (⌘ Cmd)
          </span>
        </div>

        <div className="space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
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
