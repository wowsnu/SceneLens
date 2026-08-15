import { create } from 'zustand'
import { logEdit, logScaffold } from './studyLog'

// 씬 서술. 대사는 두지 않는다 — 정지 이미지가 담을 수 없고, 스토리보드가
// 평가하려는 것도 아니다. 말하는 장면은 말하는 모습으로 적는다.
// Beat는 빈 줄(문단)로 나뉜다. 별도 형식을 배울 것이 없어야 한다.
const SCREENPLAY = [
  { type: 'scene-heading', text: '물리학과 실험실, 밤', beat: 0 },
  { type: 'action', text: '좁고 낡은 대학 실험실. 천장 형광등 하나만 살아 있어 긴 실험대 한쪽에만 빛이 떨어지고, 나머지 공간은 어둠에 잠겨 있다. 오실로스코프와 뒤엉킨 케이블, 비커, 쌓아 올린 출력물이 실험대를 가득 메우고 있다. 창밖에는 비가 내린다.', beat: 0 },
  { type: 'action', text: '하린, 20대 중반의 대학원생. 후드를 입고 머리를 묶은 채 불빛이 닿는 자리에 혼자 앉아 있다. 어두운 장비들 사이에서 그녀는 작아 보인다.', beat: 0 },

  { type: 'action', text: '하린이 노트북 화면을 들여다본다. 화면에는 며칠째 같은 자리에서 어긋나는 측정 그래프가 떠 있다.', beat: 1 },
  { type: 'action', text: '그녀가 연필로 노트에 식을 적어 내려간다. 몇 줄 쓰다 말고 선을 그어 지운다. 같은 동작이 반복된다.', beat: 1 },

  { type: 'action', text: '하린이 연필을 내려놓고 의자에 등을 기댄다. 지친 얼굴로 천장을 본다.', beat: 2 },
  { type: 'action', text: '시선이 다시 화면으로 내려온다. 어긋난 봉우리들의 간격을 눈으로 짚어 나간다. 손가락이 화면 위를 따라 움직인다.', beat: 2 },

  { type: 'action', text: '그녀의 손이 멈춘다. 간격이 일정하다. 오차가 아니라 규칙이다.', beat: 3 },
  { type: 'action', text: '하린이 노트를 끌어당겨 새 줄에 짧은 식 하나를 적는다. 연필 끝이 종이를 누른다.', beat: 3 },

  { type: 'action', text: '그녀가 그 식을 동그라미로 감싼다. 한 번, 두 번, 세 번. 흑연이 종이를 눌러 자국이 팬다.', beat: 4 },
  { type: 'action', text: '주변에는 지우개 자국과 그어 지운 시도들이 어지럽게 흩어져 있다. 그 한가운데에 방금 적은 식만 또렷하다.', beat: 4 },

  { type: 'action', text: '하린이 고개를 든다. 화면 불빛이 아래에서 얼굴을 비춘다. 눈이 화면을 지나 먼 곳에 머문다. 입술이 살짝 벌어진다.', beat: 5 },
  { type: 'action', text: '그녀는 움직이지 않는다. 형광등이 한 번 깜빡인다.', beat: 5 },

  { type: 'action', text: '하린이 천천히 일어선다. 의자가 뒤로 밀린다. 노트를 손에 쥔 채 그대로 창가로 걸어간다.', beat: 6 },
  { type: 'action', text: '그녀가 비에 젖은 창 앞에 선다. 유리 너머로 도시의 불빛들이 흩어져 있다. 노트를 든 손이 옆으로 내려간다.', beat: 6 },
  { type: 'action', text: '하린이 창밖을 본다. 어제까지 보던 것과 같은 풍경이다. 그러나 그녀는 처음 보는 것처럼 서 있다.', beat: 6 },

  // 장소가 바뀌므로 새 씬이다. 씬은 시공간이 연속된 범위다.
  { type: 'scene-heading', text: '연구동 복도, 밤', beat: 7 },
  { type: 'action', text: '불이 반쯤 꺼진 복도. 하린이 노트를 든 채 걸어와 한 연구실 문 앞에 선다.', beat: 7 },
  { type: 'action', text: '문틈으로 불빛이 새어 나온다. 하린이 손을 들었다가 멈춘다.', beat: 7 },

  { type: 'action', text: '하린이 노트를 내려다본다. 그리고 문을 두드린다.', beat: 8 },
]

// 예시 대본에 딸린 패널 그림. 컷 번호(beat-beatOrder)로 붙인다 — 배열
// 순서로 붙이면 대본을 조금만 고쳐도 그림이 엉뚱한 컷으로 밀린다.
// 5개만 둔다. 전부 채우면 데모에서 '그릴 자리'가 사라진다.
const DEMO_PANEL_IMAGES = {
  '0-1': '/img/lab_wide_establishing.png',  // 실험실 전경
  '1-1': '/img/lab_student_ots.png',        // 화면과 노트를 보는 어깨 너머
  '4-1': '/img/lab_pattern_ecu.png',        // 동그라미 친 식
  '5-1': '/img/lab_discovery_cu.png',       // 깨닫는 얼굴
  '6-2': '/img/lab_window_reveal.png',      // 창가
}

// Dummy strategy data with image paths and spatial coordinates
const DEMO_STRATEGIES = [
  {
    id: 'A',
    name: 'Quiet Discovery',
    shots: [
      { order: 1, beat: 0, image: '/img/lab_wide_establishing.png', x: 450, y: 700, angle: -90, intent: 'ESTABLISH SPACE', cir: { shotSize: 'Wide', relation: 'Master' } },
      { order: 2, beat: 1, image: '/img/lab_student_ots.png', x: 200, y: 450, angle: -30, intent: 'SUBJECTIVE FOCUS', cir: { shotSize: 'Medium', relation: 'OTS' } },
      { order: 3, beat: 2, image: null, x: 500, y: 250, angle: 90, intent: 'FATIGUE / STALL', cir: { shotSize: 'Medium Close', relation: 'Single' } },
      { order: 4, beat: 3, image: null, x: 750, y: 450, angle: -150, intent: 'THE NOTICING', cir: { shotSize: 'Close-Up', relation: 'Single' } },
      { order: 5, beat: 4, image: '/img/lab_pattern_ecu.png', x: 350, y: 350, angle: 0, intent: 'EVIDENCE DETAIL', cir: { shotSize: 'ECU', relation: 'Insert' } },
      { order: 6, beat: 5, image: '/img/lab_discovery_cu.png', x: 450, y: 800, angle: -90, intent: 'REALIZATION', cir: { shotSize: 'Close-Up', relation: 'Single' } },
      { order: 7, beat: 6, image: '/img/lab_window_reveal.png', x: 450, y: 900, angle: -90, intent: 'WORLD RESEEN', cir: { shotSize: 'Wide', relation: 'Single' } },
    ]
  },
]

