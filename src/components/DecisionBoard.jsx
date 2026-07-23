import { useMemo, useState } from 'react'
import useStore from '../store/useStore'
import SceneOverview from './SceneOverview'
import './DecisionBoard.css'

// Narrative만 사용자와 직접 협업하는 상위 Agent로 드러낸다.
// 하위 생성 모듈은 내부적으로 Agent일 수 있지만 UI에서는 같은 장면을
// 서로 다른 관점으로 읽는 Creative Lens로 표현한다.
const NARRATIVE_AGENT = {
  id: 'narrative',
  role: 'Narrative Agent',
  lens: '정보/서사',
  glyph: '📖',
  tagline: '언제 알게 할 것인가',
  brief: '관객이 무엇을 언제 알게 되는지 본다.',
  prompt: '예: 원인은 숨기고 불안만 먼저 읽히게',
  accent: '#f59e0b',
}

const CREATIVE_LENSES = [
  {
    id: 'staging',
    role: 'Mise-en-scène Lens',
    lens: '장면화/블로킹',
    glyph: '🎭',
    tagline: '무대를 어떻게 짤 것인가',
    brief: '거리, 시선, 몸의 방향, 사물 관계를 본다.',
    prompt: '예: 둘 사이의 불신과 거리감을 더 강하게',
    accent: '#10b981',
  },
  {
    id: 'camera',
    role: 'Cinematography Lens',
    lens: '카메라/프레이밍/톤',
    glyph: '🎥',
    tagline: '어디서 볼 것인가',
    brief: '어디서, 얼마나 가까이, 어떤 톤으로 볼지 본다.',
    prompt: '예: 공간은 보이되 감정 밀도는 잃지 않게',
    accent: '#3b82f6',
  },
  {
    id: 'editing',
    role: 'Editing Lens',
    lens: '편집/리듬',
    glyph: '✂️',
    tagline: '어디서 자르고 이을 것인가',
    brief: '몇 컷으로 나누고 어디서 끊을지 본다.',
    prompt: '예: 반응을 늦춰서 긴장을 오래 끌기',
    accent: '#ef4444',
  },
]

const PERSPECTIVES = [NARRATIVE_AGENT, ...CREATIVE_LENSES]

