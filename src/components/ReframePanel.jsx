import { useState } from 'react'
import useStore from '../store/useStore'
import { generateSketch, generateSvgLayers } from '../services/api'
import './ReframePanel.css'

const GEN_MODES = [
  { id: 'single', label: 'Single SVG', desc: 'Generate a unified cinematic sketch' },
  { id: 'layers', label: 'Layered SVG', desc: 'Generate separate layers (BG, Character, etc)' }
]

const DEFAULT_LAYERS = ['background', 'character', 'props']

export default function ReframePanel() {
  const setCanvasDataUrl = useStore((s) => s.setCanvasDataUrl)
  const setPendingCanvasImage = useStore((s) => s.setPendingCanvasImage)
  const setPendingCanvasLayers = useStore((s) => s.setPendingCanvasLayers)
  const screenplay = useStore((s) => s.screenplay)
  const intent = useStore((s) => s.intent)
  const setIntent = useStore((s) => s.setIntent)

  const [genMode, setGenMode] = useState('single')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [detailLevel, setDetailLevel] = useState(50)
  const [layerNames, setLayerNames] = useState(DEFAULT_LAYERS)
  const [layerInput, setLayerInput] = useState('')

  const getScriptContext = () => screenplay.map(el => el.text).join(' ')

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const scriptContext = getScriptContext()
      const userIntent = intent || 'Cinematic storyboard sketch'
      
      if (genMode === 'layers') {
        const result = await generateSvgLayers(scriptContext, userIntent, null, layerNames, detailLevel)
        // 각 layer를 별도의 dataURL로 만들어 store에 배열로 저장.
        // DrawingCanvas가 이걸 받아서 각각 독립적인 객체로 캔버스에 올린다.
        const layers = Object.entries(result.layers)
          .filter(([, svg]) => !!svg)
          .map(([name, svg]) => ({
            name,
            dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
          }))
        if (layers.length > 0) {
          setPendingCanvasLayers(layers)
          // 호환: 첫 layer는 canvasDataUrl에도 채워둠 (다른 컴포넌트가 단일 이미지로 참조하는 경우 대비)
          setCanvasDataUrl(layers[0].dataUrl)
        }
      } else {
        const result = await generateSketch(scriptContext, userIntent, null, 'svg', detailLevel)
        const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(result.generated_image)}`
        setPendingCanvasImage(dataUrl)
        setCanvasDataUrl(dataUrl)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const addLayer = () => {
    if (!layerInput.trim()) return
    setLayerNames([...layerNames, layerInput.trim()])
    setLayerInput('')
  }

  return (
    <div className="ai-lab-panel">
      <div className="lab-section">
        <label className="section-label">GENERATION MODE</label>
        <div className="gen-mode-grid">
          {GEN_MODES.map(mode => (
            <button 
              key={mode.id}
              className={`mode-card ${genMode === mode.id ? 'active' : ''}`}
              onClick={() => setGenMode(mode.id)}
            >
              <span className="mode-label">{mode.label}</span>
              <span className="mode-desc">{mode.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="lab-section">
        <label className="section-label">DIRECTOR'S INTENT</label>
        <textarea 
          className="lab-textarea"
          placeholder="Describe the mood, lighting, or specific composition..."
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
        />
      </div>

      {genMode === 'layers' && (
        <div className="lab-section">
          <label className="section-label">LAYERS TO GENERATE</label>
          <div className="layer-tag-cloud">
            {layerNames.map(name => (
              <span key={name} className="layer-tag">
                {name}
                <button onClick={() => setLayerNames(layerNames.filter(n => n !== name))}>×</button>
              </span>
            ))}
          </div>
          <div className="layer-input-group">
            <input 
              type="text" 
              placeholder="Add layer (e.g. Foreground)" 
              value={layerInput}
              onChange={(e) => setLayerInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLayer()}
            />
            <button onClick={addLayer}>+</button>
          </div>
        </div>
      )}

      <div className="lab-section">
        <div className="slider-header">
          <label className="section-label">DETAIL LEVEL</label>
          <span className="slider-value">{detailLevel}%</span>
        </div>
        <input 
          type="range" 
          className="lab-slider"
          min="0" max="100" 
          value={detailLevel}
          onChange={(e) => setDetailLevel(e.target.value)}
        />
      </div>

      <button 
        className={`lab-generate-btn ${loading ? 'loading' : ''}`}
        onClick={handleGenerate}
        disabled={loading}
      >
        {loading ? 'GENERATING...' : 'GENERATE CINEMATIC SKETCH'}
      </button>

      {error && <div className="lab-error">{error}</div>}
      
      <div className="lab-info-footer">
        AI will analyze the current screenplay context and your intent to generate a structured SVG sketch.
      </div>
    </div>
  )
}
