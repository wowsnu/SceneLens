import { useEffect, useState } from 'react'
import useStore, { seamKeyFor } from '../store/useStore'
import { logScaffold } from '../store/studyLog'
import './GridView.css'

/**
 * 이음새에서 실제로 편집하는 자리 — 넣기·나누기·합치기·빼기.
 *
 * 두 곳이 이것을 쓴다. GridView는 격자에서 이음새를 직접 열 때, Lens
 * Workbench는 편집 렌즈의 수정안을 그 자리에서 펼칠 때다. 두 벌로 두면
 * 한쪽만 고쳐지고 같은 조작이 화면마다 다르게 동작한다
 * (`LENS_TRACKS_UI.md` 11장 — 기능을 새로 만들지 않는다).
 *
 * 무엇을 넣을지·어디서 나눌지는 AI에게 물을 수 있지만, **누르자마자
 * 실행하지 않는다.** 무엇이 바뀌고 무엇이 사라지는지 먼저 보이고,
 * 실행은 따로 누른다 (DG2 P3).
 */

const TITLES = {
  merge: '두 컷 합치기',
  split: '컷 나누기',
  insert: '사이에 컷 넣기',
  delete: '이 컷 빼기',
}

const RUN_LABELS = {
  merge: '합치기',
  split: '나누기',
  insert: '넣기',
  delete: '이 컷 빼기',
}