const MOCK_OPTIONS = [
  {
    id: 'opt-delay-clue',
    lensId: 'narrative',
    title: '단서 지연',
    proposal: '위협의 원인을 첫 컷에서 직접 보여주지 않고, 인물 반응 뒤에 늦게 드러낸다.',
    gain: '궁금증, 서스펜스, 다음 컷으로 넘어가는 이유',
    cost: '상황 명료성이 낮아질 수 있음',
    tags: ['정보 지연', '서스펜스', '오해 가능성'],
    viewerCheck: 'viewer가 불안의 원인을 궁금해하는지, 아니면 상황을 못 따라가는지 확인',
  },
  {
    id: 'opt-distance',
    lensId: 'staging',
    title: '거리 벌리기',
    proposal: '두 인물을 프레임 안에서 더 멀리 두고, 사이에 콘솔이나 문틀 같은 물리적 장벽을 둔다.',
    gain: '정서적 단절, 권력 관계, 공간적 긴장',
    cost: '미세한 표정 정보가 약해질 수 있음',
    tags: ['거리', '권력 관계', '사물 관계'],
    viewerCheck: 'viewer가 두 인물의 불신을 거리감으로 읽는지 확인',
  },
  {
    id: 'opt-object-between',
    lensId: 'staging',
    title: '사물로 가르기',
    proposal: '출입카드, 리모컨, 콘솔 같은 핵심 사물을 두 인물 사이에 두어 갈등의 축을 만든다.',
    gain: '갈등의 물리적 초점, 선택의 압박, 시선 이동',
    cost: '인물 감정보다 물건의 의미가 더 크게 읽힐 수 있음',
    tags: ['사물 관계', '시선', '갈등 축'],
    viewerCheck: 'viewer가 사물을 단순 소품이 아니라 갈등의 매개로 읽는지 확인',
  },
  {
    id: 'opt-wide-corridor',
    lensId: 'camera',
    title: '공간을 넓게 열기',
    proposal: '인물을 작게 두고 관제실의 모니터, 출구, 잠긴 캐비닛을 함께 보이게 한다.',
    gain: '공간 명료성, 고립감, 위험 단서',
    cost: '감정 밀도와 표정의 긴장이 약해질 수 있음',
    tags: ['공간 명료성', '고립감', '포함/배제'],
    viewerCheck: 'viewer가 장소 설명이 아니라 압박감으로 읽는지 확인',
  },
  {
    id: 'opt-tight-face',
    lensId: 'camera',
    title: '얼굴로 압축',
    proposal: '재인의 얼굴과 눈동자를 크게 잡아 판단 직전의 불안을 전면화한다.',
    gain: '감정 밀도, 인물 동일시, 즉각적 긴장',
    cost: '공간 단서와 주변 위험의 위치가 약해질 수 있음',
    tags: ['감정 밀도', '클로즈업', '포함/배제'],
    viewerCheck: 'viewer가 불안을 읽는지, 단순 놀람이나 공포로 읽는지 확인',
  },
  {
    id: 'opt-obstructed-view',
    lensId: 'camera',
    title: '가려진 시점',
    proposal: '문틀이나 모니터 가장자리 너머로 인물을 보이게 해 훔쳐보는 듯한 불안감을 만든다.',
    gain: '은폐감, 감시당하는 느낌, 시각적 긴장',
    cost: '인물 행동이 덜 명확해질 수 있음',
    tags: ['가림', '시점', '서스펜스'],
    viewerCheck: 'viewer가 이 가림을 의도된 감시감으로 받아들이는지 확인',
  },
  {
    id: 'opt-reaction-first',
    lensId: 'editing',
    title: '반응 먼저',
    proposal: '위협 물체를 보여주기 전에 재인의 시선과 멈칫하는 반응 컷을 먼저 둔다.',
    gain: '긴장 상승, 관객의 질문, 컷 사이 리듬',
    cost: '행동의 원인이 잠시 불분명해질 수 있음',
    tags: ['반응 컷', '지연', '컷 경계'],
    viewerCheck: 'viewer가 반응의 대상이 무엇인지 궁금해하는지 확인',
  },
  {
    id: 'opt-three-beat',
    lensId: 'editing',
    title: '세 박자 분할',
    proposal: '리모컨 발견, 재인의 반응, 민호의 접근을 세 컷으로 나누어 압박을 단계적으로 올린다.',
    gain: '긴장 누적, 정보 순서의 명료성, 리듬 제어',
    cost: '장면이 느려지거나 설명적으로 보일 수 있음',
    tags: ['컷 분할', '긴장 누적', '정보 순서'],
    viewerCheck: 'viewer가 속도 저하가 아니라 압박 증가로 읽는지 확인',
  },
]

const MOCK_RELATIONS = [
  {
    id: 'rel-wide-clue',
    from: 'opt-wide-corridor',
    to: 'opt-delay-clue',
    type: 'trade-off',
    label: '공간을 넓히면 숨기려던 단서가 빨리 보일 수 있음',
  },
  {
    id: 'rel-distance-wide',
    from: 'opt-distance',
    to: 'opt-wide-corridor',
    type: 'complement',
    label: '넓은 프레임은 인물 사이 거리감을 더 읽기 쉽게 만듦',
  },
  {
    id: 'rel-close-distance',
    from: 'opt-tight-face',
    to: 'opt-distance',
    type: 'trade-off',
    label: '클로즈업은 감정을 키우지만 두 인물 사이의 물리적 거리감은 약화시킴',
  },
  {
    id: 'rel-object-reaction',
    from: 'opt-object-between',
    to: 'opt-reaction-first',
    type: 'complement',
    label: '사물 중심 블로킹은 반응 컷의 대상과 의미를 더 분명하게 만듦',
  },
  {
    id: 'rel-obstruct-delay',
    from: 'opt-obstructed-view',
    to: 'opt-delay-clue',
    type: 'complement',
    label: '가려진 시점은 정보 지연을 시각적으로 정당화함',
  },
  {
    id: 'rel-three-beat-delay',
    from: 'opt-three-beat',
    to: 'opt-delay-clue',
    type: 'trade-off',
    label: '세 박자 분할은 긴장을 쌓지만 지연된 단서를 너무 명확한 절차로 만들 수 있음',
  },
  {
    id: 'rel-reaction-delay',
    from: 'opt-reaction-first',
    to: 'opt-delay-clue',
    type: 'complement',
    label: '반응 컷은 원인 지연을 관객 질문으로 바꿈',
  },
]

