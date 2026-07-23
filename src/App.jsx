import { useEffect, useState } from 'react'
import StoryboardView from './components/StoryboardView'
import DecisionBoard from './components/DecisionBoard'
import CenterPanel from './components/CenterPanel'
import useStore from './store/useStore'
import './App.css'

function App() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const maximizedPanel = useStore((s) => s.maximizedPanel)
  const setMaximizedPanel = useStore((s) => s.setMaximizedPanel)
  const leftPanelVisible = useStore((s) => s.leftPanelVisible)
  const setLeftPanelVisible = useStore((s) => s.setLeftPanelVisible)
  const centerTab = useStore((s) => s.centerTab)
  const setCenterTab = useStore((s) => s.setCenterTab)
  const requestScriptEditor = useStore((s) => s.requestScriptEditor)
  const drawingWorkspaceOpen = useStore((s) => s.drawingWorkspaceOpen)
  const closeDrawingWorkspace = useStore((s) => s.closeDrawingWorkspace)
  const clearStoryboardShotSelection = useStore((s) => s.clearStoryboardShotSelection)
  const activeBeat = useStore((s) => s.activeBeat)
  const zenMode = useStore((s) => s.zenMode)
  const setZenMode = useStore((s) => s.setZenMode)

  const isLabMode = centerTab === 'guidance'
  const drawingFocused = drawingWorkspaceOpen && maximizedPanel === 'center'

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'z' || e.key === 'Z') {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        if (drawingWorkspaceOpen) {
          setMaximizedPanel(drawingFocused ? null : 'center')
        } else {
          setZenMode(!zenMode)
        }
      }
      if (e.key === 'f' || e.key === 'F') {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        toggleFullscreen()
      }
      if (e.key === 'Escape') {
        if (zenMode) setZenMode(false)
        if (drawingFocused) setMaximizedPanel(null)
        if (isLabMode) setCenterTab('canvas')
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [zenMode, isLabMode, drawingWorkspaceOpen, drawingFocused, setZenMode, setCenterTab, setMaximizedPanel])

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  if (zenMode) {
    return (
      <div className="zen-mode">
        <DecisionBoard />
        <button className="zen-exit-btn" onClick={() => setZenMode(false)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
          Exit (Z)
        </button>
      </div>
    )
  }

  return (
    <div className="app-container">
      <button className="floating-fullscreen-btn" onClick={toggleFullscreen} title="Fullscreen (F)">
        {isFullscreen ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        )}
      </button>
      <main className="unified-workspace">

        {/* LEFT */}
        {(maximizedPanel === null || maximizedPanel === 'left' || drawingWorkspaceOpen) && (
          <section className={`panel-container left-panel ${!leftPanelVisible ? 'collapsed' : ''} ${maximizedPanel === 'left' ? 'maximized' : ''} ${drawingFocused ? 'panel-hidden' : ''}`}>
            <div className="panel-header">
              {leftPanelVisible && <span className="panel-title">📜 NARRATIVE</span>}
              {leftPanelVisible && (
                <button
                  className="panel-control-btn"
                  onClick={() => requestScriptEditor()}
                  style={{ marginLeft: 'auto' }}
                  title="Edit Script"
                >
                  Edit Script
                </button>
              )}
              {maximizedPanel === 'left' ? (
                <button
                  className="panel-control-btn"
                  onClick={() => {
                    clearStoryboardShotSelection()
                    setMaximizedPanel(null)
                  }}
                  style={{ marginLeft: leftPanelVisible ? 8 : 'auto' }}
                >
                  ↙
                </button>
              ) : (
                <>
                  <button
                    className="panel-control-btn"
                    onClick={() => !leftPanelVisible ? setLeftPanelVisible(true) : setMaximizedPanel('left')}
                    style={{ marginLeft: leftPanelVisible ? 8 : 'auto' }}
                  >
                    ↗
                  </button>
                  <button
                    className="panel-control-btn"
                    onClick={() => setLeftPanelVisible(!leftPanelVisible)}
                  >
                    {leftPanelVisible ? '‹' : '›'}
                  </button>
                </>
              )}
            </div>
            {leftPanelVisible && (
              <div className="panel-content">
                <StoryboardView />
              </div>
            )}
          </section>
        )}

        {/* CENTER */}
        <section className={`panel-container center-panel ${maximizedPanel === 'left' ? 'panel-hidden' : ''} ${drawingWorkspaceOpen ? 'drawing-workspace' : ''} ${drawingFocused ? 'maximized' : ''}`}>
          <div className="panel-header">
            <span className="panel-title">
              {drawingWorkspaceOpen ? `DRAWING · BEAT ${activeBeat + 1}` : 'STORYBOARD DECISION BOARD'}
            </span>
            {drawingWorkspaceOpen ? (
              <>
                <button
                  className="panel-control-btn"
                  onClick={closeDrawingWorkspace}
                  style={{ marginLeft: 'auto' }}
                >
                  Back to Storyboard
                </button>
                <button
                  className="panel-control-btn"
                  onClick={() => setMaximizedPanel(drawingFocused ? null : 'center')}
                  title={drawingFocused ? 'Exit drawing focus (Z)' : 'Focus drawing (Z)'}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {drawingFocused
                      ? <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                      : <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />}
                  </svg>
                  {drawingFocused ? 'Exit Focus' : 'Focus'}
                </button>
              </>
            ) : (
              <button className="panel-control-btn" onClick={() => setZenMode(true)} title="Focus (Z)" style={{ marginLeft: 'auto' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                </svg>
                Focus
              </button>
            )}
          </div>
          <div className="panel-content">
            {drawingWorkspaceOpen
              ? <CenterPanel showScriptPanel={drawingFocused} />
              : <DecisionBoard />}
          </div>
        </section>

      </main>
    </div>
  )
}

export default App
