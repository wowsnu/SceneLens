import useStore from '../store/useStore'
import './AxisChips.css'

const AXES = [
  { id: 'reframe', label: 'Reframe', desc: '구도/프레이밍' },
]

const FREEFORM_AXIS = { id: 'freeform', label: 'Freeform', desc: '자유 연출' }

const MISE_CHIPS = [
  { id: 'blocking', label: 'Blocking', desc: '인물 배치·동선' },
  { id: 'props', label: 'Props', desc: '소품' },
  { id: 'set_dressing', label: 'Set', desc: '배경·세트' },
]

function getChipEyebrow(active) {
  return active ? 'Selected' : 'Add Axis'
}

function getChipLead(active) {
  return active ? '✓' : '+'
}

export default function AxisChips() {
  const activeAxes = useStore((s) => s.activeAxes)
  const setActiveAxes = useStore((s) => s.setActiveAxes)
  const toggleAxis = useStore((s) => s.toggleAxis)
  const miseOptions = useStore((s) => s.miseOptions)
  const setMiseOptions = useStore((s) => s.setMiseOptions)
  const theoryPreference = useStore((s) => s.theoryPreference)
  const setTheoryPreference = useStore((s) => s.setTheoryPreference)

  const freeformOn = activeAxes.includes('freeform')
  const miseOn = activeAxes.includes('mise')

  const handleMiseChip = (optionId) => {
    const checked = miseOn && miseOptions.includes(optionId)

    if (checked) {
      const nextOptions = miseOptions.filter((option) => option !== optionId)
      setMiseOptions(nextOptions)
      if (nextOptions.length === 0) {
        setActiveAxes(activeAxes.filter((axis) => axis !== 'mise'))
      }
      return
    }

    const nextOptions = miseOn
      ? Array.from(new Set([...miseOptions, optionId]))
      : [optionId]

    setMiseOptions(nextOptions)
    if (!miseOn) {
      setActiveAxes([...activeAxes, 'mise'])
    }
  }

  return (
    <div className="axis-chip-row">
      <div className="axis-chip-row-label">AXES</div>
      <div className="axis-chip-list">
        {AXES.map((axis) => {
          const active = activeAxes.includes(axis.id)

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
                <span className="axis-chip-eyebrow">{getChipEyebrow(active)}</span>
                <span className="axis-chip-label">{axis.label}</span>
              </span>
              {active && <span className="axis-chip-dot" />}
            </button>
          )
        })}

        {MISE_CHIPS.map((chip) => {
          const active = miseOn && miseOptions.includes(chip.id)

          return (
            <button
              key={chip.id}
              type="button"
              className={`axis-chip axis-chip-mise axis-chip-mise-${chip.id} ${active ? 'active' : ''}`}
              onClick={() => handleMiseChip(chip.id)}
              title={chip.desc}
              aria-pressed={active}
            >
              <span className="axis-chip-lead">{getChipLead(active)}</span>
              <span className="axis-chip-copy">
                <span className="axis-chip-eyebrow">Mise</span>
                <span className="axis-chip-label">{chip.label}</span>
              </span>
              {active && <span className="axis-chip-dot" />}
            </button>
          )
        })}

        <button
          type="button"
          className={`axis-chip axis-chip-${FREEFORM_AXIS.id} ${freeformOn ? 'active' : ''}`}
          onClick={() => toggleAxis(FREEFORM_AXIS.id)}
          title={FREEFORM_AXIS.desc}
          aria-pressed={freeformOn}
        >
          <span className="axis-chip-lead">{getChipLead(freeformOn)}</span>
          <span className="axis-chip-copy">
            <span className="axis-chip-eyebrow">{getChipEyebrow(freeformOn)}</span>
            <span className="axis-chip-label">{FREEFORM_AXIS.label}</span>
          </span>
          {freeformOn && <span className="axis-chip-dot" />}
        </button>
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
