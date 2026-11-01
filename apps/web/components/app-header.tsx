'use client'

import { useRouter } from 'next/navigation'
import { useState, useRef, useEffect } from 'react'
import {
  LogOut,
  Coins,
  Settings,
  UserRound,
  Sun,
  Moon,
  ChevronDown,
} from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { CreditsModal } from '@/components/credits-modal'
import { LanguageSwitcher } from '@/components/language-switcher'
import { ProfileAvatar } from '@/components/profile-avatar'
import { Link as LocaleLink, localizeHref } from '@/i18n/navigation'
import { useLocale, useTranslations } from '@/i18n/provider'
import { clearToken } from '@/lib/api'
import { useMe } from '@/lib/hooks'
import { useTheme } from '@/lib/use-theme'
import { cn } from '@/lib/utils'

interface AppHeaderProps {
  children?: React.ReactNode
  center?: React.ReactNode
}

export function AppHeader({ children, center }: AppHeaderProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('Nav')
  const tRoles = useTranslations('Roles')
  const { data: me } = useMe(true)
  const { effectiveTheme, toggle: toggleTheme } = useTheme()
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Fermeture au clic extérieur et touche Échap
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setProfileMenuOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false)
      }
    }

    if (profileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [profileMenuOpen])

  function logout() {
    setProfileMenuOpen(false)
    clearToken()
    router.replace(localizeHref('/login', locale))
  }

  const remaining = me?.credits_remaining ?? 30
  const limit = me?.credits_limit ?? 30
  const isLow = remaining <= 5

  return (
    <>
    <CreditsModal />
    <header className="sticky top-0 z-40 w-full border-b border-hairline bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
      <div className="mx-auto flex h-14 w-full items-center justify-between gap-4 px-4 sm:px-6">
        {/* Côté Gauche : Logo + Fil d'Ariane / Titre du projet */}
        <div className="flex items-center gap-3 min-w-0">
          <Logo href="/dashboard" />
          {children && (
            <>
              <span className="hidden sm:inline-block h-4 w-px bg-hairline" aria-hidden="true" />
              <div className="flex items-center min-w-0 text-sm">
                {children}
              </div>
            </>
          )}
        </div>

        {/* Centre : Navigation de l'atelier (Page studio, Glossaire, Équipe) */}
        {center && (
          <div className="hidden md:flex items-center justify-center flex-1 min-w-0 px-4">
            {center}
          </div>
        )}

        {/* Côté Droit : Langue + Badge de crédits (Pill) + Avatar utilisateur (Dropdown) */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <LanguageSwitcher />
          {/* Badge compact de Crédits ("Pill" moderne) */}
          {me && (
            <div
              className="group flex items-center gap-1.5 sm:gap-2 rounded-full border border-hairline bg-sheet/90 px-2.5 py-1 text-xs shadow-xs transition-all hover:border-ink/20"
              title={t('creditsTitle')}
            >
              <Coins
                className={cn('size-3.5 shrink-0 transition-transform group-hover:scale-110', isLow ? 'text-amber-500 animate-pulse' : 'text-seal')}
                aria-hidden="true"
              />
              <span className="font-mono text-xs font-semibold text-ink">
                {remaining}{' '}
                <span className="font-sans font-normal text-ink-soft hidden sm:inline">
                  / {limit} {t('credits')}
                </span>
              </span>
              <LocaleLink
                href="/billing"
                className="ml-0.5 shrink-0 rounded-full bg-seal/10 px-2 py-0.5 font-sans text-[10px] font-medium text-seal transition-colors hover:bg-seal hover:text-seal-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal"
                title={t('refillTitle')}
                aria-label={`${t('refillCredits')} — ${t('refillSoon')}`}
              >
                {t('refillSoon')}
              </LocaleLink>
            </div>
          )}

          {/* Trigger de profil avec Dropdown intégré */}
          {me && (
            <div className="relative">
              <button
                ref={triggerRef}
                type="button"
                aria-label={t('accountMenu')}
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
                onClick={() => setProfileMenuOpen((open) => !open)}
                className="group flex items-center gap-1.5 rounded-full p-0.5 hover:ring-2 hover:ring-hairline transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal"
              >
                <div className="size-8 rounded-full border border-hairline bg-sheet overflow-hidden shadow-xs">
                  {me.avatar_content_type ? (
                    <ProfileAvatar user={me} className="size-full" />
                  ) : (
                    <div className="size-full flex items-center justify-center bg-sheet text-ink-soft group-hover:text-ink">
                      <UserRound aria-hidden="true" className="size-4" />
                    </div>
                  )}
                </div>
                <ChevronDown className="size-3.5 text-ink-soft group-hover:text-ink transition-transform hidden sm:block" />
              </button>

              {/* Menu déroulant rationalisé (Linear / Vercel style) */}
              {profileMenuOpen && (
                <div
                  ref={dropdownRef}
                  role="menu"
                  aria-label={t('userMenu')}
                  className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-hairline bg-sheet p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in-0 zoom-in-95 z-50 text-ink"
                >
                  {/* Informations utilisateur */}
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <div className="size-10 shrink-0 rounded-full border border-hairline bg-paper overflow-hidden">
                      <ProfileAvatar user={me} className="size-full" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink leading-tight">
                        {me.display_name || me.email.split('@')[0]}
                      </p>
                      <p className="truncate font-mono text-xs text-ink-soft mt-0.5">
                        {me.email}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-paper px-2 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wider text-ink-soft border border-hairline">
                      {me.plan || 'Free'}
                    </span>
                  </div>

                  {/* Rôles actifs si présents */}
                  {me.project_roles && me.project_roles.length > 0 && (
                    <div className="border-t border-hairline my-1 px-3 py-2">
                      <p className="label-mono text-[10px] text-ink-soft mb-1.5">{t('projectRoles')}</p>
                      <ul className="space-y-1">
                        {me.project_roles.slice(0, 3).map((pr) => (
                          <li key={`${pr.project_id}-${pr.role}`} className="flex justify-between gap-2 text-xs">
                            <span className="truncate text-ink-soft">{pr.project_name}</span>
                            <span className="shrink-0 font-medium">{roleLabel(pr.role, tRoles)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="my-1 h-px bg-hairline" />

                  {/* Accès rapides */}
                  <div className="space-y-0.5">
                    <LocaleLink
                      href="/profile"
                      role="menuitem"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink hover:bg-paper transition-colors"
                    >
                      <UserRound aria-hidden="true" className="size-4 text-ink-soft" />
                      <span>{t('profile')}</span>
                    </LocaleLink>
                    <LocaleLink
                      href="/settings"
                      role="menuitem"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink hover:bg-paper transition-colors"
                    >
                      <Settings aria-hidden="true" className="size-4 text-ink-soft" />
                      <span>{t('settings')}</span>
                    </LocaleLink>
                  </div>

                  <div className="my-1 h-px bg-hairline" />

                  {/* Toggle de thème intégré */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={toggleTheme}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-ink hover:bg-paper transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      {effectiveTheme === 'dark' ? (
                        <Sun aria-hidden="true" className="size-4 text-amber-500" />
                      ) : (
                        <Moon aria-hidden="true" className="size-4 text-seal" />
                      )}
                      <span>{effectiveTheme === 'dark' ? t('lightMode') : t('darkMode')}</span>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft px-1.5 py-0.5 rounded border border-hairline bg-paper">
                      {effectiveTheme === 'dark' ? t('dark') : t('light')}
                    </span>
                  </button>

                  <div className="my-1 h-px bg-hairline" />

                  {/* Déconnexion en rouge */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={logout}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-danger-wash transition-colors"
                  >
                    <LogOut aria-hidden="true" className="size-4" />
                    <span>{t('logout')}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
    </>
  )
}

function roleLabel(role: string, t: (key: string) => string) {
  const key = {
    owner: 'owner',
    translator: 'translator',
    cleaner: 'cleaner',
    typesetter: 'typesetter',
    proofreader: 'proofreader',
  }[role]
  return key ? t(key) : role
}
