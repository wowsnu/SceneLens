import { useEffect, useMemo, useState } from 'react'
import useStore from '../store/useStore'
import { reframeSketch } from '../services/api'
import './ReframeTab.css'

const FIELD_CONFIG = [
  {
    key: 'shotSize',
    label: 'Shot Size',
    options: [
      'Extreme Close-Up',
      'Close-Up',
      'Medium Close-Up',
      'Medium Shot',
      'Medium Long Shot',
      'Long Shot',
      'Extreme Wide Shot',
    ],
  },
  {
    key: 'horizontalAngle',
    label: 'Horizontal Angle',
    options: ['Frontal', 'Three-Quarter', 'Profile', 'Rear'],
  },
  {
    key: 'verticalLevel',
    label: 'Vertical Level',
    options: ['High', 'Eye', 'Low', 'Top-Down', 'Ground'],
  },
  {
    key: 'viewpointFraming',
    label: 'Viewpoint',
    options: ['Objective', 'OTS', 'POV'],
  },
  {
    key: 'occlusion',
    label: 'Occlusion',
    options: ['None', 'Partial', 'Heavy'],
  },
  {
    key: 'depth',
    label: 'Depth',
    options: ['', 'Shallow', 'Deep'],
  },
  {
    key: 'motionHint',
    label: 'Motion',
    options: ['Static', 'Pan', 'Tilt', 'Track', 'Zoom', 'Handheld'],
  },
]

const DEFAULT_CIR = {
  shotSize: 'Medium Shot',
  horizontalAngle: 'Frontal',
  verticalLevel: 'Eye',
  viewpointFraming: 'Objective',
  occlusion: 'None',
  depth: '',
  motionHint: 'Static',
}

const LEGACY_VALUE_MAP = {
  shotSize: {
    ECU: 'Extreme Close-Up',
    'Extreme Wide': 'Extreme Wide Shot',
    Wide: 'Long Shot',
    Medium: 'Medium Shot',
    'Medium Close': 'Medium Close-Up',
  },
  horizontalAngle: {
    Frontal: 'Frontal',
    Profile: 'Profile',
    Rear: 'Rear',
    '3/4 View': 'Three-Quarter',
    'Three Quarter': 'Three-Quarter',
  },
  verticalLevel: {
    'Eye Level': 'Eye',
    Overhead: 'Top-Down',
  },
}

function mapLegacyValue(field, value) {
  if (!value) return value
  return LEGACY_VALUE_MAP[field]?.[value] || value
}

function normalizeCir(source = {}) {
  const fromRelation = source.relation === 'OTS' ? 'OTS' : 'Objective'

  return {
    shotSize: mapLegacyValue('shotSize', source.shotSize) || DEFAULT_CIR.shotSize,
    horizontalAngle:
      mapLegacyValue('horizontalAngle', source.horizontalAngle || source.cameraAngle) || DEFAULT_CIR.horizontalAngle,
    verticalLevel:
      mapLegacyValue('verticalLevel', source.verticalLevel || source.cameraLevel) || DEFAULT_CIR.verticalLevel,
    viewpointFraming: source.viewpointFraming || fromRelation || DEFAULT_CIR.viewpointFraming,
    occlusion: source.occlusion || DEFAULT_CIR.occlusion,
    depth: source.depth || DEFAULT_CIR.depth,
    motionHint: source.motionHint || DEFAULT_CIR.motionHint,
  }
}

function pickBeatScript(screenplay, activeBeat) {
  const beatLines = screenplay.filter((line) => line.beat === activeBeat).map((line) => line.text)
  if (beatLines.length > 0) return beatLines.join(' ')
  return screenplay.map((line) => line.text).join(' ')
}

