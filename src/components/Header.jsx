import React, { useState, useEffect } from 'react'
import useStore from '../store/useStore'
import './Header.css'

export default function Header() {
  const activeStrategy = useStore((s) => s.activeStrategy)
  const strategies = useStore((s) => s.strategies)
  const activeShot = useStore((s) => s.activeShot)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const strategy = strategies[activeStrategy]
  const shot = strategy?.shots?.[activeShot]

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo">
          <span className="logo-icon">🎬</span>
          <span className="logo-text">SceneLens <span className="logo-v">v2</span></span>
        </div>
        <div className="header-divider"></div>
        <div className="current-context">
          <span className="context-label">PROJECT</span>
          <span className="context-value">No Country for Old Men</span>
        </div>
      </div>

      <div className="header-center">
        <div className="shot-status-badge">
          <span className="status-dot"></span>
          <span className="status-text">
            {strategy?.name} — Shot {shot?.order || activeShot + 1}
          </span>
        </div>
      </div>

      <div className="header-right">
        <button className="header-action-btn" onClick={toggleFullscreen} title="Fullscreen (F)">
          {isFullscreen ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
          )}
        </button>
      </div>
    </header>
  )
}
