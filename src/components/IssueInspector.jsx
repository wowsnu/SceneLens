import { useRef, useState } from 'react'
import EvidenceStage from './EvidenceStage'
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
  lensChecks = {},
  shots = [],
  range = null,
  relating = false,
  onCheckLens,
  onSelectIssue,
  onRevise,
}) {
  // 지금 그림 위에 표시를 얹고 있는 렌즈. 그림은 그대로 있고 이것만
  // 바뀐다 (`LENS_TRACKS_UI.md` 4장).
  //
  // 어느 Issue에서 고른 것인지 함께 들고 있는다. Issue가 바뀌면 그 선택은
  // 무효다 — 이전 Issue에서 보던 렌즈가 남아 있으면 무엇을 보고 있는지
  // 어긋난다. effect로 되돌리면 한 번 잘못 그린 뒤에 고치는 셈이라
  // 렌더 중에 판정한다.
  const [picked, setPicked] = useState({ issueId: null, lens: null })
  const [lensTransition, setLensTransition] = useState('forward')
  const inspectorRef = useRef(null)
  const activeLens = picked.issueId === issue?.id
    ? picked.lens
    : (issue?.origin_lens || null)
  const setActiveLens = (lens, direction = null) => {
    if (lens === activeLens) return
    const currentIndex = LENSES.findIndex((item) => item.id === activeLens)
    const nextIndex = LENSES.findIndex((item) => item.id === lens)
    setLensTransition(direction || (nextIndex > currentIndex ? 'forward' : 'back'))
    setPicked({ issueId: issue?.id, lens })
  }
  const moveLens = (direction) => {
    const currentIndex = Math.max(0, LENSES.findIndex((item) => item.id === activeLens))
    const nextIndex = (currentIndex + direction + LENSES.length) % LENSES.length
    setActiveLens(LENSES[nextIndex].id, direction > 0 ? 'forward' : 'back')
  }
  const handleLensKey = (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      moveLens(-1)
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      moveLens(1)
    }
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
  const origin = perspectives.find(({ lens }) => lens.id === issue.origin_lens)?.diagnosis
    || perspectives.find(({ diagnosis }) => diagnosis)?.diagnosis
  const criterion = origin?.diagnosis?.criterion || ''

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
  const activeEntry = perspectives.find(({ lens }) => lens.id === activeLens)
  const activeDiagnosis = activeEntry?.diagnosis?.diagnosis
    || activeEntry?.check?.diagnosis
    || null

  return (
    <section
      ref={inspectorRef}
      className="issue-inspector"
      aria-label={`${issue.anchor} ${issue.title}`}
      tabIndex={-1}
      onPointerDown={() => inspectorRef.current?.focus()}
      onKeyDown={handleLensKey}
    >
      <header className="issue-inspector-heading">
        <span>{issue.anchor}{anchorKindLabel(issue.anchor_kind) && ` · ${anchorKindLabel(issue.anchor_kind)}`}</span>
        <h3>{issue.title}</h3>
        {criterion && <p>{criterion}</p>}
      </header>

      <nav className="issue-lens-deck" aria-label="이 이슈를 보는 렌즈">
        {perspectives.map(({ lens, diagnosis, check }) => {
          const checking = check?.status === 'loading'
          const checked = check?.status === 'ready'
          const hasDiagnosis = Boolean(diagnosis || check?.diagnosis)
          const hasReading = Boolean(diagnosis || check?.diagnosis || check?.reading)
          const isActive = lens.id === activeLens
          return (
            <button
              key={lens.id}
              type="button"
              className={`lens-${lens.id} ${isActive ? 'active' : ''} ${hasReading ? 'ready' : checking ? 'loading' : ''}`}
              onClick={() => setActiveLens(lens.id)}
              aria-pressed={isActive}
            >
              <span>{lens.mark}</span>
              <strong>{lens.label}</strong>
              <em>{lens.id === issue.origin_lens ? '처음 발견' : checking ? '반응 중' : hasDiagnosis ? '반응 · 수정 필요' : checked ? '반응 완료' : '반응 대기'}</em>
            </button>
          )
        })}
      </nav>

      <div key={activeLens} className={`issue-lens-view lens-transition-${lensTransition}`}>
        {/* 화면과 판단을 함께 바꾼다. 렌즈가 바뀌면 같은 Issue를 보는
            방식 전체가 전환되고, 근거 없는 색만 남지 않는다. */}
        <EvidenceStage
          issue={issue}
          diagnosis={activeDiagnosis}
          shots={shots}
          lensId={activeLens}
          range={range}
        />

        <div className="issue-perspectives">
          {perspectives.filter(({ lens }) => lens.id === activeLens).map(({ lens, diagnosis, check }) => {
          const isOrigin = lens.id === issue.origin_lens
          const checking = check?.status === 'loading'
          const checked = check?.status === 'ready'
          const checkDiagnosis = check?.diagnosis
          const visibleDiagnosis = diagnosis?.diagnosis || checkDiagnosis
          const checkReading = check?.reading || ''
          if (!diagnosis) {
            return (
              <section key={lens.id} className={`issue-perspective lens-${lens.id} ${lens.id === activeLens ? 'active' : ''} ${checked && (checkDiagnosis || checkReading) ? 'checked-response' : checked ? 'checked-clear' : 'unchecked'}`}>
                {!(checked && (checkDiagnosis || checkReading)) && (
                  <header>
                    {/* 봤지만 문제를 못 찾은 것(◌)과 아직 안 본 것(○)은
                        다르다. 같게 표시하면 감독이 침묵을 승인으로
                        읽는다 (LENS_TRACKS_UI.md 4장). */}
                    <span>{checked ? '◌' : '○'}</span>
                    <strong>{lens.label}</strong>
                  </header>
                )}
                {checking ? (
                  <p>이 위치를 확인하는 중입니다.</p>
                ) : check?.status === 'error' ? (
                  <>
                    <p>{check.error || '확인하지 못했습니다.'}</p>
                    <button type="button" onClick={() => onCheckLens?.(lens.id)}>다시 확인</button>
                  </>
                ) : checked && (checkDiagnosis || checkReading) ? (
                  <button
                    type="button"
                    className="issue-perspective-pick"
                    onClick={() => setActiveLens(lens.id)}
                    aria-pressed={lens.id === activeLens}
                    title={lens.id === activeLens ? '지금 그림에 표시 중' : `${lens.label} 관점으로 보기`}
                  >
                    <header>
                      <span>◐</span>
                      <strong>{lens.label}</strong>
                      {lens.id === activeLens && (
                        <span className="issue-perspective-showing">그림에 표시 중</span>
                      )}
                    </header>
                    <p>{checkDiagnosis?.diagnosis || checkReading}</p>
                    {checkDiagnosis && evidenceLineFor(checkDiagnosis) && (
                      <p className="issue-perspective-evidence">
                        {evidenceLineFor(checkDiagnosis).label && (
                          <strong>{evidenceLineFor(checkDiagnosis).label}</strong>
                        )}
                        <span>{evidenceLineFor(checkDiagnosis).detail}</span>
                      </p>
                    )}
                  </button>
                ) : checked ? (
                  <p>이 관점에서는 짚을 것을 찾지 못했습니다.</p>
                ) : (
                  <p>이 위치를 이 관점에서 확인하는 중입니다.</p>
                )}
              </section>
            )
          }
          const line = evidenceLineFor(visibleDiagnosis)
          const isActive = lens.id === activeLens
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
                title={isActive ? '지금 그림에 표시 중' : `${lens.label} 관점으로 보기`}
              >
                <header>
                  <span>{isOrigin ? '●' : '◐'}</span>
                  <strong>{lens.label}</strong>
                  {isOrigin && <em>처음 발견</em>}
                  {/* 지금 그림에 표시 중인 렌즈. 셋 중 어느 것을 보고
                      있는지 카드에서도 알아야 그림과 이어진다. */}
                  {isActive && <span className="issue-perspective-showing">그림에 표시 중</span>}
                </header>
                <p>{visibleDiagnosis.diagnosis}</p>
                {line && (
                  <p className="issue-perspective-evidence">
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

      {/* 관계를 아직 찾는 중. 잠시 뒤 이 Issue가 옆 것과 합쳐질 수 있다. */}
      {relating && siblings.length > 0 && (
        <p className="issue-inspector-relating" role="status">
          이 자리의 다른 관점과 같은 문제인지 확인하는 중입니다.
        </p>
      )}

      {/* 같은 자리인데 따로 잡힌 것들. 시스템이 관계를 못 찾았을 수도
          있으므로 감독이 직접 견줘 볼 수 있게 둔다. */}
      {!relating && siblings.length > 0 && (
        <div className="issue-inspector-siblings">
          <span>같은 자리에 걸린 다른 검토</span>
          <ul>
            {siblings.map((entry) => (
              <li key={entry.id}>
                <button type="button" onClick={() => onSelectIssue?.(entry.id)}>
                  <strong>{entry.title}</strong>
                  <em>{entry.lenses?.map((id) => LENSES.find((l) => l.id === id)?.label || id).join(' · ')}</em>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer>
        <button type="button" className="primary" onClick={() => onRevise?.(
          activeEntry?.diagnosis || (activeEntry?.check?.diagnosis
            ? { lens: activeLens, diagnosis: activeEntry.check.diagnosis }
            : origin),
          issue,
        )} disabled={!origin}>
          {activeLens ? `${LENSES.find((lens) => lens.id === activeLens)?.label || ''}에서 수정하기` : '이 문제 수정하기'}
        </button>
      </footer>
    </section>
  )
}
