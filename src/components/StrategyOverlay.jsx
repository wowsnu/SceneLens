import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useStore from '../store/useStore'
import { reframeSketch } from '../services/api'
import './StrategyOverlay.css'

const LABELS = ['A', 'B', 'C']
const COLORS = ['#10b981', '#8b5cf6', '#ef4444']

// 영화 레퍼런스 mock 데이터
const FILM_REFS = [
  { title: 'No Country for Old Men', scene: 'Gas Station — Chigurh confronts proprietor', src: '/img/ref_interrogation.png' },
  { title: 'The Godfather', scene: 'Office scene — Don Corleone OTS', src: '/img/ots_shot.png' },
  { title: 'There Will Be Blood', scene: 'Low angle — Plainview dominance', src: '/img/low_angle.png' },
  { title: 'Mulholland Drive', scene: 'Close-up — emotional pressure', src: '/img/closeup_woman.png' },
  { title: 'Citizen Kane', scene: 'Deep focus — Kane at window', src: '/img/wide_establishing.png' },
  { title: 'Parasite', scene: 'High angle — underground staircase', src: '/img/high_angle.png' },
  { title: '2001: A Space Odyssey', scene: 'Top-down — symmetrical composition', src: '/img/top_down.png' },
  { title: 'Oldboy', scene: 'Corridor tracking shot', src: '/img/track_motion.png' },
  { title: 'The Shining', scene: 'Handheld — Danny hallway', src: '/img/alt_handheld.png' },
]

function pickFilmRefs(proposalIdx) {
  const offset = proposalIdx * 3
  return [
    FILM_REFS[offset % FILM_REFS.length],
    FILM_REFS[(offset + 1) % FILM_REFS.length],
    FILM_REFS[(offset + 2) % FILM_REFS.length],
  ]
}

// CIR 값 → 레퍼런스 이미지 매핑
const CIR_IMAGE_MAP = {
  shotSize: {
    'Extreme Close-Up': '/img/extreme_closeup.png',
    'Close-Up': '/img/closeup_woman.png',
    'Medium Close-Up': '/img/closeup_man.png',
    'Medium Shot': '/img/medium_twoshot.png',
    'Long Shot': '/img/wide_establishing.png',
    'Extreme Wide Shot': '/img/wide_establishing.png',
  },
  verticalLevel: {
    'High': '/img/high_angle.png',
    'Top-Down': '/img/high_angle.png',
    'Low': '/img/low_angle.png',
  },
  viewpointFraming: {
    'OTS': '/img/ots_shot.png',
    'POV': '/img/ref_diner.png',
    'Objective': '/img/ref_closeup.png',
  },
  motionHint: {
    'Handheld': '/img/alt_handheld.png',
    'Zoom': '/img/alt_pushin.png',
  },
}

function getImageForValue(key, value) {
  return CIR_IMAGE_MAP[key]?.[value] || null
}

function getChangedImagePairs(currentCir, nextCir) {
  if (!currentCir || !nextCir) return []
  const pairs = []
  for (const key of ['shotSize', 'verticalLevel', 'viewpointFraming', 'motionHint']) {
    const from = currentCir[key]
    const to = nextCir[key]
    if (!from || !to || from === to) continue
    const fromImg = getImageForValue(key, from)
    const toImg = getImageForValue(key, to)
    if (fromImg || toImg) {
      pairs.push({ key, label: FIELD_LABELS[key] || key, from, to, fromImg, toImg })
    }
  }
  return pairs
}

