import { useState, useEffect, useCallback, useRef } from 'react'
import useStore from '../store/useStore'
import './FlowTab.css'

// ── Layout constants ───────────────────────────────────────
const NODE_W = 72
const NODE_H = 46
const GAP_X = 28
const ROW_GAP = 24
const LABEL_H = 22
const PAD = 14

const BRANCH_COLORS = ['#10b981', '#8b5cf6', '#ef4444', '#3b82f6', '#ec4899']

// ── Context Menu ───────────────────────────────────────────
function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div ref={ref} className="flow-context-menu" style={{ left: x, top: y }}>
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="flow-context-divider" />
        ) : (
          <button
            key={i}
            className={`flow-context-item ${item.danger ? 'danger' : ''}`}
            onClick={() => { item.action(); onClose() }}
            disabled={item.disabled}
          >
            <span className="flow-context-icon">{item.icon}</span>
            {item.label}
          </button>
        )
      )}
    </div>
  )
}

// ── Graph View (SVG branching + full interactions) ─────────
export function GraphView() {
  const scene = useStore((s) => s.scenes[s.activeScene])
  const branches = scene?.branches || []
  const activeBranch = scene?.activeBranch ?? 0
  const activeShot = scene?.activeShot ?? 0
  const setActiveBranch = useStore((s) => s.setFlowActiveBranch)
  const setActiveShot = useStore((s) => s.setFlowActiveShot)
  const setView = useStore((s) => s.setFlowView)
  const setInsertGap = useStore((s) => s.setFlowInsertGap)
  const reorderShot = useStore((s) => s.flowReorderShot)
  const removeShot = useStore((s) => s.flowRemoveShot)
  const splitBranch = useStore((s) => s.flowSplitBranch)
  const deleteBranch = useStore((s) => s.flowDeleteBranch)
  const promoteBranch = useStore((s) => s.flowPromoteBranch)
  const disconnectEdge = useStore((s) => s.flowDisconnectEdge)

  const containerRef = useRef(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [drag, setDrag] = useState(null) // { branchIdx, shotIdx, startX, currentX }

  const mainBranch = branches.find((b) => b.isMain) || branches[0]
  const mainIdx = branches.indexOf(mainBranch)
  const altBranches = branches.filter((b) => !b.isMain)

  // ── Layout computation ──
  const cellW = NODE_W + GAP_X
  const mainRowY = PAD + LABEL_H
  const mainNodes = mainBranch.shots.map((_, i) => ({
    x: PAD + i * cellW,
    y: mainRowY,
  }))

  const altLayouts = altBranches.map((branch, aIdx) => {
    const bp = branch.branchPoint ?? 0
    const rowY = mainRowY + NODE_H + ROW_GAP + aIdx * (NODE_H + ROW_GAP + LABEL_H)
    const offsetX = PAD + bp * cellW
    const nodes = branch.shots.map((_, i) => ({
      x: offsetX + i * cellW,
      y: rowY + LABEL_H,
    }))
    return { branch, bp, rowY, offsetX, nodes, branchIdx: branches.indexOf(branch) }
  })

  const maxX = Math.max(
    mainNodes.length > 0 ? mainNodes[mainNodes.length - 1].x + NODE_W : 0,
    ...altLayouts.map((a) => a.nodes.length > 0 ? a.nodes[a.nodes.length - 1].x + NODE_W : 0),
    200
  ) + PAD * 2

  const maxY = altLayouts.length > 0
    ? (altLayouts[altLayouts.length - 1].nodes[0]?.y || mainRowY) + NODE_H + PAD + 20
    : mainRowY + NODE_H + PAD + 20

  // ── Drag handlers ──
  const handleDragStart = (e, branchIdx, shotIdx) => {
    e.preventDefault()
    const rect = containerRef.current.getBoundingClientRect()
    const startX = e.clientX - rect.left + containerRef.current.scrollLeft
    setDrag({ branchIdx, shotIdx, startX, currentX: startX })

    const handleMove = (e2) => {
      const cx = e2.clientX - rect.left + containerRef.current.scrollLeft
      setDrag((d) => d ? { ...d, currentX: cx } : null)
    }

    const handleUp = () => {
      setDrag((d) => {
        if (!d) return null
        // Compute target index from currentX
        const layout = d.branchIdx === mainIdx ? mainNodes : altLayouts.find((a) => a.branchIdx === d.branchIdx)?.nodes
        if (layout) {
          let targetIdx = 0
          for (let i = 0; i < layout.length; i++) {
            if (d.currentX > layout[i].x + NODE_W / 2) targetIdx = i
          }
          // Clamp
          targetIdx = Math.max(0, Math.min(targetIdx, layout.length - 1))
          if (targetIdx !== d.shotIdx) {
            reorderShot(d.branchIdx, d.shotIdx, targetIdx)
          }
        }
        return null
      })
      document.removeEventListener('mousemove', handleMove)
      document.removeEventListener('mouseup', handleUp)
    }

    document.addEventListener('mousemove', handleMove)
    document.addEventListener('mouseup', handleUp)
  }

  // Compute drag visual offset
  const getDragOffset = (branchIdx, shotIdx) => {
    if (!drag || drag.branchIdx !== branchIdx || drag.shotIdx !== shotIdx) return 0
    return drag.currentX - drag.startX
  }

  const isDragging = (branchIdx, shotIdx) => {
    return drag && drag.branchIdx === branchIdx && drag.shotIdx === shotIdx
  }

  // ── Context menu handlers ──
  const handleNodeContext = (e, branchIdx, shotIdx) => {
    e.preventDefault()
    e.stopPropagation()
    const branch = branches[branchIdx]
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + containerRef.current.scrollLeft
    const y = e.clientY - rect.top + containerRef.current.scrollTop

    setContextMenu({
      x, y,
      items: [
        { icon: '👁', label: 'View in Card', action: () => { setActiveBranch(branchIdx); setActiveShot(shotIdx); setView('card') } },
        { icon: '➕', label: 'Insert After', action: () => setInsertGap({ branchIdx, afterShotIdx: shotIdx }) },
        { divider: true },
        { icon: '✂️', label: 'Split Here', action: () => splitBranch(branchIdx, shotIdx), disabled: shotIdx === 0 },
        { divider: true },
        { icon: '🗑', label: 'Delete Shot', action: () => removeShot(branchIdx, shotIdx), danger: true, disabled: branch.shots.length <= 1 },
      ],
    })
  }

  const handleEdgeContext = (e, branchIdx, afterShotIdx) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + containerRef.current.scrollLeft
    const y = e.clientY - rect.top + containerRef.current.scrollTop

    setContextMenu({
      x, y,
      items: [
        { icon: '➕', label: 'Insert Shot Here', action: () => setInsertGap({ branchIdx, afterShotIdx }) },
        { icon: '✂️', label: 'Disconnect', action: () => disconnectEdge(branchIdx, afterShotIdx) },
      ],
    })
  }

  const handleBranchContext = (e, branchIdx) => {
    e.preventDefault()
    e.stopPropagation()
    const branch = branches[branchIdx]
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + containerRef.current.scrollLeft
    const y = e.clientY - rect.top + containerRef.current.scrollTop

    setContextMenu({
      x, y,
      items: [
        { icon: '⭐', label: 'Promote to Main', action: () => promoteBranch(branchIdx), disabled: branch.isMain },
        { divider: true },
        { icon: '🗑', label: 'Delete Branch', action: () => deleteBranch(branchIdx), danger: true, disabled: branches.length <= 1 },
      ],
    })
  }

  // Close context on scroll/click
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const container = containerRef.current
    container?.addEventListener('scroll', close)
    return () => container?.removeEventListener('scroll', close)
  }, [contextMenu])

  // ── Render helpers ──
  const renderNodes = (nodes, shots, branchIdx, color) => {
    const isActiveBranch = activeBranch === branchIdx
    return nodes.map((pos, sIdx) => {
      const shot = shots[sIdx]
      const isActive = isActiveBranch && sIdx === activeShot
      const dragging = isDragging(branchIdx, sIdx)
      const dragOff = getDragOffset(branchIdx, sIdx)

      return (
        <div
          key={`node-${branchIdx}-${sIdx}`}
          className={`flow-graph-node ${isActive ? 'active' : ''} ${!isActiveBranch ? 'dimmed' : ''} ${dragging ? 'dragging' : ''}`}
          style={{
            left: pos.x + (dragging ? dragOff : 0),
            top: pos.y,
            width: NODE_W,
            height: NODE_H,
            borderColor: isActive ? color : undefined,
            boxShadow: isActive ? `0 0 12px ${color}33` : undefined,
            zIndex: dragging ? 100 : 1,
          }}
          onClick={() => { setActiveBranch(branchIdx); setActiveShot(sIdx) }}
          onDoubleClick={() => { setActiveBranch(branchIdx); setActiveShot(sIdx); setView('card') }}
          onContextMenu={(e) => handleNodeContext(e, branchIdx, sIdx)}
          onMouseDown={(e) => { if (e.button === 0) handleDragStart(e, branchIdx, sIdx) }}
        >
          {shot.image ? (
            <img src={shot.image} alt="" className="flow-graph-node-img" />
          ) : (
            <div className="flow-graph-node-empty">
              <span className="flow-graph-node-idx">{sIdx + 1}</span>
            </div>
          )}
          <div className="flow-graph-node-label">{shot.label.split(' — ')[1] || shot.label}</div>
        </div>
      )
    })
  }

  const renderInsertBtns = (nodes, branchIdx) => {
    return nodes.map((pos, sIdx) => {
      if (sIdx === 0) return null
      const prev = nodes[sIdx - 1]
      const cx = prev.x + NODE_W + (pos.x - prev.x - NODE_W) / 2
      return (
        <button
          key={`ins-${branchIdx}-${sIdx}`}
          className="flow-graph-insert-btn"
          style={{ left: cx - 9, top: pos.y + NODE_H / 2 - 9 }}
          onClick={() => setInsertGap({ branchIdx, afterShotIdx: sIdx - 1 })}
          title="Insert shot"
        >+</button>
      )
    })
  }

  // Edge click zones (invisible wider hitboxes for right-click)
  const renderEdgeHitZones = (nodes, branchIdx) => {
    return nodes.map((pos, sIdx) => {
      if (sIdx === 0) return null
      const prev = nodes[sIdx - 1]
      return (
        <div
          key={`edge-hit-${branchIdx}-${sIdx}`}
          className="flow-graph-edge-hit"
          style={{
            left: prev.x + NODE_W,
            top: pos.y + NODE_H / 2 - 8,
            width: pos.x - prev.x - NODE_W,
            height: 16,
          }}
          onContextMenu={(e) => handleEdgeContext(e, branchIdx, sIdx - 1)}
        />
      )
    })
  }

  return (
    <div className="flow-graph" ref={containerRef} onClick={() => setContextMenu(null)}>
      <svg width={maxX} height={maxY} className="flow-graph-svg">
        {/* Main edges */}
        {mainNodes.map((pos, i) => {
          if (i === 0) return null
          const prev = mainNodes[i - 1]
          return (
            <line
              key={`main-e-${i}`}
              x1={prev.x + NODE_W} y1={prev.y + NODE_H / 2}
              x2={pos.x} y2={pos.y + NODE_H / 2}
              stroke={BRANCH_COLORS[0]}
              strokeWidth={2}
              strokeOpacity={activeBranch === mainIdx ? 0.7 : 0.25}
            />
          )
        })}

        {/* Alt fork curves + edges */}
        {altLayouts.map((alt, aIdx) => {
          const color = BRANCH_COLORS[(aIdx + 1) % BRANCH_COLORS.length]
          const isActive = activeBranch === alt.branchIdx
          const forkFrom = mainNodes[alt.bp]
          const forkTarget = alt.nodes[0]

          return (
            <g key={`alt-svg-${aIdx}`}>
              {forkFrom && forkTarget && (
                <path
                  d={`M ${forkFrom.x + NODE_W / 2} ${forkFrom.y + NODE_H}
                      C ${forkFrom.x + NODE_W / 2} ${(forkFrom.y + NODE_H + forkTarget.y) / 2},
                        ${forkTarget.x + NODE_W / 2} ${(forkFrom.y + NODE_H + forkTarget.y) / 2},
                        ${forkTarget.x + NODE_W / 2} ${forkTarget.y}`}
                  fill="none"
                  stroke={color}
                  strokeWidth={2}
                  strokeOpacity={isActive ? 0.7 : 0.25}
                  strokeDasharray={isActive ? 'none' : '4 3'}
                />
              )}
              {alt.nodes.map((pos, i) => {
                if (i === 0) return null
                const prev = alt.nodes[i - 1]
                return (
                  <line
                    key={`alt-e-${aIdx}-${i}`}
                    x1={prev.x + NODE_W} y1={prev.y + NODE_H / 2}
                    x2={pos.x} y2={pos.y + NODE_H / 2}
                    stroke={color}
                    strokeWidth={2}
                    strokeOpacity={isActive ? 0.7 : 0.25}
                  />
                )
              })}
            </g>
          )
        })}
      </svg>

      {/* Main branch label */}
      <div
        className="flow-graph-label"
        style={{ left: PAD, top: PAD - 2, color: BRANCH_COLORS[0] }}
        onContextMenu={(e) => handleBranchContext(e, mainIdx)}
      >
        <span className="flow-graph-badge" style={{ background: BRANCH_COLORS[0] }}>M</span>
        {mainBranch.label}
      </div>

      {/* Main nodes + inserts + edge zones */}
      {renderNodes(mainNodes, mainBranch.shots, mainIdx, BRANCH_COLORS[0])}
      {renderInsertBtns(mainNodes, mainIdx)}
      {renderEdgeHitZones(mainNodes, mainIdx)}

      {/* Alt branches */}
      {altLayouts.map((alt, aIdx) => {
        const color = BRANCH_COLORS[(aIdx + 1) % BRANCH_COLORS.length]
        return (
          <div key={`alt-ui-${aIdx}`}>
            <div
              className={`flow-graph-label ${activeBranch === alt.branchIdx ? 'active' : ''}`}
              style={{ left: alt.offsetX, top: alt.rowY, color }}
              onClick={() => setActiveBranch(alt.branchIdx)}
              onContextMenu={(e) => handleBranchContext(e, alt.branchIdx)}
            >
              <span className="flow-graph-badge" style={{ background: color }}>
                {String.fromCharCode(65 + aIdx)}
              </span>
              {alt.branch.label}
            </div>

            {renderNodes(alt.nodes, alt.branch.shots, alt.branchIdx, color)}
            {renderInsertBtns(alt.nodes, alt.branchIdx)}
            {renderEdgeHitZones(alt.nodes, alt.branchIdx)}

            {alt.branch.rationale && (
              <div
                className="flow-graph-rationale"
                style={{
                  left: alt.offsetX,
                  top: (alt.nodes[alt.nodes.length - 1]?.y || alt.rowY) + NODE_H + 4,
                  maxWidth: alt.nodes.length * cellW,
                }}
              >
                {alt.branch.rationale}
              </div>
            )}
          </div>
        )
      })}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}

