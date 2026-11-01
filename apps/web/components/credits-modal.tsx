// 🚀 FEATURE BUILT FOR META GLOBAL AI DEVELOPER HACKATHON 2026.
'use client'

import { useEffect, useState } from 'react'
import { Coins, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocale, useTranslations } from '@/i18n/provider'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type Pack = { key: string; credits: number; price_eur_cents: number }
type ProviderKey = 'fedapay' | 'paddle'

/**
 * Modale « Crédits épuisés » : ouverte quand l'API renvoie 402.
 * L'achat crée un checkout côté backend puis redirige vers la page
 * sécurisée de la passerelle ; le solde n'est crédité que par webhook.
 * Sans passerelle configurée, l'achat est honnêtement désactivé.
 */
export function CreditsModal() {
  const t = useTranslations('Credits')
  const tLegal = useTranslations('Legal')
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const [packs, setPacks] = useState<Pack[] | null>(null)
  const [providers, setProviders] = useState<Record<string, boolean>>({})
  const [provider, setProvider] = useState<ProviderKey>('paddle')
  const [buying, setBuying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function onExhausted() {
      setOpen(true)
      setError(null)
    }
    window.addEventListener('taurge:credits-exhausted', onExhausted)
    return () => window.removeEventListener('taurge:credits-exhausted', onExhausted)
  }, [])

  useEffect(() => {
    if (!open || packs) return
    api
      .billingPacks()
      .then((data) => {
        setPacks(data.packs)
        setProviders(data.providers)
        if (data.providers.fedapay && !data.providers.paddle) setProvider('fedapay')
      })
      .catch(() => setError(t('error')))
  }, [open, packs, t])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open ])

  if (!open) return null

  const anyProvider = providers.fedapay || providers.paddle
  const priceFormat = new Intl.NumberFormat(locale === 'en' ? 'en-GB' : 'fr-FR', {
    style: 'currency',
    currency: 'EUR',
  })

  async function buy(packKey: string) {
    setBuying(packKey)
    setError(null)
    try {
      const { checkout_url } = await api.createCheckout(packKey, provider)
      window.location.assign(checkout_url)
    } catch {
      setError(t('error'))
      setBuying(null)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="presentation" onClick={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-title"
        className="w-full max-w-lg rounded-xl border border-hairline bg-sheet p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="credits-title" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <Coins className="size-5 text-seal" aria-hidden="true" />
            {t('title')}
          </h2>
          <button
            type="button"
            aria-label={t('close')}
            onClick={() => setOpen(false)}
            className="rounded-full p-1 text-ink-soft hover:bg-paper hover:text-ink focus-visible:outline-2 focus-visible:outline-seal"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{t('body')}</p>

        {!packs && !error && (
          <p aria-busy="true" className="mt-5 text-sm text-ink-soft">{t('loading')}</p>
        )}
        {error && (
          <p role="alert" className="mt-4 border-l-2 border-danger bg-danger-wash px-3 py-2 text-sm text-danger">{error}</p>
        )}

        {packs && (
          <>
            <fieldset className="mt-5">
              <legend className="label-mono text-ink-soft">{t('provider')}</legend>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                {(['fedapay', 'paddle'] as ProviderKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={provider === key}
                    disabled={!providers[key]}
                    onClick={() => setProvider(key)}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-seal disabled:opacity-45',
                      provider === key ? 'border-ink bg-paper font-semibold' : 'border-hairline hover:bg-paper',
                    )}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </fieldset>

            <ul className="mt-5 flex flex-col gap-3">
              {packs.map((pack) => (
                <li key={pack.key} className="flex flex-wrap items-center justify-between gap-3 border border-hairline bg-paper px-4 py-3">
                  <span>
                    <span className="block font-semibold">{t(pack.key)}</span>
                    <span className="font-mono text-sm text-ink-soft">
                      {pack.credits} {t('credits')} — {priceFormat.format(pack.price_eur_cents / 100)}
                    </span>
                  </span>
                  <Button variant="seal" size="sm" disabled={!anyProvider || buying !== null} onClick={() => buy(pack.key)}>
                    {buying === pack.key && <Loader2 className="animate-spin" aria-hidden="true" />}
                    {t('buy')}
                  </Button>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-soft">{tLegal('taxIncluded')}</p>
            {!anyProvider && <p className="mt-4 text-sm text-ink-soft">{t('unavailable')}</p>}
          </>
        )}
      </div>
    </div>
  )
}
