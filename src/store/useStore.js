import { create } from 'zustand'

// Screenplay data
const SCREENPLAY = [
  { type: 'scene-heading', text: 'INT. RURAL GAS STATION — DAY', beat: 0 },
  { type: 'action', text: 'An old, dusty gas station. The PROPRIETOR (60s) stands behind the counter. ANTON CHIGURH (40s), a terrifyingly calm man, finishes a bag of cashews.', beat: 0 },
  { type: 'character', text: 'CHIGURH', beat: 0 },
  { type: 'dialogue', text: "What's the most you ever lost on a coin toss?", beat: 0 },
  { type: 'character', text: 'PROPRIETOR', beat: 0 },
  { type: 'dialogue', text: 'Sir?', beat: 0 },
  { type: 'character', text: 'CHIGURH', beat: 0 },
  { type: 'dialogue', text: 'The most. You ever lost. On a coin toss.', beat: 0 },
  { type: 'action', text: 'Chigurh pulls a quarter from his pocket. He flips it, catches it, and slaps it on the counter.', beat: 1 },
  { type: 'character', text: 'CHIGURH', beat: 1 },
  { type: 'dialogue', text: 'Call it.', beat: 1 },
  { type: 'character', text: 'PROPRIETOR', beat: 2 },
  { type: 'dialogue', text: 'For what?', beat: 2 },
  { type: 'character', text: 'CHIGURH', beat: 2 },
  { type: 'dialogue', text: "You need to call it. I can't call it for you. It wouldn't be fair.", beat: 2 },
  { type: 'character', text: 'PROPRIETOR', beat: 2 },
  { type: 'dialogue', text: "I didn't put nothin' up.", beat: 2 },
  { type: 'character', text: 'CHIGURH', beat: 2 },
  { type: 'dialogue', text: "Yes, you did. You've been putting it up your whole life, you just didn't know it.", beat: 2 },
  { type: 'action', text: 'Chigurh leans in slightly. His eyes are dead, unblinking.', beat: 3 },
  { type: 'character', text: 'CHIGURH', beat: 3 },
  { type: 'dialogue', text: 'You know what date is on this coin?', beat: 3 },
  { type: 'character', text: 'PROPRIETOR', beat: 3 },
  { type: 'dialogue', text: 'No.', beat: 3 },
  { type: 'character', text: 'CHIGURH', beat: 3 },
  { type: 'dialogue', text: "1958. It's been traveling twenty-two years to get here. And now it's here. And you have to say. Call it.", beat: 3 },
  { type: 'action', text: 'The oppressive silence stretches. The Proprietor looks at the coin, then at Chigurh.', beat: 4 },
  { type: 'character', text: 'PROPRIETOR', beat: 4 },
  { type: 'dialogue', text: 'Look, I need to know what I stand to win.', beat: 4 },
  { type: 'character', text: 'CHIGURH', beat: 4 },
  { type: 'dialogue', text: 'Everything.', beat: 4 },
  { type: 'action', text: 'The Proprietor swallows hard.', beat: 5 },
  { type: 'character', text: 'PROPRIETOR', beat: 5 },
  { type: 'dialogue', text: 'Alright. Heads then.', beat: 5 },
  { type: 'action', text: 'Chigurh slowly lifts his hand from the coin. He looks at it.', beat: 6 },
  { type: 'character', text: 'CHIGURH', beat: 6 },
  { type: 'dialogue', text: 'Well done.', beat: 6 },
  { type: 'action', text: 'Chigurh slides the coin across the counter to him.', beat: 6 },
  { type: 'character', text: 'CHIGURH', beat: 6 },
  { type: 'dialogue', text: "Don't put it in your pocket, sir. Or it'll get mixed in with the others and become just a coin. Which it is.", beat: 6 },
  { type: 'action', text: 'Chigurh turns and leaves the store.', beat: 6 },
  { type: 'transition', text: 'CUT TO BLACK.', beat: 6 },
]

