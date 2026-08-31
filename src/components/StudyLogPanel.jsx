import { useEffect, useState } from 'react'
import {
  readLog, summarize, resetLog, condition, setCondition,
  conditionOrder, setConditionOrder,
  phase, startTask, endTask, taskStartedAt, exportedAt,
  participantId, setParticipantId,
} from '../store/studyLog'
import { runStudyExportWithAlert } from '../store/studyExport'
import './StudyLogPanel.css'

/**
 * 실험 로그를 눈으로 확인하는 창.
 *
 * 로그가 제대로 쌓이는지 세션 중에 알 방법이 없으면, 참가자를 다 돌리고
 * 나서야 비어 있는 것을 발견하게 된다. 그때는 복구할 수 없다.
 *
 * 참가자에게는 보이지 않는다 — Ctrl+Shift+L로만 열린다.
 */
const TYPE_LABELS = {
  edit: '수정',
  scaffold: '기능 사용',
  panel_generate: '패널 생성',
  viewer_read: '관객 읽기',
  viewer_result: '관객 결과',
  intent_check: '의도 대조',
  phase_start: '과제 시작',
  phase_end: '과제 종료',
  verdict: '판정',
  review: '검토 실행',
  route: '이동',
}

const pct = (value) => `${Math.round(value * 100)}%`

const timeOf = (t) => new Date(t).toLocaleTimeString('ko-KR', { hour12: false })

