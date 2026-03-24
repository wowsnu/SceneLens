const API_BASE = `http://${window.location.hostname}:8000/api`

export async function analyzeSketch(imageBase64, scriptContext = '') {
  const response = await fetch(`${API_BASE}/analyze-sketch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageBase64,
      script_context: scriptContext,
    }),
  })
  if (!response.ok) throw new Error(`API Error: ${response.status}`)
  return response.json()
}

export async function suggestStrategies(imageBase64, script, intent, cir = null) {
  const response = await fetch(`${API_BASE}/suggest-strategies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageBase64,
      script,
      intent,
      cir,
    }),
  })
  if (!response.ok) throw new Error(`API Error: ${response.status}`)
  return response.json()
}

export async function enhanceSketch(imageBase64, scriptContext, intent = '') {
  const response = await fetch(`${API_BASE}/enhance-sketch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageBase64,
      script_context: scriptContext,
      intent,
    }),
  })
  if (!response.ok) throw new Error(`API Error: ${response.status}`)
  return response.json()
}

export async function generateSketch(scriptContext, intent = '', cir = null) {
  const response = await fetch(`${API_BASE}/generate-sketch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      script_context: scriptContext,
      intent,
      cir,
    }),
  })
  if (!response.ok) throw new Error(`API Error: ${response.status}`)
  return response.json()
}

export async function generateLayers(scriptContext, intent = '', layers = ['background', 'foreground']) {
  const response = await fetch(`${API_BASE}/generate-layers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      script_context: scriptContext,
      intent,
      layers,
    }),
  })
  if (!response.ok) throw new Error(`API Error: ${response.status}`)
  return response.json()
}

export async function generateSingleLayer(scriptContext, intent = '', layer = 'background') {
  const response = await fetch(`${API_BASE}/generate-layer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      script_context: scriptContext,
      intent,
      layer,
    }),
  })
  if (!response.ok) throw new Error(`API Error: ${response.status}`)
  return response.json()
}

export async function generateOverlay(imageBase64, strategyName, cir, theoryRationale, intent) {
  const response = await fetch(`${API_BASE}/generate-overlay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: imageBase64,
      strategy_name: strategyName,
      cir,
      theory_rationale: theoryRationale,
      intent,
    }),
  })
  if (!response.ok) throw new Error(`API Error: ${response.status}`)
  return response.json()
}
