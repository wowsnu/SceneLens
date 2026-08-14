import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import useStore, {
  buildCutPrompt,
  describeLayout,
  layoutToImage,
  selectCutStage,
  RESPONSIBILITY_LEVELS,
  OFFIMAGE_CHANNELS,
  CAMERA_MOVE_TYPES,
  buildPanelMarks,
  selectScenes,
  cutOrderOf,
  selectActiveSceneId,
  selectActiveSceneState,
  sceneOfBeat,
  seamKeyFor,
  isSeamMarked,
  SEAM_JOINS,
  SEAM_ELAPSED,
  diagnoseCoverage,
  diagnoseSeams,
  PROBLEM_LAYERS,
} from '../store/useStore'
import './StoryboardView.css'
import { logEdit, logEvent, logScaffold } from '../store/studyLog'

// 규칙 id를 그대로 보이면 감독이 읽을 것이 아니다.
const NARRATIVE_RULE_LABELS = {
  // 대본 — 서사가 본다.
  'narrative-beat-progression': '이야기가 제자리예요',
  'narrative-action-visibility': '그릴 수 없게 쓰였어요',
  'narrative-information-reveal': '알려주는 때가 안 맞아요',
  'narrative-causal-link': '앞뒤가 안 이어져요',
  // 컷 플랜 — 편집이 본다. 컷 단위 판단은 편집의 일이다.
  'editing-shot-function': '이 컷이 필요할까요',
  'editing-information-order': '보여주는 순서가 아쉬워요',
}

const EMPTY_SHOTS = []


// 관객 관점 Initial Reading을 실제 화면으로 점검하기 위한 고정 테스트 시퀀스.
// 생성 API의 결과가 아니라 public에 저장된 패널이므로, 비어 있는 컷에만
// 명시적으로 연결한다. 기존 드로잉·가져온 이미지를 덮어쓰지 않는다.
const VIEWER_TEST_PANEL_IMAGES = [
  '/img/viewer-test/panel-01-control-room-establishing.png',
  '/img/viewer-test/panel-02-jaein-enters.png',
  '/img/viewer-test/panel-03-minho-looks-back.png',
  '/img/viewer-test/panel-04-minho-turns.png',
  '/img/viewer-test/panel-05-jaein-points-camera.png',
  '/img/viewer-test/panel-06-monitor-wall.png',
  '/img/viewer-test/panel-07-remote-revealed.png',
  '/img/viewer-test/panel-08-jaein-cornered.png',
  '/img/viewer-test/panel-09-child-platform.png',
  '/img/viewer-test/panel-10-jaein-lunges.png',
]

// 줄 종류는 둘뿐이다. 대사·괄호·전환은 두지 않는다 — 정지 이미지가
// 담을 수 없고, 스토리보드가 평가하려는 것도 아니다.
const SCRIPT_LINE_TYPES = [
  { value: 'scene-heading', label: 'Scene' },
  { value: 'action', label: 'Action' },
]

// Script 단계에서 대본을 그 자리에서 고친다. 별도 raw 편집기를 열고
// 전체를 다시 붙여넣지 않아도 되고, beat 구조가 유지된다.
// 샷 크기를 바꿔 풀리는 진단. 여기 없는 것은 두 종류다 — 컷을 나누거나
// 합쳐야 하는 것(층위가 다르다)과 angle-flat(표에 앵글 칸이 없다).
const SHOT_FIXABLE = new Set([
  'jump-cut', 'size-run',
  'size-mismatch', 'no-establishing',
  'anchor-too-tight', 'approach-broken', 'peak-not-closest',
])

const SEAM_ACTION_LABEL = {
  split: '나눌 컷 보기',
  merge: '두 컷 보기',
  insert: '넣을 자리 보기',
  seam: '이음새 보기',
}

// 촬영·편집의 진단 카드. 문제의 층위를 밝힌다 (design_goal.md DG2:
// 원인이 속성·컷 구성·컷 관계·씬 구조 중 어디인지 진단하고 해당
// 층위에서 개입한다). 고치는 것은 표에서 하므로 버튼은 데려다주기만 한다.
// 씬 기준의 값 한 줄. 대본에서 읽은 것이든 비어 있는 것이든 전부 고칠 수
// 있다 — AI가 대본을 잘못 읽었을 때 고칠 방법이 없으면 안 된다. 다만
// 어디서 온 값인지는 구분해 보인다 (DG1 P2: AI가 낸 것은 판정 대상이다).
// 도면은 SVG로 만들지만 images.edit는 PNG만 받는다. 캔버스로 옮긴다.
const rasterizeLayout = (svgDataUrl) => new Promise((resolve) => {
  if (!svgDataUrl) return resolve(null)
  const image = new Image()
  image.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = image.width || 768
    canvas.height = image.height || 768
    const context = canvas.getContext('2d')
    // 투명 배경은 검게 깔린다. 도면은 흰 종이여야 읽힌다.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0)
    resolve(canvas.toDataURL('image/png'))
  }
  // 도면을 못 만들어도 패널은 나와야 한다.
  image.onerror = () => resolve(null)
  image.src = svgDataUrl
})

// 화면은 data URL로 들고 있고 서버는 base64만 받는다.
// 파일 경로('/img/x.png')를 들고 있는 레퍼런스도 있어, base64가 아닌 것은
// 걸러낸다 — 그대로 보내면 서버가 디코드하다 500으로 끝난다.
const stripDataUrl = (value = '') => {
  if (!value.startsWith('data:image/')) return ''
  return value.replace(/^data:image\/\w+;base64,/, '')
}

function SceneFactRow({ fact, onCommit, cutOptions = [], onAddChange, onRemoveChange }) {
  const [draft, setDraft] = useState(fact.value || '')
  // 대본을 다시 읽으면 화면 값도 따라가야 한다. 렌더 중에 맞추면 effect가
  // 한 번 더 도는 것을 피할 수 있다.
  const [synced, setSynced] = useState(fact.value || '')
  if (synced !== (fact.value || '')) {
    setSynced(fact.value || '')
    setDraft(fact.value || '')
  }

  const commit = () => {
    const next = draft.trim()
    if (next !== (fact.value || '')) onCommit(next)
  }

  const changes = fact.changes || []
  const canChange = Boolean(onAddChange) && cutOptions.length > 0

  const addChange = () => {
    // 아직 변화가 없는 첫 컷을 고른다. 같은 컷에 두 번 얹을 수 없다.
    const used = new Set(changes.map((change) => change.cutId))
    const open = cutOptions.find((option) => !used.has(option.cutId))
    if (open) onAddChange(open.cutId, '')
  }

  return (
    <div className="rail-scene-fact-block">
      <label className={`rail-scene-fact${fact.open ? ' is-open' : ''}`}>
        <span>{fact.label}</span>
        <input
          type="text"
          value={draft}
          placeholder="아직 지정되지 않음"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') setDraft(fact.value || '')
          }}
        />
        {/* 인물과 공간은 씬 안에서 변한다. 처음 값만 두면 옷을 갈아입어도
            모든 컷이 같은 모습으로 그려진다. */}
        {canChange && (
          <button
            type="button"
            className="rail-scene-fact-add"
            onClick={addChange}
            title="이 컷부터 값이 바뀝니다"
            aria-label={`${fact.label} 변화 추가`}
          >
            +
          </button>
        )}
      </label>

      {/* 지워진 컷을 가리키는 변화는 값을 못 낸다. 목록에서도 빼면
          되살릴 방법이 없으므로, 고를 수 있는 컷만 남기고 보여준다. */}
      {changes.map((change) => (
        <SceneFactChangeRow
          key={change.cutId}
          change={change}
          cutOptions={cutOptions}
          taken={changes.map((entry) => entry.cutId)}
          onCommit={(value) => onAddChange(change.cutId, value)}
          onMove={(nextCutId) => {
            onRemoveChange(change.cutId)
            onAddChange(nextCutId, change.value)
          }}
          onRemove={() => onRemoveChange(change.cutId)}
        />
      ))}
    </div>
  )
}

// 특정 컷부터 값이 바뀐다. 처음 값을 덮어쓰지 않고 구간만 얹는다 —
// 덮어쓰면 앞 컷들이 무엇이었는지 알 수 없게 된다.
function SceneFactChangeRow({ change, cutOptions, taken, onCommit, onMove, onRemove }) {
  const [draft, setDraft] = useState(change.value || '')
  const [synced, setSynced] = useState(change.value || '')
  if (synced !== (change.value || '')) {
    setSynced(change.value || '')
    setDraft(change.value || '')
  }

  return (
    <div className="rail-scene-change">
      <select
        value={change.cutId}
        onChange={(event) => onMove(event.target.value)}
        aria-label="변화가 시작되는 컷"
      >
        {/* 가리키던 컷이 지워졌으면 목록에 없다. 그대로 두면 첫 항목이
            선택돼 보여 다른 컷을 가리키는 것처럼 읽힌다. */}
        {!cutOptions.some((option) => option.cutId === change.cutId) && (
          <option value={change.cutId}>지워진 컷</option>
        )}
        {cutOptions.map((option) => (
          <option
            key={option.cutId}
            value={option.cutId}
            disabled={option.cutId !== change.cutId && taken.includes(option.cutId)}
          >
            {option.label}부터
          </option>
        ))}
      </select>
      <input
        type="text"
        value={draft}
        placeholder="이 컷부터의 값"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft.trim() !== (change.value || '')) onCommit(draft.trim())
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
          if (event.key === 'Escape') setDraft(change.value || '')
        }}
      />
      <button type="button" onClick={onRemove} aria-label="변화 삭제">×</button>
    </div>
  )
}

