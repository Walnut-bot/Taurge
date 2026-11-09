'use client'

import { useCallback, useState, useRef } from 'react'

/** Zoom / pan (espace + glisser, molette Ctrl) du canvas, extrait de PageCanvas. */
export function useZoomPan(isDrawMode: boolean) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey || isSpacePressed) {
      e.preventDefault()
      const delta = e.deltaY < 0 ? 0.15 : -0.15
      setZoom((prev) => Math.min(3.0, Math.max(0.4, Number((prev + delta).toFixed(2)))))
    }
  }, [isSpacePressed])

  function startPan(e: React.MouseEvent): boolean {
    if (isSpacePressed || e.button === 1) {
      e.preventDefault()
      setIsPanning(true)
      panStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, panX: pan.x, panY: pan.y }
      return true
    }
    return false
  }

  function movePan(e: MouseEvent): boolean {
    if (!isPanning) return false
    setPan({
      x: panStartRef.current.panX + (e.clientX - panStartRef.current.mouseX),
      y: panStartRef.current.panY + (e.clientY - panStartRef.current.mouseY),
    })
    return true
  }

  function reset() {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  return {
    zoom, setZoom, pan, isSpacePressed, setIsSpacePressed, isPanning, setIsPanning,
    handleWheel, startPan, movePan, reset, isDrawMode,
  }
}

export type ZoomPan = ReturnType<typeof useZoomPan>
