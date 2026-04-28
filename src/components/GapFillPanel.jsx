import { useState } from 'react'
import useStore from '../store/useStore'
import { requestGapFill } from '../services/api'
import './GapFillPanel.css'

function stripDataUrl(image) {
  if (!image || typeof image !== 'string') return null
  if (!image.startsWith('data:')) return null
  if (!image.startsWith('data:image/png') && !image.startsWith('data:image/jpeg') && !image.startsWith('data:image/webp')) {
    return null
  }
  return image.split(',', 2)[1] || null
}

function toApiShot(shot, fallbackLabel) {
  return {
    id: shot?.id || fallbackLabel,
    label: shot?.label || fallbackLabel,
    cir: shot?.cir || null,
    image: stripDataUrl(shot?.image),
    scriptBeat: shot?.scriptBeat ?? shot?.beat ?? 0,
  }
}

function toImageSrc(image) {
  if (!image) return null
  if (image.startsWith('data:') || image.startsWith('/')) return image
  return `data:image/png;base64,${image}`
}

function pickGapScript(screenplay, leftBeat, rightBeat) {
  const fullScript = screenplay.map((line) => line.text).join('\n')
  const beats = [leftBeat, rightBeat].filter((beat) => typeof beat === 'number')
  if (beats.length === 0) return fullScript

  const from = Math.min(...beats)
  const to = Math.max(...beats)
  const beatText = screenplay
    .filter((line) => typeof line.beat === 'number' && line.beat >= from && line.beat <= to)
    .map((line) => line.text)
    .join('\n')

  if (!beatText) return fullScript

  return `[Focused gap beats ${from}-${to}]\n${beatText}\n\n[Full scene]\n${fullScript}`
}

// ── Ghost Cell — rendered inline in Grid/Card between shots ──────────────
export function GapGhostCell({ gapKey }) {
  const gapFills = useStore((s) => s.gapFills)
  const setGapFillPrompt = useStore((s) => s.setGapFillPrompt)
  const setGapFillStatus = useStore((s) => s.setGapFillStatus)
  const closeGapFill = useStore((s) => s.closeGapFill)
  const openGapFillPicker = useStore((s) => s.openGapFillPicker)
  const scenes = useStore((s) => s.scenes)
  const activeScene = useStore((s) => s.activeScene)
  const screenplay = useStore((s) => s.screenplay)
  const intent = useStore((s) => s.intent)

  const gap = gapFills[gapKey]
  if (!gap) return null

  const handleGenerate = async () => {
    setGapFillStatus(gapKey, 'loading')

    const scene = scenes[activeScene]
    const branch = scene?.branches?.[gap.branchIdx]
    const shots = branch?.shots || []
    const leftShot = shots[gap.afterShotIdx]
    const rightShot = shots[gap.afterShotIdx + 1]

    if (!leftShot || !rightShot) {
      setGapFillStatus(gapKey, 'error')
      return
    }

    try {
      const scriptContext = pickGapScript(
        screenplay,
        leftShot.scriptBeat ?? leftShot.beat,
        rightShot.scriptBeat ?? rightShot.beat,
      )
      const res = await requestGapFill({
        leftShot: toApiShot(leftShot, `Shot ${gap.afterShotIdx + 1}`),
        rightShot: toApiShot(rightShot, `Shot ${gap.afterShotIdx + 2}`),
        scriptContext,
        intent: intent || '앞뒤 샷 사이의 편집 흐름을 자연스럽게 연결',
        userPrompt: gap.userPrompt,
        candidateCount: 3,
      })
      const candidates = res.candidates || []
      setGapFillStatus(gapKey, candidates.length > 0 ? 'ready' : 'error', candidates)
    } catch (e) {
      console.error('[GapFill]', e)
      setGapFillStatus(gapKey, 'error')
    }
  }

  const handleCellClick = () => {
    if (gap.status === 'ready') openGapFillPicker(gapKey)
  }

  return (
    <div
      className={`gap-ghost-cell ${gap.status}`}
      onClick={handleCellClick}
      title={gap.status === 'ready' ? '클릭해서 후보 선택' : undefined}
    >
      {gap.status === 'ghost' && (
        <div className="gap-ghost-input-area">
          <input
            className="gap-ghost-prompt"
            placeholder="어떤 샷? (선택)"
            value={gap.userPrompt}
            onChange={(e) => setGapFillPrompt(gapKey, e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate() }}
            autoFocus
          />
          <div className="gap-ghost-actions">
            <button
              className="gap-ghost-generate"
              onClick={(e) => { e.stopPropagation(); handleGenerate() }}
            >
              ✦ 생성
            </button>
            <button
              className="gap-ghost-cancel"
              onClick={(e) => { e.stopPropagation(); closeGapFill(gapKey) }}
            >✕</button>
          </div>
        </div>
      )}

      {gap.status === 'loading' && (
        <div className="gap-ghost-loading">
          <span className="gap-ghost-spinner" />
          <span>분석 중...</span>
        </div>
      )}

      {gap.status === 'ready' && (
        <div className="gap-ghost-ready">
          <span className="gap-ghost-ready-icon">✦</span>
          <span>3개 후보</span>
          <span className="gap-ghost-ready-hint">클릭해서 선택</span>
        </div>
      )}

      {gap.status === 'error' && (
        <div className="gap-ghost-error">
          <span>실패</span>
          <button onClick={(e) => { e.stopPropagation(); handleGenerate() }}>재시도</button>
        </div>
      )}
    </div>
  )
}

