'use client'

import { Loader2, CheckCircle2, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import type { Settings } from './use-settings'

export function SecurityTab({ s }: { s: Settings }) {
  const { me } = s
  if (!me) return null
  return (
    <div className="space-y-6">
      <section className="panel p-6 sm:p-8 rounded-xl space-y-6">
        <div className="border-b border-hairline pb-4">
          <h2 className="text-lg font-semibold text-ink">Identifiants et Authentification</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Gérez l’adresse email et l’accès sécurisé à votre atelier Taurge.
          </p>
        </div>
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-sheet border border-hairline">
            <div>
              <p className="text-xs font-semibold text-ink">Adresse email principale</p>
              <p className="font-mono text-sm text-ink-soft mt-0.5">{me.email}</p>
            </div>
            <span className="flex items-center gap-1.5 text-xs text-ok font-medium">
              <CheckCircle2 className="size-4" />
              <span>Vérifié</span>
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-sheet border border-hairline">
            <div>
              <p className="text-xs font-semibold text-ink">Mot de passe du compte</p>
              <p className="text-xs text-ink-soft mt-0.5">Chiffré avec protection forte (bcrypt).</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => alert('Pour modifier votre mot de passe, contactez l’administrateur local ou réinitialisez le jeton.')}>
              <KeyRound className="size-3.5" />
              <span>Modifier</span>
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-sheet border border-hairline">
            <div>
              <p className="text-xs font-semibold text-ink">Session active</p>
              <p className="text-xs text-ink-soft mt-0.5">Connecté via jeton sécurisé JWT.</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={s.logout}
              className="text-danger hover:bg-danger-wash text-xs"
            >
              Se déconnecter de cette session
            </Button>
          </div>
        </div>
      </section>
      <section className="panel p-6 sm:p-8 rounded-xl space-y-4 border-danger/40" aria-labelledby="delete-account-title">
        <div>
          <h2 id="delete-account-title" className="text-lg font-semibold text-danger">Supprimer mon compte et mes données</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Suppression définitive : compte, projets, fichiers importés, glossaires, historique de consommation et transactions. Cette action est irréversible.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="delete-confirm-email">Retapez votre e-mail pour confirmer</Label>
            <Input
              id="delete-confirm-email"
              type="email"
              autoComplete="off"
              value={s.deleteEmail}
              onChange={(e) => s.setDeleteEmail(e.target.value)}
              placeholder={me.email}
            />
          </div>
          <Button
            variant="danger"
            disabled={s.deleteEmail.trim().toLowerCase() !== me.email.toLowerCase() || s.deletingAccount}
            onClick={s.handleDeleteAccount}
          >
            {s.deletingAccount ? <Loader2 className="size-4 animate-spin" /> : null}
            <span>Supprimer définitivement</span>
          </Button>
        </div>
      </section>
    </div>
  )
}
