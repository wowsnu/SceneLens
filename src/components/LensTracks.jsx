import { useCallback, useEffect, useMemo, useRef } from 'react'
import './LensTracks.css'

// 트랙에 놓이는 렌즈. 서사는 여기 없다 — 셋은 그려진 화면을 진단하고
// 서사는 무엇을 그릴지가 정해지기 전에 판단한다. 같은 자리에 두면
// 위계가 평평해진다 (LENS_TRACKS_UI.md 9장).
const TRACK_LENSES = [
  { id: 'mise', label: '미장센', mark: 'M' },
  { id: 'camera', label: '촬영', mark: 'C' },
  { id: 'editing', label: '편집', mark: 'E' },
]

// 앵커 문자열에서 컷 위치를 읽는다. 백엔드가 `_anchor_for`로 만든 것과
// 같은 규칙이다 (`S2`, `S2→S3`, `S1–S4`, `S2·S3`).
//
// 한쪽만 바꾸면 마커가 엉뚱한 자리에 찍히므로, 형태가 바뀌면 백엔드의
// `_anchor_for`도 같이 본다.
const parseAnchor = (anchor) => {
  if (!anchor) return []
  return anchor
    .split(/[→–·]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * 앵커가 스트립의 어느 가로 위치에 오는가.
 *
 * shot이면 그 컷의 가운데, seam이면 두 컷 사이다. 이 구분이 물리적으로
 * 보여야 감독이 "컷 안의 문제"와 "컷 사이의 문제"를 위치만으로 안다
 * (LENS_TRACKS_UI.md 3장).
 *
 * 좌표는 컷 인덱스 기준의 실수다 — 2.5면 3번째와 4번째 컷 사이.
 */
const anchorPosition = (issue, indexById) => {
  const ids = parseAnchor(issue.anchor)
  const indices = ids
    .map((id) => indexById.get(id))
    .filter((index) => index !== undefined)
  if (indices.length === 0) return null

  if (issue.anchor_kind === 'seam' && indices.length >= 2) {
    // 두 컷 사이. 인접하지 않아도 가운데를 잡는다.
    return (indices[0] + indices[1]) / 2
  }
  if (issue.anchor_kind === 'scene' && indices.length >= 2) {
    return (indices[0] + indices[indices.length - 1]) / 2
  }
  return indices[0]
}

export default function LensTracks({
  shots = [],
  issues = [],
  activeLenses,
  selectedIssueId = null,
  onSelectIssue,
  onToggleLens,
  // 관객이 갈린 자리. **진단이 아니라 근거다** — 렌즈 줄과 떨어뜨려
  // 놓고 모양도 가른다 (LENS_TRACKS_UI.md 7·9장).
  readingDivergences = [],
  onSelectDivergence,
  selectedDivergenceId = null,
  scrollRef = null,
  onScroll,
  embedded = false,
  loading = false,
  relating = false,
}) {
  const trackScrollRef = useRef(null)
  const scroller = scrollRef || trackScrollRef

  const indexById = useMemo(() => {
    const map = new Map()
    shots.forEach((shot, index) => {
      // 스토리보드 라벨(`S1`)과 패널 id 둘 다로 찾을 수 있게 해 둔다.
      // 진단의 targets가 어느 쪽으로 오든 마커가 붙는다.
      map.set(`S${index + 1}`, index)
      if (shot?.id) map.set(String(shot.id), index)
    })
    return map
  }, [shots])

  // Issue를 렌즈별로 나눠 둔다. 한 Issue가 여러 렌즈에 걸리면 그 렌즈들의
  // 행에 각각 마커가 찍히고, 같은 가로 위치라 세로로 정렬된다 —
  // 이것이 cross-lens를 보여주는 방식이다.
  const markersByLens = useMemo(() => {
    const byLens = new Map(TRACK_LENSES.map((lens) => [lens.id, []]))
    issues.forEach((issue) => {
      const position = anchorPosition(issue, indexById)
      if (position === null) return
      issue.lenses?.forEach((lensId) => {
        const bucket = byLens.get(lensId)
        if (!bucket) return
        bucket.push({ issue, position })
      })
    })
    return byLens
  }, [issues, indexById])

  // 여러 렌즈가 같은 자리를 짚은 Issue. 세로선을 그어 연결을 보이게 한다.
  const stackedIssues = useMemo(() => (
    issues
      .filter((issue) => (issue.lenses?.length || 0) >= 2)
      .map((issue) => ({ issue, position: anchorPosition(issue, indexById) }))
      .filter((entry) => entry.position !== null)
  ), [issues, indexById])

  const handleSelect = useCallback((issue) => {
    onSelectIssue?.(issue.id === selectedIssueId ? null : issue.id)
  }, [onSelectIssue, selectedIssueId])

  // 선택된 Issue가 화면 밖이면 끌어온다. 목록에서 골랐을 때 트랙이
  // 그 자리를 보여주지 않으면 무엇을 고른 것인지 알 수 없다.
  useEffect(() => {
    if (!selectedIssueId || !scroller.current) return
    const marker = scroller.current.querySelector(
      `[data-issue-id="${CSS.escape(selectedIssueId)}"]`
    )
    marker?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [selectedIssueId, scroller])

  if (shots.length === 0) return null

  // 컷 하나가 차지하는 폭. 스트립과 트랙이 같은 값을 써야 마커가 컷
  // 아래에 정확히 온다 — CSS 변수로 한 곳에서만 정한다.
  const style = { '--track-count': shots.length }

  const tracks = (
    <div className="lens-tracks-body">
          {/* 여러 렌즈가 함께 짚은 자리를 잇는 세로선. 마커보다 아래
              깔려서 "이 자리에 여러 관점이 걸려 있다"만 말한다. */}
          <div className="lens-tracks-stacks" aria-hidden="true">
            {stackedIssues.map(({ issue, position }) => (
              <span
                key={issue.id}
                className={`lens-tracks-stackline ${issue.id === selectedIssueId ? 'selected' : ''}`}
                style={{ '--pos': position }}
              />
            ))}
          </div>

          {TRACK_LENSES.map((lens) => {
            const on = activeLenses.has(lens.id)
            const markers = markersByLens.get(lens.id) || []
            return (
              <div
                key={lens.id}
                className={`lens-track lens-${lens.id} ${on ? '' : 'muted'}`}
              >
                <button
                  type="button"
                  className="lens-track-label"
                  onClick={() => onToggleLens?.(lens.id)}
                  aria-pressed={on}
                  title={on ? `${lens.label} 끄기` : `${lens.label} 켜기`}
                >
                  {lens.label}
                </button>
                <div className="lens-track-line">
                  {on && markers.map(({ issue, position }) => {
                    const stacked = (issue.lenses?.length || 0) >= 2
                    const selected = issue.id === selectedIssueId
                    return (
                      <button
                        key={`${issue.id}-${lens.id}`}
                        type="button"
                        data-issue-id={issue.id}
                        className={`lens-marker ${issue.anchor_kind} ${stacked ? 'stacked' : ''} ${selected ? 'selected' : ''}`}
                        style={{ '--pos': position }}
                        onClick={() => handleSelect(issue)}
                        aria-pressed={selected}
                        title={issue.detail
                          ? `${issue.anchor} · ${issue.title}\n${issue.detail}`
                          : `${issue.anchor} · ${issue.title}`}
                      >
                        <span className="lens-marker-dot" aria-hidden="true" />
                        <span className="lens-marker-label">{issue.title}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* 관객이 갈린 자리.

              렌즈 줄에 섞지 않는다. 렌즈 마커는 AI가 규칙으로 짚은
              **진단**이라 감독이 판정할 대상이지만, 이것은 실제로 읽기가
              갈렸다는 **현상**이다 — 판정 대상이 아니라 판정의 근거다.
              같은 줄에 같은 모양으로 두면 그 층위 차이가 사라진다.

              그래서 구분선 아래 한 칸 띄워 놓고, 점(●)이 아니라 빈
              마름모(◇)로 그린다. 가로축은 공유하므로 어느 컷에서 갈렸는지는
              위 진단들과 세로로 맞춰 읽힌다. */}
          {readingDivergences.length > 0 && (
            <div className="lens-track reading-lane">
              {/* 이름은 짧게. 라벨 열은 렌즈 이름(2~3자)에 맞춰져 있어
                  길면 두 줄로 접히고, 접힌 줄이 아래 상태 문구와 겹친다. */}
              <span className="lens-track-label" title="관객이 갈린 자리">관객</span>
              <div className="lens-track-line">
                {readingDivergences.map(({ id, position, title, anchor, anchor_kind: anchorKind, conditions }) => (
                  <button
                    key={id}
                    type="button"
                    data-divergence-id={id}
                    /* `anchorKind`를 함께 얹어, 컷 안인지 컷 사이인지가
                       렌즈 트랙과 같은 문법으로 읽히게 한다. */
                    className={`lens-marker reading-marker-lane ${anchorKind || 'shot'} ${id === selectedDivergenceId ? 'selected' : ''}`}
                    style={{ '--pos': position }}
                    onClick={() => onSelectDivergence?.(id)}
                    aria-pressed={id === selectedDivergenceId}
                    title={[
                      `${anchor} · ${anchorKind === 'seam' ? '이음새' : '컷'} · ${title}`,
                      `${(conditions || []).join(' / ')}에서 읽기가 갈렸습니다`,
                      '눌러서 이 자리를 검토 범위로',
                    ].join('\n')}
                  >
                    <span className="lens-marker-dot" aria-hidden="true" />
                    <span className="lens-marker-label">{title}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
    </div>
  )

  return (
    <section className={`lens-tracks ${embedded ? 'embedded' : ''}`} style={style} aria-label="렌즈 트랙">
      {embedded ? tracks : (
        <div className="lens-tracks-scroll" ref={scroller} onScroll={onScroll}>
          {tracks}
        </div>
      )}

      {loading && <p className="lens-tracks-status">렌즈가 보는 중입니다…</p>}
      {/* 관계를 아직 찾는 중이면 그렇다고 말한다. 이 사이에는 같은
          현상을 두 렌즈가 짚었어도 마커가 따로 찍혀 있어, 감독이
          "다른 문제"로 읽고 각각 열어 보게 된다. 곧 합쳐질 수 있다는
          것을 알려야 그 오해를 막는다. */}
      {!loading && relating && (
        <p className="lens-tracks-status" role="status">
          관점 사이의 관계를 확인하는 중입니다 — 같은 문제로 묶일 수 있습니다.
        </p>
      )}
      {/* 이 문구는 **렌즈 진단**이 없다는 뜻이다. 갈림 마커가 떠 있는데
          "아직 볼 것이 없습니다"라고만 하면 화면과 어긋난다 — 그때는
          무엇이 없는 것인지 밝힌다. */}
      {!loading && issues.length === 0 && (
        <p className="lens-tracks-status">
          {readingDivergences.length > 0
            ? '렌즈가 짚은 것은 아직 없습니다. 아래는 관객이 갈린 자리입니다.'
            : '아직 볼 것이 없습니다. 분석하면 여기에 표시됩니다.'}
        </p>
      )}
    </section>
  )
}
