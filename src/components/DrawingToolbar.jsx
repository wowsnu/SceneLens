import useStore from '../store/useStore'
import './DrawingToolbar.css'

export default function DrawingToolbar({ children }) {
  const drawingTool = useStore((s) => s.drawingTool)
  const setDrawingTool = useStore((s) => s.setDrawingTool)
  const penType = useStore((s) => s.penType)
  const setPenType = useStore((s) => s.setPenType)
  const brushSize = useStore((s) => s.brushSize)
  const setBrushSize = useStore((s) => s.setBrushSize)

  return (
    <div className="drawing-toolbar">
      <div className="toolbar-group pen-types">
        {[
          { type: 'pencil', label: 'Pencil', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M12.1 1.3a1 1 0 011.4 0l1.2 1.2a1 1 0 010 1.4L5.4 13.2l-3.1.8.8-3.1L12.1 1.3z" /></svg> },
          { type: 'ink', label: 'Ink', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1L6.5 7.5 1 8l5.5 1.5L8 15l1.5-5.5L15 8l-5.5-1.5z" /></svg> },
          { type: 'marker', label: 'Marker', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M3 11l8-8 2 2-8 8H3v-2zM12.3.7a1 1 0 011.4 0l1.6 1.6a1 1 0 010 1.4L14 5 11 2l1.3-1.3z" /><path d="M1 13h14v2H1z" opacity=".3"/></svg> },
          { type: 'charcoal', label: 'Charcoal', icon: <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 14l3-1.5L13.5 4a1.4 1.4 0 00-2-2L3 10.5 2 14z" opacity=".7"/><path d="M3.5 11l1.5 1.5" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg> },
        ].map(({ type, label, icon }) => (
          <button
            key={type}
            className={`tool-btn ${drawingTool === 'pen' && penType === type ? 'active' : ''}`}
            onClick={() => { setDrawingTool('pen'); setPenType(type) }}
            title={label}
          >
            {icon}
            <span>{label}</span>
          </button>
        ))}
        <button
          className={`tool-btn ${drawingTool === 'eraser' ? 'active' : ''}`}
          onClick={() => setDrawingTool('eraser')}
          title="Eraser"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M14 13H6.4l3.3-3.3 4.3 4.3V13zM2.3 9.7l4-4 4 4-4 4-4-4zM11.7 4.3l-4-4L9 .3a1 1 0 011.4 0l2.6 2.6a1 1 0 010 1.4l-1.3 1.3z" />
          </svg>
          <span>Eraser</span>
        </button>
      </div>

      <div className="toolbar-group toolbar-divider">
        <label className="brush-size-control">
          <span>Size</span>
          <input
            type="range"
            min="1"
            max="50"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
          <span className="brush-size-value">{brushSize}</span>
        </label>
      </div>

      <div className="toolbar-group toolbar-divider">
        <button className="tool-btn" id="btn-undo" title="Undo">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.7 6H11a3 3 0 110 6H8v-1.5h3a1.5 1.5 0 000-3H4.7l2.1 2.1-1.1 1.1L2 7l3.7-3.7 1.1 1.1L4.7 6z" />
          </svg>
          <span>Undo</span>
        </button>
        <button className="tool-btn" id="btn-clear" title="Clear">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5 2V1h5v1h3.5v1.5h-1l-.7 9.6a1.5 1.5 0 01-1.5 1.4H5.2a1.5 1.5 0 01-1.5-1.4L3 3.5H2V2h3.5z" />
          </svg>
          <span>Clear</span>
        </button>
      </div>

      {children && (
        <div className="toolbar-group toolbar-divider toolbar-right">
          {children}
        </div>
      )}
    </div>
  )
}