export default function StudyLogPanel({ onClose, onPhaseChange }) {
  const [tick, setTick] = useState(0)
  const log = readLog()
  const summary = summarize(log)

  // 열어 둔 채로 작업하면 쌓이는 것이 바로 보여야 한다.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  // 서버 저장이 될 상태인가. **실험을 시작하기 전에** 알아야 한다 —
  // 세션이 끝난 뒤 설정이 빠진 것을 알면 그 참가자 기록은 파일 하나에만
  // 남는다. 패널을 열 때 한 번 물어본다.
  const [storage, setStorage] = useState(null)
  const [exporting, setExporting] = useState(false)
  useEffect(() => {
    let alive = true
    fetch('/api/study/export/health')
      .then((response) => response.json())
      .then((result) => { if (alive) setStorage(result) })
      .catch((error) => {
        if (alive) setStorage({ ready: false, reason: `서버에 연결 못 함: ${error}` })
      })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const recent = [...log].reverse().slice(0, 40)
  const currentPhase = phase()
  const startedAt = taskStartedAt()

  return (
    <div className="study-log-panel" data-tick={tick}>
      <header>
        <div>
          <strong>실험 로그</strong>
          <span>
            {'참가자 '}
            {/* 두 도구가 다른 도메인이라 이 번호가 없으면 같은 사람의
                두 조건을 이을 수 없다. 비어 있으면 눈에 띄게 둔다. */}
            <button
              type="button"
              className={`study-log-condition${summary.participant ? '' : ' is-unset'}`}
              onClick={() => {
                const next = window.prompt('참가자 번호 (예: P01)', participantId())
                if (next) { setParticipantId(next); setTick((n) => n + 1) }
              }}
            >
              {summary.participant || '번호?'}
            </button>
            {` · 조건 `}
            <button
              type="button"
              className="study-log-condition"
              onClick={() => {
                const next = window.prompt('실험 조건 (baseline / scenelens)', condition())
                if (next) { setCondition(next); setTick((n) => n + 1) }
              }}
            >
              {summary.condition}
            </button>
            {' · '}
            {/* 몇 번째 조건인가. within-subjects라 순서 효과를 조건 차이와
                갈라야 하는데, 이것도 안 정하면 `unset`으로 남는다. */}
            <button
              type="button"
              className="study-log-condition"
              onClick={() => {
                const next = window.prompt('이 참가자의 몇 번째 조건인가 (1 / 2)', conditionOrder())
                if (next) { setConditionOrder(next); setTick((n) => n + 1) }
              }}
            >
              {summary.conditionOrder === 'unset' ? '순서?' : `${summary.conditionOrder}번째`}
            </button>
            {` · 이벤트 ${summary.events}건`}
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label="닫기">✕</button>
      </header>

      {/* 측정이 시작됐는가.

          튜토리얼에서 누른 것도 그대로 쌓이므로, 시작을 누르기 전까지는
          측정 대상이 아니라고 화면이 먼저 말해야 한다. 실험자가 이 줄을
          보고 누르지 않으면 아래 숫자는 계속 0에 머문다 — 조용히 섞이는
          것보다 눈에 띄게 비어 있는 편이 낫다. */}
      <section className={`study-log-phase is-${currentPhase}`}>
        {currentPhase === 'tutorial' ? (
          <>
            <div>
              <strong>튜토리얼 (측정 안 함)</strong>
              <small>
                {summary.tutorial.events > 0
                  ? `지금까지 ${summary.tutorial.events}건은 기록만 되고 측정에서 빠집니다.`
                  : '본 과제를 시작하면 여기부터 측정합니다.'}
              </small>
            </div>
            <button
              type="button"
              className="study-log-start"
              onClick={() => { startTask(); setTick((n) => n + 1); onPhaseChange?.() }}
            >
              과제 시작
            </button>
          </>
        ) : (
          <>
            <div>
              <strong>{currentPhase === 'task' ? '과제 진행 중' : '과제 종료됨'}</strong>
              <small>
                {startedAt
                  ? `${timeOf(startedAt)} 시작`
                  : '시작 시각이 기록되지 않았습니다.'}
                {summary.tutorial.events > 0 && ` · 시작 전 ${summary.tutorial.events}건 제외`}
                {summary.afterTask.events > 0 && ` · 종료 후 ${summary.afterTask.events}건 제외`}
              </small>
            </div>
            {currentPhase === 'task' && (
              <button
                type="button"
                className="study-log-end"
                onClick={() => { endTask(); setTick((n) => n + 1); onPhaseChange?.() }}
              >
                과제 종료
              </button>
            )}
          </>
        )}
      </section>

      {/* 서버 저장이 될 상태인가. 안 되면 파일 다운로드만 남으므로,
          그 사실을 실험 **전에** 알아야 한다. */}
      {storage && !storage.ready && (
        <p className="study-log-storage-warn">
          서버 저장 불가 — {storage.reason}
          <small>내보내기는 파일로만 됩니다. JSON을 반드시 보관하세요.</small>
        </p>
      )}

      <div className="study-log-body">
        <section>
          <h4>지금까지</h4>
          <dl>
            <div><dt>수정</dt><dd>{summary.edits.total}건</dd></div>
            <div>
              <dt>패널 너머</dt>
              <dd>{pct(summary.edits.beyondPanelRatio)}</dd>
            </div>
            <div>
              <dt>재생성</dt>
              <dd>{`${summary.regeneration.total}회 (반복 ${summary.regeneration.repeats})`}</dd>
            </div>
            <div><dt>기능 사용</dt><dd>{summary.scaffolding.total}회</dd></div>
            <div><dt>관객 읽기</dt><dd>{summary.viewer.reads}회</dd></div>
          </dl>

          <h4>렌즈별 수정</h4>
          <ul className="study-log-dist">
            {Object.entries(summary.edits.byLens).map(([key, value]) => (
              <li key={key}><span>{key}</span><em>{value}</em></li>
            ))}
            {summary.edits.total === 0 && <li className="empty">아직 없음</li>}
          </ul>

          <h4>층위별 수정</h4>
          <ul className="study-log-dist">
            {Object.entries(summary.edits.byLevel).map(([key, value]) => (
              <li key={key}><span>{key}</span><em>{value}</em></li>
            ))}
            {summary.edits.total === 0 && <li className="empty">아직 없음</li>}
          </ul>

          <h4>기능을 쓴 뒤 수정이 따라왔는가</h4>
          <ul className="study-log-dist">
            {Object.entries(summary.scaffolding.followedByEdit).map(([key, value]) => (
              <li key={key}>
                <span>{key}</span>
                <em>{`${value.ledToEdit}/${value.used}`}</em>
              </li>
            ))}
            {summary.scaffolding.total === 0 && <li className="empty">아직 없음</li>}
          </ul>
        </section>

        <section>
          <h4>{`최근 이벤트 (최신순, ${recent.length}/${log.length})`}</h4>
          <ol className="study-log-events">
            {recent.map((event) => (
              <li key={event.id}>
                <span className="study-log-time">{timeOf(event.t)}</span>
                <span className={`study-log-type is-${event.type}`}>
                  {TYPE_LABELS[event.type] || event.type}
                </span>
                <span className="study-log-detail">
                  {[
                    event.lens,
                    event.level,
                    event.feature,
                    event.action,
                    event.target,
                    event.repeat ? '반복' : null,
                    event.source && event.source !== 'manual' ? event.source : null,
                  ].filter(Boolean).join(' · ') || '—'}
                </span>
              </li>
            ))}
            {log.length === 0 && (
              <li className="empty">
                아직 아무것도 기록되지 않았습니다. 컷을 고치거나 검토를 돌려 보세요.
              </li>
            )}
          </ol>
        </section>
      </div>

      <footer>
        {/* 단축키(Ctrl+Shift+E)와 **같은 것을 부른다.** 전에는 이 버튼이
            `exportLog()`만 불러 파일만 받고 서버에는 안 올라갔다. */}
        <button
          type="button"
          className="study-log-export"
          disabled={exporting}
          onClick={async () => {
            setExporting(true)
            try {
              await runStudyExportWithAlert()
            } finally {
              setExporting(false)
              setTick((n) => n + 1)
            }
          }}
        >
          {exporting ? '내보내는 중…' : '내보내기 (파일 + 서버)'}
        </button>
        <button
          type="button"
          className="study-log-reset"
          onClick={() => {
            // 내보낸 적 없는 세션을 지우는 것이 가장 위험하다. 그
            // 사실을 조건문이 아니라 맨 앞에 세운다.
            const ok = window.confirm(
              (exportedAt()
                ? `마지막 내보내기: ${new Date(exportedAt()).toLocaleString('ko-KR')}\n\n`
                : '⚠️ 이 세션은 한 번도 내보내지 않았습니다.\n지우면 기록이 사라집니다.\n\n')
              + `수정 ${summary.edits.total}건, 생성 ${summary.regeneration.total}건의 기록을 지웁니다. 계속할까요?`,
            )
            if (ok) {
              resetLog()
              setTick((n) => n + 1)
              onPhaseChange?.()
            }
          }}
        >
          비우기
        </button>
      </footer>
    </div>
  )
}
