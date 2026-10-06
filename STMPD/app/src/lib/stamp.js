import { PDFDocument } from 'pdf-lib'
import { openPdf, renderPage } from './pdf.js'

const RASTER_SCALE = 2.5 // ~180 dpi: readable, still a manageable file size

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Recolor a signature image (any color/transparent PNG) to the chosen ink.
export async function tint(dataUrl, color) {
  const img = await loadImage(dataUrl)
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

// Burn fields into each page and rebuild the PDF from page images (rasterized).
export async function rasterizeAndStamp(baseBytes, fields, ink, signatureDataUrl) {
  const src = await openPdf(baseBytes)
  const out = await PDFDocument.create()
  const sig = signatureDataUrl ? await loadImage(await tint(signatureDataUrl, ink)) : null

  for (let p = 1; p <= src.numPages; p++) {
    const page = await src.getPage(p)
    const pts = page.getViewport({ scale: 1 })
    const canvas = await renderPage(src, p, RASTER_SCALE)
    const ctx = canvas.getContext('2d')

    for (const f of fields.filter((x) => x.page === p)) {
      const x = f.x * canvas.width
      const y = f.y * canvas.height
      if (f.type === 'signature') {
        if (!sig) continue
        const w = f.w * canvas.width
        ctx.drawImage(sig, x, y, w, w * (sig.height / sig.width))
      } else if (f.value) {
        ctx.fillStyle = ink
        ctx.textBaseline = 'top'
        ctx.font = `${f.size * RASTER_SCALE}px Helvetica, Arial, sans-serif`
        ctx.fillText(f.value, x, y)
      }
    }

    const jpg = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92))
    const img = await out.embedJpg(await jpg.arrayBuffer())
    const outPage = out.addPage([pts.width, pts.height])
    outPage.drawImage(img, { x: 0, y: 0, width: pts.width, height: pts.height })
  }
  return out.save()
}

export function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
