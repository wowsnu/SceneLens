import { toStructureDraft } from './storyStructure.js'
import { toNarrativeSuggestions } from './narrativeSuggestion.js'
import { toCutPlanItems } from './cutPlan.js'
import { toSceneState } from './sceneState.js'

function normalizeApiBase(rawBase) {
  const trimmed = rawBase?.replace(/\/$/, '')
  if (!trimmed) return '/api'
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`
}

const API_BASE = import.meta.env.DEV
  ? normalizeApiBase(import.meta.env.VITE_API_URL || '')
  : normalizeApiBase(import.meta.env.VITE_API_URL || '')

async function fetchWithTimeout(url, options, timeoutMs = 120000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timer)
    if (!response.ok) {
      let detail = ''
      try {
        const payload = await response.json()
        detail = payload?.detail ? `: ${payload.detail}` : ''
      } catch {
        try {
          const text = await response.text()
          detail = text ? `: ${text}` : ''
        } catch {
          detail = ''
        }
      }
      throw new Error(`API Error: ${response.status}${detail}`)
    }
    return response.json()
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error(`Request timed out (${Math.round(timeoutMs/1000)}s). Please try again.`)
    throw err
  }
}

export async function analyzeSketchCIR(imageBase64, scriptContext = '') {
  return fetchWithTimeout(`${API_BASE}/analyze-sketch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64, script_context: scriptContext }),
  }, 120000)
}

export async function analyzeSketch(imageBase64, scriptContext = '') {
  return fetchWithTimeout(`${API_BASE}/analyze-sketch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64, script_context: scriptContext }),
  }, 120000)
}

export async function suggestStrategies(
  imageBase64, script, intent, cir = null,
  axes = ['reframe'], theoryPreference = null, miseOptions = null
) {
  return fetchWithTimeout(`${API_BASE}/suggest-strategies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageBase64, script, intent, cir,
      axes,
      theory_preference: theoryPreference,
      mise_options: miseOptions,
    }),
  }, 180000)
}

export async function theoryAnswer(cir, intent, scriptContext = '') {
  return fetchWithTimeout(`${API_BASE}/theory-answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cir, intent, script_context: scriptContext }),
  }, 30000)
}

export async function enhanceSketch(imageBase64, {
  scriptContext = '', intent = '', prompt = '', shared = '', previous = '',
  references = [], style = '', layout = '',
} = {}) {
  return fetchWithTimeout(`${API_BASE}/enhance-sketch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageBase64,
      script_context: scriptContext,
      intent,
      prompt,
      shared,
      previous,
      references,
      style,
      layout,
    }),
  }, 60000)
}

export async function generateSketch(scriptContext, intent = '', cir = null, outputFormat = 'png', detailLevel = 50) {
  return fetchWithTimeout(`${API_BASE}/generate-sketch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script_context: scriptContext, intent, cir, output_format: outputFormat, detail_level: detailLevel }),
  }, 120000)
}

export async function generateLayers(scriptContext, intent = '', layers = ['background', 'foreground']) {
  return fetchWithTimeout(`${API_BASE}/generate-layers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script_context: scriptContext, intent, layers }),
  }, 120000)
}

export async function generateSingleLayer(scriptContext, intent = '', layer = 'background') {
  return fetchWithTimeout(`${API_BASE}/generate-layer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script_context: scriptContext, intent, layer }),
  }, 120000)
}

export async function generateSvgLayers(scriptContext, intent = '', cir = null, layers = ['background', 'character'], detailLevel = 50) {
  return fetchWithTimeout(`${API_BASE}/generate-svg-layers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script_context: scriptContext, intent, cir, layers, detail_level: detailLevel }),
  }, 120000)
}

export async function reframeSketch(imageBase64, cir, scriptContext = '', originalCir = null, model = 'gpt-image-2', intent = '', strategyContext = '') {
  return fetchWithTimeout(`${API_BASE}/reframe-sketch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64, cir, script_context: scriptContext, original_cir: originalCir, model, intent, strategy_context: strategyContext }),
  }, 120000)
}

export async function vectorizeImage(imageBase64) {
  return fetchWithTimeout(`${API_BASE}/vectorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64 }),
  }, 60000)
}

export async function generateOverlay(imageBase64, strategyName, cir, theoryRationale, intent) {
  return fetchWithTimeout(`${API_BASE}/generate-overlay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64, strategy_name: strategyName, cir, theory_rationale: theoryRationale, intent }),
  }, 120000)
}

// image generation takes ~20-40s per shot; 3 parallel × 3 = allow 3 min
const FILL_TIMEOUT = 180000

export async function requestGapFill({ leftShot, rightShot, scriptContext, intent, userPrompt = '', candidateCount = 3 }) {
  return fetchWithTimeout(`${API_BASE}/gap-fill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      left_shot: leftShot,
      right_shot: rightShot,
      script_context: scriptContext,
      intent,
      user_prompt: userPrompt,
      candidate_count: candidateCount,
    }),
  }, FILL_TIMEOUT)
}

