import { useState, useRef, useEffect, useCallback } from 'react'
import Modal from '../shared/Modal'
import { btnPrimary, btnSecondary } from '../shared/buttonStyles'

// Square crop + zoom editor for headshots. Drag the image to reposition, slide to
// zoom, Apply → returns a square JPEG data URL (the cropped/zoomed result). The image
// is sized to "cover" the viewport at zoom=1, so it always fills the frame.
export default function ImageCropModal({ src, onApply, onCancel, output = 500, viewport = 300 }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [nat, setNat] = useState({ w: 0, h: 0 })
  const dragRef = useRef(null)

  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // allow canvas export when re-adjusting a remote (Supabase) image
    img.onload = () => { setNat({ w: img.naturalWidth, h: img.naturalHeight }); setZoom(1); setPan({ x: 0, y: 0 }) }
    img.src = src
  }, [src])

  const baseScale = nat.w && nat.h ? Math.max(viewport / nat.w, viewport / nat.h) : 1
  const dispW = nat.w * baseScale * zoom
  const dispH = nat.h * baseScale * zoom

  const onMove = useCallback((clientX, clientY) => {
    if (!dragRef.current) return
    setPan({ x: dragRef.current.px + (clientX - dragRef.current.sx), y: dragRef.current.py + (clientY - dragRef.current.sy) })
  }, [])

  useEffect(() => {
    function mm(e) { onMove(e.clientX, e.clientY) }
    function tm(e) { if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY) }
    function up() { dragRef.current = null }
    window.addEventListener('mousemove', mm); window.addEventListener('mouseup', up)
    window.addEventListener('touchmove', tm); window.addEventListener('touchend', up)
    return () => {
      window.removeEventListener('mousemove', mm); window.removeEventListener('mouseup', up)
      window.removeEventListener('touchmove', tm); window.removeEventListener('touchend', up)
    }
  }, [onMove])

  function startDrag(clientX, clientY) { dragRef.current = { sx: clientX, sy: clientY, px: pan.x, py: pan.y } }

  function apply() {
    const effScale = baseScale * zoom
    const imgDispW = nat.w * effScale, imgDispH = nat.h * effScale
    const left = (viewport - imgDispW) / 2 + pan.x
    const top = (viewport - imgDispH) / 2 + pan.y
    const ratio = output / viewport
    const canvas = document.createElement('canvas')
    canvas.width = output; canvas.height = output
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, output, output)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      ctx.drawImage(img, left * ratio, top * ratio, imgDispW * ratio, imgDispH * ratio)
      try {
        onApply(canvas.toDataURL('image/jpeg', 0.85))
      } catch {
        // Canvas tainted (remote image without CORS) — fall back to re-uploading.
        window.alert('Could not process this image for cropping. Please choose the image file again.')
        onCancel()
      }
    }
    img.src = src
  }

  const frame = { width: viewport, height: viewport, maxWidth: '100%', margin: '0 auto', borderRadius: '50%', overflow: 'hidden', position: 'relative', background: 'var(--vfo-tint)', border: '1px solid var(--vfo-border-strong)', cursor: 'grab', touchAction: 'none', userSelect: 'none' }

  return (
    <Modal title="Adjust photo" width={380} onClose={onCancel} footer={<>
      <button type="button" onClick={onCancel} style={btnSecondary}>Cancel</button>
      <button type="button" onClick={apply} style={btnPrimary}>Apply</button>
    </>}>
        <div style={{ fontSize: '12px', color: 'var(--vfo-muted)', marginBottom: '16px' }}>Drag to reposition · slide to zoom</div>

        <div
          style={frame}
          onMouseDown={e => { e.preventDefault(); startDrag(e.clientX, e.clientY) }}
          onTouchStart={e => { if (e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY) }}
        >
          {nat.w > 0 && (
            <img src={src} alt="" draggable={false}
              style={{ position: 'absolute', width: dispW, height: dispH, left: (viewport - dispW) / 2 + pan.x, top: (viewport - dispH) / 2 + pan.y, pointerEvents: 'none' }} />
          )}
          {/* subtle circular guide ring */}
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.6)' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '18px 2px 0' }}>
          <span style={{ fontSize: '16px', color: 'var(--vfo-muted)' }}>−</span>
          <input type="range" min="1" max="4" step="0.01" value={zoom}
            onChange={e => setZoom(parseFloat(e.target.value))}
            style={{ flex: 1, accentColor: '#125ecc', cursor: 'pointer' }} />
          <span style={{ fontSize: '18px', color: 'var(--vfo-muted)' }}>+</span>
        </div>

    </Modal>
  )
}
