import { useCallback, useMemo, useState } from 'react'
import useStore, {
  buildReferencePrompt,
  sceneOfBeat,
  selectActiveSceneState,
  selectScenes,
  SEAM_JOINS,
  SEAM_ELAPSED,
} from '../store/useStore'
import SceneOverview from './SceneOverview'
import SpatialMap from './SpatialMap'
import { requestDirectingReview, requestViewerReflection } from '../services/api'
import './DecisionBoard.css'
import { logEvent, logScaffold, normalizeLevel, storyboardVersion } from '../store/studyLog'

// Narrative만 사용자와 직접 협업하는 상위 Agent로 드러낸다.
// 하위 생성 모듈은 내부적으로 Agent일 수 있지만 UI에서는 같은 장면을
// 서로 다른 관점으로 읽는 Creative Lens로 표현한다.
const NARRATIVE_AGENT = {
  id: 'narrative',
  role: 'Narrative Agent',
  displayName: '서사',
  lens: '정보/서사',
  glyph: '📖',
  tagline: '언제 알게 할 것인가',
  brief: '관객이 무엇을 언제 알게 되는지 본다.',
  prompt: '예: 원인은 숨기고 불안만 먼저 읽히게',
  accent: '#f59e0b',
}

const CREATIVE_LENSES = [
  {
    id: 'staging',
    role: 'Mise-en-scène Lens',
    displayName: '미장센',
    lens: '장면화/블로킹',
    glyph: '🎭',
    tagline: '무대를 어떻게 짤 것인가',
    brief: '거리, 시선, 몸의 방향, 사물 관계를 본다.',
    prompt: '예: 둘 사이의 불신과 거리감을 더 강하게',
    accent: '#10b981',
  },
  {
    id: 'camera',
    role: 'Cinematography Lens',
    displayName: '촬영',
    lens: '카메라/프레이밍/톤',
    glyph: '🎥',
    tagline: '어디서 볼 것인가',
    brief: '어디서, 얼마나 가까이, 어떤 톤으로 볼지 본다.',
    prompt: '예: 공간은 보이되 감정 밀도는 잃지 않게',
    accent: '#3b82f6',
  },
  {
    id: 'editing',
    role: 'Editing Lens',
    displayName: '편집',
    lens: '편집/리듬',
    glyph: '✂️',
    tagline: '어디서 자르고 이을 것인가',
    brief: '몇 컷으로 나누고 어디서 끊을지 본다.',
    prompt: '예: 반응을 늦춰서 긴장을 오래 끌기',
    accent: '#ef4444',
  },
]

const PERSPECTIVES = [NARRATIVE_AGENT, ...CREATIVE_LENSES]

const DIAGNOSTIC_LEVEL_LABELS = {
  attribute: '속성',
  shot_structure: '컷 구성',
  shot_relation: '컷 관계',
  scene_structure: '씬 구조',
}

const VIEWER_READING_CONDITIONS = [
  {
    id: 'first_viewer',
    title: '처음 보는 관객',
    attention: '사전 정보 없이, 인물이 누구고 지금 무슨 일이 벌어지는지 따라간다.',
  },
  {
    id: 'film_literate',
    title: '영화에 익숙한 관객',
    attention: '프레이밍·반복·생략이 어떤 기대나 긴장을 만드는지 살핀다.',
  },
  {
    id: 'context_close',
    title: '상황을 꼼꼼히 보는 관객',
    attention: '장소와 인물의 상황이 화면만으로 납득되는지 살핀다.',
  },
]

// 스토어에는 드로잉 data URL뿐 아니라 public 경로의 테스트 이미지도 들어갈 수
// 있다. 관객 읽기 API에는 화면 픽셀만 보낼 수 있으므로, 경로는 호출 직전에
// data URL로 읽어 바꾼다. 이 과정에서 컷 라벨·CIR·의도는 전혀 보내지 않는다.
async function loadViewerPanelImage(image) {
  if (!image || image.startsWith('data:')) return image
  if (!image.startsWith('/')) return image

  const response = await fetch(image)
  if (!response.ok) throw new Error('테스트 패널 이미지를 불러오지 못했습니다.')
  const blob = await response.blob()

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('테스트 패널 이미지를 읽지 못했습니다.'))
    reader.readAsDataURL(blob)
  })
}

// 실제 Agent 호출을 연결하기 전, 한 패널에 네 관점이 함께 놓였을 때의
// 정보 밀도와 비교 방식을 확인하기 위한 화면용 문장이다.
// 서버의 렌즈 이름과 화면의 렌즈 id가 다르다 (mise ↔ staging).
const MULTI_LENS_ORDER = [
  { backendId: 'mise', lensId: 'staging', mark: 'M', name: '미장센' },
  { backendId: 'camera', lensId: 'camera', mark: 'C', name: '촬영' },
  { backendId: 'editing', lensId: 'editing', mark: 'E', name: '편집' },
]

const RELATION_LABELS = {
  consequence: '한쪽이 만든 결과',
  conflict: '연출 선택',
  agreement: '같은 판단',
}

const lensMark = (backendId) => (
  MULTI_LENS_ORDER.find((entry) => entry.backendId === backendId)?.mark || '?'
)
const lensName = (backendId) => (
  MULTI_LENS_ORDER.find((entry) => entry.backendId === backendId)?.name || backendId
)
const lensMarks = (backendIds = []) => backendIds.map(lensMark).join(' · ')
// 서버는 'mise', 화면 탭은 'staging'을 쓴다.
// 관계마다 물어야 할 것이 다르다. consequence는 원인이 있으니 '맞나
// 틀리나'를, conflict는 양쪽 다 타당하니 '무엇을 우선하나'를 묻는다.
const verdictOptionsFor = (relation) => {
  if (relation.type === 'consequence') {
    return [
      { id: 'fix-source', label: `${lensName(relation.source_lens)}을 고칠게` },
      { id: 'intended', label: '의도한 거야' },
      { id: 'fix-affected', label: `${lensName(relation.affected_lens)}에서 풀게` },
    ]
  }
  return [
    ...(relation.lenses || []).map((lens) => ({
      id: `prefer-${lens}`,
      label: `${lensName(lens)} 우선`,
    })),
    { id: 'keep', label: '현재 유지' },
  ]
}

// 관계를 가리키는 키. 진단 id로 묶어 범위가 바뀌어도 같은 관계면 이어진다.
const relationKey = (relation) => (
  `${relation.type}:${[...relation.diagnosis_ids].sort().join('|')}`
)

const frontLensId = (backendId) => (
  MULTI_LENS_ORDER.find((entry) => entry.backendId === backendId)?.lensId || backendId
)

const MOCK_OPTIONS = [
  {
    id: 'opt-delay-clue',
    lensId: 'narrative',
    title: '단서 지연',
    proposal: '위협의 원인을 첫 컷에서 직접 보여주지 않고, 인물 반응 뒤에 늦게 드러낸다.',
    gain: '궁금증, 서스펜스, 다음 컷으로 넘어가는 이유',
    cost: '상황 명료성이 낮아질 수 있음',
    tags: ['정보 지연', '서스펜스', '오해 가능성'],
    viewerCheck: 'viewer가 불안의 원인을 궁금해하는지, 아니면 상황을 못 따라가는지 확인',
  },
  {
    id: 'opt-distance',
    lensId: 'staging',
    title: '거리 벌리기',
    proposal: '두 인물을 프레임 안에서 더 멀리 두고, 사이에 콘솔이나 문틀 같은 물리적 장벽을 둔다.',
    gain: '정서적 단절, 권력 관계, 공간적 긴장',
    cost: '미세한 표정 정보가 약해질 수 있음',
    tags: ['거리', '권력 관계', '사물 관계'],
    viewerCheck: 'viewer가 두 인물의 불신을 거리감으로 읽는지 확인',
  },
  {
    id: 'opt-object-between',
    lensId: 'staging',
    title: '사물로 가르기',
    proposal: '출입카드, 리모컨, 콘솔 같은 핵심 사물을 두 인물 사이에 두어 갈등의 축을 만든다.',
    gain: '갈등의 물리적 초점, 선택의 압박, 시선 이동',
    cost: '인물 감정보다 물건의 의미가 더 크게 읽힐 수 있음',
    tags: ['사물 관계', '시선', '갈등 축'],
    viewerCheck: 'viewer가 사물을 단순 소품이 아니라 갈등의 매개로 읽는지 확인',
  },
  {
    id: 'opt-wide-corridor',
    lensId: 'camera',
    title: '공간을 넓게 열기',
    approach: '공간 중심 · 현재 방향',
    proposal: '인물을 작게 두고 관제실의 모니터, 출구, 잠긴 캐비닛을 함께 보이게 한다.',
    gain: '공간 명료성, 고립감, 위험 단서',
    cost: '감정 밀도와 표정의 긴장이 약해질 수 있음',
    tags: ['공간 명료성', '고립감', '포함/배제'],
    cameraPlan: [
      ['샷 크기', 'Wide 유지'],
      ['각도', 'Eye-level 유지'],
      ['화면 구성', '인물을 작게, 공간을 넓게'],
      ['시야·가림', '환경 단서를 열어둠'],
    ],
    theory: 'Establishing Shot · Size for Importance',
    viewerCheck: 'viewer가 장소 설명이 아니라 압박감으로 읽는지 확인',
    mockShotChange: {
      image: '/img/wide_establishing.png',
      cir: {
        shotSize: 'Wide',
        relation: 'Master',
        angle: 'Eye-level',
        framing: 'Space-led',
      },
    },
  },
  {
    id: 'opt-tight-face',
    lensId: 'camera',
    title: '얼굴로 압축',
    approach: '감정 중심',
    proposal: '재인의 얼굴과 눈동자를 크게 잡아 판단 직전의 불안을 전면화한다.',
    gain: '감정 밀도, 인물 동일시, 즉각적 긴장',
    cost: '공간 단서와 주변 위험의 위치가 약해질 수 있음',
    tags: ['감정 밀도', '클로즈업', '포함/배제'],
    cameraPlan: [
      ['샷 크기', 'Wide → Close-up'],
      ['각도', 'Eye-level 유지'],
      ['화면 구성', '얼굴과 시선 중심'],
      ['시야·가림', '배경 정보를 제외'],
    ],
    theory: 'Close-up · Hitchcock’s Rule',
    viewerCheck: 'viewer가 불안을 읽는지, 단순 놀람이나 공포로 읽는지 확인',
    mockShotChange: {
      image: '/img/closeup_woman.png',
      cir: {
        shotSize: 'Close-Up',
        relation: 'Single',
        angle: 'Eye-level',
        framing: 'Face-led',
      },
    },
  },
  {
    id: 'opt-obstructed-view',
    lensId: 'camera',
    title: '가려진 시점',
    approach: '시점 중심',
    proposal: '문틀이나 모니터 가장자리 너머로 인물을 보이게 해 훔쳐보는 듯한 불안감을 만든다.',
    gain: '은폐감, 감시당하는 느낌, 시각적 긴장',
    cost: '인물 행동이 덜 명확해질 수 있음',
    tags: ['가림', '시점', '서스펜스'],
    cameraPlan: [
      ['샷 크기', 'Wide → Medium'],
      ['각도', '비스듬한 관찰 시점'],
      ['화면 구성', '전경 사이에 인물 배치'],
      ['시야·가림', '문틀로 일부 가림'],
    ],
    theory: 'Frame within a Frame · Restricted View',
    viewerCheck: 'viewer가 이 가림을 의도된 감시감으로 받아들이는지 확인',
    mockShotChange: {
      image: '/img/heavy_occlusion.png',
      cir: {
        shotSize: 'Medium',
        relation: 'Restricted view',
        angle: 'Oblique',
        framing: 'Foreground occlusion',
      },
    },
  },
  {
    id: 'opt-reaction-first',
    lensId: 'editing',
    title: '반응 먼저',
    proposal: '위협 물체를 보여주기 전에 재인의 시선과 멈칫하는 반응 컷을 먼저 둔다.',
    gain: '긴장 상승, 관객의 질문, 컷 사이 리듬',
    cost: '행동의 원인이 잠시 불분명해질 수 있음',
    tags: ['반응 컷', '지연', '컷 경계'],
    viewerCheck: 'viewer가 반응의 대상이 무엇인지 궁금해하는지 확인',
  },
  {
    id: 'opt-three-beat',
    lensId: 'editing',
    title: '세 박자 분할',
    proposal: '리모컨 발견, 재인의 반응, 민호의 접근을 세 컷으로 나누어 압박을 단계적으로 올린다.',
    gain: '긴장 누적, 정보 순서의 명료성, 리듬 제어',
    cost: '장면이 느려지거나 설명적으로 보일 수 있음',
    tags: ['컷 분할', '긴장 누적', '정보 순서'],
    viewerCheck: 'viewer가 속도 저하가 아니라 압박 증가로 읽는지 확인',
  },
]

const MOCK_CAMERA_RANGE_OPTIONS = [
  {
    id: 'opt-range-compress',
    lensId: 'camera',
    approach: '긴장 누적',
    title: '점진적으로 압축',
    proposal: '범위의 시작에서는 공간을 남기고, 뒤로 갈수록 인물에게 가까워지는 촬영 흐름을 만든다.',
    gain: '감정적 압박의 누적, 시선 집중, 명확한 시각적 진행',
    cost: '후반으로 갈수록 공간 관계와 주변 단서가 줄어들 수 있음',
    tags: ['Range', '샷 크기 진행', '긴장 누적'],
    sequencePattern: 'compress',
    theory: 'Shot-size Progression · Size for Importance',
    viewerCheck: 'viewer가 샷의 접근을 감정적 압박의 증가로 읽는지 확인',
  },
  {
    id: 'opt-range-space',
    lensId: 'camera',
    approach: '공간 지속 · 현재 방향',
    title: '공간 관계를 유지',
    proposal: '범위 전체에서 넓은 공간과 두 인물의 위치 관계를 유지해 갈등의 구조를 먼저 읽게 한다.',
    gain: '공간 연속성, 인물 간 거리, 위험 요소의 위치가 명확함',
    cost: '샷 사이의 감정적 상승과 표정 정보가 약해질 수 있음',
    tags: ['Range', '공간 연속성', 'Master'],
    sequencePattern: 'hold-space',
    theory: 'Master Shot · Spatial Continuity',
    viewerCheck: 'viewer가 공간을 이해하면서도 장면의 긴장을 유지하는지 확인',
  },
  {
    id: 'opt-range-subjective',
    lensId: 'camera',
    approach: '시점 전환',
    title: '관찰에서 주관으로',
    proposal: '처음에는 관계를 관찰하다가 범위 후반에는 OTS와 Single로 전환해 재인의 판단에 가까이 붙는다.',
    gain: '인물 동일시, 관계에서 감정으로의 전환, 후반 집중도',
    cost: '시점 변화가 빠르면 공간 축과 시선 관계가 불안정해질 수 있음',
    tags: ['Range', 'OTS', '주관 시점'],
    sequencePattern: 'subjective',
    theory: 'OTS',
    viewerCheck: 'viewer가 시점 변화를 혼란이 아니라 재인에게 가까워지는 과정으로 읽는지 확인',
  },
]

const MOCK_CAMERA_SHOT_SEQUENCE = [
  { shotSize: 'Wide', framing: 'Master', role: '공간 확립' },
  { shotSize: 'Medium', framing: 'OTS', role: '관계 압박' },
  { shotSize: 'Close-up', framing: 'Single', role: '반응 강조' },
  { shotSize: 'Medium Close', framing: 'Single', role: '고립과 취약성' },
  { shotSize: 'Medium', framing: 'Two-shot', role: '관계 재정렬' },
  { shotSize: 'ECU', framing: 'Single', role: '결정적 단서' },
  { shotSize: 'ECU', framing: 'Single', role: '행동의 정점' },
]

const MOCK_RELATIONS = [
  {
    id: 'rel-wide-clue',
    from: 'opt-wide-corridor',
    to: 'opt-delay-clue',
    type: 'trade-off',
    label: '공간을 넓히면 숨기려던 단서가 빨리 보일 수 있음',
  },
  {
    id: 'rel-distance-wide',
    from: 'opt-distance',
    to: 'opt-wide-corridor',
    type: 'complement',
    label: '넓은 프레임은 인물 사이 거리감을 더 읽기 쉽게 만듦',
  },
  {
    id: 'rel-close-distance',
    from: 'opt-tight-face',
    to: 'opt-distance',
    type: 'trade-off',
    label: '클로즈업은 감정을 키우지만 두 인물 사이의 물리적 거리감은 약화시킴',
  },
  {
    id: 'rel-object-reaction',
    from: 'opt-object-between',
    to: 'opt-reaction-first',
    type: 'complement',
    label: '사물 중심 블로킹은 반응 컷의 대상과 의미를 더 분명하게 만듦',
  },
  {
    id: 'rel-obstruct-delay',
    from: 'opt-obstructed-view',
    to: 'opt-delay-clue',
    type: 'complement',
    label: '가려진 시점은 정보 지연을 시각적으로 정당화함',
  },
  {
    id: 'rel-three-beat-delay',
    from: 'opt-three-beat',
    to: 'opt-delay-clue',
    type: 'trade-off',
    label: '세 박자 분할은 긴장을 쌓지만 지연된 단서를 너무 명확한 절차로 만들 수 있음',
  },
  {
    id: 'rel-reaction-delay',
    from: 'opt-reaction-first',
    to: 'opt-delay-clue',
    type: 'complement',
    label: '반응 컷은 원인 지연을 관객 질문으로 바꿈',
  },
]

const MOCK_CAMERA_ANALYSIS = {
  values: [
    ['샷 크기', 'Wide'],
    ['카메라 각도', 'Eye-level'],
    ['화면 구성', '인물보다 공간 우선'],
    ['시야·가림', '환경 단서가 모두 보임'],
    ['카메라 움직임', 'Static'],
  ],
  observation: '관제실의 모니터, 출구, 캐비닛과 인물의 위치 관계를 한 프레임 안에서 먼저 설명하는 촬영안입니다.',
  interpretation: '공간과 위험 단서는 명확하지만, 인물의 미세한 불안과 판단 순간은 상대적으로 약하게 읽힐 수 있습니다.',
  theory: 'The Filmmaker’s Eye · Establishing Shot',
}

// 씬 기준(인물·장소·환경)은 useStore의 sceneState로 옮겼다.
// 이 화면에서 고친 것이 buildCutPrompt까지 가야 하기 때문이다.
const MOCK_MISE_SPATIAL_ELEMENTS = [
  { id: 'room', type: 'rect', x: 250, y: 180, w: 720, h: 480, label: 'CONTROL ROOM' },
  { id: 'monitor-wall', type: 'rect', x: 330, y: 225, w: 500, h: 55, label: 'MONITOR WALL' },
  { id: 'console', type: 'rect', x: 400, y: 390, w: 360, h: 100, label: 'CONSOLE' },
  { id: 'cabinet', type: 'rect', x: 850, y: 290, w: 72, h: 190, label: 'CABINET' },
  { id: 'steel-door', type: 'rect', x: 270, y: 360, w: 50, h: 130, label: 'DOOR' },
  { id: 'scene-label', type: 'text', x: 420, y: 575, w: 320, h: 32, text: '지하철 관제실 · 밤' },
  { id: 'jaein-marker', type: 'marker', x: 360, y: 500, label: '재', color: '#10b981', waypoints: [] },
  { id: 'minho-marker', type: 'marker', x: 785, y: 335, label: '민', color: '#f59e0b', waypoints: [] },
]

const cloneSpatialElements = (elements) => elements.map((element) => ({
  ...element,
  waypoints: element.waypoints?.map((waypoint) => ({ ...waypoint })),
}))

// 씬 상태의 모든 변화 시작점을 하나의 공간 단계로 합친다. 인물의 상태와
// 조명 변화가 같은 컷에서 시작하면, 그 컷부터는 같은 2D 배치를 고른다.
const spatialStagesFor = (sceneState, shots, sceneId) => {
  const factGroups = [
    ...(sceneState?.characters || []).flatMap((character) => character.facts || []),
    ...(sceneState?.location?.facts || []),
    ...(sceneState?.environment?.facts || []),
  ]
  const starts = new Set([0])
  factGroups.forEach((fact) => {
    ;(fact.changes || []).forEach((change) => {
      const index = shots.findIndex((shot) => shot.cutPlanItemId === change.cutId)
      if (index > 0) starts.add(index)
    })
  })
  const indexes = [...starts].sort((left, right) => left - right)
  return indexes.map((start, index) => {
    const nextStart = indexes[index + 1] ?? shots.length
    const end = Math.max(start, nextStart - 1)
    const cutId = start === 0 ? 'initial' : shots[start]?.cutPlanItemId || `shot-${start}`
    return {
      id: `${sceneId || 'scene'}:${cutId}`,
      start,
      label: start === end ? `S${start + 1}` : `S${start + 1}–S${end + 1}`,
    }
  })
}

const MOCK_MISE_ENTITY_PRESETS = [
  { label: '재', color: '#10b981', full: '재인' },
  { label: '민', color: '#f59e0b', full: '민호' },
]

