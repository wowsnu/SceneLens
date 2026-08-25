import { useCallback, useEffect, useRef } from 'react'
import './StoryboardStripLane.css'

/**
 * 검토 화면의 스토리보드 — 한 줄 스트립.
 *
 * 트랙과 가로축을 공유하려고 한 줄로 둔다 (LENS_TRACKS_UI.md 3장).
 * 편집 화면(GridView)의 감기는 배치는 그대로 두었다 — 거기는 컷 전체를
 * 훑는 자리이고 여기는 sequence를 따라 읽는 자리다.
 *
 * 여기는 **navigation만** 한다. 진단 문장·렌즈 이름·근거는 올리지 않는다
 * (문서 2장). 그것들은 Lens Workbench가 읽는다.
 */
export default function StoryboardStripLane({
  shots = [],
  selectedShotIndex = null,
  highlightRange = null,
  onSelectShot,
  onSelectSeam,
  scrollRef = null,
  onScroll,
  embedded = false,
}) {
  const laneRef = useRef(null)
  // 방금 키로 옮겼는가. 마우스로 고른 뒤에는 포커스를 뺏지 않는다 —
  // 스크롤만 하려던 사람의 포커스가 끌려가면 화면이 튄다.
  const movedByKey = useRef(false)

  const focusCell = useCallback((index) => {
    const lane = laneRef.current
    if (!lane) return
    lane
      .querySelector(`[data-shot-index="${index}"]`)
      ?.focus({ preventScroll: true })
  }, [])

  // 키로 옮긴 뒤에는 그 컷이 포커스를 받아야 다음 화살표가 이어진다.
  // 선택이 바깥에서 바뀐 경우(트랙에서 Issue를 골랐을 때 등)에는
  // 포커스를 옮기지 않는다.
  useEffect(() => {
    if (!movedByKey.current || selectedShotIndex === null) return
    movedByKey.current = false
    focusCell(selectedShotIndex)
  }, [selectedShotIndex, focusCell])

  // 고른 컷이 화면 밖이면 끌어온다. 어느 쪽에서 골랐든(키·마우스·트랙)
  // 지금 보는 컷은 화면에 있어야 한다.
  //
  // scrollIntoView를 쓰지 않는다 — 스트립과 트랙이 스크롤 컨테이너를
  // 공유하게 되면서, 그 호출이 세로 위치까지 건드려 검토 패널 전체가
  // 함께 움직인다. 가로 스크롤만 직접 계산해 옮긴다.
  //
  // 이미 보이는 컷은 움직이지 않는다. 한 칸 옮길 때마다 가운데로 당기면
  // 화면이 매번 흔들려서, 어디까지 훑었는지 감각을 잃는다.
  useEffect(() => {
    if (selectedShotIndex === null || !laneRef.current) return
    const cell = laneRef.current.querySelector(
      `[data-shot-index="${selectedShotIndex}"]`
    )
    if (!cell) return

    // 가로로 스크롤되는 가장 가까운 조상. 스트립 자신일 수도 있고,
    // 트랙과 함께 감싸인 바깥 컨테이너일 수도 있다.
    //
    // 넘침(scrollWidth > clientWidth)만 보면 안 된다 — 테두리나 그림자
    // 때문에 몇 px 넘치는 요소가 걸린다(실제로 .strip-cell이 7px 넘쳐
    // 여기서 멈췄다). overflow가 실제로 스크롤을 만드는지 함께 본다.
    let scroller = cell.parentElement
    while (scroller) {
      const overflowX = getComputedStyle(scroller).overflowX
      const scrolls = overflowX === 'auto' || overflowX === 'scroll'
      if (scrolls && scroller.scrollWidth > scroller.clientWidth) break
      scroller = scroller.parentElement
    }
    if (!scroller) return

    const view = scroller.getBoundingClientRect()
    const box = cell.getBoundingClientRect()
    // 컷이 잘리지 않게 약간의 여백을 둔다. 딱 맞추면 다음 컷이 보이지
    // 않아 어디로 이어지는지 알 수 없다.
    const margin = 24
    let delta = 0
    if (box.right > view.right - margin) delta = box.right - view.right + margin
    else if (box.left < view.left + margin) delta = box.left - view.left - margin
    if (delta === 0) return

    // 즉시 옮긴다. `smooth`를 쓰면 화살표를 연달아 누를 때 애니메이션이
    // 매번 새로 시작되며 서로를 취소한다 — delta는 늘 '지금 위치' 기준인데
    // 이전 이동이 아직 반영되지 않아, 같은 자리에서 같은 값을 계속 요청하다
    // 결국 제자리에 머문다(실제로 12번 눌러도 scrollLeft가 0이었다).
    //
    // 한 칸씩 따라가는 이동이라 애니메이션이 없어도 급하게 보이지 않는다.
    scroller.scrollLeft += delta
  }, [selectedShotIndex])

  const handleKeyDown = useCallback((event) => {
    const last = shots.length - 1
    // 지금 어디를 보고 있는가. 선택이 없으면 첫 컷에서 시작한다.
    const current = selectedShotIndex ?? 0
    let next = null

    switch (event.key) {
      case 'ArrowRight': next = Math.min(current + 1, last); break
      case 'ArrowLeft': next = Math.max(current - 1, 0); break
      case 'Home': next = 0; break
      case 'End': next = last; break
      default: return
    }

    event.preventDefault()
    // 끝에서 더 가려는 것은 이동이 아니다. 그때도 포커스는 유지한다.
    if (next === selectedShotIndex) {
      focusCell(next)
      return
    }
    movedByKey.current = true
    onSelectShot?.(next)
  }, [shots.length, selectedShotIndex, onSelectShot, focusCell])

  if (shots.length === 0) return null

  const inHighlight = (index) => (
    highlightRange
      && index >= highlightRange.from
      && index <= highlightRange.to
  )

  // roving tabindex — 목록 전체가 탭 한 번을 받고, 그 안은 화살표로 옮긴다.
  // 컷마다 탭을 멈추면 18컷짜리 시퀀스에서 탭을 18번 눌러야 지나간다.
  const tabbableIndex = selectedShotIndex ?? 0

  const lane = (
    <div
        className="strip-lane"
        style={{ '--track-count': shots.length }}
        role="listbox"
        aria-label="스토리보드 — 좌우 화살표로 컷 이동"
        aria-orientation="horizontal"
        aria-activedescendant={
          selectedShotIndex !== null ? `strip-cell-${selectedShotIndex}` : undefined
        }
        ref={laneRef}
        onKeyDown={handleKeyDown}
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
            >
              <button
                type="button"
                id={`strip-cell-${index}`}
                data-shot-index={index}
                className="strip-cell-btn"
                role="option"
                aria-selected={selected}
                /* 선택된 것만 탭을 받는다. 나머지는 화살표로 온다. */
                tabIndex={index === tabbableIndex ? 0 : -1}
                onClick={() => onSelectShot?.(index)}
                /* 컷 번호는 아래에 이미 적혀 있다. 툴팁까지 `S1`이면
                   같은 말이 두 번 뜬다 — 내용이 있을 때만 띄운다. */
                title={shot?.content || undefined}
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
                  tabIndex={-1}
                  onClick={() => onSelectSeam?.(index)}
                  title={`S${index + 1} → S${index + 2} 사이`}
                  aria-label={`S${index + 1}과 S${index + 2} 사이`}
                />
              )}
            </div>
          )
        })}
    </div>
  )

  // Lens Track 화면에서는 부모가 스트립과 트랙 전체를 한 번에 스크롤한다.
  // 단독 사용처에서는 기존처럼 스트립만 감싼다.
  if (embedded) return lane

  return (
    <div className="strip-lane-scroll" ref={scrollRef} onScroll={onScroll}>
      {lane}
    </div>
  )
}
