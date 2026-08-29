import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AppErrorBoundary from './AppErrorBoundary.jsx'
import useStore from './store/useStore.js'

const recoverToStoryboard = () => {
  const state = useStore.getState()
  state.leaveReview()
  state.clearStoryboardShotSelection()
  state.setLeftPanelVisible(true)
  state.setMaximizedPanel('left')
}

createRoot(document.getElementById('root')).render(
  <AppErrorBoundary onRecover={recoverToStoryboard}>
    <App />
  </AppErrorBoundary>,
)