// ── Picker Popup — shows candidates when ghost cell is clicked ────────────
export function GapFillPicker() {
  const gapFills = useStore((s) => s.gapFills)
  const gapFillPicker = useStore((s) => s.gapFillPicker)
  const closeGapFillPicker = useStore((s) => s.closeGapFillPicker)
  const closeGapFill = useStore((s) => s.closeGapFill)
  const insertShot = useStore((s) => s.flowInsertShot)

  const [selected, setSelected] = useState(null)

  if (!gapFillPicker) return null
  const gap = gapFills[gapFillPicker.key]
  if (!gap || !gap.candidates?.length) return null

  const handleAccept = () => {
    if (selected === null) return
    const c = gap.candidates[selected]
    const imageSrc = toImageSrc(c.image)
    insertShot(gap.branchIdx, gap.afterShotIdx, {
      id: c.id,
      label: c.label,
      cir: c.cir,
      image: imageSrc,
      scriptBeat: c.scriptBeat,
      isAIGenerated: true,
      source: 'ai_fill',
    })
    closeGapFill(gapFillPicker.key)
    closeGapFillPicker()
    setSelected(null)
  }

  const CATEGORY_LABELS = {
    insert: 'Insert', reaction: 'Reaction', detail: 'Detail',
    cutaway: 'Cutaway', pov: 'POV', establishing: 'Establishing',
  }

  return (
    <div className="gap-picker-overlay" onClick={() => { closeGapFillPicker(); setSelected(null) }}>
      <div className="gap-picker-panel" onClick={(e) => e.stopPropagation()}>
        <div className="gap-picker-header">
          <span className="gap-picker-title">
            <span className="gap-picker-icon">✦</span> Fill Shot 후보
          </span>
          <button className="gap-picker-close" onClick={() => { closeGapFillPicker(); setSelected(null) }}>×</button>
        </div>

        <div className="gap-picker-candidates">
          {gap.candidates.map((c, i) => (
            <div
              key={c.id}
              className={`gap-picker-card ${selected === i ? 'selected' : ''}`}
              onClick={() => setSelected(i)}
            >
              <div className="gap-picker-frame">
                {c.image
                  ? <img src={toImageSrc(c.image)} alt={c.label} />
                  : <div className="gap-picker-placeholder"><span>{CATEGORY_LABELS[c.category] || c.category}</span></div>
                }
                <span className="gap-picker-cat">{CATEGORY_LABELS[c.category] || c.category}</span>
                {selected === i && <div className="gap-picker-check">✓</div>}
              </div>

              <div className="gap-picker-label">{c.label}</div>

              <div className="gap-picker-cir">
                {c.cir?.shotSize && <span>{c.cir.shotSize}</span>}
                {c.cir?.horizontalAngle && <span>{c.cir.horizontalAngle}</span>}
                {c.cir?.motionHint && <span>{c.cir.motionHint}</span>}
              </div>

              <div className="gap-picker-rationale">{c.rationale}</div>

              <div className="gap-picker-theory">
                <span>📖</span><span>{c.theory_source}</span>
              </div>

              <div className="gap-picker-flow">{c.flow_connection}</div>
            </div>
          ))}
        </div>

        <div className="gap-picker-actions">
          <button className="gap-picker-accept" onClick={handleAccept} disabled={selected === null}>
            선택한 샷 삽입
          </button>
          <button className="gap-picker-cancel" onClick={() => { closeGapFillPicker(); setSelected(null) }}>
            취소
          </button>
        </div>
      </div>
    </div>
  )
}
