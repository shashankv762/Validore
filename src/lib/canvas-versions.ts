export const MAX_CANVAS_VERSIONS = 4

export function nextCanvasVersion(canvases: Array<{ version: number | null }>, unlimited = false): number | null {
  const highest = canvases.reduce((highest, canvas) => Math.max(highest, canvas.version ?? 1), 0)
  if (highest >= 2_147_483_647) return null
  return !unlimited && (canvases.length >= MAX_CANVAS_VERSIONS || highest >= MAX_CANVAS_VERSIONS) ? null : highest + 1
}
