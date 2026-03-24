import { useRef, useEffect, useCallback, useState } from 'react'
import useStore from '../store/useStore'
import './SpatialMap.css'

// Pre-defined spatial layouts per strategy
const SPATIAL_LAYOUTS = [
  [ // Strategy A: Intimate Confrontation — circle around table
    { x: 370, y: 680 }, { x: 40, y: 380 }, { x: 100, y: 80 },
    { x: 660, y: 100 }, { x: 150, y: 620 }, { x: 750, y: 400 },
  ],
  [ // Strategy B: Power Dynamics
    { x: 370, y: 700 }, { x: 60, y: 320 }, { x: 150, y: -20 },
    { x: 700, y: 60 }, { x: 700, y: 550 }, { x: 800, y: 320 },
  ],
  [ // Strategy C: Rising Tension
    { x: 820, y: 600 }, { x: 20, y: 370 }, { x: 780, y: 370 },
    { x: 370, y: -20 }, { x: 120, y: 100 }, { x: 370, y: -60 },
  ],
]

export default function SpatialMap() {
  const strategies = useStore((s) => s.strategies)
  const activeStrategy = useStore((s) => s.activeStrategy)
  const screenplay = useStore((s) => s.screenplay)
  const setActiveShot = useStore((s) => s.setActiveShot)
  const setActiveBeat = useStore((s) => s.setActiveBeat)
  const setZenMode = useStore((s) => s.setZenMode)
  const getStrategyColor = useStore((s) => s.getStrategyColor)

  // Group screenplay lines by beat
  const beatScripts = {}
  let curBeat = -1
  for (const el of screenplay) {
    if (el.beat !== undefined) curBeat = el.beat
    if (curBeat >= 0) {
      if (!beatScripts[curBeat]) beatScripts[curBeat] = []
      beatScripts[curBeat].push(el)
    }
  }

  const mapRef = useRef(null)
  const contentRef = useRef(null)
  const panRef = useRef({ x: 0, y: 0 })
  const [nodePositions, setNodePositions] = useState({})
  const [expandedScripts, setExpandedScripts] = useState({})
  const dragState = useRef({ type: null, startX: 0, startY: 0, nodeIdx: null, origX: 0, origY: 0 })

  const strategy = strategies[activeStrategy]
  const shots = strategy?.shots || []
  const colors = getStrategyColor(activeStrategy)

  // Initialize positions
  useEffect(() => {
    const layout = SPATIAL_LAYOUTS[activeStrategy] || []
    const positions = {}
    shots.forEach((_, i) => {
      positions[i] = layout[i] || { x: 50 + (i % 3) * 350, y: 50 + Math.floor(i / 3) * 250 }
    })
    setNodePositions(positions)
    panRef.current = { x: 0, y: 0 }
    if (contentRef.current) {
      contentRef.current.style.transform = `translate(0px, 0px)`
    }
  }, [activeStrategy, shots.length])

  // Enter zen mode for a specific shot
  const enterZen = (shotIdx) => {
    setActiveShot(shotIdx)
    setActiveBeat(shotIdx)
    setZenMode(true)
  }

  const toggleScript = (idx) => {
    setExpandedScripts((prev) => ({ ...prev, [idx]: !prev[idx] }))
  }

  // Mouse handling for panning and node dragging
  const handleMouseDown = useCallback((e) => {
    if (e.target.closest('button')) return

    const node = e.target.closest('.spatial-node')
    if (node) {
      const idx = parseInt(node.dataset.index)
      const pos = nodePositions[idx] || { x: 0, y: 0 }
      dragState.current = { type: 'node', startX: e.clientX, startY: e.clientY, nodeIdx: idx, origX: pos.x, origY: pos.y }
    } else {
      dragState.current = { type: 'pan', startX: e.clientX, startY: e.clientY, nodeIdx: null, origX: 0, origY: 0 }
    }
  }, [nodePositions])

  useEffect(() => {
    const handleMouseMove = (e) => {
      const d = dragState.current
      if (!d.type) return

      const dx = e.clientX - d.startX
      const dy = e.clientY - d.startY

      if (d.type === 'node' && d.nodeIdx !== null) {
        setNodePositions((prev) => ({
          ...prev,
          [d.nodeIdx]: { x: d.origX + dx, y: d.origY + dy },
        }))
      } else if (d.type === 'pan') {
        panRef.current = {
          x: panRef.current.x + (e.clientX - d.startX),
          y: panRef.current.y + (e.clientY - d.startY),
        }
        d.startX = e.clientX
        d.startY = e.clientY
        if (contentRef.current) {
          contentRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px)`
        }
      }
    }

    const handleMouseUp = () => {
      dragState.current = { type: null, startX: 0, startY: 0, nodeIdx: null, origX: 0, origY: 0 }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // Compute SVG connections
  const renderPaths = () => {
    const paths = []
    for (let i = 0; i < shots.length - 1; i++) {
      const p1 = nodePositions[i]
      const p2 = nodePositions[i + 1]
      if (!p1 || !p2) continue

      const cx1 = p1.x + 130
      const cy1 = p1.y + 120
      const cx2 = p2.x + 130
      const cy2 = p2.y + 120

      const dx = cx2 - cx1
      const dy = cy2 - cy1
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < 10) continue

      const margin = 145
      if (dist <= margin * 2) continue

      const startRatio = margin / dist
      const endRatio = (dist - margin) / dist

      const x1 = cx1 + dx * startRatio
      const y1 = cy1 + dy * startRatio
      const x2 = cx1 + dx * endRatio
      const y2 = cy1 + dy * endRatio

      paths.push(
        <path
          key={i}
          d={`M ${x1} ${y1} L ${x2} ${y2}`}
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="2"
          strokeDasharray="4,6"
          fill="none"
          markerEnd="url(#arrowhead)"
        />
      )
    }
    return paths
  }

  if (!strategy) return null

  return (
    <div className="spatial-map" ref={mapRef} onMouseDown={handleMouseDown}>
      <div className="spatial-content" ref={contentRef}>
        {/* SVG connections */}
        <svg className="spatial-links">
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill="rgba(255,255,255,0.8)" />
            </marker>
          </defs>
          <g>{renderPaths()}</g>
        </svg>

        {/* Set label */}
        <div className="spatial-set-label">SET: INTERROGATION ROOM</div>

        {/* Nodes */}
        {shots.map((shot, i) => {
          const pos = nodePositions[i] || { x: 0, y: 0 }
          return (
            <div
              key={i}
              className="spatial-node"
              data-index={i}
              style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
            >
              <img
                src={shot.image || '/img/medium_twoshot.png'}
                className="spatial-node-img"
                draggable={false}
                alt={`Shot ${i + 1}`}
              />
              <div
                className={`spatial-node-script ${expandedScripts[i] ? 'visible' : ''}`}
              >
                {(beatScripts[i] || []).map((el, j) => (
                  <div key={j} className={`spatial-script-${el.type}`}>
                    {el.type === 'character' ? <strong>{el.text}</strong> : el.text}
                  </div>
                ))}
                {!(beatScripts[i]?.length) && <em>No script for this beat</em>}
              </div>
              <div className="spatial-node-meta">
                <span className="spatial-node-title">
                  {shot.cir?.shotSize && shot.cir?.relation
                    ? `${shot.cir.shotSize} — ${shot.cir.relation}`
                    : `Shot ${shot.order || i + 1}`}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="btn-toggle-script" onClick={() => toggleScript(i)}>
                    Script
                  </button>
                  <button className="spatial-node-btn" onClick={() => enterZen(i)}>
                    Draw &#x26F6;
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
