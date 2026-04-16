import { useState } from 'react'
import useStore from '../store/useStore'
import FlowTab from './FlowTab'
import ReframePanel from './ReframePanel'
import ReframeTab from './ReframeTab'
import SpatialMap from './SpatialMap'
import './ShotPanel.css'

export default function ShotPanel() {
  const detailTab = useStore((s) => s.detailTab)
  const setDetailTab = useStore((s) => s.setDetailTab)
  const [mapExpanded, setMapExpanded] = useState(false)
  const [mapCollapsed, setMapCollapsed] = useState(false)

  return (
    <aside className="shot-panel panel">
      {/* 1. Permanent Spatial Map (Mini-map) */}
      {mapExpanded && (
        <div className="spatial-fullscreen">
          <div className="spatial-fullscreen-header">
            <span className="section-label">📍 SPATIAL CONTEXT</span>
            <button className="map-expand-btn" onClick={() => setMapExpanded(false)}>↙ Exit</button>
          </div>
          <SpatialMap compact={false} />
        </div>
      )}

      <div className={`mini-map-section ${mapCollapsed ? 'collapsed' : ''}`}>
        <div className="section-header">
          <span className="section-label">📍 SPATIAL CONTEXT</span>
          <div className="map-header-actions">
            <button
              className="map-expand-btn"
              title={mapCollapsed ? '펼치기' : '접기'}
              onClick={() => setMapCollapsed((prev) => !prev)}
            >
              {mapCollapsed ? '▾' : '▴'}
            </button>
            <button className="map-expand-btn" title="전체보기" onClick={() => setMapExpanded(true)}>↗</button>
          </div>
        </div>
        <div className={`mini-map-container ${mapCollapsed ? 'hidden' : ''}`}>
          <SpatialMap compact={true} />
        </div>
      </div>

      {/* 2. Inspector Tabs (Contextual Info) */}
      {!mapExpanded && <div className="inspector-content">
        <div className="tab-header">
          <button
            className={`tab-btn ${detailTab === 'reframe' ? 'active' : ''}`}
            onClick={() => setDetailTab('reframe')}
          >
            AI Lab
          </button>
          <button
            className={`tab-btn ${detailTab === 'guidance' ? 'active' : ''}`}
            onClick={() => setDetailTab('guidance')}
          >
            Reframe
          </button>
          <button
            className={`tab-btn ${detailTab === 'flow' ? 'active' : ''}`}
            onClick={() => setDetailTab('flow')}
          >
            Sequence
          </button>
        </div>

        <div className="tab-content-area">
          {detailTab === 'reframe' && <ReframePanel />}
          {detailTab === 'guidance' && <ReframeTab />}
          {detailTab === 'flow' && <FlowTab />}
        </div>
      </div>}
    </aside>
  )
}
