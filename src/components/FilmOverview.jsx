import useStore from '../store/useStore'
import './FilmOverview.css'

export default function FilmOverview() {
  const scenes = useStore((s) => s.scenes)
  const activeScene = useStore((s) => s.activeScene)
  const setActiveScene = useStore((s) => s.setActiveScene)
  const setActiveShot = useStore((s) => s.setFlowActiveShot)
  const setActiveBranch = useStore((s) => s.setFlowActiveBranch)
  const setOverviewMode = useStore((s) => s.setOverviewMode)
  const addScene = useStore((s) => s.addScene)
  const shotSketches = useStore((s) => s.shotSketches)

  const handleShotClick = (sceneIdx, branchIdx, shotIdx) => {
    setActiveScene(sceneIdx)
    setActiveBranch(branchIdx)
    setActiveShot(shotIdx)
  }

  const handleShotDouble = (sceneIdx, branchIdx, shotIdx) => {
    setActiveScene(sceneIdx)
    setActiveBranch(branchIdx)
    setActiveShot(shotIdx)
    setOverviewMode('scene')
  }

  return (
    <div className="film-overview">
      {scenes.map((scene, sIdx) => {
        const branchIdx = scene.activeBranch ?? 0
        const branch = scene.branches[branchIdx]
        const shots = branch?.shots || []
        const totalShots = scene.branches.reduce((acc, b) => acc + b.shots.length, 0)

        return (
          <div
            key={scene.id}
            className={`film-scene-row ${sIdx === activeScene ? 'active' : ''}`}
          >
            <div className="film-scene-header">
              <button
                className="film-scene-title"
                onClick={() => { setActiveScene(sIdx); setOverviewMode('scene') }}
                title="Open scene"
              >
                <span className="film-scene-num">SCENE {sIdx + 1}</span>
                <span className="film-scene-label">{scene.label}</span>
              </button>
              <div className="film-scene-stats">
                <span>{scene.branches.length} branch{scene.branches.length > 1 ? 'es' : ''}</span>
                <span className="film-scene-dot">·</span>
                <span>{totalShots} shot{totalShots !== 1 ? 's' : ''}</span>
              </div>
            </div>

            <div className="film-scene-strip">
              {shots.map((shot, i) => {
                const sketchUrl = shotSketches[`${sIdx}-${branchIdx}-${i}`]
                const img = sketchUrl || shot.image
                const isActive = sIdx === activeScene && i === (scene.activeShot ?? 0)
                return (
                  <div
                    key={shot.id}
                    className={`film-shot ${isActive ? 'active' : ''}`}
                    onClick={() => handleShotClick(sIdx, branchIdx, i)}
                    onDoubleClick={() => handleShotDouble(sIdx, branchIdx, i)}
                  >
                    <div className="film-shot-frame">
                      {img ? (
                        <img src={img} alt={shot.label} />
                      ) : (
                        <span className="film-shot-num">{i + 1}</span>
                      )}
                      {shot.isAIGenerated && <span className="film-shot-badge">AI</span>}
                    </div>
                    <div className="film-shot-meta">
                      <span className="film-shot-idx">S{i + 1}</span>
                      <span className="film-shot-size">{shot.cir?.shotSize || '—'}</span>
                    </div>
                  </div>
                )
              })}
              {shots.length === 0 && (
                <div className="film-scene-empty">No shots yet</div>
              )}
            </div>
          </div>
        )
      })}

      <button className="film-add-scene" onClick={() => addScene()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>Add Scene</span>
      </button>
    </div>
  )
}
