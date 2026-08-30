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
  if (readings.length === 0) return null

  const conditionLabel = (conditionId) => {
    const condition = conditions.find((entry) => entry.id === conditionId)
    return condition?.title || condition?.label || conditionId
  }

  return (
    <section className="audience-after-reading" aria-label="종료 후 회상">
      <header className="audience-after-reading-head">
        <div>
          <span>관람 후 남은 것</span>
          <strong>다 보고 난 뒤 무엇이 남았는가</strong>
        </div>
        <p>순차 읽기가 끝난 뒤에도 남은 사건, 단서와 질문입니다.</p>
      </header>

      <div className="audience-after-reading-list">
        {readings.map((entry, readerIndex) => {
          const reading = entry.reading || {}
          const recall = reading.recall || {}
          return (
            <article
              key={entry.condition_id}
              className="audience-after-reading-card"
              style={{ '--reader': `var(--reader-${readerIndex % 4})` }}
            >
              <header>
                <span aria-hidden="true">{readerIndex + 1}</span>
                <strong>{conditionLabel(entry.condition_id)}</strong>
              </header>

              <section className="audience-recall" aria-label="다 보고 난 뒤">
                <dl>
                  <RecallItem label="기억한 사건">{recall.remembered_event}</RecallItem>
                  {(recall.remembered_clues || []).length > 0 && (
                    <RecallItem label="기억한 단서">
                      <span className="audience-recall-clues">
                        {recall.remembered_clues.map((clue, index) => (
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
