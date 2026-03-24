import { useRef, useState, useEffect } from 'react'
import useStore from '../store/useStore'
import { analyzeSketch, suggestStrategies, enhanceSketch, generateSketch, generateSingleLayer } from '../services/api'
import './IntentBar.css'

/** Composite multiple layer images into a single canvas dataURL */
async function compositeLayers(layerData) {
  const order = ['background', 'midground', 'foreground']
  const keys = order.filter((k) => layerData[k])
  if (keys.length === 0) return null

  const loadImg = (src) =>
    new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.src = src
    })

  const images = await Promise.all(keys.map((k) => loadImg(layerData[k])))

  const canvas = document.createElement('canvas')
  canvas.width = images[0].width
  canvas.height = images[0].height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  images.forEach((img) => ctx.drawImage(img, 0, 0, canvas.width, canvas.height))
  return canvas.toDataURL('image/png')
}

export default function IntentBar({ hideAnalyze = false }) {
  const intent = useStore((s) => s.intent)
  const setIntent = useStore((s) => s.setIntent)
  const canvasDataUrl = useStore((s) => s.canvasDataUrl)
  const screenplay = useStore((s) => s.screenplay)
  const activeBeat = useStore((s) => s.activeBeat)
  const setIsAnalyzing = useStore((s) => s.setIsAnalyzing)
  const setAnalysisResult = useStore((s) => s.setAnalysisResult)
  const setProposals = useStore((s) => s.setProposals)
  const isAnalyzing = useStore((s) => s.isAnalyzing)
  const isGenerating = useStore((s) => s.isGenerating)
  const setIsGenerating = useStore((s) => s.setIsGenerating)
  const isEnhancing = useStore((s) => s.isEnhancing)
  const setIsEnhancing = useStore((s) => s.setIsEnhancing)
  const setPendingCanvasImage = useStore((s) => s.setPendingCanvasImage)
  const setCanvasLayers = useStore((s) => s.setCanvasLayers)
  const chatMessages = useStore((s) => s.chatMessages)
  const addChatMessage = useStore((s) => s.addChatMessage)
  const analyzingRef = useRef(false)
  const messagesEndRef = useRef(null)

  const [showLayerMenu, setShowLayerMenu] = useState(false)
  const [selectedLayers, setSelectedLayers] = useState({
    background: true,
    foreground: true,
  })

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const getScriptContext = () => {
    const fullScript = screenplay.map((el) => el.text).join('\n')
    let currentBeat = -1
    const beatLines = []
    for (const el of screenplay) {
      if (el.beat !== undefined) currentBeat = el.beat
      if (currentBeat === activeBeat) beatLines.push(el.text)
    }
    return `[Full Scene]\n${fullScript}\n\n[CURRENT BEAT - Draw THIS moment]\n${beatLines.join('\n')}`
  }

  const handleAnalyze = async () => {
    if (!canvasDataUrl) {
      addChatMessage({ role: 'system', text: 'Please draw a sketch first.' })
      return
    }
    if (analyzingRef.current) return
    analyzingRef.current = true

    const userMsg = intent || 'Analyze current composition'
    addChatMessage({ role: 'user', text: userMsg })
    addChatMessage({ role: 'system', text: 'Analyzing composition...' })

    setIsAnalyzing(true)
    setProposals([])

    try {
      const base64 = canvasDataUrl.split(',')[1]
      const scriptText = screenplay.map((el) => el.text).join('\n')
      const intentText = intent || 'Emotional confrontation scene'

      const analysis = await analyzeSketch(base64, scriptText)
      setAnalysisResult(analysis)

      // Remove "Analyzing..." message and add result
      const cir = analysis.cir || {}
      const cirSummary = Object.entries(cir)
        .filter(([, v]) => v)
        .map(([k, v]) => `**${k}**: ${v}`)
        .join('\n')

      // Replace the "Analyzing..." with the result
      useStore.setState((state) => ({
        chatMessages: [
          ...state.chatMessages.filter((m) => m.text !== 'Analyzing composition...'),
          { id: Date.now(), timestamp: new Date(), role: 'assistant', text: cirSummary || 'Analysis complete. Check the Shot Guidance panel for details.' },
        ],
      }))

      const stratResult = await suggestStrategies(base64, scriptText, intentText, analysis.cir)
      const enriched = stratResult.strategies.map((strat) => ({
        ...strat,
        shots: strat.shots.map((shot) => ({
          ...shot,
          image: shot.image || canvasDataUrl,
          analysis: shot.analysis || { detected: analysis.alignment, suggested: '' },
        })),
      }))
      setProposals(enriched)
      addChatMessage({ role: 'assistant', text: `${enriched.length} strategies suggested. Check the Shot Guidance panel.` })
    } catch (error) {
      console.error('Analysis failed:', error)
      addChatMessage({ role: 'system', text: `Analysis failed: ${error.message}` })
    } finally {
      setIsAnalyzing(false)
      analyzingRef.current = false
      setIntent('')
    }
  }

  const handleGenerate = async () => {
    if (isGenerating) return
    const userMsg = intent || 'Generate cinematic sketch'
    addChatMessage({ role: 'user', text: userMsg })
    addChatMessage({ role: 'system', text: 'Generating sketch...' })

    setIsGenerating(true)
    try {
      const result = await generateSketch(
        getScriptContext(),
        intent || 'Cinematic storyboard',
      )
      setPendingCanvasImage(`data:image/png;base64,${result.generated_image}`)

      useStore.setState((state) => ({
        chatMessages: [
          ...state.chatMessages.filter((m) => m.text !== 'Generating sketch...'),
          { id: Date.now(), timestamp: new Date(), role: 'assistant', text: 'Sketch generated and applied to canvas.' },
        ],
      }))
    } catch (err) {
      console.error('Generate failed:', err)
      addChatMessage({ role: 'system', text: `Generation failed: ${err.message}` })
    } finally {
      setIsGenerating(false)
      setIntent('')
    }
  }

  const handleEnhance = async () => {
    if (isEnhancing || !canvasDataUrl) return
    addChatMessage({ role: 'user', text: intent || 'Enhance current sketch' })
    addChatMessage({ role: 'system', text: 'Enhancing sketch...' })

    setIsEnhancing(true)
    try {
      const base64 = canvasDataUrl.split(',')[1]
      const result = await enhanceSketch(
        base64,
        getScriptContext(),
        intent || '',
      )
      setPendingCanvasImage(`data:image/png;base64,${result.enhanced_image}`)

      useStore.setState((state) => ({
        chatMessages: [
          ...state.chatMessages.filter((m) => m.text !== 'Enhancing sketch...'),
          { id: Date.now(), timestamp: new Date(), role: 'assistant', text: 'Sketch enhanced and applied.' },
        ],
      }))
    } catch (err) {
      console.error('Enhance failed:', err)
      addChatMessage({ role: 'system', text: `Enhancement failed: ${err.message}` })
    } finally {
      setIsEnhancing(false)
      setIntent('')
    }
  }

  const handleGenerateLayers = async () => {
    const layers = Object.entries(selectedLayers)
      .filter(([, v]) => v)
      .map(([k]) => k)
    if (layers.length === 0) return

    setShowLayerMenu(false)
    addChatMessage({ role: 'user', text: `Generate layers: ${layers.join(', ')}` })

    setIsGenerating(true)
    const scriptContext = getScriptContext()
    const intentText = intent || 'Cinematic storyboard'
    let accumulated = { ...useStore.getState().canvasLayers }

    for (const layerName of layers) {
      try {
        addChatMessage({ role: 'system', text: `Generating ${layerName} layer...` })
        const result = await generateSingleLayer(scriptContext, intentText, layerName)
        const dataUrl = `data:image/png;base64,${result.image}`
        accumulated = { ...accumulated, [layerName]: dataUrl }
        setCanvasLayers({ ...accumulated })
        const composited = await compositeLayers(accumulated)
        setPendingCanvasImage(composited)

        useStore.setState((state) => ({
          chatMessages: [
            ...state.chatMessages.filter((m) => m.text !== `Generating ${layerName} layer...`),
            { id: Date.now(), timestamp: new Date(), role: 'assistant', text: `${layerName} layer generated.` },
          ],
        }))
      } catch (err) {
        console.error(`Layer "${layerName}" generation failed:`, err)
        addChatMessage({ role: 'system', text: `Layer "${layerName}" failed: ${err.message}` })
      }
    }

    setIsGenerating(false)
    setIntent('')
  }

  const toggleLayer = (name) => {
    setSelectedLayers((prev) => ({ ...prev, [name]: !prev[name] }))
  }

  const handleSubmit = () => {
    if (!intent.trim()) return
    if (hideAnalyze) handleGenerate()
    else handleAnalyze()
  }

  const isBusy = isGenerating || isEnhancing || isAnalyzing

  // Focus/Zen mode: simple single-line bar with generate/enhance
  if (hideAnalyze) {
    return (
      <div className="intent-bar simple-mode">
        <div className="intent-icon">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11zM7 4.5v3.2L4.8 9.8l1.1.9L8.5 8V4.5H7z" />
          </svg>
        </div>
        <label className="intent-label">Intent</label>
        <input
          type="text"
          className="intent-input"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="e.g., Tense confrontation, close-up on the coin, oppressive atmosphere..."
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleGenerate()
          }}
        />
        <div className="intent-actions">
          <button
            className={`intent-action-btn enhance-action ${isEnhancing ? 'loading' : ''}`}
            onClick={handleEnhance}
            disabled={isBusy || !canvasDataUrl}
            title="Enhance current sketch with AI"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1l1.5 3.5L13 6l-3.5 1.5L8 11 6.5 7.5 3 6l3.5-1.5L8 1z" />
            </svg>
            {isEnhancing ? 'Enhancing...' : 'Enhance'}
          </button>

          <div className="generate-dropdown">
            <button
              className={`intent-action-btn generate-action ${isGenerating ? 'loading' : ''}`}
              onClick={handleGenerate}
              disabled={isBusy}
              title="Generate full sketch from intent"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1l1.5 3.5L13 6l-3.5 1.5L8 11 6.5 7.5 3 6l3.5-1.5L8 1zM3 11l.8 1.7L5.5 13.5l-1.7.8L3 16l-.8-1.7L.5 13.5l1.7-.8L3 11z" />
              </svg>
              {isGenerating ? 'Generating...' : 'Generate'}
            </button>
            <button
              className="intent-action-btn layer-toggle-btn"
              onClick={() => setShowLayerMenu((v) => !v)}
              disabled={isBusy}
              title="Generate by layers"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                <path d="M5 7L1 3h8L5 7z" />
              </svg>
            </button>

            {showLayerMenu && (
              <div className="layer-menu">
                <div className="layer-menu-title">Generate Layers</div>
                {[
                  { key: 'background', label: 'Background', desc: 'Environment, walls, props' },
                  { key: 'midground', label: 'Midground', desc: 'Tables, counters, objects' },
                  { key: 'foreground', label: 'Foreground', desc: 'Characters, people' },
                ].map(({ key, label, desc }) => (
                  <label key={key} className="layer-menu-item">
                    <input
                      type="checkbox"
                      checked={selectedLayers[key] || false}
                      onChange={() => toggleLayer(key)}
                    />
                    <div>
                      <div className="layer-menu-label">{label}</div>
                      <div className="layer-menu-desc">{desc}</div>
                    </div>
                  </label>
                ))}
                <button
                  className="layer-menu-generate"
                  onClick={handleGenerateLayers}
                  disabled={isGenerating}
                >
                  Generate Selected
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Detail mode: chat-style UI
  return (
    <div className="intent-bar chat-mode">
      {/* Chat messages area */}
      <div className="chat-messages">
        {chatMessages.length === 0 && (
          <div className="chat-empty">
            <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
              <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1.5a5.5 5.5 0 110 11 5.5 5.5 0 010-11zM7 4.5v3.2L4.8 9.8l1.1.9L8.5 8V4.5H7z" />
            </svg>
            <span>Describe your intent or ask about your composition...</span>
          </div>
        )}
        {chatMessages.map((msg) => (
          <div key={msg.id} className={`chat-msg chat-msg-${msg.role}`}>
            {msg.role === 'user' && (
              <div className="chat-msg-bubble user-bubble">{msg.text}</div>
            )}
            {msg.role === 'assistant' && (
              <div className="chat-msg-bubble assistant-bubble">
                {msg.text.split('\n').map((line, i) => {
                  const parts = line.split(/\*\*(.*?)\*\*/)
                  return (
                    <div key={i}>
                      {parts.map((part, j) =>
                        j % 2 === 1 ? <strong key={j}>{part}</strong> : part
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {msg.role === 'system' && (
              <div className="chat-msg-system">{msg.text}</div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        <input
          type="text"
          className="chat-input"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="e.g., Tense confrontation, close-up on the coin..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          disabled={isBusy}
        />

        <div className="chat-actions">
          <button
            className={`chat-action-btn analyze-action ${isAnalyzing ? 'loading' : ''}`}
            onClick={handleAnalyze}
            disabled={isBusy}
            title="Analyze Composition"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6.5 1a5.5 5.5 0 014.38 8.82l3.15 3.15-1.06 1.06-3.15-3.15A5.5 5.5 0 116.5 1zm0 1.5a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          </button>

          <button
            className="chat-send-btn"
            onClick={handleSubmit}
            disabled={isBusy || !intent.trim()}
            title="Send"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 1.5l14 6.5-14 6.5V9.3L10.5 8 1 6.7V1.5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
