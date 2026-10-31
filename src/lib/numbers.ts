export function toDatabaseInteger(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Expected a finite numeric estimate')
  return Math.max(0, Math.min(2_147_483_647, Math.round(value)))
}

export function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null
}
