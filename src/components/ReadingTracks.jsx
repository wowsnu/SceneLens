import { useCallback, useEffect, useMemo, useRef } from 'react'
import { audienceAction, engagementSignalAt } from './audienceBehavior'
import './ReadingTracks.css'

/**
 * Reading Tracks — 관객 검토의 트랙.
 *
 * 연출 검토의 Lens Tracks와 같은 구조다 (`LENS_TRACKS_UI.md` 3장). 다른
 * 것은 **행이 무엇인가**뿐이다:
 *
 *   연출 — 행은 렌즈(미장센·촬영·편집), 마커는 Issue
 *   관객 — 행은 읽기 조건(관객), 마커는 **divergence**
 *
 * 그러므로 수직 정렬이 말하는 것도 다르다. 연출에서는 "여러 관점이 같은
 * 현상에 연결되어 있다"였고, 여기서는 **"이 자리에서 읽기가 갈렸다"**이다.
 * 설명이 아니라 배치가 그것을 말한다는 점은 같다.
 *
 * 마커는 divergence만 찍는다. 한 조건만 걸린 review_point까지 같은 트랙에
 * 섞으면 "트랙의 점 = 갈린 자리"라는 읽는 규칙이 흐려진다. 단독
 * review_point는 divergence가 없는 자리에서만 보조 마커로 남는다.
 */

