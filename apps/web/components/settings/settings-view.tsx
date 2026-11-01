'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import {
  UserRound,
  Sliders,
  ShieldCheck,
  Coins,
  Loader2,
  Save,
  ArrowUpRight,
  Sparkles,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { ProfileHeader } from '@/components/profile/profile-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/field'
import { useMe, useRequireAuth } from '@/lib/hooks'
import { api, clearToken } from '@/lib/api'
import { CONTENT_TYPES, LANGUAGES, contentTypeLabel, languageLabel } from '@/lib/catalog'
import type { ContentType, User } from '@/lib/types'
import { cn } from '@/lib/utils'

export type SettingsTab = 'profile' | 'preferences' | 'security' | 'billing'

interface SettingsViewProps {
  initialTab?: SettingsTab
}

export function SettingsView({ initialTab = 'profile' }: SettingsViewProps) {
  const authed = useRequireAuth()
  const { data: me, mutate } = useMe(authed)

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)

  // Profile image & banner states
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState<'avatar' | 'banner' | 'delete-avatar' | 'delete-banner' | null>(null)
  const [savingName, setSavingName] = useState(false)

  // Preferences states
  const [preferences, setPreferences] = useState({
    default_content_type: 'manga' as ContentType,
    default_source_lang: 'ja',
    default_target_lang: 'fr',
  })
  const [savingPrefs, setSavingPrefs] = useState(false)

  const [deleteEmail, setDeleteEmail] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)

  async function handleDeleteAccount() {
    if (!me || deletingAccount) return
    setDeletingAccount(true)
    try {
      await api.deleteAccount(deleteEmail.trim())
      clearToken()
      window.location.href = '/fr/login'
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Impossible de supprimer le compte.', error: true })
      setDeletingAccount(false)
    }
  }

  // Global notice state
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)

  // Load banner
  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    if (!me?.banner_content_type) {
      setBannerUrl(null)
      return
    }
    api.profileImage('banner')
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        if (active) setBannerUrl(objectUrl)
        else URL.revokeObjectURL(objectUrl)
      })
      .catch((err) => {
        console.error('Cannot load banner', err)
        if (active) setBannerUrl(null)
      })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [me?.id, me?.banner_content_type])

  // Sync preferences and display name
  useEffect(() => {
    if (me) {
      setDisplayName(me.display_name ?? '')
      setPreferences({
        default_content_type: (me.default_content_type as ContentType) ?? 'manga',
        default_source_lang: me.default_source_lang ?? 'ja',
        default_target_lang: me.default_target_lang ?? 'fr',
      })
    }
  }, [me])

  if (!authed) return null

  // Profile image handlers
  async function handleUploadImage(kind: 'avatar' | 'banner', file?: File) {
    if (!file) return
    setBusy(kind)
    setNotice(null)
    try {
      const updated = await api.uploadProfileImage(kind, file)
      await mutate(updated)
      setNotice({ text: kind === 'avatar' ? 'Photo de profil mise à jour.' : 'Bannière de profil mise à jour.', error: false })
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : "Erreur lors de l'enregistrement de l'image.", error: true })
    } finally {
      setBusy(null)
    }
  }

  async function handleDeleteImage(kind: 'avatar' | 'banner') {
    setBusy(`delete-${kind}` as any)
    setNotice(null)
    try {
      const updated = await api.deleteProfileImage(kind)
      await mutate(updated)
      setNotice({ text: kind === 'avatar' ? 'Photo de profil supprimée.' : 'Bannière supprimée.', error: false })
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : "Erreur lors de la suppression de l'image.", error: true })
    } finally {
      setBusy(null)
    }
  }

  async function handleSaveDisplayName(e: React.FormEvent) {
    e.preventDefault()
    setSavingName(true)
    setNotice(null)
    try {
      const updated = await api.updateProfile({ display_name: displayName })
      await mutate(updated)
      setNotice({ text: "Nom d'affichage enregistré avec succès.", error: false })
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : "Impossible d'enregistrer le nom.", error: true })
    } finally {
      setSavingName(false)
    }
  }

  // Preferences save handler
  const sameLanguage = preferences.default_source_lang === preferences.default_target_lang

  async function handleSavePreferences(e: React.FormEvent) {
    e.preventDefault()
    if (sameLanguage) {
      setNotice({ text: 'Veuillez choisir deux langues différentes.', error: true })
      return
    }
    setSavingPrefs(true)
    setNotice(null)
    try {
      const updated = await api.updateProfile(preferences)
      await mutate(updated)
      setNotice({ text: 'Préférences enregistrées avec succès.', error: false })
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Impossible de sauvegarder les préférences.', error: true })
    } finally {
      setSavingPrefs(false)
    }
  }

  const remaining = me?.credits_remaining ?? 30
  const limit = me?.credits_limit ?? 30
  const percentUsed = Math.min(100, Math.round((remaining / (limit || 1)) * 100))

  const roleLabels: Record<string, string> = {
    owner: 'Propriétaire',
    translator: 'Traducteur',
    cleaner: 'Clean',
    typesetter: 'Lettrage',
    proofreader: 'Relecture',
  }

  return (
    <>
      <AppHeader />
      <main id="contenu" className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
        {/* En-tête de la page */}
        <div className="mb-6">
          <p className="label-mono text-ink-soft">Compte & Paramètres</p>
          <h1 className="mt-1 text-3xl sm:text-4xl font-bold tracking-tight text-ink">
            Paramètres du compte
          </h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Gérez votre profil public, vos préférences d’atelier, votre sécurité et vos crédits.
          </p>
        </div>

        {/* Bannière de notification */}
        {notice && (
          <div
            role={notice.error ? 'alert' : 'status'}
            className={cn(
              'mb-6 flex items-center justify-between gap-3 rounded-lg border-l-4 px-4 py-3 text-sm transition-all',
              notice.error
                ? 'border-danger bg-danger-wash text-danger'
                : 'border-ok bg-ok-wash text-ok'
            )}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-xs font-semibold uppercase opacity-75 hover:opacity-100"
            >
              Fermer
            </button>
          </div>
        )}

        {/* Navigation par Onglets Clean (Linear / Vercel style) */}
        <div className="mb-8 border-b border-hairline overflow-x-auto">
          <nav aria-label="Sections des paramètres" className="flex gap-2 sm:gap-4 min-w-max">
            <button
              type="button"
              onClick={() => {
                setActiveTab('profile')
                setNotice(null)
              }}
              className={cn(
                'flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-all',
                activeTab === 'profile'
                  ? 'border-seal text-seal font-semibold'
                  : 'border-transparent text-ink-soft hover:text-ink hover:border-hairline'
              )}
            >
              <UserRound className="size-4" />
              <span>Profil</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('preferences')
                setNotice(null)
              }}
              className={cn(
                'flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-all',
                activeTab === 'preferences'
                  ? 'border-seal text-seal font-semibold'
                  : 'border-transparent text-ink-soft hover:text-ink hover:border-hairline'
              )}
            >
              <Sliders className="size-4" />
              <span>Préférences</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('security')
                setNotice(null)
              }}
              className={cn(
                'flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-all',
                activeTab === 'security'
                  ? 'border-seal text-seal font-semibold'
                  : 'border-transparent text-ink-soft hover:text-ink hover:border-hairline'
              )}
            >
              <ShieldCheck className="size-4" />
              <span>Sécurité</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('billing')
                setNotice(null)
              }}
              className={cn(
                'flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-all',
                activeTab === 'billing'
                  ? 'border-seal text-seal font-semibold'
                  : 'border-transparent text-ink-soft hover:text-ink hover:border-hairline'
              )}
            >
              <Coins className="size-4" />
              <span>Facturation & Crédits</span>
              <span className="font-mono text-xs rounded-full bg-sheet border border-hairline px-2 py-0.5">
                {remaining}
              </span>
            </button>
          </nav>
        </div>

        {/* ─── ONGLET 1 : PROFIL ─── */}
        {activeTab === 'profile' && me && (
          <div className="space-y-6">
            {/* Header de couverture corrigé (pattern UI standard anti-clipping) */}
            <ProfileHeader
              user={me}
              bannerUrl={bannerUrl}
              onUploadBanner={(file) => handleUploadImage('banner', file)}
              onDeleteBanner={() => handleDeleteImage('banner')}
              onUploadAvatar={(file) => handleUploadImage('avatar', file)}
              onDeleteAvatar={() => handleDeleteImage('avatar')}
              busy={busy}
            />

            <div className="grid gap-6 md:grid-cols-2">
              {/* Formulaire Nom d'affichage */}
              <section className="panel p-5 sm:p-6 rounded-xl">
                <h3 className="text-base font-semibold text-ink">Nom public</h3>
                <p className="mt-1 text-xs text-ink-soft">
                  Ce nom sera affiché à votre équipe et dans le menu utilisateur.
                </p>
                <form onSubmit={handleSaveDisplayName} className="mt-4 flex flex-col gap-3">
                  <Label htmlFor="profile-display-name">Nom ou pseudo</Label>
                  <div className="flex gap-2">
                    <Input
                      id="profile-display-name"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={80}
                      placeholder="Ex: Shinichi, Alex K."
                      disabled={savingName}
                    />
                    <Button
                      type="submit"
                      variant="seal"
                      size="sm"
                      disabled={savingName || displayName === (me.display_name ?? '')}
                      className="shrink-0"
                    >
                      {savingName ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      <span className="hidden sm:inline">Enregistrer</span>
                    </Button>
                  </div>
                </form>
              </section>

              {/* Rôles et Projets */}
              <section className="panel p-5 sm:p-6 rounded-xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-ink">Vos rôles en atelier</h3>
                  <Link href="/dashboard" className="text-xs text-seal hover:underline inline-flex items-center gap-1">
                    <span>Voir projets</span>
                    <ArrowUpRight className="size-3" />
                  </Link>
                </div>
                <p className="mt-1 text-xs text-ink-soft">
                  Rôles qui vous sont attribués dans chaque projet actif.
                </p>

                {me.project_roles && me.project_roles.length > 0 ? (
                  <ul className="mt-4 divide-y divide-hairline">
                    {me.project_roles.map((pr) => (
                      <li key={`${pr.project_id}-${pr.role}`} className="flex items-center justify-between py-2.5 text-xs">
                        <Link href={`/projects/${pr.project_id}`} className="truncate font-medium text-ink hover:underline">
                          {pr.project_name}
                        </Link>
                        <span className="shrink-0 rounded-full border border-hairline bg-sheet px-2.5 py-0.5 text-ink-soft font-mono">
                          {roleLabels[pr.role] ?? pr.role}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-6 rounded-lg border border-dashed border-hairline p-4 text-center">
                    <p className="text-xs text-ink-soft">Aucun rôle projet assigné pour l'instant.</p>
                  </div>
                )}
              </section>
            </div>
          </div>
        )}

        {/* ─── ONGLET 2 : PRÉFÉRENCES ─── */}
        {activeTab === 'preferences' && me && (
          <form onSubmit={handleSavePreferences} className="panel p-6 sm:p-8 rounded-xl space-y-6">
            <div className="border-b border-hairline pb-4">
              <h2 className="text-lg font-semibold text-ink">Préférences des projets</h2>
              <p className="mt-1 text-xs text-ink-soft">
                Ces valeurs seront présélectionnées par défaut lors de la création de nouveaux chapitres ou projets.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2">
              <div className="flex flex-col gap-2 sm:col-span-2">
                <Label htmlFor="pref-content-type">Format de lecture habituel</Label>
                <Select
                  id="pref-content-type"
                  value={preferences.default_content_type}
                  onChange={(e) => setPreferences((curr) => ({ ...curr, default_content_type: e.target.value as ContentType }))}
                >
                  {CONTENT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label} — {type.hint}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="pref-source-lang">Langue source par défaut</Label>
                <Select
                  id="pref-source-lang"
                  value={preferences.default_source_lang}
                  aria-invalid={sameLanguage || undefined}
                  onChange={(e) => setPreferences((curr) => ({ ...curr, default_source_lang: e.target.value }))}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label} ({lang.native})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="pref-target-lang">Langue cible par défaut</Label>
                <Select
                  id="pref-target-lang"
                  value={preferences.default_target_lang}
                  aria-invalid={sameLanguage || undefined}
                  onChange={(e) => setPreferences((curr) => ({ ...curr, default_target_lang: e.target.value }))}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label} ({lang.native})
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-hairline pt-5">
              <p className={cn('text-xs', sameLanguage ? 'text-danger font-medium' : 'text-ink-soft')}>
                {sameLanguage
                  ? 'La langue source et la langue cible doivent être différentes.'
                  : `Traduction configurée : ${languageLabel(preferences.default_source_lang)} vers ${languageLabel(preferences.default_target_lang)}.`}
              </p>
              <Button type="submit" variant="seal" disabled={savingPrefs || sameLanguage}>
                {savingPrefs ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                <span>Enregistrer les préférences</span>
              </Button>
            </div>
          </form>
        )}

        {/* ─── ONGLET 3 : SÉCURITÉ ─── */}
        {activeTab === 'security' && me && (
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
                    onClick={() => {
                      clearToken()
                      window.location.href = '/login'
                    }}
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
                    value={deleteEmail}
                    onChange={(e) => setDeleteEmail(e.target.value)}
                    placeholder={me.email}
                  />
                </div>
                <Button
                  variant="danger"
                  disabled={deleteEmail.trim().toLowerCase() !== me.email.toLowerCase() || deletingAccount}
                  onClick={handleDeleteAccount}
                >
                  {deletingAccount ? <Loader2 className="size-4 animate-spin" /> : null}
                  <span>Supprimer définitivement</span>
                </Button>
              </div>
            </section>
          </div>
        )}

        {/* ─── ONGLET 4 : FACTURATION & CRÉDITS ─── */}
        {activeTab === 'billing' && me && (
          <div className="space-y-6">
            {/* Carte Jauge de Crédits */}
            <section className="panel p-6 sm:p-8 rounded-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-hairline pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-ink">Solde de crédits</h2>
                    <span className="rounded-full bg-seal-wash px-2.5 py-0.5 text-xs font-medium text-seal uppercase tracking-wider">
                      Plan {me.plan || 'Free'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-soft">
                    Les crédits sont consommés lors de la traduction IA contextuelle et du nettoyage intelligent.
                  </p>
                </div>

                <Button
                  variant="seal"
                  size="sm"
                  disabled
                  className="shrink-0"
                  title="Recharge bientôt disponible — aucun paiement n'est encore ouvert"
                  aria-describedby="refill-soon-note"
                >
                  <span>Recharge bientôt disponible</span>
                </Button>
                <span id="refill-soon-note" className="sr-only">
                  La recharge de crédits n'est pas encore disponible.
                </span>
              </div>

              {/* Jauge / Barre de progression visuelle */}
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-ink">Utilisation actuelle</span>
                  <span className="font-mono text-sm font-bold text-ink">
                    {remaining} <span className="font-normal text-ink-soft">/ {limit} crédits</span>
                  </span>
                </div>

                <div className="h-3 w-full rounded-full bg-sheet border border-hairline overflow-hidden p-0.5">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      percentUsed < 20 ? 'bg-amber-500' : 'bg-seal'
                    )}
                    style={{ width: `${percentUsed}%` }}
                  />
                </div>

                <div className="flex justify-between text-[11px] text-ink-soft">
                  <span>0 crédit</span>
                  <span>{percentUsed}% disponible</span>
                  <span>{limit} crédits max</span>
                </div>
              </div>
            </section>

            {/* Détails du plan */}
            <div className="grid gap-6 sm:grid-cols-2">
              <section className="panel p-5 sm:p-6 rounded-xl">
                <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                  <Sparkles className="size-4 text-seal" />
                  <span>Avantages de votre formule</span>
                </h3>
                <ul className="mt-3 space-y-2 text-xs text-ink-soft">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-ok shrink-0" />
                    <span>OCR adaptatif (PaddleOCR + MangaOCR vertical japonais)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-ok shrink-0" />
                    <span>Traduction contextuelle Ollama (LLM local), fallback DeepL</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-ok shrink-0" />
                    <span>Inpainting neuronal & nettoyage intelligent de bulles</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 text-ok shrink-0" />
                    <span>Exports haute résolution CBZ, PDF et ZIP</span>
                  </li>
                </ul>
              </section>

              <section className="panel p-5 sm:p-6 rounded-xl">
                <h3 className="text-sm font-semibold text-ink">Barème de consommation</h3>
                <dl className="mt-3 space-y-2.5 text-xs">
                  <div className="flex justify-between border-b border-hairline pb-1.5">
                    <dt className="text-ink-soft">Détection OCR locale</dt>
                    <dd className="font-mono font-medium text-ok">0 crédit (Gratuit)</dd>
                  </div>
                  <div className="flex justify-between border-b border-hairline pb-1.5">
                    <dt className="text-ink-soft">Traduction de bulle via Ollama / DeepL</dt>
                    <dd className="font-mono font-medium">1 crédit / page</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-soft">Nettoyage inpainting auto</dt>
                    <dd className="font-mono font-medium">1 crédit / page</dd>
                  </div>
                </dl>
              </section>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
