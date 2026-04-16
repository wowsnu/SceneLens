import { useState } from 'react'
import useStore from '../store/useStore'
import './StoryboardView.css'

export default function StoryboardView() {
  const screenplay = useStore((s) => s.screenplay)
  const setScreenplay = useStore((s) => s.setScreenplay)
  const splitBeat = useStore((s) => s.splitBeat)
  const mergeBeat = useStore((s) => s.mergeBeat)
  const strategies = useStore((s) => s.strategies)
  const activeStrategy = useStore((s) => s.activeStrategy)
  const shotSketches = useStore((s) => s.shotSketches)
  const setActiveShot = useStore((s) => s.setActiveShot)
  const setActiveBeat = useStore((s) => s.setActiveBeat)
  const setZenMode = useStore((s) => s.setZenMode)
  const maximizedPanel = useStore((s) => s.maximizedPanel)
  const setCenterTab = useStore((s) => s.setCenterTab)

  const [isEditingRaw, setIsEditingRaw] = useState(false)
  const [rawText, setRawText] = useState('')

  const isExpanded = maximizedPanel === 'left'

  const handleOpenEditor = () => {
    const currentText = screenplay.map(el => el.text).join('\n')
    setRawText(currentText)
    setIsEditingRaw(true)
  }

  // Group screenplay by beats with their original global indices
  const beats = []
  let currentBeat = []
  let beatIdx = screenplay[0]?.beat || 0

  screenplay.forEach((el, idx) => {
    if (el.beat !== undefined && el.beat !== beatIdx) {
      if (currentBeat.length > 0) beats.push({ beat: beatIdx, elements: currentBeat })
      beatIdx = el.beat
      currentBeat = [{ ...el, globalIdx: idx }]
    } else {
      currentBeat.push({ ...el, globalIdx: idx })
    }
  })
  if (currentBeat.length > 0) beats.push({ beat: beatIdx, elements: currentBeat })

  const strategy = strategies[activeStrategy]

  const handleEditShot = (shotIdx, beatNum) => {
    setActiveShot(shotIdx)
    setActiveBeat(beatNum)
    setCenterTab('canvas')
  }

  const handleAnalyzeShot = (shotIdx, beatNum) => {
    setActiveShot(shotIdx)
    setActiveBeat(beatNum)
    setCenterTab('guidance') 
  }

  const handleAnalyzeScene = () => {
    setCenterTab('map')
  }

  const handleUploadScript = () => {
    const lines = rawText.split('\n').filter(l => l.trim() !== '')
    const newScreenplay = lines.map((line, i) => {
      let type = 'action'
      if (line === line.toUpperCase() && (line.includes('INT.') || line.includes('EXT.'))) type = 'scene-heading'
      else if (line === line.toUpperCase() && line.length < 30) type = 'character'
      else if (line.startsWith('(') && line.endsWith(')')) type = 'parenthetical'
      return { type, text: line, beat: 0 }
    })
    setScreenplay(newScreenplay)
    setIsEditingRaw(false)
  }

  return (
    <div className="storyboard-view">
      <div className="storyboard-scroll-container">
        <div className="storyboard-list-inner">
          
          {isEditingRaw && (
            <div className="inline-script-editor">
              <div className="editor-header">
                <h3>Paste & Sync Screenplay</h3>
                <p>Paste your raw script here. We'll parse it into storyboard beats.</p>
              </div>
              <textarea 
                placeholder="Paste your screenplay here..." 
                value={rawText} 
                onChange={(e) => setRawText(e.target.value)}
              />
              <div className="editor-actions">
                <button className="cancel-btn" onClick={() => setIsEditingRaw(false)}>Cancel</button>
                <button className="apply-btn" onClick={handleUploadScript}>Apply to Storyboard</button>
              </div>
            </div>
          )}

          {beats.map((beatGroup, i) => {
            const shot = strategy?.shots?.[i]
            const sketchUrl = shotSketches[`${activeStrategy}-${i}`]
            const hasImage = shot?.image || sketchUrl
            
            return (
              <div key={i} className={`sb-item ${isExpanded ? 'layout-expanded' : 'layout-sidebar'}`}>
                {i > 0 && (
                  <button className="merge-beat-btn" onClick={() => mergeBeat(beatGroup.elements[0].globalIdx)} title="Merge with above">
                    ↑ Merge
                  </button>
                )}

                <div className="sb-text-col">
                  {beatGroup.elements.map((el, j) => (
                    <div key={j} className="script-element-wrapper">
                      <div className={`sb-script-${el.type}`}>
                        {el.text}
                      </div>
                      <button className="split-beat-btn" onClick={() => splitBeat(el.globalIdx + 1)} title="Split here">
                        + Split Shot
                      </button>
                    </div>
                  ))}
                </div>

                {isExpanded && (
                  <div className="sb-img-col">
                    <div className="beat-indicator">Shot {i + 1}</div>
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
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
