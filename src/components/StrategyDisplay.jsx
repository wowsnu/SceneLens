import { useState } from 'react'
import './StrategyDisplay.css'

function StrategyDisplay({ strategies }) {
  const [selectedStrategy, setSelectedStrategy] = useState(0)

  if (!strategies || strategies.length === 0) return null

  const strategy = strategies[selectedStrategy]

  return (
    <div className="strategy-display">
      <h2>🎯 촬영 전략</h2>

      {/* Strategy Tabs */}
      <div className="strategy-tabs">
        {strategies.map((strat, idx) => (
          <button
            key={idx}
            className={`strategy-tab ${selectedStrategy === idx ? 'active' : ''}`}
            onClick={() => setSelectedStrategy(idx)}
          >
            전략 {idx + 1}
          </button>
        ))}
      </div>

      {/* Strategy Content */}
      <div className="strategy-content">
        <h3 className="strategy-name">{strategy.name}</h3>

        <div className="strategy-tags">
          {strategy.intention_tags.map((tag, idx) => (
            <span key={idx} className="tag">#{tag}</span>
          ))}
        </div>

        {/* Shot Sequence */}
        <div className="shots-sequence">
          {strategy.shots.map((shot, idx) => (
            <div key={idx} className="shot-card">
              <div className="shot-header">
                <span className="shot-number">Shot {shot.order}</span>
                <div className="shot-cir-summary">
                  {shot.cir.shotSize} · {shot.cir.cameraAngle} · {shot.cir.cameraLevel}
                </div>
              </div>

              <div className="shot-details">
                <div className="shot-row">
                  <strong>Relation:</strong> {shot.cir.relation}
                </div>
                <div className="shot-row">
                  <strong>Distance:</strong> {shot.cir.blockingDistance}
                </div>
                <div className="shot-row">
                  <strong>Eyeline:</strong> {shot.cir.eyeline}
                </div>
              </div>

              <div className="shot-rationale">
                <strong>이론 근거:</strong>
                <p>{shot.theory_rationale}</p>
              </div>

              <div className="shot-source">
                <strong>출처:</strong> {shot.source}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default StrategyDisplay
