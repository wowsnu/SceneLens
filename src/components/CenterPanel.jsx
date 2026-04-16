import DrawingToolbar from './DrawingToolbar'
import DrawingCanvas from './DrawingCanvas'
import IntentBar from './IntentBar'
import StrategyOverlay from './StrategyOverlay'
import './CenterPanel.css'

export default function CenterPanel() {
  return (
    <div className="canvas-main-area">
      <StrategyOverlay />
      <div className="canvas-side">
        <div className="canvas-toolbar-row">
          <DrawingToolbar />
        </div>
        <div className="canvas-container">
          <DrawingCanvas />
        </div>
        <div className="intent-bar-row">
          <IntentBar />
        </div>
      </div>
    </div>
  )
}
