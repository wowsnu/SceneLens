import './App.css'
import useStore from './store/useStore'
import Header from './components/Header'
import ScriptPanel from './components/ScriptPanel'
import CenterPanel from './components/CenterPanel'
import ShotPanel from './components/ShotPanel'

function App() {
  const viewMode = useStore((s) => s.viewMode)

  return (
    <>
      <Header />
      <main className={`workspace mode-${viewMode}`}>
        <ScriptPanel />
        <CenterPanel />
        <ShotPanel />
      </main>
    </>
  )
}

export default App