const MOCK_MISE_SHOT_STAGING = [
  {
    values: [
      ['등장 인물', '재인 · 민호'],
      ['배치·거리', '재인은 철문 옆, 민호는 관제실 반대편 콘솔 앞'],
      ['자세·행동', '재인은 문을 닫은 채 멈춤 · 민호는 등을 보이고 앉아 있음'],
      ['표정·시선', '재인은 민호를 경계 · 민호는 돌아보지 않음'],
      ['이동 소품', '출입카드는 재인의 오른손에 쥐어져 있음'],
      ['보이는 배경', '모니터 벽 · 콘솔 · 철문 · 캐비닛'],
    ],
    interpretation: '넓은 거리와 등 돌린 자세가 즉각적인 대치보다 불신과 통제의 비대칭을 먼저 읽히게 합니다.',
  },
  {
    values: [
      ['등장 인물', '재인 · 민호'],
      ['배치·거리', '재인은 철문 앞에 고정 · 민호는 콘솔 앞'],
      ['자세·행동', '재인은 얼어붙음 · 민호는 앉은 자세 유지'],
      ['표정·시선', '재인은 민호를 응시 · 민호의 얼굴은 아직 보이지 않음'],
      ['이동 소품', '출입카드는 재인의 손 안에 감춰짐'],
      ['보이는 배경', '재인 뒤 철문 · 두 사람 사이의 콘솔'],
    ],
    interpretation: '재인의 정지가 발각된 공포로, 민호의 정지는 상황을 이미 통제하고 있다는 태도로 대비됩니다.',
  },
  {
    values: [
      ['등장 인물', '재인 · 민호'],
      ['배치·거리', '민호가 의자를 돌려 재인과 대각선으로 마주함'],
      ['자세·행동', '민호는 오른손을 책상 아래 감춤 · 재인은 카드를 들어 보임'],
      ['표정·시선', '서로 마주 보지만 재인은 가까이 가지 않음'],
      ['이동 소품', '출입카드가 처음으로 두 사람 사이에 노출됨'],
      ['보이는 배경', '콘솔 모서리 · 민호 뒤 모니터 벽'],
    ],
    interpretation: '시선은 연결되지만 거리는 유지되어, 협력보다 조건을 재는 대치로 읽힙니다.',
  },
  {
    values: [
      ['등장 인물', '재인 · 민호'],
      ['배치·거리', '두 사람 모두 제자리 · 민호의 시선만 모니터 벽으로 이동'],
      ['자세·행동', '재인은 카드를 든 채 버팀 · 민호는 짧게 고개만 돌림'],
      ['표정·시선', '민호 → 모니터 → 재인'],
      ['이동 소품', '출입카드는 계속 재인의 손에 있음'],
      ['보이는 배경', '승강장과 터널이 비치는 모니터'],
    ],
    interpretation: '둘만의 협상이 외부의 더 큰 위험과 연결되어 있다는 정보가 블로킹을 바꾸지 않고 추가됩니다.',
  },
  {
    values: [
      ['등장 인물', '재인 · 민호'],
      ['배치·거리', '민호가 일어나 한 걸음 접근 · 재인은 출구 쪽으로 후퇴'],
      ['자세·행동', '민호는 리모컨을 노출 · 재인은 몸을 뒤로 뺌'],
      ['표정·시선', '재인의 시선이 리모컨·모니터·캐비닛을 오감'],
      ['이동 소품', '검은 리모컨이 민호의 오른손에 공개됨'],
      ['보이는 배경', '재인 뒤 철문 · 민호 뒤 콘솔'],
    ],
    interpretation: '공간의 거리가 줄어드는 동시에 선택 가능한 공간도 줄어들어 위협과 고립이 함께 강화됩니다.',
  },
  {
    values: [
      ['등장 인물', '재인 · 민호'],
      ['배치·거리', '좁혀진 대치 거리 유지'],
      ['자세·행동', '둘 다 행동을 멈추고 모니터를 확인'],
      ['표정·시선', '재인과 민호의 시선이 같은 모니터로 모임'],
      ['이동 소품', '리모컨은 민호 · 출입카드는 재인'],
      ['보이는 배경', '노란 우비 아이가 보이는 모니터'],
    ],
    interpretation: '적대 관계가 해소되지는 않지만, 선택의 결과가 제삼자에게 향한다는 윤리적 압력이 생깁니다.',
  },
  {
    values: [
      ['등장 인물', '재인 · 민호'],
      ['배치·거리', '재인이 콘솔 쪽으로 몸을 던질 수 있는 거리까지 접근'],
      ['자세·행동', '재인은 카드를 콘솔 아래로 던진 뒤 리모컨을 향해 돌진'],
      ['표정·시선', '민호의 시선은 카드 쪽으로 순간 이탈'],
      ['이동 소품', '출입카드: 재인 손 → 콘솔 아래'],
      ['보이는 배경', '콘솔 하부 · 민호의 리모컨'],
    ],
    interpretation: '소품 이동이 시선과 신체 이동을 동시에 분리해, 재인이 처음으로 공간의 주도권을 되찾는 전환점이 됩니다.',
  },
]

function getMockMiseShotStaging(shotIndex) {
  return MOCK_MISE_SHOT_STAGING[shotIndex] || MOCK_MISE_SHOT_STAGING[0]
}

const MOCK_MISE_STAGING_MOVE_TYPES = [
  {
    id: 'blocking',
    approach: '인물 배치',
    titles: [
      '문과 콘솔 사이에 진입선 만들기',
      '철문 앞에 재인 고정하기',
      '콘솔을 넘지 않는 협상',
      '몸의 위치는 그대로 두기',
      '접근과 후퇴를 같은 축으로',
      '잠시 같은 방향에 세우기',
      '두 행동의 동선 교차시키기',
    ],
    proposals: [
      '재인을 열린 철문의 회전 반경 안에 두고, 콘솔 건너편의 민호와 긴 대각선을 만듭니다.',
      '재인은 손잡이에서 떨어지지 않고 민호는 콘솔 앞을 지켜, 움직이지 않는 쪽이 공간을 소유하게 합니다.',
      '민호가 의자를 돌더라도 두 사람 모두 콘솔 경계를 넘지 않아 협상을 물리적 대치로 만듭니다.',
      '두 사람의 발은 고정한 채 모니터만 제삼의 공간으로 끌어들입니다.',
      '민호가 다가올 때 재인은 같은 축으로 후퇴해 철문에 걸리게 합니다.',
      '아이를 본 순간 두 사람을 나란히 모니터 쪽으로 세웠다가 다시 대치하게 합니다.',
      '카드가 미끄러지는 방향과 재인이 리모컨으로 돌진하는 방향을 교차시킵니다.',
    ],
    gain: '관계와 권력 변화를 공간으로 명확하게 만듦',
    cost: '배치가 너무 도식적으로 보일 수 있음',
  },
  {
    id: 'performance',
    approach: '연기 동작',
    titles: [
      '손잡이를 놓지 못하는 재인',
      '정지와 무반응 대비하기',
      '의자 회전과 카드 공개 늦추기',
      '몸보다 고개가 먼저 반응하기',
      '의자와 발뒤꿈치로 위협 만들기',
      '같은 화면에 다른 반응 주기',
      '카드 투척을 페이크로 만들기',
    ],
    proposals: [
      '재인은 문을 닫은 뒤에도 손잡이를 놓지 않고, 민호를 확인한 뒤에야 천천히 손을 뗍니다.',
      '재인은 숨까지 멈추지만 민호는 콘솔 조작을 계속해 두 사람의 긴장 온도를 다르게 둡니다.',
      '민호는 의자를 천천히 돌리고, 재인은 그 움직임이 끝난 뒤에야 카드를 절반만 들어 보입니다.',
      '민호는 몸을 그대로 둔 채 고개와 눈만 모니터로 옮겨 이미 알고 있었다는 태도를 만듭니다.',
      '민호가 일어서며 의자를 밀어내고, 재인은 뒷발로 철문 위치부터 확인합니다.',
      '재인은 아이를 보고 흔들리지만 민호는 리모컨을 쥔 손의 힘만 바꿉니다.',
      '재인이 카드를 던지는 동작을 크게 시작한 뒤 손목을 꺾어 예상과 다른 방향으로 보냅니다.',
    ],
    gain: '대사 없이도 인물의 전략과 감정을 드러냄',
    cost: '미세한 동작은 작은 패널에서 약하게 읽힐 수 있음',
  },
  {
    id: 'eyeline',
    approach: '시선 설계',
    titles: [
      '직접 보지 않고 반사로 확인하기',
      '민호의 손을 먼저 보게 하기',
      '카드에서 얼굴로 시선 연결하기',
      '모니터를 거쳐 재인에게 돌아오기',
      '위험 단서를 순서대로 훑기',
      '공동 시선 뒤 다시 갈라지기',
      '서로 다른 목표를 보게 하기',
    ],
    proposals: [
      '재인은 민호를 바로 보지 않고 꺼진 모니터 반사로 위치를 먼저 확인합니다.',
      '재인의 시선이 민호의 얼굴보다 콘솔 아래 감춰진 오른손에 먼저 머물게 합니다.',
      '두 사람의 시선이 출입카드에서 만나고, 그다음 서로의 얼굴로 올라오게 합니다.',
      '민호의 시선이 모니터의 터널 화면을 거쳐 재인에게 돌아오게 합니다.',
      '재인의 시선이 리모컨에서 모니터, 캐비닛, 철문 순서로 이동해 선택지를 드러냅니다.',
      '두 사람이 아이 화면을 함께 본 직후 서로 다른 방향으로 시선을 떼게 합니다.',
      '민호는 미끄러지는 카드를 보고, 재인은 민호가 든 리모컨만 보게 합니다.',
    ],
    gain: '관객의 주의를 대사 없이 필요한 정보로 이동시킴',
    cost: '시선 방향이 불분명하면 의도가 사라짐',
  },
  {
    id: 'prop',
    approach: '소품 동선',
    titles: [
      '젖은 소매 안에 카드 숨기기',
      '카드 모서리만 만지작거리기',
      '카드를 절반만 공개하기',
      '카드와 모니터 단서 연결하기',
      '리모컨을 늦게 드러내기',
      '두 소품을 양쪽에 유지하기',
      '카드의 이동으로 틈 만들기',
    ],
    proposals: [
      '출입카드를 손에 노출하지 않고 젖은 소매 안에 반쯤 숨겨 이후 공개할 순간을 남깁니다.',
      '재인이 손바닥 안에서 카드 모서리를 엄지로 문지르는 동작만 보여 불안을 소품에 실어둡니다.',
      '카드를 어깨높이까지 들지 않고 콘솔 모서리 위로 절반만 보이게 내밉니다.',
      '민호가 모니터를 보는 동안 재인은 카드를 움직이지 않아 두 단서가 경쟁하지 않게 합니다.',
      '민호가 일어선 뒤에도 리모컨을 허벅지 뒤에 숨겼다가 마지막 순간에 몸 옆으로 내놓습니다.',
      '리모컨은 민호 쪽, 카드는 재인 쪽에 둔 채 어느 것도 중앙을 차지하지 않게 합니다.',
      '카드를 콘솔 아래 깊숙이 미끄러뜨려 민호가 시선뿐 아니라 몸까지 기울이게 합니다.',
    ],
    gain: '소품 공개와 이동이 행동의 전환점이 됨',
    cost: '소품 정보가 서사보다 먼저 강조될 수 있음',
  },
  {
    id: 'set',
    approach: '세트 활용',
    titles: [
      '젖은 침입 흔적 남기기',
      '철문이 스스로 닫히게 하기',
      '의자와 콘솔을 장벽으로 쓰기',
      '모니터가 먼저 반응하게 하기',
      '밀려난 의자로 자리 변화 남기기',
      '주변 모니터의 정보를 비우기',
      '콘솔 하부를 행동 공간으로 쓰기',
    ],
    proposals: [
      '재인이 들어온 철문부터 발밑까지 빗물 자국을 남겨 침입 경로가 공간에 기록되게 합니다.',
      '재인이 손을 뗀 뒤 무거운 철문이 천천히 닫혀 퇴로가 사라지는 시간을 행동으로 만듭니다.',
      '민호가 돌린 의자와 콘솔 모서리가 두 사람 사이에 겹쳐 쉽게 접근할 수 없게 합니다.',
      '민호가 바라보기 직전에 모니터 하나가 터널 화면으로 전환되어 공간이 먼저 반응하게 합니다.',
      '민호가 일어서며 밀린 의자를 어두운 통로에 남겨 이전의 안전한 자리가 사라졌음을 보여줍니다.',
      '아이 화면 외의 모니터는 신호가 끊기거나 빈 승강장을 유지해 하나의 정보만 살아남게 합니다.',
      '콘솔 아래 틈을 카드가 들어가고 몸이 숙여지는 실제 행동 공간으로 사용합니다.',
    ],
    gain: '장소가 배경이 아니라 행동과 정보에 참여함',
    cost: '세트 변화가 많으면 핵심 인물 행동이 분산됨',
  },
]

function getMockMiseStagingMoves(shotIndex) {
  return MOCK_MISE_STAGING_MOVE_TYPES.map((move) => ({
    ...move,
    id: `mise-${move.id}-shot-${shotIndex + 1}`,
    title: move.titles[shotIndex] || move.titles[0],
    proposal: move.proposals[shotIndex] || move.proposals[0],
  }))
}

const MOCK_EDITING_SINGLE_CUES = [
  '진입, 철문 닫힘, 민호의 무반응이 한 Shot에 이어져 첫 긴장이 늦게 시작될 수 있습니다.',
  '민호의 대사와 재인의 정지가 같은 호흡 안에 있어 반응을 분리할 여지가 있습니다.',
  '의자 회전, 질문, 카드 공개가 연속되어 어느 행동을 전환점으로 삼을지 정해야 합니다.',
  '모니터 확인과 대사 교환 사이의 컷 지점이 정보 공개 속도를 결정합니다.',
  '민호의 기립, 리모컨 공개, 재인의 후퇴가 겹쳐 핵심 위협이 묻힐 수 있습니다.',
  '아이 화면의 공개 뒤 두 인물의 반응을 얼마나 유지할지가 장면의 윤리적 무게를 결정합니다.',
  '카드 투척부터 리모컨 돌진까지 행동이 빠르게 이어져 분할 지점을 명확히 해야 합니다.',
]

const MOCK_EDITING_SINGLE_OPERATIONS = [
  {
    id: 'trim-head',
    operation: '앞부분 줄이기',
    titles: [
      '철문이 거의 닫힌 순간부터 시작',
      '민호의 첫 대사에 바로 진입',
      '의자가 움직이기 시작한 순간부터',
      '민호의 시선이 모니터로 꺾일 때 진입',
      '밀려나는 의자 움직임으로 시작',
      '모니터가 지직거리는 순간부터',
      '재인이 카드를 들기 직전부터',
    ],
    proposals: [
      '재인의 전체 진입을 생략하고 철문 틈이 사라지는 마지막 동작에서 Shot을 시작합니다.',
      '재인이 이미 멈춘 상태에서 민호의 “생각보다 오래 걸렸네”로 Shot을 시작합니다.',
      '민호가 앉아 있는 준비 동작을 덜고 의자 회전이 시작된 순간에 들어갑니다.',
      '대화의 앞부분을 유지하되 민호가 모니터를 보는 행동이 시작되는 지점에서 Shot을 엽니다.',
      '민호가 일어나는 준비보다 의자가 뒤로 밀리는 움직임을 첫 프레임의 행동으로 둡니다.',
      '정적인 대기 시간을 줄이고 모니터 노이즈와 형광등 깜빡임이 시작되는 순간에 들어갑니다.',
      '재인이 결심하기까지의 반복 시선을 덜고 카드를 던질 준비가 끝난 지점부터 시작합니다.',
    ],
    purpose: 'Shot의 핵심 행동에 더 빠르게 진입',
    watch: '공간이나 행동의 원인이 부족해질 수 있음',
  },
  {
    id: 'split',
    operation: '샷 나누기',
    titles: [
      '철문이 닫힌 뒤 민호로 분리',
      '재인이 얼어붙는 순간 분할',
      '의자 회전 뒤 카드 공개 분리',
      '모니터 확인을 별도 Shot으로',
      '의자가 밀린 뒤 리모컨 공개',
      '아이 화면과 인물 반응 분리',
      '카드가 바닥에 닿는 순간 분할',
    ],
    proposals: [
      '철문이 완전히 닫히는 순간을 경계로 삼아, 관제실 반대편의 민호를 다음 Shot으로 분리합니다.',
      '민호의 대사가 끝나고 재인이 얼어붙는 순간 반응 Shot을 별도로 만듭니다.',
      '민호의 의자 회전이 끝난 뒤 컷하고, 출입카드 공개를 다음 Shot의 시작으로 둡니다.',
      '민호의 시선 이동 뒤 모니터 화면을 짧은 Insert Shot으로 분리합니다.',
      '의자가 프레임에서 밀려난 직후 컷하고 리모컨이 드러나는 행동을 별도 Shot으로 만듭니다.',
      '노란 우비 아이가 보이는 화면과 재인·민호의 반응을 서로 다른 Shot으로 나눕니다.',
      '카드가 콘솔 아래로 들어가는 순간 컷하고, 민호의 시선 이탈부터 다음 Shot을 시작합니다.',
    ],
    purpose: '한 Shot에 겹친 행동의 전환점을 분명하게 만듦',
    watch: '컷 수가 늘어 장면의 연속된 압력이 약해질 수 있음',
  },
  {
    id: 'hold-tail',
    operation: '끝 반응 유지',
    titles: [
      '민호가 돌아보지 않는 시간을 유지',
      '재인의 정지를 한 박자 더',
      '카드 공개 뒤 답을 늦추기',
      '모니터에서 시선이 돌아올 때까지',
      '리모컨 공개 뒤 재인의 반응 확보',
      '아이 화면 뒤 침묵 유지',
      '민호의 시선이 카드로 쏠린 순간 유지',
    ],
    proposals: [
      '철문이 닫힌 뒤 바로 넘어가지 않고 민호가 계속 등을 보이는 상태를 한 박자 유지합니다.',
      '민호의 대사 뒤 재인이 대답하기 전, 얼어붙은 상태를 짧게 더 남깁니다.',
      '재인이 카드를 들어 보인 뒤 민호가 확인할 시간을 남기고 다음 대사로 넘어갑니다.',
      '민호가 모니터를 본 뒤 시선이 재인에게 돌아오는 순간까지 Shot을 유지합니다.',
      '리모컨이 완전히 보인 뒤 재인의 눈이 그 위치를 찾는 순간까지 컷을 늦춥니다.',
      '아이 화면을 확인한 뒤 누구도 말하지 않는 시간을 남겨 선택의 무게를 확보합니다.',
      '민호의 시선이 카드에 붙잡힌 순간을 짧게 유지한 뒤 재인의 돌진으로 넘어갑니다.',
    ],
    purpose: '반응과 정보가 관객에게 도착할 시간을 확보',
    watch: '긴장을 밀어야 할 구간에서는 리듬이 처질 수 있음',
  },
  {
    id: 'pickup',
    operation: '연결 컷·지점',
    titles: [
      '젖은 손과 출입카드 Detail',
      '카드를 쥔 손을 반응 연결점으로',
      '의자 회전 동작에 Match cut',
      '민호의 Eyeline을 모니터 Insert로',
      '리모컨 공개 Detail 확보',
      '재인의 시선으로 반응 컷 연결',
      '카드 미끄러짐을 행동 연결점으로',
    ],
    proposals: [
      '철문 손잡이에서 떨어지는 젖은 손과 소매 안 출입카드를 짧은 Detail Shot으로 확보합니다.',
      '민호의 대사 뒤 재인이 카드를 더 세게 쥐는 손동작을 다음 반응 Shot의 연결점으로 사용합니다.',
      '민호의 의자가 회전하는 움직임 중간에서 컷해 다음 각도의 움직임과 이어 붙입니다.',
      '민호의 시선 방향을 받아 터널 모니터 Insert로 연결하고 같은 Eyeline으로 돌아옵니다.',
      '민호의 손이 책상 아래에서 나오는 순간 리모컨 Detail Shot을 확보합니다.',
      '아이 화면에서 재인의 시선으로 연결되는 짧은 반응 Shot을 추가합니다.',
      '카드가 바닥을 미끄러지는 움직임을 따라 컷하고 민호의 시선 이동으로 이어 붙입니다.',
    ],
    purpose: '다음 Shot과 연결할 명확한 시각적 고리를 만듦',
    watch: '디테일 컷이 많아지면 장면이 설명적으로 보일 수 있음',
  },
]

const MOCK_EDITING_INCOMING_BOUNDARIES = [
  null,
  {
    kind: 'retime',
    operation: '연결 지점 조정',
    title: '철문 닫힘에서 민호의 대사로 연결',
    proposal: 'S1은 철문이 완전히 닫히는 순간 끝내고, S2는 민호의 “생각보다 오래 걸렸네”로 바로 시작합니다.',
  },
  {
    kind: 'retime',
    operation: '행동 연결',
    title: '재인의 대답에서 의자 회전으로',
    proposal: 'S2는 재인의 대답이 끝나는 순간 자르고, S3는 민호의 의자가 움직이기 시작하는 순간부터 시작합니다.',
  },
  {
    kind: 'retime',
    operation: '시선 연결',
    title: '민호의 시선을 모니터로 연결',
    proposal: 'S3는 민호의 시선이 재인에게서 벗어나는 순간 끝내고, S4는 그가 바라본 모니터 화면으로 시작합니다.',
  },
  {
    kind: 'retime',
    operation: '행동 연결',
    title: '대사 끝에서 의자 움직임으로',
    proposal: 'S4는 민호의 마지막 대사 직후 끝내고, S5는 의자가 뒤로 밀리기 시작하는 움직임으로 시작합니다.',
  },
  {
    kind: 'retime',
    operation: '시선 연결',
    title: '재인의 시선을 아이 화면으로',
    proposal: 'S5는 재인이 모니터로 시선을 돌리는 순간 끝내고, S6는 노란 우비 아이가 보이는 화면으로 시작합니다.',
  },
  {
    kind: 'retime',
    operation: '행동 연결',
    title: '카드를 쥔 손에서 투척으로',
    proposal: 'S6는 재인이 출입카드를 세게 쥐는 순간 끝내고, S7는 그 손이 카드를 던지는 동작으로 시작합니다.',
  },
]

