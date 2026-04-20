import { useState } from 'react'
import useStore from '../store/useStore'
import { requestAutoFillRange } from '../services/api'
import './AutoFillPanel.css'

export default function AutoFillPanel() {
  const autoFill = useStore((s) => s.autoFill)
  const closeAutoFill = useStore((s) => s.closeAutoFill)
  const setAutoFillPrompt = useStore((s) => s.setAutoFillPrompt)
  const setAutoFillStatus = useStore((s) => s.setAutoFillStatus)
  const setAutoFillPreviewVersion = useStore((s) => s.setAutoFillPreviewVersion)
  const acceptAutoFillVersion = useStore((s) => s.acceptAutoFillVersion)
  const scenes = useStore((s) => s.scenes)
  const activeScene = useStore((s) => s.activeScene)

  if (!autoFill) return null

  const scene = scenes[activeScene]
  const branch = scene?.branches[autoFill.branchIdx]
  const allShots = branch?.shots || []
  const rangeShots = allShots.slice(autoFill.fromIdx, autoFill.toIdx + 1)

  const previewIdx = autoFill.previewVersion ?? 0
  const currentVersion = autoFill.versions?.[previewIdx]

  const handleGenerate = async () => {
    if (rangeShots.length < 2) return
    setAutoFillStatus('loading')
    try {
      const scriptContext = scene?.scriptContext || ''
      const intent = scene?.intent || ''
      const res = await requestAutoFillRange({
        shots: rangeShots.map(_toApiShot),
        scriptContext,
        intent,
        userPrompt: autoFill.userPrompt,
        versionCount: 3,
      })
      setAutoFillStatus('ready', res.versions)
      setAutoFillPreviewVersion(0)
    } catch (e) {
      console.error('[AutoFill]', e)
      setAutoFillStatus('error')
    }
  }

  const handleAccept = () => {
    acceptAutoFillVersion(previewIdx)
  }

  return (
    <div className="autofill-overlay" onClick={closeAutoFill}>
      <div className="autofill-panel" onClick={(e) => e.stopPropagation()}>

        <div className="autofill-header">
          <div className="autofill-title">
            <span className="autofill-icon">✦✦</span>
            <span>Auto-fill Range</span>
            <span className="autofill-subtitle">
              Shot {autoFill.fromIdx + 1} – {autoFill.toIdx + 1}
              &nbsp;({rangeShots.length}개 샷)
            </span>
          </div>
          <button className="autofill-close" onClick={closeAutoFill}>×</button>
        </div>

        {/* Range preview strip */}
        <div className="autofill-range-strip">
          {rangeShots.map((s, i) => (
            <div key={s.id} className="autofill-range-shot">
              <div className="autofill-range-frame">
                {s.image
                  ? <img src={s.image} alt={s.label} />
                  : <span className="autofill-range-num">{autoFill.fromIdx + i + 1}</span>
                }
              </div>
              <span className="autofill-range-label">{s.label}</span>
            </div>
          ))}
        </div>

        {/* Prompt */}
        <div className="autofill-prompt-row">
          <textarea
            className="autofill-prompt"
            placeholder="이 범위의 전체 편집 방향을 설명하세요 (선택 사항) — e.g. 긴장감 고조, 빠른 리듬, Kuleshov 효과 활용..."
            value={autoFill.userPrompt}
            onChange={(e) => setAutoFillPrompt(e.target.value)}
            rows={2}
            disabled={autoFill.status === 'loading'}
          />
          <button
            className={`autofill-generate-btn ${autoFill.status === 'loading' ? 'loading' : ''}`}
            onClick={handleGenerate}
            disabled={autoFill.status === 'loading' || rangeShots.length < 2}
          >
            {autoFill.status === 'loading' ? (
              <>
                <span className="autofill-spinner" />
                <span>분석 중...</span>
              </>
            ) : (
              <>
                <span>✦</span>
                <span>{autoFill.status === 'ready' ? '다시 생성' : 'AI 분석'}</span>
              </>
            )}
          </button>
        </div>

        {autoFill.status === 'error' && (
          <div className="autofill-error">생성 실패. 다시 시도해주세요.</div>
        )}

        {autoFill.status === 'ready' && autoFill.versions?.length > 0 && (
          <>
            {/* Version tabs */}
            <div className="autofill-version-tabs">
              {autoFill.versions.map((v, i) => (
                <button
                  key={i}
                  className={`autofill-version-tab ${i === previewIdx ? 'active' : ''}`}
                  onClick={() => setAutoFillPreviewVersion(i)}
                >
                  <span className="autofill-version-letter">{String.fromCharCode(65 + i)}</span>
                  <span className="autofill-version-name">{v.version_label.replace(/^Version [A-C] — /, '')}</span>
                </button>
              ))}
            </div>

            {/* Version detail */}
            {currentVersion && (
              <div className="autofill-version-body">
                <div className="autofill-version-meta">
                  <div className="autofill-version-rationale">{currentVersion.rationale}</div>
                  <div className="autofill-version-theory">
                    <span className="autofill-theory-icon">📖</span>
                    <span>{currentVersion.theory_basis}</span>
                  </div>
                </div>

                <div className="autofill-insertions-label">
                  삽입 샷 {currentVersion.insertions?.length || 0}개
                </div>

                <div className="autofill-insertions">
                  {(currentVersion.insertions || []).map((ins, i) => {
                    const c = ins.candidate
                    const afterShot = rangeShots.find(s => s.id === ins.after_shot_id)
                    return (
                      <div key={i} className="autofill-insertion">
                        <div className="autofill-insertion-after">
                          ↳ {afterShot?.label || ins.after_shot_id} 다음
                        </div>
                        <div className="autofill-insertion-card">
                          <div className="autofill-ins-frame">
                            {c.image
                              ? <img src={`data:image/png;base64,${c.image}`} alt={c.label} />
                              : <span className="autofill-ins-cat">{c.category}</span>
                            }
                          </div>
                          <div className="autofill-ins-info">
                            <div className="autofill-ins-label">{c.label}</div>
                            <div className="autofill-ins-cir">
                              {c.cir?.shotSize && <span>{c.cir.shotSize}</span>}
                              {c.cir?.horizontalAngle && <span>{c.cir.horizontalAngle}</span>}
                              {c.cir?.motionHint && <span>{c.cir.motionHint}</span>}
                            </div>
                            <div className="autofill-ins-rationale">{c.rationale}</div>
                            <div className="autofill-ins-flow">{c.flow_connection}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="autofill-actions">
              <button className="autofill-accept" onClick={handleAccept}>
                버전 {String.fromCharCode(65 + previewIdx)} 채택
              </button>
              <button className="autofill-cancel" onClick={closeAutoFill}>취소</button>
            </div>
          </>
        )}

        {autoFill.status === 'idle' && (
          <div className="autofill-idle">
            AI가 이 범위 전체를 이론 관점에서 분석해 3가지 편집 버전을 제안합니다.<br />
            각 버전은 서로 다른 페이싱/감정 전략을 가집니다.
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
