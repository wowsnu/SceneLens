import useStore from '../store/useStore'
import { requestAutoFillRange } from '../services/api'
import './AutoFillPanel.css'

const TECHNIQUE_LABELS = {
  match_cut: '매치컷',
  j_cut: 'J컷',
  l_cut: 'L컷',
  eyeline: '시선 연결',
  rhythm: '리듬',
  temporal_ellipsis: '시간 생략',
  line_crossing: '선 넘기',
}

function stripDataUrl(image) {
  if (!image || typeof image !== 'string') return null
  if (!image.startsWith('data:')) return null
  if (!image.startsWith('data:image/png') && !image.startsWith('data:image/jpeg') && !image.startsWith('data:image/webp')) {
    return null
  }
  return image.split(',', 2)[1] || null
}

function toApiShot(shot, index) {
  return {
    id: shot?.id || `shot-${index + 1}`,
    label: shot?.label || `Shot ${index + 1}`,
    cir: shot?.cir || null,
    image: stripDataUrl(shot?.image),
    scriptBeat: shot?.scriptBeat ?? shot?.beat ?? 0,
  }
}

function pickRangeScript(screenplay, rangeShots) {
  const fullScript = screenplay.map((line) => line.text).join('\n')
  const beats = rangeShots
    .map((shot) => shot.scriptBeat ?? shot.beat)
    .filter((beat) => typeof beat === 'number')

  if (beats.length === 0) return fullScript

  const from = Math.min(...beats)
  const to = Math.max(...beats)
  const rangeText = screenplay
    .filter((line) => typeof line.beat === 'number' && line.beat >= from && line.beat <= to)
    .map((line) => line.text)
    .join('\n')

  if (!rangeText) return fullScript

  return `[Focused range beats ${from}-${to}]\n${rangeText}\n\n[Full scene]\n${fullScript}`
}

