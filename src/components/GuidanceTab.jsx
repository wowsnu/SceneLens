import { useState, useCallback } from 'react'
import useStore from '../store/useStore'
import { generateOverlay } from '../services/api'
import './GuidanceTab.css'

const CIR_FIELDS = [
  { key: 'shotSize', label: 'Shot Size' },
  { key: 'cameraAngle', label: 'Camera Angle' },
  { key: 'cameraLevel', label: 'Camera Level' },
  { key: 'relation', label: 'Relation' },
  { key: 'blockingDistance', label: 'Blocking Dist.' },
  { key: 'eyeline', label: 'Eyeline' },
  { key: 'occlusion', label: 'Occlusion' },
  { key: 'motionHint', label: 'Motion' },
]

const STRATEGY_LABELS = ['A', 'B', 'C']

/** Downscale a data URL image for faster API calls */
function downscaleImage(dataUrl, maxWidth = 512) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      if (img.width <= maxWidth) {
        resolve(dataUrl.split(',')[1])
        return
      }
      const scale = maxWidth / img.width
      const canvas = document.createElement('canvas')
      canvas.width = maxWidth
      canvas.height = img.height * scale
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/png').split(',')[1])
    }
    img.src = dataUrl
  })
}

export default function GuidanceTab() {
  const analysisResult = useStore((s) => s.analysisResult)
  const proposals = useStore((s) => s.proposals)
  const activeProposal = useStore((s) => s.activeProposal)
  const setActiveProposal = useStore((s) => s.setActiveProposal)
  const overlays = useStore((s) => s.overlays)
  const toggleOverlay = useStore((s) => s.toggleOverlay)
  const canvasDataUrl = useStore((s) => s.canvasDataUrl)
  const strategyColors = useStore((s) => s.strategyColors)
  const intent = useStore((s) => s.intent)

  const [loadingOverlay, setLoadingOverlay] = useState({}) // { [idx]: true }

  // Generate overlay on-demand for a single proposal
  const handleGenerateOverlay = useCallback(async (idx) => {
    const proposal = proposals[idx]
    const shot = proposal?.shots?.[0]
    if (!shot || !canvasDataUrl || proposal.overlayImage) return

    setLoadingOverlay((prev) => ({ ...prev, [idx]: true }))

    try {
      const smallBase64 = await downscaleImage(canvasDataUrl, 512)
      const result = await generateOverlay(
        smallBase64,
        proposal.name,
        shot.cir,
        shot.theory_rationale,
        intent || 'Cinematic composition',
      )
      // Update this proposal with the overlay image
      const current = useStore.getState().proposals
      const updated = current.map((s, i) =>
        i === idx ? { ...s, overlayImage: `data:image/png;base64,${result.overlay_image}` } : s
      )
      useStore.getState().setProposals(updated)
    } catch (err) {
      console.warn(`Overlay generation failed for proposal ${idx}:`, err)
    } finally {
      setLoadingOverlay((prev) => ({ ...prev, [idx]: false }))
    }
  }, [proposals, canvasDataUrl, intent])

  // Click handler: select proposal + trigger overlay if not loaded
  const handleSelectProposal = useCallback((idx) => {
    setActiveProposal(idx)
    const proposal = proposals[idx]
    if (!proposal?.overlayImage && !loadingOverlay[idx] && canvasDataUrl) {
      handleGenerateOverlay(idx)
    }
  }, [proposals, loadingOverlay, canvasDataUrl, setActiveProposal, handleGenerateOverlay])

  // No analysis yet — show nothing until Analyze is clicked
  if (!analysisResult) {
    return (
      <div className="guidance-tab scrollable">
        <div className="analysis-waiting">
          <div className="status-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>
          <div className="status-text">
            Draw a sketch and click <strong>Analyze Composition</strong> to get cinematic guidance
          </div>
        </div>
      </div>
    )
  }

  // CIR from analysis
  const currentCir = analysisResult?.cir

  return (
    <div className="guidance-tab scrollable">
      {/* Current Analysis - CIR */}
      {currentCir && (
        <div className="guidance-section">
          <h3>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M9 21V9" />
            </svg>
            Cinematic Intermediate Representation
          </h3>
          <div className="attrs-grid">
            {CIR_FIELDS.map(({ key, label }) => (
              <div key={key} className="attr-item">
                <span className="attr-label">{label}</span>
                <span className="attr-value">{currentCir[key] || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Composition Analysis */}
      {analysisResult?.alignment && (
        <div className="guidance-section">
          <h3>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Composition Analysis
          </h3>
          <div className="comp-text">{analysisResult.alignment}</div>
        </div>
      )}

      {/* Strategy Proposals (from AI analysis) */}
      {proposals.length > 0 && (
        <div className="guidance-section proposals-section">
          <h3>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Strategy Proposals
          </h3>

          <div className="proposals-list">
            {proposals.map((proposal, idx) => {
              const colorSet = strategyColors[idx % strategyColors.length]
              const shot = proposal.shots?.[0]
              const isActive = idx === activeProposal
              const overlayImage = proposal.overlayImage
              const isLoading = loadingOverlay[idx]

              return (
                <div
                  key={idx}
                  className={`proposal-card ${isActive ? 'active' : ''}`}
                  style={{
                    '--proposal-color': colorSet.color,
                    '--proposal-bg': colorSet.bg,
                  }}
                  onClick={() => handleSelectProposal(idx)}
                >
                  {/* Header */}
                  <div className="proposal-header">
                    <span className="proposal-badge" style={{ background: colorSet.color }}>
                      {STRATEGY_LABELS[idx]}
                    </span>
                    <span className="proposal-name">{proposal.name}</span>
                  </div>

                  {/* Overlay image — only shown after generated */}
                  {overlayImage && (
                    <div className="proposal-preview">
                      <img
                        src={overlayImage}
                        alt={`${proposal.name} overlay guide`}
                        className="proposal-overlay-img"
                      />
                    </div>
                  )}

                  {/* Loading state */}
                  {isLoading && !overlayImage && (
                    <div className="proposal-loading">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Generating overlay...
                    </div>
                  )}

                  {/* Intention tags */}
                  {proposal.intention_tags?.length > 0 && (
                    <div className="proposal-tags">
                      {proposal.intention_tags.map((tag, i) => (
                        <span key={i} className="proposal-tag">{tag}</span>
                      ))}
                    </div>
                  )}

                  {/* CIR comparison */}
                  {shot?.cir && currentCir && (
                    <div className="proposal-cir-diff">
                      {CIR_FIELDS.filter(({ key }) =>
                        shot.cir[key] !== currentCir[key]
                      ).map(({ key, label }) => (
                        <div key={key} className="cir-diff-item">
                          <span className="cir-diff-label">{label}</span>
                          <span className="cir-diff-from">{currentCir[key]}</span>
                          <span className="cir-diff-arrow">→</span>
                          <span className="cir-diff-to" style={{ color: colorSet.color }}>
                            {shot.cir[key]}
                          </span>
                        </div>
                      ))}
                      {CIR_FIELDS.every(({ key }) => shot.cir[key] === currentCir[key]) && (
                        <div className="cir-diff-same">Same as current</div>
                      )}
                    </div>
                  )}

                  {/* Theory rationale */}
                  {shot?.theory_rationale && (
                    <div className="proposal-theory">
                      {shot.source && (
                        <div className="proposal-source">{shot.source}</div>
                      )}
                      <div className="proposal-rationale">{shot.theory_rationale}</div>
                    </div>
                  )}

                  {/* Generate hint — only if no overlay yet and not loading */}
                  {!overlayImage && !isLoading && (
                    <div className="proposal-generate-hint">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m21 15-5-5L5 21" />
                      </svg>
                      Click to generate overlay guide
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Overlay Controls */}
      <div className="guidance-section">
        <h3>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
          </svg>
          Overlay Guides
        </h3>
        <div className="toggle-row">
          {[
            { key: 'thirds', label: 'Rule of Thirds' },
            { key: 'eyeline', label: 'Eyeline Guide' },
            { key: 'annotations', label: 'Annotations' },
          ].map(({ key, label }) => (
            <label key={key} className="toggle-label">
              <input
                type="checkbox"
                checked={overlays[key]}
                onChange={() => toggleOverlay(key)}
              />
              <span className="toggle-switch" />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

    </div>
  )
}
