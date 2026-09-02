// 예시 대본 seed. `loadExampleScreenplay`가 이 한 벌로 화면을 채운다.
//
// 이 값들은 예전에 실제 세션에서 만들어 둔 완성 상태를 그대로 굳힌 것이다
// (대본 9줄 · 컷 플랜 8컷 · 패널 8장). `?fresh=1`로 저장소를 비우고 예시를
// 다시 불러도 이 상태가 나온다. 규칙 기반 생성기(createMockCutPlan)를 쓰면
// 대본을 조금만 손봐도 컷과 그림이 어긋나므로, 여기서는 만들어 둔 값을
// 그대로 쓴다.
//
// 패널·인물 그림은 base64로 두면 번들이 수십 MB가 된다. public/img/demo/에
// 파일로 두고 경로만 참조한다.

// 씬 서술. 대사는 두지 않는다 — 정지 이미지가 담을 수 없다.
export const EXAMPLE_SCREENPLAY = [
  { type: 'scene-heading', text: '대학 물리학과 실험실, 밤늦게', beat: 0 },
  { type: 'action', text: '하린이 실험실에서 며칠째 측정 그래프를 반복해 살핀다.', beat: 0, filled: false, sourceEvidence: ['"밤늦은 대학 물리학과 실험실에서"', '"며칠째 어긋나는 측정 그래프를 반복해 살핀다"'], characters: ['하린'], dialogue: '' },
  { type: 'action', text: '하린이 계산과 지우기를 거듭하며 그래프의 간격을 다시 확인한다.', beat: 0, filled: true, sourceEvidence: ['"계산과 지우기를 거듭하던"'], characters: ['하린'], dialogue: '' },
  { type: 'action', text: '하린이 오차처럼 보이던 간격을 멈춰 바라본다.', beat: 1, filled: true, sourceEvidence: ['"오차로 보였던 간격이"'], characters: ['하린'], dialogue: '' },
  { type: 'action', text: '하린이 새 식을 적고 확신한 표정을 짓는다.', beat: 1, filled: false, sourceEvidence: ['"새 식을 적어 확신한다"'], characters: ['하린'], dialogue: '' },
  { type: 'action', text: '하린이 노트를 들고 연구동 복도로 나온다.', beat: 2, filled: false, sourceEvidence: ['"하린은 노트를 들고 연구동 복도로 나가"'], characters: ['하린'], dialogue: '' },
  { type: 'action', text: '하린이 불이 켜진 연구실 문 앞에서 잠시 망설인다.', beat: 2, filled: false, sourceEvidence: ['"불이 켜진 연구실 문 앞에서 잠시 망설이다"'], characters: ['하린'], dialogue: '' },
  { type: 'action', text: '하린이 문을 노크한다.', beat: 2, filled: false, sourceEvidence: ['"노크한다"'], characters: ['하린'], dialogue: '' },
  { type: 'action', text: '연구실 문이 열리고 진우가 모습을 드러낸다.', beat: 3, filled: false, sourceEvidence: ['"그리고 진우가 등장한다"'], characters: ['진우'], dialogue: '' },
]

// 작품 전체의 인물 기준. 인물은 씬의 소유물이 아니다.
export const EXAMPLE_CAST = [
  {
    id: 'cast-하린',
    name: '하린',
    summary: '대학 물리학과 학생으로, 반복해 측정 그래프를 살피고 새 식을 적는 인물',
    facts: [
      { label: '성별·나이', value: '여성, 20대', open: false, changes: [] },
      { label: '외형 기준', value: '실험실 가운, 단정한 머리, 마른 체형', open: false, changes: [] },
      { label: '상태', value: '', open: true, changes: [] },
    ],
    image: '/img/demo/cast_harin.jpg',
    stylePreset: 'rough',
    promptOverride: '',
  },
  {
    id: 'cast-진우',
    name: '진우',
    summary: '연구실 문 뒤에 있다가 등장하는 인물',
    facts: [
      { label: '성별·나이', value: '', open: true, changes: [] },
      { label: '외형 기준', value: '', open: true, changes: [] },
      { label: '상태', value: '', open: true, changes: [] },
    ],
    image: '/img/demo/cast_jinwoo.jpg',
    stylePreset: 'rough',
    promptOverride: '',
  },
]

