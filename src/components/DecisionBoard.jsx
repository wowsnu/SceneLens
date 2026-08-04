import { useCallback, useMemo, useState } from 'react'
import useStore from '../store/useStore'
import SceneOverview from './SceneOverview'
import SpatialMap from './SpatialMap'
import './DecisionBoard.css'

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

const MOCK_DEBATE_TURNS = [
  {
    id: 'debate-1',
    lensId: 'narrative',
    targetLensId: 'editing',
    targetOptionId: 'opt-reaction-first',
    costType: 'Information cost',
    line: '리듬, 네 반응 먼저 안은 좋아. 그런데 위협을 늦추면 컷3까지 관객이 상황을 못 잡을 수 있어. 그 혼란을 비용으로 감수할 거야?',
  },
  {
    id: 'debate-2',
    lensId: 'editing',
    targetLensId: 'narrative',
    targetOptionId: 'opt-delay-clue',
    costType: 'Rhythm defense',
    line: '응, 그 헷갈림이 바로 불안이야. 대신 반응 컷의 시선 방향은 남겨서 길 잃는 혼란까지는 가지 않게 하자.',
  },
  {
    id: 'debate-3',
    lensId: 'camera',
    targetLensId: 'staging',
    targetOptionId: 'opt-distance',
    costType: 'Emotion cost',
    line: '블로킹, 거리를 벌리면 관계는 읽히는데 얼굴의 떨림이 사라져. 관객이 불안을 감정이 아니라 배치 정보로만 읽을 수 있어.',
  },
  {
    id: 'debate-4',
    lensId: 'staging',
    targetLensId: 'camera',
    targetOptionId: 'opt-tight-face',
    costType: 'Spatial cost',
    line: '프레임, 얼굴로 압축하면 감정은 강해져. 하지만 둘 사이의 장벽이 사라져서 고립감의 원인이 약해질 수 있어.',
  },
]

// 씬 안의 상태 변화를 보여주고 더한다 (DG2 P2).
// 인물·장소·환경이 같은 모양을 쓴다 — 셋 다 컷을 가로지르며 변한다.
function SceneFactChanges({ fact, group, characterId = null, shots, onAdd, onRemove, disabled = false }) {
  if (fact.open) return null

  return (
    <div className="mise-fact-timeline">
      {(fact.changes || []).map((change) => (
        <span key={change.at} className="mise-fact-change">
          <em>S{change.at + 1}~</em>
          {change.value}
          <button
            type="button"
            disabled={disabled}
            aria-label={`S${change.at + 1} 변화 삭제`}
            onClick={() => onRemove(group, fact.label, change.at, { characterId })}
          >✕</button>
        </span>
      ))}
      <button
        type="button"
        className="mise-fact-add-change"
        disabled={disabled}
        onClick={() => onAdd({
          group,
          characterId,
          label: fact.label,
          at: Math.min(1, Math.max(0, shots.length - 1)),
          value: '',
        })}
      >
        + 변화
      </button>
    </div>
  )
}

