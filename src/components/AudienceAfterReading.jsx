import './AudienceAfterReading.css'

function RecallItem({ label, children, accent = false }) {
  if (!children) return null
  return (
    <div className={`audience-recall-item${accent ? ' accent' : ''}`}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function AudienceAfterReading({ readings = [], conditions = [] }) {
  // 응답 모양을 믿지 않는다. 이 화면은 검토 전체를 들고 있어, 여기서 한
  // 번 터지면 감독이 하던 작업까지 사라진다.
  const entries = Array.isArray(readings) ? readings : []
  if (entries.length === 0) return null

  const conditionLabel = (conditionId) => {
    const condition = (Array.isArray(conditions) ? conditions : [])
      .find((entry) => entry?.id === conditionId)
    return condition?.title || condition?.label || conditionId
  }

  return (
    <section className="audience-after-reading" aria-label="종료 후 회상">
      <header className="audience-after-reading-head">
        <div>
          <span>🧑 시청 후 남은 것</span>
          <strong>처음 본 사람에게 마지막까지 남은 것</strong>
        </div>
        <p>순차 읽기가 끝난 뒤에도 남은 사건, 단서와 질문입니다.</p>
      </header>

      <div className="audience-after-reading-list">
        {entries.map((entry, readerIndex) => {
          const reading = entry?.reading || {}
          const recall = reading.recall || {}
          const clues = Array.isArray(recall.remembered_clues) ? recall.remembered_clues : []
          return (
            <article
              key={entry?.condition_id || readerIndex}
              className="audience-after-reading-card"
              style={{ '--reader': `var(--reader-${readerIndex % 4})` }}
            >
              <header>
                <span aria-hidden="true">🧑</span>
                <strong>{conditionLabel(entry?.condition_id)}</strong>
              </header>

              <section className="audience-recall" aria-label="다 보고 난 뒤">
                <dl>
                  <RecallItem label="기억한 사건">{recall.remembered_event}</RecallItem>
                  {clues.length > 0 && (
                    <RecallItem label="기억한 단서">
                      <span className="audience-recall-clues">
                        {clues.map((clue, index) => (
                          <i key={`${clue}:${index}`}>{clue}</i>
                        ))}
                      </span>
                    </RecallItem>
                  )}
                  <RecallItem label="남은 궁금증" accent>{recall.remaining_question}</RecallItem>
                </dl>
              </section>
            </article>
          )
        })}
      </div>
    </section>
  )
}
