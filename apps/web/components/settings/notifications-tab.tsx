'use client'

import { Bell, Mail, MessageSquare, Sparkles, Coins, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Settings } from './use-settings'

export function NotificationsTab({ s }: { s: Settings }) {
  return (
    <div className="space-y-6">
      {/* 1. Alertes dans l'Atelier */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-5">
        <div className="border-b border-hairline pb-4">
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <Bell className="size-4 text-seal" />
            <span>Alertes de l’Atelier &amp; Équipe</span>
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            Choisissez quelles notifications s’affichent pendant que vous traduisez et nettoyez vos chapitres.
          </p>
        </div>

        <div className="divide-y divide-hairline">
          <label className="flex cursor-pointer items-center justify-between gap-4 py-4 first:pt-1">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-sheet text-ink-soft">
                <Sparkles className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">
                  Fin de traitement de chapitre complet (Batch IA)
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Affiche une alerte dès que l’OCR, la traduction et l’inpainting d’un chapitre entier sont terminés.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={s.studioSettings.notifyBatchComplete}
              onChange={(e) => s.updateStudioSetting('notifyBatchComplete', e.target.checked)}
              className="size-4 accent-[var(--color-seal)] rounded cursor-pointer shrink-0"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-4 py-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-sheet text-ink-soft">
                <MessageSquare className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">
                  Notes de relecture &amp; activité de l’équipe
                </p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Me prévenir lorsqu’un relecteur (QC), traducteur ou éditeur ajoute une note sur une planche ou change son statut.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={s.studioSettings.notifyTeamComments}
              onChange={(e) => s.updateStudioSetting('notifyTeamComments', e.target.checked)}
              className="size-4 accent-[var(--color-seal)] rounded cursor-pointer shrink-0"
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-4 py-4 last:pb-1">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-hairline bg-sheet text-ink-soft">
                <Coins className="size-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-ink">Alerte de seuil de crédits IA bas</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  M’avertir lorsque mon solde mensuel de crédits IA passe sous la barre des 20% disponibles.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={s.studioSettings.notifyLowCredits}
              onChange={(e) => s.updateStudioSetting('notifyLowCredits', e.target.checked)}
              className="size-4 accent-[var(--color-seal)] rounded cursor-pointer shrink-0"
            />
          </label>
        </div>
      </section>

      {/* 2. Communications par e-mail (RGPD) */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-5">
        <div className="border-b border-hairline pb-4">
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <Mail className="size-4 text-seal" />
            <span>Communications par e-mail &amp; Nouveautés (RGPD)</span>
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            Gérez votre consentement pour les annonces de mises à jour majeures de Taurge (modifiable à tout moment).
          </p>
        </div>

        <form onSubmit={s.handleSaveNotifications} className="space-y-5">
          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-hairline bg-sheet p-4">
            <div>
              <p className="text-sm font-semibold text-ink">
                Journal des mises à jour produit &amp; nouveaux modèles IA
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                Recevoir un e-mail occasionnel lors de l’ajout de nouveaux moteurs OCR, d’inpainting ou d’outils collaboratifs (zéro spam).
              </p>
            </div>
            <input
              type="checkbox"
              checked={s.newsletterOptIn}
              onChange={(e) => s.setNewsletterOptIn(e.target.checked)}
              className="size-4 accent-[var(--color-seal)] rounded cursor-pointer shrink-0"
            />
          </label>

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={s.savingNotifications}>
              {s.savingNotifications ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              <span>Enregistrer mes préférences e-mail</span>
            </Button>
          </div>
        </form>
      </section>
    </div>
  )
}
