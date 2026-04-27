import React from 'react'
import useStore from '../store/useStore'
import ScriptPanel from './ScriptPanel'
import LayerPanel from './LayerPanel'
import StoryboardView from './StoryboardView' // StoryboardView를 재사용합니다.
import './SideDrawer.css'

const TABS = [
  { id: 'script', label: 'Script', icon: 'M12 2v20M2 12h20' },
  { id: 'sketch', label: 'Sketch', icon: 'M12 19l7-7 3 3-7 7-3-3z' },
  { id: 'assets', label: 'Assets', icon: 'M4 4h16v16H4z' },
]

export default function SideDrawer() {
  const viewMode = useStore((s) => s.viewMode)
  const isScriptOpen = useStore((s) => s.isScriptOpen)
  const setScriptOpen = useStore((s) => s.setScriptOpen)
  const isDrawerExpanded = useStore((s) => s.isDrawerExpanded)
  const setIsDrawerExpanded = useStore((s) => s.setIsDrawerExpanded)
  const drawerTab = useStore((s) => s.drawerTab)
  const setDrawerTab = useStore((s) => s.setDrawerTab)

  const handleTabClick = (id) => {
    // 만약 이미 스크립트 메인 뷰인데 스크립트 탭을 누르면 아무 일도 안 함 (또는 서랍만 닫음)
    if (id === 'script' && viewMode === 'script') {
      if (isScriptOpen) setScriptOpen(false)
      return
    }

    // 그 외의 경우 (Overview, Detail 등)에서는 서랍(Drawer)으로 동작
    if (drawerTab === id && isScriptOpen) {
      setScriptOpen(false)
    } else {
      setDrawerTab(id)
      setScriptOpen(true)
    }
  }

  // 확장 시 "Storyboard Mode"로 표시하기 위한 로직
  const isImmersiveMode = isDrawerExpanded && drawerTab === 'script';

  return (
    <div className={`side-drawer-container ${isScriptOpen ? 'open' : 'closed'} ${isDrawerExpanded ? 'expanded' : ''}`}>
      
      {/* 1. Global Tab Rail */}
      <div className="tab-rail">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`rail-btn ${(tab.id === 'script' && viewMode === 'script') || (drawerTab === tab.id && isScriptOpen) ? 'active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
            title={tab.label}
          >
            <div className="btn-indicator" />
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              {tab.id === 'script' && <path d="M7 8h10M7 12h10M7 16h7" />}
              {tab.id === 'sketch' && <path d="M12 19l7-7-3-3" />}
              {tab.id === 'assets' && <path d="M9 3v18M3 9h18" />}
            </svg>
            <span className="rail-label">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 2. Contextual Content Area (Dynamic Layout) */}
      <div className="drawer-content">
        <div className="content-header">
          <div className="title-area">
            <h3>{TABS.find(t => t.id === drawerTab)?.label}</h3>
            {isImmersiveMode && <span className="immersive-badge">Immersive Storyboard</span>}
          </div>
          
          <div className="header-actions">
            {drawerTab === 'script' && (
              <button
                className={`action-btn ${isDrawerExpanded ? 'active' : ''}`}
                onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}
                title={isDrawerExpanded ? "Normal Script" : "Show Storyboard View"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  {isDrawerExpanded ? (
                    <path d="M18 13l-6-6-6 6m6-6v12" />
                  ) : (
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  )}
                </svg>
              </button>
            )}
            <button className="action-btn close-btn" onClick={() => setScriptOpen(false)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="content-body">
          {/* 확장 모드일 때는 StoryboardView(2단)를, 아닐 때는 ScriptPanel(1단)을 보여줌 */}
          {drawerTab === 'script' && (
            isDrawerExpanded ? <StoryboardView /> : <ScriptPanel />
          )}
          {drawerTab === 'sketch' && (
            <div className="sketch-tools-container">
              <LayerPanel />
            </div>
          )}
          {drawerTab === 'assets' && (
            <div className="assets-placeholder">
              <p>Assets & References</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
