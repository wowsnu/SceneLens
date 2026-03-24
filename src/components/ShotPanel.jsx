import useStore from '../store/useStore'
import GuidanceTab from './GuidanceTab'
import FlowTab from './FlowTab'
import './ShotPanel.css'

export default function ShotPanel() {
  const viewMode = useStore((s) => s.viewMode)
  const detailTab = useStore((s) => s.detailTab)
  const setDetailTab = useStore((s) => s.setDetailTab)

  // Only show in detail mode (default view)
  if (viewMode !== 'detail') return null

  return (
    <aside className="shot-panel panel">
      {/* Tab Header */}
      <div className="tab-header">
        <button
          className={`tab-btn ${detailTab === 'guidance' ? 'active' : ''}`}
          onClick={() => setDetailTab('guidance')}
        >
          Shot Guidance
        </button>
        <button
          className={`tab-btn ${detailTab === 'flow' ? 'active' : ''}`}
          onClick={() => setDetailTab('flow')}
        >
          Scene Flow
        </button>
      </div>

      {/* Tab Content */}
      {detailTab === 'guidance' && <GuidanceTab />}
      {detailTab === 'flow' && <FlowTab />}
    </aside>
  )
}
