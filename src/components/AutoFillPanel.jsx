import useStore from '../store/useStore'
// import { requestAutoFillRange } from '../services/api'
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

export default function AutoFillPanel() {
  const autoFill = useStore((s) => s.autoFill)
  const closeAutoFill = useStore((s) => s.closeAutoFill)
  const setAutoFillPrompt = useStore((s) => s.setAutoFillPrompt)
  const setAutoFillStatus = useStore((s) => s.setAutoFillStatus)
  const setAutoFillPreviewVersion = useStore((s) => s.setAutoFillPreviewVersion)
  const acceptAutoFillVersion = useStore((s) => s.acceptAutoFillVersion)
  const scenes = useStore((s) => s.scenes)
  const activeScene = useStore((s) => s.activeScene)

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
    // MOCK
    await new Promise(r => setTimeout(r, 1500))
    setAutoFillStatus('ready', MOCK_VERSIONS(rangeShots))
    setAutoFillPreviewVersion(0)
    // TODO: replace with real API
    // try {
    //   const res = await requestAutoFillRange({
    //     shots: rangeShots.map(_toApiShot),
    //     scriptContext: scene?.scriptContext || '',
    //     intent: scene?.intent || '',
    //     userPrompt: autoFill.userPrompt,
    //     versionCount: 3,
    //   })
    //   setAutoFillStatus('ready', res.versions)
    //   setAutoFillPreviewVersion(0)
    // } catch (e) {
    //   console.error('[AutoFill]', e)
    //   setAutoFillStatus('error')
    // }
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

function MOCK_VERSIONS(rangeShots) {
  const firstId = rangeShots[0]?.id
  const secondId = rangeShots[1]?.id
  const lastId = rangeShots[rangeShots.length - 1]?.id
  return [
    {
      version_label: 'Version A — 긴장 고조형',
      rationale: '빠른 컷과 인서트를 교차 배치해 씬의 긴장감을 단계적으로 끌어올립니다. Eisenstein의 충격 몽타주 원리를 적용해 각 컷이 이전 감정을 증폭시킵니다.',
      theory_basis: "Eisenstein — Collision Montage",
      editorial_techniques: [
        { type: 'match_cut', shot_pair: ['S1', 'S2'], mechanism: '앞 샷 손동작의 방향선이 새 인서트의 오브젝트로 이어지며 형태 매치됨', theory_source: "The Five C's of Cinematography — Matched Action" },
        { type: 'rhythm', shot_pair: ['S2', 'S3'], mechanism: '평균 1.2초 컷 리듬으로 긴장을 단계적으로 압축', theory_source: 'In the Blink of an Eye — Rhythm' },
        { type: 'eyeline', shot_pair: ['S3', 'S4'], mechanism: '반응샷 인물의 시선이 앞 인서트 오브젝트를 정확히 향함', theory_source: "The Five C's — Eyeline Match" },
      ],
      insertions: [
        {
          after_shot_id: firstId,
          candidate: {
            id: `mock-v1-1-${Date.now()}`,
            label: 'Insert — 손 클로즈업',
            category: 'insert',
            cir: { shotSize: 'Extreme Close-Up', horizontalAngle: 'Frontal', motionHint: 'Static' },
            image: null,
            rationale: '앞 샷의 행동을 극도로 좁혀 관객의 시선을 한 점에 집중시킵니다.',
            flow_connection: '앞 샷 행동 → 디테일 집중 → 반응',
          }
        },
        {
          after_shot_id: secondId,
          candidate: {
            id: `mock-v1-2-${Date.now()}`,
            label: 'Reaction — 인물 반응 MCU',
            category: 'reaction',
            cir: { shotSize: 'Medium Close-Up', horizontalAngle: 'Three-Quarter', motionHint: 'Static' },
            image: null,
            rationale: 'Kuleshov 효과로 인서트에 대한 심리 반응을 명확히 보여줍니다.',
            flow_connection: '디테일 → 감정 반응 → 다음 행동',
          }
        }
      ]
    },
    {
      version_label: 'Version B — 리듬 환기형',
      rationale: '씬 외부 공간으로의 컷어웨이를 통해 리듬을 일시 완화한 뒤 다시 메인으로 돌아오는 구조입니다. Walter Murch의 "눈 깜빡임" 원리에 따라 관객에게 숨쉴 공간을 줍니다.',
      theory_basis: 'In the Blink of an Eye — Temporal Ellipsis',
      editorial_techniques: [
        { type: 'l_cut', shot_pair: ['S1', 'S2'], mechanism: '앞 샷의 대사/음향이 컷어웨이 영상 위로 1.5초 연장되어 공간적 연결감 유지', theory_source: 'In the Blink of an Eye — L-Cut' },
        { type: 'rhythm', shot_pair: ['S2', 'S3'], mechanism: '정적 와이드 (3초+)를 중간에 두어 호흡 공간을 제공', theory_source: 'In the Blink of an Eye — Rhythm and Silence' },
        { type: 'temporal_ellipsis', shot_pair: ['S2', 'S3'], mechanism: '외부 와이드를 경유해 씬 내 시간이 자연스럽게 건너뜀', theory_source: 'In the Blink of an Eye — Temporal Ellipsis' },
      ],
      insertions: [
        {
          after_shot_id: firstId,
          candidate: {
            id: `mock-v2-1-${Date.now()}`,
            label: 'Cutaway — 외부 와이드',
            category: 'cutaway',
            cir: { shotSize: 'Wide', horizontalAngle: 'Frontal', motionHint: 'Static' },
            image: null,
            rationale: '씬 외부 공간으로 잠깐 이탈해 시간 압축과 공간적 맥락을 제공합니다.',
            flow_connection: '내부 → 외부 맥락 → 내부',
          }
        }
      ]
    },
    {
      version_label: 'Version C — POV 몰입형',
      rationale: '인물의 시점 샷을 중심으로 관객을 씬 내부로 끌어들입니다. 주관적 카메라가 관객을 인물과 동일시하게 만드는 Hitchcock식 몰입 기법입니다.',
      theory_basis: "Hitchcock — Subjective Camera",
      editorial_techniques: [
        { type: 'eyeline', shot_pair: ['S3', 'S4'], mechanism: '앞 샷 인물의 시선 방향이 새 POV의 카메라 각도와 정확히 일치', theory_source: "The Five C's — Eyeline Match / Point of View" },
        { type: 'j_cut', shot_pair: ['S4', 'S5'], mechanism: '뒷 샷의 대사가 POV 영상 위에서 미리 시작되어 심리적 선행감 조성', theory_source: 'In the Blink of an Eye — J-Cut' },
        { type: 'rhythm', shot_pair: ['S3', 'S4'], mechanism: '핸드헬드의 미세 움직임으로 심리적 불안 리듬 형성', theory_source: 'Hitchcock — Subjective Camera' },
      ],
      insertions: [
        {
          after_shot_id: lastId,
          candidate: {
            id: `mock-v3-1-${Date.now()}`,
            label: 'POV — 인물 시점 Medium',
            category: 'pov',
            cir: { shotSize: 'Medium', horizontalAngle: 'Frontal', motionHint: 'Handheld' },
            image: null,
            rationale: '인물의 시선으로 장면을 보여줘 관객을 주인공과 동일시시킵니다.',
            flow_connection: '객관적 → 주관적 POV',
          }
        }
      ]
    }
  ]
}

// function _toApiShot(shot) {
//   return { id: shot.id, label: shot.label, cir: shot.cir || null, image: shot.image || null, scriptBeat: shot.scriptBeat ?? 0 }
// }
