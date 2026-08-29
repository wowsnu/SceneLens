import { Component } from 'react'

/**
 * 마지막 안전망. 검토 도구의 한 경로가 예외를 내더라도 앱 전체를 검은
 * 화면으로 남기지 않고, 사용자가 작업 중이던 스토리보드로 돌아갈 수 있게
 * 한다. 정상 경로의 오류를 숨기는 용도가 아니므로 콘솔에는 그대로 남긴다.
 */
export default class AppErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[SceneLens] recovered from a render error', error, info)
  }

  recover = () => {
    this.props.onRecover?.()
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main
        role="alert"
        style={{
          minHeight: '100vh', display: 'grid', placeItems: 'center',
          padding: 24, background: '#0c0c0e', color: '#f4f4f5',
        }}
      >
        <section style={{ maxWidth: 460, padding: 28, border: '1px solid rgba(255,255,255,.15)', borderRadius: 12, background: '#141417' }}>
          <h1 style={{ marginTop: 0, fontSize: 20 }}>검토 화면을 열지 못했습니다</h1>
          <p style={{ color: '#c4c4ca', lineHeight: 1.55 }}>
            작업은 지워지지 않았습니다. 스토리보드로 돌아가서 계속할 수 있습니다.
          </p>
          <button type="button" onClick={this.recover}>스토리보드로 돌아가기</button>
        </section>
      </main>
    )
  }
}
