import { useEffect, useCallback, useRef, useState } from 'react'
import useStore from '../store/useStore'
import './SequenceTimeline.css'


export default function SequenceTimeline() {
  const scenes = useStore((s) => s.scenes)
  const activeScene = useStore((s) => s.activeScene)
  const scene = scenes[activeScene]
  const activeBranch = scene?.activeBranch ?? 0
  const branch = scene?.branches[activeBranch]
  const shots = branch?.shots || []
  const activeShot = scene?.activeShot ?? 0
  const setActiveShot = useStore((s) => s.setFlowActiveShot)
  const removeShot = useStore((s) => s.flowRemoveShot)
  const insertShot = useStore((s) => s.flowInsertShot)
  const shotSketches = useStore((s) => s.shotSketches)

  const handleDeleteShot = useCallback(() => {
    if (shots.length <= 1) return
    removeShot(activeBranch, activeShot)
    setActiveShot(Math.max(0, activeShot - 1))
  }, [shots.length, removeShot, activeBranch, activeShot, setActiveShot])

  const handleAddShot = () => {
    insertShot(activeBranch, shots.length - 1, {
      label: 'New Shot',
      cir: {},
    })
    setActiveShot(shots.length)
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setActiveShot(Math.max(0, activeShot - 1))
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        setActiveShot(Math.min(shots.length - 1, activeShot + 1))
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        handleDeleteShot()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeShot, shots.length, setActiveShot, handleDeleteShot])

  // 샷 개수에 따라 썸네일 너비 동적 계산
  // dock은 center panel 전체 너비 - 80px, padding/gap 감안
  const timelineRef = useRef(null)
  const [dockWidth, setDockWidth] = useState(880)

  useEffect(() => {
    const el = timelineRef.current?.closest('.timeline-dock')
    if (!el) return
    const ro = new ResizeObserver(() => setDockWidth(el.getBoundingClientRect().width))
    ro.observe(el)
    const frame = requestAnimationFrame(() => setDockWidth(el.getBoundingClientRect().width))
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [])

  const count = shots.length || 1
  const thumbWidth = Math.min(120, Math.max(40, Math.floor((dockWidth - 28) / count) - 6))

  return (
    <div className="sequence-timeline" ref={timelineRef}>
      {shots.map((shot, i) => {
        const sketchUrl = shotSketches[`${activeScene}-${activeBranch}-${i}`]
        const displayImg = sketchUrl || shot.image

        return (
          <div
            key={i}
            className={`timeline-item ${activeShot === i ? 'active' : ''}`}
            onClick={() => setActiveShot(i)}
            style={{ width: thumbWidth }}
          >
            <div className="shot-thumbnail">
              {displayImg ? (
                <img src={displayImg} alt={`Shot ${i + 1}`} className="thumbnail-img" />
              ) : (
                <div className="shot-placeholder">{i + 1}</div>
              )}
            </div>
            <div className="shot-meta">
              <span className="shot-number">S{i + 1}</span>
              <span className="shot-info">{shot.cir?.shotSize || '—'}</span>
            </div>
          </div>
        )
      })}

      {/* Add shot button */}
      <button className="timeline-add-btn" onClick={handleAddShot} title="Add shot">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
  )
}
