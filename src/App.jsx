import { useEffect, useState } from 'react'
import StoryboardView from './components/StoryboardView'
import DecisionBoard from './components/DecisionBoard'
import StudyLogPanel from './components/StudyLogPanel'
import CenterPanel from './components/CenterPanel'
import useStore, { selectCutStage } from './store/useStore'
import { exportLog, summarize, resetLog, setCondition, condition } from './store/studyLog'
import './App.css'

function App() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  // 실험자만 여는 창. 로그가 쌓이는지 세션 중에 확인할 수 있어야 한다.
  const [studyLogOpen, setStudyLogOpen] = useState(false)
  const maximizedPanel = useStore((s) => s.maximizedPanel)
  const setMaximizedPanel = useStore((s) => s.setMaximizedPanel)
  const leftPanelVisible = useStore((s) => s.leftPanelVisible)
  const setLeftPanelVisible = useStore((s) => s.setLeftPanelVisible)
  const centerTab = useStore((s) => s.centerTab)
  const setCenterTab = useStore((s) => s.setCenterTab)
  const drawingWorkspaceOpen = useStore((s) => s.drawingWorkspaceOpen)
  const closeDrawingWorkspace = useStore((s) => s.closeDrawingWorkspace)
  const leaveReview = useStore((s) => s.leaveReview)
  const clearStoryboardShotSelection = useStore((s) => s.clearStoryboardShotSelection)
  const activeBeat = useStore((s) => s.activeBeat)
  const cutStage = useStore(selectCutStage)
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
        const state = useStore.getState()
        const finalSnapshot = {
          captured_at: new Date().toISOString(),
          screenplay: state.screenplay,
          active_scene: state.activeScene,
          scenes: (state.scenes || []).map((scene, sceneIndex) => ({
            id: scene.id || `scene-${sceneIndex + 1}`,
            title: scene.title || '',
            active_branch: scene.activeBranch ?? 0,
            shots: (scene.branches?.[scene.activeBranch ?? 0]?.shots || []).map((shot, order) => ({
              id: shot.id, order: order + 1, label: shot.label || shot.intent || '',
              image: shot.image || null, beat: shot.scriptBeat ?? shot.beat ?? null,
            })),
          })),
        }
        const payload = exportLog({ finalSnapshot, metadata: { tool: 'SceneLens' } })
        fetch('/api/study/export', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool: 'scenelens', condition: payload.metadata.condition, payload }),
        }).catch(() => console.warn('[study] server export failed'))
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

  const enterReview = () => {
    clearStoryboardShotSelection()
    setMaximizedPanel(null)
    setLeftPanelVisible(false)
  }

  // 검토면은 왼쪽 제작 화면을 접은 상태에서 열린다. 돌아갈 때는 이 순서를
  // 한 곳에서만 되돌린다. 서로 다른 버튼이 일부 상태만 바꾸면 두 패널이
  // 모두 숨겨져 빈(검은) 작업면이 될 수 있다.
  const returnToStoryboard = () => {
    leaveReview()
    clearStoryboardShotSelection()
    setLeftPanelVisible(true)
    setMaximizedPanel('left')
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
        <DecisionBoard boardView="split" />
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
      <button
        className="floating-fullscreen-btn"
        style={{ left: 12, right: 'auto', width: 'auto', padding: '0 10px' }}
        onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'E', ctrlKey: true, shiftKey: true }))}
        title="실험 데이터 내보내기"
      >
        내보내기
      </button>
      <main className={`unified-workspace${cutStage === 'script' ? ' script-stage-workspace' : ''}`}>

        {/* LEFT */}
        {(maximizedPanel === null || maximizedPanel === 'left' || drawingWorkspaceOpen) && (
          <section className={`panel-container left-panel ${!leftPanelVisible ? 'collapsed' : ''} ${maximizedPanel === 'left' ? 'maximized' : ''} ${drawingFocused ? 'panel-hidden' : ''}`}>
            {/* 접힌 패널도 스토리보드의 생성 요청을 받을 수 있어야 한다.
                검토 화면에서 재생성할 때 이 컴포넌트가 언마운트되면, 요청을
                전달하려고 왼쪽 대본 패널을 강제로 다시 열어야 했다. 숨겨도
                마운트는 유지해 패널을 열지 않고 백그라운드 재생성한다. */}
            <div className="panel-content">
              <StoryboardView onEnterReview={enterReview} />
            </div>
          </section>
        )}

        {/* CENTER */}
        <section className={`panel-container center-panel ${maximizedPanel === 'left' ? 'panel-hidden' : ''} ${drawingWorkspaceOpen ? 'drawing-workspace' : ''} ${drawingFocused ? 'maximized' : ''}`}>
          {drawingWorkspaceOpen && (
            <div className="panel-header">
              <span className="panel-title">{`DRAWING · MOMENT ${activeBeat + 1}`}</span>
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
            </div>
          )}
          <div className="panel-content">
            {drawingWorkspaceOpen
              ? <CenterPanel showScriptPanel={drawingFocused} />
              : <DecisionBoard
                  boardView="split"
                  onBackToStoryboard={!leftPanelVisible ? returnToStoryboard : null}
                />}
          </div>
        </section>

      </main>

      {studyLogOpen && <StudyLogPanel onClose={() => setStudyLogOpen(false)} />}
    </div>
  )
}

export default App
