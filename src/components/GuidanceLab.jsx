import React, { useState } from 'react'
import useStore from '../store/useStore'
import GuidanceTab from './GuidanceTab'
import './GuidanceLab.css'

// CIR 카테고리별 옵션 + 각 옵션의 시각적 설명
const CIR_CATEGORIES = [
  {
    key: 'shotSize',
    label: 'Shot Size',
    options: [
      { value: 'Extreme Wide', abbr: 'EWS', desc: 'Full environment, tiny subjects', svgId: 'ews' },
      { value: 'Wide', abbr: 'WS', desc: 'Subject with surroundings', svgId: 'ws' },
      { value: 'Medium', abbr: 'MS', desc: 'Waist up, conversational', svgId: 'ms' },
      { value: 'Medium Close', abbr: 'MCU', desc: 'Chest up, emotional', svgId: 'mcu' },
      { value: 'Close-Up', abbr: 'CU', desc: 'Face fills frame', svgId: 'cu' },
      { value: 'ECU', abbr: 'ECU', desc: 'Extreme detail, one feature', svgId: 'ecu' },
    ],
  },
  {
    key: 'cameraAngle',
    label: 'Camera Angle',
    options: [
      { value: 'High Angle', abbr: 'HIGH', desc: 'Looking down, diminishes subject', svgId: 'high' },
      { value: 'Eye Level', abbr: 'EYE', desc: 'Neutral, objective', svgId: 'eye' },
      { value: 'Low Angle', abbr: 'LOW', desc: 'Looking up, empowers subject', svgId: 'low' },
      { value: 'Dutch Angle', abbr: 'DUTCH', desc: 'Tilted, unease/tension', svgId: 'dutch' },
    ],
  },
  {
    key: 'relation',
    label: 'Subject Relation',
    options: [
      { value: 'Single', abbr: '1', desc: 'One subject isolated', svgId: 'single' },
      { value: 'Two-shot', abbr: '2', desc: 'Two subjects together', svgId: 'twoshot' },
      { value: 'OTS', abbr: 'OTS', desc: 'Over-the-shoulder', svgId: 'ots' },
      { value: 'Group', abbr: 'GRP', desc: 'Three or more', svgId: 'group' },
    ],
  },
  {
    key: 'cameraLevel',
    label: 'Camera Level',
    options: [
      { value: 'Overhead', abbr: 'OHD', desc: "Bird's eye view", svgId: 'overhead' },
      { value: 'High', abbr: 'H', desc: 'Above eye level', svgId: 'clhigh' },
      { value: 'Eye Level', abbr: 'EL', desc: 'Standard eye level', svgId: 'cleye' },
      { value: 'Low', abbr: 'L', desc: 'Below eye level', svgId: 'cllow' },
      { value: 'Ground', abbr: 'GND', desc: 'At ground level', svgId: 'ground' },
    ],
  },
  {
    key: 'eyeline',
    label: 'Eyeline',
    options: [
      { value: 'Direct', abbr: 'DIR', desc: 'Looking at camera', svgId: 'eyedirect' },
      { value: 'Face-to-face', abbr: 'F2F', desc: 'Looking at another subject', svgId: 'eyef2f' },
      { value: 'Averted', abbr: 'AVT', desc: 'Looking away', svgId: 'eyeavt' },
    ],
  },
]

