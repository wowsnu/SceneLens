import useStore from '../store/useStore'
import './StoryboardView.css'

export default function StoryboardView() {
  const screenplay = useStore((s) => s.screenplay)
  const strategies = useStore((s) => s.strategies)
  const activeStrategy = useStore((s) => s.activeStrategy)
  const shotSketches = useStore((s) => s.shotSketches)
  const setViewMode = useStore((s) => s.setViewMode)
  const setActiveShot = useStore((s) => s.setActiveShot)
  const setActiveBeat = useStore((s) => s.setActiveBeat)
  const setZenMode = useStore((s) => s.setZenMode)

  // Group screenplay by beats
  const beats = []
  let currentBeat = []
  let beatIdx = -1

  screenplay.forEach((el) => {
    if (el.beat !== undefined && el.beat !== beatIdx) {
      if (currentBeat.length > 0) beats.push({ beat: beatIdx, elements: currentBeat })
      beatIdx = el.beat
      currentBeat = [el]
    } else {
      currentBeat.push(el)
    }
  })
  if (currentBeat.length > 0) beats.push({ beat: beatIdx, elements: currentBeat })

  const strategy = strategies[activeStrategy]

  const handleEditShot = (shotIdx, beatNum) => {
    setActiveShot(shotIdx)
    setActiveBeat(beatNum)
    setViewMode('focus')
    setZenMode(true)
  }

  const handleAnalyzeShot = (shotIdx, beatNum) => {
    setActiveShot(shotIdx)
    setActiveBeat(beatNum)
    setViewMode('detail')
  }

  return (
    <div className="storyboard-view scrollable">
      <div className="storyboard-list-container">
        {beats.map((beatGroup, i) => {
          const shot = strategy?.shots?.[i]
          const sketchUrl = shotSketches[`${activeStrategy}-${i}`]
          const hasImage = shot?.image || sketchUrl
          return (
            <div key={i} className="sb-item">
              <div className="sb-text-col">
                {beatGroup.elements.map((el, j) => (
                  <div key={j} className={`sb-script-${el.type}`}>
                    {el.text}
                  </div>
                ))}
              </div>
              <div className="sb-img-col">
                {hasImage ? (
                  <div className="sb-img-wrapper">
                    <img src={shot?.image || sketchUrl} alt={`Beat ${i + 1}`} />
                    <div className="sb-hover-actions">
                      <button className="sb-action-btn" onClick={() => handleEditShot(i, beatGroup.beat)}>
                        Draw ✎
                      </button>
                      <button className="sb-action-btn sb-analyze-btn" onClick={() => handleAnalyzeShot(i, beatGroup.beat)}>
                        Analyze ⇥
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="sb-add-shot" onClick={() => handleEditShot(i, beatGroup.beat)}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    Add Shot
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