export async function requestAutoFillRange({ shots, scriptContext, intent, userPrompt = '', versionCount = 3 }) {
  return fetchWithTimeout(`${API_BASE}/auto-fill-range`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shots,
      script_context: scriptContext,
      intent,
      user_prompt: userPrompt,
      version_count: versionCount,
    }),
  }, FILL_TIMEOUT)
}

export async function requestViewerReflection({
  panels,
  readingConditions = ['first_viewer'],
  customConditions = [],
}) {
  return fetchWithTimeout(`${API_BASE}/viewer/reflection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      panels,
      reading_conditions: readingConditions,
      custom_conditions: customConditions,
    }),
  }, 240000)
}

export async function requestDirectingReview({
  mode, panels, intent = '', settled = [], lensResults = null,
}) {
  return fetchWithTimeout(`${API_BASE}/directing-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // settled는 감독이 이미 판정한 관계다. 다시 짚지 않게 함께 보낸다.
    // lensResults는 mode='relate'일 때만 쓴다 — 이미지를 다시 올리지 않는다.
    body: JSON.stringify({ mode, panels, intent, settled, lens_results: lensResults }),
  }, 180000)
}

// ── Segmentation (MobileSAM, click-based) ────────────────────

export async function segmentPrepare(imageBase64, type = 'png') {
  return fetchWithTimeout(`${API_BASE}/segment/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64, type }),
  }, 30000)
}

export async function segmentLasso(sessionId, polygon, multimask = false) {
  return fetchWithTimeout(`${API_BASE}/segment/lasso`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, polygon, multimask }),
  }, 15000)
}

// --- 이야기 → 씬·비트 구조 ----------------------------------------------
// 컷을 나누려면 씬과 비트가 있어야 한다. 사용자가 쓴 한 덩어리 이야기에는
// 그 구조가 없으므로 모델이 세운다. 내용은 더하지 않는다.
export async function structureStory(story, sceneIntention = '') {
  const data = await fetchWithTimeout(`${API_BASE}/story/structure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ story, scene_intention: sceneIntention }),
  }, 90000)
  return toStructureDraft(data, story)
}

// --- 지금 Beat에 대한 서사 제안 -------------------------------------------
// 제안이지 수정이 아니다. 사용자가 수락해야 대본이 바뀐다 (DG1 P2).
export async function suggestNarrative({
  narrativeRequest, beatElements, targetBeat, requestKey, sceneIntention = '', panelCount = null,
  scriptBeats = [], beatsByIndex = null,
}) {
  const data = await fetchWithTimeout(`${API_BASE}/narrative/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      narrative_request: narrativeRequest,
      beat_lines: beatElements.map((element) => element.text),
      script_beats: scriptBeats,
      active_beat: targetBeat,
      scene_intention: sceneIntention,
      panel_count: panelCount,
    }),
  }, 60000)
  return toNarrativeSuggestions(data, { beatElements, targetBeat, requestKey, beatsByIndex })
}

// 컷 플랜 점검. 요청에 답하는 것이 아니라 서사가 먼저 짚는다.
// 그림이 없어도 되므로 컷 플랜 단계에서 돈다 — 고치기 가장 싼 자리다.
// cuts를 주면 컷 플랜 점검, lines를 주면 대본 점검. 규칙은 같고 보는
// 것이 다르다 — 대본 단계에는 아직 컷이 없다.
export async function checkNarrative({
  cuts = [], lines = [], sceneIntention = '', script = '',
}) {
  const data = await fetchWithTimeout(`${API_BASE}/narrative/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cuts: cuts.map((cut, index) => ({
        id: cut.id,
        order: index + 1,
        content: cut.content || '',
        purpose: cut.purpose || '',
        characters: cut.characters || '',
      })),
      lines,
      scene_intention: sceneIntention,
      script,
    }),
  }, 90000)
  return {
    summary: data.summary || '',
    findings: (data.findings || []).map((finding) => ({
      ruleId: finding.rule_id,
      cutIds: finding.cut_ids || [],
      lineIndexes: finding.line_indexes || [],
      finding: finding.finding,
      suggestedAction: finding.suggested_action,
    })),
  }
}