const FIELD_LABELS = {
  shotSize: 'Shot Size',
  horizontalAngle: 'Horizontal Angle',
  verticalLevel: 'Vertical Level',
  viewpointFraming: 'Viewpoint',
  occlusion: 'Occlusion',
  depth: 'Depth',
  motionHint: 'Motion',
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

const AUTO_REFRAME_MODEL = 'gpt-image-1.5'

const FRIENDLY_FIELD_LABELS = {
  shotSize: '샷 크기',
  horizontalAngle: '카메라 각도',
  verticalLevel: '카메라 높이',
  viewpointFraming: '시점',
  occlusion: '가림',
  depth: '심도',
  motionHint: '움직임',
}

const TAG_LABELS = {
  tension: '긴장',
  emotion: '감정',
  intimacy: '친밀감',
  confrontation: '대립',
  power: '권력감',
  isolation: '고립감',
  suspense: '서스펜스',
  distance: '거리감',
  pressure: '압박감',
  vulnerability: '취약함',
}

function splitSentences(text = '') {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean)
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

function listify(items = []) {
  if (items.length <= 1) return items[0] || ''
  if (items.length === 2) return `${items[0]}와 ${items[1]}`
  return `${items.slice(0, -1).join(', ')} 그리고 ${items[items.length - 1]}`
}

function translateTag(tag = '') {
  return TAG_LABELS[tag] || tag
}

function getChangedFields(currentCir, nextCir) {
  if (!nextCir) return []
  return Object.keys(nextCir).filter((key) => currentCir?.[key] && currentCir[key] !== nextCir[key])
}

function buildRecommendationLine(currentCir, nextCir, proposalName) {
  const changed = getChangedFields(currentCir, nextCir)
  if (!changed.length) {
    return `현재 프레이밍을 유지하면서 "${proposalName}" 방향을 더 강하게 밀어줍니다.`
  }

  const parts = changed.slice(0, 3).map((key) => {
    const label = FRIENDLY_FIELD_LABELS[key] || key
    return `${label}을 ${currentCir[key]}에서 ${nextCir[key]}로 조정`
  })
  return `${listify(parts)}합니다.`
}

function buildTheoryLine(source, rationale) {
  const sentences = splitSentences(rationale)
  const core = sentences[0] || rationale || '선택된 영화 이론을 바탕으로 한 추천입니다.'
  return source ? `${source}: ${core}` : core
}

function pickText(primary, fallback) {
  return primary && primary.trim() ? primary.trim() : fallback
}

function buildConnectionLine(currentCir, nextCir) {
  if (!currentCir) {
    return '현재 구도 분석을 바탕으로 이어지는 추천입니다.'
  }

  const changed = getChangedFields(currentCir, nextCir)
  if (!changed.length) {
    return `현재 프레임은 이미 ${currentCir.shotSize || '현재 샷 크기'}와 ${currentCir.viewpointFraming || '현재 시점'}으로 읽힙니다.`
  }

  const anchors = [
    currentCir.shotSize && `${currentCir.shotSize}`,
    currentCir.viewpointFraming && `${currentCir.viewpointFraming}`,
    currentCir.horizontalAngle && `${currentCir.horizontalAngle}`,
  ].filter(Boolean)
  const changedLabels = changed.slice(0, 2).map((key) => FRIENDLY_FIELD_LABELS[key] || key)
  return `현재 프레임은 ${anchors.join(' + ')}로 읽히므로, ${listify(changedLabels)}을 바꾸면 대비가 더 또렷해집니다.`
}

function buildEffectLine(proposal, rationale) {
  if (proposal.intention_tags?.length) {
    return proposal.intention_tags.slice(0, 3).map(translateTag).join(', ')
  }

  const sentences = splitSentences(rationale)
  const fallback = sentences[1] || sentences[0] || proposal.name
  return fallback
}

function buildChangedFieldPayload(currentCir, nextCir) {
  return getChangedFields(currentCir, nextCir).map((key) => ({
    key,
    label: FIELD_LABELS[key] || key,
    from: currentCir?.[key] || 'Auto',
    to: nextCir?.[key] || 'Auto',
  }))
}

function buildStrategyContext({
  proposal,
  shot,
  recommendationLine,
  theoryLine,
  connectionLine,
  effectLine,
}) {
  return [
    `Strategy Name: ${proposal.name}`,
    `Recommendation: ${recommendationLine}`,
    `Why This Theory Fits: ${theoryLine}`,
    `Connection To Current Shot: ${connectionLine}`,
    `Expected Effect: ${effectLine}`,
    shot?.source ? `Source: ${shot.source}` : '',
    shot?.theory_rationale ? `Full Theory Rationale: ${shot.theory_rationale}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export default function StrategyOverlay() {
  const proposals = useStore((s) => s.proposals)
  const setProposals = useStore((s) => s.setProposals)
  const showStrategyOverlay = useStore((s) => s.showStrategyOverlay)
  const setShowStrategyOverlay = useStore((s) => s.setShowStrategyOverlay)
  const setStrategies = useStore((s) => s.setStrategies)
  const setActiveStrategy = useStore((s) => s.setActiveStrategy)
  const setActiveShot = useStore((s) => s.setActiveShot)
  const setIsGenerating = useStore((s) => s.setIsGenerating)
  const canvasDataUrl = useStore((s) => s.canvasDataUrl)
  const analysisResult = useStore((s) => s.analysisResult)
  const screenplay = useStore((s) => s.screenplay)
  const activeBeat = useStore((s) => s.activeBeat)
  const intent = useStore((s) => s.intent)
  const addReframeHistoryEntry = useStore((s) => s.addReframeHistoryEntry)
  const setComparePreview = useStore((s) => s.setComparePreview)
  const clearComparePreview = useStore((s) => s.clearComparePreview)
  const setCenterTab = useStore((s) => s.setCenterTab)
  const overlayRef = useRef(null)
  const [loadingStrategyIdx, setLoadingStrategyIdx] = useState(null)
  const [flippedStrategyIdx, setFlippedStrategyIdx] = useState(null)
  const [strategyError, setStrategyError] = useState('')

  useEffect(() => {
    if (!showStrategyOverlay) return
    const handleKey = (e) => {
      if (e.key === 'Escape' && loadingStrategyIdx === null) setShowStrategyOverlay(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showStrategyOverlay, setShowStrategyOverlay, loadingStrategyIdx])

  useEffect(() => {
    if (loadingStrategyIdx === null) {
      setFlippedStrategyIdx(null)
      return
    }
    const timer = window.setTimeout(() => {
      setFlippedStrategyIdx(loadingStrategyIdx)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [loadingStrategyIdx])

  const currentCir = useMemo(
    () => normalizeCir(analysisResult?.cir || {}),
    [analysisResult]
  )

  if (!showStrategyOverlay) return null

  const handleSelect = async (idx) => {
    if (loadingStrategyIdx !== null) return
    const proposal = proposals[idx]
    const shot = proposal?.shots?.[0]

    if (!canvasDataUrl || !shot?.cir) {
      setStrategyError('현재 스케치와 추천 샷 정보가 필요합니다.')
      return
    }

    const targetCir = normalizeCir(shot.cir)
    const recommendationLine = pickText(
      shot?.recommendation_summary,
      buildRecommendationLine(currentCir, targetCir, proposal.name)
    )
    const theoryLine = pickText(
      shot?.theory_fit_summary,
      buildTheoryLine(shot?.source, shot?.theory_rationale)
    )
    const connectionLine = pickText(
      shot?.current_shot_connection,
      buildConnectionLine(currentCir, targetCir)
    )
    const effectLine = pickText(
      shot?.expected_effect_summary,
      buildEffectLine(proposal, shot?.theory_rationale)
    )
    const strategyContext = buildStrategyContext({
      proposal,
      shot,
      recommendationLine,
      theoryLine,
      connectionLine,
      effectLine,
    })
    const changedFields = buildChangedFieldPayload(currentCir, targetCir)
    const scriptContext = pickBeatScript(screenplay, activeBeat)
    const imageBase64 = canvasDataUrl.startsWith('data:') ? canvasDataUrl.split(',')[1] : canvasDataUrl
    const nextStrategies = proposals.map((item) => ({
      ...item,
      shots: (item.shots || []).map((proposalShot, shotIdx) => ({
        ...proposalShot,
        image: shotIdx === 0 ? canvasDataUrl : proposalShot.image,
      })),
    }))

    const cached = proposal.cachedReframe
    const compareBase = {
      shotKey: `${idx}-0`,
      originalImage: canvasDataUrl,
      candidateCir: targetCir,
      changedFields,
      strategyName: proposal.name,
      recommendationLine,
      theoryLine,
      connectionLine,
      effectLine,
      fullTheoryNote: shot?.theory_rationale || '',
      source: shot?.source || '',
      filmRefs: pickFilmRefs(idx),
    }

    setStrategyError('')
    setCenterTab('canvas')
    clearComparePreview()
    setShowStrategyOverlay(false)

    // 캐시된 결과가 있으면 바로 표시
    if (cached) {
      setStrategies(nextStrategies)
      setActiveStrategy(idx)
      setActiveShot(0)
      setComparePreview({
        ...compareBase,
        candidateImage: cached.reframedDataUrl,
        description: cached.description,
        createdAt: cached.createdAt,
        loading: false,
      })
      return
    }

    setLoadingStrategyIdx(idx)
    setIsGenerating(true)
    setComparePreview({
      ...compareBase,
      candidateImage: null,
      description: '',
      createdAt: new Date().toISOString(),
      loading: true,
    })

    try {
      addReframeHistoryEntry(idx, 0, {
        image: canvasDataUrl,
        cir: currentCir,
        changedFields: [],
        description: shot?.theory_rationale || '',
        label: 'Original',
        source: 'source',
      })

      const result = await reframeSketch(
        imageBase64,
        targetCir,
        scriptContext,
        currentCir,
        AUTO_REFRAME_MODEL,
        intent || '',
        strategyContext,
      )

      const reframedDataUrl = `data:image/png;base64,${result.reframed_image}`
      const description = result.description || shot?.theory_rationale || ''
      const createdAt = new Date().toISOString()

      // 캐시에 저장
      const updatedProposals = proposals.map((p, i) =>
        i === idx ? { ...p, cachedReframe: { reframedDataUrl, description, createdAt } } : p
      )
      setProposals(updatedProposals)

      addReframeHistoryEntry(idx, 0, {
        image: reframedDataUrl,
        cir: targetCir,
        changedFields,
        description,
        label: 'Strategy Preview',
        source: 'reframe',
      })

      setStrategies(nextStrategies)
      setActiveStrategy(idx)
      setActiveShot(0)
      setComparePreview({
        ...compareBase,
        candidateImage: reframedDataUrl,
        description,
        createdAt,
        loading: false,
      })
    } catch (err) {
      const message = err.message || '전략 기반 이미지 생성 중 오류가 발생했습니다.'
      setComparePreview({
        shotKey: `${idx}-0`,
        originalImage: canvasDataUrl,
        candidateImage: null,
        candidateCir: targetCir,
        changedFields,
        description: '',
        createdAt: new Date().toISOString(),
        loading: false,
        error: message,
        strategyName: proposal.name,
        recommendationLine,
        theoryLine,
        connectionLine,
        effectLine,
        fullTheoryNote: shot?.theory_rationale || '',
        source: shot?.source || '',
      })
      setStrategyError(message)
    } finally {
      setIsGenerating(false)
      setLoadingStrategyIdx(null)
    }
  }

  const overlayContent = (
    <div
      className="strategy-overlay-backdrop"
      onClick={(e) => {
        if (e.target === overlayRef.current && loadingStrategyIdx === null) setShowStrategyOverlay(false)
      }}
      ref={overlayRef}
    >
      <div className="strategy-overlay-panel">
        {/* Header */}
        <div className="strategy-overlay-header">
          <div className="strategy-overlay-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            AI 추천 전략
          </div>
          <button
            className="strategy-overlay-close"
            onClick={() => loadingStrategyIdx === null && setShowStrategyOverlay(false)}
            disabled={loadingStrategyIdx !== null}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* Sketch thumbnail */}
        {canvasDataUrl && (
          <div className="strategy-overlay-sketch">
            <img src={canvasDataUrl} alt="Current sketch" />
            <span className="strategy-overlay-sketch-label">Current Sketch</span>
          </div>
        )}

        {strategyError && (
          <div className="strategy-overlay-status strategy-overlay-status--error">
            {strategyError}
          </div>
        )}

        {/* Cards */}
        {proposals.length === 0 ? (
          <div className="strategy-overlay-empty">
            <div className="strategy-overlay-empty-title">추천 전략을 아직 불러오지 못했습니다.</div>
            <div className="strategy-overlay-empty-copy">
              분석이 끝난 뒤 다시 열어보거나, 잠시 후 한 번 더 시도해주세요.
            </div>
          </div>
        ) : (
          <div className="strategy-cards-row">
            {proposals.slice(0, 3).map((proposal, idx) => {
            const color = COLORS[idx]
            const shot = proposal.shots?.[0]
            const proposalCir = shot?.cir ? normalizeCir(shot.cir) : null
            const isGenerating = idx === loadingStrategyIdx
            const isFlipped = idx === flippedStrategyIdx
            const isDimmed = loadingStrategyIdx !== null && !isGenerating
            const recommendationLine = pickText(
              shot?.recommendation_summary,
              buildRecommendationLine(currentCir, proposalCir, proposal.name)
            )
            const theoryLine = pickText(
              shot?.theory_fit_summary,
              buildTheoryLine(shot?.source, shot?.theory_rationale)
            )
            const connectionLine = pickText(
              shot?.current_shot_connection,
              buildConnectionLine(currentCir, proposalCir)
            )
            const effectLine = pickText(
              shot?.expected_effect_summary,
              buildEffectLine(proposal, shot?.theory_rationale)
            )
            return (
              <div
                key={idx}
                className={`strategy-card ${isGenerating ? 'is-generating' : ''} ${isFlipped ? 'is-flipped' : ''} ${isDimmed ? 'is-dimmed' : ''}`}
                style={{ '--card-color': color }}
                onClick={() => handleSelect(idx)}
              >
                <div className="strategy-card-inner">
                  <div className="strategy-card-face strategy-card-face--front">
                    {isGenerating ? (
                      <div className="strategy-card-loading">
                        <div className="strategy-card-badge" style={{ background: color }}>
                          {LABELS[idx]}
                        </div>
                        <div className="strategy-card-name">Generating Strategy {LABELS[idx]}</div>
                        <div className="strategy-card-loading-copy">
                          생성하고 있습니다. 추천된 전략을 반영해서 새로운 프레이밍을 만드는 중입니다.
                        </div>
                        <div className="strategy-card-loading-sub">
                          {recommendationLine}
                        </div>
                        <div className="strategy-card-loading-chips">
                          {buildChangedFieldPayload(currentCir, proposalCir || {}).slice(0, 3).map((field) => (
                            <span key={field.key} className="strategy-card-loading-chip">
                              {field.label}: {field.from} → {field.to}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="strategy-card-header-row">
                          <div className="strategy-card-badge" style={{ background: color }}>
                            {LABELS[idx]}
                          </div>
                          <div className="strategy-card-title-group">
                            <div className="strategy-card-name">
                              {proposal.short_title || proposal.name}
                            </div>
                            {shot?.source && (
                              <div className="strategy-card-source">{shot.source}</div>
                            )}
                          </div>
                        </div>

                        {/* Before/After 이미지 쌍 */}
                        {(() => {
                          const pairs = getChangedImagePairs(currentCir, proposalCir)
                          if (pairs.length === 0) return null
                          return (
                            <div className="strategy-card-image-pairs">
                              {pairs.map((pair) => (
                                <div key={pair.key} className="strategy-card-image-pair">
                                  <div className="strategy-card-image-slot">
                                    {pair.fromImg
                                      ? <img src={pair.fromImg} alt={pair.from} />
                                      : <div className="strategy-card-image-placeholder">{pair.from}</div>
                                    }
                                    <span className="strategy-card-image-label from">{pair.from}</span>
                                  </div>
                                  <div className="strategy-card-image-arrow">→</div>
                                  <div className="strategy-card-image-slot">
                                    {pair.toImg
                                      ? <img src={pair.toImg} alt={pair.to} />
                                      : <div className="strategy-card-image-placeholder">{pair.to}</div>
                                    }
                                    <span className="strategy-card-image-label to" style={{ color }}>
                                      {pair.to}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )
                        })()}

                        {proposal.intention_tags?.length > 0 && (
                          <div className="strategy-card-tags">
                            {proposal.intention_tags.slice(0, 3).map((tag, i) => (
                              <span key={i} className="strategy-card-tag">{translateTag(tag)}</span>
                            ))}
                          </div>
                        )}

                        <div className="strategy-card-sections">
                          <div className="strategy-card-section">
                            <div className="strategy-card-section-label">추천 한 줄</div>
                            <div className="strategy-card-section-text">{recommendationLine}</div>
                          </div>

                          <div className="strategy-card-section">
                            <div className="strategy-card-section-label">이론적 근거</div>
                            <div className="strategy-card-section-text">{theoryLine}</div>
                          </div>

                          <div className="strategy-card-section">
                            <div className="strategy-card-section-label">예상 효과</div>
                            <div className="strategy-card-section-text strategy-card-effect">{effectLine}</div>
                          </div>
                        </div>

                        {/* 영화 레퍼런스 */}
                        <div className="strategy-card-film-refs">
                          <div className="strategy-card-section-label">영화 레퍼런스</div>
                          <div className="strategy-card-film-refs-row">
                            {pickFilmRefs(idx).map((ref, ri) => (
                              <div key={ri} className="strategy-card-film-ref">
                                <div className="strategy-card-film-ref-img-wrap">
                                  <img src={ref.src} alt={ref.title} onError={(e) => { e.target.style.display = 'none' }} />
                                </div>
                                <div className="strategy-card-film-ref-info">
                                  <div className="strategy-card-film-ref-title">{ref.title}</div>
                                  <div className="strategy-card-film-ref-scene">{ref.scene}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="strategy-card-select-btn" style={{ borderColor: color, color }}>
                          이 전략으로 생성
                        </div>
                      </>
                    )}
                  </div>

                  <div className="strategy-card-face strategy-card-face--back">
                    <div className="strategy-card-badge" style={{ background: color }}>
                      {LABELS[idx]}
                    </div>
                    <div className="strategy-card-name">{proposal.name}</div>
                    <div className="strategy-card-back-caption">생성 중 전략 상세</div>
                    <div className="strategy-card-sections strategy-card-sections--dense">
                      <div className="strategy-card-section">
                        <div className="strategy-card-section-label">추천 한 줄</div>
                        <div className="strategy-card-section-text">{recommendationLine}</div>
                      </div>

                      <div className="strategy-card-section">
                        <div className="strategy-card-section-label">이론적 근거</div>
                        <div className="strategy-card-section-text">{theoryLine}</div>
                      </div>

                      <div className="strategy-card-section">
                        <div className="strategy-card-section-label">현재 샷과의 연결</div>
                        <div className="strategy-card-section-text">{connectionLine}</div>
                      </div>

                      <div className="strategy-card-section">
                        <div className="strategy-card-section-label">예상 효과</div>
                        <div className="strategy-card-section-text strategy-card-effect">{effectLine}</div>
                      </div>

                      {shot?.theory_rationale && (
                        <div className="strategy-card-section">
                          <div className="strategy-card-section-label">상세 이론 설명</div>
                          <div className="strategy-card-section-text">
                            {shot.source ? `${shot.source}: ` : ''}{shot.theory_rationale}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
            })}
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(overlayContent, document.body)
}
