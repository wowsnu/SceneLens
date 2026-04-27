import { useEffect, useMemo, useState } from 'react'
import useStore from '../store/useStore'
import { reframeSketch, vectorizeImage } from '../services/api'
import './ReframeTab.css'

const FIELD_CONFIG = [
  {
    key: 'shotSize',
    label: 'Shot Size',
    hint: '프레이밍 크기를 시각적으로 바꿉니다.',
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
    hint: '인물을 어느 방향에서 보는지 정합니다.',
    options: ['Frontal', 'Three-Quarter', 'Profile', 'Rear'],
  },
  {
    key: 'verticalLevel',
    label: 'Vertical Level',
    hint: '카메라 높이와 시선 압박감을 조절합니다.',
    options: ['High', 'Eye', 'Low', 'Top-Down', 'Ground'],
  },
  {
    key: 'viewpointFraming',
    label: 'Viewpoint',
    hint: '누구의 시점처럼 느껴질지 정합니다.',
    options: ['Objective', 'OTS', 'POV'],
  },
  {
    key: 'occlusion',
    label: 'Occlusion',
    hint: '가려짐을 통해 거리감과 긴장을 만듭니다.',
    options: ['None', 'Partial', 'Heavy'],
  },
  {
    key: 'depth',
    label: 'Depth',
    hint: '초점 심도로 피사체 분리를 만듭니다.',
    options: ['', 'Shallow', 'Deep'],
  },
  {
    key: 'motionHint',
    label: 'Motion',
    hint: '카메라 움직임의 느낌을 지정합니다.',
    options: ['Static', 'Pan', 'Tilt', 'Track', 'Zoom', 'Handheld'],
  },
]

