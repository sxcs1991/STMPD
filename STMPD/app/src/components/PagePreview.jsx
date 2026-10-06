import { useEffect, useRef, useState } from 'react'
import { renderPage } from '../lib/pdf.js'

export const VIEW_SCALE = 1.4

export default function PagePreview({ pdf, pageNum, fields, selectedId, onSelect, onMove, ink, sigUrl, onActive }) {
  const canvasRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const drag = useRef(null)

  useEffect(() => {
    let cancelled = false
    renderPage(pdf, pageNum, VIEW_SCALE).then((c) => {
      if (cancelled || !canvasRef.current) return
      const el = canvasRef.current
      el.width = c.width
      el.height = c.height
      el.getContext('2d').drawImage(c, 0, 0)
      setSize({ w: c.width, h: c.height })
    })
    return () => {
      cancelled = true
    }
  }, [pdf, pageNum])

  const startDrag = (e, f) => {
    e.stopPropagation()
    onSelect(f.id)
    onActive(pageNum)
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id: f.id, sx: e.clientX, sy: e.clientY, ox: f.x, oy: f.y }
  }
  const moveDrag = (e) => {
    const d = drag.current
    if (!d) return
    onMove(d.id, {
      x: d.ox + (e.clientX - d.sx) / size.w,
      y: d.oy + (e.clientY - d.sy) / size.h,
    })
  }
  const endDrag = () => (drag.current = null)

  return (
    <div className="page" style={{ width: size.w || undefined, height: size.h || undefined }} onPointerDown={() => { onSelect(null); onActive(pageNum) }}>
      <canvas ref={canvasRef} />
      <div className="overlay">
        {fields.filter((f) => f.page === pageNum).map((f) => {
          const base = {
            left: f.x * size.w,
            top: f.y * size.h,
          }
          const cls = 'field' + (f.id === selectedId ? ' selected' : '')
          if (f.type === 'signature') {
            return (
              <div key={f.id} className={cls + ' sig'} style={{ ...base, width: f.w * size.w }}
                onPointerDown={(e) => startDrag(e, f)} onPointerMove={moveDrag} onPointerUp={endDrag}>
                {sigUrl ? <img src={sigUrl} alt="signature" draggable={false} /> : <span className="sig-empty">Signature</span>}
              </div>
            )
          }
          return (
            <div key={f.id} className={cls} style={{ ...base, fontSize: f.size * VIEW_SCALE, color: ink }}
              onPointerDown={(e) => startDrag(e, f)} onPointerMove={moveDrag} onPointerUp={endDrag}>
              {f.value || <span className="ph">{f.label}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
