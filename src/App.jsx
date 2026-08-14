import { useEffect, useState } from 'react'
import StoryboardView from './components/StoryboardView'
import DecisionBoard from './components/DecisionBoard'
import StudyLogPanel from './components/StudyLogPanel'
import CenterPanel from './components/CenterPanel'
import useStore from './store/useStore'
import { exportLog, summarize, resetLog, setCondition, condition } from './store/studyLog'
import './App.css'

function App() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  // 실험자만 여는 창. 로그가 쌓이는지 세션 중에 확인할 수 있어야 한다.
  const [studyLogOpen, setStudyLogOpen] = useState(false)
  const [boardView, setBoardView] = useState('split')
  const maximizedPanel = useStore((s) => s.maximizedPanel)
  const setMaximizedPanel = useStore((s) => s.setMaximizedPanel)
  const leftPanelVisible = useStore((s) => s.leftPanelVisible)
  const setLeftPanelVisible = useStore((s) => s.setLeftPanelVisible)
  const centerTab = useStore((s) => s.centerTab)
  const setCenterTab = useStore((s) => s.setCenterTab)
  const drawingWorkspaceOpen = useStore((s) => s.drawingWorkspaceOpen)
  const openDrawingWorkspace = useStore((s) => s.openDrawingWorkspace)
  const closeDrawingWorkspace = useStore((s) => s.closeDrawingWorkspace)
  const clearStoryboardShotSelection = useStore((s) => s.clearStoryboardShotSelection)
  const activeBeat = useStore((s) => s.activeBeat)
  const zenMode = useStore((s) => s.zenMode)
  const setZenMode = useStore((s) => s.setZenMode)

  // 실험 로그 내보내기. 참가자에게 보이는 버튼을 두면 과제 중에 눈에
  // 걸리므로 단축키로만 연다 — 실험자가 세션 끝에 누른다.
  //   Ctrl+Shift+L  로그 창 열기·닫기
  //   Ctrl+Shift+E  내보내기 (요약은 콘솔에도 찍는다)
  //   Ctrl+Shift+R  다음 참가자를 위해 비우기 (확인을 받는다)
  // 실험 조건은 세션이 시작되기 전에 정해져야 한다. URL로 넘기면
  // 참가자를 앉히기 전에 정해지므로 가장 안전하다.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('condition')
    if (fromUrl) setCondition(fromUrl)
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      if (!event.ctrlKey || !event.shiftKey) return
      if (event.key === 'C' || event.key === 'c') {
        event.preventDefault()
        const next = window.prompt('실험 조건', condition())
        if (next) setCondition(next)
      }
      if (event.key === 'L' || event.key === 'l') {
        event.preventDefault()
        setStudyLogOpen((open) => !open)
      }
      if (event.key === 'E' || event.key === 'e') {
        event.preventDefault()
        const payload = exportLog()
        console.log('[study] exported', payload.summary)
      }
      if (event.key === 'R' || event.key === 'r') {
        event.preventDefault()
        // 지우면 되돌릴 수 없다. 요약을 먼저 보여 주고 묻는다.
        const { edits, regeneration } = summarize()
        const ok = window.confirm(
          `수정 ${edits.total}건, 생성 ${regeneration.total}건의 기록을 지웁니다.\n`
          + '내보내지 않았다면 되돌릴 수 없습니다. 계속할까요?',
        )
        if (ok) resetLog()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
        <DecisionBoard boardView={boardView} />
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
              {/* 화살표만 두면 어디로 가는 버튼인지 알 수 없다. 이 전환은
                  '패널을 넓게 보기'와 '검토 화면으로 가기'라는 두 가지 일이다.
                  뒤쪽은 패널을 접었다 펴는 버튼들과 같은 모양이면 안 된다 —
                  만드는 일에서 검토하는 일로 넘어가는 자리이고, 렌즈로
                  결정을 살펴보고 관객이 어떻게 읽는지 보는 단계 전체가
                  거기서 열린다. */}
              {maximizedPanel === 'left' ? (
                <button
                  className="panel-control-btn stage-forward-btn"
                  onClick={() => {
                    clearStoryboardShotSelection()
                    setMaximizedPanel(null)
                    setLeftPanelVisible(false)
                  }}
                  style={{ marginLeft: 'auto' }}
                  title="렌즈로 결정을 검토하고 관객이 어떻게 읽는지 봅니다"
                >
                  검토로 넘어가기
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
              ) : (
                <>
                  <button
                    className="panel-control-btn"
                    onClick={() => {
                      // 그리는 중이면 그리기를 끝내고 나간다. 패널만 넓히면
                      // 그리기 화면에 남은 채 왼쪽만 커져 어디에 있는지
                      // 알 수 없게 된다.
                      if (drawingWorkspaceOpen) {
                        closeDrawingWorkspace()
                        setLeftPanelVisible(true)
                        setMaximizedPanel('left')
                        return
                      }
                      if (!leftPanelVisible) setLeftPanelVisible(true)
                      else setMaximizedPanel('left')
                    }}
                    style={{ marginLeft: 'auto' }}
                    title={drawingWorkspaceOpen ? '그리기를 끝내고 패널로' : '스토리보드를 넓게 보기'}
                  >
                    ← 스토리보드
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
              <div className="decision-header-controls">
                {/* 검토하러 왔으면 돌아갈 길이 있어야 한다. 왼쪽 패널이
                    접혀 있으면 스토리보드가 화면에서 아예 사라진다. */}
                {!leftPanelVisible && (
                  <button
                    type="button"
                    className="panel-control-btn"
                    onClick={() => {
                      setLeftPanelVisible(true)
                      setMaximizedPanel('left')
                    }}
                    title="스토리보드로 돌아가기"
                  >
                    ← 스토리보드
                  </button>
                )}
                <div className="decision-view-toggle" aria-label="Board view mode">
                  {[
                    ['storyboard', 'Storyboard'],
                    ['split', 'Split'],
                    ['lenses', 'Lenses'],
                  ].map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      className={boardView === mode ? 'active' : ''}
                      onClick={() => setBoardView(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {/* Focus 버튼은 뺐다. 헤더에 버튼이 많아 정작 눌러야 할
                    것이 묻힌다. Z 키로 여전히 들어갈 수 있고, 들어간
                    화면에는 나오는 버튼이 따로 있다. */}
                <button type="button" className="panel-control-btn" onClick={openDrawingWorkspace}>
                  Edit Shot
                </button>
              </div>
            )}
          </div>
          <div className="panel-content">
            {drawingWorkspaceOpen
              ? <CenterPanel showScriptPanel={drawingFocused} />
              : <DecisionBoard boardView={boardView} />}
          </div>
        </section>

      </main>

      {studyLogOpen && <StudyLogPanel onClose={() => setStudyLogOpen(false)} />}
    </div>
  )
}

export default App
