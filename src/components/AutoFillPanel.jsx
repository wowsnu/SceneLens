import useStore from '../store/useStore'
// import { requestAutoFillRange } from '../services/api'  // 실제 API (프로토타입 데모용으로 mock 사용 중)
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

// eslint-disable-next-line no-unused-vars -- 아래 비활성화된 API 호출이 쓴다
function toApiShot(shot, index) {
  return {
    id: shot?.id || `shot-${index + 1}`,
    label: shot?.label || `Shot ${index + 1}`,
    cir: shot?.cir || null,
    image: stripDataUrl(shot?.image),
    scriptBeat: shot?.scriptBeat ?? shot?.beat ?? 0,
  }
}

// ── Mock auto-fill 응답 생성 (프로토타입 데모용) ─────────────────
// 실제 백엔드가 없어도 동작하도록, 각 샷 사이에 1개씩 새 샷을 끼워넣는
// 3개 버전(A/B/C)을 만들어서 반환한다.
function buildMockAutoFillResponse(rangeShots) {
  if (!rangeShots || rangeShots.length < 2) return { versions: [] }

  const pairs = []
  for (let i = 0; i < rangeShots.length - 1; i++) {
    pairs.push({ after: rangeShots[i], before: rangeShots[i + 1], gapIdx: i })
  }

  const makeInsertion = (afterShot, beforeShot, tag) => {
    const idBase = `mock-${tag}-${afterShot.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    return {
      after_shot_id: afterShot.id,
      candidate: {
        id: idBase,
        label: `${tag} · ${afterShot.label || ''} → ${beforeShot.label || ''}`,
        category: tag,
        cir: afterShot.cir || null,
        image: afterShot.image || null,
        scriptBeat: afterShot.scriptBeat ?? afterShot.beat ?? 0,
      },
    }
  }

  // 전략별로 "어느 gap"에 끼울지 다르게 — 모든 샷에 넣지 않는다.
  // 짝수/홀수, 처음/끝, 가운데만 등으로 분기해서 버전마다 위치를 차별화.
  const N = pairs.length
  const pickEveryOther = pairs.filter((_, i) => i % 2 === 0)            // 0, 2, 4... — 리듬: 균등하게 절반
  const pickEnds = N >= 2 ? [pairs[0], pairs[N - 1]] : [pairs[0]]        // 시선: 도입/마무리 연결만
  const pickMiddle = N >= 3                                              // 시간 생략: 중간 구간만 압축
    ? pairs.slice(Math.floor(N / 3), Math.ceil((N * 2) / 3) || 1)
    : [pairs[Math.floor(N / 2)] || pairs[0]]

  const buildTechniques = (picks, type, mechanism, source) =>
    picks.slice(0, 3).map(({ after, before }) => ({
      type,
      shot_pair: [after.label, before.label],
      mechanism,
      theory_source: source,
    }))

  const versions = [
    {
      version_label: 'Version A — 리듬 강조',
      rationale: `샷 사이 ${pickEveryOther.length}곳에 짧은 인서트를 균등 배치해 편집 리듬을 빠르게 가져갑니다.`,
      theory_basis: '몽타주 이론 — 충돌과 리듬을 통한 의미 생성',
      editorial_techniques: buildTechniques(
        pickEveryOther,
        'rhythm',
        '짧은 인서트로 호흡을 끊고 다음 컷의 임팩트를 강화',
        'Eisenstein, Film Form',
      ),
      insertions: pickEveryOther.map(({ after, before }) => makeInsertion(after, before, 'rhythm')),
    },
    {
      version_label: 'Version B — 시선 연결',
      rationale: `도입부와 마무리 ${pickEnds.length}곳에만 아이라인 매치 컷을 넣어 공간 연속성을 보강합니다.`,
      theory_basis: '연속편집 — 시선 매치로 공간 인지를 유지',
      editorial_techniques: buildTechniques(
        pickEnds,
        'eyeline',
        '시선 방향이 다음 샷의 피사체로 자연스럽게 이어지도록 배치',
        'Bordwell, Film Art',
      ),
      insertions: pickEnds.map(({ after, before }) => makeInsertion(after, before, 'eyeline')),
    },
    {
      version_label: 'Version C — 시간 생략',
      rationale: `중간 구간 ${pickMiddle.length}곳에 엘립시스 컷을 끼워 불필요한 동작을 생략하고 템포를 압축합니다.`,
      theory_basis: '시간 압축 편집 — 생략을 통한 서사 가속',
      editorial_techniques: buildTechniques(
        pickMiddle,
        'temporal_ellipsis',
        '두 샷 사이 시간 간격을 점프해 정보 밀도를 높임',
        'Murch, In the Blink of an Eye',
      ),
      insertions: pickMiddle.map(({ after, before }) => makeInsertion(after, before, 'ellipsis')),
    },
  ]

  return { versions }
}

// eslint-disable-next-line no-unused-vars -- 아래 비활성화된 API 호출이 쓴다
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
  // eslint-disable-next-line no-unused-vars -- 아래 비활성화된 API 호출이 쓴다
  const screenplay = useStore((s) => s.screenplay)
  // eslint-disable-next-line no-unused-vars -- 아래 비활성화된 API 호출이 쓴다
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

    // ── 실제 API 호출 (프로토타입 데모용으로 비활성화) ──────────────
    // try {
    //   const res = await requestAutoFillRange({
    //     shots: rangeShots.map(toApiShot),
    //     scriptContext: pickRangeScript(screenplay, rangeShots),
    //     intent: intent || '선택한 샷 범위의 편집 흐름을 더 설득력 있게 구성',
    //     userPrompt: autoFill.userPrompt,
    //     versionCount: 3,
    //   })
    //   const versions = res.versions || []
    //   setAutoFillStatus(versions.length > 0 ? 'ready' : 'error', versions)
    //   setAutoFillPreviewVersion(0)
    // } catch (e) {
    //   console.error('[AutoFill]', e)
    //   setAutoFillStatus('error')
    // }

    // ── Mock 응답 (분석하는 듯한 짧은 딜레이 후 가짜 버전 반환) ───
    await new Promise((r) => setTimeout(r, 800))
    const res = buildMockAutoFillResponse(rangeShots)
    const versions = res.versions || []
    setAutoFillStatus(versions.length > 0 ? 'ready' : 'error', versions)
    setAutoFillPreviewVersion(0)
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
