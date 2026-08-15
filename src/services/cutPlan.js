// 컷 플랜 응답을 스토어가 쓰는 형태로 옮긴다.
// api.js에서 떼어낸 이유: 그 파일은 import.meta.env를 읽어 node에서 로드되지
// 않는다. 변환 규칙은 검증할 수 있어야 한다.
//
// 모델은 컷을 순서대로 돌려주고 어느 Beat에 속하는지만 밝힌다.
// order와 beatOrder는 여기서 매긴다 — 번호는 표현이지 모델이 정할 것이 아니다.
export function toCutPlanItems(data, { time = '', place = '' } = {}) {
  const perBeat = new Map()

  return data.cuts.map((cut, index) => {
    const beat = cut.beat ?? 0
    const beatOrder = (perBeat.get(beat) ?? 0) + 1
    perBeat.set(beat, beatOrder)

    return {
      beat,
      order: index + 1,
      beatOrder,
      // 시간·장소는 컷 플랜이 화면 단서에서 판단한다. 이전 응답이나
      // 규칙 기반 초안에는 없을 수 있어, 그때만 씬의 보완값을 쓴다.
      time: cut.time || time,
      place: cut.place || place,
      content: cut.content,
      purpose: cut.purpose,
      characters: cut.characters || '',
      // 샷은 촬영이 정한다. 여기서는 비워 둔다.
      shotSize: '',
      angle: '',
      cameraMove: '',
    }
  })
}
