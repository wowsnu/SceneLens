import { useRef, useEffect, useState } from 'react'
import useStore from '../store/useStore'
import './AxisChips.css'

const AXES = [
  { id: 'reframe',  label: 'Reframe',       desc: '구도/프레이밍' },
  { id: 'mise',     label: 'Mise-en-scène', desc: '블로킹·소품·세트' },
  { id: 'freeform', label: 'Freeform',      desc: '자유 연출' },
]

const MISE_SUBS = [
  { id: 'blocking',     label: 'Blocking',     hint: '인물 배치·동선' },
  { id: 'props',        label: 'Props',        hint: '소품' },
  { id: 'set_dressing', label: 'Set',          hint: '배경·세트' },
]

const DEFAULT_MISE_OPTIONS = MISE_SUBS.map((sub) => sub.id)

function getChipEyebrow(axisId, active) {
  if (active) {
    return axisId === 'mise' ? 'Configured' : 'Selected'
  }
  return 'Add Axis'
}

function getChipLead(active) {
  return active ? '✓' : '+'
}

export default function AxisChips() {
  const activeAxes = useStore((s) => s.activeAxes)
  const toggleAxis = useStore((s) => s.toggleAxis)
  const miseOptions = useStore((s) => s.miseOptions)
  const setMiseOptions = useStore((s) => s.setMiseOptions)
  const toggleMiseOption = useStore((s) => s.toggleMiseOption)
  const theoryPreference = useStore((s) => s.theoryPreference)
  const setTheoryPreference = useStore((s) => s.setTheoryPreference)

  const freeformOn = activeAxes.includes('freeform')
  const miseOn = activeAxes.includes('mise')

  // Mise 드롭다운: 미장센 칩이 활성일 때만 표시
  const [showMisePanel, setShowMisePanel] = useState(false)
  const miseWrapRef = useRef(null)

  // 칩 활성/비활성 시 자동 토글
  useEffect(() => {
    if (!miseOn) setShowMisePanel(false)
  }, [miseOn])

  // 바깥 클릭 시 패널 닫기
  useEffect(() => {
    if (!showMisePanel) return
    const onClick = (e) => {
      if (!miseWrapRef.current?.contains(e.target)) setShowMisePanel(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [showMisePanel])

  const onMiseChipClick = () => {
    if (!miseOn) {
      if (miseOptions.length === 0) {
        setMiseOptions(DEFAULT_MISE_OPTIONS)
      }
      toggleAxis('mise')
      setShowMisePanel(true)
    } else {
      setShowMisePanel((v) => !v)
    }
  }

  return (
    <div className="axis-chip-row">
      <div className="axis-chip-row-label">AXES</div>
      <div className="axis-chip-list">
        {AXES.map((axis) => {
          const active = activeAxes.includes(axis.id)

          if (axis.id === 'mise') {
            return (
              <div className="axis-chip-wrap" ref={miseWrapRef} key={axis.id}>
                {showMisePanel && (
                  <div className="axis-subpanel">
                    <div className="axis-subpanel-title">Mise-en-scène 요소 선택</div>
                    <div className="axis-subpanel-options">
                      {MISE_SUBS.map((sub) => {
                        const checked = miseOptions.includes(sub.id)
                        return (
                          <label
                            key={sub.id}
                            className={`axis-subpanel-option ${checked ? 'checked' : ''}`}
                            data-hint={sub.hint}
                            title={sub.hint}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleMiseOption(sub.id)}
                            />
                            <span className="axis-sub-box" />
                            <span className="axis-sub-text">
                              <span className="axis-sub-label">{sub.label}</span>
                              <span className="axis-sub-hint">{sub.hint}</span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className={`axis-chip axis-chip-${axis.id} ${active ? 'active' : ''} ${showMisePanel ? 'expanded' : ''}`}
                  onClick={onMiseChipClick}
                  title={axis.desc}
                  aria-pressed={active}
                  aria-expanded={showMisePanel}
                >
                  <span className="axis-chip-lead">{getChipLead(active)}</span>
                  <span className="axis-chip-copy">
                    <span className="axis-chip-eyebrow">{getChipEyebrow(axis.id, active)}</span>
                    <span className="axis-chip-label">{axis.label}</span>
                  </span>
                  {active && <span className="axis-chip-count">{miseOptions.length}</span>}
                  <span className="axis-chip-dot" />
                </button>
              </div>
            )
          }

          return (
            <button
              key={axis.id}
              type="button"
              className={`axis-chip axis-chip-${axis.id} ${active ? 'active' : ''}`}
              onClick={() => toggleAxis(axis.id)}
              title={axis.desc}
              aria-pressed={active}
            >
              <span className="axis-chip-lead">{getChipLead(active)}</span>
              <span className="axis-chip-copy">
                <span className="axis-chip-eyebrow">{getChipEyebrow(axis.id, active)}</span>
                <span className="axis-chip-label">{axis.label}</span>
              </span>
              <span className="axis-chip-dot" />
            </button>
          )
        })}
      </div>

      {freeformOn && (
        <div className="axis-theory-pref">
          <span className="axis-theory-pref-tag">Theory</span>
          <input
            type="text"
            className="axis-theory-pref-input"
            placeholder="이론/책 선호 (선택) — 예: Arijon, Five C's"
            value={theoryPreference || ''}
            onChange={(e) => setTheoryPreference(e.target.value || null)}
          />
        </div>
      )}
    </div>
  )
}
