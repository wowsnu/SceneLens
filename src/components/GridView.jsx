import { useState } from 'react'
import useStore from '../store/useStore'
import './GridView.css'

export default function GridView() {
  const scene = useStore((s) => s.scenes[s.activeScene])
  const branches = scene?.branches || []
  const activeBranch = scene?.activeBranch ?? 0
  const activeShot = scene?.activeShot ?? 0
  const setActiveBranch = useStore((s) => s.setFlowActiveBranch)
  const setActiveShot = useStore((s) => s.setFlowActiveShot)
  const setFlowView = useStore((s) => s.setFlowView)
  const insertShot = useStore((s) => s.flowInsertShot)
  const removeShot = useStore((s) => s.flowRemoveShot)

  const [hoveredIdx, setHoveredIdx] = useState(null)

  const branch = branches[activeBranch]
  if (!branch) return null
  const shots = branch.shots

  const handleAdd = () => {
    insertShot(activeBranch, shots.length - 1, {
      label: `Shot ${shots.length + 1}`,
      scriptBeat: 0,
    })
  }

  return (
    <div className="grid-view">
      <div className="grid-view-branch-bar">
        {branches.map((b, i) => (
          <button
            key={b.id}
            className={`grid-view-branch-btn ${i === activeBranch ? 'active' : ''}`}
            onClick={() => { setActiveBranch(i); setActiveShot(0) }}
          >
            {b.isMain ? '★ ' : ''}{b.label}
            <span className="grid-view-branch-count">{b.shots.length}</span>
          </button>
        ))}
      </div>

      <div className="grid-view-grid">
        {shots.map((shot, i) => {
          const isActive = i === activeShot
          const isHovered = hoveredIdx === i

          return (
            <div
              key={shot.id}
              className={`grid-cell ${isActive ? 'active' : ''}`}
              onClick={() => setActiveShot(i)}
              onDoubleClick={() => { setActiveShot(i); setFlowView('card') }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div className="grid-cell-frame">
                {shot.image ? (
                  <img src={shot.image} alt={shot.label} />
                ) : (
                  <div className="grid-cell-empty">
                    <span className="grid-cell-num">{i + 1}</span>
                  </div>
                )}
                {shot.isAIGenerated && <span className="grid-cell-ai-badge">AI</span>}

                {isHovered && shots.length > 1 && (
                  <button
                    className="grid-cell-delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeShot(activeBranch, i)
                    }}
                    title="Delete shot"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="grid-cell-meta">
                <span className="grid-cell-idx">S{i + 1}</span>
                <span className="grid-cell-label">{shot.label}</span>
              </div>
              {shot.cir && (
                <div className="grid-cell-chips">
                  {shot.cir.shotSize && <span className="grid-chip">{shot.cir.shotSize}</span>}
                  {shot.cir.relation && <span className="grid-chip">{shot.cir.relation}</span>}
                </div>
              )}
            </div>
          )
        })}

        <button className="grid-cell grid-cell-add" onClick={handleAdd} title="Add shot">
          <div className="grid-cell-frame grid-cell-add-frame">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div className="grid-cell-meta">
            <span className="grid-cell-idx">Add shot</span>
          </div>
        </button>
      </div>
    </div>
  )
}
