import { useState } from 'react'
import { editingActionFor } from './seamAction'
import { revisionImpact } from './revisionImpact'
import './RevisionWorkspace.css'

const LENS_NAMES = { mise: '미장센', camera: '촬영', editing: '편집' }
const PATCH_CONTROLS = {
  shot_size: { label: '샷 크기', values: ['Extreme wide', 'Wide', 'Medium wide', 'Medium', 'Medium close-up', 'Close-up', 'Extreme close-up'] },
  angle: { label: '앵글', values: ['Eye-level', 'High angle', 'Low angle', 'Bird’s-eye', 'Dutch angle'] },
  move: { label: '카메라 움직임', values: ['Static', 'Pan', 'Tilt', 'Dolly in', 'Dolly out', 'Tracking'] },
}

// 실행 버튼이 무엇을 하는지 그대로 적는다. 컷이 지워지는 일과 그림을
// 다시 그리는 일은 되돌리는 비용이 다르므로 같은 말로 부르지 않는다.
const RUN_LABELS = {
  insert: '이 자리에 컷 넣기',
  split: '이 컷 나누기',
  merge: '두 컷 합치기',
  delete: '이 컷 빼기',
  seam: '이 수정안으로 그려 보기',
}
// 이 수정안이 컷 표의 어느 값을 바꾸는가. 실제로 달라지는 것만 남긴다 —
// 지금과 같은 값을 `→`로 적으면 바뀌는 것처럼 보인다.
const fieldChangesOf = (alternative, cut) => {
  const patch = alternative?.patch || {}
  return [
    patch.shot_size && ['샷 크기', cut?.shotSize, patch.shot_size],
    patch.angle && ['앵글', cut?.angle, patch.angle],
    patch.move && ['카메라', cut?.cameraMove, patch.move],
  ].filter(Boolean).filter(([, from, to]) => from !== to)
}

const panelsOf = (anchor) => (anchor || '').match(/S\d+/g) || []

// 판정은 DecisionBoard와 같은 것을 쓴다. 두 벌로 두면 캔버스가 보여 주는
// 구조와 실제로 열리는 도구가 갈린다 — `병합`이라 그려 놓고 분할 창이
// 열리는 식이다.
const seamAction = (alternative) => (
  alternative ? editingActionFor(alternative).id : null
)

