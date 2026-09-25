// Turns whatever image a member or admin picks into the ONE logo shape the
// backend accepts (utils/logo-png.ts): a PNG on a 1200x400 canvas, transparent
// outside a white rounded badge, the logo trimmed of empty margins and centred
// to fit inside the badge. The ROI deck drops every logo into a fixed 3:1
// frame, so this is what keeps a logo from stretching.
// The backend re-checks the shape; this is the convenience, not the guard.

export const LOGO_WIDTH = 1200
export const LOGO_HEIGHT = 400
const LOGO_MAX_BYTES = 1_000_000

// ROI template v9 puts every logo on blue AND white slides, so the stored PNG
// carries its own small white badge (the preview shows this PNG as-is).
// No border: on a white slide the badge melts into the slide (Jake, 2026-09-24 —
// a visible edge where white meets white looked untidy); on blue it reads as a
// clean white pill.
const BADGE_RADIUS = 64
const BADGE_PAD_X = 90
const BADGE_PAD_Y = 55

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export const LOGO_BASE_URL = 'https://ejpsprsmhpufwogbmxjv.supabase.co/storage/v1/object/public/headshots/'
export function logoUrl(filename) {
  return filename ? LOGO_BASE_URL + encodeURIComponent(filename) : null
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('That file could not be read'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('That file is not an image we can use. Please choose a PNG, JPG or WebP.'))
    img.src = src
  })
}

// Bounding box of the pixels that are not background (transparent or near-white),
// so a logo saved with a wide empty border still fills its frame.
function contentBox(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h)
  let minX = w, minY = h, maxX = -1, maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const a = data[i + 3]
      const nearWhite = data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245
      if (a > 10 && !nearWhite) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w, h }
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

export async function fileToLogoPng(file) {
  if (!file) throw new Error('No file chosen')
  if (!/^image\//.test(file.type)) throw new Error('Please choose an image file (PNG, JPG or WebP).')
  const img = await loadImage(await readAsDataUrl(file))
  const srcW = img.naturalWidth || LOGO_WIDTH
  const srcH = img.naturalHeight || LOGO_HEIGHT

  const src = document.createElement('canvas')
  src.width = srcW; src.height = srcH
  const sctx = src.getContext('2d')
  sctx.drawImage(img, 0, 0, srcW, srcH)
  const box = contentBox(sctx, srcW, srcH)

  // The badge: transparent outside a white rounded rectangle filling the canvas,
  // the logo contain-fitted inside the padded inner box. Baked into the PNG
  // because the deck cannot draw a badge shape itself.
  const out = document.createElement('canvas')
  out.width = LOGO_WIDTH; out.height = LOGO_HEIGHT
  const octx = out.getContext('2d')
  roundedRect(octx, 0, 0, LOGO_WIDTH, LOGO_HEIGHT, BADGE_RADIUS)
  octx.fillStyle = '#FFFFFF'
  octx.fill()

  const innerW = LOGO_WIDTH - 2 * BADGE_PAD_X
  const innerH = LOGO_HEIGHT - 2 * BADGE_PAD_Y
  const scale = Math.min(innerW / box.w, innerH / box.h)
  const dw = Math.round(box.w * scale)
  const dh = Math.round(box.h * scale)
  octx.imageSmoothingQuality = 'high'
  octx.drawImage(src, box.x, box.y, box.w, box.h, Math.round((LOGO_WIDTH - dw) / 2), Math.round((LOGO_HEIGHT - dh) / 2), dw, dh)

  const dataUrl = out.toDataURL('image/png')
  const base64 = dataUrl.split(',')[1]
  if (base64.length * 0.75 > LOGO_MAX_BYTES) {
    throw new Error('That logo is too detailed to use (over 1 MB once sized). Please try a simpler PNG, JPG or WebP.')
  }
  return { base64, dataUrl }
}
