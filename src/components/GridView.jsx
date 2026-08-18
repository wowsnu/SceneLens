import { useState } from 'react'
import useStore, {
  SEAM_JOINS,
  SEAM_ELAPSED,
  seamKeyFor,
  isSeamMarked,
} from '../store/useStore'
import { GapGhostCell } from './GapFillPanel'
import './GridView.css'
import { logScaffold } from '../store/studyLog'

const TECHNIQUE_LABEL = {
  match_cut: '매치컷',
  j_cut: 'J컷',
  l_cut: 'L컷',
  eyeline: '시선',
  rhythm: '리듬',
  temporal_ellipsis: '시간생략',
  line_crossing: '선넘기',
}

export default function GridView({
  shotPreview = null,
  compact = false,
  onOpenShot = null,
  decisionScope = null,
  sequencePreview = null,
  draftImages = {},
}) {
  const scene = useStore((s) => s.scenes[s.activeScene])
  const branches = scene?.branches || []
  const activeBranch = scene?.activeBranch ?? 0
  const activeShot = scene?.activeShot ?? 0
  const activeBeat = useStore((s) => s.activeBeat)
  const setActiveBranch = useStore((s) => s.setFlowActiveBranch)
  const setActiveShot = useStore((s) => s.setFlowActiveShot)
  const setFlowView = useStore((s) => s.setFlowView)
  const insertShot = useStore((s) => s.flowInsertShot)
  const removeShot = useStore((s) => s.flowRemoveShot)
  const deleteCut = useStore((s) => s.deleteCut)
  const openGapFill = useStore((s) => s.openGapFill)
  const openAutoFill = useStore((s) => s.openAutoFill)
  const gapFills = useStore((s) => s.gapFills)
  const seams = useStore((s) => s.seams)
  const screenplay = useStore((s) => s.screenplay)
  const updateSeam = useStore((s) => s.updateSeam)
  const clearSeam = useStore((s) => s.clearSeam)
  const cutPlan = useStore((s) => s.cutPlan)
  const mergeCuts = useStore((s) => s.mergeCuts)
  const splitCut = useStore((s) => s.splitCut)
  const addCutPlanItem = useStore((s) => s.addCutPlanItem)
  const swapCutsAtSeam = useStore((s) => s.swapCutsAtSeam)
  const completeEditingOperation = useStore((s) => s.completeEditingOperation)
  const autoFill = useStore((s) => s.autoFill)
  const panelGenerationPending = useStore((s) => s.panelGenerationPending)

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
  // 열려 있는 이음새 편집기. 한 번에 하나만 연다.
  const [openSeamId, setOpenSeamId] = useState(null)
  // 진단에서 '이음새 열기'를 누르면 그 자리가 펼쳐져야 한다.
  // 렌더 중에 맞춘다 — effect로 하면 한 번 더 그려진다.
  // 실행 전에 무엇이 바뀌고 무엇이 사라지는지 보여준다 (DG2 P3).
  // 눌러서 바로 실행하면 사용자는 결과만 받게 된다.
  const [pendingEdit, setPendingEdit] = useState(null)
  // 합쳐질 내용. AI가 이어붙인 것을 기본값으로 두되 고칠 수 있게 한다.
  const [mergeDraft, setMergeDraft] = useState('')
  // 넣을 컷의 후보. 빈 컷을 만들어 두면 대개 비어 있는 채로 남는다 —
  // 무엇을 넣어야 하는지는 앞뒤 컷에 이미 드러나 있다.
  const [insertCandidates, setInsertCandidates] = useState([])
  const [insertChoice, setInsertChoice] = useState(null)
  const [insertPending, setInsertPending] = useState(false)
  const [insertError, setInsertError] = useState(null)
  // 나눈 안. 감독이 직접 나눌 때는 비워 둔다 — 어디서 끊을지는 연출 판단이다.
  // 편집 렌즈가 "두 사건이 겹쳤다"고 진단한 경우에만 채운다.
  const [splitDraft, setSplitDraft] = useState(null)
  const [splitPending, setSplitPending] = useState(false)
  const [splitError, setSplitError] = useState(null)

  // 미리보기를 열 때 초안을 만든다. 두 컷 사이에 생략해 둔 것이 있으면
  // 그것도 넣는다 — 합치면 그 일이 한 컷 안에서 일어나기 때문이다.
  const openMergePreview = (prevShot, shot, index, proposal = null) => {
    const cutIndex = cutPlan.findIndex((item) => item.id === prevShot.cutPlanItemId)
    if (cutIndex < 0 || cutIndex >= cutPlan.length - 1) return
    const seam = seams[seamKeyFor(prevShot.id)]
    setMergeDraft([
      cutPlan[cutIndex].content,
      seam?.elision && `(${seam.elision})`,
      cutPlan[cutIndex + 1].content,
    ].filter(Boolean).join(' '))
    setPendingEdit({
      kind: 'merge',
      cutId: prevShot.cutPlanItemId,
      index,
      losesDrawing: Boolean(shot.image),
      proposal,
    })
  }
  // 진단에서 보낸 이음새 요청. 훅은 조건부 return보다 위에 있어야 한다.
  const seamFocusRequest = useStore((s) => s.seamFocusRequest)
  const [handledSeamFocus, setHandledSeamFocus] = useState(null)

  // 이음새의 '생략된 것'을 함께 넘긴다 — 감독이 직접 적어 둔 것이라
  // 무엇이 빠졌는지 가장 곧게 말해 준다.
  const prevShotOf = (edit) => (edit ? shots[edit.index - 1] : null)

  const requestInsertCandidates = async (cut, nextCut, prevShot) => {
    setInsertPending(true)
    setInsertError(null)
    try {
      const { suggestSeamInsert } = await import('../services/api')
      const seam = prevShot ? seams[seamKeyFor(prevShot.id)] : null
      const candidates = await suggestSeamInsert({
        beforeContent: cut?.content || '',
        beforePurpose: cut?.purpose || '',
        afterContent: nextCut?.content || '',
        afterPurpose: nextCut?.purpose || '',
        elision: seam?.elision || '',
        script: screenplay
          .filter((element) => element.type === 'action')
          .map((element) => element.text)
          .join('\n'),
      })
      setInsertCandidates(candidates)
    } catch (error) {
      setInsertError(error.message)
    } finally {
      setInsertPending(false)
    }
  }

  // 나눈 안을 받는다. 진단에서 온 경우에만 부른다 — 감독이 직접 나눌 때
  // AI가 끊는 자리를 정하면 그 판단을 대신 내리는 것이 된다.
  const requestSplitDraft = async (cut, prevCut, nextCut, diagnosis) => {
    if (!cut?.content?.trim()) return
    setSplitPending(true)
    setSplitError(null)
    try {
      const { suggestSeamSplit } = await import('../services/api')
      const draft = await suggestSeamSplit({
        content: cut.content,
        purpose: cut.purpose || '',
        characters: cut.characters || '',
        beforeContent: prevCut?.content || '',
        afterContent: nextCut?.content || '',
        script: screenplay
          .filter((element) => element.type === 'action')
          .map((element) => element.text)
          .join('\n'),
        diagnosis: diagnosis || '',
      })
      setSplitDraft(draft)
    } catch (error) {
      setSplitError(error.message)
    } finally {
      setSplitPending(false)
    }
  }

  const [rangeMode, setRangeMode] = useState(false)   // true = waiting for second tap
  const [rangeAnchor, setRangeAnchor] = useState(null) // first tap index

  const branch = branches[activeBranch]
  if (!branch) return null
  const shots = branch.shots

  // 진단에서 보낸 요청. 이음새를 열고, 나누기·합치기면 그 미리보기까지 연다.
  // 요청은 지우지 않는다 — 처리한 id를 기억하므로 다시 열리지 않는다.
  if (seamFocusRequest && handledSeamFocus !== seamFocusRequest.id) {
    setHandledSeamFocus(seamFocusRequest.id)
    setOpenSeamId(seamFocusRequest.shotId)
    const index = shots.findIndex((entry) => entry.id === seamFocusRequest.shotId)
    if (seamFocusRequest.action === 'merge' && index >= 0 && shots[index + 1]) {
      openMergePreview(shots[index], shots[index + 1], index + 1, seamFocusRequest.proposal)
    } else if (seamFocusRequest.action === 'split' && index >= 0) {
      const target = shots[index]
      if (target?.cutPlanItemId) {
        setSplitDraft(null)
        setSplitError(null)
        setPendingEdit({ kind: 'split', cutId: target.cutPlanItemId, index, proposal: seamFocusRequest.proposal })
        // 진단에서 왔으므로 나눈 안을 함께 받는다. 진단은 이미 무엇과 무엇이
        // 겹쳤는지 알고 있는데, 그것을 적어 주지 않으면 감독이 진단을 읽고
        // 같은 것을 처음부터 다시 찾아야 한다.
        const cutIndex = cutPlan.findIndex((item) => item.id === target.cutPlanItemId)
        requestSplitDraft(
          cutPlan[cutIndex],
          cutPlan[cutIndex - 1],
          cutPlan[cutIndex + 1],
          [seamFocusRequest.proposal?.title, seamFocusRequest.proposal?.detail]
            .filter(Boolean).join(' — '),
        )
      }
    } else if (seamFocusRequest.action === 'insert' && index >= 0) {
      const target = shots[index]
      if (target?.cutPlanItemId && shots[index + 1]) {
        setInsertCandidates([])
        setInsertChoice(null)
        setInsertError(null)
        setPendingEdit({
          kind: 'insert',
          cutId: target.cutPlanItemId,
          index: index + 1,
          proposal: seamFocusRequest.proposal,
        })
      }
    }
  }

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
      scriptBeat: shots[activeShot]?.scriptBeat ?? activeBeat,
    })
  }

  const handleAutoFill = () => {
    if (!hasRange) return
    openAutoFill(activeBranch, rangeFrom, rangeTo)
    setRangeAnchor(null)
  }

  return (
    <div className={`grid-view ${compact ? 'compact' : ''}`}>
      {/* Branch bar + auto-fill toolbar */}
      {!compact && <div className="grid-view-topbar">
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
      </div>}

      <div
        className="grid-view-grid"
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {shots.flatMap((shot, i) => {
          const isActive = i === activeShot
          const isHovered = hoveredIdx === i
          const inRange = rangeFrom !== null && i >= rangeFrom && i <= rangeTo
          const isAnchor = i === rangeAnchor
          const inDecisionRange = decisionScope?.mode === 'range'
            && decisionScope.shotIds?.includes(shot.id)
          const isDecisionRangeEdge = inDecisionRange
            && (i === decisionScope.from || i === decisionScope.to)
          const activeLensPreview = shotPreview?.shotId === shot.id ? shotPreview : null
          const hasDraftImage = Boolean(draftImages[shot.id]) && !activeLensPreview
          const generationLabel = panelGenerationPending[shot.id]
          const displayImage = activeLensPreview?.image ?? draftImages[shot.id] ?? shot.image
          const displayCir = activeLensPreview?.cir ?? shot.cir

          const gapKey = `${activeBranch}-${i}`
          const shotEl = (
            <div key={shot.id} className={`grid-cell-wrapper ${isActive ? 'selected' : ''}`}>
              {/* Gap fill button — left edge (gap before this cell) */}
              {!compact && i > 0 && (
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

              {/* 이음새 — 앞 컷과 이 컷 사이 (DG2 P1). 컷을 추가하는 것과
                  사이에 무엇이 있는지 기록하는 것은 다른 일이라 자리를 나눈다.
                  정해진 것이 없으면 hover에서만 나타나 그리드를 어지럽히지 않는다. */}
              {i > 0 && (() => {
                const prevShot = shots[i - 1]
                const seam = seams[seamKeyFor(prevShot.id)]
                const marked = isSeamMarked(seam)
                const open = openSeamId === prevShot.id
                return (
                  <div className={`grid-seam${marked ? ' marked' : ''}${open ? ' open' : ''}`}>
                    <button
                      type="button"
                      className="grid-seam-btn"
                      title={marked
                        ? `${SEAM_JOINS.find((j) => j.id === seam.join)?.label} · ${SEAM_ELAPSED.find((e) => e.id === seam.elapsed)?.label}`
                        : '이음새 — 사이에 무엇이 있는지 기록'}
                      aria-expanded={open}
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenSeamId(open ? null : prevShot.id)
                      }}
                    >
                      {marked ? (
                        <span className="grid-seam-mark">
                          {SEAM_JOINS.find((j) => j.id === seam.join)?.label}
                          {seam.elapsed !== 'continuous' && (
                            <em>{SEAM_ELAPSED.find((el) => el.id === seam.elapsed)?.label}</em>
                          )}
                        </span>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M8 5v14M16 5v14" />
                        </svg>
                      )}
                    </button>

                    {open && (
                      <div className="grid-seam-editor" onClick={(e) => e.stopPropagation()}>
                        <header>
                          <strong>S{i} → S{i + 1}</strong>
                          <button
                            type="button"
                            onClick={() => { clearSeam(prevShot.id); setOpenSeamId(null) }}
                          >
                            지우기
                          </button>
                        </header>

                        <label>연결 방식</label>
                        <div className="grid-seam-chips">
                          {SEAM_JOINS.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              className={(seam?.join || 'cut') === option.id ? 'active' : ''}
                              title={option.hint}
                              onClick={() => updateSeam(prevShot.id, { join: option.id })}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>

                        <label>흐른 시간</label>
                        <div className="grid-seam-chips">
                          {SEAM_ELAPSED.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              className={(seam?.elapsed || 'continuous') === option.id ? 'active' : ''}
                              title={option.hint}
                              onClick={() => updateSeam(prevShot.id, { elapsed: option.id })}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>

                        {/* 편집이 왜 이렇게 보는지. 판정하려면 근거가 필요하다. */}
                        {seam?.reason && (
                          <p className="grid-seam-reason">{seam.reason}</p>
                        )}

                        {/* 생략한 것을 적어두지 않으면 나중에 누락과 구분되지 않는다. */}
                        <label htmlFor={`elision-${prevShot.id}`}>생략된 것</label>
                        <input
                          id={`elision-${prevShot.id}`}
                          value={seam?.elision || ''}
                          placeholder="예: 하린이 실험대를 가로지르는 동안"
                          onChange={(e) => updateSeam(prevShot.id, { elision: e.target.value })}
                        />

                        {/* 이음새에서 할 수 있는 구조 개입 (DG2 P2).
                            넣기·합치기·순서 바꾸기가 모두 컷 사이의 일이므로
                            여기 모은다 — 컷 플랜 표로 되돌아갈 이유가 없다. */}
                        <div className="grid-seam-ops">
                          <button
                            type="button"
                            onClick={() => {
                              setInsertCandidates([])
                              setInsertChoice(null)
                              setInsertError(null)
                              setPendingEdit({
                                kind: 'insert',
                                cutId: prevShot.cutPlanItemId,
                                index: i,
                              })
                            }}
                          >
                            사이에 컷 넣기
                          </button>
                          <button
                            type="button"
                            onClick={() => openMergePreview(prevShot, shot, i)}
                          >
                            두 컷 합치기
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingEdit({
                              kind: 'swap',
                              cutId: prevShot.cutPlanItemId,
                              index: i,
                            })}
                          >
                            앞뒤 순서 바꾸기
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              <div
                className={`grid-cell ${isActive ? 'active' : ''} ${inRange ? 'in-range' : ''} ${isAnchor ? 'range-anchor' : ''} ${inDecisionRange ? 'decision-range' : ''} ${isDecisionRangeEdge ? 'decision-range-edge' : ''} ${activeLensPreview ? 'lens-preview' : ''}`}
                onClick={() => handleCellClick(i)}
                onDoubleClick={() => {
                  setActiveShot(i)
                  if (compact) {
                    onOpenShot?.(i)
                  } else {
                    setFlowView('card')
                  }
                }}
                onMouseEnter={() => setHoveredIdx(i)}
                title={compact ? '더블클릭하여 크게 보기' : undefined}
              >
                <div className="grid-cell-frame">
                  {displayImage ? (
                    <img src={displayImage} alt={shot.label} />
                  ) : (
                    <div className="grid-cell-empty">
                      <span className="grid-cell-num">{i + 1}</span>
                    </div>
                  )}
                  {activeLensPreview && (
                    <span className="grid-cell-lens-preview-badge">촬영 미리보기</span>
                  )}
                  {hasDraftImage && <span className="grid-cell-draft-badge">새 초안</span>}
                  {shot.isAIGenerated && <span className="grid-cell-ai-badge">AI</span>}
                  {generationLabel && (
                    <div className="grid-cell-generating" role="status" aria-live="polite">
                      <span className="grid-cell-generating-spinner" aria-hidden="true" />
                      <strong>{generationLabel}</strong>
                      <small>S{i + 1}에 새 초안이 만들어집니다</small>
                    </div>
                  )}

                  {isHovered && shots.length > 1 && (
                    <button
                      className="grid-cell-delete"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (shot.cutPlanItemId) deleteCut(shot.cutPlanItemId)
                        else removeShot(activeBranch, i)
                      }}
                      title="Delete shot"
                    >×</button>
                  )}

                  {/* 분할은 이음새가 아니라 컷 하나의 일이다. 이음새 편집기에
                      두면 어느 컷을 쪼갤지 모호해진다 (DG2 P1 분할). */}
                  {isHovered && shot.cutPlanItemId && (
                    <button
                      className="grid-cell-split"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPendingEdit({ kind: 'split', cutId: shot.cutPlanItemId, index: i })
                      }}
                      title="이 컷을 둘로 나눕니다"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M12 3v18M6 8 3 12l3 4M18 8l3 4-3 4" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="grid-cell-meta">
                  <span className="grid-cell-idx">S{i + 1}</span>
                  <span className="grid-cell-label">{shot.label}</span>
                </div>
                {displayCir && (
                  <div className="grid-cell-chips">
                    {displayCir.shotSize && <span className="grid-chip">{displayCir.shotSize}</span>}
                    {displayCir.relation && <span className="grid-chip">{displayCir.relation}</span>}
                  </div>
                )}
              </div>

              {/* Gap fill button — right edge (gap after this cell) */}
              {!compact && i < shots.length - 1 && (
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
          const editingInsertPreviewEl = sequencePreview?.type === 'insert'
            && sequencePreview.afterShotId === shot.id
            ? (
                <div
                  key={`editing-preview-${sequencePreview.operationId}`}
                  className="grid-cell-wrapper editing-insert-preview-wrapper"
                >
                  <div className="grid-cell editing-insert-preview-cell">
                    <div className="grid-cell-frame editing-insert-preview-frame">
                      <span className="editing-insert-preview-badge">편집 미리보기</span>
                      <span className="editing-insert-preview-plus" aria-hidden="true">＋</span>
                      <strong>임시 Shot</strong>
                      <p>{sequencePreview.title}</p>
                    </div>
                    <div className="grid-cell-meta">
                      <span className="grid-cell-idx editing-insert-preview-idx">NEW</span>
                      <span className="grid-cell-label">{sequencePreview.title}</span>
                    </div>
                  </div>
                </div>
              )
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
          if (editingInsertPreviewEl) result.push(editingInsertPreviewEl)
          if (ghostEl) result.push(ghostEl)
          result.push(...previewEls)
          return result
        })}

        {!compact && <button className="grid-cell grid-cell-add" onClick={handleAdd} title="Add shot">
          <div className="grid-cell-frame grid-cell-add-frame">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div className="grid-cell-meta">
            <span className="grid-cell-idx">Add shot</span>
          </div>
        </button>}
      </div>

      {/* 실행 전 영향 미리보기 (DG2 P3). 무엇이 바뀌고 무엇이 사라지는지
          먼저 보이고, 합쳐질 내용은 그 자리에서 고칠 수 있게 한다 —
          AI가 이어붙인 문장을 그대로 받게 하지 않는다. */}
      {pendingEdit && (() => {
        const cut = cutPlan.find((item) => item.id === pendingEdit.cutId)
        if (!cut) return null
        const cutIndex = cutPlan.findIndex((item) => item.id === pendingEdit.cutId)
        const nextCut = cutPlan[cutIndex + 1]
        const kind = pendingEdit.kind
        const isMerge = kind === 'merge'
        const TITLES = {
          merge: '두 컷 합치기',
          split: '컷 나누기',
          insert: '사이에 컷 넣기',
          swap: '앞뒤 순서 바꾸기',
        }

        return (
          <div className="grid-edit-preview" role="dialog" aria-label="편집 미리보기">
            <header>
              <strong>{TITLES[kind]}</strong>
              <button type="button" onClick={() => { setPendingEdit(null); setSplitDraft(null) }} aria-label="닫기">✕</button>
            </header>

            {pendingEdit.proposal?.detail && (
              <div className="grid-edit-ai-proposal">
                <span>편집 렌즈 제안</span>
                {pendingEdit.proposal.title && <strong>{pendingEdit.proposal.title}</strong>}
                <p>{pendingEdit.proposal.detail}</p>
                {/* 왜 이 자리에서 끊었는지. 감독이 이 안을 받아들일지
                    판정하려면 근거가 보여야 한다. */}
                {kind === 'split' && splitDraft?.reason && (
                  <p className="grid-edit-split-reason">{splitDraft.reason}</p>
                )}
              </div>
            )}
            {kind === 'split' && splitError && (
              <p className="grid-edit-split-error">
                나눈 안을 받지 못했습니다 · {splitError} — 직접 나눌 수 있습니다.
              </p>
            )}

            <div className="grid-edit-diff">
              <div className="grid-edit-before">
                <span>지금</span>
                <p>{cut.content || '(비어 있음)'}</p>
                {kind !== 'split' && nextCut && <p>{nextCut.content || '(비어 있음)'}</p>}
              </div>
              <div className="grid-edit-arrow" aria-hidden="true">→</div>
              <div className="grid-edit-after">
                <span>바뀐 뒤</span>
                {isMerge ? (
                  // 왼쪽 `지금`이 원문 두 문단을 다 보여주므로 이쪽도 그만큼은
                  // 보여야 한다. CSS가 남은 높이를 채우지만, rows가 작으면
                  // 최소 높이가 그만큼으로 잡혀 스크롤이 생긴다.
                  <textarea
                    value={mergeDraft}
                    rows={8}
                    onChange={(e) => setMergeDraft(e.target.value)}
                    aria-label="합쳐진 내용"
                  />
                ) : kind === 'swap' ? (
                  <>
                    <p>{nextCut?.content || '(비어 있음)'}</p>
                    <p>{cut.content || '(비어 있음)'}</p>
                  </>
                ) : kind === 'insert' ? (
                  <>
                    <p>{cut.content || '(비어 있음)'}</p>
                    <p className="grid-edit-new">
                      {insertChoice?.content || '새 컷 · 아래에서 고르거나 직접 씁니다'}
                    </p>
                    <p>{nextCut?.content || '(비어 있음)'}</p>
                  </>
                ) : splitDraft ? (
                  // 진단에서 온 나누기. 두 컷의 내용을 채워 보여주되 둘 다
                  // 고칠 수 있게 한다 — 제안이지 결정이 아니다.
                  <>
                    <textarea
                      value={splitDraft.first.content}
                      rows={4}
                      onChange={(e) => setSplitDraft((current) => ({
                        ...current,
                        first: { ...current.first, content: e.target.value },
                      }))}
                      aria-label="앞 컷 내용"
                    />
                    <textarea
                      className="grid-edit-new"
                      value={splitDraft.second.content}
                      rows={4}
                      onChange={(e) => setSplitDraft((current) => ({
                        ...current,
                        second: { ...current.second, content: e.target.value },
                      }))}
                      aria-label="뒤 컷 내용"
                    />
                  </>
                ) : (
                  <>
                    <p>{cut.content || '(비어 있음)'}</p>
                    <p className="grid-edit-new">
                      {splitPending ? '나눌 자리를 찾는 중…' : '새 컷 · 내용은 직접 씁니다'}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* 무엇을 넣을지. 앞뒤 컷과 이음새의 '생략된 것'에서 나온다. */}
            {kind === 'insert' && (
              <div className="grid-edit-candidates">
                <div className="grid-edit-candidates-head">
                  <span>무엇을 넣을까요</span>
                  <button
                    type="button"
                    onClick={() => requestInsertCandidates(cut, nextCut, prevShotOf(pendingEdit))}
                    disabled={insertPending}
                  >
                    {insertPending ? '보는 중…' : insertCandidates.length ? '다시 제안' : '편집에 물어보기'}
                  </button>
                </div>
                {insertError && <p className="grid-edit-error">{insertError}</p>}
                {insertCandidates.map((candidate) => {
                  const chosen = insertChoice?.content === candidate.content
                  return (
                    <button
                      key={candidate.content}
                      type="button"
                      className={`grid-edit-candidate${chosen ? ' selected' : ''}`}
                      aria-pressed={chosen}
                      onClick={() => {
                        logScaffold({
                          feature: 'alternative',
                          action: chosen ? 'reject' : 'select',
                          target: pendingEdit.cutId,
                          purpose: candidate.purpose,
                        })
                        setInsertChoice(chosen ? null : candidate)
                      }}
                    >
                      <strong>{candidate.content}</strong>
                      <em>{candidate.purpose}{candidate.characters ? ` · ${candidate.characters}` : ''}</em>
                      <span>{candidate.reason}</span>
                    </button>
                  )
                })}
              </div>
            )}

            {/* 함께 바뀌는 것. 요청한 변경과 구분해 보여준다. */}
            <ul className="grid-edit-effects">
              {isMerge && (
                <>
                  <li>컷 {cutPlan.length} → {cutPlan.length - 1}</li>
                  <li>두 컷 사이의 이음새가 사라집니다</li>
                  {pendingEdit.losesDrawing && (
                    <li className="warn">S{pendingEdit.index + 1}의 그림이 사라집니다</li>
                  )}
                </>
              )}
              {kind === 'split' && (
                <>
                  <li>컷 {cutPlan.length} → {cutPlan.length + 1}</li>
                  <li>사이에 새 이음새가 생깁니다 · 컷 · 연속</li>
                  {/* 나눈 안을 받으면 앞 컷의 내용도 줄어든다. 옛 그림은 더
                      이상 그 컷이 아니므로 두 컷을 다 다시 그린다. */}
                  {splitDraft
                    ? <li className="warn">앞 컷의 내용도 줄어들어 두 컷을 다시 그립니다</li>
                    : <li>기존 그림은 앞 컷에 남습니다</li>}
                </>
              )}
              {kind === 'insert' && (
                <>
                  <li>컷 {cutPlan.length} → {cutPlan.length + 1}</li>
                  <li>{insertChoice
                    ? '선택한 내용으로 새 패널을 바로 생성합니다'
                    : '내용을 고르지 않으면 빈 패널로 추가됩니다'}</li>
                  <li>이 이음새는 새 컷 뒤로 옮겨집니다</li>
                </>
              )}
              {kind === 'swap' && (
                <>
                  <li>컷 수는 그대로입니다</li>
                  <li className="warn">두 컷의 그림도 함께 자리를 바꿉니다</li>
                  <li>앞뒤 이음새가 새 순서를 따릅니다</li>
                </>
              )}
            </ul>

            <div className="grid-edit-actions">
              <button type="button" onClick={() => { setPendingEdit(null); setSplitDraft(null) }}>취소</button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  if (isMerge) {
                    mergeCuts(pendingEdit.cutId, { content: mergeDraft })
                  } else if (kind === 'insert') {
                    logScaffold({
                      feature: 'alternative',
                      // 후보를 받아 넣었으면 accept, 안 받고 빈 컷을 만들었으면
                      // 제안을 쓰지 않은 것이다.
                      action: insertChoice ? 'accept' : 'reject',
                      target: pendingEdit.cutId,
                      proposed: insertCandidates.length > 0,
                    })
                    addCutPlanItem(pendingEdit.cutId, cut.beat, insertChoice ? {
                      content: insertChoice.content,
                      purpose: insertChoice.purpose,
                      characters: insertChoice.characters,
                    } : {})
                  } else if (kind === 'swap') {
                    swapCutsAtSeam(pendingEdit.cutId)
                  } else {
                    splitCut(pendingEdit.cutId, {
                      // 감독이 고친 내용까지 실어 보낸다. 한쪽이 비면 나눈
                      // 것이 아니므로 빈 컷을 붙이는 기존 동작으로 둔다.
                      parts: splitDraft?.first?.content?.trim()
                        && splitDraft?.second?.content?.trim()
                        ? splitDraft : null,
                    })
                  }
                  if (pendingEdit.proposal?.operationId) {
                    completeEditingOperation(pendingEdit.proposal.operationId, kind)
                  }
                  setPendingEdit(null)
                  setSplitDraft(null)
                  setOpenSeamId(null)
                }}
              >
                {{ merge: '합치기', split: '나누기', insert: '넣기', swap: '바꾸기' }[kind]}
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