// ── Card View ──────────────────────────────────────────────
export function CardView() {
  const scene = useStore((s) => s.scenes[s.activeScene])
  const branches = scene?.branches || []
  const activeBranch = scene?.activeBranch ?? 0
  const activeShot = scene?.activeShot ?? 0
  const setActiveShot = useStore((s) => s.setFlowActiveShot)
  const setActiveBranch = useStore((s) => s.setFlowActiveBranch)
  const setInsertGap = useStore((s) => s.setFlowInsertGap)
  const removeShot = useStore((s) => s.flowRemoveShot)

  const branch = branches[activeBranch]
  if (!branch) return null
  const shots = branch.shots
  const current = shots[activeShot] || shots[0]
  const prev = activeShot > 0 ? shots[activeShot - 1] : null
  const next = activeShot < shots.length - 1 ? shots[activeShot + 1] : null

  const goPrev = useCallback(() => {
    if (activeShot > 0) setActiveShot(activeShot - 1)
  }, [activeShot, setActiveShot])

  const goNext = useCallback(() => {
    if (activeShot < shots.length - 1) setActiveShot(activeShot + 1)
  }, [activeShot, shots.length, setActiveShot])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (shots.length > 1) removeShot(activeBranch, activeShot)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goPrev, goNext, removeShot, activeBranch, activeShot, shots.length])

  return (
    <div className="flow-card">
      {/* Branch selector */}
      <div className="flow-card-branch-bar">
        {branches.map((b, i) => (
          <button
            key={b.id}
            className={`flow-card-branch-btn ${i === activeBranch ? 'active' : ''}`}
            onClick={() => { setActiveBranch(i); setActiveShot(0) }}
          >
            {b.isMain ? 'Main' : b.label}
          </button>
        ))}
      </div>

      {/* Carousel */}
      <div className="flow-card-carousel">
        <div className={`flow-card-side ${prev ? '' : 'empty'}`} onClick={goPrev}>
          {prev && (
            <div className="flow-card-side-frame">
              {prev.image ? <img src={prev.image} alt="" /> : (
                <div className="flow-card-side-empty">{activeShot}</div>
              )}
            </div>
          )}
        </div>

        <button
          className="flow-card-insert-btn"
          onClick={() => setInsertGap({ branchIdx: activeBranch, afterShotIdx: activeShot - 1 })}
        >+</button>

        <div className="flow-card-center">
          <div className="flow-card-frame">
            {current.image ? (
              <img src={current.image} alt="" />
            ) : (
              <div className="flow-card-placeholder">
                <span className="flow-card-placeholder-num">{activeShot + 1}</span>
              </div>
            )}
            {current.isAIGenerated && <span className="flow-card-ai-badge">AI</span>}
          </div>

          <div className="flow-card-info">
            <div className="flow-card-label">{current.label}</div>
            <div className="flow-card-cir-chips">
              {current.cir?.shotSize && <span className="flow-chip">{current.cir.shotSize}</span>}
              {current.cir?.horizontalAngle && <span className="flow-chip">{current.cir.horizontalAngle}</span>}
              {current.cir?.verticalLevel && <span className="flow-chip">{current.cir.verticalLevel}</span>}
              {current.cir?.subjectConfig && <span className="flow-chip">{current.cir.subjectConfig}</span>}
              {current.cir?.viewpointFraming && current.cir.viewpointFraming !== 'Objective' && (
                <span className="flow-chip accent">{current.cir.viewpointFraming}</span>
              )}
            </div>
            <div className="flow-card-beat">Beat {current.scriptBeat}</div>
          </div>

          {/* Delete button */}
          {shots.length > 1 && (
            <button
              className="flow-card-delete"
              onClick={() => {
                removeShot(activeBranch, activeShot)
                if (activeShot >= shots.length - 1) setActiveShot(Math.max(0, activeShot - 1))
              }}
              title="Delete shot (Del)"
            >Delete Shot</button>
          )}
        </div>

        <button
          className="flow-card-insert-btn"
          onClick={() => setInsertGap({ branchIdx: activeBranch, afterShotIdx: activeShot })}
        >+</button>

        <div className={`flow-card-side ${next ? '' : 'empty'}`} onClick={goNext}>
          {next && (
            <div className="flow-card-side-frame">
              {next.image ? <img src={next.image} alt="" /> : (
                <div className="flow-card-side-empty">{activeShot + 2}</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flow-card-counter">
        {activeShot + 1} / {shots.length}
      </div>
    </div>
  )
}

// ── Fill Shot Picker ───────────────────────────────────────
export function FillShotPicker() {
  const insertGap = useStore((s) => s.flowInsertGap)
  const setInsertGap = useStore((s) => s.setFlowInsertGap)
  const insertShot = useStore((s) => s.flowInsertShot)
  const suggestions = useStore((s) => s.flowFillSuggestions)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(new Set())

  if (!insertGap) return null

  const categories = ['all', 'insert', 'reaction', 'detail', 'cutaway', 'pov']
  const filtered = filter === 'all' ? suggestions : suggestions.filter((s) => s.category === filter)

  const handleToggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleAdd = () => {
    const toAdd = suggestions.filter((s) => selected.has(s.id))
    toAdd.reverse().forEach((s) => {
      insertShot(insertGap.branchIdx, insertGap.afterShotIdx, s)
    })
    setSelected(new Set())
  }

  const handleClose = () => {
    setInsertGap(null)
    setSelected(new Set())
  }

  return (
    <div className="flow-picker-overlay" onClick={handleClose}>
      <div className="flow-picker" onClick={(e) => e.stopPropagation()}>
        <div className="flow-picker-header">
          <h3>Add Shot</h3>
          <button className="flow-picker-close" onClick={handleClose}>&times;</button>
        </div>

        <div className="flow-picker-filters">
          {categories.map((cat) => (
            <button
              key={cat}
              className={`flow-picker-filter ${filter === cat ? 'active' : ''}`}
              onClick={() => setFilter(cat)}
            >
              {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        <div className="flow-picker-grid">
          {filtered.map((sug) => (
            <div
              key={sug.id}
              className={`flow-picker-card ${selected.has(sug.id) ? 'selected' : ''}`}
              onClick={() => handleToggle(sug.id)}
            >
              <div className="flow-picker-card-thumb">
                {sug.image ? (
                  <img src={sug.image} alt="" />
                ) : (
                  <div className="flow-picker-card-placeholder">
                    <span className="flow-picker-card-category">{sug.category}</span>
                  </div>
                )}
                {selected.has(sug.id) && <div className="flow-picker-check">&#10003;</div>}
              </div>
              <div className="flow-picker-card-label">{sug.label}</div>
              <div className="flow-picker-card-rationale">{sug.rationale}</div>
            </div>
          ))}
        </div>

        <div className="flow-picker-actions">
          <button className="flow-picker-add" onClick={handleAdd} disabled={selected.size === 0}>
            + Add Selected ({selected.size})
          </button>
          <button className="flow-picker-cancel" onClick={handleClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Main FlowTab ───────────────────────────────────────────
export default function FlowTab() {
  const flowView = useStore((s) => s.flowView)
  const setFlowView = useStore((s) => s.setFlowView)
  const scene = useStore((s) => s.scenes[s.activeScene])
  const branches = scene?.branches || []

  if (!branches || branches.length === 0) {
    return (
      <div className="flow-tab scrollable">
        <div className="analysis-waiting">
          <div className="status-icon">&#x1F3AC;</div>
          <div className="status-text">
            Add shots to the storyboard to start building your scene flow
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flow-tab scrollable">
      <div className="flow-panel-header">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" opacity="0.6">
          <circle cx="3" cy="8" r="2" fill="none" stroke="currentColor" />
          <circle cx="8" cy="4" r="1.5" fill="none" stroke="currentColor" />
          <circle cx="8" cy="12" r="1.5" fill="none" stroke="currentColor" />
          <circle cx="13" cy="8" r="1.5" fill="none" stroke="currentColor" />
          <line x1="5" y1="7" x2="6.5" y2="4.5" stroke="currentColor" />
          <line x1="5" y1="9" x2="6.5" y2="11.5" stroke="currentColor" />
          <line x1="9.5" y1="5" x2="11.5" y2="7.5" stroke="currentColor" />
          <line x1="9.5" y1="11" x2="11.5" y2="8.5" stroke="currentColor" />
        </svg>
        <h2>Scene Flow</h2>

        <div className="flow-view-toggle">
          <button
            className={`flow-view-btn ${flowView === 'graph' ? 'active' : ''}`}
            onClick={() => setFlowView('graph')}
            title="Graph view"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="1" y="1" width="3" height="3" rx="0.5" />
              <rect x="6" y="1" width="3" height="3" rx="0.5" />
              <rect x="11" y="1" width="2" height="3" rx="0.5" />
              <rect x="1" y="6" width="3" height="3" rx="0.5" />
              <rect x="6" y="6" width="3" height="3" rx="0.5" />
              <line x1="4" y1="2.5" x2="6" y2="2.5" stroke="currentColor" strokeWidth="0.8" />
              <line x1="9" y1="2.5" x2="11" y2="2.5" stroke="currentColor" strokeWidth="0.8" />
              <line x1="4" y1="7.5" x2="6" y2="7.5" stroke="currentColor" strokeWidth="0.8" />
            </svg>
          </button>
          <button
            className={`flow-view-btn ${flowView === 'card' ? 'active' : ''}`}
            onClick={() => setFlowView('card')}
            title="Card view"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="0.5" y="3" width="3" height="8" rx="1" opacity="0.3" />
              <rect x="4.5" y="1" width="5" height="12" rx="1" />
              <rect x="10.5" y="3" width="3" height="8" rx="1" opacity="0.3" />
            </svg>
          </button>
        </div>
      </div>

      {flowView === 'graph' ? <GraphView /> : <CardView />}
      <FillShotPicker />
    </div>
  )
}
