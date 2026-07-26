import { useEffect, useRef, useState } from 'react'
import useStore, { selectCutStage } from '../store/useStore'
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

const SCRIPT_LINE_TYPES = [
  { value: 'scene-heading', label: 'Scene' },
  { value: 'action', label: 'Action' },
  { value: 'character', label: 'Character' },
  { value: 'dialogue', label: 'Dialogue' },
  { value: 'parenthetical', label: 'Paren.' },
  { value: 'transition', label: 'Transition' },
]

// Script 단계에서 대본을 그 자리에서 고친다. 별도 raw 편집기를 열고
// 전체를 다시 붙여넣지 않아도 되고, beat 구조가 유지된다.
function ScriptLineEditor({ element, index, onChange, onChangeType, onInsertAfter, onRemove, canRemove }) {
  const textareaRef = useRef(null)

  // 내용에 맞춰 높이를 맞춰야 대본처럼 읽힌다.
  const resize = () => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }

  useEffect(resize, [element.text])

  return (
    <div className="script-line-editor" onClick={(event) => event.stopPropagation()}>
      <select
        className="script-line-type"
        value={element.type}
        onChange={(event) => onChangeType(index, event.target.value)}
        aria-label={`Line ${index + 1} type`}
        title="Line type"
      >
        {SCRIPT_LINE_TYPES.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <textarea
        ref={textareaRef}
        className={`script-line-input sb-script-${element.type}`}
        value={element.text}
        rows={1}
        placeholder="빈 줄"
        aria-label={`Line ${index + 1}`}
        onChange={(event) => {
          onChange(index, event.target.value)
          resize()
        }}
        onKeyDown={(event) => {
          // Enter로 다음 줄, Backspace로 빈 줄 삭제 — 대본 편집기의 기본 동작.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            const nextType = element.type === 'character' ? 'dialogue' : 'action'
            onInsertAfter(index, nextType)
          } else if (event.key === 'Backspace' && element.text === '' && canRemove) {
            event.preventDefault()
            onRemove(index)
          }
        }}
      />
      <button
        type="button"
        className="script-line-remove"
        onClick={() => onRemove(index)}
        disabled={!canRemove}
        aria-label={`Delete line ${index + 1}`}
        title="Delete line"
      >
        ×
      </button>
    </div>
  )
}

