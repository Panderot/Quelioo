/** Clockwise rotation, in degrees, applied to the photo before cropping. */
export type CropRotation = 0 | 90 | 180 | 270

/** A crop rectangle normalized to 0..1 of the ROTATED image, plus that rotation. */
export interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

export interface CropSpec extends CropRect {
  rotation: CropRotation
}

export const FULL_RECT: CropRect = { x: 0, y: 0, w: 1, h: 1 }
export const FULL_CROP: CropSpec = { ...FULL_RECT, rotation: 0 }

/** Maps a rect through one 90° clockwise turn of the image it is normalized to. */
export function rotateRectClockwise(rect: CropRect): CropRect {
  return { x: 1 - (rect.y + rect.h), y: rect.x, w: rect.h, h: rect.w }
}

/** Maps a rect through one 90° counter-clockwise turn of the image it is normalized to. */
export function rotateRectCounterClockwise(rect: CropRect): CropRect {
  return { x: rect.y, y: 1 - (rect.x + rect.w), w: rect.h, h: rect.w }
}

export function addRotation(rotation: CropRotation, delta: 90 | -90): CropRotation {
  return (((rotation + delta) % 360) + 360) % 360 as CropRotation
}

/**
 * Converts a crop normalized to the rotated image into a pixel region of the unrotated source,
 * so the final JPEG is cut from the original full-resolution pixels.
 */
export function toSourceRegion(
  crop: CropSpec,
  sourceWidth: number,
  sourceHeight: number,
): { x: number; y: number; width: number; height: number } {
  let rect: CropRect = { x: crop.x, y: crop.y, w: crop.w, h: crop.h }
  for (let turns = crop.rotation / 90; turns > 0; turns -= 1) rect = rotateRectCounterClockwise(rect)

  const x = Math.max(0, Math.min(sourceWidth - 1, Math.round(rect.x * sourceWidth)))
  const y = Math.max(0, Math.min(sourceHeight - 1, Math.round(rect.y * sourceHeight)))
  const right = Math.max(x + 1, Math.min(sourceWidth, Math.round((rect.x + rect.w) * sourceWidth)))
  const bottom = Math.max(y + 1, Math.min(sourceHeight, Math.round((rect.y + rect.h) * sourceHeight)))
  return { x, y, width: right - x, height: bottom - y }
}

export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** Moves a rect by a normalized delta, keeping it fully inside the image. */
export function moveRect(rect: CropRect, dx: number, dy: number): CropRect {
  return {
    ...rect,
    x: Math.min(1 - rect.w, Math.max(0, rect.x + dx)),
    y: Math.min(1 - rect.h, Math.max(0, rect.y + dy)),
  }
}

/** Drags one edge/corner of a rect by a normalized delta, honoring the minimum size and image bounds. */
export function resizeRect(rect: CropRect, handle: CropHandle, dx: number, dy: number, minW: number, minH: number): CropRect {
  let left = rect.x
  let top = rect.y
  let right = rect.x + rect.w
  let bottom = rect.y + rect.h

  if (handle.includes('w')) left = Math.min(right - minW, Math.max(0, left + dx))
  if (handle.includes('e')) right = Math.max(left + minW, Math.min(1, right + dx))
  if (handle.includes('n')) top = Math.min(bottom - minH, Math.max(0, top + dy))
  if (handle.includes('s')) bottom = Math.max(top + minH, Math.min(1, bottom + dy))

  return { x: left, y: top, w: right - left, h: bottom - top }
}

/** Scales a rect around its center (pinch), clamped to the minimum size and the image bounds. */
export function scaleRect(rect: CropRect, factor: number, minW: number, minH: number): CropRect {
  const w = Math.min(1, Math.max(minW, rect.w * factor))
  const h = Math.min(1, Math.max(minH, rect.h * factor))
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  return {
    w,
    h,
    x: Math.min(1 - w, Math.max(0, cx - w / 2)),
    y: Math.min(1 - h, Math.max(0, cy - h / 2)),
  }
}
