/* 샷 크기와 앵글의 예시 도형.
 *
 * 사진 대신 도형으로 그리는 이유: 프레이밍은 "프레임 안에서 인물이 얼마나
 * 크게 들어오는가"이고 앵글은 "카메라가 어디서 보는가"다. 둘 다 관계이지
 * 특정 장면이 아니다. 실제 사진은 그 관계 말고도 인물·공간·조명이 함께
 * 들어와서, 작은 칸에서는 무엇을 보라는 것인지 흐려진다.
 *
 * 크기도 이유다. 표 안의 칸은 80~100px인데 사진은 그 크기에서 회색 덩어리가
 * 된다. 도형은 선이 몇 개뿐이라 작아도 읽힌다.
 */

// 프레임 비율. 콘티 패널과 같은 3:2로 두어 실제 화면과 같은 비율에서
// 인물이 얼마나 차지하는지 보이게 한다.
const W = 60
const H = 40

// 프레임 테두리. 모든 도형이 공유한다 — 이 사각형이 화면이고, 그 안에서
// 인물이 얼마나 크냐가 곧 샷 크기다.
function Frame({ children }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="framing-glyph" aria-hidden="true">
      <rect
        x="0.75" y="0.75" width={W - 1.5} height={H - 1.5}
        rx="2.5"
        className="framing-glyph-frame"
      />
      {children}
    </svg>
  )
}

/* 인물. 머리와 몸통만 있는 최소 형태다.
 *
 * cy는 머리 중심의 y, r은 머리 반지름. 이 둘로 크기와 위치가 정해진다 —
 * 샷이 좁아질수록 머리가 커지고 위로 올라가, 몸통은 프레임 밖으로 나간다.
 * 그 잘림이 곧 샷 크기의 정의이므로 clip으로 프레임 밖을 잘라낸다.
 */
function Figure({ cy, r, clipId }) {
  const neck = cy + r * 1.15
  const shoulderW = r * 2.6
  return (
    <g clipPath={`url(#${clipId})`} className="framing-glyph-figure">
      {/* 몸통. 어깨에서 아래로 내려가며 프레임 밖까지 이어진다. */}
      <path
        d={`M ${W / 2 - shoulderW} ${H + 6}
            L ${W / 2 - shoulderW} ${neck + r * 0.5}
            Q ${W / 2 - shoulderW} ${neck} ${W / 2 - r * 0.85} ${neck}
            L ${W / 2 + r * 0.85} ${neck}
            Q ${W / 2 + shoulderW} ${neck} ${W / 2 + shoulderW} ${neck + r * 0.5}
            L ${W / 2 + shoulderW} ${H + 6} Z`}
      />
      <circle cx={W / 2} cy={cy} r={r} />
    </g>
  )
}

// 샷 크기 6종. 값은 머리 반지름과 중심 높이다 — 넓은 샷일수록 머리가
// 작고 아래에 있고, 좁은 샷일수록 크고 위로 올라간다.
const SHOT_FIGURES = {
  Wide: { cy: 24, r: 2.2 },
  Full: { cy: 15, r: 3.4 },
  Medium: { cy: 12, r: 6 },
  Bust: { cy: 14, r: 8.5 },
  'Close-Up': { cy: 17, r: 13 },
  ECU: { cy: 20, r: 21 },
}

/* 앵글. 카메라와 인물의 위치 관계를 옆에서 본 그림으로 그린다.
 *
 * 앵글은 프레임 안의 크기가 아니라 카메라가 선 자리의 문제라, 샷 크기와
 * 같은 정면 도형으로는 구별되지 않는다(하이 앵글과 로 앵글이 같은 그림이
 * 된다). 그래서 옆에서 본 단면으로 바꾼다 — 인물이 서 있고, 카메라가
 * 어디서 어느 쪽을 향하는지 삼각형과 선으로 보인다.
 */