function DiagnosisList({
  findings, emptyLabel, onGoTo,
  onRequestFix, fixPending, fixProposal, fixError, onAcceptFix, onRejectFix,
}) {
  if (findings.length === 0) {
    return <p className="rail-coverage-clear">{emptyLabel}</p>
  }

  return (
    <ul className="rail-coverage">
      {findings.map((finding) => {
        const layer = PROBLEM_LAYERS[finding.layer]
        // 샷 크기로 풀리는 진단만 촬영에 물을 수 있다. 컷을 나누거나
        // 합쳐야 하는 것은 층위가 다르다.
        const canFix = Boolean(onRequestFix) && SHOT_FIXABLE.has(finding.type)
        const proposal = fixProposal?.findingId === finding.id ? fixProposal : null
        return (
          <li key={finding.id}>
            {layer && (
              <span className={`rail-layer-tag layer-${finding.layer}`} title={layer.hint}>
                {layer.label}
              </span>
            )}
            <strong>{finding.title}</strong>
            <p>{finding.detail}</p>
            {/* 데려다주기만 하면 무엇을 해야 하는지 사용자가 다시
                알아내야 한다. 샷으로 풀리는 진단은 촬영에 수정본을 묻는다. */}
            <div className="rail-fix-actions">
              {canFix && (
                <button
                  type="button"
                  onClick={() => onRequestFix(finding)}
                  disabled={fixPending === finding.id}
                >
                  {fixPending === finding.id ? '촬영에 묻는 중…' : '수정본 받기'}
                </button>
              )}
              <button type="button" className="ghost" onClick={() => onGoTo(finding)}>
                {SEAM_ACTION_LABEL[finding.action] || '표에서 보기'}
                {finding.cutIds.length > 1 && ` · ${finding.cutIds.length}`}
              </button>
            </div>

            {canFix && fixError && fixPending !== finding.id && !proposal && (
              <p className="rail-fix-error">{fixError}</p>
            )}

            {/* 수락해야 표에 들어간다. 무엇이 어떻게 바뀌는지 먼저 보인다. */}
            {proposal && (
              <div className="rail-fix">
                {proposal.summary && <p className="rail-fix-summary">{proposal.summary}</p>}
                <ul className="rail-fix-edits">
                  {proposal.edits.map((edit) => (
                    <li key={edit.cutId} className={edit.isTarget ? '' : 'is-ripple'}>
                      <div className="rail-fix-change">
                        <strong>{edit.label}</strong>
                        <span>{edit.from} → {edit.to}</span>
                        {/* 진단에 걸린 컷이 아니라 그 여파로 함께 고치는
                            컷. 구분이 없으면 왜 나왔는지 알 수 없다. */}
                        {!edit.isTarget && <em>연쇄</em>}
                      </div>
                      {edit.reason && <p>{edit.reason}</p>}
                    </li>
                  ))}
                </ul>
                <div className="rail-fix-actions">
                  <button type="button" onClick={onAcceptFix}>수락</button>
                  <button type="button" className="ghost" onClick={onRejectFix}>거부</button>
                </div>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function ScriptLineEditor({
  element, index, onChange, onChangeType, onInsertAfter, onRemove, canRemove, showTools,
  autoFocus, focusCaret, onFocused, onMoveFocus,
}) {
  const textareaRef = useRef(null)

  // 내용에 맞춰 높이를 맞춰야 대본처럼 읽힌다.
  const resize = () => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }

  useEffect(resize, [element.text])

  // Enter로 만든 줄이나 위아래 이동으로 지목된 줄에 커서를 옮긴다.
  // 이게 없으면 새 줄이 생겨도 계속 이전 줄에 타이핑하게 된다.
  useEffect(() => {
    if (!autoFocus) return
    const node = textareaRef.current
    if (!node) return
    node.focus()
    const caret = focusCaret === 'end' ? node.value.length : Math.min(focusCaret ?? 0, node.value.length)
    node.setSelectionRange(caret, caret)
    onFocused?.()
  }, [autoFocus, focusCaret, onFocused])

  return (
    <div className="script-line-editor" onClick={(event) => event.stopPropagation()}>
      {showTools && (
        <select
          className="script-line-type"
          value={element.type}
          onChange={(event) => onChangeType(index, event.target.value)}
          aria-label={`Line ${index + 1} type`}
          title="Line type"
        >
          {SCRIPT_LINE_TYPES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      )}
      <textarea
        ref={textareaRef}
        className={`script-line-input sb-script-${element.type}`}
        value={element.text}
        rows={1}
        placeholder="빈 줄"
        aria-label={`Line ${index + 1}`}
        onChange={(event) => {
          onChange(index, event.target.value)
          resize()
        }}
        onKeyDown={(event) => {
          const node = event.currentTarget
          const caret = node.selectionStart
          const atStart = caret === 0 && node.selectionEnd === 0
          const atEnd = caret === node.value.length && node.selectionEnd === node.value.length

          // Enter: 커서 뒤 내용을 새 줄로 넘긴다. textarea에서 줄바꿈하듯 쓰인다.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            const before = node.value.slice(0, caret)
            const after = node.value.slice(node.selectionEnd)
            // 인물 이름 다음 줄은 대사로 이어지는 것이 자연스럽다.
            const nextType = element.type === 'scene-heading' ? 'action' : element.type
            onInsertAfter(index, nextType, { before, after })
            return
          }

          // 줄 맨 앞에서 Backspace: 앞 줄과 합친다.
          if (event.key === 'Backspace' && atStart && index > 0) {
            event.preventDefault()
            onRemove(index, { mergeIntoPrevious: true })
            return
          }

          if (event.key === 'Backspace' && element.text === '' && canRemove) {
            event.preventDefault()
            onRemove(index)
            return
          }

          // 줄 경계에서 위아래 화살표는 다음 줄로 넘어간다.
          if (event.key === 'ArrowUp' && atStart) {
            event.preventDefault()
            onMoveFocus?.(index - 1, 'end')
          } else if (event.key === 'ArrowDown' && atEnd) {
            event.preventDefault()
            onMoveFocus?.(index + 1, 0)
          }
        }}
      />
      {showTools && (
        <button
          type="button"
          className="script-line-remove"
          onClick={() => onRemove(index)}
          disabled={!canRemove}
          aria-label={`Delete line ${index + 1}`}
          title="Delete line"
        >
          ×
        </button>
      )}
    </div>
  )
}

// Panels 단계의 오른쪽. 선택한 패널이 어느 컷에서 왔고 무엇이 정해져
// 있는지 보여주고 그 자리에서 고친다. 값의 출처는 컷이므로 컷을 고친다.
// 설계 근거: docs/PANEL_GENERATION_DESIGN.md §3.3
function ShotInspector({
  shot, cut, prompt, shotSizes, angles, moves, onChange, onClose,
  // 그림을 보고 정하기로 미뤄둔 선언 (DG1 P4). 여기서 판정한다.
  deferredDeclarations = [], decidedDeclarations = [],
  onDeclarationDecide, onDeclarationReject,
}) {
  if (!shot) {
    return (
      <aside className="shot-inspector empty" aria-label="Shot inspector">
        <p>패널을 클릭하면 그 컷의 설정이 여기에 나타납니다.</p>
      </aside>
    )
  }

  if (!cut) {
    return (
      <aside className="shot-inspector empty" aria-label="Shot inspector">
        <header>
          <strong>{shot.label}</strong>
          <button type="button" onClick={onClose} aria-label="Close">×</button>
        </header>
        <p>이 패널은 컷 플랜과 연결되어 있지 않습니다. 컷 플랜을 다시 적용하면 연결됩니다.</p>
      </aside>
    )
  }

  const field = (label, key, options) => (
    <label className="shot-inspector-field" key={key}>
      <span>{label}</span>
      {options ? (
        <select
          className={cut[key] ? '' : 'is-undecided'}
          value={cut[key] || ''}
          onChange={(event) => onChange(cut.id, { [key]: event.target.value })}
        >
          {/* 빈 값이면 첫 항목이 선택돼 보여 정해진 것처럼 읽힌다. */}
          <option value="">미정</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input
          type="text"
          value={cut[key] || ''}
          onChange={(event) => onChange(cut.id, { [key]: event.target.value })}
        />
      )}
    </label>
  )

  return (
    <aside className="shot-inspector" aria-label="Shot inspector">
      <header>
        <div>
          <span>Cut {cut.order || cut.beatOrder}</span>
          <strong>{shot.label}</strong>
        </div>
        <button type="button" onClick={onClose} aria-label="Close inspector">×</button>
      </header>

      <section>
        <h4>이 컷의 결정</h4>
        <div className="shot-inspector-grid">
          {field('샷 사이즈', 'shotSize', shotSizes)}
          {field('앵글', 'angle', angles)}
          {field('카메라', 'cameraMove', moves)}
          {field('시간', 'time')}
          {field('장소', 'place')}
          {field('인물', 'characters')}
        </div>
        {/* 촬영이 왜 이 샷을 골랐는지. 판정하려면 근거가 보여야 한다. */}
        {cut.shotReason && (
          <p className="shot-inspector-reason">
            <span>촬영</span>
            {cut.shotReason}
          </p>
        )}
        <label className="shot-inspector-field wide">
          <span>중요한 것</span>
          <input
            type="text"
            value={cut.purpose || ''}
            onChange={(event) => onChange(cut.id, { purpose: event.target.value })}
          />
        </label>
      </section>

      <section>
        <h4>
          프롬프트
          {prompt?.isEdited && (
            <button
              type="button"
              className="shot-inspector-revert"
              onClick={() => onChange(cut.id, { promptOverride: '' })}
            >
              되돌리기
            </button>
          )}
        </h4>
        <textarea
          className="shot-inspector-prompt"
          value={prompt?.effective || ''}
          rows={9}
          onChange={(event) => onChange(cut.id, { promptOverride: event.target.value })}
          onBlur={(event) => {
            // 글자마다 남기면 로그가 타건 기록이 된다. 편집을 마쳤을 때
            // 한 번만 남긴다.
            if (!event.target.value.trim()) return
            logEdit({ level: 'element', target: cut.id, action: 'prompt' })
          }}
          placeholder="컷 내용이 비어 있습니다."
        />
        {prompt?.shared && <p className="shot-inspector-shared">{prompt.shared}</p>}

        {/* 이 컷이 무엇을 그림에 맡기지 않았는지 (DG1 P3).
            생성된 그림에 그 요소가 보이더라도 결정이 아니라는 표시다. */}
        {prompt?.responsibility?.delegated?.length > 0 && (
          <div className="shot-inspector-delegated">
            <strong>이 그림이 정하지 않는 것</strong>
            <ul>
              {prompt.responsibility.delegated.map((element) => (
                <li key={element}>{element}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 방향만 표시한 것은 패널의 화살표가 이미 보여준다.
            여기서 다시 나열하지 않는다. */}
      </section>

      {/* 모든 요소를 고르게 하지 않는다. 기존 선언 데이터와 제약 해제 통로는
          보존하되, 평소 작업에서는 화살표·메모가 먼저 보이도록 접어 둔다. */}
      {(deferredDeclarations.length > 0 || decidedDeclarations.length > 0) && (
        <details className="shot-inspector-section shot-inspector-deferred">
          <summary>
            고급 표시 설정
            {deferredDeclarations.length > 0 && (
              <em>{deferredDeclarations.length} 미정</em>
            )}
          </summary>
          <p className="shot-inspector-deferred-help">
            이미지 제약이나 후속 공정 구분이 꼭 필요할 때만 확인하세요.
          </p>
          <ul>
            {[...deferredDeclarations, ...decidedDeclarations].map((decl) => {
              const decided = decl.status === 'Accepted'
              return (
                <li key={decl.id} className={decided ? 'is-decided' : ''}>
                  <div className="deferred-head">
                    <strong>{decl.element}</strong>
                    {!decided && <span className="deferred-mark">미정</span>}
                    <button
                      type="button"
                      className="deferred-dismiss"
                      title={decided ? '선언 해제' : '이 요소는 선언하지 않는다'}
                      aria-label={`${decl.element} ${decided ? '선언 해제' : '선언하지 않음'}`}
                      onClick={() => onDeclarationReject(decl.id)}
                    >
                      ×
                    </button>
                  </div>
                  {/* 칩을 고르는 것이 곧 판정이다. 별도의 '선언' 버튼을 두면
                      같은 결정을 두 번 누르게 된다. AI 기본값을 그대로 두면
                      판정하지 않은 것으로 남는다 (DG1 P2). */}
                  {/* 판정 전에는 AI 제안값을 옅게 표시한다. 확정과 같은
                      모양이면 이미 정해진 것으로 읽힌다 (DG1 P2). */}
                  <div className={`deferred-chips${decided ? '' : ' is-proposed'}`}>
                    {RESPONSIBILITY_LEVELS.map((level) => (
                      <button
                        key={level.id}
                        type="button"
                        className={decl.responsibility === level.id ? 'active' : ''}
                        title={decided ? level.hint : `${level.hint} · AI 제안, 눌러서 확정`}
                        onClick={() => onDeclarationDecide(decl.id, level.id)}
                      >
                        {level.label}
                      </button>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        </details>
      )}
    </aside>
  )
}

// 이미지 밖 채널을 패널 위에 그린다 (DG1 P3).
// 화살표는 사용자가 직접 끌어서 그린다 — 카메라가 어느 쪽으로 움직이는지는
// 감독이 화면을 보고 정하는 것이지 텍스트에서 유추할 것이 아니다.
function PanelOverlay({
  marks, arrows, drawing, selectedArrowId, onDrawArrow, onSelectArrow,
}) {
  const [draft, setDraft] = useState(null)
  const surfaceRef = useRef(null)

  const corners = marks.filter((mark) => mark.type === 'corner')
  if (marks.length === 0 && arrows.length === 0 && !drawing) return null

  // 패널 크기와 무관하게 저장하려면 0~1 비율로 바꿔야 한다.
  const toRatio = (event) => {
    const rect = surfaceRef.current.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  const handleDown = (event) => {
    if (!drawing) return
    event.stopPropagation()
    event.preventDefault()
    const point = toRatio(event)
    setDraft({ x1: point.x, y1: point.y, x2: point.x, y2: point.y })
  }

  const handleMove = (event) => {
    if (!draft) return
    const point = toRatio(event)
    setDraft((prev) => ({ ...prev, x2: point.x, y2: point.y }))
  }

  const handleUp = (event) => {
    if (!draft) return
    event.stopPropagation()
    // 점을 찍은 정도는 화살표가 아니다.
    const far = Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 0.06
    if (far) onDrawArrow(draft)
    setDraft(null)
  }

  const line = (arrow, key, className, onClick) => {
    const angle = Math.atan2(arrow.y2 - arrow.y1, arrow.x2 - arrow.x1)
    // 화살촉은 선 끝에서 각도만큼 되돌아온 두 점으로 만든다.
    const head = 3.2
    const spread = 0.42
    const hx = (offset) => arrow.x2 * 100 - head * Math.cos(angle + offset)
    const hy = (offset) => arrow.y2 * 100 - head * Math.sin(angle + offset) * (16 / 9)
    return (
      <g key={key} className={className} onClick={onClick}>
        <line x1={arrow.x1 * 100} y1={arrow.y1 * 100} x2={arrow.x2 * 100} y2={arrow.y2 * 100} />
        <polyline
          points={`${hx(spread)},${hy(spread)} ${arrow.x2 * 100},${arrow.y2 * 100} ${hx(-spread)},${hy(-spread)}`}
          fill="none"
        />
      </g>
    )
  }

  return (
    <div
      ref={surfaceRef}
      className={`sb-panel-overlay${drawing ? ' drawing' : ''}`}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerLeave={() => setDraft(null)}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="sb-overlay-svg">
        {arrows.map((arrow) => line(
          arrow,
          arrow.id,
          `sb-arrow${selectedArrowId === arrow.id ? ' selected' : ''}`,
          (event) => {
            if (!drawing) return
            event.stopPropagation()
            onSelectArrow(arrow.id)
          },
        ))}
        {draft && line(draft, 'draft', 'sb-arrow draft')}
      </svg>

      {/* 화살표에 붙은 이름은 SVG 밖에 둔다. 비율 스케일 때문에 글자가 늘어난다. */}
      {arrows.filter((arrow) => arrow.label).map((arrow) => (
        <span
          key={`${arrow.id}-label`}
          className="sb-arrow-label"
          style={{ left: `${arrow.x2 * 100}%`, top: `${arrow.y2 * 100}%` }}
        >
          {arrow.label}
        </span>
      ))}

      {corners.length > 0 && (
        <div className="sb-overlay-corner">
          {corners.map((mark) => (
            <span
              key={mark.element}
              className={mark.pending ? 'pending' : ''}
              title={mark.pending ? `${mark.element} · 아직 판정하지 않음` : mark.element}
            >
              {mark.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function CameraMovePicker({ existing = false, onChoose, onDelete, onCancel }) {
  return (
    <div className="sb-camera-move-picker" onClick={(event) => event.stopPropagation()}>
      <span>{existing ? '화살표 수정' : '이동 종류'}</span>
      <div>
        {CAMERA_MOVE_TYPES.map((move) => (
          <button key={move.id} type="button" onClick={() => onChoose(move)}>
            <strong>{move.label}</strong>
            <small>{move.name}</small>
          </button>
        ))}
      </div>
      <footer>
        {existing && <button type="button" className="danger" onClick={onDelete}>삭제</button>}
        <button type="button" onClick={onCancel}>취소</button>
      </footer>
    </div>
  )
}

// 패널에 붙이는 메모. 포스트잇처럼 붙어 있다가 없으면 자리를 차지하지 않는다.
// 그림 위에 상시 입력칸을 두면 패널이 어지러워진다.
function PanelNote({ note, onChange, editing, onEditingChange }) {
  const inputRef = useRef(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const stop = (event) => event.stopPropagation()

  if (!note && !editing) return null

  return (
    <div className={`sb-note${editing ? ' editing' : ''}`} onClick={stop}>
      {editing ? (
        <textarea
          ref={inputRef}
          value={note}
          rows={2}
          placeholder="메모"
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => onEditingChange(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onEditingChange(false)
          }}
        />
      ) : (
        <p
          role="button"
          tabIndex={0}
          onClick={() => onEditingChange(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onEditingChange(true)
          }}
        >
          {note}
        </p>
      )}
    </div>
  )
}

// 제안 카드. 무엇을 하는 제안인지 한눈에 보여야 한다 —
// 나누기면 어디서 나누는지, 추가면 무슨 문장이 들어가는지.
// 부가 정보를 얹을수록 정작 그것이 안 보인다.
function NarrativeSuggestionCard({ suggestion, onAccept, onDismiss }) {
  const KIND = {
    'split-beat': '여기서 Beat 나누기',
    'insert-script-line': '이 줄 다음에 추가',
    'replace-script-line': '이 줄을 바꾸기',
  }[suggestion.type] || '제안'

  return (
    <aside
      className={`narrative-inline-suggestion ${suggestion.type}`}
      onClick={(event) => event.stopPropagation()}
    >
      <span className="narrative-suggestion-kind">{KIND}</span>

      {/* 나누기는 자리가 곧 내용이다. 보여줄 문장이 없다. */}
      {suggestion.type === 'insert-script-line' && (
        <p className="narrative-suggestion-text added">{suggestion.proposedText}</p>
      )}
      {suggestion.type === 'replace-script-line' && (
        <>
          <p className="narrative-suggestion-text removed">{suggestion.originalText}</p>
          <p className="narrative-suggestion-text added">{suggestion.proposedText}</p>
        </>
      )}

      <div className="narrative-suggestion-actions">
        <button type="button" onClick={() => onDismiss(suggestion.id)}>버리기</button>
        <button type="button" className="accept" onClick={() => onAccept(suggestion)}>
          적용
        </button>
      </div>
    </aside>
  )
}

export default function StoryboardView() {
  const screenplay = useStore((s) => s.screenplay)
  const setScreenplay = useStore((s) => s.setScreenplay)
  const sceneIntention = useStore((s) => s.sceneIntention)
  const setSceneIntention = useStore((s) => s.setSceneIntention)
  const splitBeat = useStore((s) => s.splitBeat)
  const splitCut = useStore((s) => s.splitCut)
  const mergeCuts = useStore((s) => s.mergeCuts)
  const mergeBeat = useStore((s) => s.mergeBeat)
  const activeScene = useStore((s) => s.activeScene)
  const scene = useStore((s) => s.scenes[s.activeScene])
  const shotSketches = useStore((s) => s.shotSketches)
  const setActiveShot = useStore((s) => s.setActiveShot)
  const setFlowActiveShot = useStore((s) => s.setFlowActiveShot)
  const setActiveBeat = useStore((s) => s.setActiveBeat)
  const selectBeat = useStore((s) => s.selectBeat)
  const activeBeat = useStore((s) => s.activeBeat)
  const removeShot = useStore((s) => s.flowRemoveShot)
  const maximizedPanel = useStore((s) => s.maximizedPanel)
  const storyboardPanelsVisible = useStore((s) => s.storyboardPanelsVisible)
  const setCenterTab = useStore((s) => s.setCenterTab)
  const setMaximizedPanel = useStore((s) => s.setMaximizedPanel)
  const drawingWorkspaceOpen = useStore((s) => s.drawingWorkspaceOpen)
  const openDrawingWorkspace = useStore((s) => s.openDrawingWorkspace)
  const selectedShotIds = useStore((s) => s.selectedStoryboardShotIds)
  const setSelectedShotIds = useStore((s) => s.setSelectedStoryboardShotIds)
  const scriptEditorRequestKey = useStore((s) => s.scriptEditorRequestKey)
  const narrativeSuggestions = useStore((s) => s.narrativeSuggestions)
  const requestNarrativeSuggestions = useStore((s) => s.requestNarrativeSuggestions)
  const requestNarrativeCheck = useStore((s) => s.requestNarrativeCheck)
  const narrativeCheck = useStore((s) => s.narrativeCheck)
  const narrativeCheckPending = useStore((s) => s.narrativeCheckPending)
  const narrativeCheckError = useStore((s) => s.narrativeCheckError)
  const dismissNarrativeSuggestion = useStore((s) => s.dismissNarrativeSuggestion)
  const updateFlowShotById = useStore((s) => s.updateFlowShotById)
  const setPendingCanvasImage = useStore((s) => s.setPendingCanvasImage)
  const cutPlan = useStore((s) => s.cutPlan)
  const cutPlanAccepted = useStore((s) => s.cutPlanAccepted)
  const cutPlanSkipped = useStore((s) => s.cutPlanSkipped)
  const reopenCutPlan = useStore((s) => s.reopenCutPlan)
  const cutPlanOrphanedShots = useStore((s) => s.cutPlanOrphanedShots)
  const clearCutPlanOrphanWarning = useStore((s) => s.clearCutPlanOrphanWarning)
  const viewerFindingHandoff = useStore((s) => s.viewerFindingHandoff)
  const clearViewerFindingHandoff = useStore((s) => s.clearViewerFindingHandoff)
  const cutStage = useStore(selectCutStage)
  // 책임 범위 선언 (DG1 P3)
  const declarations = useStore((s) => s.declarations)
  const decideDeclaration = useStore((s) => s.decideDeclaration)
  const rejectDeclaration = useStore((s) => s.rejectDeclaration)
  // 씬 기준은 씬마다 다르다. 컷이 속한 씬의 기준을 써야 한다 —
  // 승강장 컷에 관제실의 인물 기준을 넣으면 없는 사람을 그리게 된다.
  const sceneStates = useStore((s) => s.sceneStates)
  // rail이 편집하는 것은 지금 보고 있는 씬의 기준이다. activeBeat에서
  // 파생되므로 Beat를 옮기면 기준도 따라온다.
  const activeSceneState = useStore(selectActiveSceneState)
  const seams = useStore((s) => s.seams)
  const setSceneFact = useStore((s) => s.setSceneFact)
  const addFactChange = useStore((s) => s.addFactChange)
  const spatialElements = useStore((s) => s.spatialElements)
  const removeFactChange = useStore((s) => s.removeFactChange)
  const activeSceneId = useStore(selectActiveSceneId)
  const requestSceneStates = useStore((s) => s.requestSceneStates)
  const sceneStatePending = useStore((s) => s.sceneStatePending)
  const sceneStateError = useStore((s) => s.sceneStateError)
  const setShotNote = useStore((s) => s.setShotNote)
  const addShotArrow = useStore((s) => s.addShotArrow)
  const updateShotArrow = useStore((s) => s.updateShotArrow)
  const removeShotArrow = useStore((s) => s.removeShotArrow)
  const panelToolRequest = useStore((s) => s.panelToolRequest)
  const clearPanelToolRequest = useStore((s) => s.clearPanelToolRequest)
  const addBeatAfter = useStore((s) => s.addBeatAfter)
  const loadExampleScreenplay = useStore((s) => s.loadExampleScreenplay)
  const structureDraft = useStore((s) => s.structureDraft)
  const requestStoryStructure = useStore((s) => s.requestStoryStructure)
  const structurePending = useStore((s) => s.structurePending)
  const structureError = useStore((s) => s.structureError)
  const narrativePending = useStore((s) => s.narrativePending)
  const narrativeError = useStore((s) => s.narrativeError)
  const narrativeAnswered = useStore((s) => s.narrativeAnswered)
  const clearNarrativeResult = useStore((s) => s.clearNarrativeResult)
  const clearNarrativeSuggestions = useStore((s) => s.clearNarrativeSuggestions)
  const acceptStructureDraft = useStore((s) => s.acceptStructureDraft)
  const dismissStructureDraft = useStore((s) => s.dismissStructureDraft)
  const updateScreenplayLine = useStore((s) => s.updateScreenplayLine)
  const setScreenplayLineType = useStore((s) => s.setScreenplayLineType)
  const insertScreenplayLine = useStore((s) => s.insertScreenplayLine)
  const removeScreenplayLine = useStore((s) => s.removeScreenplayLine)
  const backToScript = useStore((s) => s.backToScript)
  const clearCutPlanStageOverride = useStore((s) => s.clearCutPlanStageOverride)
  const cutPlanShotSizes = useStore((s) => s.cutPlanShotSizes)
  const requestShotFix = useStore((s) => s.requestShotFix)
  const shotFixPending = useStore((s) => s.shotFixPending)
  const shotFixProposal = useStore((s) => s.shotFixProposal)
  const shotFixError = useStore((s) => s.shotFixError)
  const acceptShotFix = useStore((s) => s.acceptShotFix)
  const rejectShotFix = useStore((s) => s.rejectShotFix)
  const cutPlanAngles = useStore((s) => s.cutPlanAngles)
  const cutPlanMoves = useStore((s) => s.cutPlanMoves)
  const scenePromptNote = useStore((s) => s.scenePromptNote)
  const setScenePromptNote = useStore((s) => s.setScenePromptNote)
  const requestCutPlan = useStore((s) => s.requestCutPlan)
  const cutPlanPending = useStore((s) => s.cutPlanPending)
  const cutPlanRunPending = useStore((s) => s.cutPlanRunPending)
  const cutPlanError = useStore((s) => s.cutPlanError)
  const requestShotDesign = useStore((s) => s.requestShotDesign)
  const shotDesignPending = useStore((s) => s.shotDesignPending)
  const shotDesignError = useStore((s) => s.shotDesignError)
  const sceneCoverages = useStore((s) => s.sceneCoverages)
  const updateCutPlanItem = useStore((s) => s.updateCutPlanItem)
  const addCutPlanItem = useStore((s) => s.addCutPlanItem)
  const removeCutPlanItem = useStore((s) => s.removeCutPlanItem)
  const moveCutPlanItem = useStore((s) => s.moveCutPlanItem)
  const dismissCutPlan = useStore((s) => s.dismissCutPlan)
  const acceptCutPlan = useStore((s) => s.acceptCutPlan)

  const [isEditingRaw, setIsEditingRaw] = useState(false)
  const [rawText, setRawText] = useState('')
  const [rawSceneIntention, setRawSceneIntention] = useState('')
  // 장면 전체 지시는 컷 플랜을 확인한 뒤 적용한다. 입력 중인 문장이
  // 이미 생성된 패널의 기준처럼 보이지 않도록 초안과 적용 값을 분리한다.
  const [scenePromptNoteDraft, setScenePromptNoteDraft] = useState(scenePromptNote)
  const [narrativeRequest, setNarrativeRequest] = useState('')
  // Script에서는 Narrative가 다음 단계를 안내한다. Cut plan에서는 표가 주 작업
  // 공간이므로 Agents rail과 개별 에이전트를 기본으로 접어 둔다. 단계별 상태를
  // 따로 보존해 Script로 돌아왔을 때 사용자가 정한 접힘 상태도 유지한다.
  const [narrativeRailByStage, setNarrativeRailByStage] = useState({
    script: true,
    cutplan: true,
  })
  const narrativeRailOpen = narrativeRailByStage[cutStage] ?? false
  const setNarrativeRailOpen = (nextValue) => setNarrativeRailByStage((current) => {
    const currentValue = current[cutStage] ?? false
    const next = typeof nextValue === 'function' ? nextValue(currentValue) : nextValue
    return { ...current, [cutStage]: next }
  })
  // 한 번에 한 에이전트만 펼친다. 둘 다 펼치면 rail이 길어져 스크롤된다.
  const [openAgentByStage, setOpenAgentByStage] = useState({
    script: 'narrative',
    cutplan: null,
  })
  const openAgent = openAgentByStage[cutStage] ?? null
  const setOpenAgent = (nextAgent) => setOpenAgentByStage((current) => ({
    ...current,
    [cutStage]: nextAgent,
  }))
  // 줄 종류·삭제 버튼은 Beat 단위로 켠다. 평소엔 대본만 보이게 한다.
  const [editingBeat, setEditingBeat] = useState(null)
  // Enter나 화살표로 옮겨갈 줄. { index, caret } 형태.
  const [pendingFocus, setPendingFocus] = useState(null)
  // 접어둔 컷 플랜 Beat 번호.
  const [collapsedCutBeats, setCollapsedCutBeats] = useState([])
  // 씬 접기. Beat와 별개 축이다 — 씬을 접으면 그 안의 Beat가 전부 숨는다.
  const [collapsedScenes, setCollapsedScenes] = useState([])
  // 프롬프트를 펼쳐 본 컷. 한 번에 하나만 연다.
  const [expandedPromptCutId, setExpandedPromptCutId] = useState(null)
  // 표에서 고른 컷. 편집 렌즈가 이 컷을 나누거나 합친다.
  const [selectedCutId, setSelectedCutId] = useState(null)
  // Panels 단계에서 인스펙터에 띄운 패널.
  const [inspectedShotId, setInspectedShotId] = useState(null)
  // 화살표를 그리는 중인 패널. 한 번에 하나만 그린다.
  const [arrowDrawingShotId, setArrowDrawingShotId] = useState(null)
  // 새 화살표는 방향을 그린 뒤 이동 종류를 고를 때까지 확정하지 않는다.
  const [pendingArrow, setPendingArrow] = useState(null)
  const [selectedArrow, setSelectedArrow] = useState(null)
  const [noteEditingShotId, setNoteEditingShotId] = useState(null)
  const [generationScope, setGenerationScope] = useState('all')
  const [panelCandidates, setPanelCandidates] = useState({})
  // 어느 패널이 생성 중인가. 여러 장을 한 번에 만들 수 있어 shotId별로 둔다.
  const [panelGenPending, setPanelGenPending] = useState({})
  const [panelGenError, setPanelGenError] = useState(null)

  // 그림체는 미장센의 환경 항목에 산다. 여기서 고쳐도 같은 값이므로
  // 두 화면이 어긋나지 않는다.
  const sceneStyle = activeSceneState.environment?.facts
    ?.find((fact) => fact.label === '그림체' && !fact.open)?.value || ''
  const [styleDraft, setStyleDraft] = useState(sceneStyle)
  const [syncedStyle, setSyncedStyle] = useState(sceneStyle)
  if (syncedStyle !== sceneStyle) {
    setSyncedStyle(sceneStyle)
    setStyleDraft(sceneStyle)
  }
  const commitStyle = () => {
    const next = styleDraft.trim()
    if (next !== sceneStyle) setSceneFact('environment', '그림체', next)
  }
  const generatingCount = Object.keys(panelGenPending).length
  const isGenerating = generatingCount > 0
  const handledScriptEditorRequestKey = useRef(0)
  const handledPanelToolRequestId = useRef(null)

  const isExpanded = maximizedPanel === 'left'
  // 줄콘티는 대본과 패널 사이의 경유 단계다. 컷을 확정하기 전에는 패널 작업을
  // 열지 않아, 컷 분해가 그림 생성에 묻혀 암묵적으로 처리되는 것을 막는다.
  // 설계 근거: docs/NARRATIVE_LENS_AS_JULCONTI.md
  // Cut plan 단계에서는 대본을 내리고 컷 분해만 남긴다. 대본 아래 덧붙은
  // 섹션이 아니라 거쳐 가는 단계로 읽히게 하기 위한 것이다.
  // 대본이 없으면 첫 화면이 곧 대본 쓰기 화면이다. state로 동기화하지 않고
  // 파생시켜 두 값이 어긋날 수 없게 한다.
  const hasScreenplay = screenplay.length > 0
  const showWriteScene = isEditingRaw || !hasScreenplay
  const isCutPlanStage = cutStage === 'cutplan' && isExpanded && !drawingWorkspaceOpen && !showWriteScene
  // Script 단계에서는 대본을 읽기 전용으로 두지 않고 그 자리에서 고친다.
  const isScriptStage = cutStage === 'script' && isExpanded && !drawingWorkspaceOpen && !showWriteScene
  // 단계별로 보이는 것이 다르다.
  //   script  → 대본만
  //   cutplan → 컷 리스트만
  //   panels  → 대본 + 패널
  // 패널은 확정 여부가 아니라 "지금 어느 단계를 보고 있는가"를 따른다.
  const showStoryboardPanels = isExpanded && storyboardPanelsVisible && cutStage === 'panels'
  // 아직 판정하지 않은 제안과 이미 선언된 것을 나눈다.
  // 판정하지 않은 채 넘어가면 그 요소는 확인되지 않은 AI 가정으로 굳는다.
  const pendingDeclarations = declarations.filter((decl) => decl.status === 'Proposed')
  const acceptedDeclarations = declarations.filter((decl) => decl.status === 'Accepted')
  // 판정은 전부 패널의 인스펙터에서 한다 (DG1 P4).
  // 여러 컷을 함께 읽어야 보이는 문제. 컷 표는 한 행씩만 보여준다.
  // 아직 샷이 정해지지 않은 컷. 촬영이 할 일이 남았는지 보인다.
  const undecidedShots = cutPlan.filter((cut) => !cut.shotSize).length
  // 진단은 발견이고 수정은 표에서 한다. 지목된 컷으로 데려다주기만 한다.
  const goToFinding = (finding) => {
    const target = cutPlan.find((cut) => cut.id === finding.cutIds[0])
    if (target) setActiveBeat(target.beat)
    setExpandedPromptCutId(null)
  }
  // 아직 정하지 않은 씬 기준. 비워둔 것이 보여야 누락과 구분된다.
  const undecidedSceneFacts = activeSceneState.characters
    .reduce((count, character) => count + character.facts.filter((f) => f.open).length, 0)
  const hasActiveSceneState = activeSceneState.characters.length > 0
    || activeSceneState.location.facts.length > 0
    || (activeSceneState.environment?.facts?.length ?? 0) > 0
  const deferredDeclarations = pendingDeclarations
  const activeBranch = scene?.activeBranch ?? 0
  const activeShot = scene?.activeShot ?? 0
  const branch = scene?.branches?.[activeBranch]
  const flowShots = branch?.shots || EMPTY_SHOTS
  // 컷 사이의 문제. 컷 하나만 보면 드러나지 않는다.
  // flowShots가 필요하므로 그 뒤에 둔다 — 이음새는 패널 사이에 붙는다.

  // 이 컷 앞의 이음새. 패널 순서 기준이므로 컷이 아니라 패널에서 찾는다.
  const seamBefore = (cutId) => {
    const index = flowShots.findIndex((shot) => shot.cutPlanItemId === cutId)
    if (index <= 0) return null
    return seams[seamKeyFor(flowShots[index - 1].id)] || null
  }

  useEffect(() => {
    if (scriptEditorRequestKey > handledScriptEditorRequestKey.current) {
      handledScriptEditorRequestKey.current = scriptEditorRequestKey
      const timer = window.setTimeout(() => {
        const currentText = screenplay.map((el) => el.text).join('\n')
        setRawText(currentText)
        setRawSceneIntention(sceneIntention)
        setIsEditingRaw(true)
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [scriptEditorRequestKey, screenplay, sceneIntention])

  useEffect(() => {
    setScenePromptNoteDraft(scenePromptNote)
  }, [scenePromptNote])

  useEffect(() => {
    if (!panelToolRequest || handledPanelToolRequestId.current === panelToolRequest.id) return
    const shotIndex = flowShots.findIndex((shot) => shot.id === panelToolRequest.shotId)
    if (shotIndex < 0) return

    handledPanelToolRequestId.current = panelToolRequest.id
    const shot = flowShots[shotIndex]
    setFlowActiveShot(shotIndex)
    setInspectedShotId(shot.id)
    setCollapsedScenes([])
    setPendingArrow(null)
    setSelectedArrow(null)

    if (panelToolRequest.tool === 'camera-arrow') {
      setNoteEditingShotId(null)
      setArrowDrawingShotId(shot.id)
    } else if (panelToolRequest.tool === 'prompt') {
      // 프롬프트를 고쳐 다시 생성하는 길. 인스펙터에 그 칸이 있다.
      setArrowDrawingShotId(null)
      setNoteEditingShotId(null)
      setInspectedShotId(shot.id)
    } else if (panelToolRequest.tool === 'memo') {
      setArrowDrawingShotId(null)
      const suggested = (panelToolRequest.text || '').trim()
      if (suggested && !shot.note?.includes(suggested)) {
        setShotNote(shot.id, [shot.note, suggested].filter(Boolean).join('\n'))
      }
      setNoteEditingShotId(shot.id)
    }

    window.setTimeout(() => {
      document.querySelector(`[data-shot-id="${shot.id}"]`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 80)
    clearPanelToolRequest()
  }, [
    clearPanelToolRequest,
    flowShots,
    panelToolRequest,
    setFlowActiveShot,
    setShotNote,
  ])

  const beats = []
  let currentBeat = []
  let beatIdx = screenplay[0]?.beat || 0

  screenplay.forEach((el, idx) => {
    if (el.beat !== undefined && el.beat !== beatIdx) {
      if (currentBeat.length > 0) beats.push({ beat: beatIdx, elements: currentBeat })
      beatIdx = el.beat
      currentBeat = [{ ...el, globalIdx: idx }]
    } else {
      currentBeat.push({ ...el, globalIdx: idx })
    }
  })
  if (currentBeat.length > 0) beats.push({ beat: beatIdx, elements: currentBeat })

  // 컷을 Beat별로 묶는다. index는 전체 기준이어야 이동·삭제가 맞는다.
  // 씬 헤딩도 Beat 구분도 없으면 아직 이야기 한 덩어리다.
  const hasSceneHeading = screenplay.some((element) => element.type === 'scene-heading')
  // 씬 헤딩이 나온 순서로 번호를 매긴다. 이 Beat가 몇 번째 씬을 여는가.
  const scriptScenes = selectScenes(screenplay)
  // 여러 컷을 함께 읽어야 보이는 문제. scriptScenes가 필요하므로 그 뒤에 둔다.
  const coverageFindings = diagnoseCoverage(cutPlan)
  // 컷 사이의 문제. scriptScenes가 필요하므로 그 뒤에 둔다.
  const seamFindings = diagnoseSeams(cutPlan, screenplay, {
    seams,
    shots: flowShots,
    // 샷이 이어지는지도 편집이 본다 — 컷 사이의 문제이기 때문이다.
    coverages: sceneCoverages,
    scenes: scriptScenes,
  })
  // 이 컷이 속한 씬의 기준. 없으면 기본값으로 떨어진다.
  // 상태 변화는 컷 id로 기록된다. 값을 읽을 때 순서로 옮길 표.
  const cutOrder = cutOrderOf(cutPlan)

  // 변화가 시작될 수 있는 컷. 변화는 컷 id로 기록되므로 컷이 밀려도
  // 엉뚱한 컷에 걸리지 않는다. 첫 컷은 '처음 값'이 맡으므로 제외한다.
  const sceneCutOptions = cutPlan
    .map((cut, index) => ({ cut, index }))
    .filter(({ cut }) => {
      const scene = sceneOfBeat(scriptScenes, cut.beat)
      return scene?.id === activeSceneId
    })
    .slice(1)
    .map(({ cut }) => ({
      cutId: cut.id,
      label: `컷 ${cut.beat + 1}-${cut.beatOrder}`,
    }))

  // 이 컷에 걸리는 레퍼런스 그림. 화면에 나오는 인물과 그 씬의 공간만
  // 넣는다 — 씬의 모든 인물을 매 컷에 물리면 없는 사람까지 그려진다.
  const referencesForCut = (cut, layoutImage = null) => {
    const scene = sceneStateForCut(cut)
    if (!scene || !cut) return []
    const cast = (cut.characters || '').split(',').map((n) => n.trim()).filter(Boolean)
    const refs = scene.characters
      .filter((character) => character.image
        && cast.some((name) => name.includes(character.name)))
      .map((character) => ({
        name: character.name,
        kind: 'character',
        image: stripDataUrl(character.image),
      }))
      // 레퍼런스로 만든 그림만 물린다. 예제 데이터의 파일 경로는 여기서 빠진다.
      .filter((entry) => entry.image)
    if (stripDataUrl(scene.location?.image || '')) {
      refs.push({
        name: scene.location.name || '공간',
        kind: 'location',
        image: stripDataUrl(scene.location.image),
      })
    }
    // 참조가 많을수록 느리고 서로를 흐린다. 인물 2명 + 공간이면 충분하다.
    const picked = refs.slice(0, 3)
    if (layoutImage) {
      picked.push({
        name: scene.location?.name || '이 공간',
        kind: 'layout',
        image: stripDataUrl(layoutImage),
      })
    }
    return picked
  }

  // 미장센이 정한 그림체. 안 정했으면 빈 문자열이고 서버가 기본을 쓴다.
  const styleOfCut = (cut) => {
    const scene = sceneStateForCut(cut)
    const fact = scene?.environment?.facts?.find((entry) => entry.label === '그림체')
    return fact && !fact.open ? fact.value : ''
  }

  const sceneStateForCut = (cut) => {
    const scene = cut ? sceneOfBeat(scriptScenes, cut.beat) : null
    return sceneStates[scene?.id] || sceneStates['scene-0']
  }
  const sceneOpeningBeats = screenplay
    .filter((element) => element.type === 'scene-heading')
    .map((element) => element.beat ?? 0)
  const sceneNumberOf = (beat) => sceneOpeningBeats.indexOf(beat) + 1
  // 이 Beat가 속한 씬의 여는 Beat. 씬 접기 판정에 쓴다.
  // 스토어의 sceneOfBeat는 씬 객체를 돌려주므로 이름을 나눈다.
  const openingBeatOf = (beat) => (
    [...sceneOpeningBeats].reverse().find((opening) => opening <= beat) ?? null
  )
  // 이 씬에 몇 개의 Beat가 들어 있는가. 접었을 때 보여준다.
  const beatsInScene = (openingBeat) => {
    const next = sceneOpeningBeats.find((opening) => opening > openingBeat)
    return [...new Set(screenplay.map((element) => element.beat ?? 0))]
      .filter((beat) => beat >= openingBeat && (next ? beat < next : true)).length
  }
  // 이 씬에 몇 개의 컷이 있는가. 접었을 때 보여준다.
  const cutsInScene = (openingBeat) => {
    const next = sceneOpeningBeats.find((opening) => opening > openingBeat)
    return cutPlan.filter((item) => (
      item.beat >= openingBeat && (next ? item.beat < next : true)
    )).length
  }
  const isSceneCollapsed = (beat) => {
    const opening = openingBeatOf(beat)
    // 씬을 여는 Beat 자체는 접혀도 헤더가 남아야 다시 펼 수 있다.
    return opening !== null && opening !== beat && collapsedScenes.includes(opening)
  }
  const needsStructure = screenplay.length > 0
    && !hasSceneHeading
    && new Set(screenplay.map((element) => element.beat ?? 0)).size === 1

  const cutPlanBeatGroups = []
  cutPlan.forEach((item, index) => {
    const last = cutPlanBeatGroups[cutPlanBeatGroups.length - 1]
    if (last && last.beat === item.beat) last.items.push({ item, index })
    else cutPlanBeatGroups.push({ beat: item.beat, items: [{ item, index }] })
  })

  // 인스펙터에 띄울 패널과 그 근원 컷.
  const inspectedShot = flowShots.find((shot) => shot.id === inspectedShotId) || null
  const inspectedCut = inspectedShot
    ? cutPlan.find((item) => item.id === inspectedShot.cutPlanItemId) || null
    : null
  const inspectedPrompt = inspectedCut
    ? buildCutPrompt(inspectedCut, {
      sceneIntention,
      sceneNote: scenePromptNote,
      declarations,
      sceneState: sceneStateForCut(inspectedCut),
      seam: seamBefore(inspectedCut.id),
      cutIndex: cutPlan.findIndex((item) => item.id === inspectedCut.id),
      cutOrder,
    })
    : null

  const toggleScene = (openingBeat) => setCollapsedScenes((current) => (
    current.includes(openingBeat)
      ? current.filter((entry) => entry !== openingBeat)
      : [...current, openingBeat]
  ))

  const toggleCutBeat = (beat) => setCollapsedCutBeats((current) => (
    current.includes(beat) ? current.filter((b) => b !== beat) : [...current, beat]
  ))

  const getBeatShots = (beat) => flowShots
    .map((shot, shotIdx) => ({ shot, shotIdx }))
    .filter(({ shot }) => shot.scriptBeat === beat)

  const handleEditShot = (shotIdx, beatNum) => {
    setActiveShot(shotIdx)
    setFlowActiveShot(shotIdx)
    setActiveBeat(beatNum)
    setCenterTab('canvas')
    openDrawingWorkspace()
  }

  const handleDeleteShot = (shotId, shotIdx) => {
    if (flowShots.length <= 1) return
    setSelectedShotIds((current) => current.filter((id) => id !== shotId))
    dismissPanelCandidate(shotId)
    removeShot(activeBranch, shotIdx)
  }

  const getShotVisual = (shot, shotIdx) => {
    const flowSketchKey = `${activeScene}-${activeBranch}-${shotIdx}`
    const legacySketchKey = `0-${shotIdx}`
    return shot.image || shotSketches[flowSketchKey] || shotSketches[legacySketchKey] || null
  }

  const selectedShots = flowShots
    .map((shot, shotIdx) => ({ shot, shotIdx }))
    .filter(({ shot }) => selectedShotIds.includes(shot.id))
  const allBlankShots = flowShots
    .map((shot, shotIdx) => ({ shot, shotIdx }))
    .filter(({ shot, shotIdx }) => !getShotVisual(shot, shotIdx))
  const activeBeatShots = flowShots
    .map((shot, shotIdx) => ({ shot, shotIdx }))
    .filter(({ shot }) => (shot.scriptBeat ?? 0) === activeBeat)
  const scopeShots = generationScope === 'beat'
      ? activeBeatShots
      : generationScope === 'selected'
        ? selectedShots
        : allBlankShots
  const eligibleScopeShots = scopeShots.filter(({ shot, shotIdx }) => !getShotVisual(shot, shotIdx))
  const viewerTestTargets = allBlankShots.slice(0, VIEWER_TEST_PANEL_IMAGES.length)
  const currentShotIds = new Set(flowShots.map((shot) => shot.id))
  const currentPanelCandidates = Object.values(panelCandidates)
    .filter((candidate) => currentShotIds.has(candidate.shotId))
  const candidateCount = currentPanelCandidates.length

  const toggleShotSelection = (shotId) => {
    setSelectedShotIds((current) => (
      current.includes(shotId)
        ? current.filter((id) => id !== shotId)
        : [...current, shotId]
    ))
  }

  // 조립한 프롬프트로 실제 그림을 만든다. 씬 기준·책임 선언·이음새·샷이
  // 전부 이 문장으로 모이므로, 여기서 쓰지 않으면 앞 공정이 무의미해진다.
  const handleGeneratePanels = async (targets, { includeExisting = false } = {}) => {
    const eligibleTargets = includeExisting
      ? targets
      : targets.filter(({ shot, shotIdx }) => !getShotVisual(shot, shotIdx))
    if (eligibleTargets.length === 0) return
    if (!isExpanded) setMaximizedPanel('left')

    setPanelGenError(null)
    setPanelGenPending((current) => {
      const next = { ...current }
      eligibleTargets.forEach(({ shot }) => { next[shot.id] = true })
      return next
    })

    const { generatePanelImage } = await import('../services/api')
    // 구조도는 씬 전체에 걸리므로 한 번만 준비한다. 도면 그림과 문장을
    // 함께 준다 — 그림이 배치를 정확히 전하고, 문장이 그것을 보강한다.
    const layoutLine = describeLayout(spatialElements)
    const layoutImage = await rasterizeLayout(layoutToImage(spatialElements))
    const failures = []

    const promptOf = (cut) => (cut
      ? buildCutPrompt(cut, {
        sceneIntention,
        sceneNote: scenePromptNote,
        declarations,
        sceneState: sceneStateForCut(cut),
        seam: seamBefore(cut.id),
        cutIndex: cutPlan.findIndex((item) => item.id === cut.id),
        cutOrder,
      })
      : null)

    // 컷 순서대로, 한 장씩 만든다. 동시에 만들면 각 패널이 앞 컷을 모른 채
    // 그려져 같은 씬인데 이어지지 않는다. 앞 컷의 문장을 함께 넘긴다.
    const ordered = [...eligibleTargets].sort((a, b) => a.shotIdx - b.shotIdx)

    for (const { shot, shotIdx } of ordered) {
      const cut = cutPlan.find((item) => item.id === shot.cutPlanItemId)
      const prompt = promptOf(cut)
      // 앞 컷은 '이 요청에 포함된 것'이 아니라 컷 플랜상 바로 앞 컷이다 —
      // 한 장만 다시 그릴 때도 앞뒤가 맞아야 한다.
      const cutAt = cut ? cutPlan.findIndex((item) => item.id === cut.id) : -1
      const previous = cutAt > 0 ? promptOf(cutPlan[cutAt - 1]) : null

      try {
        // 프롬프트가 없는 패널은 만들 수 없다. 컷과 이어지지 않은 패널이다.
        if (!prompt?.effective) throw new Error('이 패널에 연결된 컷이 없습니다')
        // shared(씬 기준)를 함께 보낸다. 이것을 빼면 컷마다 인물과 공간이
        // 따로 해석돼, 미장센이 기준을 세운 의미가 없어진다.
        // 이 패널에 이미 그림이 있었으면 다시 그리는 것이다. 반복
        // 재생성 횟수는 이 시스템이 패널 재생성에 얼마나 기대는지를
        // 재는 값이라 생성 전에 남겨야 한다.
        logEvent('panel_generate', {
          target: shot.cutPlanItemId || shot.id,
          repeat: Boolean(shot.image),
        })
        const image = await generatePanelImage(prompt.effective, {
          shared: prompt.shared || '',
          previous: previous?.effective || '',
          // 레퍼런스 그림이 있으면 물린다. 글만으로는 컷마다 같은 얼굴이
          // 나오지 않는다.
          references: referencesForCut(cut, layoutImage),
          // 그림체는 미장센의 '그림체' 항목에서 온다. 화면에 칸이 있는데
          // 반영되지 않으면 정한 것이 무시되는 셈이다.
          style: styleOfCut(cut),
          // 2D 구조도의 배치. 컷마다 콘솔이 좌우로 옮겨 다니는 것을
          // 글로만 막기는 어렵다.
          layout: layoutLine,
        })

        setPanelCandidates((current) => ({
          ...current,
          [shot.id]: {
            shotId: shot.id,
            shotIdx,
            version: (current[shot.id]?.version || 0) + 1,
            image,
            // 무엇으로 그렸는지 남긴다. 결과가 어긋나면 프롬프트를 봐야 한다.
            prompt: prompt.effective,
          },
        }))
      } catch (error) {
        failures.push(error.message)
      } finally {
        setPanelGenPending((current) => {
          const next = { ...current }
          delete next[shot.id]
          return next
        })
      }
    }

    // 실패를 조용히 넘기면 왜 그림이 안 나왔는지 알 수 없다.
    if (failures.length > 0) setPanelGenError(failures[0])
  }

  const connectViewerTestPanels = () => {
    viewerTestTargets.forEach(({ shot }, index) => {
      updateFlowShotById(shot.id, {
        image: VIEWER_TEST_PANEL_IMAGES[index],
        source: 'viewer-test',
        isAIGenerated: false,
      })
    })
  }

  const dismissPanelCandidate = (shotId) => {
    setPanelCandidates((current) => {
      const next = { ...current }
      delete next[shotId]
      return next
    })
  }

  const acceptPanelCandidate = (shotId) => {
    const candidate = panelCandidates[shotId]
    if (!candidate) return
    updateFlowShotById(shotId, {
      image: candidate.image,
      source: 'ai',
      isAIGenerated: true,
    })
    dismissPanelCandidate(shotId)
  }

  const acceptAllPanelCandidates = () => {
    currentPanelCandidates.forEach((candidate) => {
      updateFlowShotById(candidate.shotId, {
        image: candidate.image,
        source: 'ai',
        isAIGenerated: true,
      })
    })
    setPanelCandidates((current) => Object.fromEntries(
      Object.entries(current).filter(([shotId]) => !currentShotIds.has(shotId)),
    ))
  }

  const handleDrawOverCandidate = (shot, shotIdx) => {
    const candidate = panelCandidates[shot.id]
    if (!candidate) return
    updateFlowShotById(shot.id, {
      image: candidate.image,
      source: 'ai-assisted-draw',
      isAIGenerated: true,
    })
    dismissPanelCandidate(shot.id)
    handleEditShot(shotIdx, shot.scriptBeat ?? 0)
    setPendingCanvasImage(candidate.image)
  }

  // 포커스를 옮기고 나면 즉시 비운다. 남겨두면 다른 줄을 클릭해도 계속
  // 이 줄로 커서가 되돌아온다.
  const clearPendingFocus = useCallback(() => setPendingFocus(null), [])

  const handleMoveFocus = useCallback((index, caret) => {
    if (index < 0 || index >= screenplay.length) return
    setPendingFocus({ index, caret })
  }, [screenplay.length])

  // 새 Beat의 첫 줄은 비어 있으므로 커서를 거기로 보낸다.
  const handleAddBeatAfter = (beatGroup) => {
    const lastIdx = beatGroup.elements[beatGroup.elements.length - 1].globalIdx
    addBeatAfter(beatGroup.beat)
    setPendingFocus({ index: lastIdx + 1, caret: 0 })
  }

  // 줄을 새로 만들거나 합친 뒤 커서가 따라가게 한다.
  const handleInsertLine = (afterIndex, type, split) => {
    insertScreenplayLine(afterIndex, type, split)
    setPendingFocus({ index: afterIndex + 1, caret: 0 })
  }

  const handleRemoveLine = (index, options = {}) => {
    if (options.mergeIntoPrevious && index > 0) {
      // 합쳐진 지점(앞 줄의 원래 끝)에 커서를 둔다.
      const caret = screenplay[index - 1].text.length
      removeScreenplayLine(index, options)
      setPendingFocus({ index: index - 1, caret })
      return
    }
    removeScreenplayLine(index, options)
    setPendingFocus({ index: Math.max(0, index - 1), caret: 'end' })
  }

  // 하나를 수락하면 나머지는 버린다. 제안은 수락 시점의 대본을 가리키는
  // 인덱스를 들고 있어서, 대본이 바뀌면 그 인덱스가 다른 줄을 가리킨다 —
  // 남겨 두면 두 번째 수락이 엉뚱한 자리에 적용된다.
  const handleAcceptNarrativeSuggestion = (suggestion) => {
    if (suggestion.type === 'split-beat') {
      splitBeat(suggestion.elementIndex)
    } else if (suggestion.type === 'insert-script-line') {
      const nextScreenplay = [...screenplay]
      nextScreenplay.splice(suggestion.insertAfterIndex + 1, 0, suggestion.newElement)
      setScreenplay(nextScreenplay)
    } else if (suggestion.type === 'replace-script-line') {
      setScreenplay(screenplay.map((element, index) => (
        index === suggestion.elementIndex
          ? { ...element, text: suggestion.proposedText }
          : element
      )))
    }
    clearNarrativeSuggestions()
  }

  const handleUploadScript = () => {
    // 형식 규칙은 둘뿐이다. 씬 헤딩이 씬을 나누고, 빈 줄이 Beat를 나눈다.
    // 참가자가 별도 형식을 배울 필요가 없어야 한다 — 대사도 지문 구분도
    // 없이 일어나는 일을 그대로 적으면 된다.
    //
    // 씬 헤딩: 첫 줄이거나 빈 줄 뒤에 오는 짧은 줄로, 문장부호가 없고
    // 장소·시간처럼 읽히는 것. `관제실, 밤`
    const looksLikeHeading = (text) => (
      text.length <= 30
      && !/[.!?…]/.test(text)
      && text.split(/\s+/).length <= 5
    )

    const rawLines = rawText.split('\n')
    const newScreenplay = []
    let beat = 0
    let sawContentInBeat = false
    let atBlockStart = true

    rawLines.forEach((line) => {
      const trimmed = line.trim()

      // 빈 줄 = Beat 경계. 연속된 빈 줄은 하나로 본다.
      if (trimmed === '') {
        if (sawContentInBeat) {
          beat += 1
          sawContentInBeat = false
        }
        atBlockStart = true
        return
      }

      // 문단 첫 줄이면서 헤딩처럼 보이면 씬 헤딩이다.
      const type = atBlockStart && looksLikeHeading(trimmed) ? 'scene-heading' : 'action'
      newScreenplay.push({ type, text: trimmed, beat })
      sawContentInBeat = true
      atBlockStart = false
    })

    setSceneIntention(rawSceneIntention.trim())
    setScreenplay(newScreenplay)

    // 나눈 결과가 나온 뒤에 넘어간다. 여기서 바로 화면을 넘기면 아직
    // 나누기 전의 대본이 한 번 떴다가 바뀐다 — 감독은 그것을 결과로
    // 읽는다.
    //
    // AI가 채운 줄은 filled로 표시되어 대본에서 구분되므로, 확인 단계
    // 없이 적용해도 자기가 쓰지 않은 것을 알 수 있다.
    requestStoryStructure(true).finally(() => setIsEditingRaw(false))
  }

  // 점검에서 나온 지적을 그대로 제안 요청으로 넘긴다. 점검은 무엇이
  // 문제인지만 말하고, 무엇으로 고칠지는 제안이 낸다.
  // 대본 점검과 컷 구성 점검은 같은 규칙을 쓰고 같은 모양으로 보인다.
  // 다른 것은 무엇을 보느냐뿐이다 — 대본의 줄이냐, 컷 플랜의 컷이냐.
  const renderNarrativeCheck = (stage) => {
    const isScript = stage === 'script'
    // 다른 단계에서 받은 결과가 남아 있으면 지금 화면의 것이 아니다.
    const result = narrativeCheck?.stage === stage ? narrativeCheck : null
    return (
      <div className="narrative-rail-check">
        <button
          type="button"
          onClick={() => requestNarrativeCheck(stage)}
          disabled={narrativeCheckPending}
        >
          {narrativeCheckPending
            ? (isScript ? '대본 보는 중…' : '컷 구성 보는 중…')
            : (isScript ? '대본 구성 점검' : '컷 구성 점검')}
        </button>
        {narrativeCheckError && (
          <p className="narrative-rail-check-error">{narrativeCheckError}</p>
        )}
        {result && result.findings.length === 0 && (
          <p className="narrative-rail-check-empty">걸리는 것이 없습니다.</p>
        )}
        {result && result.findings.length > 0 && (
          <>
            <p className="narrative-rail-check-summary">{result.summary}</p>
            <ul className="narrative-rail-check-list">
              {result.findings.map((finding) => (
                <li key={finding.ruleId}>
                  <span>{NARRATIVE_RULE_LABELS[finding.ruleId] || '서사'}</span>
                  <em>
                    {isScript
                      ? lineLabelsOf(finding.lineIndexes)
                      : cutLabelsOf(finding.cutIds)}
                  </em>
                  <strong>{finding.finding}</strong>
                  <p>{finding.suggestedAction}</p>
                  {/* 대본 지적은 대본에서, 컷 지적은 컷에서 고친다.
                      컷 문제를 대본 제안으로 보내면 자리가 어긋난다. */}
                  <button
                    type="button"
                    onClick={() => (isScript
                      ? requestSuggestionForFinding(finding, stage)
                      : goToFindingCut(finding))}
                    disabled={isScript && narrativePending}
                  >
                    {isScript
                      ? (narrativePending ? '제안 받는 중…' : '제안 받기')
                      : '이 컷 보기'}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    )
  }

  // 컷 id는 내부 식별자다. 화면에 그대로 내보내면 읽을 것이 아니고,
  // 감독이 어느 컷인지 찾을 수도 없다.
  const cutLabelsOf = (cutIds) => {
    const numbers = cutIds
      .map((cutId) => cutPlan.findIndex((cut) => cut.id === cutId))
      .filter((index) => index >= 0)
      .map((index) => index + 1)
    if (numbers.length === 0) return ''
    return numbers.length > 2
      ? `${numbers[0]}–${numbers[numbers.length - 1]}번 컷`
      : `${numbers.join(', ')}번 컷`
  }

  // 대본 점검은 줄 번호를 가리킨다. 헤딩을 뺀 순서이므로 화면의
  // 줄 번호와 맞추려면 같은 필터를 거쳐야 한다.
  const scriptLines = screenplay.filter((element) => element.type !== 'scene-heading')

  const lineLabelsOf = (indexes = []) => {
    const numbers = indexes.filter((index) => index >= 0).map((index) => index + 1)
    if (numbers.length === 0) return ''
    return numbers.length > 2
      ? `${numbers[0]}–${numbers[numbers.length - 1]}번째 줄`
      : `${numbers.join(', ')}번째 줄`
  }

  // 컷 지적은 그 컷 자리로 보낸다. 어느 컷인지 모르면 고칠 수 없다.
  const goToFindingCut = (finding) => {
    const cutId = finding.cutIds?.[0]
    if (!cutId) return
    const cut = cutPlan.find((item) => item.id === cutId)
    if (cut) selectBeat(cut.beat)
    // 옮기기만 하면 어느 줄인지 모른다. 그 컷을 골라 둔다.
    setSelectedCutId(cutId)
    logScaffold({ feature: 'diagnosis', action: 'accept', target: cutId, lens: 'editing' })
    window.setTimeout(() => {
      document.querySelector(`[data-cut-id="${cutId}"]`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 80)
  }

  const requestSuggestionForFinding = (finding, stage = 'cutplan') => {
    // 문제가 있는 Beat여야 제안이 엉뚱한 줄에 붙지 않는다. 지금 보고
    // 있는 Beat가 아니다.
    const beat = stage === 'script'
      ? scriptLines[finding.lineIndexes?.[0] ?? 0]?.beat ?? activeBeat ?? 0
      : cutPlan.find((cut) => cut.id === finding.cutIds[0])?.beat ?? activeBeat ?? 0
    // 점검에서 제안으로 넘어간 것. 지적을 받아들였다는 뜻이다.
    logScaffold({
      feature: 'diagnosis',
      action: 'accept',
      target: finding.cutIds.join(','),
      lens: 'narrative',
    })
    requestNarrativeSuggestions({
      beat,
      narrativeRequest: (
        `${stage === 'script' ? '대본' : '컷'} 구성 점검에서 이런 지적이 나왔습니다: ${finding.finding}\n`
        + `${finding.suggestedAction}\n`
        + '이 Beat의 대본에서 무엇을 더하거나 고치면 되는지 제안해 주세요.'
      ),
    })
    // 제안은 대본 줄 옆에 뜬다. 그 Beat가 보여야 판정할 수 있다.
    selectBeat(beat)
    // 고를 Beat가 화면 밖이면 어디에 제안이 붙었는지 알 수 없다.
    // 선택 후 다시 그려질 시간을 준 뒤 그 자리로 옮긴다.
    window.setTimeout(() => {
      document.querySelector(`[data-beat="${beat}"]`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 80)
  }

  const handleNarrativeRequest = () => {
    if (!narrativeRequest.trim()) return
    requestNarrativeSuggestions({ narrativeRequest })
    // 요청을 넘겼으면 칸을 비운다. 남아 있으면 다음 요청을 쓸 때 지우는
    // 일부터 해야 하고, 이미 처리된 요청이 아직 대기 중인 것처럼 보인다.
    setNarrativeRequest('')
  }

  const addViewerFindingToNarrativeRequest = () => {
    if (!viewerFindingHandoff) return
    const interpretation = viewerFindingHandoff.interpretations?.join(' / ') || '관객 해석을 확인하기 어렵습니다.'
    const cues = viewerFindingHandoff.visibleCues?.join(', ') || '화면 근거 없음'
    const panelLabel = (viewerFindingHandoff.panelOrders || [viewerFindingHandoff.panelOrder])
      .map((panelOrder) => `S${panelOrder}`)
      .join(' · ')
    setNarrativeRequest(
      `의도 비공개 순차 읽기 ${panelLabel}: ${interpretation}\n화면 근거: ${cues}\n이 읽힘이 생기는 서사 흐름을 검토해줘.`,
    )
    if (narrativeAnswered) clearNarrativeResult()
  }

  return (
    <div className={`storyboard-view ${isExpanded && !drawingWorkspaceOpen ? 'with-narrative-rail' : ''}`}>
      <div className="storyboard-main">
        {isExpanded && !drawingWorkspaceOpen && (
          <nav className="cut-plan-stages" aria-label="Storyboard stages">
            <ol>
              <li className={`stage-done${cutStage === 'script' ? ' stage-current' : ''}`}>
                <button
                  type="button"
                  onClick={backToScript}
                  disabled={cutStage === 'script'}
                  aria-current={cutStage === 'script' ? 'step' : undefined}
                >
                  <span className="stage-index">1</span>
                  <div>
                    <strong>Script</strong>
                    <em>{screenplay.length} lines · {beats.length} beats</em>
                  </div>
                </button>
              </li>
              <li className={`${cutPlanAccepted ? 'stage-done' : cutPlan.length > 0 ? 'stage-active' : ''}${cutStage === 'cutplan' ? ' stage-current' : ''}`}>
                <button
                  type="button"
                  onClick={cutPlan.length === 0 ? requestCutPlan : reopenCutPlan}
                  disabled={cutStage === 'cutplan'}
                  aria-current={cutStage === 'cutplan' ? 'step' : undefined}
                >
                <span className="stage-index">2</span>
                <div>
                  <strong>Cut plan</strong>
                  <em>
                    {cutPlanSkipped
                      ? '건너뜀 · 전부 Tentative'
                      : cutPlanAccepted
                        ? `${cutPlan.length} cuts 확정`
                        : cutPlan.length > 0
                          ? `${cutPlan.length} cuts 검토 중`
                          : '컷 분해 필요'}
                  </em>
                </div>
                </button>
              </li>
              <li className={`${cutPlanAccepted ? 'stage-active' : 'stage-locked'}${cutStage === 'panels' ? ' stage-current' : ''}`}>
                <button
                  type="button"
                  onClick={acceptCutPlan}
                  disabled={!cutPlanAccepted}
                  aria-current={cutStage === 'panels' ? 'step' : undefined}
                >
                  <span className="stage-index">3</span>
                  <div>
                    <strong>Panels</strong>
                    <em>{cutPlanAccepted ? `${flowShots.length} panels` : '컷 확정 후 열림'}</em>
                  </div>
                </button>
              </li>
            </ol>
          </nav>
        )}
      <div className="storyboard-scroll-container">
        <div className="storyboard-list-inner">
          {showWriteScene && (
            <div className="inline-script-editor">
              <div className="editor-header">
                <h3>Write scene</h3>
                <p>
                  장면을 적거나 붙여넣으세요. 완성된 대본이 아니어도 됩니다 —
                  거친 메모나 간단한 대사도 괜찮습니다.
                </p>
              </div>
              <label className="scene-intention-field">
                <span>Scene intention <em>optional</em></span>
                <textarea
                  className="scene-intention-input"
                  placeholder="예: 위험은 느껴지지만 원인은 마지막까지 숨긴다."
                  value={rawSceneIntention}
                  onChange={(event) => setRawSceneIntention(event.target.value)}
                  rows={3}
                />
              </label>
              <textarea
                className="screenplay-input"
                placeholder={'관제실, 밤\n\n재인이 젖은 채로 들어와 철문을 닫는다.\n민호는 뒤돌아보지 않는다.\n\n민호가 천천히 의자를 돌린다.'}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />
              <div className="editor-actions">
                {!hasScreenplay && (
                  <button
                    type="button"
                    className="example-btn"
                    onClick={() => {
                      loadExampleScreenplay()
                      setIsEditingRaw(false)
                    }}
                  >
                    예시 대본 불러오기
                  </button>
                )}
                {hasScreenplay && (
                  <button className="cancel-btn" onClick={() => setIsEditingRaw(false)}>Cancel</button>
                )}
                <button
                  className="apply-btn"
                  onClick={handleUploadScript}
                  disabled={!rawText.trim() || structurePending}
                >
                  {structurePending ? '나누는 중…' : '씬·Beat로 나누기'}
                </button>
              </div>
            </div>
          )}

          {/* AI가 세운 씬·비트 구조. 확인해야 적용된다 (DG1 P2:
              생성된 제안은 판정 대상으로 둔다). */}
          {structureDraft && cutStage === 'script' && isExpanded && !drawingWorkspaceOpen && !showWriteScene && (
            <section className="structure-draft-review" aria-label="Scene structure draft">
              <header>
                <span className="script-draft-mark" aria-hidden="true">N</span>
                <div>
                  {/* 'Mock'을 늘 붙여 두면 모델이 답했을 때도 규칙 기반인
                      것처럼 읽힌다. 실제로 떨어졌을 때만 밝힌다. */}
                  <span>씬·Beat 구조{structureError ? ' · 규칙 기반' : ''}</span>
                  <strong>
                    씬 {structureDraft.sceneCount}개 · Beat {structureDraft.beatCount}개로 나눴습니다
                  </strong>
                  <p>
                    {structureDraft.filledCount > 0
                      ? `표시된 ${structureDraft.filledCount}줄은 AI가 채운 것입니다. 확인하기 전까지 원문은 바뀌지 않습니다.`
                      : '확인하기 전까지 원문은 바뀌지 않습니다.'}
                  </p>
                  {/* 모델을 못 불렀으면 그 사실을 밝힌다. 규칙 기반 결과를
                      모델이 만든 것처럼 보이게 두면 안 된다. */}
                  {structureError && (
                    <p className="structure-draft-fallback">
                      AI 호출에 실패해 규칙 기반으로 나눴습니다 · {structureError}
                    </p>
                  )}
                </div>
                <div className="script-draft-actions">
                  <button type="button" onClick={dismissStructureDraft}>Dismiss</button>
                  <button type="button" onClick={requestStoryStructure}>Again</button>
                  <button type="button" className="use-draft" onClick={acceptStructureDraft}>
                    이 구조로 진행
                  </button>
                </div>
              </header>

              <div className="structure-draft-body">
                {structureDraft.screenplay.map((element, index) => {
                  const previous = structureDraft.screenplay[index - 1]
                  const startsBeat = !previous || previous.beat !== element.beat
                  return (
                    <div key={`${element.type}-${index}`}>
                      {element.type === 'scene-heading' ? (
                        <div className="structure-draft-scene">{element.text}</div>
                      ) : (
                        <>
                          {startsBeat && (
                            <div className="structure-draft-beat">
                              Beat {String(element.beat + 1).padStart(2, '0')}
                            </div>
                          )}
                          {/* AI가 채운 줄은 구분해 보인다. 사용자가 자기가
                              쓰지 않은 것을 알아볼 수 있어야 한다. */}
                          <p className={element.filled ? 'is-filled' : ''}>
                            {element.text}
                          </p>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {cutPlan.length > 0 && cutStage === 'cutplan' && isExpanded && !drawingWorkspaceOpen && (
            <section className="cut-plan-review" aria-label="Cut plan">
              <header>
                <span className="script-draft-mark" aria-hidden="true">N</span>
                <div>
                  <span>줄콘티 · Cut plan{cutPlanError ? ' · 규칙 기반' : ''}</span>
                  <strong>
                    {cutPlanSkipped ? '검토하지 않고 넘어간 컷 구성' : '컷 분해 제안'}
                  </strong>
                  <p>
                    {cutPlanSkipped
                      ? '컷 분해를 건너뛰어 자동 생성했습니다. 검토되지 않은 채 넘어갔습니다.'
                      : '그림으로 가기 전에 컷 수와 순서를 먼저 정합니다. 대본은 바뀌지 않습니다.'}
                  </p>
                  {/* 모델을 못 불렀으면 밝힌다. 규칙 기반 결과를 모델이
                      만든 것처럼 보이게 두지 않는다. */}
                  {cutPlanError && (
                    <p className="structure-draft-fallback">
                      AI 호출에 실패해 규칙 기반으로 나눴습니다 · {cutPlanError}
                    </p>
                  )}
                </div>
                <div className="script-draft-actions">
                  <button type="button" onClick={backToScript}>Back to script</button>
                  <button type="button" onClick={requestCutPlan}>Again</button>
                  {/* 컷 삭제는 컷 플랜 화면 안에서만. rail의 보조 버튼과
                      역할이 섞이지 않게 한다. */}
                  <button type="button" onClick={dismissCutPlan}>Discard</button>
                  <button type="button" className="use-draft" onClick={acceptCutPlan}>
                    Accept cut plan
                  </button>
                </div>
              </header>

              {/* 컷을 확인한 뒤 추가하는 공통 연출 기준이다. 대본 단계의
                  sceneIntention과 달리, 컷 분해 자체는 다시 바꾸지 않는다. */}
              <div className="cut-plan-scene-note">
                <div className="cut-plan-scene-note-heading">
                  <label htmlFor="scene-prompt-note">장면 전체 지시</label>
                  <p>적용 후 다음 샷 설계와 패널 생성에 공통으로 반영됩니다.</p>
                </div>
                <textarea
                  id="scene-prompt-note"
                  value={scenePromptNoteDraft}
                  onChange={(event) => setScenePromptNoteDraft(event.target.value)}
                  placeholder="예: 초반에는 인물 사이 거리를 유지하고, 위협이 드러난 뒤에는 프레임 안에서 압박한다."
                />
                <div className="cut-plan-scene-note-actions">
                  <span>
                    {scenePromptNoteDraft.trim() === scenePromptNote.trim()
                      ? (scenePromptNote.trim() ? '적용됨' : '아직 장면 전체 지시가 없습니다')
                      : '변경 사항이 아직 적용되지 않았습니다'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setScenePromptNote(scenePromptNoteDraft.trim())}
                    disabled={scenePromptNoteDraft.trim() === scenePromptNote.trim()}
                  >
                    지시 적용
                  </button>
                </div>
              </div>

              <div className="cut-plan-table-wrap">
                <table className="cut-plan-table">
                  <thead>
                    <tr>
                      <th className="col-cut">컷</th>
                      <th className="col-time">시간</th>
                      <th className="col-place">장소</th>
                      <th className="col-content">내용</th>
                      <th className="col-purpose">중요한 것</th>
                      <th className="col-cast">인물</th>
                      <th className="col-shot">샷</th>
                      <th className="col-tools" aria-label="Actions" />
                    </tr>
                  </thead>
                  {cutPlanBeatGroups.map((group) => {
                    const collapsed = collapsedCutBeats.includes(group.beat)
                    const sceneNo = sceneNumberOf(group.beat)
                    // 접힌 씬의 Beat는 그리지 않는다.
                    if (isSceneCollapsed(group.beat)) return null
                    const sceneCollapsed = collapsedScenes.includes(group.beat)
                    return (
                      <tbody key={group.beat} className="cut-plan-beat-group">
                        {/* 씬이 바뀌는 Beat에 씬 경계를 그린다. 컷 표에서도
                            어느 씬의 컷인지 보여야 한다. */}
                        {sceneNo > 0 && (
                          <tr className="cut-plan-scene-row">
                            <th colSpan={8}>
                              <button
                                type="button"
                                onClick={() => toggleScene(group.beat)}
                                aria-expanded={!sceneCollapsed}
                              >
                                <span className="cut-plan-scene-caret">
                                  {sceneCollapsed ? '▸' : '▾'}
                                </span>
                                <span>Scene {sceneNo}</span>
                                {screenplay.find((element) => (
                                  element.type === 'scene-heading' && element.beat === group.beat
                                ))?.text}
                                {sceneCollapsed && (
                                  <em>{cutsInScene(group.beat)} cuts</em>
                                )}
                              </button>
                            </th>
                          </tr>
                        )}
                        {!sceneCollapsed && (
                        <>
                        <tr className="cut-plan-beat-row">
                          <th colSpan={8}>
                            <button
                              type="button"
                              onClick={() => toggleCutBeat(group.beat)}
                              aria-expanded={!collapsed}
                            >
                              <span className="cut-plan-beat-caret">{collapsed ? '▸' : '▾'}</span>
                              Beat {String(group.beat + 1).padStart(2, '0')}
                              <em>{group.items.length} cuts</em>
                            </button>
                          </th>
                        </tr>
                        {!collapsed && group.items.map(({ item, index }) => (
                        <Fragment key={item.id}>
                        <tr
                          data-cut-id={item.id}
                          className={`provenance-row-${item.provenance.toLowerCase()}${selectedCutId === item.id ? ' selected' : ''}`}
                          onClick={() => setSelectedCutId(
                            selectedCutId === item.id ? null : item.id,
                          )}
                        >
                          <td className="col-cut">
                            <span className="cut-plan-number">
                              {item.beat + 1}-{item.beatOrder}
                            </span>
                            <span className={`cut-plan-provenance provenance-${item.provenance.toLowerCase()}`}>
                              {item.provenance}
                            </span>
                          </td>
                          <td className="col-time">
                            <input
                              type="text"
                              value={item.time}
                              onChange={(event) => updateCutPlanItem(item.id, { time: event.target.value })}
                              aria-label={`Cut ${item.order} time`}
                            />
                          </td>
                          <td className="col-place">
                            <input
                              type="text"
                              value={item.place}
                              onChange={(event) => updateCutPlanItem(item.id, { place: event.target.value })}
                              aria-label={`Cut ${item.order} place`}
                            />
                          </td>
                          <td className="col-content">
                            <input
                              type="text"
                              value={item.content}
                              onChange={(event) => updateCutPlanItem(item.id, { content: event.target.value })}
                              placeholder="이 컷에서 무엇이 일어나는가"
                              aria-label={`Cut ${item.order} content`}
                            />
                          </td>
                          <td className="col-purpose">
                            <input
                              type="text"
                              value={item.purpose}
                              onChange={(event) => updateCutPlanItem(item.id, { purpose: event.target.value })}
                              placeholder="이 컷이 존재하는 이유"
                              aria-label={`Cut ${item.order} purpose`}
                            />
                          </td>
                          <td className="col-cast">
                            <input
                              type="text"
                              value={item.characters}
                              onChange={(event) => updateCutPlanItem(item.id, { characters: event.target.value })}
                              aria-label={`Cut ${item.order} characters`}
                            />
                          </td>
                          <td className="col-shot">
                            <select
                              value={item.shotSize}
                              onChange={(event) => updateCutPlanItem(item.id, { shotSize: event.target.value })}
                              aria-label={`Cut ${item.order} shot size`}
                            >
                              {/* 샷은 촬영이 정한다. 빈 값이면 첫 항목이
                                  선택돼 보여 정해진 것처럼 읽힌다. */}
                              <option value="">미정</option>
                              {cutPlanShotSizes.map((size) => (
                                <option key={size} value={size}>{size}</option>
                              ))}
                            </select>
                          </td>
                          <td className="col-tools">
                            <div className="cut-plan-row-tools">
                              <button
                                type="button"
                                className={expandedPromptCutId === item.id ? 'active' : ''}
                                onClick={() => setExpandedPromptCutId(
                                  expandedPromptCutId === item.id ? null : item.id,
                                )}
                                aria-label="Show prompt"
                                aria-expanded={expandedPromptCutId === item.id}
                                title="프롬프트 보기"
                              >
                                P
                              </button>
                              <button
                                type="button"
                                onClick={() => moveCutPlanItem(item.id, -1)}
                                disabled={index === 0}
                                aria-label="Move cut up"
                                title="위로"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() => moveCutPlanItem(item.id, 1)}
                                disabled={index === cutPlan.length - 1}
                                aria-label="Move cut down"
                                title="아래로"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() => addCutPlanItem(item.id, item.beat)}
                                aria-label="Add cut after"
                                title="아래에 컷 추가"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => removeCutPlanItem(item.id)}
                                disabled={cutPlan.length === 1}
                                aria-label="Remove cut"
                                title="삭제"
                              >
                                ×
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedPromptCutId === item.id && (() => {
                          const prompt = buildCutPrompt(item, {
                            sceneIntention,
                            sceneNote: scenePromptNote,
                            declarations,
                            sceneState: sceneStateForCut(item),
                            seam: seamBefore(item.id),
                            cutIndex: index,
                            cutOrder,
                          })
                          return (
                            <tr className="cut-plan-prompt-row">
                              <td colSpan={8}>
                                <div className="cut-plan-prompt">
                                  <div className="cut-plan-prompt-auto">
                                    <span>
                                      {prompt.isEdited ? '프롬프트 · User' : '컷에서 조립됨 · AI'}
                                      {prompt.isEdited && (
                                        <button
                                          type="button"
                                          className="cut-plan-prompt-revert"
                                          onClick={() => updateCutPlanItem(item.id, {
                                            promptOverride: '',
                                          })}
                                          title="컷에서 다시 조립"
                                        >
                                          되돌리기
                                        </button>
                                      )}
                                    </span>
                                    {/* 바로 고칠 수 있게 둔다. 고치면 이 컷의
                                        프롬프트 출처가 User로 바뀐다. */}
                                    <textarea
                                      className="cut-plan-prompt-input"
                                      value={prompt.effective}
                                      rows={3}
                                      onChange={(event) => updateCutPlanItem(item.id, {
                                        promptOverride: event.target.value,
                                      })}
                                      onBlur={(event) => {
                                        // 편집을 마쳤을 때 한 번만 남긴다.
                                        if (!event.target.value.trim()) return
                                        logEdit({ level: 'element', target: item.id, action: 'prompt' })
                                      }}
                                      placeholder="컷 내용이 비어 있습니다."
                                      aria-label={`Cut ${item.order} prompt`}
                                    />
                                    {prompt.isEdited && (
                                      <p className="cut-plan-prompt-original">
                                        컷 기준: {prompt.auto}
                                      </p>
                                    )}
                                  </div>
                                  {prompt.shared && (
                                    <div className="cut-plan-prompt-shared">
                                      <span>장면 공통</span>
                                      <p>{prompt.shared}</p>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })()}
                        </Fragment>
                        ))}
                        </>
                        )}
                      </tbody>
                    )
                  })}
                </table>
              </div>

              <footer className="cut-plan-footer">
                <button type="button" onClick={() => addCutPlanItem(null, activeBeat)}>
                  + Add cut
                </button>
                {/* 아직 확인하지 않은 컷이 몇 개인지. 전부 확인했으면 굳이
                    말하지 않는다. */}
                <span>
                  {cutPlan.length} cuts
                  {cutPlan.some((item) => item.provenance === 'AI') && (
                    <> · 미확인 {cutPlan.filter((item) => item.provenance === 'AI').length}</>
                  )}
                </span>
              </footer>
            </section>
          )}

          {cutPlanOrphanedShots.length > 0 && isExpanded && !drawingWorkspaceOpen && (
            <div className="cut-plan-orphan-warning" role="status">
              <div>
                <strong>
                  그림이 있는 패널 {cutPlanOrphanedShots.length}개가 컷과 연결되지 않았습니다
                </strong>
                <p>
                  컷을 지우거나 순서를 크게 바꾸면 기존 그림이 갈 곳을 잃습니다.
                  컷을 다시 열어 자리를 만들거나, 이대로 진행할 수 있습니다.
                </p>
              </div>
              <div className="cut-plan-orphan-actions">
                <button type="button" onClick={clearCutPlanOrphanWarning}>
                  이대로 진행
                </button>
                <button
                  type="button"
                  className="reopen"
                  onClick={() => {
                    clearCutPlanOrphanWarning()
                    reopenCutPlan()
                  }}
                >
                  컷 다시 열기
                </button>
              </div>
            </div>
          )}

          {showStoryboardPanels && !drawingWorkspaceOpen && (
            <section
              className={`storyboard-generation-bar ${isExpanded ? 'expanded' : 'compact'}`}
              aria-label="AI storyboard draft generation"
              onClick={(event) => event.stopPropagation()}
            >
            <div className="generation-bar-copy">
              {/* 패널은 실제 모델이 그린다. 'Mock' 표시가 남아 있으면
                  진짜 그림을 가짜로 읽게 된다. */}
              <span>AI storyboard draft</span>
              <strong>
                {eligibleScopeShots.length} blank panel{eligibleScopeShots.length === 1 ? '' : 's'} in scope
              </strong>
              <p>Existing drawings and imported images stay untouched.</p>
            </div>
            {/* 그림체는 모든 패널에 똑같이 걸린다. 인물·소품 목록에 섞여
                있으면 성격이 달라 보이지 않고, 정작 그림을 그리는 이 화면에서
                손댈 수가 없다. 값은 미장센의 '그림체'와 같은 자리를 쓴다. */}
            <label className="generation-style">
              <span>그림체</span>
              <input
                type="text"
                value={styleDraft}
                placeholder="기본 · 흑백 러프 연필 스케치"
                onChange={(event) => setStyleDraft(event.target.value)}
                onBlur={commitStyle}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                  if (event.key === 'Escape') setStyleDraft(sceneStyle)
                }}
              />
            </label>
            <div className="generation-scope-tabs" aria-label="Generation scope">
              <button
                type="button"
                className={generationScope === 'beat' ? 'active' : ''}
                onClick={() => {
                  setGenerationScope('beat')
                  setSelectedShotIds([])
                }}
              >
                현재 구간 · {activeBeatShots.length}
              </button>
              <button
                type="button"
                className={generationScope === 'selected' ? 'active' : ''}
                onClick={() => {
                  setGenerationScope('selected')
                  if (!isExpanded) setMaximizedPanel('left')
                }}
              >
                Selected {selectedShots.length}
              </button>
              <button
                type="button"
                className={generationScope === 'all' ? 'active' : ''}
                onClick={() => {
                  setGenerationScope('all')
                  setSelectedShotIds([])
                }}
              >
                All blanks {allBlankShots.length}
              </button>
            </div>
            <div className="generation-bar-actions">
              <button
                type="button"
                className="generation-viewer-test"
                disabled={viewerTestTargets.length === 0}
                onClick={connectViewerTestPanels}
                title="비어 있는 컷에 저장된 관객 검토용 패널을 순서대로 연결합니다"
              >
                테스트 이미지 채우기{viewerTestTargets.length > 0 ? ` · ${viewerTestTargets.length}` : ''}
              </button>
              {selectedShots.length > 0 && (
                <button
                  type="button"
                  className="generation-clear-selection"
                  onClick={() => setSelectedShotIds([])}
                >
                  Clear selection
                </button>
              )}
              {candidateCount > 0 && (
                <button
                  type="button"
                  className="generation-accept-all"
                  onClick={acceptAllPanelCandidates}
                >
                  Accept all drafts · {candidateCount}
                </button>
              )}
              <button
                type="button"
                className="generation-run"
                disabled={eligibleScopeShots.length === 0 || isGenerating}
                onClick={() => handleGeneratePanels(eligibleScopeShots)}
              >
                {isGenerating ? `그리는 중… · ${generatingCount}` : (
                  <>
                    {generationScope === 'all'
                      ? 'Generate storyboard draft'
                      : generationScope === 'beat'
                        ? '현재 구간 생성'
                        : generationScope === 'selected'
                          ? 'Generate selected'
                          : 'Generate storyboard draft'}
                    {eligibleScopeShots.length > 0 ? ` · ${eligibleScopeShots.length}` : ''}
                  </>
                )}
              </button>
            </div>
            {/* 실패를 조용히 넘기면 왜 그림이 안 나왔는지 알 수 없다. */}
            {panelGenError && (
              <p className="generation-error">그림 생성 실패 · {panelGenError}</p>
            )}


            </section>
          )}

          {!isCutPlanStage && beats.map((beatGroup, i) => {
            // 접힌 씬의 Beat는 그리지 않는다. 씬을 여는 Beat는 남겨야
            // 헤더가 보이고 다시 펼 수 있다.
            if (isSceneCollapsed(beatGroup.beat)) return null
            const beatShots = getBeatShots(beatGroup.beat)
            const beatSuggestions = narrativeSuggestions.filter((suggestion) => suggestion.beat === beatGroup.beat)
            const inlineSuggestionTypes = new Set(['split-beat', 'insert-script-line', 'replace-script-line'])
            const nonBoundarySuggestions = beatSuggestions.filter((suggestion) => !inlineSuggestionTypes.has(suggestion.type))

            return (
              <div
                key={i}
                data-beat={beatGroup.beat}
                className={`sb-item ${showStoryboardPanels ? 'layout-expanded panels-matched' : isExpanded ? 'layout-script-focus' : 'layout-sidebar'} ${beatGroup.beat === activeBeat ? 'active-beat' : ''}`}
                onClick={() => selectBeat(beatGroup.beat)}
              >
                {i > 0 && !isScriptStage && !showStoryboardPanels && (
                  <button
                    className="merge-beat-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      mergeBeat(beatGroup.elements[0].globalIdx)
                    }}
                    title="Merge with above"
                  >
                    ↑ Merge
                  </button>
                )}

                <div className="sb-text-col">
                  {/* 씬 경계. Beat보다 큰 단위이므로 위에, 더 크게 둔다 —
                      씬은 시공간이 연속된 범위이고 Beat는 그 안의 국면이다. */}
                  {beatGroup.elements[0]?.type === 'scene-heading' && (
                    <button
                      type="button"
                      className={`sb-scene-label${collapsedScenes.includes(beatGroup.beat) ? ' collapsed' : ''}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        toggleScene(beatGroup.beat)
                      }}
                      aria-expanded={!collapsedScenes.includes(beatGroup.beat)}
                    >
                      <span className="sb-scene-caret" aria-hidden="true">
                        {collapsedScenes.includes(beatGroup.beat) ? '▸' : '▾'}
                      </span>
                      <span>Scene {sceneNumberOf(beatGroup.beat)}</span>
                      <strong>{beatGroup.elements[0].text}</strong>
                      {collapsedScenes.includes(beatGroup.beat) && (
                        <em>
                          {showStoryboardPanels
                            ? `${cutsInScene(beatGroup.beat)} cuts`
                            : `${beatsInScene(beatGroup.beat)} beats`}
                        </em>
                      )}
                    </button>
                  )}

                  {/* 씬을 접으면 그 씬을 여는 Beat의 본문도 함께 숨는다.
                      헤더만 남아 다시 펼 수 있다. */}
                  {!collapsedScenes.includes(beatGroup.beat) && !showStoryboardPanels && (
                  <>
                  {/* Beat 경계 표시이자 이 Beat의 조작 지점. 줄마다 버튼을
                      띄우지 않고 여기로 모은다. */}
                  {(beats.length > 1 || isScriptStage) && (
                    <div className="sb-beat-label">
                      <span>Beat {String(beatGroup.beat + 1).padStart(2, '0')}</span>
                      <em>{beatGroup.elements.length} lines</em>
                      {isScriptStage && (
                        <div className="sb-beat-tools">
                          <button
                            type="button"
                            className={editingBeat === beatGroup.beat ? 'active' : ''}
                            onClick={(event) => {
                              event.stopPropagation()
                              setEditingBeat(editingBeat === beatGroup.beat ? null : beatGroup.beat)
                            }}
                            title="줄 종류와 삭제를 표시"
                          >
                            {editingBeat === beatGroup.beat ? '완료' : '줄 편집'}
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleAddBeatAfter(beatGroup)
                            }}
                            title="이 Beat 다음에 새 Beat 추가"
                          >
                            + Beat
                          </button>
                          {i > 0 && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                mergeBeat(beatGroup.elements[0].globalIdx)
                              }}
                              title="위 Beat와 합치기"
                            >
                              ↑ 합치기
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {beatGroup.elements.map((el) => {
                    const inlineSuggestions = beatSuggestions.filter((suggestion) => (
                      (suggestion.type === 'split-beat' && suggestion.elementIndex === el.globalIdx + 1)
                      || (suggestion.type === 'insert-script-line' && suggestion.insertAfterIndex === el.globalIdx)
                      || (suggestion.type === 'replace-script-line' && suggestion.elementIndex === el.globalIdx)
                    ))

                    return (
                    <div key={el.globalIdx} className="script-element-block">
                      <div className="script-element-wrapper">
                        {isScriptStage ? (
                          <ScriptLineEditor
                            element={el}
                            index={el.globalIdx}
                            onChange={updateScreenplayLine}
                            onChangeType={setScreenplayLineType}
                            onInsertAfter={handleInsertLine}
                            onRemove={handleRemoveLine}
                            canRemove={screenplay.length > 1}
                            showTools={editingBeat === beatGroup.beat}
                            autoFocus={pendingFocus?.index === el.globalIdx}
                            focusCaret={pendingFocus?.caret}
                            onFocused={clearPendingFocus}
                            onMoveFocus={handleMoveFocus}
                          />
                        ) : (
                          <div
                            className={`sb-script-${el.type}${el.filled ? ' is-filled' : ''}`}
                            title={el.filled ? 'AI가 채운 줄입니다' : undefined}
                          >
                            {el.text}
                          </div>
                        )}
                        {/* Beat 나누기는 줄 편집 모드에서만. 평소 hover마다
                            버튼이 튀어나오면 대본 읽기를 방해한다. */}
                        <button
                          className={`split-beat-btn${editingBeat === beatGroup.beat ? ' always-on' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            splitBeat(el.globalIdx + 1)
                          }}
                          title="Split here"
                        >
                          + Split Beat
                        </button>
                      </div>
                      {inlineSuggestions.map((suggestion) => (
                        <NarrativeSuggestionCard
                          key={suggestion.id}
                          suggestion={suggestion}
                          onAccept={handleAcceptNarrativeSuggestion}
                          onDismiss={dismissNarrativeSuggestion}
                        />
                      ))}
                    </div>
                    )
                  })}
                  {nonBoundarySuggestions.map((suggestion) => (
                    <NarrativeSuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      onAccept={handleAcceptNarrativeSuggestion}
                      onDismiss={dismissNarrativeSuggestion}
                    />
                  ))}
                  </>
                  )}
                </div>

                {showStoryboardPanels && (
                  <div className="sb-img-col">
                    <div className="sb-shot-stack">
                      {beatShots.map(({ shot, shotIdx }) => {
                        const shotCut = cutPlan.find((item) => item.id === shot.cutPlanItemId)
                        const cutLabel = shotCut
                          ? `Cut ${shotCut.order || shotIdx + 1}`
                          : `Panel ${shotIdx + 1}`
                        const committedImage = getShotVisual(shot, shotIdx)
                        const candidate = panelCandidates[shot.id]
                        const displayImage = candidate?.image || committedImage
                        const isSelected = selectedShotIds.includes(shot.id)
                        // 앞 패널과의 이음새. 정한 것이 있을 때만 그린다 —
                        // 전부 '컷 · 연속'인 기본값까지 표시하면 실제로 정한
                        // 것이 묻힌다.
                        const prevShot = shotIdx > 0 ? flowShots[shotIdx - 1] : null
                        const seamBefore2 = prevShot ? seams[seamKeyFor(prevShot.id)] : null
                        const showSeam = isSeamMarked(seamBefore2)
                        // 이 패널이 그려야 할 그림 밖 채널 (DG1 P3).
                        const shotPrompt = shotCut
                          ? buildCutPrompt(shotCut, {
                            sceneIntention,
                            sceneNote: scenePromptNote,
                            declarations,
                            sceneState: sceneStateForCut(shotCut),
                            seam: seamBefore(shotCut.id),
                            cutIndex: cutPlan.findIndex((item) => item.id === shotCut.id),
                            cutOrder,
                          })
                          : null
                        const { marks: panelMarks, notes: panelNotes } = buildPanelMarks(
                          shotPrompt?.responsibility?.offImage || [],
                        )
                        // 화살표를 그렸으면 그 채널은 이미 화면에 있다.
                        const hasArrows = (shot.arrows || []).length > 0
                        const visibleNotes = panelNotes.filter(
                          (note) => !(note.needsArrow && hasArrows),
                        )

                        return (
                          <Fragment key={shot.id || shotIdx}>
                          {showSeam && (
                            <div className="sb-seam">
                              <span className="sb-seam-join">
                                {SEAM_JOINS.find((j) => j.id === seamBefore2.join)?.label}
                              </span>
                              {seamBefore2.elapsed !== 'continuous' && (
                                <span className="sb-seam-elapsed">
                                  {SEAM_ELAPSED.find((e) => e.id === seamBefore2.elapsed)?.label}
                                </span>
                              )}
                              {seamBefore2.elision && (
                                <span className="sb-seam-elision">
                                  생략 · {seamBefore2.elision}
                                </span>
                              )}
                            </div>
                          )}
                          <div
                            data-shot-id={shot.id}
                            className={`sb-shot-card ${shotIdx === activeShot ? 'active-shot' : ''} ${isSelected ? 'selected-for-generation' : ''} ${candidate ? 'has-ai-candidate' : ''} ${inspectedShotId === shot.id ? 'inspected' : ''}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              setInspectedShotId(shot.id)
                            }}
                          >
                            <button
                              type="button"
                              className={`sb-shot-select ${isSelected ? 'selected' : ''}`}
                              aria-pressed={isSelected}
                              aria-label={`${isSelected ? 'Remove' : 'Add'} ${cutLabel} ${isSelected ? 'from' : 'to'} generation selection`}
                              onClick={(event) => {
                                event.stopPropagation()
                                toggleShotSelection(shot.id)
                                setGenerationScope('selected')
                              }}
                            >
                              {isSelected ? '✓' : '+'}
                            </button>
                            <button
                              type="button"
                              className="sb-shot-delete"
                              disabled={flowShots.length <= 1}
                              title={flowShots.length <= 1 ? 'Keep at least one shot in the scene' : `Delete ${cutLabel}`}
                              aria-label={`Delete ${cutLabel}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                handleDeleteShot(shot.id, shotIdx)
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6" />
                              </svg>
                            </button>
                            {shotCut && (
                              <header className="sb-panel-cut-context">
                                <div>
                                  <span>{cutLabel}</span>
                                  {shotCut.purpose && <em>{shotCut.purpose}</em>}
                                </div>
                                <p>{shotCut.content}</p>
                              </header>
                            )}
                            {/* 그림은 30초 넘게 걸린다. 표시가 없으면 눌린
                                건지 알 수 없어 다시 누르게 된다. */}
                            {panelGenPending[shot.id] ? (
                              <div className="sb-panel-pending">
                                <span className="sb-pending-spinner" />
                                <span>그리는 중…</span>
                              </div>
                            ) : candidate ? (
                              <div className="sb-panel-candidate">
                                <div className="sb-img-wrapper">
                                  <img src={displayImage} alt={`${cutLabel} AI draft`} />
                                  <span className="sb-candidate-badge">AI candidate · V{candidate.version}</span>
                                </div>
                                <div className="sb-candidate-actions">
                                  <button type="button" onClick={() => dismissPanelCandidate(shot.id)}>Dismiss</button>
                                  <button
                                    type="button"
                                    onClick={() => handleGeneratePanels([{ shot, shotIdx }], { includeExisting: true })}
                                  >
                                    Again
                                  </button>
                                  <button type="button" onClick={() => handleDrawOverCandidate(shot, shotIdx)}>Draw over</button>
                                  <button
                                    type="button"
                                    className="accept"
                                    onClick={() => acceptPanelCandidate(shot.id)}
                                  >
                                    Accept
                                  </button>
                                </div>
                              </div>
                            ) : committedImage ? (
                              <div className="sb-img-wrapper">
                                <img src={displayImage} alt={cutLabel} />
                                <PanelOverlay
                                  marks={panelMarks}
                                  arrows={shot.arrows || []}
                                  drawing={arrowDrawingShotId === shot.id}
                                  selectedArrowId={selectedArrow?.shotId === shot.id
                                    ? selectedArrow.arrowId
                                    : null}
                                  onDrawArrow={(arrow) => {
                                    setPendingArrow({ shotId: shot.id, arrow })
                                    setSelectedArrow(null)
                                    setArrowDrawingShotId(null)
                                  }}
                                  onSelectArrow={(arrowId) => {
                                    setPendingArrow(null)
                                    setSelectedArrow({ shotId: shot.id, arrowId })
                                  }}
                                />
                                <PanelNote
                                  note={shot.note || ''}
                                  onChange={(value) => setShotNote(shot.id, value)}
                                  editing={noteEditingShotId === shot.id}
                                  onEditingChange={(editing) => (
                                    setNoteEditingShotId(editing ? shot.id : null)
                                  )}
                                />
                                <div className="sb-hover-actions">
                                  <button
                                    className="sb-action-btn"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleEditShot(shotIdx, beatGroup.beat)
                                    }}
                                  >
                                    Draw
                                  </button>
                                  <button
                                    className="sb-action-btn secondary"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleGeneratePanels([{ shot, shotIdx }], { includeExisting: true })
                                    }}
                                  >
                                    AI variant
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="sb-add-shot existing-empty">
                                <span>{cutLabel}</span>
                                <small>Choose how to start</small>
                                <div className="sb-empty-panel-actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleEditShot(shotIdx, beatGroup.beat)
                                    }}
                                  >
                                    Draw
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleGeneratePanels([{ shot, shotIdx }])
                                    }}
                                  >
                                    Generate
                                  </button>
                                </div>
                              </div>
                            )}
                            {/* 메타 줄은 패널을 식별하는 최소한만 남긴다.
                                샷 사이즈·출처·프롬프트는 인스펙터에 다 있고,
                                열두 패널마다 반복되면 그림이 안 보인다. */}
                            <div className="sb-shot-meta">
                              <span>{cutLabel}</span>
                              <div className="sb-panel-tools">
                                {/* 화살표와 메모는 책임 상태가 아니라 직접 쓰는
                                    스토리보드 표기 도구다. 항상 보여 발견 가능하게 한다. */}
                                <button
                                  type="button"
                                  className={`sb-arrow-toggle${arrowDrawingShotId === shot.id ? ' active' : ''}`}
                                  aria-pressed={arrowDrawingShotId === shot.id}
                                  title="패널 위를 끌어서 카메라 이동 방향을 표시합니다"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    const closing = arrowDrawingShotId === shot.id
                                    setArrowDrawingShotId(closing ? null : shot.id)
                                    setNoteEditingShotId(null)
                                    setPendingArrow(null)
                                    setSelectedArrow(null)
                                  }}
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 12h13M13 6l6 6-6 6" />
                                  </svg>
                                  {arrowDrawingShotId === shot.id ? '그리는 중' : '카메라 이동'}
                                </button>
                                <button
                                  type="button"
                                  className={`sb-note-toggle${noteEditingShotId === shot.id ? ' active' : ''}`}
                                  aria-pressed={noteEditingShotId === shot.id}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setNoteEditingShotId(
                                      noteEditingShotId === shot.id ? null : shot.id,
                                    )
                                    setArrowDrawingShotId(null)
                                    setPendingArrow(null)
                                    setSelectedArrow(null)
                                  }}
                                >
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M5 4h14v13H9l-4 3V4Z" />
                                  </svg>
                                  메모
                                </button>
                              </div>
                            </div>

                            {pendingArrow?.shotId === shot.id && (
                              <CameraMovePicker
                                onChoose={(move) => {
                                  addShotArrow(shot.id, {
                                    ...pendingArrow.arrow,
                                    channel: 'camera-move',
                                    kind: move.id,
                                    label: move.label,
                                  })
                                  setPendingArrow(null)
                                }}
                                onCancel={() => setPendingArrow(null)}
                              />
                            )}
                            {selectedArrow?.shotId === shot.id && (
                              <CameraMovePicker
                                existing
                                onChoose={(move) => {
                                  updateShotArrow(shot.id, selectedArrow.arrowId, {
                                    channel: 'camera-move',
                                    kind: move.id,
                                    label: move.label,
                                  })
                                  setSelectedArrow(null)
                                  setArrowDrawingShotId(null)
                                }}
                                onDelete={() => {
                                  removeShotArrow(shot.id, selectedArrow.arrowId)
                                  setSelectedArrow(null)
                                  setArrowDrawingShotId(null)
                                }}
                                onCancel={() => setSelectedArrow(null)}
                              />
                            )}

                            {/* 아직 그리지 않은 그림 밖 채널만 남긴다.
                                이미 그렸으면 화살표가 그 자리에 있으므로
                                칩으로 한 번 더 말하지 않는다. */}
                            {visibleNotes.length > 0 && (
                              <ul className="sb-shot-offimage-notes">
                                {visibleNotes.map((note, index) => (
                                  <li
                                    key={`${note.element}-${index}`}
                                    className={note.needsArrow ? 'needs-arrow' : ''}
                                    title={note.needsArrow
                                      ? '화살표 버튼을 눌러 표시하세요'
                                      : note.element}
                                  >
                                    <em>{note.element}</em>
                                    {note.label !== note.element && <span>{note.label}</span>}
                                  </li>
                                ))}
                              </ul>
                            )}

                          </div>
                          </Fragment>
                        )
                      })}
                      {/* 패널을 여기서 늘리지 않는다. 컷에서 나오지 않은
                          패널은 프롬프트가 붙지 않아 생성도 못 한다.
                          컷을 더하려면 컷 플랜의 `+`를 쓴다. */}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
      </div>
      {isExpanded && !drawingWorkspaceOpen && cutStage === 'panels' && (
        <ShotInspector
          shot={inspectedShot}
          cut={inspectedCut}
          prompt={inspectedPrompt}
          shotSizes={cutPlanShotSizes}
          angles={cutPlanAngles}
          moves={cutPlanMoves}
          onChange={updateCutPlanItem}
          onClose={() => setInspectedShotId(null)}
          deferredDeclarations={deferredDeclarations.filter((decl) => (
            decl.scope === 'scene' || decl.cutId === inspectedCut?.id
          ))}
          decidedDeclarations={acceptedDeclarations.filter((decl) => (
            decl.scope === 'scene' || decl.cutId === inspectedCut?.id
          ))}
          onDeclarationDecide={decideDeclaration}
          onDeclarationReject={rejectDeclaration}
        />
      )}

      {/* Panels에는 rail을 두지 않는다. 인스펙터와 나란히 서면 rail이 둘로
          보이고, 보드도 630px 좁아진다. 샷은 컷 플랜에서 이미 정해진다. */}
      {isExpanded && !drawingWorkspaceOpen && cutStage !== 'panels' && (
        <aside
          className={`storyboard-narrative-rail ${narrativeRailOpen ? 'open' : 'collapsed'}`}
          aria-label="Agents"
        >
          {/* rail 접기와 에이전트 접기는 다른 축이다. rail은 자리를 비우고,
              에이전트는 지금 누구를 보는지 고른다. */}
          <header className="rail-header">
            {narrativeRailOpen && <strong>Agents</strong>}
            <button
              type="button"
              className="narrative-rail-toggle"
              onClick={() => setNarrativeRailOpen((open) => !open)}
              aria-label={narrativeRailOpen ? 'Collapse agents' : 'Open agents'}
              title={narrativeRailOpen ? 'Collapse agents' : 'Open agents'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={narrativeRailOpen ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
              </svg>
            </button>
          </header>

          {narrativeRailOpen ? (
            <div className="rail-agents">
            <section className={`rail-agent${openAgent === 'narrative' ? ' open' : ''}`}>
              <button
                type="button"
                className="rail-agent-head"
                aria-expanded={openAgent === 'narrative'}
                onClick={() => setOpenAgent(openAgent === 'narrative' ? null : 'narrative')}
              >
                <span className="narrative-agent-mark" aria-hidden="true">
                  N
                  <i />
                </span>
                <div>
                  <strong>Narrative</strong>
                  <span>Script collaborator</span>
                </div>
                {narrativeSuggestions.length > 0 && (
                  <em className="rail-agent-badge">{narrativeSuggestions.length}</em>
                )}
                <svg className="rail-agent-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {openAgent === 'narrative' && (
              <div className="rail-agent-body">
              {/* Scene intention은 있을 때만 보여준다. 나머지 상태는 대본의
                  Beat 라벨과 상단 단계 표시에 이미 드러나 있다. */}
              {sceneIntention && (
                <section className="narrative-rail-context">
                  <span>Scene intention</span>
                  <p>{sceneIntention}</p>
                </section>
              )}

              {viewerFindingHandoff?.route === 'narrative' && (
                <section className="narrative-viewer-handoff" aria-label="순차 읽기에서 가져온 문제">
                  <header>
                    <span>순차 읽기 · {(viewerFindingHandoff.panelOrders || [viewerFindingHandoff.panelOrder]).map((panelOrder) => `S${panelOrder}`).join(' · ')}</span>
                    <button type="button" onClick={clearViewerFindingHandoff} aria-label="순차 읽기 카드 닫기">×</button>
                  </header>
                  <strong>{viewerFindingHandoff.interpretations?.[0] || viewerFindingHandoff.title}</strong>
                  <p><em>시각적 근거</em>{viewerFindingHandoff.visibleCues?.join(' · ') || '특정 근거 없음'}</p>
                  <button type="button" onClick={addViewerFindingToNarrativeRequest}>
                    요청에 담기
                  </button>
                </section>
              )}

              {/* 점검보다 위에 둔다. 점검이 짚어 주기 전에도 감독이 먼저
                  물을 수 있어야 하고, 다음 단계로 넘어가는 버튼은 그 아래에
                  두어 대본을 손볼 것이 없는지 보고 나서 누르게 한다. */}
              <div className="narrative-rail-composer">
                <label htmlFor="narrative-screenplay-request">Request</label>
                <textarea
                  id="narrative-screenplay-request"
                  value={narrativeRequest}
                  onChange={(event) => {
                    setNarrativeRequest(event.target.value)
                    // 새 요청을 쓰기 시작하면 지난 결과를 지운다. 계속 떠
                    // 있으면 방금 쓴 요청에 대한 답으로 오해된다.
                    if (narrativeAnswered) clearNarrativeResult()
                  }}
                  placeholder="예: 이 Beat를 둘로 나누고 대사를 덜 설명적으로 바꿔줘."
                  aria-label={`Narrative request for Beat ${activeBeat + 1}`}
                  rows={3}
                />
                <div>
                  <span>{`Beat ${activeBeat + 1}에 적용`}</span>
                  <button
                    type="button"
                    disabled={!narrativeRequest.trim() || narrativePending}
                    onClick={handleNarrativeRequest}
                  >
                    {narrativePending ? '생각 중…' : 'Propose'}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Request가 감독이 묻는 쪽이면 이쪽은 서사가 먼저 짚는
                  쪽이다. 같은 일의 두 방향이므로 붙여 둔다. */}
              {cutStage === 'script'
                ? scriptLines.length > 0 && renderNarrativeCheck('script')
                : cutPlan.length > 0 && renderNarrativeCheck('cutplan')}

              {/* 요청을 넘긴 뒤 칸이 비므로, 무엇이 진행 중인지 여기서
                  보인다. 아니면 아무 일도 없는 것처럼 보인다. */}
              {narrativePending && (
                <div className="narrative-rail-proposal-status pending">
                  <span>…</span>
                  <div>
                    <strong>Beat {activeBeat + 1} 검토 중</strong>
                    <p>요청에 맞는 제안을 찾고 있습니다.</p>
                  </div>
                </div>
              )}

              {/* 제안이 하나도 없으면 그 사실을 밝힌다. 요청을 보냈는데
                  아무 반응이 없으면 고장 난 것으로 보인다. */}
              {!narrativePending && narrativeAnswered && narrativeSuggestions.length === 0 && (
                <div className="narrative-rail-proposal-status empty">
                  <span>—</span>
                  <div>
                    <strong>여기서는 할 수 없는 요청입니다</strong>
                    {/* 갈 곳을 실제로 가리킨다. "대본 단계"처럼 화면에
                        없는 이름을 대면 사용자가 찾을 수 없다. */}
                    {/* 문장 안에 strong을 쓰지 않는다 — 이 블록의
                        strong은 display:block이라 줄이 끊긴다. */}
                    <p>
                      서사 에이전트는 Beat {activeBeat + 1} 하나만 다룹니다.
                      이야기를 더 쓰려면 Script 단계에서 대본을 고치고,
                      Beat를 나누려면 줄 옆 “+ Split Beat”을 쓰세요.
                    </p>
                  </div>
                </div>
              )}

              {!narrativePending && narrativeSuggestions.length > 0 && (
                <div className="narrative-rail-proposal-status">
                  <span>{narrativeSuggestions.length}</span>
                  <div>
                    <strong>Proposal ready</strong>
                    {/* 모델을 못 불렀으면 밝힌다. 규칙 기반 결과를 모델이
                        만든 것처럼 보이게 두지 않는다. */}
                    <p>
                      {narrativeError
                        ? `AI 호출 실패 · 규칙 기반 제안입니다`
                        : '대본 안의 관련 위치에 표시했습니다.'}
                    </p>
                  </div>
                </div>
              )}


              </div>
              )}
            </section>

            {/* 컷 플랜부터는 Narrative 혼자가 아니다. 촬영 구도 컬럼을
                서사 에이전트가 정하는 것이 이상하듯, 씬 기준은 미장센이
                세운다. 파이프라인의 `에이전트 진단·공백 질의`가 이 자리다. */}
            {cutStage === 'cutplan' && (
              <section className={`rail-agent${openAgent === 'mise' ? ' open' : ''}`}>
                <button
                  type="button"
                  className="rail-agent-head"
                  aria-expanded={openAgent === 'mise'}
                  onClick={() => setOpenAgent(openAgent === 'mise' ? null : 'mise')}
                >
                  <span className="lens-agent-mark" aria-hidden="true">M</span>
                  <div>
                    <strong>Mise-en-scène</strong>
                    <span>Scene state</span>
                  </div>
                  {undecidedSceneFacts > 0 && (
                    <em className="rail-agent-badge is-open">{undecidedSceneFacts}</em>
                  )}
                  <svg className="rail-agent-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {openAgent === 'mise' && (
                <div className="rail-agent-body">
                  <p className="rail-lens-lead">
                    컷마다 프롬프트를 따로 만들기 때문에, 그냥 두면 컷 1의
                    재인과 컷 15의 재인이 다른 사람으로 그려집니다. 인물과
                    공간의 생김새를 씬 단위로 한 번 정해 모든 컷에 같이
                    넣습니다.
                  </p>

                  {/* 대본에 있는 것만 읽는다. 없는 것은 지어내지 않고
                      '미정'으로 남긴다 — 무엇이 안 정해졌는지 보여야
                      창작자가 판정할 수 있다 (DG1 P2). */}
                  <button
                    type="button"
                    className="rail-lens-primary is-mise"
                    onClick={requestSceneStates}
                    disabled={sceneStatePending || screenplay.length === 0}
                  >
                    {sceneStatePending ? '읽는 중…' : '대본에서 인물·공간 읽기'}
                  </button>
                  {sceneStateError && (
                    <p className="rail-lens-error">AI 호출 실패 · {sceneStateError}</p>
                  )}

                  {hasActiveSceneState ? (
                  <ul className="rail-scene-state">
                    {activeSceneState.characters.map((character) => (
                      <li key={character.id}>
                        <div className="rail-scene-head">
                          <strong>{character.name}</strong>
                          <em>{character.summary}</em>
                        </div>
                        {character.facts.map((fact) => (
                          <SceneFactRow
                            key={fact.label}
                            fact={fact}
                            onCommit={(value) => setSceneFact(
                              'character', fact.label, value, { characterId: character.id },
                            )}
                          />
                        ))}
                      </li>
                    ))}

                    <li>
                      <div className="rail-scene-head">
                        <strong>{activeSceneState.location.name}</strong>
                        <em>공간</em>
                      </div>
                      {activeSceneState.location.facts.map((fact) => (
                        <SceneFactRow
                          key={fact.label}
                          fact={fact}
                          onCommit={(value) => setSceneFact('location', fact.label, value)}
                        />
                      ))}
                    </li>

                    {activeSceneState.environment?.facts?.length > 0 && (
                      <li>
                        <div className="rail-scene-head">
                          <strong>환경</strong>
                          <em>씬 전체</em>
                        </div>
                        {/* 그림체는 여기 두지 않는다. 인물 외형·소품과 성격이
                            다르고(모든 패널에 똑같이 걸린다), 그리기 직전인
                            Panels 생성 바에서 정하는 것이 자연스럽다. */}
                        {activeSceneState.environment.facts
                          .filter((fact) => fact.label !== '그림체')
                          .map((fact) => (
                          <SceneFactRow
                            key={fact.label}
                            fact={fact}
                            cutOptions={sceneCutOptions}
                            onCommit={(value) => setSceneFact('environment', fact.label, value)}
                            onAddChange={(at, value) => addFactChange('environment', fact.label, at, value)}
                            onRemoveChange={(at) => removeFactChange('environment', fact.label, at)}
                          />
                        ))}
                      </li>
                    )}
                  </ul>
                  ) : (
                    <p className="rail-coverage-clear">
                      아직 이 이야기의 미장센 기준을 읽지 않았습니다.
                    </p>
                  )}
                </div>
                )}
              </section>
            )}

            {/* 촬영이 담당하는 값(shotSize·angle·카메라)은 이미 컷 표의
                컬럼이다. 여기서 또 편집하지 않고, 한 컷만 봐서는 알 수 없는
                것을 짚는다. 고치는 것은 표에서 한다 — 발견과 처분은 다르다. */}
            {cutStage === 'cutplan' && (
              <section className={`rail-agent${openAgent === 'camera' ? ' open' : ''}`}>
                <button
                  type="button"
                  className="rail-agent-head"
                  aria-expanded={openAgent === 'camera'}
                  onClick={() => setOpenAgent(openAgent === 'camera' ? null : 'camera')}
                >
                  <span className="camera-agent-mark" aria-hidden="true">C</span>
                  <div>
                    <strong>Cinematography</strong>
                    <span>Coverage</span>
                  </div>
                  {coverageFindings.length > 0 && (
                    <em className="rail-agent-badge is-open">{coverageFindings.length}</em>
                  )}
                  <svg className="rail-agent-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {openAgent === 'camera' && (
                <div className="rail-agent-body">
                  <p className="rail-lens-lead">
                    컷을 어떻게 찍을지 정합니다. 컷 하나 안의 문제를 보고,
                    이어 붙였을 때의 문제는 편집이 봅니다.
                  </p>

                  {/* 샷을 정하는 것이 촬영의 몫이다. 줄콘티는 컷만 나눈다. */}
                  <button
                    type="button"
                    className="rail-lens-primary"
                    onClick={requestShotDesign}
                    disabled={shotDesignPending || cutPlan.length === 0}
                  >
                    {shotDesignPending
                      ? '샷 정하는 중…'
                      : undecidedShots > 0
                        ? `샷 정하기 · ${undecidedShots}컷 미정`
                        : '샷 다시 정하기'}
                  </button>
                  {shotDesignError && (
                    <p className="rail-lens-error">
                      AI 호출 실패 · {shotDesignError}
                    </p>
                  )}

                  <DiagnosisList
                    findings={coverageFindings}
                    emptyLabel="지금 구성에서 걸리는 것이 없습니다."
                    onGoTo={goToFinding}
                    onRequestFix={requestShotFix}
                    fixPending={shotFixPending}
                    fixProposal={shotFixProposal}
                    fixError={shotFixError}
                    onAcceptFix={acceptShotFix}
                    onRejectFix={rejectShotFix}
                  />
                </div>
                )}
              </section>
            )}

            {/* 컷 사이를 본다. 삽입·삭제는 표에 이미 있으므로 여기서는
                어느 이음새에 무엇이 있는지만 짚는다. */}
            {cutStage === 'cutplan' && (
              <section className={`rail-agent${openAgent === 'editing' ? ' open' : ''}`}>
                <button
                  type="button"
                  className="rail-agent-head"
                  aria-expanded={openAgent === 'editing'}
                  onClick={() => setOpenAgent(openAgent === 'editing' ? null : 'editing')}
                >
                  <span className="editing-agent-mark" aria-hidden="true">E</span>
                  <div>
                    <strong>Editing</strong>
                    <span>Seams</span>
                  </div>
                  {seamFindings.length > 0 && (
                    <em className="rail-agent-badge is-open">{seamFindings.length}</em>
                  )}
                  <svg className="rail-agent-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {openAgent === 'editing' && (
                <div className="rail-agent-body">
                  <p className="rail-lens-lead">
                    컷은 하나씩 보면 괜찮아도 이어 붙이면 문제가 되기도 합니다.
                    짚어준 컷은 아래에서 합치거나 나눌 수 있습니다.
                  </p>

                  {/* DG2 P1의 병합·분할. 지금까지 Panels에만 있었는데,
                      컷 구성을 바꾸는 일은 컷 플랜에서 하는 것이 맞다. */}
                  {!selectedCutId && (
                    <p className="rail-cut-edit-hint">
                      표에서 컷을 클릭하면 여기서 나누거나 합칠 수 있습니다.
                    </p>
                  )}

                  {selectedCutId && (() => {
                    const index = cutPlan.findIndex((cut) => cut.id === selectedCutId)
                    const cut = cutPlan[index]
                    const next = cutPlan[index + 1]
                    if (!cut) return null
                    return (
                      <div className="rail-cut-edit">
                        <strong>컷 {cut.beat + 1}-{cut.beatOrder}</strong>
                        <p>{cut.content}</p>
                        <div>
                          <button
                            type="button"
                            onClick={() => splitCut(cut.id)}
                          >
                            나누기
                          </button>
                          <button
                            type="button"
                            disabled={!next || next.beat !== cut.beat}
                            title={next && next.beat === cut.beat
                              ? `컷 ${next.beat + 1}-${next.beatOrder}와 합칩니다`
                              : '같은 Beat의 다음 컷이 없습니다'}
                            onClick={() => mergeCuts(cut.id)}
                          >
                            다음 컷과 합치기
                          </button>
                        </div>
                      </div>
                    )
                  })()}

                  <DiagnosisList
                    findings={seamFindings}
                    emptyLabel="지금 이음새에서 걸리는 것이 없습니다."
                    onGoTo={goToFinding}
                    onRequestFix={requestShotFix}
                    fixPending={shotFixPending}
                    fixProposal={shotFixProposal}
                    fixError={shotFixError}
                    onAcceptFix={acceptShotFix}
                    onRejectFix={rejectShotFix}
                  />
                </div>
                )}
              </section>
            )}
            {/* 다음 단계는 에이전트 목록 밖, 레일 맨 아래에 둔다.
                어느 에이전트를 열어 두었든 같은 자리에 있어야
                이 단계에서 나가는 길로 읽힌다. */}
            <section className="narrative-rail-guidance">
              <span>Next step</span>
              {/* 대본은 주어진 것에서 시작한다. 다음 단계는 컷 분해다. */}
              {/* 이야기 한 덩어리로 들어왔으면 씬·비트부터 세운다.
                  컷을 나누려면 그 단위가 있어야 한다. */}
              {cutStage === 'script' && needsStructure ? (
                <>
                  <p>
                    아직 이야기 한 덩어리입니다. 씬과 Beat로 나누면 그
                    단위로 컷을 정할 수 있습니다.
                  </p>
                  <button
                    type="button"
                    className="narrative-rail-primary"
                    onClick={requestStoryStructure}
                    disabled={structurePending}
                  >
                    {structurePending ? '나누는 중…' : '씬·Beat로 나누기'}
                  </button>
                </>
              ) : cutStage === 'script' ? (
                <>
                  <p>
                    대본이 준비됐습니다. 그림 전에 이 장면을 몇 개의 컷으로
                    나눌지 정하고, 이어서 촬영이 각 컷의 샷을 정합니다.
                  </p>

                  {/* 다음 단계로 넘어가는 버튼은 맨 아래에 둔다. 위에서
                      대본을 손볼 것이 없는지 보고 나서 누르는 순서다 —
                      먼저 놓으면 점검을 지나쳐 컷부터 만들게 된다. */}
                  <button
                    type="button"
                    className="narrative-rail-primary"
                    onClick={cutPlan.length > 0 ? clearCutPlanStageOverride : requestCutPlan}
                    disabled={cutPlanRunPending}
                  >
                    {cutPlanPending
                      ? '컷 나누는 중…'
                      : cutPlanRunPending
                        ? '샷 정하는 중…'
                        : cutPlan.length > 0 ? '컷 플랜 이어서' : '컷 플랜 만들기'}
                  </button>
                </>
              ) : (
                <>
                  <p>
                    Beat {activeBeat + 1}을(를) 보고 있습니다. 이 Beat의 행동과
                    대사를 조금씩 고쳐 나가세요.
                  </p>
                </>
              )}
            </section>
            </div>
          ) : (
            <button
              type="button"
              className="narrative-rail-collapsed-label"
              onClick={() => setNarrativeRailOpen(true)}
            >
              {/* 접혀 있어도 어느 에이전트가 있고 무엇이 남았는지 보인다. */}
              <span className="narrative-agent-mark">N</span>
              {cutStage === 'cutplan' && <span className="lens-agent-mark">M</span>}
              <strong>Agents</strong>
              {narrativeSuggestions.length + (cutStage === 'cutplan' ? undecidedSceneFacts : 0) > 0 && (
                <em>
                  {narrativeSuggestions.length
                    + (cutStage === 'cutplan' ? undecidedSceneFacts : 0)}
                </em>
              )}
            </button>
          )}
        </aside>
      )}
    </div>
  )
}