// --- 줄콘티: Beat → 컷 ----------------------------------------------------
// 샷 크기·앵글·카메라는 여기서 정하지 않는다. 촬영이 정한다.
export async function planCuts({ heading, beats, cast = [], sceneIntention = '', time = '', place = '' }) {
  const data = await fetchWithTimeout(`${API_BASE}/cut-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ heading, beats, cast, scene_intention: sceneIntention }),
  }, 120000)
  return toCutPlanItems(data, { time, place })
}

// --- 촬영: 컷 → 샷 --------------------------------------------------------
// 컷 하나만 보고 정할 수 없다. 커버리지는 컷을 이어 봐야 판단된다.
export async function designShots({ heading, cuts, script = '', sceneIntention = '' }) {
  const data = await fetchWithTimeout(`${API_BASE}/shot-design`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      heading,
      script,
      cuts: cuts.map((cut) => ({
        beat: cut.beat,
        content: cut.content,
        purpose: cut.purpose,
        characters: cut.characters,
      })),
      scene_intention: sceneIntention,
    }),
  }, 120000)
  // coverage는 모델이 세운 씬의 카메라 흐름이다. 진단이 이것과 실제 샷을
  // 견줘 어긋남을 짚는다 — 값을 고치지는 않는다.
  return { shots: data.shots, coverage: data.coverage || null }
}

// --- 편집: 이음새에 넣을 컷 --------------------------------------------------
// 빈 컷을 만들어 두면 대개 비어 있는 채로 남는다. 무엇을 넣어야 하는지는
// 앞뒤 컷에 이미 드러나 있다.
export async function suggestSeamInsert({
  beforeContent = '', beforePurpose = '', afterContent = '', afterPurpose = '',
  elision = '', script = '', diagnosis = '',
}) {
  const data = await fetchWithTimeout(`${API_BASE}/seam-insert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      before_content: beforeContent,
      before_purpose: beforePurpose,
      after_content: afterContent,
      after_purpose: afterPurpose,
      elision,
      script,
      diagnosis,
    }),
  }, 60000)
  return data.candidates || []
}

// --- 미장센: 공간 배치 ------------------------------------------------------
// 그림이 아니라 좌표를 받는다. 그리는 것은 SpatialMap이 한다.
export async function buildSpaceLayout({ heading, script, locationFacts = '' }) {
  const data = await fetchWithTimeout(`${API_BASE}/space-layout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ heading, script, location_facts: locationFacts }),
  }, 60000)
  return {
    elements: data.elements || [],
    people: data.people || [],
    note: data.note || '',
  }
}

// --- 패널 그림 ------------------------------------------------------------
// 앞 공정이 조립한 프롬프트를 실제로 소비하는 자리. 씬 기준·책임 선언·
// 이음새·샷이 전부 이 문장으로 모인다.
export async function generatePanelImage(
  prompt, { shared = '', previous = '', references = [], style = '', layout = '' } = {},
) {
  const data = await fetchWithTimeout(`${API_BASE}/panel-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // shared는 모든 컷이 공유하는 씬 기준, previous는 앞 컷의 문장이다.
    // 둘 다 이 컷 하나만으로는 알 수 없는 것이라 따로 넘긴다.
    // references는 인물·공간의 레퍼런스 그림 — 글로만 기준을 주면
    // 컷마다 다른 얼굴이 나온다.
    body: JSON.stringify({ prompt, shared, previous, references, style, layout }),
  }, 240000)
  return `data:image/png;base64,${data.image}`
}

// 미장센: 인물·공간의 레퍼런스 그림. 이 그림이 패널 생성의 기준이 된다.
export async function generateReferenceImage(kind, prompt, { style = '' } = {}) {
  const data = await fetchWithTimeout(`${API_BASE}/reference-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, prompt, style }),
  }, 180000)
  return `data:image/png;base64,${data.image}`
}

// --- 촬영: 진단 → 샷 수정본 ------------------------------------------------
// 진단은 무엇이 잘못됐는지까지만 말한다. 어느 크기로 바꿀지는 그 컷이
// 무엇을 보여주려는지 봐야 정해지고, 그것은 촬영의 판단이다.
export async function fixShots({
  heading, cuts, findingTitle, findingDetail = '', targetIndexes = [], sceneIntention = '',
}) {
  const data = await fetchWithTimeout(`${API_BASE}/shot-fix`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      heading,
      cuts: cuts.map((cut) => ({
        beat: cut.beat,
        content: cut.content,
        purpose: cut.purpose,
        characters: cut.characters,
        shot_size: cut.shotSize || '',
        dominant: cut.dominant || '',
      })),
      finding_title: findingTitle,
      finding_detail: findingDetail,
      target_indexes: targetIndexes,
      scene_intention: sceneIntention,
    }),
  }, 60000)
  return { edits: data.edits || [], summary: data.summary || '' }
}

// --- 미장센: 대본 → 씬 기준 -----------------------------------------------
// 여러 컷에 걸쳐 같아야 하는 것을 세운다. 대본에 없는 것은 open으로 남긴다.
export async function buildSceneState({ heading, script, sceneIntention = '', cutPlan = '', cutIds = [] }) {
  const data = await fetchWithTimeout(`${API_BASE}/scene-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ heading, script, scene_intention: sceneIntention, cut_plan: cutPlan }),
  }, 90000)
  return toSceneState(data, heading, cutIds)
}

// --- 편집: 컷 사이 --------------------------------------------------------
// 대부분의 이음새는 '컷 · 연속'이다. 기본과 다른 것만 돌아온다.
export async function designSeams({ heading, cuts, script = '' }) {
  const data = await fetchWithTimeout(`${API_BASE}/seam-design`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      heading,
      cuts: cuts.map((cut) => ({
        beat: cut.beat,
        content: cut.content,
        purpose: cut.purpose,
      })),
      script,
    }),
  }, 90000)
  return data.seams
}
