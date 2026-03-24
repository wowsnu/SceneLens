import { create } from 'zustand'

// Screenplay data (from v1)
const SCREENPLAY = [
  // Beat 0: 설정 — 주유소, 두 인물 소개 + 첫 질문
  { type: 'scene-heading', text: 'INT. RURAL GAS STATION — DAY', beat: 0 },
  { type: 'action', text: 'An old, dusty gas station. The PROPRIETOR (60s) stands behind the counter. ANTON CHIGURH (40s), a terrifyingly calm man, finishes a bag of cashews.' },
  { type: 'character', text: 'CHIGURH' },
  { type: 'dialogue', text: "What's the most you ever lost on a coin toss?" },
  { type: 'character', text: 'PROPRIETOR' },
  { type: 'dialogue', text: 'Sir?' },
  { type: 'character', text: 'CHIGURH' },
  { type: 'dialogue', text: 'The most. You ever lost. On a coin toss.' },

  // Beat 1: 동전 — 물리적 행동, 긴장 전환점
  { type: 'action', text: 'Chigurh pulls a quarter from his pocket. He flips it, catches it, and slaps it on the counter.', beat: 1 },
  { type: 'character', text: 'CHIGURH' },
  { type: 'dialogue', text: 'Call it.' },

  // Beat 2: 저항 — 주인의 혼란과 거부
  { type: 'character', text: 'PROPRIETOR', beat: 2 },
  { type: 'dialogue', text: 'For what?' },
  { type: 'character', text: 'CHIGURH' },
  { type: 'dialogue', text: "You need to call it. I can't call it for you. It wouldn't be fair." },
  { type: 'character', text: 'PROPRIETOR' },
  { type: 'dialogue', text: "I didn't put nothin' up." },
  { type: 'character', text: 'CHIGURH' },
  { type: 'dialogue', text: "Yes, you did. You've been putting it up your whole life, you just didn't know it." },

  // Beat 3: 압박 — 치거의 물리적 접근 + 철학적 협박
  { type: 'action', text: 'Chigurh leans in slightly. His eyes are dead, unblinking.', beat: 3 },
  { type: 'character', text: 'CHIGURH' },
  { type: 'dialogue', text: 'You know what date is on this coin?' },
  { type: 'character', text: 'PROPRIETOR' },
  { type: 'dialogue', text: 'No.' },
  { type: 'character', text: 'CHIGURH' },
  { type: 'dialogue', text: "1958. It's been traveling twenty-two years to get here. And now it's here. And you have to say. Call it." },

  // Beat 4: 절정 — "Everything" + 침묵
  { type: 'action', text: 'The oppressive silence stretches. The Proprietor looks at the coin, then at Chigurh.', beat: 4 },
  { type: 'character', text: 'PROPRIETOR' },
  { type: 'dialogue', text: 'Look, I need to know what I stand to win.' },
  { type: 'character', text: 'CHIGURH' },
  { type: 'dialogue', text: 'Everything.' },

  // Beat 5: 선택 — 주인이 결국 고른다
  { type: 'action', text: 'The Proprietor swallows hard.', beat: 5 },
  { type: 'character', text: 'PROPRIETOR' },
  { type: 'dialogue', text: 'Alright. Heads then.' },

  // Beat 6: 해소 — 결과 확인 + 퇴장
  { type: 'action', text: 'Chigurh slowly lifts his hand from the coin. He looks at it.', beat: 6 },
  { type: 'character', text: 'CHIGURH' },
  { type: 'dialogue', text: 'Well done.' },
  { type: 'action', text: 'Chigurh slides the coin across the counter to him.' },
  { type: 'character', text: 'CHIGURH' },
  { type: 'dialogue', text: "Don't put it in your pocket, sir. Or it'll get mixed in with the others and become just a coin. Which it is." },
  { type: 'action', text: 'Chigurh turns and leaves the store.' },
  { type: 'transition', text: 'CUT TO BLACK.' },
]

// Demo strategies (empty — will be populated by AI generation)
const DEMO_STRATEGIES = []

const STRATEGY_COLORS = [
  { color: 'var(--strategy-a)', bg: 'var(--strategy-a-bg)', raw: '#10b981' },
  { color: 'var(--strategy-b)', bg: 'var(--strategy-b-bg)', raw: '#8b5cf6' },
  { color: 'var(--strategy-c)', bg: 'var(--strategy-c-bg)', raw: '#ef4444' },
]

