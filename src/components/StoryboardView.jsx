import { useCallback, useEffect, useRef, useState } from 'react'
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
function ScriptLineEditor({
  element, index, onChange, onChangeType, onInsertAfter, onRemove, canRemove, showTools,
  autoFocus, focusCaret, onFocused, onMoveFocus,
}) {
  const textareaRef = useRef(null)

  // 내용에 맞춰 높이를 맞춰야 대본처럼 읽힌다.
  const resize = () => {
    const node = textareaRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }

  useEffect(resize, [element.text])

  // Enter로 만든 줄이나 위아래 이동으로 지목된 줄에 커서를 옮긴다.
  // 이게 없으면 새 줄이 생겨도 계속 이전 줄에 타이핑하게 된다.
  useEffect(() => {
    if (!autoFocus) return
    const node = textareaRef.current
    if (!node) return
    node.focus()
    const caret = focusCaret === 'end' ? node.value.length : Math.min(focusCaret ?? 0, node.value.length)
    node.setSelectionRange(caret, caret)
    onFocused?.()
  }, [autoFocus, focusCaret, onFocused])

  return (
    <div className="script-line-editor" onClick={(event) => event.stopPropagation()}>
      {showTools && (
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
      )}
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
          const node = event.currentTarget
          const caret = node.selectionStart
          const atStart = caret === 0 && node.selectionEnd === 0
          const atEnd = caret === node.value.length && node.selectionEnd === node.value.length

          // Enter: 커서 뒤 내용을 새 줄로 넘긴다. textarea에서 줄바꿈하듯 쓰인다.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            const before = node.value.slice(0, caret)
            const after = node.value.slice(node.selectionEnd)
            // 인물 이름 다음 줄은 대사로 이어지는 것이 자연스럽다.
            const nextType = element.type === 'character' ? 'dialogue' : element.type
            onInsertAfter(index, nextType, { before, after })
            return
          }

          // 줄 맨 앞에서 Backspace: 앞 줄과 합친다.
          if (event.key === 'Backspace' && atStart && index > 0) {
            event.preventDefault()
            onRemove(index, { mergeIntoPrevious: true })
            return
          }

          if (event.key === 'Backspace' && element.text === '' && canRemove) {
            event.preventDefault()
            onRemove(index)
            return
          }

          // 줄 경계에서 위아래 화살표는 다음 줄로 넘어간다.
          if (event.key === 'ArrowUp' && atStart) {
            event.preventDefault()
            onMoveFocus?.(index - 1, 'end')
          } else if (event.key === 'ArrowDown' && atEnd) {
            event.preventDefault()
            onMoveFocus?.(index + 1, 0)
          }
        }}
      />
      {showTools && (
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
      )}
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
  const addBeatAfter = useStore((s) => s.addBeatAfter)
  const requestBeatSplit = useStore((s) => s.requestBeatSplit)
  const requestScreenplayFormatting = useStore((s) => s.requestScreenplayFormatting)
  const screenplayDraft = useStore((s) => s.screenplayDraft)
  const acceptScreenplayDraft = useStore((s) => s.acceptScreenplayDraft)
  const dismissScreenplayDraft = useStore((s) => s.dismissScreenplayDraft)
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
  // 줄 종류·삭제 버튼은 Beat 단위로 켠다. 평소엔 대본만 보이게 한다.
  const [editingBeat, setEditingBeat] = useState(null)
  // Enter나 화살표로 옮겨갈 줄. { index, caret } 형태.
  const [pendingFocus, setPendingFocus] = useState(null)
  // 접어둔 컷 플랜 Beat 번호.
  const [collapsedCutBeats, setCollapsedCutBeats] = useState([])
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

  // 컷을 Beat별로 묶는다. index는 전체 기준이어야 이동·삭제가 맞는다.
  const cutPlanBeatGroups = []
  cutPlan.forEach((item, index) => {
    const last = cutPlanBeatGroups[cutPlanBeatGroups.length - 1]
    if (last && last.beat === item.beat) last.items.push({ item, index })
    else cutPlanBeatGroups.push({ beat: item.beat, items: [{ item, index }] })
  })

  const toggleCutBeat = (beat) => setCollapsedCutBeats((current) => (
    current.includes(beat) ? current.filter((b) => b !== beat) : [...current, beat]
  ))

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

  // 포커스를 옮기고 나면 즉시 비운다. 남겨두면 다른 줄을 클릭해도 계속
  // 이 줄로 커서가 되돌아온다.
  const clearPendingFocus = useCallback(() => setPendingFocus(null), [])

  const handleMoveFocus = useCallback((index, caret) => {
    if (index < 0 || index >= screenplay.length) return
    setPendingFocus({ index, caret })
  }, [screenplay.length])

  // 새 Beat의 첫 줄은 비어 있으므로 커서를 거기로 보낸다.
  const handleAddBeatAfter = (beatGroup) => {
    const lastIdx = beatGroup.elements[beatGroup.elements.length - 1].globalIdx
    addBeatAfter(beatGroup.beat)
    setPendingFocus({ index: lastIdx + 1, caret: 0 })
  }

  // 줄을 새로 만들거나 합친 뒤 커서가 따라가게 한다.
  const handleInsertLine = (afterIndex, type, split) => {
    insertScreenplayLine(afterIndex, type, split)
    setPendingFocus({ index: afterIndex + 1, caret: 0 })
  }

  const handleRemoveLine = (index, options = {}) => {
    if (options.mergeIntoPrevious && index > 0) {
      // 합쳐진 지점(앞 줄의 원래 끝)에 커서를 둔다.
      const caret = screenplay[index - 1].text.length
      removeScreenplayLine(index, options)
      setPendingFocus({ index: index - 1, caret })
      return
    }
    removeScreenplayLine(index, options)
    setPendingFocus({ index: Math.max(0, index - 1), caret: 'end' })
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

          {/* 줄글에서 세운 대본 초안. 원문은 수락 전까지 그대로 둔다. */}
          {screenplayDraft && cutStage === 'script' && isExpanded && !drawingWorkspaceOpen && !showWriteScene && (
            <section className="screenplay-draft-review" aria-label="Screenplay draft">
              <header>
                <span className="script-draft-mark" aria-hidden="true">N</span>
                <div>
                  <span>Narrative · Mock</span>
                  <strong>대본 초안</strong>
                  <p>
                    {screenplayDraft.sourceCount}개의 서술을 지문과 대사로 풀고
                    Beat {screenplayDraft.beatCount}개로 나눴습니다. 현재 대본은 아직 바뀌지 않았습니다.
                  </p>
                </div>
                <div className="script-draft-actions">
                  <button type="button" onClick={dismissScreenplayDraft}>Dismiss</button>
                  <button type="button" onClick={requestScreenplayFormatting}>Again</button>
                  <button type="button" className="use-draft" onClick={acceptScreenplayDraft}>
                    Use draft
                  </button>
                </div>
              </header>
              <div className="screenplay-draft-body">
                {screenplayDraft.screenplay.map((element, index) => {
                  const previous = screenplayDraft.screenplay[index - 1]
                  const startsBeat = !previous || previous.beat !== element.beat
                  return (
                    <div key={`${element.type}-${index}`}>
                      {startsBeat && (
                        <div className="screenplay-draft-beat">
                          Beat {String(element.beat + 1).padStart(2, '0')}
                        </div>
                      )}
                      <div className={`sb-script-${element.type}`}>{element.text}</div>
                    </div>
                  )
                })}
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
                  {/* 컷 삭제는 컷 플랜 화면 안에서만. rail의 보조 버튼과
                      역할이 섞이지 않게 한다. */}
                  <button type="button" onClick={dismissCutPlan}>Discard</button>
                  <button type="button" className="use-draft" onClick={acceptCutPlan}>
                    Accept cut plan
                  </button>
                </div>
              </header>

              <div className="cut-plan-table-wrap">
                <table className="cut-plan-table">
                  <thead>
                    <tr>
                      <th className="col-cut">컷</th>
                      <th className="col-time">시간</th>
                      <th className="col-place">장소</th>
                      <th className="col-content">내용</th>
                      <th className="col-purpose">중요한 것</th>
                      <th className="col-cast">인물</th>
                      <th className="col-shot">샷</th>
                      <th className="col-status">상태</th>
                      <th className="col-tools" aria-label="Actions" />
                    </tr>
                  </thead>
                  {cutPlanBeatGroups.map((group) => {
                    const collapsed = collapsedCutBeats.includes(group.beat)
                    return (
                      <tbody key={group.beat} className="cut-plan-beat-group">
                        <tr className="cut-plan-beat-row">
                          <th colSpan={9}>
                            <button
                              type="button"
                              onClick={() => toggleCutBeat(group.beat)}
                              aria-expanded={!collapsed}
                            >
                              <span className="cut-plan-beat-caret">{collapsed ? '▸' : '▾'}</span>
                              Beat {String(group.beat + 1).padStart(2, '0')}
                              <em>{group.items.length} cuts</em>
                            </button>
                          </th>
                        </tr>
                        {!collapsed && group.items.map(({ item, index }) => (
                        <tr key={item.id} className={`status-${item.status.toLowerCase()}`}>
                          <td className="col-cut">
                            <span className="cut-plan-number">
                              {item.beat + 1}-{item.beatOrder}
                            </span>
                            <span className={`cut-plan-provenance provenance-${item.provenance.toLowerCase()}`}>
                              {item.provenance}
                            </span>
                          </td>
                          <td className="col-time">
                            <input
                              type="text"
                              value={item.time}
                              onChange={(event) => updateCutPlanItem(item.id, { time: event.target.value })}
                              aria-label={`Cut ${item.order} time`}
                            />
                          </td>
                          <td className="col-place">
                            <input
                              type="text"
                              value={item.place}
                              onChange={(event) => updateCutPlanItem(item.id, { place: event.target.value })}
                              aria-label={`Cut ${item.order} place`}
                            />
                          </td>
                          <td className="col-content">
                            <input
                              type="text"
                              value={item.content}
                              onChange={(event) => updateCutPlanItem(item.id, { content: event.target.value })}
                              placeholder="이 컷에서 무엇이 일어나는가"
                              aria-label={`Cut ${item.order} content`}
                            />
                          </td>
                          <td className="col-purpose">
                            <input
                              type="text"
                              value={item.purpose}
                              onChange={(event) => updateCutPlanItem(item.id, { purpose: event.target.value })}
                              placeholder="이 컷이 존재하는 이유"
                              aria-label={`Cut ${item.order} purpose`}
                            />
                          </td>
                          <td className="col-cast">
                            <input
                              type="text"
                              value={item.characters}
                              onChange={(event) => updateCutPlanItem(item.id, { characters: event.target.value })}
                              aria-label={`Cut ${item.order} characters`}
                            />
                          </td>
                          <td className="col-shot">
                            <select
                              value={item.shotSize}
                              onChange={(event) => updateCutPlanItem(item.id, { shotSize: event.target.value })}
                              aria-label={`Cut ${item.order} shot size`}
                            >
                              {cutPlanShotSizes.map((size) => (
                                <option key={size} value={size}>{size}</option>
                              ))}
                            </select>
                          </td>
                          <td className="col-status">
                            <select
                              className={`cut-plan-status-select status-${item.status.toLowerCase()}`}
                              value={item.status}
                              onChange={(event) => setCutPlanItemStatus(item.id, event.target.value)}
                              aria-label={`Cut ${item.order} status`}
                            >
                              <option value="Fixed">Fixed</option>
                              <option value="Tentative">Tentative</option>
                              <option value="Open">Open</option>
                            </select>
                          </td>
                          <td className="col-tools">
                            <div className="cut-plan-row-tools">
                              <button
                                type="button"
                                onClick={() => moveCutPlanItem(item.id, -1)}
                                disabled={index === 0}
                                aria-label="Move cut up"
                                title="위로"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() => moveCutPlanItem(item.id, 1)}
                                disabled={index === cutPlan.length - 1}
                                aria-label="Move cut down"
                                title="아래로"
                              >
                                ↓
                              </button>
                              <button
                                type="button"
                                onClick={() => addCutPlanItem(item.id, item.beat)}
                                aria-label="Add cut after"
                                title="아래에 컷 추가"
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => removeCutPlanItem(item.id)}
                                disabled={cutPlan.length === 1}
                                aria-label="Remove cut"
                                title="삭제"
                              >
                                ×
                              </button>
                            </div>
                          </td>
                        </tr>
                        ))}
                      </tbody>
                    )
                  })}
                </table>
              </div>

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
                {i > 0 && !isScriptStage && (
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
                  {/* Beat 경계 표시이자 이 Beat의 조작 지점. 줄마다 버튼을
                      띄우지 않고 여기로 모은다. */}
                  {(beats.length > 1 || isScriptStage) && (
                    <div className="sb-beat-label">
                      <span>Beat {String(beatGroup.beat + 1).padStart(2, '0')}</span>
                      <em>{beatGroup.elements.length} lines</em>
                      {isScriptStage && (
                        <div className="sb-beat-tools">
                          <button
                            type="button"
                            className={editingBeat === beatGroup.beat ? 'active' : ''}
                            onClick={(event) => {
                              event.stopPropagation()
                              setEditingBeat(editingBeat === beatGroup.beat ? null : beatGroup.beat)
                            }}
                            title="줄 종류와 삭제를 표시"
                          >
                            {editingBeat === beatGroup.beat ? '완료' : '줄 편집'}
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleAddBeatAfter(beatGroup)
                            }}
                            title="이 Beat 다음에 새 Beat 추가"
                          >
                            + Beat
                          </button>
                          {i > 0 && (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                mergeBeat(beatGroup.elements[0].globalIdx)
                              }}
                              title="위 Beat와 합치기"
                            >
                              ↑ 합치기
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
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
                            onInsertAfter={handleInsertLine}
                            onRemove={handleRemoveLine}
                            canRemove={screenplay.length > 1}
                            showTools={editingBeat === beatGroup.beat}
                            autoFocus={pendingFocus?.index === el.globalIdx}
                            focusCaret={pendingFocus?.caret}
                            onFocused={clearPendingFocus}
                            onMoveFocus={handleMoveFocus}
                          />
                        ) : (
                          <div className={`sb-script-${el.type}`}>
                            {el.text}
                          </div>
                        )}
                        {/* Beat 나누기는 줄 편집 모드에서만. 평소 hover마다
                            버튼이 튀어나오면 대본 읽기를 방해한다. */}
                        <button
                          className={`split-beat-btn${editingBeat === beatGroup.beat ? ' always-on' : ''}`}
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
              {/* Scene intention은 있을 때만 보여준다. 나머지 상태는 대본의
                  Beat 라벨과 상단 단계 표시에 이미 드러나 있다. */}
              {sceneIntention && (
                <section className="narrative-rail-context">
                  <span>Scene intention</span>
                  <p>{sceneIntention}</p>
                </section>
              )}

              <section className="narrative-rail-guidance">
                <span>Next step</span>
                {/* 사용자가 무엇을 물어야 할지 몰라도 다음 단계가 보이게 한다.
                    줄글 → 대본 → Beat → 컷 순서로 이어진다. */}
                {needsScreenplayFormatting ? (
                  <>
                    <p>
                      아직 줄거리 설명에 가깝습니다. 지문과 대사로 풀고 Beat까지
                      나눈 초안을 만듭니다.
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
                ) : cutStage === 'script' ? (
                  <>
                    <p>
                      대본이 준비됐습니다. 그림 전에 이 장면을 몇 개의 컷으로
                      나눌지 텍스트로 정합니다.
                    </p>
                    <button
                      type="button"
                      className="narrative-rail-primary"
                      onClick={cutPlan.length > 0 ? clearCutPlanStageOverride : requestCutPlan}
                    >
                      {cutPlan.length > 0 ? '컷 플랜 이어서' : '컷 플랜 만들기'}
                    </button>
                    {/* 보조 동작은 언제나 '건너뛰기'로 고정한다. 상황에 따라
                        삭제로 바뀌면 같은 자리의 버튼이 다른 일을 하게 된다. */}
                    <button
                      type="button"
                      className="narrative-rail-secondary"
                      onClick={skipCutPlan}
                    >
                      건너뛰고 패널로
                    </button>
                  </>
                ) : (
                  <p>
                    Beat {activeBeat + 1}을(를) 보고 있습니다. 이 Beat의 행동과
                    대사를 조금씩 고쳐 나가세요.
                  </p>
                )}
                {narrativeSuggestions.length > 0 && (
                  <div className="narrative-rail-proposal-status">
                    <span>{narrativeSuggestions.length}</span>
                    <div>
                      <strong>Proposal ready</strong>
                      <p>대본 안의 관련 위치에 표시했습니다.</p>
                    </div>
                  </div>
                )}
              </section>

              {/* Next step 바로 아래에 둔다. 제시된 다음 단계와 직접
                  이어지는 입력이기 때문이다. */}
              <div className="narrative-rail-composer">
                <label htmlFor="narrative-screenplay-request">Request</label>
                <textarea
                  id="narrative-screenplay-request"
                  value={narrativeRequest}
                  onChange={(event) => setNarrativeRequest(event.target.value)}
                  placeholder="예: 이 Beat를 둘로 나누고 대사를 덜 설명적으로 바꿔줘."
                  aria-label={`Narrative request for Beat ${activeBeat + 1}`}
                  rows={3}
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
