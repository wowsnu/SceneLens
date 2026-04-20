import { useState } from 'react'
import useStore from '../store/useStore'
import { requestGapFill } from '../services/api'
import './GapFillPanel.css'

export default function GapFillPanel() {
  const gapFill = useStore((s) => s.gapFill)
  const closeGapFill = useStore((s) => s.closeGapFill)
  const setGapFillPrompt = useStore((s) => s.setGapFillPrompt)
  const setGapFillStatus = useStore((s) => s.setGapFillStatus)
  const insertShot = useStore((s) => s.flowInsertShot)
  const scenes = useStore((s) => s.scenes)
  const activeScene = useStore((s) => s.activeScene)

  const [selected, setSelected] = useState(null)

  if (!gapFill) return null

  const scene = scenes[activeScene]
  const branch = scene?.branches[gapFill.branchIdx]
  const shots = branch?.shots || []
  const leftShot = shots[gapFill.afterShotIdx]
  const rightShot = shots[gapFill.afterShotIdx + 1]

  const handleGenerate = async () => {
    if (!leftShot || !rightShot) return
    setGapFillStatus('loading')
    setSelected(null)
    try {
      const scriptContext = scene?.scriptContext || ''
      const intent = scene?.intent || ''
      const res = await requestGapFill({
        leftShot: _toApiShot(leftShot),
        rightShot: _toApiShot(rightShot),
        scriptContext,
        intent,
        userPrompt: gapFill.userPrompt,
        candidateCount: 3,
      })
      setGapFillStatus('ready', res.candidates)
    } catch (e) {
      console.error('[GapFill]', e)
      setGapFillStatus('error')
    }
  }

  const handleAccept = () => {
    if (selected === null) return
    const c = gapFill.candidates[selected]
    insertShot(gapFill.branchIdx, gapFill.afterShotIdx, {
      id: c.id,
      label: c.label,
      cir: c.cir,
      image: c.image || null,
      scriptBeat: 0,
      isAIGenerated: true,
      source: 'ai_fill',
    })
    closeGapFill()
  }

  const CATEGORY_LABELS = {
    insert: 'Insert', reaction: 'Reaction', detail: 'Detail',
    cutaway: 'Cutaway', pov: 'POV', establishing: 'Establishing',
  }

  return (
    <div className="gap-fill-overlay" onClick={closeGapFill}>
      <div className="gap-fill-panel" onClick={(e) => e.stopPropagation()}>

        <div className="gap-fill-header">
          <div className="gap-fill-title">
            <span className="gap-fill-icon">✦</span>
            <span>Fill Shot</span>
            <span className="gap-fill-subtitle">
              {leftShot?.label || '—'} → {rightShot?.label || '—'}
            </span>
          </div>
          <button className="gap-fill-close" onClick={closeGapFill}>×</button>
        </div>

        {/* Prompt input */}
        <div className="gap-fill-prompt-row">
          <textarea
            className="gap-fill-prompt"
            placeholder="이 gap에 어떤 샷이 필요한지 설명하세요 (선택 사항) — e.g. 소품 인서트, 반응 샷, 긴장감 전환..."
            value={gapFill.userPrompt}
            onChange={(e) => setGapFillPrompt(e.target.value)}
            rows={2}
            disabled={gapFill.status === 'loading'}
          />
          <button
            className={`gap-fill-generate-btn ${gapFill.status === 'loading' ? 'loading' : ''}`}
            onClick={handleGenerate}
            disabled={gapFill.status === 'loading' || !leftShot || !rightShot}
          >
            {gapFill.status === 'loading' ? (
              <>
                <span className="gap-fill-spinner" />
                <span>분석 중...</span>
              </>
            ) : (
              <>
                <span>✦</span>
                <span>{gapFill.status === 'ready' ? '다시 생성' : 'AI 분석'}</span>
              </>
            )}
          </button>
        </div>

        {gapFill.status === 'error' && (
          <div className="gap-fill-error">생성 실패. 다시 시도해주세요.</div>
        )}

        {/* Candidates */}
        {gapFill.status === 'ready' && gapFill.candidates.length > 0 && (
          <>
            <div className="gap-fill-candidates">
              {gapFill.candidates.map((c, i) => (
                <div
                  key={c.id}
                  className={`gap-fill-card ${selected === i ? 'selected' : ''}`}
                  onClick={() => setSelected(i)}
                >
                  <div className="gap-fill-card-frame">
                    {c.image ? (
                      <img src={`data:image/png;base64,${c.image}`} alt={c.label} />
                    ) : (
                      <div className="gap-fill-card-placeholder">
                        <span>{CATEGORY_LABELS[c.category] || c.category}</span>
                      </div>
                    )}
                    <span className="gap-fill-card-cat">{CATEGORY_LABELS[c.category] || c.category}</span>
                    {selected === i && <div className="gap-fill-card-check">✓</div>}
                  </div>

                  <div className="gap-fill-card-label">{c.label}</div>

                  <div className="gap-fill-card-cir">
                    {c.cir?.shotSize && <span>{c.cir.shotSize}</span>}
                    {c.cir?.horizontalAngle && <span>{c.cir.horizontalAngle}</span>}
                    {c.cir?.motionHint && <span>{c.cir.motionHint}</span>}
                  </div>

                  <div className="gap-fill-card-rationale">{c.rationale}</div>

                  <div className="gap-fill-card-theory">
                    <span className="gap-fill-theory-icon">📖</span>
                    <span>{c.theory_source}</span>
                  </div>

                  <div className="gap-fill-card-flow">{c.flow_connection}</div>
                </div>
              ))}
            </div>

            <div className="gap-fill-actions">
              <button
                className="gap-fill-accept"
                onClick={handleAccept}
                disabled={selected === null}
              >
                선택한 샷 삽입
              </button>
              <button className="gap-fill-cancel" onClick={closeGapFill}>취소</button>
            </div>
          </>
        )}

        {gapFill.status === 'idle' && (
          <div className="gap-fill-idle">
            AI가 이론 라이브러리를 참고해 3개의 fill shot 후보를 제안합니다.<br />
            프롬프트를 입력하면 더 구체적인 제안을 받을 수 있습니다.
          </div>
        )}
      </div>
    </div>
  )
}

function _toApiShot(shot) {
  return {
    id: shot.id,
    label: shot.label,
    cir: shot.cir || null,
    image: shot.image || null,
    scriptBeat: shot.scriptBeat ?? 0,
  }
}
