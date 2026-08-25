/**
 * 이음새에서 무엇을 하는 선택지인가.
 *
 * 두 곳이 이 판정을 쓴다 — `RevisionWorkspace`는 캔버스 모양을 바꾸고,
 * `DecisionBoard`는 실제 도구를 연다. 규칙이 두 벌이면 화면에 `병합`이라
 * 그려 놓고 분할 창이 열리는 식으로 갈리므로 한 곳에 둔다.
 *
 * 모델이 주는 선택지에는 도구 이름이 없다. 문장에서 읽어 내는 수밖에
 * 없고, 못 읽으면 `seam`(그 자리를 열어 감독이 정하게)으로 둔다.
 */
export const editingActionFor = (alternative) => {
  const text = `${alternative?.label || ''} ${alternative?.effect || ''}`.toLowerCase()
  if (/(삭제|제거|빼기|delete|remove|omit|drop)/.test(text)) return { id: 'delete', label: '이 패널 삭제' }
  if (/(분할|나누기|쪼개|split|divide|break)/.test(text)) return { id: 'split', label: '이음새에서 분할' }
  if (/(삽입|추가|넣기|insert|add|reaction shot|bridge shot|insert shot)/.test(text)) return { id: 'insert', label: '이음새에 삽입' }
  if (/(병합|합치|merge|combine|condense)/.test(text)) return { id: 'merge', label: '앞 컷과 병합' }
  return { id: 'seam', label: '이음새에서 조정' }
}
