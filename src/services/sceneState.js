// 씬 기준 응답을 스토어가 쓰는 형태로 옮긴다.
// api.js에서 떼어낸 이유: 그 파일은 import.meta.env를 읽어 node에서 로드되지
// 않는다. 변환 규칙은 검증할 수 있어야 한다.
export function toSceneState(data, heading = '', cutIds = []) {
  const facts = (list = [], allowTimeline = false) => list.map((fact) => ({
    label: fact.label,
    value: fact.value || '',
    // 대본이 정하지 않은 항목. 프롬프트에 넣지 않는다 —
    // 미정을 문장으로 만들면 모델이 그것을 정해버린다.
    open: Boolean(fact.open) || !fact.value,
    // 컷 플랜이 확실히 말해주는 기본 흐름은 시간뿐이다. 인물 외형·조명까지
    // AI가 임의로 변하게 하면 Scene State가 불필요하게 복잡해진다.
    changes: (allowTimeline && fact.label === '시간' ? fact.changes || [] : [])
      .map((change) => ({ cutId: cutIds[change.at_cut - 1], value: change.value || '' }))
      .filter((change) => change.cutId && change.value),
  }))

  return {
    title: heading,
    description: '대본에서 추출한 장면 기준입니다. Shot별 배치는 이 상태를 상속하고, 달라진 부분만 별도로 기록합니다.',
    characters: data.characters.map((character, index) => ({
      // id는 화면이 카드를 구분하는 데 쓴다. 이름은 바뀔 수 있으므로 순번으로.
      id: `char-${index}`,
      name: character.name,
      summary: character.summary || '',
      image: null,
      facts: facts(character.facts),
    })),
    location: {
      name: data.location.name,
      facts: facts(data.location.facts),
    },
    environment: {
      name: '장면 공통',
      facts: facts(data.environment.facts, true),
    },
  }
}
