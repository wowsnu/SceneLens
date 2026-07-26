import React, { useState, useRef, useEffect, useCallback } from 'react'
import useStore from '../store/useStore'
import './SpatialMap.css'

const SPATIAL_LAYOUTS = [
  [
    { x: 400, y: 650, angle: -90 },
    { x: 100, y: 400, angle: -30 },
    { x: 450, y: 150, angle: 90 },
    { x: 700, y: 400, angle: -150 },
    { x: 250, y: 300, angle: 0 },
    { x: 400, y: 750, angle: -90 },
  ],
]

const INITIAL_PRESETS = [
  { label: 'C', color: '#3b82f6', full: 'CHIGURH' },
  { label: 'P', color: '#ef4444', full: 'PROPRIETOR' },
]

const INITIAL_ELEMENTS = [
  { id: 'e1', type: 'rect', x: 400, y: 350, w: 450, h: 120, label: 'COUNTER' },
  { id: 'e2', type: 'rect', x: 300, y: 240, w: 700, h: 50, label: 'SHELF' },
  { id: 'e3', type: 'text', x: 450, y: 530, text: 'SCENE: RURAL GAS STATION' },
  { id: 'm1', type: 'marker', x: 440, y: 480, label: 'C', color: '#3b82f6', waypoints: [] },
  { id: 'm2', type: 'marker', x: 660, y: 380, label: 'P', color: '#ef4444', waypoints: [] },
]

const PRESET_COLORS = ['#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']

function cloneElements(elements) {
  return elements.map((element) => ({
    ...element,
    waypoints: element.waypoints?.map((waypoint) => ({ ...waypoint })),
  }))
}

