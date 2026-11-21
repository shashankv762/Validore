#!/usr/bin/env node
// Public HTTP only. This script never loads environment files, an AI SDK, or a database.
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import JSZip from 'jszip';
import { createMarketBundle, validMarketBundle } from '../src/lib/ai/market-bundle.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'src', 'data', 'market');
const runStartedAt = new Date().toISOString();
const endYear = new Date(runStartedAt).getUTCFullYear();
const startYear = endYear - 8;
const requestAttempts = [];
const requestTimeoutMs = 8000;
const maximumAttempts = 3;
const countries = [
  { code: 'IN', iso3: 'IND', apiId: 'IN', name: 'India' },
  { code: 'US', iso3: 'USA', apiId: 'US', name: 'United States' },
  { code: 'GB', iso3: 'GBR', apiId: 'GB', name: 'United Kingdom' },
  { code: 'SG', iso3: 'SGP', apiId: 'SG', name: 'Singapore' },
  { code: 'BR', iso3: 'BRA', apiId: 'BR', name: 'Brazil' },
  { code: 'WLD', iso3: 'WLD', apiId: '1W', name: 'World' },
];
const indicators = [
  { id: 'SP.POP.TOTL', unit: 'people', bounds: [0, Infinity], integer: true, limit: 'Total population is contextual scale, not a count of customers or addressable buyers.' },
  { id: 'NY.GDP.MKTP.CD', unit: 'current US dollars', bounds: [0, Infinity], limit: 'Nominal GDP measures economy-wide output, not category revenue, customer spending, or startup TAM.' },
  { id: 'NY.GDP.PCAP.CD', unit: 'current US dollars per person', bounds: [0, Infinity], limit: 'GDP per capita is output per person, not median income, household income, or willingness to pay.' },
  { id: 'IT.NET.USER.ZS', unit: '% of population', bounds: [0, 100], limit: 'Internet use is a broad access indicator; it does not establish paid digital demand or a reachable customer segment.' },
  { id: 'FP.CPI.TOTL.ZG', unit: 'annual % change in consumer prices', bounds: [-Infinity, Infinity], limit: 'Annual consumer-price inflation is not a category-specific price forecast. Negative inflation is valid.' },
  { id: 'NY.GDP.MKTP.KD.ZG', unit: 'annual % change in real GDP', bounds: [-Infinity, Infinity], limit: 'Real GDP growth describes the whole economy and must not be presented as growth in a product category. Negative growth is valid.' },
  { id: 'SP.URB.TOTL.IN.ZS', unit: '% of total population', bounds: [0, 100], limit: 'Urban definitions vary across countries. Urban share is not a count of reachable or paying customers.' },
  { id: 'SL.UEM.TOTL.ZS', unit: '% of total labor force (modeled ILO estimate)', bounds: [0, 100], limit: 'This is a modeled ILO estimate, not necessarily the national unemployment headline; survey definitions and revisions differ.' },
];