// SVG 미리보기 — 각 shot 타입을 미니멀 선화로 표현
function ShotPreviewSVG({ svgId }) {
  const drawings = {
    ews: (
      <svg viewBox="0 0 80 54" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="78" height="52" rx="2" stroke="#333" strokeWidth="1"/>
        <rect x="8" y="8" width="64" height="38" fill="#111"/>
        {/* horizon */}
        <line x1="8" y1="34" x2="72" y2="34" stroke="#2a2a2a" strokeWidth="0.5"/>
        {/* tiny figure */}
        <circle cx="40" cy="28" r="2" fill="#3e82f6" opacity="0.7"/>
        <line x1="40" y1="30" x2="40" y2="36" stroke="#3e82f6" strokeWidth="0.8" opacity="0.7"/>
      </svg>
    ),
    ws: (
      <svg viewBox="0 0 80 54" fill="none">
        <rect x="1" y="1" width="78" height="52" rx="2" stroke="#333" strokeWidth="1"/>
        <rect x="8" y="8" width="64" height="38" fill="#111"/>
        <circle cx="40" cy="22" r="5" stroke="#3e82f6" strokeWidth="1" opacity="0.8"/>
        <line x1="40" y1="27" x2="40" y2="46" stroke="#3e82f6" strokeWidth="1" opacity="0.8"/>
        <line x1="32" y1="33" x2="48" y2="33" stroke="#3e82f6" strokeWidth="1" opacity="0.8"/>
      </svg>
    ),
    ms: (
      <svg viewBox="0 0 80 54" fill="none">
        <rect x="1" y="1" width="78" height="52" rx="2" stroke="#333" strokeWidth="1"/>
        <rect x="8" y="8" width="64" height="38" fill="#111"/>
        <circle cx="40" cy="18" r="7" stroke="#3e82f6" strokeWidth="1" opacity="0.8"/>
        <line x1="33" y1="25" x2="47" y2="25" stroke="#3e82f6" strokeWidth="1" opacity="0.8"/>
        <path d="M30 46 Q40 38 50 46" stroke="#3e82f6" strokeWidth="1" fill="none" opacity="0.8"/>
        {/* cut at waist */}
        <line x1="8" y1="46" x2="72" y2="46" stroke="#555" strokeWidth="0.5" strokeDasharray="3,2"/>
      </svg>
    ),
    mcu: (
      <svg viewBox="0 0 80 54" fill="none">
        <rect x="1" y="1" width="78" height="52" rx="2" stroke="#333" strokeWidth="1"/>
        <rect x="8" y="8" width="64" height="38" fill="#111"/>
        <circle cx="40" cy="20" r="9" stroke="#3e82f6" strokeWidth="1.2" opacity="0.9"/>
        <path d="M28 46 Q40 35 52 46" stroke="#3e82f6" strokeWidth="1" fill="none" opacity="0.8"/>
        <line x1="8" y1="40" x2="72" y2="40" stroke="#555" strokeWidth="0.5" strokeDasharray="3,2"/>
      </svg>
    ),
    cu: (
      <svg viewBox="0 0 80 54" fill="none">
        <rect x="1" y="1" width="78" height="52" rx="2" stroke="#333" strokeWidth="1"/>
        <rect x="8" y="8" width="64" height="38" fill="#111"/>
        <ellipse cx="40" cy="27" rx="16" ry="20" stroke="#3e82f6" strokeWidth="1.2" opacity="0.9"/>
        <circle cx="33" cy="23" r="2" fill="#3e82f6" opacity="0.5"/>
        <circle cx="47" cy="23" r="2" fill="#3e82f6" opacity="0.5"/>
        <path d="M34 33 Q40 37 46 33" stroke="#3e82f6" strokeWidth="0.8" fill="none" opacity="0.6"/>
      </svg>
    ),
    ecu: (
      <svg viewBox="0 0 80 54" fill="none">
        <rect x="1" y="1" width="78" height="52" rx="2" stroke="#333" strokeWidth="1"/>
        <rect x="8" y="8" width="64" height="38" fill="#111"/>
        <ellipse cx="40" cy="27" rx="26" ry="22" stroke="#3e82f6" strokeWidth="1.5" opacity="0.9"/>
        <circle cx="40" cy="27" r="8" stroke="#3e82f6" strokeWidth="1" opacity="0.7"/>
        <circle cx="40" cy="27" r="3" fill="#3e82f6" opacity="0.5"/>
      </svg>
    ),
    high: (
      <svg viewBox="0 0 80 54" fill="none">
        <rect x="1" y="1" width="78" height="52" rx="2" stroke="#333" strokeWidth="1"/>
        <rect x="8" y="8" width="64" height="38" fill="#111"/>
        {/* camera above, lines going down */}
        <polygon points="40,10 46,18 34,18" fill="#3e82f6" opacity="0.5"/>
        <line x1="40" y1="18" x2="40" y2="38" stroke="#3e82f6" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.6"/>
        <circle cx="40" cy="38" r="4" stroke="#3e82f6" strokeWidth="1" opacity="0.8"/>
      </svg>
    ),
    eye: (
      <svg viewBox="0 0 80 54" fill="none">
        <rect x="1" y="1" width="78" height="52" rx="2" stroke="#333" strokeWidth="1"/>
        <rect x="8" y="8" width="64" height="38" fill="#111"/>
        <polygon points="12,27 20,21 20,33" fill="#3e82f6" opacity="0.5"/>
        <line x1="20" y1="27" x2="60" y2="27" stroke="#3e82f6" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.6"/>
        <circle cx="60" cy="27" r="4" stroke="#3e82f6" strokeWidth="1" opacity="0.8"/>
      </svg>
    ),
    low: (
      <svg viewBox="0 0 80 54" fill="none">
        <rect x="1" y="1" width="78" height="52" rx="2" stroke="#333" strokeWidth="1"/>
        <rect x="8" y="8" width="64" height="38" fill="#111"/>
        <polygon points="40,44 46,36 34,36" fill="#3e82f6" opacity="0.5"/>
        <line x1="40" y1="36" x2="40" y2="16" stroke="#3e82f6" strokeWidth="0.8" strokeDasharray="3,2" opacity="0.6"/>
        <circle cx="40" cy="16" r="4" stroke="#3e82f6" strokeWidth="1" opacity="0.8"/>
      </svg>
    ),
    dutch: (
      <svg viewBox="0 0 80 54" fill="none">
        <rect x="1" y="1" width="78" height="52" rx="2" stroke="#333" strokeWidth="1"/>
        <rect x="8" y="8" width="64" height="38" fill="#111"/>
        <g transform="rotate(15, 40, 27)">
          <ellipse cx="40" cy="27" rx="14" ry="18" stroke="#3e82f6" strokeWidth="1.2" opacity="0.8"/>
        </g>
      </svg>
    ),
    single: (
      <svg viewBox="0 0 80 54" fill="none">
        <rect x="1" y="1" width="78" height="52" rx="2" stroke="#333" strokeWidth="1"/>
        <rect x="8" y="8" width="64" height="38" fill="#111"/>
        <circle cx="40" cy="22" r="7" stroke="#3e82f6" strokeWidth="1.2" opacity="0.9"/>
        <path d="M28 46 Q40 36 52 46" stroke="#3e82f6" strokeWidth="1" fill="none" opacity="0.8"/>
      </svg>
    ),
    twoshot: (
      <svg viewBox="0 0 80 54" fill="none">
        <rect x="1" y="1" width="78" height="52" rx="2" stroke="#333" strokeWidth="1"/>
        <rect x="8" y="8" width="64" height="38" fill="#111"/>
        <circle cx="30" cy="22" r="6" stroke="#3e82f6" strokeWidth="1.2" opacity="0.9"/>
        <path d="M20 46 Q30 36 40 46" stroke="#3e82f6" strokeWidth="1" fill="none" opacity="0.8"/>
        <circle cx="50" cy="22" r="6" stroke="#10b981" strokeWidth="1.2" opacity="0.9"/>
        <path d="M40 46 Q50 36 60 46" stroke="#10b981" strokeWidth="1" fill="none" opacity="0.8"/>
      </svg>
    ),
    ots: (
      <svg viewBox="0 0 80 54" fill="none">
        <rect x="1" y="1" width="78" height="52" rx="2" stroke="#333" strokeWidth="1"/>
        <rect x="8" y="8" width="64" height="38" fill="#111"/>
        {/* foreground shoulder */}
        <path d="M8 46 Q20 30 30 28" stroke="#555" strokeWidth="6" strokeLinecap="round" opacity="0.6"/>
        {/* subject in bg */}
        <circle cx="52" cy="22" r="8" stroke="#3e82f6" strokeWidth="1.2" opacity="0.9"/>
        <path d="M42 46 Q52 36 62 46" stroke="#3e82f6" strokeWidth="1" fill="none" opacity="0.8"/>
      </svg>
    ),
    group: (
      <svg viewBox="0 0 80 54" fill="none">
        <rect x="1" y="1" width="78" height="52" rx="2" stroke="#333" strokeWidth="1"/>
        <rect x="8" y="8" width="64" height="38" fill="#111"/>
        <circle cx="25" cy="24" r="5" stroke="#3e82f6" strokeWidth="1" opacity="0.8"/>
        <circle cx="40" cy="20" r="6" stroke="#10b981" strokeWidth="1.2" opacity="0.9"/>
        <circle cx="55" cy="24" r="5" stroke="#f59e0b" strokeWidth="1" opacity="0.8"/>
        <line x1="20" y1="40" x2="60" y2="40" stroke="#444" strokeWidth="0.5"/>
      </svg>
    ),
  }
  return drawings[svgId] || (
    <svg viewBox="0 0 80 54" fill="none">
      <rect x="1" y="1" width="78" height="52" rx="2" stroke="#333" strokeWidth="1"/>
      <rect x="8" y="8" width="64" height="38" fill="#111"/>
    </svg>
  )
}

