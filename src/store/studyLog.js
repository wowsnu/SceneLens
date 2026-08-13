/**
 * 실험 로그.
 *
 * 평가에서 재려는 것은 여섯 가지다. 각각이 어떤 이벤트에서 나오는지:
 *
 *   1. 연출 관점별 개입      edit 이벤트의 lens 분포
 *   2. 패널 너머 수정        edit 이벤트의 level 분포. beyond-panel은
 *                            level !== 'element' 인 것의 비율
 *   3. 재생성 의존도         panel_generate 횟수. 같은 패널에 두 번째
 *                            이상이면 repeat=true
 *   4. Viewer 활용           viewer_read 뒤에 온 edit. 그 edit의 level 분포
 *   5. 창작 지원 경험 (CSI)  설문. 로그가 아니라 세션 끝에 붙인다
 *   6. 주관 평가             설문. 위와 같다
 *
 * 로그는 붙여 쓰기만 한다. 지우거나 고치지 않는다 — 실험 기록이기
 * 때문이다. 세션이 끝나면 JSON으로 내보낸다.
 *
 * 새로고침을 견뎌야 한다. 참가자가 실수로 새로고침하면 그 세션의
 * 데이터가 통째로 없어지는데, 실험 중에는 그걸 복구할 방법이 없다.
 * 그래서 메모리가 아니라 localStorage에 쌓는다.
 */

const STORAGE_KEY = 'scenelens.study.log'
const SESSION_KEY = 'scenelens.study.session'
const CONDITION_KEY = 'scenelens.study.condition'

/** 이 수정이 패널 안의 일인가, 그 너머인가. */
export const BEYOND_PANEL_LEVELS = ['shot', 'seam', 'sequence']

/**
 * 진단 level(코드값)을 논문에서 쓰는 이름으로 옮긴다.
 * docs/PAPER_SECTION_4.md의 결정에 따라 코드는 그대로 두고 여기서만 바꾼다.
 */
const LEVEL_ALIASES = {
  attribute: 'element',
  shot_structure: 'shot',
  shot_relation: 'seam',
  scene_structure: 'sequence',
}

export const normalizeLevel = (level) => LEVEL_ALIASES[level] || level || null