const OPTION_VISUALS = {
  shotSize: {
    'Extreme Close-Up': {
      image: '/img/new_ecu.png',
      eyebrow: 'Detail',
      description: '얼굴의 일부만 꽉 차게',
    },
    'Close-Up': {
      image: '/img/new_cu.png',
      eyebrow: 'Emotion',
      description: '표정과 감정을 전면으로',
    },
    'Medium Close-Up': {
      image: '/img/new_mcu.png',
      eyebrow: 'Dialogue',
      description: '상반신 중심의 대화 샷',
    },
    'Medium Shot': {
      image: '/img/new_ms.png',
      eyebrow: 'Gesture',
      description: '몸짓과 관계가 읽히는 거리',
    },
    'Medium Long Shot': {
      image: '/img/new_mls.png',
      eyebrow: 'Body',
      description: '무릎 아래까지 읽히는 거리',
      accent: 'linear-gradient(135deg, rgba(222, 184, 135, 0.25), rgba(245, 158, 11, 0.18))',
    },
    'Long Shot': {
      image: '/img/new_ls.png',
      eyebrow: 'Space',
      description: '환경과 인물의 균형',
    },
    'Extreme Wide Shot': {
      image: '/img/new_ews.png',
      eyebrow: 'Scale',
      description: '공간이 압도하는 구도',
    },
  },
  horizontalAngle: {
    Frontal: {
      image: '/img/new_frontal.png',
      eyebrow: 'Confront',
      description: '정면에서 힘 대결을 강조',
    },
    'Three-Quarter': {
      image: '/img/new_three_quarter.png',
      eyebrow: 'Natural',
      description: '가장 자연스러운 입체감',
    },
    Profile: {
      image: '/img/new_profile.png',
      eyebrow: 'Graphic',
      description: '실루엣이 강한 옆모습',
    },
    Rear: {
      image: '/img/rear_angle.png',
      eyebrow: 'Mystery',
      description: '등 뒤에서 심리적 거리감',
      accent: 'linear-gradient(135deg, rgba(107, 114, 128, 0.32), rgba(31, 41, 55, 0.28))',
    },
  },
  verticalLevel: {
    High: {
      image: '/img/high_angle.png',
      eyebrow: 'Observe',
      description: '위에서 내려보며 작게',
    },
    Eye: {
      image: '/img/new_eye.png',
      eyebrow: 'Neutral',
      description: '눈높이의 기본 구도',
    },
    Low: {
      image: '/img/new_low.png',
      eyebrow: 'Power',
      description: '올려다보며 위압감',
    },
    'Top-Down': {
      image: '/img/top_down.png',
      eyebrow: 'Planar',
      description: '완전히 내려찍는 오버헤드',
      accent: 'linear-gradient(135deg, rgba(56, 189, 248, 0.22), rgba(14, 165, 233, 0.14))',
    },
    Ground: {
      image: '/img/ground_level.png',
      eyebrow: 'Floor',
      description: '바닥 가까이에서 올려봄',
      accent: 'linear-gradient(135deg, rgba(120, 113, 108, 0.3), rgba(63, 63, 70, 0.24))',
    },
  },
  viewpointFraming: {
    Objective: {
      image: '/img/ref_diner.png',
      eyebrow: 'Detached',
      description: '중립적인 관찰자 시점',
    },
    OTS: {
      image: '/img/ots_shot.png',
      eyebrow: 'Relation',
      description: '어깨 너머로 관계를 강조',
    },
    POV: {
      image: '/img/pov_shot.png',
      eyebrow: 'Subjective',
      description: '인물의 눈으로 직접 보기',
      accent: 'linear-gradient(135deg, rgba(16, 185, 129, 0.24), rgba(6, 182, 212, 0.16))',
    },
  },
  occlusion: {
    None: {
      image: '/img/ref_diner.png',
      eyebrow: 'Clear',
      description: '가림 없이 정면 노출',
    },
    Partial: {
      image: '/img/alt_canted.png',
      eyebrow: 'Layered',
      description: '전경 일부로 깊이 추가',
    },
    Heavy: {
      image: '/img/heavy_occlusion.png',
      eyebrow: 'Conceal',
      description: '좁은 틈으로 훔쳐보는 느낌',
      accent: 'linear-gradient(135deg, rgba(239, 68, 68, 0.24), rgba(120, 53, 15, 0.24))',
    },
  },
  depth: {
    '': {
      eyebrow: 'Auto',
      description: '분석 결과에 맡기기',
      accent: 'linear-gradient(135deg, rgba(148, 163, 184, 0.22), rgba(71, 85, 105, 0.16))',
    },
    Shallow: {
      image: '/img/new_shallow.png',
      eyebrow: 'Focus',
      description: '주인공만 또렷하게 분리',
      accent: 'linear-gradient(135deg, rgba(59, 130, 246, 0.22), rgba(99, 102, 241, 0.18))',
    },
    Deep: {
      image: '/img/new_deep.png',
      eyebrow: 'Space',
      description: '전경부터 배경까지 선명하게',
      accent: 'linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(249, 115, 22, 0.16))',
    },
  },
  motionHint: {
    Static: {
      image: '/img/new_static.png',
      eyebrow: 'Locked',
      description: '정지된 구도로 긴장 유지',
    },
    Pan: {
      image: '/img/new_pan.png',
      eyebrow: 'Sweep',
      description: '좌우로 훑는 움직임',
      accent: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.14))',
    },
    Tilt: {
      image: '/img/new_tilt.png',
      eyebrow: 'Tilt',
      description: '상하로 쓸어 올리는 감각',
    },
    Track: {
      image: '/img/new_track.png',
      eyebrow: 'Follow',
      description: '대상과 함께 따라 움직임',
      accent: 'linear-gradient(135deg, rgba(244, 114, 182, 0.2), rgba(236, 72, 153, 0.14))',
    },
    Zoom: {
      image: '/img/new_zoom.png',
      eyebrow: 'Push',
      description: '안으로 밀고 들어가는 압박',
    },
    Handheld: {
      image: '/img/new_handheld.png',
      eyebrow: 'Raw',
      description: '거친 현장감과 불안정성',
    },
  },
}

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

function getOptionVisual(fieldKey, option) {
  return OPTION_VISUALS[fieldKey]?.[option] || {
    eyebrow: 'Option',
    description: option || 'Auto',
    accent: 'linear-gradient(135deg, rgba(71, 85, 105, 0.22), rgba(30, 41, 59, 0.18))',
  }
}

function getFieldPreviewOptions(fieldKey, options) {
  const visualOptions = options.filter((option) => getOptionVisual(fieldKey, option).image)
  return visualOptions.length > 0 ? visualOptions : options
}

function formatHistoryTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
  const reframeHistory = useStore((s) => s.reframeHistory)
  const addReframeHistoryEntry = useStore((s) => s.addReframeHistoryEntry)
  const comparePreview = useStore((s) => s.comparePreview)
  const setComparePreview = useStore((s) => s.setComparePreview)
  const clearComparePreview = useStore((s) => s.clearComparePreview)

  const [targetCir, setTargetCir] = useState(DEFAULT_CIR)
  const [model, setModel] = useState('gemini-2.5-flash-image')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [vectorizingId, setVectorizingId] = useState('')
  const [expandedFields, setExpandedFields] = useState(() => (
    FIELD_CONFIG.reduce((acc, field) => ({ ...acc, [field.key]: false }), {})
  ))
  const [previewIndexes, setPreviewIndexes] = useState(() => (
    FIELD_CONFIG.reduce((acc, field) => ({ ...acc, [field.key]: 0 }), {})
  ))
  const [hoveredField, setHoveredField] = useState('')

  const currentShot = strategies[activeStrategy]?.shots?.[activeShot]
  const shotHistoryKey = `${activeStrategy}-${activeShot}`
  const historyEntries = reframeHistory[shotHistoryKey] || []

  const baseCir = useMemo(() => {
    if (analysisResult?.cir) return normalizeCir(analysisResult.cir)
    if (currentShot?.cir) return normalizeCir(currentShot.cir)
    return DEFAULT_CIR
  }, [analysisResult, currentShot])

  const baseCirSource = analysisResult?.cir
    ? 'Analyzed CIR'
    : currentShot?.cir
      ? 'Shot CIR'
      : 'Default CIR'

  useEffect(() => {
    setTargetCir(baseCir)
  }, [baseCir, activeShot, activeStrategy])

  useEffect(() => {
    if (!hoveredField) return undefined

    const field = FIELD_CONFIG.find(({ key }) => key === hoveredField)
    if (!field) return undefined

    const timer = window.setInterval(() => {
      setPreviewIndexes((prev) => {
        const previewOptions = getFieldPreviewOptions(field.key, field.options)
        return {
          ...prev,
          [field.key]: ((prev[field.key] || 0) + 1) % Math.max(previewOptions.length, 1),
        }
      })
    }, 2500)

    return () => window.clearInterval(timer)
  }, [hoveredField])

  const changedFields = useMemo(() => {
    return FIELD_CONFIG.filter(({ key }) => (targetCir[key] || '') !== (baseCir[key] || ''))
  }, [targetCir, baseCir])

  const currentVersionImage = canvasDataUrl || currentShot?.image || null

  const updateField = (key, value) => {
    setTargetCir((prev) => ({ ...prev, [key]: value }))
  }

  const toggleField = (key) => {
    setExpandedFields((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const getStaticPreviewOption = (key, options) => {
    const preferred = targetCir[key] || baseCir[key]
    if (preferred && options.includes(preferred)) return preferred

    const previewOptions = getFieldPreviewOptions(key, options)
    return previewOptions[0] ?? options[0]
  }

  const startFieldPreview = (key, options) => {
    const previewOptions = getFieldPreviewOptions(key, options)
    const staticOption = getStaticPreviewOption(key, options)
    const staticIndex = previewOptions.findIndex((option) => option === staticOption)

    setHoveredField(key)
    setPreviewIndexes((prev) => ({
      ...prev,
      [key]: staticIndex >= 0 ? staticIndex : 0,
    }))
  }

  const applyHistoryEntry = (entry) => {
    if (!entry?.image) return

    clearComparePreview()
    setPendingCanvasImage(entry.image)
    setCanvasDataUrl(entry.image)
    if (entry.cir) {
      setTargetCir(normalizeCir(entry.cir))
    }

    const updated = strategies.map((strategy, strategyIdx) => {
      if (strategyIdx !== activeStrategy) return strategy
      const shots = [...strategy.shots]
      if (!shots[activeShot]) return strategy

      shots[activeShot] = {
        ...shots[activeShot],
        image: entry.image,
        cir: entry.cir ? { ...shots[activeShot].cir, ...entry.cir } : shots[activeShot].cir,
        theory_rationale: entry.description || shots[activeShot].theory_rationale,
      }

      return { ...strategy, shots }
    })

    setStrategies(updated)
  }

  const applyCommittedImage = ({ image, cir, description }) => {
    setPendingCanvasImage(image)
    setCanvasDataUrl(image)
    if (cir) {
      setTargetCir(normalizeCir(cir))
    }

    const updated = strategies.map((strategy, strategyIdx) => {
      if (strategyIdx !== activeStrategy) return strategy
      const shots = [...strategy.shots]
      if (!shots[activeShot]) return strategy

      shots[activeShot] = {
        ...shots[activeShot],
        image,
        cir: cir ? { ...shots[activeShot].cir, ...cir } : shots[activeShot].cir,
        theory_rationale: description || shots[activeShot].theory_rationale,
      }

      return { ...strategy, shots }
    })

    setStrategies(updated)
  }

  const handleApplyCompare = () => {
    if (!comparePreview?.candidateImage) return
    applyCommittedImage({
      image: comparePreview.candidateImage,
      cir: comparePreview.candidateCir,
      description: comparePreview.description,
    })
    clearComparePreview()
  }

  const handleKeepOriginal = () => {
    clearComparePreview()
  }

  const handleVectorizeHistoryEntry = async (entry) => {
    if (!entry?.image || vectorizingId) return
    if (entry.image.startsWith('data:image/svg+xml')) {
      applyHistoryEntry(entry)
      return
    }

    setVectorizingId(entry.id)
    setError('')

    try {
      const base64 = entry.image.startsWith('data:') ? entry.image.split(',')[1] : entry.image
      const result = await vectorizeImage(base64)
      const svgDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(result.svg)}`
      const existingSvg = historyEntries.find((item) => item.image === svgDataUrl)

      if (!existingSvg) {
        addReframeHistoryEntry(activeStrategy, activeShot, {
          image: svgDataUrl,
          cir: entry.cir,
          changedFields: entry.changedFields || [],
          description: entry.description || '',
          label: `${entry.label} SVG`,
          source: 'vectorized',
        })
      }

      applyCommittedImage({
        image: svgDataUrl,
        cir: entry.cir,
        description: entry.description,
      })
    } catch (err) {
      setError(err.message || 'SVG 변환 중 오류가 발생했습니다.')
    } finally {
      setVectorizingId('')
    }
  }

  const handleReframe = async () => {
    if (loading) return
    if (changedFields.length === 0) {
      setError('변경된 구도가 없습니다. 속성을 하나 이상 바꾼 뒤 Reframe 하세요.')
      return
    }
    if (!canvasDataUrl) {
      setError('먼저 캔버스에 스케치를 불러오거나 그려주세요.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const imageBase64 = canvasDataUrl.split(',')[1]
      const scriptContext = pickBeatScript(screenplay, activeBeat)
      const reframeCount = historyEntries.filter((entry) => entry.source === 'reframe').length + 1

      addReframeHistoryEntry(activeStrategy, activeShot, {
        image: canvasDataUrl,
        cir: baseCir,
        changedFields: [],
        description: currentShot?.theory_rationale || '',
        label: historyEntries.length === 0 ? 'Original' : 'Source',
        source: 'source',
      })

      const result = await reframeSketch(
        imageBase64,
        targetCir,
        scriptContext,
        baseCir,
        model,
        intent || '',
      )

      const reframedDataUrl = `data:image/png;base64,${result.reframed_image}`

      addReframeHistoryEntry(activeStrategy, activeShot, {
        image: reframedDataUrl,
        cir: targetCir,
        changedFields: changedFields.map(({ key, label }) => ({
          key,
          label,
          from: baseCir[key] || 'Auto',
          to: targetCir[key] || 'Auto',
        })),
        description: result.description || '',
        label: `Reframe ${reframeCount}`,
        source: 'reframe',
      })

      setComparePreview({
        shotKey: shotHistoryKey,
        originalImage: canvasDataUrl,
        candidateImage: reframedDataUrl,
        candidateCir: targetCir,
        changedFields: changedFields.map(({ key, label }) => ({
          key,
          label,
          from: baseCir[key] || 'Auto',
          to: targetCir[key] || 'Auto',
        })),
        description: result.description || '',
        createdAt: new Date().toISOString(),
      })
    } catch (err) {
      setError(err.message || 'Reframe 요청 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const hasAnalysis = !!analysisResult?.cir

  return (
    <div className="reframe-tab scrollable">
      <div className="reframe-section">
        <h3>Target Reframe</h3>

        <p className="reframe-desc">
          {hasAnalysis
            ? '분석된 구도를 기준으로 수정하고 재생성합니다.'
            : '분석 전에도 속성을 살펴볼 수 있습니다. 현재 샷 값 또는 기본값을 기준으로 표시합니다.'}
        </p>
        <div className="reframe-fields">
          {FIELD_CONFIG.map(({ key, label, hint, options }) => {
            const isChanged = (targetCir[key] || '') !== (baseCir[key] || '')
            const isExpanded = !!expandedFields[key]
            const previewOptions = getFieldPreviewOptions(key, options)
            const staticPreviewOption = getStaticPreviewOption(key, options)
            const previewOption = hoveredField === key
              ? previewOptions[previewIndexes[key] % previewOptions.length] ?? staticPreviewOption
              : staticPreviewOption
            const previewVisual = getOptionVisual(key, previewOption)

            return (
              <section
                className={`reframe-field reframe-field--accordion ${isExpanded ? 'is-expanded' : ''} ${isChanged ? 'is-changed' : ''}`}
                key={key}
              >
                <button
                  type="button"
                  className="reframe-field-cover"
                  onClick={() => toggleField(key)}
                  onMouseEnter={() => startFieldPreview(key, options)}
                  onMouseLeave={() => setHoveredField('')}
                  onFocus={() => startFieldPreview(key, options)}
                  onBlur={() => setHoveredField('')}
                  aria-expanded={isExpanded}
                >
                  <div
                    className={`reframe-cover-visual ${previewVisual.image ? 'has-image' : 'is-abstract'}`}
                    style={previewVisual.image ? undefined : { background: previewVisual.accent }}
                  >
                    {previewVisual.image ? (
                      <img src={previewVisual.image} alt={`${label} ${previewOption || 'Auto'} preview`} />
                    ) : (
                      <div className="reframe-option-abstract">
                        <span>{previewVisual.eyebrow}</span>
                      </div>
                    )}
                    <div className="reframe-cover-overlay">
                      <span>{previewVisual.eyebrow}</span>
                      <strong>{previewOption || 'Auto'}</strong>
                    </div>
                  </div>

                  <div className="reframe-cover-copy">
                    <div className="reframe-cover-title-row">
                      <span className="reframe-cover-title">{label}</span>
                      <span className="reframe-cover-toggle" aria-hidden="true">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d={isExpanded ? 'M7 14l5-5 5 5' : 'M7 10l5 5 5-5'} />
                        </svg>
                      </span>
                    </div>
                    <p>{hint}</p>
                    <div className="reframe-cover-meta">
                      <span>{baseCirSource}: {baseCir[key] || 'Auto'}</span>
                      {isChanged && <strong>Target: {targetCir[key] || 'Auto'}</strong>}
                    </div>
                    <div className="reframe-cover-effect">{previewVisual.description}</div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="reframe-field-body">
                    <div className="reframe-field-analysis">
                      <span>{baseCirSource}</span>
                      <strong>{baseCir[key] || 'Auto'}</strong>
                      <p>
                        {hasAnalysis
                          ? 'Analyze 결과에서 읽은 현재 구도입니다.'
                          : '아직 Analyze 전이라 저장된 샷 정보 또는 기본 구도를 기준으로 보여줍니다.'}
                      </p>
                    </div>
                    <div className={`reframe-card-grid ${isChanged ? 'reframe-card-grid--changed' : ''}`}>
                      {options.map((opt) => {
                        const visual = getOptionVisual(key, opt)
                        const isSelected = (targetCir[key] || '') === opt
                        const isBase = (baseCir[key] || '') === opt
                        return (
                          <button
                            type="button"
                            key={opt || 'auto'}
                            className={`reframe-option-card ${isSelected ? 'is-selected' : ''} ${isBase ? 'is-base' : ''}`}
                            onClick={() => updateField(key, opt)}
                          >
                            <div
                              className={`reframe-option-visual ${visual.image ? 'has-image' : 'is-abstract'}`}
                              style={visual.image ? undefined : { background: visual.accent }}
                            >
                              {visual.image ? (
                                <img src={visual.image} alt={`${label} ${opt || 'Auto'} example`} />
                              ) : (
                                <div className="reframe-option-abstract">
                                  <span>{visual.eyebrow}</span>
                                </div>
                              )}
                              <div className="reframe-option-overlay">
                                <span className="reframe-option-eyebrow">{visual.eyebrow}</span>
                              </div>
                            </div>
                            <div className="reframe-option-copy">
                              <strong>{opt || 'Auto'}</strong>
                              <span>{visual.description}</span>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </section>
            )
          })}
        </div>

      </div>

      <div className="reframe-section">
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

        <label className="reframe-field" style={{ marginTop: 8, marginBottom: 8 }}>
          <span>Model</span>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="gemini-2.5-flash-image">gemini-2.5-flash-image</option>
            <option value="gemini-3.1-flash-image-preview">gemini-3.1-flash-image-preview</option>
            <option value="gpt-image-1.5">gpt-image-1.5</option>
          </select>
        </label>

        <button
          className={`reframe-apply-btn ${loading ? 'loading' : ''}`}
          onClick={handleReframe}
          disabled={loading || changedFields.length === 0}
          title={changedFields.length === 0 ? '속성을 하나 이상 변경해야 합니다.' : undefined}
        >
          {loading ? 'REFRAMING...' : 'APPLY REFRAME'}
        </button>

        {error && <div className="reframe-error">{error}</div>}
      </div>

      {comparePreview?.shotKey === shotHistoryKey && (
        <div className="reframe-section reframe-compare-panel">
          <div className="reframe-history-header">
            <div>
              <h3>Compare View</h3>
              <p>중앙 캔버스에서 원본과 리프레임 결과를 반반 비교 중입니다.</p>
            </div>
            <span className="reframe-history-count">Preview</span>
          </div>
          {comparePreview.changedFields?.length > 0 && (
            <div className="reframe-history-changes">
              {comparePreview.changedFields.map((field) => (
                <span key={`compare-${field.key}`} className="reframe-history-chip">
                  {field.label}: {field.from} → {field.to}
                </span>
              ))}
            </div>
          )}
          <div className="reframe-compare-actions">
            <button type="button" className="reframe-compare-btn primary" onClick={handleApplyCompare}>
              Apply Reframe
            </button>
            <button type="button" className="reframe-compare-btn" onClick={handleKeepOriginal}>
              Keep Original
            </button>
          </div>
        </div>
      )}

      <div className="reframe-section">
        <div className="reframe-history-header">
          <div>
            <h3>Reframe History</h3>
            <p>이 샷에서 만든 리프레임 결과를 계속 보관합니다. 클릭하면 다시 캔버스로 불러옵니다.</p>
          </div>
          {historyEntries.length > 0 && (
            <span className="reframe-history-count">{historyEntries.length} versions</span>
          )}
        </div>

        {historyEntries.length === 0 ? (
          <div className="reframe-history-empty">아직 저장된 리프레임 버전이 없습니다.</div>
        ) : (
          <div className="reframe-history-list">
            {[...historyEntries].reverse().map((entry) => {
              const isCurrent = currentVersionImage === entry.image
              const isSvg = entry.image?.startsWith('data:image/svg+xml')
              const isVectorizing = vectorizingId === entry.id
              return (
                <div
                  key={entry.id}
                  className={`reframe-history-card ${isCurrent ? 'is-current' : ''}`}
                >
                  <button
                    type="button"
                    className="reframe-history-main"
                    onClick={() => applyHistoryEntry(entry)}
                  >
                  <div className="reframe-history-thumb">
                    <img src={entry.image} alt={entry.label} />
                    <div className="reframe-history-overlay">
                      <span>{entry.label}</span>
                    </div>
                  </div>
                  <div className="reframe-history-copy">
                    <div className="reframe-history-meta">
                      <strong>{entry.label}</strong>
                      <span>{formatHistoryTime(entry.createdAt)}</span>
                    </div>
                    {entry.changedFields?.length > 0 ? (
                      <div className="reframe-history-changes">
                        {entry.changedFields.map((field) => (
                          <span key={`${entry.id}-${field.key}`} className="reframe-history-chip">
                            {field.label}: {field.to}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="reframe-history-caption">원본 또는 직전 기준 스케치</div>
                    )}
                  </div>
                  </button>
                  <div className="reframe-history-actions">
                    <button type="button" className="reframe-history-action-btn" onClick={() => applyHistoryEntry(entry)}>
                      Use This
                    </button>
                    <button
                      type="button"
                      className={`reframe-history-action-btn ${isSvg ? 'svg-ready' : ''}`}
                      onClick={() => handleVectorizeHistoryEntry(entry)}
                      disabled={isVectorizing}
                    >
                      {isVectorizing ? 'Vectorizing...' : isSvg ? 'Open SVG' : 'Vectorize SVG'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
