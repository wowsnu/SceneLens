import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AppErrorBoundary from './AppErrorBoundary.jsx'
import useStore from './store/useStore.js'
import {
  readCheckpoint,
  saveCheckpoint,
  SCENELENS_CHECKPOINT_KEY,
} from './store/recoveryCheckpoint.js'

const recoverToStoryboard = () => {
  const state = useStore.getState()
  state.leaveReview()
  state.clearStoryboardShotSelection()
  state.setLeftPanelVisible(true)
  state.setMaximizedPanel('left')
}

const recoverySnapshot = (state) => {
  const snapshot = Object.fromEntries(
    Object.entries(state).filter(([, value]) => typeof value !== 'function'),
  )
  // 요청은 복구할 수 없지만 요청 직전까지의 작업은 복구할 수 있다. 로딩
  // 표시를 저장하면 새로고침 뒤 영원히 기다리는 카드가 생긴다.
  snapshot.panelGenerationPending = {}
  return snapshot
}

const startRecoveryCheckpointing = () => {
  let timer = null
  const persist = () => saveCheckpoint(
    SCENELENS_CHECKPOINT_KEY,
    recoverySnapshot(useStore.getState()),
  )
  const unsubscribe = useStore.subscribe(() => {
    window.clearTimeout(timer)
    timer = window.setTimeout(persist, 700)
  })
  window.addEventListener('pagehide', persist)
  return unsubscribe
}

const bootstrap = async () => {
  const checkpoint = await readCheckpoint(SCENELENS_CHECKPOINT_KEY)
  if (checkpoint?.state) useStore.setState(checkpoint.state)
  startRecoveryCheckpointing()

  createRoot(document.getElementById('root')).render(
    <AppErrorBoundary onRecover={recoverToStoryboard}>
      <App />
    </AppErrorBoundary>,
  )
}

bootstrap().catch((error) => {
  console.error('[SceneLens] recovery bootstrap failed', error)
  createRoot(document.getElementById('root')).render(
    <AppErrorBoundary onRecover={recoverToStoryboard}>
      <App />
    </AppErrorBoundary>,
  )
})
