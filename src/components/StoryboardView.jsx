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
  referencePendingKey,
  selectActiveSceneState,
  sceneOfBeat,
  seamKeyFor,
  isSeamMarked,
  SEAM_JOINS,
  SEAM_ELAPSED,
  diagnoseSeams,
  PROBLEM_LAYERS,
  PANEL_STYLE_PRESETS,
  selectSceneStates,
  selectLayoutForCut,
  cutFindingFingerprint,
  characterNamesOfCut,
} from '../store/useStore'
import FramingGlyph from './FramingGlyph'
import './StoryboardView.css'
import { logEdit, logEvent, logScaffold } from '../store/studyLog'
import useRequestHistory from '../hooks/useRequestHistory'

// 규칙 id를 그대로 보이면 감독이 읽을 것이 아니다.
const NARRATIVE_RULE_LABELS = {
  // 대본 — 서사가 본다.
  'narrative-beat-progression': '이야기가 제자리예요',
  'narrative-action-visibility': '그릴 수 없게 쓰였어요',
  'narrative-information-reveal': '알려주는 때가 안 맞아요',
  'narrative-causal-link': '앞뒤가 안 이어져요',
  // 컷 플랜 — 편집이 본다. 컷 단위 판단은 편집의 일이다.
  // 이 규칙은 네 가지를 함께 본다(기능 없음 / 필수 단계 누락 / 반복 / 압축).
  // 기본 문구는 '있는 컷을 덜어낼까'이고, 없는 컷을 넣자는 제안일 때는
  // 아래 RULE_LABEL_BY_OPERATION이 뒤집는다.
  'editing-shot-function': '이 컷이 필요할까요',
  'editing-information-order': '보여주는 순서가 아쉬워요',
  // 컷 플랜 — 촬영이 보는 하나. 크기가 내용을 담는지는 그림 없이도
  // 판단할 수 있고, 그린 뒤에 알면 다시 그려야 한다.
  'camera-information-selection': '이 크기로 보일까요',
  // 컷 플랜 — 미장센이 텍스트 근거로 보는 세 가지.
  'mise-functional-elements': '필요한 요소가 빠졌어요',
  'mise-relational-blocking': '인물 관계가 안 잡혀요',
  'mise-spatial-continuity': '배치와 동선이 안 이어져요',
}

// 같은 규칙이라도 제안하는 조치가 반대면 묻는 말도 반대여야 한다.
// `이 컷이 필요할까요`는 있는 컷을 덜어내자는 말인데, insert는 없는 컷을
// 넣자는 제안이다 — 같은 문구로 두면 감독이 무엇을 판정하는지 어긋난다.
const RULE_LABEL_BY_OPERATION = {
  'editing-shot-function': {
    insert: '이 컷도 필요할까요',
  },
}

const ruleLabelOf = (finding, fallback) => (
  RULE_LABEL_BY_OPERATION[finding?.ruleId]?.[finding?.operation]
  || NARRATIVE_RULE_LABELS[finding?.ruleId]
  || fallback
)

// 점검 지적 하나를 가리키는 안정적인 id. ruleId만으로는 같은 규칙이 두 줄에
// 걸리면 겹치므로 걸린 위치까지 섞는다. 제안을 적용하면 이 id를 해결로
// 옮겨 지적 카드를 숨긴다 (S4).
const narrativeFindingId = (finding) => [
  finding?.ruleId || 'rule',
  (finding?.lineIndexes || []).join(','),
  (finding?.cutIds || []).join(','),
].join('|')

// AI 점검이 짚은 규칙이 어느 층위의 문제인가. 이것이 없으면 전부
// '컷 구성'으로 뜬다 — 순서 문제도, 크기 문제도.
//
// 층위는 모델에게 묻지 않는다. 규칙이 무엇을 보는지가 층위를 이미 정하기
// 때문이다 — `이 컷이 있어야 하는가`로 발견한 문제는 컷 하나의 문제고,
// `크기가 담는가`는 그 컷의 값 문제다. 컷마다 달라지지 않는다.
//
// 다만 정보 순서는 짚은 컷 수로 갈린다. 두 컷의 앞뒤가 뒤집힌 것과 씬
// 전체의 배치가 어긋난 것은 고치는 자리가 다르다. shot_relation과
// scene_structure는 둘 다 컷 2개 이상을 요구하므로(schemas.py) 컷 하나만
// 짚었으면 순서 문제로 성립하지 않는다.
const CHECK_RULE_LAYERS = {
  'editing-shot-function': 'shot_structure',
  'camera-information-selection': 'attribute',
}

const layerOfCheckFinding = (finding) => {
  if (finding.ruleId === 'editing-information-order') {
    const count = finding.cutIds?.length ?? 0
    if (count >= 3) return 'scene_structure'
    if (count === 2) return 'shot_relation'
    return 'shot_structure'
  }
  return CHECK_RULE_LAYERS[finding.ruleId] || 'shot_structure'
}

const EMPTY_SHOTS = []

// textarea 자체는 일부 글자만 색칠할 수 없다. 대신 `@이름`을 입력하면
// 바로 아래에 같은 이름을 인물 태그로 드러내, 일반 문장과 다른 지시라는
// 것을 보이게 한다. 실제 생성에서는 characterNamesOfCut가 이 값을 읽는다.
const mentionsIn = (text = '') => [...String(text).matchAll(/@([^\s@,，.。!?…]+)/g)]
  .map((match) => match[1].trim())
  .filter((name, index, names) => name && names.indexOf(name) === index)

// 컷 내용을 그 자리에서 고친다. 타이핑마다 스토어를 고치면 열여덟 행이
// 매번 다시 그려지므로, 편집 중에는 로컬에 두고 손을 뗄 때 커밋한다.
// 커밋된 문장이 곧 그림 프롬프트의 본문이 된다 (`buildCutPrompt`).
function ConteContent({ cutId, value, onCommit }) {
  const [draft, setDraft] = useState(value)
  // 고친 것이 아직 안 들어갔는지 보여준다. 손을 뗄 때 저장되는데, 그
  // 사실이 화면에 없으면 고치고도 반영됐는지 알 수 없어 다시 누르게 된다.
  const dirty = draft.trim() !== value
  const mentions = mentionsIn(draft)
  return (
    <div className={`sb-conte-content-wrap${dirty ? ' is-dirty' : ''}`}>
      <textarea
        className="sb-conte-content"
        /* 그리기 직전에 아직 커밋되지 않은 칸을 찾아내기 위한 표시다.
           편집 중인 문장은 blur 전까지 로컬에만 있어서, 고치자마자 재생성을
           누르면 옛 문장으로 그려질 수 있다 — 그 창을 없앤다
           (`commitOpenContentEdits`). */
        data-conte-content={cutId}
        data-conte-committed={value}
        value={draft}
        rows={1}
        placeholder="이 컷에서 무슨 일이 일어나는가"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onCommit(draft.trim())}
        onKeyDown={(event) => {
          // Escape는 되돌린다. 잘못 고쳤을 때 원문으로 돌아갈 길이 있어야 한다.
          if (event.key === 'Escape') {
            setDraft(value)
            event.currentTarget.blur()
          }
        }}
        ref={(el) => {
          // 내용만큼 늘린다. 스크롤바가 생기면 문장 뒷부분이 표에서 사라진다.
          if (!el) return
          el.style.height = 'auto'
          el.style.height = `${el.scrollHeight}px`
        }}
      />
      {mentions.length > 0 && (
        <div className="sb-character-mentions" aria-label="이 컷에 지정한 인물">
          {mentions.map((name) => <span key={name}>@{name}</span>)}
        </div>
      )}
      {/* 그리기를 누르면 이 문장이 먼저 반영되므로(`commitOpenContentEdits`)
        따로 저장을 누를 필요는 없다. 다만 아직 안 들어갔다는 것은
        보여야 한다. */}
      {dirty && <span className="sb-conte-content-dirty">고친 내용 · 그리면 반영됩니다</span>}
    </div>
  )
}