export default function SeamEditor({
  // { kind, cutId, index, proposal?, losesDrawing? }
  pendingEdit,
  shots = [],
  onClose,
  // 실행이 끝난 뒤. GridView는 이음새 카드를 닫고, Workbench는 접는다.
  onDone,
  // 헤더를 이 컴포넌트가 그릴지. GridView는 이미 이음새 카드 머리가
  // 있으므로 끈다.
  showHeader = true,
  className = '',
}) {
  const cutPlan = useStore((s) => s.cutPlan)
  const screenplay = useStore((s) => s.screenplay)
  const seams = useStore((s) => s.seams)
  const mergeCuts = useStore((s) => s.mergeCuts)
  const splitCut = useStore((s) => s.splitCut)
  const deleteCut = useStore((s) => s.deleteCut)
  const addCutPlanItem = useStore((s) => s.addCutPlanItem)
  const completeEditingOperation = useStore((s) => s.completeEditingOperation)

  // 합쳐질 내용. AI가 이어붙인 것을 기본값으로 두되 고칠 수 있게 한다.
  const [mergeDraft, setMergeDraft] = useState('')
  const [mergePending, setMergePending] = useState(false)
  const [mergeError, setMergeError] = useState(null)
  // 넣을 컷의 후보. 빈 컷을 만들어 두면 대개 비어 있는 채로 남는다 —
  // 무엇을 넣어야 하는지는 앞뒤 컷에 이미 드러나 있다.
  const [insertCandidates, setInsertCandidates] = useState([])
  const [insertChoice, setInsertChoice] = useState(null)
  const [insertPending, setInsertPending] = useState(false)
  const [insertError, setInsertError] = useState(null)
  // 나눈 안. 감독이 직접 나눌 때는 비워 둔다 — 어디서 끊을지는 연출
  // 판단이다. 편집 렌즈가 "두 사건이 겹쳤다"고 진단한 경우에만 채운다.
  const [splitDraft, setSplitDraft] = useState(null)
  const [splitPending, setSplitPending] = useState(false)
  const [splitError, setSplitError] = useState(null)

  const kind = pendingEdit?.kind
  const cutId = pendingEdit?.cutId
  const cutIndex = cutPlan.findIndex((item) => item.id === cutId)
  const cut = cutIndex >= 0 ? cutPlan[cutIndex] : null
  const prevCut = cutPlan[cutIndex - 1]
  const nextCut = cutPlan[cutIndex + 1]
  // 편집 렌즈가 제안한 이유. UI에만 보이고 AI 후보 요청에 빠지면,
  // 삽입기는 앞뒤 문장만 보고 무난한 연결 컷을 만들 수 있다.
  const proposalDiagnosis = [pendingEdit?.proposal?.title, pendingEdit?.proposal?.detail]
    .filter(Boolean)
    .join('\n')

  const scriptText = screenplay
    .filter((element) => element.type === 'action')
    .map((element) => element.text)
    .join('\n')

  // 합치기는 이어붙인 문장으로 시작한다. 이 초안은 이어붙인 것이지 합친
  // 것이 아니다 — 두 문장이 같은 동작을 다르게 말하고 있어도 그대로
  // 남고, 감독이 물으면 겹치는 부분을 지운 안으로 바뀐다.
  //
  // 대상이 바뀔 때마다 다시 세운다. 앞 조작에서 쓰던 초안이 남아 있으면
  // 다른 컷의 문장을 이 컷의 것으로 읽게 된다.
  useEffect(() => {
    setMergeError(null)
    setInsertCandidates([])
    setInsertChoice(null)
    setInsertError(null)
    setSplitError(null)
    if (kind !== 'merge') {
      setMergeDraft('')
      return
    }
    const seamShot = shots.find((entry) => entry.cutPlanItemId === cutId)
    const seam = seamShot ? seams[seamKeyFor(seamShot.id)] : null
    setMergeDraft([
      cut?.content,
      seam?.elision && `(${seam.elision})`,
      nextCut?.content,
    ].filter(Boolean).join(' '))
    // 초안은 대상이 정해질 때 한 번 세운다. 이후 감독이 고친 문장을
    // cutPlan 갱신으로 덮어쓰지 않도록 의존성은 대상만 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, cutId])

  // 진단에서 들어온 나누기는 나눈 안을 함께 받는다. 진단은 이미 무엇과
  // 무엇이 겹쳤는지 알고 있는데, 적어 주지 않으면 감독이 진단을 읽고
  // 같은 것을 처음부터 다시 찾아야 한다.
  useEffect(() => {
    if (kind !== 'split') {
      setSplitDraft(null)
      return
    }
    // 격자에서 직접 나눌 때는 앞 칸에 원본이 들어와 있다. 감독은 뒤로
    // 보낼 부분을 잘라 옮기면 되고, 빈 칸 둘을 마주하지 않는다.
    setSplitDraft(pendingEdit?.seedSplit || null)
    if (!pendingEdit?.proposal) return
    const target = shots.find((entry) => entry.cutPlanItemId === cutId)
    const targetIndex = shots.findIndex((entry) => entry.cutPlanItemId === cutId)
    requestSplitDraft(
      cutPlan[cutIndex], cutPlan[cutIndex - 1], cutPlan[cutIndex + 1],
      [pendingEdit.proposal?.title, pendingEdit.proposal?.detail].filter(Boolean).join(' — '),
      {
        cut: target?.image || null,
        before: targetIndex > 0 ? shots[targetIndex - 1]?.image || null : null,
        after: shots[targetIndex + 1]?.image || null,
      },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, cutId])

  // 겹치는 부분을 지운 안을 받는다. 그림도 함께 보낸다 — 두 그림이 이미
  // 같은 인물·소품·구도를 보여주고 있다면 그것이 문장보다 곧은 근거다.
  const requestMergeDraft = async () => {
    setMergePending(true)
    setMergeError(null)
    try {
      const { suggestSeamMerge } = await import('../services/api')
      const firstShot = shots.find((entry) => entry.cutPlanItemId === cutId)
      const secondShot = nextCut
        ? shots.find((entry) => entry.cutPlanItemId === nextCut.id)
        : null
      const seam = firstShot ? seams[seamKeyFor(firstShot.id)] : null
      const result = await suggestSeamMerge({
        firstContent: cut?.content || '',
        firstPurpose: cut?.purpose || '',
        secondContent: nextCut?.content || '',
        secondPurpose: nextCut?.purpose || '',
        elision: seam?.elision || '',
        script: scriptText,
        firstImage: firstShot?.image || null,
        secondImage: secondShot?.image || null,
      })
      setMergeDraft(result.content)
    } catch (error) {
      setMergeError(error.message)
    } finally {
      setMergePending(false)
    }
  }

  // 이음새의 '생략된 것'을 함께 넘긴다 — 감독이 직접 적어 둔 것이라
  // 무엇이 빠졌는지 가장 곧게 말해 준다.
  const requestInsertCandidates = async () => {
    setInsertPending(true)
    setInsertError(null)
    try {
      const { suggestSeamInsert } = await import('../services/api')
      const prevShot = shots[pendingEdit.index - 1]
      const nextShot = shots[pendingEdit.index]
      const seam = prevShot ? seams[seamKeyFor(prevShot.id)] : null
      const candidates = await suggestSeamInsert({
        beforeContent: cut?.content || '',
        beforePurpose: cut?.purpose || '',
        afterContent: nextCut?.content || '',
        afterPurpose: nextCut?.purpose || '',
        elision: seam?.elision || '',
        script: scriptText,
        diagnosis: proposalDiagnosis,
        beforeImage: prevShot?.image || null,
        afterImage: nextShot?.image || null,
      })
      setInsertCandidates(candidates)
    } catch (error) {
      setInsertError(error.message)
    } finally {
      setInsertPending(false)
    }
  }

  // 나눈 안을 받는다. 그림도 함께 보낸다 — 문장에 없는 자세·소품이
  // 화면에는 있을 수 있고, 그림이 텍스트보다 강한 근거다
  // (PANEL_GENERATION_DESIGN.md).
  async function requestSplitDraft(target, before, after, diagnosis, images = {}) {
    if (!target?.content?.trim()) return
    setSplitPending(true)
    setSplitError(null)
    try {
      const { suggestSeamSplit } = await import('../services/api')
      const draft = await suggestSeamSplit({
        content: target.content,
        purpose: target.purpose || '',
        characters: target.characters || '',
        beforeContent: before?.content || '',
        afterContent: after?.content || '',
        script: scriptText,
        diagnosis: diagnosis || '',
        cutImage: images.cut || null,
        beforeImage: images.before || null,
        afterImage: images.after || null,
      })
      setSplitDraft(draft)
    } catch (error) {
      setSplitError(error.message)
    } finally {
      setSplitPending(false)
    }
  }

  if (!pendingEdit || !cut) return null
  const isMerge = kind === 'merge'
  const isDelete = kind === 'delete'

  const run = () => {
    if (isMerge) {
      mergeCuts(cutId, { content: mergeDraft })
    } else if (kind === 'insert') {
      logScaffold({
        feature: 'alternative',
        // 세 갈래다 — 후보 그대로면 accept, 감독이 직접 쓴 것이면(후보를
        // 손봤든 처음부터 썼든) modify, 아무것도 안 쓰고 빈 컷을 만들었으면
        // reject다.
        action: !insertChoice?.content?.trim()
          ? 'reject'
          : insertChoice.provenance === 'AI' ? 'accept' : 'modify',
        target: cutId,
        proposed: insertCandidates.length > 0,
      })
      addCutPlanItem(cutId, cut.beat, insertChoice?.content?.trim() ? {
        content: insertChoice.content,
        purpose: insertChoice.purpose,
        characters: insertChoice.characters,
        provenance: insertChoice.provenance,
      } : {})
    } else if (isDelete) {
      deleteCut(cutId)
    } else {
      splitCut(cutId, {
        // 감독이 고친 내용까지 실어 보낸다. 한쪽이 비면 나눈 것이 아니므로
        // 빈 컷을 붙이는 기존 동작으로 둔다.
        parts: splitDraft?.first?.content?.trim() && splitDraft?.second?.content?.trim()
          ? splitDraft : null,
      })
    }
    if (pendingEdit.proposal?.operationId) {
      completeEditingOperation(pendingEdit.proposal.operationId, kind)
    }
    onDone?.(kind)
  }

  return (
    <div className={`grid-edit-preview ${className}`} aria-label="편집 미리보기">
      {showHeader && (
        <header>
          <strong>{TITLES[kind]}</strong>
          <button type="button" onClick={onClose} aria-label="닫기">✕</button>
        </header>
      )}

      {pendingEdit.proposal?.detail && (
        <div className="grid-edit-ai-proposal">
          <span>편집 렌즈 제안</span>
          {pendingEdit.proposal.title && <strong>{pendingEdit.proposal.title}</strong>}
          <p>{pendingEdit.proposal.detail}</p>
          {/* 왜 이 자리에서 끊었는지. 감독이 이 안을 받아들일지 판정하려면
              근거가 보여야 한다. */}
          {kind === 'split' && splitDraft?.reason && (
            <p className="grid-edit-split-reason">{splitDraft.reason}</p>
          )}
        </div>
      )}
      {kind === 'split' && splitError && (
        <p className="grid-edit-split-error">
          나눈 안을 받지 못했습니다 · {splitError} — 직접 나눌 수 있습니다.
        </p>
      )}

      <div className="grid-edit-diff">
        <div className="grid-edit-before">
          <span>현재 컷 프롬프트</span>
          <p>{cut.content || '(비어 있음)'}</p>
          {kind !== 'split' && !isDelete && nextCut && <p>{nextCut.content || '(비어 있음)'}</p>}
        </div>
        <div className="grid-edit-arrow" aria-hidden="true">→</div>
        <div className="grid-edit-after">
          <span>수정 뒤 컷 프롬프트</span>
          {isMerge ? (
            // 왼쪽 `지금`이 원문 두 문단을 다 보여주므로 이쪽도 그만큼은
            // 보여야 한다. CSS가 남은 높이를 채우지만, rows가 작으면 최소
            // 높이가 그만큼으로 잡혀 스크롤이 생긴다.
            <textarea
              value={mergeDraft}
              rows={8}
              onChange={(e) => setMergeDraft(e.target.value)}
              aria-label="합친 컷 프롬프트"
            />
          ) : isDelete ? (
            // 빠지는 컷은 취소선으로 남긴다. 사라지는 것을 지워서 보여주면
            // 무엇이 없어지는지 확인할 수 없다.
            <>
              <p className="grid-edit-removed"><s>{cut.content || '(비어 있음)'}</s></p>
              <p className="grid-edit-rejoin">
                {prevCut ? `S${cutIndex}` : '앞'} <i aria-hidden="true">→</i> {nextCut ? `S${cutIndex + 2}` : '뒤'}가 바로 이어집니다
              </p>
            </>
          ) : kind === 'insert' ? (
            <>
              <p>{cut.content || '(비어 있음)'}</p>
              {/* 후보를 고르면 이 칸이 채워지고, 감독이 그 문장을 그대로
                  두거나 고쳐 쓸 수 있다. */}
              <textarea
                className="grid-edit-new"
                value={insertChoice?.content ?? ''}
                rows={3}
                placeholder="새 컷 프롬프트 · 아래에서 고르거나 여기에 직접 씁니다"
                onChange={(e) => setInsertChoice((current) => ({
                  ...(current || {}),
                  content: e.target.value,
                  // 후보를 고른 뒤 감독이 문장을 손대면 그 시점부터 감독이
                  // 쓴 것이다 — 골랐다는 사실이 아니라 지금 화면에 있는
                  // 문장이 누구 것인지가 출처를 정한다.
                  provenance: 'User',
                }))}
                aria-label="새 컷 프롬프트"
              />
              <p>{nextCut?.content || '(비어 있음)'}</p>
            </>
          ) : kind === 'split' ? (
            // 두 칸 모두 감독이 고친다. 진단에서 왔으면 나눈 안이 채워져
            // 있고, 직접 나눌 때는 앞 칸에 원본이 그대로 들어와 뒤로 보낼
            // 부분을 잘라 옮기면 된다.
            <>
              <textarea
                value={splitDraft?.first?.content ?? ''}
                rows={4}
                placeholder={splitPending ? '나눌 자리를 찾는 중…' : '앞 샷 프롬프트'}
                onChange={(e) => setSplitDraft((current) => ({
                  ...current,
                  first: { ...(current?.first || {}), content: e.target.value },
                  second: current?.second || { content: '' },
                }))}
                aria-label="앞 샷 프롬프트"
              />
              <textarea
                className="grid-edit-new"
                value={splitDraft?.second?.content ?? ''}
                rows={4}
                placeholder={splitPending ? '' : '뒤 샷 프롬프트'}
                onChange={(e) => setSplitDraft((current) => ({
                  ...current,
                  first: current?.first || { content: '' },
                  second: { ...(current?.second || {}), content: e.target.value },
                }))}
                aria-label="뒤 샷 프롬프트"
              />
            </>
          ) : (
            <p>{cut.content || '(비어 있음)'}</p>
          )}
        </div>
      </div>

      {/* Merge는 이어붙인 문장으로 시작한다. 겹치는 부분을 지운 안으로
          바꾸려면 물어야 한다 — 자동으로 바꾸면 감독이 손대던 문장이
          예고 없이 사라진다. */}
      {isMerge && (
        <div className="grid-edit-candidates">
          <div className="grid-edit-candidates-head">
            <span>겹치는 부분이 있을 수 있습니다</span>
            <button type="button" disabled={mergePending} onClick={requestMergeDraft}>
              {mergePending ? '보는 중…' : 'AI에 물어보기'}
            </button>
          </div>
          {mergeError && (
            <p className="grid-edit-error">{mergeError} — 직접 고쳐 쓸 수 있습니다.</p>
          )}
        </div>
      )}

      {/* 직접 나눌 때도 AI 도움을 받을 수 있다. 진단에서 온 경우는 이미
          채워져 있으니 다시 물을 이유가 없다. */}
      {kind === 'split' && !splitDraft && !splitPending && (
        <div className="grid-edit-candidates">
          <div className="grid-edit-candidates-head">
            <span>어디서 나눌지 막막하다면</span>
            <button
              type="button"
              onClick={() => {
                const target = shots.find((entry) => entry.cutPlanItemId === cutId)
                const targetIndex = shots.findIndex((entry) => entry.cutPlanItemId === cutId)
                requestSplitDraft(cut, prevCut, nextCut, '', {
                  cut: target?.image || null,
                  before: targetIndex > 0 ? shots[targetIndex - 1]?.image || null : null,
                  after: shots[targetIndex + 1]?.image || null,
                })
              }}
            >
              AI에 물어보기
            </button>
          </div>
          {splitError && <p className="grid-edit-error">{splitError} — 직접 나눌 수 있습니다.</p>}
        </div>
      )}

      {/* 무엇을 넣을지. 앞뒤 컷과 이음새의 '생략된 것'에서 나온다. */}
      {kind === 'insert' && (
        <div className="grid-edit-candidates">
          <div className="grid-edit-candidates-head">
            <button type="button" onClick={requestInsertCandidates} disabled={insertPending}>
              {insertPending ? '보는 중…' : insertCandidates.length ? 'AI에 다시 물어보기' : 'AI에 물어보기'}
            </button>
          </div>
          {insertError && <p className="grid-edit-error">{insertError}</p>}
          {insertCandidates.map((candidate) => {
            const chosen = insertChoice?.content === candidate.content
            return (
              <button
                key={candidate.content}
                type="button"
                className={`grid-edit-candidate${chosen ? ' selected' : ''}`}
                aria-pressed={chosen}
                onClick={() => {
                  logScaffold({
                    feature: 'alternative',
                    action: chosen ? 'reject' : 'select',
                    target: cutId,
                    purpose: candidate.purpose,
                  })
                  setInsertChoice(chosen ? null : { ...candidate, provenance: 'AI' })
                }}
              >
                {/* 인물 이름은 뺀다 — content(문장) 안에 이미 있어서 태그
                    줄에 다시 적으면 같은 정보가 두 번 보인다. */}
                <strong>{candidate.content}</strong>
                <em>{candidate.purpose}</em>
                <span>{candidate.reason}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* 함께 바뀌는 것. 요청한 변경과 구분해 보여준다. */}
      <ul className="grid-edit-effects">
        {isMerge && (
          <>
            <li>컷 {cutPlan.length} → {cutPlan.length - 1}</li>
            <li>두 컷 사이의 이음새가 사라집니다</li>
            {pendingEdit.losesDrawing && (
              <li className="warn">S{pendingEdit.index + 1}의 그림이 사라집니다</li>
            )}
          </>
        )}
        {kind === 'split' && (
          <>
            <li>컷 {cutPlan.length} → {cutPlan.length + 1}</li>
            <li>사이에 새 이음새가 생깁니다 · 컷 · 연속</li>
            {/* 두 칸을 다 채우면 앞 컷의 내용도 줄어든다. 옛 그림은 더 이상
                그 컷을 담고 있지 않으므로 두 컷을 다 다시 그린다. */}
            {splitDraft?.first?.content?.trim() && splitDraft?.second?.content?.trim()
              ? <li className="warn">앞 컷의 내용도 줄어들어 두 컷을 다시 그립니다</li>
              : <li>뒤 칸을 비워 두면 기존 그림은 앞 컷에 남습니다</li>}
          </>
        )}
        {kind === 'insert' && (
          <>
            <li>컷 {cutPlan.length} → {cutPlan.length + 1}</li>
            <li>{insertChoice
              ? '선택한 내용으로 새 패널을 바로 생성합니다'
              : '내용을 고르지 않으면 빈 패널로 추가됩니다'}</li>
          </>
        )}
        {isDelete && (
          <>
            <li>컷 {cutPlan.length} → {cutPlan.length - 1}</li>
            <li>뒤 컷의 번호가 한 칸씩 앞으로 밀립니다</li>
            {/* 그림이 있는 컷을 빼는 것은 되돌리기가 가장 비싸다. */}
            <li className="warn">이 컷의 그림과 프롬프트가 함께 사라집니다</li>
          </>
        )}
      </ul>

      <div className="grid-edit-actions">
        <button type="button" onClick={onClose}>취소</button>
        <button
          type="button"
          className="primary"
          onClick={run}
          // 앞 칸만 고치고 뒤를 비워 두면 그 수정이 조용히 버려진다.
          // 나누는 일이므로 두 칸이 다 차야 실행할 수 있다.
          disabled={kind === 'split'
            && Boolean(splitDraft?.first?.content?.trim())
            !== Boolean(splitDraft?.second?.content?.trim())}
        >
          {RUN_LABELS[kind]}
        </button>
      </div>
    </div>
  )
}
