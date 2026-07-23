import { useState } from 'react'
import useStore from '../store/useStore'
import DrawingToolbar from './DrawingToolbar'
import DrawingCanvas from './DrawingCanvas'
import IntentBar from './IntentBar'
import StrategyOverlay from './StrategyOverlay'
import './CenterPanel.css'

export default function CenterPanel({ showScriptPanel = true }) {
  const [scriptPanelOpen, setScriptPanelOpen] = useState(true)
  const screenplay = useStore((s) => s.screenplay)
  const activeBeat = useStore((s) => s.activeBeat)
  const beatElements = screenplay.filter((element) => (element.beat ?? 0) === activeBeat)

  return (
    <div className="canvas-main-area">
      {showScriptPanel && (
        <aside className={`drawing-script-panel ${scriptPanelOpen ? 'open' : 'collapsed'}`}>
          <div className="drawing-script-header">
            {scriptPanelOpen && (
              <div>
                <span>Script reference</span>
                <strong>Beat {activeBeat + 1}</strong>
              </div>
            )}
            <button
              type="button"
              onClick={() => setScriptPanelOpen((open) => !open)}
              aria-expanded={scriptPanelOpen}
              aria-label={scriptPanelOpen ? 'Collapse script panel' : 'Expand script panel'}
              title={scriptPanelOpen ? 'Collapse script' : 'Show script'}
            >
              {scriptPanelOpen ? '‹' : '›'}
            </button>
          </div>
          {scriptPanelOpen ? (
            <div className="drawing-script-content">
              {beatElements.length > 0 ? beatElements.map((element, index) => (
                <div
                  key={`${element.type}-${index}`}
                  className={`drawing-script-line type-${element.type}`}
                >
                  {element.text}
                </div>
              )) : (
                <p className="drawing-script-empty">No script lines in this Beat.</p>
              )}
            </div>
          ) : (
            <span className="drawing-script-collapsed-label">Script</span>
          )}
        </aside>
      )}
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
