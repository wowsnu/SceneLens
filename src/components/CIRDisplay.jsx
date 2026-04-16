import './CIRDisplay.css'

function CIRDisplay({ cir }) {
  const cirFields = [
    { key: 'shotSize', label: 'Shot Size', icon: '📐' },
    { key: 'cameraAngle', label: 'Camera Angle', icon: '📷' },
    { key: 'cameraLevel', label: 'Camera Level', icon: '📏' },
    { key: 'relation', label: 'Relation', icon: '👥' },
    { key: 'blockingDistance', label: 'Blocking Distance', icon: '↔️' },
    { key: 'eyeline', label: 'Eyeline', icon: '👁️' },
    { key: 'occlusion', label: 'Occlusion', icon: '🚧' },
    { key: 'motionHint', label: 'Motion Hint', icon: '🎬' }
  ]

  return (
    <div className="cir-display">
      <h2>🎯 CIR (Cinematic Intermediate Representation)</h2>
      <div className="cir-grid">
        {cirFields.map(({ key, label, icon }) => (
          <div key={key} className="cir-field">
            <span className="cir-icon">{icon}</span>
            <div className="cir-content">
              <div className="cir-label">{label}</div>
              <div className="cir-value">{cir[key]}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default CIRDisplay