const catalogDefinitions = [
  { id: 'world-bank-wdi', title: 'World Bank World Development Indicators', source: 'World Bank', url: 'https://api.worldbank.org/v2/source/2?format=json', hosts: ['api.worldbank.org'], format: 'json', marker: /World Development Indicators/i, geography: ['Global', 'India'], uses: ['Cross-country macroeconomic context', 'Population and digital-access baselines'], limitations: 'Annual observations can lag publication and may be estimates or revised. Dataset-specific and third-party terms may apply.', cadence: 'Annual observations for the selected indicators; release revisions vary.', licenseUrl: 'https://data.worldbank.org/summary-terms-of-use' },
  { id: 'rbi-data-releases', title: 'RBI Data Releases', source: 'Reserve Bank of India', url: 'https://www.rbi.org.in/scripts/Statistics.aspx', hosts: ['www.rbi.org.in', 'rbi.org.in'], marker: /Data Releases|Reserve Bank of India/i, geography: ['India'], uses: ['Banking, credit, monetary and payment statistics discovery'], limitations: 'Publication directory only. Select the actual dated table and its units before citing a number; release frequency varies.' },
  { id: 'npci-upi', title: 'NPCI UPI product statistics entry point', source: 'National Payments Corporation of India', url: 'https://www.npci.org.in/what-we-do/upi/product-statistics', hosts: ['www.npci.org.in', 'npci.org.in'], marker: /National Payments Corporation of India|NPCI/i, geography: ['India'], uses: ['Find official UPI transaction volume and value releases'], limitations: 'Verified public NPCI route; its HTML is an application shell, not a verified numeric table. Transaction counts are not unique users, businesses, or customer demand.' },
  { id: 'mospi', title: 'MoSPI statistics portal', source: 'Ministry of Statistics and Programme Implementation', url: 'https://www.mospi.gov.in/', hosts: ['www.mospi.gov.in', 'mospi.gov.in'], marker: /Ministry of Statistics/i, geography: ['India'], uses: ['Find national accounts, CPI and official household or labor surveys'], limitations: 'Verified ministry landing page, with dynamic content. No statistical tables or numbers were extracted; individual release definitions and dates must be checked.' },
  { id: 'data-gov-in', title: 'Open Government Data Platform India', source: 'Government of India', url: 'https://www.data.gov.in/', hosts: ['www.data.gov.in', 'data.gov.in'], marker: /Open Government Data|OGD/i, geography: ['India'], uses: ['Discover ministry and state datasets and documented APIs'], limitations: 'Dataset directory, not a single dataset. API-key requirements, licensing, update dates, geographic coverage and units must be checked per resource.' },
  { id: 'udyam', title: 'Udyam registration official portal', source: 'Ministry of Micro, Small and Medium Enterprises', url: 'https://udyamregistration.gov.in/', hosts: ['udyamregistration.gov.in'], marker: /Udyam Registration/i, geography: ['India'], uses: ['Find official MSME registration information and linked publications'], limitations: 'Registration portal reference only. Registrations are not a census of operating firms, paying customers, or annual firm births; no count is imported here.' },
  { id: 'startup-india', title: 'Startup India initiative', source: 'Department for Promotion of Industry and Internal Trade', url: 'https://www.startupindia.gov.in/content/sih/en/about-startup-india-initiative.html', hosts: ['www.startupindia.gov.in', 'startupindia.gov.in'], marker: /Startup India/i, geography: ['India'], uses: ['Find DPIIT recognition definitions, programs and official ecosystem releases'], limitations: 'Program reference only. Recognized startups are an administrative subset; recognition counts are not total startups, active businesses, or addressable demand.' },
  { id: 'ilo-data-explorer', title: 'ILOSTAT Data Explorer', source: 'International Labour Organization', url: 'https://rshiny.ilo.org/dataexplorer54/', hosts: ['rshiny.ilo.org'], marker: /ILOSTAT Data Explorer/i, geography: ['Global', 'India'], uses: ['Find labor-force, employment and unemployment data and definitions'], limitations: 'Verified interactive explorer entry point only. No standalone ILO series was downloaded; distinguish modeled estimates from national survey measures.' },
  { id: 'un-system-data', title: 'UN System Data Commons', source: 'United Nations', url: 'https://data.un.org/', hosts: ['data.un.org'], marker: /UN System Data Commons|United Nations/i, geography: ['Global', 'India'], uses: ['Discover UN statistical datasets and metadata'], limitations: 'Directory reference only. Agency sources, indicator definitions, revision dates and licenses vary; no numeric series was imported from this page.' },
  { id: 'oecd-sdmx-catalog', title: 'OECD Short-Term Economic Statistics SDMX catalog', source: 'Organisation for Economic Co-operation and Development', url: 'https://sdmx.oecd.org/public/rest/v1/dataflow/OECD.SDD.STES/all/latest?references=none', hosts: ['sdmx.oecd.org'], format: 'xml', marker: /Dataflow|Dataflows/, geography: ['OECD members', 'Selected non-member economies'], uses: ['Discover OECD short-term economic datasets and structural metadata'], limitations: 'Dataflow metadata only, including non-production flows. Select a production dataset, dimensions, units and coverage before requesting values; no OECD observations were imported.' },
];

function checkedUrl(value, hosts) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !hosts.includes(url.hostname)) {
    throw new Error(`URL outside the fixed public HTTPS allowlist: ${url.origin}`);
  }
  return url;
}

class PublicFetchError extends Error {
  constructor(message, retryable = false) { super(message); this.retryable = retryable; }
}

async function fetchPublicOnce(value, { hosts, format = 'html', maxBytes = 2_000_000 } = {}) {
  let url = checkedUrl(value, hosts);
  // One deadline covers redirects and streaming the response body.
  const signal = AbortSignal.timeout(requestTimeoutMs);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, {
      redirect: 'manual', signal,
      headers: { Accept: format === 'json' ? 'application/json' : format === 'xml' ? 'application/xml,text/xml,application/vnd.sdmx.structure+xml' : format === 'zip' ? 'application/zip,application/octet-stream' : 'text/html', 'User-Agent': 'Validore-Public-Market-Snapshot/1.0' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 3) throw new Error('Missing redirect location or too many redirects');
      url = checkedUrl(new URL(location, url).href, hosts);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new PublicFetchError(`HTTP ${response.status} at ${url.href}`, response.status === 408 || response.status === 429 || response.status >= 500); }
    const contentType = response.headers.get('content-type') || '';
    const expected = format === 'json' ? /\bapplication\/json\b/i : format === 'xml' ? /(?:application|text)\/(?:[\w.+-]*\+)?xml\b/i : format === 'zip' ? /\bapplication\/(?:zip|x-zip-compressed|octet-stream)\b/i : /\btext\/html\b/i;
    if (!expected.test(contentType)) { await response.body?.cancel(); throw new Error(`Unexpected content type ${contentType}`); }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) { await response.body?.cancel(); throw new Error(`Response exceeds ${maxBytes} bytes`); }
    if (!response.body) throw new Error('Empty response body');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        size += chunk.byteLength;
        if (size > maxBytes) throw new Error(`Response exceeds ${maxBytes} bytes`);
        chunks.push(chunk);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
    const buffer = Buffer.concat(chunks);
    const text = format === 'zip' ? '' : buffer.toString('utf8');
    return { text, buffer: format === 'zip' ? buffer : null, url: url.href, fetchedAt: new Date().toISOString(), contentType, bytes: size, httpStatus: response.status };
  }
  throw new Error('Redirect limit exceeded');
}

