import { create } from 'zustand'

// Screenplay data
const SCREENPLAY = [
  { type: 'scene-heading', text: 'INT. 지하철 관제실 - 밤', beat: 0 },
  { type: 'action', text: '좁고 낡은 지하 관제실. 형광등이 낮게 웅웅거리고, 콘크리트 벽 너머 어딘가에서 빗물이 떨어지는 소리가 들린다. 벽면 가득한 모니터에는 텅 빈 승강장과 깜빡이는 터널 화면이 비친다.', beat: 0 },
  { type: 'action', text: '재인, 20대 후반. 비를 흠뻑 맞은 채 안으로 미끄러지듯 들어와 조용히 철문을 닫는다. 손에는 훔쳐 온 출입카드가 쥐어져 있다.', beat: 0 },
  { type: 'action', text: '관제실 반대편 끝. 지친 눈빛의 역무 총괄 민호, 40대 초반, 혼자 콘솔 앞에 앉아 있다. 그는 뒤돌아보지 않는다.', beat: 0 },
  { type: 'character', text: '민호', beat: 1 },
  { type: 'dialogue', text: '생각보다 오래 걸렸네.', beat: 1 },
  { type: 'action', text: '재인이 얼어붙는다.', beat: 1 },
  { type: 'character', text: '재인', beat: 1 },
  { type: 'dialogue', text: '아무도 안 따라왔는지 확인해야 했어요.', beat: 1 },
  { type: 'action', text: '민호가 천천히 의자를 돌린다. 얼굴은 차분하지만 오른손은 책상 아래 감춰져 있다.', beat: 2 },
  { type: 'character', text: '민호', beat: 2 },
  { type: 'dialogue', text: '가져오긴 했어?', beat: 2 },
  { type: 'action', text: '재인은 출입카드를 살짝 들어 보이지만 가까이 다가가진 않는다.', beat: 2 },
  { type: 'character', text: '재인', beat: 2 },
  { type: 'dialogue', text: '먼저 카메라부터 꺼요.', beat: 2 },
  { type: 'action', text: '민호가 모니터 벽을 흘끗 본다. 한 화면엔 어두운 승강장, 다른 화면엔 터널 안에 멈춰 선 열차가 보인다.', beat: 3 },
  { type: 'character', text: '민호', beat: 3 },
  { type: 'dialogue', text: '그 카드 하나가 널 지켜줄 거라고 생각해?', beat: 3 },
  { type: 'character', text: '재인', beat: 3 },
  { type: 'dialogue', text: '아니요.', beat: 3 },
  { type: 'parenthetical', text: '(한 박자)', beat: 3 },
  { type: 'dialogue', text: '딱 10초는 벌어주겠죠.', beat: 3 },
  { type: 'action', text: '터널 너머로 열차 경적이 낮게 울린다. 형광등이 한 번 깜빡인다.', beat: 4 },
  { type: 'action', text: '민호가 일어선다. 의자가 뒤로 밀려나며 그림자 속으로 미끄러진다. 그제야 감춰져 있던 오른손이 드러난다. 손에는 빨간 버튼 하나가 달린 작은 검은 리모컨이 들려 있다.', beat: 4 },
  { type: 'character', text: '민호', beat: 4 },
  { type: 'dialogue', text: '그럼 그 10초, 잘 써.', beat: 4 },
  { type: 'action', text: '재인의 시선이 리모컨에서 모니터로, 다시 콘솔 옆 잠긴 철제 캐비닛으로 옮겨간다.', beat: 4 },
  { type: 'character', text: '재인', beat: 4 },
  { type: 'dialogue', text: '그걸 누르면 승강장 사람들 다 죽어요.', beat: 4 },
  { type: 'character', text: '민호', beat: 4 },
  { type: 'dialogue', text: '안 누르면 그 사람들이 여기까지 내려오지.', beat: 4 },
  { type: 'action', text: '그가 한 걸음 다가온다. 재인은 출입문 쪽으로 한 걸음 물러난다. 출구와 방 사이에 끼인 채 갇힌다.', beat: 4 },
  { type: 'action', text: '빗물 떨어지는 소리. 모니터 하나가 지직거리며 튄다. 한 화면에 노란 우비를 입은 어린아이가 홀로 승강장에 서 있다.', beat: 5 },
  { type: 'character', text: '재인', beat: 5 },
  { type: 'dialogue', text: '아직 늦지 않았어요.', beat: 5 },
  { type: 'character', text: '민호', beat: 5 },
  { type: 'action', text: '재인이 침을 삼킨다. 손에 쥔 카드에 힘이 들어간다.', beat: 6 },
  { type: 'action', text: '그리고 그녀는 카드를 민호에게 던지지 않는다. 방 한가운데, 콘솔 아래쪽으로 던진다.', beat: 6 },
  { type: 'action', text: '카드는 바닥을 미끄러져 콘솔 밑으로 들어간다.', beat: 6 },
  { type: 'action', text: '민호의 시선이 순간 그쪽으로 쏠린다.', beat: 6 },
  { type: 'action', text: '그 짧은 틈이면 충분하다.', beat: 6 },
  { type: 'action', text: '재인이 리모컨을 향해 몸을 던진다.', beat: 6 },
  { type: 'transition', text: 'CUT TO BLACK.', beat: 6 },
]

