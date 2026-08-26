import { overlaysFor, panelsOf, hasOverlay } from './evidenceSummary'
import './EvidenceStage.css'

/**
 * Issue가 걸린 컷들을 보여주고, 그 위에 선택한 렌즈의 표시를 얹는다.
 *
 * **그림은 그대로 있고 표시만 바뀐다** (`LENS_TRACKS_UI.md` 4장). 렌즈를
 * 옮겨도 같은 두 장을 보고 있어야, 같은 화면을 다르게 읽는다는 것이
 * 화면에서 드러난다.
 *
 * 표시가 없어도 이 자리는 성립한다 — 그림 두 장과 근거 한 줄은 남는다.
 */

// 두 컷이 이어지는 관계인가. 이음새(`→`)와 범위(`–`)만 그렇다.
// `·`는 나란하지 않은 별개의 컷들을 묶은 것이다.
const isSequential = (anchor) => /[→–]/.test(anchor || '')

// 펼친 이음새가 지금 무슨 조작인지. 캔버스가 그리는 구조와 실제로 열리는
// 도구가 갈리면 안 되므로 이름은 도구가 쓰는 것과 같게 둔다.
const SEAM_OP_LABELS = {
  insert: '새 컷 넣기',
  split: '컷 나누기',
  merge: '두 컷 합치기',
  delete: '컷 빼기',
  seam: '이음새 조정',
}

const panelIndexOf = (panelId, shots) => {
  const match = /^S(\d+)$/.exec(panelId)
  if (match) return Number(match[1]) - 1
  return shots.findIndex((shot) => String(shot?.id) === panelId)
}

// Issue가 무엇을 가리키는지에 따라, 같은 스토리보드를 최소 단위로 다시
// 놓는다. 렌즈는 이 배치를 바꾸지 않고 표시와 읽기만 바꾼다.
//
// 앞뒤 컷은 **검토 범위 안에서만** 가져온다. 범위가 S1–S4인데 S4가
// 대상이면 S5를 끌어오게 되는데, 그 컷은 감독이 지금 보고 있는 것도
// 아니고 아직 안 그려졌을 수도 있다 — 빈 자리가 근거인 것처럼 보인다.
// 한쪽 끝이면 반대쪽만 붙인다.
const framesFor = (issue, anchorPanels, shots, range) => {
  if (issue?.anchor_kind !== 'shot' || anchorPanels.length !== 1) {
    return anchorPanels.map((id) => ({ id, role: 'focus' }))
  }

  const targetIndex = panelIndexOf(anchorPanels[0], shots)
  if (targetIndex < 0) return [{ id: anchorPanels[0], role: 'focus' }]

  // 범위를 안 받았으면 전체를 범위로 본다.
  const from = Number.isInteger(range?.from) ? Math.max(0, range.from) : 0
  const to = Number.isInteger(range?.to)
    ? Math.min(range.to, shots.length - 1)
    : shots.length - 1

  return [
    targetIndex > from && { id: `S${targetIndex}`, role: 'context' },
    { id: anchorPanels[0], role: 'focus' },
    targetIndex < to && { id: `S${targetIndex + 2}`, role: 'context' },
  ].filter(Boolean)
}

function Overlay({ region }) {
  // 좌표는 정규화되어 있으므로 퍼센트로 그대로 옮긴다. 그림이 어떤
  // 크기로 보이든 같은 자리에 온다.
  const style = {
    left: `${region.x * 100}%`,
    top: `${region.y * 100}%`,
    width: `${region.w * 100}%`,
    height: `${region.h * 100}%`,
  }
  return (
    <span
      className={`evidence-box ${region.y < 0.08 ? 'at-top' : ''}`}
      style={style}
    >
      <span className="evidence-box-label">{region.label}</span>
      {region.facing && (
        <span className={`evidence-facing facing-${region.facing}`} aria-hidden="true" />
      )}
    </span>
  )
}

