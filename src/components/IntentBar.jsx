import { useRef, useEffect } from 'react'
import useStore from '../store/useStore'
import { analyzeSketch, suggestStrategies } from '../services/api'
import AxisChips from './AxisChips'
import './IntentBar.css'

function StrategyReadyBubble() {
  const setShowStrategyOverlay = useStore((s) => s.setShowStrategyOverlay)
  return (
    <div className="chat-msg-bubble assistant">
      <span className="msg-role">AI</span>
      <p>촬영 전략 추천이 준비됐어요.</p>
      <button
        className="chat-strategy-btn"
        onClick={() => setShowStrategyOverlay(true)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
        추천 전략 3가지 확인하기
      </button>
    </div>
  )
}

export default function IntentBar() {
  const intent = useStore((s) => s.intent)
  const setIntent = useStore((s) => s.setIntent)
  const canvasDataUrl = useStore((s) => s.canvasDataUrl)
  const screenplay = useStore((s) => s.screenplay)
  const setIsAnalyzing = useStore((s) => s.setIsAnalyzing)
  const analysisResult = useStore((s) => s.analysisResult)
  const setAnalysisResult = useStore((s) => s.setAnalysisResult)
  const setProposals = useStore((s) => s.setProposals)
  const isAnalyzing = useStore((s) => s.isAnalyzing)
  const chatMessages = useStore((s) => s.chatMessages)
  const addChatMessage = useStore((s) => s.addChatMessage)
  const strategies = useStore((s) => s.strategies)
  const activeStrategy = useStore((s) => s.activeStrategy)
  const activeShot = useStore((s) => s.activeShot)
  const clearComparePreview = useStore((s) => s.clearComparePreview)
  
  const messagesEndRef = useRef(null)
  const analyzedCanvasRef = useRef(null) // 마지막으로 분석한 canvasDataUrl 기억
  const setCenterTab = useStore((s) => s.setCenterTab)
  const setDetailTab = useStore((s) => s.setDetailTab)

  // 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleAnalyze = async () => {
    if (isAnalyzing) return

    const userMsg = intent || '이 씬의 연출 의도를 바탕으로 가이드를 제안해줘.'
    addChatMessage({ role: 'user', text: userMsg })
    clearComparePreview()

    // 분석 결과를 우측 Reframe 탭으로 자동 이동
    setDetailTab('guidance')
    
    setIsAnalyzing(true)
    setProposals([])

    try {
      const base64 = canvasDataUrl ? canvasDataUrl.split(',')[1] : null
      const scriptText = screenplay.map((el) => el.text).join('\n')
      const intentText = intent || 'Emotional scene'

      if (base64) {
        // 캔버스가 바뀌지 않았으면 기존 분석 결과 재사용
        const isSameCanvas = analyzedCanvasRef.current === canvasDataUrl
        let analysis
        if (isSameCanvas && analysisResult?.cir) {
          analysis = analysisResult
          addChatMessage({ role: 'assistant', text: analysis.alignment || '이전 분석 결과를 재사용합니다.' })
        } else {
          analysis = await analyzeSketch(base64, scriptText)
          setAnalysisResult(analysis)
          analyzedCanvasRef.current = canvasDataUrl
          addChatMessage({ role: 'assistant', text: analysis.alignment || '분석이 완료되었습니다.' })
        }

        if (analysis?.cir) {
          useStore.getState().addChatMessage({ role: 'assistant', text: '구체적인 전략을 구성하고 있습니다. 잠시만 기다려주세요.' })

          const axes = useStore.getState().activeAxes
          const pref = useStore.getState().theoryPreference
          const miseOptions = useStore.getState().miseOptions
          suggestStrategies(base64, scriptText, intentText, analysis.cir, axes, pref, miseOptions)
            .then((result) => {
              if (result?.strategies?.length) {
                useStore.getState().setProposals(result.strategies)
                useStore.getState().addChatMessage({ role: 'action', text: 'strategies_ready' })
              }
            })
            .catch((err) => console.error('[suggestStrategies]', err))
        }
      } else {
        // 스케치가 없는 경우 가짜 딜레이 후 안내 메시지
        setTimeout(() => {
          addChatMessage({ 
            role: 'assistant', 
            text: '스케치 없이 텍스트 의도만으로 분석을 완료했습니다. 실험실(Guidance Lab)에서 시네마틱 카드를 확인하세요.' 
          })
        }, 1000)
      }
    } catch (error) {
      addChatMessage({ role: 'system', text: `오류 발생: ${error.message}` })
    } finally {
      setIsAnalyzing(false)
      setIntent('')
    }
  }

  return (
    <div className="intent-bar chat-mode">
      {chatMessages.length > 0 && (
        <div className="chat-messages">
          {chatMessages.map((msg, i) => {
            if (msg.role === 'action' && msg.text === 'strategies_ready') {
              return <StrategyReadyBubble key={i} />
            }
            return (
              <div key={i} className={`chat-msg-bubble ${msg.role}`}>
                <span className="msg-role">{msg.role === 'user' ? 'Director' : 'AI'}</span>
                <p>{msg.text}</p>
              </div>
            )
          })}

          <div ref={messagesEndRef} />
        </div>
      )}

      <AxisChips />

      <div className="chat-input-area">
        <div className="input-prefix">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <input
          className="chat-input"
          placeholder="어떤 장면을 연출하고 싶으신가요? (예: 더 긴박한 느낌으로)"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
        />
        <button 
          className={`chat-analyze-btn ${isAnalyzing ? 'loading' : ''}`}
          onClick={handleAnalyze}
          disabled={isAnalyzing}
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze'}
        </button>
      </div>
    </div>
  )
}
