/** Publisher-envelope checks shared by the single-observation and trend tools.
 * Missing values are valid; missing/duplicate rows in a declared annual window
 * are not. A successful HTTP response alone does not establish usable data. */
export type WorldBankObservation = { year: number; value: number | null; countryName: string }

export function validWorldBankRevision(value: unknown, retrievedAt: number): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = Date.parse(value + 'T00:00:00Z')
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value &&
    Number.isFinite(retrievedAt) && value <= new Date(retrievedAt).toISOString().slice(0, 10)
}

export function parseWorldBankAnnualWindow(payload: unknown, options: {
  country: string; indicator: string; now: number; pageSize: number; latestPage?: boolean
}): { rows: WorldBankObservation[]; metadataUpdatedAt: string } {
  if (!Array.isArray(payload) || payload.length !== 2 || !payload[0] || typeof payload[0] !== 'object' || !Array.isArray(payload[1])) {
    throw new Error('World Bank dataset metadata is unavailable.')
  }
  const [metadata, values] = payload as [Record<string, unknown>, unknown[]]
  const total = Number(metadata.total)
  const pages = Number(metadata.pages)
  if (String(metadata.sourceid) !== '2' || Number(metadata.page) !== 1 || Number(metadata.per_page) !== options.pageSize ||
    !Number.isSafeInteger(total) || total < 1 || !Number.isSafeInteger(pages) || pages < 1 ||
    !validWorldBankRevision(metadata.lastupdated, options.now) || values.length > options.pageSize ||
    (options.latestPage ? values.length !== options.pageSize || total < values.length || pages !== Math.ceil(total / options.pageSize)
      : pages !== 1 || total !== values.length)) {
    throw new Error('World Bank metadata does not establish the requested complete annual window.')
  }
  const currentYear = new Date(options.now).getUTCFullYear()
  const seen = new Set<number>()
  const rows: WorldBankObservation[] = values.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A World Bank observation is malformed.')
    const row = value as { date?: unknown; value?: unknown; country?: { id?: unknown; value?: unknown }; countryiso3code?: unknown; indicator?: { id?: unknown } }
    if (row.indicator?.id !== options.indicator || !(row.country?.id === options.country || options.country === 'WLD' && row.countryiso3code === 'WLD') ||
      typeof row.date !== 'string' || !/^\d{4}$/.test(row.date) || Number(row.date) > currentYear || Number(row.date) < currentYear - 8) {
      throw new Error('World Bank response contains mismatched country, indicator or year data.')
    }
    const year = Number(row.date)
    if (seen.has(year)) throw new Error('World Bank response contains duplicate annual observations.')
    if (row.value !== null && (typeof row.value !== 'number' || !Number.isFinite(row.value))) throw new Error('A World Bank observation is not numeric.')
    seen.add(year)
    return { year, value: row.value as number | null, countryName: typeof row.country?.value === 'string' ? row.country.value : options.country }
  }).sort((left, right) => right.year - left.year)
  if (!rows.length || rows.some((row, index) => row.year !== rows[0].year - index) ||
    options.latestPage && rows[0].year < currentYear - 1) {
    throw new Error('World Bank response has an incomplete annual window; missing values must remain explicit nulls.')
  }
  return { rows, metadataUpdatedAt: metadata.lastupdated }
}
