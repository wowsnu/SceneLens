import { useEffect, useState } from 'react'
import useStore from '../store/useStore'
import './StoryboardView.css'

export default function StoryboardView() {
  const screenplay = useStore((s) => s.screenplay)
  const setScreenplay = useStore((s) => s.setScreenplay)
  const splitBeat = useStore((s) => s.splitBeat)
  const mergeBeat = useStore((s) => s.mergeBeat)
  const activeScene = useStore((s) => s.activeScene)
  const scene = useStore((s) => s.scenes[s.activeScene])
  const shotSketches = useStore((s) => s.shotSketches)
  const setActiveShot = useStore((s) => s.setActiveShot)
  const setFlowActiveShot = useStore((s) => s.setFlowActiveShot)
  const setActiveBeat = useStore((s) => s.setActiveBeat)
  const selectBeat = useStore((s) => s.selectBeat)
  const activeBeat = useStore((s) => s.activeBeat)
  const addShotToBeat = useStore((s) => s.addShotToBeat)
  const maximizedPanel = useStore((s) => s.maximizedPanel)
  const setCenterTab = useStore((s) => s.setCenterTab)
  const setMaximizedPanel = useStore((s) => s.setMaximizedPanel)
  const scriptEditorRequestKey = useStore((s) => s.scriptEditorRequestKey)

  const [isEditingRaw, setIsEditingRaw] = useState(false)
  const [rawText, setRawText] = useState('')

  const isExpanded = maximizedPanel === 'left'
  const activeBranch = scene?.activeBranch ?? 0
  const activeShot = scene?.activeShot ?? 0
  const branch = scene?.branches?.[activeBranch]
  const flowShots = branch?.shots || []

  useEffect(() => {
    if (scriptEditorRequestKey > 0) {
      const timer = window.setTimeout(() => {
        const currentText = screenplay.map((el) => el.text).join('\n')
        setRawText(currentText)
        setIsEditingRaw(true)
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [scriptEditorRequestKey, screenplay])

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

  const getBeatShots = (beat) => flowShots
    .map((shot, shotIdx) => ({ shot, shotIdx }))
    .filter(({ shot }) => shot.scriptBeat === beat)

  const handleEditShot = (shotIdx, beatNum) => {
    setActiveShot(shotIdx)
    setFlowActiveShot(shotIdx)
    setActiveBeat(beatNum)
    setCenterTab('canvas')
    if (maximizedPanel === 'left') setMaximizedPanel(null)
  }

  const handleAddShot = (beatNum) => {
    addShotToBeat(beatNum)
    setCenterTab('canvas')
    if (maximizedPanel === 'left') setMaximizedPanel(null)
  }

  const handleUploadScript = () => {
    const lines = rawText.split('\n').filter((line) => line.trim() !== '')
    const newScreenplay = lines.map((line) => {
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
            const beatShots = getBeatShots(beatGroup.beat)

            return (
              <div
                key={i}
                className={`sb-item ${isExpanded ? 'layout-expanded' : 'layout-sidebar'} ${beatGroup.beat === activeBeat ? 'active-beat' : ''}`}
                onClick={() => selectBeat(beatGroup.beat)}
              >
                {i > 0 && (
                  <button
                    className="merge-beat-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      mergeBeat(beatGroup.elements[0].globalIdx)
                    }}
                    title="Merge with above"
                  >
                    ↑ Merge
                  </button>
                )}

                <div className="sb-text-col">
                  {beatGroup.elements.map((el, j) => (
                    <div key={j} className="script-element-wrapper">
                      <div className={`sb-script-${el.type}`}>
                        {el.text}
                      </div>
                      <button
                        className="split-beat-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          splitBeat(el.globalIdx + 1)
                        }}
                        title="Split here"
                      >
                        + Split Beat
                      </button>
                    </div>
                  ))}
                </div>

                {isExpanded && (
                  <div className="sb-img-col">
                    <div className="beat-indicator">
                      B{beatGroup.beat + 1} · {beatShots.length} shot{beatShots.length === 1 ? '' : 's'}
                    </div>
                    <div className="sb-shot-stack">
                      {beatShots.map(({ shot, shotIdx }, localIdx) => {
                        const beatShotLabel = `B${beatGroup.beat + 1}-S${localIdx + 1}`
                        const flowSketchKey = `${activeScene}-${activeBranch}-${shotIdx}`
                        const legacySketchKey = `0-${shotIdx}`
                        const sketchUrl = shotSketches[flowSketchKey] || shotSketches[legacySketchKey]
                        const displayImage = shot.image || sketchUrl

                        return (
                          <div
                            key={shot.id || shotIdx}
                            className={`sb-shot-card ${shotIdx === activeShot ? 'active-shot' : ''}`}
                          >
                            {displayImage ? (
                              <div className="sb-img-wrapper">
                                <img src={displayImage} alt={beatShotLabel} />
                                <div className="sb-hover-actions">
                                  <button
                                    className="sb-action-btn"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleEditShot(shotIdx, beatGroup.beat)
                                    }}
                                  >
                                    Draw
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div
                                className="sb-add-shot existing-empty"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleEditShot(shotIdx, beatGroup.beat)
                                }}
                              >
                                <span>{beatShotLabel}</span>
                                <small>Draw</small>
                              </div>
                            )}
                            <div className="sb-shot-meta">
                              <span>{beatShotLabel}</span>
                              <span>{shot.cir?.shotSize || 'Medium'}</span>
                            </div>
                          </div>
                        )
                      })}
                      <button
                        className="sb-add-shot-inline"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleAddShot(beatGroup.beat)
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add shot
                      </button>
                    </div>
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
