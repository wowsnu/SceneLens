// 제안 응답을 화면이 쓰는 형태로 옮긴다.
// api.js에서 떼어낸 이유: 그 파일은 import.meta.env를 읽어 node에서 로드되지
// 않는다. 변환 규칙은 검증할 수 있어야 한다.
//
// 모델은 Beat 안에서의 줄 번호(line_index)를 돌려준다. 화면은 대본 전체
// 기준의 globalIdx를 쓰므로 여기서 옮긴다 — 그러지 않으면 제안이 엉뚱한
// 줄에 붙는다.
export function toNarrativeSuggestions(data, { beatElements, targetBeat, requestKey }) {
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
      return {
        ...base,
        insertAfterIndex: anchor?.globalIdx ?? 0,
        proposedText: item.proposed_text,
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

    return { ...base, targetCount: item.target_count }
  }).filter((suggestion) => (
    // 붙일 자리를 못 찾은 제안은 버린다. 엉뚱한 줄에 붙는 것보다 낫다.
    suggestion.elementIndex !== undefined
    || suggestion.insertAfterIndex !== undefined
    || suggestion.targetCount > 0
  ))
}

const ACTION_LABEL = {
  'split-beat': 'Split beat',
  'insert-script-line': 'Insert line',
  'replace-script-line': 'Replace line',
  'panel-count': 'Add panels',
}