const STRATEGY_COLORS = [
  { color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', raw: '#10b981' },
  { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)', raw: '#8b5cf6' },
  { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', raw: '#ef4444' },
]

const getShotKey = (strategyIdx, shotIdx) => `${strategyIdx}-${shotIdx}`

const DEFAULT_SHOT_CIR = { shotSize: 'Medium', relation: 'Single' }

const createShotId = () => `shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const toShotImageSrc = (image) => {
  if (!image || typeof image !== 'string') return null
  if (image.startsWith('data:') || image.startsWith('/')) return image
  return `data:image/png;base64,${image}`
}

const createFlowShot = ({ index = 0, scriptBeat = 0, label, image = null, cir = {}, source = 'canvas', isAIGenerated = false } = {}) => ({
  id: createShotId(),
  image,
  cir,
  label: label || `Shot ${index + 1}`,
  scriptBeat,
  isAIGenerated,
  source,
})

const toStrategyShot = (shot, idx) => ({
  ...shot,
  order: idx + 1,
  beat: shot.scriptBeat ?? shot.beat ?? 0,
  intent: shot.intent || shot.label || `Shot ${idx + 1}`,
})

const branchToStrategy = (branch, fallbackName = 'Storyboard') => ({
  id: branch?.id || 'branch-main',
  name: branch?.label || fallbackName,
  intention_tags: [],
  shots: (branch?.shots || []).map(toStrategyShot),
})

const syncStrategiesFromScenes = (state, scenes = state.scenes) => {
  const scene = scenes[state.activeScene]
  const branch = scene?.branches?.[scene.activeBranch ?? 0]
  if (!branch) return state.strategies

  const strategies = state.strategies?.length ? [...state.strategies] : []
  strategies[state.activeStrategy ?? 0] = branchToStrategy(branch)
  return strategies
}

const syncScenesFromStrategies = (state, strategies) => {
  const strategy = strategies?.[state.activeStrategy ?? 0]
  if (!strategy?.shots) return state.scenes

  return state.scenes.map((scene, sceneIdx) => {
    if (sceneIdx !== state.activeScene) return scene

    const activeBranch = scene.activeBranch ?? 0
    const branches = scene.branches.map((branch, branchIdx) => {
      if (branchIdx !== activeBranch) return branch

      const shots = strategy.shots.map((shot, idx) => ({
        ...(branch.shots[idx] || {}),
        ...shot,
        id: shot.id || branch.shots[idx]?.id || createShotId(),
        label: shot.label || shot.intent || branch.shots[idx]?.label || `Shot ${idx + 1}`,
        scriptBeat: shot.scriptBeat ?? shot.beat ?? branch.shots[idx]?.scriptBeat ?? 0,
        image: shot.image ?? branch.shots[idx]?.image ?? null,
        cir: shot.cir || branch.shots[idx]?.cir || DEFAULT_SHOT_CIR,
        isAIGenerated: shot.isAIGenerated ?? branch.shots[idx]?.isAIGenerated ?? false,
        source: shot.source || branch.shots[idx]?.source || 'canvas',
      }))

      return { ...branch, label: strategy.name || branch.label, shots }
    })

    return {
      ...scene,
      branches,
      activeShot: Math.max(0, Math.min(scene.activeShot ?? 0, (branches[activeBranch]?.shots.length || 1) - 1)),
    }
  })
}

const updateActiveBranchShots = (state, updater) => {
  let nextActiveShot = state.activeShot ?? 0
  let nextActiveBeat = state.activeBeat ?? 0

  const scenes = state.scenes.map((scene, sceneIdx) => {
    if (sceneIdx !== state.activeScene) return scene

    const activeBranch = scene.activeBranch ?? 0
    const branches = scene.branches.map((branch, branchIdx) => {
      if (branchIdx !== activeBranch) return branch

      const result = updater(branch.shots, branch, scene)
      const shots = Array.isArray(result) ? result : result.shots
      if (!Array.isArray(result)) {
        nextActiveShot = result.activeShot ?? nextActiveShot
        nextActiveBeat = result.activeBeat ?? nextActiveBeat
      }

      return { ...branch, shots: shots.map((shot, idx) => ({ ...shot, label: shot.label || `Shot ${idx + 1}` })) }
    })

    const branchShots = branches[activeBranch]?.shots || []
    nextActiveShot = Math.max(0, Math.min(nextActiveShot, Math.max(0, branchShots.length - 1)))
    nextActiveBeat = branchShots[nextActiveShot]?.scriptBeat ?? nextActiveBeat

    return { ...scene, branches, activeShot: nextActiveShot }
  })

  return {
    scenes,
    strategies: syncStrategiesFromScenes(state, scenes),
    activeShot: nextActiveShot,
    activeBeat: nextActiveBeat,
  }
}

const shortenNarrativeText = (text = '', maxLength = 46) => (
  text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text
)

const includesAny = (text, keywords) => keywords.some((keyword) => text.includes(keyword))

// --- 이야기 → 씬·비트 구조 ----------------------------------------------
// 컷을 나누려면 씬과 비트가 있어야 한다. 사용자가 쓴 한 덩어리 이야기에는
// 그 구조가 없으므로 AI가 세운다.
//
// 이것은 시나리오 저작이 아니다. 형식을 만들어 주는 것이 아니라 스토리보드가
// 필요로 하는 단위(씬 = 시공간 연속, 비트 = 국면)를 드러내는 일이다.
//
// 내용은 이야기에 있는 것만 문장으로 푼다. 없는 것을 채우면 사용자가 쓰지
// 않은 것이 대본에 들어가고, 그것이 어디서 왔는지 알 수 없게 된다.
// 실제 LLM 호출로 교체될 자리다.

// 장소가 바뀌면 씬이 갈린다 — 씬은 시공간이 연속된 범위다.
// 다만 장소를 '언급'한 것과 그리로 '이동'한 것은 다르다. "복도가 조용하다"는
// 실험실 안에서 하는 말이지 복도로 간 것이 아니다.
// 이동을 가리키는 동사가 함께 있을 때만 씬을 나눈다.
const PLACE_WORDS_SHIFT = [
  ['복도', '복도'], ['연구동', '연구동'], ['강의실', '강의실'],
  ['계단', '계단'], ['옥상', '옥상'], ['거리', '거리'], ['골목', '골목'],
]
const MOVE_VERBS = ['간다', '가서', '나간다', '나가', '올라', '내려', '도착', '이동', '들어선다', '향한다', '달려간다']

// 국면이 바뀌는 신호. 비트 경계의 단서다.
const BEAT_SIGNALS = ['근데', '그런데', '그러다', '그리고', '이후', '결국', '마침내', '갑자기']

// 이야기 말투("들어감")를 대본 서술("들어간다")로 바꾼다. 내용은 더하지
// 않는다 — 사용자가 쓰지 않은 것이 대본에 들어가면 출처를 알 수 없게 된다.
//
// 한국어 명사형 종결은 받침 유무로 갈린다. 받침 없는 어간에는 ㅁ이 얹히고
// (대치함), 있으면 '-음'이 붙는다(있었음). 겹받침 ㄻ도 나온다(달려듦).
const JONG_M = 16   // ㅁ
const JONG_LM = 10  // ㄻ

const decomposeJong = (ch) => {
  const code = ch.charCodeAt(0) - 0xAC00
  if (code < 0 || code >= 11172) return null
  return { code, jong: code % 28 }
}

const toNarrative = (raw) => {
  const t = raw.replace(/[.!?。]\s*$/, '')
  if (!t) return ''

  // 서술격 '-임'은 '-이다'. 받침 ㅁ 규칙보다 먼저 걸러야 '총괄인다'가 안 된다.
  if (t.endsWith('임')) return `${t.slice(0, -1)}이다.`
  // '-음'은 앞 글자가 어간이다: 있었음 → 있었다
  if (t.endsWith('음')) return `${t.slice(0, -1)}다.`

  const last = t[t.length - 1]
  const d = last && decomposeJong(last)

  // 받침 ㅁ: 대치함 → 대치한다. ㅁ을 떼고 ㄴ을 얹는다.
  if (d && d.jong === JONG_M) {
    const stem = d.code - JONG_M
    return `${t.slice(0, -1)}${String.fromCharCode(0xAC00 + stem + 4)}다.`
  }
  // 겹받침 ㄻ: 달려듦 → 달려든다
  if (d && d.jong === JONG_LM) {
    return `${t.slice(0, -1)}${String.fromCharCode(0xAC00 + (d.code - JONG_LM) + 4)}다.`
  }

  return /[.!?。]$/.test(raw) ? raw : `${t}.`
}

const createStoryStructureDraft = (state) => {
  const source = state.screenplay
    .map((element) => element.text.trim())
    .filter(Boolean)
  if (source.length === 0) return null

  const { time, place } = inferSceneContext(state.screenplay)
  const baseHeading = [place || '실내', time].filter(Boolean).join(', ')

  // 문장 단위로 쪼갠다. 이야기는 대개 한 줄에 여러 사건이 들어 있다.
  const sentences = source
    .flatMap((line) => line.split(/(?<=[.!?。])\s+/))
    .map((text) => text.trim())
    .filter((text) => text.length > 1)

  const draft = []
  let beat = 0
  let sceneCount = 0
  let currentPlace = null

  const openScene = (heading) => {
    if (draft.length > 0) beat += 1
    draft.push({ type: 'scene-heading', text: heading, beat })
    sceneCount += 1
    beat += 1
  }

  openScene(baseHeading)

  sentences.forEach((sentence, index) => {
    // 장소가 바뀌면 새 씬이다. 이동 동사가 있어야 이동으로 본다.
    const moved = MOVE_VERBS.some((verb) => sentence.includes(verb))
    const shift = moved
      ? PLACE_WORDS_SHIFT.find(([keyword]) => sentence.includes(keyword))
      : null
    if (shift && shift[1] !== currentPlace && index > 0) {
      currentPlace = shift[1]
      openScene([shift[1], time].filter(Boolean).join(', '))
    } else if (index > 0 && BEAT_SIGNALS.some((signal) => sentence.startsWith(signal))) {
      // 국면 전환어로 시작하면 비트를 나눈다.
      beat += 1
    }

    // 이야기 말투를 서술로 바꾼다. 내용은 더하지 않는다.
    const text = toNarrative(sentence.replace(/^(근데|그런데|그러다|그리고|이후|결국|마침내|갑자기)\s*/, ''))

    // 규칙 기반은 말투만 바꾼다. 채운 것이 없으므로 filled는 false다.
    draft.push({ type: 'action', text, beat, filled: false })
  })

  return {
    id: `story-structure-${Date.now()}`,
    screenplay: draft,
    sceneCount,
    beatCount: new Set(draft.map((line) => line.beat)).size,
    sourceCount: sentences.length,
    filledCount: 0,
  }
}

const createMockScriptSuggestion = ({ beatElements, targetBeat, requestKey, sceneIntention, narrativeRequest, cast = [] }) => {
  const normalizedRequest = narrativeRequest.trim()
  const normalizedIntention = sceneIntention.trim()
  // 대사는 다루지 않는다. 제안은 행동 한 줄을 더하는 것뿐이다 —
  // 대본을 쓰는 것이 아니라 검토 중 빠진 행동을 짚는 자리다.
  const anchor = beatElements[beatElements.length - 1] || beatElements[0]
  const characterName = cast.find((name) => (
    beatElements.some((element) => element.text.includes(name))
  )) || '인물'
  const hidesInformation = includesAny(`${normalizedIntention} ${normalizedRequest}`, ['숨', '불안', '위험', '긴장', '모호'])
  const proposedText = hidesInformation
    ? `${characterName}은 원인을 확인하지 못한 채 움직임을 멈춘다. 익숙하던 소리가 한 박자 늦게 끊긴다.`
    : `${characterName}은 바로 답하지 않는다. 짧은 침묵 뒤, 주변의 변화를 한 번 더 살핀다.`

  return {
    id: `narrative-${requestKey}-insert-${targetBeat}-${anchor.globalIdx}`,
    type: 'insert-script-line',
    beat: targetBeat,
    insertAfterIndex: anchor.globalIdx,
    title: '이 Beat에 행동 한 줄을 더해볼까요?',
    reason: normalizedRequest,
    proposedText,
    newElement: {
      type: 'action',
      text: proposedText,
      beat: targetBeat,
    },
    actionLabel: 'Add line',
    sceneIntention: normalizedIntention,
  }
}

// 줄글로 들어온 이야기를 대본으로 세운다. 각 서술을 지문·대사로 풀고
// 국면이 바뀌는 지점에서 Beat를 나눠, 한 번에 검토 가능한 초안을 만든다.
// 원문을 덮어쓰지 않고 사용자가 수락해야 반영된다.
// 실제 Narrative LLM 호출로 교체될 자리다.
const hasFinalConsonant = (word = '') => {
  const last = word.charCodeAt(word.length - 1)
  if (last < 0xac00 || last > 0xd7a3) return false
  return (last - 0xac00) % 28 !== 0
}


const createMockNarrativeSuggestions = (state, requestKey, input = {}) => {
  const targetBeat = state.activeBeat ?? 0
  const beatElements = state.screenplay
    .map((element, globalIdx) => ({ ...element, globalIdx }))
    .filter((element) => (element.beat ?? 0) === targetBeat)
  const scene = state.scenes[state.activeScene]
  const branch = scene?.branches?.[scene.activeBranch ?? 0]
  const beatShots = (branch?.shots || []).filter((shot) => (shot.scriptBeat ?? 0) === targetBeat)
  const suggestions = []
  const narrativeRequest = input.narrativeRequest?.trim() || ''
  const normalizedRequest = narrativeRequest.toLowerCase()
  const requestsStructure = includesAny(normalizedRequest, [
    '구조', '비트', 'beat', '패널', '컷', '나눠', '분할', '구성', '스토리보드',
  ])
  const requestsScriptChange = includesAny(normalizedRequest, [
    '대사', '말', '설명', '짧게', '축약', '채워', '추가', '내용', '서사', '대본', '행동',
  ])
  const shouldSuggestScript = requestsScriptChange || !requestsStructure

  if (shouldSuggestScript && narrativeRequest && beatElements.length > 0) {
    suggestions.push(createMockScriptSuggestion({
      beatElements,
      targetBeat,
      requestKey,
      sceneIntention: state.sceneIntention || '',
      narrativeRequest,
      // 이 Beat가 속한 씬의 인물만 후보다.
      cast: castNamesOf(selectActiveSceneState(state)),
    }))
  }

  if (requestsStructure && beatElements.length > 1) {
    const candidates = beatElements.slice(1)
    const preferred = candidates.find((element, index) => (
      element.type === 'action' && beatElements[index]?.type !== 'scene-heading'
    ))
    const fallback = candidates[Math.max(0, Math.floor(candidates.length / 2) - 1)]
    const boundary = preferred || fallback
    const previous = beatElements.find((element) => element.globalIdx === boundary.globalIdx - 1)

    suggestions.push({
      id: `narrative-${requestKey}-split-${targetBeat}-${boundary.globalIdx}`,
      type: 'split-beat',
      beat: targetBeat,
      elementIndex: boundary.globalIdx,
      title: '여기서 Beat를 나눠볼까요?',
      reason: `“${shortenNarrativeText(previous?.text)}” 이후 “${shortenNarrativeText(boundary.text)}”에서 정보나 행동의 국면이 달라집니다.`,
      actionLabel: 'Split Beat',
    })
  }

  if (requestsStructure && beatShots.length < 2) {
    suggestions.push({
      id: `narrative-${requestKey}-panels-${targetBeat}`,
      type: 'panel-count',
      beat: targetBeat,
      targetCount: 2,
      title: '이 Beat를 두 패널로 나눠볼까요?',
      reason: '사건과 반응을 한 패널에 압축하지 않고 순서대로 확인할 수 있습니다.',
      purposes: [
        '사건 또는 새로운 정보를 먼저 제시',
        '인물의 반응과 다음 행동을 분리',
      ],
      actionLabel: 'Add blank panel',
    })
  }

  if (suggestions.length === 0) {
    suggestions.push({
      id: `narrative-${requestKey}-keep-${targetBeat}`,
      type: 'keep-structure',
      beat: targetBeat,
      title: '현재 Beat와 패널 구성을 유지해도 좋습니다.',
      reason: '이 Prototype 분석에서는 추가 분할보다 현재 정보 흐름을 보존하는 편이 명확합니다.',
    })
  }

  return suggestions
}

// --- 줄콘티 (Cut Plan) -------------------------------------------------
// 그림 콘티 이전에 컷 분해를 텍스트로 확정하는 현업의 줄콘티 단계.
// 현업 관행대로 샷 사이즈·카메라 움직임까지 포함한다. 하위 Lens는 이 값을
// 처음 정하는 주체가 아니라, Tentative로 제안된 값을 검토·대안 제시하는 주체다.
// 설계 근거: docs/NARRATIVE_LENS_AS_JULCONTI.md
const CUT_PLAN_SHOT_SIZES = ['Wide', 'Full', 'Medium', 'Bust', 'Close-Up', 'ECU']
const CUT_PLAN_ANGLES = ['Eye level', 'High angle', 'Low angle', 'Over the shoulder', 'POV', 'Bird eye']
// Pan/Tilt는 방향이 없으면 화살표로 그릴 수 없다. 좌우·상하를 나눠 둔다.
const CUT_PLAN_MOVES = [
  'Fixed', 'Pan left', 'Pan right', 'Tilt up', 'Tilt down',
  'Dolly in', 'Dolly out', 'Handheld',
]

// 컷의 구체적 결정(content, shotSize, seam 등)과 그 결정을 검토하는 이유를
// 분리한다. 다음 단계의 Decision Card는 lens 이름이 아니라 이 requirement id를
// 참조한다. 책임 범위도 나중에 카드에 붙고, 요구 역할 자체에는 붙지 않는다.
export const CUT_REQUIREMENT_LENSES = [
  { id: 'narrative', label: 'Narrative', shortLabel: 'N', placeholder: '이 컷이 전달해야 할 사건·정보' },
  { id: 'mise', label: 'Mise-en-scène', shortLabel: 'M', placeholder: '필요한 인물·공간·소품의 관계' },
  { id: 'camera', label: 'Camera', shortLabel: 'C', placeholder: '관객이 무엇을 어떻게 보아야 하는가' },
  { id: 'editing', label: 'Editing', shortLabel: 'E', placeholder: '앞뒤 컷 사이에서 수행할 역할' },
]

const createCutRequirement = (cutId, lensId, value = {}, fallbackProvenance = 'AI') => ({
  id: `req-${cutId}-${lensId}`,
  lens: lensId,
  text: value.text || '',
  provenance: value.provenance || fallbackProvenance,
})

const createCutRequirements = (cutId, requirements = {}, provenance = 'AI') => (
  CUT_REQUIREMENT_LENSES.reduce((result, lens) => ({
    ...result,
    [lens.id]: createCutRequirement(cutId, lens.id, requirements[lens.id], provenance),
  }), {})
)

const mergeCutRequirements = (first = {}, second = {}) => (
  CUT_REQUIREMENT_LENSES.reduce((result, lens) => {
    const firstRequirement = first[lens.id]
    const secondRequirement = second[lens.id]
    const texts = [firstRequirement?.text, secondRequirement?.text]
      .map((text) => text?.trim())
      .filter(Boolean)
    return {
      ...result,
      [lens.id]: {
        ...(firstRequirement || {}),
        lens: lens.id,
        text: [...new Set(texts)].join(' / '),
        provenance: 'User',
      },
    }
  }, {})
)

const createCutPlanItemId = () => `cut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const createCutPlanItem = ({
  order = 1,
  beat = 0,
  // Beat 안에서의 순번. 컷 번호를 1-1, 1-2처럼 쓰기 위한 것.
  beatOrder = 1,
  time = '',
  place = '',
  content = '',
  purpose = '',
  characters = '',
  // 샷은 촬영이 정한다. 기본값을 넣어 두면 정해진 것처럼 읽혀,
  // 촬영을 부르지 않고 넘어가도 화면에서 구분되지 않는다 (DG1 P2).
  shotSize = '',
  angle = '',
  cameraMove = '',
  // 촬영이 왜 이 샷을 골랐는지. 사용자가 판정하려면 근거가 있어야 한다.
  shotReason = '',
  // 화면에서 시선이 먼저 가야 할 것. 프롬프트가 이것을 강조한다.
  dominant = '',
  // 사용자가 조립된 프롬프트를 직접 고친 경우. 비어 있으면 컷에서 조립한
  // 문장을 쓴다. 원문은 언제든 다시 조립할 수 있으므로 되돌리기가 가능하다.
  promptOverride = '',
  // 컷에 Fixed/Tentative/Open 축은 두지 않는다.
  //   Open  → 책임 축의 '후속 공정 위임'과 같은 말이었다 (DG1 P3).
  //   Fixed → '이미지에서 확정' 선언이 제약을 만든다.
  //   Tentative → provenance가 'AI'로 남아 있는 것이 곧 미검토 상태다.
  // 검토 여부는 provenance가 말한다. 사용자가 손대면 'User'로 바뀐다.
  provenance = 'AI',
  requirements = {},
} = {}) => {
  const id = createCutPlanItemId()
  return {
    id,
    order,
    beat,
    beatOrder,
    time,
    place,
    content,
    purpose,
    characters,
    shotSize,
    angle,
    cameraMove,
    shotReason,
    dominant,
    promptOverride,
    provenance,
    requirements: createCutRequirements(id, requirements, provenance),
  }
}

// Beat의 대본 요소를 읽어 줄콘티 초안을 만드는 Mock.
// 실제 Narrative LLM 호출로 교체될 자리다.
const TIME_HINTS = [
  ['밤', '밤'], ['새벽', '새벽'], ['아침', '아침'], ['낮', '낮'],
  ['저녁', '저녁'], ['NIGHT', '밤'], ['DAY', '낮'], ['MORNING', '아침'],
]

// 예제 씬의 등장인물. 실제로는 대본에서 추출하거나 사용자가 지정한다.
// 등장인물은 씬 기준에서 가져온다. 상수로 두면 씬이 바뀌어도 같은 이름만
// 찾게 되고, 복도 씬의 인물은 어느 컷에도 들어가지 않는다.
const castNamesOf = (sceneState) => (sceneState?.characters || []).map((c) => c.name)

// 대본 전체에서 시간·장소를 한 번만 추론한다. 컷마다 다시 뽑으면 흔들린다.
const inferSceneContext = (screenplay) => {
  const heading = screenplay.find((element) => element.type === 'scene-heading')
  const firstAction = screenplay.find((element) => element.type === 'action')
  const source = `${heading?.text || ''} ${firstAction?.text || ''}`

  const time = TIME_HINTS.find(([hint]) => source.includes(hint))?.[1] || ''

  // 장소는 씬 heading이 이미 말해 준다. "실험실, 밤"에서 시간 부분만
  // 떼면 장소가 남는다 — 낱말 목록으로 찾으면 목록에 없는 장소(등대,
  // 폐공장)를 놓치고, "꼭대기 방"에서 '방'만 집어내기도 한다.
  const stripTime = (text = '') => text
    .replace(/^(INT|EXT|I\/E)[.\s]*/i, '')
    // "실험실, 밤" / "실험실 - 밤" / "WAREHOUSE - NIGHT"
    .split(/\s*[,\-–]\s*/)[0]
    .trim()

  let place = stripTime(heading?.text || '')
  // heading이 문장이면 표의 장소 칸에 넘친다. 그때는 비워 둔다 —
  // 틀린 장소보다 빈 칸이 낫다.
  if (place.length > 14) place = ''
  return { time, place }
}

const createMockCutPlan = (state) => {
  const withIdx = state.screenplay.map((element, globalIdx) => ({ ...element, globalIdx }))
  const beats = [...new Set(withIdx.map((element) => element.beat ?? 0))].sort((a, b) => a - b)
  const items = []

  // 시간·장소는 씬마다 다르다. 대본 전체에서 한 번 뽑으면 두 번째 씬의
  // 컷이 첫 씬의 장소를 물려받는다 — 씬은 시공간이 연속된 범위다.
  const sceneOf = (beat) => {
    const openings = withIdx.filter((element) => element.type === 'scene-heading')
    const opening = [...openings].reverse().find((element) => (element.beat ?? 0) <= beat)
    if (!opening) return withIdx
    const next = openings.find((element) => (element.beat ?? 0) > (opening.beat ?? 0))
    return withIdx.filter((element) => (
      (element.beat ?? 0) >= (opening.beat ?? 0)
      && (next ? (element.beat ?? 0) < (next.beat ?? 0) : true)
    ))
  }

  const scenes = selectScenes(state.screenplay)

  beats.forEach((beat) => {
    const { time, place } = inferSceneContext(sceneOf(beat))
    // 이 Beat가 속한 씬의 인물만 후보로 본다.
    const sceneId = sceneOfBeat(scenes, beat)?.id
    const KNOWN_CAST = castNamesOf(state.sceneStates?.[sceneId] || state.sceneStates?.['scene-0'])
    const beatElements = withIdx.filter((element) => (element.beat ?? 0) === beat)
    const actions = beatElements.filter((element) => element.type === 'action')
    const heading = beatElements.find((element) => element.type === 'scene-heading')
    // 이 Beat에 등장하는 인물. 서술에서 찾는다.
    const beatText = beatElements.map((element) => element.text).join(' ')
    const cast = KNOWN_CAST.filter((name) => beatText.includes(name))

    let beatOrder = 0
    const push = (fields) => {
      beatOrder += 1
      const resolvedCharacters = fields.characters ?? cast.join(', ')
      const narrativeRole = fields.purpose
        ? `${fields.purpose}이 이 컷의 핵심으로 읽혀야 한다.`
        : '이 컷이 전달할 사건과 정보를 확인한다.'
      const miseRole = resolvedCharacters
        ? `${resolvedCharacters}의 위치와 관계가 화면에서 읽혀야 한다.`
        : `${place || '장소'}의 공간 구조와 필요한 소품을 확인한다.`
      const cameraRole = fields.purpose
        ? `${fields.purpose}이 드러나는 시점과 구도를 선택한다.`
        : '관객이 보아야 할 정보와 시점을 확인한다.'
      const editingRole = items.length === 0
        ? '씬의 첫 정보와 공간을 세우는 시작점이 된다.'
        : '앞 컷의 정보나 행동을 이어받아 다음 변화로 넘긴다.'

      items.push(createCutPlanItem({
        order: items.length + 1,
        beat,
        beatOrder,
        time,
        place,
        characters: resolvedCharacters,
        requirements: {
          narrative: { text: narrativeRole },
          mise: { text: miseRole },
          camera: { text: cameraRole },
          editing: { text: editingRole },
        },
        ...fields,
      }))
    }

    // 공간을 세우는 컷: scene heading이 있는 Beat에서만.
    // 공간을 훑는 컷이므로 카메라가 움직인다 — 정지 이미지가 담을 수 없는
    // 정보라 책임 선언과 패널 화살표의 대상이 된다 (DG1 P3).
    if (heading) {
      // 샷은 촬영이 정한다. 여기서 넣으면 촬영을 부르기 전에 값이 차 있다.
      push({
        content: shortenNarrativeText(actions[0]?.text || heading.text, 60),
        purpose: '공간 설정',
      })
    }

    // 나머지 서술은 문장 하나가 컷 하나다. 대사가 없으므로 컷을 나누는
    // 근거는 행동이다 — 무엇이 일어나는지가 바뀌면 컷이 바뀐다.
    const body = heading ? actions.slice(1) : actions
    body.forEach((action) => {
      // 그 문장에 나오는 인물만 그 컷에 넣는다. Beat 전체 인물을 넣으면
      // 화면에 없는 사람까지 그리게 된다.
      const inLine = KNOWN_CAST.filter((name) => action.text.includes(name))
      const subject = inLine.length > 0 ? inLine : cast

      // 한 인물의 반응이면 가깝게, 둘이 함께 움직이면 넓게 잡는다.
      const shotSize = subject.length > 1 ? 'Medium' : 'Bust'

      push({
        content: shortenNarrativeText(action.text, 60),
        purpose: subject.length > 1 ? '관계' : '행동 강조',
        characters: subject.join(', '),
        shotSize,
      })
    })
  })

  return items
}

// --- 컷 → 프롬프트 조립 -------------------------------------------------
// 프롬프트는 사용자가 백지에서 쓰는 것이 아니라 확정된 컷에서 조립된다.
// 줄콘티를 텍스트로 확정한 이유가 여기에 있다 (Spec §22.12:
// "Fixed Decisions are explicit generation constraints").
// 설계 근거: docs/PANEL_GENERATION_DESIGN.md
const SHOT_SIZE_PHRASES = {
  Wide: '와이드 샷, 공간 전체가 보인다',
  Full: '풀 샷, 인물 전신이 들어온다',
  Medium: '미디엄 샷, 상반신 위주',
  Bust: '바스트 샷, 가슴 위로',
  'Close-Up': '클로즈업, 얼굴이 화면을 채운다',
  ECU: '익스트림 클로즈업, 부분만 크게',
}

// purpose는 묘사가 아니라 무엇을 강조할지를 정한다. 구도 지시로 옮긴다.
const PURPOSE_PHRASES = {
  '공간 설정': '공간의 배치와 분위기가 읽히도록',
  발화: '말하는 인물에게 시선이 가도록',
  리액션: '반응하는 표정이 분명히 보이도록',
  '행동 강조': '동작의 방향과 결과가 분명히 보이도록',
}

export const buildCutPrompt = (cut, {
  sceneIntention = '',
  sceneNote = '',
  // 컷을 가로지르는 기준. 같은 인물과 공간이 컷마다 달라지지 않게 한다.
  sceneState = null,
  // 앞 컷과의 이음새. 시간이 흘렀으면 그 컷은 앞 컷의 연속이 아니다.
  seam = null,
  // 이 컷이 씬에서 몇 번째인가. 인물·공간 상태가 변하므로 시점이 필요하다.
  cutIndex = null,
  // 컷 id → 순번. 상태 변화가 id로 기록되므로 순서를 옮길 표가 필요하다.
  cutOrder = null,
  // 이 컷에 걸리는 책임 선언 (DG1 P3). 위임한 요소는 프롬프트에서 빼고,
  // 엄격히 고정한 요소는 제약으로 넣는다.
  declarations = [],
} = {}) => {
  if (!cut) return null

  // 자동 조립분과 사용자가 덧붙인 지시를 나눠 둔다. provenance가 갈린다.
  // 조각을 이어 붙이면 라벨 나열처럼 읽힌다. 문장으로 만든다.
  const shot = SHOT_SIZE_PHRASES[cut.shotSize] || cut.shotSize
  const cast = (cut.characters || '').split(',').map((n) => n.trim()).filter(Boolean)

  // 1문장: 언제, 어디서, 어떤 크기로.
  // 샷은 촬영이 정한다. 아직 안 정했으면 그 자리를 비워 둔다 —
  // 빈 값으로 문장을 만들면 ". ."처럼 깨진다.
  const place = cut.place ? `${cut.place}${cut.time ? ` ${cut.time}` : ''}` : cut.time
  // 앵글은 기본값(눈높이)이거나 미정일 때 굳이 적지 않는다.
  const angleText = cut.angle && cut.angle !== 'Eye level' ? `${cut.angle}. ` : ''
  const opening = [
    place && `${place}.`,
    angleText.trim(),
    shot && `${shot}.`,
  ].filter(Boolean).join(' ')

  // 2문장: 화면 안에서 무슨 일이 일어나는가.
  const isSpeech = cut.purpose === '발화' || cut.purpose === '리액션'
  const speaker = cast[0]
  let action = ''
  if (cut.content) {
    if (isSpeech) {
      // 대사를 그대로 두면 이미지 모델이 글자를 그리려 한다.
      action = speaker
        ? `${speaker}${hasFinalConsonant(speaker) ? '이' : '가'} "${cut.content}"라고 말하는 순간이다.`
        : `누군가 "${cut.content}"라고 말하는 순간이다.`
    } else {
      const body = cut.content.replace(/[.。]\s*$/, '')
      action = `${body}.`
    }
  }

  // 3문장: 화면에 누가 있는가. 앞 문장에 이미 나온 인물은 다시 적지 않는다.
  const others = cast.filter((name) => !action.includes(name))
  const castNames = others.join(', ')
  const castLine = others.length > 0
    ? `화면에는 ${castNames}${hasFinalConsonant(castNames) ? '이' : '가'} ${others.length > 1 ? '함께 ' : ''}보인다.`
    : ''

  // 4문장: 무엇이 읽혀야 하는가.
  // 촬영이 정한 dominant가 있으면 그것을 쓴다 — 화면에서 시선이 먼저 가야
  // 할 것이므로, purpose보다 구체적인 지시가 된다.
  const emphasisPhrase = PURPOSE_PHRASES[cut.purpose]
  const emphasis = cut.dominant
    ? `${cut.dominant}에 시선이 먼저 가도록 잡는다.`
    : emphasisPhrase
      ? `${emphasisPhrase} 잡는다.`
      : (cut.purpose
        ? `${cut.purpose}${hasFinalConsonant(cut.purpose) ? '이' : '가'} 드러나도록 잡는다.`
        : '')

  // 이음새가 앞 컷과의 관계를 정한다. 경과가 있으면 앞 컷 직후가 아니므로
  // 인물의 자세나 위치를 그대로 이어 그리면 안 된다.
  const seamLine = seam && seam.elapsed !== 'continuous'
    ? (seam.elapsed === 'later'
      ? '앞 컷에서 시간이 흘렀다. 인물의 자세와 위치가 그대로일 필요는 없다.'
      : '앞 컷에서 잠시 지났다.')
    : ''

  // 씬 기준을 컷 문장에 섞는다. 컷마다 같은 문구가 들어가야 같은 인물과
  // 같은 방으로 그려진다. 아직 정하지 않은 항목(open)은 넣지 않는다 —
  // 미정을 문장으로 만들면 모델이 그것을 정해버린다.
  const reference = selectSceneReference(sceneState, cut, cutIndex, cutOrder)
  const referenceLine = [
    reference.location && `공간 기준: ${reference.location}`,
    reference.characters.length > 0 && reference.characters
      .map((entry) => `${entry.name}: ${entry.detail}`)
      .join(' / '),
    reference.environment && `환경: ${reference.environment}`,
  ].filter(Boolean).join(' · ')

  const auto = [opening, seamLine, action, castLine, emphasis].filter(Boolean).join(' ')

  // 이 컷에 걸리는 선언만 고른다. 씬 범위이거나 이 컷을 지목한 것.
  const scoped = declarations.filter((decl) => (
    decl.scope === 'scene' || decl.cutId === cut.id
  ))
  const applicable = scoped.filter((decl) => decl.status === 'Accepted')

  // 엄격히 고정한 요소는 명시적 제약이 된다 (Spec §22.12).
  const constraints = applicable
    .filter((decl) => decl.responsibility === 'image')
    .map((decl) => decl.element)

  // 위임한 요소는 그리지 말라고 지시하는 대신 프롬프트에서 다루지 않는다.
  // 모델은 어차피 무언가를 그리지만, 그것이 결정으로 굳지 않게 하는 것은
  // 프롬프트가 아니라 화면 표시의 몫이다 (Spec §17.5).
  const delegated = applicable
    .filter((decl) => decl.responsibility === 'delegate')
    .map((decl) => decl.element)

  // 방향만 표시하는 요소는 그림 밖 채널로 간다.
  // 방향은 스토리보드가 정한 값이므로 함께 넘긴다 — 패널이 이것을 그린다.
  //
  // 아직 판정하지 않은 것도 포함한다. 방향은 대개 컷이 이미 말한 것을
  // (카메라 이동 같은) 옮겨 적은 것이라, 판정 전이라고 감추면 컷에 있는
  // 정보가 패널에서 사라진다. 대신 pending으로 표시해 확정과 구분한다.
  const offImage = scoped
    .filter((decl) => (
      decl.responsibility === 'direction'
      && (decl.status === 'Accepted' || decl.status === 'Proposed')
    ))
    .map((decl) => ({
      element: decl.element,
      channel: decl.channel,
      pending: decl.status === 'Proposed',
      direction: decl.direction,
    }))

  // 장면 전체에 걸리는 지시는 컷마다 반복하지 않고 따로 둔다.
  const shared = [
    sceneIntention && `장면 의도: ${sceneIntention}`,
    sceneNote && `장면 전체 연출 지시: ${sceneNote}`,
    referenceLine,
    constraints.length > 0 && `고정: ${constraints.join(', ')}`,
  ]
    .filter(Boolean)
    .join(' / ')

  // 사용자가 직접 고쳤으면 그것을 쓴다. 조립분은 되돌리기용으로 함께 넘긴다.
  const edited = (cut.promptOverride || '').trim()

  return {
    auto,
    // 실제로 생성에 쓰이는 문장.
    effective: edited || auto,
    isEdited: Boolean(edited),
    shared,
    // 컷의 어느 값이 프롬프트의 어느 자리로 갔는지 추적 가능하게 남긴다.
    parts: { opening, action, castLine, emphasis },
    // 이 컷이 무엇을 책임지고 무엇을 넘겼는지. 화면 표시와 DG3의 평가 범위가
    // 이 값을 읽는다 — 위임한 것은 전달 실패로 보고되면 안 된다.
    responsibility: { constraints, delegated, offImage },
    // 이 컷에 걸린 씬 기준. 어디서 온 문구인지 화면에서 밝힐 때 쓴다.
    reference,
  }
}

// 대본 단계의 의도와 컷 플랜 뒤에 추가한 연출 지시는 출처와 쓰임이 다르다.
// 다만 샷을 설계할 때는 둘 다 장면을 가로지르는 기준이므로 함께 보낸다.
// 컷을 나누는 요청에는 이 함수를 쓰지 않는다 — 후속 지시가 과거의 컷 분해를
// 몰래 바꾸면 안 된다.
const composeShotDirection = (sceneIntention = '', scenePromptNote = '') => [
  sceneIntention.trim() && `대본 단계 장면 의도: ${sceneIntention.trim()}`,
  scenePromptNote.trim() && `컷 플랜 이후 장면 전체 연출 지시: ${scenePromptNote.trim()}`,
].filter(Boolean).join('\n')

// --- 촬영 렌즈: 커버리지 진단 -------------------------------------------
// 촬영이 담당하는 shotSize·angle·cameraMove는 이미 컷 표의 컬럼이다.
// 그래서 rail에서는 값을 또 편집하지 않고, 표가 보여주지 못하는 것을 짚는다 —
// 한 컷만 봐서는 알 수 없고 여러 컷을 함께 읽어야 드러나는 문제들이다.
// (DG1 P2: 보이는 것은 판정으로, 보이지 않는 공백은 질문으로 다룬다.)
//
// 각 진단은 컷을 지목한다. 고치는 것은 표에서 한다 — 진단은 발견이고
// 처분은 사용자 몫이다 (design_goal.md: 발견과 처분의 분리).
// 문제의 원인이 어느 층위에 있는가 (design_goal.md DG2).
// 층위마다 개입 수단이 다르므로, 진단이 층위를 밝혀야 어디를 고쳐야 할지
// 알 수 있다. 한 층위의 수정이 다른 층위의 결손을 만들지 않게 하는 것이
// DG2의 요구이기도 하다.
export const PROBLEM_LAYERS = {
  attribute: { label: '속성', hint: '컷의 값. 표에서 고칩니다' },
  shot_structure: { label: '컷 구성', hint: '컷을 추가·삭제·분할·병합하는 문제입니다' },
  shot_relation: { label: '컷 관계', hint: '두 컷 이상의 연결을 다루는 문제입니다' },
  scene_structure: { label: '씬 구조', hint: '장면 전체의 순서와 정보 배치 문제입니다' },
}

const SHOT_SIZE_ORDER = ['Wide', 'Full', 'Medium', 'Bust', 'Close-Up', 'ECU']


// 모델이 세운 카메라 흐름과 실제 샷이 어긋나는 지점을 짚는다.
// 값을 고치지는 않는다 — 잠깐 물러났다 붙는 것은 실제 연출 기법이고,
// 그것이 의도인지 실수인지는 창작자가 판정할 일이다.
const diagnoseAgainstCoverage = (cutPlan, coverages, scenes) => {
  const findings = []
  const rank = (id) => {
    const cut = cutPlan.find((item) => item.id === id)
    return cut ? SHOT_SIZE_ORDER.indexOf(cut.shotSize) : -1
  }
  const label = (id) => {
    const cut = cutPlan.find((item) => item.id === id)
    return cut ? `${cut.beat + 1}-${cut.beatOrder}` : '?'
  }

  scenes.forEach((scene) => {
    const coverage = coverages[scene.id]
    if (!coverage) return

    // 공간을 세우기로 한 컷이 좁게 잡혔다.
    const tightAnchors = coverage.anchorCutIds.filter((id) => rank(id) > 1)
    if (tightAnchors.length > 0) {
      findings.push({
        id: `cov-anchor-${scene.id}`,
        type: 'anchor-too-tight',
        layer: 'shot_relation',
        title: `컷 ${tightAnchors.map(label).join(', ')} · 공간을 보여줄 컷인데 화면이 좁습니다`,
        detail: '이 컷에서 장소를 보여주기로 했는데 인물에 붙어 있습니다. 넓게 잡아야 관객이 어디인지 압니다.',
        cutIds: tightAnchors,
      })
    }

    // 접근 구간에서 크기가 넓어졌다. 접근이 끊긴다.
    let previous = null
    const widened = []
    coverage.approachCutIds.forEach((id) => {
      const current = rank(id)
      if (current < 0) return
      if (previous !== null && current < previous) widened.push(id)
      previous = current
    })
    if (widened.length > 0) {
      findings.push({
        id: `cov-approach-${scene.id}`,
        type: 'approach-broken',
        layer: 'shot_relation',
        title: `컷 ${widened.map(label).join(', ')} · 점점 다가가다가 갑자기 물러납니다`,
        detail: '인물에게 다가가며 긴장을 쌓는 중인데 이 컷에서 화면이 다시 넓어집니다. 일부러 숨을 돌리려던 것이면 그대로 두세요.',
        cutIds: widened,
      })
    }

    // 가장 중요한 컷보다 더 가까이 잡은 컷이 있다. 그러면 그 컷이 안 도드라진다.
    if (coverage.peakCutId) {
      const peak = rank(coverage.peakCutId)
      const closer = cutPlan
        .filter((cut) => cut.id !== coverage.peakCutId
          && SHOT_SIZE_ORDER.indexOf(cut.shotSize) >= peak
          && peak >= 0)
        .map((cut) => cut.id)
      if (closer.length > 0) {
        findings.push({
          id: `cov-peak-${scene.id}`,
          type: 'peak-not-closest',
          layer: 'shot_relation',
          title: `컷 ${label(coverage.peakCutId)}이(가) 가장 클 차례인데 묻힙니다`,
          detail: `이 장면에서 제일 힘을 줄 컷은 ${label(coverage.peakCutId)}입니다. 그런데 컷 ${closer.slice(0, 3).map(label).join(', ')}을(를) 그만큼 크게 잡아서, 정작 ${label(coverage.peakCutId)}이(가) 특별해 보이지 않습니다.`,
          cutIds: [coverage.peakCutId, ...closer],
        })
      }
    }
  })

  return findings
}

// 촬영 진단 — 한 컷 안의 문제. 이 컷이 무엇을 어떻게 보여주는가.
// 컷 사이 문제(연속·점프컷·접근)는 편집이 본다. 층위가 다르다.
export const diagnoseCoverage = (cutPlan = []) => {
  if (cutPlan.length === 0) return []
  const findings = []

  // 샷 미정은 진단으로 내지 않는다. `샷 정하기 · N컷 미정` 버튼이 같은
  // 것을 이미 말하고, 진단으로 두면 여기서는 고칠 수 없는 카드가 하나
  // 늘 뿐이다 — 진단은 그 자리에서 처분할 수 있는 것만 짚는다.

  // 1. 컷 내용과 샷 크기가 어긋난다. 손에 든 것이 결정적인데 넓게 잡거나,
  //    공간을 세워야 하는데 좁게 잡은 경우다.
  const DETAIL_WORDS = ['손', '표정', '눈', '얼굴', '노트', '연필', '화면', '쥔', '짚어']
  const SPACE_WORDS = ['공간', '방', '전체', '멀리', '들어온다', '거리']
  cutPlan.forEach((cut) => {
    if (!cut.shotSize) return
    const rank = SHOT_SIZE_ORDER.indexOf(cut.shotSize)
    const text = `${cut.content || ''} ${cut.purpose || ''}`

    if (rank <= 1 && DETAIL_WORDS.some((word) => text.includes(word))) {
      findings.push({
        id: `size-detail-${cut.id}`,
        type: 'size-mismatch',
        layer: 'attribute',
        title: `컷 ${cut.beat + 1}-${cut.beatOrder} · 작은 것을 보여주는데 화면이 넓습니다`,
        detail: `${cut.shotSize}로 잡으면 정작 보여줄 것이 화면에서 너무 작아집니다.`,
        cutIds: [cut.id],
      })
    }
    if (rank >= 4 && SPACE_WORDS.some((word) => text.includes(word))) {
      findings.push({
        id: `size-space-${cut.id}`,
        type: 'size-mismatch',
        layer: 'attribute',
        title: `컷 ${cut.beat + 1}-${cut.beatOrder} · 공간을 보여주는데 화면이 좁습니다`,
        detail: `${cut.shotSize}로 잡으면 누가 어디에 있는지가 화면에 안 담깁니다.`,
        cutIds: [cut.id],
      })
    }
  })

  // 앵글이 밋밋한 컷(angle-flat)도 내지 않는다. 표에 앵글 칸이 없어서
  // 짚어줘도 고칠 자리가 없고, 촬영에 수정본을 물을 수도 없다
  // (SHOT_FIXABLE은 샷 크기로 풀리는 것만 받는다).
  // 앵글을 표에서 다룰 수 있게 되면 그때 되살린다.

  // 2. 공간을 세우는 컷 없이 시작하면 관객은 어디인지 모른다.
  //    씬 범위의 문제라 촬영이 짚는다 — 한 컷을 고쳐서 될 일이 아니다.
  const decided = cutPlan.filter((cut) => cut.shotSize)
  if (decided.length > 0) {
    const establishing = decided.some((cut) => SHOT_SIZE_ORDER.indexOf(cut.shotSize) <= 1)
    if (!establishing) {
      findings.push({
        id: 'no-establishing',
        type: 'no-establishing',
        layer: 'scene_structure',
        title: '여기가 어디인지 보여주는 컷이 없습니다',
        detail: '컷이 전부 인물에 붙어 있어서, 관객은 장소를 모른 채 장면을 봅니다. 넓게 잡은 컷을 하나 넣어보세요.',
        cutIds: [cutPlan[0].id],
      })
    }
  }

  return findings
}

// 편집 진단 중 샷에 관한 것 — 컷을 이어 붙였을 때 어떻게 읽히는가.
// 촬영이 아니라 편집인 이유: 이것들은 컷 하나를 고쳐서 해결되지 않고
// 컷 사이의 관계를 다시 맺어야 한다 (design_goal.md DG2 P1).
const diagnoseShotFlow = (cutPlan, coverages, scenes) => {
  const findings = []

  // 1. 같은 샷 크기가 이어지면 컷을 나눈 의미가 화면에 드러나지 않는다.
  let runStart = 0
  for (let i = 1; i <= cutPlan.length; i += 1) {
    const ended = i === cutPlan.length || cutPlan[i].shotSize !== cutPlan[runStart].shotSize
    if (ended) {
      const run = i - runStart
      if (run >= 3 && cutPlan[runStart].shotSize) {
        findings.push({
          id: `run-${cutPlan[runStart].id}`,
          type: 'size-run',
          layer: 'shot_relation',
          title: `같은 크기로 ${run}컷이 이어집니다`,
          detail: `${cutPlan[runStart].shotSize}가 계속되면 화면이 그대로인 것처럼 보여서, 관객은 컷이 넘어간 줄 모릅니다.`,
          cutIds: cutPlan.slice(runStart, i).map((cut) => cut.id),
        })
      }
      runStart = i
    }
  }

  // 2. 크기 차이가 너무 작으면 컷이 튄다(점프컷).
  cutPlan.forEach((cut, index) => {
    if (index === 0 || !cut.shotSize) return
    const prev = cutPlan[index - 1]
    if (prev.beat !== cut.beat || !prev.shotSize) return
    const gap = Math.abs(
      SHOT_SIZE_ORDER.indexOf(cut.shotSize) - SHOT_SIZE_ORDER.indexOf(prev.shotSize),
    )
    if (gap === 1 && prev.angle === cut.angle && (cut.characters || '') === (prev.characters || '')) {
      findings.push({
        id: `jump-${cut.id}`,
        type: 'jump-cut',
        layer: 'shot_relation',
        title: `컷 ${prev.beat + 1}-${prev.beatOrder} → ${cut.beat + 1}-${cut.beatOrder} · 이어 붙이면 화면이 툭 튑니다`,
        detail: '두 컷의 크기도 앵글도 거의 같습니다. 이럴 때는 화면이 자연스럽게 넘어가지 않고 살짝 뛴 것처럼 보입니다.',
        cutIds: [prev.id, cut.id],
      })
    }
  })

  // 3. 촬영이 세운 카메라 흐름과 실제 샷이 어긋나는 지점.
  findings.push(...diagnoseAgainstCoverage(cutPlan, coverages, scenes))
  return findings
}

// --- 이음새(seam): 컷과 컷 사이 -----------------------------------------
// design_goal.md DG2 P1: "이음새에는 두 컷 사이에서 생략된 것, 연결 방식,
// 흐른 시간, 그리고 추가 컷의 필요성이 담긴다."
//
// 넷 중 '추가 컷의 필요성'은 편집 렌즈의 진단이 이미 맡고 있으므로 셋만 둔다.
// 이음새는 컷이 아니라 컷 사이에 붙는다. 그래서 앞 컷의 속성이 아니라
// 독립된 객체다 — 컷이 병합·분할되어도 사이에 무엇이 있었는지가 남아야 한다.
//
// 세 항목이 서로 다른 것을 묻는다:
//   elision — 무엇을 건너뛰었나. 화면에 없는 것을 기록한다.
//   join    — 어떻게 이어지나. 컷/디졸브/매치컷은 관객이 읽는 방식이 다르다.
//   elapsed — 얼마나 흘렀나. 같은 두 컷도 3초와 3시간은 다른 장면이 된다.
export const SEAM_JOINS = [
  { id: 'cut', label: '컷', hint: '바로 이어진다' },
  { id: 'match', label: '매치컷', hint: '형태나 동작이 이어진다' },
  { id: 'dissolve', label: '디졸브', hint: '겹치며 넘어간다 — 시간 경과' },
  { id: 'fade', label: '페이드', hint: '끊고 다시 연다 — 단락 전환' },
]

export const SEAM_ELAPSED = [
  { id: 'continuous', label: '연속', hint: '앞 컷에서 바로 이어진다' },
  { id: 'moments', label: '잠시', hint: '몇 초에서 몇 분' },
  { id: 'later', label: '경과', hint: '뚜렷한 시간이 흘렀다' },
]

const createSeam = ({ join = 'cut', elapsed = 'continuous', elision = '' } = {}) => ({
  join,
  elapsed,
  elision,
})

// 이음새는 앞 컷의 id로 식별한다. 컷이 지워지면 그 이음새도 의미를 잃는다.
export const seamKeyFor = (shotId) => `seam-${shotId}`

// 기본값과 다른 것만 화면에 표시한다. 전부 '컷 · 연속'이면 표시가 무의미하고,
// 감독이 실제로 정한 것만 눈에 띄어야 한다.
export const isSeamMarked = (seam) => Boolean(
  seam && (seam.join !== 'cut' || seam.elapsed !== 'continuous' || seam.elision),
)

// --- 편집 렌즈: 이음새 진단 ---------------------------------------------
// 컷 사이(이음새)를 본다. 컷 하나하나는 멀쩡해도 이어 붙이면 문제가 되는
// 것들이다 — 대본의 사건이 컷으로 안 나뉘었거나, 두 컷이 같은 일을 하거나,
// 컷 없이 시간이 건너뛰는 경우.
//
// 삽입·삭제는 표에 이미 있다(행마다 `+`). 그래서 여기서도 고치지 않고
// 어느 이음새에 무엇이 있는지만 짚는다 (발견과 처분의 분리).
export const diagnoseSeams = (cutPlan = [], screenplay = [], {
  // 컷 → 패널 → 이음새. 이음새는 패널 사이에 붙으므로 컷에서 바로 찾을 수 없다.
  seams = {},
  shots = [],
  // 촬영이 세운 카메라 흐름. 샷이 이어지는지는 편집이 본다.
  coverages = {},
  scenes = [],
} = {}) => {
  if (cutPlan.length === 0) return []
  const findings = [...diagnoseShotFlow(cutPlan, coverages, scenes)]

  const seamForCut = (cutId) => {
    const shot = shots.find((entry) => entry.cutPlanItemId === cutId)
    return shot ? seams[seamKeyFor(shot.id)] : undefined
  }

  // 1. 한 컷에 사건이 여러 개 압축돼 있다. 대본의 액션 줄 수와 그 Beat의
  //    컷 수를 견준다 — 행동이 여러 단계인데 컷이 하나면 화면이 그것을
  //    한 장에 담을 수 없다.
  const beats = [...new Set(cutPlan.map((cut) => cut.beat))]
  beats.forEach((beat) => {
    const inBeat = cutPlan.filter((cut) => cut.beat === beat)
    const actions = screenplay.filter((el) => (el.beat ?? 0) === beat && el.type === 'action')
    if (actions.length >= 3 && inBeat.length === 1) {
      findings.push({
        id: `dense-${beat}`,
        type: 'compressed',
        layer: 'shot_structure',
        title: `Beat ${beat + 1} · 행동 ${actions.length}개가 컷 하나에 담겼습니다`,
        detail: '대본에는 여러 단계로 적혀 있는데 컷이 하나뿐입니다. 한 장에 다 담으면 무엇이 먼저인지 안 보입니다. 나눠보세요.',
        cutIds: inBeat.map((cut) => cut.id),
        action: 'split',
      })
    }
  })

  // 2. 붙어 있는 두 컷이 같은 내용을 담고 있다. 컷을 나눈 값이 없다.
  cutPlan.forEach((cut, index) => {
    if (index === 0) return
    const prev = cutPlan[index - 1]
    if (!cut.content || !prev.content) return
    if (cut.content.trim() === prev.content.trim()) {
      findings.push({
        id: `dup-${cut.id}`,
        type: 'duplicate',
        layer: 'shot_relation',
        title: `컷 ${prev.beat + 1}-${prev.beatOrder}과(와) ${cut.beat + 1}-${cut.beatOrder}이(가) 같은 내용입니다`,
        detail: '두 컷이 같은 것을 담고 있어서 하나는 없어도 됩니다. 합치거나 한쪽을 다시 써보세요.',
        cutIds: [prev.id, cut.id],
        action: 'merge',
      })
    }
  })

  // 3. Beat가 통째로 컷 없이 넘어갔다. 대본에 있는데 화면에 없는 것이다.
  const scriptBeats = [...new Set(screenplay.map((el) => el.beat ?? 0))]
  scriptBeats.forEach((beat) => {
    if (cutPlan.some((cut) => cut.beat === beat)) return
    const near = cutPlan.filter((cut) => cut.beat < beat).slice(-1)
    findings.push({
      id: `gap-${beat}`,
      type: 'skipped-beat',
      layer: 'shot_structure',
      title: `Beat ${beat + 1}이(가) 컷 없이 넘어갔습니다`,
      detail: '대본에는 있는데 컷이 하나도 없습니다. 이대로 그리면 이 대목은 화면에 안 나옵니다.',
      cutIds: near.map((cut) => cut.id),
      action: 'insert',
    })
  })

  // 4. 시간이 흘렀다고 표시했는데 연결은 그냥 컷이다. 관객은 두 컷이
  //    바로 이어진 것으로 읽는다 — 표시한 경과가 화면에 전달되지 않는다.
  cutPlan.forEach((cut, index) => {
    if (index === 0) return
    const seam = seamForCut(cutPlan[index - 1].id)
    if (!seam) return
    if (seam.elapsed === 'later' && seam.join === 'cut') {
      findings.push({
        id: `elapsed-${cut.id}`,
        type: 'unmarked-elapsed',
        layer: 'shot_relation',
        title: `컷 ${cutPlan[index - 1].beat + 1}-${cutPlan[index - 1].beatOrder} → ${cut.beat + 1}-${cut.beatOrder} · 시간이 흐른 게 안 보입니다`,
        detail: '시간이 지났다고 적어 두었지만 화면은 그냥 이어집니다. 관객은 바로 다음 순간으로 읽습니다.',
        cutIds: [cutPlan[index - 1].id, cut.id],
        action: 'seam',
      })
    }
  })

  // 5. 생략한 것을 적어두고 아무 표시도 하지 않았다. 생략은 기록만으로
  //    관객에게 전달되지 않는다 — 화면에 근거가 있어야 한다.
  cutPlan.forEach((cut, index) => {
    if (index === 0) return
    const prev = cutPlan[index - 1]
    const seam = seamForCut(prev.id)
    if (!seam?.elision) return
    if (seam.join === 'cut' && seam.elapsed === 'continuous') {
      findings.push({
        id: `elision-${cut.id}`,
        type: 'unmarked-elision',
        layer: 'shot_relation',
        title: `컷 ${prev.beat + 1}-${prev.beatOrder} → ${cut.beat + 1}-${cut.beatOrder} · 건너뛴 게 안 보입니다`,
        detail: `"${seam.elision}"을 건너뛰기로 했는데, 화면만 보면 그냥 이어지는 것처럼 읽힙니다.`,
        cutIds: [prev.id, cut.id],
        action: 'seam',
      })
    }
  })

  return findings
}

// 예제 대본의 두 번째 씬. 씬마다 인물과 공간이 다르다는 것을 보이기 위해
// 첫 씬과 겹치는 인물이 없다.
const CORRIDOR_SCENE_STATE = {
  title: '연구동 복도, 밤',
  description: '실험실에서 이어지는 씬입니다. 공간이 다릅니다.',
  characters: [
    {
      id: 'harin-corridor',
      name: '하린',
      summary: '후드 · 노트를 든 채',
      image: '/img/lab_discovery_cu.png',
      facts: [
        { label: '외형 기준', value: '후드를 입고 노트를 손에 들고 있다' },
        { label: '표정', value: '아직 지정되지 않음', open: true },
      ],
    },
  ],
  location: {
    name: '연구동 복도',
    image: '/img/lab_corridor.png',
    facts: [
      { label: '장소 정체', value: '불이 반쯤 꺼진 연구동 복도' },
      { label: '고정 소품', value: '교수 연구실 문 · 게시판 · 소화전' },
    ],
  },
  environment: {
    name: '장면 공통',
    facts: [
      // 서버의 ENVIRONMENT_LABELS와 같은 이름을 쓴다. 빠뜨리면 그 씬에서는
      // 그림체를 정할 칸 자체가 없다.
      { label: '시간', value: '밤' },
      { label: '날씨', value: '', open: true },
      { label: '조명 기준', value: '드문드문한 형광등', shared: true },
      { label: '그림체', value: '', open: true, shared: true },
    ],
  },
}

// --- Scene: 시공간이 연속된 범위 -----------------------------------------
// 씬은 대본에서 파생된다. 별도 목록을 두면 대본의 씬 헤딩과 어긋날 수 있고,
// 그때 무엇이 진짜인지 알 수 없게 된다.
export const selectScenes = (screenplay = []) => {
  const openings = screenplay
    .map((element, index) => ({ ...element, index }))
    .filter((element) => element.type === 'scene-heading')
  const maxBeat = screenplay.length > 0
    ? Math.max(0, ...screenplay.map((element) => element.beat ?? 0))
    : 0

  // 씬 헤딩이 없으면 대본 전체가 한 씬이다.
  if (openings.length === 0) {
    if (screenplay.length === 0) return []
    return [{ id: 'scene-0', number: 1, heading: '', startBeat: 0, endBeat: maxBeat }]
  }

  return openings.map((opening, i) => {
    const next = openings[i + 1]
    const startBeat = opening.beat ?? 0
    return {
      id: `scene-${startBeat}`,
      number: i + 1,
      heading: opening.text,
      startBeat,
      endBeat: next ? (next.beat ?? 0) - 1 : maxBeat,
    }
  })
}

// 이 Beat가 속한 씬. 컷과 씬 기준을 묶을 때 쓴다.
export const sceneOfBeat = (scenes, beat) => (
  scenes.find((scene) => beat >= scene.startBeat && beat <= scene.endBeat) || null
)

const screenplayFingerprint = (screenplay = []) => screenplay
  .map((element) => `${element.type}:${element.text}`)
  .join('\n')

// 지금 보고 있는 씬의 기준. activeBeat가 속한 씬을 따른다.
export const selectActiveSceneState = (state) => {
  if (state.sceneStateStoryKey !== screenplayFingerprint(state.screenplay)) {
    return EMPTY_SCENE_STATE
  }
  const scenes = selectScenes(state.screenplay)
  const scene = sceneOfBeat(scenes, state.activeBeat ?? 0)
  return state.sceneStates[scene?.id] || state.sceneStates['scene-0'] || EMPTY_SCENE_STATE
}

export const selectActiveSceneId = (state) => {
  const scenes = selectScenes(state.screenplay)
  return sceneOfBeat(scenes, state.activeBeat ?? 0)?.id || 'scene-0'
}

// 레퍼런스 "그리는 중" 표시의 key. 씬이 빠지면 다른 씬의 같은 이름
// ('location', 또는 씬을 넘어 같은 인물 id)이 한 칸을 공유해, 한 씬을
// 그리는 동안 다른 씬까지 그리는 중으로 보인다.
export const referencePendingKey = (sceneId, kind, subjectId = null) => (
  `${sceneId}:${kind === 'character' ? `character:${subjectId}` : kind}`
)

// --- Scene state: 컷을 가로지르는 기준 ----------------------------------
// 여러 컷에 같은 인물과 공간이 나온다. 컷마다 프롬프트를 따로 조립하면
// 컷 1의 '실험실'과 컷 5의 '실험실'이 각자 해석되어 다른 방이 된다.
// 생성 단위가 컷이어도 기준은 씬에 있어야 한다 (DG2 P2: 여러 컷을 가로지르는
// 것은 개별 이미지가 아니라 편집 가능한 구조로 표현한다).
//
// 모양은 DecisionBoard의 MOCK_MISE_SCENE_STATE를 따른다. 지금 그 화면은
// 로컬 useState로 같은 정보를 들고 있어 프롬프트에 닿지 않는다. 나중에
// useState를 이 슬라이스로 바꾸면 미장센에서 고친 것이 곧 생성 기준이 된다.
//
// `open: true`인 항목은 아직 정하지 않은 것이다. 프롬프트에 넣지 않는다 —
// 미정을 문장으로 만들면 모델이 그것을 정해버린다.
const EMPTY_SCENE_STATE = {
  title: '씬 기준 미설정',
  description: '대본에서 인물과 공간을 읽은 뒤 표시됩니다.',
  characters: [],
  location: { name: '', facts: [] },
  environment: { name: '장면 공통', facts: [] },
}

const SCENE_STATE = {
  title: '물리학과 실험실 · 밤',
  description: '대본에서 추출한 장면 기준입니다. Shot별 배치는 이 상태를 상속하고, 달라진 부분만 별도로 기록합니다.',
  characters: [
    {
      id: 'harin',
      name: '하린',
      summary: '20대 중반 · 대학원생',
      image: '/img/lab_discovery_cu.png',
      facts: [
        { label: '외형 기준', value: '후드를 입고 머리를 묶은 상태' },
        { label: '헤어', value: '아직 지정되지 않음', open: true },
      ],
    },
  ],
  location: {
    name: '물리학과 실험실',
    image: '/img/lab_wide_establishing.png',
    facts: [
      { label: '장소 정체', value: '좁고 낡은 대학 실험실' },
      { label: '고정 소품', value: '실험대 · 오실로스코프 · 노트북 · 비 내리는 창' },
    ],
  },
  environment: {
    name: '장면 공통',
    facts: [
      // 항목 이름은 서버(scene_state.py의 ENVIRONMENT_LABELS)와 같아야 한다.
      // '그림체'는 패널 생성이 그림체를 읽어 가는 이름이므로, 여기서 다르게
      // 부르면 값을 채워도 그림에 반영되지 않는다.
      { label: '시간', value: '밤' },
      { label: '날씨', value: '비' },
      { label: '조명 기준', value: '형광등 · 간헐적 깜빡임', shared: true },
      { label: '그림체', value: '', open: true, shared: true },
    ],
  },
}

// 인물과 공간은 씬 안에서 변한다. 젖은 채로 들어와 굳어가고, 형광등은
// 깜빡이다 꺼진다. 값 하나로 두면 열두 컷 전부에 같은 문구가 들어간다.
// (design_goal.md DG2 P2: 여러 컷을 가로지르는 것은 편집 가능한 구조로
//  표현하고, 구조를 바꾸면 관련 패널에 반영되게 한다.)
//
// `changes`는 "이 컷부터 이렇게 바뀐다"의 목록이다. 없으면 씬 내내 `value`다.
//   { cutId: 'cut-abc', value: '젖은 채 굳어 있음' }
//
// 컷의 순번이 아니라 id로 가리키는 이유: 앞에 컷을 하나 넣으면 뒤의 순번이
// 전부 밀려, 변화가 조용히 엉뚱한 컷에 걸린다. 에러도 나지 않아 발견이
// 늦다. seams가 패널 id를 키로 쓰는 것과 같은 이유다.
//
// 값 자체를 바꾸는 것이 아니라 구간을 더하는 이유: 처음 상태가 지워지면
// 앞 컷들이 무엇이었는지 알 수 없게 된다.
const factValueAt = (fact, cutIndex, cutOrder = null) => {
  if (!fact.changes?.length || cutIndex == null) return fact.value
  // 이 시점까지 일어난 변화 중 마지막 것. 순서는 컷 플랜의 순서를 따른다.
  const applied = fact.changes
    .map((change) => ({ change, at: cutOrder?.get(change.cutId) }))
    // 지워진 컷을 가리키는 변화는 건너뛴다. 남겨두면 되살릴 수 있다.
    .filter((entry) => entry.at != null && entry.at <= cutIndex)
    .sort((a, b) => a.at - b.at)
    .slice(-1)[0]
  return applied ? applied.change.value : fact.value
}

// 정해진 사실만 한 줄로 잇는다. 컷 시점이 주어지면 그 시점의 값을 쓴다.
const settledFacts = (facts = [], cutIndex = null, cutOrder = null) => facts
  .filter((fact) => !fact.open && fact.value)
  .map((fact) => factValueAt(fact, cutIndex, cutOrder))
  .filter(Boolean)
  .join(', ')

// 이 컷에 걸리는 씬 기준을 뽑는다. 컷에 나오는 인물만 넣는다 —
// 씬의 모든 인물을 매 컷에 적으면 화면에 없는 사람까지 그리게 된다.
export const selectSceneReference = (sceneState, cut, cutIndex = null, cutOrder = null) => {
  if (!sceneState || !cut) return { characters: [], location: '', environment: '' }

  const cast = (cut.characters || '').split(',').map((name) => name.trim()).filter(Boolean)
  const characters = sceneState.characters
    .filter((character) => cast.some((name) => name.includes(character.name) || character.name.includes(name)))
    .map((character) => ({
      name: character.name,
      detail: settledFacts(character.facts, cutIndex, cutOrder),
    }))
    .filter((entry) => entry.detail)

  return {
    characters,
    location: settledFacts(sceneState.location?.facts, cutIndex, cutOrder),
    environment: settledFacts(sceneState.environment?.facts, cutIndex, cutOrder),
  }
}

// 컷 id → 순번. 변화는 id로 가리키고 순서는 컷 플랜이 정하므로, 값을 읽을
// 때마다 이 표로 옮긴다.
export const cutOrderOf = (cutPlan = []) => new Map(
  cutPlan.map((cut, index) => [cut.id, index]),
)

// 한 컷의 프롬프트. buildCutPrompt는 씬 기준·이음새·컷 순서를 인자로
// 받는데, 그 조립을 화면마다 따로 하면 같은 컷의 프롬프트가 화면마다
// 달라진다. 스토리보드와 검토 화면이 이 하나를 함께 쓴다.
export const selectCutPrompt = (state, cutId) => {
  const cut = state.cutPlan.find((item) => item.id === cutId)
  if (!cut) return null

  const scenes = selectScenes(state.screenplay)
  const scene = sceneOfBeat(scenes, cut.beat)
  const sceneState = state.sceneStates[scene?.id] || state.sceneStates['scene-0'] || null

  // 이음새는 패널 사이에 붙으므로 컷에서 바로 찾을 수 없다. 앞 컷의 샷을
  // 거쳐야 한다.
  const branch = state.scenes?.[state.activeScene]?.branches?.[
    state.scenes[state.activeScene].activeBranch ?? 0
  ]
  const shots = branch?.shots || []
  const shotIndex = shots.findIndex((shot) => shot.cutPlanItemId === cutId)
  const seam = shotIndex > 0
    ? state.seams[seamKeyFor(shots[shotIndex - 1].id)] || null
    : null

  return buildCutPrompt(cut, {
    sceneIntention: state.sceneIntention || '',
    sceneNote: state.scenePromptNote || '',
    declarations: state.declarations,
    sceneState,
    seam,
    cutIndex: state.cutPlan.findIndex((item) => item.id === cutId),
    cutOrder: cutOrderOf(state.cutPlan),
  })
}

// 이 사실이 씬 안에서 언제 바뀌는가. 편집 화면이 구간을 보여줄 때 쓴다.
export const factTimeline = (fact, cutOrder = null) => [
  { cutId: null, value: fact.value, at: 0 },
  ...(fact.changes || [])
    .map((change) => ({ ...change, at: cutOrder?.get(change.cutId) }))
    .filter((change) => change.at != null)
    .sort((a, b) => a.at - b.at),
]

// 레퍼런스 그림에 쓸 문장. 항목 값에서 조립한다 — 항목을 고치면 그림도
// 따라 바뀌어야 텍스트와 그림이 어긋나지 않는다. 컷 프롬프트가
// promptOverride로 하는 것과 같이, 사용자가 직접 고치면 그것을 쓴다.
export const buildReferencePrompt = (subject, kind) => {
  if (!subject) return { auto: '', effective: '', isEdited: false }

  const settled = (subject.facts || [])
    .filter((fact) => !fact.open && fact.value)
    .map((fact) => fact.value)

  // summary가 이름과 같으면 "등대지기. 등대지기."가 된다 — 대본이 인물을
  // 부르는 말이 곧 이름인 경우다.
  const head = kind === 'character' && subject.summary && subject.summary !== subject.name
    ? [subject.name, subject.summary]
    : [subject.name]
  const auto = [...head, ...settled].filter(Boolean).join('. ')

  const edited = (subject.promptOverride || '').trim()
  return { auto, effective: edited || auto, isEdited: Boolean(edited) }
}

// 인물 마커 색. SpatialMap의 PRESET_COLORS와 같은 값이어야 화면이 튀지 않는다.
const MARKER_COLORS = ['#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']

// 2D 구조도를 도면 그림으로 옮긴다. 좌표를 말로 바꾸면("콘솔은 가운데")
// 정확도가 떨어진다 — 도면 한 장이 배치를 훨씬 정확히 전한다.
// images.edit에 레퍼런스로 함께 물린다.
//
// 편집기 화면을 그대로 캡처하지 않는 이유: 도구 막대, 선택 표시, 격자 같은
// 것이 함께 들어가면 모델이 그것까지 그림의 일부로 읽는다.
export const layoutToImage = (elements = [], size = 768) => {
  const boxes = elements.filter((entry) => entry.type === 'rect')
  const markers = elements.filter((entry) => entry.type === 'marker')
  if (boxes.length === 0 && markers.length === 0) return null

  // 좌표계를 그림 크기에 맞춘다. 절대 좌표는 의미가 없고 서로의 관계만 남는다.
  const points = [
    ...boxes.flatMap((box) => [
      { x: box.x, y: box.y },
      { x: box.x + (box.w || 0), y: box.y + (box.h || 0) },
    ]),
    ...markers.map((marker) => ({ x: marker.x, y: marker.y })),
  ]
  const minX = Math.min(...points.map((point) => point.x))
  const maxX = Math.max(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxY = Math.max(...points.map((point) => point.y))
  const pad = 60
  const scale = Math.min(
    (size - pad * 2) / Math.max(maxX - minX, 1),
    (size - pad * 2) / Math.max(maxY - minY, 1),
  )
  const tx = (value) => pad + (value - minX) * scale
  const ty = (value) => pad + (value - minY) * scale

  const esc = (text = '') => String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const shapes = boxes.map((box) => {
    const w = Math.max((box.w || 0) * scale, 8)
    const h = Math.max((box.h || 0) * scale, 8)
    return `<rect x="${tx(box.x)}" y="${ty(box.y)}" width="${w}" height="${h}" `
      + 'fill="none" stroke="#000" stroke-width="3"/>'
      // 이름이 상자보다 길면 넘쳐 옆 상자를 덮는다. 상자 폭에 맞춰 줄인다.
      + (box.label
        ? `<text x="${tx(box.x) + w / 2}" y="${ty(box.y) + h / 2 + 6}" `
          + 'text-anchor="middle" font-family="sans-serif" '
          + `font-size="${Math.max(10, Math.min(18, (w * 1.7) / Math.max(box.label.length, 1)))}" `
          + `fill="#000">${esc(box.label)}</text>`
        : '')
  })

  // 인물은 채운 원으로. 사물(빈 사각형)과 한눈에 갈려야 한다.
  const people = markers.map((marker) => (
    `<circle cx="${tx(marker.x)}" cy="${ty(marker.y)}" r="16" fill="#000"/>`
    + (marker.label
      ? `<text x="${tx(marker.x)}" y="${ty(marker.y) - 26}" text-anchor="middle" `
        + `font-family="sans-serif" font-size="20" font-weight="bold" fill="#000">${esc(marker.label)}</text>`
      : '')
  ))

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" `
    + `viewBox="0 0 ${size} ${size}">`
    + `<rect width="${size}" height="${size}" fill="#fff"/>`
    + shapes.join('') + people.join('')
    + '</svg>'
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

// 2D 구조도를 문장으로도 옮긴다. 도면과 함께 주면 서로를 보강한다.
// 무엇이 어디에 있고 누가 어디 서 있는지를 말로 바꾼다.
//
// 구조도가 있으면 컷마다 배치가 흔들리지 않는다 — 컷 1에서 왼쪽에 있던
// 콘솔이 컷 5에서 오른쪽으로 가는 것을 글로만 막기는 어렵다.
export const describeLayout = (elements = []) => {
  const boxes = elements.filter((entry) => entry.type === 'rect' && entry.label)
  const markers = elements.filter((entry) => entry.type === 'marker' && entry.label)
  if (boxes.length === 0 && markers.length === 0) return ''

  // 좌표계의 절대값은 의미가 없다. 서로의 상대 위치만 말이 된다.
  const xs = [...boxes, ...markers].map((entry) => entry.x)
  const ys = [...boxes, ...markers].map((entry) => entry.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1

  const where = (entry) => {
    const h = (entry.x - minX) / spanX
    const v = (entry.y - minY) / spanY
    const side = h < 0.34 ? '왼쪽' : h > 0.66 ? '오른쪽' : '가운데'
    const depth = v < 0.34 ? '안쪽' : v > 0.66 ? '앞쪽' : ''
    return depth ? `${depth} ${side}` : side
  }

  // 받침 유무로 조사가 갈린다. '하린은/하린이'를 틀리면 사람이 쓴 문장으로 안 읽힌다.
  const topic = (word = '') => {
    const last = word.trim().slice(-1)
    const code = last.charCodeAt(0)
    if (code < 0xac00 || code > 0xd7a3) return `${word}은`
    return (code - 0xac00) % 28 === 0 ? `${word}는` : `${word}은`
  }

  const parts = []
  if (boxes.length > 0) {
    parts.push(boxes.map((box) => `${topic(box.label)} ${where(box)}`).join(', '))
  }
  if (markers.length > 0) {
    parts.push(markers.map((marker) => `${topic(marker.label)} ${where(marker)}에 있다`).join(', '))
  }
  return parts.join('. ')
}

// --- Responsibility registry (DG1 P3) -----------------------------------
// "이미지가 책임질 범위를 선언한다." 화면에 없는 것이 보완해야 할 결손인지
// 후속 공정에 맡긴 위임인지 구분하기 위한 상태다.
// 설계 근거: docs/design_goal.md DG1 P3, docs/shared_decision_state_revised.png
//
// 축은 책임 하나다. 구속 강도(고정/범주/자유)는 두지 않는다 — 무엇을 얼마나
// 묶을지는 결과를 보기 전에 정할 수 있는 것이 아니라 결과를 보고 승격하거나
// 해제하는 것이다 (DG1 P4). '이미지에서 확정'이 곧 이후 생성의 제약이 된다.
//
// 컷의 필드가 아니라 별도 레지스트리인 이유: 이 선언은 컷보다 오래 산다.
// 의도 입력부터 관객 검토(DG3)까지 유지되어야 컷이 병합·분할되어도(DG2)
// 무엇을 위임했는지가 남는다.
// '방향만 표시'는 중간 강도가 아니라 결정을 둘로 쪼개는 상태다.
// 방향은 스토리보드가 정하고 값은 후속 공정에 남긴다 —
// 카메라가 어느 쪽으로 움직이는지는 표시하되 속도와 거리는 정하지 않고,
// 인물이 어떤 상태인지는 표시하되 연기의 강도는 정하지 않는다.
export const RESPONSIBILITY_LEVELS = [
  { id: 'image', label: '여기서 정함', hint: '값을 그림에서 확정한다' },
  {
    id: 'direction',
    label: '방향만 정함',
    hint: '어느 쪽인지만 정하고 얼마나는 촬영에서 정한다',
  },
  // '후속 공정 위임'은 현장 용어라 읽고 무슨 뜻인지 바로 오지 않는다.
  // 실제로 말하려는 것은 스토리보드가 이것을 정하지 않는다는 것이다.
  { id: 'delegate', label: '여기서 안 정함', hint: '촬영에서 정한다' },
]

// 위임한 요소는 그림에 그리지 않는 대신 이미지 밖 채널에 기록한다.
// (design_goal.md DG1 P3: "액팅 메모, 움직임 화살표, 카메라 이동, 타임코드")
//
// `mark`는 패널 위에 어떤 형태로 그려지는지다. 화살표는 화살표로 그려져야
// 하고, 타임코드는 모서리 숫자여야 한다 — 목록의 글자로만 있으면 "그림 밖
// 채널에 기록한다"가 성립하지 않는다.
//   arrow  → 패널 위 방향 화살표
//   corner → 모서리 배지
//   note   → 패널 아래 텍스트 메모 (그릴 수 없는 것들의 기본값)
export const OFFIMAGE_CHANNELS = [
  { id: 'acting-note', label: '액팅 메모', mark: 'note' },
  { id: 'movement-arrow', label: '움직임 화살표', mark: 'arrow' },
  { id: 'camera-move', label: '카메라 이동', mark: 'arrow' },
  { id: 'timecode', label: '타임코드', mark: 'corner' },
  { id: 'copy', label: '카피', mark: 'note' },
]

// 화살표의 방향은 패널 위 드래그가 정하고, 이동 종류만 짧은 라벨로 붙인다.
// 하나의 자유 입력칸보다 자주 쓰는 촬영 용어를 고르게 해야 여러 패널에서
// 같은 표기가 유지된다.
export const CAMERA_MOVE_TYPES = [
  { id: 'pan', label: 'PAN', name: '팬' },
  { id: 'tilt', label: 'TILT', name: '틸트' },
  { id: 'track', label: 'TRACK', name: '트래킹' },
  { id: 'dolly', label: 'DOLLY', name: '달리' },
  { id: 'zoom', label: 'ZOOM', name: '줌' },
]

// 화살표는 사용자가 패널 위에 직접 그린다. 방향을 문구에서 유추하면
// 창작자가 말하지 않은 것을 화면이 주장하게 된다 — 카메라가 어느 쪽으로
// 움직이는지는 감독이 화면을 보고 정하는 것이다.
// 좌표는 패널 크기에 무관하도록 0~1 비율로 저장한다.
export const createPanelArrow = ({
  x1, y1, x2, y2, channel = 'camera-move', kind = '', label = '',
}) => ({
  id: `arrow-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  x1,
  y1,
  x2,
  y2,
  channel,
  kind,
  label,
})

// 선언을 패널이 그릴 수 있는 마크로 바꾼다.
// 그릴 수 없으면(방향을 못 읽거나 채널이 note면) 메모로 남긴다.
export const buildPanelMarks = (offImage = []) => {
  const marks = []
  const notes = []

  offImage.forEach(({ element, channel, direction, pending }) => {
    // 채널이 없으면 패널에 남길 자리가 없다. 씬 전체에 걸리는 기준은
    // 인스펙터에서 판정하지, 패널마다 칩으로 반복하지 않는다.
    if (!channel) return
    const spec = OFFIMAGE_CHANNELS.find((entry) => entry.id === channel)
    const label = direction || element

    // 화살표 채널은 사용자가 직접 그린다. 여기서는 아직 안 그렸다는 것만
    // 알린다 — 선언해 놓고 그리지 않으면 그 지시는 어디에도 남지 않는다.
    if (spec?.mark === 'arrow') {
      notes.push({ element, label, pending, needsArrow: true })
      return
    }

    if (spec?.mark === 'corner') {
      marks.push({ type: 'corner', element, label, pending })
      return
    }

    notes.push({ element, label, pending })
  })

  return { marks, notes }
}

const createDeclarationId = () => `decl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const createDeclaration = ({
  element = '',
  // 이 선언이 걸리는 범위. 씬 전체이거나 특정 컷이거나.
  scope = 'scene',
  cutId = null,
  lens = 'mise-en-scene',
  responsibility = 'image',
  channel = null,
  // responsibility가 'direction'일 때 스토리보드가 정하는 쪽.
  // 값이 아니라 방향이다 — "왼쪽으로"는 여기, "얼마나 빠르게"는 후속 공정.
  direction = '',
  // AI가 왜 이 요소를 후보로 올렸는지. 판정의 근거가 되므로 남긴다.
  rationale = '',
  // 사용자가 판정하기 전에는 제안일 뿐이다 (DG1 P2: 제안은 판정 대상).
  status = 'Proposed',
  provenance = 'AI',
} = {}) => ({
  id: createDeclarationId(),
  element,
  scope,
  cutId,
  lens,
  responsibility,
  channel,
  direction,
  rationale,
  status,
  provenance,
})

// 컷 플랜을 읽어 "선언이 필요해 보이는 요소"를 후보로 올리는 Mock.
// 실제 에이전트 호출로 교체될 자리다. 파이프라인 그림의
// `결정 미리 확인 — 미결·위임 지점 먼저 선택`에 해당하며 초안 생성보다 앞선다.
//
// 후보를 뽑는 기준은 "컷 플랜이 말하지 않은 것"이다. 줄콘티는 컷 수·크기·
// 앵글은 담지만 조명·의상·질감은 담지 않는다. 그 침묵이 결손인지 위임인지를
// 사용자가 판정하게 만드는 것이 이 단계의 목적이다.
const proposeDeclarations = (cutPlan, { sceneIntention = '' } = {}) => {
  if (cutPlan.length === 0) return []

  const proposals = []
  const push = (fields) => proposals.push(createDeclaration(fields))

  // 씬 전체에 걸리는 요소 — 줄콘티가 구조적으로 담지 못하는 것들.
  push({
    element: '의상 · 헤어',
    lens: 'mise-en-scene',
    responsibility: 'delegate',
    rationale: '스토리보드가 정하지 않는 것이 일반적이다. 위임하면 관객 검토에서 제외된다.',
  })
  push({
    element: '미술 · 질감',
    lens: 'mise-en-scene',
    responsibility: 'delegate',
    rationale: '이미지 모델은 어떻게든 질감을 그린다. 그것이 감독의 결정으로 굳으면 안 된다.',
  })

  // 인물이 여러 컷에 걸치면 외형 일관성은 첫 장부터 걸려야 한다.
  // 나중에 정하면 이미 그려진 패널들이 서로 다른 사람이 되어 있다.
  const hasCast = cutPlan.some((cut) => (cut.characters || '').trim().length > 0)
  if (hasCast && cutPlan.length > 1) {
    push({
      element: '인물 외형 일관성',
      lens: 'mise-en-scene',
      responsibility: 'image',
      rationale: '여러 컷에 같은 인물이 나온다. 컷마다 다르게 그려지면 다른 사람으로 읽힌다.',
    })
  }

  push({
    element: '조명 · 톤',
    lens: 'cinematography',
    responsibility: 'direction',
    // 채널을 두지 않는다. acting-note로 두면 패널마다 '조명 · 톤' 칩이
    // 하나씩 붙는데, 이것은 연기 메모가 아니라 씬 전체에 걸리는 기준이다.
    // 판정은 인스펙터에서 하고 화면에는 남기지 않는다.
    rationale: '컷 플랜은 샷 크기와 앵글만 담는다. 조명은 어느 컷에도 적혀 있지 않다.',
  })

  // 카메라 이동이 지정된 컷 — 정지 이미지가 담을 수 없는 것.
  // 방향은 컷 플랜이 이미 말했고, 값(속도·거리)은 후속 공정에 남는다.
  cutPlan
    .filter((cut) => cut.cameraMove && cut.cameraMove !== 'Fixed')
    .forEach((cut) => {
      push({
        element: '카메라 이동',
        scope: 'cut',
        cutId: cut.id,
        lens: 'cinematography',
        responsibility: 'direction',
            channel: 'camera-move',
        direction: cut.cameraMove,
        rationale: '한 장의 정지 이미지는 이동을 담을 수 없다. 방향만 표시하고 속도와 거리는 남긴다.',
      })
    })

  // 장면 의도가 비어 있으면 그 자체가 미결이다. 다만 그림을 막지는 않는다.
  if (!sceneIntention.trim()) {
    push({
      element: '장면 의도',
      scope: 'scene',
      lens: 'narrative',
      responsibility: 'image',
        rationale: '아직 선언되지 않았다. 관객 검토(DG3)의 기준이 되므로 비워두면 대조할 것이 없다.',
    })
  }

  return proposals
}

// 순서가 바뀌면 전체 번호와 Beat 안 번호를 함께 다시 매긴다.
const reorderCutPlan = (items) => {
  const perBeat = new Map()
  return items.map((item, index) => {
    const nextBeatOrder = (perBeat.get(item.beat) ?? 0) + 1
    perBeat.set(item.beat, nextBeatOrder)
    return { ...item, order: index + 1, beatOrder: nextBeatOrder }
  })
}

// 현재 단계를 상태에서 파생시킨다. 여러 컴포넌트가 같은 기준을 쓰도록
// 이 함수를 selector로 공유한다.
//   script  → 대본만
//   cutplan → 컷 리스트만
//   panels  → 대본 + 패널
export const selectCutStage = (state) => {
  if (state.cutPlanStageOverride) return state.cutPlanStageOverride
  if (state.cutPlanAccepted) return 'panels'
  // 컷 플랜 다음에 촬영이 이어서 돈다. 컷이 들어오자마자 넘기면 샷이 빈
  // 표를 보다가 값이 뒤늦게 채워진다. 두 공정이 다 끝나고 넘어간다.
  // 컷 플랜에서 '샷 다시 정하기'를 누른 경우는 해당하지 않는다.
  //
  // 단, 이미 컷 플랜을 보고 있었다면 대본으로 되돌리지 않는다. `다시
  // 나누기`는 지금 보던 표를 새로 뽑는 일이지 앞 단계로 가는 일이 아니다 —
  // 되돌리면 감독은 화면을 잃었다가 결과가 나올 때 다시 찾아와야 한다.
  // 처음 만드는 경우(컷이 아직 없음)에만 대본에 머문다.
  if (state.cutPlanRunPending && state.cutPlan.length === 0) return 'script'
  return state.cutPlan.length > 0 ? 'cutplan' : 'script'
}

// 아직 판정하지 않은 제안. 남은 채로 생성에 들어가면 그 요소는
// "확인되지 않은 AI 가정"으로 그림에 굳는다.
export const selectPendingDeclarations = (state) =>
  state.declarations.filter((decl) => decl.status === 'Proposed')

// 판정은 전부 패널에서 한다. 별도의 선언 단계를 두지 않는 이유는 P4다 —
// 아무것도 보지 못한 상태에서 무엇을 남겨둘지 정할 수는 없다.
// DG1 → DG3 연결은 "선언이 생성보다 앞설 것"을 요구하지 그것이 별도 화면일
// 것을 요구하지 않는다.
export const selectDeferredDeclarations = (state) =>
  state.declarations.filter((decl) => decl.status === 'Proposed')

// 프롬프트에서 빼야 할 요소. 위임한 것을 그림에 확정하면 P3가 무의미해진다.
export const selectDelegatedDeclarations = (state) =>
  state.declarations.filter((decl) =>
    decl.status === 'Accepted' && decl.responsibility === 'delegate')

// 확정된 컷을 패널로 옮긴다. 컷이 패널 구성의 근거가 되게 하되,
// 이미 그린 그림은 파괴하지 않는다 (Spec §22: 조용한 파괴 금지).
//
// 매핑 규칙:
//   1. 이미 이 컷에서 나온 패널(cutPlanItemId 일치)이 있으면 그것을 재사용
//   2. 없으면 같은 Beat에서 아직 안 쓰인, 그림 있는 패널을 순서대로 물려받음
//   3. 그래도 없으면 빈 패널을 새로 만듦
// 이렇게 하면 컷을 추가·재배열해도 기존 그림이 따라 움직인다.
const applyCutPlanToShots = (cutPlan, existingShots) => {
  const claimed = new Set()

  const findByCutId = (cutId) => existingShots.find((shot) => (
    shot.cutPlanItemId === cutId && !claimed.has(shot.id)
  ))

  const findDrawnInBeat = (beat) => existingShots.find((shot) => (
    !claimed.has(shot.id)
    && !shot.cutPlanItemId
    && (shot.scriptBeat ?? 0) === beat
    && Boolean(shot.image)
  ))

  const shots = cutPlan.map((item, index) => {
    const inherited = findByCutId(item.id) || findDrawnInBeat(item.beat)
    if (inherited) claimed.add(inherited.id)

    const base = inherited || createFlowShot({
      index,
      scriptBeat: item.beat,
      cir: {},
    })

    return {
      ...base,
      cutPlanItemId: item.id,
      scriptBeat: item.beat,
      label: `Shot ${index + 1}`,
      // 컷의 샷 사이즈가 패널의 CIR이 된다. 사용자가 패널에서 직접 바꾼 값은
      // 여기서 덮어쓰지 않도록 컷 쪽 값을 우선하되 나머지 CIR은 보존한다.
      cir: { ...(base.cir || {}), shotSize: item.shotSize },
      intent: item.purpose || base.intent,
    }
  })

  // 컷과 매칭되지 않아 사라지는 패널 중 그림이 있는 것 — 호출부가 알려준다.
  const orphanedWithImage = existingShots.filter((shot) => (
    !claimed.has(shot.id) && Boolean(shot.image)
  ))

  return { shots, orphanedWithImage }
}


const useStore = create((set, get) => ({
  viewMode: 'script',
  setViewMode: (mode) => set({ viewMode: mode }),
  // 줄콘티 상태. draft는 검토 중인 제안, accepted는 확정 여부.
  cutPlan: [],
  cutPlanAccepted: false,
  cutPlanRequestKey: 0,
  cutPlanShotSizes: CUT_PLAN_SHOT_SIZES,
  cutPlanAngles: CUT_PLAN_ANGLES,
  cutPlanMoves: CUT_PLAN_MOVES,
  // 조명·그림체처럼 장면 전체에 걸리는 지시. 컷마다 반복하지 않는다.
  scenePromptNote: '',
  setScenePromptNote: (scenePromptNote) => set({ scenePromptNote }),

  // 컷과 컷 사이. 앞 컷의 id로 식별한다 (DG2 P1).
  // 컷의 속성이 아니라 별도 객체인 이유: 컷이 병합·분할되어도 사이에 무엇이
  // 있었는지가 남아야 한다.
  seams: {},
  updateSeam: (shotId, patch) => set((state) => {
    const key = seamKeyFor(shotId)
    return {
      seams: {
        ...state.seams,
        [key]: { ...createSeam(), ...state.seams[key], ...patch },
      },
    }
  }),
  clearSeam: (shotId) => set((state) => {
    const next = { ...state.seams }
    delete next[seamKeyFor(shotId)]
    return { seams: next }
  }),

  // 컷을 가로지르는 기준. 여기를 고치면 그 씬의 모든 컷 프롬프트가 바뀐다.
  //
  // 씬마다 따로 둔다 — 실험실의 인물 기준과 복도의 인물 기준은 다르다.
  // 복도 씬의 공간 기준은 실험실 기준에 없다.
  sceneStates: {},
  // 2D 구조도. 컴포넌트 지역 상태로 두면 패널 생성이 읽지 못한다 —
  // 배치를 그림에 반영하려면 스토어에 있어야 한다.
  spatialElements: [],
  setSpatialElements: (elements) => set({ spatialElements: elements }),
  // 한 씬 안에서도 상태 단계마다 배치가 달라질 수 있다. 키는
  // `sceneId:변화시작컷Id`라서 컷이 삽입돼도 단계의 대상은 유지된다.
  spatialLayoutsByStage: {},
  setSpatialLayoutForStage: (stageId, elements) => set((state) => ({
    spatialLayoutsByStage: {
      ...state.spatialLayoutsByStage,
      [stageId]: elements,
    },
  })),
  sceneStateStoryKey: '',
  // 지금 보고 있는 씬. activeBeat에서 파생시키면 둘이 어긋날 수 없다 —
  // Beat를 고르는 것이 곧 씬을 고르는 것이다.

  // 대본에서 씬 기준을 세운다. 씬마다 인물과 공간이 다르므로 씬별로 부른다.
  sceneStatePending: false,
  sceneStateError: null,
  requestSceneStates: async () => {
    const state = get()
    if (state.screenplay.length === 0) return

    set({ sceneStatePending: true, sceneStateError: null })
    try {
      const { buildSceneState } = await import('../services/api.js')
      const scenes = selectScenes(state.screenplay)
      const next = {}

      for (const scene of scenes) {
        const script = state.screenplay
          .filter((element) => (
            element.beat >= scene.startBeat
            && element.beat <= scene.endBeat
            && element.type === 'action'
          ))
          .map((element) => element.text)
          .join('\n')
        if (!script.trim()) continue
        const sceneCuts = state.cutPlan.filter((cut) => (
          cut.beat >= scene.startBeat && cut.beat <= scene.endBeat
        ))
        const cutIds = sceneCuts.map((cut) => cut.id)
        const cutPlan = sceneCuts.map((cut, index) => (
          `컷 ${index + 1}: 시간 ${cut.time || '명시 없음'} · 장소 ${cut.place || '명시 없음'} · 등장 ${cut.characters || '없음'} · ${cut.content || ''}`
        )).join('\n')

        // eslint-disable-next-line no-await-in-loop
        const built = await buildSceneState({
          heading: scene.heading,
          script,
          sceneIntention: state.sceneIntention || '',
          cutPlan,
          cutIds,
        })

        // 레퍼런스 그림과 직접 고친 프롬프트는 사용자가 만든 것이다.
        // 대본을 다시 읽는다고 지워지면 안 된다 — 다시 그려야 한다.
        const kept = state.sceneStates[scene.id]
        next[scene.id] = kept ? {
          ...built,
          characters: built.characters.map((character) => {
            const before = kept.characters?.find((entry) => entry.name === character.name)
            return before
              ? {
                ...character,
                image: before.image ?? null,
                promptOverride: before.promptOverride || '',
              }
              : character
          }),
          location: {
            ...built.location,
            image: kept.location?.image ?? null,
            promptOverride: kept.location?.promptOverride || '',
          },
        } : built
      }

      set({
        sceneStates: next,
        sceneStateStoryKey: screenplayFingerprint(state.screenplay),
        sceneStatePending: false,
      })
    } catch (error) {
      set({ sceneStatePending: false, sceneStateError: error.message })
    }
  },

  // 씬 기준을 고친다. 아래 네 액션이 같은 모양이라 여기로 모은다.
  updateSceneStateAt: (sceneId, updater) => set((state) => {
    const current = state.sceneStates[sceneId] || EMPTY_SCENE_STATE
    return { sceneStates: { ...state.sceneStates, [sceneId]: updater(current) } }
  }),
  updateSceneCharacter: (characterId, patch, sceneId = null) => {
    get().updateSceneStateAt(sceneId || selectActiveSceneId(get()), (scene) => ({
      ...scene,
      characters: scene.characters.map((character) => (
        character.id === characterId ? { ...character, ...patch } : character
      )),
    }))
  },

  // 대본에서 공간 배치를 제안받는다. 빈 캔버스에서 시작하는 대신
  // 초안을 고치게 한다 — 이 배치가 곧 패널 생성의 도면 참조가 된다.
  spaceLayoutPending: false,
  spaceLayoutError: null,
  spaceLayoutNote: '',
  requestSpaceLayout: async () => {
    const state = get()
    const scenes = selectScenes(state.screenplay)
    const scene = scenes.find((entry) => entry.id === selectActiveSceneId(state)) || scenes[0]
    if (!scene) return

    const script = state.screenplay
      .filter((element) => (
        element.beat >= scene.startBeat
        && element.beat <= scene.endBeat
        && element.type === 'action'
      ))
      .map((element) => element.text)
      .join('\n')
    if (!script.trim()) return

    set({ spaceLayoutPending: true, spaceLayoutError: null })
    try {
      // 지연 import — 스토어를 node로 단독 검증할 수 있게 한다.
      const { buildSpaceLayout } = await import('../services/api.js')
      const sceneState = state.sceneStates[scene.id]
      const result = await buildSpaceLayout({
        heading: scene.heading,
        script,
        locationFacts: (sceneState?.location?.facts || [])
          .filter((fact) => !fact.open && fact.value)
          .map((fact) => fact.value)
          .join(', '),
      })

      // 이미 놓인 인물은 자리를 지킨다. 사용자가 옮겨 뒀을 수 있고,
      // 제안이 그것을 되돌리면 한 일이 사라진다.
      const placed = new Map(
        state.spatialElements
          .filter((entry) => entry.type === 'marker')
          .map((entry) => [entry.label, entry]),
      )
      set({
        spatialElements: [
          ...result.elements.map((element, index) => ({
            id: `layout-${index}`,
            type: 'rect',
            x: element.x,
            y: element.y,
            w: element.w,
            h: element.h,
            label: element.label,
          })),
          ...result.people.map((person, index) => placed.get(person.name) || {
            id: `person-${index}`,
            type: 'marker',
            x: person.x,
            y: person.y,
            label: person.name,
            color: MARKER_COLORS[index % MARKER_COLORS.length],
            // 컷별 이동은 사용자가 끌어서 정한다. 대본은 시작 위치까지만 말한다.
            waypoints: [],
          }),
          // 제안에 없는 인물도 남긴다 — 사용자가 직접 놓은 것이다.
          ...[...placed.values()].filter((entry) => (
            !result.people.some((person) => person.name === entry.label)
          )),
        ],
        spaceLayoutNote: result.note,
        spaceLayoutPending: false,
      })
    } catch (error) {
      set({ spaceLayoutPending: false, spaceLayoutError: error.message })
    }
  },

  // 인물·공간의 레퍼런스 그림을 만든다. 씬 기준을 글로만 두면 컷마다
  // 다르게 해석된다 — 그림이 기준이어야 같은 인물로 이어진다.
  // 여러 인물·공간 레퍼런스를 동시에 만들 수 있다. 하나의 key만 두면
  // 뒤 요청이 앞 요청의 "그리는 중" 표시를 지워 버린다.
  //
  // key는 씬으로 한정한다. 'location'처럼 씬이 빠진 이름을 쓰면 모든 씬의
  // 공간 버튼이 같은 칸을 읽어, 씬 1을 그리는 동안 씬 2까지 "그리는 중"이
  // 된다. 인물 id도 씬을 넘어 같을 수 있으므로 함께 한정한다.
  referenceImagePending: {},
  referenceImageError: null,
  requestReferenceImage: async (kind, subjectId = null) => {
    const state = get()
    // 시작할 때의 씬을 붙잡아 둔다. 그리는 동안 사용자가 씬을 옮기면
    // 끝난 뒤 읽은 씬은 다른 씬이라, 표시를 지울 칸도 결과를 적을 씬도
    // 어긋난다.
    const sceneId = selectActiveSceneId(state)
    const scene = state.sceneStates[sceneId]
    if (!scene) return

    const subject = kind === 'character'
      ? scene.characters.find((entry) => entry.id === subjectId)
      : scene[kind]
    if (!subject) return

    const prompt = buildReferencePrompt(subject, kind)
    if (!prompt.effective) {
      set({ referenceImageError: '먼저 인물이나 공간의 값을 채워 주세요.' })
      return
    }

    const key = referencePendingKey(sceneId, kind, subjectId)
    set((current) => ({
      referenceImagePending: { ...current.referenceImagePending, [key]: true },
      referenceImageError: null,
    }))
    try {
      // 지연 import — 스토어를 node로 단독 검증할 수 있게 한다.
      const { generateReferenceImage } = await import('../services/api.js')
      // 레퍼런스부터 패널과 같은 그림체로 만든다. 기준 그림이 다른 화풍이면
      // 패널 생성 때 두 화풍이 서로 경쟁하게 된다.
      const style = scene.environment?.facts
        ?.find((fact) => fact.label === '그림체' && !fact.open)?.value || ''
      const image = await generateReferenceImage(kind, prompt.effective, { style })
      get().updateSceneStateAt(sceneId, (current) => (
        kind === 'character'
          ? {
            ...current,
            characters: current.characters.map((entry) => (
              entry.id === subjectId ? { ...entry, image } : entry
            )),
          }
          : { ...current, [kind]: { ...current[kind], image } }
      ))
      set((current) => {
        const { [key]: _finished, ...remaining } = current.referenceImagePending
        return { referenceImagePending: remaining }
      })
    } catch (error) {
      set((current) => {
        const { [key]: _failed, ...remaining } = current.referenceImagePending
        return { referenceImagePending: remaining, referenceImageError: error.message }
      })
    }
  },

  // 레퍼런스 프롬프트를 직접 고친다. 비우면 항목에서 다시 조립된다.
  setReferencePrompt: (kind, subjectId, text) => {
    get().updateSceneStateAt(selectActiveSceneId(get()), (current) => (
      kind === 'character'
        ? {
          ...current,
          characters: current.characters.map((entry) => (
            entry.id === subjectId ? { ...entry, promptOverride: text } : entry
          )),
        }
        : { ...current, [kind]: { ...current[kind], promptOverride: text } }
    ))
  },

  // 상태 변화를 더한다. 처음 값은 남기고 구간만 얹는다 —
  // 값을 덮어쓰면 앞 컷들이 무엇이었는지 알 수 없게 된다.
  addFactChange: (group, label, cutId, value, { characterId = null, sceneId = null } = {}) => {
    const patchFacts = (facts = []) => facts.map((fact) => {
      if (fact.label !== label) return fact
      // 같은 컷에 두 번 얹지 않는다. 다시 넣으면 값만 바뀐다.
      const changes = (fact.changes || []).filter((change) => change.cutId !== cutId)
      return { ...fact, changes: [...changes, { cutId, value }] }
    })
    get().updateSceneStateAt(sceneId || selectActiveSceneId(get()), (scene) => (
      group === 'character'
        ? {
          ...scene,
          characters: scene.characters.map((character) => (
            character.id === characterId
              ? { ...character, facts: patchFacts(character.facts) }
              : character
          )),
        }
        : { ...scene, [group]: { ...scene[group], facts: patchFacts(scene[group]?.facts) } }
    ))
  },

  removeFactChange: (group, label, cutId, { characterId = null, sceneId = null } = {}) => {
    const patchFacts = (facts = []) => facts.map((fact) => (
      fact.label === label
        ? { ...fact, changes: (fact.changes || []).filter((change) => change.cutId !== cutId) }
        : fact
    ))
    get().updateSceneStateAt(sceneId || selectActiveSceneId(get()), (scene) => (
      group === 'character'
        ? {
          ...scene,
          characters: scene.characters.map((character) => (
            character.id === characterId
              ? { ...character, facts: patchFacts(character.facts) }
              : character
          )),
        }
        : { ...scene, [group]: { ...scene[group], facts: patchFacts(scene[group]?.facts) } }
    ))
  },

  // 미정으로 남은 항목을 채운다. open을 지우는 것이 곧 결정이다.
  setSceneFact: (group, label, value, { characterId = null, sceneId = null } = {}) => {
    const patchFacts = (facts = []) => facts.map((fact) => (
      fact.label === label ? { ...fact, value, open: !value } : fact
    ))
    get().updateSceneStateAt(sceneId || selectActiveSceneId(get()), (scene) => (
      group === 'character'
        ? {
          ...scene,
          characters: scene.characters.map((character) => (
            character.id === characterId
              ? { ...character, facts: patchFacts(character.facts) }
              : character
          )),
        }
        : { ...scene, [group]: { ...scene[group], facts: patchFacts(scene[group]?.facts) } }
    ))
  },

  // 실제 모델을 부른다. 실패하면 규칙 기반 mock으로 떨어진다.
  cutPlanPending: false,
  cutPlanError: null,
  // 줄콘티+촬영이 한 실행으로 도는 중인가. 단계 전환을 이것으로 막는다.
  cutPlanRunPending: false,
  requestCutPlan: async () => {
    const state = get()
    if (state.screenplay.length === 0) return

    set({
      cutPlanPending: true,
      cutPlanError: null,
      cutPlanAccepted: false,
      cutPlanSkipped: false,
      cutPlanStageOverride: null,
      cutPlanRequestKey: state.cutPlanRequestKey + 1,
      // 줄콘티와 촬영을 하나의 실행으로 묶는다. 둘 다 끝나야 단계가 넘어간다.
      cutPlanRunPending: true,
    })

    try {
      // 인물 명단이 컷을 나누는 입력이다(아래 planCuts의 cast). 씬 기준이
      // 비어 있으면 인물 없이 나누게 되므로 먼저 읽는다 — 촬영이 컷 뒤에
      // 자동으로 이어 도는 것과 같은 이유다. 미장센만 사용자가 눌러야
      // 도는 에이전트로 남을 이유가 없다.
      //
      // 이미 읽어 둔 것이 있으면 다시 부르지 않는다. 사용자가 고친 값을
      // 덮어쓰지 않기 위해서다 — 다시 읽는 것은 rail의 버튼이 맡는다.
      if (Object.keys(state.sceneStates).length === 0) {
        await get().requestSceneStates()
      }

      const { planCuts } = await import('../services/api.js')
      // 위에서 await를 지났으므로 state는 낡았다. 방금 읽은 씬 기준을
      // 쓰려면 다시 꺼내야 한다.
      const current = get()
      const scenes = selectScenes(current.screenplay)
      const items = []

      // 씬마다 따로 부른다. 시간·장소와 인물 기준이 씬마다 다르므로
      // 한 번에 보내면 두 번째 씬이 첫 씬의 맥락을 물려받는다.
      for (const scene of scenes) {
        const beats = []
        for (let beat = scene.startBeat; beat <= scene.endBeat; beat += 1) {
          const lines = current.screenplay
            .filter((element) => element.beat === beat && element.type === 'action')
            .map((element) => element.text)
          if (lines.length > 0) beats.push({ beat, lines })
        }
        if (beats.length === 0) continue

        const sceneLines = current.screenplay.filter((element) => (
          element.beat >= scene.startBeat && element.beat <= scene.endBeat
        ))
        const { time, place } = inferSceneContext(sceneLines)
        const sceneState = current.sceneStates[scene.id] || current.sceneStates['scene-0']

        // eslint-disable-next-line no-await-in-loop
        const planned = await planCuts({
          heading: scene.heading,
          beats,
          cast: castNamesOf(sceneState),
          sceneIntention: current.sceneIntention || '',
          time,
          place,
        })
        items.push(...planned)
      }

      // 컷을 나눴으면 이어서 샷을 정한다. 감독이 컷을 나누고 촬영감독과
      // 샷을 정하는 순서이며, 따로 부르게 두면 샷이 빈 채로 그림 단계까지
      // 넘어간다. 실패해도 컷 플랜은 남는다 — 샷은 다시 부를 수 있다.
      //
      // 컷 플랜을 먼저 set하면 단계가 그 순간 cutplan으로 넘어가, 샷이
      // 빈 표를 보다가 값이 뒤늦게 채워진다. 촬영까지 끝내고 한 번에 넘긴다.
      const planned = reorderCutPlan(items.map((item) => createCutPlanItem(item)))
      set({ cutPlan: planned, cutPlanPending: false })
      // 컷 플랜이 생긴 뒤에야 시간 흐름을 알 수 있다. 앞의 Scene State 읽기는
      // 인물 명단을 위한 기본값이고, 여기서 한 번 더 읽어 시간 변화 초안을
      // 자동으로 채운다 — 사용자가 별도 버튼을 누를 일이 아니다.
      await get().requestSceneStates()
      await get().requestShotDesign()
    } catch (error) {
      set({
        cutPlan: createMockCutPlan(get()),
        cutPlanPending: false,
        cutPlanError: error.message,
      })
      await get().requestShotDesign()
    } finally {
      // 촬영이 실패해도 단계는 넘어간다. 컷 플랜은 이미 있고, 샷은
      // rail에서 다시 부를 수 있다.
      set({ cutPlanRunPending: false })
    }
  },
  // 촬영이 샷을 정한다. 줄콘티가 컷을 나눈 뒤에 부른다 —
  // 감독이 컷을 나누고 촬영감독과 샷을 정하는 순서다.
  shotDesignPending: false,
  shotDesignError: null,
  // 씬마다 모델이 세운 카메라 흐름. 진단이 실제 샷과 견준다.
  sceneCoverages: {},
  requestShotDesign: async () => {
    const state = get()
    if (state.cutPlan.length === 0) return

    set({ shotDesignPending: true, shotDesignError: null })
    try {
      const { designShots } = await import('../services/api.js')
      const scenes = selectScenes(state.screenplay)
      const bySceneId = new Map()

      // 씬마다 따로 부른다. 커버리지는 씬 안에서 판단된다 —
      // 다른 씬의 컷이 섞이면 연속성 판단이 어긋난다.
      for (const scene of scenes) {
        const cuts = state.cutPlan.filter((cut) => (
          cut.beat >= scene.startBeat && cut.beat <= scene.endBeat
        ))
        if (cuts.length === 0) continue
        // eslint-disable-next-line no-await-in-loop
        // 대본을 함께 보낸다. 컷 목록만으로는 어디가 중요한 대목인지 알 수 없다.
        const script = state.screenplay
          .filter((element) => (
            element.beat >= scene.startBeat
            && element.beat <= scene.endBeat
            && element.type === 'action'
          ))
          .map((element) => element.text)
          .join('\n')

        const { shots, coverage } = await designShots({
          heading: scene.heading,
          cuts,
          script,
          sceneIntention: composeShotDirection(state.sceneIntention || '', state.scenePromptNote || ''),
        })
        bySceneId.set(scene.id, { cuts, shots, coverage })
      }

      const coverages = {}
      bySceneId.forEach(({ coverage, cuts }, sceneId) => {
        if (!coverage) return
        // 모델은 요청에 준 순번으로 답한다. 컷 id로 옮겨야 컷이 바뀌어도
        // 설계가 어느 컷을 가리키는지 잃지 않는다.
        const idOf = (index) => cuts[index]?.id
        coverages[sceneId] = {
          arc: coverage.arc,
          anchorCutIds: (coverage.anchor_cuts || []).map(idOf).filter(Boolean),
          approachCutIds: (coverage.approach || []).map(idOf).filter(Boolean),
          peakCutId: idOf(coverage.peak_cut) || null,
        }
      })

      set({
        sceneCoverages: coverages,
        cutPlan: get().cutPlan.map((item) => {
          for (const { cuts, shots } of bySceneId.values()) {
            const index = cuts.findIndex((cut) => cut.id === item.id)
            if (index < 0) continue
            const shot = shots.find((entry) => entry.cut_index === index)
            if (!shot) continue
            return {
              ...item,
              shotSize: shot.shot_size,
              angle: shot.angle,
              cameraMove: shot.camera_move,
              // 왜 이 샷인지. 사용자가 판정하려면 근거가 있어야 한다.
              shotReason: shot.reason,
              dominant: shot.dominant || '',
            }
          }
          return item
        }),
        shotDesignPending: false,
      })
    } catch (error) {
      set({ shotDesignPending: false, shotDesignError: error.message })
    }
  },

  updateCutPlanItem: (itemId, patch) => set((state) => ({
    cutPlan: state.cutPlan.map((item) => {
      if (item.id !== itemId) return item
      // 프롬프트 문구만 고친 것은 컷의 결정(샷 사이즈·내용)을 바꾼 것이
      // 아니다. 컷의 출처는 그대로 두고 프롬프트 출처만 따로 본다
      // (buildCutPrompt의 isEdited가 그 역할을 한다).
      const onlyPromptText = Object.keys(patch)
        .every((key) => key === 'promptOverride')
      return {
        ...item,
        ...patch,
        provenance: onlyPromptText ? item.provenance : 'User',
      }
    }),
  })),
  updateCutRequirement: (itemId, lensId, text) => {
    logEdit({ lens: lensId, level: 'element', target: itemId, action: 'requirement' })
    return set((state) => ({
    cutPlan: state.cutPlan.map((item) => {
      if (item.id !== itemId) return item
      const current = item.requirements?.[lensId] || createCutRequirement(
        item.id,
        lensId,
        {},
        item.provenance,
      )
      return {
        ...item,
        requirements: {
          ...item.requirements,
          [lensId]: {
            ...current,
            text,
            provenance: 'User',
          },
        },
      }
    }),
  }))
  },
  // fields를 주면 그 내용으로 채운다. 빈 컷을 만들어 두면 대개 비어 있는
  // 채로 남으므로, 편집이 제안한 내용을 그대로 받아 넣을 수 있게 한다.
  addCutPlanItem: (afterItemId = null, beat = 0, fields = {}) => {
    // 제안을 받아 넣었는지, 빈 컷을 직접 만들었는지 구분해 둔다.
    logEdit({
      lens: 'editing',
      level: 'shot',
      target: afterItemId,
      action: 'insert',
      source: 'seam',
      proposed: Boolean(fields.content),
    })
    return set((state) => {
    const next = [...state.cutPlan]
    const index = afterItemId
      ? next.findIndex((item) => item.id === afterItemId)
      : next.length - 1
    const anchorBeat = index >= 0 ? next[index].beat : beat
    next.splice(index + 1, 0, createCutPlanItem({
      beat: anchorBeat,
      content: '',
      purpose: '',
      // 제안을 받아 넣었으면 사용자가 쓴 것이 아니다.
      provenance: fields.content ? 'AI' : 'User',
      ...fields,
    }))
    return { cutPlan: reorderCutPlan(next) }
  })
  },
  // 진단을 받아 촬영에 수정본을 묻는다. 어느 크기로 바꿀지는 그 컷이
  // 무엇을 보여주려는지 봐야 정해진다 — 코드로 "한 칸 벌린다"고 두면
  // 내용과 무관한 처방이 된다.
  shotFixPending: null,
  shotFixError: null,
  shotFixProposal: null,
  requestShotFix: async (finding) => {
    const state = get()
    if (!finding?.cutIds?.length) return

    // 진단에 걸린 컷이 속한 씬의 컷을 전부 보낸다. 한 컷만 보고 고치면
    // 앞뒤와 다시 어긋난다.
    const scenes = selectScenes(state.screenplay)
    const first = state.cutPlan.find((cut) => cut.id === finding.cutIds[0])
    const scene = first ? sceneOfBeat(scenes, first.beat) : null
    if (!scene) return
    const cuts = state.cutPlan.filter((cut) => (
      cut.beat >= scene.startBeat && cut.beat <= scene.endBeat
    ))
    if (cuts.length === 0) return

    set({ shotFixPending: finding.id, shotFixError: null, shotFixProposal: null })
    try {
      // 지연 import — 스토어를 node로 단독 검증할 수 있게 한다.
      const { fixShots } = await import('../services/api.js')
      const result = await fixShots({
        heading: scene.heading,
        cuts,
        findingTitle: finding.title,
        findingDetail: finding.detail || '',
        targetIndexes: finding.cutIds
          .map((id) => cuts.findIndex((cut) => cut.id === id))
          .filter((index) => index >= 0),
        sceneIntention: composeShotDirection(state.sceneIntention || '', state.scenePromptNote || ''),
      })
      // 순번은 요청에 준 씬 안의 자리다. 컷 id로 되돌려야 표에 적용된다.
      const edits = result.edits
        .map((edit) => {
          const cut = cuts[edit.cut_index]
          return cut && {
            cutId: cut.id,
            label: cut.label || `컷 ${cut.beat + 1}-${cut.beatOrder}`,
            from: cut.shotSize || '미정',
            to: edit.shot_size,
            reason: edit.reason || '',
            // 진단에 걸린 컷인가, 그 여파로 함께 고치는 컷인가. 구분하지
            // 않으면 왜 엉뚱한 컷이 나왔는지 알 수 없다.
            isTarget: finding.cutIds.includes(cut.id),
          }
        })
        .filter(Boolean)

      set({
        shotFixPending: null,
        shotFixProposal: edits.length
          ? { findingId: finding.id, summary: result.summary || '', edits }
          : null,
        shotFixError: edits.length ? null : '고칠 것이 없다고 답했습니다.',
      })
    } catch (error) {
      set({ shotFixPending: null, shotFixError: error.message })
    }
  },

  // 수락해야 표에 들어간다 — 진단과 처분은 다른 일이다 (design_goal.md DG2).
  acceptShotFix: () => set((state) => {
    const proposal = state.shotFixProposal
    if (!proposal) return {}
    return {
      cutPlan: state.cutPlan.map((item) => {
        const edit = proposal.edits.find((entry) => entry.cutId === item.id)
        return edit ? { ...item, shotSize: edit.to } : item
      }),
      shotFixProposal: null,
    }
  }),

  rejectShotFix: () => set({ shotFixProposal: null, shotFixError: null }),

  removeCutPlanItem: (itemId) => set((state) => ({
    cutPlan: reorderCutPlan(state.cutPlan.filter((item) => item.id !== itemId)),
  })),
  // --- 이음새 수준의 개입 (DG2 P1) --------------------------------------
  // 병합·분할은 컷만 바꾸는 것이 아니다. 패널과 이음새가 함께 움직여야
  // 한다 — 컷 하나를 지우면 그 패널과 이음새도 갈 곳을 잃는다.

  // 병합: 두 컷이 수행하던 기능을 하나의 컷 안에서 다시 구성한다.
  // 사이 이음새는 컷 안이 되므로 사라진다. 다만 거기 적힌 '생략된 것'은
  // 이제 한 컷 안에서 일어나는 일이므로 내용으로 옮긴다 — 그냥 지우면
  // 기록해 둔 것이 조용히 사라진다.
  mergeCuts: (firstCutId, { content = null } = {}) => {
    logEdit({ lens: 'editing', level: 'shot', target: firstCutId, action: 'merge', source: 'seam' })
    return set((state) => {
    const index = state.cutPlan.findIndex((item) => item.id === firstCutId)
    if (index < 0 || index >= state.cutPlan.length - 1) return {}

    const first = state.cutPlan[index]
    const second = state.cutPlan[index + 1]

    const shots = state.scenes[state.activeScene]
      ?.branches[state.scenes[state.activeScene].activeBranch ?? 0]?.shots || []
    const firstShot = shots.find((shot) => shot.cutPlanItemId === first.id)
    const seam = firstShot ? state.seams[seamKeyFor(firstShot.id)] : null

    const merged = {
      ...first,
      // 합쳐질 내용은 사용자가 미리보기에서 확정한 것을 쓴다. 자동으로
      // 이어붙인 문장을 그대로 두면 두 컷이 무엇이 되는지를 AI가 정하게 된다.
      content: content ?? [
        first.content,
        seam?.elision && `(${seam.elision})`,
        second.content,
      ].filter(Boolean).join(' '),
      characters: [...new Set([
        ...(first.characters || '').split(',').map((n) => n.trim()).filter(Boolean),
        ...(second.characters || '').split(',').map((n) => n.trim()).filter(Boolean),
      ])].join(', '),
      // 두 컷이 맡던 관점별 역할도 함께 합친다. 뒤 컷의 Requirement가
      // 사라지면 이후 Decision Card의 근거가 조용히 유실된다.
      requirements: mergeCutRequirements(first.requirements, second.requirements),
      // 사용자가 구조를 바꿨다.
      provenance: 'User',
      // 조립된 프롬프트를 다시 만들게 한다. 합쳐진 내용을 반영해야 한다.
      promptOverride: '',
    }

    const nextCutPlan = reorderCutPlan([
      ...state.cutPlan.slice(0, index),
      merged,
      ...state.cutPlan.slice(index + 2),
    ])

    // 뒤 컷의 패널을 없앤다. 앞 컷의 패널이 병합된 컷을 맡는다.
    const secondShot = shots.find((shot) => shot.cutPlanItemId === second.id)
    const next = updateActiveBranchShots(state, (current) => (
      current.filter((shot) => shot.id !== secondShot?.id)
    ))

    // 사이 이음새는 컷 안이 되었으므로 지운다.
    const nextSeams = { ...state.seams }
    if (firstShot) delete nextSeams[seamKeyFor(firstShot.id)]
    // 없어진 패널에 붙어 있던 이음새는 앞 패널로 옮긴다 — 그 이음새는
    // 병합된 컷과 다음 컷 사이를 가리키므로 여전히 유효하다.
    if (secondShot && nextSeams[seamKeyFor(secondShot.id)] && firstShot) {
      nextSeams[seamKeyFor(firstShot.id)] = nextSeams[seamKeyFor(secondShot.id)]
      delete nextSeams[seamKeyFor(secondShot.id)]
    }

    return { ...next, cutPlan: nextCutPlan, seams: nextSeams }
  })
  },

  // 분할: 하나의 컷에 압축된 사건을 둘 이상의 단계로 나눈다.
  // 새로 생기는 이음새는 '컷 · 연속'이 기본이다 — 한 컷을 쪼갠 것이므로
  // 그 사이에 시간이 흐르지 않았다.
  splitCut: (cutId) => {
    logEdit({ lens: 'editing', level: 'shot', target: cutId, action: 'split', source: 'seam' })
    return set((state) => {
    const index = state.cutPlan.findIndex((item) => item.id === cutId)
    if (index < 0) return {}
    const source = state.cutPlan[index]

    const second = createCutPlanItem({
      ...source,
      // 내용은 사용자가 나눈다. AI가 자르면 어디서 끊을지를 대신 정하게 된다.
      content: '',
      promptOverride: '',
      provenance: 'User',
    })

    const nextCutPlan = reorderCutPlan([
      ...state.cutPlan.slice(0, index + 1),
      second,
      ...state.cutPlan.slice(index + 1),
    ])

    // 패널도 함께 만든다. 컷과 패널이 어긋나면 프롬프트가 붙지 않는다.
    const next = updateActiveBranchShots(state, (shots) => {
      const shotIndex = shots.findIndex((shot) => shot.cutPlanItemId === cutId)
      if (shotIndex < 0) return shots
      const copy = [...shots]
      copy.splice(shotIndex + 1, 0, {
        ...createFlowShot({
          index: shots.length,
          scriptBeat: source.beat,
        }),
        cutPlanItemId: second.id,
      })
      return copy
    })

    return { ...next, cutPlan: nextCutPlan }
  })
  },

  // 이음새에서의 순서 바꾸기 (DG2 P2 reorder). moveCutPlanItem은 컷 표만
  // 다시 세우고 패널과 이음새는 그대로 두는데, 그림이 이미 있는 단계에서는
  // 그러면 컷과 그림이 어긋난다. 여기서는 셋을 함께 옮긴다.
  swapCutsAtSeam: (firstCutId) => {
    logEdit({ lens: 'editing', level: 'seam', target: firstCutId, action: 'reorder', source: 'seam' })
    return set((state) => {
    const index = state.cutPlan.findIndex((item) => item.id === firstCutId)
    if (index < 0 || index >= state.cutPlan.length - 1) return {}

    const first = state.cutPlan[index]
    const second = state.cutPlan[index + 1]
    const nextPlan = [...state.cutPlan]
    nextPlan[index] = second
    nextPlan[index + 1] = first

    // 패널도 같이 옮긴다. 컷만 바꾸면 S3의 그림이 S4의 내용에 붙는다.
    const next = updateActiveBranchShots(state, (shots) => {
      const a = shots.findIndex((shot) => shot.cutPlanItemId === first.id)
      const b = shots.findIndex((shot) => shot.cutPlanItemId === second.id)
      if (a < 0 || b < 0) return shots
      const moved = [...shots]
      moved[a] = shots[b]
      moved[b] = shots[a]
      return moved
    })

    // 이음새는 앞 패널에 붙는다. 두 패널이 자리를 바꾸면 그 사이의
    // 이음새는 여전히 '사이'에 있으므로 그대로 두고, 바깥쪽 둘만 따라간다.
    return { ...next, cutPlan: reorderCutPlan(nextPlan) }
  })
  },

  moveCutPlanItem: (itemId, direction) => set((state) => {
    const index = state.cutPlan.findIndex((item) => item.id === itemId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= state.cutPlan.length) return {}
    const next = [...state.cutPlan]
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    return { cutPlan: reorderCutPlan(next) }
  }),
  // 컷을 버린다. 되돌릴 수 없으므로 명시적 Discard에만 쓴다.
  dismissCutPlan: () => set({ cutPlan: [], cutPlanAccepted: false, cutPlanSkipped: false }),
  // 대본으로 돌아가되 컷은 보존한다. 단계 이동은 작업을 지우지 않는다.
  backToScript: () => set({ cutPlanStageOverride: 'script' }),
  // 단계 이동으로 잠시 대본을 보고 있는 상태. 컷 자체와는 무관하다.
  cutPlanStageOverride: null,
  clearCutPlanStageOverride: () => set({ cutPlanStageOverride: null }),
  // 확정 = 컷 구성을 패널에 반영한다. 여기서 비로소 줄콘티가 패널의 근거가 된다.
  // 단, 패널로 바로 넘어가지 않고 선언 게이트를 먼저 거친다 (DG1 P3).
  // 게이트에는 초안 생성을 바꾸는 선언만 올라온다. 나머지는 패널로 넘어가
  // 그림을 보고 판정한다 (DG1 P4).
  acceptCutPlan: () => set((state) => {
    if (state.cutPlan.length === 0) {
      return { cutPlanAccepted: true, cutPlanSkipped: false, cutPlanStageOverride: null }
    }

    let orphaned = []
    const next = updateActiveBranchShots(state, (shots) => {
      const result = applyCutPlanToShots(state.cutPlan, shots)
      orphaned = result.orphanedWithImage
      return result.shots
    })

    // 컷이 정해졌으니 선언 후보를 뽑아 둔다. 별도 화면으로 붙잡지 않고
    // 패널의 인스펙터에서 그림을 보며 판정한다 (DG1 P4).
    const judged = state.declarations.filter((decl) => decl.status !== 'Proposed')
    const judgedElements = new Set(judged.map((decl) => decl.element))
    const proposed = proposeDeclarations(state.cutPlan, {
      sceneIntention: state.sceneIntention || '',
    }).filter((decl) => !judgedElements.has(decl.element))

    return {
      ...next,
      cutPlanAccepted: true,
      cutPlanSkipped: false,
      cutPlanStageOverride: null,
      declarations: [...judged, ...proposed],
      // 그림이 있는데 컷과 매칭되지 않은 패널. 사용자에게 알리고 판단을 맡긴다.
      cutPlanOrphanedShots: orphaned,
    }
  }),
  cutPlanOrphanedShots: [],
  clearCutPlanOrphanWarning: () => set({ cutPlanOrphanedShots: [] }),

  // --- Responsibility registry (DG1 P3) ---------------------------------
  declarations: [],

  // 컷에서 선언 후보를 뽑는다. 이미 판정한 것은 덮어쓰지 않는다.
  proposeDeclarations: () => set((state) => {
    const judged = state.declarations.filter((decl) => decl.status !== 'Proposed')
    // 이미 판정한 요소를 다시 후보로 올리지 않는다.
    const judgedElements = new Set(judged.map((decl) => decl.element))
    const fresh = proposeDeclarations(state.cutPlan, {
      sceneIntention: state.sceneIntention || '',
    }).filter((decl) => !judgedElements.has(decl.element))

    return { declarations: [...judged, ...fresh] }
  }),

  updateDeclaration: (id, patch) => set((state) => ({
    declarations: state.declarations.map((decl) => {
      if (decl.id !== id) return decl
      // 사용자가 축을 건드리면 그 선언은 더 이상 AI 제안이 아니다.
      const touchesAxis = ['responsibility', 'channel', 'direction', 'element']
        .some((key) => key in patch)
      return {
        ...decl,
        ...patch,
        provenance: touchesAxis ? 'User' : decl.provenance,
      }
    }),
  })),

  // 책임을 고르는 것이 곧 판정이다. 축을 골랐다는 것은 이미 검토했다는
  // 뜻이므로 별도의 수용 버튼을 두면 같은 결정을 두 번 누르게 된다.
  decideDeclaration: (id, responsibility) => set((state) => ({
    declarations: state.declarations.map((decl) => (
      decl.id === id
        ? { ...decl, responsibility, status: 'Accepted', provenance: 'User' }
        : decl
    )),
  })),

  // 판정 — 수용하거나 기각한다. 기각도 기록으로 남긴다.
  // "검토했으나 선언하지 않기로 함"과 "아직 안 봄"은 다르다.
  acceptDeclaration: (id) => set((state) => ({
    declarations: state.declarations.map((decl) => (
      decl.id === id ? { ...decl, status: 'Accepted' } : decl
    )),
  })),
  rejectDeclaration: (id) => set((state) => ({
    declarations: state.declarations.map((decl) => (
      decl.id === id ? { ...decl, status: 'Rejected' } : decl
    )),
  })),

  addDeclaration: (fields = {}) => set((state) => ({
    declarations: [
      ...state.declarations,
      createDeclaration({ ...fields, status: 'Accepted', provenance: 'User' }),
    ],
  })),

  removeDeclaration: (id) => set((state) => ({
    declarations: state.declarations.filter((decl) => decl.id !== id),
  })),

  // 편집이 이음새를 제안한다. 컷이 20개면 이음새가 19개라 전부 수동으로
  // 채우기 어렵다. 기본('컷 · 연속')과 다른 것만 돌아온다.
  seamDesignPending: false,
  seamDesignError: null,
  // 제안은 수락 전까지 이음새에 들어가지 않는다. 다른 에이전트와 같은
  // 규칙이다 — AI가 더한 것은 판정을 거치기 전까지 잠정이다 (DG1 P2).
  seamProposals: [],
  requestSeamDesign: async () => {
    const state = get()
    if (state.cutPlan.length < 2) return

    set({ seamDesignPending: true, seamDesignError: null, seamProposals: [] })
    try {
      const { designSeams } = await import('../services/api.js')
      const scenes = selectScenes(state.screenplay)
      const shots = state.scenes[state.activeScene]
        ?.branches[state.scenes[state.activeScene].activeBranch ?? 0]?.shots || []
      const proposals = []

      for (const scene of scenes) {
        const cuts = state.cutPlan.filter((cut) => (
          cut.beat >= scene.startBeat && cut.beat <= scene.endBeat
        ))
        if (cuts.length < 2) continue

        const script = state.screenplay
          .filter((element) => (
            element.beat >= scene.startBeat
            && element.beat <= scene.endBeat
            && element.type === 'action'
          ))
          .map((element) => element.text)
          .join('\n')

        // eslint-disable-next-line no-await-in-loop
        const designed = await designSeams({ heading: scene.heading, cuts, script })

        designed.forEach((seam) => {
          // 이음새는 패널 사이에 붙는다. 컷 → 패널로 옮겨야 한다.
          const cut = cuts[seam.after_cut]
          if (!cut) return
          const shot = shots.find((entry) => entry.cutPlanItemId === cut.id)
          if (!shot) return
          proposals.push({
            id: `seam-proposal-${shot.id}`,
            shotId: shot.id,
            // 어디에 붙는 제안인지 화면에 보여야 판정할 수 있다.
            label: shot.label || '',
            sceneHeading: scene.heading,
            join: seam.join,
            elapsed: seam.elapsed,
            elision: seam.elision || '',
            // 왜 이렇게 보는지. 판정하려면 근거가 있어야 한다.
            reason: seam.reason || '',
          })
        })
      }

      set({ seamProposals: proposals, seamDesignPending: false })
    } catch (error) {
      set({ seamDesignPending: false, seamDesignError: error.message })
    }
  },

  // 수락해야 이음새가 된다. 거부는 제안을 목록에서 지울 뿐이다.
  acceptSeamProposal: (id) => {
    logScaffold({ feature: 'alternative', action: 'accept', target: id })
    return set((state) => {
    const proposal = state.seamProposals.find((entry) => entry.id === id)
    if (!proposal) return {}
    return {
      seams: {
        ...state.seams,
        [seamKeyFor(proposal.shotId)]: {
          join: proposal.join,
          elapsed: proposal.elapsed,
          elision: proposal.elision,
          reason: proposal.reason,
        },
      },
      seamProposals: state.seamProposals.filter((entry) => entry.id !== id),
    }
  })
  },

  rejectSeamProposal: (id) => {
    logScaffold({ feature: 'alternative', action: 'reject', target: id })
    return set((state) => ({
    seamProposals: state.seamProposals.filter((entry) => entry.id !== id),
  }))
  },

  clearSeamProposals: () => set({ seamProposals: [] }),

  // 패널 메모. 오버레이로 그릴 수 없는 것을 적어두는 자리다 —
  // 화살표나 배지로 표현되지 않는 지시가 갈 곳이 없으면 결국 누락된다.
  setShotNote: (shotId, note) => set((state) => updateActiveBranchShots(
    state,
    (shots) => shots.map((shot) => (shot.id === shotId ? { ...shot, note } : shot)),
  )),

  // Decision Board의 AI 진단에서 특정 패널 도구로 이동할 때 쓰는 일회성 요청.
  // 도구 상태 자체는 StoryboardView의 로컬 UI 상태이고, store에는 사용자가
  // 실제로 남긴 화살표·메모만 영속한다.
  panelToolRequest: null,
  // 어느 이음새를 열어 보라는 요청. 진단에서 바로 그 자리로 가기 위한 것 —
  // 편집 문제는 컷 사이에 있으므로 컷 플랜 표로 되돌아갈 이유가 없다.
  // action이 'merge'/'split'이면 그 미리보기까지 연다. 나누고 합치는 도구가
  // 이미 이음새에 있으므로, 진단은 그 자리로 보내기만 하면 된다.
  seamFocusRequest: null,
  requestSeamFocus: (shotId, action = null) => set({
    seamFocusRequest: { id: `seam-focus-${Date.now()}`, shotId, action },
  }),

  requestPanelTool: (shotId, tool, payload = {}) => set({
    panelToolRequest: {
      id: `panel-tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      shotId,
      tool,
      ...payload,
    },
  }),
  clearPanelToolRequest: () => set({ panelToolRequest: null }),

  // 패널 위 화살표. 사용자가 그림 위에 직접 그린다 (DG1 P3).
  addShotArrow: (shotId, arrow) => set((state) => updateActiveBranchShots(
    state,
    (shots) => shots.map((shot) => (shot.id === shotId
      ? { ...shot, arrows: [...(shot.arrows || []), createPanelArrow(arrow)] }
      : shot)),
  )),
  updateShotArrow: (shotId, arrowId, patch) => set((state) => updateActiveBranchShots(
    state,
    (shots) => shots.map((shot) => (shot.id === shotId
      ? {
          ...shot,
          arrows: (shot.arrows || []).map((arrow) => (
            arrow.id === arrowId ? { ...arrow, ...patch } : arrow
          )),
        }
      : shot)),
  )),
  removeShotArrow: (shotId, arrowId) => set((state) => updateActiveBranchShots(
    state,
    (shots) => shots.map((shot) => (shot.id === shotId
      ? { ...shot, arrows: (shot.arrows || []).filter((arrow) => arrow.id !== arrowId) }
      : shot)),
  )),

  // 줄콘티를 다시 열어 수정한다. accept를 되돌리되 컷 자체는 지우지 않는다.
  // 대본에서 씬 헤딩(예: "카페, 낮")을 고친 뒤 기존 플랜을 열어도,
  // 비어 있던 시간·장소 칸은 현재 헤딩 기준으로 채워져야 한다.
  // 이미 사용자가 적은 값은 건드리지 않는다.
  reopenCutPlan: () => set((state) => {
    const scenes = selectScenes(state.screenplay)
    const cutPlan = state.cutPlan.map((cut) => {
      if (cut.time && cut.place) return cut
      const scene = sceneOfBeat(scenes, cut.beat)
      const sceneLines = state.screenplay.filter((element) => (
        element.beat >= (scene?.startBeat ?? 0)
        && element.beat <= (scene?.endBeat ?? 0)
      ))
      const inferred = inferSceneContext(sceneLines)
      return {
        ...cut,
        time: cut.time || inferred.time,
        place: cut.place || inferred.place,
      }
    })
    return { cutPlan, cutPlanAccepted: false, cutPlanStageOverride: null }
  }),
  cutPlanSkipped: false,
  overviewTab: 'spatial',
  setOverviewTab: (tab) => set({ overviewTab: tab }),
  isScriptOpen: false,
  isDrawerExpanded: false,
  setIsDrawerExpanded: (val) => set({ isDrawerExpanded: val }),
  drawerTab: 'script',
  setDrawerTab: (tab) => set({ drawerTab: tab }),
  toggleScript: () => set((state) => ({ isScriptOpen: !state.isScriptOpen })),
  setScriptOpen: (val) => set({ isScriptOpen: val }),
  // 대본은 빈 상태에서 시작한다. 사용자가 자기 장면을 쓰는 것이 첫 단계다.
  screenplay: [],
  // 개발·데모용 예시 대본. 입력 화면에서 한 번에 채운다.
  // variant: 'rough'는 Beat가 나뉘지 않은 투박한 초안,
  // 'formatted'는 이미 Beat까지 정리된 대본이다.
  loadExampleScreenplay: () => set((state) => {
    const script = SCREENPLAY
    const maxBeat = Math.max(0, ...script.map((line) => line.beat ?? 0))
    const sceneStates = { 'scene-0': SCENE_STATE, 'scene-7': CORRIDOR_SCENE_STATE }

    // 줄콘티까지 채워 둔다. 각 단계에서 모델을 기다리지 않고 바로 다음으로
    // 넘어갈 수 있게 하려는 것이지, 단계를 건너뛰려는 것이 아니다.
    // 아래에서 cutPlanAccepted를 false로 두는 이유가 그것이다.
    // 규칙 기반 생성기를 그대로 쓴다 — 손으로 적으면 대본을 고칠 때 어긋난다.
    const cutPlan = createMockCutPlan({ ...state, screenplay: script, sceneStates })

    // 컷에서 패널을 만들고, 그림이 준비된 컷에만 예시 이미지를 붙인다.
    // 나머지는 비워 둔다 — 데모에서도 그릴 자리가 남아 있어야 한다.
    const cutById = new Map(cutPlan.map((cut) => [cut.id, cut]))
    const next = updateActiveBranchShots(state, () => (
      applyCutPlanToShots(cutPlan, []).shots.map((shot) => {
        const cut = cutById.get(shot.cutPlanItemId)
        return {
          ...shot,
          scriptBeat: Math.max(0, Math.min(shot.scriptBeat ?? 0, maxBeat)),
          image: DEMO_PANEL_IMAGES[`${cut?.beat}-${cut?.beatOrder}`] ?? null,
        }
      })
    ))

    return {
      ...next,
      screenplay: script,
      narrativeSuggestions: [],
      activeBeat: 0,
      sceneStates,
      sceneStateStoryKey: screenplayFingerprint(script),
      cutPlan,
      // 확정은 감독이 한다. true로 두면 selectCutStage가 곧바로 'panels'로
      // 보내 컷 플랜 단계 자체가 화면에서 사라진다. 표는 이미 차 있으므로
      // 훑어보고 '확정'만 누르면 기다림 없이 패널로 넘어간다.
      cutPlanAccepted: false,
      cutPlanStageOverride: null,
    }
  }),
  sceneIntention: '',
  setSceneIntention: (sceneIntention) => set({ sceneIntention }),
  setScreenplay: (script) => set((state) => {
    const maxBeat = Math.max(0, ...script.map((line) => line.beat ?? 0))
    const next = updateActiveBranchShots(state, (shots, _branch, scene) => {
      const activeShot = scene.activeShot ?? state.activeShot ?? 0
      const remapped = shots.map((shot) => ({
        ...shot,
        scriptBeat: Math.max(0, Math.min(shot.scriptBeat ?? 0, maxBeat)),
      }))
      return {
        shots: remapped,
        activeShot,
        activeBeat: Math.max(0, Math.min(state.activeBeat ?? 0, maxBeat)),
      }
    })
    return { ...next, screenplay: script, narrativeSuggestions: [] }
  }),
  // --- 대본 인라인 편집 -------------------------------------------------
  // 전체 텍스트를 다시 붙여넣지 않고 줄 단위로 고친다. beat는 보존한다.
  // setScreenplay와 달리 narrativeSuggestions를 지우지 않는다 —
  // 타이핑 한 번에 검토 중인 제안이 사라지면 안 되기 때문이다.
  updateScreenplayLine: (index, text) => set((state) => ({
    screenplay: state.screenplay.map((element, i) => (
      i === index ? { ...element, text } : element
    )),
  })),
  setScreenplayLineType: (index, type) => set((state) => ({
    screenplay: state.screenplay.map((element, i) => (
      i === index ? { ...element, type } : element
    )),
  })),
  // 새 줄은 앞줄의 beat를 물려받아 beat 구조가 깨지지 않게 한다.
  // split이 주어지면 커서 기준으로 현재 줄을 잘라 뒷부분을 새 줄로 넘긴다.
  insertScreenplayLine: (afterIndex, type = 'action', split = null) => set((state) => {
    const next = [...state.screenplay]
    const anchor = next[afterIndex]
    if (split) {
      next[afterIndex] = { ...anchor, text: split.before }
    }
    next.splice(afterIndex + 1, 0, {
      type,
      text: split ? split.after : '',
      beat: anchor?.beat ?? 0,
    })
    return { screenplay: next }
  }),
  // mergeIntoPrevious면 앞 줄 끝에 현재 줄을 이어 붙이고 현재 줄을 지운다.
  removeScreenplayLine: (index, options = {}) => set((state) => {
    if (options.mergeIntoPrevious) {
      // 첫 줄에는 합칠 앞 줄이 없다. 지우지 않고 그대로 둔다.
      if (index <= 0) return {}
      const previous = state.screenplay[index - 1]
      const current = state.screenplay[index]
      const next = state.screenplay.filter((_, i) => i !== index)
      next[index - 1] = { ...previous, text: previous.text + current.text }
      return { screenplay: next }
    }
    if (state.screenplay.length <= 1) return {}
    return { screenplay: state.screenplay.filter((_, i) => i !== index) }
  }),
  scriptEditorRequestKey: 0,
  requestScriptEditor: () => set((state) => ({ scriptEditorRequestKey: state.scriptEditorRequestKey + 1 })),
  narrativeSuggestionRequestKey: 0,
  narrativeSuggestions: [],
  // 실제 모델을 부른다. 실패하면 규칙 기반 mock으로 떨어진다 —
  // 서버가 없어도 작업이 멈추지 않아야 한다.
  narrativePending: false,
  narrativeError: null,
  // 한 번이라도 응답을 받았는가. 제안 0건과 아직 안 물어본 것을 구분한다.
  narrativeAnswered: false,
  // 새 요청을 쓰기 시작하면 "할 수 없는 요청" 안내를 치운다.
  // 제안 자체는 지우지 않는다 — 사용자가 검토 중인 것을 타이핑만으로
  // 날리면 안 된다.
  clearNarrativeResult: () => set({ narrativeAnswered: false }),
  // 하나를 수락하면 나머지 제안은 버린다. 남은 것들의 인덱스가 이미
  // 무효라, 이어서 수락하면 엉뚱한 줄에 적용된다.
  clearNarrativeSuggestions: () => set({ narrativeSuggestions: [], narrativeAnswered: false }),
  // 컷 플랜 점검. 서사가 먼저 짚는다 — 감독이 요청을 쓰지 않아도 된다.
  //
  // 서사는 세 렌즈와 나란한 네 번째가 아니라 그 위에 있다. 미장센·촬영·
  // 편집은 그려진 화면을 보고 판단하지만 서사는 무엇을 그릴지가 정해지기
  // 전에 판단한다. 그래서 Decision Board가 아니라 컷 플랜에 붙는다.
  narrativeCheck: null,
  narrativeCheckPending: false,
  narrativeCheckError: null,
  clearNarrativeCheck: () => set({ narrativeCheck: null, narrativeCheckError: null }),
  // stage가 'script'면 대본을, 아니면 컷 플랜을 본다. 규칙은 같다.
  requestNarrativeCheck: async (stage = 'cutplan') => {
    const state = get()
    if (state.narrativeCheckPending) return
    // 대본 점검은 씬 서술만 본다. 헤딩은 사건이 아니다.
    const lines = state.screenplay
      .filter((element) => element.type !== 'scene-heading')
      .map((element) => element.text)
    const usingCuts = stage !== 'script'
    if (usingCuts ? state.cutPlan.length === 0 : lines.length === 0) return
    set({ narrativeCheckPending: true, narrativeCheckError: null, narrativeCheck: null })
    try {
      const { checkNarrative } = await import('../services/api.js')
      // 대본은 서사가, 컷 플랜은 편집이 본다. 렌즈를 섞으면 8.7의
      // 렌즈별 분포가 틀어진다.
      logScaffold({
        feature: 'lens',
        action: 'open',
        lens: usingCuts ? 'editing' : 'narrative',
        stage,
      })
      const result = await checkNarrative({
        cuts: usingCuts ? state.cutPlan : [],
        lines: usingCuts ? [] : lines,
        sceneIntention: state.sceneIntention || '',
        script: usingCuts ? state.screenplay.map((element) => element.text).join('\n') : '',
      })
      set({ narrativeCheck: { ...result, stage }, narrativeCheckPending: false })
    } catch (error) {
      // 점검은 실패해도 작업이 멈추면 안 된다. mock으로 채우지도 않는다 —
      // 서사가 짚지 않은 것을 짚은 것처럼 보이면 판단이 오염된다.
      set({ narrativeCheckPending: false, narrativeCheckError: error.message })
    }
  },
  requestNarrativeSuggestions: async (input = {}) => {
    const state = get()
    const requestKey = state.narrativeSuggestionRequestKey + 1
    // 진단에서 부를 때는 그 컷의 Beat를 봐야 한다. 지금 보고 있는 Beat가
    // 아니라 문제가 있는 Beat다.
    const targetBeat = input.beat ?? state.activeBeat ?? 0
    const beatElements = state.screenplay
      .map((element, globalIdx) => ({ ...element, globalIdx }))
      .filter((element) => (element.beat ?? 0) === targetBeat)

    const narrativeRequest = input.narrativeRequest?.trim() || ''
    if (!narrativeRequest || beatElements.length === 0) return

    set({
      narrativeSuggestionRequestKey: requestKey,
      narrativePending: true,
      narrativeError: null,
      narrativeAnswered: false,
    })

    const scene = state.scenes[state.activeScene]
    const branch = scene?.branches?.[scene.activeBranch ?? 0]
    const panelCount = (branch?.shots || [])
      .filter((shot) => (shot.scriptBeat ?? 0) === targetBeat).length

    try {
      // 지연 import — 스토어를 node로 단독 검증할 수 있게 한다.
      const { suggestNarrative } = await import('../services/api.js')
      // 대본 전체를 함께 넘긴다. "뒷부분이 급하다" 같은 요청은 지금
      // Beat만 봐서는 답할 수 없다.
      const withIndex = state.screenplay
        .map((element, globalIdx) => ({ ...element, globalIdx }))
        .filter((element) => element.type !== 'scene-heading')
      const beatsByIndex = new Map()
      withIndex.forEach((element) => {
        const beat = element.beat ?? 0
        if (!beatsByIndex.has(beat)) beatsByIndex.set(beat, [])
        beatsByIndex.get(beat).push(element)
      })
      const suggestions = await suggestNarrative({
        narrativeRequest,
        beatElements,
        targetBeat,
        requestKey,
        sceneIntention: state.sceneIntention || '',
        panelCount,
        beatsByIndex,
        scriptBeats: [...beatsByIndex.entries()]
          .sort((left, right) => left[0] - right[0])
          .map(([index, elements]) => ({
            index,
            lines: elements.map((element) => element.text),
          })),
      })
      set({ narrativeSuggestions: suggestions, narrativePending: false, narrativeAnswered: true })
    } catch (error) {
      set({
        narrativeSuggestions: createMockNarrativeSuggestions(get(), requestKey, input),
        narrativePending: false,
        narrativeError: error.message,
        narrativeAnswered: true,
      })
    }
  },
  // 이야기를 씬·비트 구조로 세운다. 컷을 나누려면 그 단위가 있어야 하는데
  // 사용자가 쓴 한 덩어리 이야기에는 없다.
  //
  // 형식을 만들어 주는 것이 아니라 스토리보드가 필요로 하는 구조를 드러내는
  // 일이다. 제안으로 두고 사용자가 확인해야 적용된다 (DG1 P2).
  structureDraft: null,
  // 실제 모델을 부른다. 실패하면 규칙 기반 mock으로 떨어져 작업이 멈추지
  // 않게 한다 — 서버가 없거나 키가 없어도 화면은 돌아가야 한다.
  structurePending: false,
  structureError: null,
  // input.story를 주면 그것으로 나눈다. Continue에서 부를 때가 그렇다 —
  // 아직 screenplay에 넣기 전이어야 나누기 전 대본이 화면에 스치지 않는다.
  // input.fallback은 실패했을 때 세울 대본이다.
  requestStoryStructure: async (apply = false, input = null) => {
    const state = get()
    const story = input?.story
      || state.screenplay.map((line) => line.text.trim()).filter(Boolean).join(' ')
    if (!story) {
      if (input?.fallback) set({ screenplay: input.fallback })
      return
    }

    set({ structurePending: true, structureError: null, narrativeSuggestions: [] })
    try {
      // 지연 import — 스토어를 node로 단독 검증할 수 있게 한다.
      const { structureStory } = await import('../services/api.js')
      const draft = await structureStory(story, state.sceneIntention || '')
      // apply=true면 확인 단계 없이 바로 대본이 된다. Continue에서 부를
      // 때가 그렇다 — 방금 이야기를 넘긴 참이라 원문과 나란히 놓고
      // 판정할 것이 없다. 채운 줄은 filled로 남아 대본에서 표시된다.
      if (apply) {
        set({ structureDraft: draft, structurePending: false })
        // acceptStructureDraft가 draft.screenplay로 갈아 끼우므로,
        // 아직 screenplay가 비어 있어도 여기서 채워진다.
        get().acceptStructureDraft()
        return
      }
      set({ structureDraft: draft, structurePending: false })
    } catch (error) {
      // Continue 경로에서는 screenplay가 아직 비어 있다. 규칙 기반
      // 대체본도 재료가 있어야 만들 수 있으므로 fallback을 넘긴다.
      const source = input?.fallback
        ? { ...get(), screenplay: input.fallback }
        : get()
      set({
        structureDraft: createStoryStructureDraft(source),
        structurePending: false,
        structureError: error.message,
      })
      // 실패해도 apply면 규칙 기반 결과를 적용한다. 초안만 남겨 두면
      // Continue로 들어온 사람은 그것을 볼 자리가 없다 — 이미 화면이
      // 넘어간 뒤다.
      if (apply) get().acceptStructureDraft()
      // 규칙 기반마저 비었으면 최소한 쓴 것은 남아야 한다.
      if (apply && get().screenplay.length === 0 && input?.fallback) {
        set({ screenplay: input.fallback })
      }
    }
  },
  dismissStructureDraft: () => set({ structureDraft: null }),
  acceptStructureDraft: () => set((state) => {
    const draft = state.structureDraft
    if (!draft) return {}
    const maxBeat = Math.max(0, ...draft.screenplay.map((line) => line.beat ?? 0))
    const next = updateActiveBranchShots(state, (shots) => shots.map((shot) => ({
      ...shot,
      scriptBeat: Math.max(0, Math.min(shot.scriptBeat ?? 0, maxBeat)),
    })))
    return {
      ...next,
      screenplay: draft.screenplay,
      structureDraft: null,
      narrativeSuggestions: [],
      activeBeat: 0,
    }
  }),
  dismissNarrativeSuggestion: (suggestionId) => set((state) => {
    const remaining = state.narrativeSuggestions
      .filter((suggestion) => suggestion.id !== suggestionId)
    return {
      narrativeSuggestions: remaining,
      // 마지막 제안을 버리면 목록이 비는데, 그것을 '답이 없었다'와
      // 같이 두면 "여기서는 할 수 없는 요청입니다"가 뜬다. 버린 것은
      // 답이 없던 것이 아니라 감독이 판정한 것이다.
      narrativeAnswered: remaining.length > 0 ? state.narrativeAnswered : false,
    }
  }),
  
  // 비트 나누기: 특정 지점에서 대본을 자르고 새 beat에 기본 shot을 하나 만든다.
  splitBeat: (elementIndex) => set((state) => {
    if (elementIndex <= 0 || elementIndex >= state.screenplay.length) return state

    // 원본 요소를 변형하지 않는다. 얕은 복사 후 element.beat를 직접 쓰면
    // 모듈 상수(SCREENPLAY, ROUGH_SCREENPLAY)까지 오염돼 예시를 다시
    // 불러왔을 때 이미 나뉜 상태가 나온다.
    const shifted = state.screenplay.map((element, index) => ({
      ...element,
      beat: index >= elementIndex ? (element.beat ?? 0) + 1 : (element.beat ?? 0),
    }))

    // 비트 번호를 0부터 빈 틈 없이 다시 매긴다.
    let currentBeat = 0
    let lastSeen = shifted[0].beat
    const newScreenplay = shifted.map((element, index) => {
      if (index === 0) return { ...element, beat: 0 }
      if (element.beat !== lastSeen) {
        currentBeat += 1
        lastSeen = element.beat
      }
      return { ...element, beat: currentBeat }
    })

    // 3. 삽입될 샷의 인덱스 계산 (방금 생성된 비트 번호가 삽입 위치)
    const insertAt = newScreenplay[elementIndex].beat

    const next = updateActiveBranchShots(state, (shots) => {
      const shifted = shots.map((shot) => (
        typeof shot.scriptBeat === 'number' && shot.scriptBeat >= insertAt
          ? { ...shot, scriptBeat: shot.scriptBeat + 1 }
          : shot
      ))
      const insertShotAt = shifted.reduce((lastIdx, shot, idx) => (
        (shot.scriptBeat ?? 0) < insertAt ? idx : lastIdx
      ), -1) + 1
      const newShot = createFlowShot({
        index: insertShotAt,
        scriptBeat: insertAt,
        label: `Beat ${insertAt + 1} Shot 1`,
      })
      shifted.splice(insertShotAt, 0, newShot)
      return {
        shots: shifted,
        activeShot: insertShotAt,
        activeBeat: insertAt,
      }
    })

    return {
      ...next,
      screenplay: newScreenplay,
      narrativeSuggestions: [],
    }
  }),

  // 비트 추가: 지정한 Beat 바로 뒤에 새 Beat를 만든다.
  // Beat는 대본 줄에 붙어 있으므로 빈 줄 하나를 함께 넣어야 존재할 수 있다.
  addBeatAfter: (beat) => set((state) => {
    const insertAt = beat + 1
    // 뒤쪽 Beat 번호를 한 칸씩 민다. 원본 객체를 건드리지 않는다.
    const shifted = state.screenplay.map((element) => (
      (element.beat ?? 0) >= insertAt
        ? { ...element, beat: (element.beat ?? 0) + 1 }
        : element
    ))
    // 새 Beat의 첫 줄은 해당 Beat 마지막 줄 다음에 놓는다.
    const lastIndexOfBeat = state.screenplay.reduce((last, element, index) => (
      (element.beat ?? 0) === beat ? index : last
    ), -1)
    const newScreenplay = [...shifted]
    newScreenplay.splice(lastIndexOfBeat + 1, 0, {
      type: 'action',
      text: '',
      beat: insertAt,
    })

    const next = updateActiveBranchShots(state, (shots) => {
      const movedShots = shots.map((shot) => (
        (shot.scriptBeat ?? 0) >= insertAt
          ? { ...shot, scriptBeat: (shot.scriptBeat ?? 0) + 1 }
          : shot
      ))
      const insertShotAt = movedShots.reduce((lastIdx, shot, idx) => (
        (shot.scriptBeat ?? 0) < insertAt ? idx : lastIdx
      ), -1) + 1
      movedShots.splice(insertShotAt, 0, createFlowShot({
        index: insertShotAt,
        scriptBeat: insertAt,
        label: `Beat ${insertAt + 1} Shot 1`,
      }))
      return { shots: movedShots, activeShot: insertShotAt, activeBeat: insertAt }
    })

    return {
      ...next,
      screenplay: newScreenplay,
      narrativeSuggestions: [],
    }
  }),

  // 비트 합치기: 현재 비트를 이전 비트와 병합한다. Shot은 삭제하지 않고 target beat로 귀속시킨다.
  mergeBeat: (elementIndex) => set((state) => {
    if (elementIndex === 0) return state

    const deleteIdx = state.screenplay[elementIndex].beat ?? 0
    const targetBeat = state.screenplay[elementIndex - 1].beat ?? 0
    const currentBeat = deleteIdx

    // splitBeat와 같은 이유로 원본 요소를 변형하지 않는다.
    const merged = state.screenplay.map((element, index) => (
      index >= elementIndex && (element.beat ?? 0) === currentBeat
        ? { ...element, beat: targetBeat }
        : { ...element, beat: element.beat ?? 0 }
    ))

    let currentNewBeat = 0
    let lastSeen = merged[0].beat
    const newScreenplay = merged.map((element, index) => {
      if (index === 0) return { ...element, beat: 0 }
      if (element.beat !== lastSeen) {
        currentNewBeat += 1
        lastSeen = element.beat
      }
      return { ...element, beat: currentNewBeat }
    })

    const next = updateActiveBranchShots(state, (shots) => {
      const remapped = shots.map((shot) => {
        const beat = shot.scriptBeat ?? 0
        if (beat === deleteIdx) return { ...shot, scriptBeat: targetBeat }
        if (beat > deleteIdx) return { ...shot, scriptBeat: beat - 1 }
        return shot
      })
      const activeShot = Math.max(0, remapped.findIndex((shot) => shot.scriptBeat === targetBeat))
      return {
        shots: remapped,
        activeShot,
        activeBeat: targetBeat,
      }
    })

    return {
      ...next,
      screenplay: newScreenplay,
      narrativeSuggestions: [],
    }
  }),

  activeBeat: 0,
  setActiveBeat: (beat) => set({ activeBeat: beat }),
  selectBeat: (beat) => set((state) => {
    const scene = state.scenes[state.activeScene]
    const branch = scene?.branches?.[scene.activeBranch ?? 0]
    const shotIdx = branch?.shots?.findIndex((shot) => shot.scriptBeat === beat) ?? -1
    if (shotIdx < 0) return { activeBeat: beat }
    return {
      activeBeat: beat,
      activeShot: shotIdx,
      scenes: state.scenes.map((s, i) =>
        i === state.activeScene ? { ...s, activeShot: shotIdx } : s
      ),
    }
  }),
  strategies: DEMO_STRATEGIES,
  activeStrategy: 0,
  setStrategies: (strategies) => set((state) => {
    const scenes = syncScenesFromStrategies(state, strategies)
    return { strategies, scenes }
  }),
  setActiveStrategy: (idx) => set({ activeStrategy: idx }),
  activeShot: 0,
  setActiveShot: (idx) => set((state) => {
    const scene = state.scenes[state.activeScene]
    const branch = scene?.branches?.[scene.activeBranch ?? 0]
    const shot = branch?.shots?.[idx] || state.strategies?.[state.activeStrategy]?.shots?.[idx]
    const next = {
      activeShot: idx,
      scenes: state.scenes.map((s, i) =>
        i === state.activeScene ? { ...s, activeShot: idx } : s
      ),
    }
    const beat = shot?.scriptBeat ?? shot?.beat
    if (typeof beat === 'number') {
      next.activeBeat = beat
    }
    return next
  }),
  analysisResult: null,
  setAnalysisResult: (result) => set({ analysisResult: result }),
  proposals: [],
  setProposals: (proposals) => set({ proposals }),
  activeProposal: null,
  setActiveProposal: (idx) => set({ activeProposal: idx }),
  showStrategyOverlay: false,
  setShowStrategyOverlay: (val) => set({ showStrategyOverlay: val }),
  isAnalyzing: false,
  setIsAnalyzing: (val) => set({ isAnalyzing: val }),
  canvasDataUrl: null,
  setCanvasDataUrl: (url) => set({ canvasDataUrl: url }),
  pendingCanvasImage: null,
  setPendingCanvasImage: (url) => set({ pendingCanvasImage: url }),
  comparePreview: null,
  setComparePreview: (preview) => set({ comparePreview: preview }),
  clearComparePreview: () => set({ comparePreview: null }),
  drawingTool: 'pen',
  setDrawingTool: (tool) => set({ drawingTool: tool }),

  // ── Segmentation (MobileSAM box prompt) ──────────────────
  // Server session for the currently-prepared canvas image
  segmentSession: null,           // { id, imageWidth, imageHeight, sourceDataUrl }
  setSegmentSession: (sess) => set({ segmentSession: sess }),
  // Lifecycle status for the segmentation pipeline
  segmentStatus: 'idle',          // 'idle' | 'preparing' | 'ready' | 'segmenting' | 'error'
  setSegmentStatus: (status) => set({ segmentStatus: status }),
  // Currently active cutout floating above the canvas
  // { dataUrl, bbox: {x,y,w,h} (in css px), originalPatchDataUrl, originalBboxCanvas: {x,y,w,h} (in canvas px) }
  activeCutout: null,
  setActiveCutout: (cutout) => set({ activeCutout: cutout }),
  clearSegmentSession: () => set({ segmentSession: null, segmentStatus: 'idle', activeCutout: null }),
  penType: 'ink',
  setPenType: (type) => set({ penType: type }),
  brushSize: 3,
  setBrushSize: (size) => set({ brushSize: size }),
  isGenerating: false,
  setIsGenerating: (val) => set({ isGenerating: val }),
  isEnhancing: false,
  setIsEnhancing: (val) => set({ isEnhancing: val }),
  intent: '',
  setIntent: (val) => set({ intent: val }),
  // 선택된 연출 축들 (칩으로 on/off). 기본 reframe만.
  activeAxes: ['reframe'],
  setActiveAxes: (axes) => set({ activeAxes: axes }),
  toggleAxis: (axis) => set((state) => {
    const isActive = state.activeAxes.includes(axis)

    if (isActive) {
      return {
        activeAxes: state.activeAxes.filter(a => a !== axis)
      }
    }

    if (axis === 'mise' && state.miseOptions.length === 0) {
      return {
        activeAxes: [...state.activeAxes, axis],
        miseOptions: ['blocking', 'props', 'set_dressing'],
      }
    }

    return {
      activeAxes: [...state.activeAxes, axis]
    }
  }),
  // Mise-en-scène 하위 옵션 (복수 선택). 기본: 셋 다.
  miseOptions: ['blocking', 'props', 'set_dressing'],
  setMiseOptions: (options) => set({ miseOptions: options }),
  toggleMiseOption: (opt) => set((state) => {
    const nextOpts = state.miseOptions.includes(opt)
      ? state.miseOptions.filter(o => o !== opt)
      : [...state.miseOptions, opt]
    // 하나도 안 남으면 mise 축 자동 해제
    const nextAxes = nextOpts.length === 0
      ? state.activeAxes.filter(a => a !== 'mise')
      : state.activeAxes
    return { miseOptions: nextOpts, activeAxes: nextAxes }
  }),
  // freeform 축 전용: 특정 이론/책을 우선 사용
  theoryPreference: null,
  setTheoryPreference: (val) => set({ theoryPreference: val }),
  chatMessages: [],
  addChatMessage: (msg) => set((state) => ({
    chatMessages: [...state.chatMessages, { ...msg, id: Date.now(), timestamp: new Date() }]
  })),
  detailTab: 'guidance',
  setDetailTab: (tab) => set({ detailTab: tab }),
  strategyColors: STRATEGY_COLORS,
  getStrategyColor: (idx) => STRATEGY_COLORS[idx % STRATEGY_COLORS.length],
  overlays: { thirds: true, eyeline: true, annotations: true },
  toggleOverlay: (key) => set((state) => ({
    overlays: { ...state.overlays, [key]: !state.overlays[key] }
  })),
  zenMode: false,
  setZenMode: (val) => set({ zenMode: val }),
  shotSketches: {},
  setShotSketch: (key, dataUrl) => set((state) => ({
    shotSketches: { ...state.shotSketches, [key]: dataUrl }
  })),
  reframeHistory: {},
  addReframeHistoryEntry: (strategyIdx, shotIdx, entry) => set((state) => {
    const key = getShotKey(strategyIdx, shotIdx)
    const existing = state.reframeHistory[key] || []

    if (entry.image && existing.some((item) => item.image === entry.image)) {
      return state
    }

    const nextEntry = {
      id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      image: entry.image,
      cir: entry.cir || null,
      changedFields: entry.changedFields || [],
      description: entry.description || '',
      label: entry.label || `Version ${existing.length + 1}`,
      createdAt: entry.createdAt || new Date().toISOString(),
      source: entry.source || 'reframe',
    }

    return {
      reframeHistory: {
        ...state.reframeHistory,
        [key]: [...existing, nextEntry],
      }
    }
  }),
  clearReframeHistoryForShot: (strategyIdx, shotIdx) => set((state) => {
    const key = getShotKey(strategyIdx, shotIdx)
    const nextHistory = { ...state.reframeHistory }
    delete nextHistory[key]
    return { reframeHistory: nextHistory }
  }),
  // ── Scenes hierarchy ────────────────────────────────────
  scenes: [
    {
      id: 'scene-1',
      label: 'Physics Lab',
      activeBranch: 0,
      activeShot: 0,
      branches: [
        {
          id: 'branch-main',
          label: 'Quiet Discovery',
          isMain: true,
          branchPoint: 0,
          rationale: '',
          shots: DEMO_STRATEGIES[0].shots.map((s, i) => ({
            id: `shot-s1-main-${i}`,
            image: s.image,
            cir: {},
            label: s.intent || `Shot ${i + 1}`,
            scriptBeat: i,
            isAIGenerated: false,
            source: 'canvas',
          })),
        },
      ],
    },
    {
      id: 'scene-2',
      label: 'Faculty Corridor',
      activeBranch: 0,
      activeShot: 0,
      branches: [
        {
          id: 'branch-main-s2',
          label: 'Main',
          isMain: true,
          branchPoint: 0,
          rationale: '',
          shots: [
            { id: 'shot-s2-0', image: null, cir: {}, label: 'Empty Corridor', scriptBeat: 0, isAIGenerated: false, source: 'canvas' },
            { id: 'shot-s2-1', image: null, cir: {}, label: 'Knocking', scriptBeat: 1, isAIGenerated: false, source: 'canvas' },
            { id: 'shot-s2-2', image: null, cir: {}, label: 'Held Notebook', scriptBeat: 2, isAIGenerated: false, source: 'canvas' },
          ],
        },
      ],
    },
  ],
  activeScene: 0,
  overviewMode: 'scene', // 'film' | 'scene'
  flowView: 'grid',

  // Derived selectors (stable across render unless source changes)
  getActiveSceneData: () => {
    const state = get()
    return state.scenes[state.activeScene]
  },
  flowInsertGap: null,         // { branchIdx, afterShotIdx }
  flowFillSuggestions: [],     // legacy — kept for compat

  // Gap fill state — keyed by "branchIdx-afterShotIdx", multiple ghosts can coexist
  // Each entry: { branchIdx, afterShotIdx, userPrompt, status, candidates }
  // status: 'ghost' | 'loading' | 'ready' | 'error'
  gapFills: {},
  gapFillPicker: null,  // { key } — which ghost's candidates are shown in the picker

  // Auto-fill range state
  autoFill: null,              // { branchIdx, fromIdx, toIdx, userPrompt, status, versions, previewVersion }
  //   status: 'idle' | 'loading' | 'ready' | 'error'

  setActiveScene: (idx) => set({ activeScene: idx }),
  setOverviewMode: (m) => set({ overviewMode: m }),
  setFlowView: (v) => set({ flowView: v }),
  setFlowInsertGap: (g) => set({ flowInsertGap: g }),

  // Gap fill actions
  openGapFill: (branchIdx, afterShotIdx) => set((state) => {
    const key = `${branchIdx}-${afterShotIdx}`
    if (state.gapFills[key]) return state  // already open
    return { gapFills: { ...state.gapFills, [key]: { branchIdx, afterShotIdx, userPrompt: '', status: 'ghost', candidates: [] } } }
  }),
  closeGapFill: (key) => set((state) => {
    const next = { ...state.gapFills }
    delete next[key]
    return { gapFills: next, gapFillPicker: state.gapFillPicker?.key === key ? null : state.gapFillPicker }
  }),
  setGapFillPrompt: (key, prompt) => set((state) => ({
    gapFills: state.gapFills[key] ? { ...state.gapFills, [key]: { ...state.gapFills[key], userPrompt: prompt } } : state.gapFills
  })),
  setGapFillStatus: (key, status, candidates = null) => set((state) => ({
    gapFills: state.gapFills[key] ? {
      ...state.gapFills,
      [key]: { ...state.gapFills[key], status, ...(candidates !== null ? { candidates } : {}) }
    } : state.gapFills
  })),
  openGapFillPicker: (key) => set({ gapFillPicker: { key } }),
  closeGapFillPicker: () => set({ gapFillPicker: null }),

  // Auto-fill range actions
  openAutoFill: (branchIdx, fromIdx, toIdx) => set({
    autoFill: { branchIdx, fromIdx, toIdx, userPrompt: '', status: 'idle', versions: [], previewVersion: 0 }
  }),
  closeAutoFill: () => set({ autoFill: null }),
  setAutoFillPrompt: (prompt) => set((state) => ({
    autoFill: state.autoFill ? { ...state.autoFill, userPrompt: prompt } : null
  })),
  setAutoFillStatus: (status, versions = null) => set((state) => ({
    autoFill: state.autoFill ? {
      ...state.autoFill,
      status,
      ...(versions !== null ? { versions } : {}),
    } : null
  })),
  setAutoFillPreviewVersion: (idx) => set((state) => ({
    autoFill: state.autoFill ? { ...state.autoFill, previewVersion: idx } : null
  })),

  // Accept auto-fill version — insert all its shots into the branch
  acceptAutoFillVersion: (versionIdx) => set((state) => {
    const af = state.autoFill
    if (!af || !af.versions[versionIdx]) return state
    const version = af.versions[versionIdx]

    // Build shot_id → current array index map for insertion
    const scenes = state.scenes.map((s, si) => {
      if (si !== state.activeScene) return s
      const branches = s.branches.map((b, bi) => {
        if (bi !== af.branchIdx) return b
        let shots = [...b.shots]
        // Insert from back to front so indices don't shift
        const sorted = [...version.insertions].sort((a, b) => {
          const ai = shots.findIndex(sh => sh.id === a.after_shot_id)
          const bi2 = shots.findIndex(sh => sh.id === b.after_shot_id)
          return bi2 - ai
        })
        for (const ins of sorted) {
          const afterIdx = shots.findIndex(sh => sh.id === ins.after_shot_id)
          if (afterIdx === -1) continue
          const c = ins.candidate
          const inheritedBeat = shots[afterIdx]?.scriptBeat ?? state.activeBeat ?? 0
          const newShot = {
            id: c.id || `shot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            label: c.label,
            cir: c.cir,
            image: toShotImageSrc(c.image),
            scriptBeat: c.scriptBeat ?? inheritedBeat,
            isAIGenerated: true,
            source: 'ai_fill',
          }
          shots.splice(afterIdx + 1, 0, newShot)
        }
        return { ...b, shots }
      })
      return { ...s, branches }
    })
    return { scenes, strategies: syncStrategiesFromScenes(state, scenes), autoFill: null }
  }),

  addScene: (label) => set((state) => {
    const id = `scene-${Date.now()}`
    const newScene = {
      id,
      label: label || `Scene ${state.scenes.length + 1}`,
      activeBranch: 0,
      activeShot: 0,
      branches: [
        {
          id: `branch-main-${id}`,
          label: 'Main',
          isMain: true,
          branchPoint: 0,
          rationale: '',
          shots: [
            { id: `shot-${id}-0`, image: null, cir: {}, label: 'Shot 1', scriptBeat: 0, isAIGenerated: false, source: 'canvas' },
          ],
        },
      ],
    }
    const scenes = [...state.scenes, newScene]
    return {
      scenes,
      activeScene: state.scenes.length,
      activeShot: 0,
      activeBeat: 0,
      strategies: syncStrategiesFromScenes({ ...state, activeScene: state.scenes.length }, scenes),
    }
  }),

  renameScene: (sceneIdx, label) => set((state) => ({
    scenes: state.scenes.map((s, i) => i === sceneIdx ? { ...s, label } : s),
  })),

  removeScene: (sceneIdx) => set((state) => {
    if (state.scenes.length <= 1) return state
    const scenes = state.scenes.filter((_, i) => i !== sceneIdx)
    const activeScene = Math.max(0, Math.min(state.activeScene, scenes.length - 1))
    return {
      scenes,
      activeScene,
      activeShot: scenes[activeScene]?.activeShot ?? 0,
      activeBeat: scenes[activeScene]?.branches?.[scenes[activeScene]?.activeBranch ?? 0]?.shots?.[scenes[activeScene]?.activeShot ?? 0]?.scriptBeat ?? 0,
      strategies: syncStrategiesFromScenes({ ...state, activeScene }, scenes),
    }
  }),

  // ── Helpers: map "flow*" API onto active scene ──────────
  setFlowActiveShot: (idx) => set((state) => {
    const scene = state.scenes[state.activeScene]
    const branch = scene?.branches?.[scene.activeBranch]
    const shot = branch?.shots?.[idx]
    const next = {
      activeShot: idx,
      scenes: state.scenes.map((s, i) =>
        i === state.activeScene ? { ...s, activeShot: idx } : s
      ),
    }
    if (shot && typeof shot.scriptBeat === 'number') {
      next.activeBeat = shot.scriptBeat
    }
    return next
  }),
  setFlowActiveBranch: (idx) => set((state) => {
    const scene = state.scenes[state.activeScene]
    const newBranch = scene?.branches?.[idx]
    const firstShot = newBranch?.shots?.[0]
    const next = {
      activeShot: 0,
      scenes: state.scenes.map((s, i) =>
        i === state.activeScene ? { ...s, activeBranch: idx, activeShot: 0 } : s
      ),
      strategies: syncStrategiesFromScenes(state, state.scenes.map((s, i) =>
        i === state.activeScene ? { ...s, activeBranch: idx, activeShot: 0 } : s
      )),
    }
    if (firstShot && typeof firstShot.scriptBeat === 'number') {
      next.activeBeat = firstShot.scriptBeat
    }
    return next
  }),

  getActiveFlowShot: () => {
    const state = get()
    const scene = state.scenes[state.activeScene]
    const branch = scene?.branches?.[scene.activeBranch ?? 0]
    return branch?.shots?.[scene.activeShot ?? state.activeShot ?? 0] || null
  },

  getShotsForBeat: (beat) => {
    const state = get()
    const scene = state.scenes[state.activeScene]
    const branch = scene?.branches?.[scene.activeBranch ?? 0]
    return (branch?.shots || [])
      .map((shot, shotIdx) => ({ shot, shotIdx }))
      .filter(({ shot }) => shot.scriptBeat === beat)
  },

  // 패널을 Beat에 직접 더한다. 지금은 쓰이지 않는다 — 패널은 컷에서
  // 나와야 프롬프트가 붙기 때문이다. 컷 없이 만든 패널은 생성도 못 한다.
  addShotToBeat: (beat, afterShotIdx = null) => set((state) => {
    return updateActiveBranchShots(state, (shots) => {
      const sameBeatIndices = shots
        .map((shot, idx) => ({ shot, idx }))
        .filter(({ shot }) => shot.scriptBeat === beat)
        .map(({ idx }) => idx)

      const insertAt = afterShotIdx !== null
        ? afterShotIdx + 1
        : sameBeatIndices.length > 0
          ? Math.max(...sameBeatIndices) + 1
          : shots.findIndex((shot) => (shot.scriptBeat ?? 0) > beat)

      const targetIdx = insertAt < 0 ? shots.length : insertAt
      const newShot = createFlowShot({
        index: targetIdx,
        scriptBeat: beat,
        label: `Beat ${beat + 1} Shot ${sameBeatIndices.length + 1}`,
      })
      const nextShots = [...shots]
      nextShots.splice(targetIdx, 0, newShot)
      return {
        shots: nextShots,
        activeShot: targetIdx,
        activeBeat: beat,
      }
    })
  }),

  updateActiveFlowShot: (patch) => set((state) => {
    return updateActiveBranchShots(state, (shots, _branch, scene) => {
      const activeShot = scene.activeShot ?? state.activeShot ?? 0
      return {
        shots: shots.map((shot, idx) =>
          idx === activeShot
            ? { ...shot, ...(typeof patch === 'function' ? patch(shot) : patch) }
            : shot
        ),
        activeShot,
        activeBeat: shots[activeShot]?.scriptBeat ?? state.activeBeat,
      }
    })
  }),

  updateFlowShotById: (shotId, patch) => set((state) => {
    return updateActiveBranchShots(state, (shots, _branch, scene) => {
      const activeShot = scene.activeShot ?? state.activeShot ?? 0
      return {
        shots: shots.map((shot) => (
          shot.id === shotId
            ? { ...shot, ...(typeof patch === 'function' ? patch(shot) : patch) }
            : shot
        )),
        activeShot,
        activeBeat: shots[activeShot]?.scriptBeat ?? state.activeBeat,
      }
    })
  }),

  flowSetActiveShotImage: (image) => set((state) => {
    return updateActiveBranchShots(state, (shots, _branch, scene) => {
      const activeShot = scene.activeShot ?? state.activeShot ?? 0
      return {
        shots: shots.map((shot, idx) =>
          idx === activeShot ? { ...shot, image } : shot
        ),
        activeShot,
      }
    })
  }),

  flowReorderShot: (branchIdx, fromIdx, toIdx) => set((state) => {
    const scenes = state.scenes.map((s, si) => {
      if (si !== state.activeScene) return s
      const branches = s.branches.map((b, bi) => {
        if (bi !== branchIdx) return b
        const shots = [...b.shots]
        const [moved] = shots.splice(fromIdx, 1)
        shots.splice(toIdx, 0, moved)
        return { ...b, shots }
      })
      return { ...s, branches, activeShot: toIdx }
    })
    return {
      scenes,
      strategies: syncStrategiesFromScenes(state, scenes),
      activeShot: toIdx,
      activeBeat: scenes[state.activeScene]?.branches?.[branchIdx]?.shots?.[toIdx]?.scriptBeat ?? state.activeBeat,
    }
  }),

  flowRemoveShot: (branchIdx, shotIdx) => set((state) => {
    const scenes = state.scenes.map((s, si) => {
      if (si !== state.activeScene) return s
      const branches = s.branches.map((b, bi) => {
        if (bi !== branchIdx) return b
        if (b.shots.length <= 1) return b
        return { ...b, shots: b.shots.filter((_, idx) => idx !== shotIdx) }
      })
      const activeShot = s.activeBranch === branchIdx
        ? Math.max(0, Math.min(s.activeShot, branches[branchIdx].shots.length - 1))
        : s.activeShot
      return { ...s, branches, activeShot }
    })
    return {
      scenes,
      strategies: syncStrategiesFromScenes(state, scenes),
      activeShot: scenes[state.activeScene]?.activeShot ?? state.activeShot,
      activeBeat: scenes[state.activeScene]?.branches?.[branchIdx]?.shots?.[scenes[state.activeScene]?.activeShot ?? 0]?.scriptBeat ?? state.activeBeat,
    }
  }),

  flowInsertShot: (branchIdx, afterShotIdx, shot) => set((state) => {
    let insertedIdx = afterShotIdx + 1
    let insertedBeat = state.activeBeat ?? 0
    const scenes = state.scenes.map((s, si) => {
      if (si !== state.activeScene) return s
      const branches = s.branches.map((b, bi) => {
        if (bi !== branchIdx) return b
        const shots = [...b.shots]
        const inheritedBeat = shots[afterShotIdx]?.scriptBeat
        insertedBeat = shot.scriptBeat ?? inheritedBeat ?? 0
        const newShot = {
          id: shot.id || `shot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          image: shot.image || null,
          cir: shot.cir || {},
          label: shot.label || 'New Shot',
          scriptBeat: insertedBeat,
          isAIGenerated: shot.isAIGenerated || false,
          source: shot.source || 'canvas',
        }
        insertedIdx = Math.max(0, Math.min(afterShotIdx + 1, shots.length))
        shots.splice(insertedIdx, 0, newShot)
        return { ...b, shots }
      })
      return { ...s, branches, activeShot: insertedIdx }
    })
    return {
      scenes,
      strategies: syncStrategiesFromScenes(state, scenes),
      activeShot: insertedIdx,
      activeBeat: insertedBeat,
    }
  }),

  flowSplitBranch: (branchIdx, atShotIdx) => set((state) => {
    const scenes = state.scenes.map((s, si) => {
      if (si !== state.activeScene) return s
      const src = s.branches[branchIdx]
      if (!src || atShotIdx === 0) return s
      const newBranch = {
        id: `branch-${Date.now()}`,
        label: `Alt ${s.branches.length}`,
        isMain: false,
        branchPoint: atShotIdx - 1,
        rationale: '',
        shots: src.shots.slice(atShotIdx).map((sh, i) => ({ ...sh, id: `${sh.id}-alt-${i}` })),
      }
      return { ...s, branches: [...s.branches, newBranch] }
    })
    return { scenes, strategies: syncStrategiesFromScenes(state, scenes) }
  }),

  flowDeleteBranch: (branchIdx) => set((state) => {
    const scenes = state.scenes.map((s, si) => {
      if (si !== state.activeScene) return s
      if (s.branches.length <= 1) return s
      const branches = s.branches.filter((_, i) => i !== branchIdx)
      if (!branches.some((b) => b.isMain) && branches.length > 0) {
        branches[0] = { ...branches[0], isMain: true }
      }
      return {
        ...s,
        branches,
        activeBranch: Math.max(0, Math.min(s.activeBranch, branches.length - 1)),
      }
    })
    return { scenes, strategies: syncStrategiesFromScenes(state, scenes) }
  }),

  flowPromoteBranch: (branchIdx) => set((state) => {
    const scenes = state.scenes.map((s, si) => {
      if (si !== state.activeScene) return s
      const branches = s.branches.map((b, bi) => ({ ...b, isMain: bi === branchIdx }))
      return { ...s, branches }
    })
    return { scenes, strategies: syncStrategiesFromScenes(state, scenes) }
  }),

  flowDisconnectEdge: (branchIdx, afterShotIdx) => set((state) => {
    const scenes = state.scenes.map((s, si) => {
      if (si !== state.activeScene) return s
      const src = s.branches[branchIdx]
      if (!src || afterShotIdx >= src.shots.length - 1) return s
      const keepShots = src.shots.slice(0, afterShotIdx + 1)
      const splitShots = src.shots.slice(afterShotIdx + 1)
      const branches = s.branches.map((b, bi) =>
        bi === branchIdx ? { ...b, shots: keepShots } : b
      )
      branches.push({
        id: `branch-${Date.now()}`,
        label: `Alt ${s.branches.length}`,
        isMain: false,
        branchPoint: afterShotIdx,
        rationale: '',
        shots: splitShots.map((sh, i) => ({ ...sh, id: `${sh.id}-split-${i}` })),
      })
      return { ...s, branches }
    })
    return { scenes, strategies: syncStrategiesFromScenes(state, scenes) }
  }),

  // --- New Layout System States ---
  layoutMode: 'unified', // 'unified' | 'maximized'
  maximizedPanel: 'left', // 사이트 진입은 서사/스토리보드 구성 화면에서 시작한다.
  setMaximizedPanel: (panel) => set({ maximizedPanel: panel }),
  // Viewer에서 발견한 읽힘을 작업 화면까지 들고 간다. 이동 후에도 어떤
  // 패널의 어떤 근거 때문에 왔는지 잃지 않게 하는 짧은 handoff다.
  viewerFindingHandoff: null,
  setViewerFindingHandoff: (finding) => set({ viewerFindingHandoff: finding }),
  clearViewerFindingHandoff: () => set({ viewerFindingHandoff: null }),
  // Viewer의 읽힘과 제작자 판단을 분리해 둔다. Viewer를 닫거나 다시
  // 분석해도, 같은 씬·브랜치·컷 범위에 남긴 결정과 메모는 유지된다.
  viewerDecisions: {},
  saveViewerDecision: (decisionId, changes) => set((state) => ({
    viewerDecisions: {
      ...state.viewerDecisions,
      [decisionId]: {
        ...(state.viewerDecisions[decisionId] || {}),
        ...changes,
        updatedAt: Date.now(),
      },
    },
  })),
  storyboardPanelsVisible: true,
  setStoryboardPanelsVisible: (visible) => set({
    storyboardPanelsVisible: visible,
    ...(visible ? {} : { selectedStoryboardShotIds: [] }),
  }),
  drawingWorkspaceOpen: false,
  selectedStoryboardShotIds: [],
  setSelectedStoryboardShotIds: (next) => set((state) => ({
    selectedStoryboardShotIds: typeof next === 'function'
      ? next(state.selectedStoryboardShotIds)
      : next,
  })),
  clearStoryboardShotSelection: () => set({ selectedStoryboardShotIds: [] }),
  // 아직 수락하지 않은 Panels AI 초안. Panels에서는 후보로 남겨 두되,
  // 관객 분석은 지금 화면에 보이는 그림을 읽어야 하므로 별도로 공유한다.
  panelDraftImages: {},
  setPanelDraftImage: (shotId, image) => set((state) => ({
    panelDraftImages: { ...state.panelDraftImages, [shotId]: image },
  })),
  clearPanelDraftImage: (shotId) => set((state) => {
    const panelDraftImages = { ...state.panelDraftImages }
    delete panelDraftImages[shotId]
    return { panelDraftImages }
  }),
  // 그리기로 들어오기 전에 어느 화면이었는지. 나갈 때 그리로 돌려보낸다 —
  // 늘 분할 화면으로 떨어지면 Panels에서 Draw를 눌렀을 때 다른 곳에 도착한다.
  drawingReturnTo: null,
  openDrawingWorkspace: () => set((state) => ({
    drawingWorkspaceOpen: true,
    selectedStoryboardShotIds: [],
    drawingReturnTo: state.maximizedPanel,
    maximizedPanel: null,
    centerTab: 'canvas',
    zenMode: false,
  })),
  closeDrawingWorkspace: () => set((state) => ({
    drawingWorkspaceOpen: false,
    maximizedPanel: state.drawingReturnTo,
    drawingReturnTo: null,
  })),
  
  leftPanelVisible: true,
  setLeftPanelVisible: (val) => set({ leftPanelVisible: val }),
  
  rightPanelVisible: true,
  setRightPanelVisible: (val) => set({ rightPanelVisible: val }),
  
  centerTab: 'canvas', // 'map' | 'canvas' | 'guidance'
  setCenterTab: (tab) => set({ centerTab: tab }),

  isLabMode: false,
  setLabMode: (val) => set({ isLabMode: val }),

  bottomPanelVisible: true,
  setBottomPanelVisible: (val) => set({ bottomPanelVisible: val }),

  timelineExpanded: false,
  setTimelineExpanded: (val) => set({ timelineExpanded: val }),
}))

export default useStore