export default function RevisionWorkspace({
  issue, issues = [], shotCount = 0, diagnosis, cut = null,
  onBack, onChoose, onKeep, onOpenLens, onClose,
  promptDraft, promptNote, rewriting, generating, onPromptChange, onClosePrompt, onSavePrompt,
  revisionPending, revisionImage, onAccept, onReject,
  applied = false, onReappraise,
  currentImage = '',
}) {
  const [selected, setSelected] = useState(null)
  const [draftPatch, setDraftPatch] = useState({})
  const changes = (diagnosis?.alternatives || []).filter((item) => item.kind === 'change')
  // 이음새 자리라도 **구조를 바꾸는 선택지가 있을 때만** 시퀀스 캔버스를
  // 쓴다. 촬영이 이음새를 짚는 경우처럼 선택지가 전부 `조정`이면 컷의
  // 개수는 그대로이고 그림이 달라지는 것이므로, 시퀀스를 그려 놓으면
  // 무엇이 바뀌는지 잘못 알린다 (`LENS_TRACKS_UI.md` 5장 — 여기서는
  // 렌즈가 아니라 intervention target이 중심이다).
  const isSeam = issue?.anchor_kind === 'seam'
    && changes.some((item) => editingActionFor(item).id !== 'seam')
  const [beforePanel, afterPanel] = panelsOf(issue?.anchor)
  const operation = selected ? seamAction(selected) : null
  const adjustedAlternative = selected ? { ...selected, patch: draftPatch } : null
  // 고른 수정안이 무엇을 바꾸는가. 적용 전에 보여 준다 — 컷을 넣으면
  // 뒤 번호가 밀리고, 그 자리에 다른 렌즈가 짚어 둔 검토가 있을 수도
  // 있다. 되돌리는 것보다 미리 아는 편이 싸다.
  const impact = revisionImpact(adjustedAlternative, issue, issues, shotCount)
  if (!diagnosis) return null
  return (
    <section className="revision-workspace" aria-label="수정 작업 공간">
      <header>
        <button type="button" onClick={onBack}>← 검토로</button>
        <span>{issue?.anchor} · {LENS_NAMES[diagnosis.lens] || diagnosis.lens}</span>
        <h3>{diagnosis.suggested_action || diagnosis.diagnosis}</h3>
      </header>

      {isSeam ? (
        <section className={`revision-seam-canvas operation-${operation || 'idle'}`} aria-label="이음새 수정 자리">
          <div className="revision-seam-panel"><span>{beforePanel}</span><small>앞 컷</small></div>
          <div className="revision-seam-operation">
            {operation === 'insert' && <><strong>새 컷</strong><small>두 컷 사이에 넣기</small></>}
            {operation === 'merge' && <><strong>{beforePanel} + {afterPanel}</strong><small>한 컷으로 묶기</small></>}
            {operation === 'split' && <><strong>분할 지점</strong><small>컷을 둘로 나누기</small></>}
            {operation === 'delete' && <><strong>직접 연결</strong><small>대상 컷을 빼기</small></>}
            {operation === 'seam' && <><strong>이음새</strong><small>연결 방식을 조정하기</small></>}
            {!operation && <><strong>이음새</strong><small>수정안을 고르면 여기서 바뀝니다</small></>}
          </div>
          <div className="revision-seam-panel"><span>{afterPanel}</span><small>뒤 컷</small></div>
        </section>
      ) : (
        <section className="revision-shot-compare" aria-label="현재 샷과 수정안 비교">
          <figure><span>현재</span>{currentImage ? <img src={currentImage} alt="현재 샷" /> : <i>이 컷은 아직 그리지 않았습니다</i>}</figure>
          <b aria-hidden="true">→</b>
          <figure><span>수정안</span>{revisionImage ? <img src={revisionImage} alt="수정안 샷" /> : <i>추천안을 고르면 여기에 보입니다</i>}</figure>
        </section>
      )}

      {/* 이 판단의 근거. 무엇을 기준으로 봤고 화면에서 무엇을 확인했는지
          — 감독이 수정안을 고르기 전에 그 판단부터 판정할 수 있어야 한다
          (design_goal.md DG1 P2). 기본은 접어 둔다: 여기는 고치는
          자리이지 다시 읽는 자리가 아니다. */}
      {(diagnosis.criterion || diagnosis.evidence?.length > 0 || diagnosis.theory_basis) && (
        <details className="revision-basis">
          <summary>이 판단의 근거</summary>
          {diagnosis.criterion && (
            <p className="revision-basis-criterion">{diagnosis.criterion}</p>
          )}
          {diagnosis.evidence?.length > 0 && (
            <ul>
              {diagnosis.evidence.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
          {diagnosis.theory_basis && (
            <p className="revision-basis-theory">
              {diagnosis.theory_basis}
              {diagnosis.theory_source && <cite>{diagnosis.theory_source}</cite>}
            </p>
          )}
        </details>
      )}

      <section className="revision-workspace-options">
        <span>수정안</span>
        {changes.length ? changes.map((alternative) => (
          <article key={alternative.label}>
            <strong>{alternative.label}</strong>
            <p>{alternative.effect}</p>
            {/* 컷 값이 바뀌는 수정안이면 `기존 → 바뀜`을 그대로 적는다.
                문장만으로는 무엇이 달라지는지 알 수 없다 (기존 Decision
                Card가 하던 방식). */}
            {fieldChangesOf(alternative, cut).map(([label, from, to]) => (
              <span className="revision-field-change" key={label}>
                {label} {from || '미정'} → {to}
              </span>
            ))}
            {/* 고르는 것과 실행하는 것을 나눈다. 누르자마자 그림이
                생성되거나 컷이 지워지면 감독은 무엇이 일어날지 모른 채
                결과를 마주한다 — 무엇이 달라지는지 보고 나서 누른다
                (기존 Decision Card가 하던 방식이다). */}
            <button
              type="button"
              className={selected === alternative ? 'selected' : ''}
              onClick={() => {
                const next = selected === alternative ? null : alternative
                setSelected(next)
                setDraftPatch(next?.patch || {})
              }}
              aria-pressed={selected === alternative}
              disabled={revisionPending || rewriting || generating}
            >
              {selected === alternative ? '고름' : '이 수정안 보기'}
            </button>
          </article>
        )) : <p>바로 적용할 수정안은 없습니다. 직접 수정 방향을 정해 주세요.</p>}
        {impact && (
          <div className="revision-impact" aria-live="polite">
            <span>이 수정이 바꾸는 것</span>
            {impact.lines.length > 0 && (
              <ul>
                {impact.lines.map((line) => (
                  <li key={`${line.label}-${line.detail}`}>
                    <b>{line.label}</b>
                    <span>{line.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            {/* 판정하지 않는다. 다시 봐야 한다고 말할 뿐, 지우거나
                자동으로 다시 돌리지 않는다 (design_goal.md DG1 P2). */}
            {impact.warnings.map((warning) => (
              <p key={warning.text} className="revision-impact-warn">
                <b>{warning.text}</b>
                <span>
                  {warning.items.join(', ')}
                  {warning.more > 0 && ` 외 ${warning.more}개`}
                </span>
              </p>
            ))}
          </div>
        )}

        {/* 추천안은 출발점이다. 카메라 값이 들어 있는 경우에는 여기서
            바꿔 본 뒤에만 수정안을 만든다. 추천값을 즉시 적용하면 이
            공간이 사실상 자동 실행 버튼이 된다. */}
        {selected && Object.keys(draftPatch).some((key) => PATCH_CONTROLS[key]) && (
          <section className="revision-adjustment" aria-label="추천안 조정">
            <span>이 변화 조정</span>
            {Object.entries(PATCH_CONTROLS).map(([key, control]) => {
              if (!draftPatch[key]) return null
              const values = [...new Set([draftPatch[key], ...control.values])]
              return (
                <label key={key}>
                  <b>{control.label}</b>
                  <select
                    value={draftPatch[key]}
                    onChange={(event) => setDraftPatch((current) => ({ ...current, [key]: event.target.value }))}
                  >
                    {values.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
              )
            })}
          </section>
        )}

        {/* 실행은 여기 하나뿐이다. 위에서 고르고 영향을 확인한 뒤에
            누른다. 무엇을 하는 버튼인지 이름에 적는다 — `확인`처럼
            뭉뚱그리면 컷이 지워지는 것도 같은 말이 된다. */}
        {selected && (
          <button
            type="button"
            className="revision-run"
            onClick={() => onChoose(adjustedAlternative)}
            disabled={revisionPending || rewriting || generating}
          >
            {Object.keys(draftPatch).some((key) => PATCH_CONTROLS[key])
              ? '이 설정으로 수정안 보기'
              : RUN_LABELS[seamAction(selected)] || '이 수정안으로 그려 보기'}
          </button>
        )}
      </section>

      {promptDraft != null && !revisionPending && (
        <section className="revision-workspace-prompt">
          <span>{rewriting ? '수정 문안을 만드는 중…' : '수정 문안'}</span>
          {promptNote && <p>{promptNote}</p>}
          <textarea value={promptDraft} rows={5} disabled={rewriting || generating} onChange={(event) => onPromptChange(event.target.value)} />
          <div><button type="button" onClick={onClosePrompt}>닫기</button><button type="button" className="primary" disabled={rewriting || generating} onClick={onSavePrompt}>이 문안으로 수정안 보기</button></div>
        </section>
      )}

      {revisionPending && (
        <section className="revision-workspace-preview" aria-live="polite">
          {revisionImage ? <><img src={revisionImage} alt="수정안 미리보기" /><div><strong>이 수정안을 적용할까요?</strong><span>버리면 이전 상태로 돌아갑니다.</span></div><div><button type="button" className="primary" onClick={onAccept}>이 수정안 적용</button><button type="button" onClick={onReject}>버리고 되돌리기</button></div></> : <span>수정안을 만드는 중…</span>}
        </section>
      )}

      {/* 적용 뒤. 여기서 끝내지 않는다 — 고친 화면을 다른 렌즈가 어떻게
          읽는지 다시 보는 것이 Reappraise다(LENS_TRACKS_UI.md 8장).
          바꾼 그림에 대한 옛 판단이 그대로 남아 있으면, 감독은 이미
          해결된 문제를 다시 읽게 된다. */}
      {applied && (
        <section className="revision-applied" aria-live="polite">
          <strong>적용했습니다.</strong>
          <p>고친 화면을 다시 보면 다른 관점의 판단도 함께 갱신됩니다.</p>
          <div>
            <button type="button" className="primary" onClick={onReappraise}>
              다시 보기
            </button>
            {/* 적용은 이미 했다. 여기서 닫는 것은 `유지` 판정이 아니라
                다시 보기를 미루는 것뿐이다 — onKeep을 부르면 적용해 놓고
                유지로 기록된다. */}
            <button type="button" onClick={onClose}>나중에</button>
          </div>
        </section>
      )}

      {/* 판정 세 가지. 기존 Decision Card가 하던 것을 그대로 가져온다 —
          DG1 P2의 수용·수정·거부다. `직접 수정`은 그 렌즈의 상세 화면을
          연다: 도구를 여기 다시 만들지 않고 이미 있는 흐름으로 보낸다
          (DecisionBoard의 `openCurrentDirectingIssue`와 같은 이유). */}
      {!applied && (
        <footer className="revision-verdict">
          <button type="button" onClick={onKeep}>현재 유지</button>
          {onOpenLens && (
            <button type="button" onClick={onOpenLens}>
              {LENS_NAMES[diagnosis.lens] || '이 렌즈'}에서 직접 수정
            </button>
          )}
        </footer>
      )}
    </section>
  )
}
