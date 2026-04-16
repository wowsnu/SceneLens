import { useEffect, useRef } from 'react'
import useStore from '../store/useStore'
import './StrategyOverlay.css'

const LABELS = ['A', 'B', 'C']
const COLORS = ['#10b981', '#8b5cf6', '#ef4444']

const KEY_FIELDS = [
  { key: 'shotSize', label: 'Shot' },
  { key: 'horizontalAngle', label: 'Angle' },
  { key: 'verticalLevel', label: 'Level' },
  { key: 'viewpointFraming', label: 'Viewpoint' },
]

export default function StrategyOverlay() {
  const proposals = useStore((s) => s.proposals)
  const showStrategyOverlay = useStore((s) => s.showStrategyOverlay)
  const setShowStrategyOverlay = useStore((s) => s.setShowStrategyOverlay)
  const setStrategies = useStore((s) => s.setStrategies)
  const setActiveStrategy = useStore((s) => s.setActiveStrategy)
  const canvasDataUrl = useStore((s) => s.canvasDataUrl)
  const overlayRef = useRef(null)

  useEffect(() => {
    if (!showStrategyOverlay) return
    const handleKey = (e) => {
      if (e.key === 'Escape') setShowStrategyOverlay(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showStrategyOverlay, setShowStrategyOverlay])

  if (!showStrategyOverlay || proposals.length === 0) return null

  const handleSelect = (idx) => {
    // proposals를 strategies로 적용하고 선택된 것을 active로
    setStrategies(proposals)
    setActiveStrategy(idx)
    setShowStrategyOverlay(false)
  }

  return (
    <div
      className="strategy-overlay-backdrop"
      onClick={(e) => {
        if (e.target === overlayRef.current) setShowStrategyOverlay(false)
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
            AI Recommended Strategies
          </div>
          <button className="strategy-overlay-close" onClick={() => setShowStrategyOverlay(false)}>
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

        {/* Cards */}
        <div className="strategy-cards-row">
          {proposals.slice(0, 3).map((proposal, idx) => {
            const color = COLORS[idx]
            const shot = proposal.shots?.[0]
            return (
              <div
                key={idx}
                className="strategy-card"
                style={{ '--card-color': color }}
                onClick={() => handleSelect(idx)}
              >
                <div className="strategy-card-badge" style={{ background: color }}>
                  {LABELS[idx]}
                </div>

                <div className="strategy-card-name">{proposal.name}</div>

                {proposal.intention_tags?.length > 0 && (
                  <div className="strategy-card-tags">
                    {proposal.intention_tags.slice(0, 3).map((tag, i) => (
                      <span key={i} className="strategy-card-tag">{tag}</span>
                    ))}
                  </div>
                )}

                {shot?.cir && (
                  <div className="strategy-card-cir">
                    {KEY_FIELDS.map(({ key, label }) => shot.cir[key] ? (
                      <div key={key} className="strategy-card-cir-row">
                        <span className="cir-row-label">{label}</span>
                        <span className="cir-row-value">{shot.cir[key]}</span>
                      </div>
                    ) : null)}
                  </div>
                )}

                {shot?.theory_rationale && (
                  <div className="strategy-card-rationale">
                    {shot.theory_rationale}
                  </div>
                )}

                <div className="strategy-card-select-btn" style={{ borderColor: color, color }}>
                  Select Strategy {LABELS[idx]}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
