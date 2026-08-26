import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import LensTracks from './LensTracks'
import StoryboardStripLane from './StoryboardStripLane'
import IssueInspector from './IssueInspector'
import ReadingTracks from './ReadingTracks'
import ReadingWorkbench from './ReadingWorkbench'
import RevisionWorkspace from './RevisionWorkspace'
import SeamEditor from './SeamEditor'
import { editingActionFor } from './seamAction'
import { requestDirectingReview, requestViewerReflection } from '../services/api'
import './DecisionBoard.css'
import { logEvent, logScaffold, normalizeLevel, storyboardVersion } from '../store/studyLog'
import useRequestHistory from '../hooks/useRequestHistory'

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


// 서버가 아직 Issue 묶기를 돌려주지 않는 개발 서버를 만나도, 렌즈가 낸
// 진단 자체는 트랙에서 사라지면 안 된다. 이 fallback은 관계를 추론하지
// 않고 진단 하나를 Issue 하나로만 보여 준다. 서버 Issue가 있으면 절대
// 섞지 않는다 — 관계로 묶인 Issue를 클라이언트가 다시 쪼개면 안 되기 때문.
const fallbackIssuesFromLensResults = (lensResults = {}) => (
  Object.entries(lensResults).flatMap(([lens, result]) => (
    (result?.diagnoses || []).map((diagnosis) => {
      const panels = [...new Set((diagnosis.targets || [])
        .map((target) => target.match(/^S\d+/)?.[0])
        .filter(Boolean))]
      const [first, second] = panels
      const isSeam = diagnosis.level === 'shot_relation' && panels.length >= 2
      const isScene = diagnosis.level === 'scene_structure' && panels.length >= 2
      return {
        id: `fallback:${lens}:${diagnosis.id}`,
        anchor: isSeam ? `${first}→${second}` : isScene ? `${first}–${panels.at(-1)}` : panels.join('·'),
        anchor_kind: isSeam ? 'seam' : isScene ? 'scene' : 'shot',
        // 이름은 진단이 스스로 붙인다. 여기서 다시 만들면 같은 진단이
        // 서버 경로와 다른 이름으로 보인다.
        title: diagnosis.title || diagnosis.rule_id || '검토할 것',
        // 마커 이름은 짧다. 진단 문장은 버리지 않고 툴팁으로 남긴다.
        detail: (diagnosis.diagnosis || diagnosis.suggested_action || '').trim(),
        diagnosis_ids: [diagnosis.id],
        lenses: [lens],
        origin_lens: lens,
        relation_types: [],
      }
    })
  ))
)