export async function fetchPublic(value, options = {}) {
  checkedUrl(value, options.hosts);
  const attempts = [];
  for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
    const startedAt = new Date().toISOString();
    const started = Date.now();
    try {
      const result = await fetchPublicOnce(value, options);
      const entry = { url: value, kind: options.kind ?? 'public-reference', indicator: options.indicator ?? null,
        country: options.country ?? null, attempt, status: 'complete', startedAt, completedAt: result.fetchedAt,
        durationMs: Date.now() - started, finalUrl: result.url, httpStatus: result.httpStatus, bytes: result.bytes };
      attempts.push(entry); requestAttempts.push(entry);
      return { ...result, attempts };
    } catch (error) {
      const retryable = error instanceof PublicFetchError ? error.retryable
        : error?.name === 'TimeoutError' || error?.name === 'AbortError' || error?.name === 'TypeError';
      const entry = { url: value, kind: options.kind ?? 'public-reference', indicator: options.indicator ?? null,
        country: options.country ?? null, attempt, status: 'failed', startedAt, completedAt: new Date().toISOString(),
        durationMs: Date.now() - started, error: error instanceof Error ? error.message : String(error), retryable };
      attempts.push(entry); requestAttempts.push(entry);
      if (!retryable || attempt === maximumAttempts) throw error;
      console.warn(`Retry ${attempt + 1}/${maximumAttempts}: ${value} (${entry.error})`);
      await new Promise(done => setTimeout(done, attempt * 250));
    }
  }
  throw new Error('Request retry limit exceeded');
}

async function mapBounded(items, run, concurrency = 3) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try { results[index] = { status: 'fulfilled', value: await run(items[index]) }; }
      catch (error) { results[index] = { status: 'rejected', reason: error instanceof Error ? error.message : String(error) }; }
    }
  }));
  return results;
}

const clean = (value, limit = 1600) => String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
function dateOnly(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && value <= runStartedAt.slice(0, 10);
}
function envelope(text, description) {
  const data = JSON.parse(text);
  if (!Array.isArray(data) || data.length !== 2 || !data[0] || !Array.isArray(data[1]) || Number(data[0].pages) !== 1 || Number(data[0].page) !== 1 || Number(data[0].total) !== data[1].length) {
    throw new Error(`Invalid or incomplete World Bank ${description} response`);
  }
  return data;
}

function boundedArchive(buffer) {
  let footer = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65557); index--) {
    if (buffer.readUInt32LE(index) === 0x06054b50) { footer = index; break; }
  }
  if (footer < 0) throw new Error('Archive has no ZIP directory');
  const entries = buffer.readUInt16LE(footer + 10);
  if (entries < 1 || entries > 8) throw new Error('Archive has an unsupported entry count');
  let offset = buffer.readUInt32LE(footer + 16);
  let expandedBytes = 0;
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > footer || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid archive directory');
    const size = buffer.readUInt32LE(offset + 24);
    if (size === 0xffffffff || size > 2_000_000) throw new Error('Archive entry is too large');
    expandedBytes += size;
    if (expandedBytes > 4_000_000) throw new Error('Expanded archive is too large');
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
}

function csvRows(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && character === ',') { row.push(field); field = ''; }
    else if (!quoted && character === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (character !== '\r' || quoted) field += character;
  }
  if (quoted) throw new Error('Archive CSV has an unfinished quoted field');
  if (row.length || field) { row.push(field); rows.push(row); }
  return rows;
}

async function archiveRows(raw, indicator) {
  boundedArchive(raw.buffer);
  const zip = await JSZip.loadAsync(raw.buffer, { checkCRC32: true });
  const candidates = Object.values(zip.files).filter(file => !file.dir && file.name.startsWith(`API_${indicator.id}_DS2_`) && file.name.endsWith('.csv'));
  if (candidates.length !== 1) throw new Error('Archive does not identify the requested WDI source-2 indicator');
  const bytes = await candidates[0].async('uint8array');
  if (bytes.length > 2_000_000) throw new Error('Archive CSV is too large');
  const rows = csvRows(Buffer.from(bytes).toString('utf8'));
  if (!rows.some(row => row[0] === 'Data Source' && row[1] === 'World Development Indicators')) throw new Error('Archive is not World Development Indicators');
  const revision = rows.find(row => row[0] === 'Last Updated Date')?.[1];
  if (!dateOnly(revision)) throw new Error('Archive lacks a valid revision date');
  const headerIndex = rows.findIndex(row => row[0] === 'Country Name' && row[1] === 'Country Code' && row[3] === 'Indicator Code');
  if (headerIndex < 0) throw new Error('Archive observation columns are missing');
  const header = rows[headerIndex];
  const years = Array.from({ length: 8 }, (_, index) => endYear - 1 - index);
  const columns = years.map(year => header.indexOf(String(year)));
  if (columns.some(column => column < 4)) throw new Error('Archive lacks the eight completed-year columns');
  const selected = new Map();
  for (const row of rows.slice(headerIndex + 1)) {
    const country = countries.find(value => value.iso3 === row[1]);
    if (!country) continue;
    if (selected.has(country.code) || row[3] !== indicator.id) throw new Error('Duplicate country or mismatched archive indicator');
    const annualRows = years.map((year, index) => {
      const value = row[columns[index]];
      if (value === undefined || (value !== '' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))) throw new Error('Invalid archive numeric cell');
      const number = value === '' ? null : Number(value);
      if (number !== null && (!Number.isFinite(number) || number < indicator.bounds[0] || number > indicator.bounds[1] || (indicator.integer && !Number.isInteger(number)))) throw new Error('Archive numeric value is outside its domain');
      return { date: String(year), value: number, obs_status: null };
    });
    selected.set(country.code, annualRows);
  }
  if (selected.size !== countries.length) throw new Error('Archive does not cover every selected geography');
  return { selected, release: { sourceid: '2', lastupdated: revision }, file: candidates[0].name, expandedBytes: bytes.length };
}

