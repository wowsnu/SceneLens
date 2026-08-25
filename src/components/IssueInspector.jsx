import { useState } from 'react'
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
  const activeLens = picked.issueId === issue?.id
    ? picked.lens
    : (issue?.origin_lens || null)
  const setActiveLens = (lens) => setPicked({ issueId: issue?.id, lens })

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
    || origin?.diagnosis
    || null

  return (
    <section className="issue-inspector" aria-label={`${issue.anchor} ${issue.title}`}>
      <header className="issue-inspector-heading">
        <span>{issue.anchor}{anchorKindLabel(issue.anchor_kind) && ` · ${anchorKindLabel(issue.anchor_kind)}`}</span>
        <h3>{issue.title}</h3>
        {criterion && <p>{criterion}</p>}
      </header>

      {/* 이 Issue가 걸린 컷들. 렌즈를 옮겨도 이 두 장은 그대로 있고
          그 위의 표시만 바뀐다 — 같은 화면을 다르게 읽는다는 것이
          화면에서 드러나야 한다. */}
      <EvidenceStage
        issue={issue}
        diagnosis={activeDiagnosis}
        shots={shots}
        lensId={activeLens}
        range={range}
      />

      <div className="issue-perspectives">
        {perspectives.map(({ lens, diagnosis, check }) => {
          const isOrigin = lens.id === issue.origin_lens
          const checking = check?.status === 'loading'
          const checked = check?.status === 'ready'
          const checkDiagnosis = check?.diagnosis
          const visibleDiagnosis = diagnosis?.diagnosis || checkDiagnosis
          if (!diagnosis) {
            return (
              <section key={lens.id} className={`issue-perspective lens-${lens.id} ${lens.id === activeLens ? 'active' : ''} ${checked && checkDiagnosis ? 'checked-response' : checked ? 'checked-clear' : 'unchecked'}`}>
                {!(checked && checkDiagnosis) && (
                  <header><span>{checked ? '◐' : '○'}</span><strong>{lens.label}</strong></header>
                )}
                {checking ? (
                  <p>이 위치를 확인하는 중입니다.</p>
                ) : check?.status === 'error' ? (
                  <>
                    <p>{check.error || '확인하지 못했습니다.'}</p>
                    <button type="button" onClick={() => onCheckLens?.(lens.id)}>다시 확인</button>
                  </>
                ) : checked && checkDiagnosis ? (
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
                    <p>{checkDiagnosis.diagnosis}</p>
                    {evidenceLineFor(checkDiagnosis) && (
                      <p className="issue-perspective-evidence">
                        {evidenceLineFor(checkDiagnosis).label && (
                          <strong>{evidenceLineFor(checkDiagnosis).label}</strong>
                        )}
                        <span>{evidenceLineFor(checkDiagnosis).detail}</span>
                      </p>
                    )}
                  </button>
                ) : checked ? (
                  <p>이 위치에서는 별도 문제를 찾지 못했습니다.</p>
                ) : (
                  <>
                    <p>아직 이 위치를 확인하지 않았습니다.</p>
                    <button type="button" onClick={() => onCheckLens?.(lens.id)}>이 렌즈로 확인</button>
                  </>
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