const MOCK_DEBATE_TURNS = [
  {
    id: 'debate-1',
    lensId: 'narrative',
    targetLensId: 'editing',
    targetOptionId: 'opt-reaction-first',
    costType: 'Information cost',
    line: '리듬, 네 반응 먼저 안은 좋아. 그런데 위협을 늦추면 컷3까지 관객이 상황을 못 잡을 수 있어. 그 혼란을 비용으로 감수할 거야?',
  },
  {
    id: 'debate-2',
    lensId: 'editing',
    targetLensId: 'narrative',
    targetOptionId: 'opt-delay-clue',
    costType: 'Rhythm defense',
    line: '응, 그 헷갈림이 바로 불안이야. 대신 반응 컷의 시선 방향은 남겨서 길 잃는 혼란까지는 가지 않게 하자.',
  },
  {
    id: 'debate-3',
    lensId: 'camera',
    targetLensId: 'staging',
    targetOptionId: 'opt-distance',
    costType: 'Emotion cost',
    line: '블로킹, 거리를 벌리면 관계는 읽히는데 얼굴의 떨림이 사라져. 관객이 불안을 감정이 아니라 배치 정보로만 읽을 수 있어.',
  },
  {
    id: 'debate-4',
    lensId: 'staging',
    targetLensId: 'camera',
    targetOptionId: 'opt-tight-face',
    costType: 'Spatial cost',
    line: '프레임, 얼굴로 압축하면 감정은 강해져. 하지만 둘 사이의 장벽이 사라져서 고립감의 원인이 약해질 수 있어.',
  },
]

function getScopeLabel(scene, scope) {
  const branch = scene?.branches?.[scene.activeBranch ?? 0]
  const shots = branch?.shots || []
  if (!shots.length) return 'No shot selected'

  if (scope.mode === 'range') {
    const from = Math.min(scope.from, scope.to)
    const to = Math.max(scope.from, scope.to)
    return `${scene?.label || 'Scene'} / S${from + 1}-S${to + 1} (${to - from + 1} shots)`
  }

  const shot = shots[scope.shot] || shots[0]
  return `${scene?.label || 'Scene'} / ${shot.label || `Shot ${scope.shot + 1}`}`
}

