'use client'

import { useTranslations } from '@/i18n/provider'
import { IS_DEMO } from '@/lib/api'

export function DemoBanner() {
  const t = useTranslations('Demo')
  if (!IS_DEMO) return null
  return (
    <div className="flex items-center justify-center gap-3 border-b border-hairline bg-ink px-4 py-1.5 text-center text-xs text-sheet">
      <span className="label-mono text-seal">{t('badge')}</span>
      <span className="text-sheet/80">{t('body')}</span>
    </div>
  )
}
