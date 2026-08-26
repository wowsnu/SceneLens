import { useLayoutEffect, useRef, useState } from 'react'
import useStore, {
  SEAM_JOINS,
  SEAM_ELAPSED,
  seamKeyFor,
  isSeamMarked,
} from '../store/useStore'
import { GapGhostCell } from './GapFillPanel'
import SeamEditor from './SeamEditor'
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

export default function GridView({
  shotPreview = null,
  compact = false,
  onOpenShot = null,
  decisionScope = null,
  scopeSelection = null,
  selectableScopeShotIds = [],
  onScopeShotSelect = null,
  sequencePreview = null,
  draftImages = {},
}) {
  // 컷을 좌→우, 우→좌로 번갈아 놓는다. 격자에서 줄이 바뀌면 다음 컷이
  // 화면 반대편 끝으로 튀어, 그 이음새가 어느 두 컷 사이인지 읽히지
  // 않았다. 번갈아 놓으면 줄이 바뀌는 자리에서 다음 컷이 바로 아래 칸이
  // 되어, 이음새가 실제로 두 컷 사이에 온다 (DG2 P1).
  //
  // 열 수는 폭에 따라 달라지므로 상수로 둘 수 없다. 그려진 위치를 읽어
  // 한 줄에 몇 칸이 들어갔는지 센다.
  const gridRef = useRef(null)
  const [columns, setColumns] = useState(0)
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return undefined
    const measure = () => {
      const cells = [...grid.querySelectorAll('.grid-cell-wrapper')]
      if (cells.length === 0) return
      const firstTop = Math.round(cells[0].getBoundingClientRect().top)
      let count = 0
      for (const cell of cells) {
        if (Math.round(cell.getBoundingClientRect().top) > firstTop + 4) break
        count += 1
      }
      setColumns((prev) => (prev === count ? prev : count))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(grid)
    return () => observer.disconnect()
  })

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
  const updateSeam = useStore((s) => s.updateSeam)
  const clearSeam = useStore((s) => s.clearSeam)
  const cutPlan = useStore((s) => s.cutPlan)
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
  // 초안·후보·나눈 안은 전부 SeamEditor가 들고 있다. 여기서는 어느
  // 자리를 어떤 조작으로 여는지만 정한다.
  const resetSeamAction = () => setPendingEdit(null)

  const closeSeamCard = () => {
    resetSeamAction()
    setOpenSeamId(null)
  }

  // 합치기를 연다. 초안(이어붙인 문장)은 SeamEditor가 대상에서 세운다 —
  // 두 곳에서 만들면 어느 문장이 화면에 있는지 갈린다.
  const openMergePreview = (prevShot, shot, index, proposal = null) => {
    const cutIndex = cutPlan.findIndex((item) => item.id === prevShot.cutPlanItemId)
    if (cutIndex < 0 || cutIndex >= cutPlan.length - 1) return
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

  const [rangeMode, setRangeMode] = useState(false)   // true = waiting for second tap
  const [rangeAnchor, setRangeAnchor] = useState(null) // first tap index

  const branch = branches[activeBranch]
  if (!branch) return null
  const shots = branch.shots
  const selectingScope = Boolean(scopeSelection)
  const selectableScopeShotIdSet = new Set(selectableScopeShotIds)
  const scopeSelectionFrom = scopeSelection?.anchor == null
    ? null
    : Math.min(scopeSelection.anchor, scopeSelection.end ?? scopeSelection.anchor)
  const scopeSelectionTo = scopeSelection?.anchor == null
    ? null
    : Math.max(scopeSelection.anchor, scopeSelection.end ?? scopeSelection.anchor)

  // 진단에서 보낸 요청. 이음새를 열고, 나누기·합치기면 그 미리보기까지 연다.
  // 요청은 지우지 않는다 — 처리한 id를 기억하므로 다시 열리지 않는다.
  if (seamFocusRequest && handledSeamFocus !== seamFocusRequest.id) {
    setHandledSeamFocus(seamFocusRequest.id)
    setOpenSeamId(seamFocusRequest.shotId)
    const index = shots.findIndex((entry) => entry.id === seamFocusRequest.shotId)
    if (seamFocusRequest.action === 'merge' && index >= 0 && shots[index + 1]) {
      openMergePreview(shots[index], shots[index + 1], index + 1, seamFocusRequest.proposal)
    } else if (seamFocusRequest.action === 'split' && index >= 0) {
      // Split은 이음새 액션이 아니라 한 컷을 나누는 일이다. 진단에서
      // 들어와도 이음새 카드 대신 해당 컷의 독립 편집 카드를 연다.
      setOpenSeamId(null)
      const target = shots[index]
      if (target?.cutPlanItemId) {
        // 진단에서 왔으므로 나눈 안도 함께 받는다 — 진단은 이미 무엇과
        // 무엇이 겹쳤는지 알고 있다. 그 요청은 proposal을 받은 SeamEditor가
        // 한다.
        setPendingEdit({ kind: 'split', cutId: target.cutPlanItemId, index, proposal: seamFocusRequest.proposal })
      }
    } else if (seamFocusRequest.action === 'insert' && index >= 0) {
      const target = shots[index]
      if (target?.cutPlanItemId && shots[index + 1]) {
        setPendingEdit({
          kind: 'insert',
          cutId: target.cutPlanItemId,
          index: index + 1,
          proposal: seamFocusRequest.proposal,
        })
      }
    }
  }

  const openSeamIndex = shots.findIndex((shot) => shot.id === openSeamId)
  const openSeamBeforeShot = openSeamIndex >= 0 ? shots[openSeamIndex] : null
  const openSeamAfterShot = openSeamIndex >= 0 ? shots[openSeamIndex + 1] : null
  const openSeam = openSeamBeforeShot
    ? seams[seamKeyFor(openSeamBeforeShot.id)]
    : null
  const openSeamMarked = isSeamMarked(openSeam)
  const hasOpenSeam = Boolean(openSeamBeforeShot && openSeamAfterShot)
  const splitOnlyShot = pendingEdit?.kind === 'split'
    ? shots[pendingEdit.index]
    : null

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
        ref={gridRef}
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
          const inScopeSelection = scopeSelectionFrom != null
            && i >= scopeSelectionFrom && i <= scopeSelectionTo
          const isScopeSelectionAnchor = scopeSelection?.anchor === i
          const isScopeSelectable = selectableScopeShotIdSet.has(shot.id)
          const activeLensPreview = shotPreview?.shotId === shot.id ? shotPreview : null
          const hasDraftImage = Boolean(draftImages[shot.id]) && !activeLensPreview
          const generationLabel = panelGenerationPending[shot.id]
          const displayImage = activeLensPreview?.image ?? draftImages[shot.id] ?? shot.image
          const displayCir = activeLensPreview?.cir ?? shot.cir

          const gapKey = `${activeBranch}-${i}`
          // 줄마다 방향이 바뀐다. 홀수 줄은 오른쪽에서 왼쪽으로 놓아,
          // 줄이 바뀌는 자리에서 다음 컷이 바로 아래 칸에 오게 한다.
          const rowIndex = columns > 0 ? Math.floor(i / columns) : 0
          const colInRow = columns > 0 ? i % columns : 0
          const reversedRow = columns > 1 && rowIndex % 2 === 1
          const gridColumn = reversedRow ? columns - colInRow : colInRow + 1
          // 이음새는 앞 컷 쪽 변에 붙는다. 줄 첫 칸이면 앞 컷이 바로 위에
          // 있으므로 위쪽 변이다.
          const seamSide = colInRow === 0 ? 'top' : (reversedRow ? 'right' : 'left')
          const shotEl = (
            <div
              key={shot.id}
              className={`grid-cell-wrapper ${isActive ? 'selected' : ''}`}
              // 열만 지정하면 grid가 같은 줄에 놓지 않고 다음 줄로
              // 내려보낸다. 줄도 함께 못박아야 의도한 자리에 앉는다.
              style={columns > 1 ? { gridColumn, gridRow: rowIndex + 1 } : undefined}
            >
              {/* Gap fill button — left edge (gap before this cell) */}
              {!selectingScope && !compact && i > 0 && (
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
              {!selectingScope && i > 0 && (() => {
                const prevShot = shots[i - 1]
                const seam = seams[seamKeyFor(prevShot.id)]
                const marked = isSeamMarked(seam)
                const open = openSeamId === prevShot.id
                return (
                  <>
                  <div className={`grid-seam seam-${seamSide}${marked ? ' marked' : ''}${open ? ' open' : ''}`}>
                    <button
                      type="button"
                      className="grid-seam-btn"
                      title={marked
                        ? `${SEAM_JOINS.find((j) => j.id === seam.join)?.label} · ${SEAM_ELAPSED.find((e) => e.id === seam.elapsed)?.label}`
                        : '이음새 — 사이에 무엇이 있는지 기록'}
                      aria-expanded={open}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (open) {
                          closeSeamCard()
                          return
                        }
                        resetSeamAction()
                        setOpenSeamId(prevShot.id)
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
                        // 아이콘만 두면 무엇을 여는 버튼인지 알 수 없다.
                        // 컷 사이를 다루는 자리라는 것이 글자로 보여야
                        // 초보자가 이 길을 찾는다.
                        <>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                            <path d="M8 5v14M16 5v14" />
                          </svg>
                          <span className="grid-seam-hint">이음새</span>
                        </>
                      )}
                    </button>
                    {/* 흐름선. .grid-seam(60×28) 기준 좌표로 그어야
                        알약과 같은 자리에서 뻗어 나간다 — wrapper 기준으로
                        두면 그림 전체 폭·높이에서 계산돼 알약과 어긋난
                        엉뚱한 지점에 그려진다. */}
                    <div className={`grid-seam-line line-${seamSide}`} />
                  </div>
                </>
              )
            })()}

              <div
                className={`grid-cell ${isActive ? 'active' : ''} ${inRange ? 'in-range' : ''} ${isAnchor ? 'range-anchor' : ''} ${inDecisionRange ? 'decision-range' : ''} ${isDecisionRangeEdge ? 'decision-range-edge' : ''} ${inScopeSelection ? 'scope-selection' : ''} ${isScopeSelectionAnchor ? 'scope-selection-anchor' : ''} ${selectingScope && isScopeSelectable ? 'scope-selectable' : ''} ${selectingScope && !isScopeSelectable ? 'scope-unavailable' : ''} ${activeLensPreview ? 'lens-preview' : ''}`}
                role={selectingScope ? 'button' : undefined}
                tabIndex={selectingScope ? 0 : undefined}
                aria-label={selectingScope
                  ? isScopeSelectable
                    ? `S${i + 1}을 검토 범위에 포함`
                    : `S${i + 1}은 이미지가 없어 검토 범위에 포함할 수 없음`
                  : undefined}
                onClick={(event) => {
                  // shift+클릭은 선택 모드 밖에서도 범위 선택으로 보낸다.
                  // 모드를 열지 말지는 DecisionBoard가 정한다 — 여기서는
                  // 범위를 잡으려는 의도인지만 구분한다.
                  if (selectingScope || event.shiftKey) onScopeShotSelect?.(i, event)
                  else handleCellClick(i)
                }}
                onDoubleClick={() => {
                  if (selectingScope) return
                  setActiveShot(i)
                  if (compact) {
                    onOpenShot?.(i)
                  } else {
                    setFlowView('card')
                  }
                }}
                onKeyDown={(event) => {
                  if (!selectingScope || (event.key !== 'Enter' && event.key !== ' ')) return
                  event.preventDefault()
                  // 키보드로도 shift가 통해야 한다 — 마우스에서만 되는
                  // 범위 선택은 키보드로 고르는 사람에게는 없는 기능이다.
                  onScopeShotSelect?.(i, event)
                }}
                onMouseEnter={() => setHoveredIdx(i)}
                title={selectingScope
                  ? isScopeSelectable ? '이 컷을 검토 범위에 넣기' : '이미지가 있는 컷만 선택할 수 있습니다'
                  : compact ? '더블클릭하여 크게 보기' : undefined}
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

                  {!selectingScope && isHovered && shots.length > 1 && (
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
                  {!selectingScope && isHovered && shot.cutPlanItemId && (
                    <button
                      className="grid-cell-split"
                      onClick={(e) => {
                        e.stopPropagation()
                        // 앞 칸에 원본을 넣어 둔다. 감독은 뒤로 보낼 부분을
                        // 잘라 옮기면 되고, 빈 칸 둘을 마주하지 않는다.
                        const source = cutPlan.find((item) => item.id === shot.cutPlanItemId)
                        setOpenSeamId(null)
                        setPendingEdit({
                          kind: 'split',
                          cutId: shot.cutPlanItemId,
                          index: i,
                          seedSplit: {
                            first: { content: source?.content || '' },
                            second: { content: '' },
                          },
                        })
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

      {(hasOpenSeam || splitOnlyShot) && (
        <section
          className="grid-seam-card"
          aria-label={hasOpenSeam
            ? `S${openSeamIndex + 1}과 S${openSeamIndex + 2} 이음새 편집`
            : `S${pendingEdit.index + 1} 나누기`}
        >
          {hasOpenSeam ? (
            <>
          <header className="grid-seam-card-head">
            <div>
              <span>SEAM</span>
              <strong>S{openSeamIndex + 1} <em>┃</em> S{openSeamIndex + 2}</strong>
            </div>
            <div className="grid-seam-card-head-actions">
              {openSeamMarked && (
                <button
                  type="button"
                  className="grid-seam-reset"
                  onClick={() => clearSeam(openSeamBeforeShot.id)}
                >
                  기본값으로 되돌리기
                </button>
              )}
              <button type="button" className="grid-seam-card-close" onClick={closeSeamCard} aria-label="이음새 편집 닫기">✕</button>
            </div>
          </header>

          <div className="grid-seam-pair">
            {[openSeamBeforeShot, openSeamAfterShot].map((pairShot, offset) => {
              const pairCut = cutPlan.find((item) => item.id === pairShot.cutPlanItemId)
              const pairImage = draftImages[pairShot.id] || pairShot.image
              return (
                <div className="grid-seam-shot" key={pairShot.id}>
                  <div className="grid-seam-shot-frame">
                    {pairImage
                      ? <img src={pairImage} alt={`S${openSeamIndex + offset + 1}`} />
                      : <span>S{openSeamIndex + offset + 1}</span>}
                  </div>
                  <div>
                    <strong>S{openSeamIndex + offset + 1}</strong>
                    <p>{pairCut?.content || pairShot.label || '(비어 있음)'}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid-seam-settings">
            <div className="grid-seam-setting-row">
              <span>연결</span>
              <div className="grid-seam-chips">
                {SEAM_JOINS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={(openSeam?.join || 'cut') === option.id ? 'active' : ''}
                    title={option.hint}
                    onClick={() => updateSeam(openSeamBeforeShot.id, { join: option.id })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid-seam-setting-row">
              <span>시간</span>
              <div className="grid-seam-chips">
                {SEAM_ELAPSED.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={(openSeam?.elapsed || 'continuous') === option.id ? 'active' : ''}
                    title={option.hint}
                    onClick={() => updateSeam(openSeamBeforeShot.id, { elapsed: option.id })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {openSeam?.reason && <p className="grid-seam-reason">{openSeam.reason}</p>}
          </div>

          <div className="grid-seam-action-tabs" aria-label="이음새 구조 변경">
            <span>구조 변경</span>
            <div>
              <button
                type="button"
                className={pendingEdit?.kind === 'insert' ? 'active' : ''}
                onClick={() => {
                  resetSeamAction()
                  setPendingEdit({
                    kind: 'insert',
                    cutId: openSeamBeforeShot.cutPlanItemId,
                    index: openSeamIndex + 1,
                  })
                }}
              >
                Insert
              </button>
              <button
                type="button"
                className={pendingEdit?.kind === 'merge' ? 'active' : ''}
                onClick={() => {
                  resetSeamAction()
                  openMergePreview(openSeamBeforeShot, openSeamAfterShot, openSeamIndex + 1)
                }}
              >
                Merge
              </button>
            </div>
          </div>
            </>
          ) : (
            <header className="grid-seam-card-head grid-split-card-head">
              <div>
                <span>SHOT</span>
                <strong>S{pendingEdit.index + 1} 나누기</strong>
              </div>
              <button
                type="button"
                className="grid-seam-card-close"
                onClick={closeSeamCard}
                aria-label="컷 나누기 닫기"
              >
                ✕
              </button>
            </header>
          )}

          {/* 실행 전 영향 미리보기 (DG2 P3). 무엇이 바뀌고 무엇이 사라지는지
              같은 카드의 하단에서 확인하고 적용한다.

              Lens Workbench도 같은 편집기를 쓴다. 두 벌로 두면 한쪽만
              고쳐진다 (`LENS_TRACKS_UI.md` 11장). */}
          <SeamEditor
            pendingEdit={pendingEdit}
            shots={shots}
            onClose={() => { setPendingEdit(null) }}
            onDone={() => { setPendingEdit(null); setOpenSeamId(null) }}
          />
        </section>
      )}
    </div>
  )
}
