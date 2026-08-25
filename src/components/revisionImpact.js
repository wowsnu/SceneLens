import { editingActionFor } from './seamAction'

/**
 * 이 수정이 무엇을 바꾸는가. 적용 **전에** 보여 준다.
 *
 * 감독이 수정안을 고를 때 아는 것은 그 수정안의 문장뿐이다. 컷이 하나
 * 늘어나면 뒤 번호가 다 밀리고, 그 자리를 다른 렌즈가 이미 짚어 두었을
 * 수도 있다 — 적용하고 나서야 알게 되면 되돌리는 수밖에 없다.
 *
 * 판정은 하지 않는다. "이것을 바꾸면 저것도 달라진다"까지만 말하고,
 * 그래도 할지는 감독이 정한다 (`design_goal.md` DG1 P2).
 */

// 구조를 바꾸는 연산이 컷 수를 어떻게 바꾸는가.
const CUT_COUNT_DELTA = {
  insert: +1,
  split: +1,
  merge: -1,
  delete: -1,
}

const OPERATION_LABELS = {
  insert: '컷 넣기',
  split: '컷 나누기',
  merge: '컷 합치기',
  delete: '컷 빼기',
  seam: '이음새 조정',
}

const LENS_LABELS = { mise: '미장센', camera: '촬영', editing: '편집' }

// 앵커에서 컷 번호를 뽑는다. 백엔드 `_anchor_for`와 같은 형식이다.
const panelNumbers = (anchor) => (
  (anchor || '').match(/S(\d+)/g) || []
).map((token) => Number(token.slice(1)))

/**
 * @param alternative 고른 수정안
 * @param issue 지금 보고 있는 Issue
 * @param issues 이 검토의 전체 Issue (다른 자리에 걸린 것을 찾는 데 쓴다)
 * @param shotCount 지금 컷 수
 * @returns {{ operation, lines, warnings }} 없으면 null
 */
export function revisionImpact(alternative, issue, issues = [], shotCount = 0) {
  if (!alternative) return null

  const operation = editingActionFor(alternative).id
  const delta = CUT_COUNT_DELTA[operation] || 0
  const anchorNumbers = panelNumbers(issue?.anchor)
  const lines = []
  const warnings = []

  // 1. 컷 수가 달라지는가.
  if (delta !== 0 && shotCount > 0) {
    lines.push({
      label: '컷 수',
      detail: `${shotCount} → ${shotCount + delta}`,
    })

    // 2. 뒤 컷의 번호가 밀린다. 감독이 기억해 둔 `S7`이 다른 컷이 된다.
    const from = operation === 'merge' || operation === 'delete'
      ? Math.min(...anchorNumbers)
      : Math.max(...anchorNumbers)
    if (Number.isFinite(from) && from < shotCount) {
      const start = delta > 0 ? from + 1 : from
      if (start <= shotCount) {
        lines.push({
          label: '번호 밀림',
          detail: `S${start} 이후가 한 칸씩 ${delta > 0 ? '뒤로' : '앞으로'}`,
        })
      }
    }
  }

  // 3. 이 수정이 닿는 자리에 다른 검토가 걸려 있는가.
  //
  // 컷을 넣거나 빼면 그 뒤의 이음새가 전부 달라진다. 편집이 짚어 둔
  // S5→S6 문제가 여전히 유효한지 감독은 알 수 없다 — 다시 봐야 한다고
  // 말해 준다. 자동으로 지우거나 다시 돌리지는 않는다.
  if (delta !== 0 && anchorNumbers.length > 0) {
    const boundary = Math.min(...anchorNumbers)
    const affected = issues.filter((entry) => {
      if (entry.id === issue?.id) return false
      const numbers = panelNumbers(entry.anchor)
      return numbers.some((number) => number >= boundary)
    })
    if (affected.length > 0) {
      const names = affected.slice(0, 3).map((entry) => {
        const lenses = (entry.lenses || [])
          .map((id) => LENS_LABELS[id] || id)
          .join('·')
        return `${entry.anchor}${lenses ? ` (${lenses})` : ''}`
      })
      warnings.push({
        text: '이 뒤의 검토를 다시 봐야 합니다',
        items: names,
        more: affected.length - names.length,
      })
    }
  }

  // 4. 컷 값이 바뀌는 수정안(patch)은 무엇이 달라지는지 그대로 적는다.
  const patch = alternative.patch || {}
  const PATCH_LABELS = { shot_size: '샷 크기', angle: '앵글', move: '카메라 움직임' }
  Object.entries(patch).forEach(([key, value]) => {
    if (!value) return
    lines.push({ label: PATCH_LABELS[key] || key, detail: `→ ${value}` })
  })

  if (lines.length === 0 && warnings.length === 0) return null
  return { operation, operationLabel: OPERATION_LABELS[operation] || '', lines, warnings }
}