export default function EvidenceStage({
  issue,
  diagnosis,
  shots = [],
  lensId,
  // 지금 검토 중인 범위. 앞뒤 컷을 이 안에서만 가져온다.
  range = null,
  // 이음새 자리에서 펼쳐진 편집기. 있으면 두 컷 사이가 넓어지며 그
  // 안으로 들어간다 — 기존 시퀀스가 그대로 캔버스이고, 고칠 자리는
  // 두 컷 사이 그대로다 (`LENS_TRACKS_UI.md` 5장).
  seamEditor = null,
  // 이 이음새에서 지금 무슨 조작을 고르고 있는가.
  // `insert` | `split` | `merge` | `delete` | null
  seamOperation = null,
  // 빠지는 컷. 무엇이 사라지는지 그 컷 위에 표시한다 — 미리 지워서
  // 보여주면 무엇이 없어지는지 확인할 수 없다.
  removingPanel = null,
}) {
  const anchorPanels = panelsOf(issue?.anchor)
  if (anchorPanels.length === 0) return null
  const frames = framesFor(issue, anchorPanels, shots, range)

  // 앵커의 `S2`는 스토리보드 순번이다. 컷 목록에서 그 자리를 찾는다.
  const shotFor = (panelId) => {
    const match = /^S(\d+)$/.exec(panelId)
    if (match) return shots[Number(match[1]) - 1] || null
    return shots.find((shot) => String(shot?.id) === panelId) || null
  }

  // 이 진단이 그림에서 가리키는 자리가 하나라도 있는가. 없으면 그림만
  // 나오는데, 그것이 "표시가 없는 근거"인지 "덜 받은 데이터"인지
  // 감독은 구분할 수 없다 — 조용히 비워 두지 않는다.
  const hasAnyRegion = hasOverlay(diagnosis, issue?.anchor)

  // 편집기가 들어갈 슬롯이 실제로 있는가. 대상 컷이 이 무대의 첫 칸이면
  // (앞 컷이 범위 밖이라 안 붙었다) 사이가 없다 — 그때는 무대 아래에
  // 편다. 자리가 없다고 편집기를 통째로 잃는 편이 더 나쁘다.
  const seamHostIndex = frames.findIndex(({ role }, index) => (
    issue?.anchor_kind === 'seam' ? index === 1 : role === 'focus' && index > 0
  ))
  const seamBelowStage = Boolean(seamEditor) && seamHostIndex < 0

  return (
    <div className={[
      'evidence-stage',
      `evidence-stage-${issue?.anchor_kind || 'shot'}`,
      `lens-${lensId || 'none'}`,
      seamEditor && 'evidence-stage-seam-open',
      seamOperation && `evidence-seam-op-${seamOperation}`,
    ].filter(Boolean).join(' ')}>
      <div className="evidence-stage-frames" aria-label={`${issue?.anchor || ''} 주변 스토리보드`}>
        {frames.map(({ id: panelId, role }, index) => {
          const shot = shotFor(panelId)
          const regions = overlaysFor(diagnosis, panelId)
          const isSeam = issue?.anchor_kind === 'seam' && index === 1
          // 단일 Shot Issue도 앞·대상·뒤 컷을 순서대로 놓는다. 앵커가
          // `S4` 하나라 해도 이 문맥 패널들은 실제로 이어진 컷이므로
          // 가운데 점이 아니라 화살표로 읽혀야 한다.
          const followsSequence = isSequential(issue?.anchor)
            || (issue?.anchor_kind === 'shot' && frames.length > 1)
          // 이 자리가 지금 펼쳐져 있는가. 펼쳐지면 화살표 자리가 실제
          // 슬롯으로 넓어지고 그 안에서 편집한다 — 두 컷은 그 자리에
          // 그대로 있고, 사이가 벌어질 뿐이다.
          const seamOpen = Boolean(seamEditor) && index === seamHostIndex
          // 빠지는 컷. 취소선과 마스크로 덮되 지우지는 않는다 — 무엇이
          // 사라지는지 보고 판정해야 한다.
          const isRemoving = removingPanel === panelId
          return (
            <div
              key={panelId}
              className={[
                'evidence-frame-slot',
                `evidence-frame-${role}`,
                seamOpen && 'evidence-frame-slot-seam-open',
                isRemoving && 'evidence-frame-removing',
              ].filter(Boolean).join(' ')}
            >
              {index > 0 && (
                seamOpen ? (
                  // 펼친 이음새. 두 컷 사이에 실제 작업 자리가 열린다
                  // (LENS_TRACKS_UI.md 5장 — 시퀀스가 곧 캔버스다).
                  <div className="evidence-seam-slot" aria-label={`${issue?.anchor || '이음새'} 편집`}>
                    <span className="evidence-seam-slot-head">
                      <small>{issue?.anchor || '이음새'}</small>
                      {SEAM_OP_LABELS[seamOperation] && <b>{SEAM_OP_LABELS[seamOperation]}</b>}
                    </span>
                    <div className="evidence-seam-slot-body">{seamEditor}</div>
                  </div>
                ) : (
                  <span className={`evidence-arrow ${isSeam ? 'evidence-seam-arrow' : ''}`} aria-hidden="true">
                    {/* 이음새면 어느 사이인지 적는다. `이음새`만 있으면
                        어느 자리를 고치는 것인지 카드 제목을 다시 봐야 한다. */}
                    {isSeam && <small>{issue?.anchor || '이음새'}</small>}
                    {/* 이어지는 두 컷일 때만 화살표다. `·`로 묶인 앵커는
                        나란하지 않은 별개의 컷들이라, 화살표를 그리면
                        있지도 않은 순서를 말하게 된다. */}
                    {followsSequence ? '→' : '·'}
                  </span>
                )
              )}
              <figure className="evidence-frame">
                <span className="evidence-frame-image">
                  {/* id도 그림 안에 둔다. 밖에 두면 그림이 좁아졌을 때
                      엉뚱한 자리에 뜬다 — 이 상자가 곧 그림이다. */}
                  <span className="evidence-frame-id">{panelId}</span>
                  {shot?.image
                    ? <img src={shot.image} alt="" loading="lazy" />
                    : <span className="evidence-frame-empty" aria-hidden="true" />}
                  {regions.map((region, i) => (
                    <Overlay key={`${region.label}-${i}`} region={region} />
                  ))}
                  {/* 빠지는 컷 위에 그린다. 지우지 않고 덮어서, 무엇이
                      사라지는지 보이게 둔다. */}
                  {isRemoving && (
                    <span className="evidence-frame-remove-mark">
                      <span aria-hidden="true" />
                      <b>빠짐</b>
                    </span>
                  )}
                </span>
              </figure>
            </div>
          )
        })}
      </div>

      {/* 사이에 낄 자리가 없을 때. 대상이 이 무대의 첫 칸이면 앞 컷이
          없어 벌릴 사이가 없다 — 무대 바로 아래에 편다. */}
      {seamBelowStage && (
        <div className="evidence-seam-slot evidence-seam-slot-below" aria-label={`${issue?.anchor || '이음새'} 편집`}>
          <span className="evidence-seam-slot-head">
            <small>{issue?.anchor || '이음새'}</small>
            {SEAM_OP_LABELS[seamOperation] && <b>{SEAM_OP_LABELS[seamOperation]}</b>}
          </span>
          <div className="evidence-seam-slot-body">{seamEditor}</div>
        </div>
      )}

      {/* 표시가 없을 때. 두 경우가 있고 감독에게는 구분되지 않는다 —
          모델이 자리를 짚지 못했거나, 이 결과가 표시를 만들기 전에 받은
          오래된 것이거나. 뒤쪽이면 다시 분석해야 나온다.
          근거 문장은 어느 쪽이든 렌즈 카드에 남아 있다 (text first). */}
      {diagnosis && !hasAnyRegion && (
        <p className="evidence-stage-note">
          {(diagnosis.visual_evidence || []).length > 0
            ? '이 관점은 그림에서 가리킬 자리를 짚지 않았습니다. 아래 근거를 읽어 주세요.'
            : '이 결과에는 그림 표시가 없습니다. 다시 분석하면 표시가 함께 나옵니다.'}
        </p>
      )}
    </div>
  )
}
