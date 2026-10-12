export const MAX_CANVAS_VERSIONS = 4

export function nextCanvasVersion(canvases: Array<{ version: number | null }>): number | null {
  const highest = canvases.reduce((highest, canvas) => Math.max(highest, canvas.version ?? 1), 0)
  return canvases.length >= MAX_CANVAS_VERSIONS || highest >= MAX_CANVAS_VERSIONS ? null : highest + 1
}
