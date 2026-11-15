'use client'

import { useState } from 'react'
import { useLocale } from '@/i18n/provider'
import { cn } from '@/lib/utils'
import type { OcrBlock } from '@/lib/types'

const IMG_W = 848
const IMG_H = 1264

function getBlocks(locale: string): OcrBlock[] {
  const isEn = locale === 'en'
  return [
    {
      id: 'a',
      text: '…やっぱり、この街は寂しいな。',
      bbox_x: 140,
      bbox_y: 90,
      bbox_w: 175,
      bbox_h: 245,
      confidence: 0.91,
      provider: 'paddleocr',
      translation: {
        id: 'ta',
        translated_text: isEn
          ? '…Honestly, this town is so gloomy.'
          : '…Décidément, cette ville est bien mélancolique.',
        provider: 'ollama',
        edited_by_user: true,
      },
    },
    {
      id: 'b',
      text: 'えっ、きみ…！？',
      bbox_x: 600,
      bbox_y: 630,
      bbox_w: 135,
      bbox_h: 175,
      confidence: 0.84,
      provider: 'paddleocr',
      translation: {
        id: 'tb',
        translated_text: isEn ? 'Huh, you…!?' : 'Hein, toi… !?',
        provider: 'ollama',
        edited_by_user: false,
      },
    },
    {
      id: 'c',
      text: '傘、一緒に入りなよ。',
      bbox_x: 625,
      bbox_y: 895,
      bbox_w: 140,
      bbox_h: 195,
      confidence: 0.88,
      provider: 'paddleocr',
      translation: {
        id: 'tc',
        translated_text: isEn
          ? 'Come share my umbrella.'
          : 'Viens partager mon parapluie.',
        provider: 'ollama',
        edited_by_user: false,
      },
    },
  ]
}

export function LandingSpecimen() {
  const locale = useLocale()
  const isEn = locale === 'en'
  const blocks = getBlocks(locale)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  return (
    <figure className="relative grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      {/* Conteneur manga pleine surface : s'étale bord à bord sans padding ni barre de zoom */}
      <div className="panel self-center overflow-hidden shadow-2xl">
        <div
          className="relative w-full select-none bg-white"
          style={{ aspectRatio: `${IMG_W} / ${IMG_H}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/demo/page-01.png"
            alt={
              isEn
                ? 'Japanese manga page, three bubbles detected and numbered'
                : 'Planche de manga japonais, trois bulles détectées et numérotées'
            }
            className="absolute inset-0 size-full object-cover pointer-events-none"
            draggable={false}
          />

          {blocks.map((b, i) => {
            const isHovered = hoveredId === b.id
            return (
              <div
                key={b.id}
                onMouseEnter={() => setHoveredId(b.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={cn(
                  'absolute transition-all duration-150 cursor-pointer',
                  isHovered
                    ? 'border-2 border-seal bg-seal/15 ring-2 ring-seal/50 z-20 shadow-md'
                    : 'border-[1.5px] border-dashed border-black/55 bg-black/5 hover:border-seal hover:bg-seal/10 z-10'
                )}
                style={{
                  left: `${(b.bbox_x / IMG_W) * 100}%`,
                  top: `${(b.bbox_y / IMG_H) * 100}%`,
                  width: `${(b.bbox_w / IMG_W) * 100}%`,
                  height: `${(b.bbox_h / IMG_H) * 100}%`,
                }}
                aria-label={`${isEn ? 'Bubble' : 'Bulle'} ${i + 1}: ${b.text}`}
              >
                <span
                  className={cn(
                    'absolute -top-2.5 -left-2.5 flex items-center justify-center min-w-5 h-5 px-1 rounded-full font-mono text-[10px] font-bold shadow-md select-none transition-colors',
                    isHovered ? 'bg-seal text-seal-ink ring-1 ring-seal' : 'bg-black text-white'
                  )}
                >
                  {i + 1}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Cartes de bulles détectées avec survol synchronisé */}
      <ol
        className="flex flex-col gap-3 self-center"
        aria-label={isEn ? 'Detected bubbles' : 'Bulles détectées'}
      >
        {blocks.map((b, i) => {
          const isHovered = hoveredId === b.id
          return (
            <li
              key={b.id}
              onMouseEnter={() => setHoveredId(b.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={cn(
                'panel p-3 transition-all duration-150 cursor-pointer',
                isHovered && 'border-seal ring-1 ring-seal/50 bg-seal/5 shadow-md'
              )}
            >
              <div className="label-mono mb-2 flex items-center justify-between text-ink-soft">
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'grid size-5 place-items-center rounded-full font-bold text-seal-ink transition-colors',
                      isHovered ? 'bg-seal ring-2 ring-seal/40' : 'bg-seal'
                    )}
                  >
                    {i + 1}
                  </span>
                  JA
                </span>
                <span>{Math.round(b.confidence * 100)}%</span>
              </div>
              <p lang="ja" className="text-sm font-japanese text-ink">
                {b.text}
              </p>
              <p className="mt-1.5 border-t border-hairline pt-1.5 leading-snug font-medium">
                {b.translation?.translated_text}
              </p>
            </li>
          )
        })}
      </ol>
      <figcaption className="sr-only">
        {isEn
          ? 'Example: a manga page with its detected bubbles, the extracted Japanese text and its English translation.'
          : 'Exemple : une planche de manga avec ses bulles détectées, le texte japonais extrait et sa traduction française.'}
      </figcaption>
    </figure>
  )
}