export default function ReframeTab() {
  const strategies = useStore((s) => s.strategies)
  const setStrategies = useStore((s) => s.setStrategies)
  const activeStrategy = useStore((s) => s.activeStrategy)
  const activeShot = useStore((s) => s.activeShot)
  const activeBeat = useStore((s) => s.activeBeat)
  const analysisResult = useStore((s) => s.analysisResult)
  const screenplay = useStore((s) => s.screenplay)
  const canvasDataUrl = useStore((s) => s.canvasDataUrl)
  const setCanvasDataUrl = useStore((s) => s.setCanvasDataUrl)
  const setPendingCanvasImage = useStore((s) => s.setPendingCanvasImage)
  const intent = useStore((s) => s.intent)
  const setIntent = useStore((s) => s.setIntent)

  const [targetCir, setTargetCir] = useState(DEFAULT_CIR)
  const [model, setModel] = useState('gemini-2.5-flash-image')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const currentShot = strategies[activeStrategy]?.shots?.[activeShot]

  const baseCir = useMemo(() => {
    if (analysisResult?.cir) return normalizeCir(analysisResult.cir)
    if (currentShot?.cir) return normalizeCir(currentShot.cir)
    return DEFAULT_CIR
  }, [analysisResult, currentShot])

  useEffect(() => {
    setTargetCir(baseCir)
  }, [baseCir, activeShot, activeStrategy])

  const changedFields = useMemo(() => {
    return FIELD_CONFIG.filter(({ key }) => (targetCir[key] || '') !== (baseCir[key] || ''))
  }, [targetCir, baseCir])

  const updateField = (key, value) => {
    setTargetCir((prev) => ({ ...prev, [key]: value }))
  }

  const handleReframe = async () => {
    if (loading) return
    if (!canvasDataUrl) {
      setError('먼저 캔버스에 스케치를 불러오거나 그려주세요.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const imageBase64 = canvasDataUrl.split(',')[1]
      const scriptContext = pickBeatScript(screenplay, activeBeat)

      const result = await reframeSketch(
        imageBase64,
        targetCir,
        scriptContext,
        baseCir,
        model,
        intent || '',
      )

      const reframedDataUrl = `data:image/png;base64,${result.reframed_image}`
      setPendingCanvasImage(reframedDataUrl)
      setCanvasDataUrl(reframedDataUrl)

      const updated = strategies.map((strategy, strategyIdx) => {
        if (strategyIdx !== activeStrategy) return strategy
        const shots = [...strategy.shots]
        if (!shots[activeShot]) return strategy

        shots[activeShot] = {
          ...shots[activeShot],
          image: reframedDataUrl,
          cir: { ...shots[activeShot].cir, ...targetCir },
          theory_rationale: result.description || shots[activeShot].theory_rationale,
        }

        return { ...strategy, shots }
      })

      setStrategies(updated)
    } catch (err) {
      setError(err.message || 'Reframe 요청 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const hasAnalysis = !!analysisResult?.cir

  return (
    <div className="reframe-tab scrollable">
      <div className={`reframe-section ${!hasAnalysis ? 'reframe-section--locked' : ''}`}>
        <h3>Target Reframe</h3>

        {!hasAnalysis ? (
          <div className="reframe-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <p>Analyze 버튼을 눌러<br/>현재 스케치의 구도를 분석하세요</p>
          </div>
        ) : (
          <>
            <p className="reframe-desc">분석된 구도를 기준으로 수정하고 재생성합니다.</p>
            <div className="reframe-fields">
              {FIELD_CONFIG.map(({ key, label, options }) => {
                const isChanged = (targetCir[key] || '') !== (baseCir[key] || '')
                return (
                  <label className="reframe-field" key={key}>
                    <div className="reframe-field-header">
                      <span>{label}</span>
                      {baseCir[key] && (
                        <span className="reframe-base-badge" title="Analyzed value">
                          {baseCir[key]}
                        </span>
                      )}
                    </div>
                    <select
                      value={targetCir[key] || ''}
                      onChange={(e) => updateField(key, e.target.value)}
                      className={isChanged ? 'reframe-select--changed' : ''}
                    >
                      {options.map((opt) => (
                        <option key={opt || 'none'} value={opt}>
                          {opt || 'Auto'}
                        </option>
                      ))}
                    </select>
                  </label>
                )
              })}
            </div>
          </>
        )}

        {hasAnalysis && (
          <label className="reframe-field" style={{ marginTop: 8 }}>
            <span>Model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="gemini-2.5-flash-image">gemini-2.5-flash-image</option>
              <option value="gemini-3.1-flash-image-preview">gemini-3.1-flash-image-preview</option>
              <option value="gpt-image-1.5">gpt-image-1.5</option>
            </select>
          </label>
        )}
      </div>

      <div className={`reframe-section ${!hasAnalysis ? 'reframe-section--locked' : ''}`}>
        <h3>Director Intent</h3>
        <textarea
          className="reframe-intent"
          placeholder="예: 인물의 위압감이 강해지게, 공간의 고립감을 강조"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
        />

        {changedFields.length > 0 ? (
          <div className="reframe-change-list">
            {changedFields.map(({ key, label }) => (
              <div key={key} className="reframe-change-item">
                <span className="label">{label}</span>
                <span className="from">{baseCir[key] || 'Auto'}</span>
                <span className="arrow">→</span>
                <span className="to">{targetCir[key] || 'Auto'}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="reframe-no-change">변경된 속성이 없습니다. 현재 CIR 그대로 재생성됩니다.</div>
        )}

        <button className={`reframe-apply-btn ${loading ? 'loading' : ''}`} onClick={handleReframe} disabled={loading}>
          {loading ? 'REFRAMING...' : 'APPLY REFRAME'}
        </button>

        {error && <div className="reframe-error">{error}</div>}
      </div>
    </div>
  )
}