async function fetchIndicator(indicator) {
  const metadataUrl = `https://api.worldbank.org/v2/indicator/${indicator.id}?format=json`;
  // Small, explicit latest-year pages are substantially more reliable than the
  // upstream multi-country/date-range route. Each page intentionally covers the
  // latest eight annual rows, not the entire historical series. Validate its
  // pagination and each year; exclude the incomplete current calendar year.
  // Sequential reads in each of three workers keep concurrency bounded.
  const rawMetadata = await fetchPublic(metadataUrl, { hosts: ['api.worldbank.org'], format: 'json', kind: 'indicator-metadata', indicator: indicator.id });
  const [, metadataRows] = envelope(rawMetadata.text, 'indicator metadata');
  const metadata = metadataRows.find(row => row.id === indicator.id && String(row.source?.id) === '2');
  if (!metadata || typeof metadata.name !== 'string' || typeof metadata.sourceNote !== 'string') throw new Error('Indicator metadata is missing or mismatched');
  const perCountry = new Map(countries.map(c => [c.code, []]));
  const provenance = new Map();
  const requests = [];
  const failures = [];
  const fallbackRequests = [];
  const seen = new Set();
  let excludedCurrentYear = 0;
  for (const country of countries) {
    const queryUrl = `https://api.worldbank.org/v2/country/${country.code}/indicator/${indicator.id}?format=json&per_page=8`;
    try {
    const raw = await fetchPublic(queryUrl, { hosts: ['api.worldbank.org'], format: 'json', kind: 'annual-observations', indicator: indicator.id, country: country.code });
    const payload = JSON.parse(raw.text);
    if (!Array.isArray(payload) || payload.length !== 2 || !Array.isArray(payload[1])) throw new Error('Invalid WDI latest-year response');
    const [release, rows] = payload;
    if (String(release.sourceid) !== '2' || !dateOnly(release.lastupdated) || Number(release.page) !== 1 || Number(release.per_page) !== 8 ||
      !Number.isSafeInteger(Number(release.total)) || Number(release.total) < 8 || Number(release.pages) !== Math.ceil(Number(release.total) / 8) || rows.length !== 8) throw new Error('Invalid WDI pagination, source or revision date');
    const years = [];
    for (const row of rows) {
      if (row.country?.id !== country.apiId || row.countryiso3code !== country.iso3 || row.indicator?.id !== indicator.id || !/^\d{4}$/.test(row.date)) throw new Error('Unexpected country, indicator, or observation year');
      const year = Number(row.date); years.push(year);
      if (year < startYear || year > endYear) throw new Error('Observation outside the latest eight annual-row window');
      const key = `${country.code}:${year}`;
      if (seen.has(key)) throw new Error(`Duplicate observation ${key}`);
      seen.add(key);
      if (row.value === null) continue;
      if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < indicator.bounds[0] || row.value > indicator.bounds[1] || (indicator.integer && !Number.isInteger(row.value))) throw new Error(`Invalid numeric observation ${key}`);
      if (year === endYear) { excludedCurrentYear++; continue; }
      if (year >= startYear) perCountry.get(country.code).push(row);
    }
    if (years.some((year, index) => index > 0 && year !== years[index - 1] - 1) || years[0] < endYear - 1) throw new Error('The returned page does not cover the expected latest calendar-year window');
    provenance.set(country.code, { raw, release, queryUrl });
    requests.push({ url: raw.url, indicator: indicator.id, country: country.code, status: 'complete', fetchedAt: raw.fetchedAt,
      bytes: raw.bytes, metadataUpdatedAt: release.lastupdated, responseYears: years, returnedRows: rows.length, attempts: raw.attempts.length });
    console.log(`WDI ${country.code}/${indicator.id}: ${years.at(-1)}–${years[0]}, revised ${release.lastupdated}, ${raw.attempts.length} attempt(s).`);
    } catch (error) {
      const failure = { country: country.code, indicator: indicator.id, url: queryUrl, error: error instanceof Error ? error.message : String(error) };
      failures.push(failure);
      requests.push({ ...failure, status: 'failed', attempts: requestAttempts.filter(row => row.url === queryUrl).length });
      console.error(`WDI ${country.code}/${indicator.id}: ${failure.error}`);
    }
  }
  // Missing country routes may still be available from a bounded all-country
  // window. This is another real retrieval, never a re-dating of retained data.
  if (failures.length) {
    const fallbackUrl = `https://api.worldbank.org/v2/country/all/indicator/${indicator.id}?format=json&date=${startYear}:${endYear - 1}&per_page=20000`;
    try {
      const raw = await fetchPublic(fallbackUrl, { hosts: ['api.worldbank.org'], format: 'json', kind: 'completed-year-window-fallback', indicator: indicator.id });
      const [release, rows] = envelope(raw.text, 'completed-year fallback');
      if (String(release.sourceid) !== '2' || !dateOnly(release.lastupdated) || Number(release.per_page) !== 20000) throw new Error('Invalid fallback source, page size or revision date');
      const selected = new Map(countries.map(country => [country.code, []]));
      const selectedKeys = new Set();
      for (const row of rows) {
        const country = countries.find(value => value.iso3 === row.countryiso3code);
        if (!country) continue;
        if (row.country?.id !== country.apiId || row.indicator?.id !== indicator.id || !/^\d{4}$/.test(row.date)) throw new Error('Mismatched fallback country, indicator or year');
        const year = Number(row.date);
        const key = `${country.code}:${year}`;
        if (year < startYear || year >= endYear || selectedKeys.has(key)) throw new Error('Fallback contains a future, out-of-window or duplicate year');
        selectedKeys.add(key);
        if (row.value !== null && (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < indicator.bounds[0] || row.value > indicator.bounds[1] || (indicator.integer && !Number.isInteger(row.value)))) throw new Error('Invalid fallback numeric observation');
        selected.get(country.code).push(row);
      }
      for (const country of countries) {
        const annualRows = selected.get(country.code).sort((a, b) => Number(b.date) - Number(a.date));
        if (annualRows.length !== 8 || annualRows.some((row, index) => Number(row.date) !== endYear - 1 - index)) throw new Error(`Incomplete completed-year fallback for ${country.code}`);
      }
      const recovered = [];
      for (const failure of failures) {
        const annualRows = selected.get(failure.country);
        const available = annualRows.filter(row => row.value !== null);
        if (!available.length) continue;
        perCountry.set(failure.country, available);
        provenance.set(failure.country, { raw, release, queryUrl: fallbackUrl });
        failure.recovered = true; failure.recoveryUrl = fallbackUrl;
        const request = requests.find(row => row.country === failure.country);
        Object.assign(request, { status: 'recovered', primaryStatus: 'failed', recoveredVia: 'all-country-completed-year-window',
          fallbackUrl, fetchedAt: raw.fetchedAt, metadataUpdatedAt: release.lastupdated, responseYears: annualRows.map(row => Number(row.date)), returnedRows: annualRows.length, fallbackAttempts: raw.attempts.length });
        recovered.push(failure.country);
      }
      fallbackRequests.push({ url: raw.url, indicator: indicator.id, status: 'complete', fetchedAt: raw.fetchedAt, bytes: raw.bytes,
        returnedRows: rows.length, selectedRows: selectedKeys.size, recoveredCountries: recovered, metadataUpdatedAt: release.lastupdated, attempts: raw.attempts.length });
      console.log(`WDI ${indicator.id}: completed-year fallback recovered ${recovered.join(', ') || 'no missing pairs'} (${rows.length} upstream rows, ${selectedKeys.size} selected).`);
    } catch (error) {
      const failure = { indicator: indicator.id, country: null, url: fallbackUrl, error: error instanceof Error ? error.message : String(error), stage: 'completed-year-window-fallback' };
      failures.push(failure); fallbackRequests.push({ ...failure, status: 'failed', attempts: requestAttempts.filter(row => row.url === fallbackUrl).length });
      console.error(`WDI ${indicator.id}: fallback failed (${failure.error}).`);
    }
  }
  // The publisher also offers the same WDI series as a checked CSV archive.
  // Keep failed API requests in the audit; only extracted real archive values
  // may recover a missing pair, with the archive's own revision/provenance.
  if (failures.some(row => row.country && !row.recovered)) {
    const archiveUrl = `https://api.worldbank.org/v2/en/indicator/${indicator.id}?downloadformat=csv`;
    try {
      const raw = await fetchPublic(archiveUrl, { hosts: ['api.worldbank.org'], format: 'zip', kind: 'official-csv-archive-fallback', indicator: indicator.id });
      const { selected, release, file, expandedBytes } = await archiveRows(raw, indicator);
      const recovered = [];
      for (const failure of failures.filter(row => row.country && !row.recovered)) {
        const annualRows = selected.get(failure.country);
        const available = annualRows.filter(row => row.value !== null);
        if (!available.length) continue;
        perCountry.set(failure.country, available);
        provenance.set(failure.country, { raw, release, queryUrl: archiveUrl });
        failure.recovered = true; failure.recoveryUrl = archiveUrl;
        Object.assign(requests.find(row => row.country === failure.country), {
          status: 'recovered', primaryStatus: 'failed', recoveredVia: 'official-wdi-csv-archive', fallbackUrl: archiveUrl,
          archiveFile: file, fetchedAt: raw.fetchedAt, metadataUpdatedAt: release.lastupdated,
          responseYears: annualRows.map(row => Number(row.date)), returnedRows: annualRows.length, fallbackAttempts: raw.attempts.length,
        });
        recovered.push(failure.country);
      }
      if (!failures.some(row => row.country && !row.recovered)) {
        for (const failure of failures.filter(row => !row.country)) { failure.recovered = true; failure.recoveryUrl = archiveUrl; }
      }
      fallbackRequests.push({ url: raw.url, kind: 'official-wdi-csv-archive', indicator: indicator.id, status: 'complete',
        fetchedAt: raw.fetchedAt, bytes: raw.bytes, expandedCsvBytes: expandedBytes, archiveFile: file,
        selectedCountries: selected.size, selectedAnnualRows: selected.size * 8, recoveredCountries: recovered,
        metadataUpdatedAt: release.lastupdated, attempts: raw.attempts.length });
      console.log(`WDI ${indicator.id}: official CSV archive recovered ${recovered.join(', ') || 'no missing pairs'} (revision ${release.lastupdated}).`);
    } catch (error) {
      const failure = { indicator: indicator.id, country: null, url: archiveUrl, error: error instanceof Error ? error.message : String(error), stage: 'official-csv-archive-fallback' };
      failures.push(failure); fallbackRequests.push({ ...failure, status: 'failed', attempts: requestAttempts.filter(row => row.url === archiveUrl).length });
      console.error(`WDI ${indicator.id}: archive fallback failed (${failure.error}).`);
    }
  }
  const records = [];
  const trends = [];
  const missing = [];
  for (const country of countries) {
    if (!provenance.has(country.code)) { missing.push(`${country.code}/${indicator.id}`); continue; }
    const { raw, release, queryUrl } = provenance.get(country.code);
    const available = perCountry.get(country.code).sort((a, b) => Number(b.date) - Number(a.date));
    if (!available.length) { missing.push(`${country.code}/${indicator.id}`); continue; }
    const latest = available[0];
    const previous = available.find(row => Number(row.date) === Number(latest.date) - 1);
    const sourceUrl = `https://api.worldbank.org/v2/country/${country.code}/indicator/${indicator.id}?format=json&date=${latest.date}&per_page=100`;
    const title = `${country.name}: ${clean(metadata.name, 180)} (${latest.date})`;
    const content = clean(`${country.name} — ${metadata.name}: ${latest.value} ${indicator.unit}. Observation year: ${latest.date}. ${previous ? `Previous year (${previous.date}): ${previous.value} ${indicator.unit}. ` : ''}Source: World Bank World Development Indicators, indicator ${indicator.id}; upstream: ${clean(metadata.sourceOrganization, 280)}. WDI revision date: ${release.lastupdated}; fetched: ${raw.fetchedAt}. ${indicator.limit} Annual historical context, not live transaction data or a verified startup market size. World aggregates may follow indicator-specific aggregation methods.`, 1600);
    records.push({ title, url: sourceUrl, content, source: 'api.worldbank.org', fetchedAt: raw.fetchedAt, retrievalKind: 'open-data', dataPeriod: latest.date, publishedAt: null, expiresAt: new Date(Date.parse(raw.fetchedAt) + 30 * 86_400_000).toISOString(), datasetId: 'world-bank-wdi', country: country.code, countryName: country.name, indicator: indicator.id, value: latest.value, unit: indicator.unit, observationYear: Number(latest.date), metadataUpdatedAt: release.lastupdated, observationStatus: latest.obs_status || null, previousObservation: previous ? { year: Number(previous.date), value: previous.value, unit: indicator.unit } : null, queryUrl, licenseUrl: 'https://data.worldbank.org/summary-terms-of-use' });
    trends.push({ country: country.code, countryName: country.name, indicator: indicator.id, title: clean(metadata.name, 180), unit: indicator.unit,
      observations: available.slice().reverse().map(row => ({ year: Number(row.date), value: row.value })),
      fetchedAt: raw.fetchedAt, expiresAt: new Date(Date.parse(raw.fetchedAt) + 30 * 86_400_000).toISOString(),
      metadataUpdatedAt: release.lastupdated, sourceUrl: raw.url, sourceOrganization: clean(metadata.sourceOrganization, 500),
      limitation: indicator.limit, licenseUrl: 'https://data.worldbank.org/summary-terms-of-use' });
  }
  return { indicator: indicator.id, records, trends, missing, failures, excludedCurrentYear, requests, fallbackRequests,
    metadata: { ...metadata, unit: indicator.unit, metadataUrl: rawMetadata.url, fetchedAt: rawMetadata.fetchedAt,
      metadataUpdatedAt: requests.find(row => row.status === 'complete' || row.status === 'recovered')?.metadataUpdatedAt ?? null } };
}

