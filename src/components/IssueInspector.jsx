import { useLayoutEffect, useRef, useState } from 'react'
import EvidenceStage from './EvidenceStage'
import { hasOverlay } from './evidenceSummary'
import { evidenceLineFor } from './evidenceSummary'
import './IssueInspector.css'

const LENSES = [
  { id: 'mise', label: '미장센', mark: 'M' },
  { id: 'camera', label: '촬영', mark: 'C' },
  { id: 'editing', label: '편집', mark: 'E' },
]

const anchorKindLabel = (kind) => ({
  shot: '컷',
  seam: '이음새',
  scene: '장면',
}[kind] || '')

/**
 * 선택한 Issue 하나를 읽는 자리.
 *
 * 트랙은 "어디"만, 이 카드는 "무엇이 왜 걸렸는지"만 담당한다. 기존 렌즈
 * 보고서를 다시 나열하지 않도록 evidence는 각 관점 안에서 접어 둔다.
 */
export default function IssueInspector({
  issue,
  issues = [],
  diagnosesById,
  relations = [],
  lensChecks = {},
  shots = [],
  range = null,
  relating = false,
  onCheckLens,
  onCompare,
  mainLensQuestion = null,
  onAnswerMainLensQuestion,
  answeringMainLensQuestion = false,
  revisionWorkspace = null,
  // 두 컷 사이에 펼칠 편집기와, 지금 무슨 조작인지·어느 컷이 빠지는지.
  // 편집 렌즈의 구조 변경은 여기서만 자리를 얻는다.
  seamEditor = null,
  seamOperation = null,
  removingPanel = null,
}) {
  // 지금 그림 위에 표시를 얹고 있는 렌즈. 그림은 그대로 있고 이것만
  // 바뀐다 (`LENS_TRACKS_UI.md` 4장).
  //
  // 어느 Issue에서 고른 것인지 함께 들고 있는다. Issue가 바뀌면 그 선택은
  // 무효다 — 이전 Issue에서 보던 렌즈가 남아 있으면 무엇을 보고 있는지
  // 어긋난다. effect로 되돌리면 한 번 잘못 그린 뒤에 고치는 셈이라
  // 렌더 중에 판정한다.
  const [picked, setPicked] = useState({ issueId: null, lens: null })
  const [lensMotion, setLensMotion] = useState(0)
  const lensStackRef = useRef(null)
  const [glassStyle, setGlassStyle] = useState(null)
  // 검토 방향마다 따로 담는다. 하나로 두면 다른 칸을 건드리는 순간 먼저
  // 쓴 내용이 지워진다 — 오른쪽에 여러 렌즈의 방향이 함께 놓일 수 있다.
  const [questionAnswers, setQuestionAnswers] = useState({})
  const [relationOpen, setRelationOpen] = useState({ issueId: null, relationKey: null })
  const [relationViewOpened, setRelationViewOpened] = useState({ issueId: null, open: false })
  const [overviewOpened, setOverviewOpened] = useState({ issueId: null, open: false })
  const activeLens = picked.issueId === issue?.id
    ? picked.lens
    : (issue?.origin_lens || null)
  const setActiveLens = (lens) => {
    if (lens === activeLens) return
    setPicked({ issueId: issue?.id, lens })
    // 렌즈 카드가 움직이는 대신, 같은 화면을 보는 초점이 짧게 바뀐다.
    setLensMotion((current) => current + 1)
  }
  // 카드 전체가 아니라, 흐름선 위의 작은 원형 광학 렌즈만 움직인다.
  // 실제 칸의 높이를 재므로 문장이 줄바꿈되어도 정확히 그 렌즈에 끼워진다.
  useLayoutEffect(() => {
    const stack = lensStackRef.current
    const slot = stack?.querySelector('.issue-lens-slot.active')
    if (!stack || !slot) {
      const frame = requestAnimationFrame(() => setGlassStyle(null))
      return () => cancelAnimationFrame(frame)
    }
    const measure = () => setGlassStyle({
      opacity: 1,
      transform: `translate(-28px, ${slot.offsetTop + (slot.offsetHeight - 20) / 2}px)`,
    })
    const frame = requestAnimationFrame(measure)
    const observer = new ResizeObserver(measure)
    observer.observe(stack)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [issue?.id, activeLens, lensMotion])
  const answerTextFor = (question) => questionAnswers[question?.id] || ''
  // 질문은 처음 발견한 렌즈 것만 있는 게 아니다. 뒤늦게 참여한 렌즈도
  // 화면만 봐서는 알 수 없는 것을 묻는다. 렌즈마다 그 카드 안에 둔다.
  const questionFor = (lensId) => {
    // 분석 결과가 막 도착한 순간에는 Track은 있지만 아직 고른 Issue가
    // 없을 수 있다. 이때 질문도 없는 상태로 둔다.
    if (lensId === issue?.origin_lens) return mainLensQuestion
    const raw = lensChecks[lensId]?.question
    if (!raw) return null
    return {
      id: raw.id || `${lensId}:${raw.prompt || raw.question}`,
      prompt: raw.prompt || raw.question || '',
    }
  }
  // 렌즈가 남긴 검토 방향. 화면만 봐서는 알 수 없어 감독이 확인해 줘야
  // 하는 것이다. 답은 세 렌즈 모두의 전제가 되므로(공유), 어느 카드에서
  // 입력하든 같다.
  const renderLensQuestion = (lens) => {
    const question = questionFor(lens.id)
    if (!question?.prompt) return null
    return (
      <div key={lens.id} className={`issue-lens-question lens-${lens.id}`}>
        <label htmlFor={`issue-question-${question.id}`}>
          <span aria-hidden="true">{lens.mark}</span>
          {lens.label} 검토 방향
        </label>
        <p>{question.prompt}</p>
        <textarea
          id={`issue-question-${question.id}`}
          rows={2}
          value={answerTextFor(question)}
          placeholder="확인한 내용을 짧게 적어 주세요"
          onChange={(event) => setQuestionAnswers((current) => ({
            ...current,
            [question.id]: event.target.value,
          }))}
        />
      </div>
    )
  }

  if (!issue) {
    return (
      <section className="issue-inspector empty" aria-label="선택한 검토 항목">
        <p>트랙의 점을 선택하면 이 자리에서 살펴볼 수 있습니다.</p>
      </section>
    )
  }

  const diagnosisIds = new Set(issue.diagnosis_ids || [])
  const perspectives = LENSES.map((lens) => {
    const diagnosis = [...diagnosisIds]
      .map((id) => diagnosesById.get(id))
      .find((entry) => entry?.lens === lens.id)
    return { lens, diagnosis, check: lensChecks[lens.id] || null }
  })
  // 관객이 짚은 자리는 먼저 발견한 렌즈가 없다. 그때 `perspectives[0]`로
  // 떨어뜨리면 미장센이 처음 발견한 것처럼 보인다 — 아무 렌즈도 아직
  // 보지 않았다는 것이 이 자리의 사실이다.
  const primaryPerspective = perspectives.find(({ lens }) => lens.id === issue.origin_lens)
    || (issue.from_viewer ? null : perspectives[0])
  // 처음 Issue에 포함된 렌즈와, 감독이 직접 더해 확인한 렌즈만 흐름에
  // 남긴다. 아직 참여하지 않은 렌즈를 빈 카드로 미리 늘어놓지 않는다.
  //
  // **부른 순서대로 쌓는다.** `LENSES`는 미장센·촬영·편집 고정 순서라,
  // 그대로 거르면 나중에 부른 미장센이 먼저 부른 촬영보다 위로 간다.
  // 그러면 아래로 쌓이는 것이 "이 Issue에 새로 참여시킨 관점"이라는
  // 뜻을 잃는다 (`LENS_TRACKS_UI.md` 4장).
  //
  // 진단으로 처음부터 들어와 있던 렌즈(`addedAt`이 없다)는 감독이 부른
  // 것이 아니므로 부른 렌즈들보다 앞에 둔다.
  const joinedPerspectives = perspectives.filter(({ lens, diagnosis, check }) => (
    lens.id !== primaryPerspective?.lens.id && Boolean(diagnosis || check)
  )).sort((a, b) => (
    (a.check?.addedAt ?? 0) - (b.check?.addedAt ?? 0)
  ))
  const visiblePerspectives = [primaryPerspective, ...joinedPerspectives].filter(Boolean)
  const availablePerspectives = perspectives.filter(({ lens, diagnosis, check }) => (
    lens.id !== primaryPerspective?.lens.id && !diagnosis && !check
  ))
  // 새 렌즈를 부르는 일은 아직 왼쪽 증거를 바꾸지 않는다. 응답이 실제로
  // 생긴 뒤에만 그 렌즈를 눌러 같은 그림을 다른 표시로 본다.
  const addLens = (lensId) => onCheckLens?.(lensId)
  const displayLens = visiblePerspectives.some(({ lens }) => lens.id === activeLens)
    ? activeLens
    : primaryPerspective?.lens.id || visiblePerspectives[0]?.lens.id || null
  const isOverviewOpened = overviewOpened.issueId === issue.id && overviewOpened.open
  // 목록은 "누가 참여했는지"를 빠르게 훑는 자리다. 진단이 없는 렌즈의
  // 빈 상태까지 나열하지 않아, 분석 전문을 세 번 복제한 화면이 되지 않는다.
  const overviewEntries = visiblePerspectives.map(({ lens, diagnosis, check }) => {
    // 처음 분석 결과는 `{ lens, diagnosis: { diagnosis: '…' } }`로 한 겹
    // 감싸져 있고, 추가 검토 결과는 바로 diagnosis 객체다. 객체를 JSX에
    // 넣으면 렌더가 멈추므로 최종 문장만 정상화한다.
    const reading = diagnosis?.diagnosis?.diagnosis
      || check?.diagnosis?.diagnosis
      || check?.reading
      || ''
    return {
      lens,
      reading: typeof reading === 'string' ? reading : '',
      stance: diagnosis?.stance || check?.stance || (diagnosis || check?.diagnosis ? 'change' : check?.status === 'ready' ? 'keep' : 'different'),
      loading: check?.status === 'loading' || (lens.id === issue.origin_lens && answeringMainLensQuestion),
      clear: check?.status === 'ready' && !diagnosis && !check?.diagnosis && !check?.reading,
    }
  })
  // 같은 자리에 걸린 다른 Issue. 두 렌즈가 같은 컷을 짚었는데 관계가
  // 잡히지 않으면 여기 남는다 — 같은 이유일 수도, 다른 이유일 수도
  // 있고 그 판단은 감독이 한다 (`LENS_TRACKS_UI.md` 3장).
  //
  // 시스템이 임의로 합치지 않는다. 다른 concern을 한 카드에 섞으면
  // 무엇을 판정하는지 알 수 없게 된다.
  const siblings = issues.filter((entry) => (
    entry.id !== issue.id && entry.anchor === issue.anchor
  ))

  // 지금 그림에 표시를 얹을 진단. 고른 렌즈의 것이 없으면 처음 짚은
  // 렌즈의 것으로 둔다 — 무대가 비어 보이지 않게.
  const activeEntry = perspectives.find(({ lens }) => lens.id === displayLens)
  const activeDiagnosis = activeEntry?.diagnosis?.diagnosis
    || activeEntry?.check?.diagnosis
    || null
  // 답은 모아서 한 번에 보낸다. 하나씩 보내면 답할 때마다 세 렌즈가 다시
  // 돌고, 그 사이 결과가 갱신되며 아직 답하지 않은 질문이 사라질 수 있다.
  const pendingQuestions = visiblePerspectives
    .map(({ lens }) => ({ lens, question: questionFor(lens.id) }))
    .filter(({ question }) => question?.prompt)
  const filledAnswers = pendingQuestions.flatMap(({ question }) => {
    const answer = answerTextFor(question).trim()
    return answer ? [{ question, answer }] : []
  })
  const submitAnswers = () => {
    if (filledAnswers.length === 0) return
    onAnswerMainLensQuestion?.(filledAnswers.map(({ question, answer }) => ({
      level: `${issue.anchor} ${anchorKindLabel(issue.anchor_kind) || '검토'}`,
      question: question.prompt,
      answer,
    })))
    setQuestionAnswers({})
  }
  const issueDiagnosisIds = new Set(issue.diagnosis_ids || [])
  const relatedRelations = relations.filter((relation) => (
    (relation.diagnosis_ids || []).some((id) => issueDiagnosisIds.has(id))
  ))
  // 선택 Issue를 처음 짚은 Lens가 그래프의 중심이다. 다른 Lens는 이
  // 판단과 어떤 관계를 맺는지 위·아래 가지로 붙는다.
  const relationCenterLens = LENSES.find((lens) => lens.id === issue.origin_lens)
    || primaryPerspective.lens
  const relationLanes = relatedRelations.map((relation) => {
    const connected = (relation.lenses || []).filter((lensId) => lensId !== relationCenterLens.id)
    const otherLens = LENSES.find((lens) => lens.id === connected[0])
      || LENSES.find((lens) => lens.id !== relationCenterLens.id && (relation.lenses || []).includes(lens.id))
    return otherLens ? { relation, otherLens } : null
  }).filter(Boolean)
  const relationBranches = [
    { nodeX: 40, nodeY: 94, labelX: 76, labelY: 62, path: 'M130 27 Q88 52 40 94' },
    { nodeX: 220, nodeY: 94, labelX: 184, labelY: 62, path: 'M130 27 Q172 52 220 94' },
  ]
  const comparedLensCount = visiblePerspectives.filter(({ diagnosis, check }) => (
    Boolean(diagnosis) || check?.status === 'ready'
  )).length
  const relationKeyOf = (relation) => `${relation.type}:${(relation.diagnosis_ids || []).join(':')}`
  const openRelationView = () => {
    setRelationViewOpened({ issueId: issue.id, open: true })
    if (relatedRelations.length === 0) onCompare?.()
  }
  const isRelationViewOpened = relationViewOpened.issueId === issue.id && relationViewOpened.open
  // 렌즈별 보기는 이 Issue의 근거만 더 읽는 자리다. 범위 전체의 네 층위
  // 판정이나 수정 실행을 끌어오지 않는다 — 그것들은 이 Issue 바깥의 판단을
  // 섞거나 `수정하기` 흐름을 중복시킨다.
  const rationaleFor = (diagnosis) => {
    if (!diagnosis || !(diagnosis.criterion || diagnosis.evidence?.length || diagnosis.theory_basis)) return null
    return (
      <details className="issue-lens-rationale">
        <summary>이 판단의 근거</summary>
        <div>
          {diagnosis.criterion && <p><em>이 Lens의 기준</em>{diagnosis.criterion}</p>}
          {diagnosis.evidence?.length > 0 && (
            <div>
              <em>화면에서 본 것</em>
              <ul>{diagnosis.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}</ul>
            </div>
          )}
          {diagnosis.theory_basis && <p><em>참고한 책과 핵심 근거</em>{diagnosis.theory_basis}</p>}
        </div>
      </details>
    )
  }
  // 오른쪽 관점 흐름의 길이는 왼쪽의 판단 위치를 밀면 안 된다. 활성
  // 렌즈의 설명은 EvidenceStage와 같은 왼쪽 칸 안에 두어, 사진 바로
  // 아래에서 항상 이어 읽는다.
  const activeLensReading = !revisionWorkspace && (
    <div
      key={`${issue.id}:${displayLens}:${lensMotion}`}
      className={`issue-lens-view lens-switch lens-${displayLens}`}
    >
      <div className="issue-perspectives">
        {visiblePerspectives.filter(({ lens }) => lens.id === displayLens).map(({ lens, diagnosis, check }) => {
          const isOrigin = lens.id === issue.origin_lens
          const checking = check?.status === 'loading'
          const rechecking = isOrigin && answeringMainLensQuestion
          const checked = check?.status === 'ready'
          const checkDiagnosis = check?.diagnosis
          const visibleDiagnosis = diagnosis?.diagnosis || checkDiagnosis
          const checkReading = check?.reading || ''
          if (!diagnosis) {
            return (
              <section key={lens.id} className={`issue-perspective lens-${lens.id} ${lens.id === displayLens ? 'active' : ''} ${checked && (checkDiagnosis || checkReading) ? 'checked-response' : checked ? 'checked-clear' : 'unchecked'}`}>
                {!(checked && (checkDiagnosis || checkReading)) && <header><span>{checked ? '◌' : '○'}</span><strong>{lens.label}</strong></header>}
                {rechecking ? <p className="issue-lens-rechecking"><i className="issue-lens-spinner" aria-hidden="true" />입력한 내용을 반영해 다시 검토하는 중입니다.</p>
                  : checking ? <p>이 위치를 확인하는 중입니다.</p>
                    : check?.status === 'error' ? <><p>{check.error || '확인하지 못했습니다.'}</p><button type="button" onClick={() => onCheckLens?.(lens.id)}>다시 확인</button></>
                      : checked && (checkDiagnosis || checkReading) ? (
                        <button type="button" className="issue-perspective-pick" onClick={() => setActiveLens(lens.id)} aria-pressed={lens.id === displayLens}>
                          <header><span>◐</span><strong>{lens.label}</strong></header>
                          <p className="issue-observation">{checkDiagnosis?.diagnosis || checkReading}</p>
                          {checkDiagnosis && evidenceLineFor(checkDiagnosis) && <p className="issue-perspective-evidence"><em>근거</em>{evidenceLineFor(checkDiagnosis).label && <strong>{evidenceLineFor(checkDiagnosis).label}</strong>}<span>{evidenceLineFor(checkDiagnosis).detail}</span></p>}
                        </button>
                      ) : checked ? <p>이 관점에서는 짚을 것을 찾지 못했습니다.</p> : null}
                {checkDiagnosis && rationaleFor(checkDiagnosis)}
              </section>
            )
          }
          const line = evidenceLineFor(visibleDiagnosis)
          return (
            <section key={lens.id} className={`issue-perspective lens-${lens.id} active`}>
              <button type="button" className="issue-perspective-pick" onClick={() => setActiveLens(lens.id)} aria-pressed>
                <header><span>{isOrigin ? '●' : '◐'}</span><strong>{lens.label}</strong>{rechecking ? <em className="issue-lens-rechecking-label"><i className="issue-lens-spinner" aria-hidden="true" />다시 검토 중</em> : isOrigin && <em>처음 발견</em>}</header>
                <p className="issue-observation">{visibleDiagnosis.diagnosis}</p>
                {line && <p className="issue-perspective-evidence"><em>근거</em>{line.label && <strong>{line.label}</strong>}<span>{line.detail}</span></p>}
              </button>
              {rationaleFor(visibleDiagnosis)}
            </section>
          )
        })}
      </div>
    </div>
  )
  // 모아 보기는 오른쪽 흐름의 축소판이 아니다. 하나의 큰 증거 사진 아래에
  // 참여 Lens의 판단을 세로로 놓아, 같은 장면을 두고 무엇을 다르게 읽었는지
  // 한 번에 비교한다. 한 항목을 누르면 다시 그 Lens의 상세 읽기로 들어간다.
  const overviewReading = !revisionWorkspace && (
    <section className="issue-lens-overview issue-lens-overview-on-canvas" aria-label="참여 Lens 판단 모아 보기">
      <span className="issue-lens-overview-label">이 장면을 본 판단</span>
      {overviewEntries.map(({ lens, reading, stance, loading, clear }) => (
        <button
          key={lens.id}
          type="button"
          className={`issue-lens-overview-item lens-${lens.id}`}
          onClick={() => {
            setActiveLens(lens.id)
            setOverviewOpened({ issueId: issue.id, open: false })
          }}
        >
          <b>{lens.mark}</b>
          <strong>{lens.label}</strong>
          <em className={`issue-lens-stance stance-${stance}`}>
            {stance === 'keep' ? '현재 유지' : stance === 'different' ? '다른 concern' : '수정 필요'}
          </em>
          <span>
            {loading ? '검토 중…' : clear ? '이 관점에서는 별도 문제를 찾지 못했습니다.' : reading || '판단을 기다리는 중입니다.'}
          </span>
        </button>
      ))}
    </section>
  )

  return (
    <section
      className="issue-inspector"
      aria-label={`${issue.anchor} ${issue.title}`}
    >
      <div className="issue-inspector-workspace">
        <div className={`issue-evidence-stage ${revisionWorkspace ? 'has-revision-workspace' : ''} ${seamEditor ? 'has-seam-edit' : ''}`}>
          {/* 이음새를 고치는 중이면 두 컷을 치우지 않는다. 삽입·나누기·
              합치기·빼기는 전부 두 컷 **사이**의 일이라, 그 자리가 화면에서
              사라지면 무엇을 고치는 중인지 알 수 없다. 이때는 무대를 남기고
              펼친 이음새 안에 편집기를 끼운 뒤, 수정안 목록만 아래에 둔다
              (`LENS_TRACKS_UI.md` 5장 — 시퀀스가 곧 캔버스다). */}
          {revisionWorkspace && !seamEditor ? (
            <div className="issue-revision-stage">
              {revisionWorkspace}
            </div>
          ) : (
            <div
              key={`${issue.id}:${displayLens}:${lensMotion}`}
              className={`issue-evidence-focus lens-${displayLens}`}
            >
              <EvidenceStage
                issue={issue}
                diagnosis={activeDiagnosis}
                shots={shots}
                lensId={displayLens}
                range={range}
                seamEditor={seamEditor}
                seamOperation={seamOperation}
                removingPanel={removingPanel}
              />
              {isOverviewOpened ? overviewReading : activeLensReading}
              {revisionWorkspace && (
                <div className="issue-revision-stage issue-revision-stage-under">
                  {revisionWorkspace}
                </div>
              )}
            </div>
          )}

        <aside className="issue-cross-lens" aria-label="이 이슈의 렌즈 흐름">
          <div className="issue-cross-lens-heading">
            <span className="issue-cross-lens-label">관점 흐름</span>
            {visiblePerspectives.length >= 2 && (
              <div className="issue-view-switch" aria-label="Lens 판단 보기 방식">
                <button
                  type="button"
                  className={!isOverviewOpened ? 'active' : ''}
                  aria-pressed={!isOverviewOpened}
                onClick={() => setOverviewOpened({ issueId: issue.id, open: false })}
              >
                  렌즈별
                </button>
                <button
                  type="button"
                  className={isOverviewOpened ? 'active' : ''}
                  aria-pressed={isOverviewOpened}
                  onClick={() => setOverviewOpened({ issueId: issue.id, open: true })}
                >
                  <i className="issue-overview-icon" aria-hidden="true"><b /><b /><b /></i>
                  모아 보기
                </button>
              </div>
            )}
          </div>
      <header className="issue-inspector-heading">
        <span>
          {issue.anchor}{anchorKindLabel(issue.anchor_kind) && ` · ${anchorKindLabel(issue.anchor_kind)}`}
          {/* 렌즈가 짚은 것이 아니라 관객이 갈린 자리다. 밝히지 않으면
              감독이 이것을 진단으로 읽는다. */}
          {issue.from_viewer && ' · 관객이 갈린 자리'}
        </span>
        <h3>{issue.title}</h3>
        {issue.from_viewer && (
          <>
            {issue.detail && <p>{issue.detail}</p>}
            {/* 관객들이 실제로 뭐라고 읽었는가. 렌즈가 무엇을 볼지
                정하는 근거이므로 여기서 한 번 보인다. */}
            {(issue.viewer_readings || []).length > 0 && (
              <ul className="issue-viewer-readings">
                {issue.viewer_readings.map((entry, index) => (
                  <li key={`${entry.label}-${index}`}>
                    <em>{entry.label}</em>
                    {entry.line}
                  </li>
                ))}
              </ul>
            )}
            <p className="issue-viewer-hint">
              아직 아무 렌즈도 이 자리를 보지 않았습니다. 아래에서 골라 주세요.
            </p>
          </>
        )}
      </header>

      {!isOverviewOpened && (
      <nav ref={lensStackRef} className="issue-lens-stack" aria-label="이 이슈에 참여한 렌즈">
        <span className="issue-lens-glass" style={glassStyle} aria-hidden="true" />
        {visiblePerspectives.map(({ lens, diagnosis, check }, index) => {
          const checking = check?.status === 'loading'
          const rechecking = lens.id === issue.origin_lens && answeringMainLensQuestion
          const checked = check?.status === 'ready'
          const hasDiagnosis = Boolean(diagnosis || check?.diagnosis)
          // 다른 렌즈가 기존 Issue를 강화하는 summary를 남길 수 있다. 이는
          // 이 렌즈가 diagnosis로 문제를 등록한 것은 아니지만, `이상 없음`도 아니다.
          const agreesWithIssue = Boolean(!diagnosis && !check?.diagnosis && check?.reading)
          const isActive = lens.id === displayLens
          const state = rechecking
            ? '다시 검토 중'
            : lens.id === issue.origin_lens
            ? '● 처음 발견'
            : checking
              ? '◌ 확인 중'
              : hasDiagnosis
                ? '◐ 이 렌즈도 문제를 짚음'
                : agreesWithIssue
                  ? '◐ 이 문제에 동의'
                : checked
                  ? '◌ 이상 없음'
                  : '확인 중'
          return (
            // 렌즈별 흐름은 판단을 고르는 자리다. 실제 수정은 별도
            // `수정하기`에서만 시작해 판단·개입을 섞지 않는다.
            <div
              key={lens.id}
              className={`issue-lens-slot lens-${lens.id} ${index === 0 ? 'primary' : 'added'} ${isActive ? 'active' : ''} ${hasDiagnosis || agreesWithIssue ? 'ready' : checking || rechecking ? 'loading' : ''}`}
            >
              <button
                type="button"
                className="issue-lens-pick"
                onClick={() => setActiveLens(lens.id)}
                aria-pressed={isActive}
              >
                <span>{lens.mark}</span>
                <strong>{lens.label}</strong>
                <em>{rechecking && <i className="issue-lens-spinner" aria-hidden="true" />}{state}</em>
              </button>
            </div>
          )
        })}
      </nav>
      )}

      {availablePerspectives.length > 0 && (
        <section className="issue-lens-additions" aria-label="다른 렌즈로 검토하기">
          <span>다른 렌즈로 검토하기</span>
          <div>
            {availablePerspectives.map(({ lens }) => (
              <button type="button" key={lens.id} onClick={() => addLens(lens.id)}>
                <b>{lens.mark}</b>{lens.label} 렌즈로 검토하기
              </button>
            ))}
          </div>
        </section>
      )}

      {comparedLensCount >= 2 && (
        <section className="issue-perspective-comparison" aria-label="관계 보기">
          <button
            type="button"
            className="issue-perspective-comparison-trigger"
            onClick={openRelationView}
            disabled={relating}
          >
            {relating ? '관계 정리 중…' : relatedRelations.length > 0 ? '관계 보기' : '관계 보기'}
          </button>
          {isRelationViewOpened && relationLanes.length > 0 && (
            <div className="issue-relation-map">
              <svg className="issue-relation-svg" viewBox="0 0 260 112" role="img" aria-label="Lens 관계도">
                <defs>
                  <marker id="issue-relation-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto">
                    <path d="M0 0 L8 4 L0 8 Z" />
                  </marker>
                </defs>
                <g
                  className={`issue-relation-svg-node lens-${relationCenterLens.id}`}
                  role="button"
                  tabIndex="0"
                  aria-label={`${relationCenterLens.label} Lens 판단 보기`}
                  onClick={() => setActiveLens(relationCenterLens.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setActiveLens(relationCenterLens.id)
                  }}
                >
                  <circle cx="130" cy="15" r="12" />
                  <text x="130" y="19" textAnchor="middle">{relationCenterLens.mark}</text>
                </g>
                {relationLanes.slice(0, 2).map(({ relation, otherLens }, index) => {
            const key = relationKeyOf(relation)
            const open = relationOpen.issueId === issue.id && relationOpen.relationKey === key
            const type = relation.type === 'conflict' ? 'Tension' : relation.type === 'agreement' ? 'Agreement' : 'Consequence'
            const branch = relationBranches[index]
            const labelWidth = type === 'Agreement' ? 66 : type === 'Tension' ? 52 : 78
            return (
              <g key={key} className={`issue-relation-svg-branch is-${relation.type}`}>
                <path d={branch.path} markerEnd={relation.type === 'consequence' ? 'url(#issue-relation-arrow)' : undefined} />
                <g
                  className="issue-relation-svg-edge"
                  role="button"
                  tabIndex="0"
                  aria-label={`${type} 관계 설명 보기`}
                  onClick={() => setRelationOpen(open ? { issueId: issue.id, relationKey: null } : { issueId: issue.id, relationKey: key })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setRelationOpen(open ? { issueId: issue.id, relationKey: null } : { issueId: issue.id, relationKey: key })
                  }}
                >
                  <rect x={branch.labelX - labelWidth / 2} y={branch.labelY - 10} width={labelWidth} height="18" rx="9" />
                  <text x={branch.labelX} y={branch.labelY + 3} textAnchor="middle">{type}</text>
                </g>
                <g
                  className={`issue-relation-svg-node lens-${otherLens.id}`}
                  role="button"
                  tabIndex="0"
                  aria-label={`${otherLens.label} Lens 판단 보기`}
                  onClick={() => setActiveLens(otherLens.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setActiveLens(otherLens.id)
                  }}
                >
                  <circle cx={branch.nodeX} cy={branch.nodeY} r="12" />
                  <text x={branch.nodeX} y={branch.nodeY + 4} textAnchor="middle">{otherLens.mark}</text>
                </g>
              </g>
            )
              })}
              </svg>
              {relationLanes.slice(0, 2).map(({ relation }) => {
                const key = relationKeyOf(relation)
                const open = relationOpen.issueId === issue.id && relationOpen.relationKey === key
                if (!open) return null
                const summaryLabel = relation.type === 'agreement'
                  ? '함께 보는 문제'
                  : relation.type === 'conflict'
                    ? '갈리는 판단'
                    : '이어지는 영향'
                return (
                  <div key={`${key}:summary`} className="issue-relation-summary">
                    <strong><em>{summaryLabel}</em>{relation.summary}</strong>
                  </div>
                )
              })}
            </div>
          )}
          {isRelationViewOpened && !relating && relatedRelations.length === 0 && (
            <p className="issue-perspective-comparison-empty">두 Lens의 관계를 정리해 보세요.</p>
          )}
        </section>
      )}

      {/* 검토 방향도 조작이다. 오른쪽은 감독이 렌즈를 고르고 확인 내용을
          적는 자리이며, 그 결과는 왼쪽 카드에 나온다. */}
      {pendingQuestions.length > 0 && (
        <form
          className="issue-lens-questions"
          onSubmit={(event) => {
            event.preventDefault()
            submitAnswers()
          }}
        >
          {pendingQuestions.map(({ lens }) => renderLensQuestion(lens))}
          <button
            type="submit"
            className="issue-lens-questions-submit"
            disabled={answeringMainLensQuestion || filledAnswers.length === 0}
          >
            {answeringMainLensQuestion
              ? '검토 방향을 반영하는 중…'
              : filledAnswers.length > 1
                ? `입력한 ${filledAnswers.length}개 방향으로 다시 검토`
                : '이 방향으로 다시 검토'}
          </button>
        </form>
      )}
        </aside>

      {activeLensReading == null && !revisionWorkspace && (
      <div
        key={`${issue.id}:${displayLens}:${lensMotion}`}
        className={`issue-lens-view lens-switch lens-${displayLens}`}
      >
        {/* 화면과 판단을 함께 바꾼다. 렌즈가 바뀌면 같은 Issue를 보는
            방식 전체가 전환되고, 근거 없는 색만 남지 않는다. */}
        <div className="issue-perspectives">
          {visiblePerspectives.filter(({ lens }) => lens.id === displayLens).map(({ lens, diagnosis, check }) => {
          const isOrigin = lens.id === issue.origin_lens
          const checking = check?.status === 'loading'
          const rechecking = isOrigin && answeringMainLensQuestion
          const checked = check?.status === 'ready'
          const checkDiagnosis = check?.diagnosis
          const visibleDiagnosis = diagnosis?.diagnosis || checkDiagnosis
          const checkReading = check?.reading || ''
          if (!diagnosis) {
            return (
              <section key={lens.id} className={`issue-perspective lens-${lens.id} ${lens.id === displayLens ? 'active' : ''} ${checked && (checkDiagnosis || checkReading) ? 'checked-response' : checked ? 'checked-clear' : 'unchecked'}`}>
                {!(checked && (checkDiagnosis || checkReading)) && (
                  <header>
                    {/* 봤지만 문제를 못 찾은 것(◌)과 아직 안 본 것(○)은
                        다르다. 같게 표시하면 감독이 침묵을 승인으로
                        읽는다 (LENS_TRACKS_UI.md 4장). */}
                    <span>{checked ? '◌' : '○'}</span>
                    <strong>{lens.label}</strong>
                  </header>
                )}
                {rechecking ? (
                  <p className="issue-lens-rechecking"><i className="issue-lens-spinner" aria-hidden="true" />입력한 내용을 반영해 다시 검토하는 중입니다.</p>
                ) : checking ? (
                  <p>이 위치를 확인하는 중입니다.</p>
                ) : check?.status === 'error' ? (
                  <>
                    <p>{check.error || '확인하지 못했습니다.'}</p>
                    <button type="button" onClick={() => onCheckLens?.(lens.id)}>다시 확인</button>
                  </>
                ) : checked && (checkDiagnosis || checkReading) ? (
                  <>
                    <button
                      type="button"
                      className="issue-perspective-pick"
                      onClick={() => setActiveLens(lens.id)}
                      aria-pressed={lens.id === displayLens}
                      title={lens.id === displayLens
                        ? (hasOverlay(checkDiagnosis, issue?.anchor)
                          ? '지금 그림에 표시 중'
                          : '지금 이 관점으로 보는 중 · 그림에 그릴 표시는 없다')
                        : `${lens.label} 관점으로 보기`}
                    >
                      <header>
                        <span>◐</span>
                        <strong>{lens.label}</strong>
                      </header>
                      <p className="issue-observation">{checkDiagnosis?.diagnosis || checkReading}</p>
                      {checkDiagnosis && evidenceLineFor(checkDiagnosis) && (
                        <p className="issue-perspective-evidence">
                          <em>근거</em>
                          {evidenceLineFor(checkDiagnosis).label && (
                            <strong>{evidenceLineFor(checkDiagnosis).label}</strong>
                          )}
                          <span>{evidenceLineFor(checkDiagnosis).detail}</span>
                        </p>
                      )}
                    </button>
                  </>
                ) : checked ? (
                  <p>이 관점에서는 짚을 것을 찾지 못했습니다.</p>
                ) : checking ? (
                  <p>이 위치를 이 관점에서 확인하는 중입니다.</p>
                ) : null}
              </section>
            )
          }
          const line = evidenceLineFor(visibleDiagnosis)
          const isActive = lens.id === displayLens
          return (
            <section
              key={lens.id}
              className={`issue-perspective lens-${lens.id} ${isActive ? 'active' : ''}`}
            >
              {/* 카드를 누르면 그 렌즈의 표시가 그림에 얹힌다. 렌즈를
                  고르는 일과 그 판단을 읽는 일이 같은 자리에서 일어난다. */}
              <button
                type="button"
                className="issue-perspective-pick"
                onClick={() => setActiveLens(lens.id)}
                aria-pressed={isActive}
                title={isActive
                  ? (hasOverlay(visibleDiagnosis, issue?.anchor)
                    ? '지금 그림에 표시 중'
                    : '지금 이 관점으로 보는 중 · 그림에 그릴 표시는 없다')
                  : `${lens.label} 관점으로 보기`}
              >
                <header>
                  <span>{isOrigin ? '●' : '◐'}</span>
                  <strong>{lens.label}</strong>
                  {rechecking
                    ? <em className="issue-lens-rechecking-label"><i className="issue-lens-spinner" aria-hidden="true" />다시 검토 중</em>
                    : isOrigin && <em>처음 발견</em>}
                </header>
                <p className="issue-observation">{visibleDiagnosis.diagnosis}</p>
                {line && (
                  <p className="issue-perspective-evidence">
                    <em>근거</em>
                    {line.label && <strong>{line.label}</strong>}
                    <span>{line.detail}</span>
                  </p>
                )}
              </button>
            </section>
          )
          })}
        </div>
      </div>
      )}
        </div>
      </div>

      {/* 관계를 아직 찾는 중. 잠시 뒤 이 Issue가 옆 것과 합쳐질 수 있다. */}
      {relating && siblings.length > 0 && (
        <p className="issue-inspector-relating" role="status">
          이 자리의 다른 관점과 같은 문제인지 확인하는 중입니다.
        </p>
      )}

    </section>
  )
}
