import useStore from '../store/useStore'
import './ScriptPanel.css'

export default function ScriptPanel() {
  const screenplay = useStore((s) => s.screenplay)
  const activeBeat = useStore((s) => s.activeBeat)
  const setActiveBeat = useStore((s) => s.setActiveBeat)
  const viewMode = useStore((s) => s.viewMode)

  if (viewMode === 'script' || viewMode === 'storyboard' || viewMode === 'focus' || viewMode === 'detail') {
    return null
  }

  return (
    <aside className="script-panel panel">
      <div className="panel-header">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" opacity="0.6">
          <path d="M3 1h10a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1zm1 3v1h8V4H4zm0 2.5v1h8v-1H4zm0 2.5v1h5V9H4z" />
        </svg>
        <h2>Script</h2>
      </div>
      <div className="panel-body scrollable script-content">
        {screenplay.map((el, i) => (
          <div
            key={i}
            className={`script-element script-${el.type}${el.beat !== undefined ? ' has-beat' : ''}${el.beat === activeBeat ? ' active-beat' : ''}`}
            data-beat={el.beat}
            onClick={() => el.beat !== undefined && setActiveBeat(el.beat)}
          >
            {el.beat !== undefined && <span className="script-beat-marker" />}
            {el.text}
          </div>
        ))}
      </div>
    </aside>
  )
}
