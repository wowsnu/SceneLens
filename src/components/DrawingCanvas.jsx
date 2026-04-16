import { useRef, useEffect, useCallback, useState } from 'react'
import useStore from '../store/useStore'
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
      {comparePreview?.originalImage && comparePreview?.candidateImage && (
        <div className="compare-preview-overlay">
          <div className="compare-preview-panel compare-preview-panel--left">
            <img src={comparePreview.originalImage} alt="Original storyboard" />
            <div className="compare-preview-label">Original</div>
          </div>
          <div className="compare-preview-divider" />
          <div className="compare-preview-panel compare-preview-panel--right">
            <img src={comparePreview.candidateImage} alt="Reframed storyboard" />
            <div className="compare-preview-label">Reframed</div>
          </div>
        </div>
      )}
      {(isAnalyzing || isGenerating || isEnhancing) && (
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
