const API_BASE = 'http://15.164.30.174:8000/api'

async function fetchWithTimeout(url, options, timeoutMs = 30000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timer)
    if (!response.ok) throw new Error(`API Error: ${response.status}`)
    return response.json()
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('Request timed out (30s). Please try again.')
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

export async function suggestStrategies(imageBase64, script, intent, cir = null) {
  return fetchWithTimeout(`${API_BASE}/suggest-strategies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64, script, intent, cir }),
  }, 60000)
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

export async function reframeSketch(imageBase64, cir, scriptContext = '', originalCir = null, model = 'gemini-2.5-flash-image', intent = '', strategyContext = '') {
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