export default function DecisionBoard() {
  const [boardView, setBoardView] = useState('split')
  // 기본은 모두 펼침. 사용자가 접은 lane만 여기에 담긴다.
  const [collapsedLanes, setCollapsedLanes] = useState({})
  const [selectedOptionId, setSelectedOptionId] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [debateOpen, setDebateOpen] = useState(false)
  const [selectedOptionIds, setSelectedOptionIds] = useState([])
  const [directorNote, setDirectorNote] = useState('')
  const [scopeMode, setScopeMode] = useState('single')
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd, setRangeEnd] = useState(0)
  const [narrativeRequest, setNarrativeRequest] = useState('')
  const [lensIntentSubmitted, setLensIntentSubmitted] = useState(() => (
    CREATIVE_LENSES.reduce((acc, lens) => ({ ...acc, [lens.id]: false }), {})
  ))
  const [rounds, setRounds] = useState([
    {
      id: 'round-1',
      label: 'Round 1',
      note: 'Initial option spread',
      selectedOptionIds: [],
      directorNote: '',
    },
  ])
  const [lensIntents, setLensIntents] = useState(() => (
    CREATIVE_LENSES.reduce((acc, lens) => ({ ...acc, [lens.id]: '' }), {})
  ))
  const scenes = useStore((s) => s.scenes)
  const activeScene = useStore((s) => s.activeScene)
  const activeBeat = useStore((s) => s.activeBeat)
  const setFlowActiveShot = useStore((s) => s.setFlowActiveShot)
  const requestNarrativeSuggestions = useStore((s) => s.requestNarrativeSuggestions)
  const narrativeSuggestionCount = useStore((s) => s.narrativeSuggestions.length)
  const sceneIntention = useStore((s) => s.sceneIntention)
  const setLeftPanelVisible = useStore((s) => s.setLeftPanelVisible)
  const openDrawingWorkspace = useStore((s) => s.openDrawingWorkspace)
  const scene = scenes[activeScene]
  const activeShot = scene?.activeShot ?? 0
  const activeBranch = scene?.activeBranch ?? 0
  const branch = scene?.branches?.[activeBranch]
  const shots = branch?.shots || []
  const scopeFrom = Math.min(rangeStart, rangeEnd)
  const scopeTo = Math.max(rangeStart, rangeEnd)
  const scope = scopeMode === 'range'
    ? { mode: 'range', from: scopeFrom, to: scopeTo, shotIds: shots.slice(scopeFrom, scopeTo + 1).map((shot) => shot.id) }
    : { mode: 'single', shot: activeShot, shotIds: shots[activeShot]?.id ? [shots[activeShot].id] : [] }

  const allOptions = MOCK_OPTIONS
  const availableRelations = MOCK_RELATIONS
  const selectedOption = allOptions.find((option) => option.id === selectedOptionId) || allOptions[0]

  // Narrative 아래의 세 관점만 Creative Lens lane으로 렌더한다.
  // 현재 option 내용은 모두 prototype MOCK_OPTIONS이다.
  const optionsByLens = useMemo(() => {
    return CREATIVE_LENSES.map((lens) => ({
      ...lens,
      options: MOCK_OPTIONS.filter((option) => option.lensId === lens.id),
    }))
  }, [])

  // 상단 Narrative 띠에 표시할 옵션(현재는 prototype).
  const narrativeOptions = useMemo(
    () => MOCK_OPTIONS.filter((option) => option.lensId === NARRATIVE_AGENT.id),
    [],
  )

  const connectedRelations = availableRelations.filter(
    (relation) => relation.from === selectedOption.id || relation.to === selectedOption.id
  )
  const selectedOptions = allOptions.filter((option) => selectedOptionIds.includes(option.id))
  const selectedRelations = availableRelations.filter(
    (relation) => selectedOptionIds.includes(relation.from) && selectedOptionIds.includes(relation.to)
  )

  const updateLensIntent = (lensId, value) => {
    setLensIntents((prev) => ({ ...prev, [lensId]: value }))
    setLensIntentSubmitted((prev) => ({ ...prev, [lensId]: false }))
  }

  const submitLensIntent = (lensId) => {
    if (!lensIntents[lensId]?.trim()) return
    setLensIntentSubmitted((prev) => ({ ...prev, [lensId]: true }))
  }

  const toggleLane = (lensId) => {
    setCollapsedLanes((prev) => ({ ...prev, [lensId]: !prev[lensId] }))
  }

  const selectScopeShot = (shotIdx) => {
    if (scopeMode === 'single') {
      setFlowActiveShot(shotIdx)
      setRangeStart(shotIdx)
      setRangeEnd(shotIdx)
      return
    }

    if (rangeStart === rangeEnd) {
      setRangeEnd(shotIdx)
      return
    }

    const distanceToStart = Math.abs(shotIdx - rangeStart)
    const distanceToEnd = Math.abs(shotIdx - rangeEnd)
    if (distanceToStart <= distanceToEnd) {
      setRangeStart(shotIdx)
    } else {
      setRangeEnd(shotIdx)
    }
  }

  const switchScopeMode = (mode) => {
    setScopeMode(mode)
    if (mode === 'single') {
      setRangeStart(activeShot)
      setRangeEnd(activeShot)
    } else if (rangeStart === rangeEnd) {
      setRangeStart(Math.max(0, activeShot))
      setRangeEnd(Math.min(Math.max(shots.length - 1, 0), activeShot + 1))
    }
  }

  const toggleOptionSelection = (optionId) => {
    setSelectedOptionIds((prev) => (
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId]
    ))
  }

  const openOptionReview = (optionId) => {
    setSelectedOptionId(optionId)
    setReviewOpen(true)
  }

  const startNextRound = () => {
    if (selectedOptionIds.length === 0) return
    const nextIndex = rounds.length + 1
    setRounds((prev) => [
      ...prev,
      {
        id: `round-${nextIndex}`,
        label: `Round ${nextIndex}`,
        note: 'Director response round',
        selectedOptionIds: [...selectedOptionIds],
        directorNote,
        lensBriefs: { ...lensIntents },
        intentionBrief: sceneIntention,
        scope,
      },
    ])
    setDirectorNote('')
  }

  const getOptionTitle = (optionId) => (
    MOCK_OPTIONS.find((option) => option.id === optionId)?.title || 'Other option'
  )

  const getLens = (lensId) => (
    PERSPECTIVES.find((lens) => lens.id === lensId) || PERSPECTIVES[0]
  )

  const selectedOptionReview = (
    <div className="selected-review-panel">
      <article className="selected-option-review">
        <div className="selected-review-heading">
          <div>
            <span className="tradeoff-eyebrow">Current option</span>
            <h2>{selectedOption.title}</h2>
          </div>
          <button
            type="button"
            className="review-close-btn"
            onClick={() => setReviewOpen(false)}
            aria-label="Close review"
          >
            ✕
          </button>
        </div>
        <div className="selected-review-copy">
          <p>{selectedOption.proposal}</p>
        </div>
        <div className="selected-review-tags">
          {selectedOption.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <div className="selected-gain-cost">
          <div className="gain">
            <span>얻는 것</span>
            <strong>{selectedOption.gain}</strong>
          </div>
          <div className="cost">
            <span>잃는 것</span>
            <strong>{selectedOption.cost}</strong>
          </div>
        </div>
      </article>

      <aside className="selected-relations-panel">
        <div className="selected-relations-heading">
          <span className="tradeoff-eyebrow">Trade-off / synergy</span>
          <p>현재 옵션과 같이 고를 때 충돌하거나 보완되는 선택지</p>
        </div>
        {connectedRelations.length === 0 ? (
          <p className="empty-relations">연결된 관계가 없습니다.</p>
        ) : connectedRelations.map((relation) => {
          const relatedOptionId = relation.from === selectedOption.id ? relation.to : relation.from
          return (
            <div key={relation.id} className={`relation-item ${relation.type}`}>
              <span>{relation.type === 'trade-off' ? '충돌하는 선택지' : '같이 쓰기 좋은 선택지'}</span>
              <strong>{getOptionTitle(relatedOptionId)}</strong>
              <p>{relation.label}</p>
            </div>
          )
        })}
      </aside>
    </div>
  )

  return (
    <div className="decision-board">
      <div className="decision-board-topbar">
        <div className="decision-board-title-block">
          <span className="decision-board-kicker">Storyboard Decision Board</span>
          <h1>{getScopeLabel(scene, scope)}</h1>
          <p>Beat {activeBeat + 1} 기준입니다. Narrative Agent가 요청을 해석하고, 세 Creative Lens가 같은 장면을 서로 다른 관점으로 검토합니다.</p>
        </div>
        <div className="decision-board-actions">
          <div className="board-view-toggle" aria-label="Board view mode">
            {[
              ['storyboard', 'Storyboard'],
              ['split', 'Split'],
              ['lenses', 'Lenses'],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={boardView === mode ? 'active' : ''}
                onClick={() => setBoardView(mode)}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="decision-board-secondary" onClick={openDrawingWorkspace}>
            Edit Shot
          </button>
        </div>
      </div>

      <section className="scope-panel" aria-label="Scope selection">
        <div className="scope-panel-copy">
          <span>Scope</span>
          <strong>{scope.mode === 'range' ? '여러 프레임에 걸친 선택지' : '한 샷 안의 선택지'}</strong>
          <p>
            {scope.mode === 'range'
              ? '정보 배분, 컷 분할, 리듬처럼 프레임 간 판단을 생성합니다.'
              : '프레이밍, 블로킹, 단서 배치처럼 프레임 내 판단을 생성합니다.'}
          </p>
        </div>
        <div className="scope-controls">
          <div className="scope-mode-toggle">
            <button
              type="button"
              className={scopeMode === 'single' ? 'active' : ''}
              onClick={() => switchScopeMode('single')}
            >
              Single Shot
            </button>
            <button
              type="button"
              className={scopeMode === 'range' ? 'active' : ''}
              onClick={() => switchScopeMode('range')}
            >
              Range
            </button>
          </div>
          <div className="scope-shot-strip">
            {shots.map((shot, idx) => {
              const inScope = scopeMode === 'range'
                ? idx >= scopeFrom && idx <= scopeTo
                : idx === activeShot
              const isEdge = scopeMode === 'range' && (idx === scopeFrom || idx === scopeTo)
              return (
                <button
                  key={shot.id || idx}
                  type="button"
                  className={`${inScope ? 'in-scope' : ''} ${isEdge ? 'scope-edge' : ''}`}
                  onClick={() => selectScopeShot(idx)}
                  title={shot.label || `Shot ${idx + 1}`}
                >
                  S{idx + 1}
                </button>
              )
            })}
          </div>
          <button type="button" className="scope-generate-btn">
            Generate Options
          </button>
        </div>
      </section>

      <div className={`decision-board-main view-${boardView}`}>
        <section className="decision-board-storyboard" aria-label="Storyboard scope">
          <SceneOverview />
        </section>

        <section className="decision-board-options" aria-label="Option cards and tradeoffs">
          {reviewOpen && selectedOptionReview}

          {/* 상위 계층: 사용자와 직접 협업하는 Narrative Agent. */}
          <div className="narrative-band" style={{ '--lens-color': NARRATIVE_AGENT.accent }}>
            <div className="narrative-band-header">
              <div className="narrative-band-title">
                <span className="narrative-band-glyph" aria-hidden="true">{NARRATIVE_AGENT.glyph}</span>
                <div>
                  <strong>
                    <span className="narrative-band-badge">Agent</span>
                    {NARRATIVE_AGENT.role}
                    <em className="option-lane-tagline">{NARRATIVE_AGENT.tagline}</em>
                  </strong>
                  <p>{NARRATIVE_AGENT.brief}</p>
                </div>
              </div>
              <div className="narrative-band-controls">
                <span className="narrative-band-lens">{NARRATIVE_AGENT.lens}</span>
                {narrativeSuggestionCount > 0 && (
                  <span className="narrative-suggestion-count">{narrativeSuggestionCount} suggestion{narrativeSuggestionCount === 1 ? '' : 's'}</span>
                )}
              </div>
            </div>
            <div className="narrative-workbench">
              <label>
                <span>Narrative request</span>
                <textarea
                  value={narrativeRequest}
                  onChange={(event) => setNarrativeRequest(event.target.value)}
                  placeholder="예: 첫 Beat를 나누고 대사를 덜 설명적으로 바꿔줘."
                  rows={2}
                />
              </label>
              <div className="narrative-workbench-actions">
                <button
                  type="button"
                  className="narrative-propose-btn"
                  disabled={!narrativeRequest.trim()}
                  onClick={() => {
                    requestNarrativeSuggestions({
                      narrativeRequest,
                    })
                    setLeftPanelVisible(true)
                  }}
                >
                  Generate proposal
                </button>
              </div>
            </div>
            <div className="narrative-band-options">
              {narrativeOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`narrative-chip ${option.id === selectedOption.id ? 'selected' : ''}`}
                  onClick={() => openOptionReview(option.id)}
                >
                  <span className="narrative-chip-title">{option.title}</span>
                  <span className="narrative-chip-proposal">{option.proposal}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="agents-lane-bar">
            <span className="agents-lane-eyebrow">Creative Lenses</span>
            <p>같은 장면을 세 가지 관점으로 검토합니다.</p>
          </div>

          <div className="option-lanes">
            {optionsByLens.map((lens) => {
              const collapsed = !!collapsedLanes[lens.id]
              return (
              <div
                key={lens.id}
                className={`option-lane ${collapsed ? 'collapsed' : ''}`}
                style={{ '--lens-color': lens.accent }}
              >
                <button
                  type="button"
                  className="option-lane-header"
                  onClick={() => toggleLane(lens.id)}
                  aria-expanded={!collapsed}
                >
                  <span className="option-lane-caret">{collapsed ? '▸' : '▾'}</span>
                  <span className="option-lane-glyph" aria-hidden="true">{lens.glyph}</span>
                  <div className="option-lane-titleblock">
                    <span className="option-lane-role">
                      {lens.role}
                      <em className="option-lane-tagline">{lens.tagline}</em>
                    </span>
                    <p>{lens.brief}</p>
                  </div>
                  <span className="option-lane-count">{lens.options.length}</span>
                  <strong>{lens.lens}</strong>
                </button>
                {!collapsed && (
                  <>
                    <label className="lens-intent-field">
                      <div className="lens-intent-row">
                        <textarea
                          value={lensIntents[lens.id]}
                          onChange={(e) => updateLensIntent(lens.id, e.target.value)}
                          placeholder={lens.prompt}
                          aria-label={`${lens.role} focus`}
                          rows={1}
                        />
                        <button
                          type="button"
                          className="lens-send-btn"
                          onClick={() => submitLensIntent(lens.id)}
                          disabled={!lensIntents[lens.id]?.trim()}
                        >
                          {lensIntentSubmitted[lens.id] ? 'Focused' : 'Set focus'}
                        </button>
                      </div>
                    </label>
                    {lens.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`option-card compact ${option.id === selectedOption.id ? 'selected' : ''} ${selectedOptionIds.includes(option.id) ? 'chosen' : ''}`}
                        onClick={() => openOptionReview(option.id)}
                      >
                        <span className="option-card-head">
                          <span className="option-card-title">{option.title}</span>
                          <span
                            role="button"
                            tabIndex={0}
                            className={`option-pick ${selectedOptionIds.includes(option.id) ? 'picked' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleOptionSelection(option.id)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                e.stopPropagation()
                                toggleOptionSelection(option.id)
                              }
                            }}
                            aria-pressed={selectedOptionIds.includes(option.id)}
                          >
                            {selectedOptionIds.includes(option.id) ? 'Selected' : 'Select'}
                          </span>
                        </span>
                        <span className="option-card-tags">
                          {option.tags.map((tag) => <em key={tag}>{tag}</em>)}
                        </span>
                      </button>
                    ))}
                  </>
                )}
              </div>
              )
            })}
            <button
              type="button"
              className={`agent-debate-hub ${debateOpen ? 'active' : ''}`}
              onClick={() => setDebateOpen((open) => !open)}
              aria-pressed={debateOpen}
              title="Compare cross-lens impacts"
            >
              <span>◎</span>
              <strong>{debateOpen ? 'Hide' : 'Overlap'}</strong>
            </button>
          </div>

          {debateOpen && (
            <section className="agent-debate-panel" aria-label="Cross-lens impacts">
              <div className="agent-debate-heading">
                <div>
                  <span className="tradeoff-eyebrow">Lens overlap</span>
                  <h2>각 관점의 효과와 비용을 함께 보기</h2>
                </div>
                <button type="button" onClick={() => setDebateOpen(false)}>Close</button>
              </div>
              <div className="debate-turn-list">
                {MOCK_DEBATE_TURNS.map((turn) => {
                  const speaker = getLens(turn.lensId)
                  const target = getLens(turn.targetLensId)
                  return (
                    <article key={turn.id} className="debate-turn" style={{ '--lens-color': speaker.accent }}>
                      <div className="debate-turn-meta">
                        <strong>{speaker.role}</strong>
                        <span>{turn.costType}</span>
                      </div>
                      <p>{turn.line}</p>
                      <div className="debate-target">
                        <span>affects</span>
                        <strong>{target.role} / {getOptionTitle(turn.targetOptionId)}</strong>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          <div className="director-round-panel">
            <div className="provisional-choice">
              <span className="tradeoff-eyebrow">Provisional Choice</span>
              {selectedOptions.length === 0 ? (
                <p className="empty-relations">카드의 Select를 눌러 이번 라운드의 잠정 조합을 만드세요.</p>
              ) : (
                <div className="choice-chip-list">
                  {selectedOptions.map((option) => (
                    <button key={option.id} type="button" onClick={() => toggleOptionSelection(option.id)}>
                      {option.title}
                    </button>
                  ))}
                </div>
              )}
              {selectedRelations.length > 0 && (
                <div className="selected-relations">
                  {selectedRelations.map((relation) => (
                    <div key={relation.id} className={`relation-item ${relation.type}`}>
                      <span>{relation.type === 'trade-off' ? 'Trade-off in selection' : 'Complement in selection'}</span>
                      <p>{relation.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="director-note-field">
              <span>Director response to selected cards</span>
              <textarea
                value={directorNote}
                onChange={(e) => setDirectorNote(e.target.value)}
                placeholder="예: 이 조합은 좋은데 단서는 더 숨기고, 재인의 불안은 더 분명하게 읽혔으면 좋겠어."
                rows={3}
              />
            </label>

            <div className="round-actions">
              <div className="round-stack">
                {rounds.map((round) => (
                  <span key={round.id} className={round.id === rounds[rounds.length - 1].id ? 'active' : ''}>
                    {round.label}
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="decision-board-primary"
                onClick={startNextRound}
                disabled={selectedOptionIds.length === 0}
              >
                Start Next Round
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
