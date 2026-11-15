'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Image as ImageIcon,
  Upload,
  Trash2,
  Check,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocale } from '@/i18n/provider'
import type { WatermarkConfig, Page } from '@/lib/types'
import { cn } from '@/lib/utils'

interface WatermarkDialogProps {
  open: boolean
  onClose: () => void
  page: Page
  pageCount: number
  onApply: (config: WatermarkConfig | null, scope: 'single' | 'all') => Promise<void>
}

function getPresetPositions(locale: string) {
  const isEn = locale === 'en'
  return [
    {
      label: isEn ? '↘ Bottom-Right (Standard)' : '↘ Bas-Droit (Standard)',
      x: 88,
      y: 92,
      short: isEn ? '↘ Bottom-Right' : '↘ Bas-Droit',
    },
    {
      label: isEn ? '↙ Bottom-Left' : '↙ Bas-Gauche',
      x: 12,
      y: 92,
      short: isEn ? '↙ Bottom-Left' : '↙ Bas-Gauche',
    },
    {
      label: isEn ? '↗ Top-Right' : '↗ Haut-Droit',
      x: 88,
      y: 8,
      short: isEn ? '↗ Top-Right' : '↗ Haut-Droit',
    },
    {
      label: isEn ? '↖ Top-Left' : '↖ Haut-Gauche',
      x: 12,
      y: 8,
      short: isEn ? '↖ Top-Left' : '↖ Haut-Gauche',
    },
    {
      label: isEn ? '⊙ Center' : '⊙ Centre',
      x: 50,
      y: 50,
      short: isEn ? '⊙ Center' : '⊙ Centre',
    },
  ]
}

