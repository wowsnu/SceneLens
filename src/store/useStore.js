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
// 앞부분(S1–S4)은 끊기지 않게 이어 둔다. 분석은 컷 사이의 연결을 보는데
// 중간이 비어 있으면 볼 것이 끊긴다. 뒤쪽은 비워 그릴 자리를 남긴다.
const DEMO_PANEL_IMAGES = {
  '0-1': '/img/lab_wide_establishing.png',  // 실험실 전경
  '0-2': '/img/lab_student_at_bench.png',   // 불빛 아래 혼자 앉은 하린
  '1-1': '/img/lab_student_ots.png',        // 화면과 노트를 보는 어깨 너머
  '1-2': '/img/lab_writing_erasing.png',    // 적고 그어 지우는 손
  '4-1': '/img/lab_pattern_ecu.png',        // 동그라미 친 식
  '5-1': '/img/lab_discovery_cu.png',       // 깨닫는 얼굴
  '6-2': '/img/lab_window_reveal.png',      // 창가
}

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

      // 라벨은 '몇 번째 컷인가'다. 만들 때의 번호를 그대로 두면 중간에 끼워
      // 넣은 컷이 맨 뒤 번호를 달아 S4 자리에 'Shot 19'가 붙는다. 감독이
      // 이름을 붙인 것(기본형이 아닌 것)은 건드리지 않는다.
      return {
        ...branch,
        shots: shots.map((shot, idx) => (
          !shot.label || /^Shot \d+$/.test(shot.label)
            ? { ...shot, label: `Shot ${idx + 1}` }
            : shot
        )),
      }
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
    title: '이 Moment에 행동 한 줄을 더해볼까요?',
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
      title: '여기서 Moment를 나눠볼까요?',
      reason: `“${shortenNarrativeText(previous?.text)}” 이후 “${shortenNarrativeText(boundary.text)}”에서 정보나 행동의 국면이 달라집니다.`,
      actionLabel: 'Split Moment',
    })
  }

  if (requestsStructure && beatShots.length < 2) {
    suggestions.push({
      id: `narrative-${requestKey}-panels-${targetBeat}`,
      type: 'panel-count',
      beat: targetBeat,
      targetCount: 2,
      title: '이 Moment를 두 패널로 나눠볼까요?',
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
      title: '현재 Moment와 패널 구성을 유지해도 좋습니다.',
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

// 표현 밀도. 한 곳에서만 정의한다 — 컷 플랜의 레퍼런스 생성과 Panels의 패널
// 생성이 같은 목록을 봐야 두 단계에서 고른 것이 같은 값이 된다.
//
// image는 앵커 그림이다. 화풍은 글로 적어도 모델마다 다르게 읽으므로, 고른
// 밀도의 실제 그림을 참조로 물려야 그 밀도가 재현된다.
export const PANEL_STYLE_PRESETS = [
  { id: 'rough', label: '러프 콘티', image: '/img/style-anchors/lab-rough-storyboard.png' },
  { id: 'detailed', label: '디테일 스케치', image: '/img/style-anchors/lab-detailed-storyboard.png' },
  { id: 'photoreal', label: '실사 프리비즈', image: '/img/style-anchors/lab-photoreal-previz.png' },
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
  // 컷 길이. 비어 있는 것이 기본이고, 그것은 '아직 안 적음'이 아니라
  // 후속 공정에 넘긴 상태다 (DG1 P3 위임). 감독이 적으면 그때부터
  // 스토리보드가 정한 값이 된다. 초 단위 문자열로 둔다 — `2`, `1.5`,
  // `00:16`처럼 감독이 쓰던 표기를 그대로 받기 위해서다.
  duration = '',
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
    duration,
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
    // 인물은 cast에 있으므로 편 기준을 읽는다. 날것을 읽으면 비어 있다.
    const resolvedScenes = selectSceneStates(state)
    const KNOWN_CAST = castNamesOf(resolvedScenes[sceneId] || resolvedScenes['scene-0'])
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
      // content는 자르지 않는다. 표에서 길어 보인다고 여기서 줄이면 그 잘린
      // 문장이 그대로 그림 프롬프트로 간다 — 모델은 "나머지 공간은 어…"를
      // 받는다. 화면에서 줄이는 것은 화면이 할 일이다.
      push({
        content: actions[0]?.text || heading.text,
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
        content: action.text,
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

// 앵글도 샷 사이즈처럼 풀어 써야 한다. `POV.` 두 글자만 넣으면 모델이
// 무엇을 하라는 것인지 모르고 그냥 인물을 정면에서 그린다 — 실제로 POV로
// 고쳐도 POV가 안 나오던 이유가 이것이다.
const ANGLE_PHRASES = {
  'High angle': '하이 앵글, 카메라가 위에서 내려다본다',
  'Low angle': '로 앵글, 카메라가 아래에서 올려다본다',
  'Over the shoulder': '오버 더 숄더, 다른 인물의 어깨 너머로 본다',
  // POV는 카메라가 인물의 눈이 되는 것이라, 그 인물이 화면에 없어야 한다.
  // 이것을 말하지 않으면 모델이 인물을 그려 넣어 POV가 성립하지 않는다.
  POV: 'POV, 카메라가 그 인물의 눈이다 — 그 인물이 보는 것만 화면에 담고 '
    + '그 인물 자신은 화면에 넣지 않는다(손이나 몸 일부는 허용)',
  'Bird eye': '버드 아이, 카메라가 수직으로 내려다본다',
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
  const angleText = cut.angle && cut.angle !== 'Eye level'
    ? `${ANGLE_PHRASES[cut.angle] || cut.angle}.`
    : ''
  // POV는 그 인물이 화면에 없는 컷이라 `바스트 샷, 가슴 위로` 같은 인물
  // 프레이밍과 부딪힌다. 두 지시가 싸우면 모델은 인물을 그리는 쪽을 따르고
  // POV가 사라진다 — 앵글이 이겨야 하므로 샷 사이즈는 적지 않는다.
  const isPov = cut.angle === 'POV'
  const opening = [
    place && `${place}.`,
    angleText,
    !isPov && shot && `${shot}.`,
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
  //
  // POV에서는 보는 사람이 화면에 없다. `화면에는 하린이 보인다`를 그대로
  // 두면 앵글 지시와 정면으로 부딪혀, 모델이 인물을 그리고 POV가 사라진다.
  // 대신 그 사람의 시점이라는 것을 한 번 더 못박는다.
  const others = cast.filter((name) => !action.includes(name))
  const castNames = others.join(', ')
  const castLine = isPov
    ? (cast[0] ? `이 화면은 ${cast[0]}의 시점이다. ${cast[0]}은 화면에 보이지 않는다.` : '')
    : others.length > 0
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
  //
  // 원본을 그대로 쓴다. 프롬프트 칸은 이 값을 value로 되받는 controlled
  // 입력이라, 여기서 다듬으면 방금 친 글자가 화면에서 지워진다 — 끝에
  // 친 공백과 줄바꿈이 그렇게 사라졌다. 다듬기는 '편집했는가'를 가릴
  // 때만 쓴다. 공백만 친 것은 편집이 아니다.
  const edited = cut.promptOverride || ''
  const hasEdit = Boolean(edited.trim())

  return {
    auto,
    // 실제로 생성에 쓰이는 문장.
    effective: hasEdit ? edited : auto,
    isEdited: hasEdit,
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
export const diagnoseSeams = (cutPlan = [], {
  // 컷 → 패널 → 이음새. 이음새는 패널 사이에 붙으므로 컷에서 바로 찾을 수 없다.
  seams = {},
  shots = [],
} = {}) => {
  if (cutPlan.length === 0) return []
  const findings = []

  const seamForCut = (cutId) => {
    const shot = shots.find((entry) => entry.cutPlanItemId === cutId)
    return shot ? seams[seamKeyFor(shot.id)] : undefined
  }

  // 시간을 흘렸다고 정한 이음새가 기본 연결로 남아 있으면, 감독이 세운
  // 시간 결정과 표의 표기가 충돌한다. 실제로 어떻게 보일지는 그림 뒤에
  // 판단하되, 이 단계에서는 표기를 다시 확인할 수 있게만 짚는다.
  cutPlan.forEach((cut, index) => {
    if (index === 0) return
    const seam = seamForCut(cutPlan[index - 1].id)
    if (!seam) return
    if (seam.elapsed === 'later' && seam.join === 'cut') {
      findings.push({
        id: `elapsed-${cut.id}`,
        type: 'unmarked-elapsed',
        layer: 'shot_relation',
        title: `컷 ${cutPlan[index - 1].beat + 1}-${cutPlan[index - 1].beatOrder} → ${cut.beat + 1}-${cut.beatOrder} · 시간 경과 표기 확인`,
        detail: '시간이 흘렀다고 정했지만 이음새는 기본 컷으로 남아 있습니다. 이 연결 방식이 의도와 맞는지 확인하세요.',
        cutIds: [cutPlan[index - 1].id, cut.id],
        action: 'seam',
      })
    }
  })

  // 생략을 적은 이음새가 기본 연결로 남아 있으면, 생략의 표시 방식을
  // 아직 정하지 않은 상태다. 이 역시 오류라고 단정하지 않고 확인으로 둔다.
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
        title: `컷 ${prev.beat + 1}-${prev.beatOrder} → ${cut.beat + 1}-${cut.beatOrder} · 생략 표기 확인`,
        detail: `“${seam.elision}”을 건너뛰기로 했습니다. 이 연결 방식이 그 생략을 전달하는지 확인하세요.`,
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
  // 하린은 실험실 씬과 같은 사람이다. 기준은 cast에 한 벌 있고, 여기서는
  // 이 씬에서 달라진 것만 적는다 — 복도에서는 노트를 손에 들고 있다.
  characterIds: ['cast-하린'],
  characterOverrides: {
    'cast-하린': { '상태': '구부정한 자세, 노트를 든 채' },
  },
  location: {
    name: '연구동 복도',
    image: '/img/lab_corridor.png',
    facts: [
      { label: '장소 정체', value: '불이 반쯤 꺼진 연구동 복도' },
      { label: '고정 소품', value: '교수 연구실 문 · 게시판 · 소화전' },
    ],
  },
  environment: {
    name: '시간',
    facts: [
      // 서버의 ENVIRONMENT_LABELS와 같은 이름을 쓴다.
      // 화풍은 여기 두지 않는다 — `표현 스타일`이 그림으로 정한다.
      { label: '시간', value: '밤' },
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

// 진단이 가리킨 컷만 비교한다. 다른 컷을 고쳤다고 이 카드까지 지난 결과로
// 만들면 여러 진단 중 하나만 손봐도 전부 다시 점검해야 하는 것처럼 보인다.
// 프롬프트 덮어쓰기는 이미지 문구 편집이지 컷 구성 진단의 입력이 아니므로 뺀다.
export const cutFindingFingerprint = (cutPlan = [], cutIds = []) => cutIds
  .map((cutId) => {
    const cut = cutPlan.find((item) => item.id === cutId)
    if (!cut) return `${cutId}:deleted`
    return JSON.stringify({
      id: cut.id,
      order: cut.order,
      beat: cut.beat,
      beatOrder: cut.beatOrder,
      time: cut.time,
      place: cut.place,
      content: cut.content,
      purpose: cut.purpose,
      characters: cut.characters,
      shotSize: cut.shotSize,
      angle: cut.angle,
      cameraMove: cut.cameraMove,
    })
  })
  .join('|')

// 씬이 달라도 이름이 같으면 같은 사람이다. 레퍼런스 그림을 공유할 때
// 쓰는 것과 같은 규칙을 쓴다(StoryboardView의 referenceIdentity).
export const characterIdentity = (name = '') => (
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR')
)

// --- 인물 기준: 작품에 한 벌, 씬은 달라진 것만 ---------------------------
//
// 인물은 씬의 소유물이 아니다. 하린은 씬이 바뀌어도 하린이다. 그래서 기준
// 한 벌(`cast`)을 작품 수준에 두고, 씬은 **달라진 항목만** 갖는다
// (`sceneState.characterOverrides`).
//
// 씬마다 값을 복사해 두면 어느 것이 원본인지 알 수 없고, 기준을 고쳤을 때
// 이미 복사된 씬들은 따라오지 않는다. 컷 단위 `changes`가 값을 덮어쓰지
// 않고 구간을 얹는 것과 같은 이유다.

// 이 인물의 이번 씬 기준. 기준 위에 그 씬의 덮어쓰기를 얹는다.
export const resolveCharacterFacts = (baseFacts = [], override = null) => {
  if (!override) return baseFacts
  return baseFacts.map((fact) => {
    const value = override[fact.label]
    return value === undefined
      ? fact
      : { ...fact, value, open: !value, overridden: true }
  })
}

// 화면이 보는 인물 목록. 카드는 언제나 이 결과를 그린다.
export const resolveSceneCharacters = (cast = [], sceneState = null) => {
  const overrides = sceneState?.characterOverrides || {}
  // 이 씬에 실제로 나오는 사람만. 대본에 없는 인물까지 카드로 세우면
  // 쓰이지 않는 기준 그림 때문에 다음 단계가 막힌다.
  const appearing = sceneState?.characterIds
  const entries = appearing?.length
    ? appearing.map((id) => cast.find((entry) => entry.id === id)).filter(Boolean)
    : cast
  const sceneImages = sceneState?.characterImages || {}
  return entries.map((character) => {
    // 이 씬에서 달라진 인물은 그 씬의 그림을 쓴다. 없으면 기준 그림.
    const scoped = sceneImages[character.id]
    return {
      ...character,
      ...(scoped ? { image: scoped.image, stylePreset: scoped.stylePreset } : {}),
      facts: resolveCharacterFacts(character.facts, overrides[character.id]),
    }
  })
}

// 씬 기준을 화면·프롬프트가 쓰는 형태로 편다.
//
// `characters`를 파생 필드로 채워 두는 이유: 이 값을 읽는 곳이 스토어·
// 스토리보드·드로잉·보드에 걸쳐 스무 곳이 넘는다. 저장 구조만 바꾸고
// 읽는 모양은 그대로 두어야 그 전부를 건드리지 않는다.
export const resolveSceneState = (state, sceneState) => {
  if (!sceneState) return sceneState
  return {
    ...sceneState,
    characters: resolveSceneCharacters(state.cast, sceneState),
  }
}

// 지금 보고 있는 씬의 기준. activeBeat가 속한 씬을 따른다.
export const selectActiveSceneState = (state) => {
  if (state.sceneStateStoryKey !== screenplayFingerprint(state.screenplay)) {
    return EMPTY_SCENE_STATE
  }
  const scenes = selectScenes(state.screenplay)
  const scene = sceneOfBeat(scenes, state.activeBeat ?? 0)
  // 캐시를 거쳐야 매 렌더마다 새 객체가 나오지 않는다.
  const resolved = selectSceneStates(state)
  return resolved[scene?.id] || resolved['scene-0'] || EMPTY_SCENE_STATE
}

export const selectActiveSceneId = (state) => {
  const scenes = selectScenes(state.screenplay)
  return sceneOfBeat(scenes, state.activeBeat ?? 0)?.id || 'scene-0'
}

// 씬 id → 편 기준. 화면과 프롬프트는 이것만 읽으면 된다.
// `sceneStates`를 직접 읽으면 인물이 빠진 날것이 나온다.
//
// 매번 새 객체를 만들면 zustand가 상태가 바뀐 것으로 보고 무한히 다시
// 그린다. 입력이 그대로면 같은 객체를 돌려준다.
let sceneStatesCache = { cast: null, sceneStates: null, resolved: {} }
export const selectSceneStates = (state) => {
  if (sceneStatesCache.cast === state.cast
    && sceneStatesCache.sceneStates === state.sceneStates) {
    return sceneStatesCache.resolved
  }
  const resolved = {}
  for (const [sceneId, sceneState] of Object.entries(state.sceneStates)) {
    resolved[sceneId] = resolveSceneState(state, sceneState)
  }
  sceneStatesCache = { cast: state.cast, sceneStates: state.sceneStates, resolved }
  return resolved
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
  environment: { name: '시간', facts: [] },
}

// 작품 전체의 인물 기준. 씬이 아니라 여기 산다 — 하린은 실험실에서도
// 복도에서도 하린이다.
const DEMO_CAST = [
  {
    id: 'cast-하린',
    name: '하린',
    summary: '대학원생',
    image: '/img/lab_discovery_cu.png',
    facts: [
      // 생김새는 고정, `상태`만 씬 안에서 변한다 (scene_state.py의 두 갈래).
      { label: '성별·나이', value: '여성, 20대 중반' },
      { label: '외형 기준', value: '묶은 머리, 후드, 마른 체형' },
      { label: '상태', value: '구부정한 자세' },
    ],
  },
]

const SCENE_STATE = {
  title: '물리학과 실험실 · 밤',
  description: '대본에서 추출한 장면 기준입니다. Shot별 배치는 이 상태를 상속하고, 달라진 부분만 별도로 기록합니다.',
  characterIds: ['cast-하린'],
  characterOverrides: {},
  location: {
    name: '물리학과 실험실',
    image: '/img/lab_wide_establishing.png',
    facts: [
      { label: '장소 정체', value: '좁고 낡은 대학 실험실' },
      { label: '고정 소품', value: '실험대 · 오실로스코프 · 노트북 · 비 내리는 창' },
    ],
  },
  environment: {
    name: '시간',
    facts: [
      // 항목 이름은 서버(scene_state.py의 ENVIRONMENT_LABELS)와 같아야 한다.
      // 화풍은 여기 두지 않는다 — `표현 스타일`이 그림으로 정한다.
      { label: '시간', value: '밤' },
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
export const factValueAt = (fact, cutIndex, cutOrder = null) => {
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
  const resolvedScenes = selectSceneStates(state)
  const sceneState = resolvedScenes[scene?.id] || resolvedScenes['scene-0'] || null

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
// `layout`은 공간 레퍼런스에만 쓴다. 도면이 이미 무엇이 어디 있는지 정해
// 두었는데 정면 그림이 그것을 모르고 그려지면, 같은 방을 두 그림이 다르게
// 말하게 된다 — 패널 생성에서 둘 다 물리므로 그 어긋남이 화면으로 온다.
export const buildReferencePrompt = (subject, kind, layout = '') => {
  if (!subject) return { auto: '', effective: '', isEdited: false }

  const settled = (subject.facts || [])
    .filter((fact) => !fact.open && fact.value)
    .map((fact) => fact.value)
  // 도면을 문장으로 옮긴 것. 좌표가 아니라 서로의 상대 위치로 말한다.
  if (kind === 'location' && layout) settled.push(`배치: ${layout}`)

  // summary가 이름과 같으면 "등대지기. 등대지기."가 된다 — 대본이 인물을
  // 부르는 말이 곧 이름인 경우다.
  const head = kind === 'character' && subject.summary && subject.summary !== subject.name
    ? [subject.name, subject.summary]
    : [subject.name]
  const auto = [...head, ...settled].filter(Boolean).join('. ')

  // 컷 프롬프트와 같다 — 원본을 보내고, 다듬은 값으로는 편집 여부만 가린다.
  const edited = subject.promptOverride || ''
  const hasEdit = Boolean(edited.trim())
  return { auto, effective: hasEdit ? edited : auto, isEdited: hasEdit }
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

// --- 시간 상태: 장면이 달라지는 구간 -------------------------------------
//
// 시간만 장면 상태의 경계를 만든다. 인물과 공간은 선택한 시간 상태 안에서
// 바뀌는 값이지, 독자적으로 새 구간을 늘리는 축이 아니다.
//
// 스토어에 두는 이유: 단계를 만드는 것은 Decision Board지만, 그 결과를
// 읽어야 하는 것은 패널 생성이다. 컴포넌트 안에 두면 생성이 못 읽어
// 단계를 나눠 그려도 그림에 반영되지 않는다.
// `shots`가 씬 하나로 걸러진 목록이면 배열 첨자가 1부터 다시 시작한다.
// 그때 라벨을 첨자로 만들면 Scene 2의 첫 구간이 `S1`로 나오는데, 감독이
// 보는 컷 번호는 S16이다. numberFrom으로 보정한다.
export const spatialStagesFor = (sceneState, shots, sceneId, numberFrom = 1) => {
  const factGroups = sceneState?.environment?.facts || []
  const timeFact = factGroups.find((fact) => fact.label === '시간')
  const starts = new Set([0])
  factGroups.forEach((fact) => {
    ;(fact.changes || []).forEach((change) => {
      const index = shots.findIndex((shot) => shot.cutPlanItemId === change.cutId)
      if (index > 0) starts.add(index)
    })
  })
  const indexes = [...starts].sort((left, right) => left - right)
  return indexes.map((start, index) => {
    const nextStart = indexes[index + 1] ?? shots.length
    const end = Math.max(start, nextStart - 1)
    const cutId = start === 0 ? 'initial' : shots[start]?.cutPlanItemId || `shot-${start}`
    const from = start + numberFrom
    const to = end + numberFrom
    const time = (timeFact?.changes || [])
      .map((change) => ({ ...change, index: shots.findIndex((shot) => shot.cutPlanItemId === change.cutId) }))
      .filter((change) => change.index >= 0 && change.index <= start)
      .sort((left, right) => left.index - right.index)
      .at(-1)?.value || timeFact?.value || ''
    return {
      id: `${sceneId || 'scene'}:${cutId}`,
      start,
      label: from === to ? `S${from}` : `S${from}–S${to}`,
      time,
    }
  })
}

// 이 컷이 속한 단계의 2D 배치. 단계를 나눠 그렸어도 생성이 이것을 읽지
// 않으면 마지막에 본 도면 하나로 전부 그려진다.
//
// 저장된 단계가 없으면 직전 단계로 거슬러 올라간다 — 새 단계는 직전
// 배치에서 이어지므로, 손대지 않은 단계는 앞의 것을 그대로 쓴다.
export const selectLayoutForCut = (state, cutId) => {
  const scene = state.scenes?.[state.activeScene]
  const shots = scene?.branches?.[scene.activeBranch ?? 0]?.shots || []
  const shotIndex = shots.findIndex((shot) => shot.cutPlanItemId === cutId)
  if (shotIndex < 0) return state.spatialElements

  const scenes = selectScenes(state.screenplay)
  const cut = state.cutPlan.find((item) => item.id === cutId)
  const scriptScene = cut ? sceneOfBeat(scenes, cut.beat) : null
  const sceneId = scriptScene?.id || null
  const sceneState = selectSceneStates(state)[sceneId] || selectSceneStates(state)['scene-0']

  // 단계는 씬 안에서만 나뉜다. Decision Board도 씬 범위로 계산하므로
  // 여기서 브랜치 전체를 넘기면 stage.id가 서로 달라져, 감독이 그린
  // 단계별 도면을 생성이 찾지 못한다.
  const sceneShots = scriptScene
    ? shots.filter((shot) => {
      const shotCut = state.cutPlan.find((item) => item.id === shot.cutPlanItemId)
      const beat = shotCut?.beat ?? shot.scriptBeat ?? 0
      return beat >= scriptScene.startBeat && beat <= scriptScene.endBeat
    })
    : shots
  const sceneShotIndex = sceneShots.findIndex((shot) => shot.cutPlanItemId === cutId)
  if (sceneShotIndex < 0) return state.spatialElements

  const stages = spatialStagesFor(sceneState, sceneShots, sceneId)

  const stageIndex = stages.reduce(
    (found, stage, index) => (stage.start <= sceneShotIndex ? index : found),
    0,
  )
  for (let index = stageIndex; index >= 0; index -= 1) {
    const saved = state.spatialLayoutsByStage[stages[index]?.id]
    if (saved?.length) return saved
  }
  return state.spatialElements
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
//   preparation → 표현 방식과 장면 기준
//   panels      → 대본 + 패널
export const selectCutStage = (state) => {
  if (state.cutPlanStageOverride) return state.cutPlanStageOverride
  if (state.cutPlanAccepted) return state.panelPreparationComplete ? 'panels' : 'preparation'
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
  // 컷을 확정한 뒤, 표현 방식과 필요한 기준 이미지를 따로 준비한다.
  // 이 단계를 분리해야 미장센 에이전트의 판단처럼 보이지 않는다.
  panelPreparationComplete: false,
  cutPlanRequestKey: 0,
  cutPlanShotSizes: CUT_PLAN_SHOT_SIZES,
  cutPlanAngles: CUT_PLAN_ANGLES,
  cutPlanMoves: CUT_PLAN_MOVES,
  // 패널을 그리기 전에 고르는 제공자/모델. 같은 선택을 개별 재생성에도
  // 유지해야 한 보드 안에서 모델이 섞이지 않는다.
  // 기본을 gpt-image-2로 둔다. 컷 플랜의 레퍼런스 생성은 모델을 고르는
  // 자리보다 앞이라 이 값을 그대로 쓰는데, gpt-image-1은 화풍·국적 지시를
  // 자주 흘렸다.
  panelImageModel: 'gpt-image-2',
  setPanelImageModel: (panelImageModel) => set({ panelImageModel }),
  // 표현 밀도. 컷 플랜(레퍼런스 생성)과 Panels(패널 생성) 양쪽에서 고르되
  // 값은 하나다 — 기준 그림과 패널이 다른 화풍으로 갈리면 안 된다.
  panelStylePreset: 'rough',
  setPanelStylePreset: (panelStylePreset) => set({ panelStylePreset }),
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

  // 작품 전체의 인물 기준. 인물은 씬의 소유물이 아니다 — 하린은 씬이
  // 바뀌어도 하린이고, 레퍼런스 그림도 한 장이면 된다.
  //
  // 씬마다 값을 복사해 두면 어느 것이 원본인지 알 수 없고, 기준을 고쳤을
  // 때 이미 복사된 씬은 따라오지 않는다.
  cast: [],
  // 컷을 가로지르는 기준. 여기를 고치면 그 씬의 모든 컷 프롬프트가 바뀐다.
  //
  // 공간·환경은 씬마다 다르므로 여기 있다. 인물은 cast에 있고, 씬은
  // 누가 나오는지(characterIds)와 무엇이 달라지는지(characterOverrides)만 갖는다.
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
      // 씬을 순서대로 돌면서 인물 기준을 쌓는다. 이름이 같으면 같은 사람이다.
      const knownByName = {}
      // 작품 전체의 인물 기준. 처음 등장한 씬에서 세워진다.
      const nextCast = []

      for (const scene of scenes) {
        // 이 씬에서 기준과 달라지는 항목만.
        const sceneOverrides = {}
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

        const built = await buildSceneState({
          heading: scene.heading,
          script,
          sceneIntention: state.sceneIntention || '',
          cutPlan,
          cutIds,
          // 앞 씬들에서 이미 세운 인물을 함께 보낸다. 씬마다 따로 읽으면
          // 같은 사람이 다른 외형으로 나온다 — 대본은 인물을 처음 나올 때만
          // 묘사하므로, 뒤 씬 대본만 보면 근거가 없어 모델이 지어낸다.
          knownCharacters: Object.values(knownByName).map((entry) => ({
            name: entry.name,
            facts: entry.facts,
          })),
        })

        // 인물은 씬의 소유물이 아니다. 처음 나온 씬에서 기준이 되고,
        // 이후 씬은 **달라진 항목만** 덮어쓴다.
        const characterIds = []
        for (const character of built.characters) {
          const identity = characterIdentity(character.name)
          if (!identity) continue
          const known = knownByName[identity]

          if (!known) {
            // 처음 보는 사람 — 이 값이 작품 전체의 기준이 된다.
            const id = `cast-${identity}`
            const entry = { id, name: character.name, summary: character.summary, facts: character.facts }
            knownByName[identity] = entry
            nextCast.push(entry)
            characterIds.push(id)
            continue
          }

          characterIds.push(known.id)
          // 기준과 다른 값만 덮어쓰기로 남긴다. 같은 값을 다시 적으면
          // 기준을 고쳤을 때 이 씬만 따라오지 않는다.
          const baseByLabel = new Map(known.facts.map((fact) => [fact.label, fact]))
          const overrides = {}
          for (const fact of character.facts) {
            const base = baseByLabel.get(fact.label)
            if (!base) continue
            // 값이 비었으면 정보가 없다는 뜻이지 달라졌다는 뜻이 아니다.
            if (!fact.value || fact.open) continue
            if (fact.value !== base.value) overrides[fact.label] = fact.value
          }
          if (Object.keys(overrides).length) {
            sceneOverrides[known.id] = overrides
          }
        }

        // 레퍼런스 그림과 직접 고친 프롬프트는 사용자가 만든 것이다.
        // 대본을 다시 읽는다고 지워지면 안 된다 — 다시 그려야 한다.
        const kept = state.sceneStates[scene.id]
        next[scene.id] = {
          ...built,
          // 인물은 cast가 들고 있다. 씬은 누가 나오는지와 무엇이 달라지는지만.
          characters: undefined,
          characterIds,
          characterOverrides: sceneOverrides,
          location: {
            ...built.location,
            image: kept?.location?.image ?? null,
            promptOverride: kept?.location?.promptOverride || '',
          },
        }
      }

      // 이미 그린 레퍼런스와 고친 프롬프트를 새 기준으로 옮긴다.
      const keptCast = new Map((state.cast || []).map((entry) => [entry.id, entry]))
      set({
        cast: nextCast.map((entry) => {
          const before = keptCast.get(entry.id)
          return {
            ...entry,
            image: before?.image ?? null,
            stylePreset: before?.stylePreset,
            promptOverride: before?.promptOverride || '',
          }
        }),
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
  // 인물은 씬이 아니라 cast에 산다. 여기서 고치면 그 인물이 나오는 모든
  // 씬이 함께 바뀐다 — 씬마다 따로 고쳐야 하는 것은 덮어쓰기 쪽이다
  // (setSceneFact의 characterId 경로).
  updateSceneCharacter: (characterId, patch) => set((state) => ({
    cast: state.cast.map((character) => (
      character.id === characterId ? { ...character, ...patch } : character
    )),
  })),

  // 대본에서 공간 배치를 제안받는다. 빈 캔버스에서 시작하는 대신
  // 초안을 고치게 한다 — 이 배치가 곧 패널 생성의 도면 참조가 된다.
  spaceLayoutPending: false,
  spaceLayoutError: null,
  spaceLayoutNote: '',
  // `auto`는 컷 플랜 뒤에 자동으로 도는 경우다. 감독이 이미 배치를 놓아
  // 두었으면 다시 뽑지 않는다 — 끌어서 맞춰 둔 자리를 덮으면 한 일이
  // 사라진다. 버튼으로 부를 때는 다시 뽑는 것이 그 버튼의 뜻이다.
  requestSpaceLayout: async ({ auto = false } = {}) => {
    const state = get()
    if (auto && state.spatialElements.length > 0) return
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
    const scene = selectSceneStates(state)[sceneId]
    if (!scene) return

    // 인물 레퍼런스는 이 씬의 값(기준 + 덮어쓰기)으로 그린다. 코트를 벗은
    // 씬이면 그 모습이어야 그 씬의 컷에 맞는 기준이 된다.
    const subject = kind === 'character'
      ? scene.characters.find((entry) => entry.id === subjectId)
      : scene[kind]
    if (!subject) return

    // 공간이면 도면을 함께 넣는다. 컷 플랜 뒤에 이미 만들어져 있으므로
    // (requestSpaceLayout) 정면 그림이 그 배치를 따라 그려진다.
    const prompt = buildReferencePrompt(
      subject,
      kind,
      kind === 'location' ? describeLayout(state.spatialElements) : '',
    )
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
      // 레퍼런스부터 패널과 같은 화풍으로 만든다. 기준 그림이 다른 화풍이면
      // 패널 생성 때 참조로 물려 두 화풍이 서로 경쟁하게 된다.
      const preset = get().panelStylePreset
      // 모델도 패널과 같은 것을 쓴다. 기준 그림만 다른 모델로 그리면
      // 프롬프트를 받아들이는 정도가 달라 화풍이 그 지점에서 갈린다.
      // FLUX는 레퍼런스 경로가 없으므로(OpenAI images.generate만 쓴다)
      // 그때만 기본값으로 떨어진다.
      const panelModel = get().panelImageModel
      const image = await generateReferenceImage(kind, prompt.effective, {
        preset,
        model: panelModel === 'flux-2-klein' ? 'gpt-image-1' : panelModel,
      })
      // 어떤 밀도로 만든 기준인지 그림 옆에 남긴다. preset을 바꾸면 이 값이
      // 현재 값과 달라져, 화풍이 갈렸다는 것을 화면이 알아챌 수 있다.
      if (kind === 'character') {
        // 이 씬에서 달라진 인물이면 그림도 이 씬의 것이다. 기준에 넣으면
        // 코트를 벗은 모습이 다른 씬까지 따라간다.
        const scoped = Boolean(get().sceneStates[sceneId]?.characterOverrides?.[subjectId])
        if (scoped) {
          get().updateSceneStateAt(sceneId, (current) => ({
            ...current,
            characterImages: {
              ...(current.characterImages || {}),
              [subjectId]: { image, stylePreset: preset },
            },
          }))
        } else {
          set((current) => ({
            cast: current.cast.map((entry) => (
              entry.id === subjectId ? { ...entry, image, stylePreset: preset } : entry
            )),
          }))
        }
      } else {
        get().updateSceneStateAt(sceneId, (current) => (
          { ...current, [kind]: { ...current[kind], image, stylePreset: preset } }
        ))
      }
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
    if (kind === 'character') {
      set((state) => ({
        cast: state.cast.map((entry) => (
          entry.id === subjectId ? { ...entry, promptOverride: text } : entry
        )),
      }))
      return
    }
    get().updateSceneStateAt(selectActiveSceneId(get()), (current) => (
      { ...current, [kind]: { ...current[kind], promptOverride: text } }
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
    // 인물의 컷 변화는 기준에 붙는다 — 하린이 젖은 채 굳어가는 것은
    // 이 씬의 컷을 가로지르는 일이고, 기준 항목에 구간을 얹는 것이다.
    if (group === 'character') {
      set((state) => ({
        cast: state.cast.map((character) => (
          character.id === characterId
            ? { ...character, facts: patchFacts(character.facts) }
            : character
        )),
      }))
      return
    }
    get().updateSceneStateAt(sceneId || selectActiveSceneId(get()), (scene) => (
      { ...scene, [group]: { ...scene[group], facts: patchFacts(scene[group]?.facts) } }
    ))
  },

  removeFactChange: (group, label, cutId, { characterId = null, sceneId = null } = {}) => {
    const patchFacts = (facts = []) => facts.map((fact) => (
      fact.label === label
        ? { ...fact, changes: (fact.changes || []).filter((change) => change.cutId !== cutId) }
        : fact
    ))
    if (group === 'character') {
      set((state) => ({
        cast: state.cast.map((character) => (
          character.id === characterId
            ? { ...character, facts: patchFacts(character.facts) }
            : character
        )),
      }))
      return
    }
    get().updateSceneStateAt(sceneId || selectActiveSceneId(get()), (scene) => (
      { ...scene, [group]: { ...scene[group], facts: patchFacts(scene[group]?.facts) } }
    ))
  },

  // 미정으로 남은 항목을 채운다. open을 지우는 것이 곧 결정이다.
  //
  // 인물은 기준(cast)을 고친다 — 그 인물이 나오는 모든 씬이 함께 바뀐다.
  // 이 씬에서만 달라지게 하려면 `scoped: true`로 덮어쓰기를 만든다.
  setSceneFact: (group, label, value, {
    characterId = null, sceneId = null, scoped = false,
  } = {}) => {
    const patchFacts = (facts = []) => facts.map((fact) => (
      fact.label === label ? { ...fact, value, open: !value } : fact
    ))

    if (group === 'character') {
      if (!scoped) {
        set((state) => ({
          cast: state.cast.map((character) => (
            character.id === characterId
              ? { ...character, facts: patchFacts(character.facts) }
              : character
          )),
        }))
        return
      }
      get().setCharacterOverride(characterId, label, value, { sceneId })
      return
    }

    get().updateSceneStateAt(sceneId || selectActiveSceneId(get()), (scene) => (
      { ...scene, [group]: { ...scene[group], facts: patchFacts(scene[group]?.facts) } }
    ))
  },

  // 이 씬에서만 달라지는 인물 항목. 기준과 같아지면 덮어쓰기를 지운다 —
  // 같은 값을 남겨 두면 나중에 기준을 고쳤을 때 이 씬만 따라오지 않는다.
  setCharacterOverride: (characterId, label, value, { sceneId = null } = {}) => {
    const state = get()
    const targetScene = sceneId || selectActiveSceneId(state)
    const base = state.cast.find((entry) => entry.id === characterId)
    const baseValue = base?.facts?.find((fact) => fact.label === label)?.value ?? ''

    get().updateSceneStateAt(targetScene, (scene) => {
      const forCharacter = { ...(scene.characterOverrides?.[characterId] || {}) }
      if (value === baseValue) delete forCharacter[label]
      else forCharacter[label] = value

      const overrides = { ...(scene.characterOverrides || {}) }
      if (Object.keys(forCharacter).length) overrides[characterId] = forCharacter
      else delete overrides[characterId]

      return { ...scene, characterOverrides: overrides }
    })
  },

  // 이 씬의 덮어쓰기를 지우고 기준으로 되돌린다.
  clearCharacterOverride: (characterId, label = null, { sceneId = null } = {}) => {
    get().updateSceneStateAt(sceneId || selectActiveSceneId(get()), (scene) => {
      const overrides = { ...(scene.characterOverrides || {}) }
      if (!label) {
        delete overrides[characterId]
        return { ...scene, characterOverrides: overrides }
      }
      const forCharacter = { ...(overrides[characterId] || {}) }
      delete forCharacter[label]
      if (Object.keys(forCharacter).length) overrides[characterId] = forCharacter
      else delete overrides[characterId]
      return { ...scene, characterOverrides: overrides }
    })
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
      panelPreparationComplete: false,
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
      // 공간 도면도 여기서 미리 만든다. 감독이 상자를 직접 놓아야 한다면
      // 대개 비어 있는 채로 남고, 그러면 첫 생성에 배치 기준이 없어 컷마다
      // 콘솔과 책상이 좌우로 옮겨 다닌다.
      //
      // AI가 대본과 공간 기준을 읽어 초안을 놓고, 감독은 2D 배치에서 끌어
      // 고친다 — 만드는 부담 없이 판정만 남는다 (DG1 P2).
      await get().requestSpaceLayout({ auto: true })
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
      // 문장이 있다고 제안을 받은 것은 아니다 — 감독이 직접 썼을 수
      // 있다. 실제로 AI 후보를 받아 넣었을 때만 proposed다.
      proposed: fields.provenance === 'AI',
    })
    return set((state) => {
    const next = [...state.cutPlan]
    const index = afterItemId
      ? next.findIndex((item) => item.id === afterItemId)
      : next.length - 1
    const anchorBeat = index >= 0 ? next[index].beat : beat
    const inserted = createCutPlanItem({
      beat: anchorBeat,
      content: '',
      purpose: '',
      // 제안을 받아 넣었으면 사용자가 쓴 것이 아니다.
      provenance: fields.content ? 'AI' : 'User',
      ...fields,
    })
    next.splice(index + 1, 0, inserted)

    // 패널이 이미 컷에 붙어 있으면(확정 후) 패널도 함께 만든다. 컷만 넣으면
    // 이음새에서 `넣기`를 눌러도 그림 자리가 생기지 않아 화면에 아무 변화가
    // 없고, 프롬프트도 붙을 자리가 없다 — splitCut·mergeCuts와 같은 규칙이다.
    //
    // 컷 플랜 표에서 부를 때는 아직 패널이 없다(확정 전). 그때는 컷만 넣고,
    // `Accept cut plan`이 패널을 한 번에 만든다.
    const scene = state.scenes?.[state.activeScene]
    const shots = scene?.branches?.[scene.activeBranch ?? 0]?.shots || []
    const anchorHasPanel = shots.some((shot) => shot.cutPlanItemId)
    if (!anchorHasPanel) return { cutPlan: reorderCutPlan(next) }

    const anchorShot = shots.find((shot) => shot.cutPlanItemId === afterItemId)
    const insertedShot = {
      ...createFlowShot({ index: shots.length, scriptBeat: anchorBeat }),
      cutPlanItemId: inserted.id,
      // 방금 끼워 넣은 칸이라는 표시. 패널 격자는 이 표시가 있는 빈 칸에만
      // 프롬프트 편집칸을 연다 — 아직 안 그린 컷까지 열면 격자가 통째로
      // 입력칸이 된다. 내용을 받아 바로 그리는 경우에는 필요 없다.
      ...((fields.content || '').trim() ? {} : { insertDraft: true }),
    }
    const withPanel = updateActiveBranchShots(state, (current) => {
      const shotIndex = current.findIndex((shot) => shot.cutPlanItemId === afterItemId)
      const copy = [...current]
      copy.splice(shotIndex < 0 ? copy.length : shotIndex + 1, 0, insertedShot)
      return copy
    })

    // 원래 이음새는 anchor → 다음 컷 사이의 결정이었다. 새 컷을 그 사이에
    // 넣으면 그 결정은 inserted → 다음 컷으로 이동하고, anchor → inserted는
    // 새 기본 이음새가 된다. UI가 약속한 "새 컷 뒤로 이동"을 실제로 반영한다.
    const nextSeams = { ...state.seams }
    if (anchorShot && nextSeams[seamKeyFor(anchorShot.id)]) {
      nextSeams[seamKeyFor(insertedShot.id)] = nextSeams[seamKeyFor(anchorShot.id)]
      delete nextSeams[seamKeyFor(anchorShot.id)]
    }

    // 편집 제안의 내용을 골라 넣었다면 빈 자리만 만들지 않고, 그 content로
    // 조립된 프롬프트를 즉시 생성한다. 사용자가 직접 추가한 빈 컷은 내용이
    // 없으므로 기존처럼 빈 패널로 남긴다.
    const shouldGenerate = Boolean((fields.content || '').trim())
    return {
      ...withPanel,
      cutPlan: reorderCutPlan(next),
      seams: nextSeams,
      ...(shouldGenerate ? {
        panelToolRequest: {
          id: `panel-tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          shotId: insertedShot.id,
          tool: 'regenerate',
          reason: 'insert',
        },
      } : {}),
    }
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

  // 편집이 "여기 컷이 빠졌다"고 짚으면 서사에게 묻고, 받은 줄을 대본과
  // 컷에 함께 넣는다.
  //
  // 대본에 이미 있는 행동을 컷으로 옮기는 것은 나누기다. 삽입은 대본에
  // 없던 단계를 더하는 일이라 편집이 혼자 정할 수 없다 — 무엇이 일어나야
  // 하는지는 이야기의 몫이다.
  //
  // 화면을 대본으로 되돌리지 않는다. 컷이 빠졌다는 지적을 컷 플랜에서
  // 읽었는데 판정하러 대본까지 갔다 와야 하면, 고치는 일이 두 화면에
  // 걸친다. 여기서 제안을 보고 여기서 받아들인다.
  cutInsertPending: null,
  cutInsertError: null,
  cutInsertProposal: null,
  requestCutInsert: async (finding) => {
    const state = get()
    if (!finding?.cutIds?.length) return
    const cut = state.cutPlan.find((item) => item.id === finding.cutIds[0])
    if (!cut) return

    const beatLines = state.screenplay
      .map((element, globalIdx) => ({ ...element, globalIdx }))
      .filter((element) => (element.beat ?? 0) === cut.beat)
    if (beatLines.length === 0) return

    set({ cutInsertPending: finding.id, cutInsertError: null, cutInsertProposal: null })
    try {
      const { suggestNarrative } = await import('../services/api.js')
      const result = await suggestNarrative({
        narrativeRequest: (
          `편집 검토에서 이런 지적이 나왔습니다: ${finding.title}\n`
          + `${finding.detail || ''}\n`
          + '이 자리에 컷 하나가 더 필요합니다. 대본에 없는 어떤 단계를 더하면 '
          + '되는지 한 가지만 제안해 주세요. 이미 적혀 있는 행동을 옮기는 것은 '
          + '컷 나누기로 되는 일이라 제안하지 마세요.'
        ),
        beatElements: beatLines,
        targetBeat: cut.beat,
        requestKey: state.narrativeSuggestionRequestKey + 1,
        sceneIntention: state.sceneIntention || '',
        scope: 'beat',
      })
      // 줄을 더하는 제안만 받는다. 나누기·바꾸기는 여기서 할 일이 아니다.
      const item = (result || [])
        .find((entry) => entry.type === 'insert-script-line')
      if (!item?.proposedText) {
        set({ cutInsertPending: null, cutInsertError: '더할 단계를 찾지 못했습니다.' })
        return
      }
      set({
        cutInsertPending: null,
        cutInsertProposal: {
          findingId: finding.id,
          afterCutId: cut.id,
          beat: cut.beat,
          // 대본 마지막 줄 뒤에 넣는다. Beat 안에서 어느 줄 뒤인지까지
          // 맞추려면 서사의 line_index를 믿어야 하는데, 컷 플랜에서는
          // 그 줄이 화면에 없어 감독이 확인할 수 없다.
          afterElementIndex: beatLines[beatLines.length - 1].globalIdx,
          text: item.proposedText,
          reason: item.reason || '',
        },
      })
    } catch (error) {
      set({ cutInsertPending: null, cutInsertError: error.message })
    }
  },

  // 받아들이면 대본과 컷에 함께 들어간다. 대본에만 넣으면 컷은 여전히
  // 비어 있고, 컷에만 넣으면 그 컷이 근거로 삼을 대본 줄이 없다.
  acceptCutInsert: () => {
    const proposal = get().cutInsertProposal
    if (!proposal) return

    logEdit({
      lens: 'editing',
      level: 'seam',
      target: proposal.afterCutId,
      action: 'insert',
      source: 'seam',
      proposed: true,
    })

    set((state) => {
      const screenplay = [...state.screenplay]
      screenplay.splice(proposal.afterElementIndex + 1, 0, {
        type: 'action',
        text: proposal.text,
        beat: proposal.beat,
      })

      const index = state.cutPlan.findIndex((item) => item.id === proposal.afterCutId)
      const anchorBeat = index >= 0 ? state.cutPlan[index].beat : proposal.beat
      const inserted = createCutPlanItem({
        beat: anchorBeat,
        content: proposal.text,
        purpose: '',
        // 제안을 받아 넣은 것이므로 사용자가 쓴 것이 아니다.
        provenance: 'AI',
      })
      const cutPlan = reorderCutPlan([
        ...state.cutPlan.slice(0, index + 1),
        inserted,
        ...state.cutPlan.slice(index + 1),
      ])

      // 패널도 함께 만든다. 컷만 넣으면 그림이 없어 화면에 아무 변화가
      // 없고, 프롬프트도 붙을 자리가 없다 — splitCut과 같은 규칙이다.
      const shots = state.scenes[state.activeScene]
        ?.branches[state.scenes[state.activeScene].activeBranch ?? 0]?.shots || []
      const anchorShot = shots.find((shot) => shot.cutPlanItemId === proposal.afterCutId)
      const insertedShot = {
        ...createFlowShot({ index: shots.length, scriptBeat: anchorBeat }),
        cutPlanItemId: inserted.id,
      }
      const next = updateActiveBranchShots(state, (current) => {
        const shotIndex = current.findIndex((shot) => (
          shot.cutPlanItemId === proposal.afterCutId
        ))
        const copy = [...current]
        copy.splice(shotIndex < 0 ? copy.length : shotIndex + 1, 0, insertedShot)
        return copy
      })

      // 이음새는 앞 컷 id로 걸린다. anchor에 적어 둔 결정은 'anchor → 다음
      // 컷' 사이의 것이었으므로, 그 사이에 컷이 들어오면 새 컷 뒤로 옮겨야
      // 한다. 옮기지 않으면 감독이 정해 둔 이음새가 anchor와 새 컷 사이에
      // 붙는다 — addCutPlanItem과 같은 규칙이다.
      const nextSeams = { ...state.seams }
      if (anchorShot && nextSeams[seamKeyFor(anchorShot.id)]) {
        nextSeams[seamKeyFor(insertedShot.id)] = nextSeams[seamKeyFor(anchorShot.id)]
        delete nextSeams[seamKeyFor(anchorShot.id)]
      }

      return { ...next, screenplay, cutPlan, seams: nextSeams, cutInsertProposal: null }
    })
  },

  rejectCutInsert: () => set({ cutInsertProposal: null, cutInsertError: null }),

  removeCutPlanItem: (itemId) => set((state) => ({
    cutPlan: reorderCutPlan(state.cutPlan.filter((item) => item.id !== itemId)),
  })),

  // 패널에서 컷을 지울 때는 컷 플랜만 남겨 두면 안 된다. 이후 프롬프트가
  // 삭제된 컷을 계속 조립하거나 패널과 컷 번호가 어긋난다. 편집 렌즈의
  // 삭제는 이 세 구조(컷·패널·이음새)를 한 번에 정리한다.
  deleteCut: (cutId, shotId = null) => {
    logEdit({ lens: 'editing', level: 'shot', target: cutId || shotId, action: 'delete', source: 'panel' })
    return set((state) => {
      const activeScene = state.scenes[state.activeScene]
      const activeBranchIndex = activeScene?.activeBranch ?? 0
      const shots = activeScene?.branches[activeBranchIndex]?.shots || []

      const targetShotIndex = shots.findIndex((shot) =>
        (shotId && shot.id === shotId) || (cutId && shot.cutPlanItemId === cutId)
      )
      const targetShot = targetShotIndex >= 0 ? shots[targetShotIndex] : null
      const targetCutId = cutId || targetShot?.cutPlanItemId

      const previousShot = targetShotIndex > 0 ? shots[targetShotIndex - 1] : null

      const next = updateActiveBranchShots(state, (current) => (
        targetShot ? current.filter((s) => s.id !== targetShot.id) : current
      ))
      const nextSeams = { ...state.seams }
      if (previousShot) delete nextSeams[seamKeyFor(previousShot.id)]
      if (targetShot) delete nextSeams[seamKeyFor(targetShot.id)]

      const nextCutPlan = targetCutId
        ? reorderCutPlan(state.cutPlan.filter((item) => item.id !== targetCutId))
        : state.cutPlan

      return {
        ...next,
        cutPlan: nextCutPlan,
        seams: nextSeams,
      }
    })
  },
  // --- 이음새 수준의 개입 (DG2 P1) --------------------------------------
  // 병합·분할은 컷만 바꾸는 것이 아니다. 패널과 이음새가 함께 움직여야
  // 한다 — 컷 하나를 지우면 그 패널과 이음새도 갈 곳을 잃는다.

  // 병합: 두 컷이 수행하던 기능을 하나의 컷 안에서 다시 구성한다.
  // 사이 이음새는 컷 안이 되므로 사라진다. 다만 거기 적힌 '생략된 것'은
  // 이제 한 컷 안에서 일어나는 일이므로 내용으로 옮긴다 — 그냥 지우면
  // 기록해 둔 것이 조용히 사라진다.
  // `draft: true`면 합치기만 하고 그리지 않는다. Panels 단계의 이음새가
  // 이 길로 부른다 — 거기서는 합쳐진 컷이 **빈 패널**로 남고, 감독이 그
   // 카드 안에서 합쳐진 프롬프트를 확인·수정한 뒤 직접 `그리기`를 누른다
  // (삽입과 같은 규칙). 다른 자리(컷 플랜 표, GridView의 SeamEditor)는
  // 미리보기에서 이미 문장을 확정하고 들어오므로 곧바로 그린다.
  mergeCuts: (firstCutId, { content = null, draft = false } = {}) => {
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
      current
        .filter((shot) => shot.id !== secondShot?.id)
        // draft에서는 남은 패널의 그림도 비운다. 그 그림은 합치기 전 첫
        // 컷만 보여주므로 그대로 두면 새 content와 어긋나고, 무엇보다
        // 그림이 남아 있으면 빈 패널 편집칸이 열리지 않는다.
        //
        // `mergedDraft`로 표시해 둔다. 빈 패널 편집칸은 삽입에도 쓰이는데,
        // 합쳐서 빈 것을 `새 패널`이라 부르고 삽입용 제안을 물으면 감독이
        // 무엇을 보고 있는지 잘못 알게 된다.
        //
        // 합치기 전 두 문장도 함께 남긴다. 합치고 나면 원문은 사라지는데,
        // `겹치는 부분 지우기`는 그 둘을 봐야 무엇이 겹치는지 알 수 있다.
        .map((shot) => (
          draft && shot.id === firstShot?.id
            ? {
              ...shot,
              image: null,
              mergedDraft: {
                firstContent: first.content || '',
                firstPurpose: first.purpose || '',
                secondContent: second.content || '',
                secondPurpose: second.purpose || '',
                elision: seam?.elision || '',
                firstImage: firstShot?.image || null,
                secondImage: secondShot?.image || null,
              },
            }
            : shot
        ))
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

    // 병합은 텍스트 구조만 바꾸는 작업이 아니다. 앞 패널의 기존 그림은
    // 병합 전 첫 컷만 표현하므로 그대로 두면 새 content와 화면이 어긋난다.
    // 남은 앞 패널을 새로 조립된 프롬프트로 즉시 다시 그리게 한다.
    const panelDraftImages = { ...(state.panelDraftImages || {}) }
    if (firstShot) delete panelDraftImages[firstShot.id]
    if (secondShot) delete panelDraftImages[secondShot.id]

    return {
      ...next,
      cutPlan: nextCutPlan,
      seams: nextSeams,
      panelDraftImages,
      ...(firstShot && !draft ? {
        panelToolRequest: {
          id: `panel-tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          shotId: firstShot.id,
          tool: 'regenerate',
          reason: 'merge',
        },
      } : {}),
    }
  })
  },

  // 분할: 하나의 컷에 압축된 사건을 둘 이상의 단계로 나눈다.
  // 새로 생기는 이음새는 '컷 · 연속'이 기본이다 — 한 컷을 쪼갠 것이므로
  // 그 사이에 시간이 흐르지 않았다.
  // 한 컷을 두 컷으로 나눈다.
  //
  // `parts`가 없으면 감독이 직접 나누는 것이다 — 원본은 그대로 두고 빈 컷만
  // 뒤에 붙인다. 어디서 끊을지는 연출 판단이라 AI가 대신 정하지 않는다.
  //
  // `parts`가 있으면 편집 렌즈의 진단에서 온 것이다. 진단은 이미 무엇과
  // 무엇이 겹쳤는지 알고 있으므로 두 컷의 내용을 함께 받는다. 이때는 원본도
  // 앞 컷의 내용으로 줄여야 한다 — 원본이 통째로 남으면 나눈 것이 아니라
  // 뒤에 하나 더 붙인 것이 된다.
  // `draft: true`면 나누기만 하고 그리지 않는다. Panels 단계의 패널이 이
  // 길로 부른다 — 두 컷이 **빈 패널 둘**로 남고, 감독이 각 카드 안에서
  // 앞뒤로 보낼 문장을 나눈 뒤 직접 `그리기`를 누른다 (삽입·합치기와 같은
  // 규칙). 앞 칸에 원본을 그대로 두어 뒤로 보낼 부분을 잘라 옮기게 한다 —
  // 빈 칸 둘을 마주하면 무엇을 나누는 중인지 알 수 없다.
  splitCut: (cutId, { parts = null, draft = false } = {}) => {
    logEdit({ lens: 'editing', level: 'shot', target: cutId, action: 'split', source: 'seam' })
    return set((state) => {
    const index = state.cutPlan.findIndex((item) => item.id === cutId)
    if (index < 0) return {}
    const source = state.cutPlan[index]

    const second = createCutPlanItem({
      ...source,
      content: parts?.second?.content || '',
      purpose: parts?.second?.purpose || source.purpose,
      characters: parts?.second?.characters ?? source.characters,
      promptOverride: '',
      provenance: 'User',
    })

    const nextCutPlan = reorderCutPlan([
      ...state.cutPlan.slice(0, index).concat(
        // 나눈 안을 받았으면 원본도 앞 컷의 내용으로 줄인다. 프롬프트 덮어쓰기는
        // 옛 내용으로 쓴 것이라 함께 비운다.
        parts?.first?.content
          ? [{
            ...source,
            content: parts.first.content,
            purpose: parts.first.purpose || source.purpose,
            characters: parts.first.characters ?? source.characters,
            promptOverride: '',
            provenance: 'User',
          }]
          : [source],
      ),
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
        // 뒤 칸이다. `나눌 자리 찾기`는 두 칸을 한 번에 채우므로 버튼은
        // 앞 칸에만 둔다 — 같은 요청을 두 자리에 두면 어느 쪽을 눌러야
        // 하는지 묻게 되고, 답은 '아무 쪽이나'다.
        ...(draft ? { splitDraft: 'second' } : {}),
      })
      // draft에서는 앞 패널의 그림도 비운다. 그 그림은 나누기 전 한 컷을
      // 통째로 보여주므로 줄어든 내용과 어긋나고, 그림이 남아 있으면 빈
      // 패널 편집칸이 열리지 않는다. `splitDraft`로 표시해 두면 카드가
      // 삽입·합치기와 구분해 무엇을 하는 중인지 밝힐 수 있다.
      return draft
        ? copy.map((shot) => (
          shot.cutPlanItemId === cutId
            ? { ...shot, image: null, splitDraft: 'first' }
            : shot
        ))
        : copy
    })

    const branchShots = next.scenes?.[state.activeScene]?.branches?.[
      state.scenes[state.activeScene]?.activeBranch ?? 0
    ]?.shots || []
    const firstShot = branchShots.find((shot) => shot.cutPlanItemId === cutId)
    const secondShot = branchShots.find((shot) => shot.cutPlanItemId === second.id)

    // 이음새는 '앞 컷 id'로 걸린다. 원본 뒤에 컷이 하나 끼면 원본에 걸려
    // 있던 결정은 사실 '원본 → 그 다음 컷' 사이의 것이었으므로, 새 컷 뒤로
    // 옮겨야 한다. 옮기지 않으면 감독이 정해 둔 이음새가 엉뚱하게 나눈 두
    // 컷 사이에 붙는다 — 삽입(acceptCutInsert)과 같은 규칙이다.
    //
    // 나눈 두 컷 사이는 새 이음새이고 기본값('컷 · 연속')이라 적지 않는다.
    // 한 컷을 쪼갠 것이므로 시간이 이어지는 것이 맞다.
    const nextSeams = { ...state.seams }
    if (firstShot && secondShot && nextSeams[seamKeyFor(firstShot.id)]) {
      nextSeams[seamKeyFor(secondShot.id)] = nextSeams[seamKeyFor(firstShot.id)]
      delete nextSeams[seamKeyFor(firstShot.id)]
    }

    // 나눈 안을 받았으면 두 컷을 다 다시 그린다. 앞 컷은 내용이 줄었으므로
    // 옛 그림이 더는 그 컷을 담고 있지 않고, 뒤 컷은 그림이 아직 없다.
    // 앞 컷의 옛 그림은 줄어든 내용과 맞지 않는다. 남겨 두면 새 그림이 올
    // 때까지 감독이 옛 그림을 그 컷으로 읽는다.
    const panelDraftImages = { ...(state.panelDraftImages || {}) }
    if ((parts?.first?.content || draft) && firstShot) delete panelDraftImages[firstShot.id]
    return {
      ...next,
      cutPlan: nextCutPlan,
      seams: nextSeams,
      panelDraftImages,
      ...(parts?.first?.content && firstShot && !draft ? {
        panelToolRequest: {
          id: `panel-tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          // 두 컷을 순서대로 그린다. 앞 컷을 먼저 그려야 뒤 컷이 그것을
          // 이웃으로 물릴 수 있다.
          shotId: firstShot.id,
          shotIds: [firstShot.id, secondShot?.id].filter(Boolean),
          tool: 'regenerate',
          reason: 'split',
        },
      } : {}),
    }
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
  dismissCutPlan: () => set({ cutPlan: [], cutPlanAccepted: false, panelPreparationComplete: false, cutPlanSkipped: false }),
  // 대본으로 돌아가되 컷은 보존한다. 단계 이동은 작업을 지우지 않는다.
  backToScript: () => set({ cutPlanStageOverride: 'script' }),
  // 단계 이동으로 잠시 대본을 보고 있는 상태. 컷 자체와는 무관하다.
  cutPlanStageOverride: null,
  clearCutPlanStageOverride: () => set({ cutPlanStageOverride: null }),
  // 검토를 끝내고 스토리보드로 돌아갈 때 부른다. 검토 화면의 진단 라우팅은
  // 화면을 옮기려고 임시 상태를 남긴다 — 서사/대본 진단은 backToScript()로
  // `cutPlanStageOverride: 'script'`를 세우고, 그림 진단은 그리기 작업대를
  // 연다. 둘 다 되돌리는 지점이 없어서, 그대로 두면 컷을 이미 확정해 둔
  // 감독이 스토리보드로 돌아왔을 때 대본 단계로 떨어진다 (Panels 탭이
  // `컷 확정 후 열림`으로 잠긴 채로).
  //
  // 확정하지 않은 컷 플랜에는 손대지 않는다. 그때 대본을 보고 있는 것은
  // 감독이 스스로 고른 단계일 수 있다.
  leaveReview: () => set((state) => (
    state.cutPlanAccepted && state.cutPlanStageOverride
      ? { cutPlanStageOverride: null }
      : {}
  )),
  // 확정 = 컷 구성을 패널에 반영한다. 여기서 비로소 줄콘티가 패널의 근거가 된다.
  // 단, 패널로 바로 넘어가지 않고 선언 게이트를 먼저 거친다 (DG1 P3).
  // 게이트에는 초안 생성을 바꾸는 선언만 올라온다. 나머지는 패널로 넘어가
  // 그림을 보고 판정한다 (DG1 P4).
  acceptCutPlan: () => set((state) => {
    if (state.cutPlan.length === 0) {
      return { cutPlanAccepted: true, panelPreparationComplete: false, cutPlanSkipped: false, cutPlanStageOverride: null }
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
      panelPreparationComplete: false,
      cutPlanSkipped: false,
      cutPlanStageOverride: null,
      declarations: [...judged, ...proposed],
      // 그림이 있는데 컷과 매칭되지 않은 패널. 사용자에게 알리고 판단을 맡긴다.
      cutPlanOrphanedShots: orphaned,
    }
  }),
  cutPlanOrphanedShots: [],
  clearCutPlanOrphanWarning: () => set({ cutPlanOrphanedShots: [] }),

  completePanelPreparation: () => set({ panelPreparationComplete: true, cutPlanStageOverride: null }),
  reopenPanelPreparation: () => set({ panelPreparationComplete: false, cutPlanStageOverride: null }),

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

  // Decision Board에서 보낸 편집 제안은 실제 컷 조작이 끝난 뒤에만 완료로
  // 표시한다. 이음새 미리보기만 연 상태를 '적용됨'으로 오해하지 않는다.
  editingOperationCompletions: {},
  completeEditingOperation: (operationId, action) => set((state) => ({
    editingOperationCompletions: {
      ...state.editingOperationCompletions,
      [operationId]: action,
    },
  })),

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
  requestSeamFocus: (shotId, action = null, proposal = null) => set({
    // 진단 카드의 선택지를 이음새 편집창으로 함께 보낸다. 화면을 옮긴 뒤
    // '왜 여기서 나누거나 넣으려 했는지'를 다시 기억에 의존하지 않는다.
    seamFocusRequest: { id: `seam-focus-${Date.now()}`, shotId, action, proposal },
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
    return { cutPlan, cutPlanAccepted: false, panelPreparationComplete: false, cutPlanStageOverride: null }
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
  // 예시 대본으로 시작한 세션인가. 확정 뒤 자동 생성을 건너뛴다.
  autoDraftDisabled: false,
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
      narrativeCheck: null,
      narrativeCheckStale: false,
      activeBeat: 0,
      cast: DEMO_CAST,
      sceneStates,
      sceneStateStoryKey: screenplayFingerprint(script),
      cutPlan,
      // 확정은 감독이 한다. true로 두면 selectCutStage가 곧바로 'panels'로
      // 보내 컷 플랜 단계 자체가 화면에서 사라진다. 표는 이미 차 있으므로
      // 훑어보고 '확정'만 누르면 기다림 없이 패널로 넘어간다.
      cutPlanAccepted: false,
      // 컷을 미리 채워 두면 selectCutStage가 곧바로 'cutplan'을 가리켜
      // 대본 단계를 건너뛴다. 예시를 불러온 자리는 대본이므로 거기 머문다 —
      // '컷으로 나누기'를 누르면 override가 풀리고 이미 만들어 둔 표가
      // 그대로 열린다.
      cutPlanStageOverride: 'script',
      // 예시 대본에는 그림이 이미 붙어 있다. 확정을 누른 뒤 자동으로 나머지를
      // 그리기 시작하면, 개발·데모 중에 원치 않는 생성이 돈다 — 예시는 흐름을
      // 훑어보라고 있는 것이지 그림을 뽑으라고 있는 것이 아니다.
      //
      // 감독이 직접 `이어 그리기`를 누르면 그때는 그린다.
      autoDraftDisabled: true,
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
    // 감독이 자기 대본을 쓰면 예시 세션이 아니다. 자동 생성을 되살린다.
    return {
      ...next,
      screenplay: script,
      narrativeSuggestions: [],
      narrativeCheck: null,
      narrativeCheckStale: false,
      autoDraftDisabled: false,
    }
  }),
  // --- 대본 인라인 편집 -------------------------------------------------
  // 전체 텍스트를 다시 붙여넣지 않고 줄 단위로 고친다. beat는 보존한다.
  // setScreenplay와 달리 narrativeSuggestions를 지우지 않는다 —
  // 타이핑 한 번에 검토 중인 제안이 사라지면 안 되기 때문이다.
  updateScreenplayLine: (index, text) => set((state) => ({
    screenplay: state.screenplay.map((element, i) => (
      i === index ? { ...element, text } : element
    )),
    narrativeCheckStale: true,
  })),
  setScreenplayLineType: (index, type) => set((state) => ({
    screenplay: state.screenplay.map((element, i) => (
      i === index ? { ...element, type } : element
    )),
    narrativeCheckStale: true,
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
    return { screenplay: next, narrativeCheckStale: true }
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
      return { screenplay: next, narrativeCheckStale: true }
    }
    if (state.screenplay.length <= 1) return {}
    return {
      screenplay: state.screenplay.filter((_, i) => i !== index),
      narrativeCheckStale: true,
    }
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
  narrativeCheckStale: false,
  clearNarrativeCheck: () => set({
    narrativeCheck: null,
    narrativeCheckError: null,
    narrativeCheckStale: false,
  }),
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
    const checkedScriptKey = usingCuts ? null : screenplayFingerprint(state.screenplay)
    set({
      narrativeCheckPending: true,
      narrativeCheckError: null,
      narrativeCheck: null,
      narrativeCheckStale: false,
    })
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
      const checkedResult = usingCuts
        ? {
            ...result,
            findings: (result.findings || []).map((finding) => ({
              ...finding,
              checkedFingerprint: cutFindingFingerprint(state.cutPlan, finding.cutIds),
            })),
          }
        : result
      set((current) => ({
        narrativeCheck: { ...checkedResult, stage },
        narrativeCheckPending: false,
        narrativeCheckStale: !usingCuts
          && screenplayFingerprint(current.screenplay) !== checkedScriptKey,
      }))
    } catch (error) {
      // 점검은 실패해도 작업이 멈추면 안 된다. mock으로 채우지도 않는다 —
      // 서사가 짚지 않은 것을 짚은 것처럼 보이면 판단이 오염된다.
      set({ narrativeCheckPending: false, narrativeCheckError: error.message })
    }
  },
  cameraCheck: null,
  cameraCheckPending: false,
  cameraCheckError: null,
  requestCameraCheck: async () => {
    const state = get()
    if (state.cameraCheckPending || state.cutPlan.length === 0) return
    set({ cameraCheckPending: true, cameraCheckError: null, cameraCheck: null })
    try {
      const { checkNarrative } = await import('../services/api.js')
      logScaffold({ feature: 'lens', action: 'open', lens: 'camera', stage: 'cutplan' })
      const result = await checkNarrative({
        cuts: state.cutPlan,
        sceneIntention: state.sceneIntention || '',
        script: state.screenplay.map((element) => element.text).join('\n'),
        lens: 'camera',
      })
      set({
        cameraCheck: {
          ...result,
          findings: (result.findings || []).map((finding) => ({
            ...finding,
            checkedFingerprint: cutFindingFingerprint(state.cutPlan, finding.cutIds),
          })),
        },
        cameraCheckPending: false,
      })
    } catch (error) {
      set({ cameraCheckPending: false, cameraCheckError: error.message })
    }
  },
  miseCheck: null,
  miseCheckPending: false,
  miseCheckError: null,
  requestMiseCheck: async () => {
    const state = get()
    if (state.miseCheckPending || state.cutPlan.length === 0) return
    set({ miseCheckPending: true, miseCheckError: null, miseCheck: null })
    try {
      const { checkNarrative } = await import('../services/api.js')
      logScaffold({ feature: 'lens', action: 'open', lens: 'mise', stage: 'cutplan' })
      const result = await checkNarrative({
        cuts: state.cutPlan,
        sceneIntention: state.sceneIntention || '',
        script: state.screenplay.map((element) => element.text).join('\n'),
        lens: 'mise',
      })
      set({
        miseCheck: {
          ...result,
          findings: (result.findings || []).map((finding) => ({
            ...finding,
            checkedFingerprint: cutFindingFingerprint(state.cutPlan, finding.cutIds),
          })),
        },
        miseCheckPending: false,
      })
    } catch (error) {
      set({ miseCheckPending: false, miseCheckError: error.message })
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
      // 기본 대상은 Beat 하나가 아니라 해당 Scene 전체다. 헤딩부터 다음
      // 헤딩 전까지만 넘겨 다른 Scene을 고치라는 제안이 섞이지 않게 한다.
      const screenplayWithIndex = state.screenplay
        .map((element, globalIdx) => ({ ...element, globalIdx }))
      const sceneGroups = []
      let sceneGroupInProgress = null
      screenplayWithIndex.forEach((element) => {
        if (element.type === 'scene-heading' || !sceneGroupInProgress) {
          sceneGroupInProgress = {
            title: element.type === 'scene-heading' ? element.text : '',
            elements: [],
          }
          sceneGroups.push(sceneGroupInProgress)
        }
        if (element.type !== 'scene-heading') sceneGroupInProgress.elements.push(element)
      })
      const currentSceneGroup = sceneGroups.find((group) => (
        group.elements.some((element) => (element.beat ?? 0) === targetBeat)
      )) || sceneGroups[0] || { title: '', elements: [] }
      const withIndex = currentSceneGroup.elements
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
        sceneTitle: currentSceneGroup.title,
        scope: 'scene',
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
      narrativeCheck: null,
      narrativeCheckStale: false,
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
        label: `Moment ${insertAt + 1} Shot 1`,
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
      narrativeCheckStale: true,
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
        label: `Moment ${insertAt + 1} Shot 1`,
      }))
      return { shots: movedShots, activeShot: insertShotAt, activeBeat: insertAt }
    })

    return {
      ...next,
      screenplay: newScreenplay,
      narrativeSuggestions: [],
      narrativeCheckStale: true,
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
      narrativeCheckStale: true,
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
  // 예시 그림이 든 전략은 초기값에 두지 않는다. DrawingCanvas가 패널에
  // 그림이 없으면 여기로 떨어지므로, 두면 빈 패널을 열었을 때 남의 그림이
  // 캔버스에 올라온다. 예시는 loadExampleScreenplay에서만 붙인다.
  strategies: [],
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
  // 빈 상태에서 시작한다. 예시 그림을 초기값에 두면 감독이 자기 대본을
  // 써도 그 그림이 남는다 — `applyCutPlanToShots`의 `findDrawnInBeat`가
  // 그림이 있는 패널을 beat로 물려받으므로, 남의 컷에 붙어 버린다.
  //
  // 예시 그림은 `loadExampleScreenplay`에서만 붙인다. 예시를 부르는 것은
  // 감독이 명시적으로 고른 일이다.
  scenes: [
    {
      id: 'scene-1',
      label: 'Scene 1',
      activeBranch: 0,
      activeShot: 0,
      branches: [
        {
          id: 'branch-main',
          label: 'Main',
          isMain: true,
          branchPoint: 0,
          rationale: '',
          shots: [],
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
        label: `Moment ${beat + 1} Shot ${sameBeatIndices.length + 1}`,
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
  // Viewer에서 발견한 읽기를 작업 화면까지 들고 간다. 이동 후에도 어떤
  // 패널의 어떤 근거 때문에 왔는지 잃지 않게 하는 짧은 handoff다.
  viewerFindingHandoff: null,
  setViewerFindingHandoff: (finding) => set({ viewerFindingHandoff: finding }),
  clearViewerFindingHandoff: () => set({ viewerFindingHandoff: null }),
  // Viewer의 읽기와 제작자 판단을 분리해 둔다. Viewer를 닫거나 다시
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
  // 패널 생성은 StoryboardView에서 실행되지만 결과를 기다리는 동안에는
  // Decision Board의 같은 패널에도 상태가 보여야 한다. shotId별 문구를
  // 공유해 병합 재생성인지 일반 생성인지도 구분한다.
  panelGenerationPending: {},
  setPanelGenerationPending: (next) => set((state) => ({
    panelGenerationPending: typeof next === 'function'
      ? next(state.panelGenerationPending)
      : next,
  })),
  // 같은 컷을 다시 생성해도 이미지가 도착했다는 사실을 구분한다. 이미지
  // 문자열만 보면 이전 초안이 남아 있을 때 완료 상태를 잘못 띄울 수 있다.
  panelDraftVersions: {},
  setPanelDraftImage: (shotId, image) => set((state) => ({
    panelDraftImages: { ...state.panelDraftImages, [shotId]: image },
    panelDraftVersions: {
      ...state.panelDraftVersions,
      [shotId]: (state.panelDraftVersions[shotId] || 0) + 1,
    },
  })),
  clearPanelDraftImage: (shotId) => set((state) => {
    const panelDraftImages = { ...state.panelDraftImages }
    delete panelDraftImages[shotId]
    return { panelDraftImages }
  }),

  // 검토 화면에서 제안을 적용해 다시 그린 것. 감독이 받을지 버릴지 정할
  // 때까지 원래 값을 들고 있는다.
  //
  // 적용하는 순간 확정되면 감독은 결과를 보기 전에 이미 바꾼 상태가 된다.
  // 마음에 안 들어도 어떤 값이었는지 기억해서 손으로 되돌려야 한다 —
  // 발견과 처분을 나누려면 처분에 되돌릴 길이 있어야 한다.
  panelRevisionPending: null,
  beginPanelRevision: (shotId, cutId, before) => set({
    panelRevisionPending: { shotId, cutId, before },
  }),
  // 받는다. 초안을 패널의 그림으로 굳힌다.
  acceptPanelRevision: () => set((state) => {
    const pending = state.panelRevisionPending
    if (!pending) return { panelRevisionPending: null }
    const image = state.panelDraftImages[pending.shotId]
    if (!image) return { panelRevisionPending: null }
    const panelDraftImages = { ...state.panelDraftImages }
    delete panelDraftImages[pending.shotId]
    return {
      ...updateActiveBranchShots(state, (shots) => shots.map((shot) => (
        shot.id === pending.shotId
          ? { ...shot, image, source: 'ai', isAIGenerated: true }
          : shot
      ))),
      panelDraftImages,
      panelRevisionPending: null,
    }
  }),
  // 버린다. 컷 값도 적용 전으로 되돌린다 — 그림만 버리고 값이 남으면
  // 표는 바뀐 채로 그림만 옛것이 되어 둘이 어긋난다.
  rejectPanelRevision: () => set((state) => {
    const pending = state.panelRevisionPending
    if (!pending) return { panelRevisionPending: null }
    const panelDraftImages = { ...state.panelDraftImages }
    delete panelDraftImages[pending.shotId]
    return {
      cutPlan: state.cutPlan.map((item) => (
        item.id === pending.cutId ? { ...item, ...pending.before } : item
      )),
      panelDraftImages,
      panelRevisionPending: null,
    }
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