export default function AutoFillPanel() {
  const autoFill = useStore((s) => s.autoFill)
  const closeAutoFill = useStore((s) => s.closeAutoFill)
  const setAutoFillPrompt = useStore((s) => s.setAutoFillPrompt)
  const setAutoFillStatus = useStore((s) => s.setAutoFillStatus)
  const setAutoFillPreviewVersion = useStore((s) => s.setAutoFillPreviewVersion)
  const acceptAutoFillVersion = useStore((s) => s.acceptAutoFillVersion)
  const scenes = useStore((s) => s.scenes)
  const activeScene = useStore((s) => s.activeScene)
  const screenplay = useStore((s) => s.screenplay)
  const intent = useStore((s) => s.intent)

  // ── Empty state — no range selected ─────────────────
  if (!autoFill) {
    return (
      <div className="autofill-panel">
        <div className="autofill-header">
          <div className="autofill-title">
            <span className="autofill-icon">✦✦</span>
            <span>Auto-fill Range</span>
          </div>
        </div>
        <div className="autofill-idle">
          그리드에서 <strong>Auto-fill Range</strong> 버튼을 눌러<br/>
          범위를 선택하세요.<br/><br/>
          AI가 해당 범위를 이론 관점에서 분석해<br/>
          3가지 편집 버전을 제안합니다.
        </div>
      </div>
    )
  }

  const scene = scenes[activeScene]
  const branch = scene?.branches[autoFill.branchIdx]
  const allShots = branch?.shots || []
  const rangeShots = allShots.slice(autoFill.fromIdx, autoFill.toIdx + 1)

  const previewIdx = autoFill.previewVersion ?? 0

  const handleGenerate = async () => {
    if (rangeShots.length < 2) return
    setAutoFillStatus('loading')

    try {
      const res = await requestAutoFillRange({
        shots: rangeShots.map(toApiShot),
        scriptContext: pickRangeScript(screenplay, rangeShots),
        intent: intent || '선택한 샷 범위의 편집 흐름을 더 설득력 있게 구성',
        userPrompt: autoFill.userPrompt,
        versionCount: 3,
      })
      const versions = res.versions || []
      setAutoFillStatus(versions.length > 0 ? 'ready' : 'error', versions)
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
    <div className="autofill-panel">
      <div className="autofill-header">
        <div className="autofill-title">
          <span className="autofill-icon">✦✦</span>
          <span>Auto-fill Range</span>
          <span className="autofill-subtitle">
            S{autoFill.fromIdx + 1}–S{autoFill.toIdx + 1} · {rangeShots.length}샷
          </span>
        </div>
        <button className="autofill-close" onClick={closeAutoFill} title="닫기">×</button>
      </div>

      {/* ── Before analysis — prompt + generate ─────────────── */}
      {autoFill.status !== 'ready' && (
        <div className="autofill-prompt-row">
          <textarea
            className="autofill-prompt"
            placeholder="편집 방향을 설명하세요 (선택) — 긴장 고조, 빠른 리듬..."
            value={autoFill.userPrompt}
            onChange={(e) => setAutoFillPrompt(e.target.value)}
            rows={3}
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
                <span>AI 분석</span>
              </>
            )}
          </button>
        </div>
      )}

      {autoFill.status === 'error' && (
        <div className="autofill-error">생성 실패. 다시 시도해주세요.</div>
      )}

      {/* ── After analysis — A/B/C version cards ─────────────── */}
      {autoFill.status === 'ready' && autoFill.versions?.length > 0 && (
        <>
          <div className="autofill-version-cards">
            {autoFill.versions.map((v, i) => {
              const letter = String.fromCharCode(65 + i)
              const name = v.version_label.replace(/^Version [A-C] — /, '')
              return (
                <div
                  key={i}
                  className={`autofill-version-card ${i === previewIdx ? 'active' : ''}`}
                  onClick={() => setAutoFillPreviewVersion(i)}
                >
                  <div className="autofill-version-card-head">
                    <span className="autofill-version-letter">{letter}</span>
                    <span className="autofill-version-card-name">{name}</span>
                    <span className="autofill-version-count">+{v.insertions?.length || 0}</span>
                  </div>
                  <div className="autofill-version-card-rationale">{v.rationale}</div>

                  {v.editorial_techniques?.length > 0 && (
                    <div className="autofill-version-card-techniques">
                      <div className="autofill-techniques-label">📎 편집 기법</div>
                      <div className="autofill-techniques-list">
                        {v.editorial_techniques.map((t, ti) => (
                          <div key={ti} className="autofill-technique">
                            <div className="autofill-technique-head">
                              <span className={`autofill-technique-chip tech-${t.type}`}>
                                {TECHNIQUE_LABELS[t.type] || t.type}
                              </span>
                              {t.shot_pair?.length >= 2 && (
                                <span className="autofill-technique-pair">
                                  {t.shot_pair[0]} → {t.shot_pair[1]}
                                </span>
                              )}
                            </div>
                            <span className="autofill-technique-desc">{t.mechanism}</span>
                            {t.theory_source && (
                              <span className="autofill-technique-source">📖 {t.theory_source}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="autofill-version-card-theory">
                    <span>📖</span>
                    <span>{v.theory_basis}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="autofill-actions">
            <button className="autofill-accept" onClick={handleAccept}>
              ✓ 버전 {String.fromCharCode(65 + previewIdx)} 적용
            </button>
            <button className="autofill-retry" onClick={handleGenerate} title="다시 생성">↻</button>
          </div>
          <div className="autofill-hint">
            카드를 클릭하면 그리드에서 미리보기로 확인할 수 있습니다.
          </div>
        </>
      )}

      {autoFill.status === 'idle' && rangeShots.length >= 2 && (
        <div className="autofill-idle-small">
          S{autoFill.fromIdx + 1}–S{autoFill.toIdx + 1} 사이에<br/>
          AI가 3가지 편집 버전을 제안합니다.
        </div>
      )}
    </div>
  )
}
