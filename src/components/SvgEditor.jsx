import { useState, useRef, useEffect, useCallback } from 'react'
import { Canvas as FabricCanvas, ActiveSelection, Group, loadSVGFromString, PencilBrush, FabricImage } from 'fabric'
import { generateSketch, generateSvgLayers } from '../services/api'
import useStore from '../store/useStore'
import mockReframe from '../assets/mock_reframe.png'
import './SvgEditor.css'

const MODES = { SELECT: 'select', LASSO: 'lasso', PEN: 'pen', ERASER: 'eraser' }

const LAYER_COLORS = {
  background: '#4a9eff',
  character: '#ff6b6b',
  props: '#ffd93d',
  foreground: '#6bcb77',
}

const getLayerColor = (name) => {
  if (LAYER_COLORS[name]) return LAYER_COLORS[name]
  const base = name.split(':')[0]
  return LAYER_COLORS[base] || '#888'
}

const DEFAULT_LAYERS = ['background', 'character']

/* ── Geometry ──────────────────────────────────────────── */
const pointInPoly = (pt, poly) => {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const { x: xi, y: yi } = poly[i], { x: xj, y: yj } = poly[j]
    if ((yi > pt.y) !== (yj > pt.y) && pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi)
      inside = !inside
  }
  return inside
}

const isObjInsideLasso = (obj, poly) => {
  if (poly.length < 3) return false
  const b = obj.getBoundingRect()
  const mx = b.left + b.width / 2, my = b.top + b.height / 2
  const samples = [
    { x: mx, y: my },
    { x: b.left, y: b.top },
    { x: b.left + b.width, y: b.top },
    { x: b.left, y: b.top + b.height },
    { x: b.left + b.width, y: b.top + b.height },
    { x: mx, y: b.top },
    { x: mx, y: b.top + b.height },
    { x: b.left, y: my },
    { x: b.left + b.width, y: my },
  ]
  const insideCount = samples.filter(p => pointInPoly(p, poly)).length
  if (b.width < 8 && b.height < 8) return insideCount >= 1
  return insideCount >= 3
}

