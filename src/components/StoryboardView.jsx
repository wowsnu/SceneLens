import { useEffect, useRef, useState } from 'react'
import useStore from '../store/useStore'
import './StoryboardView.css'

const MOCK_PANEL_PALETTES = [
  ['#172033', '#334b75', '#d8e3ff'],
  ['#251b2f', '#6c3f68', '#f2d5ef'],
  ['#182923', '#356653', '#d4f2e6'],
  ['#2c2118', '#735139', '#f4dfca'],
]

function createMockPanelImage(shotIdx, version = 1) {
  const [background, midtone, line] = MOCK_PANEL_PALETTES[shotIdx % MOCK_PANEL_PALETTES.length]
  const variant = (shotIdx + version) % 3
  const compositions = [
    `
      <rect x="68" y="62" width="250" height="190" rx="8" fill="${midtone}" opacity=".54"/>
      <circle cx="420" cy="150" r="58" fill="${line}" opacity=".18"/>
      <path d="M380 258c18-63 48-93 89-93 36 0 65 31 83 93" fill="${midtone}" stroke="${line}" stroke-width="6"/>
      <path d="M102 105h146M102 140h112M102 175h165" stroke="${line}" stroke-width="5" opacity=".72"/>
    `,
    `
      <path d="M42 282 214 92h212l172 190" fill="${midtone}" opacity=".46"/>
      <path d="M214 92v190M426 92v190" stroke="${line}" stroke-width="5" opacity=".58"/>
      <circle cx="276" cy="166" r="34" fill="${line}" opacity=".22"/>
      <circle cx="384" cy="166" r="34" fill="${line}" opacity=".22"/>
      <path d="M238 262c8-54 24-81 48-81s40 27 48 81M346 262c8-54 24-81 48-81s40 27 48 81" fill="none" stroke="${line}" stroke-width="6"/>
    `,
    `
      <rect x="45" y="45" width="550" height="230" rx="14" fill="${midtone}" opacity=".35"/>
      <path d="M45 204 180 126l106 56 116-92 193 114v71H45Z" fill="${midtone}" opacity=".8"/>
      <circle cx="180" cy="126" r="38" fill="${line}" opacity=".2"/>
      <path d="M79 238h482" stroke="${line}" stroke-width="5" opacity=".72"/>
    `,
  ]
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <rect width="640" height="360" fill="${background}"/>
      <rect x="22" y="22" width="596" height="316" rx="18" fill="none" stroke="${line}" stroke-width="3" opacity=".32"/>
      ${compositions[variant]}
      <rect x="38" y="298" width="124" height="25" rx="12.5" fill="#050507" opacity=".72"/>
      <text x="100" y="315" text-anchor="middle" fill="${line}" font-family="Arial, sans-serif" font-size="11" font-weight="700" letter-spacing="1.8">AI DRAFT · V${version}</text>
    </svg>
  `
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

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
  const removeShot = useStore((s) => s.flowRemoveShot)
  const maximizedPanel = useStore((s) => s.maximizedPanel)
  const setCenterTab = useStore((s) => s.setCenterTab)
  const setMaximizedPanel = useStore((s) => s.setMaximizedPanel)
  const drawingWorkspaceOpen = useStore((s) => s.drawingWorkspaceOpen)
  const openDrawingWorkspace = useStore((s) => s.openDrawingWorkspace)
  const selectedShotIds = useStore((s) => s.selectedStoryboardShotIds)
  const setSelectedShotIds = useStore((s) => s.setSelectedStoryboardShotIds)
  const scriptEditorRequestKey = useStore((s) => s.scriptEditorRequestKey)
  const narrativeSuggestions = useStore((s) => s.narrativeSuggestions)
  const dismissNarrativeSuggestion = useStore((s) => s.dismissNarrativeSuggestion)
  const updateFlowShotById = useStore((s) => s.updateFlowShotById)
  const setPendingCanvasImage = useStore((s) => s.setPendingCanvasImage)

  const [isEditingRaw, setIsEditingRaw] = useState(false)
  const [rawText, setRawText] = useState('')
  const [rawSceneIntention, setRawSceneIntention] = useState('')
  const [generationScope, setGenerationScope] = useState('all')
  const [panelCandidates, setPanelCandidates] = useState({})
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
    openDrawingWorkspace()
  }

  const handleAddShot = (beatNum) => {
    addShotToBeat(beatNum)
  }

  const handleDeleteShot = (shotId, shotIdx) => {
    if (flowShots.length <= 1) return
    setSelectedShotIds((current) => current.filter((id) => id !== shotId))
    dismissPanelCandidate(shotId)
    removeShot(activeBranch, shotIdx)
  }

  const getShotVisual = (shot, shotIdx) => {
    const flowSketchKey = `${activeScene}-${activeBranch}-${shotIdx}`
    const legacySketchKey = `0-${shotIdx}`
    return shot.image || shotSketches[flowSketchKey] || shotSketches[legacySketchKey] || null
  }

  const selectedShots = flowShots
    .map((shot, shotIdx) => ({ shot, shotIdx }))
    .filter(({ shot }) => selectedShotIds.includes(shot.id))
  const allBlankShots = flowShots
    .map((shot, shotIdx) => ({ shot, shotIdx }))
    .filter(({ shot, shotIdx }) => !getShotVisual(shot, shotIdx))
  const activeBeatShots = flowShots
    .map((shot, shotIdx) => ({ shot, shotIdx }))
    .filter(({ shot }) => (shot.scriptBeat ?? 0) === activeBeat)
  const scopeShots = generationScope === 'beat'
      ? activeBeatShots
      : generationScope === 'selected'
        ? selectedShots
        : allBlankShots
  const eligibleScopeShots = scopeShots.filter(({ shot, shotIdx }) => !getShotVisual(shot, shotIdx))
  const currentShotIds = new Set(flowShots.map((shot) => shot.id))
  const currentPanelCandidates = Object.values(panelCandidates)
    .filter((candidate) => currentShotIds.has(candidate.shotId))
  const candidateCount = currentPanelCandidates.length

  const toggleShotSelection = (shotId) => {
    setSelectedShotIds((current) => (
      current.includes(shotId)
        ? current.filter((id) => id !== shotId)
        : [...current, shotId]
    ))
  }

  const handleGeneratePanels = (targets, { includeExisting = false } = {}) => {
    const eligibleTargets = includeExisting
      ? targets
      : targets.filter(({ shot, shotIdx }) => !getShotVisual(shot, shotIdx))
    if (eligibleTargets.length === 0) return
    if (!isExpanded) setMaximizedPanel('left')

    setPanelCandidates((current) => {
      const next = { ...current }
      eligibleTargets.forEach(({ shot, shotIdx }) => {
        const version = (current[shot.id]?.version || 0) + 1
        next[shot.id] = {
          shotId: shot.id,
          shotIdx,
          version,
          image: createMockPanelImage(shotIdx, version),
        }
      })
      return next
    })
  }

  const dismissPanelCandidate = (shotId) => {
    setPanelCandidates((current) => {
      const next = { ...current }
      delete next[shotId]
      return next
    })
  }

  const acceptPanelCandidate = (shotId) => {
    const candidate = panelCandidates[shotId]
    if (!candidate) return
    updateFlowShotById(shotId, {
      image: candidate.image,
      source: 'ai',
      isAIGenerated: true,
    })
    dismissPanelCandidate(shotId)
  }

  const acceptAllPanelCandidates = () => {
    currentPanelCandidates.forEach((candidate) => {
      updateFlowShotById(candidate.shotId, {
        image: candidate.image,
        source: 'ai',
        isAIGenerated: true,
      })
    })
    setPanelCandidates((current) => Object.fromEntries(
      Object.entries(current).filter(([shotId]) => !currentShotIds.has(shotId)),
    ))
  }

  const handleDrawOverCandidate = (shot, shotIdx) => {
    const candidate = panelCandidates[shot.id]
    if (!candidate) return
    updateFlowShotById(shot.id, {
      image: candidate.image,
      source: 'ai-assisted-draw',
      isAIGenerated: true,
    })
    dismissPanelCandidate(shot.id)
    handleEditShot(shotIdx, shot.scriptBeat ?? 0)
    setPendingCanvasImage(candidate.image)
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

          {isExpanded && !drawingWorkspaceOpen && (
            <section
              className={`storyboard-generation-bar ${isExpanded ? 'expanded' : 'compact'}`}
              aria-label="AI storyboard draft generation"
              onClick={(event) => event.stopPropagation()}
            >
            <div className="generation-bar-copy">
              <span>AI storyboard draft <em>Mock</em></span>
              <strong>
                {eligibleScopeShots.length} blank panel{eligibleScopeShots.length === 1 ? '' : 's'} in scope
              </strong>
              <p>Existing drawings and imported images stay untouched.</p>
            </div>
            <div className="generation-scope-tabs" aria-label="Generation scope">
              <button
                type="button"
                className={generationScope === 'beat' ? 'active' : ''}
                onClick={() => {
                  setGenerationScope('beat')
                  setSelectedShotIds([])
                }}
              >
                Beat B{activeBeat + 1}
              </button>
              <button
                type="button"
                className={generationScope === 'selected' ? 'active' : ''}
                onClick={() => {
                  setGenerationScope('selected')
                  if (!isExpanded) setMaximizedPanel('left')
                }}
              >
                Selected {selectedShots.length}
              </button>
              <button
                type="button"
                className={generationScope === 'all' ? 'active' : ''}
                onClick={() => {
                  setGenerationScope('all')
                  setSelectedShotIds([])
                }}
              >
                All blanks {allBlankShots.length}
              </button>
            </div>
            <div className="generation-bar-actions">
              {selectedShots.length > 0 && (
                <button
                  type="button"
                  className="generation-clear-selection"
                  onClick={() => setSelectedShotIds([])}
                >
                  Clear selection
                </button>
              )}
              {candidateCount > 0 && (
                <button
                  type="button"
                  className="generation-accept-all"
                  onClick={acceptAllPanelCandidates}
                >
                  Accept all drafts · {candidateCount}
                </button>
              )}
              <button
                type="button"
                className="generation-run"
                disabled={eligibleScopeShots.length === 0}
                onClick={() => handleGeneratePanels(eligibleScopeShots)}
              >
                {generationScope === 'all'
                  ? 'Generate storyboard draft'
                  : generationScope === 'beat'
                    ? `Generate Beat ${activeBeat + 1}`
                    : generationScope === 'selected'
                      ? 'Generate selected'
                      : 'Generate storyboard draft'}
                {eligibleScopeShots.length > 0 ? ` · ${eligibleScopeShots.length}` : ''}
              </button>
            </div>
            </section>
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
                    <div className="sb-shot-stack">
                      {beatShots.map(({ shot, shotIdx }, localIdx) => {
                        const beatShotLabel = `B${beatGroup.beat + 1}-S${localIdx + 1}`
                        const committedImage = getShotVisual(shot, shotIdx)
                        const candidate = panelCandidates[shot.id]
                        const displayImage = candidate?.image || committedImage
                        const isSelected = selectedShotIds.includes(shot.id)

                        return (
                          <div
                            key={shot.id || shotIdx}
                            className={`sb-shot-card ${shotIdx === activeShot ? 'active-shot' : ''} ${isSelected ? 'selected-for-generation' : ''} ${candidate ? 'has-ai-candidate' : ''}`}
                          >
                            <button
                              type="button"
                              className={`sb-shot-select ${isSelected ? 'selected' : ''}`}
                              aria-pressed={isSelected}
                              aria-label={`${isSelected ? 'Remove' : 'Add'} ${beatShotLabel} ${isSelected ? 'from' : 'to'} generation selection`}
                              onClick={(event) => {
                                event.stopPropagation()
                                toggleShotSelection(shot.id)
                                setGenerationScope('selected')
                              }}
                            >
                              {isSelected ? '✓' : '+'}
                            </button>
                            <button
                              type="button"
                              className="sb-shot-delete"
                              disabled={flowShots.length <= 1}
                              title={flowShots.length <= 1 ? 'Keep at least one shot in the scene' : `Delete ${beatShotLabel}`}
                              aria-label={`Delete ${beatShotLabel}`}
                              onClick={(event) => {
                                event.stopPropagation()
                                handleDeleteShot(shot.id, shotIdx)
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 10v6M14 10v6" />
                              </svg>
                            </button>
                            {candidate ? (
                              <div className="sb-panel-candidate">
                                <div className="sb-img-wrapper">
                                  <img src={displayImage} alt={`${beatShotLabel} AI draft`} />
                                  <span className="sb-candidate-badge">AI candidate · V{candidate.version}</span>
                                </div>
                                <div className="sb-candidate-actions">
                                  <button type="button" onClick={() => dismissPanelCandidate(shot.id)}>Dismiss</button>
                                  <button
                                    type="button"
                                    onClick={() => handleGeneratePanels([{ shot, shotIdx }], { includeExisting: true })}
                                  >
                                    Again
                                  </button>
                                  <button type="button" onClick={() => handleDrawOverCandidate(shot, shotIdx)}>Draw over</button>
                                  <button
                                    type="button"
                                    className="accept"
                                    onClick={() => acceptPanelCandidate(shot.id)}
                                  >
                                    Accept
                                  </button>
                                </div>
                              </div>
                            ) : committedImage ? (
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
                                  <button
                                    className="sb-action-btn secondary"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleGeneratePanels([{ shot, shotIdx }], { includeExisting: true })
                                    }}
                                  >
                                    AI variant
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="sb-add-shot existing-empty">
                                <span>{beatShotLabel}</span>
                                <small>Choose how to start</small>
                                <div className="sb-empty-panel-actions">
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleEditShot(shotIdx, beatGroup.beat)
                                    }}
                                  >
                                    Draw
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      handleGeneratePanels([{ shot, shotIdx }])
                                    }}
                                  >
                                    Generate
                                  </button>
                                </div>
                              </div>
                            )}
                            <div className="sb-shot-meta">
                              <span>{beatShotLabel}</span>
                              <span className="sb-shot-source">
                                {candidate
                                  ? 'Candidate'
                                  : committedImage
                                    ? shot.isAIGenerated ? 'AI' : 'Drawn'
                                    : 'Blank'}
                              </span>
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
