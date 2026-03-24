import { useState, useEffect } from 'react'
import useStore from '../store/useStore'
import './Header.css'

const VIEW_MODES = [
  {
    id: 'script', label: 'Script',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/><line x1="2" y1="6" x2="14" y2="6" stroke="currentColor" strokeWidth="2"/><line x1="2" y1="10" x2="14" y2="10" stroke="currentColor" strokeWidth="2"/></svg>
  },
  {
    id: 'storyboard', label: 'Storyboard',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/><rect x="10" y="4" width="4" height="4" fill="currentColor"/><line x1="2" y1="5" x2="8" y2="5" stroke="currentColor" strokeWidth="2"/><line x1="2" y1="11" x2="14" y2="11" stroke="currentColor" strokeWidth="2"/></svg>
  },
  {
    id: 'focus', label: 'Focus',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2h4v2H4v2H2V2zm12 0h-4v2h2v2h2V2zM2 14h4v-2H4v-2H2v4zm12 0h-4v-2h2v-2h2v4z"/></svg>
  },
  {
    id: 'detail', label: 'Detail',
    icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="2" y="2" width="12" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/><line x1="8" y1="2" x2="8" y2="14" stroke="currentColor" strokeWidth="2"/></svg>
  },
]

export default function Header() {
  const viewMode = useStore((s) => s.viewMode)
  const setViewMode = useStore((s) => s.setViewMode)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  return (
    <header className="main-header">
      <div className="header-left">
        <div className="logo-group">
          <div className="logo-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="12" stroke="var(--accent)" strokeWidth="2" />
              <circle cx="14" cy="14" r="7" stroke="var(--accent)" strokeWidth="1.5" />
              <circle cx="14" cy="14" r="3" fill="var(--accent)" />
              <line x1="14" y1="0" x2="14" y2="4" stroke="var(--accent)" strokeWidth="1" />
              <line x1="14" y1="24" x2="14" y2="28" stroke="var(--accent)" strokeWidth="1" />
              <line x1="0" y1="14" x2="4" y2="14" stroke="var(--accent)" strokeWidth="1" />
              <line x1="24" y1="14" x2="28" y2="14" stroke="var(--accent)" strokeWidth="1" />
            </svg>
          </div>
          <h1 className="logo-text">SceneLens</h1>
        </div>
        <span className="tagline">Cinematic Design Assistant</span>
      </div>

      <div className="header-center">
        <div className="scene-info">
          <span className="scene-badge">Scene 14</span>
          <span className="scene-title">The Last Question</span>
        </div>
        <div className="view-mode-toggle">
          {VIEW_MODES.map((m) => (
            <button
              key={m.id}
              className={`mode-btn ${viewMode === m.id ? 'active' : ''}`}
              onClick={() => setViewMode(m.id)}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="header-right">
        <div className="header-meta">
          <span className="meta-item">INT. INTERROGATION ROOM</span>
          <span className="meta-sep">&bull;</span>
          <span className="meta-item">NIGHT</span>
        </div>
        <button className="fullscreen-btn" onClick={toggleFullscreen} title="Toggle Fullscreen">
          {isFullscreen ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M5 1H1v4h2V3h2V1zm6 0h4v4h-2V3h-2V1zM1 11h2v2h2v2H1v-4zm12 2h-2v2h4v-4h-2v2z"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1 1h4v2H3v2H1V1zm10 0h4v4h-2V3h-2V1zM1 11h2v2h2v2H1v-4zm10 4v-2h2v-2h2v4h-4z"/>
            </svg>
          )}
        </button>
      </div>
    </header>
  )
}