function AngleGlyph({ kind }) {
  // 인물은 늘 같은 자리에 선다. 달라지는 것은 카메라뿐이라, 그 대비가
  // 앵글의 정의를 그대로 보여준다.
  const person = (
    <g className="framing-glyph-figure">
      <circle cx="40" cy="16" r="3.2" />
      <path d="M 36.5 34 L 36.5 21 Q 36.5 19.4 38 19.4 L 42 19.4 Q 43.5 19.4 43.5 21 L 43.5 34 Z" />
    </g>
  )
  // 바닥. 인물이 서 있는 면이 있어야 위/아래가 읽힌다.
  const ground = <line x1="6" y1="34" x2="54" y2="34" className="framing-glyph-ground" />

  // 카메라. 꼭짓점이 렌즈 방향이다.
  const cam = (x, y, rot) => (
    <g transform={`rotate(${rot} ${x} ${y})`} className="framing-glyph-cam">
      <path d={`M ${x - 4} ${y - 3.4} L ${x + 4.6} ${y} L ${x - 4} ${y + 3.4} Z`} />
    </g>
  )
  // 시선. 카메라에서 인물로 향하는 선.
  const sight = (x, y) => (
    <line x1={x} y1={y} x2="38" y2="19" className="framing-glyph-sight" />
  )

  switch (kind) {
    case 'High angle':
      // 카메라가 위에서 내려다본다.
      return <>{ground}{person}{sight(14, 7)}{cam(13, 7, 24)}</>
    case 'Low angle':
      // 카메라가 아래에서 올려다본다.
      return <>{ground}{person}{sight(14, 31)}{cam(13, 31, -24)}</>
    case 'Bird eye':
      // 수직으로 내려다본다. 시선이 인물 바로 위에서 떨어진다.
      return (
        <>
          {ground}{person}
          <line x1="40" y1="5" x2="40" y2="12" className="framing-glyph-sight" />
          {cam(40, 5, 90)}
        </>
      )
    case 'Over the shoulder':
      /* 어깨 너머로 상대를 본다.
       *
       * 다른 앵글처럼 옆에서 본 배치도로 그리면 카메라와 두 인물의 위치만
       * 보이고, 정작 감독이 아는 그 장면 — 앞쪽 어깨와 뒤통수가 한 귀퉁이를
       * 가리고 그 너머에 상대 얼굴이 있는 화면 — 이 나오지 않는다. OTS는
       * 카메라가 선 자리보다 그 결과 프레이밍이 곧 정의다.
       *
       * 그래서 여기만 결과 화면으로 그린다. 프레임 왼쪽 앞에 어깨와
       * 뒤통수가 크게 걸리고, 오른쪽 안쪽에 상대가 그보다 작게 선다.
       */
      return (
        <>
          {/* 상대. 프레임 안쪽에 있어 앞 인물보다 작다. */}
          <g className="framing-glyph-figure framing-glyph-far">
            <circle cx="40" cy="14" r="5" />
            <path d="M 31 36 L 31 25 Q 31 22.5 34 22.5 L 46 22.5 Q 49 22.5 49 25 L 49 36 Z" />
          </g>
          {/* 앞 인물의 뒤통수와 어깨. 카메라에 가까워 크고, 프레임 왼쪽
              아래 귀퉁이를 잘라내듯 가린다. */}
          <g className="framing-glyph-near">
            <path d="M 1.5 39 L 1.5 30 Q 5 25.5 12 25.5 Q 21 25.5 24 32 L 26 39 Z" />
            <circle cx="12" cy="19" r="9.5" />
          </g>
        </>
      )
    case 'POV':
      /* 카메라가 그 인물의 눈이다.
       *
       * 다른 앵글처럼 옆에서 본 단면으로 그리면 보는 사람을 화면에
       * 그리게 되는데, POV는 바로 그 사람이 화면에 없는 것이 정의다.
       * 그래서 시점을 바꾼다 — 프레임 자체가 그 사람의 시야가 되고,
       * 안에는 그가 보는 대상이 있다. 아래 실루엣은 자기 몸의 일부다
       * (손이나 어깨는 POV에서도 화면에 들어온다).
       */
      return (
        <>
          {/* 보는 대상. 이 사람이 카메라 쪽을 마주본다. */}
          <g className="framing-glyph-figure framing-glyph-far">
            <circle cx="34" cy="15" r="4.6" />
            <path d="M 26 30 L 26 23 Q 26 21 28.5 21 L 39.5 21 Q 42 21 42 23 L 42 30 Z" />
          </g>
          {/* 보는 사람의 몸 일부. 프레임 아래 가장자리에 걸린다 — 시야의
              가장자리에 자기 손과 어깨가 들어오는 그 모양이다. */}
          <path
            d="M 4 39 L 4 33 Q 12 28 20 31 L 25 39 Z"
            className="framing-glyph-own"
          />
          <path
            d="M 56 39 L 56 34 Q 49 30 43 33 L 40 39 Z"
            className="framing-glyph-own"
          />
        </>
      )
    case 'Eye level':
    default:
      // 카메라가 눈높이에 있다. 시선이 수평이다.
      return <>{ground}{person}{sight(14, 19)}{cam(13, 19, 0)}</>
  }
}

/* 하나의 예시 도형.
 *
 * kind로 샷과 앵글을 가른다 — 둘은 보여주는 것이 달라(프레임 안의 크기 /
 * 카메라의 자리) 같은 그림으로 그릴 수 없다.
 */
export default function FramingGlyph({ kind, value }) {
  if (kind === 'angle') {
    return <Frame><AngleGlyph kind={value} /></Frame>
  }
  const figure = SHOT_FIGURES[value]
  if (!figure) return <Frame />
  const clipId = `framing-clip-${String(value).replace(/[^a-zA-Z]/g, '')}`
  return (
    <Frame>
      <defs>
        <clipPath id={clipId}>
          <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="2" />
        </clipPath>
      </defs>
      <Figure cy={figure.cy} r={figure.r} clipId={clipId} />
    </Frame>
  )
}
