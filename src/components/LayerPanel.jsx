import useStore from '../store/useStore'
import './LayerPanel.css'

const LAYER_ORDER = [
  { key: 'foreground', label: 'Foreground' },
  { key: 'midground', label: 'Midground' },
  { key: 'background', label: 'Background' },
]

export default function LayerPanel() {
  const canvasLayers = useStore((s) => s.canvasLayers)
  const layerVisibility = useStore((s) => s.layerVisibility)
  const toggleLayerVisibility = useStore((s) => s.toggleLayerVisibility)
  const removeCanvasLayer = useStore((s) => s.removeCanvasLayer)
  const setPendingCanvasImage = useStore((s) => s.setPendingCanvasImage)

  const hasLayers = Object.keys(canvasLayers).length > 0

  if (!hasLayers) return null

  const recomposite = async (layersOverride) => {
    const layers = layersOverride || useStore.getState().canvasLayers
    const vis = useStore.getState().layerVisibility
    const order = ['background', 'midground', 'foreground']
    const keys = order.filter((k) => layers[k] && vis[k])

    if (keys.length === 0) {
      const c = document.createElement('canvas')
      c.width = 1024
      c.height = 768
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, c.width, c.height)
      setPendingCanvasImage(c.toDataURL('image/png'))
      return
    }

    const loadImg = (src) =>
      new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.src = src
      })

    const images = await Promise.all(keys.map((k) => loadImg(layers[k])))
    const canvas = document.createElement('canvas')
    canvas.width = images[0].width
    canvas.height = images[0].height
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    images.forEach((img) => ctx.drawImage(img, 0, 0, canvas.width, canvas.height))
    setPendingCanvasImage(canvas.toDataURL('image/png'))
  }

  const handleToggle = (key) => {
    toggleLayerVisibility(key)
    // Read updated visibility after toggle
    setTimeout(() => recomposite(), 0)
  }

  const handleDelete = (key) => {
    removeCanvasLayer(key)
    // Recomposite without the deleted layer
    const { [key]: _, ...remaining } = canvasLayers
    recomposite(remaining)
  }

  return (
    <div className="layer-panel">
      <div className="layer-panel-header">Layers</div>
      {LAYER_ORDER.map(({ key, label }) => {
        const hasLayer = !!canvasLayers[key]
        const visible = layerVisibility[key]

        if (!hasLayer) return null

        return (
          <div
            key={key}
            className={`layer-panel-item ${!visible ? 'layer-hidden' : ''}`}
          >
            <button
              className="layer-visibility-btn"
              onClick={() => handleToggle(key)}
              title={visible ? 'Hide layer' : 'Show layer'}
            >
              {visible ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 3C4.5 3 1.5 5.5.5 8c1 2.5 4 5 7.5 5s6.5-2.5 7.5-5c-1-2.5-4-5-7.5-5zm0 8a3 3 0 110-6 3 3 0 010 6zm0-5a2 2 0 100 4 2 2 0 000-4z" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2.1 1.4L1.4 2.1l2.3 2.3C2.2 5.6 1.1 6.8.5 8c1 2.5 4 5 7.5 5 1.3 0 2.5-.3 3.5-.9l2.4 2.4.7-.7L2.1 1.4zM8 11a3 3 0 01-2.8-4.1l1.3 1.3a2 2 0 002.3 2.3l1.3 1.3c-.6.3-1.3.5-2.1.5zm0-8c-1.3 0-2.5.3-3.5.9l1.1 1.1c.7-.3 1.5-.5 2.4-.5 3.5 0 6.5 2.5 7.5 5-.5 1.2-1.3 2.3-2.3 3.1l1.1 1.1C15.8 11.4 16 9.7 15.5 8c-1-2.5-4-5-7.5-5z" />
                </svg>
              )}
            </button>
            <div
              className="layer-thumbnail"
              style={{ backgroundImage: `url(${canvasLayers[key]})` }}
            />
            <span className="layer-panel-label">{label}</span>
            <button
              className="layer-delete-btn"
              onClick={() => handleDelete(key)}
              title={`Delete ${label}`}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.6 3.5L8 6.9l3.4-3.4.7.7L8.7 7.6l3.4 3.4-.7.7L8 8.3l-3.4 3.4-.7-.7 3.4-3.4-3.4-3.4.7-.7z" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
