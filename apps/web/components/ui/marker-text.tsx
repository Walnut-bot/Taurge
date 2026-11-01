import React from 'react'
import { Permanent_Marker } from 'next/font/google'
import { cn } from '@/lib/utils'

// Initialisation de la police Google 'Permanent Marker'
export const permanentMarker = Permanent_Marker({
  weight: '400',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-permanent-marker',
})

export type MarkerTextProps = {
  /** Text content (may also be passed via children) */
  text?: string
  /** Alternate content via React children */
  children?: React.ReactNode
  /** Text fill color (e.g. '#FFFFFF', 'yellow', 'rgb(255,255,255)') */
  fillColor?: string
  /** Shorthand alias for the fill color */
  color?: string
  /** Letter outline color (e.g. '#000000', 'black', 'red') */
  strokeColor?: string
  /** Outline thickness in pixels (e.g. 2, 4, or '3px'). Default: 2 */
  strokeWidth?: number | string
  /** HTML tag to use (default: 'span') */
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'div'
  /** Additional Tailwind CSS classes */
  className?: string
  /** Optional custom inline styles */
  style?: React.CSSProperties
} & Omit<React.HTMLAttributes<HTMLElement>, 'color'>

/**
 * Reusable text component with the 'Permanent Marker' font
 * and a dynamic outline (-webkit-text-stroke).
 *
 * Uses `paintOrder: 'stroke fill'` so the outline does not reduce
 * the readability of the inner fill color.
 */
export function MarkerText({
  text,
  children,
  fillColor,
  color,
  strokeColor = '#000000',
  strokeWidth = 2,
  as: Component = 'span',
  className,
  style,
  ...restProps
}: MarkerTextProps) {
  const content = text ?? children

  // Outline thickness normalization
  const formattedStrokeWidth =
    typeof strokeWidth === 'number' ? `${strokeWidth}px` : strokeWidth

  // Effective fill color
  const effectiveFillColor = fillColor ?? color ?? '#FFFFFF'

  const strokeStyle: React.CSSProperties = {
    // Fill color
    color: effectiveFillColor,
    // Dynamic outline via -webkit-text-stroke
    WebkitTextStroke: `${formattedStrokeWidth} ${strokeColor}`,
    // Typography trick: place the outline in the background under the fill
    // so a thick outline doesn't smother the letter inside
    paintOrder: 'stroke fill',
    ...style,
  }

  return (
    <Component
      className={cn(permanentMarker.className, 'inline-block tracking-wide select-none', className)}
      style={strokeStyle}
      {...restProps}
    >
      {content}
    </Component>
  )
}

export default MarkerText
