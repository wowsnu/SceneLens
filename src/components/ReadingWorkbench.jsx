import { useEffect, useRef } from 'react'
import ReadingStage from './ReadingStage'
import { audienceAction, engagementSignalAt } from './audienceBehavior'
import './ReadingWorkbench.css'

/**
 * 관객 검토의 Workbench — **고른 칸의 그림을 크게 보는 자리**.
 *
 * 순차 읽기 자체는 위 트랙이 맡는다 (`LENS_TRACKS_UI.md` 7장). 칸에 문장과
 * 느낌이 다 들어가므로, 여기서 그것을 한 번 더 늘어놓지 않는다 — 같은 말이
 * 두 자리에 있으면 어느 쪽이 지금 보는 자리인지 알 수 없다.
 *
 * 그래서 이 자리가 맡는 것은 트랙이 할 수 없는 것뿐이다:
 *
 *   1. **그림을 크게** — 트랙의 스트립은 훑는 크기라 근거를 확인할 수 없다.
 *      고른 컷을 앞뒤 문맥과 함께 크게 놓는다.
 *   2. **무엇이 눈에 들어왔나** — `noticed_cues`. 그 관객이 왜 그렇게
 *      읽었는지의 근거이고, 그림과 나란히 있어야 대조된다.
 *   3. **갈렸을 때만 견주기** — 같은 컷을 다른 관객이 어떻게 읽었는지와,
 *      거기서 이어지는 수정.
 *
 * 관객을 바꾸는 일은 여기서 하지 않는다. 트랙에서 옆 줄의 같은 칸을 누르면
 * 된다 — 같은 조작을 두 자리에 두지 않는다. 그래서 예전의 오른쪽 glass
 * 흐름을 걷어냈다.
 */

/**
 * 관객이 남긴 물음에 감독이 답하는 칸.
 *
 * 답은 여기서 아무것도 실행하지 않는다 — **연출 검토의 전제로 쌓인다.**
 * 그래서 버튼도 `수정하기`가 아니라 `답 남기기`다. 무엇을 하는 버튼인지
 * 이름에 그대로 적는다.
 */
