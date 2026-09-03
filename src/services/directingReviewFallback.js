/**
 * 다중 연출 검토가 비어 끝날 때만 감독에게 남길 공통 확인 항목.
 *
 * 결함을 지어내지 않고, 다음 검토에서 장면 목표와 화면을 대조할 수 있는
 * 기준을 받는다. 이 함수를 분리해 빈 결과의 fallback을 UI와 독립적으로
 * 검증할 수 있게 둔다.
 */
export const emptyMultiReviewQuestion = ({ panels = [], requestId, lenses = [] }) => ({
  id: `review-${requestId}-coverage`,
  prompt: panels.length > 1
    ? `이 ${panels.length}개 컷을 본 관객이 순서대로 반드시 알아야 하는 정보나 관계는 무엇인가요?`
    : '이 컷에서 관객이 반드시 먼저 알아야 하는 인물, 행동, 또는 정보는 무엇인가요?',
  level: panels.length > 1 ? 'scene_structure' : 'attribute',
  targets: panels.map((panel) => panel.id),
  lenses,
})
