// CLI의 command history처럼 보낸 요청을 ↑/↓로 다시 꺼낸다. 한 화면 안에
// 여러 요청칸이 있을 수 있으므로 historyKey별로 기록·현재 위치·작성 중 초안을
// 따로 둔다.
//
// 컴포넌트가 닫혔다 다시 열려도 같은 작업 세션 안에서는 기록이 남아야 하므로
// 모듈 한 벌로 둔다. 브라우저를 새로고침하면 비워지는 세션 기록이다.
const histories = new Map()
const indices = new Map()
const drafts = new Map()

export default function useRequestHistory({ historyKey, setValue, limit = 50 }) {
  const record = (request) => {
    const normalized = (request || '').trim()
    if (!normalized) return
    const entries = histories.get(historyKey) || []
    if (entries[entries.length - 1] !== normalized) {
      histories.set(historyKey, [...entries, normalized].slice(-limit))
    }
    indices.delete(historyKey)
    drafts.set(historyKey, '')
  }

  const resetNavigation = (nextValue = '') => {
    indices.delete(historyKey)
    // 기록을 꺼내 DOM에 반영하는 과정에서 change가 뒤늦게 와도, 방금 꺼낸
    // 기록을 '작성 중 초안'으로 덮어쓰지 않는다.
    const entries = histories.get(historyKey) || []
    if (!entries.includes(nextValue)) drafts.set(historyKey, nextValue)
  }

  const onKeyDown = (event) => {
    const history = histories.get(historyKey) || []
    if (history.length === 0) return
    // React가 직전 입력을 아직 다시 그리기 전이어도 현재 textarea의 값을
    // 써야 한다. 캡처된 value를 쓰면 빠른 ↑→↓에서 이전 초안을 잘못 기억한다.
    const currentValue = event.currentTarget.value
    // 제어 textarea가 다시 그려지는 사이 index가 초기화돼도, 화면 값이 기록과
    // 같으면 그 위치를 복구한다.
    const rememberedIndex = history.lastIndexOf(currentValue)
    const index = indices.has(historyKey)
      ? indices.get(historyKey)
      : (rememberedIndex >= 0 ? rememberedIndex : null)
    const browsing = index !== null
    const selectionStart = event.currentTarget.selectionStart ?? 0
    const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart
    // 요청칸은 textarea라 Home을 먼저 누르게 만들면 CLI보다 번거롭다.
    // 한 줄 요청은 커서 위치와 무관하게, 여러 줄 요청은 첫 줄에 있을 때
    // ↑를 기록 탐색으로 쓴다. 나머지 줄에서는 본래 커서 이동을 유지한다.
    const onFirstLine = selectionStart === selectionEnd
      && !currentValue.slice(0, selectionStart).includes('\n')

    if (event.key === 'ArrowUp' && (browsing || !currentValue || onFirstLine)) {
      event.preventDefault()
      if (!browsing) drafts.set(historyKey, currentValue)
      const nextIndex = browsing ? Math.max(0, index - 1) : history.length - 1
      indices.set(historyKey, nextIndex)
      setValue(history[nextIndex])
      return
    }

    if (event.key === 'ArrowDown' && browsing) {
      event.preventDefault()
      if (index < history.length - 1) {
        const nextIndex = index + 1
        indices.set(historyKey, nextIndex)
        setValue(history[nextIndex])
      } else {
        indices.delete(historyKey)
        setValue(drafts.get(historyKey) || '')
      }
    }
  }

  return { onKeyDown, record, resetNavigation }
}
