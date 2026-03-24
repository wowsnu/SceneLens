import useStore from '../store/useStore'
import './FlowTab.css'

export default function FlowTab() {
  const strategies = useStore((s) => s.strategies)
  const activeStrategy = useStore((s) => s.activeStrategy)
  const setActiveStrategy = useStore((s) => s.setActiveStrategy)
  const activeShot = useStore((s) => s.activeShot)
  const setActiveShot = useStore((s) => s.setActiveShot)
  const getStrategyColor = useStore((s) => s.getStrategyColor)

  if (strategies.length === 0) {
    return (
      <div className="flow-tab scrollable">
        <div className="analysis-waiting">
          <div className="status-icon">📈</div>
          <div className="status-text">
            Analyze a composition to see the scene flow with branching strategies
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flow-tab scrollable">
      <div className="flow-panel-header">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" opacity="0.6">
          <circle cx="3" cy="8" r="2" fill="none" stroke="currentColor" />
          <circle cx="8" cy="4" r="1.5" fill="none" stroke="currentColor" />
          <circle cx="8" cy="12" r="1.5" fill="none" stroke="currentColor" />
          <circle cx="13" cy="8" r="1.5" fill="none" stroke="currentColor" />
          <line x1="5" y1="7" x2="6.5" y2="4.5" stroke="currentColor" />
          <line x1="5" y1="9" x2="6.5" y2="11.5" stroke="currentColor" />
          <line x1="9.5" y1="5" x2="11.5" y2="7.5" stroke="currentColor" />
          <line x1="9.5" y1="11" x2="11.5" y2="8.5" stroke="currentColor" />
        </svg>
        <h2>Scene Flow — Branching Progression</h2>
      </div>

      <div className="scene-flow-graph">
        {strategies.map((strategy, sIdx) => {
          const colors = getStrategyColor(sIdx)
          const isActive = sIdx === activeStrategy
          return (
            <div key={sIdx} className={`flow-row ${isActive ? 'active' : ''}`}>
              <div
                className={`flow-node strategy-node`}
                style={{ background: colors.raw }}
                onClick={() => setActiveStrategy(sIdx)}
                title={strategy.name}
              >
                {String.fromCharCode(65 + sIdx)}
              </div>
              <span className={`flow-strategy-label ${isActive ? 'active' : ''}`}>
                {strategy.name}
              </span>
              {strategy.shots.map((shot, shotIdx) => (
                <div key={shotIdx} style={{ display: 'flex', alignItems: 'center' }}>
                  <div
                    className={`flow-connector ${isActive ? 'active' : ''}`}
                  />
                  <div
                    className={`flow-node shot-node ${isActive && shotIdx === activeShot ? 'active' : ''}`}
                    onClick={() => {
                      setActiveStrategy(sIdx)
                      setActiveShot(shotIdx)
                    }}
                    title={`${shot.cir?.shotSize} ${shot.cir?.relation}`}
                  >
                    {shotIdx + 1}
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
