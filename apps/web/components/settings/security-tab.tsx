'use client'

import { KeyRound, Download, Trash2, LogOut, ShieldCheck, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import type { Settings } from './use-settings'

function getPasswordStrength(pw: string): { label: string; score: number; color: string } {
  if (!pw) return { label: '8 caractères minimum', score: 0, color: 'bg-hairline' }
  let score = 0
  if (pw.length >= 8) score += 1
  if (pw.length >= 12) score += 1
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score += 1
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score += 1

  if (score <= 1) return { label: 'Faible', score: 25, color: 'bg-danger' }
  if (score === 2) return { label: 'Moyen', score: 50, color: 'bg-amber' }
  if (score === 3) return { label: 'Robuste', score: 75, color: 'bg-moss' }
  return { label: 'Excellent', score: 100, color: 'bg-moss' }
}

export function SecurityTab({ s }: { s: Settings }) {
  const strength = getPasswordStrength(s.newPassword)

  return (
    <div className="space-y-6">
      {/* 1. Changement de mot de passe réel */}
      <section className="panel p-6 sm:p-8 rounded-xl space-y-6">
        <div className="border-b border-hairline pb-4">
          <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
            <KeyRound className="size-4 text-seal" />
            <span>Modifier votre mot de passe</span>
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            Choisissez un mot de passe robuste d’au moins 8 caractères pour sécuriser votre compte et vos projets.
          </p>
        </div>

        <form onSubmit={s.handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <Label htmlFor="sec-current-pw">Mot de passe actuel</Label>
            <Input
              id="sec-current-pw"
              type="password"
              required
              autoComplete="current-password"
              value={s.currentPassword}
              onChange={(e) => s.setCurrentPassword(e.target.value)}
              placeholder="••••••••••••"
              className="mt-1.5"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sec-new-pw">Nouveau mot de passe</Label>
              <span className="font-mono text-[11px] text-ink-soft">{strength.label}</span>
            </div>
            <Input
              id="sec-new-pw"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={s.newPassword}
              onChange={(e) => s.setNewPassword(e.target.value)}
              placeholder="Minimum 8 caractères"
              className="mt-1.5"
            />
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full border border-hairline bg-sheet">
              <div
                className={`h-full transition-all duration-300 ${strength.color}`}
                style={{ width: `${strength.score}%` }}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="sec-confirm-pw">Confirmer le nouveau mot de passe</Label>
            <Input
              id="sec-confirm-pw"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={s.confirmPassword}
              onChange={(e) => s.setConfirmPassword(e.target.value)}
              placeholder="Répétez le nouveau mot de passe"
              className="mt-1.5"
            />
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              size="sm"
              disabled={s.savingPassword || !s.currentPassword || s.newPassword.length < 8}
            >
              {s.savingPassword ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <KeyRound className="size-3.5" />
              )}
              <span>Mettre à jour le mot de passe</span>
            </Button>
          </div>
        </form>
      </section>

      {/* 2. Session active */}
      <section className="panel p-6 sm:p-8 rounded-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-ink flex items-center gap-2">
                <ShieldCheck className="size-4 text-moss" />
                <span>Session active sur cet appareil</span>
              </h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-moss/30 bg-moss/10 px-2.5 py-0.5 text-[11px] font-medium text-moss">
                <span className="size-1.5 rounded-full bg-moss" />
                Connecté
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-soft">
              Authentifié en tant que <span className="font-mono text-ink">{s.me?.email}</span> via jeton JWT sécurisé.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={s.logout} className="self-start sm:self-center">
            <LogOut className="size-3.5" />
            <span>Se déconnecter</span>
          </Button>
        </div>
      </section>

      {/* 3. Portabilité des données (RGPD Art. 20) */}
      <section className="panel p-6 sm:p-8 rounded-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="text-base font-semibold text-ink">
              Portabilité de vos données personnelles (RGPD Art. 20)
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              Téléchargez une archive JSON structurée contenant votre profil, votre abonnement, la liste de vos projets, vos entrées de glossaire et votre historique d’opérations IA.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={s.exportingData}
            onClick={s.handleExportPersonalData}
            className="shrink-0 self-start sm:self-center"
          >
            {s.exportingData ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            <span>Exporter mes données (.json)</span>
          </Button>
        </div>
      </section>

      {/* 4. Zone de danger — Droit à l'oubli (RGPD Art. 17) */}
      <section className="panel p-6 sm:p-8 rounded-xl border border-danger/30 bg-danger/5 space-y-5">
        <div>
          <h3 className="text-base font-semibold text-danger flex items-center gap-2">
            <Trash2 className="size-4" />
            <span>Zone de danger — Droit à l’oubli (RGPD Art. 17)</span>
          </h3>
          <p className="mt-1 text-xs text-ink-soft">
            La suppression de votre compte est immédiate et irréversible. Tous vos projets, planches importées, glossaires et traductions seront définitivement effacés de nos serveurs.
          </p>
        </div>

        <div className="max-w-md space-y-4">
          <div>
            <Label htmlFor="sec-delete-email" className="text-xs">
              Pour confirmer, saisissez votre adresse e-mail exacte (
              <span className="font-mono font-semibold text-danger">{s.me?.email}</span>) :
            </Label>
            <Input
              id="sec-delete-email"
              type="email"
              value={s.deleteEmail}
              onChange={(e) => s.setDeleteEmail(e.target.value)}
              placeholder={s.me?.email}
              className="mt-1.5"
            />
          </div>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={s.deletingAccount || s.deleteEmail.trim() !== s.me?.email}
            onClick={s.handleDeleteAccount}
          >
            {s.deletingAccount ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            <span>Supprimer définitivement mon compte</span>
          </Button>
        </div>
      </section>
    </div>
  )
}
