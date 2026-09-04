import { useState } from 'react'
import { editingActionFor } from './seamAction'
import { revisionImpact } from './revisionImpact'
import './RevisionWorkspace.css'

const LENS_NAMES = { mise: '미장센', camera: '촬영', editing: '편집' }
// 기존 상세 렌즈 카드처럼, AI가 제안한 값은 출발점일 뿐이다. 실제로
// 바뀌는 항목만 열어 사용자가 조정할 수 있게 한다.
const PATCH_CONTROLS = {
  shot_size: { label: '샷 크기', values: ['Extreme wide', 'Wide', 'Medium wide', 'Medium', 'Medium close-up', 'Close-up', 'Extreme close-up'] },
  angle: { label: '앵글', values: ['Eye-level', 'High angle', 'Low angle', 'Bird’s-eye', 'Dutch angle'] },
  move: { label: '카메라 움직임', values: ['Static', 'Pan', 'Tilt', 'Dolly in', 'Dolly out', 'Tracking'] },
}

// 실행 버튼이 무엇을 하는지 그대로 적는다. 컷이 지워지는 일과 그림을
// 다시 그리는 일은 되돌리는 비용이 다르므로 같은 말로 부르지 않는다.
// 이 수정안을 고르면 이음새에서 무엇이 열리는가. 화면이 그리는 구조와
// 실제로 열리는 도구가 갈리면 안 되므로 `editingActionFor`의 판정을 쓴다.
const SEAM_OP_VERBS = {
  insert: '삽입',
  split: '분할',
  merge: '합치기',
  delete: '삭제',
  seam: '조정',
}

