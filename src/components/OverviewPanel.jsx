import useStore from '../store/useStore'
import SpatialMap from './SpatialMap'
import './OverviewPanel.css'

export default function OverviewPanel() {
  const overviewTab = useStore((s) => s.overviewTab)
  const setOverviewTab = useStore((s) => s.setOverviewTab)
  const strategies = useStore((s) => s.strategies)
  const activeStrategy = useStore((s) => s.activeStrategy)
  const setActiveShot = useStore((s) => s.setActiveShot)

  const strategy = strategies[activeStrategy]
  const shots = strategy?.shots || []

  const setCenterTab = useStore((s) => s.setCenterTab)

  // Navigate to Guidance Lab
  const handleZoomIntoShot = (shotIdx) => {
    setActiveShot(shotIdx)
    setCenterTab('guidance')
  }

  // Render sequential timeline (Simple version for current strategy)
  const renderSequentialTimeline = () => {
    return (
      <div className="sequential-container">
        <div className="branch-row">
          <div className="branch-header">
            <span className="branch-badge main">Main Sequence</span>
            <h3>{strategy?.name || 'Storyboard'}</h3>
          </div>
          <div className="branch-shots">
            {shots.map((shot, sIdx) => (
              <div 
                key={sIdx} 
                className="shot-node"
                onDoubleClick={() => handleZoomIntoShot(sIdx)}
              >
                <div className="shot-node-image">
                  {shot.image ? <img src={shot.image} alt={shot.order} /> : <span>{sIdx + 1}</span>}
                  <button 
                    className="zoom-btn" 
                    onClick={(e) => { e.stopPropagation(); handleZoomIntoShot(sIdx); }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/>
                    </svg>
                  </button>
                </div>
                <div className="shot-node-info">
                  <span className="shot-node-label">Shot {shot.order || sIdx + 1}</span>
                  <span className="shot-node-size">{shot.cir?.shotSize || 'Unknown'}</span>
                </div>
              </div>
            ))}
            <div className="add-shot-node">+</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="overview-panel panel">
      {/* Header / Tabs */}
      <div className="overview-header">
        <div className="overview-title">
          <h2>The Cinematic Command Center</h2>
          <p>Visualize your entire scene's spatial logic and temporal flow</p>
        </div>
        <div className="overview-tabs">
          <button 
            className={`tab-btn ${overviewTab === 'spatial' ? 'active' : ''}`}
            onClick={() => setOverviewTab('spatial')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/></svg>
            Spatial Map
          </button>
          <button 
            className={`tab-btn ${overviewTab === 'timeline' ? 'active' : ''}`}
            onClick={() => setOverviewTab('timeline')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M21 12H3"/><path d="M12 3v18"/></svg>
            Sequential Timeline
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="overview-content">
        {overviewTab === 'spatial' ? <SpatialMap /> : renderSequentialTimeline()}
      </div>
    </div>
  )
}
