'use client'

import { useRef, useState } from 'react'

/** Rideau QC original/nettoyé : image originale clippée + séparateur draggable. */
export function QcCurtain({
  src,
  originalSrc,
  containerRef,
}: {
  src: string
  originalSrc: string
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const [qcSplit, setQcSplit] = useState(50)
  const qcDraggingRef = useRef(false)

  function updateQcSplit(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    setQcSplit(Math.min(98, Math.max(2, ((clientX - rect.left) / rect.width) * 100)))
  }

  if (originalSrc === src) return null

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={originalSrc}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full object-contain pointer-events-none"
        style={{ clipPath: `inset(0 ${100 - qcSplit}% 0 0)` }}
        draggable={false}
      />
      <span className="absolute top-2 left-2 z-40 pointer-events-none rounded bg-black/75 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
        ORIGINAL
      </span>
      <span className="absolute top-2 right-2 z-40 pointer-events-none rounded bg-black/75 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
        CLEANED
      </span>
      <div
        role="slider"
        aria-label="QC curtain position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(qcSplit)}
        tabIndex={0}
        className="absolute inset-y-0 z-50 w-6 -translate-x-1/2 cursor-ew-resize touch-none"
        style={{ left: `${qcSplit}%` }}
        onPointerDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          qcDraggingRef.current = true
          ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
          updateQcSplit(e.clientX)
        }}
        onPointerMove={(e) => {
          if (qcDraggingRef.current) updateQcSplit(e.clientX)
        }}
        onPointerUp={() => {
          qcDraggingRef.current = false
        }}
        onPointerCancel={() => {
          qcDraggingRef.current = false
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setQcSplit((v) => Math.max(2, v - 2))
          if (e.key === 'ArrowRight') setQcSplit((v) => Math.min(98, v + 2))
        }}
      >
        <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-seal shadow" />
        <div className="absolute top-1/2 left-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-seal font-bold text-seal-ink shadow">
          ↔
        </div>
      </div>
    </>
  )
}

export function BlockMarker({ n, tag, active }: { n: number; tag?: string; active: boolean }) {
  return (
    <span
      className={
        'absolute -top-2.5 -left-2.5 flex items-center justify-center gap-0.5 px-1 min-w-5 h-5 rounded-full font-mono text-[10px] font-bold transition-colors shadow-sm select-none ' +
        (active ? 'bg-seal text-seal-ink ring-1 ring-seal' : 'bg-black text-white')
      }
    >
      <span>{n}</span>
      {tag && tag !== 'B' && (
        <span className="text-[8px] bg-white/25 px-0.5 rounded leading-none">{tag}</span>
      )}
    </span>
  )
}
