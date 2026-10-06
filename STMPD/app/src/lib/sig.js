// Crop transparent margins so the signature sizes predictably on the page.
export function trimCanvas(canvas) {
  const ctx = canvas.getContext('2d')
  const { width, height } = canvas
  const data = ctx.getImageData(0, 0, width, height).data
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  const pad = 6
  const w = maxX - minX + 1 + pad * 2
  const h = maxY - minY + 1 + pad * 2
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  out.getContext('2d').drawImage(canvas, minX - pad, minY - pad, w, h, 0, 0, w, h)
  return out.toDataURL('image/png')
}

export async function typedSignature(text, fontFamily) {
  await document.fonts.load(`120px "${fontFamily}"`, text)
  const c = document.createElement('canvas')
  c.width = 1400
  c.height = 300
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'middle'
  ctx.font = `120px "${fontFamily}"`
  ctx.fillText(text, 30, 150)
  return trimCanvas(c)
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export async function uploadedSignature(file) {
  const url = await fileToDataUrl(file)
  const img = await new Promise((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = rej
    i.src = url
  })
  const c = document.createElement('canvas')
  c.width = img.width
  c.height = img.height
  c.getContext('2d').drawImage(img, 0, 0)
  return trimCanvas(c) || url
}