// 표 안에서 샷·앵글을 고른다. 지금 값은 그림으로 보이고, 누르면 후보가
// 그림으로 펼쳐진다 — 훑을 때는 그림이 값을 말하고, 고를 때는 후보를
// 나란히 비교한다.
function FramingPicker({ value, options, kind, label, placeholder, onChange, disabled }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`conte-framing${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className={`conte-framing-current${value ? '' : ' is-unset'}`}
        aria-label={`${label}${value ? ` · ${value}` : ' 정하기'}`}
        aria-expanded={open}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((on) => !on)
        }}
      >
        {value
          ? <FramingGlyph kind={kind} value={value} />
          : <span className="conte-framing-blank" aria-hidden="true">—</span>}
        <em>{value || placeholder}</em>
      </button>
      {open && (
        <>
          {/* 바깥을 누르면 닫힌다. 표의 다른 칸을 누르려다 계속 열려
              있으면 그 클릭이 먹히지 않는다. */}
          <button
            type="button"
            className="conte-framing-scrim"
            aria-label="닫기"
            onClick={(event) => {
              event.stopPropagation()
              setOpen(false)
            }}
          />
          <div className="conte-framing-menu" role="dialog" aria-label={`${label} 고르기`}>
            <p>{label}</p>
            <div>
              {options.map((option) => (
                <button
                  type="button"
                  key={option}
                  className={option === value ? 'is-active' : ''}
                  onClick={(event) => {
                    event.stopPropagation()
                    // 고른 값을 다시 누르면 비운다 — 촬영이 아직 정하지
                    // 않은 상태로 되돌릴 길이 있어야 한다 (DG1 P2).
                    onChange(option === value ? '' : option)
                    setOpen(false)
                  }}
                >
                  <FramingGlyph kind={kind} value={option} />
                  <em>{option}</em>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}


// 줄 종류는 둘뿐이다. 대사·괄호·전환은 두지 않는다 — 정지 이미지가
// 담을 수 없고, 스토리보드가 평가하려는 것도 아니다.
const SCRIPT_LINE_TYPES = [
  { value: 'scene-heading', label: 'Scene' },
  { value: 'action', label: 'Action' },
]

// Script 단계에서 대본을 그 자리에서 고친다. 별도 raw 편집기를 열고
// 전체를 다시 붙여넣지 않아도 되고, beat 구조가 유지된다.
// 샷 크기를 바꿔 풀리는 진단. 여기 없는 것은 컷을 나누거나 합쳐야 하는
// 것들이다 — 층위가 달라 rail의 나누기·합치기가 맡는다.
const SHOT_FIXABLE = new Set([
  'jump-cut', 'size-run',
  'size-mismatch', 'no-establishing',
  'anchor-too-tight', 'approach-broken', 'peak-not-closest',
])

// 컷을 넣어야 풀리는 진단. 샷 크기로는 풀리지 않는다 — 없는 컷의 크기를
// 고칠 수는 없다.
const CUT_INSERTABLE = new Set(['skipped-beat'])

// 진단을 늘어놓는 순서. PROBLEM_LAYERS에 적힌 차례가 곧 좁은 층위에서
// 넓은 층위로 가는 차례다(속성 → 컷 구성 → 컷 관계 → 씬 구조). 여기에
// 순서를 다시 적지 않는 이유 — 두 벌이 되면 한쪽만 고쳐져 어긋난다.
const LAYER_ORDER = Object.keys(PROBLEM_LAYERS)
// 층위가 없는 진단은 맨 뒤로. 어디서 고칠지 모르는 것을 먼저 보여줄 이유가 없다.
const layerRank = (layer) => {
  const rank = LAYER_ORDER.indexOf(layer)
  return rank === -1 ? LAYER_ORDER.length : rank
}

// 촬영·편집의 진단 카드. 문제의 층위를 밝힌다 (design_goal.md DG2:
// 원인이 속성·컷 구성·컷 관계·씬 구조 중 어디인지 진단하고 해당
// 층위에서 개입한다). 고치는 것은 표에서 하므로 버튼은 데려다주기만 한다.
// 씬 기준의 값 한 줄. 대본에서 읽은 것이든 비어 있는 것이든 전부 고칠 수
// 있다 — AI가 대본을 잘못 읽었을 때 고칠 방법이 없으면 안 된다. 다만
// 어디서 온 값인지는 구분해 보인다 (DG1 P2: AI가 낸 것은 판정 대상이다).
// 도면은 SVG로 만들지만 images.edit는 PNG만 받는다. 캔버스로 옮긴다.
// 확정 직후 자동으로 그리는 장수. 감독이 기다리는 시간이 여기서 정해진다 —
// 한 장에 20~30초이므로 아홉 장이면 4~5분이고, 그 뒤로는 검토를 시작할 수
// 있다. 더 필요하면 생성 바에서 이어 그린다.
const AUTO_DRAFT_LIMIT = 9

// 도면은 상자와 선뿐이라 크게 보낼 이유가 없다. 매 컷에 함께 올라가므로
// 18장이면 이 크기가 그대로 대기 시간이 된다 — 배치를 읽는 데는 이 정도로
// 충분하다.
const LAYOUT_IMAGE_SIZE = 384

const rasterizeLayout = (svgDataUrl) => new Promise((resolve) => {
  if (!svgDataUrl) return resolve(null)
  const image = new Image()
  image.onload = () => {
    const canvas = document.createElement('canvas')
    const source = Math.max(image.width || 768, image.height || 768)
    const scale = Math.min(1, LAYOUT_IMAGE_SIZE / source)
    canvas.width = Math.round((image.width || 768) * scale)
    canvas.height = Math.round((image.height || 768) * scale)
    const context = canvas.getContext('2d')
    // 투명 배경은 검게 깔린다. 도면은 흰 종이여야 읽힌다.
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
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

// 예시 데이터의 레퍼런스는 public 파일 경로이고, 사용자가 만든 레퍼런스는
// data URL이다. 서버에는 어느 쪽이든 base64 PNG로 보내야 실제 입력 이미지가
// 된다. 파일 경로를 버리면 화면에는 같은 인물이 보여도 생성 모델은 그 기준을
// 한 번도 보지 못한다.
// 씬 안에서 변할 수 있는 항목. DecisionBoard의 같은 목록과 맞춰야 한다 —
// 한쪽에서만 변화를 걸면 다른 화면에서 그 변화를 지울 방법이 없다.
const CHANGEABLE_FACT_LABELS = new Set(['상태', '시간', '고정 소품'])

const referenceImageBase64 = async (value = '') => {
  const embedded = stripDataUrl(value)
  if (embedded) return embedded
  if (!value.startsWith('/')) return ''

  try {
    const response = await fetch(value)
    if (!response.ok) return ''
    const blob = await response.blob()
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return stripDataUrl(String(dataUrl || ''))
  } catch {
    return ''
  }
}

// 표현 밀도 선택기. 컷 플랜(레퍼런스)과 Panels(패널) 양쪽에 같은 것이 뜬다 —
// 값이 하나이므로 어디서 고르든 같은 결정이다.
//
// 그림으로 고른다. 러프/디테일/실사의 차이는 글로 적어도 잘 전달되지 않고,
// 실제로 앵커 그림이 생성에 물리므로 고르는 자리에서도 그 그림을 보여야 한다.
// noteOf: 이 표현 방식을 고르면 무엇을 해야 하는지. Panel setup에서만 쓴다 —
// 고르기 전에 대가가 보여야 감독이 비교하고 고를 수 있다. 다른 자리에서는
// 이미 정해진 화풍을 바꾸는 것뿐이라 안내가 필요 없다.
function StylePresetPicker({ value, onChange, disabled = false, layout = 'row', noteOf = null }) {
  return (
    <div className={`style-preset-picker is-${layout}`} role="radiogroup" aria-label="표현 스타일">
      {PANEL_STYLE_PRESETS.map((preset) => {
        const note = noteOf ? noteOf(preset) : ''
        return (
          <button
            type="button"
            key={preset.id}
            role="radio"
            aria-checked={value === preset.id}
            className={value === preset.id ? 'is-active' : ''}
            disabled={disabled}
            onClick={() => onChange(preset.id)}
          >
            <img src={preset.image} alt="" />
            <span>{preset.label}</span>
            {note && <em className="style-preset-note">{note}</em>}
          </button>
        )
      })}
    </div>
  )
}

function SceneFactRow({
  fact, onCommit, cutOptions = [], onAddChange, onRemoveChange,
  // 인물 항목만 쓴다. 이 씬에서만 달라지게 하거나, 기준으로 되돌린다.
  onScopedCommit = null, onRevert = null,
}) {
  // 데이터 키는 기존 `상태`를 유지한다. 변화 구간과 프롬프트가 이 키를
  // 참조하므로, 화면에서만 현재 시점의 값이라는 뜻을 분명히 한다.
  const displayLabel = fact.label === '상태' ? '현재 상태' : fact.label
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
  // 씬 안에서 변할 수 있는 항목만. 생김새(성별·나이·외형)는 사람이
  // 바뀌지 않는 한 그대로다 — 항목마다 버튼을 달면 화면이 복잡해진다.
  const canChange = Boolean(onAddChange)
    && cutOptions.length > 0
    && CHANGEABLE_FACT_LABELS.has(fact.label)

  const addChange = () => {
    // 아직 변화가 없는 첫 컷을 고른다. 같은 컷에 두 번 얹을 수 없다.
    const used = new Set(changes.map((change) => change.cutId))
    const open = cutOptions.find((option) => !used.has(option.cutId))
    if (open) onAddChange(open.cutId, '')
  }

  return (
    <div className="rail-scene-fact-block">
      <label className={`rail-scene-fact${fact.open ? ' is-open' : ''}`}>
        <span>{displayLabel}</span>
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
            aria-label={`${displayLabel} 변화 추가`}
          >
            +
          </button>
        )}
      </label>

      {/* 인물 기준은 작품에 한 벌이다. 이 씬에서만 달라지게 할 수도 있고,
          달라진 것은 기준으로 되돌릴 수 있다. 어느 쪽인지 보이지 않으면
          값을 고쳤을 때 다른 씬까지 바뀌는 것을 모른다. */}
      {(onScopedCommit || fact.overridden) && (
        <div className="rail-scene-fact-scope">
          {fact.overridden ? (
            <>
              <span className="rail-scene-fact-badge">이 씬에서 변경</span>
              {onRevert && (
                <button type="button" onClick={() => onRevert()} title="작품 기준값으로 되돌립니다">
                  ↺ 기준으로
                </button>
              )}
            </>
          ) : (
            draft.trim() !== (fact.value || '') && onScopedCommit && (
              <button
                type="button"
                onClick={() => onScopedCommit(draft.trim())}
                title="다른 씬은 그대로 두고 이 씬에서만 바꿉니다"
              >
                이 씬에서만 변경
              </button>
            )
          )}
        </div>
      )}

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
  onRequestInsert, insertPending, insertProposal, insertError, onAcceptInsert, onRejectInsert,
  onApplyEdit,
  cutLabelOf,
}) {
  if (findings.length === 0) {
    return <p className="rail-coverage-clear">{emptyLabel}</p>
  }

  // 좁은 층위부터 넓은 층위로 읽힌다 (속성 → 컷 구성 → 컷 관계 → 씬 구조).
  // 규칙이 발견한 순서대로 두면 층위가 뒤섞여, 어느 자리에서 고쳐야 하는지가
  // 목록에서 드러나지 않는다 (design_goal.md DG2). 여기서 정렬하면
  // DiagnosisList를 쓰는 모든 에이전트가 같은 순서를 갖는다.
  //
  // 같은 층위 안에서는 원래 순서를 지킨다 — 규칙이 컷 순서대로 찾으므로
  // 그것이 곧 화면에 나오는 순서다.
  const ordered = [...findings].sort((a, b) => (
    layerRank(a.layer) - layerRank(b.layer)
  ))

  return (
    <ul className="rail-coverage">
      {ordered.map((finding) => {
        const layer = PROBLEM_LAYERS[finding.layer]
        // 샷 크기로 풀리는 진단만 촬영에 물을 수 있다. 컷을 나누거나
        // 합쳐야 하는 것은 층위가 다르다.
        const changed = Boolean(finding.changed)
        const canFix = !changed && Boolean(onRequestFix) && SHOT_FIXABLE.has(finding.type)
        const canInsert = !changed && Boolean(onRequestInsert) && CUT_INSERTABLE.has(finding.type)
        const canApplyEdit = !changed && Boolean(onApplyEdit) && ['split', 'merge', 'delete'].includes(finding.operation)
        const proposal = fixProposal?.findingId === finding.id ? fixProposal : null
        const insertion = insertProposal?.findingId === finding.id ? insertProposal : null
        const cutLabel = cutLabelOf?.(finding)
        return (
          <li key={finding.id} className={changed ? 'is-changed' : ''}>
            {/* 카드 전체가 그 컷으로 가는 길이다. `표에서 보기` 버튼을
                따로 두면 지적을 읽고 나서 누를 것을 한 번 더 찾아야 한다 —
                지적은 언제나 어느 컷의 이야기이므로 데려다주는 것이 기본
                동작이다. 실제 수정(수정본 받기)만 버튼으로 남는다. */}
            <button
              type="button"
              className="rail-coverage-open"
              onClick={() => onGoTo(finding)}
            >
              {layer && (
                <span className={`rail-layer-tag layer-${finding.layer}`} title={layer.hint}>
                  {layer.label}
                </span>
              )}
              {/* 어느 컷의 이야기인지 적는다. 표에서 하이라이트되기는 하지만
                  카드만 읽고는 알 수 없고, 지적이 여럿이면 어느 것이 어느
                  컷인지 목록에서 구분되지 않는다. */}
              {cutLabel && <span className="rail-coverage-cut">{cutLabel}</span>}
              {changed && <span className="rail-coverage-changed">수정됨 · 재점검 필요</span>}
              <strong>{finding.title}</strong>
              <p>{finding.suggestedAction || finding.detail}</p>
            </button>
            {canFix && (
              <div className="rail-fix-actions">
                <button
                  type="button"
                  onClick={() => onRequestFix(finding)}
                  disabled={fixPending === finding.id}
                >
                  {fixPending === finding.id ? '촬영에 묻는 중…' : '수정본 받기'}
                </button>
              </div>
            )}

            {canInsert && (
              <div className="rail-fix-actions">
                <button
                  type="button"
                  onClick={() => onRequestInsert(finding)}
                  disabled={insertPending === finding.id}
                >
                  {insertPending === finding.id ? '편집에 묻는 중…' : '넣을 컷 받기'}
                </button>
              </div>
            )}
            {canApplyEdit && (
              <div className="rail-fix-actions">
                <button type="button" onClick={() => onApplyEdit(finding)}>
                  {finding.operation === 'split' ? '나누기' : finding.operation === 'merge' ? '합치기' : '삭제'}
                </button>
              </div>
            )}

            {canFix && fixError && fixPending !== finding.id && !proposal && (
              <p className="rail-fix-error">{fixError}</p>
            )}

            {canInsert && insertError && insertPending !== finding.id && !insertion && (
              <p className="rail-fix-error">{insertError}</p>
            )}

            {/* 서사가 쓴 줄을 여기서 보인다. 수락하면 대본과 컷에 함께
                들어간다 — 대본에만 넣으면 컷이 비고, 컷에만 넣으면 그
                컷이 근거로 삼을 줄이 없다. */}
            {insertion && (
              <div className="rail-fix">
                <ul className="rail-fix-edits">
                  <li>
                    <div className="rail-fix-change">
                      <strong>더할 단계</strong>
                      <span>대본 + 컷</span>
                    </div>
                    <p>{insertion.text}</p>
                    {insertion.reason && <p className="rail-fix-why">{insertion.reason}</p>}
                  </li>
                </ul>
                <div className="rail-fix-actions">
                  <button type="button" onClick={onAcceptInsert}>수락</button>
                  <button type="button" className="ghost" onClick={onRejectInsert}>거부</button>
                </div>
              </div>
            )}

            {/* 수락해야 표에 들어간다. 무엇이 어떻게 바뀌는지 먼저 보인다.
                summary는 두지 않는다 — 아래 각 컷의 reason과 같은 말을
                한 번 더 하게 된다. 처방이 한 컷이면 완전히 겹치고, 여러
                컷이어도 reason이 컷마다 짚어주므로 그쪽이 쓸모 있다. */}
            {proposal && (
              <div className="rail-fix">
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
  showTypeControl = true, autoFocus, focusCaret, onFocused, onMoveFocus, flagged, filled,
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
      {showTools && showTypeControl && (
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
        className={`script-line-input sb-script-${element.type}${filled ? ' is-filled' : ''}${flagged ? ' is-flagged' : ''}`}
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

// [사용하지 않음 — 2026-08-26] Panels의 오른쪽 패널이었다.
//
// 콘티 표가 샷·앵글·길이를 열로 갖고 설명을 그 자리에서 고치게 되면서
// 이 패널이 할 일이 없어졌다. 컷 하나를 열어 보는 것보다 표에서 컷들이
// 어떻게 흘러가는지 보는 편이 낫고, 오른쪽을 비우면 설명 칸이 그만큼
// 넓어진다. 책임 선언(DG1 P3)은 표의 `이미지가 정할 것`으로 옮겼다.
//
// 지우지 않고 남겨 둔 이유: 프롬프트 원문 편집(`promptOverride`)이
// 여기에만 있었다. 설명을 고치고 다시 그리는 흐름으로 갈음했지만,
// 조립된 문장을 직접 손봐야 하는 경우가 남는지 아직 모른다.
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
            무엇을 그림에서 정하고 무엇을 촬영에 넘길지 가릅니다.
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
    'split-beat': '여기서 구간 나누기',
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

export default function StoryboardView({ onEnterReview = null }) {
  const screenplay = useStore((s) => s.screenplay)
  const setScreenplay = useStore((s) => s.setScreenplay)
  const sceneIntention = useStore((s) => s.sceneIntention)
  const setSceneIntention = useStore((s) => s.setSceneIntention)
  const splitBeat = useStore((s) => s.splitBeat)
  const mergeCuts = useStore((s) => s.mergeCuts)
  const mergeBeat = useStore((s) => s.mergeBeat)
  const scene = useStore((s) => s.scenes[s.activeScene])
  const setActiveShot = useStore((s) => s.setActiveShot)
  const setFlowActiveShot = useStore((s) => s.setFlowActiveShot)
  const setActiveBeat = useStore((s) => s.setActiveBeat)
  const selectBeat = useStore((s) => s.selectBeat)
  const activeBeat = useStore((s) => s.activeBeat)
  const removeShot = useStore((s) => s.flowRemoveShot)
  const updateSeam = useStore((s) => s.updateSeam)
  const maximizedPanel = useStore((s) => s.maximizedPanel)
  const storyboardPanelsVisible = useStore((s) => s.storyboardPanelsVisible)
  const setCenterTab = useStore((s) => s.setCenterTab)
  const setMaximizedPanel = useStore((s) => s.setMaximizedPanel)
  const drawingWorkspaceOpen = useStore((s) => s.drawingWorkspaceOpen)
  const openDrawingWorkspace = useStore((s) => s.openDrawingWorkspace)
  // 예시 대본 세션이면 확정 뒤 자동 생성을 건너뛴다.
  const autoDraftDisabled = useStore((s) => s.autoDraftDisabled)
  const setSelectedShotIds = useStore((s) => s.setSelectedStoryboardShotIds)
  const setPanelDraftImage = useStore((s) => s.setPanelDraftImage)
  const clearPanelDraftImage = useStore((s) => s.clearPanelDraftImage)
  const panelGenPending = useStore((s) => s.panelGenerationPending)
  const setPanelGenPending = useStore((s) => s.setPanelGenerationPending)
  const scriptEditorRequestKey = useStore((s) => s.scriptEditorRequestKey)
  const narrativeSuggestions = useStore((s) => s.narrativeSuggestions)
  const requestNarrativeSuggestions = useStore((s) => s.requestNarrativeSuggestions)
  const requestNarrativeCheck = useStore((s) => s.requestNarrativeCheck)
  const narrativeCheck = useStore((s) => s.narrativeCheck)
  const resolvedNarrativeFindingIds = useStore((s) => s.resolvedNarrativeFindingIds)
  const pendingSuggestionFindingId = useStore((s) => s.pendingSuggestionFindingId)
  const resolveNarrativeFinding = useStore((s) => s.resolveNarrativeFinding)
  // 지금 펼쳐 둔 지적. 누른 것만 대본에 표시된다.
  const [openFindingId, setOpenFindingId] = useState(null)
  // 패널을 격자로 모아 본다. 컷 하나씩만 보면 이어지는지 알 수 없다 —
  // 스토리보드는 한 장을 잘 그리는 일이 아니라 이어지는 것을 보는 일이라
  // 이 쪽이 기본이다. 대본과 나란히 보려면 버튼으로 돌아간다.
  const [panelGridView, setPanelGridView] = useState(true)
  // Panels의 한눈에 보기에서도 컷 사이를 직접 조작한다. 검토 화면까지
  // 가야만 이음새를 만들 수 있으면, 패널을 배열하는 단계에서 관계를
  // 결정할 수 없다.
  const [openPanelSeamId, setOpenPanelSeamId] = useState(null)
  const [pendingPanelEdit, setPendingPanelEdit] = useState(null)
  // Panels에서 구조를 바꾼 직후에는 되돌릴 길을 남긴다. 합치기·삭제는
  // 여러 컷과 이음새를 함께 바꾸므로 단순히 화면만 되돌려서는 안 된다.
  const [lastPanelStructureChange, setLastPanelStructureChange] = useState(null)
  const [aiInsertPendingCutId, setAiInsertPendingCutId] = useState(null)
  const [aiInsertCandidatesMap, setAiInsertCandidatesMap] = useState({})
  const [aiInsertErrorMap, setAiInsertErrorMap] = useState({})

  const handleRequestAiInsert = async (cutItem) => {
    if (!cutItem) return
    setAiInsertPendingCutId(cutItem.id)
    setAiInsertErrorMap((prev) => ({ ...prev, [cutItem.id]: null }))
    try {
      const { suggestSeamInsert } = await import('../services/api')

      // 1. 대본 전체 (씬 헤딩 + 대본 내용 포함)
      const scriptText = screenplay
        .map((el) => (el.type === 'scene-heading' ? `[장면] ${el.text}` : el.text))
        .filter(Boolean)
        .join('\n')

      // 2. cutPlan 상에서 현재 컷(cutItem)의 정확한 위치 파악
      const cutIndex = cutPlan.findIndex((item) => item.id === cutItem.id)
      const prevCut = cutIndex > 0 ? cutPlan[cutIndex - 1] : null
      const nextCut = cutIndex >= 0 && cutIndex < cutPlan.length - 1 ? cutPlan[cutIndex + 1] : null

      // 3. 앞/뒤 샷 (이미지 및 패널 정보)
      const prevShot = prevCut ? flowShots.find((s) => s.cutPlanItemId === prevCut.id) : null
      const nextShot = nextCut ? flowShots.find((s) => s.cutPlanItemId === nextCut.id) : null

      // 4. 이음새(생략된 정보)
      const seam = prevShot ? seams[seamKeyFor(prevShot.id)] : null

      // 5. 컷의 풍부한 상세 정보(샷 크기, 앵글, 장소, 인물, 내용 등) 조립
      const getCutDescription = (cItem) => {
        if (!cItem) return ''
        const infoParts = []
        if (cItem.shotSize) infoParts.push(cItem.shotSize)
        if (cItem.angle && cItem.angle !== 'Eye level') infoParts.push(cItem.angle)
        if (cItem.place) infoParts.push(cItem.place)
        if (cItem.characters) infoParts.push(`인물: ${cItem.characters}`)

        const mainText = cItem.promptOverride?.trim() || cItem.content?.trim() || ''
        const prefix = infoParts.length ? `[${infoParts.join(' · ')}] ` : ''
        return `${prefix}${mainText}`.trim()
      }

      const beforeContent = getCutDescription(prevCut)
      const afterContent = getCutDescription(nextCut)

      const candidates = await suggestSeamInsert({
        beforeContent: beforeContent || (prevCut ? '앞 컷 내용 미정' : '첫 컷 전 (없음)'),
        beforePurpose: prevCut?.purpose || '',
        afterContent: afterContent || (nextCut ? '뒤 컷 내용 미정' : '마지막 컷 뒤 (없음)'),
        afterPurpose: nextCut?.purpose || '',
        elision: seam?.elision || '',
        script: scriptText,
        beforeImage: prevShot?.image || null,
        afterImage: nextShot?.image || null,
      })
      setAiInsertCandidatesMap((prev) => ({ ...prev, [cutItem.id]: candidates }))
    } catch (error) {
      setAiInsertErrorMap((prev) => ({ ...prev, [cutItem.id]: error.message || 'AI 제안을 불러오지 못했습니다.' }))
    } finally {
      setAiInsertPendingCutId(null)
    }
  }

  // 나눈 두 컷의 문장을 채운다. 나누기는 앞 칸에 원본을 그대로 두고
  // 시작하므로, 어디서 끊을지 막막하면 이걸로 묻는다. 앞뒤 컷을 함께
  // 보내는 이유는 어디서 끊는 것이 자연스러운지가 이웃에 달려 있기
  // 때문이다.
  const handleSplitSuggestion = async (cutItem, shot, shotIdx) => {
    if (!cutItem) return
    // 나눈 짝을 찾는다. 나누기가 만든 뒤 컷은 바로 다음 칸이다.
    const partnerShot = flowShots[shotIdx + 1]
    const partnerCut = partnerShot
      ? cutPlan.find((item) => item.id === partnerShot.cutPlanItemId)
      : null
    setAiInsertPendingCutId(cutItem.id)
    setAiInsertErrorMap((prev) => ({ ...prev, [cutItem.id]: null }))
    try {
      const { suggestSeamSplit } = await import('../services/api')
      const cutAt = cutPlan.findIndex((item) => item.id === cutItem.id)
      const scriptText = screenplay
        .filter((element) => element.type === 'action')
        .map((element) => element.text)
        .join('\n')
      const result = await suggestSeamSplit({
        content: cutItem.content || '',
        purpose: cutItem.purpose || '',
        characters: cutItem.characters || '',
        beforeContent: cutAt > 0 ? cutPlan[cutAt - 1]?.content || '' : '',
        // 바로 뒤는 방금 나눠 만든 빈 컷이므로 그 다음 컷을 보낸다.
        afterContent: cutPlan[cutAt + 2]?.content || '',
        script: scriptText,
        beforeImage: getShotVisual(flowShots[shotIdx - 1]),
        afterImage: getShotVisual(flowShots[shotIdx + 2]),
      })
      if (result?.first?.content?.trim()) {
        updateCutPlanItem(cutItem.id, { content: result.first.content.trim() })
      }
      if (partnerCut && result?.second?.content?.trim()) {
        updateCutPlanItem(partnerCut.id, { content: result.second.content.trim() })
      }
    } catch (error) {
      setAiInsertErrorMap((prev) => ({
        ...prev,
        [cutItem.id]: error.message || 'AI 제안을 불러오지 못했습니다.',
      }))
    } finally {
      setAiInsertPendingCutId(null)
    }
  }

  // 합친 컷의 문장을 다듬는다. 합치기가 만든 초안은 두 문장을 **이어붙인**
  // 것이라 같은 동작을 두 번 말하고 있을 수 있다. 자동으로 바꾸지 않고
  // 감독이 물을 때만 바꾸는 이유는, 손대던 문장이 예고 없이 사라지면
  // 안 되기 때문이다.
  const handleTidyMergedContent = async (cutItem, shot) => {
    const source = shot?.mergedDraft
    if (!cutItem || !source) return
    setAiInsertPendingCutId(cutItem.id)
    setAiInsertErrorMap((prev) => ({ ...prev, [cutItem.id]: null }))
    try {
      const { suggestSeamMerge } = await import('../services/api')
      const scriptText = screenplay
        .filter((element) => element.type === 'action')
        .map((element) => element.text)
        .join('\n')
      const result = await suggestSeamMerge({ ...source, script: scriptText })
      if (result?.content?.trim()) {
        updateCutPlanItem(cutItem.id, { content: result.content.trim() })
      }
    } catch (error) {
      setAiInsertErrorMap((prev) => ({
        ...prev,
        [cutItem.id]: error.message || 'AI 제안을 불러오지 못했습니다.',
      }))
    } finally {
      setAiInsertPendingCutId(null)
    }
  }
  const narrativeCheckPending = useStore((s) => s.narrativeCheckPending)
  const narrativeCheckError = useStore((s) => s.narrativeCheckError)
  const narrativeCheckStale = useStore((s) => s.narrativeCheckStale)
  const dismissNarrativeSuggestion = useStore((s) => s.dismissNarrativeSuggestion)
  const updateFlowShotById = useStore((s) => s.updateFlowShotById)
  const setPendingCanvasImage = useStore((s) => s.setPendingCanvasImage)
  const cutPlan = useStore((s) => s.cutPlan)
  const cutPlanAccepted = useStore((s) => s.cutPlanAccepted)
  const panelPreparationComplete = useStore((s) => s.panelPreparationComplete)
  const cutPlanSkipped = useStore((s) => s.cutPlanSkipped)
  const reopenCutPlan = useStore((s) => s.reopenCutPlan)
  const completePanelPreparation = useStore((s) => s.completePanelPreparation)
  const reopenPanelPreparation = useStore((s) => s.reopenPanelPreparation)
  const viewerFindingHandoff = useStore((s) => s.viewerFindingHandoff)
  const clearViewerFindingHandoff = useStore((s) => s.clearViewerFindingHandoff)
  const cutStage = useStore(selectCutStage)
  // 책임 범위 선언 (DG1 P3)
  const declarations = useStore((s) => s.declarations)
  const decideDeclaration = useStore((s) => s.decideDeclaration)
  const rejectDeclaration = useStore((s) => s.rejectDeclaration)
  // 씬 기준은 씬마다 다르다. 컷이 속한 씬의 기준을 써야 한다 —
  // 복도 컷에 실험실의 인물 기준을 넣으면 없는 사람을 그리게 된다.
  const sceneStates = useStore(selectSceneStates)
  // rail이 편집하는 것은 지금 보고 있는 씬의 기준이다. activeBeat에서
  // 파생되므로 Beat를 옮기면 기준도 따라온다.
  const activeSceneState = useStore(selectActiveSceneState)
  const seams = useStore((s) => s.seams)
  const setSceneFact = useStore((s) => s.setSceneFact)
  const clearCharacterOverride = useStore((s) => s.clearCharacterOverride)
  const addFactChange = useStore((s) => s.addFactChange)
  const spatialElements = useStore((s) => s.spatialElements)
  const removeFactChange = useStore((s) => s.removeFactChange)
  const activeSceneId = useStore(selectActiveSceneId)
  const requestSceneStates = useStore((s) => s.requestSceneStates)
  const sceneStatePending = useStore((s) => s.sceneStatePending)
  const sceneStateError = useStore((s) => s.sceneStateError)
  const requestReferenceImage = useStore((s) => s.requestReferenceImage)
  const referenceImagePending = useStore((s) => s.referenceImagePending)
  const isReferenceImagePending = (kind, subjectId = null) => (
    Boolean(referenceImagePending?.[referencePendingKey(activeSceneId, kind, subjectId)])
  )
  const setShotNote = useStore((s) => s.setShotNote)
  const deleteCut = useStore((s) => s.deleteCut)
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
  const scenePromptNote = useStore((s) => s.scenePromptNote)
  const setScenePromptNote = useStore((s) => s.setScenePromptNote)
  const panelImageModel = useStore((s) => s.panelImageModel)
  const setPanelImageModel = useStore((s) => s.setPanelImageModel)
  const panelStylePreset = useStore((s) => s.panelStylePreset)
  const setPanelStylePreset = useStore((s) => s.setPanelStylePreset)
  // Pro는 선택지에서 제외했다. 열려 있던 화면에 그 값이 남아 있어도 다음
  // 생성이 실패하거나 빈 select가 되지 않도록 기본 모델로 돌린다.
  useEffect(() => {
    if (panelImageModel === 'flux-2-pro') setPanelImageModel('gpt-image-1')
  }, [panelImageModel, setPanelImageModel])
  const requestCutPlan = useStore((s) => s.requestCutPlan)
  const cutPlanPending = useStore((s) => s.cutPlanPending)
  const cutPlanRunPending = useStore((s) => s.cutPlanRunPending)
  const cutPlanError = useStore((s) => s.cutPlanError)
  const requestCameraCheck = useStore((s) => s.requestCameraCheck)
  const cameraCheck = useStore((s) => s.cameraCheck)
  const cameraCheckPending = useStore((s) => s.cameraCheckPending)
  const cameraCheckError = useStore((s) => s.cameraCheckError)
  const requestMiseCheck = useStore((s) => s.requestMiseCheck)
  const miseCheck = useStore((s) => s.miseCheck)
  const miseCheckPending = useStore((s) => s.miseCheckPending)
  const miseCheckError = useStore((s) => s.miseCheckError)
  const updateCutPlanItem = useStore((s) => s.updateCutPlanItem)
  // Panels 단계의 이음새에서만 직접 새 컷을 넣을 수 있다. 컷 플랜 표는
  // 내용 수정과 삭제만 제공한다.
  const addCutPlanItem = useStore((s) => s.addCutPlanItem)
  const removeCutPlanItem = useStore((s) => s.removeCutPlanItem)
  const acceptCutPlan = useStore((s) => s.acceptCutPlan)

  const [isEditingRaw, setIsEditingRaw] = useState(false)
  const [rawText, setRawText] = useState('')
  const [rawSceneIntention, setRawSceneIntention] = useState('')
  // 장면 전체 지시는 컷 플랜을 확인한 뒤 적용한다. 입력 중인 문장이
  // 이미 생성된 패널의 기준처럼 보이지 않도록 초안과 적용 값을 분리한다.
  const [scenePromptNoteDraft, setScenePromptNoteDraft] = useState(scenePromptNote)
  // 기본은 접힘. 컷 플랜은 컷 수와 순서를 정하는 화면인데 입력칸이 표 위에
  // 서 있으면 그것부터 채우게 된다. 필요할 때 열어서 쓴다.
  const [sceneNoteOpen, setSceneNoteOpen] = useState(false)
  const [narrativeRequest, setNarrativeRequest] = useState('')
  const narrativeRequestRecall = useRequestHistory({
    historyKey: 'narrative',
    setValue: setNarrativeRequest,
  })
  // Script에서는 Narrative가 다음 단계를 안내한다. Cut plan에서는 표가 주 작업
  // 공간이므로 Agents rail과 개별 에이전트를 기본으로 접어 둔다. 단계별 상태를
  // 따로 보존해 Script로 돌아왔을 때 사용자가 정한 접힘 상태도 유지한다.
  const [narrativeRailByStage, setNarrativeRailByStage] = useState({
    script: true,
    cutplan: true,
    preparation: true,
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
    preparation: 'mise',
  })
  const openAgent = openAgentByStage[cutStage] ?? null
  const setOpenAgent = (nextAgent) => setOpenAgentByStage((current) => ({
    ...current,
    [cutStage]: nextAgent,
  }))
  // 컷 플랜마다 문제 있는 에이전트 하나만 먼저 연다. 사용자가 닫거나 다른
  // 에이전트를 고른 뒤 다시 빼앗지 않도록 플랜 단위로 한 번만 실행한다.
  const autoOpenedCutPlanAgentKey = useRef(null)
  // 줄 종류·삭제 버튼은 Beat 단위로 켠다. 평소엔 대본만 보이게 한다.
  const [editingBeat, setEditingBeat] = useState(null)
  // Enter나 화살표로 옮겨갈 줄. { index, caret } 형태.
  const [pendingFocus, setPendingFocus] = useState(null)
  // 접어둔 컷 플랜 Beat 번호.
  const [collapsedCutBeats, setCollapsedCutBeats] = useState([])
  // 씬 접기. Beat와 별개 축이다 — 씬을 접으면 그 안의 Beat가 전부 숨는다.
  const [collapsedScenes, setCollapsedScenes] = useState([])
  // 프롬프트를 펼쳐 본 컷. 한 번에 하나만 연다.
  // 표에서 고른 컷. 편집 렌즈가 이 컷을 나누거나 합친다.
  const [selectedCutId, setSelectedCutId] = useState(null)
  // 표에서 직접 고른 것인지, 진단이 짚어 보낸 것인지. 나누기·합치기는
  // 앞의 경우에만 낸다 — 진단을 읽는 중에 컷 구성을 바꾸는 버튼이 함께
  // 뜨면, 그 진단이 시키는 일로 읽힌다.
  const [cutSelectedFromTable, setCutSelectedFromTable] = useState(false)
  // Panels 단계에서 인스펙터에 띄운 패널.
  const [inspectedShotId, setInspectedShotId] = useState(null)
  // 화살표를 그리는 중인 패널. 한 번에 하나만 그린다.
  const [arrowDrawingShotId, setArrowDrawingShotId] = useState(null)
  // 새 화살표는 방향을 그린 뒤 이동 종류를 고를 때까지 확정하지 않는다.
  const [pendingArrow, setPendingArrow] = useState(null)
  const [selectedArrow, setSelectedArrow] = useState(null)
  const [noteEditingShotId, setNoteEditingShotId] = useState(null)
  const [panelCandidates, setPanelCandidates] = useState({})
  const [openReferenceCards, setOpenReferenceCards] = useState({})
  // 레퍼런스는 기본적으로 AI가 읽은 요약만 보여 준다. 각 항목을 늘 입력칸으로
  // 열어 두면 사용자는 전부 확인해야 한다고 느낀다. 고칠 때만 편집을 연다.
  const [editingReferenceCards, setEditingReferenceCards] = useState({})
  const [referenceLightbox, setReferenceLightbox] = useState(null)
  const [panelGenError, setPanelGenError] = useState(null)

  const generatingCount = Object.keys(panelGenPending).length
  const isGenerating = generatingCount > 0
  const handledScriptEditorRequestKey = useRef(0)
  const handledPanelToolRequestId = useRef(null)
  // 패널 생성 함수의 최신 참조. 아래 도구 요청 effect가 이것으로 부른다 —
  // 함수 자체를 의존성에 넣으면 렌더마다 effect가 다시 돈다.
  const generatePanelsRef = useRef(null)

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
  const isPanelPreparationStage = cutStage === 'preparation' && isExpanded && !drawingWorkspaceOpen && !showWriteScene
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

  const capturePanelStructure = (label, kind) => {
    const state = useStore.getState()
    setLastPanelStructureChange({
      label, kind,
      snapshot: {
        cutPlan: state.cutPlan,
        scenes: state.scenes,
        seams: state.seams,
        panelDraftImages: state.panelDraftImages,
        panelToolRequest: state.panelToolRequest,
      },
    })
  }

  const undoPanelStructureChange = () => {
    const snapshot = lastPanelStructureChange?.snapshot
    if (!snapshot) return
    useStore.setState(snapshot)
    setLastPanelStructureChange(null)
    setPendingPanelEdit(null)
    setOpenPanelSeamId(null)
  }

  const mergePanelCuts = (cutId, shotIdx) => {
    if (!cutId) return
    capturePanelStructure('두 패널을 합쳤습니다.', 'merge')
    mergeCuts(cutId, { draft: true })
    setFlowActiveShot(shotIdx)
    setOpenPanelSeamId(null)
  }

  const confirmPanelEdit = () => {
    if (!pendingPanelEdit) return
    const { kind, shot, cutId } = pendingPanelEdit
    if (kind === 'delete') {
      capturePanelStructure('패널을 삭제했습니다.', 'delete')
      deleteCut(cutId, shot?.id)
    }
    setPendingPanelEdit(null)
    setOpenPanelSeamId((current) => current === shot?.id ? null : current)
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

  // 컷 플랜이 처음 만들어지면 점검을 한 번 돌린다. 버튼을 눌러야만 오면
  // 감독은 규칙 진단만 보고 다음 단계로 넘어가게 되고, AI가 짚어줄 수 있는
  // 것은 누르지 않는 한 영영 나오지 않는다.
  //
  // 컷을 고칠 때마다 다시 부르지는 않는다 — 표를 만질 때마다 AI를 호출하면
  // 느리고, 고치는 도중에 목록이 계속 바뀌면 무엇을 보고 있었는지 잃는다.
  // 다시 보는 것은 버튼(`다시 점검`)이 맡는다.
  //
  // 첫 컷의 id로 어느 플랜을 봤는지 기억한다. `다시 나누기`로 플랜을 새로
  // 뽑으면 id가 바뀌므로 그 플랜은 다시 한 번 점검한다. 컷을 나누거나
  // 합치는 것으로는 첫 컷의 id가 바뀌지 않아 다시 부르지 않는다.
  const autoCheckedPlanKey = useRef(null)
  useEffect(() => {
    if (cutStage !== 'cutplan' || cutPlan.length === 0 || narrativeCheckPending) return
    const planKey = cutPlan[0].id
    if (autoCheckedPlanKey.current === planKey) return
    autoCheckedPlanKey.current = planKey
    requestNarrativeCheck('cutplan')
  }, [cutStage, cutPlan, narrativeCheckPending, requestNarrativeCheck])

  // 컷 플랜을 확정하면 초안을 바로 그린다. 확정한 뒤 `Generate`를 한 번 더
  // 눌러야 하면 한 동작이 둘로 나뉜다 — 감독이 정한 것은 "이 구성으로
  // 간다"이고, 그 다음에 볼 것은 그림이다.
  //
  // 한 번만 돈다. 그린 뒤 패널을 지우거나 컷을 넣어 빈 자리가 생겨도 다시
  // 돌지 않는다 — 그때부터는 감독이 무엇을 다시 그릴지 정한다.
  const autoDraftedPlanKey = useRef(null)
  useEffect(() => {
    // 예시 대본으로 시작한 세션은 그림이 이미 붙어 있다. 확정만으로 생성이
    // 돌면 개발·데모 중에 원치 않는 호출이 나간다.
    if (autoDraftDisabled) return
    if (cutStage !== 'panels' || flowShots.length === 0) return
    const planKey = cutPlan[0]?.id
    if (!planKey || autoDraftedPlanKey.current === planKey) return
    const blanks = flowShots
      .map((shot, shotIdx) => ({ shot, shotIdx }))
      .filter(({ shot }) => !shot.image)
    if (blanks.length === 0) return
    autoDraftedPlanKey.current = planKey
    // 앞에서부터 AUTO_DRAFT_LIMIT장까지만 그린다. 스무 컷을 한 번에 그리면
    // 확정을 누른 뒤 십 분 가까이 아무것도 판정할 수 없다 — 초안은 검토를
    // 시작할 만큼만 있으면 되고, 나머지는 감독이 필요할 때 이어 그린다.
    generatePanelsRef.current?.(blanks.slice(0, AUTO_DRAFT_LIMIT), { autoAccept: true })
  }, [cutStage, flowShots, cutPlan, autoDraftDisabled])

  // 촬영 점검은 샷이 모두 정해진 뒤에만 한 번 돌린다. 컷 플랜이 막
  // 만들어진 순간에는 아직 크기가 비어 있으므로, 그때 점검하면 근거 없는
  // 결과가 굳는다. 이후 표를 고치는 동안에는 자동 재호출하지 않고 버튼으로
  // 다시 보게 한다.
  const autoCameraCheckedPlanKey = useRef(null)
  useEffect(() => {
    if (cutStage !== 'cutplan' || cutPlan.length === 0 || undecidedShots > 0) return
    const planKey = cutPlan[0].id
    if (autoCameraCheckedPlanKey.current === planKey) return
    autoCameraCheckedPlanKey.current = planKey
    requestCameraCheck()
  }, [cutStage, cutPlan, undecidedShots, requestCameraCheck])

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
    } else if (panelToolRequest.tool === 'regenerate') {
      // 검토 화면에서 컷 값을 바꾼 뒤 그림을 다시 그리는 길. 생성에 필요한
      // 것(레퍼런스·구조도·그림체)이 전부 이 화면에 있어 여기서 부른다.
      // ref로 부르는 이유: 이 함수는 렌더마다 새로 만들어져 의존성에 넣으면
      // effect가 매번 다시 돈다.
      setArrowDrawingShotId(null)
      setNoteEditingShotId(null)
      // 구조 변경 전에 만든 후보가 남아 있으면 새 생성이 시작돼도 잠시 옛
      // 그림이 보인다. 특히 병합에서는 첫 컷만 그린 후보가 합쳐진 컷의 그림처럼
      // 보이므로, 요청을 받는 순간 이전 후보와 공유 초안을 함께 비운다.
      setPanelCandidates((current) => {
        const next = { ...current }
        delete next[shot.id]
        return next
      })
      clearPanelDraftImage(shot.id)
      // 분할은 두 컷을 다 그린다 — 앞 컷은 내용이 줄었고 뒤 컷은 그림이 없다.
      // 순서대로 그려야 뒤 컷이 앞 컷의 새 그림을 이웃으로 물릴 수 있다.
      const targets = (panelToolRequest.shotIds || [panelToolRequest.shotId])
        .map((id) => {
          const idx = flowShots.findIndex((entry) => entry.id === id)
          return idx < 0 ? null : { shot: flowShots[idx], shotIdx: idx }
        })
        .filter(Boolean)
      generatePanelsRef.current?.(
        targets.length > 0 ? targets : [{ shot, shotIdx: shotIndex }],
        {
          includeExisting: true,
          keepView: true,
          statusLabel: panelToolRequest.reason === 'merge'
            ? '합친 내용으로 생성 중…'
            : panelToolRequest.reason === 'insert'
              ? '삽입한 컷 생성 중…'
              : panelToolRequest.reason === 'split'
                ? '나눈 두 컷 생성 중…'
                : '새 이미지 생성 중…',
          // 값 하나를 바꿔 다시 그리는 경우에만 채워 온다. 합치기·삽입은
          // 내용 자체가 달라지는 일이라 지금 그림을 기준으로 삼으면 안 된다.
          changes: panelToolRequest.changes || [],
          // 대신 앞뒤 패널을 물린다. 삽입은 두 컷 **사이**에 들어가는 일이라
          // 글로만 "이어지게"라고 하면 같은 방인지도 알 수 없다. 합치기도
          // 두 컷을 하나로 접는 것이므로 양쪽을 다 봐야 한다.
          // 분할도 마찬가지다. 한 컷을 쪼갠 두 장이라 같은 장소·같은 인물로
          // 이어져야 하는데, 앞뒤를 안 보고 그리면 한 컷 만에 다른 방이 된다.
          neighbors: panelToolRequest.reason === 'insert'
            || panelToolRequest.reason === 'merge'
            || panelToolRequest.reason === 'split',
        },
      )
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
    clearPanelDraftImage,
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

  // Script 단계의 주 단위는 Beat가 아니라 Scene이다. 기존 렌더링은 Beat를
  // 평평하게 나열해 씬 경계가 제목 한 줄로만 보였으므로, 씬 헤딩부터 다음
  // 헤딩 전까지의 Beat를 하나의 카드로 묶는다. 데이터 구조는 그대로 둔다.
  const scriptSceneGroups = []
  let currentSceneGroup = null
  beats.forEach((beatGroup, index) => {
    const heading = beatGroup.elements.find((element) => element.type === 'scene-heading')
    if (heading || !currentSceneGroup) {
      currentSceneGroup = {
        id: `script-scene-${heading?.globalIdx ?? index}`,
        heading: heading || null,
        beats: [],
      }
      scriptSceneGroups.push(currentSceneGroup)
    }
    currentSceneGroup.beats.push({ beatGroup, index })
  })
  const activeScriptSceneGroup = scriptSceneGroups.find((sceneGroup) => (
    sceneGroup.beats.some(({ beatGroup }) => beatGroup.beat === activeBeat)
  )) || scriptSceneGroups[0] || null
  const activeScriptSceneTitle = activeScriptSceneGroup?.heading?.text || scene?.title || '현재 Scene'
  const activeScriptSceneBeatCount = activeScriptSceneGroup?.beats.length || 0

  // 컷을 Beat별로 묶는다. index는 전체 기준이어야 이동·삭제가 맞는다.
  // 씬 헤딩도 Beat 구분도 없으면 아직 이야기 한 덩어리다.
  const hasSceneHeading = screenplay.some((element) => element.type === 'scene-heading')
  // 씬 헤딩이 나온 순서로 번호를 매긴다. 이 Beat가 몇 번째 씬을 여는가.
  const scriptScenes = selectScenes(screenplay)
  // 씬을 넘어도 같은 이름의 인물·공간은 같은 기준 그림을 쓴다. 씬마다
  // 다시 만들게 하면 중복 비용만 들고, 오히려 같은 대상이 달라질 위험이 있다.
  const referenceIdentity = (name = '') => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR')
  const sharedReferenceImage = (kind, subject) => {
    const identity = referenceIdentity(subject?.name)
    if (!identity) return null
    for (const candidateScene of Object.values(sceneStates)) {
      if (kind === 'location') {
        if (referenceIdentity(candidateScene.location?.name) === identity && candidateScene.location?.image) {
          return candidateScene.location.image
        }
        continue
      }
      const matchingCharacter = candidateScene.characters?.find((character) => (
        referenceIdentity(character.name) === identity && character.image
      ))
      if (matchingCharacter) return matchingCharacter.image
    }
    return null
  }
  const withSharedReferences = (sceneState) => {
    if (!sceneState) return sceneState
    return {
      ...sceneState,
      characters: sceneState.characters.map((character) => ({
        ...character,
        image: character.image || sharedReferenceImage('character', character),
      })),
      location: {
        ...sceneState.location,
        image: sceneState.location?.image || sharedReferenceImage('location', sceneState.location),
      },
    }
  }
  const visibleSceneState = withSharedReferences(activeSceneState)
  // 레퍼런스는 작품 전체에서 한 번만 확인한다. 앞 씬에 이미 나온 인물·공간을
  // 다음 씬에서도 다시 카드로 보여 주면, 사용자는 같은 항목을 또 확인해야
  // 한다고 느낀다. 생성에는 visibleSceneState 전체를 그대로 사용하되 화면에는
  // 이번 씬에서 처음 등장한 대상만 남긴다.
  const activeSceneIndex = scriptScenes.findIndex((scriptScene) => scriptScene.id === activeSceneId)
  const priorSceneStates = scriptScenes
    .slice(0, Math.max(0, activeSceneIndex))
    .map((scriptScene) => sceneStates[scriptScene.id])
    .filter(Boolean)
  const priorCharacterIds = new Set(
    priorSceneStates.flatMap((sceneState) => sceneState.characters.map((character) => character.id)),
  )
  const priorLocationNames = new Set(
    priorSceneStates
      .map((sceneState) => referenceIdentity(sceneState.location?.name))
      .filter(Boolean),
  )
  const newReferenceCharacters = visibleSceneState.characters.filter((character) => (
    !priorCharacterIds.has(character.id)
  ))
  const activeLocationIdentity = referenceIdentity(visibleSceneState.location?.name)
  const newReferenceLocation = !activeLocationIdentity || !priorLocationNames.has(activeLocationIdentity)
    ? visibleSceneState.location
    : null
  // 배지 역시 지금 화면에서 확인할 새 레퍼런스만 센다. 앞 씬에서 남겨 둔
  // 미정값이 씬마다 다시 할 일처럼 쌓이지 않게 한다.
  const undecidedSceneFacts = newReferenceCharacters
    .reduce((count, character) => count + character.facts.filter((fact) => fact.open).length, 0)
    + (newReferenceLocation?.facts?.filter((fact) => fact.open).length ?? 0)
  // 패널에 실제로 참조로 물리는 기준 그림이 모두 준비됐는지 확인한다.
  // 컷에 등장하지 않는 인물까지 강제하면, 쓰이지 않는 기준 그림 때문에
  // 다음 단계가 막힌다. 반대로 공간은 해당 씬의 모든 컷이 공유하므로 필요하다.
  const missingReferenceRequirements = []
  const pendingReferenceRequirements = []
  const referenceRequirementKeys = new Set()
  const addMissingReference = (requirement, isMissing) => {
    const { key } = requirement
    if (isMissing && !referenceRequirementKeys.has(key)) {
      referenceRequirementKeys.add(key)
      missingReferenceRequirements.push(requirement)
    }
  }
  const addPendingReference = (requirement, isPending) => {
    const { key } = requirement
    if (isPending && !pendingReferenceRequirements.some((entry) => entry.key === key)) {
      pendingReferenceRequirements.push(requirement)
    }
  }
  // 러프 콘티는 기준 그림을 물리지 않는다(referencesForCut). 쓰지도 않을
  // 그림을 요구하면 컷 플랜 확정이 막히므로, 이 검사 자체를 건너뛴다.
  const needsReferences = panelStylePreset !== 'rough'
  const cutsNeedingReferences = needsReferences ? cutPlan : []
  cutsNeedingReferences.forEach((cut) => {
    const scriptScene = sceneOfBeat(scriptScenes, cut.beat)
    const sceneState = sceneStates[scriptScene?.id]
    if (!sceneState) {
      addMissingReference(
        {
          key: `scene:${scriptScene?.id || 'unknown'}`,
          label: '인물·공간 기준 읽기',
          sceneLabel: `Scene ${scriptScene?.number ?? 1}`,
          startBeat: scriptScene?.startBeat ?? 0,
        },
        true,
      )
      return
    }

    const sceneWithSharedReferences = withSharedReferences(sceneState)
    const locationRequirement = {
      key: `location:${scriptScene?.id}`,
      label: sceneWithSharedReferences.location?.name || '공간',
      sceneLabel: `Scene ${scriptScene.number}`,
      startBeat: scriptScene.startBeat,
    }
    addMissingReference(locationRequirement, !sceneWithSharedReferences.location?.image)
    addPendingReference(
      locationRequirement,
      Boolean(referenceImagePending?.[referencePendingKey(scriptScene.id, 'location')]),
    )

    const cast = characterNamesOfCut(cut)
    sceneWithSharedReferences.characters
      .filter((character) => cast.some((name) => (
        name.includes(character.name) || character.name.includes(name)
      )))
      .forEach((character) => {
        const characterRequirement = {
          key: `character:${scriptScene?.id}:${character.id}`,
          label: character.name,
          sceneLabel: `Scene ${scriptScene.number}`,
          startBeat: scriptScene.startBeat,
        }
        addMissingReference(characterRequirement, !character.image)
        addPendingReference(
          characterRequirement,
          Boolean(referenceImagePending?.[referencePendingKey(scriptScene.id, 'character', character.id)]),
        )
      })
  })
  const referencesReadyForPanels = (
    missingReferenceRequirements.length === 0
    && pendingReferenceRequirements.length === 0
  )
  // 아직 없는 기준 중 첫 번째로 화면을 옮긴다. 표현 방식을 고른 직후
  // 감독이 다음에 할 일이 이것이므로, 그 자리까지 데려다 준다.
  //
  // 씬을 옮기는 이유: 미장센의 레퍼런스 카드는 지금 보고 있는 씬의 것만
  // 보여 준다(visibleSceneState). 필요한 기준이 다른 씬에 있으면 카드가
  // 화면에 없어서, 미장센을 열어 줘도 만들 것이 보이지 않는다.
  // 이 표현 방식을 고르면 무엇이 필요해지는지. 고른 뒤에 알면 되돌려야
  // 하므로 카드에 미리 적는다.
  //
  // 러프가 아닌 두 방식은 요구량이 같다(needsReferences는 rough 여부만
  // 본다). 지금 러프를 보고 있으면 missingReferenceRequirements가 비어
  // 있어 셀 수가 없는데, 그때는 숫자 대신 무엇이 필요한지만 말한다 —
  // 없는 숫자를 0으로 적으면 준비할 것이 없다는 뜻이 된다.
  const stylePresetNote = (preset) => {
    if (preset.id === 'rough') return '기준 이미지 없이 바로'
    if (!needsReferences) return '인물·공간 기준 이미지 필요'
    return referencesReadyForPanels
      ? '기준 이미지 준비됨'
      : pendingReferenceRequirements.length > 0
        ? `기준 이미지 ${pendingReferenceRequirements.length}개 생성 중`
        : `기준 이미지 ${missingReferenceRequirements.length}개 필요`
  }

  const goToReferenceRequirement = () => {
    const target = missingReferenceRequirements[0]
    if (!target) return
    setOpenAgent('mise')
    // 이 플랜에서 자동으로 다른 에이전트를 열어 방금 연 미장센을 덮지
    // 않게 한다. 감독이 직접 고른 셈이므로 자동 열기는 끝난 것으로 본다.
    autoOpenedCutPlanAgentKey.current = cutPlan[0]?.id ?? null
    if (typeof target.startBeat === 'number') setActiveBeat(target.startBeat)
  }
  // 여러 컷을 함께 읽어야 보이는 문제. scriptScenes가 필요하므로 그 뒤에 둔다.
  // 지적이 어느 컷의 이야기인지. 제목이 이미 컷을 말하는 진단도 있어서
  // 그때는 두 번 적지 않는다 — 규칙 진단은 대개 제목에 컷 번호가 들어 있고,
  // AI 지적은 규칙 이름만 제목으로 쓰므로 여기서 붙는다.
  const cutLabelOf = (finding) => {
    const ids = finding.cutIds || []
    if (ids.length === 0) return ''
    const labels = ids
      .map((id) => cutPlan.find((cut) => cut.id === id))
      .filter(Boolean)
      .map((cut) => `${cut.beat + 1}-${cut.beatOrder}`)
    if (labels.length === 0) return ''
    // 제목이 이미 그 컷을 말하고 있으면 붙이지 않는다.
    if (labels.every((label) => finding.title?.includes(label))) return ''
    // 씬 전체가 걸린 지적은 컷 번호를 나열해도 읽을 것이 없다. 어느 한
    // 컷의 잘못이 아니라는 것이 이 지적의 요점이다.
    if (finding.layer === 'scene_structure' && labels.length >= 3) return '씬 전체'
    // 여럿이면 처음과 끝만. 다섯 컷을 다 적으면 카드가 번호로 찬다.
    const shown = labels.length > 2
      ? `${labels[0]}–${labels[labels.length - 1]}`
      : labels.join(', ')
    return `컷 ${shown}`
  }

  // 컷 사이의 문제. scriptScenes가 필요하므로 그 뒤에 둔다.
  const seamFindings = diagnoseSeams(cutPlan, {
    seams,
    shots: flowShots,
  })
  // 편집이 보여주는 진단 하나. 규칙으로 늘 계산되는 것(seamFindings)과
  // 눌러야 오는 AI 점검이 섞이지만, 둘 다 컷 구성의 문제라 목록을 나누면
  // 같은 종류를 두 군데서 읽게 된다.
  //
  // AI 지적을 DiagnosisList가 아는 모양으로 옮긴다. 필드 이름이 다를 뿐
  // 가리키는 것은 같다 — 어느 컷의, 무엇이, 어떻게.
  const editingFindings = [
    ...seamFindings,
    ...(narrativeCheck?.stage === 'cutplan' ? narrativeCheck.findings : [])
      // 제안을 적용해 해결로 표시한 지적은 뺀다 (S4).
      .filter((finding) => !resolvedNarrativeFindingIds.includes(narrativeFindingId(finding)))
      // 촬영 판단은 Cinematography rail에서만 보인다. 이전 요청 결과가
      // 남아 있어도 Editing에서 샷 크기 처방으로 이어지면 안 된다.
      .filter((finding) => finding.ruleId !== 'camera-information-selection')
      // 컷을 못 짚은 지적은 버린다. 데려다줄 자리가 없으면 목록에 있어도
      // 사용자가 할 수 있는 것이 없다.
      .filter((finding) => finding.cutIds?.length > 0)
      .map((finding) => ({
        id: `check-${finding.ruleId}`,
        type: finding.operation === 'insert' ? 'skipped-beat' : 'narrative-check',
        operation: finding.operation,
        layer: layerOfCheckFinding(finding),
        title: ruleLabelOf(finding, '편집'),
        // finding은 문제, suggestedAction은 판단 근거다. 해결책은 이 단계에서
        // 만들지 않으므로 둘을 카드에 함께 남긴다.
        detail: finding.finding,
        suggestedAction: finding.suggestedAction,
        cutIds: finding.cutIds,
        changed: Boolean(finding.checkedFingerprint)
          && finding.checkedFingerprint !== cutFindingFingerprint(cutPlan, finding.cutIds),
      })),
  ]
  const visibleEditingFindings = editingFindings
  const cameraFindings = (cameraCheck?.findings || [])
    .filter((finding) => finding.cutIds?.length > 0)
    .map((finding) => ({
      id: `camera-${finding.ruleId}`,
      type: 'size-mismatch',
      layer: 'attribute',
      title: NARRATIVE_RULE_LABELS[finding.ruleId] || '촬영',
      detail: finding.finding,
      cutIds: finding.cutIds,
      changed: Boolean(finding.checkedFingerprint)
      && finding.checkedFingerprint !== cutFindingFingerprint(cutPlan, finding.cutIds),
    }))
  const miseFindings = (miseCheck?.findings || [])
    .filter((finding) => finding.cutIds?.length > 0)
    .map((finding) => ({
      id: `mise-${finding.ruleId}`,
      type: 'staging-mismatch',
      layer: 'shot_relation',
      title: NARRATIVE_RULE_LABELS[finding.ruleId] || '미장센',
      detail: finding.finding,
      cutIds: finding.cutIds,
      changed: Boolean(finding.checkedFingerprint)
        && finding.checkedFingerprint !== cutFindingFingerprint(cutPlan, finding.cutIds),
    }))
  // 사용자가 표 전체를 입력 양식처럼 훑지 않아도 되도록, 실제로 다시 볼
  // 이유가 있는 컷만 표시한다. 에이전트가 짚은 컷과 샷이 비어 있는 컷이다.
  const reviewCutIds = new Set([
    ...visibleEditingFindings.flatMap((finding) => finding.cutIds || []),
    ...cameraFindings.flatMap((finding) => finding.cutIds || []),
    ...(miseCheck?.findings || []).flatMap((finding) => finding.cutIds || []),
    ...cutPlan.filter((cut) => !cut.shotSize).map((cut) => cut.id),
  ])
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
  const activeSceneCuts = cutPlan.filter((cut) => (
    sceneOfBeat(scriptScenes, cut.beat)?.id === activeSceneId
  ))

  // 이 컷에 걸리는 레퍼런스 그림. 화면에 나오는 인물과 그 씬의 공간만
  // 넣는다 — 씬의 모든 인물을 매 컷에 물리면 없는 사람까지 그려진다.
  const referencesForCut = (cut, layoutImage = null, stylePreset = 'rough', previousImage = null) => {
    const scene = withSharedReferences(sceneStateForCut(cut))
    if (!scene || !cut) return []
    const cast = characterNamesOfCut(cut)
    // 이름이 정확히 같은 인물을 먼저 찾는다. 부분 일치만 쓰면 이름이 서로
    // 포함될 때 화면에 없는 인물까지 딸려 들어간다 — `하린` 컷에 `하린
    // 엄마`가, `수` 컷에 `수현`과 `철수`가 물린다. 컷에 한 명인데 기준
    // 그림이 셋이면 모델은 없어야 할 얼굴을 참고한다.
    //
    // 정확히 맞는 것이 하나도 없을 때만 부분 일치로 내려간다. 컷의
    // 등장인물이 `하린과 민호`처럼 서술형으로 적히는 경우가 있어, 그때는
    // 느슨하게라도 찾아야 기준이 아예 빠지지 않는다.
    const exact = (character) => cast.some((name) => name === character.name)
    const loose = (character) => cast.some((name) => (
      name.includes(character.name) || character.name.includes(name)
    ))
    const anyExact = scene.characters.some((character) => character.image && exact(character))
    const inThisCut = anyExact ? exact : loose
    const refs = scene.characters
      .filter((character) => character.image && inThisCut(character))
      .map((character) => ({
        name: character.name,
        kind: 'character',
        image: character.image,
      }))
      // data URL과 예시 데이터의 public 파일 경로를 모두 보존한다. 실제 요청
      // 직전에 같은 base64 형식으로 바꾼다.
      .filter((entry) => entry.image)
    if (scene.location?.image) {
      refs.push({
        name: scene.location.name || '공간',
        kind: 'location',
        image: scene.location.image,
      })
    }
    // 이 컷에 나오는 인물은 전부 물린다. 두세 명이 함께 잡히는 컷에서 한
    // 명을 빼면 그 인물만 기준 없이 그려져, 같은 화면 안에서 어떤 얼굴은
    // 이어지고 어떤 얼굴은 매번 달라진다.
    //
    // 러프는 인물·공간 기준을 물리지 않는다. 얼굴이 빈 타원이고 공간이 선
    // 몇 개인 그림에 "같은 얼굴로 이어지게" 할 것이 없고, 오히려 그려진
    // 기준을 물리면 그쪽으로 완성도가 끌려 올라간다. 앵커만 물려 구도만 잡는다.
    const picked = stylePreset === 'rough' ? [] : [...refs]
    const styleAnchor = PANEL_STYLE_PRESETS.find((preset) => preset.id === stylePreset)
    if (styleAnchor) {
      picked.unshift({ name: styleAnchor.label, kind: 'style', image: styleAnchor.image })
    }
    // 바로 앞 컷의 그림. 글로 "장소·조명·화풍을 맞춰라"라고만 하면 같은
    // 방인지 알 수 없다 — 이미지가 텍스트를 이기므로 앞 장을 보여줘야
    // 이어진다. 러프에서 특히 크다: 인물·공간 기준을 안 물리기 때문에
    // 이것이 유일한 연속성 근거다.
    //
    // 앵커 다음에 둔다. 슬롯이 잘리는 경우 화풍 다음으로 지켜야 할 것이다.
    if (previousImage) {
      picked.splice(styleAnchor ? 1 : 0, 0, {
        name: '앞 컷',
        kind: 'neighbor-before',
        image: stripDataUrl(previousImage),
      })
    }
    if (layoutImage) {
      picked.push({
        name: scene.location?.name || '이 공간',
        kind: 'layout',
        image: stripDataUrl(layoutImage),
      })
    }
    return picked
  }

  // 이 레퍼런스가 지금 표현 스타일과 다른 밀도로 만들어졌는가.
  //
  // 조용히 다시 그리지 않는다 — 감독이 마음에 들어 하던 기준 그림이 예고
  // 없이 사라지면 안 된다. 갈렸다는 사실만 알리고 처분은 `다시 생성`으로
  // 남긴다 (발견과 처분의 분리).
  const staleStyleLabel = (subject) => {
    const made = subject?.stylePreset
    // 이 기능 이전에 만든 레퍼런스는 밀도 기록이 없다. 모르는 것을
    // 갈렸다고 말하면 멀쩡한 기준까지 다시 그리게 된다.
    if (!subject?.image || !made || made === panelStylePreset) return ''
    const label = PANEL_STYLE_PRESETS.find((preset) => preset.id === made)?.label || made
    return `${label}로 만든 기준`
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

  const toggleScene = (openingBeat) => setCollapsedScenes((current) => (
    current.includes(openingBeat)
      ? current.filter((entry) => entry !== openingBeat)
      : [...current, openingBeat]
  ))

  const toggleCutBeat = (beat) => setCollapsedCutBeats((current) => (
    current.includes(beat) ? current.filter((b) => b !== beat) : [...current, beat]
  ))

  // 콘티 표의 행 목록. 컷은 Beat를 건너뛰고 한 줄로 이어지고, 씬이 바뀌는
  // 자리에만 구분 행이 들어간다. 접힌 씬의 컷은 행을 만들지 않는다 —
  // 씬 구분 행은 남아야 다시 펼 수 있다.
  const conteRows = (() => {
    const rows = []
    let lastOpening = null
    flowShots.forEach((shot, shotIdx) => {
      const cut = cutPlan.find((item) => item.id === shot.cutPlanItemId)
      const beat = cut?.beat ?? shot.scriptBeat ?? 0
      const opening = openingBeatOf(beat)
      if (opening !== null && opening !== lastOpening) {
        lastOpening = opening
        const heading = screenplay.find((element) => (
          element.type === 'scene-heading' && (element.beat ?? 0) === opening
        ))
        rows.push({
          kind: 'scene',
          beat: opening,
          number: sceneNumberOf(opening),
          text: heading?.text || '',
          cutCount: cutsInScene(opening),
          collapsed: collapsedScenes.includes(opening),
        })
      }
      if (opening !== null && collapsedScenes.includes(opening)) return
      rows.push({ kind: 'cut', shot, shotIdx, cut })
    })
    return rows
  })()

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
    const cutId = flowShots[shotIdx]?.cutPlanItemId
    if (cutId) deleteCut(cutId)
    else removeShot(activeBranch, shotIdx)
  }

  // 이 패널에 보이는 그림. 손으로 그린 것도 생성한 것도 shot.image에 있다 —
  // 패널의 id에 붙으므로 컷을 끼우거나 순서를 바꿔도 함께 따라간다.
  const getShotVisual = (shot) => {
    // 앞뒤 패널을 물릴 때 첫 컷의 앞이나 마지막 컷의 뒤를 묻는다.
    if (!shot) return null
    return shot.image || null
  }

  // 생성은 언제나 한 번에 전부다. 몇 장을 어떻게 뽑을지는 감독이 판단할
  // 것이 아니라 이 도구가 정해 두는 조건이다 — 검토와 수정에서 차이가
  // 나야지, 생성 방식에서 갈리면 무엇 때문의 차이인지 알 수 없다.
  const eligibleScopeShots = flowShots
    .map((shot, shotIdx) => ({ shot, shotIdx }))
    .filter(({ shot }) => !getShotVisual(shot))

  const generateReferenceFromCutPlan = async (kind, subjectId = null) => {
    const cardKey = subjectId || kind
    await requestReferenceImage(kind, subjectId)
    setOpenReferenceCards((current) => ({ ...current, [cardKey]: true }))
  }

  // 아직 커밋되지 않은 설명 편집을 먼저 반영한다.
  //
  // 설명 칸은 타이핑마다 스토어를 고치지 않는다(열여덟 행이 매 글자마다
  // 다시 그려진다). 대신 손을 뗄 때 커밋하는데, 고치자마자 재생성을 누르면
  // blur와 클릭의 순서가 브라우저에 달려 있어 옛 문장으로 그려질 수 있다.
  // 그리기는 30초가 걸리므로 그 한 번이 그대로 낭비가 된다.
  //
  // React 상태를 기다리지 않고 DOM에서 직접 읽는다 — 지금 화면에 있는
  // 문장이 곧 감독이 의도한 문장이고, 그것이 프롬프트로 가야 한다.
  const commitOpenContentEdits = () => {
    document.querySelectorAll('[data-conte-content]').forEach((el) => {
      const cutId = el.dataset.conteContent
      const typed = el.value.trim()
      if (!cutId || typed === (el.dataset.conteCommitted || '')) return
      updateCutPlanItem(cutId, { content: typed })
    })
  }

  // 조립한 프롬프트로 실제 그림을 만든다. 씬 기준·책임 선언·이음새·샷이
  // 전부 이 문장으로 모이므로, 여기서 쓰지 않으면 앞 공정이 무의미해진다.
  const handleGeneratePanels = async (
    targets,
    // keepView: 검토 화면에서 부른 경우. 화면을 옮기면 감독이 보고 있던
    // 진단이 가려진다 — 바뀌는 것은 그림뿐이어야 한다.
    {
      includeExisting = false, keepView = false, statusLabel = '새 이미지 생성 중…',
      // 값 하나를 바꿔 다시 그리는 경우, 무엇이 달라지는지를 문장으로 받는다
      // (예: `['앵글: Eye level → POV']`). 이것이 있으면 지금 그림을 함께
      // 물려 "이것만 바꾸고 나머지는 그대로"라고 지시한다.
      //
      // 없이 그리면 앵글 하나를 고쳐도 자세·소품·구도까지 전부 새로 나와,
      // 감독이 고른 한 가지가 무엇을 바꾸는지 비교할 수 없다.
      changes = [],
      // 삽입·합치기처럼 앞뒤와 이어져야 하는 경우. 앞뒤 패널 그림을 함께
      // 물려 같은 장소·인물·조명으로 이어지게 한다.
      neighbors = false,
      // 초안을 후보로 두지 않고 바로 패널의 그림으로 굳힌다.
      //
      // 컷 플랜을 확정한 뒤의 첫 초안이 그렇다. 감독은 이미 "이 구성으로
      // 간다"를 정했고, 그 결과를 열여덟 번 승인하는 것은 판정이 아니라
      // 클릭이다. 판정이 필요한 것은 제안을 적용해 다시 그린 그림 쪽이고,
      // 그 경로는 후보로 남아 `이걸로 하기 / 버리고 되돌리기`를 받는다.
      autoAccept = false,
    } = {},
  ) => {
    // 편집 중이던 설명을 먼저 스토어에 넣는다. 이 뒤의 프롬프트 조립은
    // 스토어에서 컷을 다시 읽으므로, 여기서 넣은 문장이 그대로 반영된다.
    commitOpenContentEdits()

    const eligibleTargets = includeExisting
      ? targets
      : targets.filter(({ shot }) => !getShotVisual(shot))
    if (eligibleTargets.length === 0) return
    if (!isExpanded && !keepView) setMaximizedPanel('left')

    setPanelGenError(null)
    setPanelGenPending((current) => {
      const next = { ...current }
      eligibleTargets.forEach(({ shot }) => { next[shot.id] = statusLabel })
      return next
    })

    const { generatePanelImage } = await import('../services/api')
    // 도면은 컷마다 다를 수 있다. 인물이 자리를 옮기거나 조명이 꺼지면
    // 그 컷부터 새 단계가 되고, 감독이 그 단계의 배치를 따로 그린다.
    // 씬에 하나로 고정하면 그렇게 나눠 그린 수고가 그림에 나타나지 않는다.
    //
    // 같은 단계를 여러 컷이 공유하므로 도면 그림은 단계마다 한 번만 만든다.
    const layoutCache = new Map()
    const layoutFor = async (cut) => {
      const elements = cut ? selectLayoutForCut(useStore.getState(), cut.id) : spatialElements
      const key = JSON.stringify(elements)
      if (!layoutCache.has(key)) {
        layoutCache.set(key, {
          line: describeLayout(elements),
          image: await rasterizeLayout(layoutToImage(elements)),
        })
      }
      return layoutCache.get(key)
    }
    const failures = []

    // 방금 커밋한 설명이 반영된 컷을 쓴다. 이 함수를 감싼 클로저의
    // `cutPlan`은 이번 렌더 시점의 값이라 그 편집을 아직 모른다.
    const latestPlan = useStore.getState().cutPlan
    const promptOf = (cut) => {
      const fresh = cut ? latestPlan.find((item) => item.id === cut.id) || cut : null
      return fresh
        ? buildCutPrompt(fresh, {
          sceneIntention,
          sceneNote: scenePromptNote,
          declarations,
          sceneState: sceneStateForCut(fresh),
          seam: seamBefore(fresh.id),
          cutIndex: latestPlan.findIndex((item) => item.id === fresh.id),
          cutOrder,
        })
        : null
    }

    // 컷 순서대로, 한 장씩 만든다. 동시에 만들면 각 패널이 앞 컷을 모른 채
    // 그려져 같은 씬인데 이어지지 않는다. 앞 컷의 문장을 함께 넘긴다.
    const ordered = [...eligibleTargets].sort((a, b) => a.shotIdx - b.shotIdx)

    // 방금 그린 앞 컷의 그림. 순서대로 도는 루프이므로 다음 컷을 그릴 때는
    // 이미 나와 있다 — 추가 호출 없이 연속성 근거로 쓸 수 있다.
    let previousImage = null

    for (const { shot, shotIdx } of ordered) {
      const cut = cutPlan.find((item) => item.id === shot.cutPlanItemId)
      const prompt = promptOf(cut)
      // 앞 컷은 '이 요청에 포함된 것'이 아니라 컷 플랜상 바로 앞 컷이다 —
      // 한 장만 다시 그릴 때도 앞뒤가 맞아야 한다.
      const cutAt = cut ? cutPlan.findIndex((item) => item.id === cut.id) : -1
      const previous = cutAt > 0 ? promptOf(cutPlan[cutAt - 1]) : null
      // 그림도 같은 앞 컷을 따라야 한다. 이 루프에서 방금 그린 것이
      // 있으면 그것이 가장 새 그림이고, 없으면 — 한 장만 다시 그리는
      // 경우다 — 이미 보드에 있는 앞 컷 그림을 쓴다. 이것이 없으면
      // 재생성만 연속성 근거를 잃는다. 러프에서 특히 큰데, 러프는
      // 인물·공간 기준을 일부러 물리지 않아 앞 컷이 유일한 근거다.
      const priorShot = cutAt > 0
        ? flowShots.find((entry) => entry.cutPlanItemId === cutPlan[cutAt - 1].id)
        : null
      const priorImage = previousImage || (priorShot ? getShotVisual(priorShot) : null)

      try {
        // 프롬프트가 없는 패널은 만들 수 없다. 컷과 이어지지 않은 패널이다.
        if (!prompt?.effective) throw new Error('이 패널에 연결된 컷이 없습니다')
        // 이 컷이 속한 단계의 배치.
        const layout = await layoutFor(cut)
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
          references: (await Promise.all(
            [
              // 앞뒤 패널을 따로 물리는 경우(삽입·합치기·분할)에는 여기서
              // 앞 컷을 또 넣지 않는다. 아래에서 그 관계로 다시 붙는다.
              ...referencesForCut(
                cut, layout.image, panelStylePreset,
                neighbors ? null : priorImage,
              ),
              // 값 하나만 바꿔 다시 그리는 중이면 지금 그림을 함께 물린다.
              // 이 그림이 있어야 "나머지는 그대로"가 지킬 대상을 갖는다 —
              // 글로만 "유지하라"고 하면 무엇을 유지할지 알 수 없다.
              ...(changes.length > 0 && getShotVisual(shot)
                ? [{ name: '현재 패널', kind: 'current', image: getShotVisual(shot) }]
                : []),
              // 앞뒤 패널. 삽입은 두 컷 사이에 들어가고 합치기는 두 컷을
              // 하나로 접으므로, 양옆이 어떤 그림인지 봐야 같은 장면으로
              // 이어진다. 이미 그려진 것만 물린다.
              ...(neighbors && getShotVisual(flowShots[shotIdx - 1])
                ? [{
                  name: `S${shotIdx}`,
                  kind: 'neighbor-before',
                  image: getShotVisual(flowShots[shotIdx - 1]),
                }]
                : []),
              ...(neighbors && getShotVisual(flowShots[shotIdx + 1])
                ? [{
                  name: `S${shotIdx + 2}`,
                  kind: 'neighbor-after',
                  image: getShotVisual(flowShots[shotIdx + 1]),
                }]
                : []),
            ].map(async (reference) => ({
              ...reference,
              image: await referenceImageBase64(reference.image),
            })),
          )).filter((reference) => reference.image),
          // 이번에 무엇이 달라지는지. 비어 있으면 처음 그리는 것이다.
          changes,
          // 화풍은 표현 스타일 하나가 정한다. 글로 받던 그림체 칸은 없앴다 —
          // 앵커 이미지보다 약해서, 어긋나면 어차피 무시되는 쪽이었다.
          stylePreset: panelStylePreset,
          // 이 컷이 속한 단계의 배치. 컷마다 콘솔이 좌우로 옮겨 다니는 것을
          // 글로만 막기는 어렵다.
          layout: layout.line,
          // 생성 바에서 고른 모델을 그대로 보낸다. 재생성도 같은 함수로
          // 들어오므로 새로 고른 기준이 모든 패널에 일관되게 적용된다.
          model: panelImageModel,
        })

        // 다음 컷이 이 그림을 이어받는다. 실패한 컷은 갱신하지 않아, 그
        // 앞의 성공한 그림이 계속 기준이 된다.
        previousImage = image

        if (autoAccept) {
          // 후보를 거치지 않고 바로 굳힌다. 구조를 바꿔 생긴 칸이었다는
          // 표시도 여기서 지운다 — 그림이 생기면 더는 초안 칸이 아니다.
          updateFlowShotById(shot.id, {
            image,
            source: 'ai',
            isAIGenerated: true,
            insertDraft: false,
            mergedDraft: false,
            splitDraft: false,
          })
        } else {
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
          setPanelDraftImage(shot.id, image)
        }
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
  // 검토 화면의 `다시 그리기`가 이 참조로 부른다.
  generatePanelsRef.current = handleGeneratePanels


  const dismissPanelCandidate = (shotId) => {
    setPanelCandidates((current) => {
      const next = { ...current }
      delete next[shotId]
      return next
    })
    clearPanelDraftImage(shotId)
  }

  const acceptPanelCandidate = (shotId) => {
    const candidate = panelCandidates[shotId]
    if (!candidate) return
    updateFlowShotById(shotId, {
      image: candidate.image,
      source: 'ai',
      isAIGenerated: true,
      // 그림이 생겼으니 더는 구조 변경 직후의 초안 칸이 아니다.
      insertDraft: false,
      mergedDraft: false,
      splitDraft: false,
    })
    dismissPanelCandidate(shotId)
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

  // 맨 앞에 Beat를 넣는다. `+ Beat`는 언제나 그 Beat 다음에 넣으므로
  // 첫 Beat 앞은 어느 버튼으로도 닿지 않았다 — 씬을 여는 대본 줄보다
  // 앞선 국면을 나중에 덧붙일 방법이 없었다.
  const handleAddBeatAtStart = () => {
    addBeatAfter(-1)
    setPendingFocus({ index: 0, caret: 0 })
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

  // 제안이 가리키는 대본 줄을 지금 대본에서 다시 찾는다.
  //
  // 제안은 만들어질 때의 인덱스를 들고 있는데, 다른 제안을 먼저 적용하면
  // 줄이 밀려 그 인덱스가 다른 줄을 가리킨다. 그래서 자리를 문장으로도
  // 기억해 두고(`anchorText`), 적용할 때 그 문장을 다시 찾는다. 그러면
  // 남은 제안들이 계속 유효해, 적용한 카드 하나만 사라진다.
  const resolveSuggestionIndex = (suggestion, fallbackIndex) => {
    const anchor = (suggestion.anchorText || '').trim()
    if (!anchor) return fallbackIndex
    // 원래 자리가 아직 그 문장이면 그대로 쓴다 — 같은 문장이 두 번
    // 나올 때 엉뚱한 쪽으로 옮겨 가지 않는다.
    if (screenplay[fallbackIndex]?.text?.trim() === anchor) return fallbackIndex
    const found = screenplay.findIndex((element) => element.text?.trim() === anchor)
    return found >= 0 ? found : fallbackIndex
  }

  const handleAcceptNarrativeSuggestion = (suggestion) => {
    if (suggestion.type === 'split-beat') {
      splitBeat(resolveSuggestionIndex(suggestion, suggestion.elementIndex))
    } else if (suggestion.type === 'insert-script-line') {
      const at = resolveSuggestionIndex(suggestion, suggestion.insertAfterIndex)
      const nextScreenplay = [...screenplay]
      nextScreenplay.splice(at + 1, 0, suggestion.newElement)
      setScreenplay(nextScreenplay)
    } else if (suggestion.type === 'replace-script-line') {
      const at = resolveSuggestionIndex(suggestion, suggestion.elementIndex)
      setScreenplay(screenplay.map((element, index) => (
        index === at
          ? { ...element, text: suggestion.proposedText }
          : element
      )))
    }
    // 이 제안이 점검 지적에서 왔다면 그 지적도 해결로 옮겨 카드를 숨긴다.
    if (pendingSuggestionFindingId) resolveNarrativeFinding(pendingSuggestionFindingId)
    // 적용한 카드만 없앤다. 나머지는 문장으로 자리를 다시 찾으므로 계속
    // 판정할 수 있다 (S4).
    dismissNarrativeSuggestion(suggestion.id)
  }

  const handleUploadScript = () => {
    // 형식 규칙은 둘뿐이다. 씬 헤딩이 씬을 나누고, 빈 줄이 Beat를 나눈다.
    // 참가자가 별도 형식을 배울 필요가 없어야 한다 — 대사도 지문 구분도
    // 없이 일어나는 일을 그대로 적으면 된다.
    //
    // 씬 헤딩: 첫 줄이거나 빈 줄 뒤에 오는 짧은 줄로, 문장부호가 없고
    // 장소·시간처럼 읽히는 것. `물리학과 실험실, 밤`
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

    // 대본을 먼저 넣으면 showWriteScene의 hasScreenplay가 참이 되어
    // 이 칸이 닫히고, 아직 나누기 전의 대본이 한 번 떴다가 바뀐다.
    // 감독은 처음 뜬 것을 결과로 읽는다.
    //
    // 그래서 나눌 재료만 넘기고, 대본은 결과가 나온 뒤에 세운다.
    // AI가 채운 줄은 filled로 표시되어 대본에서 구분되므로 확인 단계
    // 없이 적용해도 자기가 쓰지 않은 것을 알 수 있다.
    const story = newScreenplay
      .map((element) => element.text.trim())
      .filter(Boolean)
      .join(' ')
    requestStoryStructure(true, { story, fallback: newScreenplay })
      .finally(() => setIsEditingRaw(false))
  }

  // 점검에서 나온 지적을 그대로 제안 요청으로 넘긴다. 점검은 무엇이
  // 문제인지만 말하고, 무엇으로 고칠지는 제안이 낸다.
  // 대본 점검과 컷 구성 점검은 같은 규칙을 쓰고 같은 모양으로 보인다.
  // 다른 것은 무엇을 보느냐뿐이다 — 대본의 줄이냐, 컷 플랜의 컷이냐.
  const renderNarrativeCheck = (stage) => {
    const isScript = stage === 'script'
    // 다른 단계에서 받은 결과가 남아 있으면 지금 화면의 것이 아니다.
    const rawResult = narrativeCheck?.stage === stage ? narrativeCheck : null
    // 제안을 적용해 해결로 표시한 지적은 목록에서 뺀다 (S4).
    const result = rawResult
      ? {
        ...rawResult,
        findings: rawResult.findings.filter(
          (finding) => !resolvedNarrativeFindingIds.includes(narrativeFindingId(finding)),
        ),
      }
      : null
    return (
      <div className="narrative-rail-check">
        <button
          type="button"
          onClick={() => requestNarrativeCheck(stage)}
          disabled={narrativeCheckPending}
        >
          {narrativeCheckPending
            ? (isScript ? '대본 보는 중…' : '컷 구성 보는 중…')
            : isScript && narrativeCheckStale
              ? '변경됨 · 다시 점검'
              : result
                ? (isScript ? '대본 다시 점검' : '컷 구성 다시 점검')
                : (isScript ? '대본 구성 점검' : '컷 구성 점검')}
        </button>
        {isScript && narrativeCheckStale && (
          <p className="narrative-rail-check-stale">
            대본이 바뀌어 아래 결과는 이전 버전 기준입니다.
          </p>
        )}
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
                <li
                  key={finding.ruleId}
                  className={openFindingId === finding.ruleId ? 'is-open' : ''}
                >
                  {/* 눌러야 그 지적의 줄이 대본에 표시된다. 한꺼번에
                      칠하면 어느 표시가 어느 지적인지 알 수 없다. */}
                  <button
                    type="button"
                    className="narrative-rail-check-open"
                    aria-pressed={openFindingId === finding.ruleId}
                    onClick={() => selectFinding(finding, stage)}
                  >
                    <span>{ruleLabelOf(finding, '서사')}</span>
                    <em>
                      {isScript
                        ? lineLabelsOf(finding.lineIndexes)
                        : cutLabelsOf(finding.cutIds)}
                    </em>
                    <strong>{finding.finding}</strong>
                  </button>
                  {/* 고른 것만 펼친다. 여럿을 한꺼번에 펼쳐 두면 목록이
                      길어져 무엇을 보고 있는지 흐려진다. */}
                  {openFindingId === finding.ruleId && (
                    <>
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
                    </>
                  )}
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

  // 컷으로 나누려면 나눌 것이 있어야 한다. 이야기를 막 넣은 상태에서
  // 컷 플랜부터 권하면 뼈대인 채로 그림까지 가고, 그때는 고치는 비용이
  // 가장 비싸다.
  //
  // 기준은 Beat가 둘 이상이고 줄이 어느 정도 있는 것 — 한 덩어리이거나
  // 서너 줄뿐이면 아직 윤곽이 아니다.
  const scriptBeatCount = new Set(scriptLines.map((element) => element.beat ?? 0)).size
  const scriptHasShape = scriptBeatCount >= 2 && scriptLines.length >= 5

  // 대본을 씬·Beat로 정리한 직후에는 Narrative가 먼저 한 번 본다. 타이핑
  // 중에는 다시 부르지 않는다 — 이후 수정은 stale 표시만 남기고, 감독이
  // `다시 점검`을 눌렀을 때 새 결과를 받는다.
  const autoCheckedScriptKey = useRef(null)
  useEffect(() => {
    if (cutStage !== 'script'
      || !scriptHasShape
      || showWriteScene
      || structurePending
      || narrativeCheckPending
      || narrativeCheckStale) return
    if (narrativeCheck?.stage === 'script') return
    const scriptKey = screenplay
      .map((element) => `${element.type}:${element.beat ?? 0}:${element.text}`)
      .join('\n')
    if (!scriptKey || autoCheckedScriptKey.current === scriptKey) return
    autoCheckedScriptKey.current = scriptKey
    requestNarrativeCheck('script')
  }, [
    cutStage,
    narrativeCheck,
    narrativeCheckPending,
    narrativeCheckStale,
    requestNarrativeCheck,
    screenplay,
    scriptHasShape,
    showWriteScene,
    structurePending,
  ])

  // 점검이 짚은 줄을 대본에서 표시한다. 번호만 주면 감독이 세어 찾아야
  // 한다. lineIndexes는 헤딩을 뺀 순번이므로 전체 순번으로 옮긴다.
  const selectFinding = (finding, stage) => {
    const next = openFindingId === finding.ruleId ? null : finding.ruleId
    setOpenFindingId(next)
    if (!next) return
    if (stage !== 'script') {
      goToFindingCut(finding)
      return
    }
    // 표시한 줄이 화면 밖이면 표시해도 보이지 않는다.
    const first = scriptLines[finding.lineIndexes?.[0] ?? 0]
    if (first) selectBeat(first.beat ?? 0)
    window.setTimeout(() => {
      document.querySelector('.sb-script-action.is-flagged')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, 80)
  }

  const flaggedLineIndexes = (() => {
    if (narrativeCheck?.stage !== 'script') return new Set()
    // 고른 지적의 줄만 칠한다. 전부 칠하면 어느 표시가 어느 지적인지
    // 알 수 없어 표시가 있으나 마나다.
    const finding = narrativeCheck.findings
      .find((item) => item.ruleId === openFindingId)
    if (!finding) return new Set()
    const map = []
    screenplay.forEach((element, index) => {
      if (element.type !== 'scene-heading') map.push(index)
    })
    const flagged = new Set()
      ; (finding.lineIndexes || []).forEach((position) => {
        if (map[position] !== undefined) flagged.add(map[position])
      })
    return flagged
  })()

  const lineLabelsOf = (indexes = []) => {
    const numbers = indexes.filter((index) => index >= 0).map((index) => index + 1)
    if (numbers.length === 0) return ''
    return numbers.length > 2
      ? `${numbers[0]}–${numbers[numbers.length - 1]}번째 줄`
      : `${numbers.join(', ')}번째 줄`
  }

  // 컷 지적은 그 컷 자리로 보낸다. 어느 컷인지 모르면 고칠 수 없다.
  const goToFindingCut = (finding, logInteraction = true) => {
    const cutId = finding.cutIds?.[0]
    if (!cutId) return
    const cut = cutPlan.find((item) => item.id === cutId)
    if (cut) {
      selectBeat(cut.beat)
      // 접혀 있으면 그 행은 DOM에 아예 없다. 펼치지 않고 scrollIntoView를
      // 부르면 아무 일도 일어나지 않는다 — 눌러도 반응이 없던 이유다.
      // Beat와 씬 두 축으로 접히므로 둘 다 푼다.
      setCollapsedCutBeats((current) => current.filter((beat) => beat !== cut.beat))
      const opening = openingBeatOf(cut.beat)
      if (opening !== null) {
        setCollapsedScenes((current) => current.filter((beat) => beat !== opening))
      }
    }
    // 옮기기만 하면 어느 줄인지 모른다. 그 컷을 골라 둔다.
    setSelectedCutId(cutId)
    setCutSelectedFromTable(false)
    // 펼쳐 둔 프롬프트가 있으면 닫는다. 그 자리에 긴 칸이 열려 있으면
    // 짚어준 컷이 화면 밖으로 밀린다.
    if (logInteraction) {
      logScaffold({ feature: 'diagnosis', action: 'accept', target: cutId, lens: 'editing' })
    }
    // 접힌 것을 펴는 re-render가 끝나야 행이 DOM에 생긴다. 고정 지연으로
    // 기다리면 느린 프레임에서 빈손으로 돌아오므로, 나타날 때까지 몇 번
    // 다시 본다.
    let tries = 0
    const reveal = () => {
      const row = document.querySelector(`[data-cut-id="${cutId}"]`)
      if (!row) {
        if (tries++ < 10) window.setTimeout(reveal, 50)
        return
      }
      row.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // 고른 표시(왼쪽 보라 선)는 조용해서, 표가 길면 어디로 갔는지
      // 눈이 못 따라온다. 도착한 순간에만 한 번 깜빡인다.
      row.classList.remove('just-arrived')
      // 리플로우를 강제해야 같은 컷을 두 번 눌러도 다시 재생된다.
      void row.offsetWidth
      row.classList.add('just-arrived')
    }
    window.setTimeout(reveal, 60)
  }

  // 자동 점검이 접힌 배지에서 끝나면 사용자는 다시 눌러 결과를 찾아야 한다.
  // 그래서 첫 예외가 생기는 순간 담당 에이전트를 열고 그 컷으로 보낸다.
  // 이후 선택은 사용자에게 맡기며 같은 플랜에서는 다시 자동 전환하지 않는다.
  useEffect(() => {
    if (cutStage !== 'cutplan' || cutPlan.length === 0) return
    const planKey = cutPlan[0].id
    if (autoOpenedCutPlanAgentKey.current === planKey) return

    // 사용자가 점검 중 먼저 에이전트를 열었다면 그 선택을 존중한다.
    if (openAgent) {
      autoOpenedCutPlanAgentKey.current = planKey
      return
    }

    if (visibleEditingFindings.length > 0) {
      autoOpenedCutPlanAgentKey.current = planKey
      setOpenAgent('editing')
      goToFindingCut(visibleEditingFindings[0], false)
      return
    }

    // 규칙·AI 컷 구성 점검이 끝나기 전에 카메라 미정만 보고 열면, 잠시 뒤
    // 도착한 더 중요한 편집 예외를 가린다. 컷 구성 점검이 정리된 뒤 고른다.
    const cutPlanCheckSettled = autoCheckedPlanKey.current === planKey
      && !narrativeCheckPending
      && (narrativeCheck?.stage === 'cutplan' || Boolean(narrativeCheckError))
    if (!cutPlanCheckSettled) return

    if (cameraFindings.length > 0) {
      autoOpenedCutPlanAgentKey.current = planKey
      setOpenAgent('camera')
      goToFindingCut(cameraFindings[0], false)
      return
    }

    if (undecidedShots > 0) {
      const firstUndecided = cutPlan.find((cut) => !cut.shotSize)
      autoOpenedCutPlanAgentKey.current = planKey
      setOpenAgent('camera')
      if (firstUndecided) goToFindingCut({ cutIds: [firstUndecided.id] }, false)
      return
    }

    if (undecidedSceneFacts > 0 || missingReferenceRequirements.length > 0) {
      autoOpenedCutPlanAgentKey.current = planKey
      setOpenAgent('mise')
    }
  }, [
    cameraFindings,
    cutPlan,
    cutStage,
    missingReferenceRequirements.length,
    narrativeCheck,
    narrativeCheckError,
    narrativeCheckPending,
    openAgent,
    undecidedSceneFacts,
    undecidedShots,
    visibleEditingFindings,
  ])

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
      // 이 제안이 어느 지적에서 왔는지. 적용하면 그 지적도 해결로 친다 (S4).
      fromFindingId: narrativeFindingId(finding),
      narrativeRequest: (
        `${stage === 'script' ? '대본' : '컷'} 구성 점검에서 이런 지적이 나왔습니다: ${finding.finding}\n`
        + `${finding.suggestedAction}\n`
        + '이 구간의 대본에서 무엇을 더하거나 고치면 되는지 제안해 주세요.'
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
    const submittedRequest = narrativeRequest.trim()
    if (!submittedRequest) return
    requestNarrativeSuggestions({ narrativeRequest: submittedRequest })
    narrativeRequestRecall.record(submittedRequest)
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
      `의도 비공개 순차 읽기 ${panelLabel}: ${interpretation}\n화면 근거: ${cues}\n이 읽기가 생기는 서사 흐름을 검토해줘.`,
    )
    narrativeRequestRecall.resetNavigation()
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
                    <em>{screenplay.length} lines · {beats.length} moments</em>
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
              <li className={`${cutPlanAccepted ? (panelPreparationComplete ? 'stage-done' : 'stage-active') : 'stage-locked'}${cutStage === 'preparation' ? ' stage-current' : ''}`}>
                <button
                  type="button"
                  onClick={reopenPanelPreparation}
                  disabled={!cutPlanAccepted}
                  aria-current={cutStage === 'preparation' ? 'step' : undefined}
                >
                  <span className="stage-index">3</span>
                  <div>
                    <strong>Panel setup</strong>
                    <em>{cutPlanAccepted ? (panelPreparationComplete ? '준비 완료' : '표현 방식 · 기준 준비') : '컷 확정 후 열림'}</em>
                  </div>
                </button>
              </li>
              <li className={`${panelPreparationComplete ? 'stage-active' : 'stage-locked'}${cutStage === 'panels' ? ' stage-current' : ''}`}>
                <button
                  type="button"
                  onClick={clearCutPlanStageOverride}
                  disabled={!panelPreparationComplete || cutStage === 'panels'}
                  aria-current={cutStage === 'panels' ? 'step' : undefined}
                >
                  <span className="stage-index">4</span>
                  <div>
                    <strong>Panels</strong>
                    <em>{panelPreparationComplete ? `${flowShots.length} panels` : '준비 후 열림'}</em>
                  </div>
                </button>
              </li>
            </ol>
          </nav>
        )}
        <div className="storyboard-scroll-container">
          {/* 콘티 표는 폭을 훨씬 넓게 쓴다. 대본·컷 플랜은 읽는 화면이라
            한 줄이 길면 눈이 되돌아오기 힘들어 1100px로 묶지만, 콘티는
            그림·설명·샷·앵글을 나란히 놓고 비교하는 표라 열이 많다 —
            좁히면 설명 칸부터 줄어든다. */}
          <div className={`storyboard-list-inner${showStoryboardPanels && !panelGridView && !drawingWorkspaceOpen ? ' is-conte' : ''
            }`}>
            {showWriteScene && (
              <div className="inline-script-editor">
                <div className="editor-header">
                  <h3>Story</h3>
                  <p>
                    장면을 적거나 붙여넣으세요. 완성된 대본이 아니어도 됩니다 —
                    거친 메모나 간단한 대사도 괜찮습니다.
                  </p>
                </div>
                <label className="scene-intention-field">
                  <span>Scene intention <em>optional</em></span>
                  <textarea
                    className="scene-intention-input"
                    placeholder="예: 발견의 순간은 조용하지만 되돌릴 수 없게 느껴진다."
                    value={rawSceneIntention}
                    onChange={(event) => setRawSceneIntention(event.target.value)}
                    rows={3}
                  />
                </label>
                <textarea
                  className="screenplay-input"
                  placeholder={'물리학과 실험실, 밤\n\n하린이 노트북 화면을 들여다본다.\n노트에 식을 적다 지운다.\n\n하린이 연필을 내려놓고 등을 기댄다.'}
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
                      {structurePending ? '나누는 중…' : '씬·구간으로 나누기'}
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
                    <span>씬·구간 구조{structureError ? ' · 규칙 기반' : ''}</span>
                    <strong>
                      씬 {structureDraft.sceneCount}개 · 구간 {structureDraft.beatCount}개로 나눴습니다
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
                                구간 {String(element.beat + 1).padStart(2, '0')}
                              </div>
                            )}
                            {/* AI가 채운 줄은 구분해 보인다. 사용자가 자기가
                              쓰지 않은 것을 알아볼 수 있어야 한다. */}
                            <p
                              className={element.filled ? 'is-filled' : ''}
                              title={element.sourceEvidence?.length
                                ? `원문 근거: ${element.sourceEvidence.join(' · ')}`
                                : undefined}
                            >
                              {element.filled && <span className="structure-filled-badge">AI 보강</span>}
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
                {/* 제목 블록을 없앴다. 상단 단계 nav가 이미 `컷 플랜`을
                  가리키고 있어 같은 말이 두 번 나왔다. 표만 남긴다.
                  다만 출처를 밝히는 줄은 남는다 — 규칙 기반 결과나
                  검토를 건너뛴 것을 모델이 정한 것처럼 보이게 두지 않는다. */}
                {(cutPlanSkipped || cutPlanError) && (
                  <p className="cut-plan-origin-note">
                    {cutPlanSkipped
                      ? '컷 분해를 건너뛰어 자동 생성했습니다. 검토되지 않은 채 넘어갔습니다.'
                      : `AI 호출에 실패해 규칙 기반으로 나눴습니다 · ${cutPlanError}`}
                  </p>
                )}

                {/* 되돌리는 쪽만 남는다. 확정은 rail 아래 `다음 단계`로
                  옮겼다 — 대본 단계와 같은 자리에서 나가야 단계마다
                  길을 다시 찾지 않는다.
                  `장면 전체 지시`는 접었다 — 컷을 먼저 정하는 화면인데
                  입력칸이 표 위에 서 있으면 그것부터 채우게 된다.
                  값은 지워지지 않고 열면 그대로 있다. */}
                {/* 다시 나누는 동안 이 화면에 머문다. 표는 아직 이전 것이므로
                  무엇을 기다리는지 밝힌다 — 아니면 눌렀는데 아무 일도 없는
                  것처럼 보이고, 잠시 뒤 표가 소리 없이 바뀐다. */}
                {cutPlanRunPending && (
                  <p className="cut-plan-rerun-note">
                    {sceneStatePending
                      ? '인물·공간을 읽는 중…'
                      : cutPlanPending ? '컷을 다시 나누는 중…' : '샷을 정하는 중…'}
                    {' '}지금 표는 이전 결과입니다.
                  </p>
                )}

                <div className="cut-plan-toolbar">
                  <button type="button" onClick={backToScript} disabled={cutPlanRunPending}>
                    대본으로
                  </button>
                  <button type="button" onClick={requestCutPlan} disabled={cutPlanRunPending}>
                    {cutPlanRunPending ? '나누는 중…' : '다시 나누기'}
                  </button>
                  <button
                    type="button"
                    className={`cut-plan-scene-note-toggle${sceneNoteOpen ? ' is-open' : ''}${scenePromptNote.trim() ? ' has-value' : ''}`}
                    aria-expanded={sceneNoteOpen}
                    onClick={() => setSceneNoteOpen((open) => !open)}
                  >
                    장면 전체 지시
                    {!sceneNoteOpen && scenePromptNote.trim() && <i aria-hidden="true" />}
                  </button>
                </div>

                {/* 컷을 확인한 뒤 추가하는 공통 연출 기준이다. 대본 단계의
                  sceneIntention과 달리, 컷 분해 자체는 다시 바꾸지 않는다. */}
                {sceneNoteOpen && (
                  <div className="cut-plan-scene-note">
                    <div className="cut-plan-scene-note-heading">
                      <label htmlFor="scene-prompt-note">장면 전체 지시</label>
                      <p>적용 후 다음 샷 설계와 패널 생성에 공통으로 반영됩니다.</p>
                    </div>
                    <textarea
                      id="scene-prompt-note"
                      value={scenePromptNoteDraft}
                      onChange={(event) => setScenePromptNoteDraft(event.target.value)}
                      placeholder="예: 초반에는 공간을 넓게 유지하고, 발견이 드러난 뒤에는 인물에게 가까이 붙는다."
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
                )}

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
                                    구간 {String(group.beat + 1).padStart(2, '0')}
                                    <em>{group.items.length} cuts</em>
                                  </button>
                                </th>
                              </tr>
                              {!collapsed && group.items.map(({ item }) => {
                                const needsReview = reviewCutIds.has(item.id)
                                return (
                                  <Fragment key={item.id}>
                                    <tr
                                      data-cut-id={item.id}
                                      className={`provenance-row-${item.provenance.toLowerCase()}${selectedCutId === item.id ? ' selected' : ''}${needsReview ? ' needs-review' : ''}`}
                                      onClick={() => {
                                        // 진단이 짚어 보내 이미 골라져 있던 컷이면, 누른 것은
                                        // 끄려는 것이 아니라 여기서 직접 고치겠다는 뜻이다.
                                        // 그대로 토글하면 선택이 풀려 나누기·합치기가 안 열린다.
                                        const arrivedFromDiagnosis = selectedCutId === item.id && !cutSelectedFromTable
                                        setCutSelectedFromTable(true)
                                        if (!arrivedFromDiagnosis) {
                                          setSelectedCutId(selectedCutId === item.id ? null : item.id)
                                        }
                                      }}
                                    >
                                      <td className="col-cut">
                                        <span className="cut-plan-number">
                                          {item.beat + 1}-{item.beatOrder}
                                        </span>
                                        {needsReview && <span className="cut-plan-review-mark">확인</span>}
                                      </td>
                                      <td className="col-time">
                                        <div className="cut-plan-edit-control" onClick={(event) => event.stopPropagation()}>
                                          <input
                                            type="text"
                                            value={item.time}
                                            onChange={(event) => updateCutPlanItem(item.id, { time: event.target.value })}
                                            aria-label={`Cut ${item.order} time`}
                                          />
                                        </div>
                                      </td>
                                      <td className="col-place">
                                        <div className="cut-plan-edit-control" onClick={(event) => event.stopPropagation()}>
                                          <input
                                            type="text"
                                            value={item.place}
                                            onChange={(event) => updateCutPlanItem(item.id, { place: event.target.value })}
                                            aria-label={`Cut ${item.order} place`}
                                          />
                                        </div>
                                      </td>
                                      <td className="col-content">
                                        <div className="cut-plan-edit-control" onClick={(event) => event.stopPropagation()}>
                                          <input
                                            type="text"
                                            value={item.content}
                                            onChange={(event) => updateCutPlanItem(item.id, { content: event.target.value })}
                                            placeholder="이 컷에서 무엇이 일어나는가"
                                            aria-label={`Cut ${item.order} content`}
                                          />
                                        </div>
                                      </td>
                                      <td className="col-purpose">
                                        <div className="cut-plan-edit-control" onClick={(event) => event.stopPropagation()}>
                                          <input
                                            type="text"
                                            value={item.purpose}
                                            onChange={(event) => updateCutPlanItem(item.id, { purpose: event.target.value })}
                                            placeholder="이 컷이 존재하는 이유"
                                            aria-label={`Cut ${item.order} purpose`}
                                          />
                                        </div>
                                      </td>
                                      <td className="col-cast">
                                        <div className="cut-plan-edit-control" onClick={(event) => event.stopPropagation()}>
                                          <input
                                            type="text"
                                            value={item.characters}
                                            onChange={(event) => updateCutPlanItem(item.id, { characters: event.target.value })}
                                            aria-label={`Cut ${item.order} characters`}
                                          />
                                        </div>
                                      </td>
                                      <td className="col-shot">
                                        <div className="cut-plan-edit-control" onClick={(event) => event.stopPropagation()}>
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
                                        </div>
                                      </td>
                                      <td className="col-tools">
                                        <div className="cut-plan-row-tools" onClick={(event) => event.stopPropagation()}>
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
                                  </Fragment>
                                )
                              })}
                            </>
                          )}
                        </tbody>
                      )
                    })}
                  </table>
                </div>

                <footer className="cut-plan-footer">
                  {/* AI 출처 전체를 미확인으로 세면 사용자가 표 18행을 전부
                    검사해야 한다고 느낀다. 실제 예외만 센다. */}
                  <span>
                    {cutPlan.length} cuts
                    {reviewCutIds.size > 0 && (
                      <> · 확인할 것 {reviewCutIds.size}</>
                    )}
                  </span>
                </footer>
              </section>
            )}

            {isPanelPreparationStage && (
              <section className="panel-preparation" aria-label="Panel setup">
                <header>
                  <span>Panel setup</span>
                  <h2>패널의 표현 방식을 정합니다</h2>
                  <p>스타일은 미장센의 판단이 아니라, 이 보드 전체에 적용할 제작 설정입니다.</p>
                </header>
                <div className="panel-preparation-style">
                  <StylePresetPicker
                    value={panelStylePreset}
                    onChange={setPanelStylePreset}
                    layout="setup"
                    noteOf={stylePresetNote}
                  />
                </div>
                <footer>
                  <div>
                    <strong>{needsReferences ? '장면 기준 이미지' : '러프 콘티'}</strong>
                    <p>
                      {!needsReferences
                        ? '러프 콘티는 기준 이미지 없이 구도와 흐름부터 잡습니다.'
                        : referencesReadyForPanels
                          ? '필요한 인물·공간 기준 이미지가 준비되었습니다.'
                          : pendingReferenceRequirements.length > 0
                            ? `기준 이미지 ${pendingReferenceRequirements.length}개를 생성 중입니다.`
                            : `이 표현 방식에는 기준 이미지 ${missingReferenceRequirements.length}개가 필요합니다.`}
                    </p>
                  </div>
                  {/* 표현 방식을 고른 다음에 할 일이 무엇인지 화면이 직접
                  말한다. `준비하세요`는 서술이라 감독이 오른쪽 레일을 스스로
                  찾아 열고 카드를 하나씩 눌러야 했다. 여기서 첫 대상의 씬으로
                  옮겨 주면, 표현 방식을 적용한 것이 곧 레퍼런스를 만들라는
                  지시가 된다. */}
                  {needsReferences && missingReferenceRequirements.length > 0 && (
                    <button
                      type="button"
                      className="panel-preparation-open-mise"
                      onClick={goToReferenceRequirement}
                    >
                      인물·공간 기준 만들기 ({missingReferenceRequirements.length})
                    </button>
                  )}
                  <button
                    type="button"
                    className="panel-preparation-start"
                    onClick={completePanelPreparation}
                    disabled={!referencesReadyForPanels}
                    title={referencesReadyForPanels ? undefined : '필요한 인물·공간 기준 이미지를 준비한 뒤 시작할 수 있습니다'}
                  >
                    Panels 시작
                  </button>
                </footer>
              </section>
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
                    {eligibleScopeShots.length === 0
                      ? '모든 컷에 그림이 있습니다'
                      : `아직 그리지 않은 컷 ${eligibleScopeShots.length}개`}
                  </strong>
                  {/* 확정 직후에는 앞 아홉 장만 그린다. 남은 것이 왜 비어 있는지
                  말해 주지 않으면 생성이 실패한 것으로 읽힌다. */}
                  <p>
                    {eligibleScopeShots.length > 0
                      ? '먼저 앞부분을 그렸습니다. 나머지는 여기서 이어 그립니다.'
                      : '직접 그린 그림과 불러온 이미지는 그대로 둡니다.'}
                  </p>
                </div>
                <div className="generation-settings">
                  <label className="generation-model-picker">
                    <span>모델</span>
                    <select
                      value={panelImageModel}
                      onChange={(event) => setPanelImageModel(event.target.value)}
                      disabled={isGenerating}
                      aria-label="이미지 생성 모델"
                    >
                      <option value="gpt-image-1">GPT Image 1</option>
                      <option value="gpt-image-2">GPT Image 2</option>
                      <option value="flux-2-klein">FLUX.2 Klein (빠름)</option>
                    </select>
                  </label>
                </div>
                <div className="generation-bar-actions">
                  {/* 전체 생성은 한 번에 나오는데 화면은 Beat마다 한 줄씩
                  쌓아 보여 준다. 이어지는지 보려면 늘어놓고 봐야 한다. */}
                  <button
                    type="button"
                    className="generation-grid-toggle"
                    aria-pressed={panelGridView}
                    onClick={() => setPanelGridView((on) => !on)}
                    title={panelGridView ? '대본과 나란히 보기' : '패널만 격자로 모아 보기'}
                  >
                    {panelGridView ? '대본과 함께' : '한눈에 보기'}
                  </button>
                  {/* 초안은 바로 굳으므로 여기 남는 후보는 진단에서 다시 그린
                  것뿐이다. 그 판정은 검토 화면의 `이걸로 하기 / 버리고
                  되돌리기`가 받으므로 한 번에 승인하는 길은 두지 않는다. */}
                  <button
                    type="button"
                    className="generation-run"
                    disabled={eligibleScopeShots.length === 0 || isGenerating}
                    onClick={() => handleGeneratePanels(eligibleScopeShots, { autoAccept: true })}
                  >
                    {isGenerating ? `그리는 중… · ${generatingCount}` : (
                      <>
                        이어 그리기
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

            {/* 패널만 격자로 모은다. Beat 경계를 넘어 한 줄로 늘어놓아야
              컷이 이어지는지 보인다 — Beat마다 끊어 두면 그 안에서만
              비교하게 된다. */}
            {showStoryboardPanels && panelGridView && !drawingWorkspaceOpen && (
              <section className="sb-panel-grid" aria-label="패널 한눈에 보기">
                {lastPanelStructureChange?.kind === 'delete' && (
                  <aside className="sb-panel-undo" role="status">
                    <span>{lastPanelStructureChange.label}</span>
                    <button type="button" onClick={undoPanelStructureChange}>되돌리기</button>
                    <button type="button" aria-label="되돌리기 안내 닫기" onClick={() => setLastPanelStructureChange(null)}>×</button>
                  </aside>
                )}
                {flowShots.flatMap((shot, shotIdx) => {
                  const cut = cutPlan.find((item) => item.id === shot.cutPlanItemId)
                  // 대본과 함께 보기에서는 아직 확정하지 않은 AI 초안도 바로
                  // 보여 준다. 한눈에 보기도 같은 초안을 읽어야 두 보기의
                  // 상태가 어긋나지 않는다.
                  const candidate = panelCandidates[shot.id]
                  const displayImage = candidate?.image || getShotVisual(shot)
                  // 프롬프트 편집칸은 **구조를 방금 바꾼 칸**에만 연다.
                  // 그냥 아직 안 그린 컷까지 열면 격자 전체가 입력칸으로
                  // 뒤덮여, 컷이 어떻게 이어지는지 보러 온 화면이 폼이 된다.
                  // 그런 컷은 `비어 있음`으로 두고 위쪽 생성 바에서 한꺼번에
                  // 그린다 — 원래 그렇게 하던 일이다.
                  const isInsertedBlankPanel = !displayImage && !candidate
                    && Boolean(shot.mergedDraft || shot.splitDraft || shot.insertDraft)
                  const isDeleting = pendingPanelEdit?.shot?.id === shot.id
                    && pendingPanelEdit.kind === 'delete'
                  const nextShot = flowShots[shotIdx + 1]
                  const seam = nextShot ? seams[seamKeyFor(shot.id)] : null
                  const seamMarked = isSeamMarked(seam)
                  const seamOpen = openPanelSeamId === shot.id
                  const indexInRow = shotIdx % 3
                  const endsGridRow = indexInRow === 2
                  const seamDirection = ' is-horizontal is-forward'
                  const card = (
                    <article
                      key={shot.id || shotIdx}
                      className={`sb-panel-grid-card${activeShot === shotIdx ? ' is-active' : ''}`}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        className={`sb-panel-grid-item${candidate ? ' has-ai-candidate' : ''}`}
                        onClick={() => {
                          setFlowActiveShot(shotIdx)
                          setInspectedShotId(shot.id)
                        }}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return
                          if (event.key !== 'Enter' && event.key !== ' ') return
                          event.preventDefault()
                          setFlowActiveShot(shotIdx)
                          setInspectedShotId(shot.id)
                        }}
                      >
                        <span className="sb-panel-grid-order">{shotIdx + 1}</span>
                        {isInsertedBlankPanel ? (
                          <div className="sb-panel-grid-insert-draft" onClick={(event) => event.stopPropagation()}>
                            <div className="sb-panel-grid-insert-draft-head">
                              {/* 넣어서 빈 것, 합쳐서 빈 것, 나눠서 빈 것은
                                  다른 일이다. 같은 칸을 쓰되 무엇을 하는
                                  중인지는 밝힌다. */}
                              <span>
                                {shot.mergedDraft ? '합친 패널'
                                  : shot.splitDraft ? '나눈 패널' : '새 패널'}
                                {/* 앞 칸에서 물어보는 중이면 뒤 칸에도 알린다.
                                    두 칸을 함께 채우는데 한쪽만 반응하면
                                    나머지가 멈춘 것으로 보인다. */}
                                {shot.splitDraft === 'second'
                                  && aiInsertPendingCutId
                                  && aiInsertPendingCutId === flowShots[shotIdx - 1]?.cutPlanItemId
                                  && ' · 나눌 자리 찾는 중…'}
                              </span>
                              {/* 무엇을 묻는지가 셋 다 다르다. 합치기는 이어붙인
                                  두 문장에서 겹치는 부분을 지우는 일이고,
                                  나누기는 한 문장을 어디서 끊을지 정하는 일이라
                                  삽입 제안(넣을 것을 찾는 일)과 맞지 않는다. */}
                              {/* 나누기의 뒤 칸에는 버튼을 두지 않는다. 앞
                                  칸의 `나눌 자리 찾기` 하나가 두 칸을 함께
                                  채운다. */}
                              {shot.splitDraft !== 'second' && (
                                <button
                                  type="button"
                                  className="sb-panel-grid-ai-btn"
                                  disabled={
                                    aiInsertPendingCutId === cut?.id
                                    || Boolean(panelGenPending[shot.id])
                                  }
                                  onClick={() => {
                                    if (shot.mergedDraft) return handleTidyMergedContent(cut, shot)
                                    if (shot.splitDraft) return handleSplitSuggestion(cut, shot, shotIdx)
                                    return handleRequestAiInsert(cut)
                                  }}
                                >
                                  {panelGenPending[shot.id]
                                    ? '생성 중…'
                                    : aiInsertPendingCutId === cut?.id
                                      ? '보는 중…'
                                      : shot.mergedDraft ? '겹치는 부분 지우기'
                                        : shot.splitDraft ? '나눌 자리 찾기' : 'AI에 물어보기'}
                                </button>
                              )}
                            </div>

                            {aiInsertCandidatesMap[cut?.id]?.length > 0 && (
                              <div className="sb-panel-grid-ai-candidates">
                                {aiInsertCandidatesMap[cut.id].map((candidate, cIdx) => (
                                  <button
                                    key={cIdx}
                                    type="button"
                                    className="sb-panel-grid-ai-candidate-chip"
                                    title={candidate.purpose || candidate.content}
                                    disabled={Boolean(panelGenPending[shot.id])}
                                    onClick={() => {
                                      logScaffold({
                                        feature: 'alternative',
                                        action: 'select',
                                        target: cut.id,
                                        purpose: candidate.purpose,
                                      })
                                      updateCutPlanItem(cut.id, {
                                        content: candidate.content,
                                        purpose: candidate.purpose || '',
                                        provenance: 'AI',
                                      })
                                      handleGeneratePanels([{ shot, shotIdx }], {
                                        includeExisting: true,
                                        statusLabel: '새 이미지 생성 중…',
                                        // 삽입·합치기로 생긴 칸이다. 양옆
                                        // 그림을 물려야 같은 방·같은 조명으로
                                        // 이어진다 — 글로만 "이어지게"라고
                                        // 하면 같은 장면인지도 알 수 없다.
                                        neighbors: true,
                                      })
                                    }}
                                  >
                                    <strong>{candidate.content}</strong>
                                    {candidate.purpose && <em>{candidate.purpose}</em>}
                                  </button>
                                ))}
                              </div>
                            )}

                            {aiInsertErrorMap[cut?.id] && (
                              <p className="sb-panel-grid-ai-error">{aiInsertErrorMap[cut.id]}</p>
                            )}

                            <textarea
                              value={cut?.content || ''}
                              rows={3}
                              placeholder="이 패널의 프롬프트를 적으세요 (또는 AI 제안 선택)"
                              aria-label={`S${shotIdx + 1} 프롬프트`}
                              onChange={(event) => updateCutPlanItem(cut.id, { content: event.target.value })}
                            />
                          </div>
                        ) : displayImage
                          ? <img src={displayImage} alt={`패널 ${shotIdx + 1}`} />
                          : <span className="sb-panel-grid-blank">비어 있음</span>}
                        {candidate && <span className="sb-panel-grid-candidate">AI 초안</span>}
                        {/* 삭제는 그림 위 모서리의 ×다. 아래 줄에 두면 자주
                            쓰지도 않는 버튼이 카드마다 한 줄을 차지한다.
                            누르면 그 자리에서 한 번 더 묻는다 — 되돌릴 것이
                            남지 않는 조작이라 한 번에 지우지 않는다. */}
                        {flowShots.length > 1 && !isDeleting && (
                          <button
                            type="button"
                            className="sb-panel-grid-remove"
                            aria-label={`S${shotIdx + 1} 삭제`}
                            title="이 컷 삭제"
                            onClick={(event) => {
                              event.stopPropagation()
                              setPendingPanelEdit({ kind: 'delete', shot, shotIdx, cutId: cut?.id || null })
                            }}
                          >
                            ×
                          </button>
                        )}
                        {!isInsertedBlankPanel && <em>{cut?.content || ''}</em>}
                      </div>
                      {/* 이제 이 줄에는 `그리기`와 삭제 확인만 온다. 둘 다
                          없으면 줄 자체를 두지 않는다 — 빈 줄이 카드마다
                          자리를 차지하면 격자가 성기게 벌어진다. */}
                      {(isDeleting || isInsertedBlankPanel) && (
                      <div className="sb-panel-grid-actions" aria-label={`S${shotIdx + 1} 조작`}>
                        {isDeleting ? (
                          <>
                            <span className="sb-panel-grid-confirm-label">삭제할까요?</span>
                            <button type="button" className="danger" onClick={confirmPanelEdit}>삭제</button>
                            <button type="button" onClick={() => setPendingPanelEdit(null)}>취소</button>
                          </>
                        ) : (
                          <>
                            {isInsertedBlankPanel && (
                              <button
                                type="button"
                                disabled={Boolean(panelGenPending[shot.id]) || !cut?.content?.trim()}
                                onClick={() => {
                                  handleGeneratePanels([{ shot, shotIdx }], {
                                    includeExisting: true,
                                    statusLabel: '새 이미지 생성 중…',
                                    // 위와 같은 이유 — 이 칸은 삽입이나
                                    // 합치기로 생긴 자리다.
                                    neighbors: true,
                                  })
                                }}
                              >
                                {panelGenPending[shot.id] ? '생성 중…' : '생성'}
                              </button>
                            )}
                            {shot.mergedDraft && lastPanelStructureChange?.kind === 'merge' && (
                              <button type="button" onClick={undoPanelStructureChange}>되돌리기</button>
                            )}
                            {/* 나누기 버튼은 잠시 감춰 둔다 (2026-08-27).
                                삽입으로 대체되는지 보는 중이다. 로직
                                (`splitCut`, `handleSplitSuggestion`, 카드의
                                `splitDraft` 갈래)은 그대로 두었다 — 편집 렌즈와
                                `narrative_check`가 여전히 `split`을 제안하고,
                                GridView·DecisionBoard의 경로도 살아 있다.
                                되살리려면 이 블록의 주석만 풀면 된다.
                            {cut && (
                              <button
                                type="button"
                                onClick={() => {
                                  // 나누기도 확인창을 띄우지 않는다. 그 자리에서
                                  // 컷이 둘로 갈리고, 두 패널 카드 안에서 앞뒤로
                                  // 보낼 문장을 나눈다 — 삽입·합치기와 같은 규칙.
                                  splitCut(cut.id, { draft: true })
                                  setFlowActiveShot(shotIdx)
                                }}
                              >
                                나누기
                              </button>
                            )} */}
                          </>
                        )}
                      </div>
                      )}
                      {nextShot && !endsGridRow && (
                        <div className={`sb-panel-grid-seam${seamDirection}${seamMarked ? ' is-marked' : ''}${seamOpen ? ' is-open' : ''}`}>
                          <button
                            type="button"
                            className="sb-panel-grid-seam-trigger"
                            aria-expanded={seamOpen}
                            onClick={() => setOpenPanelSeamId((current) => current === shot.id ? null : shot.id)}
                          >
                            <span aria-hidden="true">┃</span>
                            <strong>{seamMarked ? SEAM_JOINS.find((item) => item.id === seam.join)?.label : '이음새'}</strong>
                            <small>{seamMarked ? SEAM_ELAPSED.find((item) => item.id === seam.elapsed)?.label : `S${shotIdx + 1} → S${shotIdx + 2}`}</small>
                          </button>
                          {seamOpen && (
                            <div className="sb-panel-grid-seam-editor" role="group" aria-label={`S${shotIdx + 1}과 S${shotIdx + 2} 이음새 설정`}>
                              <span>연결</span>
                              <div>
                                {SEAM_JOINS.map((item) => (
                                  <button
                                    type="button"
                                    key={item.id}
                                    className={(seam?.join || 'cut') === item.id ? 'active' : ''}
                                    title={item.hint}
                                    onClick={() => updateSeam(shot.id, { join: item.id })}
                                  >{item.label}</button>
                                ))}
                              </div>
                              <span>시간</span>
                              <div>
                                {SEAM_ELAPSED.map((item) => (
                                  <button
                                    type="button"
                                    key={item.id}
                                    className={(seam?.elapsed || 'continuous') === item.id ? 'active' : ''}
                                    title={item.hint}
                                    onClick={() => updateSeam(shot.id, { elapsed: item.id })}
                                  >{item.label}</button>
                                ))}
                              </div>
                              {cut && nextShot?.cutPlanItemId && (
                                <div className="sb-panel-grid-seam-structure-actions">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // 삽입은 별도 편집기를 열지 않는다. 이음새가
                                      // 가리킨 바로 그 자리에 빈 패널을 만들고,
                                      // 기본 패널 카드 안에서 프롬프트를 쓴다.
                                      addCutPlanItem(cut.id, cut.beat)
                                      setFlowActiveShot(shotIdx + 1)
                                      setOpenPanelSeamId(null)
                                    }}
                                  >사이에 넣기</button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // 합치기도 별도 편집기를 열지 않는다.
                                      // 두 컷이 그 자리에서 한 칸으로 합쳐지고,
                                      // 합쳐진 프롬프트가 그 패널 카드 안에
                                      // 들어간다 — 삽입과 같은 규칙이다.
                                      mergePanelCuts(cut.id, shotIdx)
                                    }}
                                  >합치기</button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  )

                  if (!nextShot || !endsGridRow) return card
                  return [
                    card,
                    <div className={`sb-panel-grid-seam sb-panel-grid-row-seam${seamMarked ? ' is-marked' : ''}${seamOpen ? ' is-open' : ''}`} key={`row-seam-${shot.id}`}>
                      {/* 카드 사이를 선으로 잇지 않는다. 카드 번호가 이미
                      순서대로 붙어 있고 버튼 라벨도 `S3 → S4`로 방향을
                      말하므로, 선은 정보량 대비 화면만 복잡하게 만든다
                      (가로 이음새를 뺀 것과 같은 이유). */}
                      <button
                        type="button"
                        className="sb-panel-grid-seam-trigger"
                        aria-expanded={seamOpen}
                        onClick={() => setOpenPanelSeamId((current) => current === shot.id ? null : shot.id)}
                      >
                        <span aria-hidden="true">↓</span>
                        <strong>{seamMarked ? SEAM_JOINS.find((item) => item.id === seam.join)?.label : '이음새'}</strong>
                        <small>{seamMarked ? SEAM_ELAPSED.find((item) => item.id === seam.elapsed)?.label : `S${shotIdx + 1} → S${shotIdx + 2}`}</small>
                      </button>
                      {seamOpen && (
                        <div className="sb-panel-grid-seam-editor" role="group" aria-label={`S${shotIdx + 1}과 S${shotIdx + 2} 이음새 설정`}>
                          <span>연결</span>
                          <div>
                            {SEAM_JOINS.map((item) => (
                              <button type="button" key={item.id} className={(seam?.join || 'cut') === item.id ? 'active' : ''} title={item.hint} onClick={() => updateSeam(shot.id, { join: item.id })}>{item.label}</button>
                            ))}
                          </div>
                          <span>시간</span>
                          <div>
                            {SEAM_ELAPSED.map((item) => (
                              <button type="button" key={item.id} className={(seam?.elapsed || 'continuous') === item.id ? 'active' : ''} title={item.hint} onClick={() => updateSeam(shot.id, { elapsed: item.id })}>{item.label}</button>
                            ))}
                          </div>
                          {cut && nextShot?.cutPlanItemId && (
                            <div className="sb-panel-grid-seam-structure-actions">
                              <button type="button" onClick={() => {
                                addCutPlanItem(cut.id, cut.beat)
                                setFlowActiveShot(shotIdx + 1)
                                setOpenPanelSeamId(null)
                              }}>사이에 넣기</button>
                              <button type="button" onClick={() => {
                                mergePanelCuts(cut.id, shotIdx)
                              }}>합치기</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>,
                  ]
                })}
              </section>
            )}

            {/* 絵コンテ 표. 컷이 한 행이고, 열은 `컷 번호 / 그림 / 설명 / 길이`다.
              Beat는 열지 않는다 — Beat는 대본을 나눈 단위이지 콘티를 읽는
              단위가 아니고, 행 사이에 끼면 컷 번호가 끊긴다. 씬은 남긴다:
              시공간이 바뀌는 자리는 콘티에서도 경계로 읽혀야 한다. */}
            {showStoryboardPanels && !panelGridView && !drawingWorkspaceOpen && (
              <section className="sb-conte" aria-label="대본과 함께 보기 · 콘티 표">
                <div className="sb-conte-head" role="row">
                  <span role="columnheader">컷</span>
                  <span role="columnheader">그림</span>
                  <span role="columnheader">설명</span>
                  {/* 샷과 앵글은 촬영이 정하는 값이다. 콘티 표에 두어야
                    컷을 훑으면서 크기가 어떻게 흘러가는지 보인다 —
                    한 컷씩 인스펙터를 열어 보면 그 흐름이 안 보인다. */}
                  <span role="columnheader">샷</span>
                  <span role="columnheader">앵글</span>
                  {/* 길이는 기본이 위임이다 — 비어 있는 칸은 후속 공정이
                    정할 자리라는 뜻이지 아직 안 적었다는 뜻이 아니다
                    (DG1 P3). 다만 감독이 정하고 싶으면 정할 수 있어야
                    한다. 그래서 열을 지우지 않고 입력을 받는다. */}
                  <span role="columnheader" className="is-delegated">
                    길이
                    <em>비우면 후속 공정</em>
                  </span>
                </div>

                {conteRows.map((row) => {
                  if (row.kind === 'scene') {
                    return (
                      <button
                        type="button"
                        key={`scene-${row.beat}`}
                        className={`sb-conte-scene${row.collapsed ? ' collapsed' : ''}`}
                        onClick={() => toggleScene(row.beat)}
                        aria-expanded={!row.collapsed}
                      >
                        <span className="sb-conte-scene-caret" aria-hidden="true">
                          {row.collapsed ? '▸' : '▾'}
                        </span>
                        <span>Scene {row.number}</span>
                        <strong>{row.text}</strong>
                        <em>{row.cutCount} cuts</em>
                      </button>
                    )
                  }

                  const { shot, shotIdx, cut: shotCut } = row
                  const cutLabel = shotCut
                    ? `Cut ${shotCut.order || shotIdx + 1}`
                    : `Panel ${shotIdx + 1}`
                  const committedImage = getShotVisual(shot)
                  const candidate = panelCandidates[shot.id]
                  const displayImage = candidate?.image || committedImage
                  // 앞 컷과의 이음새. 정한 것이 있을 때만 행 사이에 끼운다 —
                  // 전부 '컷 · 연속'인 기본값까지 그리면 실제로 정한 것이 묻힌다.
                  const prevShot = shotIdx > 0 ? flowShots[shotIdx - 1] : null
                  const seamBefore2 = prevShot ? seams[seamKeyFor(prevShot.id)] : null
                  const showSeam = isSeamMarked(seamBefore2)
                  // 이 컷이 그림 밖 채널로 남긴 것 (DG1 P3).
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
                  const hasArrows = (shot.arrows || []).length > 0
                  const visibleNotes = panelNotes.filter(
                    (note) => !(note.needsArrow && hasArrows),
                  )

                  return (
                    <Fragment key={shot.id || shotIdx}>
                      {showSeam && (
                        <div className="sb-conte-seam">
                          <span className="sb-seam-join">
                            {SEAM_JOINS.find((j) => j.id === seamBefore2.join)?.label}
                          </span>
                          {seamBefore2.elapsed !== 'continuous' && (
                            <span className="sb-seam-elapsed">
                              {SEAM_ELAPSED.find((e) => e.id === seamBefore2.elapsed)?.label}
                            </span>
                          )}
                          {seamBefore2.elision && (
                            <span className="sb-seam-elision">생략 · {seamBefore2.elision}</span>
                          )}
                        </div>
                      )}
                      <div
                        data-shot-id={shot.id}
                        className={`sb-conte-row${shotIdx === activeShot ? ' active-shot' : ''}${candidate ? ' has-ai-candidate' : ''}${inspectedShotId === shot.id ? ' inspected' : ''}`}
                        role="row"
                        onClick={() => {
                          setFlowActiveShot(shotIdx)
                          setInspectedShotId(shot.id)
                        }}
                      >
                        {/* 컷 번호. 콘티에서 컷을 부르는 이름이므로 가장 왼쪽에
                          두고, 스크롤 중에도 행의 시작을 잡아 준다. */}
                        <div className="sb-conte-no">
                          <span>{shotCut?.order || shotIdx + 1}</span>
                          <button
                            type="button"
                            className="sb-conte-delete"
                            disabled={flowShots.length <= 1}
                            title={flowShots.length <= 1 ? '씬에 컷이 하나는 남아야 합니다' : `${cutLabel} 삭제`}
                            aria-label={`${cutLabel} 삭제`}
                            onClick={(event) => {
                              event.stopPropagation()
                              handleDeleteShot(shot.id, shotIdx)
                            }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6" />
                            </svg>
                          </button>
                        </div>

                        {/* 그림. 콘티에서 가장 큰 칸이고, 손대는 일도 여기서
                          일어난다 — 그리기·재생성·화살표·메모를 그림 위에
                          모아 표가 버튼으로 채워지지 않게 한다. */}
                        <div className="sb-conte-pic">
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
                              {/* 표를 깔끔히 두기 위해 도구는 그림 위 hover로
                                모은다. 화살표·메모는 그리는 중일 때 계속
                                보여야 하므로 그때는 hover가 풀려도 남긴다. */}
                              <div className={`sb-conte-tools${arrowDrawingShotId === shot.id || noteEditingShotId === shot.id ? ' pinned' : ''}`}>
                                <button
                                  className="sb-action-btn"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    handleEditShot(shotIdx, shot.scriptBeat ?? shotCut?.beat ?? 0)
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
                                  재생성
                                </button>
                                <button
                                  type="button"
                                  className={`sb-action-btn icon${arrowDrawingShotId === shot.id ? ' active' : ''}`}
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
                                  {arrowDrawingShotId === shot.id ? '그리는 중' : '카메라'}
                                </button>
                                <button
                                  type="button"
                                  className={`sb-action-btn icon${noteEditingShotId === shot.id ? ' active' : ''}`}
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
                          ) : (
                            <div className="sb-add-shot existing-empty">
                              <span>{cutLabel}</span>
                              <small>Choose how to start</small>
                              <div className="sb-empty-panel-actions">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    handleEditShot(shotIdx, shot.scriptBeat ?? shotCut?.beat ?? 0)
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
                        </div>

                        {/* 설명. 콘티의 Action Notes 자리다. 대사·효과음 칸은
                          두지 않는다 — 대본이 그 줄 종류를 갖지 않기로 했고
                          (`SCRIPT_LINE_TYPES`), 빈 칸만 남으면 아직 안 적은
                          것으로 읽힌다. */}
                        <div className="sb-conte-caption">
                          {shotCut?.purpose && (
                            <span className="sb-conte-purpose">{shotCut.purpose}</span>
                          )}
                          {/* 컷 내용은 여기서 고친다. 이 문장이 그대로 그림
                            프롬프트의 본문이 되므로(`buildCutPrompt`),
                            프롬프트를 따로 열어 고치는 것보다 여기서
                            고치고 다시 그리는 편이 짧다. */}
                          {shotCut && (
                            <ConteContent
                              key={`${shotCut.id}:${shotCut.content || ''}`}
                              cutId={shotCut.id}
                              value={shotCut.content || ''}
                              onCommit={(next) => (
                                next !== (shotCut.content || '')
                                && updateCutPlanItem(shotCut.id, { content: next })
                              )}
                            />
                          )}
                          {shot.note && <p className="sb-conte-note">{shot.note}</p>}
                          {/* 아직 그리지 않은 그림 밖 채널만 남긴다. 이미
                            그렸으면 화살표가 그 자리에 있으므로 한 번 더
                            말하지 않는다. */}
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

                          {/* 무엇을 그림에서 정하고 무엇을 촬영에 넘길지
                            (DG1 P3). 컷마다 매번 볼 것은 아니라 접어 두되,
                            판정하지 않은 것이 남아 있으면 그 수를 밖에
                            보여 준다 — 접힌 채로 잊히면 AI 가정이 그대로
                            굳는다 (DG1 P2). */}
                          {shotCut && (() => {
                            const scoped = (decl) => (
                              decl.scope === 'scene' || decl.cutId === shotCut.id
                            )
                            const undecided = deferredDeclarations.filter(scoped)
                            const decided = acceptedDeclarations.filter(scoped)
                            if (undecided.length === 0 && decided.length === 0) return null
                            return (
                              <details className="sb-conte-decl">
                                <summary>
                                  <span>이미지가 정할 것</span>
                                  {undecided.length > 0 && <em>{undecided.length} 미정</em>}
                                </summary>
                                <ul>
                                  {[...undecided, ...decided].map((decl) => {
                                    const isDecided = decl.status === 'Accepted'
                                    return (
                                      <li key={decl.id} className={isDecided ? 'is-decided' : ''}>
                                        <div className="sb-conte-decl-head">
                                          <strong>{decl.element}</strong>
                                          {!isDecided && <span className="deferred-mark">미정</span>}
                                          <button
                                            type="button"
                                            className="deferred-dismiss"
                                            title={isDecided ? '선언 해제' : '이 요소는 선언하지 않는다'}
                                            aria-label={`${decl.element} ${isDecided ? '선언 해제' : '선언하지 않음'}`}
                                            onClick={() => rejectDeclaration(decl.id)}
                                          >
                                            ×
                                          </button>
                                        </div>
                                        {/* 칩을 고르는 것이 곧 판정이다. AI 기본값을
                                          그대로 두면 판정하지 않은 것으로 남는다. */}
                                        <div className={`deferred-chips${isDecided ? '' : ' is-proposed'}`}>
                                          {RESPONSIBILITY_LEVELS.map((level) => (
                                            <button
                                              key={level.id}
                                              type="button"
                                              className={decl.responsibility === level.id ? 'active' : ''}
                                              title={isDecided ? level.hint : `${level.hint} · AI 제안, 눌러서 확정`}
                                              onClick={() => decideDeclaration(decl.id, level.id)}
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
                            )
                          })()}
                        </div>

                        {/* 샷·앵글. 값이 없으면 촬영이 아직 안 정한 것이다 —
                          기본값을 채워 두면 정해진 것처럼 읽혀 촬영을
                          부르지 않고 넘어가게 된다 (DG1 P2). */}
                        <div
                          className="sb-conte-framing"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <FramingPicker
                            label="샷 크기"
                            placeholder="미정"
                            value={shotCut?.shotSize || ''}
                            options={cutPlanShotSizes}
                            kind="shot"
                            disabled={!shotCut}
                            onChange={(next) => updateCutPlanItem(shotCut.id, { shotSize: next })}
                          />
                        </div>
                        <div
                          className="sb-conte-framing"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <FramingPicker
                            label="앵글"
                            placeholder="미정"
                            value={shotCut?.angle || ''}
                            options={cutPlanAngles}
                            kind="angle"
                            disabled={!shotCut}
                            onChange={(next) => updateCutPlanItem(shotCut.id, { angle: next })}
                          />
                        </div>

                        {/* 길이 칸. 비워 두면 후속 공정에 넘긴 것이고(DG1 P3),
                          적으면 그때부터 스토리보드가 정한 값이다. 둘을
                          화면에서 갈라 둬야 빈 칸이 '아직 안 적음'으로
                          읽히지 않는다. */}
                        <div
                          className={`sb-conte-dur${shotCut?.duration ? ' is-set' : ''}`}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type="text"
                            inputMode="decimal"
                            value={shotCut?.duration || ''}
                            placeholder="—"
                            aria-label={`${cutLabel} 길이`}
                            title={shotCut?.duration
                              ? '컷 길이. 지우면 후속 공정에 넘깁니다.'
                              : '비어 있으면 후속 공정이 정합니다. 직접 적으려면 입력하세요.'}
                            disabled={!shotCut}
                            onChange={(event) => (
                              updateCutPlanItem(shotCut.id, { duration: event.target.value })
                            )}
                          />
                        </div>
                      </div>
                    </Fragment>
                  )
                })}
              </section>
            )}

            {/* Panel setup은 제작 설정만 다루는 독립 단계다. 여기 대본까지
              남기면 스타일을 고르는 화면 아래에 다른 작업이 붙어 보인다.
              축소 화면·Script에서만 대본을 렌더한다.
              Panels에서는 안의 sb-item 목록만 걸러서는 부족하다 — SCENE
              헤더 카드 자체가 격자·콘티 표 아래에 빈 껍데기로 남는다.
              Panels의 씬 구분은 격자 자체(Scene 라벨)와 콘티 표 헤더가
              이미 맡고 있으므로 이 카드가 필요 없다. */}
            {(!isExpanded || isScriptStage) && scriptSceneGroups.map((sceneGroup, sceneIndex) => {
              const openingBeat = sceneGroup.beats[0]?.beatGroup?.beat
              const sceneCollapsed = isSceneCollapsed(openingBeat)
              const heading = sceneGroup.heading
              const sceneLineCount = sceneGroup.beats.reduce(
                (count, { beatGroup }) => count + beatGroup.elements.filter((element) => element.type !== 'scene-heading').length,
                0,
              )
              return (
                <section
                  key={sceneGroup.id}
                  className={`script-scene-card${sceneCollapsed ? ' is-collapsed' : ''}${isScriptStage ? ' is-script-stage' : ''}`}
                >
                  <header className="script-scene-card-header">
                    <button
                      type="button"
                      className="script-scene-toggle"
                      onClick={() => toggleScene(openingBeat)}
                      aria-expanded={!sceneCollapsed}
                      aria-label={`Scene ${sceneIndex + 1} ${sceneCollapsed ? '펼치기' : '접기'}`}
                    >
                      {sceneCollapsed ? '▸' : '▾'}
                    </button>
                    <span>SCENE {sceneIndex + 1}</span>
                    {isScriptStage && heading ? (
                      <input
                        value={heading.text}
                        aria-label={`Scene ${sceneIndex + 1} 제목`}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => updateScreenplayLine(heading.globalIdx, event.target.value)}
                      />
                    ) : (
                      <strong>{heading?.text || `장면 ${sceneIndex + 1}`}</strong>
                    )}
                    <em>{isScriptStage ? `${sceneLineCount}줄` : `${sceneGroup.beats.length}개 구간`}</em>
                  </header>
                  {!sceneCollapsed && sceneGroup.beats.map(({ beatGroup, index: i }) => {
              // 접힌 씬의 Beat는 그리지 않는다. 씬을 여는 Beat는 남겨야
              // 헤더가 보이고 다시 펼 수 있다.
              if (isSceneCollapsed(beatGroup.beat)) return null
              const beatShots = getBeatShots(beatGroup.beat)
              const beatSuggestions = narrativeSuggestions.filter((suggestion) => suggestion.beat === beatGroup.beat)
              const inlineSuggestionTypes = new Set(['split-beat', 'insert-script-line', 'replace-script-line'])
              const nonBoundarySuggestions = beatSuggestions.filter((suggestion) => !inlineSuggestionTypes.has(suggestion.type))

              // Panels 단계에서는 이 대본형 컷 목록을 그리지 않는다. 격자
              // 보기든 콘티 표 보기든 이미 같은 패널을 보여 주므로, 함께
              // 그리면 옛 버전의 세로 목록이 그 아래에 그대로 남아 두 번
              // 보인다.
              if (showStoryboardPanels) return null

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
                    {beatGroup.elements[0]?.type === 'scene-heading' && !isScriptStage && (
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
                        {!isScriptStage && beats.length > 1 && (
                          <div className="sb-beat-label">
                            <span>구간 {String(beatGroup.beat + 1).padStart(2, '0')}</span>
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
                                  title="이 구간 다음에 새 구간 추가"
                                >
                                  + 구간
                                </button>
                                {/* 첫 Beat에는 위로 합칠 대상이 없다. 그 자리에
                              맨 앞에 Beat를 넣는 길을 둔다. */}
                                {i === 0 && (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleAddBeatAtStart()
                                    }}
                                    title="이 구간 앞에 새 구간 추가"
                                  >
                                    ↑ 구간
                                  </button>
                                )}
                                {i > 0 && (
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      mergeBeat(beatGroup.elements[0].globalIdx)
                                    }}
                                    title="위 구간과 합치기"
                                  >
                                    ↑ 합치기
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {(isScriptStage
                          ? beatGroup.elements.filter((element) => element.type !== 'scene-heading')
                          : beatGroup.elements
                        ).map((el) => {
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
                                    showTools={isScriptStage}
                                    showTypeControl={!isScriptStage}
                                    autoFocus={pendingFocus?.index === el.globalIdx}
                                    focusCaret={pendingFocus?.caret}
                                    onFocused={clearPendingFocus}
                                    onMoveFocus={handleMoveFocus}
                                    filled={el.filled}
                                    flagged={flaggedLineIndexes.has(el.globalIdx)}
                                  />
                                ) : (
                                  <div
                                    className={`sb-script-${el.type}${el.filled ? ' is-filled' : ''}${flaggedLineIndexes.has(el.globalIdx) ? ' is-flagged' : ''}`}
                                    title={el.filled ? 'AI가 채운 줄입니다' : undefined}
                                  >
                                    {el.text}
                                  </div>
                                )}
                                {/* Beat 나누기는 줄 편집 모드에서만. 평소 hover마다
                            버튼이 튀어나오면 대본 읽기를 방해한다. */}
                                {!isScriptStage && (
                                  <button
                                    className={`split-beat-btn${editingBeat === beatGroup.beat ? ' always-on' : ''}`}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      splitBeat(el.globalIdx + 1)
                                    }}
                                    title="Split here"
                                  >
                                    + 구간 나누기
                                  </button>
                                )}
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
                          const committedImage = getShotVisual(shot)
                          const candidate = panelCandidates[shot.id]
                          const displayImage = candidate?.image || committedImage
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
                                className={`sb-shot-card ${shotIdx === activeShot ? 'active-shot' : ''} ${candidate ? 'has-ai-candidate' : ''} ${inspectedShotId === shot.id ? 'inspected' : ''}`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setInspectedShotId(shot.id)
                                }}
                              >
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
                                        재생성
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
                </section>
              )
            })}
            {showStoryboardPanels && !drawingWorkspaceOpen && onEnterReview && (
              <div className="panels-review-next">
                <button
                  type="button"
                  onClick={onEnterReview}
                  title="렌즈와 관객 관점으로 패널을 검토합니다"
                >
                  검토로 넘어가기 →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
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
              {/* 대본 단계에서만. 컷 플랜에서는 대본을 바꾸지 않으므로
                Script collaborator가 할 일이 없다 — 남겨 두면 컷을 보다가
                대본을 고치게 되고, 그 단계에서 정한 컷 분해와 어긋난다.
                컷 구성 점검은 Editing으로 옮겼다. */}
              {cutStage === 'script' && (
                <section className={`rail-agent rail-agent--narrative${openAgent === 'narrative' ? ' open' : ''}`}>
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
                            narrativeRequestRecall.resetNavigation(event.target.value)
                            // 새 요청을 쓰기 시작하면 지난 결과를 지운다. 계속 떠
                            // 있으면 방금 쓴 요청에 대한 답으로 오해된다.
                            if (narrativeAnswered) clearNarrativeResult()
                          }}
                          onKeyDown={narrativeRequestRecall.onKeyDown}
                          placeholder="예: 이 Scene의 정보 공개 흐름이 자연스러운지 봐줘."
                          aria-label={`Narrative request for ${activeScriptSceneTitle}`}
                          rows={3}
                        />
                        <div>
                          <span>{`${activeScriptSceneTitle} · ${activeScriptSceneBeatCount}개 구간`}</span>
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
                  쪽이다. 같은 일의 두 방향이므로 붙여 둔다.
                  컷 구성 점검은 Editing으로 갔다 — 여기는 대본만 본다. */}
                      {scriptLines.length > 0 && renderNarrativeCheck('script')}

                      {/* 요청을 넘긴 뒤 칸이 비므로, 무엇이 진행 중인지 여기서
                  보인다. 아니면 아무 일도 없는 것처럼 보인다. */}
                      {narrativePending && (
                        <div className="narrative-rail-proposal-status pending">
                          <span>…</span>
                          <div>
                            <strong>{activeScriptSceneTitle} 검토 중</strong>
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
                              현재 Scene 전체를 보고 답합니다. 특정 구간을 언급하거나,
                              “뒷부분이 급하다”처럼 Scene의 흐름을 두고 말해도 됩니다.
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
              )}

              {/* 컷 플랜의 미장센은 값을 직접 관리하지 않는다. 컷들 사이에서
                필요한 요소·관계·동선이 성립하는지 먼저 점검하고, 고칠 곳은
                컷 표에서 고른다. */}
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
                      <span>Staging check</span>
                    </div>
                    {miseFindings.length > 0 && (
                      <em className="rail-agent-badge is-open">{miseFindings.length}</em>
                    )}
                    <svg className="rail-agent-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {openAgent === 'mise' && (
                    <div className="rail-agent-body">
                      <button
                        type="button"
                        className="rail-lens-primary is-mise"
                        onClick={requestMiseCheck}
                        disabled={miseCheckPending || cutPlan.length === 0}
                      >
                        {miseCheckPending ? '배치 점검 중…' : '배치·동선 다시 점검'}
                      </button>
                      {miseCheckError && <p className="rail-lens-error">AI 호출 실패 · {miseCheckError}</p>}
                      {miseCheck && !miseCheckPending && miseFindings.length === 0 && (
                        <p className="rail-check-summary">걸리는 것이 없습니다.</p>
                      )}
                      <DiagnosisList
                        findings={miseFindings}
                        emptyLabel=""
                        onGoTo={goToFindingCut}
                        cutLabelOf={cutLabelOf}
                      />
                    </div>
                  )}
                </section>
              )}

              {/* Panel setup의 미장센은 레퍼런스 준비만 맡는다. */}
              {cutStage === 'preparation' && (
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
                      <span>Reference preparation</span>
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
                      {/* 리드 문장은 두지 않는다. 에이전트 이름과 아래 내용이
                      이미 무엇을 하는 자리인지 말한다. */}
                      {/* 대본에 있는 것만 읽는다. 없는 것은 지어내지 않고
                      '미정'으로 남긴다 — 무엇이 안 정해졌는지 보여야
                      창작자가 판정할 수 있다 (DG1 P2). */}
                      {!hasActiveSceneState && (
                        <button
                          type="button"
                          className="rail-lens-primary is-mise"
                          onClick={requestSceneStates}
                          disabled={sceneStatePending || screenplay.length === 0}
                        >
                          {sceneStatePending ? '읽는 중…' : '대본에서 인물·공간 읽기'}
                        </button>
                      )}
                      {sceneStateError && (
                        <p className="rail-lens-error">AI 호출 실패 · {sceneStateError}</p>
                      )}

                      {hasActiveSceneState ? (
                        <>
                          {isPanelPreparationStage && scriptScenes.length > 1 && (
                            <div className="rail-scene-switcher" aria-label="씬 기준 선택">
                              {scriptScenes.map((scriptScene) => (
                                <button
                                  key={scriptScene.id}
                                  type="button"
                                  className={scriptScene.id === activeSceneId ? 'is-active' : ''}
                                  onClick={() => setActiveBeat(scriptScene.startBeat)}
                                >
                                  Scene {scriptScene.number}
                                </button>
                              ))}
                            </div>
                          )}
                          {isCutPlanStage && (
                            <div className="mise-staging-plan">
                              <div className="mise-staging-context">
                                <span>현재 장면</span>
                                <strong>{visibleSceneState.location?.name || '공간 미정'}</strong>
                                <em>{visibleSceneState.characters.map((character) => character.name).join(' · ') || '등장 인물 미정'}</em>
                              </div>
                              <ol>
                                {activeSceneCuts.map((cut) => (
                                  <li key={cut.id}>
                                    <strong>컷 {cut.beat + 1}-{cut.beatOrder}</strong>
                                    <span>{cut.characters || '인물 미정'} · {cut.place || visibleSceneState.location?.name || '공간 미정'}</span>
                                    <p>{cut.content || cut.purpose || '행동 미정'}</p>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                          {/* Panel setup에서만 기준 그림을 준비한다. 컷 플랜에서는
                      장면 배치와 연속성을 먼저 정하므로 표현 스타일과 무관하게
                      인물·공간 값을 편집할 수 있어야 한다. 러프 콘티는 기준 그림이 필요 없다. 얼굴이 빈 타원이고
                      공간이 선 몇 개인 그림에 "같은 인물로 이어지게" 할 것이
                      없다 — 화풍은 앵커가 잡는다.
                      디테일·실사에서만 레퍼런스를 세운다. */}
                          {isPanelPreparationStage && panelStylePreset === 'rough' ? (
                            <p className="rail-scene-rough-note">
                              러프 콘티는 기준 그림 없이 구도만 잡습니다.
                              인물·공간 기준은 디테일 스케치부터 필요합니다.
                            </p>
                          ) : isPanelPreparationStage ? (
                            <ul className="rail-scene-state">
                              {newReferenceCharacters.map((character) => {
                                const referenceOpen = openReferenceCards[character.id] && character.image
                                const editKey = `${activeSceneId}:${character.id}`
                                const referenceEditing = Boolean(editingReferenceCards[editKey])
                                const settledSummary = character.facts
                                  .filter((fact) => fact.value)
                                  .map((fact) => fact.value)
                                  .join(' · ')
                                const openFactCount = character.facts.filter((fact) => fact.open).length
                                return (
                                  <li key={character.id} className={`rail-scene-reference-card${isPanelPreparationStage && referenceOpen ? ' is-reference-open' : ' is-info-open'}`}>
                                    <div className="rail-reference-card-inner">
                                      <div
                                        className={`rail-reference-face rail-reference-info${isPanelPreparationStage && character.image ? ' is-flippable' : ''}`}
                                        onClick={(event) => {
                                          // 카드 면의 빈 곳만 뒤집는다. 수정·재생성처럼
                                          // 카드 안의 조작을 누를 때는 편집 상태를 열고
                                          // 같은 클릭으로 레퍼런스 면까지 넘기지 않는다.
                                          if (event.target.closest('button, input, select, textarea')) return
                                          if (isPanelPreparationStage && character.image) {
                                            setOpenReferenceCards((current) => ({ ...current, [character.id]: true }))
                                          }
                                        }}
                                        onKeyDown={(event) => {
                                          if (isPanelPreparationStage && character.image && (event.key === 'Enter' || event.key === ' ')) {
                                            event.preventDefault()
                                            setOpenReferenceCards((current) => ({ ...current, [character.id]: true }))
                                          }
                                        }}
                                        role={isPanelPreparationStage && character.image ? 'button' : undefined}
                                        tabIndex={isPanelPreparationStage && character.image ? 0 : undefined}
                                        aria-label={isPanelPreparationStage && character.image ? `${character.name} 레퍼런스 보기` : undefined}
                                      >
                                        <div className="rail-scene-head">
                                          <strong>{character.name}</strong>
                                          <em>{character.summary}</em>
                                          {isPanelPreparationStage && !character.image && (
                                            <button
                                              type="button"
                                              className="rail-reference-trigger"
                                              onClick={() => generateReferenceFromCutPlan('character', character.id)}
                                              disabled={isReferenceImagePending('character', character.id)}
                                            >
                                              {isReferenceImagePending('character', character.id) ? '그리는 중…' : '레퍼런스 생성'}
                                            </button>
                                          )}
                                          {isPanelPreparationStage && character.image && (
                                            <button
                                              type="button"
                                              className="rail-reference-regenerate"
                                              onClick={(event) => {
                                                event.stopPropagation()
                                                generateReferenceFromCutPlan('character', character.id)
                                              }}
                                              disabled={isReferenceImagePending('character', character.id)}
                                            >
                                              {isReferenceImagePending('character', character.id) ? '다시 그리는 중…' : '다시 생성'}
                                            </button>
                                          )}
                                          {isPanelPreparationStage && staleStyleLabel(character) && (
                                            <span className="rail-reference-stale-style">
                                              {staleStyleLabel(character)}
                                            </span>
                                          )}
                                          <button
                                            type="button"
                                            className="rail-reference-edit"
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              setEditingReferenceCards((current) => ({
                                                ...current,
                                                [editKey]: !current[editKey],
                                              }))
                                            }}
                                          >
                                            {referenceEditing ? '완료' : '수정'}
                                          </button>
                                        </div>
                                        {!referenceEditing && (
                                          <div className="rail-reference-summary">
                                            <p>{settledSummary || '대본에서 확인된 외형 기준이 없습니다.'}</p>
                                            {openFactCount > 0 && <em>{openFactCount}개 미정</em>}
                                          </div>
                                        )}
                                        {referenceEditing && character.facts.map((fact) => (
                                          <SceneFactRow
                                            key={fact.label}
                                            fact={fact}
                                            // 기본은 작품 기준을 고치는 것이다 — 이 인물이
                                            // 나오는 모든 씬이 함께 바뀐다.
                                            onCommit={(value) => setSceneFact('character', fact.label, value, { characterId: character.id })}
                                            onScopedCommit={(value) => setSceneFact('character', fact.label, value, { characterId: character.id, scoped: true })}
                                            onRevert={() => clearCharacterOverride(character.id, fact.label)}
                                          />
                                        ))}
                                      </div>
                                      {isPanelPreparationStage && character.image && (
                                        <div
                                          className="rail-reference-face rail-reference-preview"
                                          onClick={() => setOpenReferenceCards((current) => ({ ...current, [character.id]: false }))}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                              event.preventDefault()
                                              setOpenReferenceCards((current) => ({ ...current, [character.id]: false }))
                                            }
                                          }}
                                          role="button"
                                          tabIndex={0}
                                          aria-label={`${character.name} 정보 카드 보기`}
                                        >
                                          <img src={character.image} alt={`${character.name} 레퍼런스`} />
                                          <button
                                            type="button"
                                            className="rail-reference-lightbox-trigger"
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              setReferenceLightbox({ src: character.image, alt: `${character.name} 레퍼런스`, cardKey: character.id })
                                            }}
                                          >
                                            크게 보기
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </li>
                                )
                              })}

                              {newReferenceLocation && (() => {
                                const location = newReferenceLocation
                                const referenceOpen = openReferenceCards.location && location.image
                                const editKey = `${activeSceneId}:location`
                                const referenceEditing = Boolean(editingReferenceCards[editKey])
                                const settledSummary = location.facts
                                  .filter((fact) => fact.value)
                                  .map((fact) => fact.value)
                                  .join(' · ')
                                const openFactCount = location.facts.filter((fact) => fact.open).length
                                return (
                                  <li className={`rail-scene-reference-card${isPanelPreparationStage && referenceOpen ? ' is-reference-open' : ' is-info-open'}`}>
                                    <div className="rail-reference-card-inner">
                                      <div
                                        className={`rail-reference-face rail-reference-info${isPanelPreparationStage && location.image ? ' is-flippable' : ''}`}
                                        onClick={(event) => {
                                          if (event.target.closest('button, input, select, textarea')) return
                                          if (isPanelPreparationStage && location.image) {
                                            setOpenReferenceCards((current) => ({ ...current, location: true }))
                                          }
                                        }}
                                        onKeyDown={(event) => {
                                          if (isPanelPreparationStage && location.image && (event.key === 'Enter' || event.key === ' ')) {
                                            event.preventDefault()
                                            setOpenReferenceCards((current) => ({ ...current, location: true }))
                                          }
                                        }}
                                        role={isPanelPreparationStage && location.image ? 'button' : undefined}
                                        tabIndex={isPanelPreparationStage && location.image ? 0 : undefined}
                                        aria-label={isPanelPreparationStage && location.image ? `${location.name} 레퍼런스 보기` : undefined}
                                      >
                                        <div className="rail-scene-head">
                                          <strong>{location.name}</strong><em>공간</em>
                                          {isPanelPreparationStage && !location.image && (
                                            <button type="button" className="rail-reference-trigger" onClick={() => generateReferenceFromCutPlan('location')} disabled={isReferenceImagePending('location')}>
                                              {isReferenceImagePending('location') ? '그리는 중…' : '레퍼런스 생성'}
                                            </button>
                                          )}
                                          {isPanelPreparationStage && location.image && (
                                            <button
                                              type="button"
                                              className="rail-reference-regenerate"
                                              onClick={(event) => {
                                                event.stopPropagation()
                                                generateReferenceFromCutPlan('location')
                                              }}
                                              disabled={isReferenceImagePending('location')}
                                            >
                                              {isReferenceImagePending('location') ? '다시 그리는 중…' : '다시 생성'}
                                            </button>
                                          )}
                                          {isPanelPreparationStage && staleStyleLabel(location) && (
                                            <span className="rail-reference-stale-style">
                                              {staleStyleLabel(location)}
                                            </span>
                                          )}
                                          <button
                                            type="button"
                                            className="rail-reference-edit"
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              setEditingReferenceCards((current) => ({
                                                ...current,
                                                [editKey]: !current[editKey],
                                              }))
                                            }}
                                          >
                                            {referenceEditing ? '완료' : '수정'}
                                          </button>
                                        </div>
                                        {!referenceEditing && (
                                          <div className="rail-reference-summary">
                                            <p>{settledSummary || '대본에서 확인된 공간 기준이 없습니다.'}</p>
                                            {openFactCount > 0 && <em>{openFactCount}개 미정</em>}
                                          </div>
                                        )}
                                        {referenceEditing && location.facts.map((fact) => (
                                          <SceneFactRow
                                            key={fact.label}
                                            fact={fact}
                                            onCommit={(value) => setSceneFact('location', fact.label, value)}
                                          />
                                        ))}
                                      </div>
                                      {isPanelPreparationStage && location.image && (
                                        <div
                                          className="rail-reference-face rail-reference-preview is-location"
                                          onClick={() => setOpenReferenceCards((current) => ({ ...current, location: false }))}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                              event.preventDefault()
                                              setOpenReferenceCards((current) => ({ ...current, location: false }))
                                            }
                                          }}
                                          role="button"
                                          tabIndex={0}
                                          aria-label={`${location.name} 정보 카드 보기`}
                                        >
                                          <img src={location.image} alt={`${location.name} 레퍼런스`} />
                                          <button
                                            type="button"
                                            className="rail-reference-lightbox-trigger"
                                            onClick={(event) => {
                                              event.stopPropagation()
                                              setReferenceLightbox({ src: location.image, alt: `${location.name} 레퍼런스`, cardKey: 'location' })
                                            }}
                                          >
                                            크게 보기
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </li>
                                )
                              })()}

                              {visibleSceneState.environment?.facts?.length > 0 && (
                                <li>
                                  <div className="rail-scene-head">
                                    <strong>환경</strong>
                                    <em>씬 전체</em>
                                  </div>
                                  {/* 화풍은 씬 기준 항목이 아니라 `표현 스타일`이 정한다.
                            이 filter는 그 칸이 있던 시절에 저장된 상태를 위한
                            것이다 — 값이 남아 있어도 목록에 다시 나타나지
                            않게 한다. */}
                                  {visibleSceneState.environment.facts
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
                          ) : null}
                          <button
                            type="button"
                            className="rail-scene-reread"
                            onClick={requestSceneStates}
                            disabled={sceneStatePending || screenplay.length === 0}
                          >
                            {sceneStatePending ? '다시 읽는 중…' : '대본에서 다시 읽기'}
                          </button>
                        </>
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
                    {/* 샷 미정은 진단 카드로 내지 않는다(고칠 자리가 카드가
                      아니라 아래 버튼이다). 대신 배지로 알린다 — 접어 두면
                      아무 데도 안 보여서 미정인 채로 넘어가게 된다. */}
                    {undecidedShots > 0 && (
                      <em className="rail-agent-badge is-warn">{undecidedShots}컷 미정</em>
                    )}
                    <svg className="rail-agent-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {openAgent === 'camera' && (
                    <div className="rail-agent-body">
                      {/* 리드 문장은 두지 않는다. 에이전트 이름과 아래 내용이
                      이미 무엇을 하는 자리인지 말한다. */}
                      {/* 샷을 정하는 것이 촬영의 몫이다. 줄콘티는 컷만 나눈다. */}
                      <button
                        type="button"
                        className="rail-lens-primary"
                        onClick={requestCameraCheck}
                        disabled={cameraCheckPending || cutPlan.length === 0}
                      >
                        {cameraCheckPending ? '촬영 점검 중…' : '촬영 다시 점검'}
                      </button>
                      {cameraCheckError && (
                        <p className="rail-lens-error">
                          AI 호출 실패 · {cameraCheckError}
                        </p>
                      )}
                      {cameraCheck && !cameraCheckPending && cameraFindings.length === 0 && (
                        <p className="rail-check-summary">걸리는 것이 없습니다.</p>
                      )}
                      {cameraFindings.length > 0 && (
                        <DiagnosisList
                          findings={cameraFindings}
                          emptyLabel=""
                          onGoTo={goToFindingCut}
                          onRequestFix={requestShotFix}
                          cutLabelOf={cutLabelOf}
                          fixPending={shotFixPending}
                          fixProposal={shotFixProposal}
                          fixError={shotFixError}
                          onAcceptFix={acceptShotFix}
                          onRejectFix={rejectShotFix}
                        />
                      )}

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
                    {editingFindings.length > 0 && (
                      <em className="rail-agent-badge is-open">{editingFindings.length}</em>
                    )}
                    <svg className="rail-agent-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {openAgent === 'editing' && (
                    <div className="rail-agent-body">
                      {/* 리드 문장은 두지 않는다. 에이전트 이름(Editing · Seams)과
                      아래 진단이 이미 무엇을 보는 자리인지 말한다. */}
                      {/* 점검은 컷 플랜이 들어올 때 이미 한 번 돌았다. 이 버튼은
                      컷을 고친 뒤 다시 보기 위한 것이다 — 그래서 `다시`다.
                      규칙 진단과 AI 지적은 같은 종류(컷 구성의 문제)이므로
                      목록을 나누지 않고 한 곳에 쌓는다. */}
                      <button
                        type="button"
                        className="rail-lens-primary is-editing"
                        onClick={() => requestNarrativeCheck('cutplan')}
                        disabled={narrativeCheckPending || cutPlan.length === 0}
                      >
                        {narrativeCheckPending ? '컷 구성 보는 중…' : '컷 구성 다시 점검'}
                      </button>
                      {narrativeCheckError && (
                        <p className="rail-lens-error">
                          AI 호출 실패 · {narrativeCheckError}
                        </p>
                      )}
                      {/* 지적이 하나도 없을 때만 점검이 돌았다는 것을 알린다.
                      지적이 있으면 목록이 그 자체로 결과다 — 총평까지 얹으면
                      같은 말을 두 번 읽는다. */}
                      {narrativeCheck?.stage === 'cutplan' && !narrativeCheckPending
                        && narrativeCheck.findings.length === 0 && (
                          <p className="rail-check-summary">걸리는 것이 없습니다.</p>
                        )}

                      <DiagnosisList
                        findings={visibleEditingFindings}
                        emptyLabel="지금 이음새에서 걸리는 것이 없습니다."
                        onGoTo={goToFindingCut}
                        cutLabelOf={cutLabelOf}
                      />
                    </div>
                  )}
                </section>
              )}
              {/* 다음 단계는 에이전트 목록 밖, 레일 맨 아래에 둔다.
                어느 에이전트를 열어 두었든 같은 자리에 있어야
                이 단계에서 나가는 길로 읽힌다. */}
              <section className="narrative-rail-guidance">
                <span>다음 단계</span>
                {/* 대본은 주어진 것에서 시작한다. 다음 단계는 컷 분해다. */}
                {/* 이야기 한 덩어리로 들어왔으면 씬·비트부터 세운다.
                  컷을 나누려면 그 단위가 있어야 한다. */}
                {cutStage === 'script' && needsStructure ? (
                  <>
                    <p>
                      아직 이야기 한 덩어리입니다. 씬과 구간으로 나누면 그
                      단위로 컷을 정할 수 있습니다.
                    </p>
                    <button
                      type="button"
                      className="narrative-rail-primary"
                      onClick={requestStoryStructure}
                      disabled={structurePending}
                    >
                      {structurePending ? '나누는 중…' : '씬·구간으로 나누기'}
                    </button>
                  </>
                ) : cutStage === 'script' ? (
                  <>
                    <p>
                      {scriptHasShape
                        ? '대본이 준비됐습니다. 그림 전에 이 장면을 몇 개의 컷으로 나눌지 정하고, 이어서 촬영이 각 컷의 샷을 정합니다.'
                        : '아직 윤곽이 잡히기 전입니다. 위에서 대본을 손보고 나면 컷으로 나눌 수 있습니다.'}
                    </p>

                    {/* 나눌 것이 생긴 뒤에 뜬다. 처음부터 두면 뼈대인 채로
                      컷부터 만들게 되고, 그림까지 간 뒤에는 고치는 비용이
                      가장 비싸다. */}
                    {scriptHasShape && (
                      <button
                        type="button"
                        className="narrative-rail-primary is-cutplan"
                        onClick={cutPlan.length > 0 ? clearCutPlanStageOverride : requestCutPlan}
                        disabled={cutPlanRunPending}
                      >
                        {sceneStatePending
                          ? '인물·공간 읽는 중…'
                          : cutPlanPending
                            ? '컷 나누는 중…'
                            : cutPlanRunPending
                              ? '샷 정하는 중…'
                              : cutPlan.length > 0 ? '컷 플랜 이어서' : '컷 플랜 만들기'}
                      </button>
                    )}
                  </>
                ) : cutStage === 'cutplan' ? (
                  <>
                    {/* 대본 단계와 같은 자리에서 다음 단계로 나간다. 헤더에
                      두면 단계마다 나가는 길이 다른 자리에 있어, 감독이
                      매번 찾아야 한다. 되돌리는 버튼(Back/Again/Discard)은
                      헤더에 남는다 — 나가는 길과 섞이면 안 된다. */}
                    <p>
                      컷 수와 순서를 확인했으면 확정합니다. 다음 단계에서 패널의
                      표현 방식과 장면 기준을 준비합니다.
                    </p>
                    {/* 미정인 채로 확정하면 그 컷은 샷 없이 그림으로 간다.
                      막지는 않는다 — 일부러 비워 둘 수도 있다(DG1 P3의
                      위임). 다만 모르고 넘어가지는 않게 한다. */}
                    {undecidedShots > 0 && (
                      <p className="narrative-rail-caution">
                        아직 샷을 안 정한 컷이 {undecidedShots}개 있습니다.
                        촬영에서 정하거나, 이대로 두려면 그대로 확정하세요.
                      </p>
                    )}
                    <button
                      type="button"
                      className="narrative-rail-primary is-cutplan"
                      onClick={acceptCutPlan}
                      disabled={cutPlanRunPending}
                    >
                      {cutPlanRunPending ? '샷 정하는 중…' : '컷 플랜 확정'}
                    </button>
                  </>
                ) : cutStage === 'preparation' ? (
                  <>
                    <p>
                      {needsReferences
                        ? referencesReadyForPanels
                          ? '표현 방식과 필요한 장면 기준이 준비되었습니다. 가운데에서 Panels를 시작하세요.'
                          : `선택한 표현 방식에는 기준 이미지가 필요합니다. Mise-en-scène에서 ${missingReferenceRequirements.length}개를 준비하세요.`
                        : '러프 콘티는 기준 이미지 없이 바로 시작할 수 있습니다.'}
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      구간 {activeBeat + 1}을(를) 보고 있습니다. 이 구간의 행동과
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
              {['cutplan', 'preparation'].includes(cutStage) && <span className="lens-agent-mark">M</span>}
              <strong>Agents</strong>
              {narrativeSuggestions.length + (['cutplan', 'preparation'].includes(cutStage) ? undecidedSceneFacts : 0) > 0 && (
                <em>
                  {narrativeSuggestions.length
                    + (['cutplan', 'preparation'].includes(cutStage) ? undecidedSceneFacts : 0)}
                </em>
              )}
            </button>
          )}
        </aside>
      )}
      {referenceLightbox && (
        <div className="reference-lightbox" role="dialog" aria-modal="true" aria-label={`${referenceLightbox.alt} 크게 보기`} onClick={() => setReferenceLightbox(null)}>
          <div className="reference-lightbox-content" onClick={(event) => event.stopPropagation()}>
            <img src={referenceLightbox.src} alt={referenceLightbox.alt} />
            <div className="reference-lightbox-actions">
              <button type="button" onClick={() => setReferenceLightbox(null)}>닫기</button>
              <button type="button" onClick={() => {
                setOpenReferenceCards((current) => ({ ...current, [referenceLightbox.cardKey]: false }))
                setReferenceLightbox(null)
              }}>정보 카드 보기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
