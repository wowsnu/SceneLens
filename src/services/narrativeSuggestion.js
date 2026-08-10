// 제안 응답을 화면이 쓰는 형태로 옮긴다.
// api.js에서 떼어낸 이유: 그 파일은 import.meta.env를 읽어 node에서 로드되지
// 않는다. 변환 규칙은 검증할 수 있어야 한다.
//
// 모델은 Beat 안에서의 줄 번호(line_index)를 돌려준다. 화면은 대본 전체
// 기준의 globalIdx를 쓰므로 여기서 옮긴다 — 그러지 않으면 제안이 엉뚱한
// 줄에 붙는다.
export function toNarrativeSuggestions(data, { beatElements, targetBeat, requestKey }) {
  // 같은 자리에 여러 줄을 넣을 때 순서를 지킨다. 모델이 line_index를
  // 1,2,3으로 주더라도 줄이 하나뿐이면 셋 다 마지막 줄로 떨어지는데,
  // 그대로 두면 나중 제안이 먼저 삽입돼 순서가 뒤집힌다.
  const insertOffsets = new Map()

  return data.suggestions.map((item, index) => {
    const anchor = beatElements[item.line_index] ?? beatElements[beatElements.length - 1]
    const base = {
      id: `narrative-${requestKey}-${item.type}-${targetBeat}-${index}`,
      type: item.type,
      beat: targetBeat,
      title: item.title,
      reason: item.reason,
      actionLabel: ACTION_LABEL[item.type] || 'Apply',
    }

    if (item.type === 'split-beat') {
      // 이 줄부터 새 Beat다. 첫 줄을 가리키면 나눌 것이 없다.
      const at = Math.max(1, item.line_index)
      return { ...base, elementIndex: beatElements[at]?.globalIdx ?? anchor?.globalIdx }
    }

    if (item.type === 'insert-script-line') {
      // 앞선 제안이 이미 이 자리를 쓰면 한 칸씩 뒤로 민다.
      const at = anchor?.globalIdx ?? 0
      const offset = insertOffsets.get(at) ?? 0
      insertOffsets.set(at, offset + 1)
      return {
        ...base,
        insertAfterIndex: at + offset,
        proposedText: item.proposed_text,
        // 수락 핸들러가 이 객체를 그대로 대본에 끼워 넣는다.
        // 없으면 undefined가 들어가 대본이 깨진다.
        newElement: { type: 'action', text: item.proposed_text, beat: targetBeat },
      }
    }

    if (item.type === 'replace-script-line') {
      return {
        ...base,
        elementIndex: anchor?.globalIdx ?? 0,
        originalText: item.original_text || anchor?.text || '',
        proposedText: item.proposed_text,
      }
    }

    return null
  }).filter((suggestion) => (
    // 붙일 자리를 못 찾은 제안은 버린다. 엉뚱한 줄에 붙는 것보다 낫다.
    suggestion !== null
    && (suggestion.elementIndex !== undefined || suggestion.insertAfterIndex !== undefined)
  ))
}

const ACTION_LABEL = {
  'split-beat': 'Split beat',
  'insert-script-line': 'Insert line',
  'replace-script-line': 'Replace line',
}
