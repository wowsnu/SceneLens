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
 *   4. Viewer 활용           viewer_read 뒤에 온 edit. 그 edit의 level 분포.
 *                            의도 대조가 어긋난 자리를 몇 냈는지는
 *                            intent_check 이벤트가 따로 든다 — 낼 것이
 *                            없어서 안 고친 것과 보고도 안 고친 것을
 *                            가르는 데 그 수가 필요하다
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
const ORDER_KEY = 'scenelens.study.order'
const PHASE_KEY = 'scenelens.study.phase'
const TASK_START_KEY = 'scenelens.study.task_started_at'
const EXPORTED_KEY = 'scenelens.study.exported_at'
const UPLOADED_KEY = 'scenelens.study.uploaded_at'

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

/**
 * 이 조건이 이 참가자의 몇 번째인가 (1 또는 2).
 *
 * within-subjects라 같은 사람이 두 조건을 다 한다. 순서 효과 — 두 번째
 * 조건에서는 이미 이야기와 도구에 익숙해져 있다 — 를 통제하려면 조건
 * 이름만으로는 부족하고, 그것이 먼저였는지 나중이었는지가 있어야 한다.
 * 조건과 같은 방식으로 URL(`?order=1`)이나 Ctrl+Shift+C에서 정한다.
 */
export const conditionOrder = () => readJSON(ORDER_KEY, null) || 'unset'

export const setConditionOrder = (value) => {
  writeJSON(ORDER_KEY, value)
  return value
}

/**
 * 튜토리얼인가 본 과제인가.
 *
 * 프로토콜은 본 과제 전에 튜토리얼을 10분 한다. 그때 누른 것도 그대로
 * 쌓이므로, 나누지 않으면 튜토리얼의 수정이 과제 측정값에 섞인다.
 *
 * **지우지 않고 표시만 한다.** 실험자가 시작을 누르는 것을 깜빡해도
 * 데이터가 사라지면 안 되고, 튜토리얼에서 무엇을 했는지도 나중에 볼
 * 이유가 있다. 분석에서 `phase === 'task'`만 세면 된다.
 */
export const phase = () => readJSON(PHASE_KEY, null) || 'tutorial'

export const taskStartedAt = () => readJSON(TASK_START_KEY, null)

/** 실험자가 `과제 시작`을 누른 시점. 이 뒤의 이벤트가 측정 대상이다. */
export const startTask = () => {
  writeJSON(PHASE_KEY, 'task')
  const at = Date.now()
  writeJSON(TASK_START_KEY, at)
  logEvent('phase_start', { phase: 'task' })
  return at
}

/** 과제를 끝낸다. 이 뒤의 조작은 다시 측정 대상이 아니다. */
export const endTask = () => {
  logEvent('phase_end', { phase: 'task' })
  writeJSON(PHASE_KEY, 'done')
  return true
}

export const readLog = () => readJSON(STORAGE_KEY, [])

/** 마지막으로 내보낸 시각. 한 번도 안 내보냈으면 null. */
export const exportedAt = () => readJSON(EXPORTED_KEY, null)

/**
 * 서버에 **실제로 올라간** 시각. 파일만 받은 것과 구분한다.
 *
 * 비우기를 이 값으로 가른다 — 파일은 실험자 컴퓨터에 있지만, 그것이
 * 제자리에 있는지 시스템은 알 수 없다. 서버 저장이 확인된 세션만
 * 지워도 안전하다고 본다.
 */
export const uploadedAt = () => readJSON(UPLOADED_KEY, null)

export const markUploaded = () => {
  const at = Date.now()
  writeJSON(UPLOADED_KEY, at)
  return at
}

/**
 * 이벤트 하나를 남긴다.
 *
 * type은 아래 중 하나다:
 *   edit             무엇이든 실제로 바뀐 것. lens/level/target이 붙는다
 *   panel_generate   패널 이미지 생성. repeat이 붙는다
 *   viewer_read      Viewer Agent 확인
 *   review           검토 실행 (단일 렌즈 / 다관점 / 관계)
 *   route            진단에서 고칠 자리로 이동한 것. 아직 수정은 아니다
 *   verdict          keep / applied 판정. 버튼으로 받지 않고 실제
 *                    행동(그대로 둠 / 적용함)에서 나온다
 *   intent_check     의도와 읽힘 대조 결과. 어긋난 컷 수와 그 자리
 */
