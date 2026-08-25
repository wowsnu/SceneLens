import { overlaysFor } from './evidenceSummary'
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

// 앵커에서 볼 패널을 뽑는다. 백엔드 `_anchor_for`가 만든 형식이다.
const panelsOf = (anchor) => (
  (anchor || '')
    .split(/[→–·]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
)

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
    <span className="evidence-box" style={style}>
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
}) {
  const panelIds = panelsOf(issue?.anchor)
  if (panelIds.length === 0) return null

  // 앵커의 `S2`는 스토리보드 순번이다. 컷 목록에서 그 자리를 찾는다.
  const shotFor = (panelId) => {
    const match = /^S(\d+)$/.exec(panelId)
    if (match) return shots[Number(match[1]) - 1] || null
    return shots.find((shot) => String(shot?.id) === panelId) || null
  }

  return (
    <div className={`evidence-stage lens-${lensId || 'none'}`}>
      <div className="evidence-stage-frames">
        {panelIds.map((panelId, index) => {
          const shot = shotFor(panelId)
          const regions = overlaysFor(diagnosis, panelId)
          return (
            <div key={panelId} className="evidence-frame-slot">
              {index > 0 && (
                <span className="evidence-arrow" aria-hidden="true">→</span>
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
                </span>
              </figure>
            </div>
          )
        })}
      </div>

    </div>
  )
}
