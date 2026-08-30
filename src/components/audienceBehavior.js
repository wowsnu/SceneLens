export const AUDIENCE_ACTIONS = {
  continue: { label: '계속 봄', mark: '→' },
  pause: { label: '잠시 멈춤', mark: 'Ⅱ' },
  recheck: { label: '앞을 다시 봄', mark: '↩' },
  push_through: { label: '모르지만 넘어감', mark: '…' },
  exit_risk: { label: '이탈 위험', mark: '×' },
}

export const audienceAction = (action) => (
  AUDIENCE_ACTIONS[action] || { label: action || '행동 변화', mark: '·' }
)

// 행동은 여러 컷을 가리킬 수 있다. 마지막 컷이 지금 행동이 일어난
// 순간이고, 앞의 컷들은 `다시 보기`의 대상이다.
export const engagementSignalAt = (reading, panelOrder) => (
  (reading?.engagement_signals || []).find((signal) => (
    (signal.panel_orders || []).at(-1) === panelOrder
  )) || null
)