export const logEvent = (type, payload = {}) => {
  if (typeof window === 'undefined') return null
  const log = readLog()
  const event = {
    // 이벤트끼리 서로를 가리킬 수 있어야 한다 — Viewer 읽기 뒤에 온
    // 첫 수정이 무엇인지가 분석에서 필요하다.
    id: `e${log.length + 1}`,
    t: Date.now(),
    session: sessionId(),
    condition: condition(),
    conditionOrder: conditionOrder(),
    // 이 이벤트가 튜토리얼에서 나온 것인가 본 과제에서 나온 것인가.
    phase: phase(),
    type,
    ...payload,
  }
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
 * 이 스토리보드가 어떤 상태였는지를 짧은 값으로 만든다.
 *
 * Viewer가 읽은 것은 그 시점의 스토리보드다. 이후 수정이 그 읽기에
 * 대한 반응인지 판단하려면 무엇을 보고 말한 것인지가 있어야 한다.
 * 이미지가 바뀌면 다른 버전이므로 패널 순서와 이미지로 만든다.
 */
export const storyboardVersion = (shots = []) => {
  const basis = shots
    .map((shot) => `${shot.order}:${(shot.image || '').slice(-24)}`)
    .join('|')
  let hash = 0
  for (let i = 0; i < basis.length; i += 1) {
    hash = ((hash << 5) - hash + basis.charCodeAt(i)) | 0
  }
  return `v${Math.abs(hash).toString(36)}`
}

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
export const summarize = (fullLog = readLog()) => {
  // **측정값은 본 과제 것만 센다.** 튜토리얼에서 누른 것이 섞이면
  // 수정 건수도 층위 분포도 부풀고, 그건 분석 때 알아채기 어렵다.
  // 튜토리얼 기록은 지우지 않고 `tutorial`에 따로 담아 둔다.
  const tutorialEvents = fullLog.filter((e) => e.phase === 'tutorial')
  // `task`만 센다. `done`을 빼지 않으면 과제를 끝낸 뒤 실험자가 화면을
  // 정리하며 누른 것까지 측정에 들어간다 — 그건 참가자의 작업이 아니다.
  const log = fullLog.filter((e) => e.phase === 'task')
  const afterEvents = fullLog.filter((e) => e.phase === 'done')
  const edits = log.filter((e) => e.type === 'edit')
  const generates = log.filter((e) => e.type === 'panel_generate')
  const count = (items, key) => items.reduce((acc, item) => {
    const value = item[key] || 'unspecified'
    return { ...acc, [value]: (acc[value] || 0) + 1 }
  }, {})

  // Viewer 확인 뒤에 온 수정만 센다. 확인이 실제 수정으로 이어졌는가.
  const firstViewerRead = log.find((e) => e.type === 'viewer_read')
  const firstReadAt = firstViewerRead ? log.indexOf(firstViewerRead) : -1
  const afterViewer = firstViewerRead
    ? edits.filter((e) => log.indexOf(e) > firstReadAt && e.source === 'viewer')
    : []

  const scaffolds = log.filter((e) => e.type === 'scaffold')

  // 각 scaffolding을 쓴 뒤 무엇을 고쳤는가. 8.7-4가 묻는 것은 기능이
  // 얼마나 쓰였는지가 아니라, 그 기능이 수정으로 이어졌는지다.
  // 다음 scaffolding 전까지를 그 기능의 몫으로 본다 — 그 뒤의 수정은
  // 다른 기능을 보고 한 것일 수 있다.
  const scaffoldFollowups = scaffolds.map((scaffold) => {
    const at = log.indexOf(scaffold)
    const nextScaffoldAt = scaffolds
      .map((other) => log.indexOf(other))
      .find((index) => index > at)
    const window = edits.filter((edit) => {
      const editAt = log.indexOf(edit)
      return editAt > at && (nextScaffoldAt === undefined || editAt < nextScaffoldAt)
    })
    return {
      feature: scaffold.feature,
      action: scaffold.action,
      target: scaffold.target || null,
      // 이 기능을 쓴 뒤 실제로 고친 것. 비어 있으면 보고 넘어간 것이다.
      edits: window.map((edit) => ({ id: edit.id, lens: edit.lens, level: edit.level })),
    }
  })

  // 읽기 하나하나에 대해 그 뒤 처음 일어난 수정을 잇는다. 저장하지 않고
  // 여기서 잇는 이유는, 수정은 읽기보다 나중에 일어나므로 읽기를 남기는
  // 시점에는 아직 존재하지 않기 때문이다.
  const reads = log.filter((e) => e.type === 'viewer_read').map((read) => {
    // 같은 밀리초에 찍힌 이벤트가 있으므로 시각만으로는 앞뒤가 갈리지
    // 않는다. 기록된 순서로 본다.
    const readAt = log.indexOf(read)
    const next = edits.find((edit) => log.indexOf(edit) > readAt)
    return {
      viewer_read_id: read.id,
      storyboard_version: read.storyboard_version || null,
      subsequent_edit_id: next?.id || null,
      // 그 수정이 어느 층위·렌즈였는지. 없으면 읽고 아무것도 바꾸지 않은 것이다.
      level: next?.level || null,
      lens: next?.lens || null,
    }
  })

  return {
    session: sessionId(),
    condition: condition(),
    conditionOrder: conditionOrder(),
    phase: phase(),
    task_started_at: taskStartedAt(),
    events: log.length,
    /* 본 과제 전에 일어난 것. 측정에서는 빠지지만 지우지는 않는다 —
     * 실험자가 `과제 시작`을 깜빡했을 때 여기 수가 크면 바로 드러나고,
     * 그때는 이 기록으로 시점을 되짚을 수 있다. */
    tutorial: {
      events: tutorialEvents.length,
      edits: tutorialEvents.filter((e) => e.type === 'edit').length,
      generates: tutorialEvents.filter((e) => e.type === 'panel_generate').length,
    },
    // 과제를 끝낸 뒤에 일어난 것. 참가자의 작업이 아니므로 측정에서
    // 빠지지만, 종료를 잘못 눌렀을 때 여기 수가 크면 바로 보인다.
    afterTask: {
      events: afterEvents.length,
      edits: afterEvents.filter((e) => e.type === 'edit').length,
    },
    // 어떤 기능을 얼마나 썼는가. 제안을 받아들였는가 버렸는가.
    scaffolding: {
      total: scaffolds.length,
      byFeature: count(scaffolds, 'feature'),
      byAction: count(scaffolds, 'action'),
      // 기능별로 그 뒤 수정이 따라온 비율. 쓰인 횟수가 아니라 쓰여서
      // 무엇이 달라졌는지를 본다.
      followedByEdit: scaffoldFollowups.reduce((acc, entry) => {
        const prior = acc[entry.feature] || { used: 0, ledToEdit: 0 }
        return {
          ...acc,
          [entry.feature]: {
            used: prior.used + 1,
            ledToEdit: prior.ledToEdit + (entry.edits.length > 0 ? 1 : 0),
          },
        }
      }, {}),
      followups: scaffoldFollowups,
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
      // 전체 수정 중 재생성이 차지하는 비율. 패널을 다시 그리는 것으로
      // 문제를 푸는 쪽에 얼마나 기대는지를 본다. 분모는 수정과 재생성을
      // 합한 것이다 — 재생성은 edit으로 세지 않으므로 더해야 한다.
      shareOfAllRevisions: (edits.length + generates.length)
        ? generates.length / (edits.length + generates.length)
        : 0,
    },
    /* AI가 낸 진단이 어느 렌즈에서 어느 층위로 나왔는가.
     *
     * design_goal.md DG2의 주장 — "관점은 문제를 발견하는 근거이고 층위는
     * 문제를 수정할 위치다. 미장센·촬영·편집은 모두 네 층위를 사용할 수
     * 있다" — 을 뒷받침하는 증거다. 화면에 렌즈×층위 표를 두지 않는 대신
     * 여기서 집계한다.
     *
     * `byLensLevel`이 교차표다. 어떤 렌즈가 특정 층위만 내고 있으면 그
     * 칸이 비어 있어 바로 드러난다.
     */
    diagnosis: (() => {
      const rows = log.filter((e) => e.type === 'diagnosis')
      const byLensLevel = {}
      rows.forEach((row) => {
        const lens = row.lens || 'unspecified'
        const level = row.level || 'unspecified'
        byLensLevel[lens] = byLensLevel[lens] || {}
        byLensLevel[lens][level] = (byLensLevel[lens][level] || 0) + 1
      })
      return {
        total: rows.length,
        byLens: count(rows, 'lens'),
        byLevel: count(rows, 'level'),
        byRule: count(rows, 'rule'),
        // 렌즈가 실제로 몇 개 층위에 닿았는가. 넷 중 하나에만 머무르면
        // 그 렌즈는 층위에 묶여 있다는 뜻이다.
        levelsPerLens: Object.fromEntries(
          Object.entries(byLensLevel).map(([lens, levels]) => [lens, Object.keys(levels).length]),
        ),
        byLensLevel,
        // 한 컷을 볼 때와 범위를 볼 때 나오는 층위가 다른지 본다.
        byScopeMode: count(rows, 'scopeMode'),
      }
    })(),
    /* 의도 대조가 무엇을 냈고, 그 뒤에 무엇이 일어났는가.
     *
     * 프로토콜 5.3이 재려는 것은 관객 읽기가 **재검토와 수정으로
     * 이어졌는가**다. 어긋난 자리가 몇이었는지가 없으면 "고칠 게 없어서
     * 안 고쳤다"와 "보고도 안 고쳤다"가 갈리지 않는다 — 앞은 시스템이
     * 통과시킨 것이고 뒤는 감독이 감수한 것이라 전혀 다른 사건이다.
     */
    intentCheck: (() => {
      const runs = log.filter((e) => e.type === 'intent_check')
      return {
        runs: runs.length,
        // 어긋난 자리를 한 번이라도 받았는가. 0이면 아래 `수정 없음`은
        // 감독의 판단이 아니라 시스템이 낼 것이 없었다는 뜻이다.
        offTotal: runs.reduce((acc, run) => acc + (run.off || 0), 0),
        reachedTotal: runs.reduce((acc, run) => acc + (run.reached || 0), 0),
        byRun: runs.map((run) => {
          const at = log.indexOf(run)
          const next = edits.find((edit) => log.indexOf(edit) > at)
          return {
            intent_check_id: run.id,
            panels: run.panels || 0,
            off: run.off || 0,
            offPanels: run.offPanels || [],
            storyboard_version: run.storyboard_version || null,
            // 이 대조 뒤 처음 고친 것. 없으면 보고 그대로 둔 것이다.
            subsequent_edit_id: next?.id || null,
            level: next?.level || null,
            lens: next?.lens || null,
          }
        }),
      }
    })(),
    viewer: {
      reads: log.filter((e) => e.type === 'viewer_read').length,
      verdicts: count(log.filter((e) => e.type === 'verdict'), 'verdict'),
      // Viewer 확인 이후 실제 수정으로 이어진 비율
      editsAfterRead: afterViewer.length,
      levelsAfterRead: count(afterViewer, 'level'),
      // 읽기별로 그 뒤 첫 수정. 수정이 없었던 읽기는 null로 남는다 —
      // 의도적 유지인지 그냥 지나친 것인지는 로그로 알 수 없다.
      byRead: reads,
    },
  }
}

/** 세션을 파일로 내보낸다. */
export const exportLog = ({ finalSnapshot = null, metadata = {} } = {}) => {
  const log = readLog()
  const payload = {
    schema_version: '2.0',
    exported_at: new Date().toISOString(),
    metadata: {
      session_id: sessionId(),
      condition: condition(),
      condition_order: conditionOrder(),
      ...metadata,
    },
    summary: summarize(log),
    events: log,
    // 분석 중 think-aloud/video의 특정 시점을 마지막 산출물과 연결할 수
    // 있게 한다. 이미지 원본은 이미 별도 저장되어 있으므로 여기에는 구조와
    // 식별자·설명만 둔다.
    final_snapshot: finalSnapshot,
  }
  // 한 번이라도 내보냈는지 남긴다. 비우기는 되돌릴 수 없으므로, 내보낸
  // 적 없는 세션을 지우려 할 때 그 사실을 경고할 수 있어야 한다.
  writeJSON(EXPORTED_KEY, Date.now())
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
    window.localStorage.removeItem(ORDER_KEY)
    window.localStorage.removeItem(PHASE_KEY)
    window.localStorage.removeItem(TASK_START_KEY)
    window.localStorage.removeItem(EXPORTED_KEY)
    window.localStorage.removeItem(UPLOADED_KEY)
  } catch {
    // 못 지워도 앱은 계속 돌아간다.
  }
}
