'use client'

import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ZoomPan } from './use-zoom-pan'

export function ZoomControls({ zp, show }: { zp: ZoomPan; show: boolean }) {
  return (
    <div inert={!show} className={cn(!show && 'hidden', 'absolute bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-full bg-ink/90 text-sheet px-3 py-1 shadow-2xl backdrop-blur-md border border-hairline/30')}>
      <button
        type="button"
        onClick={() => zp.setZoom((z) => Math.max(0.4, Number((z - 0.2).toFixed(2))))}
        className="p-1 hover:text-seal transition-colors"
        title="Zoom out"
      >
        <ZoomOut className="size-3.5" />
      </button>
      <span className="font-mono text-xs font-bold w-12 text-center">{Math.round(zp.zoom * 100)}%</span>
      <button
        type="button"
        onClick={() => zp.setZoom((z) => Math.min(3.0, Number((z + 0.2).toFixed(2))))}
        className="p-1 hover:text-seal transition-colors"
        title="Zoom in"
      >
        <ZoomIn className="size-3.5" />
      </button>
      <div className="h-3 w-px bg-sheet/20 mx-1" />
      <button
        type="button"
        onClick={zp.reset}
        className="p-1 hover:text-seal transition-colors text-[11px] font-mono flex items-center gap-1"
        title="Reset to 100%"
      >
        <RotateCcw className="size-3" />
        <span>100%</span>
      </button>
    </div>
  )
}