// 장면 조건(키 공간·시간·위치). 대본에는 씬 헤딩이 하나뿐이라 씬도 하나다.
export const EXAMPLE_SCENE_STATES = {
  'scene-0': {
    title: '대학 물리학과 실험실, 밤늦게',
    description: '대본에서 추출한 장면 기준입니다. Shot별 배치는 이 상태를 상속하고, 달라진 부분만 별도로 기록합니다.',
    location: {
      name: '대학 물리실험실',
      facts: [
        { label: '장소 정체', value: '', open: true, changes: [] },
        { label: '고정 소품', value: '', open: true, changes: [] },
      ],
      image: null,
      promptOverride: '',
    },
    environment: {
      name: '시간',
      facts: [
        { label: '시간', value: '밤늦게', open: false, changes: [] },
      ],
    },
    characterIds: ['cast-하린', 'cast-진우'],
    characterOverrides: {},
  },
}

// 대본 지문(type:text)을 이어붙인 sceneStateStoryKey. selectActiveSceneState가
// 이 값과 현재 대본의 fingerprint를 비교해 장면 조건을 살릴지 정한다.
export const EXAMPLE_SCENE_STATE_STORY_KEY = EXAMPLE_SCREENPLAY
  .map((element) => `${element.type}:${element.text}`)
  .join('\n')

// 컷 플랜 8컷. 예전 세션에서 확정한 값 그대로. id는 고정해 둔다 — 매번
// 새로 만들면 narrativeCheck가 가리키는 컷과 어긋난다.
export const EXAMPLE_CUT_PLAN = [
  { id: 'cut-demo-1', order: 1, beat: 0, beatOrder: 1, time: '밤늦게', place: '실험실', content: '하린이가 실험 장비와 측정 그래프가 펼쳐진 책상 앞에서 며칠치 기록을 반복해 살핀다.', purpose: '반복 확인', characters: '하린이', shotSize: 'Wide', angle: 'Eye level', cameraMove: 'Fixed', shotReason: '씬 시작에서 공간(실험실/책상/그래프 위치)을 먼저 세워 관객이 ‘반복 확인’의 대상이 어디인지 즉시 잡게 한다.', dominant: '측정 그래프가 펼쳐진 책상', duration: '', promptOverride: '', provenance: 'AI', dialogue: '' },
  { id: 'cut-demo-2', order: 2, beat: 0, beatOrder: 2, time: '밤늦게', place: '실험실', content: '하린이가 노트에서 계산을 다시 하고 지우개로 수정한 뒤 그래프의 간격을 가늠한다.', purpose: '오차 점검', characters: '하린이', shotSize: 'Medium', angle: 'Over the shoulder', cameraMove: 'Fixed', shotReason: '0에서 잡힌 책상 영역을 유지한 채, 수정 흔적이 보이는 지점으로 시선이 이어지며 오차 점검으로 좁혀 들어간다.', dominant: '지우개로 수정한 계산 메모', duration: '', promptOverride: '', provenance: 'AI', dialogue: '' },
  { id: 'cut-demo-3', order: 3, beat: 1, beatOrder: 1, time: '밤늦게', place: '실험실', content: '하린이가 그래프의 간격을 멈춰 바라보며 멍하니 판단한다.', purpose: '정보 포착', characters: '하린이', shotSize: 'Bust', angle: 'Over the shoulder', cameraMove: 'Fixed', shotReason: '계산을 끝낸 뒤 ‘간격’에 판단을 고정하는 순간이라, 상체 크기로 올려 감정의 고요함과 정보 포착을 강조한다.', dominant: '그래프의 간격이 멈춰진 하린이 시선', duration: '', promptOverride: '', provenance: 'AI', dialogue: '' },
  { id: 'cut-demo-4', order: 4, beat: 1, beatOrder: 2, time: '밤늦게', place: '실험실', content: '하린이가 새 식을 노트에 적고 확신한 표정을 짓는다.', purpose: '결론 도출', characters: '하린이', shotSize: 'Close-Up', angle: 'Eye level', cameraMove: 'Dolly in', shotReason: '하린이가 ‘결론을 내리며’ 행동을 확정하는 피크로, 가장 가까운 샷이 확신의 실행(새 식) 순간을 직접적으로 찍어야 한다.', dominant: '새 식을 적은 잉크 선과 확신의 눈빛', duration: '', promptOverride: '', provenance: 'AI', dialogue: '' },
  { id: 'cut-demo-5', order: 5, beat: 2, beatOrder: 1, time: '밤늦게', place: '연구동 복도', content: '하린이가 노트를 들고 연구동 복도로 걸어 나온다.', purpose: '다음 행동', characters: '하린이', shotSize: 'Wide', angle: 'Eye level', cameraMove: 'Fixed', shotReason: '피크 이후 다음 행동(복도로 이동)이 시작되므로, 복도의 방향성과 인물 위치를 다시 넓혀 리컨텍스트화한다.', dominant: '노트를 든 하린이와 복도 방향', duration: '', promptOverride: '', provenance: 'AI', dialogue: '' },
  { id: 'cut-demo-6', order: 6, beat: 2, beatOrder: 2, time: '밤늦게', place: '연구실 문앞', content: '하린이가 불이 켜진 연구실 문 앞에서 노트를 움켜쥔 채 망설인다.', purpose: '망설임', characters: '하린이', shotSize: 'Medium', angle: 'Eye level', cameraMove: 'Fixed', shotReason: '망설임은 말보다 ‘결정이 안 되는 신체’에 드러나므로, 손에 집중해 불 꺼진/꺼지지 않은 경계의 긴장감을 전달한다.', dominant: '문 앞에서 움켜쥔 노트의 손', duration: '', promptOverride: '', provenance: 'AI', dialogue: '' },
  { id: 'cut-demo-7', order: 7, beat: 2, beatOrder: 3, time: '밤늦게', place: '연구실 문앞', content: '하린이가 연구실 문을 향해 노크한다.', purpose: '연락 시도', characters: '하린이', shotSize: 'Bust', angle: 'Eye level', cameraMove: 'Fixed', shotReason: '연락 시도에서 행동을 바로 시작하는 전환이라, 상체로 좁혀 ‘노크한다’는 물리적 액션을 읽히게 한다.', dominant: '노크 직전의 손(문을 향한 방향)', duration: '', promptOverride: '', provenance: 'AI', dialogue: '' },
  { id: 'cut-demo-8', order: 8, beat: 3, beatOrder: 1, time: '밤늦게', place: '연구실 문앞', content: '연구실 문이 열리고 진우가 밖으로 모습을 드러낸다.', purpose: '등장', characters: '하린이, 진우', shotSize: 'Full', angle: 'Eye level', cameraMove: 'Fixed', shotReason: '문이 열리며 인물 관계(하린이-진우)가 새로 생기는 아웃풋 컷이라, 문과 거리까지 함께 담아 시선이 만남으로 자연스럽게 이동하게 한다.', dominant: '열리는 연구실 문 사이로 보이는 진우의 실루엣', duration: '', promptOverride: '', provenance: 'AI', dialogue: '' },
]