const MOCK_EDITING_OUTGOING_BOUNDARIES = [
  {
    kind: 'insert',
    operation: '새 샷 추가',
    title: '출입카드 Shot을 S1 뒤에 추가',
    proposal: 'S1과 S2 사이에 임시 Shot을 추가합니다. 새 패널에는 재인의 오른손에 쥔 출입카드만 표시합니다.',
  },
  {
    kind: 'insert',
    operation: '새 샷 추가',
    title: '재인의 정지 반응을 S2 뒤에 추가',
    proposal: 'S2와 S3 사이에 임시 Shot을 추가합니다. 새 패널에는 민호의 말을 듣고 움직임을 멈춘 재인의 반응을 표시합니다.',
  },
  {
    kind: 'insert',
    operation: '새 샷 추가',
    title: '모니터 화면을 S3 뒤에 추가',
    proposal: 'S3와 S4 사이에 임시 Shot을 추가합니다. 새 패널에는 민호가 바라본 승강장과 터널 모니터를 표시합니다.',
  },
  {
    kind: 'insert',
    operation: '새 샷 추가',
    title: '감춰진 오른손 Shot을 S4 뒤에 추가',
    proposal: 'S4와 S5 사이에 임시 Shot을 추가합니다. 새 패널에는 콘솔 아래 감춰진 민호의 오른손을 표시합니다.',
  },
  {
    kind: 'insert',
    operation: '새 샷 추가',
    title: '리모컨을 본 재인 Shot을 S5 뒤에 추가',
    proposal: 'S5와 S6 사이에 임시 Shot을 추가합니다. 새 패널에는 공개된 리모컨을 확인하는 재인의 반응을 표시합니다.',
  },
  {
    kind: 'insert',
    operation: '새 샷 추가',
    title: '카드를 쥔 손 Shot을 S6 뒤에 추가',
    proposal: 'S6와 S7 사이에 임시 Shot을 추가합니다. 새 패널에는 힘이 들어간 재인의 손과 출입카드를 표시합니다.',
  },
  null,
]

function getMockEditingSingle(shotIndex) {
  const shotNumber = shotIndex + 1
  return {
    cue: MOCK_EDITING_SINGLE_CUES[shotIndex] || MOCK_EDITING_SINGLE_CUES[0],
    operations: MOCK_EDITING_SINGLE_OPERATIONS
      .filter((operation) => operation.id !== 'pickup')
      .map((operation) => ({
        ...operation,
        kind: operation.id,
        scope: 'current',
        scopeLabel: `현재 샷 · S${shotNumber}`,
        id: `editing-${operation.id}-shot-${shotNumber}`,
        title: operation.titles[shotIndex] || operation.titles[0],
        proposal: operation.proposals[shotIndex] || operation.proposals[0],
        result: operation.id === 'split'
          ? `S${shotNumber} 1개 → 두 개의 Shot`
          : operation.id === 'trim-head'
            ? `Shot 수 변화 없음 · S${shotNumber} 시작점 이동`
            : `Shot 수 변화 없음 · S${shotNumber} 종료점 이동`,
      })),
  }
}

function getMockEditingBoundaries(shotIndex, shotCount) {
  const suggestions = []
  const incoming = MOCK_EDITING_INCOMING_BOUNDARIES[shotIndex]
  const outgoing = MOCK_EDITING_OUTGOING_BOUNDARIES[shotIndex]

  if (incoming && shotIndex > 0) {
    suggestions.push({
      ...incoming,
      scope: 'incoming',
      scopeLabel: `이전 연결 · S${shotIndex} → S${shotIndex + 1}`,
      id: `editing-incoming-shot-${shotIndex + 1}`,
      result: `Shot 수 변화 없음 · S${shotIndex} → S${shotIndex + 1} 연결 시점 변경`,
      watch: '앞 Shot의 끝과 현재 Shot의 시작을 함께 변경합니다.',
    })
  }

  if (outgoing && shotIndex < shotCount - 1) {
    suggestions.push({
      ...outgoing,
      scope: 'outgoing',
      scopeLabel: `다음 연결 · S${shotIndex + 1} → S${shotIndex + 2}`,
      id: `editing-outgoing-shot-${shotIndex + 1}`,
      result: `S${shotIndex + 1} → 새 Shot → S${shotIndex + 2}`,
      watch: '새 Shot은 임시 패널로 추가되고 이후 다른 Lens에서 구체화합니다.',
    })
  }

  return suggestions
}

function getMockCameraShot(shot, shotIndex) {
  return {
    ...(MOCK_CAMERA_SHOT_SEQUENCE[shotIndex] || {
      shotSize: 'Medium',
      framing: 'Single',
      role: '현재 행동',
    }),
    label: shot?.label || `Shot ${shotIndex + 1}`,
    shotNumber: shotIndex + 1,
  }
}

function buildMockRangePlan(pattern, scopedShots) {
  const lastIndex = Math.max(scopedShots.length - 1, 1)

  return scopedShots.map((shot, index) => {
    const progress = index / lastIndex

    if (pattern === 'compress') {
      const shotSize = progress < 0.34 ? 'Wide' : progress < 0.67 ? 'Medium' : 'Close-up'
      return { ...shot, shotSize, framing: progress < 0.34 ? 'Master' : 'Single' }
    }

    if (pattern === 'hold-space') {
      return { ...shot, shotSize: index === 0 ? 'Wide' : 'Medium Wide', framing: index === 0 ? 'Master' : 'Two-shot' }
    }

    return {
      ...shot,
      shotSize: progress < 0.5 ? 'Medium' : 'Medium Close',
      framing: index === 0 ? 'Observer' : index === scopedShots.length - 1 ? 'Single' : 'OTS',
    }
  })
}

// 씬 안의 상태 변화를 보여주고 더한다 (DG2 P2).
// 인물·장소·환경이 같은 모양을 쓴다 — 셋 다 컷을 가로지르며 변한다.
function SceneFactChanges({ fact, group, characterId = null, shots, onAdd, onRemove, disabled = false }) {
  if (fact.open) return null

  const orderedChanges = (fact.changes || [])
    .map((change) => ({
      ...change,
      shotIndex: shots.findIndex((shot) => shot.cutPlanItemId === change.cutId),
    }))
    .filter((change) => change.shotIndex >= 0)
    .sort((left, right) => left.shotIndex - right.shotIndex)
  const stages = [
    { id: 'initial', value: fact.value, shotIndex: 0, initial: true },
    ...orderedChanges,
  ]
  const usedCutIds = new Set(orderedChanges.map((change) => change.cutId))
  const lastChangeIndex = orderedChanges[orderedChanges.length - 1]?.shotIndex ?? 0
  const nextShot = shots.find((shot, index) => (
    index > lastChangeIndex && shot.cutPlanItemId && !usedCutIds.has(shot.cutPlanItemId)
  )) || shots.find((shot) => shot.cutPlanItemId && !usedCutIds.has(shot.cutPlanItemId))

  const rangeLabel = (stage, index) => {
    if (stage.initial) {
      const firstChange = orderedChanges[0]
      if (!firstChange || firstChange.shotIndex <= 0) return '처음 상태'
      return firstChange.shotIndex === 1 ? 'S1' : `S1–S${firstChange.shotIndex}`
    }
    const next = stages[index + 1]
    const from = stage.shotIndex + 1
    const to = next ? next.shotIndex : shots.length
    return from === to ? `S${from}` : `S${from}–S${to}`
  }

  const openStageEditor = (stage) => {
    onAdd({
      group,
      characterId,
      label: fact.label,
      cutId: stage.cutId,
      originalCutId: stage.cutId,
      takenCutIds: [...usedCutIds],
      value: stage.value,
      editing: true,
    })
  }

  return (
    <section className="mise-fact-timeline" aria-label={`${fact.label} 상태 진행`}>
      <header>
        <span>상태 진행</span>
        <small>각 단계는 다음 변화 전까지 유지됩니다.</small>
      </header>
      <ol>
        {stages.map((stage, index) => {
          const isInitial = stage.initial
          const label = rangeLabel(stage, index)
          const nextLabel = isInitial ? '처음 값' : `${label}부터`
          return (
            <li key={stage.id || stage.cutId} className={isInitial ? 'initial' : ''}>
              <span className="mise-fact-stage-dot">{index + 1}</span>
              <div>
                <small>{nextLabel}</small>
                <strong>{stage.value || '아직 정하지 않음'}</strong>
              </div>
              {!isInitial && (
                <button
                  type="button"
                  className="mise-fact-stage-edit"
                  disabled={disabled}
                  onClick={() => openStageEditor(stage)}
                >수정</button>
              )}
              {!isInitial && (
                <button
                  type="button"
                  className="mise-fact-stage-remove"
                  disabled={disabled}
                  aria-label={`${label} 상태 삭제`}
                  onClick={() => onRemove(group, fact.label, stage.cutId, { characterId })}
                >×</button>
              )}
            </li>
          )
        })}
      </ol>
      <button
        type="button"
        className="mise-fact-add-change"
        disabled={disabled || !nextShot}
        onClick={() => onAdd({
          group,
          characterId,
          label: fact.label,
          cutId: nextShot?.cutPlanItemId || null,
          originalCutId: null,
          takenCutIds: [...usedCutIds],
          value: '',
          editing: false,
        })}
      >
        + 다음 상태
      </button>
    </section>
  )
}

