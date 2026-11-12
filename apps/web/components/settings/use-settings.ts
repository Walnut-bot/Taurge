'use client'

import { useEffect, useState } from 'react'
import { usePathname as useNextPathname, useRouter } from 'next/navigation'
import { useMe, useRequireAuth } from '@/lib/hooks'
import { api, clearToken } from '@/lib/api'
import { getSavedTheme, saveAndApplyTheme, type Theme } from '@/lib/theme'
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from '@/i18n/config'
import { useLocale } from '@/i18n/provider'
import type { ContentType, SystemStatus } from '@/lib/types'

export type SettingsTab =
  | 'profile'
  | 'appearance'
  | 'preferences'
  | 'shortcuts'
  | 'notifications'
  | 'security'
  | 'billing'

export interface StudioLocalSettings {
  showBubbleBadges: boolean
  autoPreviewCleaned: boolean
  confirmBeforeDeleteBubble: boolean
  canvasGrid: boolean
  defaultFontScale: '85' | '100' | '115' | '130'
  defaultStrokeColor: 'white' | 'black' | 'none'
  autoEnableTm: boolean
  autoRunQc: boolean
  notifyBatchComplete: boolean
  notifyTeamComments: boolean
  notifyLowCredits: boolean
}

const STUDIO_SETTINGS_KEY = 'taurge_studio_settings_v1'

const DEFAULT_STUDIO_SETTINGS: StudioLocalSettings = {
  showBubbleBadges: true,
  autoPreviewCleaned: true,
  confirmBeforeDeleteBubble: false,
  canvasGrid: true,
  defaultFontScale: '100',
  defaultStrokeColor: 'white',
  autoEnableTm: true,
  autoRunQc: true,
  notifyBatchComplete: true,
  notifyTeamComments: true,
  notifyLowCredits: true,
}

