import { useCallback, useEffect, useMemo, useState } from 'react'
import useStore, {
  buildReferencePrompt,
  describeLayout,
  referencePendingKey,
  sceneOfBeat,
  selectActiveSceneId,
  selectActiveSceneState,
  selectCutPrompt,
  selectScenes,
  spatialStagesFor,
  factValueAt,
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
  lens: '이야기 흐름',
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
    lens: '인물과 공간',
    glyph: '🎭',
    tagline: '무대를 어떻게 짤 것인가',
    brief: '거리, 시선, 몸의 방향, 사물 관계를 본다.',
    prompt: '예: 인물의 고립과 몰입을 더 강하게',
    accent: '#10b981',
  },
  {
    id: 'camera',
    role: 'Cinematography Lens',
    displayName: '촬영',
    lens: '카메라와 화면',
    glyph: '🎥',
    tagline: '어디서 볼 것인가',
    brief: '어디서, 얼마나 가까이, 어떤 톤으로 볼지 본다.',
    prompt: '예: 좀 더 감정을 극대화하게',
    accent: '#3b82f6',
  },
  {
    id: 'editing',
    role: 'Editing Lens',
    displayName: '편집',
    lens: '컷의 연결',
    glyph: '✂️',
    tagline: '어디서 자르고 이을 것인가',
    brief: '몇 컷으로 나누고 어디서 끊을지 본다.',
    prompt: '예: 더 필요한 컷이 있을까',
    accent: '#ef4444',
  },
]

const PERSPECTIVES = [NARRATIVE_AGENT, ...CREATIVE_LENSES]

const DIAGNOSTIC_LEVEL_LABELS = {
  attribute: '이 컷 안',
  shot_structure: '컷 구성',
  shot_relation: '컷 사이',
  scene_structure: '장면 전체',
}

