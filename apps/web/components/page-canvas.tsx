'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Maximize2, Trash2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OcrBlock } from '@/lib/types'
import { TextOverlay } from '@/components/workspace/text-overlay'

export type ManhwaStyle = 'dialogue' | 'scream' | 'system' | 'thought' | 'sfx'
export type StrokeStyle = 'none' | 'white' | 'black'

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se'

type Props = {
  src: string | null
  alt: string
  width: number
  height: number
  blocks: OcrBlock[]
  activeId?: string | null
  hoverId?: string | null
  onSelect?: (id: string | null) => void
  onHover?: (id: string | null) => void
  onUpdateBbox?: (id: string, bbox: { bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }) => void
  onUpdateText?: (id: string, newText: string) => void
  onCreateBlock?: (bbox: { bbox_x: number; bbox_y: number; bbox_w: number; bbox_h: number }) => void
  onDeleteBlock?: (id: string) => void
  isDrawMode?: boolean
  onCancelDrawMode?: () => void
  showZones?: boolean
  showZoomControls?: boolean
  maskBubbles?: boolean
  showLettering?: boolean
  fontSizeScale?: number
  isBold?: boolean
  isItalic?: boolean
  isUppercase?: boolean
  manhwaStyle?: ManhwaStyle
  textColor?: string
  strokeStyle?: StrokeStyle
  strokeWidth?: number
  rotationAngle?: number
  /** Image originale à comparer en rideau QC (gauche = original). */
  qcOriginalSrc?: string | null
  className?: string
}