// 앵커 문자열에서 컷 위치를 읽는다. 관객 쪽 앵커는 `panel_orders`에서
// 만들어지므로 `S2` 또는 `S2→S3` 두 형태뿐이다.
const parseAnchor = (anchor) => {
  if (!anchor) return []
  return anchor
    .split(/[→–·]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

const anchorPosition = (finding, indexById) => {
  const indices = parseAnchor(finding.anchor)
    .map((id) => indexById.get(id))
    .filter((index) => index !== undefined)
  if (indices.length === 0) return null
  if (indices.length >= 2) return (indices[0] + indices[indices.length - 1]) / 2
  return indices[0]
}

export default function ReadingTracks({
  shots = [],
  // 트랙의 행. 읽은 조건들이다.
  conditions = [],
  // 마커. 의도가 안 닿은 자리와 단독 review_point가 같은 모양으로 들어온다.
  findings = [],
  // 조건별 읽기 기록. 각 줄의 칸을 채우는 것이 이것이다.
  readings = [],
  activeConditions,
  selectedFindingId = null,
  // 지금 읽고 있는 칸의 컷 번호. 이 칸이 화면 안에 있어야 한다.
  walkedTo = null,
  onSelectStep,
  onToggleCondition,
  scrollRef = null,
  onScroll,
  embedded = false,
  loading = false,
  // 이미 한 번 읽었는가. "아직 안 읽음"과 "읽었지만 어긋난 데 없음"을 구분한다.
  hasRead = false,
}) {
  const trackScrollRef = useRef(null)
  const scroller = scrollRef || trackScrollRef

  const indexById = useMemo(() => {
    const map = new Map()
    shots.forEach((shot, index) => {
      map.set(`S${index + 1}`, index)
      if (shot?.id) map.set(String(shot.id), index)
    })
    return map
  }, [shots])

  // 조건별로 컷 번호 → step. 줄의 각 칸이 여기서 나온다.
  const stepsByCondition = useMemo(() => {
    const map = new Map()
    readings.forEach((entry) => {
      const steps = new Map()
      ;(entry.reading?.steps || []).forEach((step) => steps.set(step.panel_order, step))
      map.set(entry.id, steps)
    })
    return map
  }, [readings])

  // 이 칸에 걸린 것이 있는가. 별도 점이 아니라 그 칸을 강조하는 것으로
  // 표시하므로, 컷+조건으로 바로 찾을 수 있어야 한다.
  const findingIndex = useMemo(() => {
    const map = new Map()
    findings.forEach((finding) => {
      const indices = parseAnchor(finding.anchor)
        .map((id) => indexById.get(id))
        .filter((index) => index !== undefined)
      if (indices.length === 0) return
      // 앵커가 걸친 컷 전부에 표시한다. 이음새(S2→S3)면 두 칸 다 —
      // 그 사이에서 일어난 것이므로 양쪽을 함께 봐야 한다.
      indices.forEach((index) => {
        finding.conditions?.forEach((conditionId) => {
          map.set(`${index + 1}:${conditionId}`, finding)
        })
      })
    })
    return map
  }, [findings, indexById])

  const findingAt = useCallback(
    (order, conditionId) => findingIndex.get(`${order}:${conditionId}`) || null,
    [findingIndex],
  )

  // 여러 조건에 함께 걸린 자리. 세로선을 그어 그 정렬을 보이게 한다.
  const stackedFindings = useMemo(() => (
    findings
      .filter((finding) => (finding.conditions?.length || 0) >= 2)
      .map((finding) => ({ finding, position: anchorPosition(finding, indexById) }))
      .filter((entry) => entry.position !== null)
  ), [findings, indexById])

  // 고른 칸이 화면 밖이면 끌어온다. 트랙이 그 자리를 보여주지 않으면
  // 무엇을 고른 것인지 알 수 없다.
  //
  // **scrollIntoView를 쓰지 않는다.** 스트립과 트랙이 스크롤 컨테이너를
  // 공유하므로 그 호출이 세로 위치까지 건드려 검토 패널 전체가 위로
  // 올라간다 — 아래 Workbench를 보다가 걸으면 화면이 튄다.
  // `StoryboardStripLane`이 같은 이유로 이미 이 방식을 쓴다.
  //
  // 이미 보이는 칸은 움직이지 않는다. 한 칸 옮길 때마다 가운데로 당기면
  // 화면이 매번 흔들려 어디까지 읽었는지 감각을 잃는다.
  useEffect(() => {
    const view = scroller.current
    if (!walkedTo || !view) return
    const cell = view.querySelector(`[data-cell-order="${walkedTo}"]`)
    if (!cell) return

    const viewBox = view.getBoundingClientRect()
    const box = cell.getBoundingClientRect()
    // 칸이 잘리지 않게 여백을 둔다. 딱 맞추면 다음 칸이 안 보여 어디로
    // 이어지는지 알 수 없다.
    const margin = 24
    let delta = 0
    if (box.right > viewBox.right - margin) delta = box.right - viewBox.right + margin
    else if (box.left < viewBox.left + margin) delta = box.left - viewBox.left - margin
    if (delta === 0) return
    // 가로만 옮긴다. `smooth`는 연달아 누를 때 서로를 취소하므로 쓰지 않는다.
    view.scrollLeft += delta
  }, [walkedTo, scroller])

  // 컷이 없으면 그릴 축이 없다. 다만 **조건이 비어도 그린다** — 연출
  // 검토가 분석 전에 이미 세 렌즈 줄을 그려 두는 것과 같다. 결과가
  // 있어야 트랙이 생기면, 감독은 무엇이 채워질 자리인지 모른다.
  if (shots.length === 0) return null

  const style = { '--track-count': shots.length }

  const tracks = (
    <div className="reading-tracks-body">
      {/* 여러 조건이 갈린 자리를 잇는 세로선. 마커보다 아래 깔려서
          "이 자리에서 읽기가 갈렸다"만 말한다. */}
      <div className="reading-tracks-stacks" aria-hidden="true">
        {stackedFindings.map(({ finding, position }) => (
          <span
            key={finding.id}
            className={`reading-tracks-stackline ${finding.id === selectedFindingId ? 'selected' : ''}`}
            style={{ '--pos': position }}
          />
        ))}
      </div>

      {conditions.map((condition, order) => {
        const on = activeConditions.has(condition.id)
        const steps = stepsByCondition.get(condition.id) || new Map()
        return (
          <div
            key={condition.id}
            className={`reading-track ${on ? '' : 'muted'}`}
            style={{ '--reader': `var(--reader-${order % 4})` }}
          >
            {onToggleCondition ? (
              <button
                type="button"
                className="reading-track-label"
                onClick={() => onToggleCondition(condition.id)}
                aria-pressed={on}
                title={on ? `${condition.label} 끄기` : `${condition.label} 켜기`}
              >
                {condition.label}
              </button>
            ) : (
              <div className="reading-track-label is-fixed">
                <span aria-hidden="true">🧑</span> {condition.label}
              </div>
            )}

            {/* 이 줄이 곧 이 관객의 **순차 읽기**다. 컷마다 칸이 하나이고,
                가로로 읽으면 생각이 어떻게 바뀌었는지가 보인다. 세로로
                보면 같은 컷을 다른 관객이 어떻게 읽었는지 견줄 수 있다. */}
            <div className="reading-track-line">
              {on && shots.map((shot, index) => {
                const order = index + 1
                const step = steps.get(order)
                // 이 칸에서 갈렸는가. 갈림은 별도 점이 아니라 **그 칸을
                // 강조하는 것**으로 표시한다 — 읽기와 갈림이 같은 자리에
                // 있어야 "여기서 갈렸다"가 문장과 함께 읽힌다.
                const finding = findingAt(order, condition.id)
                const selected = finding && finding.id === selectedFindingId
                if (!step) {
                  return <span key={order} className="reading-cell empty" style={{ '--pos': index }} />
                }
                const signal = engagementSignalAt(
                  readings.find((entry) => entry.id === condition.id)?.reading,
                  order,
                )
                const action = signal ? audienceAction(signal.action) : null
                return (
                  <button
                    key={order}
                    type="button"
                    data-finding-id={finding?.id}
                    data-cell-order={order}
                    className={`reading-cell ${finding ? `flagged ${finding.kind}` : ''} ${selected ? 'selected' : ''}`}
                    style={{ '--pos': index }}
                    onClick={() => onSelectStep?.({ condition: condition.id, order, finding })}
                    aria-pressed={Boolean(selected)}
                    title={`S${order} · ${step.immediate_reading}`}
                  >
                    {/* 변화 상태를 두 문법으로 말하지 않는다. 모델 내부의
                        relation_to_previous는 유지하되 화면에는 실제 관람
                        행동만 표시한다. */}
                    {action && (
                      <span className="reading-cell-meta">
                        <span
                          className={`reading-cell-action action-${signal.action}`}
                          title={signal.reason}
                        >
                          <b aria-hidden="true">{action.mark}</b>{action.label}
                        </span>
                      </span>
                    )}
                    {/* 순차 읽기는 이 칸이 다 맡는다. 읽은 것과 그때 든
                        느낌을 **한 덩어리로** 둔다 — 구분선으로 갈라 두면
                        칸 하나에 내용이 둘 있는 것처럼 보여 산만하다.
                        느낌은 짧으므로 문장 뒤에 이어 붙인다. */}
                    <span className="reading-cell-text">
                      {step.immediate_reading}
                      {step.feeling && (
                        <span className="reading-cell-feeling"> {step.feeling}</span>
                      )}
                    </span>
                    {finding && (
                      <span
                        className="reading-cell-mark"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <section
      className={`reading-tracks ${embedded ? 'embedded' : ''}`}
      style={style}
      aria-label="읽기 트랙"
    >
      {embedded ? tracks : (
        <div className="reading-tracks-scroll" ref={scroller} onScroll={onScroll}>
          {tracks}
        </div>
      )}

      {loading && <p className="reading-tracks-status">관객이 읽는 중입니다…</p>}
      {/* 아직 안 읽음 / 읽었지만 어긋난 데 없음은 다르다. 침묵을 "문제
          없음"으로 읽지 않게 구분해 말한다 (`design_goal.md` DG1 P2). */}
      {!loading && !hasRead && (
        <p className="reading-tracks-status">
          아직 볼 것이 없습니다. 읽으면 여기에 표시됩니다.
        </p>
      )}
      {!loading && hasRead && findings.length === 0 && (
        <p className="reading-tracks-status">
          의도가 어긋난 자리를 찾지 못했습니다.
        </p>
      )}
    </section>
  )
}
