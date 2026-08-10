import { toStructureDraft } from './storyStructure.js'
import { toNarrativeSuggestions } from './narrativeSuggestion.js'
import { toCutPlanItems } from './cutPlan.js'

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

export async function enhanceSketch(imageBase64, scriptContext, intent = '') {
  return fetchWithTimeout(`${API_BASE}/enhance-sketch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64, script_context: scriptContext, intent }),
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

export async function requestViewerReflection({ panels }) {
  return fetchWithTimeout(`${API_BASE}/viewer/reflection`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ panels }),
  }, 120000)
}

export async function requestDirectingReview({ mode, panels, intent = '' }) {
  return fetchWithTimeout(`${API_BASE}/directing-review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, panels, intent }),
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
}) {
  const data = await fetchWithTimeout(`${API_BASE}/narrative/suggest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      narrative_request: narrativeRequest,
      beat_lines: beatElements.map((element) => element.text),
      scene_intention: sceneIntention,
      panel_count: panelCount,
    }),
  }, 60000)
  return toNarrativeSuggestions(data, { beatElements, targetBeat, requestKey })
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
