import useStore from '../store/useStore'
import './StoryboardStrip.css'

export default function StoryboardStrip() {
  const strategies = useStore((s) => s.strategies)
  const activeStrategy = useStore((s) => s.activeStrategy)
  const activeShot = useStore((s) => s.activeShot)
  const setActiveShot = useStore((s) => s.setActiveShot)
  const getStrategyColor = useStore((s) => s.getStrategyColor)

  if (strategies.length === 0) return null

  const strategy = strategies[activeStrategy]
  if (!strategy || !strategy.shots) return null

  const colors = getStrategyColor(activeStrategy)

  return (
    <div className="storyboard-strip">
      <div className="strip-header">
        <span className="strip-label">Shot Progression</span>
        <span
          className="strategy-name-badge"
          style={{ background: `${colors.raw}18`, color: colors.raw, border: `1px solid ${colors.raw}44` }}
        >
          {strategy.name}
        </span>
      </div>
      <div className="storyboard-thumbnails scrollable">
        {strategy.shots.map((shot, idx) => (
          <div key={idx} className="thumb-wrapper">
            {idx > 0 && <span className="thumb-connector">&rarr;</span>}
            <div
              className={`thumb-frame ${activeShot === idx ? 'active' : ''}`}
              onClick={() => setActiveShot(idx)}
            >
              {shot.image ? (
                <img src={shot.image} alt={`Shot ${idx + 1}`} />
              ) : (
                <div className="thumb-placeholder">{idx + 1}</div>
              )}
              <div className="thumb-info">
                <div className="thumb-number">Shot {shot.order}</div>
                <div className="thumb-name">{shot.cir?.shotSize} {shot.cir?.relation}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
