import { useState } from 'react'
import './SketchInput.css'

function SketchInput({ onAnalysisComplete, onStrategiesGenerated, setLoading }) {
  const [imagePreview, setImagePreview] = useState(null)
  const [imageBase64, setImageBase64] = useState(null)
  const [script, setScript] = useState('')
  const [intent, setIntent] = useState('')

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const base64 = event.target.result.split(',')[1]
      setImageBase64(base64)
      setImagePreview(event.target.result)
    }
    reader.readAsDataURL(file)
  }

  const handleGenerateStrategies = async () => {
    if (!imageBase64 || !script || !intent) {
      alert('스케치, 대본, 연출 의도를 모두 입력해주세요.')
      return
    }

    setLoading(true)

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://15.164.30.174:8000'}/api/suggest-strategies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageBase64,
          script: script,
          intent: intent
        })
      })

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`)
      }

      const data = await response.json()
      onStrategiesGenerated(data.strategies)

      // Also extract CIR from first strategy's first shot for display
      if (data.strategies[0]?.shots[0]?.cir) {
        onAnalysisComplete(data.strategies[0].shots[0].cir)
      }
    } catch (error) {
      console.error('Failed to generate strategies:', error)
      alert('전략 생성 실패: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="sketch-input">
      <h2>📝 입력</h2>

      {/* Image Upload */}
      <div className="input-section">
        <label>스케치 이미지</label>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
        />
        {imagePreview && (
          <div className="image-preview">
            <img src={imagePreview} alt="Sketch preview" />
          </div>
        )}
      </div>

      {/* Script Input */}
      <div className="input-section">
        <label>대본 / 씬 설명</label>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="INT. 거실 - 낮&#10;&#10;주인공이 창문 옆에 서있다. 멀리서 누군가 다가온다..."
          rows={8}
        />
      </div>

      {/* Intent Input */}
      <div className="input-section">
        <label>연출 의도</label>
        <input
          type="text"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="예: 긴장감 고조, 대립 강조, 감정적 친밀감 형성"
        />
      </div>

      <button
        className="generate-btn"
        onClick={handleGenerateStrategies}
        disabled={!imageBase64 || !script || !intent}
      >
        🎬 전략 생성하기
      </button>
    </div>
  )
}

export default SketchInput
