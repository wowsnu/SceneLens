import useStore from '../store/useStore'
import './ScriptView.css'

export default function ScriptView() {
  const screenplay = useStore((s) => s.screenplay)
  const activeBeat = useStore((s) => s.activeBeat)
  const selectBeat = useStore((s) => s.selectBeat)

  // Group elements by beat
  let currentBeat = null
  const elements = []

  screenplay.forEach((el, i) => {
    if (el.beat !== undefined && el.beat !== currentBeat) {
      currentBeat = el.beat
      elements.push(
        <div key={`beat-${el.beat}`} className="script-beat-divider">
          <span className="beat-number">Moment {el.beat + 1}</span>
          <hr className="beat-line" />
        </div>
      )
    }
    elements.push(
      <div
        key={i}
        className={`script-element script-${el.type}${el.beat === activeBeat ? ' active-beat' : ''}`}
        onClick={() => el.beat !== undefined && selectBeat(el.beat)}
        style={el.beat !== undefined ? { cursor: 'pointer' } : undefined}
      >
        {el.text}
      </div>
    )
  })

  return (
    <div className="script-view scrollable">
      <div className="script-reading-container">
        {elements}
      </div>
    </div>
  )
}