function NarrativeSuggestionCard({ suggestion, onAccept, onDismiss }) {
  const canAccept = suggestion.type !== 'keep-structure'
  const suggestionMeta = {
    'split-beat': { label: 'Beat boundary', change: 'Splits the current Beat' },
    'panel-count': { label: 'Panel plan', change: 'Adds blank panels' },
    'insert-script-line': { label: 'Script edit', change: 'Adds one script line' },
    'replace-script-line': { label: 'Script edit', change: 'Replaces one script line' },
    'keep-structure': { label: 'Narrative check', change: 'No changes suggested' },
  }[suggestion.type] || { label: 'Proposal', change: 'Reviews the current Beat' }

  return (
    <aside className={`narrative-inline-suggestion ${suggestion.type}`} onClick={(event) => event.stopPropagation()}>
      <header className="narrative-suggestion-heading">
        <span className="narrative-suggestion-mark" aria-hidden="true">N</span>
        <div>
          <span>Narrative proposal</span>
          <strong>{suggestion.title}</strong>
        </div>
        <em>{suggestionMeta.label} · B{(suggestion.beat ?? 0) + 1}</em>
      </header>
      <p>{suggestion.reason}</p>
      {suggestion.type === 'expand-to-screenplay' && (
        <div className="narrative-script-patch">
          <div className="script-patch-line removed">
            <span>−</span>
            <p>{suggestion.originalText}</p>
          </div>
          {suggestion.proposedElements.map((element, index) => (
            <div key={`${element.type}-${index}`} className="script-patch-line added">
              <span>+</span>
              <p className={`patch-type-${element.type}`}>{element.text}</p>
            </div>
          ))}
        </div>
      )}
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
        <span>{suggestionMeta.change}</span>
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
  const storyboardPanelsVisible = useStore((s) => s.storyboardPanelsVisible)
  const setCenterTab = useStore((s) => s.setCenterTab)
  const setMaximizedPanel = useStore((s) => s.setMaximizedPanel)
  const drawingWorkspaceOpen = useStore((s) => s.drawingWorkspaceOpen)
  const openDrawingWorkspace = useStore((s) => s.openDrawingWorkspace)
  const selectedShotIds = useStore((s) => s.selectedStoryboardShotIds)
  const setSelectedShotIds = useStore((s) => s.setSelectedStoryboardShotIds)
  const scriptEditorRequestKey = useStore((s) => s.scriptEditorRequestKey)
  const narrativeSuggestions = useStore((s) => s.narrativeSuggestions)
  const requestNarrativeSuggestions = useStore((s) => s.requestNarrativeSuggestions)
  const dismissNarrativeSuggestion = useStore((s) => s.dismissNarrativeSuggestion)
  const updateFlowShotById = useStore((s) => s.updateFlowShotById)
  const setPendingCanvasImage = useStore((s) => s.setPendingCanvasImage)
  const cutPlan = useStore((s) => s.cutPlan)
  const cutPlanAccepted = useStore((s) => s.cutPlanAccepted)
  const cutPlanSkipped = useStore((s) => s.cutPlanSkipped)
  const reopenCutPlan = useStore((s) => s.reopenCutPlan)
  const skipCutPlan = useStore((s) => s.skipCutPlan)
  const cutPlanOrphanedShots = useStore((s) => s.cutPlanOrphanedShots)
  const clearCutPlanOrphanWarning = useStore((s) => s.clearCutPlanOrphanWarning)
  const cutStage = useStore(selectCutStage)
  const requestBeatSplit = useStore((s) => s.requestBeatSplit)
  const requestScreenplayFormatting = useStore((s) => s.requestScreenplayFormatting)
  const expandScreenplayLine = useStore((s) => s.expandScreenplayLine)
  const loadExampleScreenplay = useStore((s) => s.loadExampleScreenplay)
  const updateScreenplayLine = useStore((s) => s.updateScreenplayLine)
  const setScreenplayLineType = useStore((s) => s.setScreenplayLineType)
  const insertScreenplayLine = useStore((s) => s.insertScreenplayLine)
  const removeScreenplayLine = useStore((s) => s.removeScreenplayLine)
  const backToScript = useStore((s) => s.backToScript)
  const clearCutPlanStageOverride = useStore((s) => s.clearCutPlanStageOverride)
  const cutPlanShotSizes = useStore((s) => s.cutPlanShotSizes)
  const requestCutPlan = useStore((s) => s.requestCutPlan)
  const updateCutPlanItem = useStore((s) => s.updateCutPlanItem)
  const setCutPlanItemStatus = useStore((s) => s.setCutPlanItemStatus)
  const addCutPlanItem = useStore((s) => s.addCutPlanItem)
  const removeCutPlanItem = useStore((s) => s.removeCutPlanItem)
  const moveCutPlanItem = useStore((s) => s.moveCutPlanItem)
  const dismissCutPlan = useStore((s) => s.dismissCutPlan)
  const acceptCutPlan = useStore((s) => s.acceptCutPlan)

  const [isEditingRaw, setIsEditingRaw] = useState(false)
  const [rawText, setRawText] = useState('')
  const [rawSceneIntention, setRawSceneIntention] = useState('')
  const [narrativeRequest, setNarrativeRequest] = useState('')
  const [narrativeRailOpen, setNarrativeRailOpen] = useState(true)
  const [generationScope, setGenerationScope] = useState('all')
  const [panelCandidates, setPanelCandidates] = useState({})
  const handledScriptEditorRequestKey = useRef(0)

  const isExpanded = maximizedPanel === 'left'
  // 줄콘티는 대본과 패널 사이의 경유 단계다. 컷을 확정하기 전에는 패널 작업을
  // 열지 않아, 컷 분해가 그림 생성에 묻혀 암묵적으로 처리되는 것을 막는다.
  // 설계 근거: docs/NARRATIVE_LENS_AS_JULCONTI.md
  // Cut plan 단계에서는 대본을 내리고 컷 분해만 남긴다. 대본 아래 덧붙은
  // 섹션이 아니라 거쳐 가는 단계로 읽히게 하기 위한 것이다.
  // 대본이 없으면 첫 화면이 곧 대본 쓰기 화면이다. state로 동기화하지 않고
  // 파생시켜 두 값이 어긋날 수 없게 한다.
  const hasScreenplay = screenplay.length > 0
  const showWriteScene = isEditingRaw || !hasScreenplay
  const isCutPlanStage = cutStage === 'cutplan' && isExpanded && !drawingWorkspaceOpen && !showWriteScene
  // Script 단계에서는 대본을 읽기 전용으로 두지 않고 그 자리에서 고친다.
  const isScriptStage = cutStage === 'script' && isExpanded && !drawingWorkspaceOpen && !showWriteScene
  // 단계별로 보이는 것이 다르다.
  //   script  → 대본만
  //   cutplan → 컷 리스트만
  //   panels  → 대본 + 패널
  // 패널은 확정 여부가 아니라 "지금 어느 단계를 보고 있는가"를 따른다.
  const showStoryboardPanels = isExpanded && storyboardPanelsVisible && cutStage === 'panels'
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

  // 줄글로 들어온 이야기는 대사도 인물 구분도 없다. 대본으로 세우는 것이
  // Beat 나누기보다 먼저다.
  const hasDialogue = screenplay.some((element) => element.type === 'dialogue')
  const hasLongProse = screenplay.some((element) => (
    element.type === 'action' && element.text.length >= 30
  ))
  const needsScreenplayFormatting = !hasDialogue && hasLongProse
  // 대본이 섰는데 Beat가 하나뿐이면 그다음이 Beat 나누기다.
  const needsBeatSplit = !needsScreenplayFormatting
    && beats.length === 1 && screenplay.length >= 4

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
    if (suggestion.type === 'expand-to-screenplay') {
      expandScreenplayLine(suggestion.elementIndex, suggestion.proposedElements)
      dismissNarrativeSuggestion(suggestion.id)
      return
    }

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
    // 거친 입력도 받으므로 형식 추론은 느슨하게 한다. 정확한 분류는
    // 사용자가 Script 단계에서 줄 종류를 직접 바꿔 고칠 수 있다.
    //
    // 주의: 한글은 대소문자가 없어 `text === text.toUpperCase()`가 항상 참이다.
    // 영문 대문자 규칙만으로 인물 이름을 판별하면 한글 대본의 모든 줄이
    // character가 되므로, 문장부호와 길이로 함께 판단한다.
    const isSceneHeading = (text) => /^(INT|EXT|I\/E)[. ]/i.test(text)
    const isTransition = (text) => /^(CUT TO|FADE (IN|OUT)|DISSOLVE|SMASH CUT)/i.test(text)
    const isParenthetical = (text) => text.startsWith('(') && text.endsWith(')')
    const isCharacterName = (text) => {
      if (!text || text.length > 20) return false
      if (isSceneHeading(text) || isTransition(text) || isParenthetical(text)) return false
      // 문장부호가 있으면 이름이 아니라 서술·대사로 본다.
      if (/[.!?,。…]/.test(text)) return false
      const hasLatin = /[a-zA-Z]/.test(text)
      // 영문은 전부 대문자일 때만 이름으로 본다.
      if (hasLatin) return text === text.toUpperCase()
      // 한글 등은 짧고 공백이 거의 없는 줄만 이름으로 본다.
      return text.split(/\s+/).length <= 2
    }

    const newScreenplay = lines.map((line, index) => {
      const trimmed = line.trim()
      const prev = index > 0 ? lines[index - 1].trim() : ''
      let type = 'action'

      if (isSceneHeading(trimmed)) type = 'scene-heading'
      else if (isTransition(trimmed)) type = 'transition'
      else if (isParenthetical(trimmed)) type = 'parenthetical'
      else if (isCharacterName(prev) || isParenthetical(prev)) type = 'dialogue'
      else if (isCharacterName(trimmed)) type = 'character'

      return { type, text: trimmed, beat: 0 }
    })
    setSceneIntention(rawSceneIntention.trim())
    setScreenplay(newScreenplay)
    setIsEditingRaw(false)
  }

  const handleNarrativeRequest = () => {
    if (!narrativeRequest.trim()) return
    requestNarrativeSuggestions({ narrativeRequest })
  }

  return (
    <div className={`storyboard-view ${isExpanded && !drawingWorkspaceOpen ? 'with-narrative-rail' : ''}`}>
      <div className="storyboard-scroll-container">
        <div className="storyboard-list-inner">
          {isExpanded && !drawingWorkspaceOpen && (
            <nav className="cut-plan-stages" aria-label="Storyboard stages">
              <ol>
                <li className={`stage-done${cutStage === 'script' ? ' stage-current' : ''}`}>
                  <button
                    type="button"
                    onClick={backToScript}
                    disabled={cutStage === 'script'}
                    aria-current={cutStage === 'script' ? 'step' : undefined}
                  >
                    <span className="stage-index">1</span>
                    <div>
                      <strong>Script</strong>
                      <em>{screenplay.length} lines · {beats.length} beats</em>
                    </div>
                  </button>
                </li>
                <li className={`${cutPlanAccepted ? 'stage-done' : cutPlan.length > 0 ? 'stage-active' : ''}${cutStage === 'cutplan' ? ' stage-current' : ''}`}>
                  <button
                    type="button"
                    onClick={cutPlan.length === 0 ? requestCutPlan : reopenCutPlan}
                    disabled={cutStage === 'cutplan'}
                    aria-current={cutStage === 'cutplan' ? 'step' : undefined}
                  >
                  <span className="stage-index">2</span>
                  <div>
                    <strong>Cut plan</strong>
                    <em>
                      {cutPlanSkipped
                        ? '건너뜀 · 전부 Tentative'
                        : cutPlanAccepted
                          ? `${cutPlan.length} cuts 확정`
                          : cutPlan.length > 0
                            ? `${cutPlan.length} cuts 검토 중`
                            : '컷 분해 필요'}
                    </em>
                  </div>
                  </button>
                </li>
                <li className={`${cutPlanAccepted ? 'stage-active' : 'stage-locked'}${cutStage === 'panels' ? ' stage-current' : ''}`}>
                  <button
                    type="button"
                    onClick={acceptCutPlan}
                    disabled={!cutPlanAccepted}
                    aria-current={cutStage === 'panels' ? 'step' : undefined}
                  >
                    <span className="stage-index">3</span>
                    <div>
                      <strong>Panels</strong>
                      <em>{cutPlanAccepted ? `${flowShots.length} panels` : '컷 확정 후 열림'}</em>
                    </div>
                  </button>
                </li>
              </ol>
            </nav>
          )}

          {showWriteScene && (
            <div className="inline-script-editor">
              <div className="editor-header">
                <h3>Write scene</h3>
                <p>
                  장면을 적거나 붙여넣으세요. 완성된 대본이 아니어도 됩니다 —
                  거친 메모나 간단한 대사도 괜찮습니다.
                </p>
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
                placeholder={'예:\n밤, 지하 관제실. 재인이 몰래 들어온다.\n민호는 이미 알고 있었다는 듯 앉아 있다.\n\n민호\n생각보다 오래 걸렸네.'}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />
              <div className="editor-actions">
                {!hasScreenplay && (
                  <div className="example-btn-group">
                    <button
                      type="button"
                      className="example-btn"
                      onClick={() => {
                        loadExampleScreenplay('rough')
                        setIsEditingRaw(false)
                      }}
                      title="Beat가 나뉘지 않은 투박한 초안"
                    >
                      예시 · 거친 초안
                    </button>
                    <button
                      type="button"
                      className="example-btn"
                      onClick={() => {
                        loadExampleScreenplay('formatted')
                        setIsEditingRaw(false)
                      }}
                      title="Beat까지 정리된 대본"
                    >
                      예시 · 정리된 대본
                    </button>
                  </div>
                )}
                {hasScreenplay && (
                  <button className="cancel-btn" onClick={() => setIsEditingRaw(false)}>Cancel</button>
                )}
                <button
                  className="apply-btn"
                  onClick={handleUploadScript}
                  disabled={!rawText.trim()}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {cutStage === 'script' && isExpanded && !drawingWorkspaceOpen && !showWriteScene && (
            <section className="cut-plan-gate" aria-label="Cut plan required">
              <span className="script-draft-mark" aria-hidden="true">N</span>
              <div className="cut-plan-gate-copy">
                <span>줄콘티 · Cut plan</span>
                <strong>
                  {cutPlan.length === 0
                    ? '그림 전에 컷을 먼저 나눕니다'
                    : cutPlanAccepted
                      ? '컷 구성이 확정되어 있습니다'
                      : '작업 중인 컷 구성이 있습니다'}
                </strong>
                <p>
                  {cutPlan.length === 0
                    ? '이 장면을 몇 개의 컷으로 나눌지, 각 컷에 무엇을 담을지 텍스트로 정합니다. 그림보다 고치기 쉽고, 컷 수와 순서가 그림 생성에 묻히지 않습니다.'
                    : cutPlanAccepted
                      ? `${cutPlan.length}개의 컷이 확정되어 있습니다. 대본을 확인했으면 패널로 돌아가세요.`
                      : `${cutPlan.length}개의 컷을 검토하던 중입니다. 대본을 확인했으면 이어서 진행하세요.`}
                </p>
              </div>
              <div className="cut-plan-gate-actions">
                {cutPlan.length > 0 ? (
                  <>
                    <button
                      type="button"
                      className="skip"
                      onClick={cutPlanAccepted ? reopenCutPlan : dismissCutPlan}
                    >
                      {cutPlanAccepted ? 'Edit cuts' : 'Discard cuts'}
                    </button>
                    <button
                      type="button"
                      className="use-draft"
                      onClick={clearCutPlanStageOverride}
                    >
                      {cutPlanAccepted ? 'Back to panels' : 'Continue cut plan'}
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="skip" onClick={skipCutPlan}>
                      Skip for now
                    </button>
                    <button type="button" className="use-draft" onClick={requestCutPlan}>
                      Propose cuts
                    </button>
                  </>
                )}
              </div>
            </section>
          )}

          {cutPlan.length > 0 && cutStage === 'cutplan' && isExpanded && !drawingWorkspaceOpen && (
            <section className="cut-plan-review" aria-label="Cut plan">
              <header>
                <span className="script-draft-mark" aria-hidden="true">N</span>
                <div>
                  <span>줄콘티 · Cut plan · Mock</span>
                  <strong>
                    {cutPlanSkipped ? '검토하지 않고 넘어간 컷 구성' : '컷 분해 제안'}
                  </strong>
                  <p>
                    {cutPlanSkipped
                      ? '컷 분해를 건너뛰어 자동 생성했습니다. 모든 컷이 Tentative로 남아 있습니다.'
                      : '그림으로 가기 전에 컷 수와 순서를 먼저 정합니다. 대본은 바뀌지 않습니다.'}
                  </p>
                </div>
                <div className="script-draft-actions">
                  <button type="button" onClick={backToScript}>Back to script</button>
                  <button type="button" onClick={requestCutPlan}>Again</button>
                  <button type="button" className="use-draft" onClick={acceptCutPlan}>
                    Accept cut plan
                  </button>
                </div>
              </header>

              <ol className="cut-plan-list">
                {cutPlan.map((item, index) => (
                  <li key={item.id} className={`cut-plan-item status-${item.status.toLowerCase()}`}>
                    <div className="cut-plan-item-head">
                      <span className="cut-plan-order">{String(item.order).padStart(2, '0')}</span>
                      <span className="cut-plan-beat">B{item.beat + 1}</span>
                      <span className={`cut-plan-provenance provenance-${item.provenance.toLowerCase()}`}>
                        {item.provenance}
                      </span>
                      <div className="cut-plan-status-group" role="group" aria-label={`Cut ${item.order} status`}>
                        {['Fixed', 'Tentative', 'Open'].map((status) => (
                          <button
                            key={status}
                            type="button"
                            className={item.status === status ? 'active' : ''}
                            onClick={() => setCutPlanItemStatus(item.id, status)}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                      <div className="cut-plan-item-tools">
                        <button
                          type="button"
                          onClick={() => moveCutPlanItem(item.id, -1)}
                          disabled={index === 0}
                          aria-label="Move cut up"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCutPlanItem(item.id, 1)}
                          disabled={index === cutPlan.length - 1}
                          aria-label="Move cut down"
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => addCutPlanItem(item.id, item.beat)}
                          aria-label="Add cut after"
                          title="Add cut after"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCutPlanItem(item.id)}
                          disabled={cutPlan.length === 1}
                          aria-label="Remove cut"
                          title="Remove cut"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <textarea
                      className="cut-plan-content"
                      value={item.content}
                      onChange={(event) => updateCutPlanItem(item.id, { content: event.target.value })}
                      placeholder="이 컷에서 무엇이 일어나는가"
                      aria-label={`Cut ${item.order} content`}
                      rows={2}
                    />
                    <div className="cut-plan-fields">
                      <label>
                        <span>Shot</span>
                        <select
                          value={item.shotSize}
                          onChange={(event) => updateCutPlanItem(item.id, { shotSize: event.target.value })}
                        >
                          {cutPlanShotSizes.map((size) => (
                            <option key={size} value={size}>{size}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Camera</span>
                        <input
                          type="text"
                          value={item.cameraMovement}
                          onChange={(event) => updateCutPlanItem(item.id, { cameraMovement: event.target.value })}
                          placeholder="Fixed / Pan / Dolly in"
                        />
                      </label>
                      <label>
                        <span>Reveals</span>
                        <input
                          type="text"
                          value={item.reveals}
                          onChange={(event) => updateCutPlanItem(item.id, { reveals: event.target.value })}
                          placeholder="이 컷이 새로 알려주는 것"
                        />
                      </label>
                      <label>
                        <span>Purpose</span>
                        <input
                          type="text"
                          value={item.purpose}
                          onChange={(event) => updateCutPlanItem(item.id, { purpose: event.target.value })}
                          placeholder="이 컷이 존재하는 이유"
                        />
                      </label>
                    </div>
                  </li>
                ))}
              </ol>
              <footer className="cut-plan-footer">
                <button type="button" onClick={() => addCutPlanItem(null, activeBeat)}>
                  + Add cut
                </button>
                <span>
                  {cutPlan.filter((item) => item.status === 'Fixed').length} Fixed ·{' '}
                  {cutPlan.filter((item) => item.status === 'Tentative').length} Tentative ·{' '}
                  {cutPlan.filter((item) => item.status === 'Open').length} Open
                </span>
              </footer>
            </section>
          )}

          {cutPlanOrphanedShots.length > 0 && isExpanded && !drawingWorkspaceOpen && (
            <div className="cut-plan-orphan-warning" role="status">
              <div>
                <strong>
                  그림이 있는 패널 {cutPlanOrphanedShots.length}개가 컷과 연결되지 않았습니다
                </strong>
                <p>
                  컷을 지우거나 순서를 크게 바꾸면 기존 그림이 갈 곳을 잃습니다.
                  컷을 다시 열어 자리를 만들거나, 이대로 진행할 수 있습니다.
                </p>
              </div>
              <div className="cut-plan-orphan-actions">
                <button type="button" onClick={clearCutPlanOrphanWarning}>
                  이대로 진행
                </button>
                <button
                  type="button"
                  className="reopen"
                  onClick={() => {
                    clearCutPlanOrphanWarning()
                    reopenCutPlan()
                  }}
                >
                  컷 다시 열기
                </button>
              </div>
            </div>
          )}

          {showStoryboardPanels && !drawingWorkspaceOpen && (
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

          {!isCutPlanStage && beats.map((beatGroup, i) => {
            const beatShots = getBeatShots(beatGroup.beat)
            const beatSuggestions = narrativeSuggestions.filter((suggestion) => suggestion.beat === beatGroup.beat)
            const inlineSuggestionTypes = new Set(['split-beat', 'insert-script-line', 'replace-script-line'])
            const nonBoundarySuggestions = beatSuggestions.filter((suggestion) => !inlineSuggestionTypes.has(suggestion.type))

            return (
              <div
                key={i}
                className={`sb-item ${showStoryboardPanels ? 'layout-expanded' : isExpanded ? 'layout-script-focus' : 'layout-sidebar'} ${beatGroup.beat === activeBeat ? 'active-beat' : ''}`}
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
                        {isScriptStage ? (
                          <ScriptLineEditor
                            element={el}
                            index={el.globalIdx}
                            onChange={updateScreenplayLine}
                            onChangeType={setScreenplayLineType}
                            onInsertAfter={insertScreenplayLine}
                            onRemove={removeScreenplayLine}
                            canRemove={screenplay.length > 1}
                          />
                        ) : (
                          <div className={`sb-script-${el.type}`}>
                            {el.text}
                          </div>
                        )}
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
                  {isScriptStage && beatGroup.elements.length > 0 && (
                    <button
                      type="button"
                      className="script-line-add"
                      onClick={(event) => {
                        event.stopPropagation()
                        insertScreenplayLine(
                          beatGroup.elements[beatGroup.elements.length - 1].globalIdx,
                        )
                      }}
                    >
                      + Add line
                    </button>
                  )}
                  {nonBoundarySuggestions.map((suggestion) => (
                    <NarrativeSuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      onAccept={handleAcceptNarrativeSuggestion}
                      onDismiss={dismissNarrativeSuggestion}
                    />
                  ))}
                </div>

                {showStoryboardPanels && (
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
                              {/* 이 패널이 어느 컷에서 나왔는지 보인다. */}
                              {(() => {
                                const originCut = cutPlan.find((item) => item.id === shot.cutPlanItemId)
                                if (!originCut) return null
                                return (
                                  <span
                                    className={`sb-shot-cut-origin status-${originCut.status.toLowerCase()}`}
                                    title={`Cut ${originCut.order} · ${originCut.shotSize} · ${originCut.status}`}
                                  >
                                    C{String(originCut.order).padStart(2, '0')} · {originCut.shotSize}
                                  </span>
                                )
                              })()}
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
      {isExpanded && !drawingWorkspaceOpen && (
        <aside
          className={`storyboard-narrative-rail ${narrativeRailOpen ? 'open' : 'collapsed'}`}
          aria-label="Narrative Agent"
        >
          <header className="narrative-rail-header">
            {narrativeRailOpen && (
              <>
                <span className="narrative-agent-mark" aria-hidden="true">
                  N
                  <i />
                </span>
                <div>
                  <strong>Narrative Agent</strong>
                  <span>Script collaborator</span>
                </div>
              </>
            )}
            <button
              type="button"
              className="narrative-rail-toggle"
              onClick={() => setNarrativeRailOpen((open) => !open)}
              aria-label={narrativeRailOpen ? 'Collapse Narrative Agent' : 'Open Narrative Agent'}
              title={narrativeRailOpen ? 'Collapse Narrative Agent' : 'Open Narrative Agent'}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={narrativeRailOpen ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
              </svg>
            </button>
          </header>

          {narrativeRailOpen ? (
            <>
              <section className="narrative-rail-context">
                <div className="narrative-rail-section-label">
                  <span>Working context</span>
                  <em>Live</em>
                </div>
                <strong>
                  {needsScreenplayFormatting
                    ? '줄거리 상태의 이야기'
                    : needsBeatSplit
                      ? '아직 나뉘지 않은 장면'
                      : `Beat ${String(activeBeat + 1).padStart(2, '0')} · 전체 ${beats.length}`}
                </strong>
                <p>
                  {sceneIntention
                    || 'Scene intention이 없습니다. 현재 대본과 Beat만 기준으로 제안합니다.'}
                </p>
              </section>

              <section className="narrative-rail-guidance">
                <span>Next step</span>
                {/* 사용자가 무엇을 물어야 할지 몰라도 다음 단계가 보이게 한다.
                    대본이 한 덩어리면 Beat 나누기가 먼저다. */}
                {needsScreenplayFormatting ? (
                  <>
                    <p>
                      아직 줄거리 설명에 가깝습니다. 화면에 보이는 지문과 대사로
                      바꾸면 이후 Beat와 컷을 나눌 수 있습니다.
                    </p>
                    <button
                      type="button"
                      className="narrative-rail-primary"
                      onClick={requestScreenplayFormatting}
                    >
                      대본으로 다듬기
                    </button>
                  </>
                ) : needsBeatSplit ? (
                  <>
                    <p>
                      대본이 아직 한 덩어리입니다. 국면이 바뀌는 지점을 찾아
                      Beat로 나누면 이후 작업을 Beat 단위로 진행할 수 있습니다.
                    </p>
                    <button
                      type="button"
                      className="narrative-rail-primary"
                      onClick={requestBeatSplit}
                    >
                      Beat 나누기 제안
                    </button>
                  </>
                ) : (
                  <p>
                    Beat {activeBeat + 1}을(를) 보고 있습니다. 이 Beat의 행동과
                    대사를 조금씩 고쳐 나가세요.
                  </p>
                )}
                {narrativeSuggestions.length > 0 ? (
                  <div className="narrative-rail-proposal-status">
                    <span>{narrativeSuggestions.length}</span>
                    <div>
                      <strong>Proposal ready</strong>
                      <p>대본 안의 관련 위치에 표시했습니다.</p>
                    </div>
                  </div>
                ) : (
                  <div className="narrative-rail-empty">
                    제안은 대본 위에 직접 표시되며 자동으로 원문을 바꾸지 않습니다.
                  </div>
                )}
              </section>

              <div className="narrative-rail-composer">
                <label htmlFor="narrative-screenplay-request">Request</label>
                <textarea
                  id="narrative-screenplay-request"
                  value={narrativeRequest}
                  onChange={(event) => setNarrativeRequest(event.target.value)}
                  placeholder="예: 이 Beat를 둘로 나누고 대사를 덜 설명적으로 바꿔줘."
                  aria-label={`Narrative request for Beat ${activeBeat + 1}`}
                  rows={4}
                />
                <div>
                  <span>{`Beat ${activeBeat + 1}에 적용`}</span>
                  <button
                    type="button"
                    disabled={!narrativeRequest.trim()}
                    onClick={handleNarrativeRequest}
                  >
                    Propose
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="narrative-rail-collapsed-label"
              onClick={() => setNarrativeRailOpen(true)}
            >
              <span>N</span>
              <strong>Narrative</strong>
              {narrativeSuggestions.length > 0 && <em>{narrativeSuggestions.length}</em>}
            </button>
          )}
        </aside>
      )}
    </div>
  )
}
