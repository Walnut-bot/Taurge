'use client'

import { useEffect, useState } from 'react'
import { useMe, useRequireAuth } from '@/lib/hooks'
import { api, clearToken } from '@/lib/api'
import type { ContentType } from '@/lib/types'

export type SettingsTab = 'profile' | 'preferences' | 'security' | 'billing'

export function useSettings(initialTab: SettingsTab = 'profile') {
  const authed = useRequireAuth()
  const { data: me, mutate } = useMe(authed)
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState<'avatar' | 'banner' | 'delete-avatar' | 'delete-banner' | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [preferences, setPreferences] = useState({
    default_content_type: 'manga' as ContentType,
    default_source_lang: 'ja',
    default_target_lang: 'fr',
  })
  const [savingPrefs, setSavingPrefs] = useState(false)
  const [deleteEmail, setDeleteEmail] = useState('')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)

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
    setBusy(`delete-${kind}` as typeof busy)
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

  function logout() {
    clearToken()
    window.location.href = '/login'
  }

  const remaining = me?.credits_remaining ?? 30
  const limit = me?.credits_limit ?? 30
  const percentUsed = Math.min(100, Math.round((remaining / (limit || 1)) * 100))

  return {
    authed, me, activeTab, setActiveTab, bannerUrl, displayName, setDisplayName,
    busy, savingName, preferences, setPreferences, savingPrefs, deleteEmail,
    setDeleteEmail, deletingAccount, notice, setNotice, sameLanguage,
    remaining, limit, percentUsed, handleDeleteAccount, handleUploadImage,
    handleDeleteImage, handleSaveDisplayName, handleSavePreferences, logout,
  }
}

export type Settings = ReturnType<typeof useSettings>