const newSessionId = () => (
  `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
)

const readJSON = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    // 저장소를 못 쓰는 환경(사파리 프라이빗 등)에서도 앱은 돌아가야 한다.
    return fallback
  }
}

const writeJSON = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** 이 브라우저의 참가자 세션. 새로고침해도 같은 세션이어야 한다. */
export const sessionId = () => {
  let id = readJSON(SESSION_KEY, null)
  if (!id) {
    id = newSessionId()
    writeJSON(SESSION_KEY, id)
  }
  return id
}

/**
 * 실험 조건. 조건 간 비교를 하려면 모든 이벤트에 붙어 있어야 한다.
 * 세션 시작 때 실험자가 정한다 — URL에 `?condition=scenelens`로 넘기거나
 * Ctrl+Shift+C로 입력한다. 정하지 않으면 'unset'으로 남아, 분석 때
 * 조건 없는 세션을 바로 골라낼 수 있다.
 */
export const condition = () => readJSON(CONDITION_KEY, null) || 'unset'

export const setCondition = (value) => {
  writeJSON(CONDITION_KEY, value)
  return value
}

export const readLog = () => readJSON(STORAGE_KEY, [])

/**
 * 이벤트 하나를 남긴다.
 *
 * type은 아래 중 하나다:
 *   edit             무엇이든 실제로 바뀐 것. lens/level/target이 붙는다
 *   panel_generate   패널 이미지 생성. repeat이 붙는다
 *   viewer_read      Viewer Agent 확인
 *   review           검토 실행 (단일 렌즈 / 다관점 / 관계)
 *   route            진단에서 고칠 자리로 이동한 것. 아직 수정은 아니다
 *   verdict          revise / retain / defer 판정
 */
export const logEvent = (type, payload = {}) => {
  if (typeof window === 'undefined') return null
  const event = {
    t: Date.now(),
    session: sessionId(),
    condition: condition(),
    type,
    ...payload,
  }
  const log = readLog()
  log.push(event)
  writeJSON(STORAGE_KEY, log)
  return event
}

/**
 * 수정 하나를 남긴다.
 *
 * lens   어느 관점에서 온 수정인가 (narrative / mise / camera / editing)
 *        진단을 거치지 않고 직접 고쳤으면 null
 * level  element / shot / seam / sequence
 * source 무엇이 이 수정을 부르는가 — diagnosis / viewer / manual
 */
export const logEdit = ({ lens = null, level, target = null, source = 'manual', ...rest }) => (
  logEvent('edit', {
    lens,
    level: normalizeLevel(level),
    target,
    source,
    beyondPanel: BEYOND_PANEL_LEVELS.includes(normalizeLevel(level)),
    ...rest,
  })
)

/**
 * SceneLens의 기능을 실제로 쓴 것.
 *
 * feature  lens / criterion / alternative / diagnosis / cross_lens / viewer
 * action   open / view / select / accept / modify / reject
 *
 * accept / modify / reject가 핵심이다. 제안을 판정하게 한다는 것이
 * DG1 P2의 주장인데, 그것이 실제로 일어났는지는 이 셋의 분포로만 보인다.
 */
export const logScaffold = ({ feature, action, target = null, ...rest }) => (
  logEvent('scaffold', { feature, action, target, ...rest })
)

/** 실험자가 세션 끝에 받아 가는 것. */
export const summarize = (log = readLog()) => {
  const edits = log.filter((e) => e.type === 'edit')
  const generates = log.filter((e) => e.type === 'panel_generate')
  const count = (items, key) => items.reduce((acc, item) => {
    const value = item[key] || 'unspecified'
    return { ...acc, [value]: (acc[value] || 0) + 1 }
  }, {})

  // Viewer 확인 뒤에 온 수정만 센다. 확인이 실제 수정으로 이어졌는가.
  const firstViewerRead = log.find((e) => e.type === 'viewer_read')
  const afterViewer = firstViewerRead
    ? edits.filter((e) => e.t >= firstViewerRead.t && e.source === 'viewer')
    : []

  const scaffolds = log.filter((e) => e.type === 'scaffold')

  return {
    session: sessionId(),
    condition: condition(),
    events: log.length,
    // 어떤 기능을 얼마나 썼는가. 제안을 받아들였는가 버렸는가.
    scaffolding: {
      total: scaffolds.length,
      byFeature: count(scaffolds, 'feature'),
      byAction: count(scaffolds, 'action'),
    },
    edits: {
      total: edits.length,
      byLens: count(edits, 'lens'),
      byLevel: count(edits, 'level'),
      // 패널 너머 수정 비율. 이 시스템이 주장하는 것의 핵심 측정값이다.
      beyondPanelRatio: edits.length
        ? edits.filter((e) => e.beyondPanel).length / edits.length
        : 0,
    },
    regeneration: {
      total: generates.length,
      repeats: generates.filter((e) => e.repeat).length,
      byPanel: count(generates, 'target'),
    },
    viewer: {
      reads: log.filter((e) => e.type === 'viewer_read').length,
      verdicts: count(log.filter((e) => e.type === 'verdict'), 'verdict'),
      // Viewer 확인 이후 실제 수정으로 이어진 비율
      editsAfterRead: afterViewer.length,
      levelsAfterRead: count(afterViewer, 'level'),
    },
  }
}

/** 세션을 파일로 내보낸다. */
export const exportLog = () => {
  const log = readLog()
  const payload = { summary: summarize(log), events: log }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `scenelens-${sessionId()}.json`
  link.click()
  URL.revokeObjectURL(url)
  return payload
}

/**
 * 다음 참가자를 위해 비운다. 내보낸 뒤에만 부른다 —
 * 되돌릴 수 없으므로 호출부에서 확인을 받는다.
 */
export const resetLog = () => {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
    window.localStorage.removeItem(SESSION_KEY)
    window.localStorage.removeItem(CONDITION_KEY)
  } catch {
    // 못 지워도 앱은 계속 돌아간다.
  }
}
