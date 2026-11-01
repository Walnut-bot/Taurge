'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { BookOpen, CreditCard, FolderKanban, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Plus, Settings } from 'lucide-react'
import { Link, usePathname } from '@/i18n/navigation'
import { useTranslations } from '@/i18n/provider'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'taurge:sidebar-collapsed'

/**
 * Coquille applicative : barre latérale pleine hauteur sur bureau
 * (repliable, choix mémorisé), barre compacte horizontale sur petit écran.
 * N'enveloppe pas l'éditeur (pleine largeur de travail).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('Shell')
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1')
    } catch {
      // Stockage indisponible : on reste déplié.
    }
  }, [])

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
      } catch {
        // Ignoré : l'état reste valable pour la session.
      }
      return next
    })
  }

  const items = [
    { href: '/dashboard', label: t('dashboard'), icon: LayoutDashboard, active: pathname === '/dashboard' },
    { href: '/projects', label: t('projects'), icon: FolderKanban, active: pathname.startsWith('/projects') },
    { href: '/glossary', label: t('glossary'), icon: BookOpen, active: pathname === '/glossary' },
    { href: '/billing', label: t('billing'), icon: CreditCard, active: pathname === '/billing' },
    { href: '/settings', label: t('settings'), icon: Settings, active: pathname === '/settings' || pathname === '/profile' },
  ]

  const toggleLabel = collapsed ? t('expandSidebar') : t('collapseSidebar')
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:items-stretch">
      <aside
        data-collapsed={collapsed || undefined}
        className={cn(
          'flex shrink-0 flex-col border-b border-hairline bg-sheet transition-[width] duration-200 motion-reduce:transition-none lg:border-r lg:border-b-0',
          collapsed ? 'lg:w-16' : 'lg:w-60',
        )}
      >
        <nav
          aria-label="Primary"
          className="flex flex-1 gap-1 overflow-x-auto p-3 lg:sticky lg:top-14 lg:flex-col lg:overflow-visible"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={cn(
                'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal',
                collapsed && 'lg:justify-center lg:px-2',
                item.active
                  ? 'bg-paper font-semibold text-ink'
                  : 'text-ink-soft hover:bg-paper hover:text-ink',
              )}
            >
              <item.icon aria-hidden="true" className="size-4 shrink-0" />
              <span className={cn(collapsed && 'lg:sr-only')}>{item.label}</span>
            </Link>
          ))}
          <Link
            href="/projects/new"
            title={collapsed ? t('newProject') : undefined}
            aria-label={collapsed ? t('newProject') : undefined}
            className={cn(
              buttonVariants({ variant: 'seal', size: 'sm' }),
              'mt-0 shrink-0 lg:mt-4',
              collapsed && 'lg:justify-center lg:px-2',
            )}
          >
            <Plus aria-hidden="true" />
            <span className={cn(collapsed && 'lg:sr-only')}>{t('newProject')}</span>
          </Link>

          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={toggleLabel}
            title={toggleLabel}
            className={cn(
              'mt-0 flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm whitespace-nowrap text-ink-soft transition-colors hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal max-lg:hidden lg:mt-auto',
              collapsed && 'lg:justify-center lg:px-2',
            )}
          >
            <ToggleIcon aria-hidden="true" className="size-4 shrink-0" />
            <span className={cn(collapsed && 'lg:sr-only')}>{toggleLabel}</span>
          </button>
        </nav>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
