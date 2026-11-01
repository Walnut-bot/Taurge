'use client'

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { fitLettering } from '@/lib/lettering'
import { cn } from '@/lib/utils'

export type TextOverlayFitted = {
  fontSize: number
  lineHeight: number
  lines: string[]
}

type TextOverlayProps = {
  /** Translated text to render. Explicit `\n` breaks are preserved. */
  text: string
  /** User scale multiplier (inspector). Values 0.75 → 2.0 scale the fitted font size proportionally. */
  scale?: number
  lineHeight?: number
  minFontSize?: number
  maxFontSize?: number
  /** Inner margin as a fraction of the box (each side). Default 0.1. */
  paddingRatio?: number
  className?: string
  /** Font classes applied to both the visible text and the measuring probe. */
  textClassName?: string
  /** Non-metric styles (color, outline). Metric-affecting changes go through metricsKey. */
  textStyle?: CSSProperties
  title?: string
  /** Stable key of font-affecting options (family, bold, italic, uppercase) to trigger refit. */
  metricsKey?: string
  /** Custom visible content (e.g. the inline editor) receiving the fitted size. */
  children?: (fitted: TextOverlayFitted) => ReactNode
}

/**
 * Bubble text overlay: balanced multi-line wrapping + auto-fit font size.
 *
 * Measures the base optimal font size for the bubble, then applies the user-selected
 * scale multiplier (e.g. 100% -> 200%) directly so dramatic impact and shout
 * texts can actually scale up as intended.
 */
export function TextOverlay({
  text,
  scale = 1,
  lineHeight = 1.08,
  minFontSize = 8,
  maxFontSize = 160,
  paddingRatio = 0.1,
  className,
  textClassName,
  textStyle,
  title,
  metricsKey = '',
  children,
}: TextOverlayProps) {
  const boxRef = useRef<HTMLDivElement>(null)
  const probeRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [fontsTick, setFontsTick] = useState(0)

  // Measure the border box (stable: unaffected by the inner padding or zoom transforms).
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setBox((prev) => (prev.w === rect.width && prev.h === rect.height ? prev : { w: rect.width, h: rect.height }))
    }
    update()
    const ro = new ResizeObserver(update)
    try {
      ro.observe(el, { box: 'border-box' })
    } catch {
      ro.observe(el)
    }
    return () => ro.disconnect()
  }, [])

  // Webfonts arrive after first paint: refit once they are ready.
  useLayoutEffect(() => {
    let cancelled = false
    document.fonts?.ready.then(() => {
      if (!cancelled) setFontsTick((t) => t + 1)
    }).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const pad = Math.min(0.4, Math.max(0, paddingRatio))
  const contentW = Math.max(0, box.w * (1 - 2 * pad))
  const contentH = Math.max(0, box.h * (1 - 2 * pad))

  const { lines, fontSize: heuristic } = useMemo(
    () => fitLettering(text, contentW, contentH, { lineHeight, minFontSize, maxFontSize }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [text, contentW, contentH, lineHeight, minFontSize, maxFontSize],
  )

  const [fontSize, setFontSize] = useState(heuristic)

  // Binary search for the base natural font size that fills the bubble,
  // then multiply by the user scale factor (between 75% and 200%).
  useLayoutEffect(() => {
    const probe = probeRef.current
    if (!probe || lines.length === 0 || contentW <= 0 || contentH <= 0) return
    const clampedScale = Number.isFinite(scale) && scale > 0 ? scale : 1

    let lo = minFontSize
    let best = minFontSize
    let high = maxFontSize
    probe.style.lineHeight = String(lineHeight)
    while (high - lo > 0.5) {
      const mid = (lo + high) / 2
      probe.style.fontSize = `${mid}px`
      const fits = probe.scrollHeight <= contentH + 0.5 && probe.scrollWidth <= contentW + 0.5
      if (fits) {
        best = mid
        lo = mid
      } else {
        high = mid
      }
    }

    // Multiply the fitted baseline by the user-selected scale multiplier
    const scaledSize = Math.max(minFontSize, Math.min(maxFontSize, best * clampedScale))
    const fitted = Math.floor(scaledSize * 2) / 2
    setFontSize((prev) => (prev === fitted ? prev : fitted))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, heuristic, contentW, contentH, scale, lineHeight, minFontSize, maxFontSize, metricsKey, fontsTick])

  const fitted: TextOverlayFitted = { fontSize, lineHeight, lines }

  return (
    <div
      ref={boxRef}
      title={title}
      className={cn('relative flex h-full w-full items-center justify-center text-center overflow-visible', className)}
      style={box.w > 0 ? { padding: `${box.h * pad}px ${box.w * pad}px` } : undefined}
    >
      {children ? (
        children(fitted)
      ) : (
        <div
          className={cn('cursor-text select-text transition-all duration-150', textClassName)}
          style={{ fontSize, lineHeight, overflowWrap: 'break-word', ...textStyle }}
        >
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {/* Hidden probe with identical font metrics for the fit measurement. */}
      <div
        aria-hidden="true"
        ref={probeRef}
        className={textClassName}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          visibility: 'hidden',
          pointerEvents: 'none',
          width: contentW > 0 ? contentW : undefined,
          lineHeight,
          overflowWrap: 'break-word',
          whiteSpace: 'normal',
          ...textStyle,
        }}
      >
        {lines.map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  )
}
