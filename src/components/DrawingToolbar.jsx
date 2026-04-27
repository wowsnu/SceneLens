import { useState } from 'react'
import useStore from '../store/useStore'
import './DrawingToolbar.css'

const PEN_TYPES = [
  { type: 'pencil',   label: 'Pencil'   },
  { type: 'marker',   label: 'Marker'   },
  { type: 'charcoal', label: 'Charcoal' },
]

const IconPencil = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
  </svg>
)
const IconMarker = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 19 7-7 3 3-7 7-3-3z"/><path d="m18 13-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
    <path d="m2 2 7.586 7.586"/><circle cx="11" cy="11" r="2"/>
  </svg>
)
const IconCharcoal = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/>
    <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>
  </svg>
)
const IconErase = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/>
    <path d="M22 21H7"/><path d="m5 11 9 9"/>
  </svg>
)
const IconUndo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>
  </svg>
)
const IconRedo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>
  </svg>
)
const IconClear = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
  </svg>
)

const ICONS = { pencil: IconPencil, marker: IconMarker, charcoal: IconCharcoal }

export default function DrawingToolbar({ children }) {
  const drawingTool = useStore((s) => s.drawingTool)
  const setDrawingTool = useStore((s) => s.setDrawingTool)
  const penType = useStore((s) => s.penType)
  const setPenType = useStore((s) => s.setPenType)
  const brushSize = useStore((s) => s.brushSize)
  const setBrushSize = useStore((s) => s.setBrushSize)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    const { canvasDataUrl, strategies, activeStrategy, activeShot, setStrategies, flowSetActiveShotImage } = useStore.getState()
    if (!canvasDataUrl) return
    if (flowSetActiveShotImage) flowSetActiveShotImage(canvasDataUrl)
    const emptyShot = (order) => ({
      order, image: null,
      cir: { shotSize: '', cameraAngle: '', cameraLevel: '', relation: '', blockingDistance: '', eyeline: '', occlusion: '', motionHint: '' },
      theory_rationale: '', source: '',
    })
    if (strategies.length === 0) {
      const shots = Array.from({ length: activeShot + 1 }, (_, i) =>
        i === activeShot ? { ...emptyShot(i + 1), image: canvasDataUrl } : emptyShot(i + 1)
      )
      setStrategies([{ name: 'Storyboard', intention_tags: [], shots }])
    } else {
      const updated = strategies.map((strat, si) => {
        if (si !== activeStrategy) return strat
        const shots = [...strat.shots]
        while (shots.length <= activeShot) {
          shots.push(emptyShot(shots.length + 1))
        }
        shots[activeShot] = { ...shots[activeShot], image: canvasDataUrl }
        return { ...strat, shots }
      })
      setStrategies(updated)
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="drawing-toolbar">

      {/* Pen types + Eraser */}
      <div className="toolbar-group">
        {PEN_TYPES.map(({ type, label }) => {
          const Icon = ICONS[type]
          return (
            <button
              key={type}
              className={`drawing-tool-btn ${drawingTool === 'pen' && penType === type ? 'active' : ''}`}
              onClick={() => { setDrawingTool('pen'); setPenType(type) }}
            >
              <Icon />
              <span>{label}</span>
            </button>
          )
        })}
        <button
          className={`drawing-tool-btn ${drawingTool === 'eraser' ? 'active' : ''}`}
          onClick={() => setDrawingTool('eraser')}
        >
          <IconErase />
          <span>Erase</span>
        </button>
      </div>

      {/* Size */}
      <div className="toolbar-group toolbar-divider">
        <label className="brush-size-control">
          <span>Size</span>
          <input
            type="range"
            min="1"
            max="50"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
          <span className="brush-size-value">{brushSize}</span>
        </label>
      </div>

      {/* Undo / Redo / Clear / Save */}
      <div className="toolbar-group toolbar-divider">
        <button className="drawing-tool-btn" id="btn-undo" title="Undo"><IconUndo /></button>
        <button className="drawing-tool-btn" id="btn-redo" title="Redo"><IconRedo /></button>
        <button className="drawing-tool-btn" id="btn-clear" title="Clear"><IconClear /></button>
        <button className={`drawing-tool-btn save-btn ${saved ? 'saved' : ''}`} onClick={handleSave}>
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>

      {children && <>{children}</>}
    </div>
  )
}