export default function GuidanceLab() {
  const strategies = useStore((s) => s.strategies)
  const activeStrategy = useStore((s) => s.activeStrategy)
  const activeShot = useStore((s) => s.activeShot)
  const setStrategies = useStore((s) => s.setStrategies)

  const shot = strategies[activeStrategy]?.shots[activeShot]
  const currentCir = shot?.cir || {}

  const [hoveredOption, setHoveredOption] = useState(null) // { key, value }

  const updateCir = (key, value) => {
    const updated = strategies.map((strat, si) => {
      if (si !== activeStrategy) return strat
      return {
        ...strat,
        shots: strat.shots.map((s, i) => {
          if (i !== activeShot) return s
          return { ...s, cir: { ...s.cir, [key]: value } }
        })
      }
    })
    setStrategies(updated)
  }

  return (
    <div className="guide-layout">
      {/* LEFT: Input panel */}
      <aside className="guide-input-panel">
        <div className="guide-input-scroll">
          <div className="guide-input-header">
            <span className="guide-shot-label">Shot {activeShot + 1}</span>
            <span className="guide-shot-sub">Set cinematic parameters</span>
          </div>

          {CIR_CATEGORIES.map((cat) => (
            <div key={cat.key} className="guide-category">
              <div className="guide-cat-label">{cat.label}</div>
              <div className="guide-options">
                {cat.options.map((opt) => {
                  const isSelected = currentCir[cat.key] === opt.value
                  return (
                    <div
                      key={opt.value}
                      className={`guide-option ${isSelected ? 'selected' : ''}`}
                      onClick={() => updateCir(cat.key, opt.value)}
                      onMouseEnter={() => setHoveredOption({ key: cat.key, value: opt.value, opt })}
                      onMouseLeave={() => setHoveredOption(null)}
                    >
                      <div className="guide-option-preview">
                        <ShotPreviewSVG svgId={opt.svgId} />
                      </div>
                      <div className="guide-option-info">
                        <span className="guide-option-abbr">{opt.abbr}</span>
                        {isSelected && <span className="guide-option-check">✓</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* 호버시 설명 tooltip */}
              {hoveredOption?.key === cat.key && (
                <div className="guide-hover-desc">
                  <span className="guide-hover-value">{hoveredOption.opt.value}</span>
                  <span className="guide-hover-text">{hoveredOption.opt.desc}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      {/* RIGHT: Analysis result */}
      <div className="guide-result-panel">
        <GuidanceTab />
      </div>
    </div>
  )
}