export default function SpatialMap({
  compact = false,
  initialElements = INITIAL_ELEMENTS,
  initialEntityPresets = INITIAL_PRESETS,
  onElementsChange,
  showShotNodes = true,
}) {
  const setViewMode = useStore((s) => s.setViewMode)
  const strategies = useStore((s) => s.strategies)
  const activeStrategy = useStore((s) => s.activeStrategy)
  const activeShot = useStore((s) => s.activeShot)
  const setActiveShot = useStore((s) => s.setActiveShot)
  const setStrategies = useStore((s) => s.setStrategies)
  const shotSketches = useStore((s) => s.shotSketches)

  const mapContainerRef = useRef(null)
  const contentRef = useRef(null)
  const panRef = useRef({ x: 150, y: 50 })
  const zoomRef = useRef(0.8)
  const entityIdRef = useRef(0)
  
  const [activeTool, setActiveTool] = useState('select')
  const [showLabels, setShowLabels] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [hasAnalyzed, setHasAnalyzed] = useState(false)
  const [entityPresets, setEntityPresets] = useState(() => initialEntityPresets.map((preset) => ({ ...preset })))
  const [newCharName, setNewCharName] = useState('')

  const [elements, setElements] = useState(() => cloneElements(initialElements))

  const [nodePositions, setNodePositions] = useState({})
  const [drawingPreview, setDrawingPreview] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [showEntityMenu, setShowEntityMenu] = useState(false)
  const [planningEntityId, setPlanningEntityId] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)

  const dragState = useRef({ type: null, id: null, startX: 0, startY: 0, origX: 0, origY: 0, hasMoved: false })
  const strategy = strategies[activeStrategy]
  const shots = strategy?.shots || []
  const shotCount = shots.length

  useEffect(() => {
    onElementsChange?.(cloneElements(elements))
  }, [elements, onElementsChange])

  const updateTransform = useCallback(() => {
    if (contentRef.current) {
      contentRef.current.style.transform = `translate(${panRef.current.x}px, ${panRef.current.y}px) scale(${zoomRef.current})`
    }
  }, [])

  useEffect(() => {
    const layout = SPATIAL_LAYOUTS[activeStrategy] || SPATIAL_LAYOUTS[0]
    const frame = requestAnimationFrame(() => {
      setNodePositions(prev => {
        const positions = { ...prev }
        Array.from({ length: shotCount }).forEach((_, i) => {
          if (positions[i]) return // 이미 위치 있으면 유지
          if (layout[i]) {
            positions[i] = layout[i]
          } else {
            // 새 샷: 마지막 노드 기준으로 랜덤 오프셋
            const last = positions[i - 1] || { x: 400, y: 400, angle: 0 }
            const angle = Math.random() * 360
            const dist = 120 + Math.random() * 80
            positions[i] = {
              x: last.x + Math.cos(angle * Math.PI / 180) * dist,
              y: last.y + Math.sin(angle * Math.PI / 180) * dist,
              angle: 0,
            }
          }
        })
        // 삭제된 샷 정리
        Object.keys(positions).forEach(k => {
          if (parseInt(k) >= shotCount) delete positions[k]
        })
        return positions
      })
    })
    updateTransform()
    return () => cancelAnimationFrame(frame)
  }, [activeStrategy, shotCount, updateTransform])

  const playSequence = async () => {
    if (isPlaying) return
    setIsPlaying(true)
    const animatableElements = elements.filter(el => el.type === 'marker' && el.waypoints?.length > 0)
    for (const el of animatableElements) {
      for (const wp of el.waypoints) {
        setElements(prev => prev.map(item => item.id === el.id ? { ...item, x: wp.x, y: wp.y } : item))
        await new Promise(r => setTimeout(r, 800))
      }
    }
    setIsPlaying(false)
    setPlanningEntityId(null)
  }

  const clearPath = (id) => {
    setElements(prev => prev.map(item => item.id === id ? { ...item, waypoints: [] } : item))
  }

  const addNewPreset = () => {
    if (!newCharName.trim()) return
    const newPreset = { label: newCharName[0].toUpperCase(), full: newCharName.toUpperCase(), color: PRESET_COLORS[entityPresets.length % PRESET_COLORS.length] }
    setEntityPresets([...entityPresets, newPreset]); setNewCharName('')
  }

  const addEntity = (preset) => {
    entityIdRef.current += 1
    const newId = `ent-${entityIdRef.current}`
    const rect = mapContainerRef.current?.getBoundingClientRect()
    const centerPos = {
      x: ((rect?.width || window.innerWidth) / 2 - panRef.current.x) / zoomRef.current,
      y: ((rect?.height || window.innerHeight) / 2 - panRef.current.y) / zoomRef.current,
    }
    setElements([...elements, { id: newId, type: 'marker', x: centerPos.x, y: centerPos.y, label: preset.label, color: preset.color, waypoints: [] }])
    setShowEntityMenu(false); setActiveTool('select')
  }

  const handleAIButtonClick = () => {
    if (!hasAnalyzed) {
      setIsAnalyzing(true)
      setTimeout(() => {
        const intents = ['ESTABLISH SPACE', 'SUBJECTIVE PRESSURE', 'REACTION EMPHASIS', 'ISOLATION / VULNERABILITY', 'RELATIONSHIP RESET', 'CLIMATIC BEAT']
        const updatedShots = shots.map((shot, i) => ({ ...shot, intent: intents[i % intents.length] }))
        const newStrategies = [...strategies]; newStrategies[activeStrategy] = { ...strategy, shots: updatedShots }; setStrategies(newStrategies)
        setIsAnalyzing(false); setHasAnalyzed(true); setShowLabels(true)
      }, 1500)
    } else { setShowLabels(!showLabels) }
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        if (e.target.tagName === 'INPUT') return
        setElements(prev => prev.filter(el => el.id !== selectedId)); setSelectedId(null)
      }
      if (e.key === 'Escape') { setPlanningEntityId(null); setSelectedId(null) }
    }
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId])

  const handleWheel = useCallback((e) => {
    e.preventDefault(); const scaleFactor = 0.1; const delta = e.deltaY > 0 ? -1 : 1; const oldZoom = zoomRef.current;
    const newZoom = Math.min(Math.max(oldZoom + delta * scaleFactor * oldZoom, 0.2), 3);
    const rect = e.currentTarget.getBoundingClientRect(); const mouseX = e.clientX - rect.left; const mouseY = e.clientY - rect.top;
    const newX = mouseX - (mouseX - panRef.current.x) * (newZoom / oldZoom); const newY = mouseY - (mouseY - panRef.current.y) * (newZoom / oldZoom);
    zoomRef.current = newZoom; panRef.current = { x: newX, y: newY }; updateTransform()
  }, [updateTransform])

  const handleMouseDown = (e) => {
    if (e.button === 2) {
      const element = e.target.closest('.board-element')
      if (element) { setElements(prev => prev.filter(el => el.id !== element.dataset.id)); return; }
    }
    if (e.target.closest('button') || e.target.closest('input')) return
    const rect = mapContainerRef.current.getBoundingClientRect()
    const canvasX = (e.clientX - rect.left - panRef.current.x) / zoomRef.current
    const canvasY = (e.clientY - rect.top - panRef.current.y) / zoomRef.current

    if (activeTool !== 'select') {
      dragState.current = { type: 'drawing', startX: canvasX, startY: canvasY }
      setDrawingPreview({ type: activeTool, x: canvasX, y: canvasY, w: 0, h: 0 })
    } else {
      const node = e.target.closest('.spatial-node')
      const element = e.target.closest('.board-element')
      const waypoint = e.target.closest('.waypoint-marker')

      if (planningEntityId && !element && !node && !waypoint) {
        setElements(prev => prev.map(item => item.id === planningEntityId ? { ...item, waypoints: [...(item.waypoints || []), { id: `wp-${Date.now()}`, x: canvasX - 21, y: canvasY - 21 }] } : item))
        return
      }

      if (node) {
        const idx = parseInt(node.dataset.index); const pos = nodePositions[idx]
        dragState.current = { type: 'node', id: idx, startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, hasMoved: false }; setSelectedId(null)
      } else if (element) {
        const id = element.dataset.id; const el = elements.find(item => item.id === id)
        dragState.current = { type: 'element', id: id, startX: e.clientX, startY: e.clientY, origX: el.x, origY: el.y, hasMoved: false }; setSelectedId(id)
      } else {
        dragState.current = { type: 'pan', startX: e.clientX, startY: e.clientY, hasMoved: false }; setSelectedId(null)
      }
    }

    const onMouseMove = (me) => {
      const d = dragState.current; if (!d.type) return
      d.hasMoved = true
      if (d.type === 'drawing') {
        const cx = (me.clientX - rect.left - panRef.current.x) / zoomRef.current
        const cy = (me.clientY - rect.top - panRef.current.y) / zoomRef.current
        setDrawingPreview({ type: activeTool, x: Math.min(d.startX, cx), y: Math.min(d.startY, cy), w: Math.abs(cx - d.startX), h: Math.abs(cy - d.startY) })
      } else if (d.type === 'node') {
        const dx = (me.clientX - d.startX) / zoomRef.current; const dy = (me.clientY - d.startY) / zoomRef.current
        setNodePositions(prev => ({ ...prev, [d.id]: { ...prev[d.id], x: d.origX + dx, y: d.origY + dy } }))
      } else if (d.type === 'element') {
        const dx = (me.clientX - d.startX) / zoomRef.current; const dy = (me.clientY - d.startY) / zoomRef.current
        setElements(prev => prev.map(item => item.id === d.id ? { ...item, x: d.origX + dx, y: d.origY + dy } : item))
      } else {
        panRef.current = { x: panRef.current.x + (me.clientX - d.startX), y: panRef.current.y + (me.clientY - d.startY) }
        d.startX = me.clientX; d.startY = me.clientY; updateTransform()
      }
    }

    const onMouseUp = (ue) => {
      const d = dragState.current
      if (d.type === 'drawing') {
        const cx = (ue.clientX - rect.left - panRef.current.x) / zoomRef.current
        const cy = (ue.clientY - rect.top - panRef.current.y) / zoomRef.current
        const fw = Math.abs(cx - d.startX), fh = Math.abs(cy - d.startY)
        if (activeTool === 'text' || (fw > 5 || fh > 5)) {
          const nid = `el-${Date.now()}`
          setElements(prev => [...prev, { id: nid, type: activeTool, x: Math.min(d.startX, cx), y: Math.min(d.startY, cy), w: activeTool === 'text' ? 240 : Math.max(fw, 20), h: activeTool === 'text' ? 32 : Math.max(fh, 20), label: activeTool === 'text' ? undefined : '', text: activeTool === 'text' ? '' : undefined, isNew: true }])
          setSelectedId(nid)
        }
        setDrawingPreview(null); setActiveTool('select')
      } else if (d.type === 'element' && !d.hasMoved) {
        const el = elements.find(item => item.id === d.id)
        if (el?.type === 'marker') setPlanningEntityId(d.id === planningEntityId ? null : d.id)
      }
      dragState.current.type = null; window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove); window.addEventListener('mouseup', onMouseUp)
  }

  const renderPaths = () => {
    return (
      <>
        {showShotNodes && shots.slice(0, -1).map((_, i) => {
          const p1 = nodePositions[i], p2 = nodePositions[i+1]; if (!p1 || !p2) return null
          const nodeOffset = compact ? 20 : 120
          const nodeOffsetY = compact ? 20 : 70
          const c1x = p1.x + nodeOffset, c1y = p1.y + nodeOffsetY
          const c2x = p2.x + nodeOffset, c2y = p2.y + nodeOffsetY
          const dx = c2x - c1x, dy = c2y - c1y
          const angle = Math.atan2(dy, dx)
          const dist = Math.sqrt(dx * dx + dy * dy)
          const minDist = compact ? 40 : 150
          if (dist < minDist) return null
          const nodeRadius = compact ? 24 : 130
          const x1 = c1x + Math.cos(angle) * nodeRadius
          const y1 = c1y + Math.sin(angle) * nodeRadius
          const x2 = c2x - Math.cos(angle) * (nodeRadius + 8)
          const y2 = c2y - Math.sin(angle) * (nodeRadius + 8)
          const mx = (x1 + x2) / 2
          const my = (y1 + y2) / 2
          const nextShot = shots[i+1]

          return (
            <g key={`shot-path-${i}`}>
              <path d={`M ${x1} ${y1} L ${x2} ${y2}`} className="spatial-path-line" markerEnd="url(#arrowhead)" fill="none" />
              {showLabels && nextShot.intent && (
                <foreignObject x={mx - 60} y={my - 20} width="120" height="24">
                  <div className="arrow-label">{nextShot.intent}</div>
                </foreignObject>
              )}
            </g>
          )
        })}
        {elements.filter(el => el.type === 'marker' && el.waypoints?.length > 0).map(el => (
          <g key={`movement-${el.id}`}>
            <path d={`M ${el.x + 21} ${el.y + 21} ${el.waypoints.map(wp => `L ${wp.x + 21} ${wp.y + 21}`).join(' ')}`} fill="none" stroke={el.color} strokeWidth="2" strokeDasharray="6,4" className="character-movement-path" />
          </g>
        ))}
      </>
    )
  }

  const handleZoom = (delta) => {
    const oldZoom = zoomRef.current
    const newZoom = Math.min(Math.max(oldZoom + delta, 0.2), 3)
    const rect = mapContainerRef.current.getBoundingClientRect()
    const cx = rect.width / 2, cy = rect.height / 2
    panRef.current = {
      x: cx - (cx - panRef.current.x) * (newZoom / oldZoom),
      y: cy - (cy - panRef.current.y) * (newZoom / oldZoom),
    }
    zoomRef.current = newZoom
    updateTransform()
  }

  return (
    <div className={`spatial-map tool-${activeTool} ${isPlaying ? 'simulating' : ''}`} ref={mapContainerRef} onMouseDown={handleMouseDown} onWheel={handleWheel} onContextMenu={(e) => e.preventDefault()}>
      {!compact && (
        <div className="spatial-toolbar">
          <button className={`tool-btn ${activeTool === 'rect' ? 'active' : ''}`} onClick={() => setActiveTool('rect')} title="Draw Rect"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></svg></button>
          <button className={`tool-btn ${activeTool === 'circle' ? 'active' : ''}`} onClick={() => setActiveTool('circle')} title="Draw Circle"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /></svg></button>
          <button className={`tool-btn ${activeTool === 'text' ? 'active' : ''}`} onClick={() => setActiveTool('text')} title="Add Text"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 7 4 4 20 4 20 7" /><line x1="12" y1="4" x2="12" y2="20" /></svg></button>
          <div className="tool-divider" />
          <div className="tool-group">
            <button className={`tool-btn ${showEntityMenu ? 'active' : ''}`} onClick={() => setShowEntityMenu(!showEntityMenu)} title="Add Character"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="7" r="4" /><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /></svg></button>
            {showEntityMenu && (
              <div className="entity-flyout">
                <div className="entity-list-scroll">
                  {entityPresets.map(p => (<div key={p.full} className="entity-item" onClick={() => addEntity(p)}><div className="entity-dot" style={{ backgroundColor: p.color }}>{p.label}</div><span>{p.full}</span></div>))}
                </div>
                <div className="entity-add-row">
                  <input type="text" placeholder="New Char..." value={newCharName} onChange={(e) => setNewCharName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNewPreset()} />
                  <button onClick={addNewPreset}>+</button>
                </div>
              </div>
            )}
          </div>
          <div className="tool-divider" />
          <button className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`} onClick={() => setActiveTool('select')} title="Select Mode"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /></svg></button>
        </div>
      )}

      <div className="spatial-content" ref={contentRef}>
        {planningEntityId && (
          <div className="movement-hint planning">
            PLANNING MOVEMENT: CLICK TO ADD WAYPOINTS (ESC TO FINISH)
            <button className="hint-btn" onClick={playSequence}>🎬 PLAY</button>
            <button className="hint-btn secondary" onClick={() => clearPath(planningEntityId)}>🧹 CLEAR</button>
          </div>
        )}
        <div className="floor-plan-bg">
          {elements.map((el) => (
            <React.Fragment key={el.id}>
              <div data-id={el.id} className={`board-element ${el.type} ${selectedId === el.id ? 'selected' : ''} ${planningEntityId === el.id ? 'planning' : ''}`} style={{ left: el.x, top: el.y, width: el.w, height: el.h, backgroundColor: el.type === 'marker' ? el.color : undefined }}>
                {el.type === 'text' ? (
                  <input type="text" autoFocus={el.isNew} placeholder="Type something..." className="element-text-input" defaultValue={el.text} onBlur={(e) => { const v = e.target.value; if (!v && el.isNew) setElements(prev => prev.filter(it => it.id !== el.id)); else setElements(prev => prev.map(it => it.id === el.id ? { ...it, text: v, isNew: false } : it)) }} />
                ) : el.type === 'marker' ? (
                  <>
                    <span className="marker-label">{el.label}</span>
                    {el.waypoints?.length > 0 && <div className="marker-path-badge">{el.waypoints.length}</div>}
                  </>
                ) : (
                  <input type="text" placeholder="LABEL" className="element-label-input" defaultValue={el.label} onBlur={(e) => setElements(prev => prev.map(it => it.id === el.id ? { ...it, label: e.target.value } : it))} />
                )}
              </div>
              {el.type === 'marker' && el.waypoints?.map((wp, i) => (<div key={wp.id} className="waypoint-marker" style={{ left: wp.x, top: wp.y, borderColor: el.color }}><span className="waypoint-index">{i + 1}</span></div>))}
            </React.Fragment>
          ))}
          {drawingPreview && <div className={`board-element drawing-preview ${drawingPreview.type}`} style={{ left: drawingPreview.x, top: drawingPreview.y, width: drawingPreview.w, height: drawingPreview.h }} />}
          {showShotNodes && (
            <div className="axis-of-action" style={{ top: '430px', left: '440px', width: '250px', transform: 'rotate(-25deg)' }}><span className="axis-label">AXIS OF ACTION</span></div>
          )}
        </div>
        <svg className="spatial-links-layer"><defs><marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto"><polygon points="0 0, 8 3, 0 6" fill="rgba(255, 255, 255, 0.15)" /></marker></defs><g>{renderPaths()}</g></svg>
        {showShotNodes && shots.map((shot, i) => {
          const pos = nodePositions[i] || { x: 0, y: 0, angle: 0 }
          if (compact) {
            const isActive = activeShot === i
            return (
              <div
                key={i}
                className={`spatial-node camera-node ${isActive ? 'active' : ''}`}
                data-index={i}
                style={{ left: pos.x, top: pos.y }}
                onClick={() => setActiveShot(i)}
                onMouseDown={(e) => {
                  if (e.target.closest('.rotate-handle')) return
                  if (e.button !== 0) return
                  e.stopPropagation()
                  const startX = e.clientX
                  const startY = e.clientY
                  const origX = pos.x
                  const origY = pos.y
                  let moved = false
                  const onMove = (me) => {
                    moved = true
                    const dx = (me.clientX - startX) / zoomRef.current
                    const dy = (me.clientY - startY) / zoomRef.current
                    setNodePositions(prev => ({
                      ...prev,
                      [i]: { ...prev[i], x: origX + dx, y: origY + dy }
                    }))
                  }
                  const onUp = () => {
                    if (!moved) setActiveShot(i)
                    window.removeEventListener('mousemove', onMove)
                    window.removeEventListener('mouseup', onUp)
                  }
                  window.addEventListener('mousemove', onMove)
                  window.addEventListener('mouseup', onUp)
                }}
              >
                <div className="camera-node-body">
                  <div className="camera-icon" style={{ transform: `rotate(${pos.angle}deg)` }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  </div>
                  {/* 회전 핸들 */}
                  <div
                    className="rotate-handle"
                    title="Drag to rotate"
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      const nodeEl = e.currentTarget.closest('.camera-node')
                      const nodeRect = nodeEl.getBoundingClientRect()
                      const cx = nodeRect.left + nodeRect.width / 2
                      const cy = nodeRect.top + nodeRect.height / 2
                      const startRad = Math.atan2(e.clientY - cy, e.clientX - cx)
                      const startAngle = pos.angle
                      const onMove = (me) => {
                        const rad = Math.atan2(me.clientY - cy, me.clientX - cx)
                        const delta = (rad - startRad) * (180 / Math.PI)
                        setNodePositions(prev => ({
                          ...prev,
                          [i]: { ...prev[i], angle: Math.round(startAngle + delta) }
                        }))
                      }
                      const onUp = () => {
                        window.removeEventListener('mousemove', onMove)
                        window.removeEventListener('mouseup', onUp)
                      }
                      window.addEventListener('mousemove', onMove)
                      window.addEventListener('mouseup', onUp)
                    }}
                  />
                </div>
                <span className="camera-label">S{i + 1}</span>
                {isActive && <div className="camera-angle-hint">{pos.angle}°</div>}
              </div>
            )
          }
          return (
            <div key={i} className="spatial-node storyboard-card" data-index={i} style={{ left: pos.x, top: pos.y }} onDoubleClick={() => { setActiveShot(i); setViewMode('detail'); }}>
              <div className="card-image-wrap">
                {(shotSketches[`${activeStrategy}-${i}`] || shot.image) ? (
                  <img src={shotSketches[`${activeStrategy}-${i}`] || shot.image} alt={`Shot ${i + 1}`} draggable="false" />
                ) : (
                  <div className="card-no-image">SHOT {i + 1}</div>
                )}
                <div className="card-number">SHOT {i + 1}</div>
                <button className="card-remix-btn" onClick={(e) => e.stopPropagation()}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 2v6h-6M3 22v-6h6" /><path d="M21 13A9 9 0 1111 3a9.05 9.05 0 0110 10z" /></svg></button>
              </div>
              <div className="card-meta"><div className="card-info"><span className="card-label">{shot.cir?.shotSize || 'Shot'}</span><span className="card-sub">{shot.cir?.relation || 'Single'}</span></div><div className="card-camera-hint" style={{ transform: `rotate(${pos.angle}deg)` }}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg></div></div>
            </div>
          )
        })}
      </div>

      <div className="zoom-controls">
        <button className="zoom-btn" onClick={() => handleZoom(0.15)}>+</button>
        <button className="zoom-btn" onClick={() => handleZoom(-0.15)}>−</button>
        <button className="zoom-btn" onClick={() => {
          const positions = showShotNodes
            ? Object.values(nodePositions)
            : elements.map((element) => ({ x: element.x, y: element.y }))
          if (positions.length === 0) return
          const minX = Math.min(...positions.map(p => p.x))
          const maxX = Math.max(...positions.map(p => p.x))
          const minY = Math.min(...positions.map(p => p.y))
          const maxY = Math.max(...positions.map(p => p.y))
          const cx = (minX + maxX) / 2
          const cy = (minY + maxY) / 2
          const rect = mapContainerRef.current.getBoundingClientRect()
          zoomRef.current = 0.6
          panRef.current = { x: rect.width / 2 - cx * 0.6, y: rect.height / 2 - cy * 0.6 }
          updateTransform()
        }}>⊙</button>
      </div>

      {!compact && showShotNodes && (
        <div className="board-controls">
          <button className="board-btn primary"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>ADD SHOT</button>
          <div className="tool-divider-v" />
          <button className={`board-btn ${isAnalyzing ? 'analyzing' : ''} ${hasAnalyzed ? 'active' : ''}`} onClick={handleAIButtonClick} disabled={isAnalyzing}>{isAnalyzing ? 'AI ANALYZING...' : (!hasAnalyzed ? 'ANALYZE INTENT' : (showLabels ? 'HIDE INTENTS' : 'SHOW INTENTS'))}</button>
          <div className="tool-divider-v" />
          <button className="board-btn" onClick={() => {
            const positions = Object.values(nodePositions)
            if (positions.length === 0) return
            const minX = Math.min(...positions.map(p => p.x))
            const maxX = Math.max(...positions.map(p => p.x))
            const minY = Math.min(...positions.map(p => p.y))
            const maxY = Math.max(...positions.map(p => p.y))
            const cx = (minX + maxX) / 2
            const cy = (minY + maxY) / 2
            const rect = mapContainerRef.current.getBoundingClientRect()
            zoomRef.current = 0.6
            panRef.current = {
              x: rect.width / 2 - cx * 0.6,
              y: rect.height / 2 - cy * 0.6,
            }
            updateTransform()
          }}>RE-CENTER</button>
        </div>
      )}
    </div>
  )
}
