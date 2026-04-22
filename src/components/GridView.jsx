import { useState } from 'react'
import useStore from '../store/useStore'
import { GapGhostCell } from './GapFillPanel'
import './GridView.css'

const TECHNIQUE_LABEL = {
  match_cut: '매치컷',
  j_cut: 'J컷',
  l_cut: 'L컷',
  eyeline: '시선',
  rhythm: '리듬',
  temporal_ellipsis: '시간생략',
  line_crossing: '선넘기',
}

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
  const openGapFill = useStore((s) => s.openGapFill)
  const openAutoFill = useStore((s) => s.openAutoFill)
  const gapFills = useStore((s) => s.gapFills)
  const autoFill = useStore((s) => s.autoFill)

  // Build shotId → preview insertions map (when a version is being previewed)
  const previewInsertionsByShotId = {}
  // Editorial techniques keyed by "after_shot_id" of the preceding insertion (where to show the relation)
  const techniquesByInsertionIdx = {}  // key = `${after_shot_id}-${k}` (k = which insertion under that shot)
  if (autoFill?.status === 'ready' && autoFill.branchIdx === (scene?.activeBranch ?? 0)) {
    const version = autoFill.versions?.[autoFill.previewVersion ?? 0]
    if (version?.insertions) {
      for (const ins of version.insertions) {
        const key = ins.after_shot_id
        if (!previewInsertionsByShotId[key]) previewInsertionsByShotId[key] = []
        previewInsertionsByShotId[key].push(ins)
      }
    }
    // Map editorial techniques onto the cuts they describe
    // shot_pair uses position labels like "S3" — resolve against range shots
    if (version?.editorial_techniques) {
      const rangeBranch = branches[autoFill.branchIdx]
      const rangeShots = rangeBranch?.shots.slice(autoFill.fromIdx, autoFill.toIdx + 1) || []
      for (const t of version.editorial_techniques) {
        if (!t.shot_pair || t.shot_pair.length < 2) continue
        // Convert "S3" → range-relative index (S1 = fromIdx)
        const posA = parseInt(String(t.shot_pair[0]).replace(/\D/g, ''), 10) - 1
        const posB = parseInt(String(t.shot_pair[1]).replace(/\D/g, ''), 10) - 1
        if (isNaN(posA) || isNaN(posB)) continue
        // Use the EARLIER shot in the pair as the anchor — the technique shows "between" that shot and what follows
        const anchorPos = Math.min(posA, posB)
        const anchorShot = rangeShots[anchorPos]
        if (!anchorShot) continue
        const anchorKey = anchorShot.id
        if (!techniquesByInsertionIdx[anchorKey]) techniquesByInsertionIdx[anchorKey] = []
        techniquesByInsertionIdx[anchorKey].push(t)
      }
    }
  }

  const [hoveredIdx, setHoveredIdx] = useState(null)
  const [rangeMode, setRangeMode] = useState(false)   // true = waiting for second tap
  const [rangeAnchor, setRangeAnchor] = useState(null) // first tap index

  const branch = branches[activeBranch]
  if (!branch) return null
  const shots = branch.shots

  const rangeFrom = rangeAnchor !== null && activeShot !== null ? Math.min(rangeAnchor, activeShot) : null
  const rangeTo   = rangeAnchor !== null && activeShot !== null ? Math.max(rangeAnchor, activeShot) : null
  const hasRange  = rangeFrom !== null && rangeTo !== null && rangeTo > rangeFrom

  const startRangeMode = () => {
    setRangeMode(true)
    setRangeAnchor(activeShot)
  }

  const cancelRange = () => {
    setRangeMode(false)
    setRangeAnchor(null)
  }

  const handleCellClick = (i) => {
    if (rangeMode) {
      // Second tap — set end point (anchor stays as start)
      setActiveShot(i)
      setRangeMode(false) // done selecting, keep anchor to show range
    } else if (rangeAnchor !== null) {
      // Range already shown, normal click clears it
      setRangeAnchor(null)
      setActiveShot(i)
    } else {
      setActiveShot(i)
    }
  }

  const handleAdd = () => {
    insertShot(activeBranch, shots.length - 1, {
      label: `Shot ${shots.length + 1}`,
      scriptBeat: 0,
    })
  }

  const handleAutoFill = () => {
    if (!hasRange) return
    openAutoFill(activeBranch, rangeFrom, rangeTo)
    setRangeAnchor(null)
  }

  return (
    <div className="grid-view">
      {/* Branch bar + auto-fill toolbar */}
      <div className="grid-view-topbar">
        <div className="grid-view-branch-bar">
          {branches.map((b, i) => (
            <button
              key={b.id}
              className={`grid-view-branch-btn ${i === activeBranch ? 'active' : ''}`}
              onClick={() => { setActiveBranch(i); setActiveShot(0); setRangeAnchor(null) }}
            >
              {b.isMain ? '★ ' : ''}{b.label}
              <span className="grid-view-branch-count">{b.shots.length}</span>
            </button>
          ))}
        </div>

        {rangeMode ? (
          <div className="grid-view-range-toolbar">
            <span className="grid-view-range-label">
              S{rangeAnchor + 1} 선택됨 — 끝 샷을 탭하세요
            </span>
            <button className="grid-view-range-clear" onClick={cancelRange}>✕</button>
          </div>
        ) : hasRange ? (
          <div className="grid-view-range-toolbar">
            <span className="grid-view-range-label">
              S{rangeFrom + 1} – S{rangeTo + 1} 선택됨
            </span>
            <button className="grid-view-autofill-btn" onClick={handleAutoFill}>
              ✦ Auto-fill Range
            </button>
            <button className="grid-view-range-clear" onClick={cancelRange}>✕</button>
          </div>
        ) : (
          <button className="grid-view-autofill-start-btn" onClick={startRangeMode}>
            ✦ Auto-fill Range
          </button>
        )}
      </div>

      <div
        className="grid-view-grid"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {shots.flatMap((shot, i) => {
          const isActive = i === activeShot
          const isHovered = hoveredIdx === i
          const inRange = rangeFrom !== null && i >= rangeFrom && i <= rangeTo
          const isAnchor = i === rangeAnchor

          const gapKey = `${activeBranch}-${i}`
          const shotEl = (
            <div key={shot.id} className={`grid-cell-wrapper ${isActive ? 'selected' : ''}`}>
              {/* Gap fill button — left edge (gap before this cell) */}
              {i > 0 && (
                <button
                  className="grid-gap-btn before"
                  onClick={(e) => { e.stopPropagation(); openGapFill(activeBranch, i - 1) }}
                  title="이 gap에 fill shot 추가"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
              )}

              <div
                className={`grid-cell ${isActive ? 'active' : ''} ${inRange ? 'in-range' : ''} ${isAnchor ? 'range-anchor' : ''}`}
                onClick={() => handleCellClick(i)}
                onDoubleClick={() => { setActiveShot(i); setFlowView('card') }}
                onMouseEnter={() => setHoveredIdx(i)}
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
                      onClick={(e) => { e.stopPropagation(); removeShot(activeBranch, i) }}
                      title="Delete shot"
                    >×</button>
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

              {/* Gap fill button — right edge (gap after this cell) */}
              {i < shots.length - 1 && (
                <button
                  className="grid-gap-btn after"
                  onClick={(e) => { e.stopPropagation(); openGapFill(activeBranch, i) }}
                  title="이 gap에 fill shot 추가"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                </button>
              )}
            </div>
          )
          const ghostEl = gapFills[gapKey]
            ? <GapGhostCell key={`ghost-${gapKey}`} gapKey={gapKey} />
            : null

          // AutoFill preview ghost cells — inserted after this shot
          const previewInsertions = previewInsertionsByShotId[shot.id] || []
          const relatedTechniques = techniquesByInsertionIdx[shot.id] || []
          const previewEls = previewInsertions.map((ins, k) => (
            <div key={`preview-${shot.id}-${k}`} className="grid-cell-wrapper autofill-preview-wrapper">
              {/* Relational technique badge on left edge — indicates cut between prev shot and this preview */}
              {k === 0 && relatedTechniques.length > 0 && (
                <div className="autofill-relation-marker" title={relatedTechniques.map(t => `${TECHNIQUE_LABEL[t.type] || t.type}: ${t.mechanism}`).join('\n\n')}>
                  {relatedTechniques.map((t, ti) => (
                    <span key={ti} className={`autofill-relation-chip tech-${t.type}`}>
                      {TECHNIQUE_LABEL[t.type] || t.type}
                    </span>
                  ))}
                </div>
              )}
              <div className="grid-cell autofill-preview-cell">
                <div className="grid-cell-frame autofill-preview-frame">
                  {ins.candidate.image ? (
                    <img src={`data:image/png;base64,${ins.candidate.image}`} alt={ins.candidate.label} />
                  ) : (
                    <div className="autofill-preview-empty">
                      <span className="autofill-preview-cat">{ins.candidate.category}</span>
                    </div>
                  )}
                  <span className="autofill-preview-badge">✦ 미리보기</span>
                </div>
                <div className="grid-cell-meta">
                  <span className="grid-cell-idx autofill-preview-idx">NEW</span>
                  <span className="grid-cell-label">{ins.candidate.label}</span>
                </div>
                {ins.candidate.cir && (
                  <div className="grid-cell-chips">
                    {ins.candidate.cir.shotSize && <span className="grid-chip">{ins.candidate.cir.shotSize}</span>}
                    {ins.candidate.cir.motionHint && <span className="grid-chip">{ins.candidate.cir.motionHint}</span>}
                  </div>
                )}
              </div>
            </div>
          ))

          const result = [shotEl]
          if (ghostEl) result.push(ghostEl)
          result.push(...previewEls)
          return result
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