const VIEWER_READING_CONDITIONS = [
  {
    id: 'first_viewer',
    title: '처음 보는 관객',
    attention: '사전 정보 없이 누가 누구고 무슨 일이 벌어지는지 따라갑니다.',
  },
  {
    id: 'film_literate',
    title: '영화에 익숙한 관객',
    attention: '프레이밍·반복·생략·컷의 관계가 만드는 영화적 기대와 강조를 따라갑니다.',
  },
  {
    // 저장된 관객 읽기와의 호환성을 위해 기존 id는 유지한다.
    id: 'context_close',
    title: '이야기 흐름을 중요하게 보는 관객',
    attention: '컷 사이에서 사건과 정보가 어떻게 이어지는지 살핍니다.',
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

// 한 패널에 세 연출 관점이 함께 놓였을 때의
// 정보 밀도와 비교 방식을 확인하기 위한 화면용 문장이다.
// 서버의 렌즈 이름과 화면의 렌즈 id가 다르다 (mise ↔ staging).
const MULTI_LENS_ORDER = [
  { backendId: 'mise', lensId: 'staging', mark: 'M', name: '미장센' },
  { backendId: 'camera', lensId: 'camera', mark: 'C', name: '촬영' },
  { backendId: 'editing', lensId: 'editing', mark: 'E', name: '편집' },
]

// 관계의 분류명이 아니라 감독이 무엇을 마주한 것인지로 쓴다. `한 선택의
// 영향`은 무엇이 무엇에 영향을 줬는지가 빠져 있어, 카드를 읽고 나서야
// 무슨 말인지 알게 된다. consequence는 렌즈 이름을 넣어 문장으로 만든다.
const RELATION_LABELS = {
  conflict: '두 관점이 반대로 말합니다',
  agreement: '두 관점이 같은 것을 짚었습니다',
}
// lensName은 아래에 선언되지만 호출 시점에만 쓰이므로 순서는 문제되지 않는다.
const relationLabel = (relation) => (
  relation.type === 'consequence'
    ? `${lensName(relation.source_lens)}에서 생긴 문제가 ${lensName(relation.affected_lens)}까지 옵니다`
    : RELATION_LABELS[relation.type] || '두 관점의 관계'
)

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
  // 합의는 우선순위를 물을 일이 아니다. 두 렌즈가 같은 결손을 가리키므로
  // 물을 것은 '한 번에 고칠까, 따로 볼까'다. conflict의 선택지를 물려
  // 쓰면 같은 말을 하는 둘 중 하나를 고르라고 묻게 된다.
  if (relation.type === 'agreement') {
    return [
      { id: 'fix-once', label: '한 번에 고칠게' },
      { id: 'separate', label: '따로 볼게' },
      { id: 'keep', label: '그대로 둘게' },
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
    proposal: '발견의 내용을 먼저 보여주지 않고, 인물의 멈춤과 반응을 거친 뒤에 노트를 드러낸다.',
    gain: '궁금증, 발견의 무게, 다음 컷으로 넘어가는 이유',
    cost: '무엇을 알아냈는지가 늦게 잡힐 수 있음',
    tags: ['정보 지연', '발견의 무게', '오해 가능성'],
    viewerCheck: 'viewer가 무엇을 알아냈는지 궁금해하는지, 아니면 상황을 못 따라가는지 확인',
  },
  {
    id: 'opt-distance',
    lensId: 'staging',
    title: '거리 벌리기',
    proposal: '인물을 프레임 안에서 작게 두고, 사이에 실험대와 어두운 장비 열을 겹쳐 둔다.',
    gain: '고립감, 밤의 실험실 규모, 공간적 적막',
    cost: '미세한 표정 정보가 약해질 수 있음',
    tags: ['거리', '고립감', '사물 관계'],
    viewerCheck: 'viewer가 하린의 고립을 거리감으로 읽는지 확인',
  },
  {
    id: 'opt-object-between',
    lensId: 'staging',
    title: '사물로 가르기',
    proposal: '노트, 화면, 연필 같은 핵심 사물을 인물과 카메라 사이에 두어 발견의 축을 만든다.',
    gain: '발견의 물리적 초점, 시선 이동, 근거의 가시화',
    cost: '인물 감정보다 물건의 의미가 더 크게 읽힐 수 있음',
    tags: ['사물 관계', '시선', '발견 축'],
    viewerCheck: 'viewer가 사물을 단순 소품이 아니라 발견의 매개로 읽는지 확인',
  },
  {
    id: 'opt-wide-corridor',
    lensId: 'camera',
    title: '공간을 넓게 열기',
    approach: '공간 중심 · 현재 방향',
    proposal: '인물을 작게 두고 실험대와 장비, 창문을 함께 보이게 한다.',
    gain: '공간 명료성, 고립감, 밤의 규모',
    cost: '감정 밀도와 표정의 긴장이 약해질 수 있음',
    tags: ['공간 명료성', '고립감', '포함/배제'],
    cameraPlan: [
      ['샷 크기', 'Wide 유지'],
      ['각도', 'High angle 유지'],
      ['화면 구성', '인물을 작게, 공간을 넓게'],
      ['시야·가림', '환경 단서를 열어둠'],
    ],
    theory: 'Establishing Shot · Size for Importance',
    viewerCheck: 'viewer가 장소 설명이 아니라 고립감으로 읽는지 확인',
    mockShotChange: {
      image: '/img/lab_wide_establishing.png',
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
    proposal: '하린의 얼굴과 눈동자를 크게 잡아 깨달음의 순간을 전면화한다.',
    gain: '감정 밀도, 인물 동일시, 즉각적 몰입',
    cost: '공간 단서와 근거가 된 자료의 위치가 약해질 수 있음',
    tags: ['감정 밀도', '클로즈업', '포함/배제'],
    cameraPlan: [
      ['샷 크기', 'Wide → Close-up'],
      ['각도', 'Eye-level 유지'],
      ['화면 구성', '얼굴과 시선 중심'],
      ['시야·가림', '배경 정보를 제외'],
    ],
    theory: 'Close-up · Hitchcock’s Rule',
    viewerCheck: 'viewer가 깨달음으로 읽는지, 단순 놀람이나 공포로 읽는지 확인',
    mockShotChange: {
      image: '/img/lab_discovery_cu.png',
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
    proposal: '장비 열이나 선반 너머로 인물을 보이게 해 멀리서 지켜보는 듯한 거리를 만든다.',
    gain: '관찰자 위치, 몰입 전의 거리, 시각적 깊이',
    cost: '인물 행동이 덜 명확해질 수 있음',
    tags: ['가림', '시점', '거리'],
    cameraPlan: [
      ['샷 크기', 'Wide → Medium'],
      ['각도', '비스듬한 관찰 시점'],
      ['화면 구성', '전경 사이에 인물 배치'],
      ['시야·가림', '장비로 일부 가림'],
    ],
    theory: 'Frame within a Frame · Restricted View',
    viewerCheck: 'viewer가 이 가림을 의도된 관찰 거리로 받아들이는지 확인',
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
    proposal: '노트의 식을 보여주기 전에 하린의 멈춘 손과 시선 컷을 먼저 둔다.',
    gain: '기대 상승, 관객의 질문, 컷 사이 리듬',
    cost: '무엇을 본 것인지 잠시 불분명해질 수 있음',
    tags: ['반응 컷', '지연', '컷 경계'],
    viewerCheck: 'viewer가 반응의 대상이 무엇인지 궁금해하는지 확인',
  },
  {
    id: 'opt-three-beat',
    lensId: 'editing',
    title: '세 박자 분할',
    proposal: '규칙의 발견, 노트에 적기, 하린의 깨달음을 세 컷으로 나누어 밀도를 단계적으로 올린다.',
    gain: '감정 누적, 정보 순서의 명료성, 리듬 제어',
    cost: '장면이 느려지거나 설명적으로 보일 수 있음',
    tags: ['컷 분할', '감정 누적', '정보 순서'],
    viewerCheck: 'viewer가 속도 저하가 아니라 밀도 증가로 읽는지 확인',
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
    proposal: '범위 전체에서 넓은 공간과 인물의 위치 관계를 유지해 밤 실험실의 구조를 먼저 읽게 한다.',
    gain: '공간 연속성, 인물과 장비의 거리, 작업 환경이 명확함',
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
    proposal: '처음에는 공간을 관찰하다가 범위 후반에는 OTS와 Single로 전환해 하린의 사고에 가까이 붙는다.',
    gain: '인물 동일시, 관찰에서 감정으로의 전환, 후반 집중도',
    cost: '시점 변화가 빠르면 공간 축과 시선 관계가 불안정해질 수 있음',
    tags: ['Range', 'OTS', '주관 시점'],
    sequencePattern: 'subjective',
    theory: 'OTS',
    viewerCheck: 'viewer가 시점 변화를 혼란이 아니라 하린에게 가까워지는 과정으로 읽는지 확인',
  },
]

const MOCK_CAMERA_SHOT_SEQUENCE = [
  { shotSize: 'Wide', framing: 'Master', role: '공간 확립' },
  { shotSize: 'Medium', framing: 'OTS', role: '작업으로 진입' },
  { shotSize: 'Medium Close', framing: 'Single', role: '정체와 피로' },
  { shotSize: 'Close-up', framing: 'Single', role: '알아차림' },
  { shotSize: 'ECU', framing: 'Insert', role: '결정적 근거' },
  { shotSize: 'Close-up', framing: 'Single', role: '깨달음' },
  { shotSize: 'Wide', framing: 'Single', role: '세계를 다시 봄' },
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
    ['카메라 각도', 'High angle'],
    ['화면 구성', '인물보다 공간 우선'],
    ['시야·가림', '환경 단서가 모두 보임'],
    ['카메라 움직임', 'Static'],
  ],
  observation: '실험대와 장비, 창문과 인물의 위치 관계를 한 프레임 안에서 먼저 설명하는 촬영안입니다.',
  interpretation: '공간과 고립감은 명확하지만, 인물의 미세한 집중과 깨달음의 순간은 상대적으로 약하게 읽힐 수 있습니다.',
  theory: 'The Filmmaker’s Eye · Establishing Shot',
}

// 씬 기준(인물·장소·환경)은 useStore의 sceneState로 옮겼다.
// 이 화면에서 고친 것이 buildCutPrompt까지 가야 하기 때문이다.
const MOCK_MISE_SPATIAL_ELEMENTS = [
  { id: 'room', type: 'rect', x: 250, y: 180, w: 720, h: 480, label: 'PHYSICS LAB' },
  { id: 'window', type: 'rect', x: 330, y: 190, w: 500, h: 40, label: 'WINDOW' },
  { id: 'lit-bench', type: 'rect', x: 400, y: 390, w: 360, h: 90, label: 'LIT BENCH' },
  { id: 'dark-bench', type: 'rect', x: 400, y: 520, w: 360, h: 80, label: 'DARK BENCHES' },
  { id: 'lab-door', type: 'rect', x: 270, y: 360, w: 50, h: 130, label: 'DOOR' },
  { id: 'scene-label', type: 'text', x: 420, y: 615, w: 320, h: 32, text: '물리학과 실험실 · 밤' },
  { id: 'harin-marker', type: 'marker', x: 560, y: 330, label: '하', color: '#10b981', waypoints: [] },
]

const cloneSpatialElements = (elements) => elements.map((element) => ({
  ...element,
  waypoints: element.waypoints?.map((waypoint) => ({ ...waypoint })),
}))

const MOCK_MISE_ENTITY_PRESETS = [
  { label: '하', color: '#10b981', full: '하린' },
  { label: '노', color: '#f59e0b', full: '노트' },
]

const MOCK_MISE_SHOT_STAGING = [
  {
    values: [
      ['등장 인물', '하린'],
      ['배치·거리', '하린은 불빛이 닿는 실험대 한쪽 · 나머지 공간은 비어 있음'],
      ['자세·행동', '하린은 앉아 화면을 들여다봄'],
      ['표정·시선', '하린의 시선은 노트북 화면에 고정'],
      ['이동 소품', '노트와 연필은 하린 앞 실험대 위에 있음'],
      ['보이는 배경', '어두운 실험대 열 · 장비 · 비 내리는 창'],
    ],
    interpretation: '넓은 어둠 속 작은 광원 하나가 대치가 아니라 혼자 남은 시간과 몰입을 먼저 읽히게 합니다.',
  },
  {
    values: [
      ['등장 인물', '하린'],
      ['배치·거리', '카메라가 하린의 어깨 뒤로 붙음 · 책상까지의 거리가 좁아짐'],
      ['자세·행동', '하린은 화면을 보며 노트에 식을 적고 지움'],
      ['표정·시선', '하린 → 화면의 그래프 → 노트'],
      ['이동 소품', '연필이 하린의 손에 쥐어짐'],
      ['보이는 배경', '노트북 화면 · 펼쳐진 노트 · 어두운 실내'],
    ],
    interpretation: '어깨 너머 시점이 관객을 작업의 내용 쪽으로 끌어와, 인물이 무엇과 싸우는지를 공유하게 합니다.',
  },
  {
    values: [
      ['등장 인물', '하린'],
      ['배치·거리', '하린이 의자에 등을 기대며 화면에서 물러남'],
      ['자세·행동', '연필을 내려놓고 천장을 봄'],
      ['표정·시선', '초점 없는 시선 · 피로'],
      ['이동 소품', '연필이 노트 위에 놓임'],
      ['보이는 배경', '천장 형광등 · 실험대 윗면'],
    ],
    interpretation: '몸이 뒤로 물러나는 동작이 진전 없음을 말로 설명하지 않고 자세만으로 읽히게 합니다.',
  },
  {
    values: [
      ['등장 인물', '하린'],
      ['배치·거리', '하린이 다시 화면 쪽으로 상체를 기울임'],
      ['자세·행동', '손가락으로 화면 위 봉우리 간격을 짚어 나가다 멈춤'],
      ['표정·시선', '시선이 한 지점에 고정됨'],
      ['이동 소품', '연필은 아직 노트 위'],
      ['보이는 배경', '그래프가 떠 있는 화면'],
    ],
    interpretation: '멈춘 손이 대사 없이 인지의 전환을 표시해, 다음 컷의 근거 제시를 기다리게 만듭니다.',
  },
  {
    values: [
      ['등장 인물', '하린 (손만)'],
      ['배치·거리', '카메라가 노트 지면까지 접근'],
      ['자세·행동', '짧은 식 하나를 적고 여러 번 동그라미를 그림'],
      ['표정·시선', '얼굴은 프레임 밖 · 시선 정보 없음'],
      ['이동 소품', '연필 끝이 종이를 눌러 자국을 냄'],
      ['보이는 배경', '지워진 시도들과 지우개 자국'],
    ],
    interpretation: '인물을 지우고 근거만 남겨, 발견이 감정 이전에 사실로 먼저 제시됩니다.',
  },
  {
    values: [
      ['등장 인물', '하린'],
      ['배치·거리', '얼굴이 프레임을 채움 · 배경은 어둠으로 제거'],
      ['자세·행동', '움직이지 않음'],
      ['표정·시선', '시선이 화면을 지나 먼 곳에 머묾 · 입술이 살짝 벌어짐'],
      ['이동 소품', '없음'],
      ['보이는 배경', '아래에서 올라오는 화면 불빛만'],
    ],
    interpretation: '배경을 지운 정지가 놀람이 아니라 이해가 도착한 순간으로 읽히게 합니다.',
  },
  {
    values: [
      ['등장 인물', '하린'],
      ['배치·거리', '하린이 실험대를 떠나 창가로 이동 · 프레임에서 다시 작아짐'],
      ['자세·행동', '창 앞에 서서 등을 보임 · 노트를 든 손이 옆으로 내려감'],
      ['표정·시선', '얼굴은 보이지 않음 · 시선은 창밖 도시로'],
      ['이동 소품', '노트: 실험대 → 하린의 손'],
      ['보이는 배경', '비에 젖은 창 · 흩어진 도시 불빛'],
    ],
    interpretation: '첫 컷의 넓은 크기로 되돌아오지만 인물의 방향이 바뀌어, 같은 공간이 다르게 읽히는 전환점이 됩니다.',
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
      '빛의 섬 안에 인물 가두기',
      '어깨 뒤로 카메라 붙이기',
      '의자를 뒤로 물리기',
      '다시 화면 쪽으로 기울이기',
      '인물을 프레임에서 빼기',
      '얼굴만 남기고 공간 지우기',
      '실험대에서 창가로 옮기기',
    ],
    proposals: [
      '하린을 형광등 불빛이 닿는 영역 안에만 두고, 나머지 실험대는 어둠에 남겨 긴 대각선을 만듭니다.',
      '카메라를 하린의 어깨 뒤에 붙여 인물과 화면을 한 축 위에 겹쳐 둡니다.',
      '하린이 의자째 뒤로 물러나 책상과의 거리를 벌리고, 빈 공간이 화면에 들어오게 합니다.',
      '하린이 다시 상체를 화면 쪽으로 기울여 앞서 벌어진 거리를 스스로 되돌리게 합니다.',
      '인물을 프레임 밖으로 빼고 노트 지면만 남겨 근거가 공간을 독점하게 합니다.',
      '배경을 어둠으로 지우고 얼굴만 남겨 공간 정보를 일시적으로 제거합니다.',
      '하린을 실험대에서 창가로 이동시켜 첫 컷과 같은 넓이에 다른 방향을 만듭니다.',
    ],
    gain: '인물과 발견의 관계 변화를 공간으로 명확하게 만듦',
    cost: '배치가 너무 도식적으로 보일 수 있음',
  },
  {
    id: 'performance',
    approach: '연기 동작',
    titles: [
      '고쳐 앉는 동작 한 번만',
      '적고 지우기를 반복하기',
      '연필을 내려놓게 하기',
      '짚어 가던 손을 멈추기',
      '동그라미를 여러 번 겹치기',
      '숨과 함께 정지시키기',
      '노트를 쥔 손을 내리기',
    ],
    proposals: [
      '하린이 자세를 고쳐 앉는 짧은 동작 하나만 허용해, 오래 앉아 있었다는 시간을 몸으로 보여줍니다.',
      '몇 줄 적고 선을 그어 지우는 동작을 같은 리듬으로 반복해 진전 없음을 손에 싣습니다.',
      '연필을 소리 없이 내려놓고 천장을 보게 해, 포기 직전의 정지를 만듭니다.',
      '화면 위를 짚어 가던 손가락을 한 지점에서 멈추고 그대로 두어 인지의 전환을 표시합니다.',
      '동그라미를 한 번에 그리지 않고 세 번 겹쳐 그려 확신이 쌓이는 시간을 만듭니다.',
      '표정을 바꾸지 않고 숨만 멈추게 해, 깨달음을 표정 연기가 아니라 정지로 전달합니다.',
      '창 앞에 선 뒤 노트를 든 손의 힘이 풀려 옆으로 내려가게 합니다.',
    ],
    gain: '대사 없이도 인물의 사고와 감정을 드러냄',
    cost: '미세한 동작은 작은 패널에서 약하게 읽힐 수 있음',
  },
  {
    id: 'eyeline',
    approach: '시선 설계',
    titles: [
      '화면에 시선 고정하기',
      '화면과 노트를 오가게 하기',
      '초점 없는 시선 만들기',
      '간격을 눈으로 짚어 나가기',
      '시선 정보를 아예 빼기',
      '화면 너머 먼 곳 보기',
      '창밖으로 시선 놓아주기',
    ],
    proposals: [
      '하린의 시선을 화면 한 곳에만 고정해, 방의 나머지를 보지 않고 있다는 몰입을 만듭니다.',
      '시선이 화면과 노트 사이를 규칙적으로 오가게 해 대조 작업 중임을 보여줍니다.',
      '시선의 초점을 풀어 천장에 두게 해, 보고 있지만 읽지 않는 상태를 만듭니다.',
      '시선이 그래프의 봉우리를 순서대로 훑다가 한 지점에서 멈추게 합니다.',
      '얼굴을 프레임 밖에 두어 시선 정보를 제거하고 손과 지면만 남깁니다.',
      '시선을 화면 표면이 아니라 그 너머 먼 곳에 두어 생각이 방을 떠났음을 보여줍니다.',
      '뒷모습만 보여 시선을 관객이 창밖 풍경으로 대신 따라가게 합니다.',
    ],
    gain: '관객의 주의를 대사 없이 필요한 정보로 이동시킴',
    cost: '시선 방향이 불분명하면 의도가 사라짐',
  },
  {
    id: 'prop',
    approach: '소품 동선',
    titles: [
      '노트를 아직 열지 않기',
      '연필을 손에 쥐여 두기',
      '연필을 노트 위에 눕히기',
      '연필을 아직 들지 않기',
      '연필 자국을 남기게 하기',
      '소품을 프레임에서 비우기',
      '노트를 들고 나가게 하기',
    ],
    proposals: [
      '노트를 덮어 둔 채 화면만 켜 두어, 이후 노트가 열리는 순간을 전환점으로 남깁니다.',
      '연필을 계속 손에 쥐게 해 지우고 다시 쓰는 반복이 소품 하나로 이어지게 합니다.',
      '연필을 노트 위에 눕혀 두어 작업이 멈춘 상태를 소품 위치로 표시합니다.',
      '연필을 아직 들지 않은 채 손가락으로만 화면을 짚어, 확신 전과 후를 소품으로 나눕니다.',
      '연필 끝이 종이를 눌러 자국이 남게 해, 확신의 크기를 필압으로 보이게 합니다.',
      '얼굴 컷에서는 노트와 연필을 모두 비워 감정만 남깁니다.',
      '노트를 실험대에 두지 않고 손에 들려 창가까지 따라오게 해 발견이 인물에 붙어 있게 합니다.',
    ],
    gain: '소품 공개와 이동이 행동의 전환점이 됨',
    cost: '소품 정보가 서사보다 먼저 강조될 수 있음',
  },
  {
    id: 'set',
    approach: '세트 활용',
    titles: [
      '형광등 하나만 살려 두기',
      '화면을 유일한 광원으로 쓰기',
      '천장을 화면에 들이기',
      '빗소리로 정적 만들기',
      '지운 흔적을 함께 보이기',
      '형광등을 한 번 깜빡이기',
      '창을 두 번째 화면으로 쓰기',
    ],
    proposals: [
      '천장 형광등 하나만 켜 두고 나머지를 꺼, 넓은 공간에서 인물의 자리를 조명으로 지정합니다.',
      '노트북 화면을 얼굴의 유일한 광원으로 삼아 작업 대상이 곧 빛의 출처가 되게 합니다.',
      '하린이 기댈 때 천장이 프레임에 들어오게 해, 시선이 갈 곳 없는 상태를 공간으로 보여줍니다.',
      '창밖 빗소리만 남기고 다른 소리를 비워, 멈춘 손의 순간이 정적 위에 놓이게 합니다.',
      '동그라미 주변에 지우개 자국과 그어 지운 시도를 함께 보여 발견의 대가를 지면에 남깁니다.',
      '깨달음 직후 형광등을 한 번 깜빡여 인물 대신 공간이 반응하게 합니다.',
      '비에 젖은 창을 도시를 비추는 두 번째 화면으로 써서 노트북 화면과 대응시킵니다.',
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
  '공간 설명과 인물 제시가 한 Shot에 이어져 장면의 시작이 늦어질 수 있습니다.',
  '화면 보기와 적고 지우기가 같은 호흡 안에 있어 작업의 반복을 분리할 여지가 있습니다.',
  '연필을 내려놓는 동작과 천장을 보는 정지가 연속되어 어느 쪽을 정체의 표시로 삼을지 정해야 합니다.',
  '손이 화면을 짚어 가는 시간과 멈추는 순간 사이의 컷 지점이 발견의 속도를 결정합니다.',
  '식을 적는 동작과 동그라미가 겹쳐 결정적 근거가 묻힐 수 있습니다.',
  '깨달음의 정지를 얼마나 유지할지가 장면의 정서적 무게를 결정합니다.',
  '일어서기부터 창가 도착까지 이동이 길게 이어져 분할 지점을 명확히 해야 합니다.',
]

const MOCK_EDITING_SINGLE_OPERATIONS = [
  {
    id: 'trim-head',
    operation: '앞부분 줄이기',
    titles: [
      '형광등이 이미 켜진 상태에서 시작',
      '이미 적고 있는 손부터 진입',
      '연필을 놓는 동작부터 시작',
      '손이 화면에 닿은 뒤부터',
      '연필이 종이에 닿는 순간부터',
      '고개가 이미 들린 상태에서 진입',
      '창가에 도착한 뒤부터 시작',
    ],
    proposals: [
      '실내를 훑는 앞부분을 생략하고 인물이 이미 앉아 작업 중인 상태에서 Shot을 시작합니다.',
      '노트를 펴는 준비 동작을 덜고 이미 식을 적어 내려가는 손에서 Shot을 시작합니다.',
      '화면을 보던 시간을 줄이고 연필을 내려놓는 동작을 첫 프레임의 행동으로 둡니다.',
      '상체를 기울이는 준비를 덜고 손가락이 화면에 닿은 지점에서 Shot을 엽니다.',
      '노트를 끌어당기는 동작을 생략하고 연필 끝이 종이에 닿는 순간에 들어갑니다.',
      '고개를 드는 과정을 덜고 이미 먼 곳을 보고 있는 상태에서 Shot을 시작합니다.',
      '실험대에서 창가까지의 이동을 생략하고 창 앞에 선 뒤부터 시작합니다.',
    ],
    purpose: 'Shot의 핵심 행동에 더 빠르게 진입',
    watch: '공간이나 행동의 원인이 부족해질 수 있음',
  },
  {
    id: 'split',
    operation: '샷 나누기',
    titles: [
      '공간 설명 뒤 인물로 분리',
      '화면과 노트를 나누기',
      '기대는 동작에서 분할',
      '멈춘 손을 별도 Shot으로',
      '적기와 동그라미 분리',
      '깨달음 뒤 공간으로 분할',
      '일어서기와 창가 도착 분리',
    ],
    proposals: [
      '공간을 설명하는 넓은 크기를 먼저 끝내고, 인물에 붙는 크기를 다음 Shot으로 분리합니다.',
      '화면의 그래프와 노트의 필기를 서로 다른 Shot으로 나눠 대조 작업을 명시합니다.',
      '연필을 내려놓는 순간 컷하고, 의자에 기대는 동작을 다음 Shot의 시작으로 둡니다.',
      '화면을 짚어 가던 손이 멈추는 순간을 짧은 Insert Shot으로 분리합니다.',
      '식을 적는 동작 뒤 컷하고 동그라미를 겹쳐 그리는 행동을 별도 Shot으로 만듭니다.',
      '하린의 얼굴과 형광등이 깜빡이는 공간을 서로 다른 Shot으로 나눕니다.',
      '의자가 밀리는 순간 컷하고, 창 앞에 선 상태부터 다음 Shot을 시작합니다.',
    ],
    purpose: '한 Shot에 겹친 행동의 전환점을 분명하게 만듦',
    watch: '컷 수가 늘어 장면의 연속된 흐름이 약해질 수 있음',
  },
  {
    id: 'hold-tail',
    operation: '끝 반응 유지',
    titles: [
      '빈 공간의 정적을 유지',
      '지우는 동작을 한 번 더',
      '천장을 보는 시간 남기기',
      '멈춘 손을 한 박자 더',
      '동그라미 뒤 지면 유지',
      '깨달음의 정지를 길게',
      '창밖을 보는 시간 확보',
    ],
    proposals: [
      '인물이 등장한 뒤 바로 넘어가지 않고 빈 실험실의 정적을 한 박자 유지합니다.',
      '적고 지우는 동작을 한 번 더 반복해 진전 없음이 관객에게 도착할 시간을 남깁니다.',
      '연필을 내려놓은 뒤 천장을 보는 상태를 짧게 더 남겨 정체를 체감하게 합니다.',
      '손이 멈춘 뒤 바로 컷하지 않고 그 정지를 한 박자 유지합니다.',
      '동그라미를 다 그린 뒤에도 지면을 잠시 더 보여 근거가 읽힐 시간을 줍니다.',
      '표정이 바뀌지 않는 정지를 평소보다 길게 유지해 깨달음의 무게를 확보합니다.',
      '창 앞에 선 뒷모습을 오래 유지해 장면이 닫히는 시간을 만듭니다.',
    ],
    purpose: '반응과 정보가 관객에게 도착할 시간을 확보',
    watch: '흐름을 밀어야 할 구간에서는 리듬이 처질 수 있음',
  },
  {
    id: 'pickup',
    operation: '연결 컷·지점',
    titles: [
      '형광등과 빗물 창 Detail',
      '연필 쥔 손을 연결점으로',
      '기대는 동작에 Match cut',
      '하린의 Eyeline을 화면 Insert로',
      '필압 자국 Detail 확보',
      '깜빡이는 형광등으로 연결',
      '내려가는 손을 행동 연결점으로',
    ],
    proposals: [
      '켜진 형광등과 빗물이 흐르는 창을 짧은 Detail Shot으로 확보해 시간과 날씨를 고정합니다.',
      '연필을 고쳐 쥐는 손동작을 다음 작업 Shot의 연결점으로 사용합니다.',
      '의자에 기대는 움직임 중간에서 컷해 다음 각도의 같은 동작과 이어 붙입니다.',
      '하린의 시선 방향을 받아 그래프 화면 Insert로 연결하고 같은 Eyeline으로 돌아옵니다.',
      '연필 끝이 종이를 눌러 자국이 남는 순간을 Detail Shot으로 확보합니다.',
      '깨달음의 얼굴에서 형광등이 깜빡이는 짧은 Shot으로 연결해 정적을 끊습니다.',
      '노트를 든 손이 옆으로 내려가는 움직임을 따라 컷하고 창밖 풍경으로 이어 붙입니다.',
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
    title: '공간에서 작업으로 연결',
    proposal: 'S1은 인물이 화면을 들여다보기 시작하는 순간 끝내고, S2는 이미 적고 있는 손에서 바로 시작합니다.',
  },
  {
    kind: 'retime',
    operation: '행동 연결',
    title: '지우는 손에서 내려놓기로',
    proposal: 'S2는 마지막으로 선을 그어 지우는 순간 자르고, S3는 연필을 내려놓는 동작부터 시작합니다.',
  },
  {
    kind: 'retime',
    operation: '시선 연결',
    title: '하린의 시선을 화면으로 연결',
    proposal: 'S3는 시선이 천장에서 내려오는 순간 끝내고, S4는 그녀가 바라본 그래프 화면으로 시작합니다.',
  },
  {
    kind: 'retime',
    operation: '행동 연결',
    title: '멈춘 손에서 연필로',
    proposal: 'S4는 손가락이 화면 위에서 멈춘 직후 끝내고, S5는 연필 끝이 종이에 닿는 움직임으로 시작합니다.',
  },
  {
    kind: 'retime',
    operation: '시선 연결',
    title: '지면에서 얼굴로 연결',
    proposal: 'S5는 동그라미가 완성되는 순간 끝내고, S6는 고개를 든 하린의 얼굴로 시작합니다.',
  },
  {
    kind: 'retime',
    operation: '행동 연결',
    title: '정지에서 일어서기로',
    proposal: 'S6는 하린의 정지가 풀리는 순간 끝내고, S7는 의자가 뒤로 밀리는 움직임으로 시작합니다.',
  },
]

const MOCK_EDITING_OUTGOING_BOUNDARIES = [
  {
    kind: 'insert',
    operation: '새 샷 추가',
    title: '노트와 연필 Shot을 S1 뒤에 추가',
    proposal: 'S1과 S2 사이에 임시 Shot을 추가합니다. 새 패널에는 실험대 위에 놓인 노트와 연필만 표시합니다.',
  },
  {
    kind: 'insert',
    operation: '새 샷 추가',
    title: '지워진 식 Shot을 S2 뒤에 추가',
    proposal: 'S2와 S3 사이에 임시 Shot을 추가합니다. 새 패널에는 선을 그어 지운 흔적이 쌓인 노트 지면을 표시합니다.',
  },
  {
    kind: 'insert',
    operation: '새 샷 추가',
    title: '천장 형광등을 S3 뒤에 추가',
    proposal: 'S3와 S4 사이에 임시 Shot을 추가합니다. 새 패널에는 하린이 올려다본 천장 형광등을 표시합니다.',
  },
  {
    kind: 'insert',
    operation: '새 샷 추가',
    title: '그래프 화면 Shot을 S4 뒤에 추가',
    proposal: 'S4와 S5 사이에 임시 Shot을 추가합니다. 새 패널에는 일정한 간격이 드러나는 그래프 화면을 표시합니다.',
  },
  {
    kind: 'insert',
    operation: '새 샷 추가',
    title: '연필을 쥔 손 Shot을 S5 뒤에 추가',
    proposal: 'S5와 S6 사이에 임시 Shot을 추가합니다. 새 패널에는 동그라미를 다 그린 뒤 멈춘 하린의 손을 표시합니다.',
  },
  {
    kind: 'insert',
    operation: '새 샷 추가',
    title: '밀려난 의자 Shot을 S6 뒤에 추가',
    proposal: 'S6와 S7 사이에 임시 Shot을 추가합니다. 새 패널에는 하린이 일어선 뒤 비어 뒤로 밀린 의자를 표시합니다.',
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
// 씬 안에서 변할 수 있는 항목. 나머지는 사람이 바뀌지 않는 한 그대로다 —
// 다섯 항목이 각자 `+ 변화` 버튼을 갖고 있어 화면이 복잡했다.
const CHANGEABLE_FACT_LABELS = new Set(['상태', '시간', '고정 소품'])

// 변화를 적는 폼. 전에는 카드 밖 아래쪽에 따로 떠서, 어느 항목의 변화를
// 쓰는지 스크롤해 올라가 확인해야 했다. 항목 바로 아래에서 쓴다.
function FactChangeForm({ draft, shots, onChange, onCancel, onSave }) {
  return (
    <div className="mise-change-inline">
      <label>
        <span>시작 컷</span>
        <select
          value={draft.cutId || ''}
          onChange={(event) => onChange({ ...draft, cutId: event.target.value })}
        >
          {/* 컷과 이어지지 않은 패널은 고를 수 없다 — 변화는 컷 id로 기록된다. */}
          {shots.filter((shot) => shot.cutPlanItemId).map((shot, index) => (
            <option
              key={shot.id}
              value={shot.cutPlanItemId}
              disabled={
                shot.cutPlanItemId !== draft.originalCutId
                && draft.takenCutIds?.includes(shot.cutPlanItemId)
              }
            >
              S{index + 1}
            </option>
          ))}
        </select>
      </label>
      <input
        value={draft.value}
        placeholder="이렇게 바뀐다 · 예: 오래 앉아 지친 상태"
        autoFocus
        onChange={(event) => onChange({ ...draft, value: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel()
          if (event.key === 'Enter' && draft.value.trim() && draft.cutId) onSave()
        }}
      />
      <div>
        <button
          type="button"
          className="mise-change-save"
          disabled={!draft.value.trim() || !draft.cutId}
          onClick={onSave}
        >
          {draft.editing ? '저장' : '추가'}
        </button>
        <button type="button" onClick={onCancel}>취소</button>
      </div>
    </div>
  )
}

function SceneFactChanges({
  fact, group, characterId = null, shots, onAdd, onRemove, disabled = false,
  // 이 항목의 변화를 쓰는 중이면 폼을 여기에 그린다.
  draft = null, onDraftChange, onDraftCancel, onDraftSave,
}) {
  if (fact.open) return null
  // 생김새(성별·나이·체형·외형)에는 변화를 걸 수 없다.
  if (!CHANGEABLE_FACT_LABELS.has(fact.label) && !(fact.changes || []).length) return null
  // 보기 모드에서 변화가 하나도 없으면 이 항목은 씬 내내 그대로라는 뜻이다.
  // 값은 위에 이미 적혀 있으므로 "처음 상태" 한 줄짜리 표를 덧붙이면 같은
  // 것을 두 번 말한다.
  if (disabled && !(fact.changes || []).length) return null

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
    <section
      // 변화가 없으면 머리글과 목록을 접는다. 값마다 `상태 진행` 상자가
      // 붙으면 화면이 상자로 뒤덮인다.
      className={`mise-fact-timeline${orderedChanges.length === 0 && !draft ? ' is-empty' : ''}`}
      aria-label={`${fact.label} 상태 진행`}
    >
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
              {/* 보기 모드에서는 손잡이를 흐리게 두지 않고 아예 없앤다.
                  비활성 버튼이 줄마다 붙으면 "지금 못 누르는 것"이 화면을
                  채워, 읽으러 온 사람에게 할 일처럼 보인다. */}
              {!isInitial && !disabled && (
                <button
                  type="button"
                  className="mise-fact-stage-edit"
                  onClick={() => openStageEditor(stage)}
                >수정</button>
              )}
              {!isInitial && !disabled && (
                <button
                  type="button"
                  className="mise-fact-stage-remove"
                  aria-label={`${label} 상태 삭제`}
                  onClick={() => onRemove(group, fact.label, stage.cutId, { characterId })}
                >×</button>
              )}
            </li>
          )
        })}
      </ol>
      {draft ? (
        <FactChangeForm
          draft={draft}
          shots={shots}
          onChange={onDraftChange}
          onCancel={onDraftCancel}
          onSave={onDraftSave}
        />
      ) : disabled ? null : (
        <button
          type="button"
          className="mise-fact-add-change"
          disabled={!nextShot}
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
      )}
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
          <span>관객이 헷갈릴 수 있는 지점 · {targetLabel}</span>
          <strong>이 부분을 고칠까요, 의도대로 둘까요?</strong>
        </div>
        {status && <em className={status}>{status === 'revise' ? '수정 검토' : status === 'retain' ? '의도적으로 유지' : '보류'}</em>}
      </header>
      <div className="viewer-decision-layers">
        <p><strong>화면에서 본 근거</strong>{evidence.join(' · ') || '특정 근거 없음'}</p>
        <p><strong>이렇게 읽혔어요</strong>{interpretations.join(' / ') || '뚜렷한 해석 차이 없음'}</p>
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
      {/* 이 지적을 어디서 고치는지는 판정 전에도 보여야 한다. 새눈이 카드는
          바로 보여 주는데 여기만 `수정 검토`를 누른 뒤에 나타나서, 감독이
          고칠 자리를 보지 못한 채 판정하게 됐다.
          판정 후에는 강조해 다음 할 일로 읽히게 한다. */}
      {routes.length > 0 && (
        <div className={`viewer-decision-routes${status === 'revise' ? ' is-active' : ''}`}>
          {routes.map((route) => (
            <button
              key={route}
              type="button"
              onClick={() => onRoute(route, panelOrders, {
                title: status === 'revise'
                  ? '제작자가 수정 검토로 남긴 읽힘'
                  : '관객이 헷갈릴 수 있는 지점',
                interpretations,
                visibleCues: evidence,
              })}
            >
              {route === 'narrative' ? '대본' : route === 'mise' ? '미장센' : route === 'camera' ? '촬영' : '편집'}에서 검토
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
  // 축·화면 방향은 컷 표의 샷 값만으로 풀리지 않는 일이 많다. 목적지가
  // `cutplan` 하나뿐이면 그것이 화면에서 걸러진 뒤 남는 길이 없어, 카드에
  // `메모로 남기기`만 놓인 채 고칠 자리가 사라진다.
  'camera-axis-direction': ['cutplan', 'prompt'],
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

// 편집 대안은 이미지 프롬프트를 바꾸는 선택지가 아니다. 모델이 준 문장에
// 따라 해당 패널 또는 이음새의 구조 도구를 열어, 무엇이 변하는지 보면서
// 확정하게 한다.
const editingActionFor = (alternative) => {
  const text = `${alternative?.label || ''} ${alternative?.effect || ''}`.toLowerCase()
  if (/(삭제|제거|빼기|delete|remove|omit|drop)/.test(text)) return { id: 'delete', label: '이 패널 삭제' }
  if (/(분할|나누기|쪼개|split|divide|break)/.test(text)) return { id: 'split', label: '이음새에서 분할' }
  if (/(삽입|추가|넣기|insert|add|reaction shot|bridge shot|insert shot)/.test(text)) return { id: 'insert', label: '이음새에 삽입' }
  if (/(병합|합치|merge|combine|condense)/.test(text)) return { id: 'merge', label: '앞 컷과 병합' }
  return { id: 'seam', label: '이음새에서 조정' }
}


function DirectingReviewResult({
  run, onTool, onApply, onOpenPrompt, onSavePrompt, promptDrafts,
  rewritingId, rewriteNotes, promptBefore, applyingId, promptGenerationStatus,
  cutOf, lensName, lensId, onFocusDiagnosis, focusedShotIndex, editingOperationCompletions,
  // `check` 질문에 감독이 답한 것을 실어 다시 분석한다.
  onAnswerCheck, answering,
  // 고른 선택지들을 한 번에 적용한다.
  onApplyBatch,
  // 다시 그린 그림을 받을지 버릴지. 판정은 감독이 선택지를 고른 자리에서
  // 한다 — 결과 카드 위에 두면 내려둔 스크롤 밖에 남는다.
  revisionPending, onAcceptRevision, onRejectRevision,
}) {
  const result = run.result
  const diagnoses = result?.diagnoses || []
  const question = run.questions?.[0]
  const assessments = result?.level_assessments || []
  const statusLabel = { keep: '현재 유지', check: '확인할 점', change: '수정 필요' }
  const statusClass = { keep: 'clear', check: 'check', change: 'has-issue' }
  const diagnosisByLevel = new Map(diagnoses.map((diagnosis) => [diagnosis.level, diagnosis]))

  // 어느 층위를 펴 두었나. `open`을 계산값으로만 주면 React가 매 렌더마다
  // 그 값으로 되돌려, 감독이 눌러도 `keep` 카드는 열리지 않고 `change`
  // 카드는 닫히지 않는다. 처음 상태는 판정에서 정하고 그 뒤는 여기서 든다.
  const [openLevels, setOpenLevels] = useState(null)
  // `check` 질문에 쓰는 답. 층위별로 따로 든다.
  const [answerDrafts, setAnswerDrafts] = useState({})
  // 함께 적용하려고 고른 선택지들. `진단id::선택지label`로 든다.
  //
  // 하나씩 적용하면 그때마다 그림을 다시 그린다. 셋을 고치려면 같은 패널을
  // 세 번 그리고 앞의 두 장은 버려진다 — 시간도 비용도 세 배다. 더 나쁜 것은
  // 중간 결과가 감독을 오도한다는 점이다. 앵글만 바꾼 그림을 보고 판단하지만
  // 정작 셋을 다 적용해야 의도한 화면이 나오는 경우가 있다.
  const [pickedAlternatives, setPickedAlternatives] = useState(() => new Set())
  const togglePicked = (key) => setPickedAlternatives((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  const initialOpen = assessments
    .filter((assessment) => assessment.status === 'change' || assessment.open_question)
    .map((assessment) => assessment.level)
  const openSet = openLevels ?? new Set(initialOpen)
  const toggleLevel = (level) => setOpenLevels((current) => {
    const next = new Set(current ?? initialOpen)
    if (next.has(level)) next.delete(level)
    else next.add(level)
    return next
  })

  // 고른 선택지들을 실제 객체로 되찾는다.
  const pickedEntries = diagnoses.flatMap((diagnosis) => (
    (diagnosis.alternatives || [])
      .filter((alternative) => pickedAlternatives.has(`${diagnosis.id}::${alternative.label}`))
      .map((alternative) => ({ diagnosis, alternative }))
  ))
  // 두 선택지가 같은 항목을 서로 다른 값으로 바꾸려 하면 나중 것이 앞의 것을
  // 덮는다. 조용히 덮으면 감독은 고른 것 중 하나가 사라진 줄 모른다.
  const pickedFieldValues = {}
  const conflictFields = new Set()
  for (const { alternative } of pickedEntries) {
    for (const [field, value] of Object.entries(alternative.patch || {})) {
      if (!value) continue
      if (pickedFieldValues[field] && pickedFieldValues[field] !== value) {
        conflictFields.add(field)
      }
      pickedFieldValues[field] = value
    }
  }
  const conflictLabels = { shot_size: '샷 사이즈', angle: '앵글', move: '카메라' }

  if (!result) return null

  return (
    <section
      /* 답을 받아 다시 도는 중에는 지난 판정을 지우지 않고 흐리게 둔다.
         감독이 방금 쓴 답과 그 답으로 무엇이 바뀌는지를 이어서 봐야 한다. */
      className={`directing-review-result${answering ? ' is-reanalyzing' : ''}`}
      aria-label={`${lensName} 분석 결과`}
      aria-busy={answering || undefined}
    >
      <div className="directing-review-result-heading">
        <div>
          <span>{lensName} 검토</span>
          <strong>어디를 볼지</strong>
        </div>
        {answering && <em className="directing-reanalyzing">답을 반영해 다시 분석 중…</em>}
      </div>

      <p className="directing-review-summary">{result.summary}</p>

      <div className="directing-level-list">
        {assessments.map((assessment) => {
          const diagnosis = diagnosisByLevel.get(assessment.level)
          const cameraArrowRelevant = diagnosis?.rule_id?.startsWith('camera-')
            && /(이동|방향|팬|틸트|트래킹|달리|줌|축)/.test(
              `${diagnosis.diagnosis} ${diagnosis.suggested_action}`,
            )
          // 펼쳐 둔 프롬프트 편집기. null이면 닫혀 있다.
          const promptDraft = diagnosis ? promptDrafts?.[diagnosis.id] ?? null : null
          const isRewriting = Boolean(diagnosis) && rewritingId === diagnosis.id
          const isGeneratingPrompt = Boolean(diagnosis)
            && promptGenerationStatus?.[diagnosis.id] === 'generating'
          const promptGenerated = Boolean(diagnosis)
            && promptGenerationStatus?.[diagnosis.id] === 'complete'
          const rewriteNote = diagnosis ? rewriteNotes?.[diagnosis.id] : null
          const beforeText = diagnosis ? promptBefore?.[diagnosis.id] : null
          return (
            /* check는 감독이 답해야 무엇이 갈리는 층위다. 접어 두면 그
               질문이 보이지 않는다. */
            <details
              key={assessment.level}
              className={`directing-level-card ${statusClass[assessment.status]}`}
              open={openSet.has(assessment.level)}
            >
              {/* 기준은 이 카드를 펴야 보인다. summary 클릭만 센다 —
                  기본 열림인 details는 마운트 때 onToggle이 한 번 발생해서
                  감독이 열지 않은 것까지 '봤다'로 세어진다. 접는 클릭도
                  들어오므로 열려 있던 카드를 접은 경우는 뺀다. */}
              <summary
                onClick={(event) => {
                  // open을 state로 들고 있으므로 브라우저 기본 동작을 막고
                  // 여기서 직접 토글한다. 막지 않으면 DOM과 state가 갈린다.
                  event.preventDefault()
                  const closing = openSet.has(assessment.level)
                  toggleLevel(assessment.level)
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
                <div className="directing-open-question">
                  <p>{assessment.open_question}</p>
                  {/* 질문만 두면 답할 자리가 없어 이 층위가 영원히 갈리지
                      않고, 다시 분석할 때마다 같은 질문이 나온다. 답을 받아
                      의도와 함께 보내면 렌즈가 keep으로 내리거나 change로
                      올려 선택지를 낸다 (발견과 처분의 분리). */}
                  <textarea
                    value={answerDrafts[assessment.level] || ''}
                    placeholder="화면만으로는 알 수 없는 것입니다 — 짧게 답해 주세요"
                    rows={2}
                    onChange={(event) => setAnswerDrafts((current) => ({
                      ...current,
                      [assessment.level]: event.target.value,
                    }))}
                  />
                  <button
                    type="button"
                    disabled={answering || !(answerDrafts[assessment.level] || '').trim()}
                    onClick={() => onAnswerCheck?.({
                      level: DIAGNOSTIC_LEVEL_LABELS[assessment.level] || assessment.level,
                      question: assessment.open_question,
                      answer: answerDrafts[assessment.level].trim(),
                    })}
                  >
                    {answering ? '다시 분석 중…' : '이 답으로 다시 분석'}
                  </button>
                  {/* 이 버튼은 네 렌즈를 다시 돌린다. "다시 봐줘"라고만 쓰면
                      이 카드 하나만 고쳐 본다는 뜻으로 읽혀, 다른 층위의
                      판단이 바뀌어 있는 것이 사고처럼 보인다. */}
                  <small>답을 의도에 더해 네 렌즈를 다시 돌립니다.</small>
                </div>
              )}
              {diagnosis && (
                <article
                  className="directing-diagnosis-card"
                  onClick={(event) => {
                    // 카드의 실행 버튼이나 텍스트 편집을 눌렀을 때까지 패널을
                    // 바꾸면 작업 중인 맥락이 튄다. 그 밖의 카드 영역은 곧
                    // 대상 패널을 여는 빠른 길이다.
                    if (event.target.closest('button, textarea, input, select, label')) return
                    onFocusDiagnosis?.(diagnosis)
                  }}
                >
                  <div className="directing-diagnosis-targets">
                    {diagnosis.targets.map((target) => {
                      const match = target.match(/^S(\d+)/)
                      const shotIndex = match ? Number(match[1]) - 1 : null
                      return (
                        <button
                          key={target}
                          type="button"
                          className={shotIndex === focusedShotIndex ? 'active' : ''}
                          onClick={() => onFocusDiagnosis?.(diagnosis, target)}
                        >
                          {target}
                        </button>
                      )
                    })}
                  </div>
                  {/* 무엇을 보고 내린 판단인가. 기준이 드러나야 감독이 그
                      판단 자체를 반박할 수 있다 — 진단만 있으면 판결이 된다. */}
                  {diagnosis.criterion && (
                    <p className="directing-criterion">이 기준으로 봤어요 · {diagnosis.criterion}</p>
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
                        {diagnosis.alternatives.map((alternative) => {
                          const patch = alternative.patch || {}
                          // 지금 값과 나란히 보인다 — 무엇에서 무엇으로
                          // 가는지 알아야 고를 수 있다.
                          const current = cutOf?.(diagnosis) || {}
                          const all = [
                            patch.shot_size && ['샷 사이즈', current.shotSize, patch.shot_size],
                            patch.angle && ['앵글', current.angle, patch.angle],
                            patch.move && ['카메라', current.cameraMove, patch.move],
                          ].filter(Boolean)
                          // 지금 값과 같으면 바뀌는 것이 아니다. 모델이 안
                          // 바뀌는 항목까지 채워 보내는 일이 있다.
                          const fields = all.filter(([, from, to]) => from !== to)
                          // 바꿀 것이 있었는데 전부 지금 값과 같아졌다면 이미
                          // 적용한 것이다. 그 사실을 말하지 않으면 눌렀을 때
                          // 줄이 사라지는 것으로만 보여 아무 일도 없던 것 같다.
                          const isApplied = all.length > 0 && fields.length === 0
                          // 값은 바꿨고 그림을 기다리는 중.
                          const isApplying = applyingId === `${diagnosis.id}::${alternative.label}`
                          const pickKey = `${diagnosis.id}::${alternative.label}`
                          // '그대로 두기'는 바꿀 것이 없으므로 읽기만 한다.
                          const isKeep = alternative.kind === 'keep'
                          // 진단 JSON에는 lens 필드가 없다. 결과가 어느 렌즈에서
                          // 왔는지는 이 결과를 렌더하는 보드가 알고 있다. diagnosis.lens
                          // 를 읽으면 편집 제안마저 프롬프트 수정으로 빠진다.
                          const editingAction = lensId === 'editing'
                            ? editingActionFor(alternative)
                            : null
                          const completedEditingAction = editingAction
                            ? editingOperationCompletions?.[`${diagnosis.id}::${alternative.label}`]
                            : null
                          const completionLabel = {
                            delete: '삭제됨',
                            split: '분할됨',
                            insert: '삽입됨',
                            merge: '병합됨',
                          }[completedEditingAction]
                          return (
                            <li
                              key={alternative.label}
                              className={`${isKeep ? 'is-keep' : ''}${isApplied ? ' is-applied' : ''}`}
                            >
                              <div className="directing-alternative-head">
                                <strong>{alternative.label}</strong>
                                {/* 고르는 자리에서 바로 바꾼다. 샷 값으로
                                    풀리지 않는 선택지는 프롬프트를 연다. */}
                                {!isKeep && (completionLabel ? (
                                  <em className="directing-alternative-applied">{completionLabel}</em>
                                ) : editingAction ? (
                                  <button
                                    type="button"
                                    onClick={() => onTool?.(editingAction.id, diagnosis, alternative)}
                                  >
                                    {editingAction.label}
                                  </button>
                                ) : isApplying ? (
                                  // 값은 바뀌었고 그림을 그리는 중. `적용됨`은
                                  // 그림까지 나와야 붙는다.
                                  <em className="directing-alternative-applying">
                                    그림을 생성하고 있습니다…
                                  </em>
                                ) : isApplied ? (
                                  <em className="directing-alternative-applied">새 그림 적용됨</em>
                                ) : fields.length > 0 ? (
                                  // 샷 값으로 풀리는 선택지는 모아서 한 번에
                                  // 적용한다. 하나씩 누르면 같은 패널을 여러 번
                                  // 그리게 되고, 중간 그림이 감독을 오도한다.
                                  <label className="directing-alternative-pick">
                                    <input
                                      type="checkbox"
                                      checked={pickedAlternatives.has(pickKey)}
                                      onChange={() => togglePicked(pickKey)}
                                    />
                                    <span>함께 적용</span>
                                  </label>
                                ) : (
                                  // 샷 값이 아니라 프롬프트를 고치는 선택지.
                                  // 문장을 열어 확인해야 하므로 묶지 않는다.
                                  <button
                                    type="button"
                                    onClick={() => onApply?.(diagnosis, alternative)}
                                  >
                                    프롬프트에 반영
                                  </button>
                                ))}
                              </div>
                              <p>{alternative.effect}</p>
                              {/* 무엇이 바뀌는지 누르기 전에 보인다. 적용한
                                  뒤에는 지금 값이 무엇인지 남겨 둔다. */}
                              {(fields.length > 0 || isApplied) && (
                                <dl className="directing-alternative-patch">
                                  {(isApplied ? all : fields).map(([label, from, to]) => (
                                    <div key={label}>
                                      <dt>{label}</dt>
                                      <dd>
                                        {!isApplied && (
                                          <>
                                            <s>{from || '미정'}</s>
                                            <i aria-hidden="true">→</i>
                                          </>
                                        )}
                                        <b>{to}</b>
                                      </dd>
                                    </div>
                                  ))}
                                </dl>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}
                  {diagnosis.theory_basis && (
                    <p className="directing-theory-basis">이론 근거 · {diagnosis.theory_basis}</p>
                  )}
                  {/* 프롬프트를 그 자리에서 고친다. 지금 프롬프트를 가져와
                      두므로 감독은 빈 칸이 아니라 고칠 문장에서 시작한다. */}
                  {promptDraft != null && (
                    <div className="directing-prompt-editor">
                      <span>
                        이 컷의 프롬프트
                        {isRewriting && <em> · 수정본 받는 중…</em>}
                        {isGeneratingPrompt && <em> · 그림을 생성하고 있습니다…</em>}
                        {promptGenerated && <em> · 새 그림을 적용했습니다</em>}
                      </span>
                      {/* 무엇을 바꿨는지 먼저 말한다. 두 문장을 나란히 놓고
                          비교하지 않아도 알 수 있어야 판정이 빨라진다. */}
                      {rewriteNote && (
                        <p className="directing-prompt-changed">{rewriteNote}</p>
                      )}
                      {/* 고치기 전 문장을 남겨 둔다. 수정본만 보이면 무엇이
                          달라졌는지 기억에 기대어 판정하게 되고, 되돌릴
                          근거도 사라진다. 읽기 전용이다 — 고칠 것은 아래다. */}
                      {beforeText && (
                        <div className="directing-prompt-before">
                          <span>
                            고치기 전
                            <button
                              type="button"
                              onClick={() => onOpenPrompt?.(diagnosis, beforeText)}
                            >
                              이걸로 되돌리기
                            </button>
                          </span>
                          <p>{beforeText}</p>
                        </div>
                      )}
                      {beforeText && <span className="directing-prompt-after-label">고친 뒤</span>}
                      <textarea
                        value={promptDraft}
                        rows={7}
                        disabled={isRewriting || isGeneratingPrompt}
                        onChange={(event) => onOpenPrompt?.(diagnosis, event.target.value)}
                      />
                      <div>
                        <button type="button" onClick={() => onOpenPrompt?.(diagnosis, null)}>
                          닫기
                        </button>
                        <button
                          type="button"
                          className="primary"
                          disabled={isRewriting || isGeneratingPrompt}
                          onClick={() => onSavePrompt?.(diagnosis)}
                        >
                          {isGeneratingPrompt ? '그림을 생성하고 있습니다…' : '프롬프트 적용'}
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="directing-diagnosis-actions">
                    <button type="button" onClick={() => onTool?.('memo', diagnosis)}>
                      메모로 남기기
                    </button>
                    {/* 이 진단에 실제로 해당하는 길만 남긴다. 컷 구성은
                        패널의 이음새로 하고, 프롬프트는 여기서 편다 —
                        어느 쪽도 다른 화면으로 나가지 않는다. */}
                    {/* 편집 진단의 처분 버튼은 아래에 반복하지 않는다.
                        삭제·분할·삽입은 해당 패널과 이음새 카드에서 바로
                        실행해야 어느 컷이 바뀌는지 분명하다. */}
                    {lensId !== 'editing' && destinationsFor(diagnosis)
                      .filter((destination) => (
                        destination !== 'arrow' || cameraArrowRelevant
                      ))
                      .filter((destination) => destination !== 'cutplan')
                      .map((destination, index) => (
                        <button
                          key={destination}
                          type="button"
                          className={index === 0 ? 'primary' : ''}
                          onClick={() => (destination === 'prompt'
                            ? onOpenPrompt?.(diagnosis)
                            : onTool?.(destination, diagnosis))}
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

      {/* 다시 그린 그림이 도착했다. 감독이 받을지 버릴지 정하기 전까지는
          아직 이 패널의 그림이 아니다 — 적용하는 순간 확정되면 결과를 보기
          전에 이미 바뀐 상태가 된다. */}
      {revisionPending && (
        <section className="directing-revision-verdict" role="status">
          <div>
            <strong>이 그림으로 바꿀까요?</strong>
            <small>왼쪽에 새로 그린 결과가 보입니다. 버리면 컷 값도 되돌립니다.</small>
          </div>
          <div className="directing-revision-actions">
            <button type="button" className="primary" onClick={onAcceptRevision}>
              이걸로 하기
            </button>
            <button type="button" onClick={onRejectRevision}>
              버리고 되돌리기
            </button>
          </div>
        </section>
      )}

      {/* 고른 선택지를 한 번에 적용한다. 그림은 한 번만 그린다 — 하나씩
          누르면 같은 패널을 여러 번 그리고 앞의 것들은 버려진다. */}
      {pickedEntries.length > 0 && (
        <div className="directing-batch-apply">
          <div>
            <strong>선택한 {pickedEntries.length}개를 함께 적용</strong>
            <small>그림은 한 번만 그립니다.</small>
          </div>
          {conflictFields.size > 0 && (
            <p className="directing-batch-conflict">
              {[...conflictFields].map((field) => conflictLabels[field] || field).join(', ')}
              을(를) 두 선택지가 서로 다르게 바꿉니다 — 하나만 두세요.
            </p>
          )}
          <div className="directing-batch-actions">
            <button
              type="button"
              className="primary"
              disabled={conflictFields.size > 0 || Boolean(applyingId)}
              onClick={() => {
                onApplyBatch?.(pickedEntries)
                setPickedAlternatives(new Set())
              }}
            >
              {applyingId ? '적용하는 중…' : '적용하고 그리기'}
            </button>
            <button type="button" onClick={() => setPickedAlternatives(new Set())}>
              선택 해제
            </button>
          </div>
        </div>
      )}

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
  // 진단 카드 안에서 펼친 프롬프트 편집기. 진단 id → 초안.
  const [promptDrafts, setPromptDrafts] = useState({})
  // 수정본을 받는 중인 진단 id. 기다리는 동안 그 사실을 보인다.
  const [promptRewriting, setPromptRewriting] = useState(null)
  // 적용을 눌러 그림을 다시 그리는 중인 선택지. `진단id::선택지label`.
  // 그림이 도착해야 `적용됨`이 되므로, 그 사이를 표시할 것이 필요하다.
  const [applyingAlternative, setApplyingAlternative] = useState(null)
  // 프롬프트 적용은 저장이 아니라 새 그림을 받는 작업이다. 진단별 상태를
  // 남겨 두어, 도착 뒤에도 사용자가 무엇이 완료됐는지 알 수 있게 한다.
  const [promptGenerationStatus, setPromptGenerationStatus] = useState({})
  // 어느 컷의 몇 번째 초안을 기다리는지 기록한다. 다른 컷의 초안 도착을
  // 지금 적용한 선택지의 완료로 오해하면 사진과 상태가 어긋난다.
  const [pendingPanelGeneration, setPendingPanelGeneration] = useState(null)
  // 무엇을 바꿨는지 한 줄. 감독이 두 문장을 나란히 비교하지 않아도 알게 한다.
  const [promptRewriteNotes, setPromptRewriteNotes] = useState({})
  // 수정본을 받기 직전의 문장. 이것이 없으면 고쳐진 문장만 남아, 감독은
  // 무엇이 달라졌는지 기억에 기대어 판정하게 된다.
  const [promptBefore, setPromptBefore] = useState({})
  const [selectedOptionIds, setSelectedOptionIds] = useState([])
  const [cameraPreview, setCameraPreview] = useState(null)
  const [cameraApplyHistory, setCameraApplyHistory] = useState([])
  const [editingSequencePreview, setEditingSequencePreview] = useState(null)
  const [lensFocusedShotIndex, setLensFocusedShotIndex] = useState(null)
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
  const sceneTimeFact = sceneState.environment?.facts?.find((fact) => fact.label === '시간') || null
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
  const activeSceneId = useStore(selectActiveSceneId)
  // key를 씬으로 한정한다. 씬 이름이 빠지면 씬 1을 그리는 동안 씬 2의
  // 같은 버튼까지 "그리는 중"으로 바뀐다.
  const isReferenceImagePending = (kind, subjectId = null) => (
    Boolean(referenceImagePending?.[referencePendingKey(activeSceneId, kind, subjectId)])
  )
  // 오류 문구는 이 씬에서 그리는 중인 것이 없을 때만 보인다. 다른 씬의
  // 작업까지 세면 남의 씬을 그리는 동안 이 씬의 오류가 가려진다.
  const anyReferenceImagePending = Object.keys(referenceImagePending || {})
    .some((key) => key.startsWith(`${activeSceneId}:`))
  // 항목 값에서 조립한 문장. 사용자가 고쳤으면 그것을 보여준다.
  //
  // 공간이면 도면을 문장으로 옮긴 것도 들어간다 — 실제로 그렇게 보내므로
  // 화면에도 같은 문장이 보여야 한다.
  const referencePromptOf = (subject, kind = 'character') => (
    subject?.promptOverride ?? buildReferencePrompt(
      subject,
      kind,
      kind === 'location' ? describeLayout(spatialElements) : '',
    ).auto
  )
  const removeFactChange = useStore((s) => s.removeFactChange)
  // 어느 컷부터 무엇으로 바뀌는지 입력받는 중.
  const [changeDraft, setChangeDraft] = useState(null)
  // 이 항목의 변화를 지금 쓰는 중인가. 폼을 항목 아래에 그리려면
  // 어느 항목인지 맞춰봐야 한다.
  const draftFor = (group, label, characterId = null) => (
    changeDraft
      && changeDraft.group === group
      && changeDraft.label === label
      && (changeDraft.characterId || null) === characterId
      ? changeDraft
      : null
  )
  const saveChangeDraft = () => {
    if (!changeDraft?.value.trim() || !changeDraft.cutId) return
    // 인물 카드는 편집 중에 draft(characterDraft)를 그린다. 스토어에만 쓰면
    // 화면에 안 나타나고, 이어서 Save를 누르면 draft가 스토어를 덮어써
    // 방금 넣은 변화가 사라진다 — draft에도 같이 넣는다.
    if (changeDraft.group === 'character' && characterDraft?.id === changeDraft.characterId) {
      setCharacterDraft((current) => (current ? {
        ...current,
        facts: current.facts.map((fact) => {
          if (fact.label !== changeDraft.label) return fact
          const kept = (fact.changes || []).filter((entry) => (
            entry.cutId !== changeDraft.cutId && entry.cutId !== changeDraft.originalCutId
          ))
          return {
            ...fact,
            changes: [...kept, { cutId: changeDraft.cutId, value: changeDraft.value.trim() }],
          }
        }),
      } : current))
    }
    addFactChange(
      changeDraft.group,
      changeDraft.label,
      changeDraft.cutId,
      changeDraft.value.trim(),
      { characterId: changeDraft.characterId },
    )
    // 시작 컷을 옮긴 경우 옛 자리의 변화를 지운다.
    if (changeDraft.originalCutId && changeDraft.originalCutId !== changeDraft.cutId) {
      removeFactChange(
        changeDraft.group,
        changeDraft.label,
        changeDraft.originalCutId,
        { characterId: changeDraft.characterId },
      )
    }
    setChangeDraft(null)
  }

  // 삭제도 draft와 스토어 양쪽에서 지운다. 한쪽만 지우면 Save 때 되살아난다.
  const removeCharacterAwareChange = (group, label, cutId, options = {}) => {
    if (group === 'character' && characterDraft?.id === options.characterId) {
      setCharacterDraft((current) => (current ? {
        ...current,
        facts: current.facts.map((fact) => (
          fact.label === label
            ? { ...fact, changes: (fact.changes || []).filter((entry) => entry.cutId !== cutId) }
            : fact
        )),
      } : current))
    }
    removeFactChange(group, label, cutId, options)
  }
  // 고른 구간 시점의 값으로 보여 준다. 정의는 아래 activeStage 계산 뒤에 있다.
  const miseCharactersRaw = sceneState.characters
  const [editingCharacterId, setEditingCharacterId] = useState(null)
  const [characterDraft, setCharacterDraft] = useState(null)
  // Scene State는 기본이 **보는 화면**이다. 감독은 여기 오기 전에 이미 컷을
  // 나누고 샷을 정하는 중이라, 기준까지 손보라고 열어 두면 할 일이 하나 더
  // 늘어난 것으로 읽힌다. 기준은 대개 AI가 채운 값이 맞으므로, 고칠 것이
  // 생겼을 때만 편집으로 들어간다 (발견과 처분의 분리).
  const [sceneStateEditing, setSceneStateEditing] = useState(false)
  const [locationReferenceOpen, setLocationReferenceOpen] = useState(false)
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
  // Decision Board의 한 컷은 그리드의 전역 선택(activeShot)을 계속 따라가지
  // 않는다. 검토를 시작한 컷의 ID를 잡아 두어, 다른 패널을 잠깐 열어도 의도·
  // 분석 결과·적용 대상이 바뀌지 않게 한다.
  const [singleScopeShotId, setSingleScopeShotId] = useState(null)
  const [rangeStart, setRangeStart] = useState(0)
  const [rangeEnd, setRangeEnd] = useState(0)
  const [scopePickerOpen, setScopePickerOpen] = useState(false)
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
  // 선택지를 그 자리에서 적용한다. 진단을 읽은 화면에서 바로 고쳐야
  // 발견한 자리와 고치는 자리가 갈리지 않는다 (design_goal.md DG2).
  const updateCutPlanItem = useStore((s) => s.updateCutPlanItem)
  const scenes = useStore((s) => s.scenes)
  const activeScene = useStore((s) => s.activeScene)
  const setFlowActiveShot = useStore((s) => s.setFlowActiveShot)
  const setFlowView = useStore((s) => s.setFlowView)
  const deleteCut = useStore((s) => s.deleteCut)
  const updateFlowShotById = useStore((s) => s.updateFlowShotById)
  const requestPanelTool = useStore((s) => s.requestPanelTool)
  const requestSeamFocus = useStore((s) => s.requestSeamFocus)
  const editingOperationCompletions = useStore((s) => s.editingOperationCompletions)
  const completeEditingOperation = useStore((s) => s.completeEditingOperation)
  const requestNarrativeSuggestions = useStore((s) => s.requestNarrativeSuggestions)
  const openDrawingWorkspace = useStore((s) => s.openDrawingWorkspace)
  const backToScript = useStore((s) => s.backToScript)
  const setActiveBeat = useStore((s) => s.setActiveBeat)
  const setMaximizedPanel = useStore((s) => s.setMaximizedPanel)
  const setLeftPanelVisible = useStore((s) => s.setLeftPanelVisible)
  const setZenMode = useStore((s) => s.setZenMode)
  const viewerFindingHandoff = useStore((s) => s.viewerFindingHandoff)
  const setViewerFindingHandoff = useStore((s) => s.setViewerFindingHandoff)
  const clearViewerFindingHandoff = useStore((s) => s.clearViewerFindingHandoff)
  const viewerDecisions = useStore((s) => s.viewerDecisions)
  const panelDraftImages = useStore((s) => s.panelDraftImages)
  const panelDraftVersions = useStore((s) => s.panelDraftVersions)
  // 다시 그린 그림을 받을지 버릴지. 적용하는 순간 확정되면 감독은 결과를
  // 보기 전에 이미 바꾼 상태가 된다.
  const panelRevisionPending = useStore((s) => s.panelRevisionPending)
  const beginPanelRevision = useStore((s) => s.beginPanelRevision)
  const acceptPanelRevision = useStore((s) => s.acceptPanelRevision)
  const rejectPanelRevision = useStore((s) => s.rejectPanelRevision)
  // 다시 그린 그림이 도착하면 `적용 중`을 푼다. 생성은 스토리보드 화면이
  // 하므로 완료 신호가 따로 없고, 초안 이미지가 바뀌는 것이 그 신호다.
  useEffect(() => {
    if (!applyingAlternative || !pendingPanelGeneration) return
    const arrivedVersion = panelDraftVersions[pendingPanelGeneration.shotId] || 0
    if (arrivedVersion <= pendingPanelGeneration.versionBefore) return
    if (applyingAlternative.startsWith('prompt:')) {
      const diagnosisId = applyingAlternative.slice('prompt:'.length)
      setPromptGenerationStatus((current) => ({ ...current, [diagnosisId]: 'complete' }))
    }
    setApplyingAlternative(null)
    setPendingPanelGeneration(null)
  }, [applyingAlternative, panelDraftVersions, pendingPanelGeneration])
  const saveViewerDecision = useStore((s) => s.saveViewerDecision)
  const scene = scenes[activeScene]
  const activeShot = scene?.activeShot ?? 0
  const activeBranch = scene?.activeBranch ?? 0
  const branch = scene?.branches?.[activeBranch]
  const shots = useMemo(() => branch?.shots || [], [branch?.shots])
  const scopedShotIndex = useMemo(() => {
    const lockedIndex = shots.findIndex((shot) => shot.id === singleScopeShotId)
    if (lockedIndex >= 0) return lockedIndex
    return Math.max(0, Math.min(activeShot, Math.max(shots.length - 1, 0)))
  }, [activeShot, shots, singleScopeShotId])
  const scopedShot = shots[scopedShotIndex] || null

  // 첫 진입 때만 현재 패널을 검토 대상으로 잡는다. 컷이 삭제됐거나 씬을
  // 바꿔 기존 ID가 사라진 경우에만 새 씬의 현재 패널로 안전하게 되돌린다.
  useEffect(() => {
    if (shots.length === 0) {
      if (singleScopeShotId !== null) setSingleScopeShotId(null)
      return
    }
    if (!singleScopeShotId || !shots.some((shot) => shot.id === singleScopeShotId)) {
      setSingleScopeShotId(shots[scopedShotIndex]?.id || null)
    }
  }, [shots, scopedShotIndex, singleScopeShotId])
  // 구간은 **이 씬 안에서만** 나뉜다. shots는 브랜치 전체(여러 씬)라, 그대로
  // 넘기면 `S1–S19`처럼 씬을 넘어가는 구간이 나온다 — sceneState는 한 씬의
  // 기준이므로 범위가 어긋난다.
  const sceneShots = useMemo(() => {
    const scenes = selectScenes(screenplay)
    const activeScriptScene = scenes.find((entry) => entry.id === activeSceneId)
    if (!activeScriptScene) return shots
    return shots.filter((shot) => {
      const cut = cutPlan.find((item) => item.id === shot.cutPlanItemId)
      const beat = cut?.beat ?? shot.scriptBeat ?? 0
      return beat >= activeScriptScene.startBeat && beat <= activeScriptScene.endBeat
    })
  }, [shots, cutPlan, screenplay, activeSceneId])

  // 이 씬의 첫 컷이 보드 전체에서 몇 번째인가. 라벨을 감독이 보는 컷 번호로
  // 맞추는 데 쓴다 — Scene 2의 첫 구간은 S1이 아니라 S16이다.
  const sceneNumberFrom = useMemo(() => {
    const first = sceneShots[0]
    if (!first) return 1
    const index = shots.findIndex((shot) => shot.id === first.id)
    return index >= 0 ? index + 1 : 1
  }, [sceneShots, shots])

  const spatialStages = useMemo(
    () => spatialStagesFor(sceneState, sceneShots, scene?.id, sceneNumberFrom),
    [scene?.id, sceneState, sceneShots, sceneNumberFrom],
  )
  // 지금 보고 있는 구간. Scene State는 씬 단위 화면이므로 "언제부터 무엇이
  // 달라지는가"가 먼저 보여야 한다 — 전에는 카드를 뒤집어 항목마다 들어가야
  // 변화를 볼 수 있었고, 여러 인물·공간의 변화가 같은 컷에서 함께 일어나는지
  // 알 수 없었다.
  //
  // 구간은 spatialStages를 그대로 쓴다. 2D 도면의 단계와 같은 기준이어야
  // 값과 배치가 갈리지 않는다.
  const activeStage = useMemo(() => (
    spatialStages.find((stage) => stage.id === activeSpatialStageId)
      || spatialStages[0]
      || null
  ), [spatialStages, activeSpatialStageId])

  const stageCutOrder = useMemo(
    () => new Map(cutPlan.map((cut, index) => [cut.id, index])),
    [cutPlan],
  )
  // 이 구간이 시작되는 컷의 **cutPlan 기준** 순번. activeStage.start는 씬 안의
  // 순번이라(sceneShots) 그대로 쓰면 factValueAt이 엉뚱한 시점을 본다.
  const stageCutIndex = useMemo(() => {
    const startCutId = sceneShots[activeStage?.start ?? 0]?.cutPlanItemId
    return startCutId != null ? (stageCutOrder.get(startCutId) ?? 0) : 0
  }, [sceneShots, activeStage, stageCutOrder])
  // 이 구간에서 처음 바뀌는 항목들. 무엇 때문에 이 구간이 생겼는지 말해 준다.
  const stageChanges = useMemo(() => {
    if (!activeStage || activeStage.start === 0) return []
    const startCutId = sceneShots[activeStage.start]?.cutPlanItemId
    if (!startCutId) return []
    const found = []
    const collect = (label, owner, facts) => {
      (facts || []).forEach((fact) => {
        const change = (fact.changes || []).find((entry) => entry.cutId === startCutId)
        if (change) found.push({ owner, label: fact.label, value: change.value, group: label })
      })
    }
    ;(sceneState.characters || []).forEach((character) => {
      collect('character', character.name, character.facts)
    })
    collect('location', sceneState.location?.name || '공간', sceneState.location?.facts)
    collect('environment', '장면 공통', sceneState.environment?.facts)
    return found
  }, [activeStage, sceneShots, sceneState])

  // 카드에 보이는 값은 고른 구간 시점의 값이다. 처음 값만 보여 주면 S6부터
  // 젖은 인물을 S6 구간에서도 마른 채로 보게 된다.
  const resolveFactsAtStage = useCallback((facts = []) => facts.map((fact) => {
    const value = factValueAt(fact, stageCutIndex, stageCutOrder)
    return value === fact.value ? fact : { ...fact, value, atStage: true }
  }), [stageCutIndex, stageCutOrder])

  const miseCharacters = useMemo(() => miseCharactersRaw.map((character) => ({
    ...character,
    facts: resolveFactsAtStage(character.facts),
  })), [miseCharactersRaw, resolveFactsAtStage])

  const scriptScenes = useMemo(() => selectScenes(screenplay), [screenplay])
  const scopeFrom = Math.min(rangeStart, rangeEnd)
  const scopeTo = Math.max(rangeStart, rangeEnd)
  const scope = scopeMode === 'range'
    ? { mode: 'range', from: scopeFrom, to: scopeTo, shotIds: shots.slice(scopeFrom, scopeTo + 1).map((shot) => shot.id) }
    : { mode: 'single', shot: scopedShotIndex, shotIds: scopedShot?.id ? [scopedShot.id] : [] }

  // 기본은 현재 보고 있는 한 컷이다. 이미지가 있는 연속 구간을 임의로
  // 범위 선택하지 않는다. 다관점으로 전체 흐름을 읽고 싶을 때만 사용자가
  // '전체'를 선택해 모든 컷을 명시적으로 포함한다.

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
  const currentMiseStaging = getMockMiseShotStaging(scopedShotIndex)
  const currentMiseStagingMoves = getMockMiseStagingMoves(scopedShotIndex)
  const currentEditingSingle = getMockEditingSingle(scopedShotIndex)
  const currentEditingSuggestions = [
    ...currentEditingSingle.operations,
    ...getMockEditingBoundaries(scopedShotIndex, shots.length),
  ]
  const currentShot = scopedShot
  const multiReviewScopeKey = scopeMode === 'range'
    ? `${scene?.id || activeScene}:range:${scopeFrom}-${scopeTo}`
    : `${scene?.id || activeScene}:shot:${currentShot?.id || scopedShotIndex}`
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
  // 관계는 세 종류다. 셋 다 같은 카드로 나열한다 — 합의만 요약 상자로
  // 빼두면 근거도 판정도 붙지 않아, 감독이 그 관계에 답할 수 없다.
  const multiFindings = multiReviewRun.commonFindings || []
  const multiRelations = multiFindings
  // 관계가 없는 이유가 둘이다. 진단이 아예 없으면 볼 것이 없었던 것이고,
  // 진단은 있는데 관계가 없으면 서로 무관한 것이다.
  const multiHasDiagnosis = Object.values(multiReviewRun.lensResults || {})
    .some((result) => (result.diagnoses || []).length > 0)
  const multiScopeLabel = scopeMode === 'range'
    ? `S${scopeFrom + 1}–S${scopeTo + 1}`
    : `S${scopedShotIndex + 1}`
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
  // 작업대(miseWorkspace)는 키에 넣지 않는다. 미장센 분석은 Shot Staging에서만
  // 돌므로 결과는 언제나 하나뿐인데, 작업대를 키에 넣으면 Scene State로 열렸을
  // 때만 다른 칸을 읽어 "분석이 사라진" 것처럼 보인다.
  const lensReviewKey = `${multiReviewScopeKey}:${primaryLens.id}`
  const lensIntentDraft = lensIntents[primaryLens.id] || ''
  const appliedLensIntent = appliedLensIntents[lensReviewKey] || ''
  const lensIntentDirty = lensIntentDraft.trim() !== appliedLensIntent.trim()
  const lensReviewRun = lensReviewRuns[lensReviewKey] || { status: 'idle' }
  const lensReviewLoading = lensReviewRun.status === 'loading'
  // 답을 받아 다시 도는 중에는 지난 결과를 그대로 들고 있다(runLensReview).
  // 그 동안에도 결과를 그려야 감독이 자기 답과 바뀐 판정을 이어서 본다.
  const lensReviewHasResult = ['ready', 'stale'].includes(lensReviewRun.status)
    || (lensReviewLoading && Boolean(lensReviewRun.result))
  // 결과를 띄운 채 다시 도는 경우에는 전면 로딩 배너를 쓰지 않는다.
  // 배너가 결과 위에 겹쳐 뜨면 같은 것을 두 번 말한다.
  const lensReviewLoadingAlone = lensReviewLoading && !lensReviewRun.result
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
      ? [{ shot: currentShot, shotIndex: scopedShotIndex }]
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

  const runLensReview = async ({ answers = [] } = {}) => {
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

    // `check` 질문에 답해서 다시 도는 것이면 지난 결과를 지우지 않는다.
    // 지우면 방금 쓴 답과 질문이 화면에서 사라져 20초 동안 빈 패널만 남고,
    // 그것이 "이 카드만 보는 게 아니라 처음부터 다시 도는" 것처럼 읽힌다.
    // 답이 무엇이었는지 보이는 채로 판정만 바뀌어야 비교가 된다.
    const keepPrevious = answers.length > 0
    setLensReviewRuns((current) => ({
      ...current,
      [reviewKey]: {
        ...(keepPrevious ? current[reviewKey] : null),
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
        // 감독이 `check` 질문에 답했으면 함께 보낸다. 렌즈가 그 층위를
        // 다시 판정해 keep으로 내리거나 change로 올려 선택지를 낸다.
        answers,
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
          // lensReviewKey와 같은 규칙이어야 한다. 작업대는 키에 넣지 않는다.
          const key = `${scopeKey}:${lensId}`
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
          droppedRelations: response.dropped_relations || 0,
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
    // 미장센은 작업대가 둘이고, 분석은 Shot Staging에만 있다. 기본값인
    // Scene State로 열면 감독이 분석을 보러 왔는데 빈 화면을 만난다.
    //
    // 범위(scopeMode)는 건드리지 않는다. 여기서 single로 바꾸면
    // multiReviewScopeKey가 달라져 다관점 결과가 사라진 것처럼 보인다.
    if (lensId === 'staging') setMiseWorkspace('shot')
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

  const generateCharacterReference = async (characterId) => {
    await requestReferenceImage('character', characterId)
    const refreshed = selectActiveSceneState(useStore.getState())
      ?.characters?.find((character) => character.id === characterId)
    if (refreshed) {
      setCharacterDraft((current) => (
        current?.id === characterId
          ? { ...current, image: refreshed.image }
          : current
      ))
    }
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

  const switchScopeMode = (mode) => {
    setViewerReport(null)
    setViewerPanelOrder(null)
    setScopeMode(mode)
    if (mode === 'single') {
      setRangeStart(scopedShotIndex)
      setRangeEnd(scopedShotIndex)
      setScopePickerOpen(false)
    } else {
      // 범위를 처음 열 때는 고정해 둔 한 컷과 바로 이웃한 컷만 잡는다.
      // 전체를 기본으로 잡아 두면 의도치 않게 모든 패널을 분석하게 된다.
      const start = scopedShotIndex >= shots.length - 1 ? Math.max(0, scopedShotIndex - 1) : scopedShotIndex
      const end = Math.min(shots.length - 1, start + 1)
      setRangeStart(start)
      setRangeEnd(end)
    }
  }

  const lockSingleScopeToActiveShot = () => {
    const nextShot = shots[activeShot]
    if (!nextShot) return
    setScopeMode('single')
    setSingleScopeShotId(nextShot.id)
    setRangeStart(activeShot)
    setRangeEnd(activeShot)
    setScopePickerOpen(false)
    setViewerReport(null)
    setViewerPanelOrder(null)
  }

  const updateScopeRange = (edge, nextIndex) => {
    const next = Number(nextIndex)
    if (!Number.isInteger(next)) return
    setScopeMode('range')
    if (edge === 'start') {
      setRangeStart(next)
      if (next > rangeEnd) setRangeEnd(next)
    } else {
      setRangeEnd(next)
      if (next < rangeStart) setRangeStart(next)
    }
  }

  const selectWholeScope = () => {
    setScopeMode('range')
    setRangeStart(0)
    setRangeEnd(Math.max(shots.length - 1, 0))
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
        shotNumber: scopedShotIndex + 1,
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
    // 다른 렌즈를 잠깐 보고 돌아온 경우에는 같은 관객 읽기를 그대로
    // 보여 준다. 매번 새 분석처럼 초기화되면 결과를 비교할 수 없다.
    if (viewerSnapshot?.sceneId === scene?.id && viewerReport) {
      setScopeMode('range')
      return
    }
    if (scopeMode !== 'range' || rangeStart === rangeEnd) {
      const start = scopedShotIndex >= shots.length - 1 ? Math.max(0, scopedShotIndex - 1) : scopedShotIndex
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
        // 아직 수락하지 않은 AI 초안도 Panels 화면에 보이는 현재 패널이다.
        // 관객 분석은 확정 여부가 아니라 실제로 보고 있는 그림을 읽는다.
        image: panelDraftImages[shot.id] || shot.image || null,
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

    if (mode !== 'multi') choosePrimaryLens(mode)
  }

  const applyRelationVerdict = (relation, option, chosen) => {
    setRelationVerdicts((current) => ({
      ...current,
      // 같은 것을 다시 누르면 판정을 무른다.
      [relationKey(relation)]: chosen ? undefined : option.id,
    }))

    // "고칠게"와 "우선"은 판정이 아니라 다음 작업의 시작점이다.
    // 반대로 의도적으로 유지하는 선택은 화면을 옮기지 않고 결정만 남긴다.
    if (chosen) return

    const targetLens = option.id === 'fix-source'
      ? relation.source_lens
      : option.id === 'fix-affected'
        ? relation.affected_lens
        : option.id.startsWith('prefer-')
          ? option.id.slice('prefer-'.length)
          : null

    if (targetLens) selectReviewMode(frontLensId(targetLens))
  }

  const snapshotShots = viewerSnapshot?.shots || []
  const viewerScopeFrom = scopeMode === 'range' ? scopeFrom + 1 : scopedShotIndex + 1
  const viewerScopeTo = scopeMode === 'range' ? scopeTo + 1 : scopedShotIndex + 1
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
    const targetShot = (panelOrders[0] || scopedShotIndex + 1) - 1
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
      if (scope === 'single') setSingleScopeShotId(target?.id || null)
    }
  }

  const updateViewerDecision = (decisionId, changes) => {
    // Difference != Error. 세 판정의 분포가 관객 관점 검토의 결과다.
    if (changes.verdict) {
      logEvent('verdict', { target: decisionId, verdict: changes.verdict })
    }
    saveViewerDecision(decisionId, changes)
  }

  // 진단이 짚은 컷. 없으면 지금 보고 있는 컷이다. 선택지가 바꿀 대상이자,
  // `기존 → 바뀜`에서 '기존'을 읽어 오는 곳이다.
  const cutForDiagnosis = (diagnosis) => {
    const panelTarget = (diagnosis?.targets || [])
      .map((target) => target.split('.', 1)[0])
      .find((target) => /^S\d+$/.test(target))
    const targetShot = shots[panelTarget ? Number(panelTarget.slice(1)) - 1 : scopedShotIndex]
    return cutPlan.find((cut) => cut.id === targetShot?.cutPlanItemId) || null
  }

  const beginPanelRegeneration = (statusKey, cutId, before = null) => {
    const shotIndex = shots.findIndex((shot) => shot.cutPlanItemId === cutId)
    const shot = shots[shotIndex]
    if (!shot) return false
    // 무엇을 바꾸기 전이었는지 들고 있는다. 결과를 보고 버리면 컷 값도
    // 여기로 되돌린다 — 그림만 버리고 값이 남으면 표와 그림이 어긋난다.
    if (before) beginPanelRevision(shot.id, cutId, before)
    // 남아 있던 촬영 미리보기는 새 초안을 덮어쓸 수 있다. 적용 후에는
    // 실제 생성 결과만 확대 패널에 보이게 한다.
    setCameraPreview(null)
    setFlowActiveShot(shotIndex)
    setSingleScopeShotId(shot.id)
    setLensFocusedShotIndex(shotIndex)
    setPendingPanelGeneration({
      shotId: shot.id,
      versionBefore: panelDraftVersions[shot.id] || 0,
    })
    setApplyingAlternative(statusKey)
    return true
  }

  // 진단의 대상 태그와 왼쪽 패널은 같은 샷 id를 기준으로 움직인다. 관계
  // 진단은 카드 전체를 누르면 첫 대상, S 태그를 누르면 그 태그의 패널을 연다.
  const focusDiagnosis = (diagnosis, target = null) => {
    const panelTarget = (target ? [target] : diagnosis?.targets || [])
      .map((entry) => entry.split('.', 1)[0])
      .find((entry) => /^S\d+$/.test(entry))
    if (!panelTarget) return
    const shotIndex = Number(panelTarget.slice(1)) - 1
    if (!shots[shotIndex]) return
    setFlowActiveShot(shotIndex)
    setLensFocusedShotIndex(shotIndex)
  }

  // 프롬프트 편집기를 열고 닫는다. 열 때는 지금 프롬프트를 가져와 채운다 —
  // 빈 칸에서 시작하면 감독이 문장을 처음부터 다시 써야 한다.
  // text가 null이면 닫는 것이고, 문자열이면 타이핑 중이다.
  const openPromptEditor = (diagnosis, text) => {
    if (text === null) {
      setPromptDrafts((current) => {
        const next = { ...current }
        delete next[diagnosis.id]
        return next
      })
      setPromptRewriteNotes((current) => {
        const next = { ...current }
        delete next[diagnosis.id]
        return next
      })
      setPromptBefore((current) => {
        const next = { ...current }
        delete next[diagnosis.id]
        return next
      })
      return
    }
    if (typeof text === 'string') {
      setPromptDrafts((current) => ({ ...current, [diagnosis.id]: text }))
      return
    }
    const targetCut = cutForDiagnosis(diagnosis)
    if (!targetCut) return
    const prompt = selectCutPrompt(useStore.getState(), targetCut.id)
    setPromptDrafts((current) => ({ ...current, [diagnosis.id]: prompt?.effective || '' }))
  }

  // 고른 방향을 지금 프롬프트에 반영한 문장을 받아 편집기에 띄운다.
  // 받은 문장이 곧 확정은 아니다 — 감독이 보고 고치거나 버린다 (DG1 P2).
  const requestPromptRewrite = async (diagnosis, alternative) => {
    const targetCut = cutForDiagnosis(diagnosis)
    if (!targetCut) return
    const current = selectCutPrompt(useStore.getState(), targetCut.id)
    if (!current?.effective) return

    // 먼저 지금 문장으로 열어 둔다. 기다리는 동안 빈 화면이면 눌린 것인지
    // 알 수 없다.
    setPromptDrafts((draft) => ({ ...draft, [diagnosis.id]: current.effective }))
    setPromptRewriting(diagnosis.id)
    try {
      const { rewritePrompt } = await import('../services/api')
      const result = await rewritePrompt({
        prompt: current.effective,
        diagnosis: diagnosis.diagnosis,
        suggestedAction: diagnosis.suggested_action || '',
        alternativeLabel: alternative.label,
        alternativeEffect: alternative.effect || '',
      })
      // 문장이 그대로 돌아오는 일이 있다. 컷을 지우라는 선택지처럼 프롬프트
      // 한 줄로 옮길 수 없는 방향이면 모델이 바꿀 것을 찾지 못한다. 이때
      // `무엇을 바꿨다`는 설명만 뜨면 바뀐 줄 알고 넘어가게 된다.
      const unchanged = result.prompt.trim() === current.effective.trim()
      setPromptDrafts((draft) => ({ ...draft, [diagnosis.id]: result.prompt }))
      setPromptRewriteNotes((notes) => ({
        ...notes,
        [diagnosis.id]: unchanged
          ? '이 방향은 프롬프트 문장으로 옮겨지지 않았습니다 — 문장은 그대로입니다.'
          : result.changed,
      }))
      // 고치기 전 문장을 남긴다. 같은 문장이 돌아왔다면 보여줄 차이가 없다.
      setPromptBefore((before) => ({
        ...before,
        [diagnosis.id]: unchanged ? null : current.effective,
      }))
    } catch (error) {
      // 실패해도 편집기는 열린 채로 둔다. 감독이 직접 고칠 수 있다.
      setPromptRewriteNotes((notes) => ({
        ...notes,
        [diagnosis.id]: `AI 호출 실패 · ${error.message}`,
      }))
    } finally {
      setPromptRewriting(null)
    }
  }

  const savePromptDraft = (diagnosis) => {
    const targetCut = cutForDiagnosis(diagnosis)
    const draft = promptDrafts[diagnosis.id]
    if (!targetCut || draft == null) return
    // 직접 고친 문장은 promptOverride로 남는다. 컷 값에서 조립한 문장은
    // 그대로 두어 되돌리기가 살아 있다.
    updateCutPlanItem(targetCut.id, { promptOverride: draft })
    logEvent('edit', {
      source: 'diagnosis-prompt',
      lens: diagnosis.lens || null,
      level: normalizeLevel(diagnosis.level),
    })
    // 저장만 하면 Decision Board의 문장만 바뀌고 실제 패널은 이전 그림으로
    // 남는다. 적용 즉시 해당 패널을 다시 그려, 판단하던 화면에서 결과까지
    // 확인하게 한다.
    const generationStarted = beginPanelRegeneration(`prompt:${diagnosis.id}`, targetCut.id)
    if (!generationStarted) return
    setPromptGenerationStatus((current) => ({ ...current, [diagnosis.id]: 'generating' }))
    routeDiagnosisTool('regenerate', diagnosis)
  }

  // 선택지가 컷 표의 값으로 풀리면 그 자리에서 바꾼다. 화면을 옮기면
  // 감독은 무엇을 고르러 왔는지 다시 떠올려야 한다.
  const applyAlternative = (diagnosis, alternative) => {
    const targetCut = cutForDiagnosis(diagnosis)
    if (!targetCut) return

    // 지금 값과 같은 것은 넣지 않는다. 같은 값으로 덮어쓰면 바뀐 것이
    // 없는데도 그 컷의 출처가 User로 넘어간다.
    const patch = alternative.patch || {}
    const changes = {}
    // 무엇이 무엇으로 바뀌는지를 생성에 함께 보낸다. 최종 값만 주면 모델은
    // 달라진 것을 모른 채 처음부터 새로 그려, 앵글 하나를 고쳐도 자세와
    // 소품까지 전부 바뀐다 — 그러면 감독이 고른 한 가지가 화면에서 무엇을
    // 바꾸는지 비교할 수 없다.
    const changeLines = []
    if (patch.shot_size && patch.shot_size !== targetCut.shotSize) {
      changes.shotSize = patch.shot_size
      changeLines.push(`shot size: ${targetCut.shotSize || '미정'} → ${patch.shot_size}`)
    }
    if (patch.angle && patch.angle !== targetCut.angle) {
      changes.angle = patch.angle
      changeLines.push(`camera angle: ${targetCut.angle || '미정'} → ${patch.angle}`)
    }
    if (patch.move && patch.move !== targetCut.cameraMove) {
      changes.cameraMove = patch.move
      changeLines.push(`camera move: ${targetCut.cameraMove || '고정'} → ${patch.move}`)
    }
    // 샷 값으로 바뀌는 것이 없는 선택지. 고른 방향을 반영한 문장을 받아
    // 편집기에 띄운다 — 제안해 놓고 감독이 직접 쓰게 두면 제안이 읽을거리로
    // 끝난다.
    if (Object.keys(changes).length === 0) {
      requestPromptRewrite(diagnosis, alternative)
      return
    }

    updateCutPlanItem(targetCut.id, changes)
    // 값만 바꾸고 멈추면 그림은 이전 프롬프트로 만든 것 그대로다. 감독이
    // `다시 그리기`를 한 번 더 눌러야 결과를 보는 것은 한 동작을 둘로
    // 나눈 것이다 — 바꾸는 순간 그려서 결과까지 보인다.
    const before = {
      shotSize: targetCut.shotSize, angle: targetCut.angle, cameraMove: targetCut.cameraMove,
    }
    if (!beginPanelRegeneration(`${diagnosis.id}::${alternative.label}`, targetCut.id, before)) return
    routeDiagnosisTool('regenerate', diagnosis, null, { changes: changeLines })
    logEvent('edit', {
      source: 'diagnosis-alternative',
      lens: diagnosis.lens || null,
      level: normalizeLevel(diagnosis.level),
    })
    logScaffold({
      feature: 'diagnosis',
      action: 'accept',
      target: diagnosis.id || null,
      lens: diagnosis.lens || null,
    })
  }

  // 고른 선택지 여러 개를 한 번에 적용한다.
  //
  // 하나씩 적용하면 그때마다 그림을 다시 그려, 셋을 고치면 같은 패널을 세 번
  // 그리고 앞의 두 장은 버려진다. 값을 모두 합친 뒤 한 번만 그린다.
  const applyAlternativeBatch = (entries) => {
    if (!entries?.length) return
    // 같은 컷의 것만 묶는다. 다른 컷은 어차피 다른 그림이라 한 번에 그릴 수
    // 없다 — 지금 화면의 진단들은 한 컷을 보는 것이므로 첫 컷을 기준으로 한다.
    const targetCut = cutForDiagnosis(entries[0].diagnosis)
    if (!targetCut) return

    const changes = {}
    const changeLines = []
    // 뒤에 고른 것이 앞의 값을 덮는다. 충돌은 화면에서 이미 막았다.
    for (const { alternative } of entries) {
      const patch = alternative.patch || {}
      if (patch.shot_size && patch.shot_size !== targetCut.shotSize) changes.shotSize = patch.shot_size
      if (patch.angle && patch.angle !== targetCut.angle) changes.angle = patch.angle
      if (patch.move && patch.move !== targetCut.cameraMove) changes.cameraMove = patch.move
    }
    if (changes.shotSize) changeLines.push(`shot size: ${targetCut.shotSize || '미정'} → ${changes.shotSize}`)
    if (changes.angle) changeLines.push(`camera angle: ${targetCut.angle || '미정'} → ${changes.angle}`)
    if (changes.cameraMove) changeLines.push(`camera move: ${targetCut.cameraMove || '고정'} → ${changes.cameraMove}`)
    if (changeLines.length === 0) return

    const before = {
      shotSize: targetCut.shotSize, angle: targetCut.angle, cameraMove: targetCut.cameraMove,
    }
    updateCutPlanItem(targetCut.id, changes)
    const statusKey = entries.map(({ diagnosis, alternative }) => (
      `${diagnosis.id}::${alternative.label}`
    )).join('|')
    if (!beginPanelRegeneration(statusKey, targetCut.id, before)) return
    routeDiagnosisTool('regenerate', entries[0].diagnosis, null, { changes: changeLines })
    for (const { diagnosis } of entries) {
      logEvent('edit', {
        source: 'diagnosis-alternative-batch',
        lens: diagnosis.lens || null,
        level: normalizeLevel(diagnosis.level),
      })
      logScaffold({
        feature: 'diagnosis',
        action: 'accept',
        target: diagnosis.id || null,
        lens: diagnosis.lens || null,
      })
    }
  }

  const routeDiagnosisTool = (tool, diagnosis, alternative = null, options = {}) => {
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
    // 편집 선택지는 "S3 삭제", "S2와 S3 사이에 삽입"처럼 어느 자리를
    // 바꾸는지 문장에 적는다. 관계 진단의 targets 첫 컷만 무조건 고르면
    // 삭제 대상이 엇나갈 수 있으므로, 선택지에 적힌 패널을 우선한다.
    const alternativePanelTarget = `${alternative?.label || ''} ${alternative?.effect || ''}`
      .match(/\bS\s?(\d+)\b/i)?.[1]
    const targetShotIndex = alternativePanelTarget
      ? Number(alternativePanelTarget) - 1
      : panelTarget
      ? Number(panelTarget.slice(1)) - 1
      : scopedShotIndex
    const targetShot = shots[targetShotIndex]
    if (!targetShot) return

    setFlowActiveShot(targetShotIndex)
    setSingleScopeShotId(targetShot.id)
    setZenMode(false)

    // 그림만 다시 그린다. 생성에 필요한 것(레퍼런스·구조도·그림체)은
    // 스토리보드 쪽에 있지만, 그 화면은 접혀 있어도 마운트를 유지한다.
    // 따라서 검토 도중 왼쪽 대본 패널을 강제로 열 필요가 없다.
    if (tool === 'regenerate') {
      requestPanelTool(targetShot.id, 'regenerate', {
        diagnosisId: diagnosis.id,
        // 값 하나만 바꾼 재생성이면 무엇이 달라지는지 함께 보낸다. 지금
        // 그림을 기준으로 그 항목만 고치게 하기 위해서다.
        changes: options.changes || [],
      })
      return
    }

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

    if (tool === 'delete') {
      if (targetShot?.cutPlanItemId) {
        deleteCut(targetShot.cutPlanItemId)
        completeEditingOperation(`${diagnosis.id}::${alternative?.label}`, 'delete')
      }
      return
    }

    if (tool === 'seam' || tool === 'merge' || tool === 'split' || tool === 'insert') {
      // 이음새는 앞 컷에 붙는다. 합치기도 앞 컷 기준이다.
      // 나누기는 그 컷 자체를 쪼개므로 대상 컷을 그대로 쓴다.
      const anchorIndex = tool === 'split' || tool === 'insert'
        ? targetShotIndex
        : Math.max(0, targetShotIndex - 1)
      const seamShot = shots[anchorIndex]
      if (seamShot) {
        // 분할 화면에서는 선택된 패널이 확대되어 GridView가 마운트되지
        // 않는다. 이음새 조작은 GridView가 받으므로, 카드가 잡아 둔 확대를
        // 먼저 닫아 즉시 해당 컷 사이의 확정 창으로 보낸다.
        setLensFocusedShotIndex(null)
        requestSeamFocus(seamShot.id, tool === 'seam' ? null : tool, {
          title: alternative?.label || diagnosis.suggested_action,
          detail: alternative?.effect || diagnosis.suggested_action,
          diagnosisId: diagnosis.id,
          operationId: `${diagnosis.id}::${alternative?.label}`,
        })
      }
      return
    }

    // 갈 곳이 정해지지 않은 진단. 컷 플랜 표를 최대화해서 열면 검토 화면이
    // 덮여, 방금 읽던 진단을 잃고 대본만 남는다. 그 진단이 가리키는 패널을
    // 활성화해 왼쪽에 띄우는 것으로 충분하다 — 검토는 그대로 옆에 둔다.
    setLeftPanelVisible(true)
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

  const viewerReadingSlot = viewerReport && viewerPanelOrder ? (
    <section className="viewer-reading-flow viewer-reading-flow-in-storyboard" aria-label="패널을 따라가는 관객 읽기">
      <div className="viewer-flow-controls">
        <span>{activeViewerCondition ? `${activeViewerCondition.title || activeViewerCondition.label}의 읽기` : '패널과 함께 읽기'}</span>
        <div>
          <button type="button" onClick={() => moveViewerPanel(-1)} disabled={viewerPanelOrder === selectedSnapshotShots[0]?.order}>‹</button>
          <strong>S{viewerPanelOrder}</strong>
          <button type="button" onClick={() => moveViewerPanel(1)} disabled={viewerPanelOrder === selectedSnapshotShots[selectedSnapshotShots.length - 1]?.order}>›</button>
        </div>
      </div>
      <ViewerReadingCard reading={activeViewerReading} activePanelOrder={viewerPanelOrder} onRoute={routeViewerFinding} />
    </section>
  ) : null

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
                    placeholder="예: 인물·실험대·노트의 위치 관계가 이어지는지 살핀다."
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
                            {route === 'narrative' ? '대본' : route === 'mise' ? '미장센' : route === 'camera' ? '촬영' : '편집'}에서 보기
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
                <p>여기서 처음으로 제작 의도와 비교하고, 수정하거나 의도적으로 유지할지를 결정합니다.</p>
              </header>
              {viewerDecisionItems.map((item) => (
                <ViewerDecisionCard
                  key={item.id}
                  decisionId={item.id}
                  panelOrders={item.panelOrders}
                  evidence={item.evidence}
                  interpretations={item.interpretations}
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
        <div className="scope-panel-row">
          <div className="scope-panel-copy">
            <span>{reviewMode === 'viewer' ? '관객 관점 범위' : '검토 대상'}</span>
            <strong>
              {reviewMode === 'viewer' || scope.mode === 'range'
                ? `S${scopeFrom + 1}–S${scopeTo + 1}`
                : `S${scopedShotIndex + 1} · ${currentShot?.label || 'Current shot'}`}
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
                  onClick={() => {
                    if (scopeMode !== 'range') switchScopeMode('range')
                    setScopePickerOpen((open) => !open)
                  }}
                  disabled={reviewMode === 'staging' && miseWorkspace === 'shot'}
                  title={
                    reviewMode === 'staging' && miseWorkspace === 'shot'
                        ? 'Shot Staging Range는 다음 단계에서 추가됩니다.'
                        : undefined
                  }
                >
                  범위
                </button>
                {scopeMode === 'single' && activeShot !== scopedShotIndex && (
                  <button
                    type="button"
                    className="scope-use-current"
                    onClick={lockSingleScopeToActiveShot}
                    title="그리드에서 현재 고른 패널을 이 검토 대상으로 바꿉니다."
                  >
                    현재 선택 S{activeShot + 1}로 변경
                  </button>
                )}
                {scopePickerOpen && scopeMode === 'range' && (
                  <div className="scope-range-popover" role="dialog" aria-label="분석 범위 지정">
                    <div className="scope-range-popover-heading">
                      <span>분석 범위</span>
                      <strong>S{scopeFrom + 1}–S{scopeTo + 1} · {scopeTo - scopeFrom + 1}컷</strong>
                    </div>
                    <div className="scope-range-fields">
                      <label>
                        <span>시작</span>
                        <select
                          value={scopeFrom}
                          onChange={(event) => updateScopeRange('start', event.target.value)}
                        >
                          {shots.map((shot, index) => (
                            <option key={shot.id} value={index}>S{index + 1} · {shot.label || 'Shot'}</option>
                          ))}
                        </select>
                      </label>
                      <i aria-hidden="true">→</i>
                      <label>
                        <span>끝</span>
                        <select
                          value={scopeTo}
                          onChange={(event) => updateScopeRange('end', event.target.value)}
                        >
                          {shots.map((shot, index) => (
                            <option key={shot.id} value={index}>S{index + 1} · {shot.label || 'Shot'}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="scope-range-popover-actions">
                      <button type="button" onClick={selectWholeScope}>전체 컷</button>
                      <button type="button" className="primary" onClick={() => setScopePickerOpen(false)}>완료</button>
                    </div>
                  </div>
                )}
              </>
            )}
            </div>
          </div>
        </div>
      </section>

      <div className={`decision-board-main view-${boardView}`}>
        <section className="decision-board-storyboard" aria-label="Storyboard scope">
          <SceneOverview
            shotPreview={storyboardShotPreview}
            compact={boardView === 'split'}
            decisionScope={scope}
            sequencePreview={editingSequencePreview}
            viewerReadingSlot={reviewMode === 'viewer' ? viewerReadingSlot : null}
            viewerFocusShotIndex={reviewMode === 'viewer' ? (viewerPanelOrder ?? viewerScopeFrom) - 1 : null}
            lensFocusShotIndex={reviewMode === 'viewer' ? null : lensFocusedShotIndex}
            onClearLensFocus={() => setLensFocusedShotIndex(null)}
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
                    // 범위를 single로 되돌리지 않는다. scopeMode를 바꾸면
                    // multiReviewScopeKey가 달라져, 방금 돌린 다관점 결과가
                    // 지워진 것처럼 보인다. 한 컷만 보려면 감독이 범위
                    // 선택에서 직접 바꾼다.
                    onClick={() => setMiseWorkspace('shot')}
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
                    onClick={() => runLensReview()}
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
              {lensAnalysisEnabled && lensReviewLoadingAlone && (
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
                <DirectingReviewResult
                  run={lensReviewRun}
                  onTool={routeDiagnosisTool}
                  onApply={applyAlternative}
                  onOpenPrompt={openPromptEditor}
                  onSavePrompt={savePromptDraft}
                  promptDrafts={promptDrafts}
                  rewritingId={promptRewriting}
                  rewriteNotes={promptRewriteNotes}
                  promptBefore={promptBefore}
                  applyingId={applyingAlternative}
                  promptGenerationStatus={promptGenerationStatus}
                  cutOf={cutForDiagnosis}
                  lensName={primaryLens.displayName}
                  lensId={primaryLens.id}
                  editingOperationCompletions={editingOperationCompletions}
                  onAnswerCheck={(answer) => runLensReview({ answers: [answer] })}
                  answering={lensReviewLoading}
                  onApplyBatch={applyAlternativeBatch}
                  revisionPending={panelRevisionPending && !applyingAlternative
                    && panelDraftImages[panelRevisionPending.shotId]
                    ? panelRevisionPending : null}
                  onAcceptRevision={acceptPanelRevision}
                  onRejectRevision={rejectPanelRevision}
                  onFocusDiagnosis={focusDiagnosis}
                  focusedShotIndex={lensFocusedShotIndex}
                />
              ) : primaryLens.id === 'camera' ? (
                <>
                  <section className="lens-analysis-panel" aria-label="Current cinematography analysis">
                    <div className="lens-section-heading">
                      <div>
                        <span>Current analysis</span>
                        <strong>
                          {scopeMode === 'range'
                            ? `S${scopeFrom + 1}–S${scopeTo + 1} · ${scopedCameraShots.length} shots`
                            : `S${scopedShotIndex + 1} · ${currentShot?.label || 'Current shot'}`}
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
                                  {isApplied ? `S${scopedShotIndex + 1}에 적용됨` : `S${scopedShotIndex + 1}에 적용`}
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
                          : `S${scopedShotIndex + 1} · ${currentShot?.label || 'Current shot'}`}
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
                            <strong>{proposal.label || '이 컷'} 뒤</strong>
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
                      <strong>S{scopedShotIndex + 1} · {currentShot?.label || 'Current shot'}</strong>
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
                    {/* 보는 것이 기본. 고칠 것이 눈에 띄었을 때만 연다. */}
                    <button
                      type="button"
                      className={`mise-state-edit-toggle${sceneStateEditing ? ' is-editing' : ''}`}
                      aria-pressed={sceneStateEditing}
                      onClick={() => {
                        const next = !sceneStateEditing
                        setSceneStateEditing(next)
                        // 편집을 닫을 때는 열려 있던 인물 카드와 쓰던 변화도
                        // 같이 닫는다. 남겨 두면 보기 모드인데 뒷면이 펼쳐진
                        // 카드가 섞인다.
                        if (!next) {
                          setEditingCharacterId(null)
                          setCharacterDraft(null)
                          setChangeDraft(null)
                        }
                      }}
                    >
                      {sceneStateEditing ? '보기로 돌아가기' : '기준 고치기'}
                    </button>
                  </div>

                  {/* 기준 고치기와 실제 시간 편집기가 멀리 떨어지지 않게 한다.
                      시간은 씬의 상태 구간을 만드는 핵심 값이므로 인물·공간
                      카드보다 먼저 보여 주고, 아래 Shared scene에서는 중복을
                      제거한다. */}
                  {sceneTimeFact && (
                    <section className={`mise-time-quick${sceneStateEditing ? ' is-editing' : ''}`} aria-label="씬 시간 빠른 편집">
                      <div className="mise-time-quick-heading">
                        <div>
                          <span>Scene time</span>
                          <strong>씬 시간</strong>
                        </div>
                        <em>{sceneTimeFact.value || '아직 정하지 않음'}</em>
                      </div>
                      <SceneFactChanges
                        fact={sceneTimeFact}
                        group="environment"
                        shots={shots}
                        onAdd={setChangeDraft}
                        onRemove={removeFactChange}
                        disabled={!sceneStateEditing}
                        draft={draftFor('environment', sceneTimeFact.label)}
                        onDraftChange={setChangeDraft}
                        onDraftCancel={() => setChangeDraft(null)}
                        onDraftSave={saveChangeDraft}
                      />
                      {!sceneStateEditing && !(sceneTimeFact.changes || []).length && (
                        <small>기준 고치기를 누르면 어느 Shot부터 시간이 달라지는지 바로 정할 수 있습니다.</small>
                      )}
                    </section>
                  )}

                  <p className="mise-state-description">{sceneState.description}</p>

                  {/* 씬 단위 화면이므로 "언제부터 무엇이 달라지는가"를 먼저
                      둔다. 구간은 2D 도면의 단계와 같은 기준(spatialStages)을
                      쓰므로, 여기서 고르면 아래 값과 배치가 함께 바뀐다. */}
                  {/* 구간이 하나여도 보여 준다. 숨기면 이 화면이 씬 안의
                      변화를 다루는 곳이라는 것 자체를 알 수 없다 — 변화를
                      걸기 전에는 "아직 나뉜 구간이 없다"고 말해 준다. */}
                  {spatialStages.length > 0 && (
                    <section className="mise-stage-bar" aria-label="씬 안의 상태 구간">
                      {/* 대본에 씬이 여럿이면 어느 씬의 기준을 보고 있는지
                          고를 수 있어야 한다. Scene State는 씬 단위 화면인데
                          전에는 이 화면에 씬을 고르는 자리가 없어, 컷 플랜
                          레일로 나가 Beat를 옮겨야 다른 씬이 보였다. */}
                      {scriptScenes.length > 1 && (
                        <div className="mise-scene-switcher" aria-label="씬 선택">
                          {scriptScenes.map((scriptScene) => (
                            <button
                              key={scriptScene.id}
                              type="button"
                              aria-pressed={scriptScene.id === activeSceneId}
                              className={scriptScene.id === activeSceneId ? 'is-active' : ''}
                              onClick={() => setActiveBeat(scriptScene.startBeat)}
                            >
                              Scene {scriptScene.number}
                              <em>{scriptScene.heading}</em>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="mise-stage-tabs" role="tablist">
                        {spatialStages.map((stage) => (
                          <button
                            key={stage.id}
                            type="button"
                            role="tab"
                            aria-selected={activeStage?.id === stage.id}
                            className={activeStage?.id === stage.id ? 'is-active' : ''}
                            onClick={() => selectSpatialStage(stage.id)}
                          >
                            {stage.label}
                          </button>
                        ))}
                      </div>
                      <p className="mise-stage-note">
                        {stageChanges.length > 0 ? (
                          <>
                            <em>이 구간에서 바뀌는 것</em>
                            {stageChanges.map((change) => (
                              <span key={`${change.owner}-${change.label}`}>
                                {change.owner} · {change.label} → {change.value}
                              </span>
                            ))}
                          </>
                        ) : spatialStages.length === 1 ? (
                          <>
                            <em>씬 전체가 한 구간입니다</em>
                            <span>
                              인물 `상태`나 `시간`에 변화를 걸면 그 컷부터
                              구간이 나뉘고, 구간마다 값과 2D 배치를 따로 둘 수
                              있습니다.
                            </span>
                          </>
                        ) : (
                          <em>씬이 시작되는 기준값입니다.</em>
                        )}
                      </p>
                    </section>
                  )}

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
                        // 카드 뒷면은 보기 모드에서도 연다 — 레퍼런스 그림과
                        // 항목을 읽는 자리이기도 하기 때문이다. 다만 값을
                        // 고칠 수 있는 것은 '기준 고치기'를 켰을 때뿐이다.
                        const isOpen = editingCharacterId === character.id && characterDraft?.id === character.id
                        const isEditing = isOpen && sceneStateEditing
                        const detail = isOpen ? characterDraft : character
                        return (
                          <article
                            key={character.id}
                            className={`mise-character-reference-card ${isOpen ? 'flipped' : ''}`}
                          >
                            <div className="mise-character-card-inner">
                              <section
                                className="mise-character-card-face mise-character-card-front"
                                aria-hidden={isOpen}
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
                                    tabIndex={isOpen ? -1 : 0}
                                  >
                                    {character.image ? '레퍼런스·정보 보기' : '레퍼런스 만들기'}
                                  </button>
                                  {character.image && (
                                    <button
                                      type="button"
                                      className="mise-reference-regenerate"
                                      onClick={() => generateCharacterReference(character.id)}
                                      disabled={isReferenceImagePending('character', character.id)}
                                    >
                                      {isReferenceImagePending('character', character.id) ? '다시 그리는 중…' : '다시 생성'}
                                    </button>
                                  )}
                                </div>
                              </section>

                              <section
                                className="mise-character-card-face mise-character-card-back"
                                aria-hidden={!isOpen}
                              >
                                {/* 큰 사진은 앞면이 이미 보여 준다. 뒷면은 값을
                                    고치는 자리이므로 사진이 자리를 차지하면
                                    항목이 스크롤 밖으로 밀린다. 어느 인물의
                                    카드인지 알려주는 작은 썸네일만 남긴다. */}
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
                                        onRemove={removeCharacterAwareChange}
                                        disabled={!isEditing}
                                        draft={draftFor('character', fact.label, character.id)}
                                        onDraftChange={setChangeDraft}
                                        onDraftCancel={() => setChangeDraft(null)}
                                        onDraftSave={saveChangeDraft}
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
                                      onClick={() => generateCharacterReference(character.id)}
                                      disabled={isReferenceImagePending('character', character.id)}
                                    >
                                      {isReferenceImagePending('character', character.id)
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
                                  {referenceImageError && !anyReferenceImagePending && (
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
                  <div className="mise-place-grid">
                    <article className={`mise-character-reference-card mise-location-reference-card ${locationReferenceOpen ? 'flipped' : ''}`}>
                      <div className="mise-character-card-inner">
                        <section className="mise-character-card-face mise-character-card-front mise-location-card">
                          <div className="mise-character-front-copy">
                            <div>
                              <strong>{sceneState.location.name}</strong>
                              <p>공간 기준 · 패널 생성에 함께 사용됩니다</p>
                            </div>
                            <button
                              type="button"
                              className="mise-location-preview"
                              onClick={openSpatialEditor}
                              aria-label="2D 공간 편집기 열기"
                            >
                              <span className="mise-location-preview-caption">
                                <strong>2D spatial layout</strong>
                                <span>클릭해서 인물과 공간 배치를 조정</span>
                              </span>
                              <span className="mise-mini-room">
                                <span className="mise-mini-monitor">Window</span>
                                <span className="mise-mini-console">Lit bench</span>
                                <span className="mise-mini-cabinet">Shelf</span>
                                <span className="mise-mini-door">Door</span>
                                <span className="mise-mini-person harin">하</span>
                              </span>
                            </button>
                            <button type="button" onClick={() => setLocationReferenceOpen(true)}>
                              {sceneState.location.image ? '레퍼런스·정보 보기' : '공간 레퍼런스 만들기'}
                            </button>
                            {sceneState.location.image && (
                              <button
                                type="button"
                                className="mise-reference-regenerate"
                                onClick={() => requestReferenceImage('location')}
                                disabled={isReferenceImagePending('location')}
                              >
                                {isReferenceImagePending('location') ? '다시 그리는 중…' : '다시 생성'}
                              </button>
                            )}
                          </div>
                        </section>

                        <section className="mise-character-card-face mise-character-card-back">
                          {/* 인물 카드와 달리 공간 앞면은 2D 배치도다 —
                              레퍼런스 그림을 보여 주는 곳이 여기뿐이라
                              뒷면에 남긴다. 없으면 자리를 차지하지 않는다. */}
                          {sceneState.location.image && (
                            <div className="mise-location-reference-image">
                              <img
                                src={sceneState.location.image}
                                alt={`${sceneState.location.name} 레퍼런스`}
                              />
                            </div>
                          )}
                          <div className="mise-reference-card-heading">
                            <span>Location reference</span>
                            <strong>{sceneState.location.name}</strong>
                          </div>
                          <dl className="mise-reference-facts">
                            {sceneState.location.facts.map((fact) => (
                              <div key={fact.label} className={fact.open ? 'open' : ''}>
                                <dt>{fact.label}</dt>
                                <dd>{fact.value}</dd>
                              </div>
                            ))}
                          </dl>
                          <div className="mise-reference-gen">
                            <label>
                              <span>그림 프롬프트</span>
                              <textarea
                                rows={3}
                                value={referencePromptOf(sceneState.location, 'location')}
                                placeholder="항목 값에서 자동으로 만들어집니다"
                                onChange={(event) => setReferencePrompt('location', null, event.target.value)}
                              />
                            </label>
                            <div className="mise-reference-gen-actions">
                              <button
                                type="button"
                                onClick={() => requestReferenceImage('location')}
                                disabled={isReferenceImagePending('location')}
                              >
                                {isReferenceImagePending('location')
                                  ? '그리는 중…'
                                  : sceneState.location.image ? '다시 그리기' : '레퍼런스 그리기'}
                              </button>
                              {sceneState.location.promptOverride && (
                                <button type="button" className="ghost" onClick={() => setReferencePrompt('location', null, '')}>
                                  자동으로 되돌리기
                                </button>
                              )}
                            </div>
                            {referenceImageError && !anyReferenceImagePending && (
                              <p className="mise-reference-error">{referenceImageError}</p>
                            )}
                          </div>
                          <button type="button" className="mise-reference-back" onClick={() => setLocationReferenceOpen(false)}>
                            정보 보기로 돌아가기
                          </button>
                        </section>
                      </div>
                    </article>

                    <section className="mise-state-group mise-state-card">
                      <div className="mise-state-group-heading">
                        <div>
                          <span>Shared scene</span>
                          <strong>{sceneState.environment.name}</strong>
                        </div>
                      </div>
                      <dl>
                        {sceneState.environment.facts
                          .filter((fact) => fact.label !== '시간')
                          .map((fact) => (
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
                                disabled={!sceneStateEditing}
                                draft={draftFor('environment', fact.label)}
                                onDraftChange={setChangeDraft}
                                onDraftCancel={() => setChangeDraft(null)}
                                onDraftSave={saveChangeDraft}
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
                    placeholder="예: 인물의 고립은 보이되, 무엇을 알아냈는지는 아직 숨기고 싶다."
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

              <div className="multi-review-grid">
                {MULTI_LENS_ORDER.map(({ backendId, lensId, mark }) => {
                  const perspective = PERSPECTIVES.find((item) => item.id === lensId)
                  const result = multiReviewRun.lensResults?.[backendId]
                  if (!perspective) return null
                  // 렌즈 하나가 실패하면 서버는 나머지만 돌려준다. 그때
                  // 카드를 그리지 않으면 감독은 그 관점을 '문제 없음'으로
                  // 읽는다 — 실제로는 답을 못 받은 것이다. 빈 자리를 남겨
                  // 다시 시도할 수 있게 한다.
                  if (!result) {
                    return (
                      <article
                        key={lensId}
                        className="multi-review-card is-missing"
                        style={{ '--lens-color': perspective.accent }}
                      >
                        <header>
                          <span>{mark}</span>
                          <div>
                            <strong>{perspective.displayName}</strong>
                            <em>{perspective.lens}</em>
                          </div>
                        </header>
                        <p className="multi-review-missing-note">
                          이 관점은 답을 받지 못했습니다. 다시 분석하거나
                          아래 `열기`로 이 렌즈만 따로 볼 수 있습니다.
                        </p>
                        <button
                          type="button"
                          className="multi-review-card-open"
                          onClick={() => selectReviewMode(lensId)}
                        >
                          열기
                        </button>
                      </article>
                    )
                  }
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
                        {/* 요약을 읽고 나면 그 렌즈에서 이어서 하게 된다.
                            위 탭까지 올라가 다시 찾게 하지 않는다. */}
                        <button
                          type="button"
                          className="multi-review-card-open"
                          onClick={() => selectReviewMode(lensId)}
                          aria-label={`${perspective.displayName} 렌즈로 이동`}
                        >
                          열기
                        </button>
                      </header>
                      {/* 요약(result.summary)은 두지 않는다. "무엇이 잘 안
                          읽힌다"까지만 말해서, 아래 조치가 같은 것을 다시
                          짚는다. 카드에서 읽을 것은 무엇을 하면 되는가다. */}
                      {(result.diagnoses || []).slice(0, 2).map((diagnosis) => (
                        <div key={diagnosis.id} className="multi-review-card-action">
                          <strong>{diagnosis.suggested_action}</strong>
                          {(diagnosis.alternatives || []).length > 0 && (
                            <ul>
                              {diagnosis.alternatives.slice(0, 2).map((alternative) => (
                                <li key={alternative.label}>
                                  <em>{alternative.label}</em>
                                  {alternative.effect && <span>{alternative.effect}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                      {/* 진단은 `change` 판정에만 나온다. 고칠 것이 없다고
                          본 렌즈는 대신 무엇을 묻고 있는지 낸다.
                          `check` 층위의 open_question도 함께 낸다 — 렌즈는
                          네 층위를 다 보고 "의도에 따라 갈린다"고 판정한
                          것인데, 그것을 버리면 카드가 '걸리는 것 없음'으로
                          보여 실제로는 물어볼 것이 있는데도 넘어간다. */}
                      {(() => {
                        if ((result.diagnoses || []).length > 0) return null
                        const asked = [
                          result.questions?.[0]?.prompt,
                          ...(result.level_assessments || [])
                            .filter((assessment) => assessment.status === 'check')
                            .map((assessment) => assessment.open_question),
                        ].filter(Boolean)
                        if (asked.length === 0) {
                          return (
                            <div className="multi-review-card-action is-clear">
                              <strong>이 관점에서 걸리는 것이 없습니다</strong>
                            </div>
                          )
                        }
                        return asked.slice(0, 2).map((prompt) => (
                          <div key={prompt} className="multi-review-card-action is-question">
                            <strong>{prompt}</strong>
                          </div>
                        ))
                      })()}
                    </article>
                  )
                })}
              </div>

              {/* 어느 렌즈부터 손댈 것인가. 관계가 둘 이상일 때만 둔다 —
                  하나뿐이면 그 카드의 `고칠 곳은 …입니다`가 같은 말을
                  이미 하고 있어, 같은 지시가 화면에 두 번 뜬다. */}
              {multiReviewRun.related && multiReviewRun.order && multiRelations.length > 1 && (
                <section className="multi-review-order">
                  <header>
                    <span>먼저 볼 곳</span>
                    <em>{lensMark(multiReviewRun.order.first_lens)} {lensName(multiReviewRun.order.first_lens)}</em>
                  </header>
                  {multiReviewRun.order.reason && <p>{multiReviewRun.order.reason}</p>}
                  {multiReviewRun.order.then?.length > 0 && (
                    <p className="multi-review-order-then">
                      고친 뒤 다시 볼 곳 · {multiReviewRun.order.then.map(lensName).join(' · ')}
                    </p>
                  )}
                  <button
                    type="button"
                    className="multi-review-order-go"
                    onClick={() => selectReviewMode(frontLensId(multiReviewRun.order.first_lens))}
                  >
                    {lensName(multiReviewRun.order.first_lens)}에서 시작하기 →
                  </button>
                </section>
              )}

              {/* 렌즈 사이의 관계. consequence는 방향이 있어 어디를 고쳐야
                  하는지까지 말한다 — 영향받은 쪽을 고치면 증상만 사라진다. */}
              {multiRelations.map((relation) => (
                <section
                  key={`${relation.type}-${relation.diagnosis_ids.join('-')}`}
                  className={`multi-review-tension is-${relation.type}`}
                >
                  <header>
                    <span>{relationLabel(relation)}</span>
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
                      {/* selectReviewMode를 쓴다. choosePrimaryLens는 렌즈만
                          바꾸고 화면 모드는 다관점에 남겨 두어, 눌러도 아무
                          일도 일어나지 않는 것처럼 보였다. */}
                      <button
                        type="button"
                        onClick={() => selectReviewMode(frontLensId(relation.source_lens))}
                      >
                        {lensName(relation.source_lens)}에서 이어서 보기 →
                      </button>
                    </div>
                  )}
                  {/* 충돌과 합의는 원인이 한쪽에 있지 않다. 양쪽으로 가는
                      길을 두되, 무엇을 하러 가는지는 다르다 — 충돌은 둘 중
                      하나를 고르러, 합의는 한 번에 고치러 간다. */}
                  {relation.type !== 'consequence' && relation.lenses?.length > 0 && (
                    <div className="multi-review-tension-where">
                      <strong>
                        {relation.type === 'agreement'
                          ? '한쪽을 고치면 둘 다 풀립니다'
                          : '어느 쪽을 우선할지 정해야 합니다'}
                      </strong>
                      {relation.lenses.map((lens) => (
                        <button
                          key={lens}
                          type="button"
                          onClick={() => selectReviewMode(frontLensId(lens))}
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
                          onClick={() => applyRelationVerdict(relation, option, chosen)}
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
                        ? '세 렌즈가 짚은 것이 서로 맞물리는지 봅니다.'
                        : '짚인 문제가 없어 볼 관계가 없습니다.'}
                  </span>
                </div>
              )}

              {/* 버린 관계는 살아남은 것이 있든 없든 밝힌다. 하나라도
                  떴다고 침묵하면, 감독은 보이는 것이 전부라고 믿는다. */}
              {multiReviewRun.related && multiReviewRun.droppedRelations > 0 && (
                <div className="multi-review-empty is-dropped">
                  <p>
                    관계 {multiReviewRun.droppedRelations}개를 더 찾았지만 어느 판단에 대한
                    것인지 짚지 못해 표시하지 못했습니다.
                  </p>
                  <button type="button" onClick={runRelateReview} disabled={multiReviewRun.relating}>
                    {multiReviewRun.relating ? '다시 보는 중…' : '다시 찾기'}
                  </button>
                </div>
              )}

              {/* 관계가 없는 것도 정보다. 비워 두면 고장으로 읽힌다. */}
              {multiReviewRun.related && multiRelations.length === 0
                && multiReviewRun.droppedRelations === 0 && (
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
        <section className="mise-spatial-editor" aria-label="물리학과 실험실 2D 공간 편집기">
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
