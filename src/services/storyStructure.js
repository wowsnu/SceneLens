// 씬·비트 구조 응답을 화면이 쓰는 형태로 옮긴다.
// api.js에서 떼어낸 이유: 그 파일은 import.meta.env를 읽어 node에서 로드되지
// 않는다. 변환 규칙은 검증할 수 있어야 한다.

// 응답 → 화면이 쓰는 형태. 순수 함수로 떼어 두어야 검증할 수 있다 —
// api.js 전체는 import.meta.env 때문에 node에서 로드되지 않는다.
export function toStructureDraft(data, story = '') {
  const screenplay = []
  let beat = 0
  data.scenes.forEach((scene) => {
    // 헤딩은 씬의 이름표이지 국면이 아니다. 자기 Beat를 주면 Beat 01이
    // 이름표만 들고 있게 되고 실제 첫 국면이 Beat 02가 된다.
    // 첫 Beat 안에 넣는다 — 씬은 헤딩으로 구분되므로 이것으로 충분하다.
    screenplay.push({ type: 'scene-heading', text: scene.heading, beat })
    scene.beats.forEach((entry, index) => {
      // 첫 Beat는 헤딩과 같은 번호를 쓰고, 그 뒤부터 하나씩 올린다.
      if (index > 0) beat += 1
      entry.lines.forEach((line) => {
        // filled는 AI가 채운 줄이라는 표시다. 사용자가 자기가 쓰지 않은
        // 것을 알아보고 지울 수 있어야 한다 (DG1 P2).
        screenplay.push({ type: 'action', text: line.text, beat, filled: line.filled })
      })
    })
    beat += 1
  })

  return {
    id: `story-structure-${Date.now()}`,
    screenplay,
    sceneCount: data.scenes.length,
    beatCount: new Set(screenplay.map((line) => line.beat)).size,
    sourceCount: story.split(/(?<=[.!?。])\s+/).filter((s) => s.trim()).length,
    // AI가 채운 줄 수. 사용자가 검토할 분량을 미리 안다.
    filledCount: screenplay.filter((line) => line.filled).length,
  }
}