// Dummy strategy data with image paths and spatial coordinates
const DEMO_STRATEGIES = [
  {
    id: 'A',
    name: 'Slow Burn Tension',
    shots: [
      { order: 1, beat: 0, image: null, x: 450, y: 700, angle: -90, intent: 'ESTABLISH SPACE', cir: { shotSize: 'Wide', relation: 'Master' } },
      { order: 2, beat: 1, image: null, x: 200, y: 450, angle: -30, intent: 'SUBJECTIVE PRESSURE', cir: { shotSize: 'Medium', relation: 'OTS' } },
      { order: 3, beat: 2, image: null, x: 500, y: 250, angle: 90, intent: 'REACTION EMPHASIS', cir: { shotSize: 'Close-Up', relation: 'Single' } },
      { order: 4, beat: 3, image: null, x: 750, y: 450, angle: -150, intent: 'ISOLATION / VULNERABILITY', cir: { shotSize: 'Medium Close', relation: 'Single' } },
      { order: 5, beat: 4, image: null, x: 350, y: 350, angle: 0, intent: 'RELATIONSHIP RESET', cir: { shotSize: 'Medium', relation: 'Two-shot' } },
      { order: 6, beat: 5, image: null, x: 450, y: 800, angle: -90, intent: 'CLIMATIC BEAT', cir: { shotSize: 'ECU', relation: 'Single' } },
      { order: 7, beat: 6, image: null, x: 450, y: 900, angle: -90, intent: 'CLIMATIC BEAT', cir: { shotSize: 'ECU', relation: 'Single' } },
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

const createMockScriptSuggestion = ({ beatElements, targetBeat, requestKey, sceneIntention, narrativeRequest }) => {
  const normalizedRequest = narrativeRequest.trim()
  const normalizedIntention = sceneIntention.trim()
  const dialogue = beatElements.find((element) => element.type === 'dialogue')
  const wantsDialogueChange = includesAny(normalizedRequest, ['대사', '말', '설명', '짧게', '축약'])

  if (dialogue && wantsDialogueChange) {
    const hidesInformation = includesAny(`${normalizedIntention} ${normalizedRequest}`, ['숨', '불안', '위험', '긴장', '모호'])
    return {
      id: `narrative-${requestKey}-replace-${targetBeat}-${dialogue.globalIdx}`,
      type: 'replace-script-line',
      beat: targetBeat,
      elementIndex: dialogue.globalIdx,
      title: '이 대사를 덜 설명적으로 바꿔볼까요?',
      reason: normalizedRequest,
      originalText: dialogue.text,
      proposedText: hidesInformation ? '그걸 정말 말해야 알아요?' : '그래서, 다음은요?',
      actionLabel: 'Replace line',
      sceneIntention: normalizedIntention,
    }
  }

  const anchor = [...beatElements].reverse().find((element) => element.type !== 'transition') || beatElements[0]
  const character = beatElements.find((element) => element.type === 'character')
  const characterName = character?.text || '인물'
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

// 줄글로 들어온 이야기를 대본 형식으로 세운다. 한 줄의 서술에서 지문과
// 대사를 분리해 제안한다. 원문을 덮어쓰지 않고 줄 단위로 수락받는다.
// 실제 Narrative LLM 호출로 교체될 자리다.
const createMockScreenplaySuggestions = (state, requestKey) => {
  const withIdx = state.screenplay.map((element, globalIdx) => ({ ...element, globalIdx }))
  const suggestions = []

  withIdx.forEach((element) => {
    if (suggestions.length >= 2) return
    if (element.type !== 'action') return

    const text = element.text
    // 대사가 오갈 만한 서술인지 본다.
    const impliesDialogue = includesAny(text, ['대치', '말', '기다리', '묻', '설득', '협상'])
    // 이미 대본 형식이면 건드리지 않는다.
    const alreadyScripted = text.length < 30

    if (alreadyScripted) return

    const names = ['재인', '민호'].filter((name) => text.includes(name))
    const speaker = names[names.length - 1] || '인물'
    const subject = names[0] || '인물'
    // 받침 유무에 따라 조사를 고른다. '민호이 멈춰 선다' 같은 문장을 막는다.
    const hasFinalConsonant = (word) => {
      const last = word.charCodeAt(word.length - 1)
      if (last < 0xac00 || last > 0xd7a3) return false
      return (last - 0xac00) % 28 !== 0
    }
    const subjectParticle = hasFinalConsonant(subject) ? '이' : '가'

    suggestions.push({
      id: `screenplay-${requestKey}-${element.globalIdx}`,
      type: 'expand-to-screenplay',
      beat: element.beat ?? 0,
      elementIndex: element.globalIdx,
      title: impliesDialogue
        ? '이 부분을 지문과 대사로 풀어볼까요?'
        : '이 서술을 장면 지문으로 다듬어볼까요?',
      reason: `“${shortenNarrativeText(text, 40)}”은 아직 줄거리 설명에 가깝습니다. 화면에 보이는 것으로 바꾸면 이후 컷을 나누기 쉬워집니다.`,
      originalText: text,
      // 지문 한 줄 + 대사 한 쌍으로 세운다.
      proposedElements: impliesDialogue
        ? [
          { type: 'action', text: `${subject}${subjectParticle} 멈춰 선다. 두 사람 사이의 거리가 좁혀지지 않는다.` },
          { type: 'character', text: speaker },
          { type: 'dialogue', text: '생각보다 오래 걸렸네.' },
        ]
        : [
          // 원문을 자르지 않는다. 잘라 붙이면 문장이 깨진다.
          { type: 'action', text: `${subject}${subjectParticle} 움직인다. 그 행동이 화면 안에서 분명히 보인다.` },
        ],
      actionLabel: 'Apply lines',
    })
  })

  return suggestions
}

// 거친 메모로 들어온 대본은 전부 beat 0이다. 국면이 바뀌는 지점을 찾아
// Beat 경계를 제안한다. 사용자가 무엇을 물어야 할지 몰라도 다음 단계가
// 보이도록, 요청 문구 없이 호출할 수 있게 둔다.
const createMockBeatSplitSuggestions = (state, requestKey) => {
  const withIdx = state.screenplay.map((element, globalIdx) => ({ ...element, globalIdx }))
  const beatCount = new Set(withIdx.map((element) => element.beat ?? 0)).size

  // 이미 나뉘어 있으면 더 쪼개자고 하지 않는다.
  if (beatCount > 1 || withIdx.length < 4) return []

  const suggestions = []
  // 국면 전환의 단서: 인물이 새로 말하기 시작하는 지점, 전환 지시.
  withIdx.forEach((element, index) => {
    if (index === 0 || suggestions.length >= 3) return
    const prev = withIdx[index - 1]
    const startsDialogue = element.type === 'character' && prev.type === 'action'
    const isTransition = element.type === 'transition'
    const backToAction = element.type === 'action'
      && (prev.type === 'dialogue' || prev.type === 'parenthetical')

    if (!startsDialogue && !isTransition && !backToAction) return

    suggestions.push({
      id: `beat-split-${requestKey}-${element.globalIdx}`,
      type: 'split-beat',
      beat: 0,
      elementIndex: element.globalIdx,
      title: '여기서 Beat를 나눠볼까요?',
      reason: startsDialogue
        ? `“${shortenNarrativeText(prev.text)}” 이후 대화가 시작되면서 국면이 바뀝니다.`
        : isTransition
          ? '전환 지시에서 장면의 국면이 끊깁니다.'
          : `대사 이후 “${shortenNarrativeText(element.text)}”에서 행동으로 국면이 옮겨갑니다.`,
      actionLabel: 'Split Beat',
    })
  })

  return suggestions
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

const createCutPlanItemId = () => `cut-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const createCutPlanItem = ({
  order = 1,
  beat = 0,
  content = '',
  reveals = '',
  purpose = '',
  shotSize = 'Medium',
  cameraMovement = 'Fixed',
  status = 'Tentative',
  provenance = 'AI',
} = {}) => ({
  id: createCutPlanItemId(),
  order,
  beat,
  content,
  reveals,
  purpose,
  shotSize,
  cameraMovement,
  status,
  provenance,
})

// Beat의 대본 요소를 읽어 줄콘티 초안을 만드는 Mock.
// 실제 Narrative LLM 호출로 교체될 자리다.
const createMockCutPlan = (state) => {
  const withIdx = state.screenplay.map((element, globalIdx) => ({ ...element, globalIdx }))
  const beats = [...new Set(withIdx.map((element) => element.beat ?? 0))].sort((a, b) => a - b)
  const items = []

  beats.forEach((beat) => {
    const beatElements = withIdx.filter((element) => (element.beat ?? 0) === beat)
    const actions = beatElements.filter((element) => element.type === 'action')
    const dialogues = beatElements.filter((element) => element.type === 'dialogue')
    const heading = beatElements.find((element) => element.type === 'scene-heading')
    const speakers = [...new Set(beatElements
      .filter((element) => element.type === 'character')
      .map((element) => element.text))]

    // 공간을 세우는 컷: scene heading이 있는 Beat에서만.
    if (heading) {
      items.push(createCutPlanItem({
        order: items.length + 1,
        beat,
        content: shortenNarrativeText(actions[0]?.text || heading.text, 70),
        reveals: '장소와 상황',
        purpose: '공간 설정',
        shotSize: 'Wide',
        cameraMovement: 'Fixed',
      }))
    }

    // 대사가 오가는 Beat: 화자 수만큼 컷을 나눈다.
    if (dialogues.length > 0) {
      const speakerCount = Math.max(1, Math.min(speakers.length, 2))
      for (let i = 0; i < speakerCount; i += 1) {
        items.push(createCutPlanItem({
          order: items.length + 1,
          beat,
          content: `${speakers[i] || '인물'}: ${shortenNarrativeText(dialogues[i]?.text || dialogues[0].text, 50)}`,
          reveals: i === 0 ? '대사가 전달하는 정보' : '상대의 반응',
          purpose: i === 0 ? '발화' : '리액션',
          shotSize: 'Bust',
          cameraMovement: 'Fixed',
        }))
      }
    }

    // 대사 없이 행동만 있는 Beat.
    if (dialogues.length === 0 && !heading && actions.length > 0) {
      items.push(createCutPlanItem({
        order: items.length + 1,
        beat,
        content: shortenNarrativeText(actions[actions.length - 1].text, 70),
        reveals: '행동의 결과',
        purpose: '행동 강조',
        shotSize: actions.length > 2 ? 'Close-Up' : 'Medium',
        cameraMovement: 'Fixed',
      }))
    }
  })

  return items
}

const reorderCutPlan = (items) => items.map((item, index) => ({ ...item, order: index + 1 }))

// 현재 단계를 상태에서 파생시킨다. 여러 컴포넌트가 같은 기준을 쓰도록
// 이 함수를 selector로 공유한다.
//   script  → 대본만
//   cutplan → 컷 리스트만
//   panels  → 대본 + 패널
export const selectCutStage = (state) => {
  if (state.cutPlanStageOverride) return state.cutPlanStageOverride
  if (state.cutPlanAccepted) return 'panels'
  return state.cutPlan.length > 0 ? 'cutplan' : 'script'
}

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

// 초보 창작자가 실제로 주는 것은 대본이 아니라 줄글로 된 이야기다.
// 대사도 인물 구분도 없고, 전체 흐름만 뭉뚱그려 적혀 있다.
// 이 상태에서 "대본으로 만들기 → Beat 나누기 → 다듬기"가 왜 필요한지 드러난다.
const ROUGH_SCREENPLAY = [
  { type: 'action', text: '밤에 지하철 관제실에 재인이라는 애가 몰래 들어감. 카드를 훔쳐왔음.', beat: 0 },
  { type: 'action', text: '근데 민호가 이미 알고 기다리고 있었음. 둘이 대치함.', beat: 0 },
  { type: 'action', text: '민호는 리모컨 같은 걸 들고 있는데 그거 누르면 승강장 사람들이 위험해지는 상황.', beat: 0 },
  { type: 'action', text: '재인이 카드를 바닥에 던져서 민호 시선을 돌린 다음 달려듦.', beat: 0 },
]

const useStore = create((set, get) => ({
  viewMode: 'script',
  setViewMode: (mode) => set({ viewMode: mode }),
  // 줄콘티 상태. draft는 검토 중인 제안, accepted는 확정 여부.
  cutPlan: [],
  cutPlanAccepted: false,
  cutPlanRequestKey: 0,
  cutPlanShotSizes: CUT_PLAN_SHOT_SIZES,
  requestCutPlan: () => set((state) => ({
    cutPlan: createMockCutPlan(state),
    cutPlanAccepted: false,
    cutPlanSkipped: false,
    cutPlanStageOverride: null,
    cutPlanRequestKey: state.cutPlanRequestKey + 1,
  })),
  updateCutPlanItem: (itemId, patch) => set((state) => ({
    cutPlan: state.cutPlan.map((item) => (
      // 사용자가 직접 만진 값은 출처가 User로 바뀐다.
      item.id === itemId ? { ...item, ...patch, provenance: 'User' } : item
    )),
  })),
  setCutPlanItemStatus: (itemId, status) => set((state) => ({
    // 상태 전환은 출처를 바꾸지 않는다 (Spec §8.2).
    cutPlan: state.cutPlan.map((item) => (
      item.id === itemId ? { ...item, status } : item
    )),
  })),
  addCutPlanItem: (afterItemId = null, beat = 0) => set((state) => {
    const next = [...state.cutPlan]
    const index = afterItemId
      ? next.findIndex((item) => item.id === afterItemId)
      : next.length - 1
    const anchorBeat = index >= 0 ? next[index].beat : beat
    next.splice(index + 1, 0, createCutPlanItem({
      beat: anchorBeat,
      content: '',
      purpose: '',
      provenance: 'User',
    }))
    return { cutPlan: reorderCutPlan(next) }
  }),
  removeCutPlanItem: (itemId) => set((state) => ({
    cutPlan: reorderCutPlan(state.cutPlan.filter((item) => item.id !== itemId)),
  })),
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

    return {
      ...next,
      cutPlanAccepted: true,
      cutPlanSkipped: false,
      cutPlanStageOverride: null,
      // 그림이 있는데 컷과 매칭되지 않은 패널. 사용자에게 알리고 판단을 맡긴다.
      cutPlanOrphanedShots: orphaned,
    }
  }),
  cutPlanOrphanedShots: [],
  clearCutPlanOrphanWarning: () => set({ cutPlanOrphanedShots: [] }),
  // 줄콘티를 다시 열어 수정한다. accept를 되돌리되 컷 자체는 지우지 않는다.
  reopenCutPlan: () => set({ cutPlanAccepted: false, cutPlanStageOverride: null }),
  // 건너뛰기는 막지 않되 기록한다. 자동 생성된 컷은 전부 Tentative로 남아
  // "검토되지 않은 채 넘어간 컷 분해"가 나중에 드러난다.
  cutPlanSkipped: false,
  skipCutPlan: () => set((state) => ({
    cutPlan: state.cutPlan.length > 0 ? state.cutPlan : createMockCutPlan(state),
    cutPlanAccepted: true,
    cutPlanSkipped: true,
    cutPlanStageOverride: null,
  })),
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
  loadExampleScreenplay: (variant = 'rough') => set((state) => {
    const script = variant === 'formatted' ? SCREENPLAY : ROUGH_SCREENPLAY
    const maxBeat = Math.max(0, ...script.map((line) => line.beat ?? 0))
    const next = updateActiveBranchShots(state, (shots) => shots.map((shot) => ({
      ...shot,
      scriptBeat: Math.max(0, Math.min(shot.scriptBeat ?? 0, maxBeat)),
    })))
    return { ...next, screenplay: script, narrativeSuggestions: [], activeBeat: 0 }
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
  insertScreenplayLine: (afterIndex, type = 'action') => set((state) => {
    const next = [...state.screenplay]
    const anchor = next[afterIndex]
    next.splice(afterIndex + 1, 0, {
      type,
      text: '',
      beat: anchor?.beat ?? 0,
    })
    return { screenplay: next }
  }),
  removeScreenplayLine: (index) => set((state) => {
    if (state.screenplay.length <= 1) return {}
    return { screenplay: state.screenplay.filter((_, i) => i !== index) }
  }),
  scriptEditorRequestKey: 0,
  requestScriptEditor: () => set((state) => ({ scriptEditorRequestKey: state.scriptEditorRequestKey + 1 })),
  narrativeSuggestionRequestKey: 0,
  narrativeSuggestions: [],
  requestNarrativeSuggestions: (input = {}) => set((state) => {
    const requestKey = state.narrativeSuggestionRequestKey + 1
    return {
      narrativeSuggestionRequestKey: requestKey,
      narrativeSuggestions: createMockNarrativeSuggestions(state, requestKey, input),
    }
  }),
  // 줄글을 대본 형식으로 세우는 제안. 요청 문구 없이 호출한다.
  requestScreenplayFormatting: () => set((state) => {
    const requestKey = state.narrativeSuggestionRequestKey + 1
    return {
      narrativeSuggestionRequestKey: requestKey,
      narrativeSuggestions: createMockScreenplaySuggestions(state, requestKey),
    }
  }),
  // 한 줄을 여러 줄(지문 + 대사)로 교체한다. beat는 원래 줄의 것을 물려준다.
  expandScreenplayLine: (elementIndex, newElements) => set((state) => {
    const target = state.screenplay[elementIndex]
    if (!target) return {}
    const beat = target.beat ?? 0
    const next = [...state.screenplay]
    next.splice(elementIndex, 1, ...newElements.map((element) => ({ ...element, beat })))
    return { screenplay: next }
  }),
  // 요청 문구 없이 Beat 경계만 제안한다.
  requestBeatSplit: () => set((state) => {
    const requestKey = state.narrativeSuggestionRequestKey + 1
    return {
      narrativeSuggestionRequestKey: requestKey,
      narrativeSuggestions: createMockBeatSplitSuggestions(state, requestKey),
    }
  }),
  dismissNarrativeSuggestion: (suggestionId) => set((state) => ({
    narrativeSuggestions: state.narrativeSuggestions.filter((suggestion) => suggestion.id !== suggestionId),
  })),
  
  // 비트 나누기: 특정 지점에서 대본을 자르고 새 beat에 기본 shot을 하나 만든다.
  splitBeat: (elementIndex) => set((state) => {
    const newScreenplay = [...state.screenplay]
    if (elementIndex <= 0 || elementIndex >= newScreenplay.length) return state
    
    // 1. 해당 지점부터 끝까지 일단 비트 번호 증가
    for (let i = elementIndex; i < newScreenplay.length; i++) {
      newScreenplay[i].beat = (newScreenplay[i].beat || 0) + 1
    }

    // 2. 비트 번호 순차 재정렬 (0, 1, 2... 빈 틈 없게)
    let currentNewBeat = 0
    let lastOldBeat = newScreenplay[0].beat
    newScreenplay[0].beat = 0
    for (let i = 1; i < newScreenplay.length; i++) {
      if (newScreenplay[i].beat !== lastOldBeat) {
        currentNewBeat++
        lastOldBeat = newScreenplay[i].beat
      }
      newScreenplay[i].beat = currentNewBeat
    }

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

  // 비트 합치기: 현재 비트를 이전 비트와 병합한다. Shot은 삭제하지 않고 target beat로 귀속시킨다.
  mergeBeat: (elementIndex) => set((state) => {
    if (elementIndex === 0) return state
    const newScreenplay = [...state.screenplay]
    
    // 1. 삭제될 샷의 인덱스 파악 (현재 요소의 비트 번호)
    const deleteIdx = newScreenplay[elementIndex].beat
    const targetBeat = newScreenplay[elementIndex - 1].beat

    // 2. 비트 병합
    const currentBeat = newScreenplay[elementIndex].beat
    for (let i = elementIndex; i < newScreenplay.length; i++) {
      if (newScreenplay[i].beat === currentBeat) {
        newScreenplay[i].beat = targetBeat
      }
    }

    // 3. 비트 번호 순차 재정렬
    let currentNewBeat = 0
    let lastOldBeat = newScreenplay[0].beat
    newScreenplay[0].beat = 0
    for (let i = 1; i < newScreenplay.length; i++) {
      if (newScreenplay[i].beat !== lastOldBeat) {
        currentNewBeat++
        lastOldBeat = newScreenplay[i].beat
      }
      newScreenplay[i].beat = currentNewBeat
    }

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
      label: 'Gas Station',
      activeBranch: 0,
      activeShot: 0,
      branches: [
        {
          id: 'branch-main',
          label: 'Slow Burn Tension',
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
      label: 'Desert Motel',
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
            { id: 'shot-s2-0', image: null, cir: {}, label: 'Arrival', scriptBeat: 0, isAIGenerated: false, source: 'canvas' },
            { id: 'shot-s2-1', image: null, cir: {}, label: 'Entering Room', scriptBeat: 1, isAIGenerated: false, source: 'canvas' },
            { id: 'shot-s2-2', image: null, cir: {}, label: 'Suspicion', scriptBeat: 2, isAIGenerated: false, source: 'canvas' },
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
  maximizedPanel: 'left', // Storyboard construction is the default entry view.
  setMaximizedPanel: (panel) => set({ maximizedPanel: panel }),
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
  openDrawingWorkspace: () => set({
    drawingWorkspaceOpen: true,
    selectedStoryboardShotIds: [],
    maximizedPanel: null,
    centerTab: 'canvas',
    zenMode: false,
  }),
  closeDrawingWorkspace: () => set({
    drawingWorkspaceOpen: false,
    maximizedPanel: 'left',
  }),
  
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