export function WatermarkDialog({
  open,
  onClose,
  page,
  pageCount,
  onApply,
}: WatermarkDialogProps) {
  const locale = useLocale()
  const isEn = locale === 'en'
  const presetPositions = getPresetPositions(locale)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [logoUrl, setLogoUrl] = useState<string>('')
  const [x, setX] = useState<number>(88)
  const [y, setY] = useState<number>(92)
  const [scale, setScale] = useState<number>(0.20)
  const [opacity, setOpacity] = useState<number>(0.85)
  const [rotation, setRotation] = useState<number>(0)
  const [scope, setScope] = useState<'single' | 'all'>('single')
  const [isApplying, setIsApplying] = useState(false)

  // Initialisation à partir de la configuration existante de la page
  useEffect(() => {
    if (page.watermark) {
      try {
        const parsed: WatermarkConfig = JSON.parse(page.watermark)
        if (parsed.image_url) setLogoUrl(parsed.image_url)
        if (typeof parsed.x === 'number') setX(parsed.x)
        if (typeof parsed.y === 'number') setY(parsed.y)
        if (typeof parsed.scale === 'number') setScale(parsed.scale)
        if (typeof parsed.opacity === 'number') setOpacity(parsed.opacity)
        if (typeof parsed.rotation === 'number') setRotation(parsed.rotation)
      } catch {
        // Ignorer si JSON invalide
      }
    }
  }, [page.watermark, open])

  if (!open) return null

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const result = event.target?.result as string
      if (result) {
        setLogoUrl(result)
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit() {
    if (!logoUrl) return
    setIsApplying(true)
    try {
      const config: WatermarkConfig = {
        image_url: logoUrl,
        x,
        y,
        scale,
        opacity,
        rotation,
      }
      await onApply(config, scope)
      onClose()
    } finally {
      setIsApplying(false)
    }
  }

  async function handleRemove() {
    setIsApplying(true)
    try {
      await onApply(null, scope)
      setLogoUrl('')
      onClose()
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-0">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="wm-dialog-title"
        className="flex flex-col w-full max-w-xl max-h-[90vh] rounded-2xl border border-hairline bg-sheet shadow-2xl overflow-hidden text-ink"
      >
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-hairline px-5 py-4 bg-paper/50">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-lg bg-seal/10 text-seal">
              <ImageIcon className="size-4" />
            </div>
            <div>
              <h2 id="wm-dialog-title" className="text-sm font-bold text-ink">
                {isEn
                  ? 'Team Logo & Watermark'
                  : "Logo d'équipe & Filigrane"}
              </h2>
              <p className="text-xs text-ink-soft">
                {isEn
                  ? 'Stamp your team’s official credits onto your pages'
                  : 'Apposez les crédits officiels de votre équipe sur vos planches'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-soft hover:bg-muted hover:text-ink transition-colors"
            aria-label={isEn ? 'Close' : 'Fermer'}
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Corps avec défilement */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* 1. Import du Logo */}
          <div className="space-y-2">
            <label className="font-semibold text-ink flex items-center gap-1.5">
              <span>
                {isEn ? '1. Logo / watermark image' : '1. Image du logo / filigrane'}
              </span>
              <span className="text-ink-soft font-normal">
                {isEn
                  ? '(Transparent PNG recommended, JPG, WebP)'
                  : '(PNG transparent recommandé, JPG, WebP)'}
              </span>
            </label>

            {logoUrl ? (
              <div className="flex items-center gap-3 rounded-xl border border-hairline bg-paper/80 p-3">
                <div className="relative size-16 shrink-0 rounded-lg border border-hairline bg-white/10 p-1 grid place-items-center overflow-hidden checkerboard-bg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoUrl}
                    alt={isEn ? 'Watermark logo' : 'Logo filigrane'}
                    className="max-size-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">
                    {isEn ? 'Logo loaded successfully' : 'Logo chargé avec succès'}
                  </p>
                  <p className="text-[11px] text-ink-soft mt-0.5">
                    {isEn ? 'Ready to overlay on the page' : 'Prêt pour incrustation sur la planche'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 text-xs"
                >
                  {isEn ? 'Change' : 'Changer'}
                </Button>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-hairline bg-paper/40 p-6 text-center hover:border-seal/60 hover:bg-paper/70 transition-colors cursor-pointer group"
              >
                <div className="grid size-10 place-items-center rounded-full bg-paper text-ink-soft group-hover:text-seal group-hover:scale-105 transition-all">
                  <Upload className="size-5" />
                </div>
                <div>
                  <p className="font-semibold text-ink text-xs">
                    {isEn
                      ? 'Click to upload your team logo'
                      : 'Cliquez pour importer le logo de votre équipe'}
                  </p>
                  <p className="text-[11px] text-ink-soft mt-0.5">
                    {isEn
                      ? 'Drag and drop or select an image file'
                      : 'Glissez-déposez ou sélectionnez un fichier image'}
                  </p>
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>

          {/* 2. Positionnement prédéfini */}
          <div className="space-y-2">
            <label className="font-semibold text-ink">
              {isEn ? '2. Quick placement on page' : '2. Emplacement rapide sur la planche'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {presetPositions.map((preset) => {
                const isActive = Math.abs(x - preset.x) < 3 && Math.abs(y - preset.y) < 3
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setX(preset.x)
                      setY(preset.y)
                    }}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg border text-left font-medium transition-all text-xs flex items-center justify-between',
                      isActive
                        ? 'border-seal bg-seal/10 text-seal font-semibold ring-1 ring-seal'
                        : 'border-hairline bg-paper/60 hover:bg-paper text-ink-soft hover:text-ink'
                    )}
                  >
                    <span>{preset.short}</span>
                    {isActive && <Check className="size-3 text-seal" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 3. Réglages fins : Position libre, Taille, Opacité, Rotation */}
          <div className="space-y-3 rounded-xl border border-hairline bg-paper/40 p-3.5">
            <span className="font-semibold text-ink block text-xs">
              {isEn ? '3. Fine adjustments' : '3. Ajustements fins'}
            </span>

            {/* Position X et Y */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-[11px] text-ink-soft mb-1 font-mono">
                  <span>{isEn ? 'Horizontal (X)' : 'Horizontal (X)'}</span>
                  <span>{x}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={95}
                  value={x}
                  onChange={(e) => setX(Number(e.target.value))}
                  className="w-full accent-seal cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-ink-soft mb-1 font-mono">
                  <span>{isEn ? 'Vertical (Y)' : 'Vertical (Y)'}</span>
                  <span>{y}%</span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={95}
                  value={y}
                  onChange={(e) => setY(Number(e.target.value))}
                  className="w-full accent-seal cursor-pointer"
                />
              </div>
            </div>

            {/* Taille et Opacité */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <div className="flex justify-between text-[11px] text-ink-soft mb-1 font-mono">
                  <span>{isEn ? 'Relative size' : 'Taille relative'}</span>
                  <span>{Math.round(scale * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.06}
                  max={0.50}
                  step={0.01}
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                  className="w-full accent-seal cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px] text-ink-soft mb-1 font-mono">
                  <span>{isEn ? 'Opacity' : 'Opacité'}</span>
                  <span>{Math.round(opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.10}
                  max={1.0}
                  step={0.05}
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                  className="w-full accent-seal cursor-pointer"
                />
              </div>
            </div>

            {/* Rotation */}
            <div>
              <div className="flex justify-between text-[11px] text-ink-soft mb-1 font-mono">
                <span>{isEn ? 'Rotation' : 'Rotation'}</span>
                <span>{rotation > 0 ? `+${rotation}°` : `${rotation}°`}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={-180}
                  max={180}
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                  className="w-full accent-seal cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setRotation(0)}
                  className="shrink-0 px-2 py-0.5 rounded border border-hairline bg-paper text-[10px] font-mono hover:bg-muted"
                  title={isEn ? 'Reset to 0°' : 'Réinitialiser à 0°'}
                >
                  0°
                </button>
              </div>
            </div>
          </div>

          {/* 4. Portée d'application */}
          <div className="space-y-2">
            <label className="font-semibold text-ink">
              {isEn ? '4. Application scope' : "4. Portée d'application"}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setScope('single')}
                className={cn(
                  'p-3 rounded-xl border text-left transition-all',
                  scope === 'single'
                    ? 'border-seal bg-seal/10 ring-1 ring-seal'
                    : 'border-hairline bg-paper/60 hover:bg-paper'
                )}
              >
                <p className="font-semibold text-xs text-ink">
                  {isEn ? 'Current page only' : 'Planche courante uniquement'}
                </p>
                <p className="text-[11px] text-ink-soft mt-0.5">
                  {isEn
                    ? `Applies to page ${page.page_number}`
                    : `Applique sur la planche ${page.page_number}`}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScope('all')}
                className={cn(
                  'p-3 rounded-xl border text-left transition-all',
                  scope === 'all'
                    ? 'border-seal bg-seal/10 ring-1 ring-seal'
                    : 'border-hairline bg-paper/60 hover:bg-paper'
                )}
              >
                <p className="font-semibold text-xs text-ink">
                  {isEn ? 'All pages' : 'Toutes les planches'}
                </p>
                <p className="text-[11px] text-ink-soft mt-0.5">
                  {isEn
                    ? `Applies to all ${pageCount} pages of the chapter`
                    : `Applique sur les ${pageCount} planches du chapitre`}
                </p>
              </button>
            </div>
          </div>
        </div>

        {/* Pied de page avec actions */}
        <div className="flex items-center justify-between border-t border-hairline px-5 py-3.5 bg-paper/50">
          {page.watermark ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isApplying}
              onClick={handleRemove}
              className="text-danger hover:bg-danger-wash text-xs flex items-center gap-1.5"
            >
              <Trash2 className="size-3.5" />
              <span>{isEn ? 'Remove watermark' : 'Retirer le filigrane'}</span>
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isApplying}
              className="text-xs"
            >
              {isEn ? 'Cancel' : 'Annuler'}
            </Button>
            <Button
              type="button"
              variant="seal"
              size="sm"
              disabled={!logoUrl || isApplying}
              onClick={handleSubmit}
              className="text-xs"
            >
              {isApplying
                ? isEn
                  ? 'Applying…'
                  : 'Application…'
                : isEn
                  ? 'Apply watermark'
                  : 'Appliquer le filigrane'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
