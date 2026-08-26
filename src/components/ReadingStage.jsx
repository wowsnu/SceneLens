import './ReadingStage.css'

/**
 * 갈린 자리의 컷들과, 그 자리를 지나는 **순차 읽기**.
 *
 * 연출 쪽 `EvidenceStage`와 같은 자리다 (`LENS_TRACKS_UI.md` 4장). 다른
 * 것은 그림 위에 얹는 것이 좌표 상자가 아니라 **그 관객이 그 컷에서
 * 실제로 무엇을 봤는가**라는 점이다.
 *
 * 관객 읽기의 근거는 좌표가 아니라 **순서**다. 한 컷만 떼어 보면 그
 * 관객이 왜 그렇게 읽었는지 알 수 없다 — 앞 컷에서 세운 가설을 이 컷이
 * 어떻게 바꿨는가가 근거이기 때문이다. 그래서 이 자리는 컷을 따라
 * 걸으며 그 관객의 생각이 바뀌는 것을 보여 준다.
 *
 * 관객을 바꾸면 **그림은 그대로 있고 이 읽기만 바뀐다.** 연출 쪽에서
 * 렌즈를 바꿔도 같은 그림이 남는 것과 같은 규칙이다.
 */

const RELATION_LABELS = {
  start: '처음 떠오른 생각',
  reinforced: '앞의 생각이 더 강해졌다',
  shifted: '생각이 조금 바뀌었다',
  unsettled: '확신이 흔들렸다',
  new_question: '새로운 질문이 생겼다',
}

const panelIndexOf = (panelId) => {
  const match = /^S(\d+)$/.exec(panelId)
  return match ? Number(match[1]) - 1 : -1
}

// 패널 라벨에서 컷 번호. `S3` → 3. 못 읽으면 0.
const panelOrderOf = (panelId) => panelIndexOf(panelId) + 1

const panelsOf = (anchor) => (
  (anchor || '').split(/[→–·]/).map((part) => part.trim()).filter(Boolean)
)

/**
 * 어떤 컷들을 놓을 것인가.
 *
 * 이음새면 두 컷을 동등하게, 한 컷이면 앞·대상·뒤를 둔다 — 연출 쪽과
 * 같은 규칙이고, 같은 이유로 **검토 범위를 넘지 않는다.** 범위 밖의 컷을
 * 끌어오면 감독이 지금 보고 있지도 않은 자리가 근거처럼 보인다.
 */
const framesFor = (finding, shots, range) => {
  const anchorPanels = panelsOf(finding?.anchor)
  if (anchorPanels.length === 0) return []
  if (anchorPanels.length > 1) {
    return anchorPanels.map((id) => ({ id, role: 'focus' }))
  }

  const targetIndex = panelIndexOf(anchorPanels[0])
  if (targetIndex < 0) return [{ id: anchorPanels[0], role: 'focus' }]

  const from = Number.isInteger(range?.from) ? Math.max(0, range.from) : 0
  const to = Number.isInteger(range?.to)
    ? Math.min(range.to, shots.length - 1)
    : shots.length - 1

  return [
    targetIndex > from && { id: `S${targetIndex}`, role: 'context' },
    { id: anchorPanels[0], role: 'focus' },
    targetIndex < to && { id: `S${targetIndex + 2}`, role: 'context' },
  ].filter(Boolean)
}

