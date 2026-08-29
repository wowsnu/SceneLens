/**
 * 구조화된 근거를 한 줄로 요약한다.
 *
 * Workbench는 각 렌즈의 판단 바로 아래에 근거를 **짧게** 보인다
 * (`LENS_TRACKS_UI.md` 4장):
 *
 *   미장센   인물의 위치가 크게 변합니다.
 *            근거: 인물 · S2에서 보인 요소가 S3에서도 계속 보입니다
 *
 * 문장을 통째로 늘어놓으면 카드 세 장을 읽는 옛 화면으로 돌아간다.
 * 여기서는 **무엇이 어떻게 달라졌는지**만 남긴다.
 *
 * 그림 표시(overlay)는 이것과 별개다. 좌표가 없거나 틀려도 이 한 줄은
 * 나와야 한다 — text first (문서 4장).
 */

// 패널 id(`S3`, 또는 shot.id)를 shots 배열의 인덱스로 바꾼다.
// EvidenceStage(근거 표시)와 DecisionBoard(다른 렌즈로 검토하기가
// Issue의 anchor를 검토 범위에 포함시키는 계산) 둘 다 같은 변환이
// 필요해서 공유 유틸로 둔다 — 컴포넌트 파일에 두면 Fast refresh가
// 컴포넌트 외의 export를 허용하지 않는다.
export const panelIndexOf = (panelId, shots) => {
  const match = /^S(\d+)$/.exec(panelId)
  if (match) return Number(match[1]) - 1
  return shots.findIndex((shot) => String(shot?.id) === panelId)
}

/**
 * 근거 하나를 `{ label, detail }`로 만든다.
 * label은 무엇에 관한 것인지, detail은 화면에서 무엇을 확인했는지.
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
    // 모델이 화면 관계를 문장으로 읽어 냈다면 그것이 가장 구체적인
    // 근거다. 좌표를 사람이 읽는 문장으로 억지 변환하지 않는다.
    const reading = evidence.reading?.trim()
    if (reading) {
      return {
        label: from.label || to.label || '화면 요소',
        detail: reading,
      }
    }
    // 좌표와 시선 방향(`S2 정면을 봄 → S3 오른쪽을 봄`)은 모델의
    // 내부 표시 방식이라, 감독에게는 무엇이 근거인지 오히려 흐린다.
    // 그림의 상자가 이미 위치를 보여 주므로 여기서는 같은 요소가 두
    // 컷에서 어떻게 이어지는지만 자연어로 적는다.
    return {
      label: from.label || to.label || '화면 요소',
      detail: `${from.panel}에서 보인 요소가 ${to.panel}에서도 계속 보입니다`,
    }
  }

  // 한 자리를 가리키는 근거.
  if (regions.length >= 1) {
    const region = regions[0]
    const reading = evidence.reading?.trim()
    return {
      label: region.label || '화면 요소',
      detail: reading || `${region.panel}에서 확인됩니다`,
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
// 앵커에서 볼 패널을 뽑는다. 백엔드 `_anchor_for`가 만든 형식이다.
export function panelsOf(anchor) {
  return (anchor || '')
    .split(/[→–·]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
}

/* 이 진단이 그림 위에 실제로 그릴 표시를 갖고 있는가.
 *
 * 없는 경우가 셋이다. 값의 문제라 상자로 칠 수 없거나(`kind: attribute` —
 * 샷 크기·앵글), 모델이 자리를 짚지 못했거나, 표시 기능 이전에 받은
 * 결과이거나. 어느 쪽이든 그림에는 아무것도 안 얹힌다.
 *
 * 렌즈를 고르는 카드와 그림이 이 값을 함께 본다 — 카드가 `그림에 표시 중`
 * 이라고 하는데 그림이 비어 있으면 둘이 서로 반대로 읽힌다.
 */
export function hasOverlay(diagnosis, anchor) {
  return panelsOf(anchor).some((panelId) => overlaysFor(diagnosis, panelId).length > 0)
}

export function overlaysFor(diagnosis, panelId) {
  if (!diagnosis || !panelId) return []
  return (diagnosis.visual_evidence || []).flatMap((evidence) => (
    (evidence.regions || [])
      .filter((region) => region.panel === panelId)
      .map((region) => ({ ...region, kind: evidence.kind, reading: evidence.reading }))
  ))
}