// Dummy strategy data with image paths and spatial coordinates
const DEMO_STRATEGIES = [
  {
    id: 'A',
    name: 'Slow Burn Tension',
    shots: [
      { order: 1, image: null, x: 450, y: 700, angle: -90, intent: 'ESTABLISH SPACE', cir: { shotSize: 'Wide', relation: 'Master' } },
      { order: 2, image: null, x: 200, y: 450, angle: -30, intent: 'SUBJECTIVE PRESSURE', cir: { shotSize: 'Medium', relation: 'OTS' } },
      { order: 3, image: null, x: 500, y: 250, angle: 90, intent: 'REACTION EMPHASIS', cir: { shotSize: 'Close-Up', relation: 'Single' } },
      { order: 4, image: null, x: 750, y: 450, angle: -150, intent: 'ISOLATION / VULNERABILITY', cir: { shotSize: 'Medium Close', relation: 'Single' } },
      { order: 5, image: null, x: 350, y: 350, angle: 0, intent: 'RELATIONSHIP RESET', cir: { shotSize: 'Medium', relation: 'Two-shot' } },
      { order: 6, image: null, x: 450, y: 800, angle: -90, intent: 'CLIMATIC BEAT', cir: { shotSize: 'ECU', relation: 'Single' } },
      { order: 7, image: null, x: 450, y: 900, angle: -90, intent: 'CLIMATIC BEAT', cir: { shotSize: 'ECU', relation: 'Single' } },
    ]
  },
]

const STRATEGY_COLORS = [
  { color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)', raw: '#10b981' },
  { color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)', raw: '#8b5cf6' },
  { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)', raw: '#ef4444' },
]

const getShotKey = (strategyIdx, shotIdx) => `${strategyIdx}-${shotIdx}`