export function PageCanvas({
  src,
  alt,
  width,
  height,
  blocks,
  activeId,
  hoverId,
  onSelect,
  onHover,
  onUpdateBbox,
  onUpdateText,
  onCreateBlock,
  onDeleteBlock,
  isDrawMode = false,
  onCancelDrawMode,
  showZones = true,
  showZoomControls = true,
  maskBubbles = false,
  showLettering = true,
  fontSizeScale = 1,
  isBold = true,
  isItalic = false,
  isUppercase = true,
  manhwaStyle = 'dialogue',
  textColor = '#0d0d0d',
  strokeStyle = 'white',
  strokeWidth = 2,
  rotationAngle = 0,
  qcOriginalSrc = null,
  className,
}: Props) {
  const imageContainerRef = useRef<HTMLDivElement>(null)

  // Zoom and pan
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 })

  // Direct text editing on the bubble (double-click)
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null)
  const [editTextValue, setEditTextValue] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Drag & draw
  const [liveBbox, setLiveBbox] = useState<{ id: string; x: number; y: number; w: number; h: number } | null>(null)
  const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null)
  const [resizingCorner, setResizingCorner] = useState<{ id: string; corner: ResizeCorner } | null>(null)
  const drawingRef = useRef<{ startX: number; startY: number; currX: number; currY: number } | null>(null)
  const [liveDrawnBox, setLiveDrawnBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const dragStartRef = useRef({ startX: 0, startY: 0, origX: 0, origY: 0, origW: 0, origH: 0 })

  // Rideau QC : position (%) et glisser du séparateur original/nettoyé
  const [qcSplit, setQcSplit] = useState(50)
  const qcDraggingRef = useRef(false)

  function updateQcSplit(clientX: number) {
    const rect = imageContainerRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    setQcSplit(Math.min(98, Math.max(2, ((clientX - rect.left) / rect.width) * 100)))
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return
      if (e.code === 'Space' && !e.repeat && !isDrawMode) {
        e.preventDefault()
        setIsSpacePressed(true)
      } else if (e.key === 'Escape') {
        if (editingBlockId) {
          setEditingBlockId(null)
        } else if (isDrawMode) {
          drawingRef.current = null
          setLiveDrawnBox(null)
          onCancelDrawMode?.()
        } else if (activeId) {
          onSelect?.(null)
        }
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && activeId && onDeleteBlock && !editingBlockId) {
        e.preventDefault()
        onDeleteBlock(activeId)
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') {
        setIsSpacePressed(false)
        setIsPanning(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [activeId, isDrawMode, onDeleteBlock, onSelect, onCancelDrawMode, editingBlockId])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey || isSpacePressed) {
      e.preventDefault()
      const delta = e.deltaY < 0 ? 0.15 : -0.15
      setZoom((prev) => Math.min(3.0, Math.max(0.4, Number((prev + delta).toFixed(2)))))
    }
  }, [isSpacePressed])

  const getCanvasCoords = useCallback((clientX: number, clientY: number) => {
    if (!imageContainerRef.current) return { x: 0, y: 0 }
    const rect = imageContainerRef.current.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(Math.max(0, width - 1), Math.round(((clientX - rect.left) / rect.width) * width))),
      y: Math.max(0, Math.min(Math.max(0, height - 1), Math.round(((clientY - rect.top) / rect.height) * height))),
    }
  }, [width, height])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isSpacePressed || e.button === 1) {
      e.preventDefault()
      setIsPanning(true)
      panStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, panX: pan.x, panY: pan.y }
      return
    }

    if (isDrawMode && e.button === 0) {
      e.preventDefault()
      e.stopPropagation()
      const { x, y } = getCanvasCoords(e.clientX, e.clientY)
      drawingRef.current = { startX: x, startY: y, currX: x, currY: y }
      setLiveDrawnBox({ x, y, w: 0, h: 0 })
    }
  }

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (isPanning) {
        setPan({
          x: panStartRef.current.panX + (e.clientX - panStartRef.current.mouseX),
          y: panStartRef.current.panY + (e.clientY - panStartRef.current.mouseY),
        })
        return
      }

      if (isDrawMode && drawingRef.current) {
        const { x, y } = getCanvasCoords(e.clientX, e.clientY)
        drawingRef.current.currX = x
        drawingRef.current.currY = y
        setLiveDrawnBox({
          x: Math.min(drawingRef.current.startX, x),
          y: Math.min(drawingRef.current.startY, y),
          w: Math.abs(x - drawingRef.current.startX),
          h: Math.abs(y - drawingRef.current.startY),
        })
      }
    }

    function handleMouseUp() {
      if (isPanning) setIsPanning(false)
      if (isDrawMode && drawingRef.current && onCreateBlock) {
        const { startX, startY, currX, currY } = drawingRef.current
        const w = Math.abs(currX - startX)
        const h = Math.abs(currY - startY)
        if (w >= 15 && h >= 15) {
          onCreateBlock({
            bbox_x: Math.min(startX, currX),
            bbox_y: Math.min(startY, currY),
            bbox_w: w,
            bbox_h: h,
          })
        }
        drawingRef.current = null
        setLiveDrawnBox(null)
        onCancelDrawMode?.()
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isPanning, isDrawMode, getCanvasCoords, onCreateBlock, onCancelDrawMode])

  // Drag & resize
  useEffect(() => {
    if (!draggingBlockId && !resizingCorner) return

    function handleMouseMove(e: MouseEvent) {
      if (!imageContainerRef.current) return
      const rect = imageContainerRef.current.getBoundingClientRect()
      const scaleX = width / rect.width
      const scaleY = height / rect.height
      const deltaX = (e.clientX - dragStartRef.current.startX) * scaleX
      const deltaY = (e.clientY - dragStartRef.current.startY) * scaleY
      const { origX, origY, origW, origH } = dragStartRef.current

      if (draggingBlockId) {
        setLiveBbox({
          id: draggingBlockId,
          x: Math.max(0, Math.min(width - origW, Math.round(origX + deltaX))),
          y: Math.max(0, Math.min(height - origH, Math.round(origY + deltaY))),
          w: origW,
          h: origH,
        })
      } else if (resizingCorner) {
        const { id, corner } = resizingCorner
        let newX = origX, newY = origY, newW = origW, newH = origH
        if (corner === 'se') {
          newW = Math.max(30, Math.min(width - origX, Math.round(origW + deltaX)))
          newH = Math.max(20, Math.min(height - origY, Math.round(origH + deltaY)))
        } else if (corner === 'nw') {
          newX = Math.max(0, Math.min(origX + origW - 30, Math.round(origX + deltaX)))
          newY = Math.max(0, Math.min(origY + origH - 20, Math.round(origY + deltaY)))
          newW = origX + origW - newX
          newH = origY + origH - newY
        }
        setLiveBbox({ id, x: newX, y: newY, w: newW, h: newH })
      }
    }

    function handleMouseUp() {
      if (liveBbox && onUpdateBbox) {
        onUpdateBbox(liveBbox.id, {
          bbox_x: liveBbox.x,
          bbox_y: liveBbox.y,
          bbox_w: liveBbox.w,
          bbox_h: liveBbox.h,
        })
      }
      setDraggingBlockId(null)
      setResizingCorner(null)
      setLiveBbox(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [draggingBlockId, resizingCorner, liveBbox, width, height, onUpdateBbox])

  const manhwaFontClass: Record<ManhwaStyle, string> = {
    dialogue: 'font-manhwa-dialogue',
    scream: 'font-manhwa-scream text-red-600',
    system: 'font-manhwa-system text-cyan-400',
    thought: 'font-manhwa-thought text-neutral-800',
    sfx: 'font-manhwa-sfx text-amber-500',
  }

  const strokeColorValue = strokeStyle === 'white' ? '#ffffff' : strokeStyle === 'black' ? '#000000' : 'transparent'

  function commitInlineEdit(blockId: string) {
    if (onUpdateText && editTextValue.trim() !== '') {
      onUpdateText(blockId, editTextValue.trim())
    }
    setEditingBlockId(null)
  }

  return (
    <div
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      className={cn(
        'relative w-full h-full min-h-[500px] overflow-hidden bg-neutral-900/5 select-none',
        isSpacePressed ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : isDrawMode ? 'cursor-crosshair' : 'cursor-default',
        className
      )}
    >
      {/* Zoom controls */}
      <div inert={!showZoomControls} className={cn(!showZoomControls && 'hidden', 'absolute bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-full bg-ink/90 text-sheet px-3 py-1 shadow-2xl backdrop-blur-md border border-hairline/30')}>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.2).toFixed(2))))}
          className="p-1 hover:text-seal transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="size-3.5" />
        </button>
        <span className="font-mono text-xs font-bold w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(3.0, Number((z + 0.2).toFixed(2))))}
          className="p-1 hover:text-seal transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="size-3.5" />
        </button>
        <div className="h-3 w-px bg-sheet/20 mx-1" />
        <button
          type="button"
          onClick={() => {
            setZoom(1)
            setPan({ x: 0, y: 0 })
          }}
          className="p-1 hover:text-seal transition-colors text-[11px] font-mono flex items-center gap-1"
          title="Reset to 100%"
        >
          <RotateCcw className="size-3" />
          <span>100%</span>
        </button>
      </div>

      <div
        className="w-full h-full flex items-start justify-center transition-transform duration-75 ease-out"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
        }}
      >
        <div
          ref={imageContainerRef}
          className="relative max-w-[34rem] w-full shadow-2xl bg-white tone"
          style={{ aspectRatio: `${width} / ${height}`, containerType: 'inline-size' }}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <>
            <img src={src} alt={alt} className="absolute inset-0 size-full object-contain pointer-events-none" draggable={false} />
            {qcOriginalSrc && qcOriginalSrc !== src && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qcOriginalSrc}
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
            )}
            </>
          ) : (
            <div className="absolute inset-0 overflow-hidden" aria-label="Loading page" role="img">
              <div className="animate-scan h-1/3 w-full bg-gradient-to-b from-transparent via-seal/15 to-transparent" />
            </div>
          )}

          {/* Interactive drawing */}
          {liveDrawnBox && liveDrawnBox.w > 2 && liveDrawnBox.h > 2 && (
            <div
              className="absolute border-2 border-dashed border-seal bg-seal/25 rounded z-40 pointer-events-none flex items-center justify-center shadow-lg"
              style={{
                left: `${(liveDrawnBox.x / width) * 100}%`,
                top: `${(liveDrawnBox.y / height) * 100}%`,
                width: `${(liveDrawnBox.w / width) * 100}%`,
                height: `${(liveDrawnBox.h / height) * 100}%`,
              }}
            >
              <span className="font-mono text-[11px] font-bold bg-seal text-seal-ink px-2 py-0.5 rounded shadow">
                {liveDrawnBox.w} Ã— {liveDrawnBox.h} px
              </span>
            </div>
          )}

          {/* Bubble rendering */}
          {blocks.map((b, i) => {
            const active = activeId === b.id
            const hovered = hoverId === b.id
            const isEditing = editingBlockId === b.id

            const currentX = liveBbox && liveBbox.id === b.id ? liveBbox.x : b.bbox_x
            const currentY = liveBbox && liveBbox.id === b.id ? liveBbox.y : b.bbox_y
            const currentW = liveBbox && liveBbox.id === b.id ? liveBbox.w : b.bbox_w
            const currentH = liveBbox && liveBbox.id === b.id ? liveBbox.h : b.bbox_h

            const style = {
              left: `${(currentX / width) * 100}%`,
              top: `${(currentY / height) * 100}%`,
              width: `${(currentW / width) * 100}%`,
              height: `${(currentH / height) * 100}%`,
            }
            const lettering = showLettering && b.translation?.translated_text

            const blockStyle: ManhwaStyle =
              (active ? manhwaStyle : b.manhwa_style) || (b.bubble_type === 'SFX' ? 'sfx' : b.bubble_type === 'C' ? 'system' : 'dialogue')

            const curRotation = active ? rotationAngle : (b.rotation_angle ?? 0)
            const curScale = active ? fontSizeScale : (b.font_size_scale ?? 1)
            const curColor = active ? textColor : (b.text_color ?? '#0d0d0d')

            return (
              <div
                key={b.id}
                className={cn('absolute group', isDrawMode && 'pointer-events-none')}
                style={style}
              >
                {(maskBubbles || lettering || isEditing) && (
                  <div
                    className={cn(
                      'absolute inset-0 flex items-center justify-center text-center',
                      maskBubbles && 'rounded-[45%] bg-white',
                    )}
                    style={{
                      transform: curRotation !== 0 ? `rotate(${curRotation}deg)` : undefined,
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setEditingBlockId(b.id)
                      setEditTextValue(b.translation?.translated_text || b.text || '')
                      setTimeout(() => inputRef.current?.focus(), 50)
                    }}
                  >
                    {isEditing ? (
                      <TextOverlay
                        text={editTextValue}
                        scale={curScale}
                        textClassName={cn(
                          manhwaFontClass[blockStyle],
                          isBold && 'font-bold',
                          isItalic && 'italic',
                          isUppercase && 'uppercase',
                        )}
                        textStyle={{ color: curColor }}
                        metricsKey={`${blockStyle}|${isBold}|${isItalic}|${isUppercase}|${curScale}`}
                      >
                        {({ fontSize }) => (
                          <textarea
                            ref={inputRef}
                            value={editTextValue}
                            onChange={(e) => setEditTextValue(e.target.value)}
                            onBlur={() => commitInlineEdit(b.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                commitInlineEdit(b.id)
                              }
                            }}
                            className={cn(
                              manhwaFontClass[blockStyle],
                              'h-full w-full resize-none rounded border-2 border-seal bg-white/95 p-1 text-center shadow-xl outline-none scanlation-stroke z-50',
                              isBold && 'font-bold',
                              isItalic && 'italic',
                              isUppercase && 'uppercase',
                            )}
                            style={{ color: curColor, fontSize }}
                          />
                        )}
                      </TextOverlay>
                    ) : lettering ? (
                      <TextOverlay
                        text={b.translation!.translated_text}
                        scale={curScale}
                        textClassName={cn(
                          manhwaFontClass[blockStyle],
                          'scanlation-stroke',
                          isBold && 'font-bold',
                          isItalic && 'italic',
                          isUppercase && 'uppercase',
                        )}
                        textStyle={{
                          color: curColor,
                          WebkitTextStroke: strokeStyle !== 'none' ? `${strokeWidth}px ${strokeColorValue}` : undefined,
                        }}
                        title="Double-click to edit the text directly"
                        metricsKey={`${blockStyle}|${isBold}|${isItalic}|${isUppercase}|${curScale}`}
                      />
                    ) : null}
                  </div>
                )}

                {showZones && !isEditing && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect?.(b.id)
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setEditingBlockId(b.id)
                      setEditTextValue(b.translation?.translated_text || b.text || '')
                      setTimeout(() => inputRef.current?.focus(), 50)
                    }}
                    onMouseEnter={() => onHover?.(b.id)}
                    onMouseLeave={() => onHover?.(null)}
                    aria-label={`Bubble ${i + 1}: ${b.text}`}
                    className={cn(
                      'absolute inset-0 transition-colors duration-150',
                      active
                        ? 'border-2 border-seal bg-seal/10 ring-2 ring-seal/50 z-20 cursor-move'
                        : hovered
                          ? 'border-[1.5px] border-seal/90 bg-seal/5 z-10 cursor-pointer'
                          : 'border-[1.5px] border-dashed border-black/45 hover:border-seal cursor-pointer',
                    )}
                    onMouseDown={(e) => {
                      if (active && onUpdateBbox) {
                        e.stopPropagation()
                        setDraggingBlockId(b.id)
                        dragStartRef.current = {
                          startX: e.clientX,
                          startY: e.clientY,
                          origX: currentX,
                          origY: currentY,
                          origW: currentW,
                          origH: currentH,
                        }
                      }
                    }}
                  >
                    <Marker n={i + 1} tag={b.bubble_type} active={active || hovered} />

                    {active && (
                      <>
                        {onDeleteBlock && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              onDeleteBlock(b.id)
                            }}
                            className="absolute -top-3.5 -right-3.5 size-7 rounded-full bg-red-600 text-white shadow-xl border-2 border-white flex items-center justify-center hover:bg-red-700 hover:scale-110 active:scale-95 transition-all z-40 cursor-pointer"
                            title="Delete this bubble (Del key)"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}

                        {onUpdateBbox && (
                          <>
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation()
                                setResizingCorner({ id: b.id, corner: 'nw' })
                                dragStartRef.current = {
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  origX: currentX,
                                  origY: currentY,
                                  origW: currentW,
                                  origH: currentH,
                                }
                              }}
                              className="absolute -top-2 -left-2 size-4 rounded-full bg-seal border-2 border-white shadow-md cursor-nwse-resize hover:scale-125 z-30"
                            />
                            <div
                              onMouseDown={(e) => {
                                e.stopPropagation()
                                setResizingCorner({ id: b.id, corner: 'se' })
                                dragStartRef.current = {
                                  startX: e.clientX,
                                  startY: e.clientY,
                                  origX: currentX,
                                  origY: currentY,
                                  origW: currentW,
                                  origH: currentH,
                                }
                              }}
                              className="absolute -bottom-2.5 -right-2.5 size-5.5 rounded-full bg-ink text-paper border-2 border-white shadow-md flex items-center justify-center cursor-nwse-resize hover:scale-115 active:scale-95 transition-transform z-30"
                            >
                              <Maximize2 className="size-2.5" />
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Marker({ n, tag, active }: { n: number; tag?: string; active: boolean }) {
  return (
    <span
      className={cn(
        'absolute -top-2.5 -left-2.5 flex items-center justify-center gap-0.5 px-1 min-w-5 h-5 rounded-full font-mono text-[10px] font-bold transition-colors shadow-sm select-none',
        active ? 'bg-seal text-seal-ink ring-1 ring-seal' : 'bg-black text-white',
      )}
    >
      <span>{n}</span>
      {tag && tag !== 'B' && (
        <span className="text-[8px] bg-white/25 px-0.5 rounded leading-none">{tag}</span>
      )}
    </span>
  )
}