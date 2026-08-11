import { useRef, useState } from 'react'
import './SegmentCutout.css'

/**
 * Floating cutout layer rendered above the drawing canvas.
 *
 * Props:
 *   cutout:   { dataUrl, bbox: {x, y, w, h} } — bbox is in CSS px relative to the
 *             canvas container. dataUrl is an RGBA PNG sized exactly to the bbox.
 *   onConfirm(dx, dy, sx, sy):
 *             commit the cutout. dx/dy = current top-left in css px,
 *             sx/sy = current width/height in css px.
 *   onCancel():
 *             discard the cutout (caller restores the original patch).
 */
export default function SegmentCutout({ cutout, onConfirm, onCancel }) {
  const [pos, setPos] = useState({ x: cutout.bbox.x, y: cutout.bbox.y })
  const [size, setSize] = useState({ w: cutout.bbox.w, h: cutout.bbox.h })
  const dragging = useRef(null)   // { startX, startY, origX, origY }
  const resizing = useRef(null)   // { startX, startY, origW, origH, origX, origY, corner }

  // 잘라낸 조각이 바뀌면 위치·크기도 따라가야 한다. 렌더 중에 맞추면
  // effect가 한 번 더 도는 것(연쇄 렌더)을 피할 수 있다.
  const [syncedCutout, setSyncedCutout] = useState(cutout)
  if (syncedCutout !== cutout) {
    setSyncedCutout(cutout)
    setPos({ x: cutout.bbox.x, y: cutout.bbox.y })
    setSize({ w: cutout.bbox.w, h: cutout.bbox.h })
  }

  const onPointerMoveWindow = (e) => {
    if (dragging.current) {
      const dx = e.clientX - dragging.current.startX
      const dy = e.clientY - dragging.current.startY
      setPos({ x: dragging.current.origX + dx, y: dragging.current.origY + dy })
    } else if (resizing.current) {
      const r = resizing.current
      const dx = e.clientX - r.startX
      const dy = e.clientY - r.startY
      let newW = r.origW
      let newH = r.origH
      let newX = r.origX
      let newY = r.origY
      if (r.corner.includes('e')) newW = Math.max(8, r.origW + dx)
      if (r.corner.includes('s')) newH = Math.max(8, r.origH + dy)
      if (r.corner.includes('w')) {
        newW = Math.max(8, r.origW - dx)
        newX = r.origX + (r.origW - newW)
      }
      if (r.corner.includes('n')) {
        newH = Math.max(8, r.origH - dy)
        newY = r.origY + (r.origH - newH)
      }
      setPos({ x: newX, y: newY })
      setSize({ w: newW, h: newH })
    }
  }

  const onPointerUpWindow = () => {
    dragging.current = null
    resizing.current = null
    window.removeEventListener('pointermove', onPointerMoveWindow)
    window.removeEventListener('pointerup', onPointerUpWindow)
  }

  const startDrag = (e) => {
    e.stopPropagation()
    e.preventDefault()
    dragging.current = {
      startX: e.clientX, startY: e.clientY,
      origX: pos.x, origY: pos.y,
    }
    window.addEventListener('pointermove', onPointerMoveWindow)
    window.addEventListener('pointerup', onPointerUpWindow)
  }

  const startResize = (corner) => (e) => {
    e.stopPropagation()
    e.preventDefault()
    resizing.current = {
      startX: e.clientX, startY: e.clientY,
      origX: pos.x, origY: pos.y,
      origW: size.w, origH: size.h,
      corner,
    }
    window.addEventListener('pointermove', onPointerMoveWindow)
    window.addEventListener('pointerup', onPointerUpWindow)
  }

  const handleConfirm = (e) => {
    e.stopPropagation()
    onConfirm(pos.x, pos.y, size.w, size.h)
  }
  const handleCancel = (e) => {
    e.stopPropagation()
    onCancel()
  }

  return (
    <div
      className="segment-cutout"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
      onPointerDown={startDrag}
    >
      <img
        src={cutout.dataUrl}
        alt=""
        draggable={false}
        style={{ width: '100%', height: '100%', pointerEvents: 'none' }}
      />

      {['nw', 'ne', 'sw', 'se'].map((c) => (
        <div
          key={c}
          className={`segment-cutout-handle segment-cutout-handle--${c}`}
          onPointerDown={startResize(c)}
        />
      ))}

      <div className="segment-cutout-actions" onPointerDown={(e) => e.stopPropagation()}>
        <button className="segment-cutout-btn segment-cutout-btn--cancel" onClick={handleCancel} title="Cancel (restore original)">
          ✗
        </button>
        <button className="segment-cutout-btn segment-cutout-btn--confirm" onClick={handleConfirm} title="Confirm placement">
          ✓
        </button>
      </div>
    </div>
  )
}
