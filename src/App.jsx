import { useEffect, useState } from 'react'
import StoryboardView from './components/StoryboardView'
import DecisionBoard from './components/DecisionBoard'
import StudyLogPanel from './components/StudyLogPanel'
import CenterPanel from './components/CenterPanel'
import useStore, { selectCutStage } from './store/useStore'
import {
  summarize, resetLog,
  setCondition, condition, setConditionOrder, conditionOrder,
  phase, startTask, endTask, exportedAt, uploadedAt,
} from './store/studyLog'
import { runStudyExportWithAlert } from './store/studyExport'
import './App.css'

function App() {
  const [isFullscreen, setIsFullscreen] = useState(false)
  // 실험자만 여는 창. 로그가 쌓이는지 세션 중에 확인할 수 있어야 한다.
  const [studyLogOpen, setStudyLogOpen] = useState(false)
  // 측정 중인지를 바깥 점에도 물려 둔다. 패널을 열지 않아도 보이게.
  const [studyPhase, setStudyPhase] = useState(() => phase())
  const [exporting, setExporting] = useState(false)
  // 서버 저장이 확인됐는가. 이것이 있어야 `다음 참가자 준비`를 내놓는다.
  const [uploaded, setUploaded] = useState(() => Boolean(uploadedAt()))
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
  const discardUnbuiltDraftPanels = useStore((s) => s.discardUnbuiltDraftPanels)
  const activeBeat = useStore((s) => s.activeBeat)
  const cutStage = useStore(selectCutStage)
  const zenMode = useStore((s) => s.zenMode)
  const setZenMode = useStore((s) => s.setZenMode)

  // 실험 로그 내보내기. 참가자에게 보이는 버튼을 두면 과제 중에 눈에
  // 걸리므로 단축키로만 연다 — 실험자가 세션 끝에 누른다.
  //   Ctrl+Shift+S  본 과제 시작·종료 (튜토리얼과 측정 구간을 가른다)
  //   Ctrl+Shift+L  로그 창 열기·닫기
  //   Ctrl+Shift+E  내보내기 (요약은 콘솔에도 찍는다)
  //   Ctrl+Shift+R  다음 참가자를 위해 비우기 (확인을 받는다)
  // 실험 조건은 세션이 시작되기 전에 정해져야 한다. URL로 넘기면
  // 참가자를 앉히기 전에 정해지므로 가장 안전하다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fromUrl = params.get('condition')
    if (fromUrl) setCondition(fromUrl)
    // within-subjects라 같은 사람이 두 조건을 다 한다. 두 번째 조건은
    // 이미 도구와 이야기에 익숙해진 상태이므로, 순서를 남기지 않으면
    // 조건 차이와 순서 효과가 섞인다.
    const orderFromUrl = params.get('order')
    if (orderFromUrl) setConditionOrder(orderFromUrl)
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      if (!event.ctrlKey || !event.shiftKey) return
      if (event.key === 'C' || event.key === 'c') {
        event.preventDefault()
        const next = window.prompt('실험 조건', condition())
        if (next) setCondition(next)
        const nextOrder = window.prompt('이 참가자의 몇 번째 조건인가 (1 / 2)', conditionOrder())
        if (nextOrder) setConditionOrder(nextOrder)
      }
      if (event.key === 'L' || event.key === 'l') {
        event.preventDefault()
        setStudyLogOpen((open) => !open)
      }
      // 튜토리얼과 본 과제를 가른다. 누르지 않으면 측정이 시작되지
      // 않으므로, 무엇이 일어났는지 눌린 뒤에 바로 알려 준다.
      if (event.key === 'S' || event.key === 's') {
        event.preventDefault()
        if (phase() === 'tutorial') {
          startTask()
          setStudyPhase(phase())
          window.alert('본 과제를 시작했습니다. 여기부터 측정합니다.')
        } else if (phase() === 'task') {
          const ok = window.confirm('본 과제를 종료할까요? 이 뒤의 조작은 측정에서 빠집니다.')
          if (ok) { endTask(); setStudyPhase(phase()) }
        } else {
          window.alert('이미 종료된 과제입니다. 다음 참가자는 Ctrl+Shift+R로 비우세요.')
        }
      }
      if (event.key === 'E' || event.key === 'e') {
        event.preventDefault()
        // 로그 창의 `내보내기` 버튼과 **같은 것을 부른다.** 각자 내보내면
        // 어느 쪽으로 눌렀느냐에 따라 서버에 올라가고 안 올라가고가
        // 갈린다 — 실제로 그랬다.
        runStudyExportWithAlert()
      }
      if (event.key === 'R' || event.key === 'r') {
        event.preventDefault()
        // 지우면 되돌릴 수 없다. 요약을 먼저 보여 주고 묻는다.
        const { edits, regeneration } = summarize()
        // 내보낸 적이 없으면 그 사실을 앞에 세운다. 지우면 되돌릴 수
        // 없는데, `내보내지 않았다면`이라는 조건문은 실험자가 방금
        // 내보냈는지를 스스로 기억해야만 읽을 수 있다.
        const ok = window.confirm(
          (exportedAt()
            ? `마지막 내보내기: ${new Date(exportedAt()).toLocaleString('ko-KR')}\n\n`
            : '⚠️ 이 세션은 한 번도 내보내지 않았습니다.\n지우면 기록이 사라집니다.\n\n')
          + `수정 ${edits.total}건, 생성 ${regeneration.total}건의 기록을 지웁니다. 계속할까요?`,
        )
        if (ok) { resetLog(); setStudyPhase(phase()); setUploaded(false) }
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
    // 이음새 삽입/합치기로 만들어 놓고 프롬프트도 안 넣고 생성도 안 한
    // 빈 패널은 검토를 깨뜨린다(관객 검토가 안 열림). 검토로 넘어가기 전에
    // 정리한다 — 내용이 채워진 것은 남긴다.
    discardUnbuiltDraftPanels()
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

      {/* 실험 로그를 여는 자리.

          전에는 Ctrl+Shift+L로만 열렸다. 단축키는 외우지 않으면 없는 것과
          같고, 무엇보다 **측정이 시작됐는지**를 확인할 방법이 그 안에만
          있었다 — 열어 보지 않으면 튜토리얼인 채로 20분이 지나간다.

          그래서 이 점 하나를 늘 띄워 둔다. 색이 곧 상태다:
          노랑이면 아직 측정 전, 초록이면 측정 중. 참가자에게는 작게 두어
          작업을 가리지 않되, 실험자는 눈으로 훑어 확인할 수 있다. */}
      {/* 참가자가 쓰는 것은 둘뿐이다 — 과제를 시작하고, 끝나면 내보낸다.
          측정값(수정 건수·층위 분포 따위)은 여기 두지 않는다. 참가자에게
          의미가 없을뿐더러, 무엇이 세어지는지 보이면 행동이 그쪽으로
          바뀐다. 그 통계는 실험자가 Ctrl+Shift+L로 따로 본다.

          오른쪽 아래는 캔버스 조작 버튼이 쓰는 자리라 왼쪽 아래에 둔다. */}
      <div className={`study-bar is-${studyPhase}`}>
        {studyPhase === 'tutorial' && (
          <button type="button" className="study-bar-start" onClick={() => {
            startTask()
            setStudyPhase(phase())
          }}>
            과제 시작
          </button>
        )}
        {studyPhase === 'task' && (
          <>
            <span className="study-bar-state">진행 중</span>
            {/* 끝내면 **그 자리에서 내보낸다.** 두 걸음으로 두면 종료만
                누르고 내보내기를 잊을 수 있는데, 그 상태에서 다음
                참가자를 위해 비우면 기록이 통째로 사라진다.

                반드시 `endTask()`를 먼저 부른다 — 내보내기가 앞서면 그
                순간까지가 `task`로 잡혀 측정 구간의 끝이 흐려진다. */}
            <button type="button" className="study-bar-end" disabled={exporting} onClick={async () => {
              if (!window.confirm('과제를 끝내고 결과를 내보낼까요?')) return
              endTask()
              setStudyPhase(phase())
              setExporting(true)
              try {
                await runStudyExportWithAlert()
              } finally {
                setExporting(false)
                setUploaded(Boolean(uploadedAt()))
              }
            }}>
              {exporting ? '내보내는 중…' : '과제 종료 · 내보내기'}
            </button>
          </>
        )}
        {/* 끝난 뒤 다시 받을 수 있게 남겨 둔다 — 업로드가 실패했거나
            파일을 잃었을 때 이것이 유일한 경로다. */}
        {studyPhase === 'done' && (
          <button type="button" className="study-bar-export" disabled={exporting} onClick={async () => {
            setExporting(true)
            try {
              await runStudyExportWithAlert()
            } finally {
              setExporting(false)
              setUploaded(Boolean(uploadedAt()))
            }
          }}>
            {exporting ? '내보내는 중…' : '결과 다시 내보내기'}
          </button>
        )}
        {/* 다음 사람으로 넘어가기. **서버에 올라간 것이 확인된 뒤에만**
            내놓는다 — 파일은 실험자 컴퓨터에 있지만 그것이 제자리에
            있는지 시스템은 알 수 없다. 업로드가 실패했으면 이 버튼이
            아예 안 떠서, 지울 수 없는 상태가 눈에 보인다. */}
        {studyPhase === 'done' && uploaded && (
          <button type="button" className="study-bar-next" onClick={() => {
            if (!window.confirm(
              '이 세션을 지우고 다음 참가자(또는 다음 조건)를 준비합니다.\n'
              + '서버 저장은 확인됐습니다. 계속할까요?',
            )) return
            resetLog()
            setStudyPhase(phase())
            setUploaded(false)
          }}>
            다음 참가자 · 조건 준비
          </button>
        )}
      </div>

      {studyLogOpen && (
        <StudyLogPanel
          onClose={() => setStudyLogOpen(false)}
          onPhaseChange={() => setStudyPhase(phase())}
        />
      )}
    </div>
  )
}

export default App