const RUN_LABELS = {
  insert: '이 자리에 컷 넣기',
  split: '이 컷 나누기',
  merge: '두 컷 합치기',
  delete: '이 컷 빼기',
  seam: '이 수정안으로 그려 보기',
}
// 이 수정안이 컷 표의 어느 값을 바꾸는가. 실제로 달라지는 것만 남긴다 —
// 지금과 같은 값을 `→`로 적으면 바뀌는 것처럼 보인다.
const fieldChangesOf = (alternative, cut, before = null) => {
  const patch = alternative?.patch || {}
  return [
    patch.shot_size && ['샷 크기', before?.shotSize ?? cut?.shotSize, patch.shot_size],
    patch.angle && ['앵글', before?.angle ?? cut?.angle, patch.angle],
    patch.move && ['카메라', before?.cameraMove ?? cut?.cameraMove, patch.move],
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
  onBack, onChoose, onPrepare, onKeep, onClose,
  promptDraft, promptNote, promptBefore = '', rewriting, generating, onPromptChange, onClosePrompt, onSavePrompt, onRevertPrompt,
  revisionPending, revisionImage, onAccept, onReject,
  // 생성이 시작되면 컷 표는 먼저 제안 값으로 바뀐다. 하지만 감독이
  // 수용/되돌리기를 고르기 전까지 카드의 비교는 적용 전 값을 보여야 한다.
  revisionBefore = null,
  applied = false,
  currentImage = '',
  cameraPrompt = '', onDirectCameraEdit,
  // 편집은 한 장을 바꾸는 일이 아니라 앞·대상·뒤 컷의 관계를 고치는
  // 일이다. Workspace를 열자마자 이 세 장을 보여 준다.
  editingSequenceShots = [],
  editingSequenceNotice = '',
  seamEditor = null,
  onDirectSeamEdit,
  // 편집 렌즈의 구조 변경은 이 카드 안에서 끝내지 않는다. 고칠 자리는
  // 두 컷 **사이**이므로, 어떤 조작인지만 위로 알리고 실제 편집기는
  // EvidenceStage의 이음새 자리에 펼쳐진다 (`LENS_TRACKS_UI.md` 5장).
  onSeamEdit,
  // 그 이음새 편집기가 지금 열려 있는가.
  seamEditing = false,
}) {
  const [selected, setSelected] = useState(null)
  const [draftPatch, setDraftPatch] = useState({})
  const [cameraDirectDraft, setCameraDirectDraft] = useState(null)
  const [editingDirectEditing, setEditingDirectEditing] = useState(false)
  const changes = (diagnosis?.alternatives || []).filter((item) => item.kind === 'change')
  const isShotEditLens = diagnosis?.lens === 'camera' || diagnosis?.lens === 'mise'
  const isEditingLens = diagnosis?.lens === 'editing'
  const isPatchAlternative = (alternative) => fieldChangesOf(
    alternative, cut, revisionPending ? revisionBefore : null,
  ).length > 0
  const opensPrompt = (alternative) => diagnosis?.lens !== 'editing' && !isPatchAlternative(alternative)
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
  const openCameraDirectEdit = () => {
    setCameraDirectDraft({
      shotSize: cut?.shotSize || '',
      angle: cut?.angle || '',
      prompt: cameraPrompt || '',
    })
  }
  // 고른 수정안이 무엇을 바꾸는가. 적용 전에 보여 준다 — 컷을 넣으면
  // 뒤 번호가 밀리고, 그 자리에 다른 렌즈가 짚어 둔 검토가 있을 수도
  // 있다. 되돌리는 것보다 미리 아는 편이 싸다.
  const impact = revisionImpact(adjustedAlternative, issue, issues, shotCount)

  // 수정 문안. 고른 수정안 바로 아래에서 열린다.
  //
  // **기존 프롬프트 → 수정안 프롬프트**가 이 칸의 핵심이다. 고친 문장만
  // 보이면 감독은 무엇이 달라졌는지 기억에 기대어 판정하게 되고, 되돌릴
  // 근거도 사라진다 (렌즈 상세 화면이 이미 이렇게 하고 있다).
  const renderPrompt = () => (
    <section className="revision-workspace-prompt" aria-live="polite">
      <span>{rewriting ? '수정 문안을 만드는 중…' : '수정 문안'}</span>
      {promptNote && <p className="revision-prompt-note">{promptNote}</p>}
      {promptBefore && (
        <div className="revision-prompt-before">
          <span>
            기존 프롬프트
            {onRevertPrompt && (
              <button type="button" onClick={() => onRevertPrompt(promptBefore)}>
                이걸로 되돌리기
              </button>
            )}
          </span>
          <p>{promptBefore}</p>
        </div>
      )}
      {/* 받는 동안 아래 칸에는 아직 원문이 들어 있다. 그때도 `수정안
          프롬프트`라 적으면 두 칸이 같은 문장인데 다른 이름으로 보인다. */}
      {promptBefore && (
        <span className="revision-prompt-after-label" aria-hidden="true">
          {rewriting ? '↓ 수정안 프롬프트를 받는 중…' : '↓ 수정안 프롬프트'}
        </span>
      )}
      <textarea
        value={promptDraft}
        rows={5}
        disabled={rewriting || generating}
        onChange={(event) => onPromptChange(event.target.value)}
      />
      <div>
        <button type="button" onClick={onClosePrompt}>닫기</button>
        <button
          type="button"
          className="primary"
          disabled={rewriting || generating}
          onClick={onSavePrompt}
        >
          {generating ? '수정안을 생성하는 중…' : '이 문안으로 수정안 생성'}
        </button>
      </div>
    </section>
  )

  if (!diagnosis) return null
  return (
    <section className={`revision-workspace lens-${diagnosis.lens || 'default'}`} aria-label="수정 작업 공간">
      <header>
        <button type="button" onClick={onBack}>← 검토로</button>
        <span>{issue?.anchor} · {LENS_NAMES[diagnosis.lens] || diagnosis.lens}</span>
        <h3>{diagnosis.suggested_action || diagnosis.diagnosis}</h3>
      </header>

      {isEditingLens ? (
        <section className="revision-edit-sequence" aria-label="편집할 컷 흐름">
          <span>고칠 컷 흐름</span>
          <div>
            {editingSequenceShots.map((shot, index) => (
              <div key={shot.id} className={`revision-edit-sequence-shot${shot.isTarget ? ' target' : ''}`}>
                {index > 0 && <b aria-hidden="true">→</b>}
                <figure>
                  <figcaption>{shot.label}{shot.note ? ` · ${shot.note}` : shot.isTarget ? ' · 대상' : ''}</figcaption>
                  {shot.image
                    ? <img src={shot.image} alt={`${shot.label} 패널`} />
                    : <i className={shot.placeholder ? 'is-structure-preview' : ''}>{shot.placeholder || '아직 그리지 않은 컷'}</i>}
                </figure>
              </div>
            ))}
          </div>
          <p>{seamEditor
            ? `${editingSequenceNotice ? `${editingSequenceNotice} ` : ''}아래에서 이음새의 컷 프롬프트를 조작한 뒤 실행하세요.`
            : '수정안을 고르면 그 사이 이음새가 바로 아래에 열립니다.'}</p>
        </section>
      ) : isSeam && !seamEditing ? (
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
      ) : isSeam ? null : (
        <section className="revision-shot-compare" aria-label="현재 샷과 수정안 비교">
          <figure><span>현재</span>{currentImage ? <img src={currentImage} alt="현재 샷" /> : <i>이 컷은 아직 그리지 않았습니다</i>}</figure>
          <b aria-hidden="true">→</b>
          <figure>
            <span>변화된 사진</span>
            {revisionImage ? <img src={revisionImage} alt="수정안 샷" /> : <i>추천안을 고르면 여기에 보입니다</i>}
            {/* 결과는 만든 자리가 아니라 **보던 자리**에 나온다. 아래
                별도 칸에 띄우면 감독이 문안을 고친 곳과 그 결과가 멀어져,
                무엇이 달라졌는지 위아래로 오가며 맞춰 봐야 한다. */}
            {revisionPending && (
              <div className="revision-camera-result-actions" aria-live="polite">
                {revisionImage ? (
                  <>
                    <strong>이 수정안을 적용할까요?</strong>
                    <div>
                      <button type="button" className="primary" onClick={onAccept}>이 수정안 적용</button>
                      <button type="button" onClick={onReject}>버리고 되돌리기</button>
                    </div>
                  </>
                ) : <small>변화된 사진을 만드는 중…</small>}
              </div>
            )}
          </figure>
        </section>
      )}

      {/* 구조 수정은 위 3장 시퀀스를 바로 반영하고, 실제로 문장을 고칠
          작업면은 그 바로 아래에 연다. 사진 사이에 도구를 끼우면 폭이
          줄고 전후 컷을 읽기 어렵다. */}
      {isEditingLens && seamEditor && (
        <section className="revision-edit-seam-workspace" aria-label="이음새 프롬프트 편집">
          {seamEditor}
        </section>
      )}

      {isEditingLens && editingDirectEditing && !seamEditor && (
        <section className="revision-edit-direct" aria-label="편집 직접 수정">
          <span>직접 수정</span>
          <p>이 3장 흐름에서 구조를 바로 고릅니다.</p>
          <div>
            <button type="button" onClick={() => onDirectSeamEdit?.('insert')}>삽입</button>
            <button type="button" onClick={() => onDirectSeamEdit?.('split')}>분할</button>
            <button type="button" onClick={() => onDirectSeamEdit?.('merge')}>합치기</button>
          </div>
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

      {!seamEditor && <section className="revision-workspace-options">
        {isShotEditLens && cameraDirectDraft && (
          <section className="revision-camera-direct-edit" aria-label="직접 수정">
            <span>직접 수정</span>
            <p>이 컷의 샷 크기, 앵글과 프롬프트를 여기서 바로 고칩니다.</p>
            <div className="revision-camera-direct-fields">
              <label>
                <b>샷 크기</b>
                <select
                  value={cameraDirectDraft.shotSize}
                  disabled={revisionPending || generating}
                  onChange={(event) => setCameraDirectDraft((current) => ({ ...current, shotSize: event.target.value }))}
                >
                  {!cameraDirectDraft.shotSize && <option value="">미정</option>}
                  {[...new Set([cameraDirectDraft.shotSize, ...PATCH_CONTROLS.shot_size.values])].filter(Boolean).map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                <b>앵글</b>
                <select
                  value={cameraDirectDraft.angle}
                  disabled={revisionPending || generating}
                  onChange={(event) => setCameraDirectDraft((current) => ({ ...current, angle: event.target.value }))}
                >
                  {!cameraDirectDraft.angle && <option value="">미정</option>}
                  {[...new Set([cameraDirectDraft.angle, ...PATCH_CONTROLS.angle.values])].filter(Boolean).map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="revision-camera-direct-prompt">
              <b>프롬프트</b>
              <textarea
                value={cameraDirectDraft.prompt}
                rows={5}
                disabled={revisionPending || generating}
                onChange={(event) => setCameraDirectDraft((current) => ({ ...current, prompt: event.target.value }))}
              />
            </label>
            <div className="revision-camera-direct-actions">
              <button type="button" onClick={() => setCameraDirectDraft(null)}>닫기</button>
              <button
                type="button"
                className="primary"
                disabled={revisionPending || generating}
                onClick={() => onDirectCameraEdit?.(cameraDirectDraft)}
              >
                이 설정으로 생성하기
              </button>
            </div>
          </section>
        )}
        <span>수정안</span>
        {changes.length ? changes.map((alternative) => (
          <article key={alternative.label}>
            <strong>{alternative.label}</strong>
            <p>{alternative.effect}</p>
            {/* 컷 값이 바뀌는 수정안이면 `기존 → 바뀜`을 그대로 적는다.
                문장만으로는 무엇이 달라지는지 알 수 없다 (기존 Decision
                Card가 하던 방식). */}
            {isShotEditLens ? (
              <dl className="directing-alternative-patch">
                {fieldChangesOf(alternative, cut, revisionPending ? revisionBefore : null).map(([label, from, to]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd><s>{from || '미정'}</s><i aria-hidden="true">→</i><b>{to}</b></dd>
                  </div>
                ))}
              </dl>
            ) : fieldChangesOf(alternative, cut).map(([label, from, to]) => (
              <span className="revision-field-change" key={label}>
                {label} {from || '미정'} → {to}
              </span>
            ))}
            {isShotEditLens && isPatchAlternative(alternative) ? (
              <button
                type="button"
                className="revision-alternative-apply"
                disabled={revisionPending || rewriting || generating}
                onClick={() => onChoose(alternative)}
              >
                적용하고 생성하기
              </button>
            ) : (
              <button
                type="button"
                className={`${selected === alternative ? 'selected ' : ''}revision-alternative-apply`}
                onClick={() => {
                  const next = selected === alternative ? null : alternative
                  setSelected(next)
                  setDraftPatch(next?.patch || {})
                  if (next && opensPrompt(next)) onPrepare?.(next)
                  // 구조를 바꾸는 선택지는 두 컷 사이에서 펼친다. 다른
                  // 화면으로 넘기면 고칠 자리가 눈앞에서 사라진다.
                  if (onSeamEdit) onSeamEdit(next ? editingActionFor(next).id : null, next)
                }}
                aria-pressed={selected === alternative}
                disabled={revisionPending || rewriting || generating}
              >
                {/* 고른 뒤에도 무엇을 하는 버튼인지 그대로 적는다.
                    `고름`은 상태만 말하고 할 일을 말하지 않아, 다시
                    누르면 접힌다는 것도 알 수 없었다 — 접는 일은 아래
                    `닫기`가 맡는다. */}
                {selected === alternative && onSeamEdit && seamEditing
                  ? '이음새 여는 중…'
                  : opensPrompt(alternative)
                    ? '프롬프트에 반영'
                    : onSeamEdit
                      ? `${SEAM_OP_VERBS[editingActionFor(alternative).id] || '이음새에서 열기'}`
                      : '이 수정안 보기'}
              </button>
            )}
            {/* 문안은 고른 수정안 **바로 아래**에 연다. 수정안이 여럿일
                때 맨 밑에 한 칸만 두면, 감독은 어느 수정안의 문안인지
                위로 되짚어 확인해야 한다 — 고른 자리와 그 결과가 붙어
                있어야 한 번에 읽힌다. */}
            {selected === alternative && promptDraft != null && !revisionPending && (
              renderPrompt()
            )}
          </article>
        )) : <p>바로 적용할 수정안은 없습니다. 직접 수정 방향을 정해 주세요.</p>}
        {diagnosis?.lens === 'mise' && selected == null && promptDraft != null && renderPrompt()}
        {/* 촬영의 값 변경은 각 수정안 카드에 이미 `현재 → 변경값`으로
            보인다. 여기서 한 번 더 영향 카드로 반복하지 않는다. 이 블록은
            컷 수·순서처럼 구조적으로 번지는 수정에만 의미가 있다. */}
        {!isShotEditLens && impact && (
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


        {/* 렌즈별 직접 수정은 모두 이 작업면 안에서 시작한다. 미장센은
            프롬프트 문장을, 촬영은 샷 값과 프롬프트를, 편집은 이음새 구조를
            바로 고친다. */}
        {seamEditing && (
          <p className="revision-seam-open-note">
            두 컷 사이에서 고치는 중입니다. 위 이음새 자리에서 확인하고 실행하세요.
          </p>
        )}
      </section>}

      {/* 아래에 따로 미리보기를 두지 않는다. 결과는 위 `현재 → 변화된
          사진` 자리에 바로 나온다. */}

      {/* 적용 뒤. 여기서 전체 재검토를 걸지 않는다 — 감독은 보통 이슈
          하나를 고친 참이고, 남은 이슈를 마저 보려던 참이다. 전체를 다시
          돌리면 그 목록이 사라졌다 새로 오고 시간도 걸린다.
          바뀐 화면으로 다시 보는 길은 트랙 위 `이 분석 뒤에 패널이
          바뀌었습니다` 배너에 하나로 모아 둔다 — 남은 이슈를 다 처리한
          뒤에 누르는 것이 맞는 자리다. */}
      {applied && (
        <section className="revision-applied" aria-live="polite">
          <strong>적용했습니다.</strong>
          <p>
            다른 관점의 판단까지 갱신하려면, 위 트랙의
              {' '}<b>바뀐 화면으로 다시 분석</b>을 실행하세요.
          </p>
          <div>
            {/* 적용은 이미 했다. 여기서 닫는 것은 `유지` 판정이 아니므로
                onKeep이 아니라 onClose다 — onKeep을 부르면 적용해 놓고
                유지로 기록된다. */}
            <button type="button" className="primary" onClick={onClose}>닫기</button>
          </div>
        </section>
      )}

      {/* 판정 세 가지. 촬영의 직접 수정은 이 작업 공간에 열어 발견한
          맥락과 결과 비교를 그대로 유지한다. */}
      {!applied && (
        <footer className="revision-verdict">
          <button type="button" onClick={onKeep}>현재 유지</button>
          {isShotEditLens ? (
            <button type="button" onClick={openCameraDirectEdit}>직접 수정</button>
          ) : isEditingLens ? (
            <button type="button" onClick={() => setEditingDirectEditing((open) => !open)}>직접 수정</button>
          ) : null}
        </footer>
      )}
    </section>
  )
}