const useStore = create((set, get) => ({
  // View mode: 'script' | 'storyboard' | 'focus' | 'detail'
  viewMode: 'storyboard',
  setViewMode: (mode) => set((state) => ({
    viewMode: mode,
    zenMode: mode !== 'focus' ? false : state.zenMode,
  })),

  // Screenplay
  screenplay: SCREENPLAY,
  activeBeat: 0,
  setActiveBeat: (beat) => set({ activeBeat: beat }),

  // Strategies (pre-loaded with demo data)
  strategies: DEMO_STRATEGIES,
  activeStrategy: 0,
  setStrategies: (strategies) => set({ strategies }),
  setActiveStrategy: (idx) => set({ activeStrategy: idx }),

  // Current shot index within active strategy
  activeShot: 0,
  setActiveShot: (idx) => set({ activeShot: idx }),

  // Analysis state
  analysisResult: null,
  setAnalysisResult: (result) => set({ analysisResult: result }),

  // AI-suggested strategy proposals (separate from scene-level strategies)
  proposals: [],
  activeProposal: 0,
  setProposals: (proposals) => set({ proposals }),
  setActiveProposal: (idx) => set({ activeProposal: idx }),
  isAnalyzing: false,
  setIsAnalyzing: (val) => set({ isAnalyzing: val }),

  // AI image generation
  isGenerating: false,
  setIsGenerating: (val) => set({ isGenerating: val }),
  isEnhancing: false,
  setIsEnhancing: (val) => set({ isEnhancing: val }),
  pendingCanvasImage: null,
  setPendingCanvasImage: (url) => set({ pendingCanvasImage: url }),

  // Canvas layers: { background: dataUrl, midground: dataUrl, foreground: dataUrl }
  canvasLayers: {},
  setCanvasLayers: (layers) => set({ canvasLayers: layers }),
  setCanvasLayer: (name, dataUrl) => set((state) => ({
    canvasLayers: { ...state.canvasLayers, [name]: dataUrl }
  })),
  removeCanvasLayer: (name) => set((state) => {
    const { [name]: _, ...rest } = state.canvasLayers
    return { canvasLayers: rest }
  }),
  layerVisibility: { background: true, midground: true, foreground: true },
  toggleLayerVisibility: (name) => set((state) => ({
    layerVisibility: { ...state.layerVisibility, [name]: !state.layerVisibility[name] }
  })),

  // Canvas
  canvasDataUrl: null,
  setCanvasDataUrl: (url) => set({ canvasDataUrl: url }),

  // Drawing tool
  drawingTool: 'pen',
  setDrawingTool: (tool) => set({ drawingTool: tool }),
  penType: 'pencil', // pencil, ink, marker, charcoal
  setPenType: (type) => set({ penType: type }),
  brushSize: 3,
  setBrushSize: (size) => set({ brushSize: size }),

  // Intent
  intent: '',
  setIntent: (val) => set({ intent: val }),

  // Chat messages for conversational intent bar
  chatMessages: [],
  addChatMessage: (msg) => set((state) => ({
    chatMessages: [...state.chatMessages, { ...msg, id: Date.now(), timestamp: new Date() }]
  })),
  clearChatMessages: () => set({ chatMessages: [] }),

  // Detail panel tab
  detailTab: 'guidance',
  setDetailTab: (tab) => set({ detailTab: tab }),

  // Strategy colors helper
  strategyColors: STRATEGY_COLORS,
  getStrategyColor: (idx) => STRATEGY_COLORS[idx % STRATEGY_COLORS.length],

  // Overlay toggles
  overlays: { thirds: true, eyeline: true, annotations: true },
  toggleOverlay: (key) => set((state) => ({
    overlays: { ...state.overlays, [key]: !state.overlays[key] }
  })),

  // Zen mode (for Focus view)
  zenMode: false,
  setZenMode: (val) => set({ zenMode: val }),

  // Loading
  loading: false,
  setLoading: (val) => set({ loading: val }),

  // Shot sketches map: { [strategyIdx-shotIdx]: dataUrl }
  shotSketches: {},
  setShotSketch: (key, dataUrl) => set((state) => ({
    shotSketches: { ...state.shotSketches, [key]: dataUrl }
  })),
}))

export default useStore
