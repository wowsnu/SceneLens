import './StoryboardStripLane.css'

/**
 * 검토 화면의 스토리보드 — 한 줄 스트립.
 *
 * 트랙과 가로축을 공유하려고 한 줄로 둔다 (LENS_TRACKS_UI.md 3장).
 * 편집 화면(GridView)의 감기는 배치는 그대로 두었다 — 거기는 컷 전체를
 * 훑는 자리이고 여기는 sequence를 따라 읽는 자리다.
 *
 * 여기는 **navigation만** 한다. 진단 문장·렌즈 이름·근거는 올리지 않는다
 * (문서 2장). 그것들은 Inspector가 읽는다.
 */
export default function StoryboardStripLane({
  shots = [],
  selectedShotIndex = null,
  highlightRange = null,
  onSelectShot,
  onSelectSeam,
  scrollRef = null,
}) {
  if (shots.length === 0) return null

  const inHighlight = (index) => (
    highlightRange
      && index >= highlightRange.from
      && index <= highlightRange.to
  )

  return (
    <div className="strip-lane-scroll" ref={scrollRef}>
      <div
        className="strip-lane"
        style={{ '--track-count': shots.length }}
        role="list"
        aria-label="스토리보드"
      >
        {/* 라벨 열. 트랙의 렌즈 기호 열과 폭을 맞춰 컷이 같은 자리에서
            시작하게 한다. */}
        <span className="strip-lane-gutter" aria-hidden="true" />

        {shots.map((shot, index) => {
          const selected = index === selectedShotIndex
          const dimmed = highlightRange && !inHighlight(index)
          return (
            <div
              key={shot?.id || index}
              className={`strip-cell ${selected ? 'selected' : ''} ${dimmed ? 'dimmed' : ''}`}
              role="listitem"
            >
              <button
                type="button"
                className="strip-cell-btn"
                onClick={() => onSelectShot?.(index)}
                aria-pressed={selected}
                title={shot?.content || `S${index + 1}`}
              >
                <span className="strip-cell-frame">
                  {shot?.image
                    ? <img src={shot.image} alt="" loading="lazy" />
                    : <span className="strip-cell-empty" aria-hidden="true" />}
                </span>
                <span className="strip-cell-id">S{index + 1}</span>
              </button>

              {/* 이음새. 컷 사이를 직접 고를 수 있어야 트랙의 seam
                  마커와 같은 대상을 가리킨다. */}
              {index < shots.length - 1 && (
                <button
                  type="button"
                  className="strip-seam"
                  onClick={() => onSelectSeam?.(index)}
                  title={`S${index + 1} → S${index + 2} 사이`}
                  aria-label={`S${index + 1}과 S${index + 2} 사이`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