// 컷 순서(order)당 패널 그림. 8컷 전부에 그림이 있다.
export const EXAMPLE_PANEL_IMAGES = {
  1: '/img/demo/panel_1.jpg',
  2: '/img/demo/panel_2.jpg',
  3: '/img/demo/panel_3.jpg',
  4: '/img/demo/panel_4.jpg',
  5: '/img/demo/panel_5.jpg',
  6: '/img/demo/panel_6.jpg',
  7: '/img/demo/panel_7.jpg',
  8: '/img/demo/panel_8.jpg',
}

// 컷 플랜 단계의 이야기 점검 결과. 예전 세션에서 나온 그대로.
export const EXAMPLE_NARRATIVE_CHECK = {
  summary: '사건 흐름과 정보 공개 순서는 대체로 맞습니다.',
  findings: [
    {
      ruleId: 'editing-shot-function',
      cutIds: ['cut-demo-2'],
      lineIndexes: [],
      finding: '계산과 지우기가 앞선 점검과 같은 기능을 반복해요.',
      suggestedAction: '기록 재확인과 계산 수정 중 하나에 더 집중하세요.',
      operation: 'keep',
      checkedFingerprint: JSON.stringify({ id: 'cut-demo-2', order: 2, beat: 0, beatOrder: 2, time: '밤늦게', place: '실험실', content: '하린이가 노트에서 계산을 다시 하고 지우개로 수정한 뒤 그래프의 간격을 가늠한다.', purpose: '오차 점검', characters: '하린이', shotSize: '', angle: '', cameraMove: '' }),
    },
  ],
  stage: 'cutplan',
}
