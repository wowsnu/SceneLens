import { useRef, useEffect, useCallback, useState } from 'react'
import useStore from '../store/useStore'
import { enhanceSketch, segmentLasso, segmentPrepare } from '../services/api'
import SegmentCutout from './SegmentCutout'
import './DrawingCanvas.css'

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

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
  const canvasDataUrl = useStore((s) => s.canvasDataUrl)
  const setCanvasDataUrl = useStore((s) => s.setCanvasDataUrl)
  const overlays = useStore((s) => s.overlays)
  const isAnalyzing = useStore((s) => s.isAnalyzing)
  const isGenerating = useStore((s) => s.isGenerating)
  const isEnhancing = useStore((s) => s.isEnhancing)
  const setIsEnhancing = useStore((s) => s.setIsEnhancing)
  const pendingCanvasImage = useStore((s) => s.pendingCanvasImage)
  const setPendingCanvasImage = useStore((s) => s.setPendingCanvasImage)
  const comparePreview = useStore((s) => s.comparePreview)
  const strategies = useStore((s) => s.strategies)
  const activeStrategy = useStore((s) => s.activeStrategy)
  const activeShot = useStore((s) => s.activeShot)
  const activeSceneData = useStore((s) => s.scenes[s.activeScene])
  const zenMode = useStore((s) => s.zenMode)
  const activeBeat = useStore((s) => s.activeBeat)
  const activeFlowBranchIndex = activeSceneData?.activeBranch ?? 0
  const activeFlowBranch = activeSceneData?.branches?.[activeFlowBranchIndex]
  const activeFlowShot = activeFlowBranch?.shots?.[activeSceneData?.activeShot ?? activeShot]
  const activeFlowShotKey = `${activeSceneData?.id || 'scene'}-${activeFlowBranch?.id || activeStrategy}-${activeFlowShot?.id || activeShot}`
  const [hasDrawn, setHasDrawn] = useState(false)
  const [isStrategyCardFlipped, setIsStrategyCardFlipped] = useState(false)
  const [refSlideIdx, setRefSlideIdx] = useState(0)
  const [isEnhancingLocal, setIsEnhancingLocal] = useState(false)
  // 비교 오버레이를 뒤 캔버스와 정렬하되, 높이는 원본 스케치 비율에 맞춰 줄인다
  const [canvasBox, setCanvasBox] = useState(null) // { left, top, width, height } (컨테이너 기준)
  const [compareImgAspect, setCompareImgAspect] = useState(null) // 원본 이미지 w/h
  const [zoomedImage, setZoomedImage] = useState(null) // { src, label } — 확대(라이트박스)로 볼 이미지
  const screenplay = useStore((s) => s.screenplay)
  const setComparePreview = useStore((s) => s.setComparePreview)
  const clearComparePreview = useStore((s) => s.clearComparePreview)

  // ── Segmentation state ─────────────────────────────────────
  const segmentSession = useStore((s) => s.segmentSession)
  const setSegmentSession = useStore((s) => s.setSegmentSession)
  const segmentStatus = useStore((s) => s.segmentStatus)
  const setSegmentStatus = useStore((s) => s.setSegmentStatus)
  const activeCutout = useStore((s) => s.activeCutout)
  const setActiveCutout = useStore((s) => s.setActiveCutout)
  // Live lasso polygon currently being drawn on the overlay
  const lassoPointsRef = useRef([])  // array of {x, y} in css px
  const isLassoDragging = useRef(false)

  // Get current shot image
  const getCurrentShotImage = useCallback(() => {
    if (activeFlowShot?.image) return activeFlowShot.image
    const strategy = strategies[activeStrategy]
    const shot = strategy?.shots?.[activeShot]
    if (shot?.image) return shot.image
    return null
  }, [activeFlowShot, activeShot, activeStrategy, strategies])

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
  }, [setCanvasDataUrl])

  // When activeShot or activeStrategy changes, load the shot image
  useEffect(() => {
    if (activeFlowShotKey === loadedShotKey.current) return

    const imageSrc = getCurrentShotImage()
    if (imageSrc) {
      // Small delay to ensure canvas is sized after mount/resize
      const timer = setTimeout(() => {
        loadShotImage(imageSrc)
        loadedShotKey.current = activeFlowShotKey
      }, 50)
      return () => clearTimeout(timer)
    } else {
      // No image — clear to white
      loadedShotKey.current = activeFlowShotKey
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
  }, [activeFlowShotKey, activeShot, activeBeat, getCurrentShotImage, loadShotImage])

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
  }, [zenMode, getCurrentShotImage, loadShotImage])

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
  }, [hasDrawn, drawOverlays])

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

  // 뒤 캔버스의 위치·크기(컨테이너 기준)를 측정 → 비교 오버레이를 같은 자리에 겹친다
  const measureCanvasBox = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const c = canvas.getBoundingClientRect()
    const p = container.getBoundingClientRect()
    if (c.width === 0 || c.height === 0) return
    setCanvasBox({
      left: c.left - p.left,
      top: c.top - p.top,
      width: c.width,
      height: c.height,
    })
  }, [])

  // 비교 모드 진입/리사이즈 시 캔버스 박스를 다시 측정
  useEffect(() => {
    if (!comparePreview) return
    measureCanvasBox()
    // 레이아웃이 안정화된 다음 프레임에 한 번 더 측정(진입 직후 위치 어긋남 방지)
    const raf = requestAnimationFrame(measureCanvasBox)
    window.addEventListener('resize', measureCanvasBox)
    const canvas = canvasRef.current
    const ro = canvas ? new ResizeObserver(measureCanvasBox) : null
    if (canvas && ro) ro.observe(canvas)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measureCanvasBox)
      ro?.disconnect()
    }
  }, [comparePreview, measureCanvasBox])

  // 확대 보기: Esc로 닫기
  useEffect(() => {
    if (!zoomedImage) return
    const onKey = (e) => { if (e.key === 'Escape') setZoomedImage(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomedImage])

  // 원본 이미지의 실제 비율 측정 → 오버레이 높이를 스케치에 딱 맞게 줄인다
  useEffect(() => {
    const src = comparePreview?.originalImage
    if (!src) { setCompareImgAspect(null); return }
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (!cancelled && img.naturalWidth && img.naturalHeight) {
        setCompareImgAspect(img.naturalWidth / img.naturalHeight)
      }
    }
    img.src = src
    return () => { cancelled = true }
  }, [comparePreview?.originalImage])

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
  }, [comparePreview])

  // Save history snapshot
  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const data = canvas.toDataURL()
    historyRef.current = historyRef.current.slice(0, historyIndex.current + 1)
    historyRef.current.push(data)
    historyIndex.current = historyRef.current.length - 1
  }, [])

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

  // ── Segmentation helpers ──────────────────────────────────

  // Re-prepare a server-side session for the current canvas image.
  // Lazy: called when entering segment mode or after the canvas changes.
  const ensureSegmentSession = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const dataUrl = canvas.toDataURL('image/png')
    if (segmentSession && segmentSession.sourceDataUrl === dataUrl) {
      return segmentSession
    }
    setSegmentStatus('preparing')
    try {
      const b64 = dataUrl.split(',')[1]
      const res = await segmentPrepare(b64, 'png')
      const sess = {
        id: res.session_id,
        imageWidth: res.image_size[0],
        imageHeight: res.image_size[1],
        sourceDataUrl: dataUrl,
      }
      setSegmentSession(sess)
      setSegmentStatus('ready')
      return sess
    } catch (err) {
      console.error('[segment] prepare failed', err)
      setSegmentStatus('error')
      return null
    }
  }, [segmentSession, setSegmentSession, setSegmentStatus])

  // Auto-prepare when entering segment mode
  useEffect(() => {
    if (drawingTool !== 'segment') return
    if (segmentStatus === 'preparing' || activeCutout) return
    const canvas = canvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL('image/png')
    if (segmentSession && segmentSession.sourceDataUrl === dataUrl) return
    ensureSegmentSession()
  }, [drawingTool, segmentSession, segmentStatus, activeCutout, ensureSegmentSession])

  // Drop the cached server session if we leave segment mode without an active cutout
  useEffect(() => {
    if (drawingTool !== 'segment' && !activeCutout && segmentSession) {
      // keep session alive briefly; cheap to drop, but server has a 30min TTL anyway
    }
  }, [drawingTool, activeCutout, segmentSession])

  // Draw the live lasso polygon on the overlay canvas
  const drawLasso = useCallback(() => {
    const overlay = overlayRef.current
    if (!overlay) return
    const ctx = overlay.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const w = overlay.width / dpr
    const h = overlay.height / dpr

    // Repaint guides first then lasso on top
    ctx.clearRect(0, 0, w, h)
    drawOverlays()

    const pts = lassoPointsRef.current
    if (!pts || pts.length < 2) return
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    if (!isLassoDragging.current) ctx.closePath()
    ctx.fillStyle = 'rgba(59, 130, 246, 0.10)'
    if (!isLassoDragging.current) ctx.fill()
    ctx.strokeStyle = 'rgba(37, 99, 235, 0.95)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 4])
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }, [drawOverlays])

  // Convert mask PNG (any size) + canvas content into a cutout RGBA dataURL
  // and the original-patch dataURL (for restore on cancel). Also clears the
  // canvas under the mask so the cutout looks lifted off.
  const performLassoSegment = useCallback(async (cssPoints) => {
    const canvas = canvasRef.current
    if (!canvas || !cssPoints || cssPoints.length < 3) return
    const dpr = window.devicePixelRatio || 1
    const cssW = canvas.width / dpr
    const cssH = canvas.height / dpr

    const sess = await ensureSegmentSession()
    if (!sess) return

    // CSS -> server image coordinates
    const sxRatio = sess.imageWidth / cssW
    const syRatio = sess.imageHeight / cssH

    // Downsample to keep payload small (every Nth point), then map to image px
    const stride = Math.max(1, Math.floor(cssPoints.length / 200))
    const polygon = []
    for (let i = 0; i < cssPoints.length; i += stride) {
      const p = cssPoints[i]
      polygon.push([
        Math.round(Math.max(0, Math.min(cssW, p.x)) * sxRatio),
        Math.round(Math.max(0, Math.min(cssH, p.y)) * syRatio),
      ])
    }
    if (polygon.length < 3) return

    setSegmentStatus('segmenting')
    let res
    try {
      res = await segmentLasso(sess.id, polygon, false)
    } catch (err) {
      console.error('[segment] lasso failed', err)
      setSegmentStatus('ready')
      return
    }
    if (!res?.candidates?.length) {
      setSegmentStatus('ready')
      return
    }
    const top = res.candidates[0]

    // Decode the mask PNG (server-image coordinates)
    const maskImg = await loadImage(`data:image/png;base64,${top.mask_png}`)

    // Build a tight-bbox RGBA cutout in canvas (device px) space
    const bb = top.bbox // [x, y, w, h] in server image coords

    // Use precise per-axis css
    const cutCssX = bb[0] * (cssW / sess.imageWidth)
    const cutCssY = bb[1] * (cssH / sess.imageHeight)
    const cutCssW = bb[2] * (cssW / sess.imageWidth)
    const cutCssH = bb[3] * (cssH / sess.imageHeight)

    // Render at device pixel resolution for crispness
    const cutDevW = Math.max(1, Math.round(cutCssW * dpr))
    const cutDevH = Math.max(1, Math.round(cutCssH * dpr))

    // 1) Build an RGBA cutout (canvas patch * mask alpha)
    const cutoutCanvas = document.createElement('canvas')
    cutoutCanvas.width = cutDevW
    cutoutCanvas.height = cutDevH
    const cctx = cutoutCanvas.getContext('2d')

    // Source patch from main canvas (in device px)
    const srcDevX = Math.round(cutCssX * dpr)
    const srcDevY = Math.round(cutCssY * dpr)
    cctx.drawImage(
      canvas,
      srcDevX, srcDevY, cutDevW, cutDevH,
      0, 0, cutDevW, cutDevH
    )

    // Mask: scale up from server-image coords to device px of the cutout.
    // The mask PNG is 1-bit (black/white) — we need to turn white pixels into
    // opaque alpha and black pixels into transparent so destination-in works.
    const maskCrop = document.createElement('canvas')
    maskCrop.width = cutDevW
    maskCrop.height = cutDevH
    const mctx = maskCrop.getContext('2d')
    mctx.imageSmoothingEnabled = false
    mctx.drawImage(
      maskImg,
      bb[0], bb[1], bb[2], bb[3],
      0, 0, cutDevW, cutDevH
    )
    // Convert luminance → alpha so the mask actually masks
    const md = mctx.getImageData(0, 0, cutDevW, cutDevH)
    for (let i = 0; i < md.data.length; i += 4) {
      md.data[i + 3] = md.data[i]   // alpha = R (luminance for 1-bit PNG)
    }
    mctx.putImageData(md, 0, 0)

    // Apply mask as alpha (destination-in)
    cctx.globalCompositeOperation = 'destination-in'
    cctx.drawImage(maskCrop, 0, 0)
    cctx.globalCompositeOperation = 'source-over'

    const cutoutDataUrl = cutoutCanvas.toDataURL('image/png')

    // 2) Snapshot the original patch (full rectangle of bbox) for cancel-restore
    const patchCanvas = document.createElement('canvas')
    patchCanvas.width = cutDevW
    patchCanvas.height = cutDevH
    patchCanvas.getContext('2d').drawImage(
      canvas,
      srcDevX, srcDevY, cutDevW, cutDevH,
      0, 0, cutDevW, cutDevH
    )
    const patchDataUrl = patchCanvas.toDataURL('image/png')

    // 3) Erase the masked area on the main canvas (so cutout looks lifted)
    const ctx = canvas.getContext('2d')
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    // Build an inverted alpha (the mask region) to erase
    ctx.globalCompositeOperation = 'destination-out'
    ctx.drawImage(maskCrop, srcDevX, srcDevY, cutDevW, cutDevH)
    ctx.globalCompositeOperation = 'source-over'
    // Fill the erased area with white so the canvas stays opaque
    ctx.fillStyle = '#ffffff'
    // Use the same mask shape: paint white only where alpha was just removed.
    // Trick: draw mask into a temp white-on-mask canvas and blit normally.
    const whiteFill = document.createElement('canvas')
    whiteFill.width = cutDevW
    whiteFill.height = cutDevH
    const wctx = whiteFill.getContext('2d')
    wctx.fillStyle = '#ffffff'
    wctx.fillRect(0, 0, cutDevW, cutDevH)
    wctx.globalCompositeOperation = 'destination-in'
    wctx.drawImage(maskCrop, 0, 0)
    ctx.drawImage(whiteFill, srcDevX, srcDevY)
    ctx.restore()

    setCanvasDataUrl(canvas.toDataURL('image/png'))

    setActiveCutout({
      dataUrl: cutoutDataUrl,
      bbox: { x: cutCssX, y: cutCssY, w: cutCssW, h: cutCssH },
      originalPatchDataUrl: patchDataUrl,
      originalCanvasRect: { x: srcDevX, y: srcDevY, w: cutDevW, h: cutDevH },
    })
    setSegmentStatus('ready')
  }, [ensureSegmentSession, setActiveCutout, setCanvasDataUrl, setSegmentStatus])

  // Confirm: draw the cutout onto the main canvas at its current position/size
  const confirmCutout = useCallback((cssX, cssY, cssW, cssH) => {
    const canvas = canvasRef.current
    if (!canvas || !activeCutout) return
    const dpr = window.devicePixelRatio || 1
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(
        img,
        Math.round(cssX * dpr), Math.round(cssY * dpr),
        Math.max(1, Math.round(cssW * dpr)), Math.max(1, Math.round(cssH * dpr))
      )
      ctx.restore()
      saveHistory()
      setCanvasDataUrl(canvas.toDataURL('image/png'))
      setActiveCutout(null)
      // The canvas has changed → invalidate the prepared session so
      // the next segment uses the current pixels.
      setSegmentSession(null)
      setSegmentStatus('idle')
    }
    img.src = activeCutout.dataUrl
  }, [activeCutout, saveHistory, setActiveCutout, setCanvasDataUrl, setSegmentSession, setSegmentStatus])

  // Cancel: restore the original patch and discard the cutout
  const cancelCutout = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || !activeCutout) return
    const { originalPatchDataUrl, originalCanvasRect } = activeCutout
    const img = new Image()
    img.onload = () => {
      const ctx = canvas.getContext('2d')
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(
        img,
        originalCanvasRect.x, originalCanvasRect.y,
        originalCanvasRect.w, originalCanvasRect.h
      )
      ctx.restore()
      setCanvasDataUrl(canvas.toDataURL('image/png'))
      setActiveCutout(null)
    }
    img.src = originalPatchDataUrl
  }, [activeCutout, setActiveCutout, setCanvasDataUrl])

  const startDrawing = (e) => {
    if (drawingTool === 'segment') {
      if (activeCutout) return // cutout active → don't start a new lasso
      e.preventDefault()
      isLassoDragging.current = true
      const { x, y } = getPos(e)
      lassoPointsRef.current = [{ x, y }]
      drawLasso()
      return
    }
    e.preventDefault()
    isDrawing.current = true
    lastPoint.current = getPos(e)
    setHasDrawn(true)
  }

  const draw = (e) => {
    if (drawingTool === 'segment') {
      if (!isLassoDragging.current) return
      e.preventDefault()
      const { x, y } = getPos(e)
      const pts = lassoPointsRef.current
      const last = pts[pts.length - 1]
      // Skip near-duplicate points to keep the polygon manageable
      if (!last || Math.abs(last.x - x) + Math.abs(last.y - y) > 1.5) {
        pts.push({ x, y })
        drawLasso()
      }
      return
    }
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
    if (isLassoDragging.current) {
      isLassoDragging.current = false
      const pts = lassoPointsRef.current
      lassoPointsRef.current = []
      drawLasso()
      // Need at least 3 points and a non-degenerate area to segment
      if (pts && pts.length >= 3) {
        let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y
        for (const p of pts) {
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
          if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
        }
        if (maxX - minX > 5 && maxY - minY > 5) {
          performLassoSegment(pts)
        }
      }
      return
    }
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

  const restoreFromHistory = useCallback((index) => {
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
  }, [])

  // Undo
  const handleUndo = useCallback(() => {
    if (historyIndex.current > 0) {
      historyIndex.current--
      restoreFromHistory(historyIndex.current)
    }
  }, [restoreFromHistory])

  // Redo
  const handleRedo = useCallback(() => {
    if (historyIndex.current < historyRef.current.length - 1) {
      historyIndex.current++
      restoreFromHistory(historyIndex.current)
    }
  }, [restoreFromHistory])

  // Clear
  const handleClear = useCallback(() => {
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
  }, [saveHistory, setCanvasDataUrl])

  const handleEnhance = async () => {
    if (!canvasDataUrl) return
    setIsEnhancing(true)
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
      setIsEnhancing(false)
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
  }, [handleClear, handleRedo, handleUndo])

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

      {activeCutout && (
        <SegmentCutout
          cutout={activeCutout}
          onConfirm={confirmCutout}
          onCancel={cancelCutout}
        />
      )}

      {drawingTool === 'segment' && segmentStatus !== 'idle' && (
        <div className="segment-status-pill">
          {segmentStatus === 'preparing' && 'Preparing image…'}
          {segmentStatus === 'segmenting' && 'Segmenting…'}
          {segmentStatus === 'error' && 'Segmentation error'}
          {segmentStatus === 'ready' && !activeCutout && 'Trace around an object (lasso)'}
        </div>
      )}
      {comparePreview?.originalImage && (comparePreview?.candidateImage || comparePreview?.loading || comparePreview?.error) && (
        <div
          className="compare-preview-overlay"
          style={canvasBox ? (() => {
            // 패널 폭 = (전체폭 - divider 2px) / 2. 높이는 원본 이미지 비율에 맞춤.
            const panelW = (canvasBox.width - 2) / 2
            const aspect = compareImgAspect || (16 / 9)
            let boxH = panelW / aspect
            if (boxH > canvasBox.height) boxH = canvasBox.height // 캔버스보다 커지지 않게
            // 캔버스 영역 상단에 붙여 정렬 → 줄어든 높이만큼 하단이 비어 IntentBar에 안 가림
            const top = canvasBox.top
            return {
              left: canvasBox.left,
              top,
              width: canvasBox.width,
              height: boxH,
              right: 'auto',
              bottom: 'auto',
              margin: 0,
              aspectRatio: 'auto',
              maxWidth: 'none',
              maxHeight: 'none',
            }
          })() : undefined}
        >
          <div className="compare-preview-panel compare-preview-panel--left">
            <img src={comparePreview.originalImage} alt="Original storyboard" />
            <div className="compare-preview-label">Original</div>
            <button
              type="button"
              className="compare-zoom-btn"
              title="확대해서 보기"
              onClick={(e) => { e.stopPropagation(); setZoomedImage({ src: comparePreview.originalImage, label: 'Original' }) }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /><path d="M11 8v6M8 11h6" />
              </svg>
            </button>
          </div>
          <div className="compare-preview-divider" />
          <div className="compare-preview-panel compare-preview-panel--right">
            <button
              type="button"
              className={`strategy-compare-card strategy-compare-card-button ${isStrategyCardFlipped ? 'is-flipped' : ''}`}
              onClick={() => setIsStrategyCardFlipped((prev) => !prev)}
            >
              <div className="strategy-compare-card-inner">
                <div className={`strategy-compare-card-face strategy-compare-card-face--front${comparePreview.loading ? ' strategy-compare-card-face--loading' : ''}`}>
                  {comparePreview.loading || comparePreview.error ? (
                    <>
                      {comparePreview.filmRefs?.length > 0 && (
                        <div className="compare-loading-refs">
                          {(() => {
                            const ref = comparePreview.filmRefs[refSlideIdx]
                            const total = comparePreview.filmRefs.length
                            return (
                              <>
                                <img src={ref.src} alt={ref.title} onError={(e) => { e.target.style.display = 'none' }} />
                                <div className="compare-loading-nav">
                                  <button className="compare-loading-nav-btn" onClick={(e) => { e.stopPropagation(); setRefSlideIdx((prev) => (prev - 1 + total) % total) }}>‹</button>
                                  <div className="compare-loading-dots">
                                    {comparePreview.filmRefs.map((_, i) => (
                                      <div key={i} className={`compare-loading-dot ${i === refSlideIdx ? 'is-active' : ''}`} />
                                    ))}
                                  </div>
                                  <button className="compare-loading-nav-btn" onClick={(e) => { e.stopPropagation(); setRefSlideIdx((prev) => (prev + 1) % total) }}>›</button>
                                </div>
                              </>
                            )
                          })()}
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
                      <span
                        role="button"
                        tabIndex={0}
                        className="compare-zoom-btn"
                        title="확대해서 보기"
                        onClick={(e) => {
                          e.stopPropagation()
                          const label = comparePreview.isEnhancePreview
                            ? (comparePreview.enhanceMode === 'sketch' ? 'Enhanced Sketch' : 'Photo Reference')
                            : 'Reframed'
                          setZoomedImage({ src: comparePreview.candidateImage, label })
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setZoomedImage({ src: comparePreview.candidateImage, label: 'Reframed' }) } }}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /><path d="M11 8v6M8 11h6" />
                        </svg>
                      </span>
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

                  {!!comparePreview.changedFields?.length && (
                    <div className="strategy-compare-card-chips" style={{ marginTop: 'auto' }}>
                      {comparePreview.changedFields.slice(0, 3).map((field) => (
                        <span key={field.key} className="strategy-compare-card-chip">
                          {field.label}: {field.from} → {field.to}
                        </span>
                      ))}
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
      {/* 확대 보기(라이트박스) — 배경/X/Esc로 닫기 */}
      {zoomedImage && (
        <div className="compare-zoom-lightbox" onClick={() => setZoomedImage(null)}>
          <button
            type="button"
            className="compare-zoom-close"
            title="닫기 (Esc)"
            onClick={(e) => { e.stopPropagation(); setZoomedImage(null) }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
          <div className="compare-zoom-stage" onClick={(e) => e.stopPropagation()}>
            <img src={zoomedImage.src} alt={zoomedImage.label} />
            <div className="compare-zoom-label">{zoomedImage.label}</div>
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
          <button className="canvas-hint-load-btn" onClick={() => loadShotImage('/img/uploadexample.png')}>
            Load Example Sketch
          </button>
        </div>
      )}
    </div>
  )
}