function ViewerReadingCard({ reading, activePanelOrder, onRoute }) {
  if (!reading) return null
  const routeLabels = { narrative: '서사', mise: '미장센', camera: '촬영', editing: '편집' }
  const relationLabels = {
    start: '처음 떠오른 생각',
    reinforced: '앞의 생각이 더 강해졌어',
    shifted: '생각이 조금 바뀌었어',
    unsettled: '확신이 조금 흔들렸어',
    new_question: '새로운 질문이 생겼어',
  }
  const activeStep = reading.steps?.find((step) => step.panel_order === activePanelOrder)
  if (!activeStep) return null

  const visibleCues = activeStep.noticed_cues || activeStep.visible_cues || []
  const immediateReading = activeStep.immediate_reading
    || activeStep.possible_interpretations?.[0]
    || '아직 뚜렷한 의미는 잡히지 않아.'
  const currentHypothesis = activeStep.current_hypothesis
    || activeStep.possible_interpretations?.[1]
    || immediateReading
  const openQuestion = activeStep.open_question
    || activeStep.inferred_assumptions?.[0]
    || ''
  const activeReviewPoint = reading.review_points?.find((point) => (
    point.panel_orders.includes(activePanelOrder)
  ))
  const activeStepIndex = activeStep ? reading.steps.findIndex((step) => step.panel_order === activePanelOrder) : -1
  const routeContext = {
    title: activeReviewPoint?.issue || reading.title,
    interpretations: [immediateReading, currentHypothesis].filter(Boolean),
    visibleCues,
    uncertainties: [openQuestion].filter(Boolean),
    panelOrders: activeReviewPoint?.panel_orders || [activePanelOrder],
    scope: activeReviewPoint?.scope || 'single',
    routeReason: activeReviewPoint?.route_reason || '',
  }

  return (
    <article className="viewer-guide-card">
      <div className={`viewer-guide-character phase-${activeStepIndex === 0 ? 'start' : activeStepIndex === reading.steps.length - 1 ? 'end' : 'middle'}`} aria-label="새눈이">
        <div className="viewer-guide-face" aria-hidden="true">
          <span className="eye eye-left" />
          <span className="eye eye-right" />
          <span className="viewer-guide-mouth" />
        </div>
        <strong>새눈이</strong>
      </div>
      <div className="viewer-guide-bubble">
        <span>S{activeStep.panel_order} · {relationLabels[activeStep.relation_to_previous] || '보면서 든 생각'}</span>
        <h3>{immediateReading}</h3>
        {activeStep.feeling && <p className="viewer-guide-feeling"><strong>느낌</strong>{activeStep.feeling}</p>}
        <div className="viewer-current-hypothesis">
          <strong>지금은 이렇게 보고 있어</strong>
          <p>{currentHypothesis}</p>
        </div>
        {openQuestion && <p className="viewer-open-question"><strong>궁금한 점</strong>{openQuestion}</p>}
        <details>
          <summary>왜 그렇게 봤어?</summary>
          <p>{visibleCues.join(' · ') || '특정 근거 없음'}</p>
        </details>
        {activeReviewPoint && (
          <div className="viewer-inline-review">
            <span>여기는 다시 볼 만해</span>
            <p>{activeReviewPoint.issue}</p>
            <small>{activeReviewPoint.audience_effect}</small>
            <div className="viewer-routes">
              {activeReviewPoint.routes.map((route) => (
                <button key={route} type="button" onClick={() => onRoute?.(route, activeReviewPoint.panel_orders, routeContext)}>
                  {routeLabels[route] || route}에서 다시 보기
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

function ViewerDecisionCard({
  decisionId,
  panelOrders,
  evidence = [],
  interpretations = [],
  creatorIntent,
  decision,
  onChange,
  onRoute,
}) {
  const status = decision?.status || ''
  const routes = decision?.routes || []
  const targetLabel = panelOrders.map((order) => `S${order}`).join(' · ')

  return (
    <section className="viewer-decision-card" aria-label={`${targetLabel} 제작자 결정`}>
      <header>
        <div>
          <span>제작자 비교 · {targetLabel}</span>
          <strong>이 읽힘을 어떻게 다룰까요?</strong>
        </div>
        {status && <em className={status}>{status === 'revise' ? '수정 검토' : status === 'retain' ? '의도적으로 유지' : '보류'}</em>}
      </header>
      <div className="viewer-decision-layers">
        <p><strong>화면에서 본 근거</strong>{evidence.join(' · ') || '특정 근거 없음'}</p>
        <p><strong>이렇게 읽혔어요</strong>{interpretations.join(' / ') || '뚜렷한 해석 차이 없음'}</p>
        <p className="creator-intent"><strong>제작자가 확인하는 의도</strong>{creatorIntent || '아직 장면 의도를 적지 않았습니다.'}</p>
      </div>
      <div className="viewer-decision-actions" role="group" aria-label="제작자 결정">
        <button type="button" className={status === 'revise' ? 'active' : ''} onClick={() => onChange(decisionId, { status: 'revise' })}>수정 검토</button>
        <button type="button" className={status === 'retain' ? 'active' : ''} onClick={() => onChange(decisionId, { status: 'retain' })}>의도적으로 유지</button>
        <button type="button" className={status === 'defer' ? 'active' : ''} onClick={() => onChange(decisionId, { status: 'defer' })}>나중에 보기</button>
      </div>
      {status && (
        <label className="viewer-decision-note">
          <span>{status === 'retain' ? '유지하는 이유' : status === 'revise' ? '수정할 방향' : '보류 메모'}</span>
          <textarea
            value={decision?.note || ''}
            onChange={(event) => onChange(decisionId, { note: event.target.value })}
            placeholder={status === 'retain' ? '예: 이 불확실함은 다음 컷의 긴장을 위한 것이다.' : '짧게 기록하기'}
          />
        </label>
      )}
      {status === 'revise' && routes.length > 0 && (
        <div className="viewer-decision-routes">
          {routes.map((route) => (
            <button
              key={route}
              type="button"
              onClick={() => onRoute(route, panelOrders, {
                title: '제작자가 수정 검토로 남긴 읽힘',
                interpretations,
                visibleCues: evidence,
              })}
            >
              {route === 'narrative' ? '대본' : route === 'mise' ? '연출' : route === 'camera' ? '카메라' : '편집'}에서 검토
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

// 진단마다 고칠 도구가 다른 곳에 있다. level만 보면 미장센의 배치 문제가
// 컷 플랜 표로 가는데, 거기엔 배치를 고칠 것이 없다.
//
// 규칙 12개는 각자 무엇이 문제인지 정해져 있으므로, 어디로 보낼지도 정할
// 수 있다. 규칙을 못 찾으면 level로 떨어진다.
const RULE_DESTINATIONS = {
  // 미장센 — 배치와 외형. 컷 플랜 표에는 고칠 것이 없다.
  'mise-functional-elements': ['prompt', 'draw'],
  'mise-relational-blocking': ['prompt', 'draw'],
  'mise-spatial-continuity': ['layout', 'prompt'],
  'mise-visual-hierarchy': ['prompt', 'draw'],

  // 촬영 — 샷 값은 표에, 프레이밍은 그림에.
  'camera-information-selection': ['cutplan', 'prompt'],
  'camera-viewpoint-intent': ['cutplan', 'prompt'],
  'camera-axis-direction': ['cutplan'],
  'camera-movement-purpose': ['arrow', 'cutplan'],

  // 편집 — 문제가 컷 사이에 있고, 나누기·합치기도 이음새에 있다.
  // 컷 플랜으로 되돌아가면 그림이 안 보이고 표 전체가 열린다.
  'editing-shot-function': ['merge', 'split', 'narrative'],
  'editing-cut-continuity': ['seam', 'split'],
  // 정보 순서는 이야기 층위일 수 있다. 컷을 옮겨서 될 일이 아니라
  // 대본에 없는 단계가 빠진 것이면 서사가 답해야 한다.
  'editing-information-order': ['seam', 'narrative'],
  'editing-visual-rhythm': ['split', 'seam'],

  // 서사 — 대본에서 고친다. 그림이 아직 없어도 성립하는 진단이므로
  // 목적지도 패널이 아니라 대본이다.
  'narrative-beat-progression': ['script', 'narrative'],
  'narrative-action-visibility': ['script', 'narrative'],
  'narrative-information-reveal': ['script', 'narrative'],
  // 인과가 빠진 자리는 컷 사이이기도 하다 — 대본에 단계를 더할 수도,
  // 이음새에 컷을 넣을 수도 있다.
  'narrative-causal-link': ['script', 'seam'],
}

const DESTINATION_LABELS = {
  prompt: '프롬프트 고치기',
  draw: '직접 그리기',
  layout: '2D 배치 열기',
  cutplan: '컷 구성 열기',
  seam: '이음새 열기',
  merge: '앞 컷과 합치기',
  split: '컷 나누기',
  narrative: '서사에 물어보기',
  script: '대본 고치기',
  arrow: '카메라 화살표',
}

// 규칙을 못 찾으면 층위로 정한다 — 한 컷의 속성은 그림, 나머지는 컷 구성.
const destinationsFor = (diagnosis) => (
  RULE_DESTINATIONS[diagnosis?.rule_id]
  || (diagnosis?.level === 'attribute' ? ['prompt', 'draw'] : ['cutplan'])
)


function DirectingReviewResult({ run, onTool }) {
  const result = run.result
  const diagnoses = result?.diagnoses || []
  const question = run.questions?.[0]
  const assessments = result?.level_assessments || []
  const statusLabel = { keep: '현재 유지', check: '확인할 점', change: '수정 필요' }
  const statusClass = { keep: 'clear', check: 'check', change: 'has-issue' }
  const diagnosisByLevel = new Map(diagnoses.map((diagnosis) => [diagnosis.level, diagnosis]))

  if (!result) return null

  return (
    <section className="directing-review-result" aria-label="실제 연출 분석 결과">
      <div className="directing-review-result-heading">
        <div>
          <span>연출 분석</span>
          <strong>층위별 진단</strong>
        </div>
      </div>

      <p className="directing-review-summary">{result.summary}</p>

      <div className="directing-level-list">
        {assessments.map((assessment) => {
          const diagnosis = diagnosisByLevel.get(assessment.level)
          const cameraArrowRelevant = diagnosis?.rule_id?.startsWith('camera-')
            && /(이동|방향|팬|틸트|트래킹|달리|줌|축)/.test(
              `${diagnosis.diagnosis} ${diagnosis.suggested_action}`,
            )
          return (
            /* check는 감독이 답해야 무엇이 갈리는 층위다. 접어 두면 그
               질문이 보이지 않는다. */
            <details
              key={assessment.level}
              className={`directing-level-card ${statusClass[assessment.status]}`}
              open={assessment.status === 'change' || Boolean(assessment.open_question)}
            >
              {/* 기준은 이 카드를 펴야 보인다. summary 클릭만 센다 —
                  기본 열림인 details는 마운트 때 onToggle이 한 번 발생해서
                  감독이 열지 않은 것까지 '봤다'로 세어진다. 접는 클릭도
                  들어오므로 열려 있던 카드를 접은 경우는 뺀다. */}
              <summary
                onClick={(event) => {
                  const closing = event.currentTarget.parentElement?.open
                  if (closing || !diagnosis?.criterion) return
                  logScaffold({
                    feature: 'criterion',
                    action: 'view',
                    target: diagnosis.rule_id || assessment.level,
                    lens: diagnosis.lens || null,
                  })
                }}
              >
                <span>{DIAGNOSTIC_LEVEL_LABELS[assessment.level]}</span>
                <p>{assessment.summary}</p>
                <em>{statusLabel[assessment.status]}</em>
              </summary>
              {/* 화면만으로는 판단할 수 없는 것. 감독만 답할 수 있으므로
                  요약 문장이 아니라 질문으로 되돌린다 (DG1 P2). */}
              {assessment.open_question && (
                <p className="directing-open-question">{assessment.open_question}</p>
              )}
              {diagnosis && (
                <article className="directing-diagnosis-card">
                  <div className="directing-diagnosis-targets">
                    {diagnosis.targets.map((target) => <span key={target}>{target}</span>)}
                  </div>
                  {/* 무엇을 보고 내린 판단인가. 기준이 드러나야 감독이 그
                      판단 자체를 반박할 수 있다 — 진단만 있으면 판결이 된다. */}
                  {diagnosis.criterion && (
                    <p className="directing-criterion">{diagnosis.criterion}</p>
                  )}
                  <strong>{diagnosis.diagnosis}</strong>
                  <div className="directing-evidence">
                    <span>화면 근거</span>
                    <ul>
                      {diagnosis.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}
                    </ul>
                  </div>
                  <div className="directing-suggested-action">
                    <span>수정 방향</span>
                    <p>{diagnosis.suggested_action}</p>
                  </div>
                  {/* 갈 수 있는 길. '그대로 두기'가 늘 먼저 온다 — 유지도
                      연출 결정이고, 선택지에 없으면 진단이 지시가 된다. */}
                  {diagnosis.alternatives?.length > 0 && (
                    <div className="directing-alternatives">
                      <span>가능한 선택</span>
                      <ul>
                        {diagnosis.alternatives.map((alternative) => (
                          <li
                            key={alternative.label}
                            className={alternative.kind === 'keep' ? 'is-keep' : ''}
                          >
                            <strong>{alternative.label}</strong>
                            <p>{alternative.effect}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {diagnosis.theory_basis && (
                    <p className="directing-theory-basis">이론 근거 · {diagnosis.theory_basis}</p>
                  )}
                  <div className="directing-diagnosis-actions">
                    <button type="button" onClick={() => onTool?.('memo', diagnosis)}>
                      메모로 남기기
                    </button>
                    {/* 고칠 곳이 진단마다 다르다. 첫 번째가 가장 곧은 길이다. */}
                    {destinationsFor(diagnosis)
                      .filter((destination) => destination !== 'arrow' || cameraArrowRelevant)
                      .map((destination, index) => (
                        <button
                          key={destination}
                          type="button"
                          className={index === 0 ? 'primary' : ''}
                          onClick={() => onTool?.(destination, diagnosis)}
                        >
                          {DESTINATION_LABELS[destination]}
                        </button>
                      ))}
                  </div>
                </article>
              )}
            </details>
          )
        })}
      </div>

      {question && (
        <div className="directing-review-question">
          <span>감독에게 필요한 결정</span>
          <p>{question.prompt}</p>
        </div>
      )}
    </section>
  )
}

// 이음새 값은 저장은 id로 하고 화면에는 한국어로 보인다.
const joinLabelOf = (id) => SEAM_JOINS.find((entry) => entry.id === id)?.label || id
const elapsedLabelOf = (id) => SEAM_ELAPSED.find((entry) => entry.id === id)?.label || id

export default function DecisionBoard({ boardView = 'split' }) {
  const [selectedOptionId, setSelectedOptionId] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewMode, setReviewMode] = useState('multi')
  const [multiReviewIntents, setMultiReviewIntents] = useState({})
  const [multiReviewIntentDrafts, setMultiReviewIntentDrafts] = useState({})
  const [multiReviewRuns, setMultiReviewRuns] = useState({})
  // 관계에 대한 감독의 판정. 진단 id에 묶어 둔다 — 범위를 바꿔도 같은
  // 진단이 다시 나오면 그 판정이 살아 있어야 한다.
  const [relationVerdicts, setRelationVerdicts] = useState({})
  const [selectedOptionIds, setSelectedOptionIds] = useState([])
  const [cameraPreview, setCameraPreview] = useState(null)
  const [cameraApplyHistory, setCameraApplyHistory] = useState([])
  const [editingSequencePreview, setEditingSequencePreview] = useState(null)
  const [viewerSnapshot, setViewerSnapshot] = useState(null)
  const [viewerReport, setViewerReport] = useState(null)
  const [viewerPanelOrder, setViewerPanelOrder] = useState(null)
  const [viewerStatus, setViewerStatus] = useState('idle')
  const [viewerError, setViewerError] = useState('')
  const [primaryLensId, setPrimaryLensId] = useState('camera')
  const [miseWorkspace, setMiseWorkspace] = useState('scene')
  // 씬 기준은 스토어에 있다. 이 화면에서 고친 것이 곧 생성 기준이 된다 —
  // 로컬 state로 두면 프롬프트에 닿지 않는다.
  // 지금 보고 있는 씬의 기준. 씬마다 인물·공간이 다르고,
  // 어느 씬인지는 activeBeat에서 파생된다.
  const sceneState = useStore(selectActiveSceneState)
  const requestSeamDesign = useStore((s) => s.requestSeamDesign)
  const seamDesignPending = useStore((s) => s.seamDesignPending)
  const seamDesignError = useStore((s) => s.seamDesignError)
  const seamProposals = useStore((s) => s.seamProposals)
  const acceptSeamProposal = useStore((s) => s.acceptSeamProposal)
  const rejectSeamProposal = useStore((s) => s.rejectSeamProposal)
  const updateSceneCharacter = useStore((s) => s.updateSceneCharacter)
  const addFactChange = useStore((s) => s.addFactChange)
  const setSpatialElements = useStore((s) => s.setSpatialElements)
  const spatialElements = useStore((s) => s.spatialElements)
  const spatialLayoutsByStage = useStore((s) => s.spatialLayoutsByStage)
  const setSpatialLayoutForStage = useStore((s) => s.setSpatialLayoutForStage)
  const requestSpaceLayout = useStore((s) => s.requestSpaceLayout)
  const spaceLayoutPending = useStore((s) => s.spaceLayoutPending)
  const spaceLayoutError = useStore((s) => s.spaceLayoutError)
  const spaceLayoutNote = useStore((s) => s.spaceLayoutNote)
  const requestReferenceImage = useStore((s) => s.requestReferenceImage)
  const setReferencePrompt = useStore((s) => s.setReferencePrompt)
  const referenceImagePending = useStore((s) => s.referenceImagePending)
  const referenceImageError = useStore((s) => s.referenceImageError)
  // 항목 값에서 조립한 문장. 사용자가 고쳤으면 그것을 보여준다.
  const referencePromptOf = (subject, kind = 'character') => (
    subject?.promptOverride ?? buildReferencePrompt(subject, kind).auto
  )
  const removeFactChange = useStore((s) => s.removeFactChange)
  // 어느 컷부터 무엇으로 바뀌는지 입력받는 중.
  const [changeDraft, setChangeDraft] = useState(null)
  const miseCharacters = sceneState.characters
  const [editingCharacterId, setEditingCharacterId] = useState(null)
  const [characterDraft, setCharacterDraft] = useState(null)
  const [spatialEditorOpen, setSpatialEditorOpen] = useState(false)
  const [activeSpatialStageId, setActiveSpatialStageId] = useState(null)
  const [spatialEditorVersion, setSpatialEditorVersion] = useState(0)
  const [selectedStagingMoveIds, setSelectedStagingMoveIds] = useState([])
  const [selectedEditingOperationIds, setSelectedEditingOperationIds] = useState([])
  const [miseSpatialElements, setMiseSpatialElements] = useState(() => (
    MOCK_MISE_SPATIAL_ELEMENTS.map((element) => ({
      ...element,
      waypoints: element.waypoints?.map((waypoint) => ({ ...waypoint })),
    }))
  ))
  const [scopeMode, setScopeMode] = useState('single')
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd, setRangeEnd] = useState(0)
  const [selectedReadingConditionIds, setSelectedReadingConditionIds] = useState(['first_viewer'])
  const [activeReadingConditionId, setActiveReadingConditionId] = useState('first_viewer')
  const [customReadingConditions, setCustomReadingConditions] = useState([])
  const [customReadingConditionDraft, setCustomReadingConditionDraft] = useState({ label: '', instruction: '' })
  const [lensIntents, setLensIntents] = useState(() => (
    CREATIVE_LENSES.reduce((acc, lens) => ({ ...acc, [lens.id]: '' }), {})
  ))
  const [appliedLensIntents, setAppliedLensIntents] = useState({})
  const [lensReviewRuns, setLensReviewRuns] = useState({})
  const screenplay = useStore((s) => s.screenplay)
  const cutPlan = useStore((s) => s.cutPlan)
  const scenes = useStore((s) => s.scenes)
  const activeScene = useStore((s) => s.activeScene)
  const sceneIntention = useStore((s) => s.sceneIntention)
  const setFlowActiveShot = useStore((s) => s.setFlowActiveShot)
  const setFlowView = useStore((s) => s.setFlowView)
  const updateFlowShotById = useStore((s) => s.updateFlowShotById)
  const requestPanelTool = useStore((s) => s.requestPanelTool)
  const requestSeamFocus = useStore((s) => s.requestSeamFocus)
  const requestNarrativeSuggestions = useStore((s) => s.requestNarrativeSuggestions)
  const openDrawingWorkspace = useStore((s) => s.openDrawingWorkspace)
  const reopenCutPlan = useStore((s) => s.reopenCutPlan)
  const backToScript = useStore((s) => s.backToScript)
  const setActiveBeat = useStore((s) => s.setActiveBeat)
  const setMaximizedPanel = useStore((s) => s.setMaximizedPanel)
  const setLeftPanelVisible = useStore((s) => s.setLeftPanelVisible)
  const setZenMode = useStore((s) => s.setZenMode)
  const viewerFindingHandoff = useStore((s) => s.viewerFindingHandoff)
  const setViewerFindingHandoff = useStore((s) => s.setViewerFindingHandoff)
  const clearViewerFindingHandoff = useStore((s) => s.clearViewerFindingHandoff)
  const viewerDecisions = useStore((s) => s.viewerDecisions)
  const saveViewerDecision = useStore((s) => s.saveViewerDecision)
  const scene = scenes[activeScene]
  const activeShot = scene?.activeShot ?? 0
  const activeBranch = scene?.activeBranch ?? 0
  const branch = scene?.branches?.[activeBranch]
  const shots = branch?.shots || []
  const spatialStages = useMemo(
    () => spatialStagesFor(sceneState, shots, scene?.id),
    [scene?.id, sceneState, shots],
  )
  const scriptScenes = useMemo(() => selectScenes(screenplay), [screenplay])
  const scopeFrom = Math.min(rangeStart, rangeEnd)
  const scopeTo = Math.max(rangeStart, rangeEnd)
  const scope = scopeMode === 'range'
    ? { mode: 'range', from: scopeFrom, to: scopeTo, shotIds: shots.slice(scopeFrom, scopeTo + 1).map((shot) => shot.id) }
    : { mode: 'single', shot: activeShot, shotIds: shots[activeShot]?.id ? [shots[activeShot].id] : [] }

  const allOptions = [...MOCK_OPTIONS, ...MOCK_CAMERA_RANGE_OPTIONS]
  const availableRelations = MOCK_RELATIONS
  const selectedOption = allOptions.find((option) => option.id === selectedOptionId) || allOptions[0]
  const scopedCameraShots = shots
    .slice(scopeFrom, scopeTo + 1)
    .map((shot, index) => getMockCameraShot(shot, scopeFrom + index))
  const firstScopedCameraShot = scopedCameraShots[0]
  const lastScopedCameraShot = scopedCameraShots[scopedCameraShots.length - 1]
  const cameraRangeObservation = firstScopedCameraShot && lastScopedCameraShot
    ? `${firstScopedCameraShot.shotSize}에서 ${lastScopedCameraShot.shotSize}까지 ${scopedCameraShots.length}개 샷이 이어집니다.`
    : '선택된 촬영 범위가 없습니다.'
  const cameraRangeInterpretation = firstScopedCameraShot && lastScopedCameraShot
    ? `${firstScopedCameraShot.role}에서 ${lastScopedCameraShot.role}(으)로 시각적 중심이 이동합니다. 이 흐름을 유지하거나 더 분명한 진행으로 재구성할 수 있습니다.`
    : '분석할 패널 범위를 선택해주세요.'
  const currentMiseStaging = getMockMiseShotStaging(activeShot)
  const currentMiseStagingMoves = getMockMiseStagingMoves(activeShot)
  const currentEditingSingle = getMockEditingSingle(activeShot)
  const currentEditingSuggestions = [
    ...currentEditingSingle.operations,
    ...getMockEditingBoundaries(activeShot, shots.length),
  ]
  const currentShot = shots[activeShot]
  const multiReviewScopeKey = scopeMode === 'range'
    ? `${scene?.id || activeScene}:range:${scopeFrom}-${scopeTo}`
    : `${scene?.id || activeScene}:shot:${currentShot?.id || activeShot}`
  // 검토한 패널의 지문. 그림이나 샷이 바뀌면 이 값이 달라진다.
  // 분석 결과에 함께 저장해 두고, 다를 때 '지난 결과'로 표시한다 —
  // 고치러 갔다 오면 옛 분석이 최신인 것처럼 남아 있으면 안 된다.
  const scopeFingerprint = useMemo(() => {
    const entries = scopeMode === 'range'
      ? shots.slice(scopeFrom, scopeTo + 1)
      : currentShot ? [currentShot] : []
    return entries
      .map((shot) => `${shot.id}:${shot.image ? shot.image.length : 0}:${shot.cir?.shotSize || ''}`)
      .join('|')
  }, [scopeMode, shots, scopeFrom, scopeTo, currentShot])

  const multiReviewIntent = multiReviewIntents[multiReviewScopeKey] || ''
  const multiReviewIntentDraft = multiReviewIntentDrafts[multiReviewScopeKey]
    ?? multiReviewIntent
  const multiReviewIntentDirty = multiReviewIntentDraft.trim() !== multiReviewIntent.trim()
  const multiReviewRun = multiReviewRuns[multiReviewScopeKey] || { status: 'idle' }
  const multiReviewLoading = multiReviewRun.status === 'loading'
  const multiReviewHasResult = ['ready', 'stale'].includes(multiReviewRun.status)
  // 관계는 세 종류다. 합의는 맨 위에 한 번, 나머지는 아래에 나열한다.
  const multiFindings = multiReviewRun.commonFindings || []
  const multiAgreement = multiFindings.find((item) => item.type === 'agreement')
  const multiRelations = multiFindings.filter((item) => item.type !== 'agreement')
  // 관계가 없는 이유가 둘이다. 진단이 아예 없으면 볼 것이 없었던 것이고,
  // 진단은 있는데 관계가 없으면 서로 무관한 것이다.
  const multiHasDiagnosis = Object.values(multiReviewRun.lensResults || {})
    .some((result) => (result.diagnoses || []).length > 0)
  const multiScopeLabel = scopeMode === 'range'
    ? `S${scopeFrom + 1}–S${scopeTo + 1}`
    : `S${activeShot + 1}`
  // 관계가 하나뿐이면 '먼저 볼 곳'이 그 관계를 되풀이한다. 여럿일 때만
  // 종합하는 의미가 생긴다.
  const showOrder = Boolean(multiReviewRun.order) && multiFindings.length !== 1
  const cameraPreviewOption = allOptions.find((option) => option.id === cameraPreview?.optionId)
  const cameraPreviewShot = shots.find((shot) => shot.id === cameraPreview?.shotId)
  const cameraPreviewShotIndex = shots.findIndex((shot) => shot.id === cameraPreview?.shotId)
  const storyboardShotPreview = cameraPreviewOption?.mockShotChange && cameraPreviewShot
    ? {
        shotId: cameraPreviewShot.id,
        optionId: cameraPreviewOption.id,
        title: cameraPreviewOption.title,
        image: cameraPreviewOption.mockShotChange.image,
        cir: {
          ...(cameraPreviewShot.cir || {}),
          ...cameraPreviewOption.mockShotChange.cir,
        },
      }
    : null
  const lastCameraApply = cameraApplyHistory[cameraApplyHistory.length - 1] || null

  // Narrative 아래의 세 관점만 Creative Lens lane으로 렌더한다.
  // 현재 option 내용은 모두 prototype MOCK_OPTIONS이다.
  const optionsByLens = useMemo(() => {
    return CREATIVE_LENSES.map((lens) => ({
      ...lens,
      options: MOCK_OPTIONS.filter((option) => option.lensId === lens.id),
    }))
  }, [])

  const primaryLens = optionsByLens.find((lens) => lens.id === primaryLensId) || optionsByLens[0]
  const lensReviewKey = `${multiReviewScopeKey}:${primaryLens.id}${primaryLens.id === 'staging' ? `:${miseWorkspace}` : ''}`
  const lensIntentDraft = lensIntents[primaryLens.id] || ''
  const appliedLensIntent = appliedLensIntents[lensReviewKey] || ''
  const lensIntentDirty = lensIntentDraft.trim() !== appliedLensIntent.trim()
  const lensReviewRun = lensReviewRuns[lensReviewKey] || { status: 'idle' }
  const lensReviewLoading = lensReviewRun.status === 'loading'
  const lensReviewHasResult = ['ready', 'stale'].includes(lensReviewRun.status)
  // 검토한 뒤 패널이 바뀌었으면 이 결과는 지난 것이다.
  const lensReviewOutdated = lensReviewHasResult
    && Boolean(lensReviewRun.fingerprint)
    && lensReviewRun.fingerprint !== scopeFingerprint
  const multiReviewOutdated = multiReviewHasResult
    && Boolean(multiReviewRun.fingerprint)
    && multiReviewRun.fingerprint !== scopeFingerprint
  const lensAnalysisEnabled = primaryLens.id !== 'staging' || miseWorkspace === 'shot'

  const connectedRelations = availableRelations.filter(
    (relation) => relation.from === selectedOption.id || relation.to === selectedOption.id
  )

  const updateLensIntent = (lensId, value) => {
    setLensIntents((prev) => ({ ...prev, [lensId]: value }))
  }

  const addViewerFindingToLensRequest = () => {
    if (!viewerFindingHandoff) return
    const interpretation = viewerFindingHandoff.interpretations?.join(' / ') || '관객 해석을 확인하기 어렵습니다.'
    const cues = viewerFindingHandoff.visibleCues?.join(', ') || '화면 근거 없음'
    const panelLabel = (viewerFindingHandoff.panelOrders || [viewerFindingHandoff.panelOrder])
      .map((panelOrder) => `S${panelOrder}`)
      .join(' · ')
    updateLensIntent(
      primaryLens.id,
      `의도 비공개 관객 관점 ${panelLabel}: ${interpretation}\n화면 근거: ${cues}\n이 읽힘이 생기는 이유와 조정할 방법을 검토해줘.`,
    )
  }

  const submitLensIntent = (lensId) => {
    if (lensId !== primaryLens.id || !lensIntentDirty || lensReviewLoading) return
    const normalizedIntent = lensIntentDraft.trim()
    setAppliedLensIntents((current) => ({
      ...current,
      [lensReviewKey]: normalizedIntent,
    }))
    setLensIntents((current) => ({ ...current, [lensId]: normalizedIntent }))
    setLensReviewRuns((current) => {
      const previous = current[lensReviewKey]
      if (!previous || previous.status === 'idle') return current
      return {
        ...current,
        [lensReviewKey]: { ...previous, status: 'stale' },
      }
    })
  }

  // 지금 검토 범위의 패널. 단일 렌즈와 다관점이 같은 것을 보내야 한다.
  const selectedShotEntriesOf = () => (scopeMode === 'range'
    ? shots.slice(scopeFrom, scopeTo + 1).map((shot, offset) => ({
      shot,
      shotIndex: scopeFrom + offset,
    }))
    : currentShot
      ? [{ shot: currentShot, shotIndex: activeShot }]
      : [])

  // 패널을 API가 받는 모양으로 만든다. 이미지 로딩이 있어 async다.
  const buildReviewPanels = async (entries) => {
    const images = await Promise.all(
      entries.map(({ shot }) => loadViewerPanelImage(shot.image)),
    )
    return entries.map(({ shot, shotIndex }, index) => {
      const beat = shot.scriptBeat ?? 0
      const cut = cutPlan.find((item) => item.id === shot.cutPlanItemId)
      const beatContext = screenplay
        .filter((element) => element.type === 'action' && (element.beat ?? 0) === beat)
        .map((element) => element.text)
        .join(' ')
      const scriptScene = sceneOfBeat(scriptScenes, beat)
      const directingNotes = [
        shot.note ? `메모: ${shot.note}` : '',
        ...(shot.arrows || [])
          .filter((arrow) => arrow.channel === 'camera-move')
          .map((arrow) => (
            `카메라가 이동하거나 회전해 향하는 방향 ${arrow.label || arrow.kind || '미지정'}: `
            + `(${Number(arrow.x1).toFixed(2)}, ${Number(arrow.y1).toFixed(2)}) → `
            + `(${Number(arrow.x2).toFixed(2)}, ${Number(arrow.y2).toFixed(2)})`
          )),
      ].filter(Boolean).join('\n')

      return {
        id: `S${shotIndex + 1}`,
        image: images[index],
        context: cut?.content || beatContext || shot.label || '',
        directing_notes: directingNotes || null,
        scene_id: scriptScene?.id || scene?.id || null,
      }
    })
  }

  const runLensReview = async () => {
    logEvent('review', { mode: 'single' })
    logScaffold({ feature: 'lens', action: 'open', mode: 'single' })
    if (!lensAnalysisEnabled || lensIntentDirty || lensReviewLoading) return
    const reviewKey = lensReviewKey
    const requestId = Date.now()
    const selectedShotEntries = selectedShotEntriesOf()

    if (selectedShotEntries.length === 0) {
      setLensReviewRuns((current) => ({
        ...current,
        [reviewKey]: { status: 'error', error: '분석할 패널을 선택해주세요.' },
      }))
      return
    }

    if (selectedShotEntries.some(({ shot }) => !shot.image)) {
      setLensReviewRuns((current) => ({
        ...current,
        [reviewKey]: {
          status: 'error',
          error: '선택 범위의 모든 패널에 이미지가 있어야 합니다.',
        },
      }))
      return
    }

    setLensReviewRuns((current) => ({
      ...current,
      [reviewKey]: {
        status: 'loading',
        requestId,
        intent: appliedLensIntent,
      },
    }))

    try {
      const panels = await buildReviewPanels(selectedShotEntries)
      const backendLens = primaryLens.id === 'staging' ? 'mise' : primaryLens.id
      const response = await requestDirectingReview({
        mode: backendLens,
        panels,
        intent: appliedLensIntent,
      })
      const result = response.lens_results?.[backendLens]
      if (!result) throw new Error('분석 결과 형식이 올바르지 않습니다.')

      setLensReviewRuns((current) => {
        if (current[reviewKey]?.requestId !== requestId) return current
        return {
          ...current,
          [reviewKey]: {
            status: 'ready',
            requestId,
            intent: appliedLensIntent,
            fingerprint: scopeFingerprint,
            result,
            questions: response.questions || [],
          },
        }
      })
    } catch (error) {
      setLensReviewRuns((current) => {
        if (current[reviewKey]?.requestId !== requestId) return current
        return {
          ...current,
          [reviewKey]: {
            status: 'error',
            requestId,
            intent: appliedLensIntent,
            error: error.message || '연출 분석을 불러오지 못했습니다.',
          },
        }
      })
    }
  }

  const submitMultiReviewIntent = () => {
    if (!multiReviewIntentDirty || multiReviewLoading) return
    const normalizedIntent = multiReviewIntentDraft.trim()
    setMultiReviewIntents((current) => ({
      ...current,
      [multiReviewScopeKey]: normalizedIntent,
    }))
    setMultiReviewIntentDrafts((current) => ({
      ...current,
      [multiReviewScopeKey]: normalizedIntent,
    }))
    setMultiReviewRuns((current) => {
      const previous = current[multiReviewScopeKey]
      if (!previous || previous.status === 'idle') return current
      return {
        ...current,
        [multiReviewScopeKey]: { ...previous, status: 'stale' },
      }
    })
  }

  const runMultiReview = async () => {
    logEvent('review', { mode: 'multi' })
    logScaffold({ feature: 'lens', action: 'open', mode: 'multi' })
    if (multiReviewIntentDirty || multiReviewLoading) return
    const scopeKey = multiReviewScopeKey
    const requestId = Date.now()
    const entries = selectedShotEntriesOf()

    if (entries.length === 0 || entries.some(({ shot }) => !shot.image)) {
      setMultiReviewRuns((current) => ({
        ...current,
        [scopeKey]: {
          status: 'error',
          requestId,
          error: entries.length === 0
            ? '분석할 패널을 선택해주세요.'
            : '선택 범위의 모든 패널에 이미지가 있어야 합니다.',
        },
      }))
      return
    }

    setMultiReviewRuns((current) => ({
      ...current,
      [scopeKey]: { status: 'loading', requestId, intent: multiReviewIntent },
    }))

    try {
      const panels = await buildReviewPanels(entries)
      // 이미 판정한 관계는 함께 보낸다. 감독이 정리한 것을 AI가 또 짚으면
      // 판정한 의미가 없다.
      const settled = (multiReviewRun.commonFindings || [])
        .map((relation) => {
          const verdict = relationVerdicts[relationKey(relation)]
          if (!verdict) return null
          const option = verdictOptionsFor(relation)
            .find((item) => item.id === verdict)
          return {
            diagnosis_ids: relation.diagnosis_ids,
            summary: relation.summary,
            verdict: option?.label || verdict,
          }
        })
        .filter(Boolean)

      // 세 렌즈를 각자 돌리고 그 사이의 관계까지 서버가 함께 돌려준다.
      const response = await requestDirectingReview({
        mode: 'multi',
        panels,
        intent: multiReviewIntent,
        settled,
      })
      setMultiReviewRuns((current) => {
        // 도중에 다시 눌렀으면 늦게 온 응답은 버린다.
        if (current[scopeKey]?.requestId !== requestId) return current
        return {
          ...current,
          [scopeKey]: {
            status: 'ready',
            requestId,
            intent: multiReviewIntent,
            fingerprint: scopeFingerprint,
            lensResults: response.lens_results || {},
            commonFindings: response.common_findings || [],
            order: response.order || null,
            questions: response.questions || [],
          },
        }
      })

      // 같은 패널을 렌즈 탭에서 또 분석하지 않게 결과를 심어 둔다.
      // '촬영에서 이어서 보기'로 갔을 때 이미 분석된 상태로 열린다.
      setLensReviewRuns((current) => {
        const next = { ...current }
        MULTI_LENS_ORDER.forEach(({ backendId, lensId }) => {
          const result = response.lens_results?.[backendId]
          if (!result) return
          // 미장센은 shot 작업대에서만 분석한다 (lensReviewKey와 같은 규칙).
          const key = `${scopeKey}:${lensId}${lensId === 'staging' ? ':shot' : ''}`
          next[key] = {
            status: 'ready',
            requestId,
            intent: multiReviewIntent,
            fingerprint: scopeFingerprint,
            result,
            questions: (response.questions || [])
              .filter((question) => question.lenses?.includes(backendId)),
          }
        })
        return next
      })
    } catch (error) {
      setMultiReviewRuns((current) => {
        if (current[scopeKey]?.requestId !== requestId) return current
        return {
          ...current,
          [scopeKey]: { status: 'error', requestId, error: error.message },
        }
      })
    }
  }

  // 관계는 따로 부른다. 렌즈 셋만 50초, 관계까지 하면 70초라 결과를
  // 보기까지 너무 오래 기다린다.
  const runRelateReview = async () => {
    logEvent('review', { mode: 'relate' })
    logScaffold({ feature: 'cross_lens', action: 'open', mode: 'relate' })
    const scopeKey = multiReviewScopeKey
    const run = multiReviewRuns[scopeKey]
    if (!run?.lensResults || run.relating) return

    setMultiReviewRuns((current) => ({
      ...current,
      [scopeKey]: { ...current[scopeKey], relating: true, relateError: null },
    }))

    try {
      const settled = (run.commonFindings || [])
        .map((relation) => {
          const verdict = relationVerdicts[relationKey(relation)]
          if (!verdict) return null
          const option = verdictOptionsFor(relation).find((item) => item.id === verdict)
          return {
            diagnosis_ids: relation.diagnosis_ids,
            summary: relation.summary,
            verdict: option?.label || verdict,
          }
        })
        .filter(Boolean)

      const response = await requestDirectingReview({
        mode: 'relate',
        // 이미지는 안 보낸다. 판단만 보고 관계를 찾는다.
        panels: [{ id: 'S1', image: '' }],
        intent: multiReviewIntent,
        settled,
        lensResults: run.lensResults,
      })
      setMultiReviewRuns((current) => ({
        ...current,
        [scopeKey]: {
          ...current[scopeKey],
          relating: false,
          commonFindings: response.common_findings || [],
          order: response.order || null,
          related: true,
        },
      }))
    } catch (error) {
      setMultiReviewRuns((current) => ({
        ...current,
        [scopeKey]: { ...current[scopeKey], relating: false, relateError: error.message },
      }))
    }
  }

  const choosePrimaryLens = (lensId) => {
    setPrimaryLensId(lensId)
    if (lensId !== 'camera') setCameraPreview(null)
    if (lensId !== 'editing') setEditingSequencePreview(null)
  }

  const openCharacterDetails = (character) => {
    setEditingCharacterId(character.id)
    setCharacterDraft({
      ...character,
      facts: character.facts.map((fact) => ({ ...fact })),
    })
  }

  const closeCharacterDetails = () => {
    setEditingCharacterId(null)
    setCharacterDraft(null)
  }

  const updateCharacterDraft = (field, value) => {
    setCharacterDraft((current) => current ? { ...current, [field]: value } : current)
  }

  const updateCharacterFactDraft = (label, value) => {
    setCharacterDraft((current) => current ? {
      ...current,
      facts: current.facts.map((fact) => (
        fact.label === label ? { ...fact, value } : fact
      )),
    } : current)
  }

  const updateCharacterImageDraft = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => updateCharacterDraft('image', reader.result)
    reader.readAsDataURL(file)
  }

  const saveCharacterDetails = () => {
    if (!characterDraft) return
    updateSceneCharacter(characterDraft.id, {
      ...characterDraft,
      facts: characterDraft.facts.map((fact) => ({ ...fact })),
    })
    closeCharacterDetails()
  }

  const spatialLayoutForStage = useCallback((stageId) => {
    const stageIndex = spatialStages.findIndex((stage) => stage.id === stageId)
    // 새 단계는 직전 단계의 배치를 출발점으로 쓴다. 그래서 "변화"가
    // 완전히 새 도면을 만드는 일이 아니라, 필요한 부분만 움직이는 일이 된다.
    for (let index = stageIndex; index >= 0; index -= 1) {
      const saved = spatialLayoutsByStage[spatialStages[index]?.id]
      if (saved?.length) return saved
    }
    return spatialElements.length > 0 ? spatialElements : miseSpatialElements
  }, [miseSpatialElements, spatialElements, spatialLayoutsByStage, spatialStages])

  const selectSpatialStage = useCallback((stageId) => {
    const nextElements = cloneSpatialElements(spatialLayoutForStage(stageId))
    setActiveSpatialStageId(stageId)
    setMiseSpatialElements(nextElements)
    // 기존 생성 흐름도 현재 선택한 단계의 도면을 기준으로 삼는다.
    setSpatialElements(nextElements)
    // SpatialMap은 초기 도면을 내부 state로 관리하므로, 단계 전환 때만 새로 연다.
    setSpatialEditorVersion((version) => version + 1)
  }, [setSpatialElements, spatialLayoutForStage])

  const updateMiseSpatialElements = useCallback((elements) => {
    const nextElements = cloneSpatialElements(elements)
    setMiseSpatialElements(nextElements)
    // 스토어에도 올린다. 패널 생성이 이 배치를 프롬프트로 옮겨 쓴다.
    setSpatialElements(nextElements)
    if (activeSpatialStageId) setSpatialLayoutForStage(activeSpatialStageId, nextElements)
  }, [activeSpatialStageId, setSpatialElements, setSpatialLayoutForStage])

  const openSpatialEditor = () => {
    const currentStage = [...spatialStages]
      .reverse()
      .find((stage) => stage.start <= activeShot) || spatialStages[0]
    if (currentStage) selectSpatialStage(currentStage.id)
    setSpatialEditorOpen(true)
  }

  const proposeSpatialLayout = async () => {
    await requestSpaceLayout()
    // AI 제안은 스토어에 한 번 기록된 뒤, 여기서만 캔버스에 명시적으로 반영한다.
    // 캔버스 자신의 변경을 제안으로 되받지 않아 렌더 루프가 생기지 않는다.
    const proposed = useStore.getState().spatialElements
    if (proposed.length === 0) return

    const nextElements = cloneSpatialElements(proposed)
    setMiseSpatialElements(nextElements)
    if (activeSpatialStageId) setSpatialLayoutForStage(activeSpatialStageId, nextElements)
    setSpatialEditorVersion((version) => version + 1)
  }

  const selectScopeShot = (shotIdx) => {
    setViewerReport(null)
    setViewerPanelOrder(null)
    setViewerStatus('idle')
    setViewerError('')
    if (scopeMode === 'single') {
      setFlowActiveShot(shotIdx)
      setRangeStart(shotIdx)
      setRangeEnd(shotIdx)
      setEditingSequencePreview(null)
      return
    }

    if (rangeStart === rangeEnd) {
      setRangeEnd(shotIdx)
      return
    }

    const distanceToStart = Math.abs(shotIdx - rangeStart)
    const distanceToEnd = Math.abs(shotIdx - rangeEnd)
    if (distanceToStart <= distanceToEnd) {
      setRangeStart(shotIdx)
    } else {
      setRangeEnd(shotIdx)
    }
  }

  const switchScopeMode = (mode) => {
    setViewerReport(null)
    setViewerPanelOrder(null)
    setScopeMode(mode)
    if (mode === 'single') {
      setRangeStart(activeShot)
      setRangeEnd(activeShot)
    } else if (rangeStart === rangeEnd) {
      setRangeStart(Math.max(0, activeShot))
      setRangeEnd(Math.min(Math.max(shots.length - 1, 0), activeShot + 1))
    }
  }

  const toggleOptionSelection = (optionId) => {
    setSelectedOptionIds((prev) => (
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId]
    ))
  }

  const openOptionReview = (optionId) => {
    setSelectedOptionId(optionId)
    setReviewOpen(true)
  }

  const previewCameraOption = (option) => {
    if (!currentShot || scopeMode !== 'single' || !option.mockShotChange) return
    setReviewOpen(false)
    setSelectedOptionId(option.id)
    setCameraPreview({
      optionId: option.id,
      shotId: currentShot.id,
    })
    setFlowView('grid')
  }

  const applyCameraOption = (option) => {
    if (!currentShot || scopeMode !== 'single' || !option.mockShotChange) return

    const before = {
      image: currentShot.image ?? null,
      cir: { ...(currentShot.cir || {}) },
      source: currentShot.source,
      lensApplication: currentShot.lensApplication,
    }
    const after = {
      image: option.mockShotChange.image,
      cir: {
        ...(currentShot.cir || {}),
        ...option.mockShotChange.cir,
      },
      source: 'camera-lens',
      lensApplication: {
        lensId: 'camera',
        optionId: option.id,
        title: option.title,
      },
    }

    updateFlowShotById(currentShot.id, after)
    setCameraApplyHistory((history) => [
      ...history,
      {
        shotId: currentShot.id,
        shotNumber: activeShot + 1,
        optionId: option.id,
        title: option.title,
        before,
      },
    ])
    setCameraPreview(null)
  }

  const undoLastCameraApply = () => {
    if (!lastCameraApply) return
    updateFlowShotById(lastCameraApply.shotId, lastCameraApply.before)
    setCameraApplyHistory((history) => history.slice(0, -1))
    setCameraPreview(null)
  }

  const getOptionTitle = (optionId) => (
    allOptions.find((option) => option.id === optionId)?.title || 'Other option'
  )

  const openViewerReflection = () => {
    // DG3의 관객 관점은 한 장의 이미지를 평가하는 기능이 아니라, 장면이
    // 이어지며 어떻게 독해되는지를 보는 기능이다. 따라서 최소 두 패널의
    // 범위를 강제한다.
    if (shots.length < 2) return
    setCameraPreview(null)
    setReviewOpen(false)
    if (scopeMode !== 'range' || rangeStart === rangeEnd) {
      const start = activeShot >= shots.length - 1 ? Math.max(0, activeShot - 1) : activeShot
      setRangeStart(start)
      setRangeEnd(Math.min(shots.length - 1, start + 1))
    }
    setScopeMode('range')
    setViewerSnapshot({
      sceneId: scene?.id,
      sceneLabel: scene?.label || 'Current scene',
      shots: shots.map((shot, index) => ({
        id: shot.id,
        order: index + 1,
        label: shot.label || `Shot ${index + 1}`,
        image: shot.image ?? null,
        cir: { ...(shot.cir || {}) },
        scriptBeat: shot.scriptBeat ?? 0,
      })),
    })
    setViewerReport(null)
    setViewerPanelOrder(null)
  }

  const toggleReadingCondition = (conditionId) => {
    setSelectedReadingConditionIds((current) => {
      if (current.includes(conditionId)) {
        return current.length === 1 ? current : current.filter((id) => id !== conditionId)
      }
      if (current.length >= 3) return current
      return [...current, conditionId]
    })
  }

  const addCustomReadingCondition = () => {
    const label = customReadingConditionDraft.label.trim()
    const instruction = customReadingConditionDraft.instruction.trim()
    if (!label || !instruction || selectedReadingConditionIds.length >= 3) return
    const id = `custom_${Date.now().toString(36)}`
    setCustomReadingConditions((current) => [...current, { id, label, instruction }])
    setSelectedReadingConditionIds((current) => [...current, id])
    setCustomReadingConditionDraft({ label: '', instruction: '' })
  }

  const removeCustomReadingCondition = (conditionId) => {
    if (selectedReadingConditionIds.length === 1 && selectedReadingConditionIds[0] === conditionId) return
    setCustomReadingConditions((current) => current.filter((condition) => condition.id !== conditionId))
    setSelectedReadingConditionIds((current) => current.filter((id) => id !== conditionId))
  }

  const selectReviewMode = (mode) => {
    setReviewMode(mode)
    setReviewOpen(false)

    if (mode === 'viewer') {
      openViewerReflection()
      return
    }

    setViewerSnapshot(null)
    if (mode !== 'multi') choosePrimaryLens(mode)
  }

  const snapshotShots = viewerSnapshot?.shots || []
  const viewerScopeFrom = scopeMode === 'range' ? scopeFrom + 1 : activeShot + 1
  const viewerScopeTo = scopeMode === 'range' ? scopeTo + 1 : activeShot + 1
  const selectedSnapshotShots = snapshotShots.filter((shot) => (
    shot.order >= viewerScopeFrom && shot.order <= viewerScopeTo
  ))

  const runViewerReflection = async () => {
    if (selectedSnapshotShots.length < 2) {
      setViewerStatus('error')
      setViewerError('관객 관점은 두 컷 이상을 선택해야 합니다.')
      return
    }
    const renderedShots = selectedSnapshotShots.filter((shot) => Boolean(shot.image))
    if (renderedShots.length === 0) {
      setViewerStatus('error')
      setViewerError('읽을 수 있는 패널 이미지를 먼저 선택해주세요.')
      return
    }
    const panelOrders = renderedShots.map((shot) => shot.order)
    // 이 뒤에 오는 수정이 관객 읽기에서 나온 것인지 세려면 확인 시점이
    // 필요하다.
    logEvent('viewer_read', {
      panels: panelOrders.length,
      storyboard_version: storyboardVersion(renderedShots),
    })
    logScaffold({ feature: 'viewer', action: 'open', panels: panelOrders.length })
    setViewerStatus('loading')
    setViewerError('')
    try {
      // Only audience-visible rendered panels are sent. All storyboard metadata
      // (labels, CIR, intent, decisions) remains outside this request.
      const panelImages = await Promise.all(
        renderedShots.map((shot) => loadViewerPanelImage(shot.image)),
      )
      const result = await requestViewerReflection({
        panels: panelImages.map((image) => ({ image })),
        readingConditions: selectedReadingConditionIds.filter((id) => (
          VIEWER_READING_CONDITIONS.some((condition) => condition.id === id)
        )),
        customConditions: customReadingConditions.filter((condition) => (
          selectedReadingConditionIds.includes(condition.id)
        )),
      })
      const mapPanelOrder = (panelOrder) => panelOrders[panelOrder - 1] || panelOrder
      const remapReading = (reading) => ({
        ...reading,
        turning_point_panel_order: mapPanelOrder(reading.turning_point_panel_order),
        steps: reading.steps.map((step) => ({
          ...step,
          panel_order: mapPanelOrder(step.panel_order),
        })),
        interpretive_branches: (reading.interpretive_branches || []).map((branch) => ({
          ...branch,
          starts_at_panel: mapPanelOrder(branch.starts_at_panel),
        })),
        review_points: (reading.review_points || []).map((point) => ({
          ...point,
          panel_orders: point.panel_orders.map(mapPanelOrder),
        })),
      })
      const readings = (result.readings?.length
        ? result.readings
        : [{ condition_id: selectedReadingConditionIds[0], reading: result.initial_reading }]
      ).map((entry) => ({ ...entry, reading: remapReading(entry.reading) }))
      const comparison = result.comparison ? {
        ...result.comparison,
        divergences: (result.comparison.divergences || []).map((divergence) => ({
          ...divergence,
          panel_orders: divergence.panel_orders.map(mapPanelOrder),
        })),
      } : null
      // 무엇을 보고 말한 것인지 남긴다. 이후 수정이 이 읽기에 대한
      // 반응인지 판단하려면 읽은 스토리보드가 특정돼야 한다. 패널의
      // 이미지가 바뀌면 다른 버전이므로, 읽은 패널의 이미지로 버전을
      // 만든다.
      logEvent('viewer_result', {
        storyboard_version: storyboardVersion(renderedShots),
        divergences: (comparison?.divergences || []).map((divergence, index) => (
          divergence.id || `d${index + 1}`
        )),
      })
      setViewerReport({
        initial_reading: readings[0].reading,
        readings,
        comparison,
      })
      setActiveReadingConditionId(readings[0].condition_id)
      setViewerPanelOrder(panelOrders[0])
      setFlowActiveShot(panelOrders[0] - 1)
      setViewerStatus('ready')
    } catch (error) {
      setViewerStatus('error')
      setViewerError(error.message || '관객 관점 결과를 불러오지 못했습니다.')
    }
  }

  const selectViewerPanel = (panelOrder) => {
    setViewerPanelOrder(panelOrder)
    setFlowActiveShot(panelOrder - 1)
  }

  const moveViewerPanel = (direction) => {
    const index = selectedSnapshotShots.findIndex((shot) => shot.order === viewerPanelOrder)
    const next = selectedSnapshotShots[index + direction]
    if (next) selectViewerPanel(next.order)
  }

  const routeViewerFinding = (route, panelOrderOrOrders, finding = {}) => {
    // Viewer 확인이 실제 수정으로 이어졌는지를 재려면, 관객 읽기에서
    // 출발한 이동임을 표시해 두어야 한다.
    logEvent('route', { source: 'viewer', route, level: finding.level || null })
    const panelOrders = [...new Set(
      (Array.isArray(panelOrderOrOrders) ? panelOrderOrOrders : [panelOrderOrOrders])
        .filter((panelOrder) => Number.isInteger(panelOrder) && panelOrder > 0 && panelOrder <= shots.length),
    )].sort((left, right) => left - right)
    const targetShot = (panelOrders[0] || activeShot + 1) - 1
    const rangeEndShot = (panelOrders[panelOrders.length - 1] || targetShot + 1) - 1
    const scope = panelOrders.length > 1 ? 'range' : 'single'
    const target = shots[targetShot]
    setFlowActiveShot(targetShot)
    setViewerFindingHandoff({
      id: `${Date.now()}-${route}-${targetShot}`,
      route,
      panelOrder: targetShot + 1,
      panelOrders: panelOrders.length ? panelOrders : [targetShot + 1],
      scope,
      shotId: target?.id || null,
      beat: target?.scriptBeat ?? 0,
      title: finding.title || '관객 관점에서 가져온 해석',
      interpretations: finding.interpretations || [],
      visibleCues: finding.visibleCues || [],
      uncertainties: finding.uncertainties || [],
      routeReason: finding.routeReason || '',
    })
    setViewerSnapshot(null)

    if (route === 'narrative') {
      backToScript()
      setLeftPanelVisible(true)
      setMaximizedPanel('left')
      setZenMode(false)
      return
    }

    const lensForRoute = { mise: 'staging', camera: 'camera', editing: 'editing' }[route]
    if (lensForRoute) {
      if (lensForRoute === 'staging') setMiseWorkspace('shot')
      setReviewOpen(false)
      setReviewMode(lensForRoute)
      choosePrimaryLens(lensForRoute)
      // choosePrimaryLens가 범위를 현재 컷으로 초기화하므로,
      // Viewer에서 지목한 단일 컷 또는 연속 범위를 마지막에 다시 확정한다.
      setScopeMode(scope)
      setRangeStart(targetShot)
      setRangeEnd(rangeEndShot)
    }
  }

  const updateViewerDecision = (decisionId, changes) => {
    // Difference != Error. 세 판정의 분포가 관객 관점 검토의 결과다.
    if (changes.verdict) {
      logEvent('verdict', { target: decisionId, verdict: changes.verdict })
    }
    saveViewerDecision(decisionId, changes)
  }

  const routeDiagnosisTool = (tool, diagnosis) => {
    // 진단에서 고칠 자리로 보낸 것. 아직 수정은 아니므로 edit이 아니다.
    logEvent('route', {
      source: 'diagnosis',
      route: tool,
      lens: diagnosis.lens || null,
      level: normalizeLevel(diagnosis.level),
    })
    // 진단대로 고치러 갔다는 것은 그 진단을 받아들였다는 뜻이다.
    logScaffold({
      feature: 'diagnosis',
      action: 'accept',
      target: diagnosis.id || null,
      lens: diagnosis.lens || null,
    })
    const panelTarget = diagnosis.targets
      .map((target) => target.split('.', 1)[0])
      .find((target) => /^S\d+$/.test(target))
    const targetShotIndex = panelTarget
      ? Number(panelTarget.slice(1)) - 1
      : activeShot
    const targetShot = shots[targetShotIndex]
    if (!targetShot) return

    setFlowActiveShot(targetShotIndex)
    setZenMode(false)

    // Panels에서 그 패널을 열어 고치는 것들.
    if (tool === 'arrow' || tool === 'camera-arrow' || tool === 'memo' || tool === 'prompt') {
      requestPanelTool(targetShot.id, tool === 'arrow' ? 'camera-arrow' : tool, {
        text: tool === 'memo' ? diagnosis.suggested_action : '',
        diagnosisId: diagnosis.id,
      })
      setLeftPanelVisible(true)
      setMaximizedPanel('left')
      return
    }

    // 그림을 직접 고친다.
    if (tool === 'draw') {
      openDrawingWorkspace()
      return
    }

    // 배치 문제는 컷 플랜 표에 고칠 것이 없다. 2D 구조도로 보낸다.
    if (tool === 'layout') {
      openSpatialEditor()
      return
    }

    // 편집 문제는 컷 사이에 있다. 이 화면의 그리드에서 그 이음새를 연다 —
    // 그림을 다 그려 놓고 텍스트 단계로 되돌아갈 이유가 없다.
    // 화면을 옮기지 않고 서사에게 묻는다. 컷을 고쳐서 될 일이 아니라
    // 대본에 없는 단계가 빠진 경우다 — 제안은 대본 자리에 뜬다.
    if (tool === 'narrative' || tool === 'script') {
      const beat = targetShot.scriptBeat ?? 0
      // 어느 렌즈가 지적했는지 밝힌다. 서사 자신의 진단을 '편집 검토에서'라고
      // 넘기면 서사가 자기 지적을 남의 것으로 받는다.
      const from = { narrative: '서사', mise: '미장센', camera: '촬영', editing: '편집' }
      requestNarrativeSuggestions({
        beat,
        narrativeRequest: (
          `${from[diagnosis.lens] || '연출'} 검토에서 이런 지적이 나왔습니다: ${diagnosis.diagnosis}\n`
          + `${diagnosis.suggested_action}\n`
          + '이 Beat의 대본에서 무엇을 더하거나 고치면 되는지 제안해 주세요.'
        ),
      })
      // 제안은 대본 자리에 뜬다. 대본이 보여야 판정할 수 있다.
      setActiveBeat(beat)
      backToScript()
      setLeftPanelVisible(true)
      setMaximizedPanel('left')
      return
    }

    if (tool === 'seam' || tool === 'merge' || tool === 'split') {
      // 이음새는 앞 컷에 붙는다. 합치기도 앞 컷 기준이다.
      // 나누기는 그 컷 자체를 쪼개므로 대상 컷을 그대로 쓴다.
      const anchorIndex = tool === 'split'
        ? targetShotIndex
        : Math.max(0, targetShotIndex - 1)
      const seamShot = shots[anchorIndex]
      if (seamShot) requestSeamFocus(seamShot.id, tool === 'seam' ? null : tool)
      return
    }

    // 컷 구성·컷 관계·씬 구조 문제는 그림 한 장을 고치는 곳으로 보내지 않는다.
    reopenCutPlan()
    setLeftPanelVisible(true)
    setMaximizedPanel('left')
  }

  const viewerReadings = viewerReport?.readings || []
  const activeViewerEntry = viewerReadings.find((entry) => (
    entry.condition_id === activeReadingConditionId
  )) || viewerReadings[0] || null
  const activeViewerReading = activeViewerEntry?.reading || viewerReport?.initial_reading || null
  const allViewerReadingConditions = [...VIEWER_READING_CONDITIONS, ...customReadingConditions]
  const activeViewerCondition = allViewerReadingConditions.find((condition) => (
    condition.id === activeViewerEntry?.condition_id
  ))
  const viewerDecisionScope = `${scene?.id || activeScene}:${branch?.id || activeBranch}`
  const viewerDecisionItems = viewerReport?.comparison?.divergences?.map((divergence) => ({
    id: `${viewerDecisionScope}:divergence:${divergence.panel_orders.join('-')}:${divergence.issue_kind}:${divergence.suspected_cause}`,
    panelOrders: divergence.panel_orders,
    evidence: divergence.shared_cues,
    interpretations: divergence.readings.map((item) => item.reading),
    routes: divergence.routes || [],
  })) || (activeViewerReading?.review_points || []).map((point) => ({
    id: `${viewerDecisionScope}:review:${point.panel_orders.join('-')}:${point.issue_kind}:${point.suspected_cause}`,
    panelOrders: point.panel_orders,
    evidence: [],
    interpretations: [point.issue, point.audience_effect],
    routes: point.routes || [],
  }))

  const viewerReflectionPane = viewerSnapshot ? (
    <div className="viewer-reflection-shell" aria-label="의도 비공개 관객 관점">
      <header className="viewer-reflection-heading">
        <div>
          <span>관객 관점</span>
          <h2>컷이 이어질수록 해석은 어떻게 바뀔까요?</h2>
          <p>제작 의도 없이 패널 흐름을 읽고, 해석이 바뀌는 지점을 찾습니다.</p>
        </div>
      </header>

      {!viewerReport ? (
        <section className="viewer-reflection-placeholder">
          <span>의도 비공개 · 관객 관점</span>
          <strong>선택한 마지막 컷까지 해석이 만들어지는 과정을 따라갑니다.</strong>
          <section className="viewer-reading-conditions" aria-label="읽기 조건 선택">
            <header>
              <div>
                <span>관객 시선</span>
                <strong>어떤 관객의 읽기를 함께 볼까요?</strong>
              </div>
              <small>각 시선은 실제 사람을 대표하지 않고, 화면에서 먼저 볼 것을 다르게 둡니다.</small>
            </header>
            <div className="viewer-reading-condition-grid">
              {allViewerReadingConditions.map((condition) => {
                const selected = selectedReadingConditionIds.includes(condition.id)
                const custom = !VIEWER_READING_CONDITIONS.some((item) => item.id === condition.id)
                return (
                  <div key={condition.id} className="viewer-reading-condition-card">
                    <button
                      type="button"
                      className={selected ? 'selected' : ''}
                      aria-pressed={selected}
                      onClick={() => toggleReadingCondition(condition.id)}
                    >
                      <span>{selected ? '✓' : '+'}</span>
                      <strong>{condition.title || condition.label}</strong>
                      <p><strong>먼저 보는 것</strong>{condition.attention || condition.instruction}</p>
                    </button>
                    {custom && (
                      <button
                        type="button"
                        className="viewer-custom-condition-remove"
                        aria-label={`${condition.label} 읽기 조건 삭제`}
                        onClick={() => removeCustomReadingCondition(condition.id)}
                      >×</button>
                    )}
                  </div>
                )
              })}
            </div>
            <details className="viewer-custom-condition-form">
              <summary>
                <span>＋</span>
                <div>
                  <strong>새 관객 시선 만들기</strong>
                  <small>이 관객이 화면에서 무엇을 먼저 볼지 정합니다.</small>
                </div>
                <em>직접 추가</em>
              </summary>
              <div className="viewer-custom-condition-fields">
                <label>
                  <span>관객 이름</span>
                  <input
                    value={customReadingConditionDraft.label}
                    onChange={(event) => setCustomReadingConditionDraft((current) => ({ ...current, label: event.target.value }))}
                    placeholder="예: 공간 관계를 꼼꼼히 보는 관객"
                    maxLength={60}
                  />
                </label>
                <label>
                  <span>먼저 보는 것</span>
                  <textarea
                    value={customReadingConditionDraft.instruction}
                    onChange={(event) => setCustomReadingConditionDraft((current) => ({ ...current, instruction: event.target.value }))}
                    placeholder="예: 인물·출입구·중요한 물체의 위치 관계가 이어지는지 살핀다."
                    maxLength={360}
                  />
                </label>
                <div className="viewer-custom-condition-actions">
                  {selectedReadingConditionIds.length >= 3 && <small>세 관객 시선을 모두 선택했어요. 하나를 해제하면 추가할 수 있습니다.</small>}
                  <button
                    type="button"
                    onClick={addCustomReadingCondition}
                    disabled={
                      !customReadingConditionDraft.label.trim()
                      || !customReadingConditionDraft.instruction.trim()
                      || selectedReadingConditionIds.length >= 3
                    }
                  >이 시선으로 읽기</button>
                </div>
              </div>
            </details>
          </section>
          {viewerError && <p className="viewer-error">{viewerError}</p>}
          <button type="button" className="viewer-run-button" onClick={runViewerReflection} disabled={viewerStatus === 'loading'}>
            {viewerStatus === 'loading' ? '읽는 중…' : '관객 관점 분석'}
          </button>
        </section>
      ) : (
        <section className="viewer-report" aria-live="polite">
          {viewerReadings.length > 1 && (
            <div className="viewer-reading-tabs" role="tablist" aria-label="읽기 조건 결과">
              {viewerReadings.map((entry) => {
                const condition = allViewerReadingConditions.find((item) => item.id === entry.condition_id)
                const active = entry.condition_id === activeViewerEntry?.condition_id
                return (
                  <button
                    key={entry.condition_id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={active ? 'active' : ''}
                    onClick={() => setActiveReadingConditionId(entry.condition_id)}
                  >
                    {condition?.title || condition?.label || entry.condition_id}
                  </button>
                )
              })}
            </div>
          )}
          <section className="viewer-whole-reading">
            <span>{activeViewerCondition ? `${activeViewerCondition.title || activeViewerCondition.label}의 흐름` : '새눈이가 따라간 흐름'}</span>
            <p>{activeViewerReading.summary}</p>
            <details>
              <summary>마지막에는 이렇게 이해했어</summary>
              <p>{activeViewerReading.final_hypothesis}</p>
              <small>{activeViewerReading.emotional_arc}</small>
            </details>
          </section>
          <div className="viewer-flow-controls">
            <span>패널과 함께 읽기</span>
            <div>
              <button type="button" onClick={() => moveViewerPanel(-1)} disabled={viewerPanelOrder === selectedSnapshotShots[0]?.order}>‹</button>
              <strong>S{viewerPanelOrder}</strong>
              <button type="button" onClick={() => moveViewerPanel(1)} disabled={viewerPanelOrder === selectedSnapshotShots[selectedSnapshotShots.length - 1]?.order}>›</button>
            </div>
          </div>
          <ViewerReadingCard reading={activeViewerReading} activePanelOrder={viewerPanelOrder} onRoute={routeViewerFinding} />
          {(activeViewerReading.interpretive_branches || []).length > 0 && (
            <section className="viewer-branches">
              <header>
                <span>다르게 읽힐 수도 있었어</span>
                <small>화면만으로 아직 한쪽으로 정해지지 않은 부분</small>
              </header>
              {activeViewerReading.interpretive_branches.map((branch, index) => (
                <article key={`${branch.starts_at_panel}-${index}`}>
                  <button type="button" onClick={() => selectViewerPanel(branch.starts_at_panel)}>S{branch.starts_at_panel}</button>
                  <div>
                    <p><strong>지금 더 자연스러운 쪽</strong>{branch.main_reading}</p>
                    <p><strong>이렇게도 볼 수 있어</strong>{branch.alternative_reading}</p>
                    <details>
                      <summary>갈린 화면 근거</summary>
                      <p>{branch.visible_basis.join(' · ')}</p>
                    </details>
                  </div>
                </article>
              ))}
            </section>
          )}
          {(activeViewerReading.review_points || []).length > 0 && (
            <section className="viewer-review-points">
              <span>다시 확인해볼 곳</span>
              {activeViewerReading.review_points.map((point, index) => (
                <button
                  key={`${point.panel_orders.join('-')}-${index}`}
                  type="button"
                  onClick={() => selectViewerPanel(point.panel_orders[0])}
                >
                  <strong>{point.panel_orders.map((order) => `S${order}`).join(' · ')}</strong>
                  <span>{point.issue}</span>
                </button>
              ))}
            </section>
          )}
          {viewerReport.comparison && (
            <section className="viewer-perspective-comparison">
              <header>
                <span>관점이 만난 곳과 갈린 곳</span>
                <p>{viewerReport.comparison.common_reading}</p>
              </header>
              {(viewerReport.comparison.divergences || []).map((divergence, index) => (
                <article key={`${divergence.panel_orders.join('-')}-${index}`}>
                  <button
                    type="button"
                    onClick={() => selectViewerPanel(divergence.panel_orders[0])}
                  >
                    {divergence.panel_orders.map((order) => `S${order}`).join(' · ')}
                  </button>
                  <div>
                    <small>함께 본 단서 · {divergence.shared_cues.join(' · ')}</small>
                    {divergence.readings.map((conditionReading, readingIndex) => {
                      const condition = allViewerReadingConditions.find((item) => (
                        item.id === conditionReading.condition_id
                      ))
                      return (
                        <p key={`${readingIndex}-${conditionReading.condition_id}`}>
                          <strong>{condition?.title || condition?.label || '다른 읽기'}</strong>{conditionReading.reading}
                        </p>
                      )
                    })}
                    <em>{divergence.why_it_matters}</em>
                    {(divergence.routes || []).length > 0 && (
                      <div className="viewer-divergence-routes">
                        {divergence.routes.map((route) => (
                          <button
                            key={route}
                            type="button"
                            onClick={() => routeViewerFinding(route, divergence.panel_orders, {
                              title: divergence.why_it_matters,
                              interpretations: divergence.readings.map((item) => item.reading),
                              visibleCues: divergence.shared_cues,
                              routeReason: divergence.route_reason,
                            })}
                          >
                            {route === 'narrative' ? '대본' : route === 'mise' ? '연출' : route === 'camera' ? '카메라' : '편집'}에서 보기
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </section>
          )}
          {viewerDecisionItems.length > 0 && (
            <section className="viewer-decision-layer">
              <header>
                <span>제작자 결정</span>
                <strong>읽힘은 오류 판정이 아닙니다.</strong>
                <p>여기서 처음으로 제작 의도와 비교하고, 수정하거나 의도적으로 유지할지를 결정합니다.</p>
              </header>
              {viewerDecisionItems.map((item) => (
                <ViewerDecisionCard
                  key={item.id}
                  decisionId={item.id}
                  panelOrders={item.panelOrders}
                  evidence={item.evidence}
                  interpretations={item.interpretations}
                  creatorIntent={sceneIntention}
                  decision={{ ...viewerDecisions[item.id], routes: item.routes }}
                  onChange={updateViewerDecision}
                  onRoute={routeViewerFinding}
                />
              ))}
            </section>
          )}
          <button type="button" className="viewer-rerun-button" onClick={runViewerReflection} disabled={viewerStatus === 'loading'}>
            관객 관점 다시 보기
          </button>
        </section>
      )}
    </div>
  ) : null

  const selectedOptionReview = (
    <div className="selected-review-panel">
      <article className="selected-option-review">
        <div className="selected-review-heading">
          <div>
            <span className="tradeoff-eyebrow">Current option</span>
            <h2>{selectedOption.title}</h2>
          </div>
          <button
            type="button"
            className="review-close-btn"
            onClick={() => setReviewOpen(false)}
            aria-label="Close review"
          >
            ✕
          </button>
        </div>
        <div className="selected-review-copy">
          <p>{selectedOption.proposal}</p>
        </div>
        <div className="selected-review-tags">
          {selectedOption.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <div className="selected-gain-cost">
          <div className="gain">
            <span>얻는 것</span>
            <strong>{selectedOption.gain}</strong>
          </div>
          <div className="cost">
            <span>잃는 것</span>
            <strong>{selectedOption.cost}</strong>
          </div>
        </div>
      </article>

      <aside className="selected-relations-panel">
        <div className="selected-relations-heading">
          <span className="tradeoff-eyebrow">Trade-off / synergy</span>
          <p>현재 옵션과 같이 고를 때 충돌하거나 보완되는 선택지</p>
        </div>
        {connectedRelations.length === 0 ? (
          <p className="empty-relations">연결된 관계가 없습니다.</p>
        ) : connectedRelations.map((relation) => {
          const relatedOptionId = relation.from === selectedOption.id ? relation.to : relation.from
          return (
            <div key={relation.id} className={`relation-item ${relation.type}`}>
              <span>{relation.type === 'trade-off' ? '충돌하는 선택지' : '같이 쓰기 좋은 선택지'}</span>
              <strong>{getOptionTitle(relatedOptionId)}</strong>
              <p>{relation.label}</p>
            </div>
          )
        })}
      </aside>
    </div>
  )

  return (
    <div className="decision-board">
      <section className="scope-panel" aria-label="Scope selection">
        <div className="scope-panel-copy">
          <span>{reviewMode === 'viewer' ? '관객 관점 범위' : '검토 대상'}</span>
          <strong>
            {reviewMode === 'viewer' || scope.mode === 'range'
              ? `S${scopeFrom + 1}–S${scopeTo + 1}`
              : `S${activeShot + 1} · ${currentShot?.label || 'Current shot'}`}
          </strong>
        </div>
        <div className="scope-controls">
          <div className="scope-mode-toggle">
            {reviewMode === 'viewer' ? (
              <span className="scope-mode-fixed">연속 범위만</span>
            ) : (
              <>
                <button
                  type="button"
                  className={scopeMode === 'single' ? 'active' : ''}
                  onClick={() => switchScopeMode('single')}
                >
                  한 컷
                </button>
                <button
                  type="button"
                  className={scopeMode === 'range' ? 'active' : ''}
                  onClick={() => switchScopeMode('range')}
                  disabled={reviewMode === 'staging' && miseWorkspace === 'shot'}
                  title={
                    reviewMode === 'staging' && miseWorkspace === 'shot'
                        ? 'Shot Staging Range는 다음 단계에서 추가됩니다.'
                        : undefined
                  }
                >
                  범위
                </button>
              </>
            )}
          </div>
          {scopeMode === 'range' && (
            <div className="scope-shot-strip">
              {shots.map((shot, idx) => {
                const inScope = idx >= scopeFrom && idx <= scopeTo
                const isEdge = idx === scopeFrom || idx === scopeTo
                return (
                  <button
                    key={shot.id || idx}
                    type="button"
                    className={`${inScope ? 'in-scope' : ''} ${isEdge ? 'scope-edge' : ''}`}
                    onClick={() => selectScopeShot(idx)}
                    title={shot.label || `Shot ${idx + 1}`}
                  >
                    S{idx + 1}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <div className={`decision-board-main view-${boardView}`}>
        <section className="decision-board-storyboard" aria-label="Storyboard scope">
          <SceneOverview
            shotPreview={storyboardShotPreview}
            compact={boardView === 'split'}
            decisionScope={scope}
            sequencePreview={editingSequencePreview}
          />
        </section>

        <section className="decision-board-options" aria-label="Option cards and tradeoffs">
          <nav className="decision-review-nav" aria-label="검토 방식">
            <span>검토 방식</span>
            <div>
              <button
                type="button"
                className={reviewMode === 'multi' ? 'active' : ''}
                onClick={() => selectReviewMode('multi')}
                aria-pressed={reviewMode === 'multi'}
              >
                다관점
              </button>
              {CREATIVE_LENSES.map((lens) => (
                <button
                  key={lens.id}
                  type="button"
                  className={reviewMode === lens.id ? 'active' : ''}
                  onClick={() => selectReviewMode(lens.id)}
                  aria-pressed={reviewMode === lens.id}
                >
                  {lens.displayName}
                </button>
              ))}
              <span className="decision-review-divider" aria-hidden="true" />
              <button
                type="button"
                className={reviewMode === 'viewer' ? 'active audience' : 'audience'}
                onClick={() => selectReviewMode('viewer')}
                aria-pressed={reviewMode === 'viewer'}
                disabled={shots.length < 2}
              >
                관객 관점
              </button>
            </div>
          </nav>

          {reviewMode === 'viewer' ? viewerReflectionPane : (
            <>
              {reviewMode !== 'multi' && reviewOpen && selectedOptionReview}

          <div className="option-lanes active-lens-workspace" hidden={reviewMode === 'multi'}>
            <div
              key={primaryLens.id}
              className={`option-lane primary ${lensReviewHasResult ? 'lens-review-ready' : 'lens-review-waiting'}`}
              style={{ '--lens-color': primaryLens.accent }}
            >
              <div className="option-lane-header">
                <span className="lens-glass lens-glass-lg" aria-hidden="true" />

                <div className="option-lane-titleblock">
                  <span className="option-lane-role">
                    {primaryLens.displayName}
                    <em className="option-lane-tagline">{primaryLens.tagline}</em>
                  </span>
                  <p>{primaryLens.brief}</p>
                </div>
                {primaryLens.id !== 'staging' && (
                  <span className="option-lane-count">
                    {lensReviewHasResult && lensReviewRun.result
                      ? lensReviewRun.result.diagnoses.length > 0 ? '진단 1' : '이상 없음'
                      : '분석 전'}
                  </span>
                )}
                <strong>{primaryLens.lens}</strong>
              </div>
              {viewerFindingHandoff
                && ({ mise: 'staging', camera: 'camera', editing: 'editing' }[viewerFindingHandoff.route] === primaryLens.id) && (
                <section className="viewer-handoff-card" aria-label="관객 관점에서 가져온 문제">
                  <header>
                    <span>관객 관점 · {(viewerFindingHandoff.panelOrders || [viewerFindingHandoff.panelOrder]).map((panelOrder) => `S${panelOrder}`).join(' · ')}</span>
                    <button type="button" onClick={clearViewerFindingHandoff} aria-label="관객 관점 카드 닫기">×</button>
                  </header>
                  <strong>{viewerFindingHandoff.interpretations?.[0] || viewerFindingHandoff.title}</strong>
                  <p><em>시각적 근거</em>{viewerFindingHandoff.visibleCues?.join(' · ') || '특정 근거 없음'}</p>
                  <button type="button" className="viewer-handoff-use" onClick={addViewerFindingToLensRequest}>
                    검토 입력에 담기
                  </button>
                </section>
              )}
              {primaryLens.id === 'staging' && (
                <div className="mise-workspace-toggle" aria-label="Mise-en-scène workspace">
                  <button
                    type="button"
                    className={miseWorkspace === 'scene' ? 'active' : ''}
                    onClick={() => setMiseWorkspace('scene')}
                  >
                    Scene State
                  </button>
                  <button
                    type="button"
                    className={miseWorkspace === 'shot' ? 'active' : ''}
                    onClick={() => {
                      setMiseWorkspace('shot')
                      switchScopeMode('single')
                    }}
                  >
                    Shot Staging
                  </button>
                </div>
              )}
              {(primaryLens.id !== 'staging' || miseWorkspace === 'shot') && (
                <label className="lens-intent-field">
                  <div className="lens-intent-row">
                    <textarea
                      value={lensIntents[primaryLens.id]}
                      onChange={(e) => updateLensIntent(primaryLens.id, e.target.value)}
                      placeholder={primaryLens.prompt}
                      aria-label={`${primaryLens.role} focus`}
                      rows={1}
                    />
                    <button
                      type="button"
                      className="lens-send-btn"
                      onClick={() => submitLensIntent(primaryLens.id)}
                      disabled={!lensIntentDirty || lensReviewLoading}
                    >
                      {lensIntentDirty ? '의도 적용' : '적용됨'}
                    </button>
                  </div>
                </label>
              )}
              {lensAnalysisEnabled && (
                <div className="lens-review-actionbar">
                  <button
                    type="button"
                    className="lens-review-run-button"
                    onClick={runLensReview}
                    disabled={lensReviewLoading || lensIntentDirty}
                    title={lensIntentDirty ? '변경한 의도를 먼저 적용해주세요.' : undefined}
                  >
                    {lensIntentDirty
                      ? '의도 먼저 적용'
                      : lensReviewLoading
                        ? '분석 중…'
                        : (lensReviewRun.status === 'stale' || lensReviewOutdated)
                          ? '변경 반영'
                          : lensReviewHasResult
                            ? '다시 분석'
                            : '분석하기'}
                  </button>
                </div>
              )}
              {lensAnalysisEnabled && lensReviewLoading && (
                <section className="multi-review-loading lens-review-loading" role="status" aria-live="polite">
                  <div>
                    <strong>{primaryLens.displayName} 관점으로 분석하고 있습니다</strong>
                    <span>현재 패널과 선택 범위를 검토하는 중입니다.</span>
                  </div>
                  <i aria-hidden="true" />
                </section>
              )}
              {lensAnalysisEnabled && lensReviewRun.status === 'error' && (
                <section className="directing-review-error" role="alert">
                  <strong>분석을 시작하지 못했습니다</strong>
                  <p>{lensReviewRun.error}</p>
                </section>
              )}
              {lensReviewOutdated && (
                <p className="multi-review-outdated">
                  이 분석 뒤에 패널이 바뀌었습니다. 지난 결과입니다.
                </p>
              )}
              {lensAnalysisEnabled && lensReviewHasResult && lensReviewRun.result ? (
                <DirectingReviewResult run={lensReviewRun} onTool={routeDiagnosisTool} />
              ) : primaryLens.id === 'camera' ? (
                <>
                  <section className="lens-analysis-panel" aria-label="Current cinematography analysis">
                    <div className="lens-section-heading">
                      <div>
                        <span>Current analysis</span>
                        <strong>
                          {scopeMode === 'range'
                            ? `S${scopeFrom + 1}–S${scopeTo + 1} · ${scopedCameraShots.length} shots`
                            : `S${activeShot + 1} · ${shots[activeShot]?.label || 'Current shot'}`}
                        </strong>
                      </div>
                      <em>Mock reading</em>
                    </div>
                    {scopeMode === 'range' ? (
                      <div className="camera-range-analysis">
                        {scopedCameraShots.map((shot) => (
                          <div key={shot.shotNumber}>
                            <strong>S{shot.shotNumber}</strong>
                            <span>{shot.label}</span>
                            <em>{shot.shotSize}</em>
                            <em>{shot.framing}</em>
                            <p>{shot.role}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="camera-analysis-grid">
                        {MOCK_CAMERA_ANALYSIS.values.map(([label, value]) => (
                          <div key={label}>
                            <span>{label}</span>
                            <strong>{value}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="camera-analysis-notes">
                      <div>
                        <span>관찰</span>
                        <p>{scopeMode === 'range' ? cameraRangeObservation : MOCK_CAMERA_ANALYSIS.observation}</p>
                      </div>
                      <div>
                        <span>해석</span>
                        <p>{scopeMode === 'range' ? cameraRangeInterpretation : MOCK_CAMERA_ANALYSIS.interpretation}</p>
                      </div>
                    </div>
                    <p className="camera-analysis-theory">
                      {scopeMode === 'range'
                        ? 'The Filmmaker’s Eye · Shot-size Progression'
                        : MOCK_CAMERA_ANALYSIS.theory}
                    </p>
                  </section>

                  <section className="lens-proposals-panel" aria-label="Integrated cinematography proposals">
                    <div className="lens-section-heading">
                      <div>
                        <span>Integrated proposals</span>
                        <strong>{scopeMode === 'range' ? '선택 범위 전체를 다루는 촬영안 3개' : '서로 다른 촬영안 3개'}</strong>
                      </div>
                      <em>Theory-grounded</em>
                    </div>
                    {scopeMode === 'single' && storyboardShotPreview && (
                      <div className="camera-preview-status" role="status">
                        <span>
                          <em>미리보기</em>
                          <strong>S{cameraPreviewShotIndex + 1} · {cameraPreviewOption.title}</strong>
                        </span>
                        <button type="button" onClick={() => setCameraPreview(null)}>
                          미리보기 닫기
                        </button>
                      </div>
                    )}
                    {scopeMode === 'single' && lastCameraApply && (
                      <div className="camera-apply-status" role="status">
                        <span>
                          <em>Storyboard에 적용됨</em>
                          <strong>S{lastCameraApply.shotNumber} · {lastCameraApply.title}</strong>
                        </span>
                        <button type="button" onClick={undoLastCameraApply}>
                          Undo
                        </button>
                      </div>
                    )}
                    <div className="camera-proposal-list">
                      {(scopeMode === 'range' ? MOCK_CAMERA_RANGE_OPTIONS : primaryLens.options).map((option) => {
                        const rangePlan = scopeMode === 'range'
                          ? buildMockRangePlan(option.sequencePattern, scopedCameraShots)
                          : []
                        const isPreviewing = scopeMode === 'single'
                          && cameraPreview?.optionId === option.id
                          && cameraPreview?.shotId === currentShot?.id
                        const isApplied = scopeMode === 'single'
                          && currentShot?.lensApplication?.optionId === option.id
                        return (
                          <article
                            key={option.id}
                            className={`camera-proposal-card ${option.id === selectedOption.id ? 'selected' : ''} ${selectedOptionIds.includes(option.id) ? 'chosen' : ''} ${isPreviewing ? 'previewing' : ''} ${isApplied ? 'applied' : ''}`}
                          >
                            <button
                              type="button"
                              className="camera-proposal-review"
                              onClick={() => (
                                scopeMode === 'single'
                                  ? previewCameraOption(option)
                                  : openOptionReview(option.id)
                              )}
                            >
                              <span className="camera-proposal-heading">
                                <span>
                                  <em>{option.approach}</em>
                                  <strong>{option.title}</strong>
                                </span>
                                <span className="camera-proposal-arrow">↗</span>
                              </span>
                              <span className="camera-proposal-copy">{option.proposal}</span>
                              {scopeMode === 'range' ? (
                                <span className="camera-range-plan">
                                  {rangePlan.map((shot) => (
                                    <span key={shot.shotNumber}>
                                      <em>S{shot.shotNumber}</em>
                                      <strong>{shot.shotSize}</strong>
                                      <span>{shot.framing}</span>
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <span className="camera-plan-grid">
                                  {option.cameraPlan.map(([label, value]) => (
                                    <span key={label}>
                                      <em>{label}</em>
                                      <strong>{value}</strong>
                                    </span>
                                  ))}
                                </span>
                              )}
                              <span className="camera-proposal-outcome">
                                <span><em>효과</em>{option.gain}</span>
                                <span><em>비용</em>{option.cost}</span>
                              </span>
                              <span className="camera-proposal-theory">{option.theory}</span>
                            </button>
                            {scopeMode === 'single' ? (
                              <div className="camera-proposal-actions">
                                <button
                                  type="button"
                                  className={isPreviewing ? 'active' : ''}
                                  onClick={() => previewCameraOption(option)}
                                  aria-pressed={isPreviewing}
                                >
                                  {isPreviewing ? '미리보는 중' : '왼쪽에서 미리보기'}
                                </button>
                                <button
                                  type="button"
                                  className="apply"
                                  onClick={() => applyCameraOption(option)}
                                  disabled={isApplied}
                                >
                                  {isApplied ? `S${activeShot + 1}에 적용됨` : `S${activeShot + 1}에 적용`}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className={`camera-proposal-select ${selectedOptionIds.includes(option.id) ? 'picked' : ''}`}
                                onClick={() => toggleOptionSelection(option.id)}
                                aria-pressed={selectedOptionIds.includes(option.id)}
                              >
                                {selectedOptionIds.includes(option.id) ? 'Selected' : 'Select this direction'}
                              </button>
                            )}
                          </article>
                        )
                      })}
                    </div>
                  </section>
                </>
              ) : primaryLens.id === 'editing' ? (
                <section className="editing-single-workspace" aria-label="Single shot editing suggestions">
                  <div className="lens-section-heading">
                    <div>
                      <span>{scopeMode === 'range' ? '선택 범위의 편집 흐름 / Range' : '현재 샷과 인접 연결 / Single + Boundary'}</span>
                      <strong>
                        {scopeMode === 'range'
                          ? `S${scopeFrom + 1}–S${scopeTo + 1} · ${scopeTo - scopeFrom + 1}컷`
                          : `S${activeShot + 1} · ${currentShot?.label || 'Current shot'}`}
                      </strong>
                    </div>
                    <em>{scopeMode === 'range' ? '범위 분석' : `${currentEditingSuggestions.length}개 편집 제안`}</em>
                  </div>

                  {scopeMode === 'range' ? (
                    <div className="editing-single-cue">
                      <span>범위 편집</span>
                      <p>선택한 컷의 연결, 정보 공개 순서, 시각적 리듬을 함께 봅니다. 위의 분석하기를 누르면 이 범위 전체를 기준으로 진단합니다.</p>
                    </div>
                  ) : (
                    <>

                  <div className="editing-single-cue">
                    <span>편집 핵심</span>
                    <p>{currentEditingSingle.cue}</p>
                  </div>

                  {/* 이음새 제안. 여기 두는 이유는 이 화면의 그리드에서
                      제안받은 이음새를 바로 열어 고칠 수 있기 때문이다. */}
                  <div className="editing-seam-row">
                    <button
                      type="button"
                      onClick={requestSeamDesign}
                      disabled={seamDesignPending || cutPlan.length < 2}
                    >
                      {seamDesignPending ? '이음새 보는 중…' : '이음새 제안받기'}
                    </button>
                    <span>
                      {seamDesignError
                        ? `AI 호출 실패 · ${seamDesignError}`
                        : '컷 사이에 시간이 흘렀거나 생략된 것이 있는지 봅니다. 수락해야 이음새에 들어갑니다.'}
                    </span>
                  </div>

                  {seamProposals.length > 0 && (
                    <ul className="editing-seam-proposals">
                      {seamProposals.map((proposal) => (
                        <li key={proposal.id}>
                          <div className="editing-seam-where">
                            <span>{proposal.sceneHeading}</span>
                            <strong>{proposal.label || '이 컷'} 앞</strong>
                          </div>
                          <div className="editing-seam-values">
                            <em>{joinLabelOf(proposal.join)}</em>
                            <em>{elapsedLabelOf(proposal.elapsed)}</em>
                          </div>
                          {proposal.elision && (
                            <p className="editing-seam-elision">건너뜀 · {proposal.elision}</p>
                          )}
                          {proposal.reason && <p>{proposal.reason}</p>}
                          <div className="editing-seam-actions">
                            <button type="button" onClick={() => acceptSeamProposal(proposal.id)}>
                              수락
                            </button>
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => rejectSeamProposal(proposal.id)}
                            >
                              거부
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="editing-operation-list">
                    {currentEditingSuggestions.map((operation) => {
                      const isInsertPreview = operation.kind === 'insert'
                        && editingSequencePreview?.operationId === operation.id
                      const isSelected = operation.kind === 'insert'
                        ? isInsertPreview
                        : selectedEditingOperationIds.includes(operation.id)
                      return (
                        <article
                          key={operation.id}
                          className={`editing-operation-card ${isSelected ? 'selected' : ''}`}
                        >
                          <div className="editing-operation-meta">
                            <span className={`editing-operation-scope ${operation.scope}`}>
                              {operation.scopeLabel}
                            </span>
                            <span className="editing-operation-type">{operation.operation}</span>
                          </div>
                          <strong>{operation.title}</strong>
                          <p>{operation.proposal}</p>
                          <div className="editing-operation-outcome">
                            <span><em>결과</em>{operation.result}</span>
                            <span><em>주의</em>{operation.watch}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (operation.kind === 'insert') {
                                setEditingSequencePreview((current) => (
                                  current?.operationId === operation.id
                                    ? null
                                    : {
                                        type: 'insert',
                                        operationId: operation.id,
                                        afterShotId: currentShot?.id,
                                        title: operation.title,
                                        proposal: operation.proposal,
                                      }
                                ))
                                return
                              }

                              setSelectedEditingOperationIds((current) => (
                                isSelected
                                  ? current.filter((id) => id !== operation.id)
                                  : [...current, operation.id]
                              ))
                            }}
                            aria-pressed={isSelected}
                          >
                            {operation.kind === 'insert'
                              ? isSelected ? '흐름 미리보기 닫기' : '흐름에서 미리보기'
                              : isSelected ? '편집안에 추가됨' : '편집안에 추가'}
                          </button>
                        </article>
                      )
                    })}
                  </div>
                  <p className="editing-single-footnote">
                    Single Shot을 선택하면 현재 Shot 내부와 앞·뒤 연결을 함께 확인합니다. 새 Shot은 우선 임시 패널로 제안됩니다.
                  </p>
                    </>
                  )}
                </section>
              ) : primaryLens.id === 'staging' && miseWorkspace === 'shot' ? (
                <section className="mise-shot-staging" aria-label="Current shot staging analysis">
                  <div className="lens-section-heading">
                    <div>
                      <span>Shot Staging</span>
                      <strong>S{activeShot + 1} · {currentShot?.label || 'Current shot'}</strong>
                    </div>
                    <em>{currentMiseStagingMoves.length}개 제안</em>
                  </div>

                  <div className="mise-staging-cue">
                    <span>현재 핵심</span>
                    <p>{currentMiseStaging.interpretation}</p>
                  </div>

                  <section className="mise-staging-proposals" aria-label="Suggested staging moves">
                    <div className="mise-staging-proposals-heading">
                      <div>
                        <strong>배치를 바꾸는 방법</strong>
                      </div>
                    </div>
                    <div className="mise-staging-proposal-list">
                      {currentMiseStagingMoves.map((proposal) => {
                        const isSelected = selectedStagingMoveIds.includes(proposal.id)
                        return (
                          <article
                            key={proposal.id}
                            className={`mise-staging-proposal-card ${isSelected ? 'selected' : ''}`}
                          >
                            <span className="mise-staging-proposal-approach">{proposal.approach}</span>
                            <strong>{proposal.title}</strong>
                            <p>{proposal.proposal}</p>
                            <div className="mise-staging-proposal-outcome">
                              <span><em>효과</em>{proposal.gain}</span>
                              <span><em>비용</em>{proposal.cost}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedStagingMoveIds((current) => (
                                isSelected
                                  ? current.filter((id) => id !== proposal.id)
                                  : [...current, proposal.id]
                              ))}
                              aria-pressed={isSelected}
                            >
                              {isSelected ? '미장센에 추가됨' : '미장센에 추가'}
                            </button>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                  <p className="mise-state-footnote">
                    여러 move를 함께 선택할 수 있으며, 선택한 항목은 이 Shot의 로컬 배치 변화로 다룹니다.
                  </p>
                </section>
              ) : primaryLens.id === 'staging' && miseWorkspace === 'scene' ? (
                <section className="mise-scene-state" aria-label="Mise-en-scène scene state">
                  <div className="lens-section-heading">
                    <div>
                      <span>Current scene state</span>
                      <strong>{sceneState.title}</strong>
                    </div>
                    <em>Global reference</em>
                  </div>
                  <p className="mise-state-description">{sceneState.description}</p>

                  <section className="mise-state-group">
                    <div className="mise-state-group-heading">
                      <div>
                        <span>Characters</span>
                        <strong>인물 기준 상태</strong>
                      </div>
                      <em>{sceneState.characters.length} records</em>
                    </div>
                    <div className="mise-character-grid">
                      {miseCharacters.map((character) => {
                        const isEditing = editingCharacterId === character.id && characterDraft?.id === character.id
                        const detail = isEditing ? characterDraft : character
                        return (
                          <article
                            key={character.id}
                            className={`mise-character-reference-card ${isEditing ? 'flipped' : ''}`}
                          >
                            <div className="mise-character-card-inner">
                              <section
                                className="mise-character-card-face mise-character-card-front"
                                aria-hidden={isEditing}
                              >
                                <div className="mise-character-portrait">
                                  <img src={character.image} alt={`${character.name} reference`} />
                                  <span>Reference</span>
                                </div>
                                <div className="mise-character-front-copy">
                                  <div>
                                    <strong>{character.name}</strong>
                                    <p>{character.summary}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => openCharacterDetails(character)}
                                    tabIndex={isEditing ? -1 : 0}
                                  >
                                    Details & Edit
                                  </button>
                                </div>
                              </section>

                              <section
                                className="mise-character-card-face mise-character-card-back"
                                aria-hidden={!isEditing}
                              >
                                <div className="mise-character-edit-heading">
                                  <div className="mise-character-edit-thumb">
                                    <img src={detail.image} alt="" />
                                  </div>
                                  <div>
                                    <span>Character reference</span>
                                    <strong>{detail.name}</strong>
                                  </div>
                                  <label>
                                    Replace photo
                                    <input
                                      type="file"
                                      accept="image/*"
                                      disabled={!isEditing}
                                      onChange={(event) => updateCharacterImageDraft(event.target.files?.[0])}
                                    />
                                  </label>
                                </div>
                                <div className="mise-character-edit-fields">
                                  <label>
                                    <span>이름</span>
                                    <input
                                      value={detail.name}
                                      disabled={!isEditing}
                                      onChange={(event) => updateCharacterDraft('name', event.target.value)}
                                    />
                                  </label>
                                  <label>
                                    <span>연령대·역할</span>
                                    <input
                                      value={detail.summary}
                                      disabled={!isEditing}
                                      onChange={(event) => updateCharacterDraft('summary', event.target.value)}
                                    />
                                  </label>
                                  {detail.facts.map((fact) => (
                                    <div key={fact.label} className="mise-fact-field">
                                      <label>
                                        <span>{fact.label}</span>
                                        <input
                                          value={fact.value}
                                          disabled={!isEditing}
                                          onChange={(event) => updateCharacterFactDraft(fact.label, event.target.value)}
                                        />
                                      </label>

                                      <SceneFactChanges
                                        fact={fact}
                                        group="character"
                                        characterId={character.id}
                                        shots={shots}
                                        onAdd={setChangeDraft}
                                        onRemove={removeFactChange}
                                        disabled={!isEditing}
                                      />
                                    </div>
                                  ))}
                                </div>
                                {/* 레퍼런스 그림. 씬 기준을 글로만 두면
                                    컷마다 다른 얼굴이 나온다 — 이 그림이
                                    패널 생성의 참조로 물린다. */}
                                <div className="mise-reference-gen">
                                  <label>
                                    <span>그림 프롬프트</span>
                                    <textarea
                                      rows={3}
                                      value={referencePromptOf(character)}
                                      placeholder="항목 값에서 자동으로 만들어집니다"
                                      onChange={(event) => setReferencePrompt(
                                        'character', character.id, event.target.value,
                                      )}
                                    />
                                  </label>
                                  <div className="mise-reference-gen-actions">
                                    <button
                                      type="button"
                                      onClick={() => requestReferenceImage('character', character.id)}
                                      disabled={referenceImagePending === character.id}
                                    >
                                      {referenceImagePending === character.id
                                        ? '그리는 중…'
                                        : character.image ? '다시 그리기' : '레퍼런스 그리기'}
                                    </button>
                                    {/* 직접 고친 문장은 되돌릴 수 있어야 한다. */}
                                    {character.promptOverride && (
                                      <button
                                        type="button"
                                        className="ghost"
                                        onClick={() => setReferencePrompt('character', character.id, '')}
                                      >
                                        자동으로 되돌리기
                                      </button>
                                    )}
                                  </div>
                                  {referenceImageError && referenceImagePending === null && (
                                    <p className="mise-reference-error">{referenceImageError}</p>
                                  )}
                                </div>

                                <div className="mise-character-edit-actions">
                                  <button
                                    type="button"
                                    onClick={closeCharacterDetails}
                                    disabled={!isEditing}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    className="save"
                                    onClick={saveCharacterDetails}
                                    disabled={!isEditing}
                                  >
                                    Save
                                  </button>
                                </div>
                              </section>
                            </div>
                          </article>
                        )
                      })}
                    </div>

                  </section>

                  {/* 어느 컷부터 바뀌는지 정한다. 컷을 고르는 것이므로
                      자유 입력이 아니라 목록에서 고른다. */}
                  {changeDraft && (
                    <div className="mise-change-form">
                      <header>
                        {/* 셋이 같은 폼을 쓰므로 어느 것의 변화인지 밝힌다. */}
                        <strong>
                          {changeDraft.characterId
                            ? sceneState.characters.find((c) => c.id === changeDraft.characterId)?.name
                            : changeDraft.group === 'location'
                              ? sceneState.location.name
                              : sceneState.environment.name}
                          {' · '}{changeDraft.label}
                        </strong>
                        <button type="button" onClick={() => setChangeDraft(null)}>✕</button>
                      </header>
                      <label>
                        <span>이 상태가 시작되는 컷</span>
                        <select
                          value={changeDraft.cutId || ''}
                          onChange={(event) => setChangeDraft({
                            ...changeDraft,
                            cutId: event.target.value,
                          })}
                        >
                          {/* 컷과 이어지지 않은 패널은 고를 수 없다.
                              변화는 컷 id로 기록되기 때문이다. */}
                          {shots.filter((shot) => shot.cutPlanItemId).map((shot, index) => (
                            <option
                              key={shot.id}
                              value={shot.cutPlanItemId}
                              disabled={
                                shot.cutPlanItemId !== changeDraft.originalCutId
                                && changeDraft.takenCutIds?.includes(shot.cutPlanItemId)
                              }
                            >
                              S{index + 1} · {shot.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>이렇게 바뀐다</span>
                        <input
                          value={changeDraft.value}
                          placeholder="예: 젖은 채 굳어 있음"
                          onChange={(event) => setChangeDraft({
                            ...changeDraft,
                            value: event.target.value,
                          })}
                        />
                      </label>
                      <button
                        type="button"
                        className="mise-change-save"
                        disabled={!changeDraft.value.trim() || !changeDraft.cutId}
                        onClick={() => {
                          addFactChange(
                            changeDraft.group,
                            changeDraft.label,
                            changeDraft.cutId,
                            changeDraft.value.trim(),
                            { characterId: changeDraft.characterId },
                          )
                          if (changeDraft.originalCutId && changeDraft.originalCutId !== changeDraft.cutId) {
                            removeFactChange(
                              changeDraft.group,
                              changeDraft.label,
                              changeDraft.originalCutId,
                              { characterId: changeDraft.characterId },
                            )
                          }
                          setChangeDraft(null)
                        }}
                      >
                        {changeDraft.editing ? '이 단계 저장' : '다음 단계 추가'}
                      </button>
                    </div>
                  )}
                  <div className="mise-place-grid">
                    <section className="mise-state-group mise-state-card mise-location-card">
                      <div className="mise-state-group-heading">
                        <div>
                          <span>Location</span>
                          <strong>{sceneState.location.name}</strong>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="mise-location-preview"
                        onClick={openSpatialEditor}
                        aria-label="지하철 관제실 2D 공간 편집기 열기"
                      >
                        <span className="mise-location-preview-caption">
                          <strong>2D spatial layout</strong>
                          <span>클릭해서 인물과 공간 배치를 조정</span>
                        </span>
                        <span className="mise-mini-room">
                          <span className="mise-mini-monitor">Monitor wall</span>
                          <span className="mise-mini-console">Console</span>
                          <span className="mise-mini-cabinet">Cabinet</span>
                          <span className="mise-mini-door">Door</span>
                          <span className="mise-mini-person jaein">재</span>
                          <span className="mise-mini-person minho">민</span>
                        </span>
                      </button>
                      <dl>
                        {sceneState.location.facts.map((fact) => (
                          <div key={fact.label} className={fact.open ? 'open' : ''}>
                            <dt>{fact.label}</dt>
                            <dd>
                              {fact.value}
                              {/* 공간도 씬 안에서 변한다 — 문이 닫히고 소품이
                                  옮겨진다 (DG2 P2). */}
                              <SceneFactChanges
                                fact={fact}
                                group="location"
                                shots={shots}
                                onAdd={setChangeDraft}
                                onRemove={removeFactChange}
                              />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>

                    <section className="mise-state-group mise-state-card">
                      <div className="mise-state-group-heading">
                        <div>
                          <span>Shared scene</span>
                          <strong>{sceneState.environment.name}</strong>
                        </div>
                      </div>
                      <dl>
                        {sceneState.environment.facts.map((fact) => (
                          <div key={fact.label} className={fact.open ? 'open' : ''}>
                            <dt>{fact.label}</dt>
                            <dd>
                              {fact.value}
                              {fact.shared && <em>Shared</em>}
                              <SceneFactChanges
                                fact={fact}
                                group="environment"
                                shots={shots}
                                onAdd={setChangeDraft}
                                onRemove={removeFactChange}
                              />
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  </div>
                  <p className="mise-state-footnote">
                    Shot Staging에는 이 기준과 다른 부분만 표시됩니다. 아직 지정되지 않은 값은 AI가 확정하지 않습니다.
                  </p>
                </section>
              ) : primaryLens.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`option-card compact ${option.id === selectedOption.id ? 'selected' : ''} ${selectedOptionIds.includes(option.id) ? 'chosen' : ''}`}
                    onClick={() => openOptionReview(option.id)}
                  >
                    <span className="option-card-head">
                      <span className="option-card-title">{option.title}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        className={`option-pick ${selectedOptionIds.includes(option.id) ? 'picked' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleOptionSelection(option.id)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            e.stopPropagation()
                            toggleOptionSelection(option.id)
                          }
                        }}
                        aria-pressed={selectedOptionIds.includes(option.id)}
                      >
                        {selectedOptionIds.includes(option.id) ? 'Selected' : 'Select'}
                      </span>
                    </span>
                    <span className="option-card-tags">
                      {option.tags.map((tag) => <em key={tag}>{tag}</em>)}
                    </span>
                  </button>
                ))}
            </div>
          </div>

          {reviewMode === 'multi' && (
            <section className="multi-review-preview" aria-label="다관점 패널 검토">
              <header className="multi-review-preview-heading">
                <div>
                  {/* 범위를 골라도 제목이 한 컷을 가리키면 무엇을 분석한
                      건지 어긋난다. */}
                  <h2>{multiScopeLabel}을 세 관점으로 함께 보기</h2>
                </div>
                <button
                  type="button"
                  className="multi-review-run-button"
                  onClick={runMultiReview}
                  disabled={multiReviewLoading || multiReviewIntentDirty}
                  title={multiReviewIntentDirty ? '변경한 의도를 먼저 적용해주세요.' : undefined}
                >
                  {multiReviewIntentDirty
                    ? '의도 먼저 적용'
                    : multiReviewLoading
                      ? '분석 중…'
                      : (multiReviewRun.status === 'stale' || multiReviewOutdated)
                        ? '변경 반영'
                        : multiReviewHasResult
                          ? '다시 분석'
                          : '분석하기'}
                </button>
              </header>

              <details className="multi-review-intent">
                <summary>
                  <span>검토 의도</span>
                  <strong>
                    {multiReviewIntentDirty
                      ? '적용되지 않은 변경이 있습니다'
                      : multiReviewIntent.trim() || '이 컷에서 전달하려는 것을 선택적으로 추가'}
                  </strong>
                </summary>
                <label>
                  <span>
                    {scopeMode === 'range' ? '이 범위에서 전달하려는 것' : '이 컷에서 전달하려는 것'}
                  </span>
                  <textarea
                    value={multiReviewIntentDraft}
                    rows={2}
                    disabled={multiReviewLoading}
                    onChange={(event) => setMultiReviewIntentDrafts((current) => ({
                      ...current,
                      [multiReviewScopeKey]: event.target.value,
                    }))}
                    placeholder="예: 두 인물의 거리감은 보이되, 위협의 원인은 아직 숨기고 싶다."
                    aria-label="다관점 검토 의도"
                  />
                </label>
                <div className="multi-review-intent-footer">
                  <p>교차 검토에만 사용하며 관객 관점에는 전달하지 않습니다.</p>
                  <button
                    type="button"
                    onClick={submitMultiReviewIntent}
                    disabled={!multiReviewIntentDirty || multiReviewLoading}
                  >
                    {multiReviewIntentDirty ? '의도 적용' : '적용됨'}
                  </button>
                </div>
              </details>

              {multiReviewLoading && (
                <section className="multi-review-loading" role="status" aria-live="polite">
                  <div>
                    <strong>패널을 분석하고 있습니다</strong>
                    <span>미장센·촬영·편집 결과를 교차 검토하는 중입니다.</span>
                  </div>
                  <i aria-hidden="true" />
                </section>
              )}

              {multiReviewHasResult && (
                <>
              {/* 고치러 갔다 오면 옛 분석이 최신인 것처럼 남는다.
                  본 뒤에 패널이 바뀌었으면 그 사실을 밝힌다. */}
              {multiReviewOutdated && (
                <p className="multi-review-outdated">
                  이 분석 뒤에 패널이 바뀌었습니다. 지난 결과입니다.
                </p>
              )}

              {/* 세 렌즈가 같게 본 것. 없으면 이 자리를 비운다 —
                  억지로 합의를 만들면 그것도 지어낸 것이다. */}
              {multiAgreement && (
                <section className="multi-review-summary">
                  <header>
                    <span>공통 판단</span>
                    <em>{lensMarks(multiAgreement.lenses)}</em>
                  </header>
                  <p>{multiAgreement.summary}</p>
                </section>
              )}

              {/* 세 렌즈가 각자 문제를 짚으면 어디부터 열지 알 수 없다.
                  관계가 그 순서를 정한다 — 원인을 먼저 고쳐야 결과가 따라 바뀐다. */}
              {showOrder && (
                <section className="multi-review-order">
                  <header>
                    <span>먼저 볼 곳</span>
                    <em>{lensMark(multiReviewRun.order.first_lens)}</em>
                  </header>
                  <button
                    type="button"
                    className="multi-review-order-go"
                    onClick={() => choosePrimaryLens(
                      frontLensId(multiReviewRun.order.first_lens),
                    )}
                  >
                    {lensName(multiReviewRun.order.first_lens)}부터 보기 →
                  </button>
                  <p>{multiReviewRun.order.reason}</p>
                  {multiReviewRun.order.then?.length > 0 && (
                    <p className="multi-review-order-then">
                      고친 뒤 {multiReviewRun.order.then.map(lensName).join('·')}을 다시 봅니다
                    </p>
                  )}
                </section>
              )}

              <div className="multi-review-grid">
                {MULTI_LENS_ORDER.map(({ backendId, lensId, mark }) => {
                  const perspective = PERSPECTIVES.find((item) => item.id === lensId)
                  const result = multiReviewRun.lensResults?.[backendId]
                  if (!perspective || !result) return null
                  return (
                    <article
                      key={lensId}
                      className="multi-review-card"
                      style={{ '--lens-color': perspective.accent }}
                    >
                      <header>
                        <span>{mark}</span>
                        <div>
                          <strong>{perspective.displayName}</strong>
                          <em>{perspective.lens}</em>
                        </div>
                      </header>
                      <p>{result.summary}</p>
                    </article>
                  )
                })}
              </div>

              {/* 렌즈 사이의 관계. consequence는 방향이 있어 어디를 고쳐야
                  하는지까지 말한다 — 영향받은 쪽을 고치면 증상만 사라진다. */}
              {multiRelations.map((relation) => (
                <section
                  key={`${relation.type}-${relation.diagnosis_ids.join('-')}`}
                  className={`multi-review-tension is-${relation.type}`}
                >
                  <header>
                    <span>{RELATION_LABELS[relation.type]}</span>
                    <em>
                      {relation.type === 'consequence'
                        ? `${lensMark(relation.source_lens)} → ${lensMark(relation.affected_lens)}`
                        : lensMarks(relation.lenses)}
                    </em>
                  </header>
                  <p>{relation.summary}</p>
                  {relation.type === 'consequence' && (
                    <div className="multi-review-tension-where">
                      <strong>고칠 곳은 {lensName(relation.source_lens)}입니다</strong>
                      {/* 판정과 이동을 나눈다. 관계 여럿을 판정하는 중에
                          화면이 튀면 하던 일이 끊긴다. */}
                      <button
                        type="button"
                        onClick={() => choosePrimaryLens(frontLensId(relation.source_lens))}
                      >
                        {lensName(relation.source_lens)}에서 이어서 보기 →
                      </button>
                    </div>
                  )}
                  {/* 충돌은 원인이 한쪽에 있지 않다. 양쪽으로 가는 길을 둔다. */}
                  {relation.type !== 'consequence' && relation.lenses?.length > 0 && (
                    <div className="multi-review-tension-where">
                      {relation.lenses.map((lens) => (
                        <button
                          key={lens}
                          type="button"
                          onClick={() => choosePrimaryLens(frontLensId(lens))}
                        >
                          {lensName(lens)}에서 보기 →
                        </button>
                      ))}
                    </div>
                  )}
                  {/* AI가 말하고 끝나면 판결이 된다. 감독이 답할 자리를
                      두고, 그 답은 다음 분석에 함께 보낸다 (DG1 P2). */}
                  <div className="multi-review-verdict">
                    {verdictOptionsFor(relation).map((option) => {
                      const chosen = relationVerdicts[relationKey(relation)] === option.id
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={chosen ? 'selected' : ''}
                          aria-pressed={chosen}
                          onClick={() => setRelationVerdicts((current) => ({
                            ...current,
                            // 같은 것을 다시 누르면 판정을 무른다.
                            [relationKey(relation)]: chosen ? undefined : option.id,
                          }))}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}

              {/* 관계는 눌러서 찾는다. 렌즈 판단만 보고 끝낼 수도 있고,
                  한 번에 하면 결과를 보기까지 70초를 기다린다. */}
              {!multiReviewRun.related && (
                <div className="multi-review-relate">
                  <button
                    type="button"
                    onClick={runRelateReview}
                    disabled={multiReviewRun.relating || !multiHasDiagnosis}
                  >
                    {multiReviewRun.relating ? '관계 보는 중…' : '렌즈 간 관계 찾기'}
                  </button>
                  <span>
                    {multiReviewRun.relateError
                      ? `실패 · ${multiReviewRun.relateError}`
                      : multiHasDiagnosis
                        ? '한 렌즈의 결정이 다른 렌즈 판단을 만들었는지 봅니다.'
                        : '짚인 문제가 없어 볼 관계가 없습니다.'}
                  </span>
                </div>
              )}

              {/* 관계가 없는 것도 정보다. 비워 두면 고장으로 읽힌다. */}
              {multiReviewRun.related && multiRelations.length === 0 && !multiAgreement && (
                <p className="multi-review-empty">
                  세 렌즈가 서로 다른 것을 짚었습니다. 각 판단을 따로 보세요.
                </p>
              )}
                </>
              )}
            </section>
          )}
            </>
          )}
        </section>
      </div>
      {spatialEditorOpen && (
        <section className="mise-spatial-editor" aria-label="지하철 관제실 2D 공간 편집기">
          <header className="mise-spatial-editor-header">
            <div>
              <span>Mise-en-scène · Location</span>
              <strong>{sceneState.location.name} 2D 배치</strong>
            </div>
            <p>상태 단계를 고른 뒤, 그 단계에서 바뀌는 배치만 움직입니다.</p>
            <button type="button" onClick={() => setSpatialEditorOpen(false)}>↙ Scene State로 돌아가기</button>
          </header>
          <div className="mise-spatial-stage-tabs" role="tablist" aria-label="2D 배치 상태 단계">
            <span>상태 단계</span>
            <div>
              {spatialStages.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  role="tab"
                  aria-selected={activeSpatialStageId === stage.id}
                  className={activeSpatialStageId === stage.id ? 'is-active' : ''}
                  onClick={() => selectSpatialStage(stage.id)}
                >
                  {stage.label}
                </button>
              ))}
            </div>
            <small>새 단계는 직전 배치에서 이어집니다.</small>
          </div>
          <div className="mise-spatial-editor-canvas">
            <SpatialMap
              key={`${activeSpatialStageId || 'initial'}:${spatialEditorVersion}`}
              initialElements={miseSpatialElements}
              initialEntityPresets={MOCK_MISE_ENTITY_PRESETS}
              onElementsChange={updateMiseSpatialElements}
              onProposeLayout={proposeSpatialLayout}
              proposePending={spaceLayoutPending}
              proposeNote={spaceLayoutError
                ? `AI 호출 실패 · ${spaceLayoutError}`
                : spaceLayoutNote || '대본에서 배치 제안받기'}
              showShotNodes={false}
            />
          </div>
        </section>
      )}
    </div>
  )
}
