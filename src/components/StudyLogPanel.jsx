import { useEffect, useState } from 'react'
import {
  readLog, summarize, exportLog, resetLog, condition, setCondition,
  phase, startTask, endTask, taskStartedAt,
} from '../store/studyLog'
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

export default function StudyLogPanel({ onClose }) {
  const [tick, setTick] = useState(0)
  const log = readLog()
  const summary = summarize(log)

  // 열어 둔 채로 작업하면 쌓이는 것이 바로 보여야 한다.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(timer)
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
            {`세션 ${summary.session} · 조건 `}
            <button
              type="button"
              className="study-log-condition"
              onClick={() => {
                const next = window.prompt('실험 조건', condition())
                if (next) setCondition(next)
              }}
            >
              {summary.condition}
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
              onClick={() => { startTask(); setTick((n) => n + 1) }}
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
                onClick={() => { endTask(); setTick((n) => n + 1) }}
              >
                과제 종료
              </button>
            )}
          </>
        )}
      </section>

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
        <button type="button" onClick={() => exportLog()}>JSON 내보내기</button>
        <button
          type="button"
          className="study-log-reset"
          onClick={() => {
            const ok = window.confirm(
              `수정 ${summary.edits.total}건, 생성 ${summary.regeneration.total}건의 기록을 지웁니다.\n`
              + '내보내지 않았다면 되돌릴 수 없습니다. 계속할까요?',
            )
            if (ok) {
              resetLog()
              setTick((n) => n + 1)
            }
          }}
        >
          비우기
        </button>
      </footer>
    </div>
  )
}
