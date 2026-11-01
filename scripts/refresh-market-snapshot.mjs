#!/usr/bin/env node
// Public HTTP only. This script never loads environment files, an AI SDK, or a database.
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const output = join(root, 'src', 'data', 'market');
const runStartedAt = new Date().toISOString();
const endYear = new Date(runStartedAt).getUTCFullYear();
const startYear = endYear - 7;
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

async function fetchPublic(value, { hosts, format = 'html', maxBytes = 2_000_000 } = {}) {
  let url = checkedUrl(value, hosts);
  // One deadline covers redirects and streaming the response body.
  const signal = AbortSignal.timeout(25_000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, {
      redirect: 'manual', signal,
      headers: { Accept: format === 'json' ? 'application/json' : format === 'xml' ? 'application/xml,text/xml,application/vnd.sdmx.structure+xml' : 'text/html', 'User-Agent': 'Validore-Public-Market-Snapshot/1.0' },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location || redirects === 3) throw new Error('Missing redirect location or too many redirects');
      url = checkedUrl(new URL(location, url).href, hosts);
      continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${response.status} at ${url.href}`); }
    const contentType = response.headers.get('content-type') || '';
    const expected = format === 'json' ? /\bapplication\/json\b/i : format === 'xml' ? /(?:application|text)\/(?:[\w.+-]*\+)?xml\b/i : /\btext\/html\b/i;
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
    const text = Buffer.concat(chunks).toString('utf8');
    return { text, url: url.href, fetchedAt: new Date().toISOString(), contentType, bytes: size };
  }
  throw new Error('Redirect limit exceeded');
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

async function fetchIndicator(indicator) {
  const queryUrl = `https://api.worldbank.org/v2/country/${countries.map(c => c.code).join(';')}/indicator/${indicator.id}?format=json&date=${startYear}:${endYear}&per_page=1000`;
  const metadataUrl = `https://api.worldbank.org/v2/indicator/${indicator.id}?format=json`;
  // Sequential within each worker keeps total public requests bounded to three.
  const raw = await fetchPublic(queryUrl, { hosts: ['api.worldbank.org'], format: 'json' });
  const [release, rows] = envelope(raw.text, 'observations');
  if (String(release.sourceid) !== '2' || !dateOnly(release.lastupdated)) throw new Error('Invalid WDI source or metadata revision date');
  const rawMetadata = await fetchPublic(metadataUrl, { hosts: ['api.worldbank.org'], format: 'json' });
  const [, metadataRows] = envelope(rawMetadata.text, 'indicator metadata');
  const metadata = metadataRows.find(row => row.id === indicator.id && String(row.source?.id) === '2');
  if (!metadata || typeof metadata.name !== 'string' || typeof metadata.sourceNote !== 'string') throw new Error('Indicator metadata is missing or mismatched');
  const perCountry = new Map(countries.map(c => [c.code, []]));
  const seen = new Set();
  let excludedCurrentYear = 0;
  for (const row of rows) {
    const country = countries.find(c => c.apiId === row.country?.id && c.iso3 === row.countryiso3code);
    if (!country || row.indicator?.id !== indicator.id || !/^\d{4}$/.test(row.date)) throw new Error('Unexpected country, indicator, or observation year');
    const year = Number(row.date);
    if (year < startYear || year > endYear) throw new Error('Observation outside requested date range');
    const key = `${country.code}:${year}`;
    if (seen.has(key)) throw new Error(`Duplicate observation ${key}`);
    seen.add(key);
    if (row.value === null) continue;
    if (typeof row.value !== 'number' || !Number.isFinite(row.value) || row.value < indicator.bounds[0] || row.value > indicator.bounds[1] || (indicator.integer && !Number.isInteger(row.value))) throw new Error(`Invalid numeric observation ${key}`);
    // Only completed calendar-year observations are saved; no current-year projections.
    if (year === endYear) { excludedCurrentYear++; continue; }
    perCountry.get(country.code).push(row);
  }
  const records = [];
  const missing = [];
  for (const country of countries) {
    const available = perCountry.get(country.code).sort((a, b) => Number(b.date) - Number(a.date));
    if (!available.length) { missing.push(`${country.code}/${indicator.id}`); continue; }
    const latest = available[0];
    const previous = available.find(row => Number(row.date) === Number(latest.date) - 1);
    const sourceUrl = `https://api.worldbank.org/v2/country/${country.code}/indicator/${indicator.id}?format=json&date=${latest.date}&per_page=100`;
    const title = `${country.name}: ${clean(metadata.name, 180)} (${latest.date})`;
    const content = clean(`${country.name} — ${metadata.name}: ${latest.value} ${indicator.unit}. Observation year: ${latest.date}. ${previous ? `Previous year (${previous.date}): ${previous.value} ${indicator.unit}. ` : ''}Source: World Bank World Development Indicators, indicator ${indicator.id}; upstream: ${clean(metadata.sourceOrganization, 280)}. WDI revision date: ${release.lastupdated}; fetched: ${raw.fetchedAt}. ${indicator.limit} Annual historical context, not live transaction data or a verified startup market size. World aggregates may follow indicator-specific aggregation methods.`, 1600);
    records.push({ title, url: sourceUrl, content, source: 'api.worldbank.org', fetchedAt: raw.fetchedAt, retrievalKind: 'open-data', dataPeriod: latest.date, publishedAt: null, expiresAt: new Date(Date.parse(raw.fetchedAt) + 30 * 86_400_000).toISOString(), datasetId: 'world-bank-wdi', country: country.code, countryName: country.name, indicator: indicator.id, value: latest.value, unit: indicator.unit, observationYear: Number(latest.date), metadataUpdatedAt: release.lastupdated, observationStatus: latest.obs_status || null, previousObservation: previous ? { year: Number(previous.date), value: previous.value, unit: indicator.unit } : null, queryUrl, licenseUrl: 'https://data.worldbank.org/summary-terms-of-use' });
  }
  return { indicator: indicator.id, records, missing, excludedCurrentYear, request: { url: raw.url, fetchedAt: raw.fetchedAt, bytes: raw.bytes, metadataUpdatedAt: release.lastupdated }, metadata: { ...metadata, unit: indicator.unit, metadataUrl: rawMetadata.url, fetchedAt: rawMetadata.fetchedAt, metadataUpdatedAt: release.lastupdated } };
}

async function atomicJson(path, value) { await atomicText(path, JSON.stringify(value, null, 2) + '\n'); }
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

console.log(`Fetching WDI ${startYear}:${endYear}; completed years only. No AI APIs, environment files, or database access.`);
const outcomes = await mapBounded(indicators, fetchIndicator);
const successes = outcomes.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
const failures = outcomes.flatMap((result, index) => result.status === 'rejected' ? [{ indicator: indicators[index].id, error: result.reason }] : []);
const snapshot = successes.flatMap(result => result.records).sort((a, b) => countries.findIndex(c => c.code === a.country) - countries.findIndex(c => c.code === b.country) || a.indicator.localeCompare(b.indicator));
const missing = indicators.flatMap(indicator => countries.map(country => `${country.code}/${indicator.id}`)).filter(key => !snapshot.some(row => `${row.country}/${row.indicator}` === key));
const snapshotPath = join(output, 'seed-sources.json');
const previousSnapshot = await readExisting(snapshotPath);
const previousKeys = previousSnapshot.map(row => `${row.country}/${row.indicator}`);
const regressedKeys = previousKeys.filter(key => !snapshot.some(row => `${row.country}/${row.indicator}` === key));
const canReplace = failures.length === 0 && snapshot.length >= 30 && countries.every(country => snapshot.some(row => row.country === country.code)) && regressedKeys.length === 0;
if (canReplace) {
  // The application snapshot is a single atomically replaced array.
  await atomicJson(join(output, 'world-bank-metadata.json'), successes.map(result => result.metadata));
  await atomicJson(snapshotPath, snapshot);
}
console.log(`WDI: ${successes.length}/${indicators.length} indicators, ${snapshot.length}/48 observations; snapshot ${canReplace ? 'updated' : 'retained unchanged'}.`);
for (const failure of failures) console.error(`${failure.indicator}: ${failure.error}`);
if (missing.length) console.log(`Missing: ${missing.join(', ')}`);
if (regressedKeys.length) console.error(`Refusing to remove existing coverage: ${regressedKeys.join(', ')}`);

const catalogOutcomes = await mapBounded(catalogDefinitions, async definition => {
  const result = await fetchPublic(definition.url, definition);
  if (!definition.marker.test(result.text) || /<title[^>]*>\s*(?:Just a moment|Page Not Found)/i.test(result.text)) throw new Error('Expected official page identity was not verified');
  const pageTitle = result.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const metadataText = result.text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  return { id: definition.id, title: definition.title, url: result.url, source: definition.source, recordType: 'reference', geography: definition.geography, updateCadence: definition.cadence || null, intendedUses: definition.uses, limitations: definition.limitations, licenseUrl: definition.licenseUrl || null, licenseNote: definition.licenseUrl ? 'Consult linked source terms, including any third-party restrictions.' : 'Not established by this fetch; public accessibility does not itself grant reuse rights.', verifiedAt: result.fetchedAt, verification: { httpStatus: 200, contentType: result.contentType, bytes: result.bytes, pageTitle: pageTitle ? clean(pageTitle, 250) : null, metadataExcerpt: clean(metadataText, 500), scope: 'Accessible official metadata or directory only; this entry is not numerical market evidence.' } };
});
const catalog = catalogOutcomes.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
const catalogFailures = catalogOutcomes.flatMap((result, index) => result.status === 'rejected' ? [{ id: catalogDefinitions[index].id, url: catalogDefinitions[index].url, error: result.reason }] : []);
const previousCatalog = await readExisting(join(output, 'source-catalog.json'));
const catalogKeys = new Set(catalog.map(row => row.id));
const retainedCatalog = previousCatalog.filter(row => !catalogKeys.has(row.id));
if (catalog.length) await atomicJson(join(output, 'source-catalog.json'), [...catalog, ...retainedCatalog]);
const status = { runStartedAt, completedAt: new Date().toISOString(), requestedPeriod: `${startYear}:${endYear}`, completedYearOnly: true, expectedObservationCount: 48, fetchedObservationCount: snapshot.length, storedObservationCount: canReplace ? snapshot.length : previousSnapshot.length, snapshotUpdated: canReplace, missing, failures, regressedKeys, excludedCurrentYearObservations: successes.reduce((sum, result) => sum + result.excludedCurrentYear, 0), successfulRequests: successes.map(result => result.request), metadataRequests: successes.map(result => ({ url: result.metadata.metadataUrl, fetchedAt: result.metadata.fetchedAt })), catalogVerifiedCount: catalog.length, catalogRetainedCount: retainedCatalog.length, catalogFailures };
await atomicJson(join(output, 'refresh-status.json'), status);

const stored = canReplace ? snapshot : previousSnapshot;
const periods = [...new Set(stored.map(row => row.dataPeriod))].sort();
const countrySummary = countries.map(country => `| ${country.name} (${country.code}) | ${stored.filter(row => row.country === country.code).length} / 8 | ${[...new Set(stored.filter(row => row.country === country.code).map(row => row.dataPeriod))].sort().join(', ') || 'None'} |`).join('\n');
const documentation = `# Public market data\n\nLast refresh attempt: ${status.completedAt}. Snapshot ${canReplace ? 'updated successfully' : 'retained; this refresh did not replace it'}. Stored ${stored.length} verified observations; observation years: ${periods.join(', ') || 'none'}.\n\nRun from the repository root:\n\n\`\`\`sh\nnode scripts/refresh-market-snapshot.mjs\n\`\`\`\n\nThis uses Node's built-in fetch and direct public HTTPS requests. It never reads .env, imports an AI provider SDK, invokes a model, accesses a database, or deploys anything. No application AI tokens or paid data APIs are used. This is an on-demand local refresh, not a scheduled job.\n\n## What is stored\n\n- src/data/market/seed-sources.json: a flat array compatible with SearchResult. Every record contains title, unique observation URL, content (at most 1,600 characters), source, fetchedAt, retrievalKind: open-data, dataPeriod, publishedAt: null, and expiresAt (30 days after fetch). Additional fields preserve country, indicator, numeric value, unit, observationYear, WDI metadataUpdatedAt, source query, license reference, and the previous calendar-year observation when available.\n- src/data/market/world-bank-metadata.json: official indicator definitions, source organizations, and metadata retrieval timestamps.\n- src/data/market/source-catalog.json: verified official directories or metadata references. These are explicitly references, not numerical evidence or independently retrieved series.\n- src/data/market/refresh-status.json: request URLs, coverage, missing combinations and failures from the latest attempt.\n\nCoverage: India, United States, United Kingdom, Singapore, Brazil and World. Indicators: total population; GDP in current USD; GDP per capita in current USD; internet use; annual CPI inflation; annual real GDP growth; urban population share; modeled ILO unemployment. All are macroeconomic context. They do not establish sector revenue, customer willingness to pay, business survival, or a startup's addressable market.\n\n| Geography | Observations | Observation years |\n| --- | --- | --- |\n${countrySummary}\n\nThe requested API window is ${startYear}:${endYear}. Only the latest non-null observation from a completed calendar year is saved for each country/indicator. Current-year projections are excluded. Negative real growth and inflation remain valid values. A fetchedAt timestamp is the actual UTC retrieval time; it must never be presented as the observation period. WDI lastupdated is a dataset revision date, not the indicator's publication date; publishedAt remains null. Values can be estimates and can be revised. National definitions and World aggregation methods differ by indicator.\n\n## Successful data requests in this attempt\n\n${successes.map(result => `- [${result.indicator}](${result.request.url}) — ${result.records.length} observations; WDI revision ${result.request.metadataUpdatedAt}; retrieved ${result.request.fetchedAt}.`).join('\n') || 'None.'}\n\nMetadata requests:\n\n${successes.map(result => `- [${result.indicator} definition](${result.metadata.metadataUrl})`).join('\n') || 'None.'}\n\n## Verified official references\n\n${catalog.map(row => `- [${row.title}](${row.url}) — verified ${row.verifiedAt}. ${row.limitations}`).join('\n') || 'No references verified in this attempt.'}\n\nUpdate cadence is null when the retrieved metadata does not establish it. Dynamic application shells are identified as entry points and supply no numbers. The RBI, NPCI, MoSPI, data.gov.in, Udyam, Startup India, ILO, UN and OECD entries are discovery references only. The saved quantitative observations all come from WDI, whose metadata identifies original agencies.\n\n## Coverage gaps and failures\n\nMissing country/indicator pairs in this attempt: ${missing.length ? missing.join(', ') : 'none'}.\n\nWorld Bank fetch failures: ${failures.length ? failures.map(row => `${row.indicator}: ${row.error}`).join('; ') : 'none'}.\n\nCatalog fetch failures: ${catalogFailures.length ? catalogFailures.map(row => `${row.url}: ${row.error}`).join('; ') : 'none'}. Retained older catalog entries: ${retainedCatalog.length}.\n\nDuring initial source discovery, the ILO main data and concepts pages and the OECD website data page returned HTTP 403; their alternate official explorer / SDMX metadata endpoints were used. The CIMS RBI DBIE path returned HTTP 404. The guessed data.gov.in Government Open Data License path redirected to Page Not Found, so no license is inferred for that catalog. No numbers were scraped from these failed pages.\n\n## Attribution, freshness and safe refresh behavior\n\nAttribute quantitative records to World Bank, World Development Indicators, the indicator code, observation year and retrieval date, with the linked underlying source organization where appropriate. See [World Bank summary terms](https://data.worldbank.org/summary-terms-of-use). Dataset-specific or third-party restrictions may apply; a public URL alone is not a license. Other catalog licenses are left unknown unless independently established.\n\nThe 30-day expiresAt is the application's retrieval freshness window, not a claim that annual data becomes false after 30 days. Refresh regularly when using the snapshot for new reports and always display the actual observation year. Registration and payment figures, when fetched separately in future, require their own period, units and definitions.\n\nRequests use a fixed HTTPS hostname allowlist, at most three concurrent requests, manual bounded redirects, a 25-second deadline per request, response type checks and streaming size limits. WDI responses must be a complete single page with correct country, indicator, source and year; numbers must be finite and within applicable domains. A failed indicator fetch, less than 30 observations, missing geography or loss of previous coverage preserves the existing numerical snapshot unchanged. Each JSON/text file is written to a temporary sibling and atomically renamed; the seed array is the application's snapshot boundary. Catalog refresh failures preserve older verified entries with their original timestamps. Review refresh-status.json and process exit status after refreshing.\n`;
await atomicText(join(root, 'docs', 'DATA_SOURCES.md'), documentation);
console.log(`Catalog: ${catalog.length} verified references, ${retainedCatalog.length} retained, ${catalogFailures.length} failures.`);
for (const failure of catalogFailures) console.error(`${failure.id}: ${failure.error}`);
console.log(`Wrote status and documentation. Stored observations: ${status.storedObservationCount}.`);
if (!canReplace) process.exitCode = 1;