/* ── Component ─────────────────────────────────────────── */
export default function SvgEditor({ onSaveAndMap, showScript, onToggleScript, scriptPanel }) {
  const screenplay = useStore((s) => s.screenplay)
  const getFabricJson = useStore((s) => s.getFabricJson)
  const setFabricJson = useStore((s) => s.setFabricJson)
  const activeStrategy = useStore((s) => s.activeStrategy)
  const activeShot = useStore((s) => s.activeShot)
  const strategies = useStore((s) => s.strategies)
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const wrapRef = useRef(null)
  const fabricRef = useRef(null)
  const guardRef = useRef(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [, setSvgRaw] = useState(null)
  const [, setLayers] = useState([])
  const [, setSelectedLayer] = useState(null)
  const [intent, setIntent] = useState('')
  const [mode, setMode] = useState(MODES.PEN)
  const [selInfo, setSelInfo] = useState(null)

  // Undo/Redo history
  const historyRef = useRef([])
  const historyIndexRef = useRef(-1)
  const isUndoRedoRef = useRef(false)

  // Layer-based generation
  const [genMode, setGenMode] = useState('layers') // 'single' | 'layers'
  const [layerNames, setLayerNames] = useState(DEFAULT_LAYERS)
  const [layerInput, setLayerInput] = useState('')
  const [detailLevel, setDetailLevel] = useState(50) // 0=simple, 100=detailed
  const [penSize, setPenSize] = useState(3)
  const [showGenPanel, setShowGenPanel] = useState(false)

  const drawingRef = useRef(false)
  const ptsRef = useRef([])

  /* ── Selection info sync ────────────────────────────── */
  const syncSel = useCallback(() => {
    const fc = fabricRef.current
    if (!fc) { setSelInfo(null); return }
    const a = fc.getActiveObject()
    if (!a) { setSelInfo(null); return }
    const isGrp = a instanceof Group && !(a instanceof ActiveSelection)
    const isMulti = a instanceof ActiveSelection
    const count = (isMulti || isGrp) ? a.getObjects().length : 1
    setSelInfo({ count, isGroup: isGrp, isMulti })
  }, [])

  /* ── Undo/Redo helpers ──────────────────────────────── */
  const saveHistory = useCallback(() => {
    const fc = fabricRef.current
    if (!fc || isUndoRedoRef.current) return
    const json = JSON.stringify(fc.toJSON())
    // Truncate any redo states ahead
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1)
    historyRef.current.push(json)
    if (historyRef.current.length > 50) historyRef.current.shift()
    historyIndexRef.current = historyRef.current.length - 1
  }, [])

  const handleUndo = useCallback(() => {
    const fc = fabricRef.current
    if (!fc || historyIndexRef.current <= 0) return
    historyIndexRef.current -= 1
    isUndoRedoRef.current = true
    fc.loadFromJSON(JSON.parse(historyRef.current[historyIndexRef.current]), () => {
      fc.renderAll()
      isUndoRedoRef.current = false
    })
  }, [])

  const handleRedo = useCallback(() => {
    const fc = fabricRef.current
    if (!fc || historyIndexRef.current >= historyRef.current.length - 1) return
    historyIndexRef.current += 1
    isUndoRedoRef.current = true
    fc.loadFromJSON(JSON.parse(historyRef.current[historyIndexRef.current]), () => {
      fc.renderAll()
      isUndoRedoRef.current = false
    })
  }, [])

  /* ── Rebuild layers ─────────────────────────────────── */
  const rebuildLayers = useCallback(() => {
    const fc = fabricRef.current
    if (!fc) return
    const newLayers = fc.getObjects().map((obj, i) => {
      const isGrp = obj instanceof Group && !(obj instanceof ActiveSelection)
      const n = isGrp ? obj.getObjects().length : 0
      const tag = isGrp ? 'group' : (obj.type || 'path')
      const fill = obj.fill || 'none'
      const layerName = obj._layerName
      return {
        id: `layer-${i}`,
        name: layerName
          ? `${layerName} (${n} paths)`
          : isGrp ? `📦 Group (${n} paths)` : `${tag}-${i} (${fill})`,
        visible: obj.visible !== false, object: obj, isGroup: isGrp,
        layerName,
      }
    })
    setLayers(newLayers)
  }, [])

  /* ── Draw lasso on overlay canvas ── */
  const drawLassoOverlay = useCallback((pts, closed = false) => {
    const cvs = overlayRef.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    ctx.clearRect(0, 0, cvs.width, cvs.height)
    if (pts.length < 2) return

    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
    if (closed) ctx.closePath()

    ctx.fillStyle = 'rgba(100, 160, 255, 0.08)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(100, 160, 255, 0.7)'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.stroke()
    ctx.setLineDash([])

    if (pts.length > 5) {
      ctx.beginPath()
      ctx.arc(pts[0].x, pts[0].y, 4, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(76, 175, 80, 0.8)'
      ctx.fill()
      const last = pts[pts.length - 1]
      ctx.beginPath()
      ctx.arc(last.x, last.y, 3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(100, 160, 255, 0.9)'
      ctx.fill()
    }
  }, [])

  const clearOverlay = useCallback(() => {
    const cvs = overlayRef.current
    if (!cvs) return
    cvs.getContext('2d').clearRect(0, 0, cvs.width, cvs.height)
  }, [])

  /* ── Init Fabric canvas ─────────────────────────────── */
  useEffect(() => {
    if (!canvasRef.current) return
    const w = wrapRef.current?.clientWidth || 820
    const h = Math.round(w * 9 / 16)
    const fc = new FabricCanvas(canvasRef.current, {
      width: w, height: h, backgroundColor: '#ffffff', selection: true,
      subTargetCheck: true,
    })
    fabricRef.current = fc

    if (overlayRef.current) {
      overlayRef.current.width = w
      overlayRef.current.height = h
    }

    const onSel = () => { if (!guardRef.current) syncSel() }
    const onClr = () => { if (!guardRef.current) { setSelectedLayer(null); syncSel() } }
    fc.on('selection:created', onSel)
    fc.on('selection:updated', onSel)
    fc.on('selection:cleared', onClr)

    // Save history on modifications
    fc.on('object:added', () => saveHistory())
    fc.on('object:modified', () => saveHistory())
    fc.on('object:removed', () => saveHistory())
    // Save initial state
    saveHistory()

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const nw = Math.floor(entry.contentRect.width)
      const nh = Math.round(nw * 9 / 16)
      if (nw <= 0 || nh <= 0) return
      const ow = fc.width, oh = fc.height
      if (nw === ow && nh === oh) return

      const sx = nw / ow, sy = nh / oh
      fc.getObjects().forEach(o => {
        o.set({
          left: o.left * sx, top: o.top * sy,
          scaleX: (o.scaleX || 1) * sx, scaleY: (o.scaleY || 1) * sy,
        })
        o.setCoords()
      })

      fc.setDimensions({ width: nw, height: nh })
      if (overlayRef.current) {
        overlayRef.current.width = nw
        overlayRef.current.height = nh
      }
      fc.renderAll()
    })
    if (wrapRef.current) ro.observe(wrapRef.current)

    // Delete selected objects on Backspace/Delete
    const handleKeyDown = (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        // Don't delete if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
        const active = fc.getActiveObjects()
        if (active.length > 0) {
          e.preventDefault()
          active.forEach((obj) => fc.remove(obj))
          fc.discardActiveObject()
          fc.renderAll()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      // Save canvas state before unmount
      try { useStore.getState().setFabricJson(fc.toJSON()) } catch { /* ignore */ }
      document.removeEventListener('keydown', handleKeyDown); ro.disconnect(); fc.dispose(); fabricRef.current = null
    }
  }, [saveHistory, syncSel])

  /* ── Mode switching ─────────────────────────────────── */
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return

    // Reset drawing mode
    fc.isDrawingMode = false
    fc.selection = false

    if (mode === MODES.LASSO) {
      fc.discardActiveObject()
      fc.forEachObject(o => { o.selectable = false })
      fc.defaultCursor = 'crosshair'
      fc.hoverCursor = 'crosshair'
    } else if (mode === MODES.PEN) {
      fc.isDrawingMode = true
      const brush = new PencilBrush(fc)
      brush.color = '#000000'
      brush.width = penSize
      fc.freeDrawingBrush = brush
      fc.forEachObject(o => { o.selectable = false })
    } else if (mode === MODES.ERASER) {
      fc.discardActiveObject()
      fc.forEachObject(o => { o.selectable = false })
      fc.defaultCursor = 'crosshair'
      fc.hoverCursor = 'crosshair'
    } else {
      fc.selection = true
      fc.forEachObject(o => { o.selectable = true })
      fc.defaultCursor = 'default'
      fc.hoverCursor = 'move'
    }
    fc.renderAll()
  }, [mode, penSize])

  /* ── Lasso mouse handlers ── */
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return

    const onDown = (opt) => {
      if (mode !== MODES.LASSO) return
      const pt = opt.scenePoint || opt.viewportPoint
      if (!pt) return
      drawingRef.current = true
      ptsRef.current = [{ x: pt.x, y: pt.y }]
    }

    const onMove = (opt) => {
      if (!drawingRef.current || mode !== MODES.LASSO) return
      const pt = opt.scenePoint || opt.viewportPoint
      if (!pt) return
      ptsRef.current.push({ x: pt.x, y: pt.y })
      drawLassoOverlay(ptsRef.current, false)
    }

    const onUp = () => {
      if (!drawingRef.current || mode !== MODES.LASSO) return
      drawingRef.current = false
      clearOverlay()

      const pts = ptsRef.current
      if (pts.length < 8) { ptsRef.current = []; return }

      const inside = fc.getObjects().filter(obj => {
        if (obj.visible === false) return false
        return isObjInsideLasso(obj, pts)
      })

      if (inside.length > 0) {
        setMode(MODES.SELECT)
        fc.selection = true
        fc.forEachObject(o => { o.selectable = true })
        fc.defaultCursor = 'default'
        fc.hoverCursor = 'move'
        guardRef.current = true
        const sel = new ActiveSelection(inside, { canvas: fc })
        fc.setActiveObject(sel)
        fc.requestRenderAll()
        syncSel()
        requestAnimationFrame(() => { guardRef.current = false })
      }
      ptsRef.current = []
    }

    fc.on('mouse:down', onDown)
    fc.on('mouse:move', onMove)
    fc.on('mouse:up', onUp)
    return () => { fc.off('mouse:down', onDown); fc.off('mouse:move', onMove); fc.off('mouse:up', onUp) }
  }, [mode, syncSel, drawLassoOverlay, clearOverlay])

  /* ── Selection refinement: Alt+click remove, Shift+click add ── */
  const altClickRef = useRef(null)

  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return

    const onDown = (opt) => {
      if (mode !== MODES.SELECT) return
      const e = opt.e
      const active = fc.getActiveObject()

      if (e.altKey && active instanceof ActiveSelection) {
        const sub = opt.subTargets?.[0]
        if (sub) {
          altClickRef.current = {
            objectsSnapshot: active.getObjects().slice(),
            targetToRemove: sub,
          }
        }
        return
      }

      if (e.shiftKey && opt.target && active) {
        const clicked = opt.target
        if (clicked === active) return
        if (active instanceof ActiveSelection && active.getObjects().includes(clicked)) return

        const currentObjs = active instanceof ActiveSelection
          ? active.getObjects().slice()
          : [active]

        if (!currentObjs.includes(clicked)) {
          currentObjs.push(clicked)
          guardRef.current = true
          fc.discardActiveObject()
          const newSel = new ActiveSelection(currentObjs, { canvas: fc })
          fc.setActiveObject(newSel)
          fc.requestRenderAll()
          syncSel()
          requestAnimationFrame(() => { guardRef.current = false })
        }
      }
    }

    const onUp = () => {
      if (!altClickRef.current) return
      const { objectsSnapshot, targetToRemove } = altClickRef.current
      altClickRef.current = null

      const remaining = objectsSnapshot.filter(o => o !== targetToRemove)
      guardRef.current = true
      fc.discardActiveObject()

      if (remaining.length > 1) {
        const newSel = new ActiveSelection(remaining, { canvas: fc })
        fc.setActiveObject(newSel)
      } else if (remaining.length === 1) {
        fc.setActiveObject(remaining[0])
      }
      fc.requestRenderAll()
      syncSel()
      requestAnimationFrame(() => { guardRef.current = false })
    }

    fc.on('mouse:down', onDown)
    fc.on('mouse:up', onUp)
    return () => { fc.off('mouse:down', onDown); fc.off('mouse:up', onUp) }
  }, [mode, syncSel])

  /* ── Eraser: click to delete object ──────────────────── */
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return
    const onDown = (opt) => {
      if (mode !== MODES.ERASER) return
      const target = opt.target
      if (target) {
        fc.remove(target)
        fc.requestRenderAll()
        rebuildLayers()
      }
    }
    fc.on('mouse:down', onDown)
    return () => { fc.off('mouse:down', onDown) }
  }, [mode, rebuildLayers])

  /* ── Pen: rebuild layers after drawing ─────────────── */
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return
    const onPathCreated = () => rebuildLayers()
    fc.on('path:created', onPathCreated)
    return () => { fc.off('path:created', onPathCreated) }
  }, [rebuildLayers])

  /* ── Group / Ungroup ────────────────────────────────── */
  const handleGroup = useCallback(() => {
    const fc = fabricRef.current
    if (!fc) return
    const a = fc.getActiveObject()
    if (!a || !(a instanceof ActiveSelection)) return
    const grp = a.toGroup()
    grp._isUserGroup = true
    grp.set({ selectable: true, hasControls: true, hasBorders: true })
    fc.requestRenderAll(); syncSel(); rebuildLayers()
  }, [syncSel, rebuildLayers])

  const handleUngroup = useCallback(() => {
    const fc = fabricRef.current
    if (!fc) return
    const a = fc.getActiveObject()
    if (!a || !(a instanceof Group) || a instanceof ActiveSelection) return
    a.toActiveSelection()
    fc.requestRenderAll(); syncSel(); rebuildLayers()
  }, [syncSel, rebuildLayers])

  /* ── Layer name management ─────────────────────────── */
  const addLayerName = () => {
    const name = layerInput.trim().toLowerCase()
    if (!name || layerNames.includes(name)) return
    // Reject bare "category:" with no detail after colon
    if (name.includes(':') && !name.split(':')[1]?.trim()) return
    setLayerNames((prev) => [...prev, name])
    setLayerInput('')
  }

  const removeLayerName = (name) => {
    setLayerNames((prev) => prev.filter((n) => n !== name))
  }

  /* ── Generate ───────────────────────────────────────── */
  const getScriptContext = useCallback(() => screenplay.map(el => el.text).join(' '), [screenplay])

  const handleGenerate = async () => {
    setLoading(true); setError(null)
    try {
      if (genMode === 'layers') {
        await handleGenerateLayers()
      } else {
        await handleGenerateSingle()
      }
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  const handleGenerateSingle = async () => {
    const result = await generateSketch(getScriptContext(), intent || 'Cinematic storyboard sketch', null, 'svg', detailLevel)
    setSvgRaw(result.generated_image)
    loadSvgToCanvas(result.generated_image)
  }

  const handleGenerateLayers = async () => {
    const result = await generateSvgLayers(
      getScriptContext(),
      intent || 'Cinematic storyboard sketch',
      null,
      layerNames,
      detailLevel,
    )

    const fc = fabricRef.current
    if (!fc) return

    const newGroups = []
    for (const [name, svgStr] of Object.entries(result.layers)) {
      if (!svgStr) continue

      try {
        const parsed = await loadSVGFromString(svgStr)
        const objects = parsed.objects.filter(Boolean)

        objects.forEach((obj) => {
          obj.set({ selectable: false, evented: false })
        })

        const group = new Group(objects, {
          selectable: true,
          hasControls: true,
          hasBorders: true,
          lockScalingFlip: true,
        })
        group._layerName = name

        fc.add(group)
        newGroups.push(group)
      } catch (err) {
        console.error(`Failed to load layer '${name}':`, err)
      }
    }

    // Scale only newly added groups to fit canvas
    if (newGroups.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      newGroups.forEach((g) => {
        const br = g.getBoundingRect()
        minX = Math.min(minX, br.left); minY = Math.min(minY, br.top)
        maxX = Math.max(maxX, br.left + br.width); maxY = Math.max(maxY, br.top + br.height)
      })
      const bw = maxX - minX, bh = maxY - minY
      if (bw > 0 && bh > 0) {
        const scale = Math.min(fc.width / bw, fc.height / bh)
        const offsetX = (fc.width - bw * scale) / 2
        const offsetY = (fc.height - bh * scale) / 2
        newGroups.forEach((g) => {
          g.set({
            left: (g.left - minX) * scale + offsetX, top: (g.top - minY) * scale + offsetY,
            scaleX: (g.scaleX || 1) * scale, scaleY: (g.scaleY || 1) * scale,
          })
          g.setCoords()
        })
      }
    }

    fc.renderAll()
    rebuildLayers()
    setSelectedLayer(null)
  }

  /* ── Load SVG (single mode) ────────────────────────── */
  const loadSvgToCanvas = async (svgStr) => {
    const fc = fabricRef.current
    if (!fc) return
    fc.clear(); fc.backgroundColor = '#ffffff'
    try {
      const result = await loadSVGFromString(svgStr)
      const objects = result.objects.filter(Boolean)
      objects.forEach(obj => {
        obj.set({ selectable: true, hasControls: true, hasBorders: true, lockScalingFlip: true })
        fc.add(obj)
      })
      const allObjs = fc.getObjects()
      if (allObjs.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        allObjs.forEach(o => {
          const br = o.getBoundingRect()
          minX = Math.min(minX, br.left); minY = Math.min(minY, br.top)
          maxX = Math.max(maxX, br.left + br.width); maxY = Math.max(maxY, br.top + br.height)
        })
        const bw = maxX - minX, bh = maxY - minY
        if (bw > 0 && bh > 0) {
          const scale = Math.min(fc.width / bw, fc.height / bh)
          const offsetX = (fc.width - bw * scale) / 2
          const offsetY = (fc.height - bh * scale) / 2
          allObjs.forEach(o => {
            o.set({
              left: (o.left - minX) * scale + offsetX, top: (o.top - minY) * scale + offsetY,
              scaleX: (o.scaleX || 1) * scale, scaleY: (o.scaleY || 1) * scale,
            })
            o.setCoords()
          })
        }
      }
      fc.renderAll(); rebuildLayers(); setSelectedLayer(null)
    } catch (err) { setError(`SVG 로드 실패: ${err.message}`) }
  }

  /* ── Restore canvas state from store on mount / shot change ── */
  useEffect(() => {
    const fc = fabricRef.current
    if (!fc) return
    const shotFabricJson = getFabricJson()
    if (shotFabricJson && shotFabricJson.objects?.length > 0) {
      console.log("[SvgEditor] Restoring saved canvas state for shot", `${activeStrategy}-${activeShot}`)
      fc.loadFromJSON(shotFabricJson, () => {
        fc.renderAll()
        rebuildLayers()
      })
    } else {
      // No fabric state — check if shot has an existing image to load as background
      const shotImage = strategies[activeStrategy]?.shots?.[activeShot]?.image
        || (activeShot === 0 ? mockReframe : null)
      if (shotImage) {
        console.log("[SvgEditor] Loading shot.image as background for", `${activeStrategy}-${activeShot}`)
        fc.clear()
        fc.backgroundColor = '#ffffff'
        const canvasW = fc.width
        const canvasH = fc.height
        FabricImage.fromURL(shotImage, { crossOrigin: 'anonymous' }).then((fImg) => {
          if (!fabricRef.current) return
          // Get actual image pixel dimensions
          const originalSize = fImg.getOriginalSize() || {}
          const imgW = originalSize.width || fImg.width || 1
          const imgH = originalSize.height || fImg.height || 1
          if (!canvasW || !canvasH || !imgW || !imgH) return
          const scale = Math.min(canvasW / imgW, canvasH / imgH)
          const scaledW = imgW * scale
          const scaledH = imgH * scale
          const offsetX = (canvasW - scaledW) / 2
          const offsetY = (canvasH - scaledH) / 2
          fImg.set({
            scaleX: scale,
            scaleY: scale,
            left: offsetX,
            top: offsetY,
            originX: 'left',
            originY: 'top',
            selectable: false,
            evented: false,
            lockMovementX: true,
            lockMovementY: true,
          })
          fc.insertAt(0, fImg)
          fc.renderAll()
          rebuildLayers()
        })
      } else {
        console.log("[SvgEditor] No saved state for shot", `${activeStrategy}-${activeShot}`, "— clearing canvas")
        fc.clear()
        fc.backgroundColor = '#ffffff'
        fc.renderAll()
        rebuildLayers()
      }
    }
  }, [fabricRef.current, activeStrategy, activeShot]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveAndMap = () => {
    const fc = fabricRef.current; if (!fc) return
    // Persist fabric state for this shot before exporting
    setFabricJson(fc.toJSON())
    const dataUrl = fc.toDataURL({ format: 'png', multiplier: 2 })
    if (onSaveAndMap) onSaveAndMap(dataUrl)
  }

  /* ── Render ─────────────────────────────────────────── */
  const canGroup = selInfo?.isMulti && selInfo.count > 1
  const canUngroup = selInfo?.isGroup

  return (
    <div className="svg-editor svg-editor--fullscreen">
      {/* ── Top Toolbar: compact, stays on top ── */}
      <div className="svg-editor-topbar">
        <div className="svg-topbar-left">
          {/* Drawing tools */}
          <div className="svg-toolbar-modes">
            <button className={`svg-toolbar-btn ${mode === MODES.PEN ? 'active' : ''}`}
              onClick={() => setMode(MODES.PEN)} title="Pen: 자유 드로잉">
              <span className="tb-icon">🖊</span> Pen
            </button>
            <button className={`svg-toolbar-btn ${mode === MODES.ERASER ? 'active' : ''}`}
              onClick={() => setMode(MODES.ERASER)} title="Eraser: 클릭하여 오브젝트 삭제">
              <span className="tb-icon">🧹</span> Eraser
            </button>
          </div>
          <div className="svg-toolbar-modes">
            <button className="svg-toolbar-btn" onClick={handleUndo} title="Undo">↩</button>
            <button className="svg-toolbar-btn" onClick={handleRedo} title="Redo">↪</button>
          </div>
          {mode === MODES.PEN && (
            <label className="svg-pen-size">
              <input type="range" min={1} max={20} value={penSize}
                onChange={e => setPenSize(Number(e.target.value))} />
              <span>{penSize}px</span>
            </label>
          )}
          <div className="svg-toolbar-sep" />
          <div className="svg-toolbar-modes">
            <button className={`svg-toolbar-btn ${mode === MODES.SELECT ? 'active' : ''}`}
              onClick={() => setMode(MODES.SELECT)} title="Select / Move">
              <span className="tb-icon">⬆</span> Select
            </button>
            <button className={`svg-toolbar-btn ${mode === MODES.LASSO ? 'active' : ''}`}
              onClick={() => setMode(MODES.LASSO)} title="Lasso: 자유곡선으로 감싸서 선택">
              <span className="tb-icon">✏️</span> Lasso
            </button>
          </div>
          <div className="svg-toolbar-sep" />
          <button className={`svg-toolbar-action grp ${canGroup ? 'ready' : ''}`}
            onClick={handleGroup} disabled={!canGroup}>
            📦 Group{selInfo?.isMulti ? ` (${selInfo.count})` : ''}
          </button>
          <button className={`svg-toolbar-action ungrp ${canUngroup ? 'ready' : ''}`}
            onClick={handleUngroup} disabled={!canUngroup}>
            📂 Ungroup
          </button>
          {selInfo && (
            <>
              <span className="svg-toolbar-info">
                {selInfo.isGroup ? `Group · ${selInfo.count} items` :
                 selInfo.isMulti ? `${selInfo.count} selected` : '1 selected'}
              </span>
              <div className="svg-toolbar-modes svg-layer-order">
                <button className="svg-toolbar-btn" title="맨 앞으로" onClick={() => { const fc = fabricRef.current; const obj = fc?.getActiveObject(); if (obj) { fc.bringObjectToFront(obj); fc.renderAll() } }}>⤒</button>
                <button className="svg-toolbar-btn" title="앞으로" onClick={() => { const fc = fabricRef.current; const obj = fc?.getActiveObject(); if (obj) { fc.bringObjectForward(obj); fc.renderAll() } }}>↑</button>
                <button className="svg-toolbar-btn" title="뒤로" onClick={() => { const fc = fabricRef.current; const obj = fc?.getActiveObject(); if (obj) { fc.sendObjectBackwards(obj); fc.renderAll() } }}>↓</button>
                <button className="svg-toolbar-btn" title="맨 뒤로" onClick={() => { const fc = fabricRef.current; const obj = fc?.getActiveObject(); if (obj) { fc.sendObjectToBack(obj); fc.renderAll() } }}>⤓</button>
              </div>
            </>
          )}
        </div>
        <div className="svg-topbar-right">
          {onToggleScript && (
            <button
              className={`svg-toolbar-btn ${showScript ? 'active' : ''}`}
              onClick={onToggleScript}
              title="Toggle Script"
            >
              <span className="tb-icon">📜</span> Script
            </button>
          )}
          <button
            className={`svg-toolbar-btn svg-gen-toggle ${showGenPanel ? 'active' : ''}`}
            onClick={() => setShowGenPanel(v => !v)}
            title="AI 생성 패널"
          >
            <span className="tb-icon">✨</span> Generate
          </button>
          {onSaveAndMap && (
            <button className="svg-toolbar-btn svg-save-btn" onClick={handleSaveAndMap}>
              Save & Map ⛶
            </button>
          )}
        </div>
      </div>

      {error && <div className="svg-editor-error">{error}</div>}

      {/* ── Main area: canvas + optional panels ── */}
      <div className="svg-editor-main">
        {/* Script panel (left) */}
        {scriptPanel && <div className="svg-script-side">{scriptPanel}</div>}

        {/* Canvas (center, fills remaining space) */}
        <div className="svg-editor-canvas-wrap" ref={wrapRef}>
          <div className="svg-canvas-container">
            <canvas ref={canvasRef} />
            <canvas
              ref={overlayRef}
              className={`lasso-overlay ${mode === MODES.LASSO ? 'active' : ''}`}
            />
          </div>
        </div>

        {/* Generate panel (right, collapsible) */}
        {showGenPanel && (
          <div className="svg-gen-panel">
            <div className="svg-gen-panel-header">
              <span>AI Generate</span>
              <button className="svg-gen-panel-close" onClick={() => setShowGenPanel(false)}>×</button>
            </div>

            <div className="svg-editor-controls">
              <input className="svg-editor-intent" type="text"
                placeholder="씬 설명 또는 연출 의도"
                value={intent} onChange={e => setIntent(e.target.value)} />
            </div>

            <div className="svg-gen-mode-toggle">
              <button
                className={`svg-gen-mode-btn ${genMode === 'layers' ? 'active' : ''}`}
                onClick={() => setGenMode('layers')}
              >Layer</button>
              <button
                className={`svg-gen-mode-btn ${genMode === 'single' ? 'active' : ''}`}
                onClick={() => setGenMode('single')}
              >Single</button>
            </div>

            {genMode === 'layers' && (
              <div className="svg-layer-names-editor">
                <span className="svg-layer-names-label">Layers:</span>
                <div className="svg-layer-tags">
                  {layerNames.map((name) => (
                    <span key={name} className="svg-layer-tag"
                      style={{ borderColor: getLayerColor(name) }}>
                      {name}
                      <button onClick={() => removeLayerName(name)}>×</button>
                    </span>
                  ))}
                </div>
                <div className="svg-layer-presets">
                  {['background', 'character', 'props', 'foreground'].map(p => {
                    const isMulti = p === 'character' || p === 'props'
                    if (!isMulti && layerNames.includes(p)) return null
                    return (
                      <button key={p} className="svg-layer-preset-btn"
                        style={{ borderColor: getLayerColor(p) }}
                        onClick={() => {
                          if (isMulti) {
                            setLayerInput(p + ':')
                            document.querySelector('.svg-layer-name-input')?.focus()
                          } else {
                            setLayerNames(prev => [...prev, p])
                          }
                        }}
                      >+ {p}</button>
                    )
                  })}
                </div>
                <div className="svg-layer-custom-input">
                  <input className="svg-layer-name-input" type="text"
                    placeholder="예: character:철수"
                    value={layerInput}
                    onChange={(e) => setLayerInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) addLayerName() }}
                  />
                  <button className="svg-layer-add-btn" onClick={addLayerName}>+</button>
                </div>
              </div>
            )}

            <div className="svg-detail-slider">
              <span className="svg-detail-label">단순</span>
              <input type="range" min={0} max={100} value={detailLevel}
                onChange={e => setDetailLevel(Number(e.target.value))}
                className="svg-detail-range" />
              <span className="svg-detail-label">구체</span>
              <span className="svg-detail-value">{detailLevel}</span>
            </div>

            <button
              className={`svg-editor-generate-btn ${loading ? 'loading' : ''}`}
              onClick={handleGenerate}
              disabled={loading || (genMode === 'layers' && layerNames.length === 0)}
            >
              {loading
                ? 'Generating...'
                : genMode === 'layers'
                  ? `Generate ${layerNames.length} Layers`
                  : 'Generate SVG'
              }
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