const useStore = create((set, get) => ({
  viewMode: 'script',
  setViewMode: (mode) => set({ viewMode: mode }),
  overviewTab: 'spatial',
  setOverviewTab: (tab) => set({ overviewTab: tab }),
  isScriptOpen: false,
  isDrawerExpanded: false,
  setIsDrawerExpanded: (val) => set({ isDrawerExpanded: val }),
  drawerTab: 'script',
  setDrawerTab: (tab) => set({ drawerTab: tab }),
  toggleScript: () => set((state) => ({ isScriptOpen: !state.isScriptOpen })),
  setScriptOpen: (val) => set({ isScriptOpen: val }),
  screenplay: SCREENPLAY,
  setScreenplay: (script) => set({ screenplay: script }),
  scriptEditorRequestKey: 0,
  requestScriptEditor: () => set((state) => ({ scriptEditorRequestKey: state.scriptEditorRequestKey + 1 })),
  
  // 비트 나누기: 특정 지점에서 대본을 자르고 그 자리에 새로운 샷 칸 삽입
  splitBeat: (elementIndex) => set((state) => {
    const newScreenplay = [...state.screenplay]
    
    // 1. 해당 지점부터 끝까지 일단 비트 번호 증가
    for (let i = elementIndex; i < newScreenplay.length; i++) {
      newScreenplay[i].beat = (newScreenplay[i].beat || 0) + 1
    }

    // 2. 비트 번호 순차 재정렬 (0, 1, 2... 빈 틈 없게)
    let currentNewBeat = 0
    let lastOldBeat = newScreenplay[0].beat
    newScreenplay[0].beat = 0
    for (let i = 1; i < newScreenplay.length; i++) {
      if (newScreenplay[i].beat !== lastOldBeat) {
        currentNewBeat++
        lastOldBeat = newScreenplay[i].beat
      }
      newScreenplay[i].beat = currentNewBeat
    }

    // 3. 삽입될 샷의 인덱스 계산 (방금 생성된 비트 번호가 삽입 위치)
    const insertAt = newScreenplay[elementIndex].beat

    // 4. 스토리보드 샷 리스트 중간에 정확히 삽입
    const newStrategies = [...state.strategies]
    const strategy = { ...newStrategies[state.activeStrategy] }
    const newShots = [...strategy.shots]
    
    newShots.splice(insertAt, 0, { 
      order: insertAt + 1, 
      intent: 'NEW SHOT',
      cir: { shotSize: 'Medium', relation: 'Single' }
    })
    
    // order 재정렬
    newShots.forEach((s, idx) => { s.order = idx + 1 })
    
    strategy.shots = newShots
    newStrategies[state.activeStrategy] = strategy

    // 5. 스케치 데이터(Draw) 밀어주기
    const newShotSketches = { ...state.shotSketches }
    const strategyPrefix = `${state.activeStrategy}-`
    const keys = Object.keys(newShotSketches)
      .filter(k => k.startsWith(strategyPrefix))
      .map(k => parseInt(k.split('-')[1]))
      .sort((a, b) => b - a)

    keys.forEach(idx => {
      if (idx >= insertAt) {
        newShotSketches[`${strategyPrefix}${idx + 1}`] = newShotSketches[`${strategyPrefix}${idx}`]
        delete newShotSketches[`${strategyPrefix}${idx}`]
      }
    })

    const newReframeHistory = { ...state.reframeHistory }
    const historyKeys = Object.keys(newReframeHistory)
      .filter(k => k.startsWith(strategyPrefix))
      .map(k => parseInt(k.split('-')[1]))
      .sort((a, b) => b - a)

    historyKeys.forEach(idx => {
      if (idx >= insertAt) {
        newReframeHistory[getShotKey(state.activeStrategy, idx + 1)] = newReframeHistory[getShotKey(state.activeStrategy, idx)]
        delete newReframeHistory[getShotKey(state.activeStrategy, idx)]
      }
    })

    return {
      screenplay: newScreenplay,
      strategies: newStrategies,
      shotSketches: newShotSketches,
      reframeHistory: newReframeHistory,
    }
  }),

  // 비트 합치기: 현재 비트를 이전 비트와 병합하고 해당 샷 삭제
  mergeBeat: (elementIndex) => set((state) => {
    if (elementIndex === 0) return state
    const newScreenplay = [...state.screenplay]
    
    // 1. 삭제될 샷의 인덱스 파악 (현재 요소의 비트 번호)
    const deleteIdx = newScreenplay[elementIndex].beat
    const targetBeat = newScreenplay[elementIndex - 1].beat

    // 2. 비트 병합
    const currentBeat = newScreenplay[elementIndex].beat
    for (let i = elementIndex; i < newScreenplay.length; i++) {
      if (newScreenplay[i].beat === currentBeat) {
        newScreenplay[i].beat = targetBeat
      }
    }

    // 3. 비트 번호 순차 재정렬
    let currentNewBeat = 0
    let lastOldBeat = newScreenplay[0].beat
    newScreenplay[0].beat = 0
    for (let i = 1; i < newScreenplay.length; i++) {
      if (newScreenplay[i].beat !== lastOldBeat) {
        currentNewBeat++
        lastOldBeat = newScreenplay[i].beat
      }
      newScreenplay[i].beat = currentNewBeat
    }

    // 4. 스토리보드 샷 삭제
    const newStrategies = [...state.strategies]
    const strategy = { ...newStrategies[state.activeStrategy] }
    const newShots = [...strategy.shots]
    
    newShots.splice(deleteIdx, 1)
    newShots.forEach((s, idx) => { s.order = idx + 1 })

    strategy.shots = newShots
    newStrategies[state.activeStrategy] = strategy

    // 5. 스케치 데이터 당기기
    const newShotSketches = { ...state.shotSketches }
    const strategyPrefix = `${state.activeStrategy}-`
    delete newShotSketches[`${strategyPrefix}${deleteIdx}`]
    
    const keys = Object.keys(newShotSketches)
      .filter(k => k.startsWith(strategyPrefix))
      .map(k => parseInt(k.split('-')[1]))
      .sort((a, b) => a - b)

    keys.forEach(idx => {
      if (idx > deleteIdx) {
        newShotSketches[`${strategyPrefix}${idx - 1}`] = newShotSketches[`${strategyPrefix}${idx}`]
        delete newShotSketches[`${strategyPrefix}${idx}`]
      }
    })

    const newReframeHistory = { ...state.reframeHistory }
    delete newReframeHistory[getShotKey(state.activeStrategy, deleteIdx)]

    const historyKeys = Object.keys(newReframeHistory)
      .filter(k => k.startsWith(strategyPrefix))
      .map(k => parseInt(k.split('-')[1]))
      .sort((a, b) => a - b)

    historyKeys.forEach(idx => {
      if (idx > deleteIdx) {
        newReframeHistory[getShotKey(state.activeStrategy, idx - 1)] = newReframeHistory[getShotKey(state.activeStrategy, idx)]
        delete newReframeHistory[getShotKey(state.activeStrategy, idx)]
      }
    })

    return {
      screenplay: newScreenplay,
      strategies: newStrategies,
      shotSketches: newShotSketches,
      reframeHistory: newReframeHistory,
    }
  }),

  activeBeat: 0,
  setActiveBeat: (beat) => set({ activeBeat: beat }),
  strategies: DEMO_STRATEGIES,
  activeStrategy: 0,
  setStrategies: (strategies) => set({ strategies }),
  setActiveStrategy: (idx) => set({ activeStrategy: idx }),
  activeShot: 0,
  setActiveShot: (idx) => set({ activeShot: idx }),
  analysisResult: null,
  setAnalysisResult: (result) => set({ analysisResult: result }),
  proposals: [],
  setProposals: (proposals) => set({ proposals }),
  activeProposal: null,
  setActiveProposal: (idx) => set({ activeProposal: idx }),
  showStrategyOverlay: false,
  setShowStrategyOverlay: (val) => set({ showStrategyOverlay: val }),
  isAnalyzing: false,
  setIsAnalyzing: (val) => set({ isAnalyzing: val }),
  canvasDataUrl: null,
  setCanvasDataUrl: (url) => set({ canvasDataUrl: url }),
  pendingCanvasImage: null,
  setPendingCanvasImage: (url) => set({ pendingCanvasImage: url }),
  comparePreview: null,
  setComparePreview: (preview) => set({ comparePreview: preview }),
  clearComparePreview: () => set({ comparePreview: null }),
  drawingTool: 'pen',
  setDrawingTool: (tool) => set({ drawingTool: tool }),
  penType: 'ink',
  setPenType: (type) => set({ penType: type }),
  brushSize: 3,
  setBrushSize: (size) => set({ brushSize: size }),
  isGenerating: false,
  setIsGenerating: (val) => set({ isGenerating: val }),
  isEnhancing: false,
  setIsEnhancing: (val) => set({ isEnhancing: val }),
  intent: '',
  setIntent: (val) => set({ intent: val }),
  // 선택된 연출 축들 (칩으로 on/off). 기본 reframe만.
  activeAxes: ['reframe'],
  setActiveAxes: (axes) => set({ activeAxes: axes }),
  toggleAxis: (axis) => set((state) => {
    const isActive = state.activeAxes.includes(axis)

    if (isActive) {
      return {
        activeAxes: state.activeAxes.filter(a => a !== axis)
      }
    }

    if (axis === 'mise' && state.miseOptions.length === 0) {
      return {
        activeAxes: [...state.activeAxes, axis],
        miseOptions: ['blocking', 'props', 'set_dressing'],
      }
    }

    return {
      activeAxes: [...state.activeAxes, axis]
    }
  }),
  // Mise-en-scène 하위 옵션 (복수 선택). 기본: 셋 다.
  miseOptions: ['blocking', 'props', 'set_dressing'],
  setMiseOptions: (options) => set({ miseOptions: options }),
  toggleMiseOption: (opt) => set((state) => {
    const nextOpts = state.miseOptions.includes(opt)
      ? state.miseOptions.filter(o => o !== opt)
      : [...state.miseOptions, opt]
    // 하나도 안 남으면 mise 축 자동 해제
    const nextAxes = nextOpts.length === 0
      ? state.activeAxes.filter(a => a !== 'mise')
      : state.activeAxes
    return { miseOptions: nextOpts, activeAxes: nextAxes }
  }),
  // freeform 축 전용: 특정 이론/책을 우선 사용
  theoryPreference: null,
  setTheoryPreference: (val) => set({ theoryPreference: val }),
  chatMessages: [],
  addChatMessage: (msg) => set((state) => ({
    chatMessages: [...state.chatMessages, { ...msg, id: Date.now(), timestamp: new Date() }]
  })),
  detailTab: 'guidance',
  setDetailTab: (tab) => set({ detailTab: tab }),
  strategyColors: STRATEGY_COLORS,
  getStrategyColor: (idx) => STRATEGY_COLORS[idx % STRATEGY_COLORS.length],
  overlays: { thirds: true, eyeline: true, annotations: true },
  toggleOverlay: (key) => set((state) => ({
    overlays: { ...state.overlays, [key]: !state.overlays[key] }
  })),
  zenMode: false,
  setZenMode: (val) => set({ zenMode: val }),
  shotSketches: {},
  setShotSketch: (key, dataUrl) => set((state) => ({
    shotSketches: { ...state.shotSketches, [key]: dataUrl }
  })),
  reframeHistory: {},
  addReframeHistoryEntry: (strategyIdx, shotIdx, entry) => set((state) => {
    const key = getShotKey(strategyIdx, shotIdx)
    const existing = state.reframeHistory[key] || []

    if (entry.image && existing.some((item) => item.image === entry.image)) {
      return state
    }

    const nextEntry = {
      id: entry.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      image: entry.image,
      cir: entry.cir || null,
      changedFields: entry.changedFields || [],
      description: entry.description || '',
      label: entry.label || `Version ${existing.length + 1}`,
      createdAt: entry.createdAt || new Date().toISOString(),
      source: entry.source || 'reframe',
    }

    return {
      reframeHistory: {
        ...state.reframeHistory,
        [key]: [...existing, nextEntry],
      }
    }
  }),
  clearReframeHistoryForShot: (strategyIdx, shotIdx) => set((state) => {
    const key = getShotKey(strategyIdx, shotIdx)
    const nextHistory = { ...state.reframeHistory }
    delete nextHistory[key]
    return { reframeHistory: nextHistory }
  }),
  // ── Scenes hierarchy ────────────────────────────────────
  scenes: [
    {
      id: 'scene-1',
      label: 'Gas Station',
      activeBranch: 0,
      activeShot: 0,
      branches: [
        {
          id: 'branch-main',
          label: 'Slow Burn Tension',
          isMain: true,
          branchPoint: 0,
          rationale: '',
          shots: DEMO_STRATEGIES[0].shots.map((s, i) => ({
            id: `shot-s1-main-${i}`,
            image: s.image,
            cir: s.cir,
            label: s.intent || `Shot ${i + 1}`,
            scriptBeat: i,
            isAIGenerated: false,
            source: 'canvas',
          })),
        },
      ],
    },
    {
      id: 'scene-2',
      label: 'Desert Motel',
      activeBranch: 0,
      activeShot: 0,
      branches: [
        {
          id: 'branch-main-s2',
          label: 'Main',
          isMain: true,
          branchPoint: 0,
          rationale: '',
          shots: [
            { id: 'shot-s2-0', image: null, cir: { shotSize: 'Wide', relation: 'Single' }, label: 'Arrival', scriptBeat: 0, isAIGenerated: false, source: 'canvas' },
            { id: 'shot-s2-1', image: null, cir: { shotSize: 'Medium', relation: 'Single' }, label: 'Entering Room', scriptBeat: 1, isAIGenerated: false, source: 'canvas' },
            { id: 'shot-s2-2', image: null, cir: { shotSize: 'Close-Up', relation: 'Single' }, label: 'Suspicion', scriptBeat: 2, isAIGenerated: false, source: 'canvas' },
          ],
        },
      ],
    },
  ],
  activeScene: 0,
  overviewMode: 'scene', // 'film' | 'scene'
  flowView: 'grid',

  // Derived selectors (stable across render unless source changes)
  getActiveSceneData: () => {
    const state = get()
    return state.scenes[state.activeScene]
  },
  flowInsertGap: null,         // { branchIdx, afterShotIdx }
  flowFillSuggestions: [],     // legacy — kept for compat

  // Gap fill state — keyed by "branchIdx-afterShotIdx", multiple ghosts can coexist
  // Each entry: { branchIdx, afterShotIdx, userPrompt, status, candidates }
  // status: 'ghost' | 'loading' | 'ready' | 'error'
  gapFills: {},
  gapFillPicker: null,  // { key } — which ghost's candidates are shown in the picker

  // Auto-fill range state
  autoFill: null,              // { branchIdx, fromIdx, toIdx, userPrompt, status, versions, previewVersion }
  //   status: 'idle' | 'loading' | 'ready' | 'error'

  setActiveScene: (idx) => set({ activeScene: idx }),
  setOverviewMode: (m) => set({ overviewMode: m }),
  setFlowView: (v) => set({ flowView: v }),
  setFlowInsertGap: (g) => set({ flowInsertGap: g }),

  // Gap fill actions
  openGapFill: (branchIdx, afterShotIdx) => set((state) => {
    const key = `${branchIdx}-${afterShotIdx}`
    if (state.gapFills[key]) return state  // already open
    return { gapFills: { ...state.gapFills, [key]: { branchIdx, afterShotIdx, userPrompt: '', status: 'ghost', candidates: [] } } }
  }),
  closeGapFill: (key) => set((state) => {
    const next = { ...state.gapFills }
    delete next[key]
    return { gapFills: next, gapFillPicker: state.gapFillPicker?.key === key ? null : state.gapFillPicker }
  }),
  setGapFillPrompt: (key, prompt) => set((state) => ({
    gapFills: state.gapFills[key] ? { ...state.gapFills, [key]: { ...state.gapFills[key], userPrompt: prompt } } : state.gapFills
  })),
  setGapFillStatus: (key, status, candidates = null) => set((state) => ({
    gapFills: state.gapFills[key] ? {
      ...state.gapFills,
      [key]: { ...state.gapFills[key], status, ...(candidates !== null ? { candidates } : {}) }
    } : state.gapFills
  })),
  openGapFillPicker: (key) => set({ gapFillPicker: { key } }),
  closeGapFillPicker: () => set({ gapFillPicker: null }),

  // Auto-fill range actions
  openAutoFill: (branchIdx, fromIdx, toIdx) => set({
    autoFill: { branchIdx, fromIdx, toIdx, userPrompt: '', status: 'idle', versions: [], previewVersion: 0 }
  }),
  closeAutoFill: () => set({ autoFill: null }),
  setAutoFillPrompt: (prompt) => set((state) => ({
    autoFill: state.autoFill ? { ...state.autoFill, userPrompt: prompt } : null
  })),
  setAutoFillStatus: (status, versions = null) => set((state) => ({
    autoFill: state.autoFill ? {
      ...state.autoFill,
      status,
      ...(versions !== null ? { versions } : {}),
    } : null
  })),
  setAutoFillPreviewVersion: (idx) => set((state) => ({
    autoFill: state.autoFill ? { ...state.autoFill, previewVersion: idx } : null
  })),

  // Accept auto-fill version — insert all its shots into the branch
  acceptAutoFillVersion: (versionIdx) => set((state) => {
    const af = state.autoFill
    if (!af || !af.versions[versionIdx]) return state
    const version = af.versions[versionIdx]

    // Build shot_id → current array index map for insertion
    const scenes = state.scenes.map((s, si) => {
      if (si !== state.activeScene) return s
      const branches = s.branches.map((b, bi) => {
        if (bi !== af.branchIdx) return b
        let shots = [...b.shots]
        // Insert from back to front so indices don't shift
        const sorted = [...version.insertions].sort((a, b) => {
          const ai = shots.findIndex(sh => sh.id === a.after_shot_id)
          const bi2 = shots.findIndex(sh => sh.id === b.after_shot_id)
          return bi2 - ai
        })
        for (const ins of sorted) {
          const afterIdx = shots.findIndex(sh => sh.id === ins.after_shot_id)
          if (afterIdx === -1) continue
          const c = ins.candidate
          const newShot = {
            id: c.id || `shot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            label: c.label,
            cir: c.cir,
            image: c.image || null,
            scriptBeat: 0,
            isAIGenerated: true,
            source: 'ai_fill',
          }
          shots.splice(afterIdx + 1, 0, newShot)
        }
        return { ...b, shots }
      })
      return { ...s, branches }
    })
    return { scenes, autoFill: null }
  }),

  addScene: (label) => set((state) => {
    const id = `scene-${Date.now()}`
    const newScene = {
      id,
      label: label || `Scene ${state.scenes.length + 1}`,
      activeBranch: 0,
      activeShot: 0,
      branches: [
        {
          id: `branch-main-${id}`,
          label: 'Main',
          isMain: true,
          branchPoint: 0,
          rationale: '',
          shots: [
            { id: `shot-${id}-0`, image: null, cir: { shotSize: 'Medium', relation: 'Single' }, label: 'Shot 1', scriptBeat: 0, isAIGenerated: false, source: 'canvas' },
          ],
        },
      ],
    }
    return { scenes: [...state.scenes, newScene], activeScene: state.scenes.length }
  }),

  renameScene: (sceneIdx, label) => set((state) => ({
    scenes: state.scenes.map((s, i) => i === sceneIdx ? { ...s, label } : s),
  })),

  removeScene: (sceneIdx) => set((state) => {
    if (state.scenes.length <= 1) return state
    const scenes = state.scenes.filter((_, i) => i !== sceneIdx)
    const activeScene = Math.max(0, Math.min(state.activeScene, scenes.length - 1))
    return { scenes, activeScene }
  }),

  // ── Helpers: map "flow*" API onto active scene ──────────
  setFlowActiveShot: (idx) => set((state) => ({
    scenes: state.scenes.map((s, i) =>
      i === state.activeScene ? { ...s, activeShot: idx } : s
    ),
  })),
  setFlowActiveBranch: (idx) => set((state) => ({
    scenes: state.scenes.map((s, i) =>
      i === state.activeScene ? { ...s, activeBranch: idx, activeShot: 0 } : s
    ),
  })),

  flowReorderShot: (branchIdx, fromIdx, toIdx) => set((state) => {
    const scenes = state.scenes.map((s, si) => {
      if (si !== state.activeScene) return s
      const branches = s.branches.map((b, bi) => {
        if (bi !== branchIdx) return b
        const shots = [...b.shots]
        const [moved] = shots.splice(fromIdx, 1)
        shots.splice(toIdx, 0, moved)
        return { ...b, shots }
      })
      return { ...s, branches, activeShot: toIdx }
    })
    return { scenes }
  }),

  flowRemoveShot: (branchIdx, shotIdx) => set((state) => {
    const scenes = state.scenes.map((s, si) => {
      if (si !== state.activeScene) return s
      const branches = s.branches.map((b, bi) => {
        if (bi !== branchIdx) return b
        if (b.shots.length <= 1) return b
        return { ...b, shots: b.shots.filter((_, idx) => idx !== shotIdx) }
      })
      const activeShot = s.activeBranch === branchIdx
        ? Math.max(0, Math.min(s.activeShot, branches[branchIdx].shots.length - 1))
        : s.activeShot
      return { ...s, branches, activeShot }
    })
    return { scenes }
  }),

  flowInsertShot: (branchIdx, afterShotIdx, shot) => set((state) => {
    const scenes = state.scenes.map((s, si) => {
      if (si !== state.activeScene) return s
      const branches = s.branches.map((b, bi) => {
        if (bi !== branchIdx) return b
        const shots = [...b.shots]
        const newShot = {
          id: shot.id || `shot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          image: shot.image || null,
          cir: shot.cir || {},
          label: shot.label || 'New Shot',
          scriptBeat: shot.scriptBeat ?? 0,
          isAIGenerated: shot.isAIGenerated || false,
          source: shot.source || 'canvas',
        }
        shots.splice(afterShotIdx + 1, 0, newShot)
        return { ...b, shots }
      })
      return { ...s, branches }
    })
    return { scenes }
  }),

  flowSplitBranch: (branchIdx, atShotIdx) => set((state) => {
    const scenes = state.scenes.map((s, si) => {
      if (si !== state.activeScene) return s
      const src = s.branches[branchIdx]
      if (!src || atShotIdx === 0) return s
      const newBranch = {
        id: `branch-${Date.now()}`,
        label: `Alt ${s.branches.length}`,
        isMain: false,
        branchPoint: atShotIdx - 1,
        rationale: '',
        shots: src.shots.slice(atShotIdx).map((sh, i) => ({ ...sh, id: `${sh.id}-alt-${i}` })),
      }
      return { ...s, branches: [...s.branches, newBranch] }
    })
    return { scenes }
  }),

  flowDeleteBranch: (branchIdx) => set((state) => {
    const scenes = state.scenes.map((s, si) => {
      if (si !== state.activeScene) return s
      if (s.branches.length <= 1) return s
      const branches = s.branches.filter((_, i) => i !== branchIdx)
      if (!branches.some((b) => b.isMain) && branches.length > 0) {
        branches[0] = { ...branches[0], isMain: true }
      }
      return {
        ...s,
        branches,
        activeBranch: Math.max(0, Math.min(s.activeBranch, branches.length - 1)),
      }
    })
    return { scenes }
  }),

  flowPromoteBranch: (branchIdx) => set((state) => {
    const scenes = state.scenes.map((s, si) => {
      if (si !== state.activeScene) return s
      const branches = s.branches.map((b, bi) => ({ ...b, isMain: bi === branchIdx }))
      return { ...s, branches }
    })
    return { scenes }
  }),

  flowDisconnectEdge: (branchIdx, afterShotIdx) => set((state) => {
    const scenes = state.scenes.map((s, si) => {
      if (si !== state.activeScene) return s
      const src = s.branches[branchIdx]
      if (!src || afterShotIdx >= src.shots.length - 1) return s
      const keepShots = src.shots.slice(0, afterShotIdx + 1)
      const splitShots = src.shots.slice(afterShotIdx + 1)
      const branches = s.branches.map((b, bi) =>
        bi === branchIdx ? { ...b, shots: keepShots } : b
      )
      branches.push({
        id: `branch-${Date.now()}`,
        label: `Alt ${s.branches.length}`,
        isMain: false,
        branchPoint: afterShotIdx,
        rationale: '',
        shots: splitShots.map((sh, i) => ({ ...sh, id: `${sh.id}-split-${i}` })),
      })
      return { ...s, branches }
    })
    return { scenes }
  }),

  // --- New Layout System States ---
  layoutMode: 'unified', // 'unified' | 'maximized'
  maximizedPanel: null, // null | 'left' | 'center' | 'right'
  setMaximizedPanel: (panel) => set({ maximizedPanel: panel }),
  
  leftPanelVisible: true,
  setLeftPanelVisible: (val) => set({ leftPanelVisible: val }),
  
  rightPanelVisible: true,
  setRightPanelVisible: (val) => set({ rightPanelVisible: val }),
  
  centerTab: 'canvas', // 'map' | 'canvas' | 'guidance'
  setCenterTab: (tab) => set({ centerTab: tab }),

  isLabMode: false,
  setLabMode: (val) => set({ isLabMode: val }),

  bottomPanelVisible: true,
  setBottomPanelVisible: (val) => set({ bottomPanelVisible: val }),

  timelineExpanded: false,
  setTimelineExpanded: (val) => set({ timelineExpanded: val }),
}))

export default useStore
