/**
 * 구조화된 근거를 한 줄로 요약한다.
 *
 * Workbench는 각 렌즈의 판단 바로 아래에 근거를 **짧게** 보인다
 * (`LENS_TRACKS_UI.md` 4장):
 *
 *   미장센   인물의 위치가 크게 변합니다.
 *            근거: S2 왼쪽 → S3 오른쪽
 *
 * 문장을 통째로 늘어놓으면 카드 세 장을 읽는 옛 화면으로 돌아간다.
 * 여기서는 **무엇이 어떻게 달라졌는지**만 남긴다.
 *
 * 그림 표시(overlay)는 이것과 별개다. 좌표가 없거나 틀려도 이 한 줄은
 * 나와야 한다 — text first (문서 4장).
 */

// 화면 가로 위치를 사람 말로. 박스 중심이 어디에 있는가.
const sideOf = (region) => {
  const center = region.x + region.w / 2
  if (center < 0.38) return '왼쪽'
  if (center > 0.62) return '오른쪽'
  return '가운데'
}

const FACING_LABELS = {
  left: '왼쪽을 봄',
  right: '오른쪽을 봄',
  up: '위를 봄',
  down: '아래를 봄',
  'toward-camera': '정면을 봄',
  away: '뒤를 봄',
}

/**
 * 근거 하나를 `{ label, detail }`로 만든다.
 * label은 무엇에 관한 것인지, detail은 어떻게 달라졌는지.
 */
export function summarizeEvidence(evidence) {
  if (!evidence) return null

  // 값의 변화. 모델이 attribute/before/after를 채운 경우다.
  if (evidence.kind === 'attribute' && evidence.before && evidence.after) {
    return {
      label: evidence.attribute || '값',
      detail: `${evidence.before} → ${evidence.after}`,
    }
  }

  const regions = evidence.regions || []

  // 두 컷을 잇는 근거. 같은 대상이 두 컷에서 어떻게 달라졌는가 —
  // 이 연구가 가장 필요로 하는 종류다 (문서 4장).
  if (evidence.kind === 'relation' && regions.length >= 2) {
    const [from, to] = regions
    // 방향이 있으면 그것이 더 정확한 근거다. 위치가 같아도 방향이
    // 뒤집히면 화면 방향이 끊긴 것이고, 그건 위치로는 안 보인다.
    if (from.facing && to.facing && from.facing !== to.facing) {
      return {
        label: from.label || '방향',
        detail: `${from.panel} ${FACING_LABELS[from.facing] || from.facing}`
          + ` → ${to.panel} ${FACING_LABELS[to.facing] || to.facing}`,
      }
    }
    const fromSide = sideOf(from)
    const toSide = sideOf(to)
    if (fromSide !== toSide) {
      return {
        label: from.label || '위치',
        detail: `${from.panel} ${fromSide} → ${to.panel} ${toSide}`,
      }
    }
    // 자리도 방향도 같으면 무엇이 달라졌는지 좌표로는 말할 수 없다.
    // 그때는 대상 이름만 남기고 판단은 문장에 맡긴다.
    return {
      label: from.label || '두 컷',
      detail: `${from.panel} → ${to.panel}`,
    }
  }

  // 한 자리를 가리키는 근거.
  if (regions.length >= 1) {
    const region = regions[0]
    const facing = region.facing ? `, ${FACING_LABELS[region.facing] || region.facing}` : ''
    return {
      label: region.label || '위치',
      detail: `${region.panel} ${sideOf(region)}${facing}`,
    }
  }

  return null
}

/**
 * 진단 하나에서 보일 근거 한 줄을 고른다.
 *
 * 구조화된 것이 있으면 그것을, 없으면 기존 evidence 문장을 쓴다.
 * **근거가 통째로 사라지는 경우는 없어야 한다** (문서 4장 text first).
 */
export function evidenceLineFor(diagnosis) {
  if (!diagnosis) return null

  for (const evidence of diagnosis.visual_evidence || []) {
    const summary = summarizeEvidence(evidence)
    if (summary) return summary
  }

  // 구조화가 없거나 좌표가 걸러진 경우. 문장은 남아 있다.
  const fallback = (diagnosis.visual_evidence || [])[0]?.reading
    || (diagnosis.evidence || [])[0]
  return fallback ? { label: '', detail: fallback } : null
}

/**
 * 그림 위에 그릴 표시를 패널별로 모은다.
 *
 * confidence가 낮아 방향이 지워진 상자도 위치는 쓸모 있으므로 남긴다
 * (백엔드에서 이미 걸러진 상태로 온다).
 */
export function overlaysFor(diagnosis, panelId) {
  if (!diagnosis || !panelId) return []
  return (diagnosis.visual_evidence || []).flatMap((evidence) => (
    (evidence.regions || [])
      .filter((region) => region.panel === panelId)
      .map((region) => ({ ...region, kind: evidence.kind, reading: evidence.reading }))
  ))
}