export default function DecisionBoard({ boardView = 'split' }) {
  const [selectedOptionId, setSelectedOptionId] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [debateOpen, setDebateOpen] = useState(false)
  const [selectedOptionIds, setSelectedOptionIds] = useState([])
  const [cameraPreview, setCameraPreview] = useState(null)
  const [cameraApplyHistory, setCameraApplyHistory] = useState([])
  const [editingSequencePreview, setEditingSequencePreview] = useState(null)
  const [viewerSnapshot, setViewerSnapshot] = useState(null)
  const [primaryLensId, setPrimaryLensId] = useState('camera')
  const [miseWorkspace, setMiseWorkspace] = useState('scene')
  // 씬 기준은 스토어에 있다. 이 화면에서 고친 것이 곧 생성 기준이 된다 —
  // 로컬 state로 두면 프롬프트에 닿지 않는다.
  const sceneState = useStore((s) => s.sceneState)
  const updateSceneCharacter = useStore((s) => s.updateSceneCharacter)
  const addFactChange = useStore((s) => s.addFactChange)
  const removeFactChange = useStore((s) => s.removeFactChange)
  // 어느 컷부터 무엇으로 바뀌는지 입력받는 중.
  const [changeDraft, setChangeDraft] = useState(null)
  const miseCharacters = sceneState.characters
  const [editingCharacterId, setEditingCharacterId] = useState(null)
  const [characterDraft, setCharacterDraft] = useState(null)
  const [spatialEditorOpen, setSpatialEditorOpen] = useState(false)
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
  const [lensIntentSubmitted, setLensIntentSubmitted] = useState(() => (
    CREATIVE_LENSES.reduce((acc, lens) => ({ ...acc, [lens.id]: false }), {})
  ))
  const [lensIntents, setLensIntents] = useState(() => (
    CREATIVE_LENSES.reduce((acc, lens) => ({ ...acc, [lens.id]: '' }), {})
  ))
  const scenes = useStore((s) => s.scenes)
  const activeScene = useStore((s) => s.activeScene)
  const setFlowActiveShot = useStore((s) => s.setFlowActiveShot)
  const setFlowView = useStore((s) => s.setFlowView)
  const updateFlowShotById = useStore((s) => s.updateFlowShotById)
  const scene = scenes[activeScene]
  const activeShot = scene?.activeShot ?? 0
  const activeBranch = scene?.activeBranch ?? 0
  const branch = scene?.branches?.[activeBranch]
  const shots = branch?.shots || []
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

  const connectedRelations = availableRelations.filter(
    (relation) => relation.from === selectedOption.id || relation.to === selectedOption.id
  )

  const updateLensIntent = (lensId, value) => {
    setLensIntents((prev) => ({ ...prev, [lensId]: value }))
    setLensIntentSubmitted((prev) => ({ ...prev, [lensId]: false }))
  }

  const submitLensIntent = (lensId) => {
    if (!lensIntents[lensId]?.trim()) return
    setLensIntentSubmitted((prev) => ({ ...prev, [lensId]: true }))
  }

  const choosePrimaryLens = (lensId) => {
    setPrimaryLensId(lensId)
    if (lensId !== 'camera') setCameraPreview(null)
    if (lensId !== 'editing') setEditingSequencePreview(null)
    if (lensId === 'editing') {
      setScopeMode('single')
      setRangeStart(activeShot)
      setRangeEnd(activeShot)
    }
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

  const updateMiseSpatialElements = useCallback((elements) => {
    setMiseSpatialElements(elements)
  }, [])

  const selectScopeShot = (shotIdx) => {
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

  const getLens = (lensId) => (
    PERSPECTIVES.find((lens) => lens.id === lensId) || PERSPECTIVES[0]
  )

  const openViewerReflection = () => {
    if (shots.length === 0) return
    setCameraPreview(null)
    setReviewOpen(false)
    setDebateOpen(false)
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
  }

  const snapshotShots = viewerSnapshot?.shots || []
  const readableShots = snapshotShots.filter((shot) => Boolean(shot.image))
  const firstSnapshotShot = snapshotShots[0]?.order || 1
  const lastSnapshotShot = snapshotShots[snapshotShots.length - 1]?.order || firstSnapshotShot

  const viewerReflectionPane = viewerSnapshot ? (
    <div className="viewer-reflection-shell" aria-label="새 눈으로 보기">
      <header className="viewer-reflection-heading">
        <div>
          <span>새 눈으로 보기</span>
          <h2>처음 보는 눈에는 이렇게 보여요</h2>
          <p>만든 의도는 잠시 내려두고, 지금 보이는 패널의 흐름만 따라가 봅니다.</p>
        </div>
        <button type="button" onClick={() => setViewerSnapshot(null)}>
          렌즈로 돌아가기
        </button>
      </header>

      <section className="viewer-snapshot-card">
        <div>
          <span>지금 보고 있는 장면</span>
          <strong>{viewerSnapshot.sceneLabel}</strong>
        </div>
        <dl>
          <div>
            <dt>범위</dt>
            <dd>S{firstSnapshotShot}–S{lastSnapshotShot}</dd>
          </div>
          <div>
            <dt>보이는 패널</dt>
            <dd>{readableShots.length} / {snapshotShots.length}</dd>
          </div>
        </dl>
      </section>

      <section className="viewer-reflection-placeholder">
        <span>새 눈의 메모</span>
        <strong>어떤 흐름이 먼저 보였는지 이곳에 모일 거예요.</strong>
        <p>
          먼저 읽힌 흐름과 잠깐 멈칫한 곳,
          다르게 보일 수 있는 지점을 차례로 보여줍니다.
        </p>
        <div className="viewer-placeholder-rows" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </section>
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
          <span>Scope</span>
          <strong>{scope.mode === 'range' ? '여러 프레임에 걸친 선택지' : '한 샷 안의 선택지'}</strong>
          <p>
            {scope.mode === 'range'
              ? '정보 배분, 컷 분할, 리듬처럼 프레임 간 판단을 생성합니다.'
              : '프레이밍, 블로킹, 단서 배치처럼 프레임 내 판단을 생성합니다.'}
          </p>
        </div>
        <div className="scope-controls">
          <div className="scope-mode-toggle">
            <button
              type="button"
              className={scopeMode === 'single' ? 'active' : ''}
              onClick={() => switchScopeMode('single')}
            >
              Single Shot
            </button>
            <button
              type="button"
              className={scopeMode === 'range' ? 'active' : ''}
              onClick={() => switchScopeMode('range')}
              disabled={(primaryLensId === 'staging' && miseWorkspace === 'shot') || primaryLensId === 'editing'}
              title={
                primaryLensId === 'editing'
                  ? 'Editing Boundary와 Range는 다음 단계에서 추가됩니다.'
                  : primaryLensId === 'staging' && miseWorkspace === 'shot'
                    ? 'Shot Staging Range는 다음 단계에서 추가됩니다.'
                    : undefined
              }
            >
              Range
            </button>
          </div>
          <div className="scope-shot-strip">
            {shots.map((shot, idx) => {
              const inScope = scopeMode === 'range'
                ? idx >= scopeFrom && idx <= scopeTo
                : idx === activeShot
              const isEdge = scopeMode === 'range' && (idx === scopeFrom || idx === scopeTo)
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
          <button type="button" className="scope-generate-btn">
            {primaryLens.displayName} 렌즈로 살펴보기
          </button>
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
          {viewerSnapshot ? viewerReflectionPane : (
            <>
              {reviewOpen && selectedOptionReview}

              <div className="primary-lens-control">
            <div className="primary-lens-heading">
              <div className="primary-lens-heading-copy">
                <strong>주 렌즈 / Primary Lens</strong>
                <span>지금 먼저 살펴볼 관점</span>
              </div>
              <div className="primary-lens-actions">
                <button
                  type="button"
                  className={`lens-overlap-button ${debateOpen ? 'active' : ''}`}
                  onClick={() => setDebateOpen((open) => !open)}
                  aria-pressed={debateOpen}
                >
                  <span aria-hidden="true">◎</span>
                  {debateOpen ? '렌즈 비교 닫기' : '렌즈 비교'}
                  <em>{MOCK_DEBATE_TURNS.length}</em>
                </button>
                <button
                  type="button"
                  className="viewer-entry-button"
                  onClick={openViewerReflection}
                  disabled={shots.length === 0}
                >
                  <span className="fresh-eyes-icon" aria-hidden="true" />
                  새 눈으로 보기
                </button>
              </div>
            </div>
            <div className="primary-lens-tabs" aria-label="Primary creative lens">
              {CREATIVE_LENSES.map((lens) => (
                <button
                  key={lens.id}
                  type="button"
                  className={primaryLensId === lens.id ? 'active' : ''}
                  style={{ '--lens-color': lens.accent }}
                  onClick={() => choosePrimaryLens(lens.id)}
                  aria-pressed={primaryLensId === lens.id}
                >
                  <span className="lens-glass lens-glass-sm" aria-hidden="true" />
                  <strong>{lens.displayName}</strong>
                </button>
              ))}
            </div>
          </div>

          <div className="option-lanes active-lens-workspace">
            <div
              key={primaryLens.id}
              className="option-lane primary"
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
                    {primaryLens.id === 'editing' ? currentEditingSuggestions.length : primaryLens.options.length}
                  </span>
                )}
                <strong>{primaryLens.lens}</strong>
              </div>
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
                      disabled={!lensIntents[primaryLens.id]?.trim()}
                    >
                      {lensIntentSubmitted[primaryLens.id] ? 'Focused' : 'Set focus'}
                    </button>
                  </div>
                </label>
              )}
              {primaryLens.id === 'camera' ? (
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
                      <span>현재 샷과 인접 연결 / Single + Boundary</span>
                      <strong>S{activeShot + 1} · {currentShot?.label || 'Current shot'}</strong>
                    </div>
                    <em>{currentEditingSuggestions.length}개 편집 제안</em>
                  </div>

                  <div className="editing-single-cue">
                    <span>편집 핵심</span>
                    <p>{currentEditingSingle.cue}</p>
                  </div>

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
                        <span>어느 컷부터</span>
                        <select
                          value={changeDraft.at}
                          onChange={(event) => setChangeDraft({
                            ...changeDraft,
                            at: Number(event.target.value),
                          })}
                        >
                          {shots.map((shot, index) => (
                            <option key={shot.id} value={index}>
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
                        disabled={!changeDraft.value.trim()}
                        onClick={() => {
                          addFactChange(
                            changeDraft.group,
                            changeDraft.label,
                            changeDraft.at,
                            changeDraft.value.trim(),
                            { characterId: changeDraft.characterId },
                          )
                          setChangeDraft(null)
                        }}
                      >
                        추가
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
                        onClick={() => setSpatialEditorOpen(true)}
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

          {debateOpen && (
            <section className="agent-debate-panel" aria-label="Cross-lens impacts">
              <div className="agent-debate-heading">
                <div>
                  <span className="tradeoff-eyebrow">Lens overlap</span>
                  <h2>각 관점의 효과와 비용을 함께 보기</h2>
                </div>
                <button type="button" onClick={() => setDebateOpen(false)}>Close</button>
              </div>
              <div className="debate-turn-list">
                {MOCK_DEBATE_TURNS.map((turn) => {
                  const speaker = getLens(turn.lensId)
                  const target = getLens(turn.targetLensId)
                  return (
                    <article key={turn.id} className="debate-turn" style={{ '--lens-color': speaker.accent }}>
                      <div className="debate-turn-meta">
                        <strong>{speaker.role}</strong>
                        <span>{turn.costType}</span>
                      </div>
                      <p>{turn.line}</p>
                      <div className="debate-target">
                        <span>affects</span>
                        <strong>{target.role} / {getOptionTitle(turn.targetOptionId)}</strong>
                      </div>
                    </article>
                  )
                })}
              </div>
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
            <p>도형과 인물을 드래그해 장면의 공간 기준을 정합니다.</p>
            <button type="button" onClick={() => setSpatialEditorOpen(false)}>↙ Scene State로 돌아가기</button>
          </header>
          <div className="mise-spatial-editor-canvas">
            <SpatialMap
              initialElements={miseSpatialElements}
              initialEntityPresets={MOCK_MISE_ENTITY_PRESETS}
              onElementsChange={updateMiseSpatialElements}
              showShotNodes={false}
            />
          </div>
        </section>
      )}
    </div>
  )
}
