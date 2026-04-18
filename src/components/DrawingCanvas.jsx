import { useRef, useEffect, useCallback, useState } from 'react'
import useStore from '../store/useStore'
import { enhanceSketch } from '../services/api'
import './DrawingCanvas.css'

export default function DrawingCanvas() {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const containerRef = useRef(null)
  const isDrawing = useRef(false)
  const lastPoint = useRef(null)
  const historyRef = useRef([])
  const historyIndex = useRef(-1)
  const loadedShotKey = useRef(null)

  const drawingTool = useStore((s) => s.drawingTool)
  const penType = useStore((s) => s.penType)
  const brushSize = useStore((s) => s.brushSize)
  const setCanvasDataUrl = useStore((s) => s.setCanvasDataUrl)
  const overlays = useStore((s) => s.overlays)
  const isAnalyzing = useStore((s) => s.isAnalyzing)
  const isGenerating = useStore((s) => s.isGenerating)
  const isEnhancing = useStore((s) => s.isEnhancing)
  const pendingCanvasImage = useStore((s) => s.pendingCanvasImage)
  const setPendingCanvasImage = useStore((s) => s.setPendingCanvasImage)
  const comparePreview = useStore((s) => s.comparePreview)
  const strategies = useStore((s) => s.strategies)
  const activeStrategy = useStore((s) => s.activeStrategy)
  const activeShot = useStore((s) => s.activeShot)
  const zenMode = useStore((s) => s.zenMode)
  const activeBeat = useStore((s) => s.activeBeat)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [isStrategyCardFlipped, setIsStrategyCardFlipped] = useState(false)
  const [isEnhancingLocal, setIsEnhancingLocal] = useState(false)
  const screenplay = useStore((s) => s.screenplay)
  const setComparePreview = useStore((s) => s.setComparePreview)
  const clearComparePreview = useStore((s) => s.clearComparePreview)

  // Get current shot image
  const getCurrentShotImage = () => {
    const strategy = strategies[activeStrategy]
    const shot = strategy?.shots?.[activeShot]
    if (shot?.image) return shot.image
    return null
  }

  // Load shot image onto canvas
  const loadShotImage = useCallback((imageSrc) => {
    const canvas = canvasRef.current
    if (!canvas || !imageSrc) return

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      const dpr = window.devicePixelRatio || 1
      const w = canvas.width / dpr
      const h = canvas.height / dpr

      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)

      // White background
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)

      // Draw image while preserving aspect ratio (letterbox if needed)
      const imgW = img.width || w
      const imgH = img.height || h
      const imgRatio = imgW / imgH
      const canvasRatio = w / h
      let drawWidth = w
      let drawHeight = h
      if (imgRatio > canvasRatio) {
        drawWidth = w
        drawHeight = w / imgRatio
      } else {
        drawHeight = h
        drawWidth = h * imgRatio
      }
      const offsetX = (w - drawWidth) / 2
      const offsetY = (h - drawHeight) / 2
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)
      ctx.restore()

      setHasDrawn(true)
      historyRef.current = []
      historyIndex.current = -1

      // Save initial state to history and update store
      const dataUrl = canvas.toDataURL('image/png')
      historyRef.current.push(dataUrl)
      historyIndex.current = 0
      setCanvasDataUrl(dataUrl)
    }
    img.src = imageSrc
  }, [])

  // When activeShot or activeStrategy changes, load the shot image
  useEffect(() => {
    const shotKey = `${activeStrategy}-${activeShot}`
    if (shotKey === loadedShotKey.current) return

    const imageSrc = getCurrentShotImage()
    if (imageSrc) {
      // Small delay to ensure canvas is sized after mount/resize
      const timer = setTimeout(() => {
        loadShotImage(imageSrc)
        loadedShotKey.current = shotKey
      }, 50)
      return () => clearTimeout(timer)
    } else {
      // No image — clear to white
      loadedShotKey.current = shotKey
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        const dpr = window.devicePixelRatio || 1
        const w = canvas.width / dpr
        const h = canvas.height / dpr
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.scale(dpr, dpr)
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
      }
      setHasDrawn(false)
      historyRef.current = []
      historyIndex.current = -1
    }
  }, [activeStrategy, activeShot, activeBeat, loadShotImage])

  // Load AI-generated/enhanced image onto canvas
  useEffect(() => {
    if (pendingCanvasImage) {
      loadShotImage(pendingCanvasImage)
      setPendingCanvasImage(null)
    }
  }, [pendingCanvasImage, loadShotImage, setPendingCanvasImage])

  // Also reload when entering zen mode (component may remount)
  useEffect(() => {
    if (zenMode) {
      loadedShotKey.current = null // Force reload
      const imageSrc = getCurrentShotImage()
      if (imageSrc) {
        setTimeout(() => loadShotImage(imageSrc), 80)
      }
    }
  }, [zenMode])

  // Draw overlay guides
  const drawOverlays = useCallback(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    const w = overlay.width / (window.devicePixelRatio || 1)
    const h = overlay.height / (window.devicePixelRatio || 1)

    ctx.clearRect(0, 0, w, h)

    if (overlays.thirds) {
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)'
      ctx.lineWidth = 1
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(w / 3, 0); ctx.lineTo(w / 3, h)
      ctx.moveTo(2 * w / 3, 0); ctx.lineTo(2 * w / 3, h)
      ctx.moveTo(0, h / 3); ctx.lineTo(w, h / 3)
      ctx.moveTo(0, 2 * h / 3); ctx.lineTo(w, 2 * h / 3)
      ctx.stroke()
      ctx.setLineDash([])
    }

    if (overlays.eyeline) {
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)'
      ctx.lineWidth = 1
      ctx.setLineDash([8, 4])
      ctx.beginPath()
      ctx.moveTo(0, h * 0.38)
      ctx.lineTo(w, h * 0.38)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [overlays])

  // Resize canvas to container with 16:9 aspect ratio
  const resizeCanvas = useCallback(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    const overlay = overlayRef.current
    if (!container || !canvas || !overlay) return

    const rect = container.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    
    // Calculate 16:9 box within container
    let w = rect.width
    let h = rect.width * (9/16)
    
    if (h > rect.height) {
      h = rect.height
      w = rect.height * (16/9)
    }

    const dpr = window.devicePixelRatio || 1

    // Save current drawing
    let tempCanvas = null
    if (canvas.width > 0 && hasDrawn) {
      tempCanvas = document.createElement('canvas')
      tempCanvas.width = canvas.width
      tempCanvas.height = canvas.height
      tempCanvas.getContext('2d').drawImage(canvas, 0, 0)
    }

    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'

    overlay.width = w * dpr
    overlay.height = h * dpr
    overlay.style.width = w + 'px'
    overlay.style.height = h + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    if (tempCanvas) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, w * dpr, h * dpr)
      ctx.restore()
    } else {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }

    const overlayCtx = overlay.getContext('2d')
    overlayCtx.scale(dpr, dpr)

    drawOverlays()
  }, [overlays, hasDrawn, drawOverlays])

  useEffect(() => {
    resizeCanvas()
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => resizeCanvas())
    ro.observe(container)
    window.addEventListener('resize', resizeCanvas)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [resizeCanvas])

  useEffect(() => {
    drawOverlays()
  }, [drawOverlays])

  useEffect(() => {
    if (!comparePreview) {
      setIsStrategyCardFlipped(false)
      return
    }
    if (!comparePreview.loading) {
      setIsStrategyCardFlipped(false)
      return
    }
    const timer = window.setTimeout(() => {
      setIsStrategyCardFlipped(true)
    }, 900)
    return () => window.clearTimeout(timer)
  }, [comparePreview?.loading, comparePreview?.createdAt, comparePreview?.shotKey])

  // Save history snapshot
  const saveHistory = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const data = canvas.toDataURL()
    historyRef.current = historyRef.current.slice(0, historyIndex.current + 1)
    historyRef.current.push(data)
    historyIndex.current = historyRef.current.length - 1
  }

  // Get position from event
  const getPos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }

  const startDrawing = (e) => {
    e.preventDefault()
    isDrawing.current = true
    lastPoint.current = getPos(e)
    setHasDrawn(true)
  }

  const draw = (e) => {
    if (!isDrawing.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const pos = getPos(e)
    const last = lastPoint.current

    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)

    if (drawingTool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out'
      ctx.lineWidth = brushSize * 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(last.x, last.y)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
    } else {
      ctx.globalCompositeOperation = 'source-over'

      if (penType === 'pencil') {
        // Pencil: thin, slightly transparent, textured feel
        ctx.strokeStyle = 'rgba(30, 30, 30, 0.7)'
        ctx.lineWidth = brushSize * 0.8
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(last.x, last.y)
        ctx.lineTo(pos.x, pos.y)
        ctx.stroke()
        // Add grain texture with offset strokes
        ctx.strokeStyle = 'rgba(60, 60, 60, 0.3)'
        ctx.lineWidth = brushSize * 0.4
        const ox = (Math.random() - 0.5) * brushSize * 0.5
        const oy = (Math.random() - 0.5) * brushSize * 0.5
        ctx.beginPath()
        ctx.moveTo(last.x + ox, last.y + oy)
        ctx.lineTo(pos.x + ox, pos.y + oy)
        ctx.stroke()
      } else if (penType === 'ink') {
        // Ink pen: sharp, full black, crisp edges
        ctx.strokeStyle = '#000000'
        ctx.lineWidth = brushSize
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(last.x, last.y)
        ctx.lineTo(pos.x, pos.y)
        ctx.stroke()
      } else if (penType === 'marker') {
        // Marker: thick, semi-transparent, flat cap
        ctx.strokeStyle = 'rgba(20, 20, 20, 0.5)'
        ctx.lineWidth = brushSize * 2.5
        ctx.lineCap = 'square'
        ctx.lineJoin = 'bevel'
        ctx.beginPath()
        ctx.moveTo(last.x, last.y)
        ctx.lineTo(pos.x, pos.y)
        ctx.stroke()
      } else if (penType === 'charcoal') {
        // Charcoal: rough, textured, multiple scattered strokes
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        const strokes = 3
        for (let i = 0; i < strokes; i++) {
          const ox = (Math.random() - 0.5) * brushSize * 1.2
          const oy = (Math.random() - 0.5) * brushSize * 1.2
          ctx.strokeStyle = `rgba(25, 25, 25, ${0.25 + Math.random() * 0.2})`
          ctx.lineWidth = brushSize * (0.6 + Math.random() * 0.8)
          ctx.beginPath()
          ctx.moveTo(last.x + ox, last.y + oy)
          ctx.lineTo(pos.x + ox, pos.y + oy)
          ctx.stroke()
        }
      }
    }

    ctx.restore()
    lastPoint.current = pos
  }

  const stopDrawing = () => {
    if (isDrawing.current) {
      isDrawing.current = false
      lastPoint.current = null
      saveHistory()
      const canvas = canvasRef.current
      if (canvas) {
        setCanvasDataUrl(canvas.toDataURL('image/png'))
      }
    }
  }

  const restoreFromHistory = (index) => {
    const img = new Image()
    img.onload = () => {
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)
      ctx.restore()
    }
    img.src = historyRef.current[index]
  }

  // Undo
  const handleUndo = () => {
    if (historyIndex.current > 0) {
      historyIndex.current--
      restoreFromHistory(historyIndex.current)
    }
  }

  // Redo
  const handleRedo = () => {
    if (historyIndex.current < historyRef.current.length - 1) {
      historyIndex.current++
      restoreFromHistory(historyIndex.current)
    }
  }

  // Clear
  const handleClear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const w = canvas.width / dpr
    const h = canvas.height / dpr
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
    saveHistory()
    setHasDrawn(false)
    setCanvasDataUrl(null)
  }

  const handleEnhance = async () => {
    if (!canvasDataUrl) return
    setIsEnhancingLocal(true)
    clearComparePreview()

    const scriptText = screenplay.map((el) => el.text).join('\n')
    const imageBase64 = canvasDataUrl.startsWith('data:') ? canvasDataUrl.split(',')[1] : canvasDataUrl
    const originalImage = canvasDataUrl

    setComparePreview({
      shotKey: `enhance-${Date.now()}`,
      originalImage,
      candidateImage: null,
      loading: true,
      strategyName: 'Enhanced Sketch',
      recommendationLine: '손그림을 같은 구도로 깔끔하게 정리합니다.',
      isEnhancePreview: true,
    })

    try {
      const result = await enhanceSketch(imageBase64, scriptText)
      const resultImage = `data:image/png;base64,${result.enhanced_image}`
      setComparePreview({
        shotKey: `enhance-${Date.now()}`,
        originalImage,
        candidateImage: resultImage,
        loading: false,
        strategyName: 'Enhanced Sketch',
        recommendationLine: '손그림을 같은 구도로 깔끔하게 정리합니다.',
        isEnhancePreview: true,
      })
    } catch (err) {
      setComparePreview({
        shotKey: `enhance-error-${Date.now()}`,
        originalImage,
        candidateImage: null,
        loading: false,
        error: err.message,
        isEnhancePreview: true,
        strategyName: 'Enhanced Sketch',
      })
    } finally {
      setIsEnhancingLocal(false)
    }
  }

  const handleApplyEnhance = () => {
    if (!comparePreview?.candidateImage || !comparePreview?.isEnhancePreview) return
    setPendingCanvasImage(comparePreview.candidateImage)
    clearComparePreview()
  }

  // Expose undo/redo/clear via event listeners on buttons
  useEffect(() => {
    const undoBtn = document.getElementById('btn-undo')
    const redoBtn = document.getElementById('btn-redo')
    const clearBtn = document.getElementById('btn-clear')
    if (undoBtn) undoBtn.addEventListener('click', handleUndo)
    if (redoBtn) redoBtn.addEventListener('click', handleRedo)
    if (clearBtn) clearBtn.addEventListener('click', handleClear)
    return () => {
      if (undoBtn) undoBtn.removeEventListener('click', handleUndo)
      if (redoBtn) redoBtn.removeEventListener('click', handleRedo)
      if (clearBtn) clearBtn.removeEventListener('click', handleClear)
    }
  }, [])

  return (
    <div className="canvas-container" ref={containerRef}>
      {/* Enhance button — top-right of canvas */}
      {hasDrawn && !comparePreview && (
        <div className="enhance-btn-wrap">
          <button
            className={`enhance-trigger-btn ${isEnhancingLocal ? 'loading' : ''}`}
            onClick={handleEnhance}
            disabled={isEnhancingLocal}
            title="Enhance sketch"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
            </svg>
            {isEnhancingLocal ? 'Enhancing…' : 'Enhance Sketch'}
          </button>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="draw-canvas"
        onMouseDown={comparePreview ? undefined : startDrawing}
        onMouseMove={comparePreview ? undefined : draw}
        onMouseUp={comparePreview ? undefined : stopDrawing}
        onMouseLeave={comparePreview ? undefined : stopDrawing}
        onTouchStart={comparePreview ? undefined : startDrawing}
        onTouchMove={comparePreview ? undefined : draw}
        onTouchEnd={comparePreview ? undefined : stopDrawing}
      />
      <canvas ref={overlayRef} className="overlay-canvas" />
      {comparePreview?.originalImage && (comparePreview?.candidateImage || comparePreview?.loading || comparePreview?.error) && (
        <div className="compare-preview-overlay">
          <div className="compare-preview-panel compare-preview-panel--left">
            <img src={comparePreview.originalImage} alt="Original storyboard" />
            <div className="compare-preview-label">Original</div>
          </div>
          <div className="compare-preview-divider" />
          <div className="compare-preview-panel compare-preview-panel--right">
            <button
              type="button"
              className={`strategy-compare-card strategy-compare-card-button ${isStrategyCardFlipped ? 'is-flipped' : ''}`}
              onClick={() => setIsStrategyCardFlipped((prev) => !prev)}
            >
              <div className="strategy-compare-card-inner">
                <div className="strategy-compare-card-face strategy-compare-card-face--front">
                  {comparePreview.loading || comparePreview.error ? (
                    <>
                      <div className="strategy-compare-card-badge">{comparePreview.error ? '오류' : '생성 중'}</div>
                      <div className="strategy-compare-card-title">
                        {comparePreview.strategyName || '선택한 전략'}
                      </div>
                      <div className="strategy-compare-card-copy">
                        {comparePreview.error
                          ? '전략 기반 생성 중 문제가 발생했습니다. 카드를 뒤집어 설명을 확인하거나 다시 시도할 수 있습니다.'
                          : '선택한 전략을 반영해 오른쪽 프레임을 다시 만드는 중입니다.'}
                      </div>
                      {comparePreview.error && (
                        <div className="strategy-compare-card-summary">
                          {comparePreview.error}
                        </div>
                      )}
                      {comparePreview.recommendationLine && (
                        <div className="strategy-compare-card-summary">
                          {comparePreview.recommendationLine}
                        </div>
                      )}
                      {!!comparePreview.changedFields?.length && (
                        <div className="strategy-compare-card-chips">
                          {comparePreview.changedFields.slice(0, 3).map((field) => (
                            <span key={field.key} className="strategy-compare-card-chip">
                              {field.label}: {field.from} → {field.to}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <img src={comparePreview.candidateImage} alt="Reframed storyboard" />
                      <div className="compare-preview-label">
                        {comparePreview.isEnhancePreview
                          ? (comparePreview.enhanceMode === 'sketch' ? 'Enhanced Sketch' : 'Photo Reference')
                          : 'Reframed'}
                      </div>
                      {!comparePreview.isEnhancePreview && (
                        <div className="strategy-compare-flip-hint">클릭해서 전략 설명 보기</div>
                      )}
                    </>
                  )}
                </div>

                <div className="strategy-compare-card-face strategy-compare-card-face--back">
                  <div className="strategy-compare-card-badge">전략 설명</div>
                  <div className="strategy-compare-card-title">
                    {comparePreview.strategyName || '선택한 전략'}
                  </div>

                  {comparePreview.recommendationLine && (
                    <div className="strategy-compare-card-section">
                      <div className="strategy-compare-card-section-label">추천 한 줄</div>
                      <div className="strategy-compare-card-section-text">{comparePreview.recommendationLine}</div>
                    </div>
                  )}

                  {comparePreview.theoryLine && (
                    <div className="strategy-compare-card-section">
                      <div className="strategy-compare-card-section-label">이론적 근거</div>
                      <div className="strategy-compare-card-section-text">{comparePreview.theoryLine}</div>
                    </div>
                  )}

                  {comparePreview.connectionLine && (
                    <div className="strategy-compare-card-section">
                      <div className="strategy-compare-card-section-label">현재 샷과의 연결</div>
                      <div className="strategy-compare-card-section-text">{comparePreview.connectionLine}</div>
                    </div>
                  )}

                  {comparePreview.effectLine && (
                    <div className="strategy-compare-card-section">
                      <div className="strategy-compare-card-section-label">예상 효과</div>
                      <div className="strategy-compare-card-section-text strategy-compare-card-section-text--strong">{comparePreview.effectLine}</div>
                    </div>
                  )}

                  {comparePreview.fullTheoryNote && (
                    <div className="strategy-compare-card-section">
                      <div className="strategy-compare-card-section-label">상세 이론 설명</div>
                      <div className="strategy-compare-card-section-text">
                        {comparePreview.source ? `${comparePreview.source}: ` : ''}{comparePreview.fullTheoryNote}
                      </div>
                    </div>
                  )}

                  <div className="strategy-compare-flip-hint strategy-compare-flip-hint--back">
                    클릭해서 이미지로 돌아가기
                  </div>
                </div>
              </div>
            </button>
          </div>
        </div>
      )}
      {/* Apply / Dismiss for enhance preview */}
      {comparePreview?.isEnhancePreview && !comparePreview?.loading && comparePreview?.candidateImage && (
        <div className="enhance-action-bar">
          <button className="enhance-action-dismiss" onClick={clearComparePreview}>Dismiss</button>
          <button className="enhance-action-apply" onClick={handleApplyEnhance}>Apply to Canvas</button>
        </div>
      )}

      {(isAnalyzing || isGenerating || isEnhancing || isEnhancingLocal) && !comparePreview && (
        <div className="scanning-overlay">
          <div className="scan-line" />
        </div>
      )}
      {!hasDrawn && !comparePreview && (
        <div className="canvas-hint">
          <div>Draw your storyboard sketch</div>
          <button className="canvas-hint-load-btn" onClick={() => loadShotImage('/img/mock_reframe.png')}>
            Load Example Sketch
          </button>
        </div>
      )}
    </div>
  )
}
