import { useState } from 'react'
import useStore from '../store/useStore'
import StrategyBar from './StrategyBar'
import DrawingToolbar from './DrawingToolbar'
import DrawingCanvas from './DrawingCanvas'
import IntentBar from './IntentBar'
import StoryboardStrip from './StoryboardStrip'
import ScriptView from './ScriptView'
import StoryboardView from './StoryboardView'
import SpatialMap from './SpatialMap'
import LayerPanel from './LayerPanel'
import './CenterPanel.css'

export default function CenterPanel() {
  const viewMode = useStore((s) => s.viewMode)
  const zenMode = useStore((s) => s.zenMode)
  const setZenMode = useStore((s) => s.setZenMode)
  const [showScript, setShowScript] = useState(false)

  const handleSaveAndMap = () => {
    const { canvasDataUrl, strategies, activeStrategy, activeShot, setStrategies } = useStore.getState()
    if (!canvasDataUrl) {
      setZenMode(false)
      return
    }

    // If no strategies exist yet, create one with this shot
    if (strategies.length === 0) {
      setStrategies([{
        name: 'Storyboard',
        intention_tags: [],
        shots: [{
          order: 1,
          image: canvasDataUrl,
          cir: { shotSize: '', cameraAngle: '', cameraLevel: '', relation: '', blockingDistance: '', eyeline: '', occlusion: '', motionHint: '' },
          theory_rationale: '',
          source: '',
        }],
      }])
    } else if (strategies[activeStrategy]?.shots?.[activeShot]) {
      // Update existing shot
      const updated = strategies.map((strat, si) =>
        si === activeStrategy
          ? {
              ...strat,
              shots: strat.shots.map((shot, shi) =>
                shi === activeShot ? { ...shot, image: canvasDataUrl } : shot
              ),
            }
          : strat
      )
      setStrategies(updated)
    } else {
      // Add new shot to active strategy
      const updated = strategies.map((strat, si) =>
        si === activeStrategy
          ? {
              ...strat,
              shots: [...strat.shots, {
                order: strat.shots.length + 1,
                image: canvasDataUrl,
                cir: { shotSize: '', cameraAngle: '', cameraLevel: '', relation: '', blockingDistance: '', eyeline: '', occlusion: '', motionHint: '' },
                theory_rationale: '',
                source: '',
              }],
            }
          : strat
      )
      setStrategies(updated)
    }
    setZenMode(false)
  }

  return (
    <section className="center-panel">
      {/* Strategy Bar - hidden in script/focus modes */}
      {viewMode !== 'script' && viewMode !== 'focus' && <StrategyBar />}

      {/* Script View (full-width reading) */}
      {viewMode === 'script' && <ScriptView />}

      {/* Storyboard View (side-by-side) */}
      {viewMode === 'storyboard' && <StoryboardView />}

      {/* Focus Mode: Spatial Map or Zen (drawing) */}
      {viewMode === 'focus' && !zenMode && <SpatialMap />}
      {viewMode === 'focus' && zenMode && (
        <div className="canvas-workspace zen-workspace">
          <DrawingToolbar>
            <button
              className={`tool-btn zen-script-btn ${showScript ? 'active' : ''}`}
              onClick={() => setShowScript((v) => !v)}
              title="Toggle Script"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 2h12v1H2V2zm0 3h10v1H2V5zm0 3h12v1H2V8zm0 3h8v1H2v-1z" />
              </svg>
              <span>Script</span>
            </button>
            <button
              className="tool-btn zen-save-btn"
              onClick={handleSaveAndMap}
            >
              Save &amp; Map &#x26F6;
            </button>
          </DrawingToolbar>
          <div className="zen-content">
            <div className="zen-canvas-area">
              <DrawingCanvas />
              <LayerPanel />
            </div>
            {showScript && <ZenScriptPanel />}
          </div>
          <IntentBar hideAnalyze />
        </div>
      )}

      {/* Canvas Workspace (detail mode) */}
      {viewMode === 'detail' && (
        <div className="canvas-workspace">
          <DrawingToolbar />
          <div className="detail-canvas-area">
            <DrawingCanvas />
            <LayerPanel />
          </div>
          <StoryboardStrip />
          <IntentBar />
        </div>
      )}
    </section>
  )
}

function ZenScriptPanel() {
  const screenplay = useStore((s) => s.screenplay)
  const activeBeat = useStore((s) => s.activeBeat)

  // Track which beat each line belongs to
  let currentBeat = -1
  const lines = screenplay.map((el, i) => {
    if (el.beat !== undefined) currentBeat = el.beat
    return { ...el, _beat: currentBeat, _idx: i }
  })

  return (
    <div className="zen-script-panel">
      <div className="zen-script-content">
        {lines.map((el) => {
          const isActive = el._beat === activeBeat
          return (
            <div
              key={el._idx}
              className={`zen-script-line zen-script-${el.type} ${isActive ? 'zen-script-active' : ''}`}
            >
              {el.type === 'scene-heading' && <strong>{el.text}</strong>}
              {el.type === 'action' && <em>{el.text}</em>}
              {el.type === 'character' && <span className="zen-script-char">{el.text}</span>}
              {el.type === 'dialogue' && <span>{el.text}</span>}
              {el.type === 'parenthetical' && <span className="zen-script-paren">{el.text}</span>}
              {el.type === 'transition' && <span className="zen-script-trans">{el.text}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
