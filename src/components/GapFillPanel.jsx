import { useState } from 'react'
import useStore from '../store/useStore'
import './GapFillPanel.css'

// ── Ghost Cell — rendered inline in Grid/Card between shots ──────────────
export function GapGhostCell({ gapKey }) {
  const gapFills = useStore((s) => s.gapFills)
  const setGapFillPrompt = useStore((s) => s.setGapFillPrompt)
  const setGapFillStatus = useStore((s) => s.setGapFillStatus)
  const closeGapFill = useStore((s) => s.closeGapFill)
  const openGapFillPicker = useStore((s) => s.openGapFillPicker)

  const gap = gapFills[gapKey]
  if (!gap) return null

  const handleGenerate = async () => {
    setGapFillStatus(gapKey, 'loading')
    // MOCK
    await new Promise(r => setTimeout(r, 1200))
    setGapFillStatus(gapKey, 'ready', MOCK_CANDIDATES())
    // TODO: replace with real API
    // import { requestGapFill } from '../services/api'
    // const [branchIdxStr, afterIdxStr] = gapKey.split('-')
    // const scene = useStore.getState().scenes[useStore.getState().activeScene]
    // const branch = scene?.branches[+branchIdxStr]
    // const shots = branch?.shots || []
    // try {
    //   const res = await requestGapFill({
    //     leftShot: shots[+afterIdxStr], rightShot: shots[+afterIdxStr + 1],
    //     scriptContext: scene?.scriptContext || '', intent: scene?.intent || '',
    //     userPrompt: gap.userPrompt, candidateCount: 3,
    //   })
    //   setGapFillStatus(gapKey, 'ready', res.candidates)
    // } catch (e) {
    //   setGapFillStatus(gapKey, 'error')
    // }
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
    insertShot(gap.branchIdx, gap.afterShotIdx, {
      id: c.id,
      label: c.label,
      cir: c.cir,
      image: c.image || null,
      scriptBeat: 0,
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
                  ? <img src={`data:image/png;base64,${c.image}`} alt={c.label} />
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

// ── Mock data ─────────────────────────────────────────────────────────────
function MOCK_CANDIDATES() {
  return [
    {
      id: `mock-${Date.now()}-1`,
      label: 'Insert — 소품 디테일 클로즈업',
      category: 'insert',
      cir: { shotSize: 'Extreme Close-Up', horizontalAngle: 'Frontal', verticalLevel: 'Eye', viewpointFraming: 'Objective', occlusion: 'None', depth: 'Shallow', motionHint: 'Static' },
      image: null,
      rationale: '앞 샷의 공간을 구체화하는 소품 인서트. 관객의 시선을 한 점에 집중시키고 다음 샷의 감정 전환을 준비합니다. 컷의 리듬을 잠시 늦추는 효과가 있습니다.',
      theory_source: "The Five C's of Cinematography — Insert shot technique",
      flow_connection: '앞 샷의 공간감을 디테일로 구체화하고, 뒷 샷의 감정 전환을 위한 심리적 여백을 만듭니다.',
    },
    {
      id: `mock-${Date.now()}-2`,
      label: 'Reaction — 인물 반응 미디엄 클로즈업',
      category: 'reaction',
      cir: { shotSize: 'Medium Close-Up', horizontalAngle: 'Three-Quarter', verticalLevel: 'Eye', viewpointFraming: 'Objective', occlusion: 'None', depth: 'Shallow', motionHint: 'Static' },
      image: null,
      rationale: 'Kuleshov 효과를 활용해 앞 샷 자극에 대한 인물의 반응을 삽입합니다. 관객이 인물의 심리를 읽게 만들고 다음 행동에 동기를 부여합니다.',
      theory_source: 'Kuleshov Effect — Montage and emotional juxtaposition',
      flow_connection: '앞 샷의 사건을 인물이 어떻게 받아들이는지 보여주고 뒷 샷으로의 감정적 논리를 완성합니다.',
    },
    {
      id: `mock-${Date.now()}-3`,
      label: 'Cutaway — 외부 공간 와이드',
      category: 'cutaway',
      cir: { shotSize: 'Wide', horizontalAngle: 'Frontal', verticalLevel: 'Eye', viewpointFraming: 'Objective', occlusion: 'None', depth: 'Deep', motionHint: 'Static' },
      image: null,
      rationale: '씬 외부 공간을 잠깐 보여주며 시간 압축과 공간적 맥락을 제공합니다. 두 샷 사이의 리듬을 조절하고 긴장감을 환기시킵니다.',
      theory_source: 'In the Blink of an Eye — Rhythm and temporal ellipsis',
      flow_connection: '앞 샷의 시간적 연속성을 의도적으로 끊고 뒷 샷을 새로운 맥락 위에 놓는 효과를 만듭니다.',
    },
  ]
}
