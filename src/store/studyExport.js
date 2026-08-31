/**
 * 세션 하나를 내보낸다 — 파일과 서버 양쪽으로.
 *
 * 이 일을 한 곳에 둔다. 전에는 단축키(App)와 로그 창 버튼이 각자
 * 내보냈는데, 버튼 쪽은 `exportLog()`만 불러 **파일만 받고 서버에는
 * 안 올라갔다.** 어느 쪽으로 눌렀느냐에 따라 결과가 달라지는 것은
 * 실험 기록에서 가장 위험한 종류의 차이다.
 */

import useStore from './useStore'
import { exportLog, markUploaded } from './studyLog'

/**
 * 마지막 산출물. 분석 중 think-aloud/영상의 한 시점을 결과물과 이을 수
 * 있게 한다. 이미지 원본은 따로 저장되므로 구조와 식별자만 담는다.
 */
const finalSnapshot = () => {
  const state = useStore.getState()
  return {
    captured_at: new Date().toISOString(),
    screenplay: state.screenplay,
    active_scene: state.activeScene,
    scenes: (state.scenes || []).map((scene, sceneIndex) => ({
      id: scene.id || `scene-${sceneIndex + 1}`,
      title: scene.title || '',
      active_branch: scene.activeBranch ?? 0,
      shots: (scene.branches?.[scene.activeBranch ?? 0]?.shots || []).map((shot, order) => ({
        id: shot.id,
        order: order + 1,
        label: shot.label || shot.intent || '',
        image: shot.image || null,
        beat: shot.scriptBeat ?? shot.beat ?? null,
      })),
    })),
  }
}

/**
 * 내보낸다. 파일은 즉시 받고, 서버 업로드 결과를 기다려 돌려준다.
 *
 * 서버가 실패해도 파일은 이미 손에 있다 — 그래서 실패를 던지지 않고
 * 결과로 알린다. 호출부가 그걸 사람에게 보여 줄 책임을 진다.
 */
export const runStudyExport = async () => {
  const payload = exportLog({ finalSnapshot: finalSnapshot(), metadata: { tool: 'SceneLens' } })
  console.log('[study] exported', payload.summary)

  try {
    const response = await fetch('/api/study/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'scenelens',
        // 참가자 번호가 두 조건을 잇는다. 실험자가 안 넣었으면 세션
        // id로 떨어지되, 그때는 두 조건이 안 이어진다.
        participant_id: payload.metadata.participant_id || payload.metadata.session_id,
        condition: payload.metadata.condition,
        payload,
      }),
    })
    if (response.ok) {
      // 서버에 닿은 것이 확인된 뒤에만 남긴다. 이 표시가 있어야
      // `다음 참가자 준비`(비우기)를 내놓는다.
      markUploaded()
      return { payload, uploaded: true }
    }
    const detail = await response.text().catch(() => '')
    return { payload, uploaded: false, reason: `${response.status} ${detail.slice(0, 200)}` }
  } catch (error) {
    return { payload, uploaded: false, reason: `서버에 연결 못 함 — ${String(error).slice(0, 200)}` }
  }
}

/** 내보낸 뒤 사람에게 결과를 알린다. 두 호출부가 같은 문구를 쓴다. */
export const runStudyExportWithAlert = async () => {
  const result = await runStudyExport()
  if (result.uploaded) {
    window.alert('내보내기 완료 — 파일 저장됨, 서버에도 올라갔습니다.')
  } else {
    window.alert(
      `파일은 저장됐지만 서버 업로드에 실패했습니다.\n${result.reason}\n\n`
      + '다운로드된 JSON 파일을 반드시 보관하세요.',
    )
  }
  return result
}