async function atomicJson(path, value) { await atomicText(path, JSON.stringify(value, null, 2) + '\n'); }
export async function publishMarketBundle(path, data, createdAt = new Date().toISOString()) {
  const bundle = createMarketBundle(data, createdAt);
  // Preserve one complete accepted generation before the only publication
  // switch. A failed validation or backup write never replaces active evidence.
  try {
    const previous = JSON.parse(await readFile(path, 'utf8'));
    if (!validMarketBundle(previous)) throw new Error('Refusing to replace a corrupt prior market bundle without operator review');
    if (previous.manifest.id !== bundle.manifest.id) await atomicJson(path + '.previous.json', previous);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await atomicJson(path, bundle);
  return bundle;
}
async function atomicText(path, text) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, text, { encoding: 'utf8', flag: 'wx' }); await rename(temporary, path); }
  finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
async function readExisting(path) {
  try { const data = JSON.parse(await readFile(path, 'utf8')); if (!Array.isArray(data)) throw new Error(`${path} must be an array`); return data; }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

export async function main() {
  requestAttempts.length = 0;
  console.log(`Fetching the first 8 annual WDI rows per country/indicator; only completed years ${startYear}-${endYear - 1} are stored. Public HTTP only.`);
  const outcomes = await mapBounded(indicators, fetchIndicator);
  const successes = outcomes.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const failures = [...successes.flatMap(result => result.failures), ...outcomes.flatMap((result, index) => result.status === 'rejected'
    ? [{ indicator: indicators[index].id, country: null, url: `https://api.worldbank.org/v2/indicator/${indicators[index].id}?format=json`, error: result.reason }] : [])];
  const snapshot = successes.flatMap(result => result.records).sort((a, b) => countries.findIndex(c => c.code === a.country) - countries.findIndex(c => c.code === b.country) || a.indicator.localeCompare(b.indicator));
  const trends = successes.flatMap(result => result.trends).sort((a, b) => countries.findIndex(c => c.code === a.country) - countries.findIndex(c => c.code === b.country) || a.indicator.localeCompare(b.indicator));
  const expectedPairs = indicators.flatMap(indicator => countries.map(country => `${country.code}/${indicator.id}`));
  const missing = expectedPairs.filter(key => !snapshot.some(row => `${row.country}/${row.indicator}` === key));
  const missingTrends = expectedPairs.filter(key => !trends.some(row => `${row.country}/${row.indicator}` === key && row.observations.length >= 2));
  const snapshotPath = join(output, 'seed-sources.json');
  const trendPath = join(output, 'trend-series.json');
  const previousSnapshot = await readExisting(snapshotPath);
  const previousTrends = await readExisting(trendPath);
  const regressedKeys = previousSnapshot.map(row => `${row.country}/${row.indicator}`).filter(key => !snapshot.some(row => `${row.country}/${row.indicator}` === key));
  const regressedTrendKeys = previousTrends.map(row => `${row.country}/${row.indicator}`).filter(key => !trends.some(row => `${row.country}/${row.indicator}` === key && row.observations.length >= 2));
  const unresolvedFailures = failures.filter(row => !row.recovered);
  const canReplace = unresolvedFailures.length === 0 && snapshot.length === expectedPairs.length && missing.length === 0 && missingTrends.length === 0 && regressedKeys.length === 0 && regressedTrendKeys.length === 0;
  console.log(`WDI: ${snapshot.length}/48 latest observations, ${trends.length}/48 series, ${trends.reduce((sum, row) => sum + row.observations.length, 0)} historical values; snapshot ${canReplace ? 'updated' : 'retained with original timestamps'}.`);
  for (const failure of failures) {
    const label = `${failure.country ?? failure.stage ?? 'Metadata'}/${failure.indicator}`;
    if (failure.recovered) console.warn(`Recovered ${label} via ${failure.recoveryUrl}; original failure: ${failure.error}`);
    else console.error(`${label}: ${failure.error}`);
  }

  const catalogOutcomes = await mapBounded(catalogDefinitions, async definition => {
    const result = await fetchPublic(definition.url, { ...definition, kind: 'catalog-reference' });
    if (!definition.marker.test(result.text) || /<title[^>]*>\s*(?:Just a moment|Page Not Found)/i.test(result.text)) throw new Error('Expected official page identity was not verified');
    const pageTitle = result.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const metadataText = result.text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
    return { id: definition.id, title: definition.title, url: result.url, source: definition.source, recordType: 'reference', geography: definition.geography, updateCadence: definition.cadence || null, intendedUses: definition.uses, limitations: definition.limitations, licenseUrl: definition.licenseUrl || null, licenseNote: definition.licenseUrl ? 'Consult linked source terms, including any third-party restrictions.' : 'Not established by this fetch; public accessibility does not itself grant reuse rights.', verifiedAt: result.fetchedAt, verification: { httpStatus: 200, contentType: result.contentType, bytes: result.bytes, pageTitle: pageTitle ? clean(pageTitle, 250) : null, metadataExcerpt: clean(metadataText, 500), scope: 'Accessible official metadata or directory only; this entry is not numerical market evidence.' } };
  });
  const catalog = catalogOutcomes.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const catalogFailures = catalogOutcomes.flatMap((result, index) => result.status === 'rejected' ? [{ id: catalogDefinitions[index].id, url: catalogDefinitions[index].url, error: result.reason }] : []);
  const previousCatalog = await readExisting(join(output, 'source-catalog.json'));
  const retainedCatalog = previousCatalog.filter(row => !catalog.some(fresh => fresh.id === row.id));
  const storedCatalog = [...catalog, ...retainedCatalog];
  const bundlePath = join(output, 'bundle.json');
  let publishedBundle = null;
  if (canReplace) {
    // Publish one coherent file first. Mirrors remain inspection/compatibility
    // outputs; interruption between mirrors cannot mix app evidence revisions.
    publishedBundle = await publishMarketBundle(bundlePath, { observations: snapshot, trends,
      metadata: successes.map(result => result.metadata), catalog: storedCatalog });
    await atomicJson(join(output, 'world-bank-metadata.json'), successes.map(result => result.metadata));
    await atomicJson(trendPath, trends);
    await atomicJson(snapshotPath, snapshot);
  }
  let retainedBundleId = null;
  if (!publishedBundle) {
    try { const retained = JSON.parse(await readFile(bundlePath, 'utf8')); if (validMarketBundle(retained)) retainedBundleId = retained.manifest.id; }
    catch (error) { if (error.code !== 'ENOENT') console.warn('The retained market bundle could not be validated.'); }
  }
  if (catalog.length) await atomicJson(join(output, 'source-catalog.json'), storedCatalog);

  const dataRequests = indicators.flatMap(indicator => countries.map(country => {
    const url = `https://api.worldbank.org/v2/country/${country.code}/indicator/${indicator.id}?format=json&per_page=8`;
    return successes.flatMap(result => result.requests).find(row => row.url === url)
      ?? { url, indicator: indicator.id, country: country.code, status: 'not-attempted', reason: 'Indicator metadata could not be validated.', attempts: 0 };
  }));
  const metadataRequests = indicators.map(indicator => {
    const url = `https://api.worldbank.org/v2/indicator/${indicator.id}?format=json`;
    const attempts = requestAttempts.filter(row => row.url === url);
    const last = attempts.at(-1);
    const validated = successes.some(row => row.indicator === indicator.id);
    return { url, indicator: indicator.id, status: validated ? 'complete' : last?.status === 'complete' ? 'invalid' : 'failed',
      validated, attempts: attempts.length, fetchedAt: validated ? last.completedAt : null,
      error: validated ? null : failures.find(row => row.indicator === indicator.id && row.country === null)?.error ?? last?.error ?? 'Metadata was not retrieved.' };
  });
  const stored = canReplace ? snapshot : previousSnapshot;
  const storedTrends = canReplace ? trends : previousTrends;
  const trendYears = storedTrends.flatMap(row => row.observations.map(point => point.year));
  const status = { runStartedAt, completedAt: new Date().toISOString(), queryMode: 'first-eight-annual-rows-per-country', requestedPeriod: 'latest 8 annual rows per country/indicator', completedYearWindow: `${startYear}:${endYear - 1}`, completedYearOnly: true,
    requestTimeoutMs, maximumAttempts, maxConcurrentRequests: 3, expectedObservationCount: expectedPairs.length,
    fetchedObservationCount: snapshot.length, storedObservationCount: stored.length, snapshotUpdated: canReplace,
    dataBundleId: publishedBundle?.manifest.id ?? retainedBundleId, dataBundlePublished: Boolean(publishedBundle),
    fetchedTrendSeriesCount: trends.length, fetchedTrendObservationCount: trends.reduce((sum, row) => sum + row.observations.length, 0),
    storedTrendSeriesCount: storedTrends.length, storedTrendObservationCount: trendYears.length,
    storedTrendPeriod: trendYears.length ? { from: Math.min(...trendYears), to: Math.max(...trendYears) } : null,
    missing, missingTrends, failures, unresolvedFailureCount: unresolvedFailures.length, regressedKeys, regressedTrendKeys,
    excludedCurrentYearObservations: successes.reduce((sum, result) => sum + result.excludedCurrentYear, 0),
    dataRequests, successfulRequests: dataRequests.filter(row => row.status === 'complete' || row.status === 'recovered'), metadataRequests, requestAttempts,
    fallbackRequests: successes.flatMap(row => row.fallbackRequests), recoveredCountryRequestCount: dataRequests.filter(row => row.status === 'recovered').length,
    catalogVerifiedCount: catalog.length, catalogRetainedCount: retainedCatalog.length, catalogFailures };
  await atomicJson(join(output, 'refresh-status.json'), status);

  console.log(`Catalog: ${catalog.length} verified, ${retainedCatalog.length} retained, ${catalogFailures.length} failures. Request outcomes and source attribution remain in the data records.`);
  if (!canReplace) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