export default function ReadingStage({
  finding,
  shots = [],
  range = null,
  // 지금 고른 관객의 읽기 전체. steps가 여기 있다.
  reading = null,
  conditionLabel = '',
  // 트랙에서 고른 컷 번호. 이 화면의 현재 위치다.
  stepAt = null,
  // 문장까지 여기서 보일 것인가. Workbench에서는 트랙의 칸이 이미
  // 말했으므로 그림만 놓는다 — 같은 말을 두 자리에 두지 않는다.
  showTrace = true,
  // 앞뒤 컷을 눌러 그리로 걸어갈 수 있는가. 순차 읽기는 앞뒤로 움직이며
  // 읽는 것이므로, 그림 자체가 이동 수단이 된다.
  onWalkTo = null,
  // 이 관객이 이 자리에서 뭐라고 읽었는가 (divergence의 조건별 문장).
  line = '',
}) {
  const frames = framesFor(finding, shots, range)
  const anchorPanels = panelsOf(finding?.anchor)
  // 이 자리의 첫 컷에서 시작한다. 갈린 자리가 곧 읽던 자리이므로,
  // 트랙에서 점을 누른 순간 그 컷의 반응이 보여야 한다.
  const anchorOrder = panelIndexOf(anchorPanels[0]) + 1

  // 지금 어느 컷을 읽고 있는가는 **트랙이 정한다.** 여기서 따로 들고
  // 있으면 트랙의 강조 칸과 이 아래 문장이 서로 다른 컷을 가리킬 수 있다.
  const stepOrder = Number.isInteger(stepAt) ? stepAt : anchorOrder

  const steps = reading?.steps || []
  // 관객을 바꿔도 같은 컷의 반응을 읽는다. 그래야 "같은 자리를 다르게
  // 읽는다"가 비교로 성립한다 — 관객마다 다른 컷을 보여 주면 무엇이
  // 다른지 알 수 없다.
  const activeStep = steps.find((step) => step.panel_order === stepOrder)
    || steps.find((step) => step.panel_order === anchorOrder)
    || null

  const shotFor = (panelId) => {
    const index = panelIndexOf(panelId)
    return index >= 0 ? shots[index] || null : null
  }

  if (frames.length === 0) return null

  const kind = finding?.anchor_kind || 'shot'
  const noticedCues = activeStep?.noticed_cues || activeStep?.visible_cues || []

  return (
    <div className={`reading-stage reading-stage-${kind}`}>
      <div className="reading-stage-frames" aria-label={`${finding?.anchor || ''} 주변 스토리보드`}>
        {frames.map(({ id: panelId, role }, index) => {
          const shot = shotFor(panelId)
          const isSeam = kind === 'seam' && index === 1
          const isReadingHere = panelIndexOf(panelId) + 1 === activeStep?.panel_order
          return (
            <div key={panelId} className={`reading-frame-slot reading-frame-${role}`}>
              {index > 0 && (
                <span className={`reading-arrow ${isSeam ? 'reading-seam-arrow' : ''}`} aria-hidden="true">
                  {isSeam && <small>{finding?.anchor || '이음새'}</small>}
                  →
                </span>
              )}
              <figure className={`reading-frame ${isReadingHere ? 'reading-here' : ''}`}>
                {/* 앞뒤 컷을 누르면 그 컷이 가운데로 온다. 읽기는 앞뒤로
                    걸으며 확인하는 것이라, 그림이 곧 이동 수단이다.
                    지금 보고 있는 컷은 누를 것이 없으므로 버튼이 아니다. */}
                {onWalkTo && !isReadingHere && panelOrderOf(panelId) > 0 ? (
                  <button
                    type="button"
                    className="reading-frame-image reading-frame-walk"
                    onClick={(event) => {
                      // 누른 버튼은 곧 사라진다 — 그 컷이 가운데로 오면
                      // 버튼이 아니라 그냥 그림이 되기 때문이다. 포커스를
                      // 가진 요소가 없어지면 브라우저가 스크롤을 되돌려
                      // 화면이 위로 튄다(실제로 그랬다).
                      //
                      // 그래서 다시 그리기 전에 포커스를 바깥 껍데기로
                      // 옮겨 둔다. 거기가 화살표 키를 받는 자리이기도 해서,
                      // 눌러서 걷다가 키로 이어 걷는 것도 자연스러워진다.
                      event.currentTarget.closest('.reading-workbench')
                        ?.focus({ preventScroll: true })
                      onWalkTo(panelOrderOf(panelId))
                    }}
                    title={`${panelId}의 읽기로`}
                    aria-label={`${panelId}의 읽기로 이동`}
                  >
                    <span className="reading-frame-id">{panelId}</span>
                    {shot?.image
                      ? <img src={shot.image} alt="" loading="lazy" />
                      : <span className="reading-frame-empty" aria-hidden="true" />}
                    <span className="reading-frame-walk-hint" aria-hidden="true">
                      {panelOrderOf(panelId) < (activeStep?.panel_order ?? 0) ? '←' : '→'}
                    </span>
                  </button>
                ) : (
                  <span className="reading-frame-image">
                    <span className="reading-frame-id">{panelId}</span>
                    {shot?.image
                      ? <img src={shot.image} alt="" loading="lazy" />
                      : <span className="reading-frame-empty" aria-hidden="true" />}
                    {/* 지금 읽고 있는 컷을 그림 위에서 표시한다. 좌표
                        상자가 아니라 "이 컷을 지나는 중"이라는 자리 표시다. */}
                    {isReadingHere && <span className="reading-frame-here" aria-hidden="true" />}
                  </span>
                )}
              </figure>
            </div>
          )
        })}
      </div>

      {/* --- 순차 읽기 ------------------------------------------------ */}
      {!showTrace ? null : activeStep ? (
        <section className="reading-trace" aria-live="polite">
          <header className="reading-trace-head">
            <div className="reading-trace-where">
              <strong>S{activeStep.panel_order}</strong>
              <span>{RELATION_LABELS[activeStep.relation_to_previous] || '보면서 든 생각'}</span>
            </div>
            {/* 걷는 일은 트랙이 한다. 여기 또 화살표를 두면 같은 일을
                두 자리에서 하게 되고, 어느 쪽이 지금 위치인지 어긋난다. */}
          </header>

          <p className="reading-trace-immediate">{activeStep.immediate_reading}</p>

          {activeStep.feeling && (
            <p className="reading-trace-feeling"><em>느낌</em>{activeStep.feeling}</p>
          )}

          {activeStep.current_hypothesis && (
            <p className="reading-trace-hypothesis">
              <em>지금 생각</em>{activeStep.current_hypothesis}
            </p>
          )}

          {activeStep.open_question && (
            <p className="reading-trace-question">
              <em>궁금한 점</em>{activeStep.open_question}
            </p>
          )}

          {/* 근거는 접어 둔다. 관객 읽기의 근거는 "화면에서 무엇이
              눈에 들어왔는가"이고, 판정은 위 문장으로 먼저 된다. */}
          {noticedCues.length > 0 && (
            <details className="reading-trace-cues">
              <summary>왜 그렇게 봤나</summary>
              <p>{noticedCues.join(' · ')}</p>
            </details>
          )}

          {/* 이 자리에서 이 관객이 무엇을 다르게 읽었는가. 갈림의 근거라
              순차 읽기 아래에 붙인다 — 걸어와서 여기가 갈린 자리다. */}
          {line && (
            <p className="reading-trace-divergence">
              <em>{conditionLabel || '이 읽기'}</em>{line}
            </p>
          )}
        </section>
      ) : (
        <p className="reading-stage-note">
          이 관객의 이 자리 반응을 찾지 못했습니다.
        </p>
      )}
    </div>
  )
}
