import { useEffect, useRef, useState } from 'react'
import useStore from '../store/useStore'
import './StoryboardView.css'

function NarrativeSuggestionCard({ suggestion, onAccept, onDismiss }) {
  const canAccept = suggestion.type !== 'keep-structure'

  return (
    <aside className={`narrative-inline-suggestion ${suggestion.type}`} onClick={(event) => event.stopPropagation()}>
      <div className="narrative-suggestion-heading">
        <span>Narrative suggestion · Prototype</span>
        <strong>{suggestion.title}</strong>
      </div>
      <p>{suggestion.reason}</p>
      {(suggestion.type === 'insert-script-line' || suggestion.type === 'replace-script-line') && (
        <div className="narrative-script-patch">
          {suggestion.originalText && (
            <div className="script-patch-line removed">
              <span>−</span>
              <p>{suggestion.originalText}</p>
            </div>
          )}
          <div className="script-patch-line added">
            <span>+</span>
            <p>{suggestion.proposedText}</p>
          </div>
          {suggestion.sceneIntention && (
            <small>Scene intention: {suggestion.sceneIntention}</small>
          )}
        </div>
      )}
      {suggestion.purposes?.length > 0 && (
        <ol className="narrative-panel-purpose-list">
          {suggestion.purposes.map((purpose, index) => (
            <li key={purpose}>
              <span>P{index + 1}</span>
              {purpose}
            </li>
          ))}
        </ol>
      )}
      <div className="narrative-suggestion-actions">
        <button type="button" className="narrative-dismiss-btn" onClick={() => onDismiss(suggestion.id)}>
          {canAccept ? 'Dismiss' : 'Got it'}
        </button>
        {canAccept && (
          <button type="button" className="narrative-accept-btn" onClick={() => onAccept(suggestion)}>
            {suggestion.actionLabel}
          </button>
        )}
      </div>
    </aside>
  )
}

export default function StoryboardView() {
  const screenplay = useStore((s) => s.screenplay)
  const setScreenplay = useStore((s) => s.setScreenplay)
  const sceneIntention = useStore((s) => s.sceneIntention)
  const setSceneIntention = useStore((s) => s.setSceneIntention)
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
  const narrativeSuggestions = useStore((s) => s.narrativeSuggestions)
  const dismissNarrativeSuggestion = useStore((s) => s.dismissNarrativeSuggestion)

  const [isEditingRaw, setIsEditingRaw] = useState(false)
  const [rawText, setRawText] = useState('')
  const [rawSceneIntention, setRawSceneIntention] = useState('')
  const handledScriptEditorRequestKey = useRef(0)

  const isExpanded = maximizedPanel === 'left'
  const activeBranch = scene?.activeBranch ?? 0
  const activeShot = scene?.activeShot ?? 0
  const branch = scene?.branches?.[activeBranch]
  const flowShots = branch?.shots || []

  useEffect(() => {
    if (scriptEditorRequestKey > handledScriptEditorRequestKey.current) {
      handledScriptEditorRequestKey.current = scriptEditorRequestKey
      const timer = window.setTimeout(() => {
        const currentText = screenplay.map((el) => el.text).join('\n')
        setRawText(currentText)
        setRawSceneIntention(sceneIntention)
        setIsEditingRaw(true)
      }, 0)
      return () => window.clearTimeout(timer)
    }
  }, [scriptEditorRequestKey, screenplay, sceneIntention])

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

  const handleAcceptNarrativeSuggestion = (suggestion) => {
    if (suggestion.type === 'split-beat') {
      splitBeat(suggestion.elementIndex)
      return
    }

    if (suggestion.type === 'panel-count') {
      const currentCount = getBeatShots(suggestion.beat).length
      const missingCount = Math.max(0, suggestion.targetCount - currentCount)
      for (let index = 0; index < missingCount; index += 1) {
        addShotToBeat(suggestion.beat)
      }
      dismissNarrativeSuggestion(suggestion.id)
      return
    }

    if (suggestion.type === 'insert-script-line') {
      const nextScreenplay = [...screenplay]
      nextScreenplay.splice(suggestion.insertAfterIndex + 1, 0, suggestion.newElement)
      setScreenplay(nextScreenplay)
      return
    }

    if (suggestion.type === 'replace-script-line') {
      const nextScreenplay = screenplay.map((element, index) => (
        index === suggestion.elementIndex
          ? { ...element, text: suggestion.proposedText }
          : element
      ))
      setScreenplay(nextScreenplay)
    }
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
    setSceneIntention(rawSceneIntention.trim())
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
                <p>Add the scene's guiding intention, then paste the screenplay to create storyboard beats.</p>
              </div>
              <label className="scene-intention-field">
                <span>Scene intention <em>optional</em></span>
                <textarea
                  className="scene-intention-input"
                  placeholder="예: 위험은 느껴지지만 원인은 마지막까지 숨긴다."
                  value={rawSceneIntention}
                  onChange={(event) => setRawSceneIntention(event.target.value)}
                  rows={3}
                />
              </label>
              <textarea
                className="screenplay-input"
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
            const beatSuggestions = narrativeSuggestions.filter((suggestion) => suggestion.beat === beatGroup.beat)
            const inlineSuggestionTypes = new Set(['split-beat', 'insert-script-line', 'replace-script-line'])
            const nonBoundarySuggestions = beatSuggestions.filter((suggestion) => !inlineSuggestionTypes.has(suggestion.type))

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
                  {beatGroup.elements.map((el) => {
                    const inlineSuggestions = beatSuggestions.filter((suggestion) => (
                      (suggestion.type === 'split-beat' && suggestion.elementIndex === el.globalIdx + 1)
                      || (suggestion.type === 'insert-script-line' && suggestion.insertAfterIndex === el.globalIdx)
                      || (suggestion.type === 'replace-script-line' && suggestion.elementIndex === el.globalIdx)
                    ))

                    return (
                    <div key={el.globalIdx} className="script-element-block">
                      <div className="script-element-wrapper">
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
                      {inlineSuggestions.map((suggestion) => (
                        <NarrativeSuggestionCard
                          key={suggestion.id}
                          suggestion={suggestion}
                          onAccept={handleAcceptNarrativeSuggestion}
                          onDismiss={dismissNarrativeSuggestion}
                        />
                      ))}
                    </div>
                    )
                  })}
                  {nonBoundarySuggestions.map((suggestion) => (
                    <NarrativeSuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      onAccept={handleAcceptNarrativeSuggestion}
                      onDismiss={dismissNarrativeSuggestion}
                    />
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