export function useSettings(initialTab: SettingsTab = 'profile') {
  const authed = useRequireAuth()
  const { data: me, mutate } = useMe(authed)
  const locale = useLocale()
  const router = useRouter()
  const pathname = useNextPathname() ?? '/'

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState<'avatar' | 'banner' | 'delete-avatar' | 'delete-banner' | null>(null)
  const [savingName, setSavingName] = useState(false)

  // Thème & paramètres locaux d'atelier
  const [themeChoice, setThemeChoice] = useState<Theme>('system')
  const [studioSettings, setStudioSettings] = useState<StudioLocalSettings>(DEFAULT_STUDIO_SETTINGS)

  // Préférences projet (backend)
  const [preferences, setPreferences] = useState({
    default_content_type: 'manga' as ContentType,
    default_source_lang: 'ja',
    default_target_lang: 'fr',
  })
  const [savingPrefs, setSavingPrefs] = useState(false)

  // Statut des moteurs IA / OCR (backend)
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(false)

  // Notifications (backend + local)
  const [newsletterOptIn, setNewsletterOptIn] = useState(false)
  const [savingNotifications, setSavingNotifications] = useState(false)

  // Sécurité & Mot de passe & RGPD
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [exportingData, setExportingData] = useState(false)
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)

  // Facturation & historique de consommation
  const [billingHistory, setBillingHistory] = useState<{
    month_credits_used: number
    entries: {
      id: string
      action_type: string
      amount: number
      description: string | null
      project_id: string | null
      created_at: string
    }[]
  } | null>(null)

  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)

  // Initialisation thème et configuration locale d'atelier
  useEffect(() => {
    setThemeChoice(getSavedTheme())
    try {
      const raw = localStorage.getItem(STUDIO_SETTINGS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StudioLocalSettings>
        setStudioSettings({ ...DEFAULT_STUDIO_SETTINGS, ...parsed })
      }
    } catch {
      // ignore
    }
  }, [])

  // Chargement statut moteurs IA et historique de facturation
  useEffect(() => {
    if (!authed) return
    setLoadingStatus(true)
    api
      .systemStatus()
      .then((st) => setSystemStatus(st))
      .catch(() => setSystemStatus(null))
      .finally(() => setLoadingStatus(false))

    api
      .billingHistory()
      .then((hist) => setBillingHistory(hist))
      .catch(() => setBillingHistory(null))
  }, [authed])

  function handleSelectTheme(next: Theme) {
    setThemeChoice(next)
    saveAndApplyTheme(next)
    setNotice({
      text:
        next === 'dark'
          ? 'Thème Sombre (Encre Sumi) activé.'
          : next === 'light'
          ? 'Thème Clair (Papier Washi) activé.'
          : 'Thème synchronisé avec votre système.',
      error: false,
    })
  }

  function handleSelectLocale(next: Locale) {
    if (next === locale) return
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`
    const segments = pathname.split('/')
    segments[1] = next
    router.replace(segments.join('/') || `/${next}`)
    router.refresh()
  }

  function updateStudioSetting<K extends keyof StudioLocalSettings>(
    key: K,
    value: StudioLocalSettings[K],
  ) {
    setStudioSettings((prev) => {
      const next = { ...prev, [key]: value }
      try {
        localStorage.setItem(STUDIO_SETTINGS_KEY, JSON.stringify(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  function resetStudioSettings() {
    setStudioSettings(DEFAULT_STUDIO_SETTINGS)
    try {
      localStorage.setItem(STUDIO_SETTINGS_KEY, JSON.stringify(DEFAULT_STUDIO_SETTINGS))
    } catch {
      // ignore
    }
    setNotice({ text: 'Paramètres locaux de l’atelier réinitialisés aux valeurs d’origine.', error: false })
  }

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

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    if (!me?.banner_content_type) {
      setBannerUrl(null)
      return
    }
    api
      .profileImage('banner')
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

  useEffect(() => {
    if (me) {
      setDisplayName(me.display_name ?? '')
      setPreferences({
        default_content_type: (me.default_content_type as ContentType) ?? 'manga',
        default_source_lang: me.default_source_lang ?? 'ja',
        default_target_lang: me.default_target_lang ?? 'fr',
      })
      setNewsletterOptIn(Boolean(me.newsletter_opt_in))
    }
  }, [me])

  async function handleUploadImage(kind: 'avatar' | 'banner', file?: File) {
    if (!file) return
    setBusy(kind)
    setNotice(null)
    try {
      const updated = await api.uploadProfileImage(kind, file)
      await mutate(updated)
      setNotice({
        text: kind === 'avatar' ? 'Photo de profil mise à jour.' : 'Bannière de profil mise à jour.',
        error: false,
      })
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : "Erreur lors de l'enregistrement de l'image.",
        error: true,
      })
    } finally {
      setBusy(null)
    }
  }

  async function handleDeleteImage(kind: 'avatar' | 'banner') {
    setBusy(`delete-${kind}` as typeof busy)
    setNotice(null)
    try {
      const updated = await api.deleteProfileImage(kind)
      await mutate(updated)
      setNotice({
        text: kind === 'avatar' ? 'Photo de profil supprimée.' : 'Bannière supprimée.',
        error: false,
      })
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : "Erreur lors de la suppression de l'image.",
        error: true,
      })
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
      setNotice({
        text: err instanceof Error ? err.message : "Impossible d'enregistrer le nom.",
        error: true,
      })
    } finally {
      setSavingName(false)
    }
  }

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
      setNotice({ text: 'Préférences d’atelier et de projet enregistrées avec succès.', error: false })
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'Impossible de sauvegarder les préférences.',
        error: true,
      })
    } finally {
      setSavingPrefs(false)
    }
  }

  async function handleSaveNotifications(e: React.FormEvent) {
    e.preventDefault()
    setSavingNotifications(true)
    setNotice(null)
    try {
      const updated = await api.updateProfile({ newsletter_opt_in: newsletterOptIn })
      await mutate(updated)
      setNotice({ text: 'Préférences de notifications enregistrées.', error: false })
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'Impossible de sauvegarder les notifications.',
        error: true,
      })
    } finally {
      setSavingNotifications(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    if (!currentPassword || !newPassword) {
      setNotice({ text: 'Veuillez renseigner votre mot de passe actuel et le nouveau.', error: true })
      return
    }
    if (newPassword.length < 8) {
      setNotice({ text: 'Le nouveau mot de passe doit contenir au moins 8 caractères.', error: true })
      return
    }
    if (newPassword !== confirmPassword) {
      setNotice({ text: 'La confirmation du nouveau mot de passe ne correspond pas.', error: true })
      return
    }
    setSavingPassword(true)
    setNotice(null)
    try {
      const res = await api.changePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setNotice({ text: res.message || 'Mot de passe modifié avec succès.', error: false })
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'Impossible de modifier le mot de passe.',
        error: true,
      })
    } finally {
      setSavingPassword(false)
    }
  }

  async function handleExportPersonalData() {
    if (exportingData) return
    setExportingData(true)
    setNotice(null)
    try {
      await api.exportPersonalData()
      setNotice({ text: 'Archive RGPD (.json) générée et téléchargée avec succès.', error: false })
    } catch (err) {
      setNotice({
        text: err instanceof Error ? err.message : 'Impossible d’exporter vos données personnelles.',
        error: true,
      })
    } finally {
      setExportingData(false)
    }
  }

  function logout() {
    clearToken()
    window.location.href = '/login'
  }

  const remaining = me?.credits_remaining ?? 30
  const limit = me?.credits_limit ?? 30
  const percentUsed = Math.min(100, Math.round((remaining / (limit || 1)) * 100))

  return {
    authed,
    me,
    locale,
    activeTab,
    setActiveTab,
    bannerUrl,
    displayName,
    setDisplayName,
    busy,
    savingName,
    themeChoice,
    handleSelectTheme,
    handleSelectLocale,
    studioSettings,
    updateStudioSetting,
    resetStudioSettings,
    preferences,
    setPreferences,
    savingPrefs,
    systemStatus,
    loadingStatus,
    newsletterOptIn,
    setNewsletterOptIn,
    savingNotifications,
    handleSaveNotifications,
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    savingPassword,
    handleChangePassword,
    exportingData,
    handleExportPersonalData,
    deleteEmail,
    setDeleteEmail,
    deletingAccount,
    billingHistory,
    notice,
    setNotice,
    sameLanguage,
    remaining,
    limit,
    percentUsed,
    handleDeleteAccount,
    handleUploadImage,
    handleDeleteImage,
    handleSaveDisplayName,
    handleSavePreferences,
    logout,
  }
}

export type Settings = ReturnType<typeof useSettings>
