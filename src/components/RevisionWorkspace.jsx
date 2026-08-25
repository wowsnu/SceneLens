import { useState } from 'react'
import { editingActionFor } from './seamAction'
import './RevisionWorkspace.css'

const LENS_NAMES = { mise: '미장센', camera: '촬영', editing: '편집' }
const panelsOf = (anchor) => (anchor || '').match(/S\d+/g) || []

// 판정은 DecisionBoard와 같은 것을 쓴다. 두 벌로 두면 캔버스가 보여 주는
// 구조와 실제로 열리는 도구가 갈린다 — `병합`이라 그려 놓고 분할 창이
// 열리는 식이다.
const seamAction = (alternative) => (
  alternative ? editingActionFor(alternative).id : null
)

export default function RevisionWorkspace({
  issue, diagnosis, onBack, onChoose, onKeep,
  promptDraft, promptNote, rewriting, generating, onPromptChange, onClosePrompt, onSavePrompt,
  revisionPending, revisionImage, onAccept, onReject,
  currentImage = '',
}) {
  const [selected, setSelected] = useState(null)
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
          <figure><span>현재</span>{currentImage ? <img src={currentImage} alt="현재 샷" /> : <i />}</figure>
          <b aria-hidden="true">→</b>
          <figure><span>수정안</span>{revisionImage ? <img src={revisionImage} alt="수정안 샷" /> : <i>추천안을 고르면 여기에 보입니다</i>}</figure>
        </section>
      )}

      <section className="revision-workspace-options">
        <span>수정안</span>
        {changes.length ? changes.map((alternative) => (
          <article key={alternative.label}>
            <strong>{alternative.label}</strong>
            <p>{alternative.effect}</p>
            <button type="button" className={selected === alternative ? 'selected' : ''} onClick={() => {
              setSelected(alternative)
              if (!isSeam) onChoose(alternative)
            }} disabled={revisionPending || rewriting || generating}>
              {isSeam ? '이 이음새에 놓기' : '이 수정안 보기'}
            </button>
          </article>
        )) : <p>바로 적용할 수정안은 없습니다. 직접 수정 방향을 정해 주세요.</p>}
        {isSeam && selected && (
          <button type="button" className="revision-seam-open" onClick={() => onChoose(selected)} disabled={revisionPending}>
            {seamAction(selected) === 'seam' ? '이음새에서 조정하기' : '이 구조로 수정하기'}
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

      <footer><button type="button" onClick={onKeep}>현재 유지</button></footer>
    </section>
  )
}