export default function ReadingWorkbench({
  // 트랙에서 고른 칸 — `{ condition, order }`. 이것이 기본 단위다.
  step = null,
  // 그 칸에서 갈렸다면 그 갈림. 없을 수 있다.
  finding = null,
  // 조건별 읽기. `{ id, label, reading }`.
  readings = [],
  conditions = [],
  shots = [],
  range = null,
  // 관객이 남긴 물음에 감독이 답한다. 여기서 고치지는 않는다.
  // 앞뒤 컷으로 걸어간다. 트랙까지 올라가지 않고도 순차 읽기를 따라갈
  // 수 있어야 한다 — 읽기는 앞뒤로 움직이며 확인하는 것이다.
  onWalkTo,
  // 의도 대조는 관객 읽기 뒤에 따로 도착한다. 이 상태가 없는데
  // "의도대로"라고 단정하면, 아직 판정하지 않은 컷까지 통과처럼 보인다.
  intentStatus = 'idle',
  intentVerdict = null,
}) {
  // 칸을 고르면 이 자리가 포커스를 받는다. 그래야 곧바로 화살표로 걸을
  // 수 있다 — 한 번 더 눌러 포커스를 주게 하면 키가 있는 줄도 모른다.
  //
  // 다만 **처음 열릴 때는 뺏지 않는다.** 칸을 고르는 것은 위 트랙에서
  // 일어나는데, 포커스가 아래로 끌려오면 브라우저가 그 자리를 보여 주려
  // 화면을 내리거나 올린다. 이미 이 안에서 걷고 있을 때만 이어 준다.
  const shellRef = useRef(null)
  const focusKey = step ? `${step.condition}:${step.order}` : ''
  useEffect(() => {
    const shell = shellRef.current
    if (!shell || !focusKey) return
    // 이미 이 안을 만지고 있으면 뺏지 않는다 — 답을 쓰던 중에 껍데기로
    // 끌려오면 입력이 끊긴다.
    if (shell.contains(document.activeElement)) return
    // 칸을 고르면 곧바로 화살표로 걸을 수 있어야 한다. `preventScroll`로
    // 포커스 때문에 화면이 움직이는 것은 막는다.
    shell.focus({ preventScroll: true })
  }, [focusKey])

  const orderOf = (conditionId) => (
    Math.max(0, conditions.findIndex((entry) => entry.id === conditionId))
  )
  const labelOf = (conditionId) => {
    const condition = conditions.find((entry) => entry.id === conditionId)
    return condition?.title || condition?.label || conditionId
  }
  const stepOf = (conditionId, order) => (
    readings
      .find((entry) => entry.id === conditionId)
      ?.reading?.steps?.find((entry) => entry.panel_order === order)
    || null
  )

  // 컷을 앞뒤로 걷는다. 검토 범위를 넘지 않는다 — 그림을 눌러 걷는 것과
  // 같은 규칙이라, 키로 가나 눌러서 가나 갈 수 있는 자리가 같다.
  //
  // 메모이제이션은 React Compiler에 맡긴다 — 손으로 `useCallback`을
  // 걸면 추론한 의존성과 어긋나 최적화가 통째로 꺼진다.
  const onKeyDown = (event) => {
    if (!step) return
    const delta = { ArrowLeft: -1, ArrowRight: 1 }[event.key]
    if (!delta) return
    const next = step.order + delta
    const from = Number.isInteger(range?.from) ? range.from + 1 : 1
    const to = Number.isInteger(range?.to) ? range.to + 1 : shots.length
    if (next < from || next > to) return
    // 위 스트립도 화살표를 쓴다. 여기서 처리했으면 그쪽으로 넘기지 않는다.
    event.preventDefault()
    onWalkTo?.({ condition: step.condition, order: next })
  }

  if (!step) {
    return (
      <section className="reading-workbench empty" aria-label="선택한 관객 읽기">
        <p>트랙에서 읽기 칸을 누르면 그 컷을 크게 놓고 확인할 수 있습니다.</p>
      </section>
    )
  }

  const activeReading = readings.find((entry) => entry.id === step.condition) || null
  const activeStep = stepOf(step.condition, step.order)
  const noticedCues = activeStep?.noticed_cues || activeStep?.visible_cues || []
  const activeSignal = engagementSignalAt(activeReading?.reading, step.order)
  const activeAction = activeSignal ? audienceAction(activeSignal.action) : null
  const recheckOrders = (activeSignal?.panel_orders || []).filter((order) => order !== step.order)

  // 그림을 놓을 자리. **언제나 고른 칸을 따라간다.**
  //
  // 전에는 갈림이 이음새면 `finding`을 그대로 썼는데, 그러면 앵커가
  // `S2→S3`로 고정되어 앞뒤로 걸어도 그림이 그대로였다 — 누르면 아무
  // 일도 안 일어나는 것처럼 보인다(실제로 그랬다).
  //
  // 이음새라도 지금 읽고 있는 것은 **한 관객의 한 컷**이다. 그 컷을
  // 가운데 두고 앞뒤를 문맥으로 붙이면, 이음새의 두 컷이 자연히 함께
  // 보이면서도 걸어 다닐 수 있다.
  const place = {
    id: `step:${step.condition}:${step.order}`,
    anchor: `S${step.order}`,
    anchor_kind: 'shot',
    title: '',
  }

  return (
    <section
      className="reading-workbench"
      aria-label={`S${step.order} ${labelOf(step.condition)} — 좌우 화살표로 컷 이동`}
      style={{ '--reader': `var(--reader-${orderOf(step.condition) % 4})` }}
      /* 화살표로 걷는다. 포커스가 이 안에 있을 때만 먹으므로 위 스트립의
         화살표 이동과 서로 뺏지 않는다. */
      ref={shellRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      <>
          <header className="reading-workbench-bar">
            <strong>S{step.order}</strong>
            <span>🧑 {labelOf(step.condition)}의 생각</span>
            {/* 어긋난 자리인지 아닌지를 여기서 먼저 말한다. 침묵을 "문제
                없음"으로 읽지 않게 한다 (`design_goal.md` DG1 P2). */}
            {finding || intentVerdict?.status === 'missed' || intentVerdict?.status === 'partial' ? (
              <em className="flagged">
                {finding?.kind === 'intent' || intentVerdict?.status === 'missed' || intentVerdict?.status === 'partial'
                  ? '의도가 다르게 읽혔습니다'
                  : '관객이 짚은 자리입니다'}
              </em>
            ) : intentStatus === 'ready' && intentVerdict?.status === 'reached' ? (
              <em>의도대로 읽혔습니다</em>
            ) : intentStatus === 'ready' && intentVerdict?.status === 'unknown' ? (
              <em>대조할 의도가 없습니다</em>
            ) : (
              <em>이 컷의 읽기입니다</em>
            )}
            {/* 키가 있다는 것을 알린다. 그림을 눌러도 되고 화살표로도
                걸을 수 있다. */}
            <kbd className="reading-walk-hint" aria-hidden="true">← →</kbd>
          </header>

          <div className="reading-workbench-body">
            <div className="reading-workbench-picture">
              <ReadingStage
                finding={place}
                shots={shots}
                range={range}
                reading={activeReading?.reading || null}
                stepAt={step.order}
                onWalkTo={(order) => onWalkTo?.({ condition: step.condition, order })}
                /* 문장은 트랙의 칸이 이미 말했다. 여기서는 그림만 크게
                   놓고, 근거는 옆에 따로 둔다. */
                showTrace={false}
              />
            </div>

            <aside className="reading-workbench-side">
              {activeSignal && (
                <section className={`reading-behavior-detail is-${activeSignal.action}`}>
                  <h4>보는 행동</h4>
                  <div>
                    <span aria-hidden="true">{activeAction.mark}</span>
                    <strong>{activeAction.label}</strong>
                  </div>
                  <p>{activeSignal.reason}</p>
                  {activeSignal.story_pull && (
                    <small>계속 보는 이유 · {activeSignal.story_pull}</small>
                  )}
                  {recheckOrders.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onWalkTo?.({ condition: step.condition, order: recheckOrders.at(-1) })}
                    >
                      S{recheckOrders.at(-1)} 다시 보기
                    </button>
                  )}
                </section>
              )}

              {/* 왜 그렇게 읽었나. 그림과 나란히 있어야 대조된다. */}
              {noticedCues.length > 0 && (
                <section className="reading-cues">
                  <h4>눈에 들어온 것</h4>
                  <ul>
                    {noticedCues.map((cue, index) => (
                      <li key={`${cue}-${index}`}>{cue}</li>
                    ))}
                  </ul>
                </section>
              )}

              {activeStep?.current_hypothesis && (
                <section className="reading-hypothesis">
                  <h4>여기까지 보고 든 생각</h4>
                  <p>{activeStep.current_hypothesis}</p>
                </section>
              )}

              {/* 의도가 안 닿았는가. **여기까지 보고 든 생각 바로 아래**에
                  둔다 — 감독이 방금 읽은 것이 관객의 생각이므로, 그것과
                  목적을 견주는 자리는 그 문장 옆이어야 눈이 옮겨가지 않는다.

                  감독에게 묻지는 않는다. 관객 읽기는 의도를 모르는 것이
                  원칙이라(7장) 답을 받아도 되먹일 수 없다. 고치는 일은
                  연출 검토가 렌즈로 맡는다. */}
              {finding?.intent?.intended && finding.intent.read_as && (
                <section className="reading-intent-gap">
                  <h4>의도와 다르게 읽힘</h4>
                  <dl>
                    <div>
                      <dt>의도한 것</dt>
                      <dd>{finding.intent.intended}</dd>
                    </div>
                    <div>
                      <dt>읽힌 것</dt>
                      <dd>{finding.intent.read_as}</dd>
                    </div>
                  </dl>
                  {finding.why_it_matters && (
                    <p className="reading-intent-cause">{finding.why_it_matters}</p>
                  )}
                </section>
              )}

              {activeStep?.open_question && (
                <section className="reading-question">
                  <h4>궁금한 채로 남은 것</h4>
                  <p>{activeStep.open_question}</p>
                </section>
              )}
            </aside>
          </div>
      </>
    </section>
  )
}
