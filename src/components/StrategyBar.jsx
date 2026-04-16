import useStore from '../store/useStore'
import './StrategyBar.css'

const LETTERS = ['A', 'B', 'C']

export default function StrategyBar() {
  const strategies = useStore((s) => s.strategies)
  const activeStrategy = useStore((s) => s.activeStrategy)
  const setActiveStrategy = useStore((s) => s.setActiveStrategy)
  const getStrategyColor = useStore((s) => s.getStrategyColor)

  if (strategies.length === 0) return null

  return (
    <div className="strategy-bar">
      <span className="strategy-label">Directing Strategy</span>
      <div className="strategy-tabs">
        {strategies.map((strat, idx) => {
          const colors = getStrategyColor(idx)
          return (
            <button
              key={idx}
              className={`strategy-tab ${activeStrategy === idx ? 'active' : ''}`}
              style={{
                '--tab-color': colors.raw,
                '--tab-bg': `${colors.raw}18`,
              }}
              onClick={() => setActiveStrategy(idx)}
            >
              <span className="tab-letter" style={{ background: colors.raw }}>{LETTERS[idx]}</span>
              <span className="tab-info">
                <span className="tab-name">{strat.name}</span>
                {strat.intention_tags && (
                  <span className="tab-desc">{strat.intention_tags.slice(0, 2).join(', ')}</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