const VIEWER_READING_CONDITIONS = [
  {
    id: 'first_viewer',
    title: '화면만으로 읽기',
    attention: '화면에 보이는 것만으로 누가 누구고 무슨 일이 벌어지는지 따라갑니다.',
  },
  {
    id: 'film_literate',
    title: '연출 방식에 주목',
    attention: '프레이밍·반복·생략·컷의 관계가 만드는 영화적 기대와 강조를 따라갑니다.',
  },
  {
    // 저장된 관객 읽기와의 호환성을 위해 기존 id는 유지한다.
    id: 'context_close',
    title: '컷 연결에 주목',
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
  // 생김새(성별·나이·외형)에는 변화를 걸 수 없다.
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

// ViewerFixCard를 걷어냈다 (2026-08-27).
//
// `가까운 수정안 / 넓은 수정안 / 눈높이 수정안`은 진단과 무관한 하드코딩
// 프리셋이었다 — 어떤 갈림이든 늘 같은 세 버튼이 나와, "이 갈림을 풀려면
// 무엇을 바꿔야 하나"와 아무 상관이 없었다. 연출 검토가 AI가 낸
// `alternatives`를 판정하게 하는 것과 구조가 달랐던 이유다.
//
// 대신 읽힘 검토는 **고치지 않고 묻는다.** 관객이 남긴 물음에 감독이
// 답하면 그 답이 연출 검토의 전제로 쌓이고, 실제 수정은 거기서 한다
// (`LENS_TRACKS_UI.md` 7장).

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

// 컷 값이 아니라 구조를 바꿔야 하는 목적지. 선택지에 바꿀 샷 값이 없을 때
// 프롬프트보다 먼저 본다 — 컷 사이나 컷의 존재가 문제인데 패널 문장을
// 고치면 원인은 그대로 남는다.
const STRUCTURAL_ROUTES = ['seam', 'merge', 'split', 'insert', 'delete', 'layout', 'narrative', 'script']

// 규칙을 못 찾으면 층위로 정한다 — 한 컷의 속성은 그림, 나머지는 컷 구성.
const destinationsFor = (diagnosis) => (
  RULE_DESTINATIONS[diagnosis?.rule_id]
  || (diagnosis?.level === 'attribute' ? ['prompt', 'draw'] : ['cutplan'])
)

// 편집 대안은 이미지 프롬프트를 바꾸는 선택지가 아니다. 모델이 준 문장에
// 따라 해당 패널 또는 이음새의 구조 도구를 열어, 무엇이 변하는지 보면서
// 확정하게 한다.


function DirectingReviewResult({
  run, onTool, onApply, onOpenPrompt, onSavePrompt, promptDrafts,
  rewritingId, rewriteNotes, promptBefore, applyingId, promptGenerationStatus,
  cutOf, lensName, lensId, onFocusDiagnosis, focusedShotIndex, editingOperationCompletions,
  // `check` 질문에 감독이 답한 것을 실어 다시 분석한다.
  onAnswerCheck, answering,
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

  if (!result) return null

  return (
    <section
      /* 답을 받아 다시 도는 중에는 지난 판정을 지우지 않고 흐리게 둔다.
         감독이 방금 쓴 답과 그 답으로 무엇이 바뀌는지를 이어서 봐야 한다. */
      className={`directing-review-result${answering ? ' is-reanalyzing' : ''}`}
      aria-label={`${lensName} 분석 결과`}
      aria-busy={answering || undefined}
    >
      {answering && (
        <div className="directing-review-result-heading">
          <em className="directing-reanalyzing">답을 반영해 다시 분석 중…</em>
        </div>
      )}

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
                    {[...new Set(diagnosis.targets.map((target) => target.split('.', 1)[0]))].map((target) => {
                      const match = target.match(/^S(\d+)/)
                      const shotIndex = match ? Number(match[1]) - 1 : null
                      return (
                        <button
                          key={target}
                          type="button"
                          className={shotIndex === focusedShotIndex ? 'active' : ''}
                          onClick={() => onFocusDiagnosis?.(diagnosis, target)}
                        >
                          {target.split('.', 1)[0]}
                        </button>
                      )
                    })}
                  </div>
                  <strong>{diagnosis.diagnosis}</strong>
                  <div className="directing-suggested-action">
                    <span>수정 방향</span>
                    <p>{diagnosis.suggested_action}</p>
                  </div>
                  {/* 갈 수 있는 길. '그대로 두기'가 늘 먼저 온다 — 유지도
                      연출 결정이고, 선택지에 없으면 진단이 지시가 된다. */}
                  {diagnosis.alternatives?.length > 0 && (
                    <details className="directing-alternatives-disclosure">
                      <summary>추천안 보기</summary>
                      <div className="directing-alternatives">
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
                                  // 하나의 제안은 여러 카메라 값을 함께 바꿀 수
                                  // 있다. 하지만 서로 다른 제안을 조합하지는
                                  // 않는다 — 어떤 판단을 적용했는지 분명해야 한다.
                                  <button
                                    type="button"
                                    onClick={() => onApply?.(diagnosis, alternative)}
                                  >
                                    이 수정안 보기
                                  </button>
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
                    </details>
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
                    {/* 편집 진단도 여기서 길을 준다. 실행은 여전히 이음새
                        카드에서 한다 — 어느 컷이 바뀌는지 그림을 보고
                        확인해야 하기 때문이다. 다만 그 자리까지 데려가는
                        것과 아무 버튼도 두지 않는 것은 다르다. 버튼이
                        없으면 편집 진단만 갈 곳 없이 남고, 옆 카드의
                        `프롬프트 고치기`가 유일하게 누를 수 있는 길이
                        된다 — 문제는 컷 사이에 있는데 처분은 패널로
                        흘러간다 (DG2). */}
                    {destinationsFor(diagnosis)
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
                  <details className="directing-rationale-disclosure">
                    <summary>왜 이렇게 봤지?</summary>
                    <div>
                      {diagnosis.criterion && (
                        <p className="directing-criterion">이 기준으로 봤어요 · {diagnosis.criterion}</p>
                      )}
                      {diagnosis.evidence?.length > 0 && (
                        <div className="directing-evidence">
                          <span>화면 근거</span>
                          <ul>
                            {diagnosis.evidence.map((evidence) => <li key={evidence}>{evidence}</li>)}
                          </ul>
                        </div>
                      )}
                      {diagnosis.theory_basis && (
                        <p className="directing-theory-basis">이론 근거 · {diagnosis.theory_basis}</p>
                      )}
                    </div>
                  </details>
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

export default function DecisionBoard({ boardView = 'split', onBackToStoryboard = null }) {
  const [selectedOptionId, setSelectedOptionId] = useState(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewMode, setReviewMode] = useState('multi')
  const [fullAnalysisOpen, setFullAnalysisOpen] = useState(false)
  const [directingIssueDecisions, setDirectingIssueDecisions] = useState({})
  const [activeDirectingIssueId, setActiveDirectingIssueId] = useState(null)
  const [expandedDirectingIssueId, setExpandedDirectingIssueId] = useState(null)
  // 검토 화면은 렌즈 하나를 고르는 탭이 아니라, 같은 위치를 여러 렌즈로
  // 겹쳐 보는 자리다. 선택한 Issue가 곧 현재 focus다.
  const [activeTrackLenses, setActiveTrackLenses] = useState(() => new Set(['mise', 'camera', 'editing']))
  const [selectedIssueId, setSelectedIssueId] = useState(null)
  const [revisionWorkspace, setRevisionWorkspace] = useState(null)
  // 두 컷 사이에 펼친 편집. { operation, removingPanel, pendingEdit }
  const [seamEdit, setSeamEdit] = useState(null)
  // 읽힘 검토도 같은 구조로 돈다 — 트랙에서 갈린 자리를 고르고, 아래
  // Workbench에서 관객을 갈아 끼우며 읽는다 (LENS_TRACKS_UI.md 7장).
  // 연출 쪽 `activeTrackLenses`/`selectedIssueId`와 같은 자리의 상태다.
  const [activeReadingTracks, setActiveReadingTracks] = useState(() => new Set())
  const [selectedReadingFindingId, setSelectedReadingFindingId] = useState(null)
  // 지금 펼쳐 읽고 있는 칸 — 어느 관객의 어느 컷인가.
  const [selectedReadingStep, setSelectedReadingStep] = useState(null)
  // 관객 읽기가 남긴 질문에 감독이 답한 것. 여기서 바로 분석을 돌리지
  // 않는다 — 관객은 의도를 모르는 것이 원칙이라, 감독의 답을 관객에게
  // 먹이면 그 전제가 깨진다. 답은 **연출 검토의 전제**로만 쌓이고,
  // 나중에 다관점 검토를 돌릴 때 세 렌즈가 그 위에서 본다.
  const [readingAnswers, setReadingAnswers] = useState({})
  // 스트립에서 지금 보고 있는 컷. 검토 대상(singleScopeShotId)과 다른
  // 것이다 — 스트립을 훑는 것은 "어디를 보는가"이지 "무엇을 검토하는가"가
  // 아니다 (LENS_TRACKS_UI.md 1장의 역할 분리). 검토 대상은 범위가 잠가
  // 두므로, 여기서 컷을 옮겨도 검토 대상은 흔들리지 않는다.
  const [browsingShotIndex, setBrowsingShotIndex] = useState(null)
  // Issue에 추가로 확인한 렌즈의 상태. 원래 다관점 분석 결과를 덮어쓰지
  // 않아야, "아직 안 봄"과 "봤지만 문제 없음"을 구분할 수 있다.
  const [issueLensChecks, setIssueLensChecks] = useState({})
  // 갈림을 눌러 범위를 옮긴 뒤, 그 범위로 검토를 돌려야 한다는 표시.
  // 범위 state가 반영된 다음 렌더에서 실행된다.
  const [pendingDivergenceReview, setPendingDivergenceReview] = useState(null)
  const reviewSequenceScrollRef = useRef(null)
  // 읽힘 검토의 스트립과 트랙이 공유하는 스크롤. 연출 쪽과 따로 둔다 —
  // 두 화면이 같은 ref를 쓰면 한쪽에서 옮긴 위치가 다른 쪽에 남는다.
  const readingSequenceScrollRef = useRef(null)
  const [directingQuestionDecisions, setDirectingQuestionDecisions] = useState({})
  const [directingQuestionDrafts, setDirectingQuestionDrafts] = useState({})
  const [multiReviewRuns, setMultiReviewRuns] = useState({})
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
  const updateSceneStateAt = useStore((s) => s.updateSceneStateAt)
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
  // 장면 기준의 편집은 별도 화면으로 보내지 않는다. 단, 인물 수가 많아질 때
  // 처음부터 전부 펼치면 기준 확인 자체가 길어지므로 세 명까지만 먼저 보인다.
  const [sceneBasisEditing, setSceneBasisEditing] = useState(false)
  const [sceneBasisCharactersExpanded, setSceneBasisCharactersExpanded] = useState(false)
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
  // 범위는 드롭다운으로 시작·끝 번호를 입력하지 않고 왼쪽 패널에서 직접
  // 고른다. 확정 전에는 실제 분석 범위를 건드리지 않아 자동 재분석도 막는다.
  const [scopeSelection, setScopeSelection] = useState(null)
  const [selectedReadingConditionIds, setSelectedReadingConditionIds] = useState(['first_viewer'])
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
  const scene = scenes[activeScene]
  const activeShot = scene?.activeShot ?? 0
  const activeBranch = scene?.activeBranch ?? 0
  const branch = scene?.branches?.[activeBranch]
  const shots = useMemo(() => branch?.shots || [], [branch?.shots])
  const scopeSelectableShotIds = useMemo(() => shots
    .filter((shot) => Boolean(panelDraftImages[shot.id] || shot.image))
    .map((shot) => shot.id), [panelDraftImages, shots])
  const scopeSelectableShotIdSet = useMemo(
    () => new Set(scopeSelectableShotIds),
    [scopeSelectableShotIds],
  )
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
  const scopeSelectionFrom = scopeSelection?.anchor == null
    ? null
    : Math.min(scopeSelection.anchor, scopeSelection.end ?? scopeSelection.anchor)
  const scopeSelectionTo = scopeSelection?.anchor == null
    ? null
    : Math.max(scopeSelection.anchor, scopeSelection.end ?? scopeSelection.anchor)
  const scopeSelectionCanConfirm = scopeSelectionFrom != null
    && !scopeSelection?.error
    && (reviewMode !== 'viewer' || scopeSelectionTo > scopeSelectionFrom)
  const reviewStripHighlight = scopeSelectionFrom != null
    ? { from: scopeSelectionFrom, to: scopeSelectionTo }
    : { from: scopeFrom, to: scopeTo }

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

  const multiReviewRun = useMemo(() => (
    multiReviewRuns[multiReviewScopeKey] || { status: 'idle' }
  ), [multiReviewRuns, multiReviewScopeKey])
  const multiReviewLoading = multiReviewRun.status === 'loading'
  const multiReviewHasResult = ['ready', 'stale'].includes(multiReviewRun.status)
  // 분석을 시작한 순간 Inspect는 열려 있어야 한다. 첫 렌즈 결과가 오면
  // 바로 트랙과 Inspector에 반영하고, 셋째 결과까지 기다리지 않는다.
  const multiReviewVisible = multiReviewLoading || multiReviewHasResult
  // 관계는 세 종류다. 셋 다 같은 카드로 나열한다 — 합의만 요약 상자로
  // 빼두면 근거도 판정도 붙지 않아, 감독이 그 관계에 답할 수 없다.
  const multiFindings = multiReviewRun.commonFindings || []
  const multiRelations = multiFindings
  const issuesOfRun = useCallback((run) => {
    const reported = (run?.issues || []).length > 0
      ? run.issues
      : fallbackIssuesFromLensResults(run?.lensResults)
    // 다시 보는 중이라 새 결과가 아직 없으면 지난 결과를 보여 준다.
    // 트랙이 비면 보고 있던 Inspector까지 닫힌다.
    return reported.length > 0 ? reported : (run?.carriedIssues || [])
  }, [])

  // 트랙에는 이 씬에서 지금까지 발견한 이슈를 전부 놓는다. 검토는 범위를
  // 정해 돌리지만, 발견된 문제는 그 범위의 것이 아니라 씬의 것이다 —
  // 범위를 좁히는 순간 앞서 찾은 문제가 사라지면, 감독은 무엇이 남아
  // 있는지 알려고 범위를 다시 옮겨 가며 확인해야 한다.
  //
  // 같은 이슈가 여러 번 검토에 걸리면 가장 최근 run의 것만 남긴다.
  // requestId가 클수록 최신이다.
  const scenePrefix = `${scene?.id || activeScene}:`
  const trackIssues = useMemo(() => {
    // 검토를 여러 번 돌리면 같은 문제가 다시 나올 수 있다. 그때만 최신
    // 것으로 갈음한다 — 서로 다른 문제는 범위가 겹치더라도 그대로 둔다.
    //
    // 백엔드 issue id는 한 응답 안에서만 고유해서(`issue-0`…) 같은 이슈인지
    // 판정하는 데 쓸 수 없다. 어디를 짚었고 무엇을 말하는가로 본다.
    const identity = (issue) => [
      issue.anchor,
      issue.anchor_kind,
      [...(issue.lenses || [])].sort().join(','),
      issue.title,
    ].join('|')

    const newest = new Map()
    Object.entries(multiReviewRuns).forEach(([key, run]) => {
      if (!key.startsWith(scenePrefix)) return
      // loading도 포함한다. 재검토를 시작하면 그 범위 run이 loading으로
      // 바뀌는데, 여기서 걸러내면 이미 발견한 Issue가 목록에서 통째로
      // 빠진다 — 그러면 아래 선택 유지 effect가 선택을 놓아, 보고 있던
      // Inspector가 사라진다. 새 결과가 오면 그때 갈음된다.
      if (!['ready', 'stale', 'loading'].includes(run?.status)) return
      const requestId = run.requestId || 0
      issuesOfRun(run).forEach((issue) => {
        const identityKey = identity(issue)
        const previous = newest.get(identityKey)
        if (previous && previous.requestId >= requestId) return
        newest.set(identityKey, {
          requestId,
          // id도 run별로 갈라 둔다. 그대로 두면 서로 다른 이슈가 같은 id를
          // 가져, 하나를 고르면 엉뚱한 것이 함께 켜진다.
          issue: { ...issue, id: `${key}::${issue.id}`, sourceScopeKey: key },
        })
      })
    })
    return [...newest.values()].map((entry) => entry.issue)
  }, [multiReviewRuns, scenePrefix, issuesOfRun])
  // 진단도 트랙과 같은 범위를 덮어야 한다. 현재 run만 담으면 다른 범위에서
  // 발견한 이슈를 열었을 때 근거가 비어 '진단 없음'으로 보인다.
  const diagnosesById = useMemo(() => {
    const byId = new Map()
    Object.entries(multiReviewRuns).forEach(([key, run]) => {
      if (!key.startsWith(scenePrefix)) return
      Object.entries(run?.lensResults || {}).forEach(([lens, result]) => {
        result?.diagnoses?.forEach((diagnosis) => byId.set(diagnosis.id, { lens, diagnosis }))
      })
    })
    return byId
  }, [multiReviewRuns, scenePrefix])
  const selectedTrackIssue = trackIssues.find((issue) => issue.id === selectedIssueId) || null
  // 고른 Issue가 목록에서 사라지면 아래 Inspector가 빈 채로 남는다.
  // 어디서 끊겼는지 알 수 있게 그 순간만 찍는다.
  if (selectedIssueId && !selectedTrackIssue) {
    console.warn('[SceneLens] 고른 Issue를 목록에서 못 찾음', {
      selectedIssueId,
      trackIssueIds: trackIssues.map((issue) => issue.id),
      scenePrefix,
      scopeKey: multiReviewScopeKey,
      runKeys: Object.keys(multiReviewRuns),
      runStatuses: Object.fromEntries(
        Object.entries(multiReviewRuns).map(([key, run]) => [key, run?.status]),
      ),
    })
  }
  const selectedIssueMainLensQuestion = useMemo(() => {
    if (!selectedTrackIssue?.sourceScopeKey) return null
    const panelIds = new Set(selectedTrackIssue.anchor?.match(/S\d+/g) || [])
    const questions = multiReviewRuns[selectedTrackIssue.sourceScopeKey]?.questions
    if (!Array.isArray(questions)) return null
    return questions.find((question) => {
      if (!question || !Array.isArray(question.lenses) || !Array.isArray(question.targets)) return false
      if (!question.lenses.includes(selectedTrackIssue.origin_lens)) return false
      return question.targets.some((target) => (
        typeof target === 'string' && panelIds.has(target.split('.', 1)[0])
      ))
    }) || null
  }, [multiReviewRuns, selectedTrackIssue])
  // 키는 Issue가 나온 run을 따른다. 현재 범위로 묶으면, 다른 범위에서
  // 발견한 Issue를 열었을 때 확인 결과가 엉뚱한 키에 저장돼 다시 눌러도
  // 빈 채로 남는다. issueId에 이미 run 키가 붙어 있어 이것만으로 고유하다.
  const issueLensCheckKey = useCallback((issueId, lens) => (
    `${issueId}:${lens}`
  ), [])
  // 렌즈 이름 순으로 훑지만 순서는 `addedAt`이 정한다. 여기서 만든 객체의
  // 키 순서에 기대면 안 된다 — 흐름을 그리는 쪽이 그 값으로 정렬한다.
  const selectedIssueLensChecks = selectedTrackIssue
    ? Object.fromEntries(['mise', 'camera', 'editing'].flatMap((lens) => {
      const check = issueLensChecks[issueLensCheckKey(selectedTrackIssue.id, lens)]
      return check ? [[lens, check]] : []
    }))
    : {}
  const selectedTrackShotIndex = useMemo(() => {
    const match = selectedTrackIssue?.anchor?.match(/S(\d+)/)
    return match ? Number(match[1]) - 1 : null
  }, [selectedTrackIssue])
  // 이슈 id는 run 키까지 붙여 두므로 범위가 바뀌어도 다른 이슈로 뒤바뀌지
  // 않는다. 그래서 범위만 옮겼을 때는 선택을 유지한다 — 트랙이 씬 전체를
  // 보여주는데 선택만 풀리면, 보던 이슈를 다시 찾아 눌러야 한다.
  // 다만 고른 이슈가 사라졌다면(재분석으로 해소) 선택도 놓는다.
  useEffect(() => {
    setSelectedIssueId((current) => (
      current && !trackIssues.some((issue) => issue.id === current) ? null : current
    ))
  }, [trackIssues])
  // 메인 연출 검토에서는 렌즈별 보고서가 아니라 실제로 결정할 진단만 한데
  // 모은다. 질문·이론·네 층위 판정은 전체 분석에 그대로 남긴다.
  const directingIssues = MULTI_LENS_ORDER.flatMap(({ backendId, lensId, mark }) => {
    const perspective = PERSPECTIVES.find((item) => item.id === lensId)
    const result = multiReviewRun.lensResults?.[backendId]
    return (result?.diagnoses || []).map((diagnosis) => ({
      id: `${backendId}:${diagnosis.id}`,
      diagnosis,
      backendId,
      lensId,
      mark,
      lensName: perspective?.displayName || lensName(backendId),
      accent: perspective?.accent || '#d8aa62',
    }))
  })
  // 다시 분석하면 같은 진단 id라도 새 검토다. 이전에 '유지'한 답으로 새
  // 결과가 조용히 사라지지 않도록 실행 id까지 결정 키에 포함한다.
  const directingDecisionKey = (issueId) => (
    `${multiReviewScopeKey}:${multiReviewRun.requestId || 'idle'}:${issueId}`
  )
  const unresolvedDirectingIssues = directingIssues.filter((issue) => (
    !directingIssueDecisions[directingDecisionKey(issue.id)]
  ))
  const currentDirectingIssue = unresolvedDirectingIssues.find((issue) => (
    issue.id === activeDirectingIssueId
  )) || unresolvedDirectingIssues[0] || null
  const currentDirectingIssueIndex = currentDirectingIssue
    ? directingIssues.findIndex((issue) => issue.id === currentDirectingIssue.id)
    : -1
  // 질문은 상세 보고서에 한꺼번에 나열하지 않는다. 메인 진단을 모두 본 뒤
  // 하나씩 답하며, 답은 마지막에 한 번만 다시 분석에 보낸다.
  const directingQuestions = (() => {
    const seen = new Set()
    const add = (question) => {
      const prompt = question?.prompt || question?.question || question
      if (!prompt || seen.has(prompt)) return null
      seen.add(prompt)
      return {
        id: question?.id || `check:${question?.backendId || 'multi'}:${question?.level || 'intent'}:${prompt}`,
        prompt,
        level: DIAGNOSTIC_LEVEL_LABELS[question?.level] || question?.level || '연출 의도',
        lenses: question?.lenses || (question?.backendId ? [question.backendId] : []),
      }
    }
    const all = [
      ...(multiReviewRun.questions || []).map(add),
      // Issue를 보다 뒤늦게 참여한 렌즈가 남긴 질문. 그 카드 안에만 두면
      // Issue를 옮기는 순간 사라져, 감독이 답할 기회를 놓친다. 검토 전체의
      // `확인할 것`으로 올려 어디서든 답하게 한다.
      ...Object.entries(issueLensChecks).flatMap(([key, check]) => {
        if (!check?.question) return []
        const lens = key.split(':').at(-1)
        return [add({ ...check.question, backendId: lens })]
      }),
      ...Object.entries(multiReviewRun.lensResults || {}).flatMap(([backendId, result]) => (
        (result.level_assessments || [])
          .filter((assessment) => assessment.status === 'check' && assessment.open_question)
          .map((assessment) => add({
            id: `${backendId}:${assessment.level}:${assessment.open_question}`,
            prompt: assessment.open_question,
            level: assessment.level,
            backendId,
          }))
      )),
    ]
    return all.filter(Boolean)
  })()
  const directingQuestionCount = directingQuestions.length
  const directingQuestionDecisionKey = (questionId) => (
    `${multiReviewScopeKey}:${multiReviewRun.requestId || 'idle'}:${questionId}`
  )
  const unresolvedDirectingQuestions = directingQuestions.filter((question) => (
    !directingQuestionDecisions[directingQuestionDecisionKey(question.id)]
  ))
  const currentDirectingQuestion = unresolvedDirectingQuestions[0] || null
  const answeredDirectingQuestions = [
    ...directingQuestions.flatMap((question) => {
      const decision = directingQuestionDecisions[directingQuestionDecisionKey(question.id)]
      return decision?.status === 'answered'
        ? [{ level: question.level, question: question.prompt, answer: decision.answer }]
        : []
    }),
    // 읽힘 검토에서 답한 것도 같은 전제다. 감독이 확정한 창작 결정이므로
    // 어느 화면에서 답했든 세 렌즈가 함께 그 위에서 본다.
    ...Object.entries(readingAnswers).map(([, entry]) => ({
      level: `${entry.anchor} 읽힘`,
      question: entry.question,
      answer: entry.answer,
    })),
  ]
  // 메인 검토에서 요약만 본 뒤에도, 세 렌즈가 낸 원래 상세 보고서로
  // 돌아갈 길은 남겨 둔다. 상세 내용은 각 렌즈 작업대가 그대로 맡고,
  // 여기서는 그곳으로 들어가는 입구만 제공한다.
  const multiReviewDetailLenses = MULTI_LENS_ORDER.filter(({ backendId }) => (
    Boolean(multiReviewRun.lensResults?.[backendId])
  ))
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
  const setCurrentLensIntent = useCallback((nextValue) => {
    setLensIntents((current) => ({ ...current, [primaryLens.id]: nextValue }))
  }, [primaryLens.id])
  const lensRequestRecall = useRequestHistory({
    historyKey: `lens:${primaryLens.id}`,
    setValue: setCurrentLensIntent,
  })

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
    const nextRequest = `의도 비공개 관객 관점 ${panelLabel}: ${interpretation}\n화면 근거: ${cues}\n이 읽힘이 생기는 이유와 조정할 방법을 검토해줘.`
    updateLensIntent(primaryLens.id, nextRequest)
    lensRequestRecall.resetNavigation(nextRequest)
  }

  const submitLensIntent = (lensId) => {
    if (lensId !== primaryLens.id || !lensIntentDirty || lensReviewLoading) return
    const normalizedIntent = lensIntentDraft.trim()
    lensRequestRecall.record(normalizedIntent)
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

  // Inspector의 출발점은 현재 Lens 하나다. 다른 관점은 Issue를 본 뒤
  // 감독이 직접 더한다.
  const runMultiReview = async ({ answers = [], lenses = null } = {}) => {
    logEvent('review', { mode: 'multi' })
    logScaffold({ feature: 'lens', action: 'open', mode: 'multi' })
    if (multiReviewLoading) return
    // 새 분석 결과는 먼저 '확인할 것'만 보인다. 사용자가 열기 전에는
    // 전체 분석이 지난 상태를 이어 받아 펼쳐지지 않게 한다.
    setFullAnalysisOpen(false)
    const scopeKey = multiReviewScopeKey
    const requestId = Date.now()
    const requestedLenses = lenses || [{ staging: 'mise', camera: 'camera', editing: 'editing' }[primaryLens.id] || 'camera']
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
      // 지난 결과를 안고 loading으로 들어간다. 통째로 갈아치우면 다시 보는
      // 동안 이미 발견한 Issue가 트랙에서 사라지고, 보고 있던 Inspector도
      // 함께 닫힌다. 렌즈 결과가 도착하는 대로 아래에서 덮어쓴다.
      [scopeKey]: {
        ...(current[scopeKey] || {}),
        status: 'loading',
        requestId,
        intent: '',
        creatorContext: answers,
        // 새 결과는 빈 상태에서 다시 쌓는다. 아래에서 렌즈마다 issues에
        // 누적하므로, 지난 것을 그대로 두면 옛 Issue가 새 결과에 섞인다.
        issues: [],
        questions: [],
        lensResults: {},
        // 다시 보는 동안 트랙에 남겨 둘 지난 결과. 새 결과가 하나라도
        // 오면 그때부터 issues가 쓰인다.
        carriedIssues: issuesOfRun(current[scopeKey]),
      },
    }))

    try {
      const panels = await buildReviewPanels(entries)
      const outcomes = await Promise.all(MULTI_LENS_ORDER
        .filter(({ backendId }) => requestedLenses.includes(backendId))
        .map(async ({ backendId, lensId }) => {
        try {
          const response = await requestDirectingReview({
            mode: backendId,
            panels,
            intent: '',
            answers,
          })
          const result = response.lens_results?.[backendId]
          if (!result) throw new Error(`${lensName(backendId)} 결과를 받지 못했습니다.`)

          /* 이 렌즈가 어느 층위를 짚었는지 남긴다.
           *
           * design_goal.md DG2: "미장센·촬영·편집은 문제를 발견하는
           * 관점이지 접근 가능한 층위를 제한하는 권한이 아니다. 모든
           * 관점은 네 층위를 진단할 수 있으며…"
           *
           * 이 주장은 화면에 렌즈×층위 표를 늘어놓아서가 아니라, 실제로
           * 그렇게 나왔다는 기록으로 뒷받침된다. 표를 두면 오히려 칸을
           * 채워야 하는 것처럼 보여 반대 인상을 준다.
           *
           * 진단 하나가 한 줄이다 — 렌즈별 층위 분포를 나중에 집계할 수
           * 있어야 하므로 합쳐서 세어 두지 않는다.
           */
          ;(result.diagnoses || []).forEach((diagnosis) => {
            logEvent('diagnosis', {
              lens: backendId,
              level: diagnosis.level || null,
              rule: diagnosis.rule_id || null,
              // 어느 범위를 검토하다 나온 것인가. 같은 층위라도 한 컷을
              // 볼 때와 범위를 볼 때 나오는 것이 다르다.
              scopeMode: scope.mode,
              scopeSize: scope.shotIds?.length ?? 0,
              targets: (diagnosis.targets || []).length,
            })
          })

          setMultiReviewRuns((current) => {
            const previous = current[scopeKey]
            if (previous?.requestId !== requestId) return current
            const questions = [...(previous.questions || []), ...(response.questions || [])]
            const issues = [...(previous.issues || []), ...(response.issues || [])]
            return {
              ...current,
              [scopeKey]: {
                ...previous,
                lensResults: { ...(previous.lensResults || {}), [backendId]: result },
                // 렌즈 하나가 끝나면 그 렌즈의 Issue도 곧바로 트랙에 올린다.
                issues,
                questions: [...new Map(questions.map((question) => [question.id, question])).values()],
              },
            }
          })

          // 같은 결과를 각 렌즈 작업대에도 즉시 심는다.
          setLensReviewRuns((current) => ({
            ...current,
            [`${scopeKey}:${lensId}`]: {
              status: 'ready',
              requestId,
              intent: '',
              fingerprint: scopeFingerprint,
              result,
              questions: (response.questions || [])
                .filter((question) => question.lenses?.includes(backendId)),
            },
          }))
          return { backendId, ok: true }
        } catch (error) {
          return { backendId, ok: false, error: error.message || '분석하지 못했습니다.' }
        }
        }))

      setMultiReviewRuns((current) => {
        const previous = current[scopeKey]
        if (previous?.requestId !== requestId) return current
        const failedLenses = outcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.backendId)
        const complete = outcomes.length - failedLenses.length
        return {
          ...current,
          [scopeKey]: complete > 0
            ? { ...previous, status: 'ready', failedLenses }
            : {
                ...previous,
                status: 'error',
                failedLenses,
                error: '현재 Lens 분석을 완료하지 못했습니다.',
              },
        }
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

  // 자동 분석은 하지 않는다. Decision Board 진입 직후의 범위는 감독이
  // 고른 것이 아니라 마지막으로 보던 패널 하나(activeShot)이거나, 관객
  // 검토가 넓혀 둔 범위다 — 둘 다 감독이 "이걸 검토하겠다"고 정한 범위가
  // 아니다. 임의의 범위를 임의의 시점에 분석해 버리면 그 결과가 무엇을
  // 검토한 것인지 감독이 다시 확인해야 한다. 범위를 보고 `분석하기`를
  // 누르는 것 자체가 검토 대상을 정하는 행위다 (design_goal.md DG1 P2).

  // 관계는 따로 부른다. 렌즈 셋만 50초, 관계까지 하면 70초라 결과를
  // 보기까지 너무 오래 기다린다.
  const runRelateReview = async (requestedScopeKey = multiReviewScopeKey) => {
    logEvent('review', { mode: 'relate' })
    logScaffold({ feature: 'cross_lens', action: 'open', mode: 'relate' })
    const scopeKey = requestedScopeKey
    const run = multiReviewRuns[scopeKey]
    if (!run?.lensResults || run.relating) return
    const relationRequestId = run.requestId

    setMultiReviewRuns((current) => ({
      ...current,
      ...(current[scopeKey]?.requestId === relationRequestId
        ? { [scopeKey]: { ...current[scopeKey], relating: true, relateError: null } }
        : {}),
    }))

    try {
      const response = await requestDirectingReview({
        mode: 'relate',
        // 이미지는 안 보낸다. 판단만 보고 관계를 찾는다.
        panels: [{ id: 'S1', image: '' }],
        intent: run.intent || '',
        lensResults: run.lensResults,
      })
      setMultiReviewRuns((current) => {
        if (current[scopeKey]?.requestId !== relationRequestId) return current
        return {
          ...current,
          [scopeKey]: {
            ...current[scopeKey],
            relating: false,
            commonFindings: response.common_findings || [],
            comparisons: response.comparisons || [],
            // 관점 비교는 선택한 Issue를 다시 묶는 작업이 아니다. 여기서
            // 목록을 교체하면 방금 보고 있던 Issue가 사라져 비교 결과를
            // 읽을 수 없게 된다.
            issues: current[scopeKey].issues || response.issues || [],
            droppedRelations: response.dropped_relations || 0,
            order: response.order || null,
            related: true,
          },
        }
      })
    } catch (error) {
      setMultiReviewRuns((current) => {
        if (current[scopeKey]?.requestId !== relationRequestId) return current
        return {
          ...current,
          [scopeKey]: { ...current[scopeKey], relating: false, relateError: error.message },
        }
      })
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

  // 장면 기준 요약에서도 값은 곧바로 실제 생성 기준에 쓴다. 여기서 임시
  // 초안을 따로 만들면, 저장을 잊었을 때 요약과 패널 생성 기준이 갈린다.
  const updateSceneBasisFact = (group, label, value) => {
    updateSceneStateAt(activeSceneId, (current) => ({
      ...current,
      [group]: {
        ...current[group],
        facts: (current[group]?.facts || []).map((fact) => (
          fact.label === label ? { ...fact, value } : fact
        )),
      },
    }))
  }

  const updateSceneBasisName = (group, value) => {
    updateSceneStateAt(activeSceneId, (current) => ({
      ...current,
      [group]: { ...current[group], name: value },
    }))
  }

  const updateSceneBasisCharacter = (character, patch) => {
    updateSceneCharacter(character.id, {
      ...character,
      ...patch,
      facts: (patch.facts || character.facts).map((fact) => ({ ...fact })),
    })
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

  const scopeSelectionLocked = () => reviewMode === 'staging' && miseWorkspace === 'shot'

  const beginScopeSelection = () => {
    if (scopeSelectionLocked()) return
    setScopeSelection({ anchor: null, end: null, error: '' })
    setLensFocusedShotIndex(null)
  }

  // 선택 모드 밖에서 shift를 누른 채 컷을 누른 경우. "범위 바꾸기"를 먼저
  // 찾아 누르게 하지 않고, 지금 보고 있는 컷을 시작점으로 삼아 모드를 연다.
  // 확정은 그대로 "이 범위로 검토"를 거친다 — 범위가 바뀌면 검토를 다시
  // 돌려야 하므로, 누르는 순간 조용히 확정되면 안 된다.
  const beginScopeSelectionFrom = () => {
    if (scopeSelectionLocked()) return false
    const anchorIndex = scopeMode === 'range' ? scopeFrom : scopedShotIndex
    const anchorShot = shots[anchorIndex]
    // 시작점 자신이 범위에 못 들어가는 컷이면 늘릴 것이 없다.
    if (!anchorShot || !scopeSelectableShotIdSet.has(anchorShot.id)) return false
    setLensFocusedShotIndex(null)
    setScopeSelection({ anchor: anchorIndex, end: null, error: '' })
    return true
  }

  // extend: shift를 누른 채 눌렀는가. 시작점을 그대로 두고 끝만 옮긴다 —
  // 범위를 잘못 잡았을 때 처음부터 다시 고르지 않아도 된다.
  const selectScopeShot = (index, event = null) => {
    const extend = Boolean(event?.shiftKey)
    // 선택 모드 밖에서 shift로 들어온 경우, 지금 보고 있는 컷을 시작점으로
    // 모드를 먼저 연다. 아래 setScopeSelection은 함수형이라 방금 연 상태를
    // 이어받아 이 클릭이 그대로 끝점이 된다.
    if (!scopeSelection && extend && !beginScopeSelectionFrom()) return
    const shot = shots[index]
    if (!shot || !scopeSelectableShotIdSet.has(shot.id)) {
      setScopeSelection((current) => current ? {
        ...current,
        error: `S${index + 1}은 이미지가 없어 검토 범위에 넣을 수 없습니다.`,
      } : current)
      return
    }
    setFlowActiveShot(index)
    setScopeSelection((current) => {
      if (!current) return current
      // shift는 이미 잡아 둔 범위를 늘리거나 줄인다. 시작점이 없을 때는
      // 늘릴 것이 없으므로 평소처럼 시작점으로 삼는다.
      if (current.anchor == null) {
        return { anchor: index, end: null, error: '' }
      }
      if (!extend && current.end != null) {
        // 범위를 다 고른 뒤 그냥 누르면 새로 시작한다. shift 없이 눌렀는데
        // 끝점만 바뀌면, 다른 범위를 잡으려던 사람이 빠져나갈 길이 없다.
        return { anchor: index, end: null, error: '' }
      }
      const from = Math.min(current.anchor, index)
      const to = Math.max(current.anchor, index)
      const missingIndex = shots.findIndex((candidate, candidateIndex) => (
        candidateIndex >= from
        && candidateIndex <= to
        && !scopeSelectableShotIdSet.has(candidate.id)
      ))
      if (missingIndex >= 0) {
        return {
          ...current,
          end: null,
          error: `S${missingIndex + 1}에 이미지가 없어 그 앞까지만 선택할 수 있습니다.`,
        }
      }
      return { ...current, end: index, error: '' }
    })
  }

  const commitScopeSelection = () => {
    if (!scopeSelectionCanConfirm) return
    const from = scopeSelectionFrom
    const to = scopeSelectionTo
    const firstShot = shots[from]
    setRangeStart(from)
    setRangeEnd(to)
    setFlowActiveShot(from)
    setViewerReport(null)
    setViewerPanelOrder(null)
    if (from === to) {
      setScopeMode('single')
      setSingleScopeShotId(firstShot?.id || null)
    } else {
      setScopeMode('range')
    }
    setScopeSelection(null)
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
    // 관객은 제작된 이야기의 시작부터 지금 볼 수 있는 마지막 패널까지
    // 읽는다. 중간 빈 패널을 뛰어넘으면 존재하지 않는 연결을 만들게 되므로
    // 첫 미생성 컷 직전까지만 연속 범위로 잡는다.
    const firstMissingIndex = shots.findIndex((shot) => (
      !scopeSelectableShotIdSet.has(shot.id)
    ))
    const generatedEnd = firstMissingIndex === -1 ? shots.length - 1 : firstMissingIndex - 1
    if (generatedEnd < 1) return
    setCameraPreview(null)
    setReviewOpen(false)
    setScopeSelection(null)
    // 다른 렌즈를 잠깐 보고 돌아온 경우에는 같은 관객 읽기를 그대로
    // 보여 준다. 매번 새 분석처럼 초기화되면 결과를 비교할 수 없다.
    const snapshotShots = viewerSnapshot?.shots || []
    const snapshotFirstMissing = snapshotShots.findIndex((shot) => !shot.image)
    const snapshotGeneratedEnd = snapshotFirstMissing === -1
      ? snapshotShots.length - 1
      : snapshotFirstMissing - 1
    if (
      viewerSnapshot?.sceneId === scene?.id
      && viewerReport
      && snapshotGeneratedEnd === generatedEnd
    ) {
      setScopeMode('range')
      setRangeStart(0)
      setRangeEnd(generatedEnd)
      return
    }
    setRangeStart(0)
    setRangeEnd(generatedEnd)
    setScopeMode('range')
    // 관객 둘로 시작한다. 이 화면이 보여 주는 것은 **갈림**인데, 관객이
    // 하나면 견줄 상대가 없어 divergence가 구조적으로 나올 수 없다 —
    // 트랙이 빈 채로 열려 "아직 안 돌았나"로 읽힌다
    // (LENS_TRACKS_UI.md 7장). 셋째는 첫 결과를 본 뒤 더한다.
    setSelectedReadingConditionIds(['first_viewer', 'film_literate'])
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
    setScopeSelection(null)
    if (mode !== 'scene') setSceneBasisEditing(false)

    if (mode === 'multi') setFullAnalysisOpen(false)

    if (mode === 'viewer') {
      openViewerReflection()
      return
    }

    if (mode === 'scene') {
      setFullAnalysisOpen(false)
      setMiseWorkspace('scene')
      return
    }

    if (mode !== 'multi') {
      setFullAnalysisOpen(true)
      choosePrimaryLens(mode)
    }
  }

  const moveReviewSequence = (direction) => {
    // 세 컷씩 옮긴다. 한 컷만 움직이면 긴 시퀀스에서 목적지를 찾기 어렵고,
    // 화면 한 장씩이면 지금 보는 위치를 잃는다.
    const offset = direction * 396
    reviewSequenceScrollRef.current?.scrollBy({ left: offset, behavior: 'smooth' })
  }

  const selectTrackIssue = (issueId) => {
    setSelectedIssueId(issueId)
    // Issue를 고르면 그 자리가 보여야 한다. 훑던 위치가 남아 있으면
    // 고른 Issue가 아니라 엉뚱한 컷이 선택된 채로 남는다.
    setBrowsingShotIndex(null)
    const issue = trackIssues.find((entry) => entry.id === issueId)
    const match = issue?.anchor?.match(/S(\d+)/)
    if (match) setFlowActiveShot(Number(match[1]) - 1)
  }

  const reviseTrackIssue = (entry, issue) => {
    if (!entry) return
    // 다른 Issue로 옮기면 열려 있던 이음새 편집은 그 자리의 것이 아니다.
    setSeamEdit(null)
    setRevisionWorkspace({
      issue,
      diagnosis: { ...entry.diagnosis, lens: entry.lens },
    })
  }

  /**
   * 편집 렌즈의 구조 변경을 **두 컷 사이에서** 연다.
   *
   * 예전에는 `routeDiagnosisTool`이 GridView로 넘겼다. 그러면 고칠 자리와
   * 그 근거가 화면에서 함께 사라져, 감독이 무엇을 사이에 두고 고치는
   * 중인지 알 수 없었다 (`LENS_TRACKS_UI.md` 5장 — 시퀀스가 곧 캔버스다).
   *
   * 도구는 새로 만들지 않는다. GridView가 쓰던 `SeamEditor`를 그대로
   * 이음새 자리에 끼운다 (11장 — 기능을 새로 만들지 않는다).
   */
  const openSeamEdit = (operation, alternative, issue, diagnosis) => {
    if (!operation || !alternative) {
      setSeamEdit(null)
      return
    }
    // `조정`은 구조를 바꾸지 않는다. 컷의 개수는 그대로이고 그림이
    // 달라지는 것이므로 이음새 편집기가 받을 일이 아니다.
    if (operation === 'seam') {
      setSeamEdit(null)
      return
    }
    // 어느 컷을 고치는가. 선택지 문장에 적힌 패널을 우선한다 — 관계
    // 진단의 targets 첫 컷만 무조건 고르면 삭제 대상이 엇나간다
    // (routeDiagnosisTool이 같은 이유로 같은 규칙을 쓴다).
    const fromAlternative = `${alternative.label || ''} ${alternative.effect || ''}`
      .match(/\bS\s?(\d+)\b/i)?.[1]
    const fromAnchor = (issue?.anchor || '').match(/S(\d+)/)?.[1]
    const targetIndex = Number(fromAlternative || fromAnchor) - 1
    if (!Number.isInteger(targetIndex) || targetIndex < 0) return
    // 선택지 문장이 가리키는 컷을 그대로 쓴다. `S2와 S3 병합`은 이미 앞
    // 컷(S2)을 먼저 적고, `S2와 S3 사이에 삽입`도 마찬가지다 — 여기서 한
    // 칸 당기면 S1·S2를 합치게 된다(실제로 그랬다).
    //
    // `routeDiagnosisTool`은 한 칸 당긴다. 거기서는 대상이 뒤 컷으로 잡히기
    // 때문이고, 여기서는 문장에서 앞 컷을 직접 읽어 오므로 다르다.
    const anchorIndex = targetIndex
    const anchorShot = shots[anchorIndex]
    if (!anchorShot?.cutPlanItemId) return
    setSeamEdit({
      operation,
      // 빠지는 컷은 그림 위에 표시한다. 미리 지우면 무엇이 없어지는지
      // 확인할 수 없다.
      removingPanel: operation === 'delete' ? `S${targetIndex + 1}` : null,
      pendingEdit: {
        kind: operation,
        cutId: anchorShot.cutPlanItemId,
        // `index`는 그림이 사라진다고 알릴 컷을 가리킨다. 삽입은 새 컷이
        // 들어갈 자리, 합치기는 **뒤 컷**(그쪽 그림이 버려진다)이고,
        // 나누기·빼기는 대상 컷 자신이다 — GridView가 쓰던 규칙과 같다.
        index: operation === 'insert' || operation === 'merge'
          ? anchorIndex + 1
          : anchorIndex,
        losesDrawing: operation === 'merge' ? Boolean(shots[anchorIndex + 1]?.image) : false,
        proposal: {
          title: alternative.label || '',
          detail: alternative.effect || diagnosis?.suggested_action || '',
          diagnosisId: diagnosis?.id,
          operationId: `${diagnosis?.id}::${alternative.label}`,
        },
      },
    })
  }

  // 추천안이 아니라 감독이 직접 구조를 고르는 길. 촬영의 직접 수정처럼
  // Workspace 안에서 끝낸다. 삽입은 대상 바로 앞 이음새, 합치기는 대상과
  // 다음 컷, 분할은 대상 컷을 기본으로 삼는다.
  const openDirectEditingSeam = (operation) => {
    if (!revisionWorkspace || !revisionTargetShot) return
    const targetIndex = shots.findIndex((shot) => shot.id === revisionTargetShot.id)
    if (targetIndex < 0) return
    const anchorIndex = operation === 'insert' ? targetIndex - 1 : targetIndex
    if (anchorIndex < 0 || !shots[anchorIndex]?.cutPlanItemId) return
    if (operation === 'merge' && !shots[anchorIndex + 1]) return
    const panels = operation === 'split'
      ? `S${anchorIndex + 1}`
      : `S${anchorIndex + 1}–S${anchorIndex + 2}`
    openSeamEdit(operation, {
      label: `${panels} ${operation}`,
      effect: '',
    }, revisionWorkspace.issue, revisionWorkspace.diagnosis)
  }

  // 트랙에서 관객 갈림을 눌렀을 때. **읽힘 검토로 건너가지 않는다** —
  // 여기는 연출 검토이므로, 그 자리를 세 렌즈가 보고 진단해야 한다.
  //
  // focus를 쓰지 않는다. focus는 "먼저 발견한 렌즈의 판단 하나를 논점으로
  // 이어 읽어라"는 통로인데 갈림에는 그 main lens가 없다 — 관객이 짚은
  // 것이지 렌즈가 짚은 것이 아니다. 그냥 그 자리를 평범하게 검토한다.
  //
  // 범위만 옮기고 끝내지 않는다. 갈림 자체는 진단이 아니라 근거라
  // Inspector에 띄울 Issue가 없다 — 눌렀는데 아래가 비어 있으면 아무
  // 일도 일어나지 않은 것으로 보인다. 검토를 실제로 돌려서 그 자리의
  // Issue가 트랙과 Inspector에 채워지게 한다.
  const checkDivergenceWithLenses = (findingId) => {
    const finding = readingFindings.find((entry) => entry.id === findingId)
    if (!finding || multiReviewLoading) return
    const orders = finding.panelOrders || []
    if (orders.length === 0) return

    logEvent('route', { source: 'viewer', route: 'multi', level: finding.anchor_kind })
    logScaffold({ feature: 'lens', action: 'check-divergence', anchor: finding.anchor })

    // 갈린 자리로 검토 범위를 옮긴다. 이음새면 두 컷을 함께 본다.
    const from = orders[0] - 1
    const to = orders[orders.length - 1] - 1
    if (from === to) {
      setScopeMode('single')
      setSingleScopeShotId(shots[from]?.id || null)
    } else {
      setScopeMode('range')
      setRangeStart(from)
      setRangeEnd(to)
    }
    setBrowsingShotIndex(from)
    setFlowActiveShot(from)
    setSelectedIssueId(null)
    setSelectedReadingFindingId(findingId)
    // 범위 state가 반영된 뒤에 돌려야 한다. 여기서 곧바로 부르면
    // `multiReviewScopeKey`가 아직 옛 범위라 엉뚱한 자리를 검토한다.
    setPendingDivergenceReview(findingId)
  }

  // 갈림을 눌러 범위를 옮긴 뒤, 그 범위가 실제로 반영되면 검토를 돌린다.
  //
  // 핸들러 안에서 곧바로 부를 수 없다 — `runMultiReview`는 호출 시점의
  // `multiReviewScopeKey`를 읽는데, 그때는 아직 옛 범위다.
  useEffect(() => {
    if (!pendingDivergenceReview) return
    setPendingDivergenceReview(null)
    // 이미 이 범위를 본 적이 있으면 다시 돌리지 않는다. 결과가 그대로
    // 트랙과 Inspector에 남아 있고, 다시 보려면 `다시 분석`이 있다.
    if (['ready', 'stale'].includes(multiReviewRuns[multiReviewScopeKey]?.status)) return
    runMultiReview({ answers: answeredDirectingQuestions })
    // 범위가 반영된 렌더에서만 돈다. `runMultiReview`·`multiReviewRuns`·
    // `answeredDirectingQuestions`는 여기서 읽기만 하는 값이라 의존성에
    // 넣지 않는다 — 넣으면 답을 하나 쓸 때마다 검토가 다시 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingDivergenceReview, multiReviewScopeKey])

  const checkSelectedIssueLens = async (lens) => {
    const issue = selectedTrackIssue
    if (!issue || issue.lenses?.includes(lens)) return
    const key = issueLensCheckKey(issue.id, lens)
    if (issueLensChecks[key]?.status === 'loading') return
    // 감독이 부른 순서를 남긴다. 이 값이 오른쪽 흐름에서 쌓이는 순서가
    // 된다 — 렌즈 이름의 고정 순서로 그리면 "이 Issue에 새로 참여시킨
    // 관점"이라는 뜻이 사라진다 (`LENS_TRACKS_UI.md` 4장).
    const addedAt = Date.now()
    setIssueLensChecks((current) => ({
      ...current,
      [key]: { status: 'loading', addedAt },
    }))

    const panelIds = [...new Set(issue.diagnosis_ids.flatMap((diagnosisId) => (
      diagnosesById.get(diagnosisId)?.diagnosis.targets || []
    )).map((target) => target.split('.', 1)[0]))]
    const fallbackPanelIds = issue.anchor?.match(/S\d+/g) || []
    const focusPanelIds = panelIds.length > 0 ? panelIds : fallbackPanelIds
    const criterion = issue.diagnosis_ids
      .map((diagnosisId) => diagnosesById.get(diagnosisId)?.diagnosis.criterion)
      .find(Boolean) || ''
    const originEntry = issue.diagnosis_ids
      .map((diagnosisId) => diagnosesById.get(diagnosisId))
      .find((entry) => entry?.lens === issue.origin_lens)
      || issue.diagnosis_ids.map((diagnosisId) => diagnosesById.get(diagnosisId)).find(Boolean)

    try {
      const response = await requestDirectingReview({
        mode: lens,
        panels: await buildReviewPanels(selectedShotEntriesOf()),
        intent: '',
        answers: multiReviewRuns[issue.sourceScopeKey]?.creatorContext || [],
        focus: {
          id: issue.id,
          anchor: issue.anchor,
          anchor_kind: issue.anchor_kind || '',
          title: issue.title,
          criterion,
          panel_ids: focusPanelIds,
          origin_lens: originEntry?.lens || issue.origin_lens || 'mise',
          origin_reading: originEntry?.diagnosis?.diagnosis || issue.title,
        },
      })
      const result = response.lens_results?.[lens]
      if (!result) throw new Error('이 렌즈의 확인 결과를 받지 못했습니다.')
      // 비교 단계는 최초 Lens와 사용자가 더한 Lens의 실제 판단만 받는다.
      // Inspector의 Issue 자체를 합치지는 않는다.
      setMultiReviewRuns((current) => {
        const run = current[issue.sourceScopeKey]
        if (!run) return current
        return {
          ...current,
          [issue.sourceScopeKey]: {
            ...run,
            lensResults: { ...(run.lensResults || {}), [lens]: result },
          },
        }
      })
      setIssueLensChecks((current) => ({
        ...current,
        // 부른 순서를 이어받는다. 여기서 새 객체로 갈아치우면 응답이
        // 도착하는 순간 순서를 잃고, 흐름이 렌즈 이름 순으로 되돌아간다.
        [key]: {
          ...current[key],
          status: 'ready',
          diagnosis: result.diagnoses?.[0] || null,
          reading: result.summary || '',
          question: response.questions?.[0] || null,
        },
      }))
    } catch (error) {
      setIssueLensChecks((current) => ({
        ...current,
        [key]: {
          ...current[key],
          status: 'error',
          error: error.message || '확인하지 못했습니다.',
        },
      }))
    }
  }

  // 다른 렌즈는 자동으로 부르지 않는다. Issue를 고를 때마다 세 렌즈를
  // 부르면 감독이 요청하지 않은 분석이 계속 돌고, 결과가 와도 무엇이 새로
  // 온 것인지 구분되지 않는다. 카드의 `+ 이 렌즈 더하기`를 눌렀을 때만
  // 붙인다 — 누가 이 판단에 참여할지는 감독이 정한다.

  const keepCurrentDirectingIssue = () => {
    if (!currentDirectingIssue) return
    setDirectingIssueDecisions((current) => ({
      ...current,
      [directingDecisionKey(currentDirectingIssue.id)]: 'keep',
    }))
    setActiveDirectingIssueId(null)
    setExpandedDirectingIssueId(null)
    logEvent('verdict', {
      target: currentDirectingIssue.diagnosis.id,
      verdict: 'keep',
      lens: currentDirectingIssue.backendId,
    })
  }

  const openCurrentDirectingIssue = () => {
    if (!currentDirectingIssue) return
    setFullAnalysisOpen(true)
    selectReviewMode(currentDirectingIssue.lensId)
  }

  // 확인 카드의 추천안도 상세 렌즈 탭과 같은 대안 객체를 쓴다. 별도의
  // '간단 수정' 규칙을 만들지 않고, 기존 적용·재생성·되돌리기 흐름으로
  // 들어가게 한다.
  const previewCurrentDirectingAlternative = (alternative) => {
    if (!currentDirectingIssue || alternative.kind !== 'change') return
    const diagnosis = {
      ...currentDirectingIssue.diagnosis,
      lens: currentDirectingIssue.backendId,
    }
    // 편집 대안은 프롬프트나 샷 값으로 바꿀 수 없다. 상세 편집 탭과 같은
    // 판별을 써서, 제안 문장에 맞는 이음새·분할·삽입·병합 도구를 연다.
    if (currentDirectingIssue.backendId === 'editing') {
      const action = editingActionFor(alternative)
      routeDiagnosisTool(action.id, diagnosis, alternative)
      return
    }
    applyAlternative(diagnosis, alternative)
  }

  const acceptCurrentDirectingRevision = () => {
    if (!currentDirectingIssue) return
    acceptPanelRevision()
    setDirectingIssueDecisions((current) => ({
      ...current,
      [directingDecisionKey(currentDirectingIssue.id)]: 'applied',
    }))
    setActiveDirectingIssueId(null)
    setExpandedDirectingIssueId(null)
  }

  const answerCurrentDirectingQuestion = () => {
    if (!currentDirectingQuestion) return
    const key = directingQuestionDecisionKey(currentDirectingQuestion.id)
    const answer = (directingQuestionDrafts[key] || '').trim()
    if (!answer) return
    setDirectingQuestionDecisions((current) => ({
      ...current,
      [key]: { status: 'answered', answer },
    }))
  }

  const skipCurrentDirectingQuestion = () => {
    if (!currentDirectingQuestion) return
    const key = directingQuestionDecisionKey(currentDirectingQuestion.id)
    setDirectingQuestionDecisions((current) => ({
      ...current,
      [key]: { status: 'skipped' },
    }))
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
      setViewerError('읽힘 검토는 두 컷 이상을 선택해야 합니다.')
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
      setViewerPanelOrder(panelOrders[0])
      setFlowActiveShot(panelOrders[0] - 1)
      setViewerStatus('ready')
    } catch (error) {
      setViewerStatus('error')
      setViewerError(error.message || '읽힘 검토 결과를 불러오지 못했습니다.')
    }
  }

  const _routeViewerFinding = (route, panelOrderOrOrders, finding = {}) => {
    if (!['mise', 'camera', 'editing'].includes(route)) return
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
      title: finding.title || '읽힘 검토에서 가져온 해석',
      interpretations: finding.interpretations || [],
      visibleCues: finding.visibleCues || [],
      uncertainties: finding.uncertainties || [],
      routeReason: finding.routeReason || '',
    })
    setViewerSnapshot(null)

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

  // 진단이 짚은 컷. 없으면 지금 보고 있는 컷이다. 선택지가 바꿀 대상이자,
  // `기존 → 바뀜`에서 '기존'을 읽어 오는 곳이다.
  const cutForDiagnosis = (diagnosis) => {
    const panelTarget = (diagnosis?.targets || [])
      .map((target) => target.split('.', 1)[0])
      .find((target) => /^S\d+$/.test(target))
    const targetShot = shots[panelTarget ? Number(panelTarget.slice(1)) - 1 : scopedShotIndex]
    return cutPlan.find((cut) => cut.id === targetShot?.cutPlanItemId) || null
  }

  // Revision Workspace가 보여 줄 것들. 어느 컷을 고치는지, 그 컷의 새
  // 그림이 도는 중인지, 나온 초안은 무엇인지.
  //
  // `cutForDiagnosis`를 쓰므로 그 뒤에 와야 한다.
  //
  // 두 컷을 가리키는 진단(이음새)에서는 `cutForDiagnosis`가 맞지 않는다 —
  // 그것은 단일 컷 진단용이라 targets의 첫 패널을 집는데, 이음새 진단은
  // 대개 뒤 컷을 고치라고 한다("S3를 연속 컷으로 쓸 거라면…"). 첫 패널을
  // 그대로 쓰면 S3를 고치라는 진단에 S2 그림이 뜬다(실제로 그랬다).
  //
  // 수정 지시가 어느 컷을 부르는지 문장에서 읽어 그 컷을 고른다. 못
  // 읽으면 기존 방식으로 돌아간다.
  const revisionTargetShot = (() => {
    if (!revisionWorkspace) return null
    const { diagnosis } = revisionWorkspace
    const named = (diagnosis?.suggested_action || '').match(/S(\d+)/)
    const targets = (diagnosis?.targets || [])
      .map((target) => target.split('.', 1)[0])
      .filter((target) => /^S\d+$/.test(target))
    // 지시가 부르는 컷이 이 진단의 대상 안에 있을 때만 믿는다.
    if (named && targets.includes(`S${named[1]}`)) {
      return shots[Number(named[1]) - 1] || null
    }
    const cut = cutForDiagnosis(diagnosis)
    return shots.find((shot) => shot.cutPlanItemId === cut?.id) || null
  })()
  const revisionIsPending = Boolean(
    revisionTargetShot && panelRevisionPending?.shotId === revisionTargetShot.id,
  )
  // 초안은 판정 전에만 보인다. 판정이 끝난 그림은 그 컷의 그림이므로
  // `currentImage` 쪽에서 읽는다.
  const revisionDraftImage = revisionIsPending
    ? panelDraftImages[revisionTargetShot?.id] || ''
    : ''
  // 편집 수정안의 위쪽 미리보기. 실제 컷을 아직 바꾸지는 않지만, 실행하면
  // 시퀀스가 어떻게 재구성되는지는 즉시 보여 준다.
  const editingRevisionSequencePreview = (() => {
    if (!revisionWorkspace || revisionWorkspace.diagnosis?.lens !== 'editing' || !revisionTargetShot) return []
    const targetIndex = shots.findIndex((shot) => shot.id === revisionTargetShot.id)
    const shotCard = (shot, index, extra = {}) => ({
      id: shot?.id || `preview-${index}-${extra.label || 'cut'}`,
      label: extra.label || `S${index + 1}`,
      image: shot ? panelDraftImages[shot.id] || shot.image || '' : '',
      isTarget: Boolean(extra.isTarget),
      placeholder: extra.placeholder || '',
      note: extra.note || '',
    })
    if (!seamEdit) {
      return shots.slice(Math.max(0, targetIndex - 1), targetIndex + 2)
        .map((shot, offset) => shotCard(shot, Math.max(0, targetIndex - 1) + offset, {
          isTarget: shot.id === revisionTargetShot.id,
        }))
    }
    const anchorIndex = shots.findIndex((shot) => shot.cutPlanItemId === seamEdit.pendingEdit.cutId)
    const anchor = shots[anchorIndex]
    const following = shots[anchorIndex + 1]
    if (seamEdit.operation === 'insert') {
      return [
        shotCard(anchor, anchorIndex),
        shotCard(null, anchorIndex + 1, { label: `S${anchorIndex + 2}`, note: '삽입될 컷', placeholder: '삽입될 컷' }),
        shotCard(following, anchorIndex + 2, { note: '다음 컷' }),
      ]
    }
    if (seamEdit.operation === 'merge') {
      return [
        shotCard(anchor, anchorIndex, { label: `S${anchorIndex + 1}`, note: '합쳐진 컷' }),
        shotCard(shots[anchorIndex + 2], anchorIndex + 1, { note: '다음 컷' }),
      ]
    }
    if (seamEdit.operation === 'split') {
      return [
        ...(anchorIndex > 0 ? [shotCard(shots[anchorIndex - 1], anchorIndex - 1)] : []),
        shotCard(null, anchorIndex, { label: `S${anchorIndex + 1}`, note: '분할 앞 샷', placeholder: '앞 빈 샷' }),
        shotCard(null, anchorIndex + 1, { label: `S${anchorIndex + 2}`, note: '분할 뒤 샷', placeholder: '뒤 빈 샷' }),
      ]
    }
    return [shotCard(anchor, anchorIndex, { isTarget: true }), shotCard(following, anchorIndex + 1)]
  })()
  const editingSequenceNotice = (() => {
    if (!seamEdit || !revisionWorkspace || revisionWorkspace.diagnosis?.lens !== 'editing') return ''
    const anchorIndex = shots.findIndex((shot) => shot.cutPlanItemId === seamEdit.pendingEdit.cutId)
    if (anchorIndex < 0) return ''
    if (seamEdit.operation === 'insert') return '뒤 컷 번호가 한 칸씩 밀립니다.'
    if (seamEdit.operation === 'merge') return '뒤 컷 번호가 한 칸씩 당겨집니다.'
    if (seamEdit.operation === 'split') return '뒤 컷 번호가 한 칸씩 밀립니다.'
    return ''
  })()

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
    // 고치기 전 문장을 **지금** 잡아 둔다. 응답이 온 뒤에 넣으면 기다리는
    // 동안 비교할 것이 없고, 실패하면 아예 남지 않는다.
    setPromptBefore((before) => ({ ...before, [diagnosis.id]: current.effective }))
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
      // 고치기 전 문장은 열 때 이미 잡아 두었다. 같은 문장이 돌아와도
      // 지우지 않는다 — 위의 안내가 "문장은 그대로입니다"라고 말하는데
      // 비교할 원문까지 사라지면 무엇이 그대로인지 확인할 수 없다.
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
    const generationStarted = beginPanelRegeneration(`prompt:${diagnosis.id}`, targetCut.id, {
      promptOverride: targetCut.promptOverride || '',
    })
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
    // 값만 바꾸면 재생성 모델은 왜 그 카메라를 택했는지 알 수 없다. 제안의
    // effect는 "그래프 선의 모양과 어긋난 자리가 바로 보여요"처럼 화면에서
    // 지켜야 할 읽힘을 말하므로, 속성 변경과 함께 생성 지시로 보낸다.
    if (alternative.effect) changeLines.push(`directing intent: ${alternative.effect}`)
    // 샷 값으로 바뀌는 것이 없는 선택지. 어디로 보낼지는 그 진단이 이미
    // 말하고 있다 — 컷 사이의 문제는 이음새로, 컷의 존재는 합치기·나누기로
    // 간다. 여기서 무조건 프롬프트를 열면 편집 선택지가 전부 패널 문장
    // 고치기로 흘러간다. 편집은 `patch`를 비우도록 백엔드가 강제하므로
    // (샷 크기로 편집 문제를 고칠 수는 없다) 이 갈래로 오는 것이 정상이고,
    // 그래서 프롬프트가 기본값이면 편집 렌즈만 갈 곳을 잃는다 (DG2).
    if (Object.keys(changes).length === 0) {
      const route = destinationsFor(diagnosis)
        .find((destination) => STRUCTURAL_ROUTES.includes(destination))
      if (route) {
        routeDiagnosisTool(route, diagnosis, alternative)
        return
      }
      // 갈 구조가 없으면 그림이 답할 차례다. 고른 방향을 반영한 문장을 받아
      // 편집기에 띄운다 — 제안해 놓고 감독이 직접 쓰게 두면 제안이
      // 읽을거리로 끝난다.
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

  // 촬영의 직접 수정은 작업 공간을 떠나지 않는다. 추천안의 맥락과 바로
  // 위 현재/변화된 사진을 보며 기본 샷 값과 프롬프트를 함께 고친다.
  const applyDirectCameraEdit = (diagnosis, draft) => {
    const targetCut = cutForDiagnosis(diagnosis)
    if (!targetCut || !draft) return

    const changes = {}
    const changeLines = []
    if (draft.shotSize && draft.shotSize !== targetCut.shotSize) {
      changes.shotSize = draft.shotSize
      changeLines.push(`shot size: ${targetCut.shotSize || '미정'} → ${draft.shotSize}`)
    }
    if (draft.angle && draft.angle !== targetCut.angle) {
      changes.angle = draft.angle
      changeLines.push(`camera angle: ${targetCut.angle || '미정'} → ${draft.angle}`)
    }

    const currentPrompt = selectCutPrompt(useStore.getState(), targetCut.id)?.effective || ''
    const nextPrompt = (draft.prompt || '').trim()
    if (nextPrompt && nextPrompt !== currentPrompt.trim()) {
      changes.promptOverride = nextPrompt
      // 전체 문장을 change 지시로 중복하지 않는다. 저장된 프롬프트 자체가
      // 생성의 본문이므로, 현재 패널 참조를 쓰도록 이 변경 사실만 남긴다.
      changeLines.push('prompt revised by director')
    }
    if (!Object.keys(changes).length) return

    const before = {
      shotSize: targetCut.shotSize,
      angle: targetCut.angle,
      cameraMove: targetCut.cameraMove,
      promptOverride: targetCut.promptOverride || '',
    }
    updateCutPlanItem(targetCut.id, changes)
    if (!beginPanelRegeneration(`${diagnosis.id}::camera-direct`, targetCut.id, before)) return
    routeDiagnosisTool('regenerate', diagnosis, null, { changes: changeLines })
    logEvent('edit', {
      source: 'diagnosis-camera-direct',
      lens: 'camera',
      level: normalizeLevel(diagnosis.level),
    })
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

  const viewerReadings = useMemo(() => viewerReport?.readings || [], [viewerReport])
  // 아래 memo의 입력이다. 매 렌더 새 배열이면 그 memo가 늘 다시 돈다.
  const allViewerReadingConditions = useMemo(
    () => [...VIEWER_READING_CONDITIONS, ...customReadingConditions],
    [customReadingConditions],
  )
  // 수정 항목은 더 이상 목록으로 미리 늘어놓지 않는다. 감독이 트랙에서
  // 자리를 고르고, Workbench에서 그 관객의 읽기를 확인한 뒤에만 수정
  // 도구가 열린다 (LENS_TRACKS_UI.md 4장 — Inspect 화면에서는 고치지
  // 않는다). 도구 자체는 기존 ViewerFixCard 그대로다.

  // --- 읽힘 검토를 트랙 구조로 --------------------------------------
  //
  // 연출 검토와 같은 형태로 읽는다 (LENS_TRACKS_UI.md 7장). 행은 렌즈가
  // 아니라 읽기 조건이고, 마커는 Issue가 아니라 **divergence**다.
  //
  // 새 데이터를 만들지 않는다. `comparison.divergences`와 `review_points`는
  // 이미 백엔드가 주고 있고, 여기서는 트랙이 읽을 수 있는 모양으로만
  // 바꾼다 (문서 11장 — 기능을 새로 만들지 않는다).

  // 트랙의 행. 실제로 읽은 조건만 둔다 — 고르기만 하고 아직 읽지 않은
  // 조건까지 빈 행으로 그리면, 결과가 없는 것인지 갈리지 않은 것인지
  // 구분되지 않는다.
  // 읽은 결과가 있으면 그 조건들이 행이다. 아직 안 읽었으면 **고른
  // 조건**으로 미리 줄을 그린다 — 연출 검토가 분석 전에도 세 렌즈 줄을
  // 보여 주는 것과 같다. 무엇이 채워질 자리인지 먼저 보여야 한다.
  const readingTrackConditionIds = viewerReadings.length > 0
    ? viewerReadings.map((entry) => entry.condition_id)
    : selectedReadingConditionIds
  const readingTrackConditions = readingTrackConditionIds.map((conditionId) => {
    const condition = allViewerReadingConditions.find((item) => item.id === conditionId)
    return {
      id: conditionId,
      label: condition?.title || condition?.label || conditionId,
      title: condition?.title || condition?.label || conditionId,
    }
  })

  // 관객을 더하는 일은 위 `읽는 방식` 칩이 맡는다. Workbench에 또 두면
  // 같은 조작이 두 자리에 생긴다.

  // 컷 번호 목록을 앵커 문자열로. 백엔드 `_anchor_for`와 같은 문법이라
  // 트랙·Workbench가 연출 쪽과 같은 규칙으로 자리를 읽는다.
  const readingAnchorOf = (panelOrders = []) => {
    const orders = [...new Set(panelOrders)].sort((a, b) => a - b)
    if (orders.length === 0) return ''
    if (orders.length === 1) return `S${orders[0]}`
    return `S${orders[0]}→S${orders[orders.length - 1]}`
  }

  const readingFindings = useMemo(() => {
    if (!viewerReport) return []
    const scopeKey = `${scene?.id || activeScene}:${branch?.id || activeBranch}`
    // 갈림이 먼저다. 트랙의 점은 "여기서 읽힘이 갈렸다"를 말한다.
    const divergences = (viewerReport.comparison?.divergences || []).map((divergence, index) => {
      const anchor = readingAnchorOf(divergence.panel_orders)
      return {
        id: `${scopeKey}:diverge:${index}:${anchor}`,
        kind: 'diverge',
        anchor,
        anchor_kind: divergence.panel_orders.length > 1 ? 'seam' : 'shot',
        panelOrders: divergence.panel_orders,
        // 트랙 마커에 적히는 짧은 이름. 갈린 근거를 그대로 쓴다 —
        // 새 문장을 만들지 않는다.
        title: divergence.shared_cues?.[0] || '읽힘이 갈림',
        why_it_matters: divergence.why_it_matters || '',
        conditions: divergence.readings.map((entry) => entry.condition_id),
        // 조건별로 뭐라고 읽었는가. Workbench의 오른쪽 흐름이 이걸 쌓는다.
        lines: Object.fromEntries(
          divergence.readings.map((entry) => [entry.condition_id, entry.reading]),
        ),
        route: (divergence.routes || [])[0] || null,
        issue_kind: divergence.issue_kind,
        source: divergence,
      }
    })
    // 갈리지 않은 자리의 단독 지적. 같은 자리에 갈림이 있으면 그쪽이
    // 이미 말하므로 넣지 않는다 — 마커가 겹쳐 무엇이 갈림인지 흐려진다.
    const takenAnchors = new Set(divergences.map((entry) => entry.anchor))
    const reviewPoints = viewerReadings.flatMap((entry) => (
      (entry.reading?.review_points || []).map((point, index) => {
        const anchor = readingAnchorOf(point.panel_orders)
        if (takenAnchors.has(anchor)) return null
        return {
          id: `${scopeKey}:review:${entry.condition_id}:${index}:${anchor}`,
          kind: 'review',
          anchor,
          anchor_kind: point.panel_orders.length > 1 ? 'seam' : 'shot',
          panelOrders: point.panel_orders,
          title: point.issue,
          why_it_matters: point.audience_effect || '',
          conditions: [entry.condition_id],
          lines: { [entry.condition_id]: point.issue },
          route: (point.routes || [])[0] || null,
          issue_kind: point.issue_kind,
          source: point,
        }
      }).filter(Boolean)
    ))
    return [...divergences, ...reviewPoints]
  }, [viewerReport, viewerReadings, scene?.id, activeScene, branch?.id, activeBranch])

  // 갈림을 연출 트랙에도 올린다. **진단이 아니라 근거로** 올라간다 —
  // 렌즈 줄과 떨어진 자리에 다른 모양으로 그려진다 (LensTracks의
  // `reading-lane`). 감독이 연출을 보다가 "여기서 실제로 읽힘이 갈렸다"를
  // 같은 가로축에서 볼 수 있어야, 그 진단이 관객에게 어떻게 닿는지 잇는다.
  //
  // 갈림만 올린다. 한 관객만 걸린 review_point는 갈린 것이 아니므로
  // 여기 두면 "갈렸다"는 이 줄의 뜻이 흐려진다.
  const readingLaneMarkers = useMemo(() => (
    readingFindings
      .filter((finding) => finding.kind === 'diverge')
      .map((finding) => {
        const orders = finding.panelOrders || []
        if (orders.length === 0) return null
        const first = orders[0] - 1
        const last = orders[orders.length - 1] - 1
        return {
          id: finding.id,
          // 트랙의 마커와 같은 계산이다 — 컷 인덱스 기준의 실수.
          position: orders.length > 1 ? (first + last) / 2 : first,
          // 컷 안인지 컷 사이인지. 렌즈 트랙과 같은 문법으로 그린다 —
          // 위치만이 아니라 형태로도 읽히게.
          anchor_kind: finding.anchor_kind,
          title: finding.title,
          anchor: finding.anchor,
          conditions: (finding.conditions || []).map((conditionId) => (
            allViewerReadingConditions.find((item) => item.id === conditionId)?.title || conditionId
          )),
        }
      })
      .filter(Boolean)
  ), [readingFindings, allViewerReadingConditions])

  const selectedReadingFinding = readingFindings.find((entry) => (
    entry.id === selectedReadingFindingId
  )) || null

  // 트랙 행이 새로 생기면 켠다. 감독이 끈 것은 그대로 둔다 — 결과가
  // 도착할 때마다 선택이 되돌아가면 무엇을 보고 있었는지 잃는다.
  useEffect(() => {
    setActiveReadingTracks((current) => {
      const next = new Set(current)
      let changed = false
      // 아직 안 읽은 조건도 켠다. 트랙이 분석 전에 미리 줄을 그리는데
      // 그 줄이 꺼진 채(muted) 나오면 무엇이 채워질 자리인지 안 보인다.
      const ids = viewerReadings.length > 0
        ? viewerReadings.map((entry) => entry.condition_id)
        : selectedReadingConditionIds
      ids.forEach((conditionId) => {
        if (!next.has(conditionId) && !current.has(`off:${conditionId}`)) {
          next.add(conditionId)
          changed = true
        }
      })
      return changed ? next : current
    })
  }, [viewerReadings, selectedReadingConditionIds])

  // 고른 갈림이 사라지면 선택도 놓는다. 안 그러면 Workbench가 빈 채로
  // 남아 무엇을 보는 자리인지 알 수 없다.
  useEffect(() => {
    setSelectedReadingFindingId((current) => (
      current && !readingFindings.some((entry) => entry.id === current) ? null : current
    ))
  }, [readingFindings])

  // 칸을 누르면 그 컷의 읽기를 아래에서 편다. 갈린 칸이면 그 갈림까지
  // 함께 고른다 — 갈림은 별도 대상이 아니라 그 칸에서 일어난 일이다.
  const selectReadingStep = ({ condition, order, finding }) => {
    setViewerPanelOrder(order)
    setSelectedReadingStep({ condition, order })
    setSelectedReadingFindingId(finding?.id || null)
    logScaffold({ feature: 'viewer', action: 'read-step', diverged: Boolean(finding) })
  }

  // 관객이 남긴 물음에 감독이 답한다. **여기서 고치지 않는다.**
  //
  // 관객 읽기는 의도를 모르는 것이 원칙이므로(7장), 감독의 답을 관객에게
  // 되먹이면 그 전제가 깨진다. 그래서 답은 적어 두기만 하고, 나중에 연출
  // 검토를 돌릴 때 세 렌즈가 그 전제 위에서 본다.
  const answerReadingQuestion = (finding, answer) => {
    const text = (answer || '').trim()
    if (!text) return
    setReadingAnswers((current) => ({
      ...current,
      [finding.id]: {
        answer: text,
        anchor: finding.anchor,
        question: finding.why_it_matters || finding.title,
        at: Date.now(),
      },
    }))
    logEvent('verdict', {
      target: finding.id,
      verdict: 'answered',
      source: 'viewer',
      level: finding.anchor_kind,
    })
    logScaffold({ feature: 'viewer', action: 'answer', anchor: finding.anchor })
  }

  // 패널별 반응 카드를 스토리보드 위에 얹지 않는다. 스토리보드는
  // artifact navigation만 담당하고(LENS_TRACKS_UI.md 2장), 읽기는 아래
  // Workbench가 순차 읽기로 맡는다 — 같은 것을 두 자리에서 보여 주면
  // 어느 쪽이 지금 보는 자리인지 알 수 없다.

  function renderViewerConditionPicker() {
    return (
    <section className="viewer-reading-conditions" aria-label="읽기 조건 선택">
      <header>
        <div>
          {!viewerReport && <span>읽기 조건 선택</span>}
          <strong>{viewerReport ? '같은 화면에서 무엇을 먼저 살필지 추가하세요.' : '기본 읽기에 더할 조건을 고르세요.'}</strong>
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
                <p>{condition.attention || condition.instruction}</p>
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
            <strong>새 읽기 조건 만들기</strong>
            <small>이 읽기에서 화면의 무엇을 먼저 살필지 정합니다.</small>
          </div>
          <em>직접 추가</em>
        </summary>
        <div className="viewer-custom-condition-fields">
          <label>
            <span>읽기 조건 이름</span>
            <input
              value={customReadingConditionDraft.label}
              onChange={(event) => setCustomReadingConditionDraft((current) => ({ ...current, label: event.target.value }))}
              placeholder="예: 공간 관계에 주목"
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
            {selectedReadingConditionIds.length >= 3 && <small>세 읽기 조건을 모두 선택했어요. 하나를 해제하면 추가할 수 있습니다.</small>}
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
    )
  }

  function renderInitialReadingChoices() {
    return (
      <div className="viewer-initial-reading-choices" role="group" aria-label="추가 읽기 조건">
        <span>읽는 방식</span>
        {VIEWER_READING_CONDITIONS.map((condition) => {
          const selected = selectedReadingConditionIds.includes(condition.id)
          return (
            <button
              key={condition.id}
              type="button"
              className={selected ? 'selected' : ''}
              aria-pressed={selected}
              onClick={() => toggleReadingCondition(condition.id)}
            >
              {selected ? '✓ ' : '+ '}{condition.title}
            </button>
          )
        })}
      </div>
    )
  }

  // 함수로 둔다. 이 안에서 `scopeSummary`를 쓰는데 그것은 아래에서
  // 정의되므로, 상수로 두면 여기서 평가되며 TDZ 오류가 난다.
  // 연출 검토(`.multi-review-preview`)와 **같은 형태**로 그린다.
  //
  // 트랙은 결과가 오기 전에도 있다. 연출 검토가 분석 전에 이미 세 렌즈
  // 줄을 그려 두고 "아직 볼 것이 없습니다"라고 말하는 것과 같다 — 결과가
  // 있어야 화면이 생기면, 감독은 무엇이 채워질 자리인지 모른 채 버튼만
  // 보게 된다.
  //
  // 함수로 둔다. 안에서 `scopeSummary`를 쓰는데 그것이 아래에서 정의되므로
  // 상수로 두면 여기서 평가되며 TDZ 오류가 난다.
  const renderViewerReflectionPane = () => viewerSnapshot ? (
    <section className="multi-review-preview reading-review-surface" aria-label="관객 읽기 검토">
      <section className="reading-review-sequence" aria-label="스토리보드와 읽기 트랙">
        <div className="reading-review-sequence-controls" aria-label="스토리보드 이동">
          <span>스토리보드</span>
          {scopeSummary}
          {/* 실행 버튼은 바 안에 둔다. 연출 검토의 `분석하기`와 같은
              자리다 — 범위를 보면서 바로 돌린다. */}
          <button
            type="button"
            className="reading-run-button"
            onClick={runViewerReflection}
            disabled={viewerStatus === 'loading' || selectedReadingConditionIds.length < 2}
            title={selectedReadingConditionIds.length < 2
              ? '관객을 둘 이상 골라야 갈린 자리가 나옵니다.'
              : undefined}
          >
            {viewerStatus === 'loading'
              ? '읽는 중…'
              : viewerReport
                ? '다시 읽기'
                : `${selectedReadingConditionIds.length}명으로 읽기`}
          </button>
        </div>

        <div className="reading-review-shared-scroll" ref={readingSequenceScrollRef}>
          <StoryboardStripLane
            embedded
            shots={shots}
            selectedShotIndex={(viewerPanelOrder ?? viewerScopeFrom) - 1}
            highlightRange={{ from: viewerScopeFrom - 1, to: viewerScopeTo - 1 }}
            onSelectShot={(index, event) => {
              if (scopeSelection || event?.shiftKey) {
                selectScopeShot(index, event)
                return
              }
              // 컷을 누른 것은 "이 자리의 반응을 보겠다"이다. 갈림 선택은
              // 놓는다 — 다른 자리를 보면서 옛 갈림이 아래에 남아 있으면
              // 무엇을 보고 있는지 어긋난다.
              setViewerPanelOrder(index + 1)
              setSelectedReadingFindingId(null)
                      }}
            onSelectSeam={(index) => setViewerPanelOrder(index + 1)}
          />
          <ReadingTracks
            embedded
            shots={shots}
            conditions={readingTrackConditions}
            findings={readingFindings}
            readings={viewerReadings.map((entry) => ({
              id: entry.condition_id,
              reading: entry.reading,
            }))}
            activeConditions={activeReadingTracks}
            selectedFindingId={selectedReadingFindingId}
            walkedTo={selectedReadingStep?.order ?? null}
            answers={readingAnswers}
            loading={viewerStatus === 'loading'}
            hasRead={Boolean(viewerReport)}
            scrollRef={readingSequenceScrollRef}
            onSelectStep={selectReadingStep}
            onToggleCondition={(conditionId) => setActiveReadingTracks((current) => {
              const next = new Set(current)
              if (next.has(conditionId)) {
                next.delete(conditionId)
                // 감독이 끈 것을 기억한다. 안 그러면 다음 결과가 도착할 때
                // 자동으로 다시 켜진다.
                next.add(`off:${conditionId}`)
              } else {
                next.add(conditionId)
                next.delete(`off:${conditionId}`)
              }
              return next
            })}
          />
        </div>
      </section>

      {/* 읽는 방식 고르기. 연출 검토의 `검토 의도`가 바 안에 접혀 있는
          것과 같은 자리다. */}
      <section className="reading-conditions-bar" aria-label="읽는 방식">
        {renderInitialReadingChoices()}
        {/* 직접 만든 읽기 조건도 그대로 쓴다. 기존 기능을 화면만 바꾸면서
            빠뜨리지 않는다 (LENS_TRACKS_UI.md 11장). */}
        <details className="viewer-more-perspectives">
          <summary>
            <div><strong>관객 직접 만들기</strong></div>
            <em>선택</em>
          </summary>
          {renderViewerConditionPicker()}
        </details>
        {selectedReadingConditionIds.length < 2 && (
          <p className="viewer-reflection-hint">
            관객이 하나면 견줄 상대가 없어 갈린 자리가 나오지 않습니다. 하나 더 골라 주세요.
          </p>
        )}
        {viewerError && <p className="viewer-error">{viewerError}</p>}
      </section>

      {/* ③ Workbench. 트랙과 같이 결과가 없어도 자리를 지킨다. */}
      {viewerReport && (
        <ReadingWorkbench
          finding={selectedReadingFinding}
          findings={readingFindings}
          step={selectedReadingStep}
          readings={viewerReadings.map((entry) => ({
            id: entry.condition_id,
            label: allViewerReadingConditions.find((item) => item.id === entry.condition_id)?.title
              || entry.condition_id,
            reading: entry.reading,
          }))}
          conditions={readingTrackConditions}
          shots={shots}
          range={{ from: viewerScopeFrom - 1, to: viewerScopeTo - 1 }}
          /* 여기서 고치지 않는다. 관객이 남긴 물음에 감독이 답하면 그
             답이 연출 검토의 전제로 쌓인다 (7장). */
          onAnswer={answerReadingQuestion}
          answers={readingAnswers}
          /* 앞뒤 컷으로 걸어간다 — 그림을 눌러서도, 화살표로도.
             수정 작업면을 걷어내면서 이 배선이 함께 빠져 있었다. */
          onWalkTo={({ condition, order }) => selectReadingStep({
            condition,
            order,
            finding: readingFindings.find((entry) => (
              entry.conditions?.includes(condition)
              && (entry.panelOrders || []).includes(order)
            )) || null,
          })}
        />
      )}
    </section>
  ) : null

  // 컷을 판단하는 화면과, 그 컷들이 공유하는 기준을 보는 화면은 목적이 다르다.
  // 장면 기준은 값을 그 자리에서 고친다. 기준을 보다가 다시 다른 렌즈로
  // 보내면 맥락이 끊기고, 어느 쪽의 값이 생성에 쓰이는지도 헷갈린다.
  const sceneBasisPane = (
    <section className="scene-basis-pane" aria-label="장면 기준">
      <header className="scene-basis-heading">
        <div>
          <span>장면 기준</span>
          <h2>{sceneState.title || '이 씬의 기준'}</h2>
          {sceneState.description && <p>{sceneState.description}</p>}
        </div>
        <button
          type="button"
          className={sceneBasisEditing ? 'is-editing' : ''}
          aria-pressed={sceneBasisEditing}
          onClick={() => setSceneBasisEditing((current) => !current)}
        >
          {sceneBasisEditing ? '수정 마치기' : '기준 고치기'}
        </button>
      </header>

      <div className="scene-basis-grid">
        <section className="scene-basis-section" aria-label="인물 기준">
          <header>
            <span>인물</span>
            <em>{sceneState.characters.length}</em>
          </header>
          <div className="scene-basis-characters">
            {(sceneBasisCharactersExpanded ? sceneState.characters : sceneState.characters.slice(0, 3)).map((character) => (
              <article key={character.id} className="scene-basis-character">
                {character.image ? (
                  <img src={character.image} alt={`${character.name} 레퍼런스`} />
                ) : (
                  <span className="scene-basis-image-placeholder" aria-hidden="true">인물</span>
                )}
                <div>
                  {sceneBasisEditing ? (
                    <>
                      <input
                        className="scene-basis-name-input"
                        value={character.name}
                        aria-label={`${character.name} 이름`}
                        onChange={(event) => updateSceneBasisCharacter(character, { name: event.target.value })}
                      />
                      <input
                        className="scene-basis-summary-input"
                        value={character.summary || ''}
                        aria-label={`${character.name} 역할`}
                        placeholder="역할·외형"
                        onChange={(event) => updateSceneBasisCharacter(character, { summary: event.target.value })}
                      />
                    </>
                  ) : (
                    <>
                      <strong>{character.name}</strong>
                      {character.summary && <p>{character.summary}</p>}
                    </>
                  )}
                  <dl>
                    {character.facts.map((fact) => (
                      <div key={fact.label} className={fact.open ? 'open' : ''}>
                        <dt>{fact.label}</dt>
                        {sceneBasisEditing ? (
                          <dd><input
                            value={fact.value}
                            aria-label={`${character.name} ${fact.label}`}
                            onChange={(event) => updateSceneBasisCharacter(character, {
                              facts: character.facts.map((entry) => (
                                entry.label === fact.label ? { ...entry, value: event.target.value } : entry
                              )),
                            })}
                          /></dd>
                        ) : <dd>{fact.value || '확인 필요'}</dd>}
                      </div>
                    ))}
                  </dl>
                  {sceneBasisEditing && (
                    <button
                      type="button"
                      className="scene-basis-reference-action"
                      onClick={() => generateCharacterReference(character.id)}
                      disabled={isReferenceImagePending('character', character.id)}
                    >
                      {isReferenceImagePending('character', character.id)
                        ? '레퍼런스 만드는 중…'
                        : character.image ? '레퍼런스 다시 만들기' : '레퍼런스 만들기'}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          {sceneState.characters.length > 3 && (
            <button
              type="button"
              className="scene-basis-more-characters"
              onClick={() => setSceneBasisCharactersExpanded((current) => !current)}
            >
              {sceneBasisCharactersExpanded
                ? '인물 접기'
                : `인물 ${sceneState.characters.length - 3}명 더 보기`}
            </button>
          )}
        </section>

        <section className="scene-basis-section" aria-label="공간 기준">
          <header><span>공간</span></header>
          <article className="scene-basis-location">
            {sceneState.location.image ? (
              <img src={sceneState.location.image} alt={`${sceneState.location.name} 레퍼런스`} />
            ) : (
              <span className="scene-basis-image-placeholder" aria-hidden="true">공간</span>
            )}
            <div>
              {sceneBasisEditing ? (
                <input
                  className="scene-basis-name-input"
                  value={sceneState.location.name || ''}
                  aria-label="공간 이름"
                  placeholder="공간 이름"
                  onChange={(event) => updateSceneBasisName('location', event.target.value)}
                />
              ) : <strong>{sceneState.location.name || '공간 미정'}</strong>}
              <dl>
                {sceneState.location.facts.map((fact) => (
                  <div key={fact.label} className={fact.open ? 'open' : ''}>
                    <dt>{fact.label}</dt>
                    {sceneBasisEditing ? (
                      <dd><input
                        value={fact.value}
                        aria-label={`공간 ${fact.label}`}
                        onChange={(event) => updateSceneBasisFact('location', fact.label, event.target.value)}
                      /></dd>
                    ) : <dd>{fact.value || '확인 필요'}</dd>}
                  </div>
                ))}
              </dl>
              {sceneBasisEditing && (
                <button
                  type="button"
                  className="scene-basis-reference-action"
                  onClick={() => requestReferenceImage('location')}
                  disabled={isReferenceImagePending('location')}
                >
                  {isReferenceImagePending('location')
                    ? '레퍼런스 만드는 중…'
                    : sceneState.location.image ? '레퍼런스 다시 만들기' : '레퍼런스 만들기'}
                </button>
              )}
            </div>
          </article>
        </section>

        <section className="scene-basis-section scene-basis-environment" aria-label="장면 공통 기준">
          <header><span>장면 공통</span></header>
          <dl>
            {sceneState.environment.facts.map((fact) => (
              <div key={fact.label} className={fact.open ? 'open' : ''}>
                <dt>{fact.label}</dt>
                {sceneBasisEditing ? (
                  <dd><input
                    value={fact.value}
                    aria-label={`장면 공통 ${fact.label}`}
                    onChange={(event) => updateSceneBasisFact('environment', fact.label, event.target.value)}
                  /></dd>
                ) : <dd>{fact.value || '확인 필요'}</dd>}
              </div>
            ))}
          </dl>
        </section>
      </div>
      <p className="scene-basis-note">여기 값과 레퍼런스가 이후 패널 생성의 공통 기준으로 쓰입니다.</p>
    </section>
  )

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

  // 범위를 고르는 중에는 바가 그 도구가 된다. 아래에 따로 띄우면
  // 스토리보드에서 컷을 누르면서 안내를 보려고 시선이 위아래로 오간다 —
  // 고르는 자리와 고르는 대상이 붙어 있어야 한다.
  const scopeSummary = scopeSelection ? (
    <div className="review-bar-scope selecting" role="group" aria-label="검토 범위 선택">
      <strong>
        {scopeSelection.anchor == null
          ? '시작 컷 선택'
          : scopeSelection.end == null
            ? `S${scopeSelection.anchor + 1} 선택됨`
            : scopeSelectionFrom === scopeSelectionTo
              ? `S${scopeSelectionFrom + 1} 한 컷`
              : `S${scopeSelectionFrom + 1}–S${scopeSelectionTo + 1}`}
      </strong>
      <span className="review-bar-hint">
        {scopeSelection.error
          || (scopeSelection.anchor == null
            ? '스토리보드에서 첫 컷을 누르세요'
            : scopeSelection.end == null
              ? reviewMode === 'viewer'
                ? '끝 컷을 하나 더'
                : '끝 컷을 누르거나 이 컷만 확정'
              : 'shift를 누른 채 누르면 범위를 늘리거나 줄입니다')}
      </span>
      <button type="button" onClick={() => setScopeSelection(null)}>취소</button>
      <button
        type="button"
        className="multi-review-run-button"
        disabled={!scopeSelectionCanConfirm}
        onClick={commitScopeSelection}
      >
        이 범위로 검토
      </button>
    </div>
  ) : (
    <div className="review-bar-scope">
      <span>{reviewMode === 'viewer' ? '읽힘 검토 범위' : '검토 대상'}</span>
      <strong>
        {scopeSelectionFrom != null
          ? scopeSelectionFrom === scopeSelectionTo
            ? `S${scopeSelectionFrom + 1} · 한 컷`
            : `S${scopeSelectionFrom + 1}–S${scopeSelectionTo + 1} · ${scopeSelectionTo - scopeSelectionFrom + 1}컷`
          : scope.mode === 'range'
            ? `S${scopeFrom + 1}–S${scopeTo + 1} · ${scopeTo - scopeFrom + 1}컷`
            : `S${scopedShotIndex + 1} · 한 컷`}
      </strong>
      <button
        type="button"
        className="scope-change-button"
        onClick={beginScopeSelection}
        disabled={scopeSelectableShotIds.length === 0 || Boolean(scopeSelection)}
      >
        범위 바꾸기
      </button>
      {reviewMode === 'multi' && (
        <button
          type="button"
          className="multi-review-run-button"
          onClick={runMultiReview}
          disabled={multiReviewLoading}
        >
          {multiReviewLoading
              ? '분석 중…'
              : (multiReviewRun.status === 'stale' || multiReviewOutdated)
                ? '변경 반영'
                : multiReviewHasResult ? '다시 분석' : '분석하기'}
        </button>
      )}
    </div>
  )


  // multi에서는 바가 검토 대상·실행·범위 선택을 모두 맡는다. 이 줄은
  // 다른 모드에서만 쓴다 — 두면 같은 도구가 두 자리에 나온다.
  const scopeRowNeeded = reviewMode !== 'multi'

  const scopePanel = (
    <section className="scope-panel" aria-label="Scope selection">
      {scopeRowNeeded && (
        <div className="scope-panel-row">
          <div className="scope-panel-copy">
            <span>{reviewMode === 'viewer' ? '읽힘 검토 범위' : '검토 대상'}</span>
            <strong>
              {scopeSelectionFrom != null
                ? scopeSelectionFrom === scopeSelectionTo
                  ? `S${scopeSelectionFrom + 1} · 한 컷`
                  : `S${scopeSelectionFrom + 1}–S${scopeSelectionTo + 1} · ${scopeSelectionTo - scopeSelectionFrom + 1}컷`
                : scope.mode === 'range'
                  ? `S${scopeFrom + 1}–S${scopeTo + 1} · ${scopeTo - scopeFrom + 1}컷`
                  : `S${scopedShotIndex + 1} · 한 컷`}
            </strong>
          </div>
          <div className="scope-controls">
            {scopeSelection ? (
              <div className="scope-selection-toolbar" role="group" aria-label="검토 범위 선택">
                <div>
                  <strong>
                    {scopeSelection.anchor == null
                      ? '시작 컷을 선택하세요'
                      : scopeSelection.end == null
                        ? `S${scopeSelection.anchor + 1} 선택됨`
                        : scopeSelectionFrom === scopeSelectionTo
                          ? `S${scopeSelectionFrom + 1} 한 컷`
                          : `S${scopeSelectionFrom + 1}–S${scopeSelectionTo + 1}`}
                  </strong>
                  <span>
                    {scopeSelection.error
                      || (scopeSelection.anchor == null
                        ? '아래 스토리보드에서 첫 컷을 누르세요.'
                        : scopeSelection.end == null
                          ? reviewMode === 'viewer'
                            ? '끝 컷을 하나 더 선택하세요.'
                            : '끝 컷을 누르거나 이 컷만 확정하세요.'
                          : 'shift를 누른 채 누르면 범위를 늘리거나 줄입니다.')}
                  </span>
                </div>
                <button type="button" onClick={() => setScopeSelection(null)}>취소</button>
                <button
                  type="button"
                  className="primary"
                  disabled={!scopeSelectionCanConfirm}
                  onClick={commitScopeSelection}
                >
                  이 범위로 검토
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="scope-change-button"
                  onClick={beginScopeSelection}
                  disabled={
                    scopeSelectableShotIds.length === 0
                    || (reviewMode === 'staging' && miseWorkspace === 'shot')
                  }
                  title={
                    reviewMode === 'staging' && miseWorkspace === 'shot'
                      ? 'Shot Staging은 한 컷씩 검토합니다.'
                      : undefined
                  }
                >
                  범위 바꾸기
                </button>
                {reviewMode === 'multi' && (
                  <button
                    type="button"
                    className="scope-run-review"
                    onClick={runMultiReview}
                    disabled={multiReviewLoading}
                  >
                    {multiReviewLoading
                        ? '분석 중…'
                        : (multiReviewRun.status === 'stale' || multiReviewOutdated)
                          ? '변경 반영'
                          : multiReviewHasResult ? '다시 분석' : '분석하기'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

    </section>
  )

  return (
    <div className="decision-board">
      {/* 읽힘 검토도 연출 검토처럼 범위 도구를 자기 표면 안에 둔다.
          위에 따로 띄우면 보드 전체 폭을 가로지르는 줄이 하나 더 생기고,
          검토 범위가 이 줄과 아래 스트립 두 자리에 나온다. */}
      {reviewMode !== 'multi' && reviewMode !== 'viewer' && scopePanel}

      {/* 읽힘 검토도 연출 검토와 같은 표면이다. `review-surface`가 왼쪽
          스토리보드 칸을 접고 검토면에 폭을 다 준다 — 스토리보드는 그
          안의 스트립으로 이미 있으므로, 왼쪽에 또 두면 같은 것이 두 자리에
          나오고 한쪽은 빈 채로 남는다. */}
      <div className={`decision-board-main view-${boardView} ${(reviewMode === 'multi' || reviewMode === 'viewer') ? 'review-surface' : ''}`}>
        <section className="decision-board-storyboard" aria-label="Storyboard scope">
          <SceneOverview
            shotPreview={storyboardShotPreview}
            compact={boardView === 'split'}
            decisionScope={scope}
            scopeSelection={scopeSelection}
            selectableScopeShotIds={scopeSelectableShotIds}
            onScopeShotSelect={selectScopeShot}
            sequencePreview={editingSequencePreview}
            /* 읽힘 검토에서는 이 칸 자체가 접힌다(`review-surface`).
               스토리보드는 검토면 안의 스트립이 맡는다. */
            viewerFocusShotIndex={null}
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
                className={reviewMode !== 'viewer' && reviewMode !== 'scene' ? 'active' : ''}
                onClick={() => selectReviewMode('multi')}
                aria-pressed={reviewMode !== 'viewer' && reviewMode !== 'scene'}
              >
                연출 검토
              </button>
              <button
                type="button"
                className={reviewMode === 'viewer' ? 'active audience' : 'audience'}
                onClick={() => selectReviewMode('viewer')}
                aria-pressed={reviewMode === 'viewer'}
                disabled={shots.length < 2}
              >
                읽힘 검토
              </button>
              <button
                type="button"
                className={reviewMode === 'scene' ? 'active scene' : 'scene'}
                onClick={() => selectReviewMode('scene')}
                aria-pressed={reviewMode === 'scene'}
              >
                장면 기준
              </button>
            </div>
            {onBackToStoryboard && (
              <button
                type="button"
                className="decision-back-to-storyboard"
                onClick={onBackToStoryboard}
              >
                ← 스토리보드
              </button>
            )}
          </nav>

          {reviewMode !== 'viewer' && reviewMode !== 'multi' && reviewMode !== 'scene' && (
            <nav className="decision-review-detail-nav" aria-label="전체 연출 분석">
              <button type="button" className="back" onClick={() => selectReviewMode('multi')}>
                ← 확인할 것
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
            </nav>
          )}

          {reviewMode === 'scene' ? sceneBasisPane : reviewMode === 'viewer' ? renderViewerReflectionPane() : (
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
                <section className="viewer-handoff-card" aria-label="읽힘 검토에서 가져온 문제">
                  <header>
                    <span>읽힘 검토 · {(viewerFindingHandoff.panelOrders || [viewerFindingHandoff.panelOrder]).map((panelOrder) => `S${panelOrder}`).join(' · ')}</span>
                    <button type="button" onClick={clearViewerFindingHandoff} aria-label="읽힘 검토 카드 닫기">×</button>
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
                      onChange={(e) => {
                        updateLensIntent(primaryLens.id, e.target.value)
                        lensRequestRecall.resetNavigation(e.target.value)
                      }}
                      onKeyDown={lensRequestRecall.onKeyDown}
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
              <section className="lens-review-sequence" aria-label="스토리보드와 렌즈 트랙">
                <div className="lens-review-sequence-controls" aria-label="스토리보드 이동">
                  <span>스토리보드</span>
                  <div className="lens-review-sequence-nav">
                    <button type="button" onClick={() => moveReviewSequence(-1)} aria-label="이전 컷 보기">←</button>
                    <button type="button" onClick={() => moveReviewSequence(1)} aria-label="다음 컷 보기">→</button>
                  </div>
                  {scopeSummary}
                </div>
                <div className="lens-review-shared-scroll" ref={reviewSequenceScrollRef}>
                  <StoryboardStripLane
                    embedded
                    shots={shots}
                    selectedShotIndex={
                      browsingShotIndex ?? selectedTrackShotIndex ?? scopedShotIndex
                    }
                    highlightRange={reviewStripHighlight}
                    onSelectShot={(index, event) => {
                      if (scopeSelection) {
                        selectScopeShot(index, event)
                        return
                      }
                      // shift+클릭은 선택 모드 밖에서도 범위 선택이다.
                      // 모드를 여는 일은 selectScopeShot이 처리한다.
                      if (event?.shiftKey) {
                        selectScopeShot(index, event)
                        return
                      }
                      // 컷을 누른 것은 "이걸 보겠다"는 명시적 행동이다.
                      // 검토 대상으로 삼는다 — 눌렀는데 대상이 그대로면
                      // 무엇을 검토하는지 감독이 다시 확인해야 한다.
                      setScopeMode('single')
                      setSingleScopeShotId(shots[index]?.id || null)
                      setBrowsingShotIndex(index)
                      setFlowActiveShot(index)
                      setSelectedIssueId(null)
                    }}
                    onSelectSeam={(index) => {
                      setFlowActiveShot(index)
                      setLensFocusedShotIndex(index)
                    }}
                  />
                  <LensTracks
                    embedded
                    shots={shots}
                    issues={trackIssues}
                    activeLenses={activeTrackLenses}
                    selectedIssueId={selectedIssueId}
                    loading={multiReviewLoading}
                    relating={Boolean(multiReviewRun.relating)}
                    scrollRef={reviewSequenceScrollRef}
                    /* 갈림은 진단이 아니라 근거다. 렌즈 줄과 떨어진
                       자리에 다른 모양으로 놓인다 (문서 7장). */
                    readingDivergences={readingLaneMarkers}
                    selectedDivergenceId={selectedReadingFindingId}
                    /* 여기는 연출 검토다. 누르면 읽힘 검토로 건너가지
                       않고, 그 갈림을 **세 렌즈가 보고 진단한다** —
                       갈림은 진단이 아니라 근거이므로, 화면에서 무엇이
                       그렇게 만들었는지는 렌즈가 짚어야 한다. */
                    onSelectDivergence={checkDivergenceWithLenses}
                    onSelectIssue={selectTrackIssue}
                    onToggleLens={(lensId) => setActiveTrackLenses((current) => {
                      const next = new Set(current)
                      if (next.has(lensId)) next.delete(lensId)
                      else next.add(lensId)
                      return next
                    })}
                  />
                </div>
              </section>

              {/* 검토 대상과 실행은 위 바로 올라갔다. 여기 남는 것은
                  범위를 고르는 중의 도구와 검토 의도다. 의도는 접혀
                  있으므로 늘 두고, 범위 도구는 고르는 중에만 나온다. */}
              {scopePanel}

              {/* 트랙은 씬 전체에서 발견한 Issue를 보존한다. 현재 검토 범위를
                  다른 컷으로 옮겼다고, 이미 선택한 Issue의 Inspector까지
                  숨기면 marker만 남고 아래가 사라진다. */}
              {(multiReviewVisible || selectedTrackIssue) && (
                <>
              {/* 고치러 갔다 오면 옛 분석이 최신인 것처럼 남는다.
                  본 뒤에 패널이 바뀌었으면 그 사실을 밝힌다. */}
              {multiReviewOutdated && (
                <p className="multi-review-outdated">
                  <span>이 분석 뒤에 패널이 바뀌었습니다. 지난 결과입니다.</span>
                  {/* 사실만 알리고 끝내면 감독이 옛 판단을 그대로 읽는다.
                      특히 컷을 넣거나 뺀 뒤에는 이음새가 전부 달라지므로
                      다시 봐야 한다 — 그 행동을 여기에 둔다. 구조 변경은
                      이음새 도구로 넘어가 Workspace가 닫히기 때문에,
                      Reappraise가 이어지는 자리는 여기뿐이다. */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedIssueId(null)
                      runMultiReview()
                    }}
                    disabled={multiReviewLoading}
                  >
                    {multiReviewLoading ? '다시 보는 중…' : '바뀐 화면으로 다시 보기'}
                  </button>
                </p>
              )}

              {trackIssues.length > 0 && (
                <IssueInspector
                  issue={revisionWorkspace?.issue || selectedTrackIssue}
                  issues={trackIssues}
                  diagnosesById={diagnosesById}
                  comparisons={multiReviewRuns[(revisionWorkspace?.issue || selectedTrackIssue)?.sourceScopeKey]?.comparisons || []}
                  lensChecks={selectedIssueLensChecks}
                  shots={shots}
                  /* 범위를 정해 검토 중이면 앞뒤 컷도 그 안에서만
                     가져온다. 한 컷만 보는 중이면 범위가 곧 그 컷이라
                     좁히면 앞뒤가 아예 사라지므로 전체에서 가져온다. */
                  range={scopeMode === 'range' ? { from: scopeFrom, to: scopeTo } : null}
                  relating={Boolean(multiReviewRuns[(revisionWorkspace?.issue || selectedTrackIssue)?.sourceScopeKey]?.relating)}
                  onCheckLens={checkSelectedIssueLens}
                  onCompare={() => runRelateReview((revisionWorkspace?.issue || selectedTrackIssue)?.sourceScopeKey)}
                  mainLensQuestion={selectedIssueMainLensQuestion}
                  /* 답은 이 렌즈만의 것이 아니다. 감독이 확정한 창작 결정이므로
                     세 렌즈가 함께 그 전제 위에서 다시 본다. 앞서 답한 것도
                     같이 실어, 다시 볼 때마다 전제가 하나씩 빠지지 않게 한다. */
                  onAnswerMainLensQuestion={(newAnswers) => runMultiReview({
                    answers: [...answeredDirectingQuestions, ...newAnswers],
                  })}
                  answeringMainLensQuestion={multiReviewLoading}
                  onRevise={reviseTrackIssue}
                  /* 삽입·나누기·합치기·빼기는 두 컷 **사이**의 일이다.
                     GridView로 넘기지 않고 그 자리에 펼친다. 도구는 격자가
                     쓰던 것과 같은 것이다 (11장). */
                  seamEditor={null}
                  seamOperation={null}
                  removingPanel={null}
                  revisionWorkspace={revisionWorkspace ? (
                    <RevisionWorkspace
                  key={`${revisionWorkspace.diagnosis.id}:${seamEdit?.operation || 'idle'}`}
                  issue={revisionWorkspace.issue}
                  /* 이 수정이 다른 검토에 닿는지 보려면 전체가 필요하다. */
                  issues={trackIssues}
                  shotCount={shots.length}
                  cut={cutForDiagnosis(revisionWorkspace.diagnosis)}
                  diagnosis={revisionWorkspace.diagnosis}
                  currentImage={revisionTargetShot?.image || panelDraftImages[revisionTargetShot?.id] || ''}
                  editingSequenceShots={editingRevisionSequencePreview}
                  editingSequenceNotice={editingSequenceNotice}
                  onDirectSeamEdit={openDirectEditingSeam}
                  seamEditor={seamEdit ? (
                    <SeamEditor
                      pendingEdit={seamEdit.pendingEdit}
                      shots={shots}
                      showHeader={false}
                      onClose={() => setSeamEdit(null)}
                      onDone={() => {
                        setSeamEdit(null)
                        logEvent('verdict', {
                          target: revisionWorkspace?.diagnosis?.id,
                          verdict: 'applied',
                          lens: revisionWorkspace?.diagnosis?.lens,
                        })
                        setRevisionWorkspace((current) => (
                          current ? { ...current, applied: true } : current
                        ))
                      }}
                    />
                  ) : null}
                  cameraPrompt={selectCutPrompt(
                    useStore.getState(), cutForDiagnosis(revisionWorkspace.diagnosis)?.id,
                  )?.effective || ''}
                  promptDraft={promptDrafts[revisionWorkspace.diagnosis.id] ?? null}
                  promptNote={promptRewriteNotes[revisionWorkspace.diagnosis.id] || ''}
                  /* 고치기 전 문장. 수정본만 보이면 무엇이 달라졌는지
                     기억에 기대어 판정하게 된다. */
                  promptBefore={promptBefore[revisionWorkspace.diagnosis.id] || ''}
                  onRevertPrompt={(text) => openPromptEditor(revisionWorkspace.diagnosis, text)}
                  rewriting={promptRewriting === revisionWorkspace.diagnosis.id}
                  generating={promptGenerationStatus[revisionWorkspace.diagnosis.id] === 'generating'}
                  revisionPending={revisionIsPending}
                  revisionImage={revisionDraftImage}
                  revisionBefore={revisionIsPending ? panelRevisionPending?.before : null}
                  onBack={() => { setSeamEdit(null); setRevisionWorkspace(null) }}
                  onKeep={() => {
                    // 유지도 판정이다. 기록하지 않으면 감독이 무엇을
                    // 감수하기로 했는지 남지 않는다 (PAPER_SECTION_4의
                    // `verdict` 측정 항목).
                    logEvent('verdict', {
                      target: revisionWorkspace.diagnosis.id,
                      verdict: 'keep',
                      lens: revisionWorkspace.diagnosis.lens,
                    })
                    setRevisionWorkspace(null)
                  }}
                  onClose={() => { setSeamEdit(null); setRevisionWorkspace(null) }}
                  onDirectCameraEdit={(draft) => applyDirectCameraEdit(
                    revisionWorkspace.diagnosis, draft,
                  )}
                  onOpenLens={() => {
                    // 도구를 여기 다시 만들지 않는다. 그 렌즈의 상세
                    // 화면에 적용·재생성·되돌리기가 이미 있다.
                    const lensId = revisionWorkspace.diagnosis.lens === 'mise'
                      ? 'staging'
                      : revisionWorkspace.diagnosis.lens
                    logScaffold({ feature: 'lens', action: 'open', lens: lensId })
                    setRevisionWorkspace(null)
                    setFullAnalysisOpen(true)
                    selectReviewMode(lensId)
                  }}
                  onPrepare={(alternative) => {
                    // 미장센·촬영의 문장형 추천안은 실행 전에 먼저 프롬프트
                    // 초안으로 열어 사용자가 직접 만진다. 편집은 아래
                    // seam 캔버스가 조작 자리라 여기서 초안을 만들지 않는다.
                    const patch = alternative?.patch || {}
                    const hasPatch = Boolean(patch.shot_size || patch.angle || patch.move)
                    if (!hasPatch && revisionWorkspace.diagnosis.lens !== 'editing') {
                      requestPromptRewrite(revisionWorkspace.diagnosis, alternative)
                    }
                  }}
                  onChoose={(alternative) => {
                    // 어느 렌즈가 짚었는지가 아니라 **이 선택지가 무엇을
                    // 하는지**로 정한다 (LENS_TRACKS_UI.md 5장 — 여기서는
                    // intervention target이 중심이다). 촬영이 이음새를
                    // 짚고 컷을 넣자고 할 수도 있고, 편집이 프레이밍만
                    // 조정하자고 할 수도 있다.
                    const action = editingActionFor(alternative).id
                    if (action === 'seam') {
                      // 그림을 다시 그린다. 결과를 여기서 판정하므로
                      // Workspace를 열어 둔다.
                      applyAlternative(revisionWorkspace.diagnosis, alternative)
                      return
                    }
                    // 구조를 바꾸는 것은 이음새 편집기가 받는다. 편집
                    // 렌즈면 그것이 이미 두 컷 사이에 펼쳐져 있으므로
                    // (`onSeamEdit`), 여기서 다시 열거나 다른 화면으로
                    // 넘기지 않는다 — 그러면 같은 조작에 창이 둘이 된다.
                    if (seamEdit) return
                    routeDiagnosisTool(action, revisionWorkspace.diagnosis, alternative)
                    setRevisionWorkspace(null)
                  }}
                  /* 편집 렌즈만 해당한다. 구조를 바꾸는 선택지를 고르면
                     이음새 자리가 펼쳐지고, 실행도 거기서 한다. */
                  onSeamEdit={revisionWorkspace.diagnosis.lens === 'editing'
                    ? (operation, alternative) => openSeamEdit(
                      operation, alternative, revisionWorkspace.issue, revisionWorkspace.diagnosis,
                    )
                    : null}
                  seamEditing={Boolean(seamEdit)}
                  onPromptChange={(text) => openPromptEditor(revisionWorkspace.diagnosis, text)}
                  onClosePrompt={() => openPromptEditor(revisionWorkspace.diagnosis, null)}
                  onSavePrompt={() => savePromptDraft(revisionWorkspace.diagnosis)}
                  applied={Boolean(revisionWorkspace.applied)}
                  onAccept={() => {
                    acceptPanelRevision()
                    logEvent('verdict', {
                      target: revisionWorkspace.diagnosis.id,
                      verdict: 'applied',
                      lens: revisionWorkspace.diagnosis.lens,
                    })
                    // 닫지 않는다. 고친 화면을 다른 렌즈가 어떻게 읽는지
                    // 다시 보는 것까지가 한 흐름이다 (Reappraise).
                    setRevisionWorkspace((current) => (
                      current ? { ...current, applied: true } : current
                    ))
                  }}
                  onReappraise={() => {
                    setRevisionWorkspace(null)
                    setSelectedIssueId(null)
                    // 바뀐 화면으로 다시 돌린다. 옛 판단이 남아 있으면
                    // 이미 해결된 문제를 다시 읽게 된다.
                    runMultiReview()
                  }}
                  onReject={rejectPanelRevision}
                    />
                  ) : null}
                />
              )}

              {trackIssues.length === 0 && !multiReviewLoading && (
              <section className="directing-checklist" aria-label="연출 검토 확인할 것">
                <header>
                  <div>
                    <span>확인할 것 {directingIssues.length}개</span>
                    {directingIssues.length > 0 && (
                      <strong>
                        {currentDirectingIssueIndex >= 0 ? currentDirectingIssueIndex + 1 : directingIssues.length} / {directingIssues.length}
                      </strong>
                    )}
                  </div>
                </header>

                {directingIssues.length > 1 && (
                  <nav className="directing-check-queue" aria-label="확인할 항목 선택">
                    {directingIssues.map((issue, index) => {
                      const done = Boolean(directingIssueDecisions[directingDecisionKey(issue.id)])
                      const active = issue.id === currentDirectingIssue?.id
                      return (
                        <button
                          key={issue.id}
                          type="button"
                          className={`${active ? 'active' : ''}${done ? ' done' : ''}`}
                          disabled={done}
                          aria-current={active ? 'step' : undefined}
                          onClick={() => {
                            setActiveDirectingIssueId(issue.id)
                            setExpandedDirectingIssueId(null)
                          }}
                        >
                          <span>{done ? '✓' : index + 1}</span>
                          {issue.lensName}
                        </button>
                      )
                    })}
                  </nav>
                )}

                {currentDirectingIssue ? (() => {
                  const issue = currentDirectingIssue
                  const diagnosis = issue.diagnosis
                  const expanded = expandedDirectingIssueId === issue.id
                  const keep = (diagnosis.alternatives || []).find((alternative) => alternative.kind === 'keep')
                  const changes = (diagnosis.alternatives || []).filter((alternative) => alternative.kind === 'change')
                  const issueCut = cutForDiagnosis(diagnosis)
                  const issueShot = shots.find((shot) => shot.cutPlanItemId === issueCut?.id)
                  const revisionForIssue = panelRevisionPending?.shotId === issueShot?.id
                  const revisionImage = revisionForIssue ? panelDraftImages[issueShot?.id] || '' : ''
                  const issuePromptDraft = promptDrafts[diagnosis.id] ?? null
                  const isRewritingIssuePrompt = promptRewriting === diagnosis.id
                  const isGeneratingIssuePrompt = promptGenerationStatus[diagnosis.id] === 'generating'
                  const issuePromptNote = promptRewriteNotes[diagnosis.id] || ''
                  return (
                    <article className="directing-check-card" style={{ '--issue-color': issue.accent }}>
                      <div className="directing-check-source">
                        <span>{issue.mark}</span>
                        <strong>{issue.lensName}</strong>
                      </div>
                      <h3>{diagnosis.diagnosis}</h3>

                      {expanded && (
                        <div className="directing-check-proposal">
                          <p className="directing-check-proposal-lead">{diagnosis.suggested_action}</p>
                          <div>
                            <span>현재</span>
                            <strong>지금 화면 유지</strong>
                            <p>{keep?.effect || '현재 연출을 그대로 둡니다.'}</p>
                          </div>
                          {changes.length > 0 ? changes.map((alternative) => {
                            const isMakingPreview = applyingAlternative === `${diagnosis.id}::${alternative.label}`
                            const patch = alternative.patch || {}
                            const fieldChanges = [
                              patch.shot_size && ['샷 크기', issueCut?.shotSize, patch.shot_size],
                              patch.angle && ['앵글', issueCut?.angle, patch.angle],
                              patch.move && ['카메라', issueCut?.cameraMove, patch.move],
                            ].filter(Boolean).filter(([, from, to]) => from !== to)
                            const isBatchable = fieldChanges.length > 0
                            const editingAction = issue.backendId === 'editing'
                              ? editingActionFor(alternative)
                              : null
                            return (
                            <div key={alternative.label}>
                              <span>제안</span>
                              <strong>{alternative.label}</strong>
                              <p>
                                {alternative.effect}
                                {fieldChanges.map(([label, from, to]) => (
                                  <span className="directing-check-proposal-change" key={label}>
                                    {label} {from || '미정'} → {to}
                                  </span>
                                ))}
                              </p>
                              {isBatchable ? (
                                <button
                                  type="button"
                                  className="directing-check-proposal-apply"
                                  disabled={isMakingPreview || revisionForIssue}
                                  onClick={() => previewCurrentDirectingAlternative(alternative)}
                                >
                                  {isMakingPreview ? '수정안 만드는 중…' : '이 수정안 보기'}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="directing-check-proposal-apply"
                                  disabled={isMakingPreview || revisionForIssue}
                                onClick={() => previewCurrentDirectingAlternative(alternative)}
                              >
                                  {isMakingPreview
                                    ? '수정 문장 만드는 중…'
                                    : editingAction?.label || '수정 문장 만들기'}
                                </button>
                              )}
                            </div>
                            )
                          }) : (
                            <div>
                              <span>제안</span>
                              <strong>{diagnosis.suggested_action}</strong>
                            </div>
                          )}
                        </div>
                      )}

                      {issuePromptDraft != null && !revisionForIssue && (
                        <section className="directing-check-prompt" aria-live="polite">
                          <header>
                            <strong>{isRewritingIssuePrompt ? '추천안을 프롬프트로 옮기는 중…' : '수정 문안'}</strong>
                            {!isRewritingIssuePrompt && <span>확인하거나 직접 고친 뒤 수정안을 만드세요.</span>}
                          </header>
                          {issuePromptNote && <p>{issuePromptNote}</p>}
                          <textarea
                            value={issuePromptDraft}
                            rows={5}
                            disabled={isRewritingIssuePrompt || isGeneratingIssuePrompt}
                            onChange={(event) => openPromptEditor(diagnosis, event.target.value)}
                          />
                          <div>
                            <button type="button" onClick={() => openPromptEditor(diagnosis, null)}>닫기</button>
                            <button
                              type="button"
                              className="primary"
                              disabled={isRewritingIssuePrompt || isGeneratingIssuePrompt}
                              onClick={() => savePromptDraft(diagnosis)}
                            >
                              {isGeneratingIssuePrompt ? '수정안 만드는 중…' : '이 문안으로 수정안 보기'}
                            </button>
                          </div>
                        </section>
                      )}

                      {revisionForIssue && (
                        <section className="directing-check-revision" aria-live="polite">
                          {revisionImage ? (
                            <>
                              <img src={revisionImage} alt={`${issue.lensName} 수정안`} />
                              <div>
                                <strong>이 수정안을 적용할까요?</strong>
                                <span>버리면 추천안을 적용하기 전 상태로 돌아갑니다.</span>
                              </div>
                              <div className="directing-check-revision-actions">
                                <button type="button" className="primary" onClick={acceptCurrentDirectingRevision}>이 수정안 적용</button>
                                <button type="button" onClick={rejectPanelRevision}>버리고 되돌리기</button>
                              </div>
                            </>
                          ) : <span>수정안을 만드는 중…</span>}
                        </section>
                      )}

                      <div className="directing-check-actions">
                        <button type="button" onClick={keepCurrentDirectingIssue}>
                          {unresolvedDirectingIssues.length > 1 ? '유지하고 다음' : '현재 유지'}
                        </button>
                        <button
                          type="button"
                          className={expanded ? 'active' : ''}
                          onClick={() => setExpandedDirectingIssueId(expanded ? null : issue.id)}
                        >
                          {expanded ? '추천안 닫기' : '추천안 보기'}
                        </button>
                        <button type="button" className="primary" onClick={openCurrentDirectingIssue}>
                          직접 수정
                        </button>
                      </div>
                    </article>
                  )
                })() : (
                  <div className="directing-check-complete">
                    <strong>{directingIssues.length > 0 ? '확인을 마쳤습니다.' : '바로 고쳐야 할 것은 찾지 못했습니다.'}</strong>
                    <p>{directingQuestionCount > 0
                      ? '의도를 확인하면 다음 점검이 더 정확해집니다.'
                      : '세 관점의 세부 판단은 전체 분석에 보존되어 있습니다.'}</p>
                  </div>
                )}
              </section>
              )}

              {!currentDirectingIssue && currentDirectingQuestion && (() => {
                const questionKey = directingQuestionDecisionKey(currentDirectingQuestion.id)
                const questionIndex = directingQuestions.findIndex((question) => question.id === currentDirectingQuestion.id) + 1
                const draft = directingQuestionDrafts[questionKey] || ''
                return (
                  <section className="directing-intent-check" aria-label="의도 확인">
                    <header>
                      <span>의도 확인</span>
                      <strong>{questionIndex} / {directingQuestionCount}</strong>
                    </header>
                    <p>{currentDirectingQuestion.prompt}</p>
                    <textarea
                      value={draft}
                      rows={2}
                      placeholder="짧게 답해 주세요"
                      onChange={(event) => setDirectingQuestionDrafts((current) => ({
                        ...current,
                        [questionKey]: event.target.value,
                      }))}
                    />
                    <div>
                      <button type="button" onClick={skipCurrentDirectingQuestion}>나중에</button>
                      <button
                        type="button"
                        className="primary"
                        disabled={!draft.trim()}
                        onClick={answerCurrentDirectingQuestion}
                      >
                        답하고 다음
                      </button>
                    </div>
                  </section>
                )
              })()}

              {!currentDirectingIssue && directingQuestionCount > 0 && !currentDirectingQuestion && (
                <section className="directing-intent-complete" aria-label="의도 확인 완료">
                  <div>
                    <strong>의도 확인을 마쳤습니다.</strong>
                    <p>{answeredDirectingQuestions.length > 0
                      ? `답한 ${answeredDirectingQuestions.length}개를 반영해 다시 점검할 수 있습니다.`
                      : '답은 나중에 다시 물을 수 있습니다.'}</p>
                  </div>
                  {answeredDirectingQuestions.length > 0 && (
                    <button
                      type="button"
                      className="primary"
                      disabled={multiReviewLoading}
                      onClick={() => runMultiReview({ answers: answeredDirectingQuestions })}
                    >
                      이 답으로 다시 점검
                    </button>
                  )}
                </section>
              )}

              {(multiReviewDetailLenses.length > 0 || multiReviewRun.relating || multiRelations.length > 0) && (
              <details
                className="multi-review-full-analysis"
                open={fullAnalysisOpen}
                onToggle={(event) => setFullAnalysisOpen(event.currentTarget.open)}
              >
                <summary>
                  <div>
                    <strong>전체 분석 보기</strong>
                  </div>
                  <em>{fullAnalysisOpen ? '접기' : '열기'}</em>
                </summary>
                <div className="multi-review-full-analysis-body">
              {(multiReviewRun.relating || multiRelations.length > 0) && (
                <div className="multi-review-relation-heading" role={multiReviewRun.relating ? 'status' : undefined}>
                  <strong>렌즈 간 관계</strong>
                  {multiReviewRun.relating && <span>확인 중…</span>}
                </div>
              )}

              {/* 메인 진단과 조작을 반복하지 않고 관계만 짧게 남긴다. */}
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
                </section>
              ))}

              {multiReviewDetailLenses.length > 0 && (
                <section className="multi-review-detail-links" aria-label="에이전트별 상세 분석">
                  <header>
                    <strong>에이전트별 상세 분석</strong>
                    <span>각 관점의 근거와 세부 판단</span>
                  </header>
                  <div>
                    {multiReviewDetailLenses.map(({ backendId, lensId, name }) => (
                      <button
                        key={backendId}
                        type="button"
                        onClick={() => selectReviewMode(lensId)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </section>
              )}

                </div>
              </details>
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
