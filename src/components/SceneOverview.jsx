import { GraphView, CardView, FillShotPicker } from './FlowTab'
import GridView from './GridView'
import FilmOverview from './FilmOverview'
import useStore from '../store/useStore'
import './SceneOverview.css'

export default function SceneOverview() {
  const flowView = useStore((s) => s.flowView)
  const setFlowView = useStore((s) => s.setFlowView)
  const scenes = useStore((s) => s.scenes)
  const activeScene = useStore((s) => s.activeScene)
  const setActiveScene = useStore((s) => s.setActiveScene)
  const addScene = useStore((s) => s.addScene)
  const removeScene = useStore((s) => s.removeScene)
  const overviewMode = useStore((s) => s.overviewMode)
  const setOverviewMode = useStore((s) => s.setOverviewMode)

  return (
    <div className="scene-overview">
      <div className="scene-bar">
        <div className="scene-mode-toggle">
          <button
            className={`scene-mode-btn ${overviewMode === 'film' ? 'active' : ''}`}
            onClick={() => setOverviewMode('film')}
            title="Film overview"
          >Film</button>
          <button
            className={`scene-mode-btn ${overviewMode === 'scene' ? 'active' : ''}`}
            onClick={() => setOverviewMode('scene')}
            title="Scene detail"
          >Scene</button>
        </div>
        {overviewMode === 'scene' && (
          <div className="scene-bar-tabs">
            {scenes.map((sc, i) => (
              <button
                key={sc.id}
                className={`scene-tab ${i === activeScene ? 'active' : ''}`}
                onClick={() => setActiveScene(i)}
              >
                <span className="scene-tab-num">{i + 1}</span>
                <span className="scene-tab-label">{sc.label}</span>
                <span className="scene-tab-count">{sc.branches.reduce((acc, b) => acc + b.shots.length, 0)}</span>
                {scenes.length > 1 && (
                  <span
                    className="scene-tab-close"
                    onClick={(e) => { e.stopPropagation(); removeScene(i) }}
                    title="Remove scene"
                  >×</span>
                )}
              </button>
            ))}
            <button className="scene-tab-add" onClick={() => addScene()} title="Add scene">
              + Scene
            </button>
          </div>
        )}
      </div>
      {overviewMode === 'scene' && (
      <div className="scene-overview-toolbar">
        <div className="scene-overview-view-toggle">
          <button
            className={`scene-overview-view-btn ${flowView === 'grid' ? 'active' : ''}`}
            onClick={() => setFlowView('grid')}
            title="Grid view"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
              <rect x="1" y="1" width="3.5" height="2.6" rx="0.4" />
              <rect x="5.25" y="1" width="3.5" height="2.6" rx="0.4" />
              <rect x="9.5" y="1" width="3.5" height="2.6" rx="0.4" />
              <rect x="1" y="5.7" width="3.5" height="2.6" rx="0.4" />
              <rect x="5.25" y="5.7" width="3.5" height="2.6" rx="0.4" />
              <rect x="9.5" y="5.7" width="3.5" height="2.6" rx="0.4" />
              <rect x="1" y="10.4" width="3.5" height="2.6" rx="0.4" />
              <rect x="5.25" y="10.4" width="3.5" height="2.6" rx="0.4" />
            </svg>
            <span>Grid</span>
          </button>
          <button
            className={`scene-overview-view-btn ${flowView === 'graph' ? 'active' : ''}`}
            onClick={() => setFlowView('graph')}
            title="Graph view"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
              <rect x="1" y="1" width="3" height="3" rx="0.5" />
              <rect x="6" y="1" width="3" height="3" rx="0.5" />
              <rect x="11" y="1" width="2" height="3" rx="0.5" />
              <rect x="1" y="6" width="3" height="3" rx="0.5" />
              <rect x="6" y="6" width="3" height="3" rx="0.5" />
              <line x1="4" y1="2.5" x2="6" y2="2.5" stroke="currentColor" strokeWidth="0.8" />
              <line x1="9" y1="2.5" x2="11" y2="2.5" stroke="currentColor" strokeWidth="0.8" />
              <line x1="4" y1="7.5" x2="6" y2="7.5" stroke="currentColor" strokeWidth="0.8" />
            </svg>
            <span>Graph</span>
          </button>
          <button
            className={`scene-overview-view-btn ${flowView === 'card' ? 'active' : ''}`}
            onClick={() => setFlowView('card')}
            title="Card view"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
              <rect x="0.5" y="3" width="3" height="8" rx="1" opacity="0.3" />
              <rect x="4.5" y="1" width="5" height="12" rx="1" />
              <rect x="10.5" y="3" width="3" height="8" rx="1" opacity="0.3" />
            </svg>
            <span>Cards</span>
          </button>
        </div>
      </div>
      )}
      <div className="scene-overview-body">
        {overviewMode === 'film' ? (
          <FilmOverview />
        ) : (
          <>
            {flowView === 'grid' && <GridView />}
            {flowView === 'graph' && <GraphView />}
            {flowView === 'card' && <CardView />}
          </>
        )}
      </div>
      <FillShotPicker />
    </div>
  )
}
