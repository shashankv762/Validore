# Public market data

Last refresh attempt: 2026-10-31T19:11:29.372Z. Snapshot updated successfully. Stored 48 verified observations; observation years: 2024, 2025.

Run from the repository root:

```sh
node scripts/refresh-market-snapshot.mjs
```

This uses Node's built-in fetch and direct public HTTPS requests. It never reads .env, imports an AI provider SDK, invokes a model, accesses a database, or deploys anything. No application AI tokens or paid data APIs are used. This is an on-demand local refresh, not a scheduled job.

## What is stored

- src/data/market/seed-sources.json: a flat array compatible with SearchResult. Every record contains title, unique observation URL, content (at most 1,600 characters), source, fetchedAt, retrievalKind: open-data, dataPeriod, publishedAt: null, and expiresAt (30 days after fetch). Additional fields preserve country, indicator, numeric value, unit, observationYear, WDI metadataUpdatedAt, source query, license reference, and the previous calendar-year observation when available.
- src/data/market/world-bank-metadata.json: official indicator definitions, source organizations, and metadata retrieval timestamps.
- src/data/market/source-catalog.json: verified official directories or metadata references. These are explicitly references, not numerical evidence or independently retrieved series.
- src/data/market/refresh-status.json: request URLs, coverage, missing combinations and failures from the latest attempt.

Coverage: India, United States, United Kingdom, Singapore, Brazil and World. Indicators: total population; GDP in current USD; GDP per capita in current USD; internet use; annual CPI inflation; annual real GDP growth; urban population share; modeled ILO unemployment. All are macroeconomic context. They do not establish sector revenue, customer willingness to pay, business survival, or a startup's addressable market.

| Geography | Observations | Observation years |
| --- | --- | --- |
| India (IN) | 8 / 8 | 2025 |
| United States (US) | 8 / 8 | 2024, 2025 |
| United Kingdom (GB) | 8 / 8 | 2024, 2025 |
| Singapore (SG) | 8 / 8 | 2024, 2025 |
| Brazil (BR) | 8 / 8 | 2024, 2025 |
| World (WLD) | 8 / 8 | 2025 |

The requested API window is 2019:2026. Only the latest non-null observation from a completed calendar year is saved for each country/indicator. Current-year projections are excluded. Negative real growth and inflation remain valid values. A fetchedAt timestamp is the actual UTC retrieval time; it must never be presented as the observation period. WDI lastupdated is a dataset revision date, not the indicator's publication date; publishedAt remains null. Values can be estimates and can be revised. National definitions and World aggregation methods differ by indicator.

## Successful data requests in this attempt

- [SP.POP.TOTL](https://api.worldbank.org/v2/country/IN;US;GB;SG;BR;WLD/indicator/SP.POP.TOTL?format=json&date=2019:2026&per_page=1000) — 6 observations; WDI revision 2026-10-08; retrieved 2026-10-31T19:11:25.634Z.
- [NY.GDP.MKTP.CD](https://api.worldbank.org/v2/country/IN;US;GB;SG;BR;WLD/indicator/NY.GDP.MKTP.CD?format=json&date=2019:2026&per_page=1000) — 6 observations; WDI revision 2026-10-08; retrieved 2026-10-31T19:11:25.731Z.
- [NY.GDP.PCAP.CD](https://api.worldbank.org/v2/country/IN;US;GB;SG;BR;WLD/indicator/NY.GDP.PCAP.CD?format=json&date=2019:2026&per_page=1000) — 6 observations; WDI revision 2026-10-08; retrieved 2026-10-31T19:11:25.722Z.
- [IT.NET.USER.ZS](https://api.worldbank.org/v2/country/IN;US;GB;SG;BR;WLD/indicator/IT.NET.USER.ZS?format=json&date=2019:2026&per_page=1000) — 6 observations; WDI revision 2026-10-08; retrieved 2026-10-31T19:11:25.792Z.
- [FP.CPI.TOTL.ZG](https://api.worldbank.org/v2/country/IN;US;GB;SG;BR;WLD/indicator/FP.CPI.TOTL.ZG?format=json&date=2019:2026&per_page=1000) — 6 observations; WDI revision 2026-10-08; retrieved 2026-10-31T19:11:25.868Z.
- [NY.GDP.MKTP.KD.ZG](https://api.worldbank.org/v2/country/IN;US;GB;SG;BR;WLD/indicator/NY.GDP.MKTP.KD.ZG?format=json&date=2019:2026&per_page=1000) — 6 observations; WDI revision 2026-10-08; retrieved 2026-10-31T19:11:25.883Z.
- [SP.URB.TOTL.IN.ZS](https://api.worldbank.org/v2/country/IN;US;GB;SG;BR;WLD/indicator/SP.URB.TOTL.IN.ZS?format=json&date=2019:2026&per_page=1000) — 6 observations; WDI revision 2026-10-08; retrieved 2026-10-31T19:11:25.983Z.
- [SL.UEM.TOTL.ZS](https://api.worldbank.org/v2/country/IN;US;GB;SG;BR;WLD/indicator/SL.UEM.TOTL.ZS?format=json&date=2019:2026&per_page=1000) — 6 observations; WDI revision 2026-10-08; retrieved 2026-10-31T19:11:26.019Z.

Metadata requests:

- [SP.POP.TOTL definition](https://api.worldbank.org/v2/indicator/SP.POP.TOTL?format=json)
- [NY.GDP.MKTP.CD definition](https://api.worldbank.org/v2/indicator/NY.GDP.MKTP.CD?format=json)
- [NY.GDP.PCAP.CD definition](https://api.worldbank.org/v2/indicator/NY.GDP.PCAP.CD?format=json)
- [IT.NET.USER.ZS definition](https://api.worldbank.org/v2/indicator/IT.NET.USER.ZS?format=json)
- [FP.CPI.TOTL.ZG definition](https://api.worldbank.org/v2/indicator/FP.CPI.TOTL.ZG?format=json)
- [NY.GDP.MKTP.KD.ZG definition](https://api.worldbank.org/v2/indicator/NY.GDP.MKTP.KD.ZG?format=json)
- [SP.URB.TOTL.IN.ZS definition](https://api.worldbank.org/v2/indicator/SP.URB.TOTL.IN.ZS?format=json)
- [SL.UEM.TOTL.ZS definition](https://api.worldbank.org/v2/indicator/SL.UEM.TOTL.ZS?format=json)

## Verified official references

- [World Bank World Development Indicators](https://api.worldbank.org/v2/source/2?format=json) — verified 2026-10-31T19:11:26.232Z. Annual observations can lag publication and may be estimates or revised. Dataset-specific and third-party terms may apply.
- [RBI Data Releases](https://www.rbi.org.in/scripts/Statistics.aspx) — verified 2026-10-31T19:11:26.534Z. Publication directory only. Select the actual dated table and its units before citing a number; release frequency varies.
- [NPCI UPI product statistics entry point](https://www.npci.org.in/what-we-do/upi/product-statistics) — verified 2026-10-31T19:11:26.340Z. Verified public NPCI route; its HTML is an application shell, not a verified numeric table. Transaction counts are not unique users, businesses, or customer demand.
- [MoSPI statistics portal](https://www.mospi.gov.in/) — verified 2026-10-31T19:11:26.469Z. Verified ministry landing page, with dynamic content. No statistical tables or numbers were extracted; individual release definitions and dates must be checked.
- [Open Government Data Platform India](https://www.data.gov.in/) — verified 2026-10-31T19:11:26.596Z. Dataset directory, not a single dataset. API-key requirements, licensing, update dates, geographic coverage and units must be checked per resource.
- [Udyam registration official portal](https://udyamregistration.gov.in/) — verified 2026-10-31T19:11:28.518Z. Registration portal reference only. Registrations are not a census of operating firms, paying customers, or annual firm births; no count is imported here.
- [Startup India initiative](https://www.startupindia.gov.in/content/sih/en/about-startup-india-initiative.html) — verified 2026-10-31T19:11:26.837Z. Program reference only. Recognized startups are an administrative subset; recognition counts are not total startups, active businesses, or addressable demand.
- [ILOSTAT Data Explorer](https://rshiny.ilo.org/dataexplorer54/) — verified 2026-10-31T19:11:29.366Z. Verified interactive explorer entry point only. No standalone ILO series was downloaded; distinguish modeled estimates from national survey measures.
- [UN System Data Commons](https://data.un.org/) — verified 2026-10-31T19:11:27.353Z. Directory reference only. Agency sources, indicator definitions, revision dates and licenses vary; no numeric series was imported from this page.
- [OECD Short-Term Economic Statistics SDMX catalog](https://sdmx.oecd.org/public/rest/v1/dataflow/OECD.SDD.STES/all/latest?references=none) — verified 2026-10-31T19:11:28.669Z. Dataflow metadata only, including non-production flows. Select a production dataset, dimensions, units and coverage before requesting values; no OECD observations were imported.

Update cadence is null when the retrieved metadata does not establish it. Dynamic application shells are identified as entry points and supply no numbers. The RBI, NPCI, MoSPI, data.gov.in, Udyam, Startup India, ILO, UN and OECD entries are discovery references only. The saved quantitative observations all come from WDI, whose metadata identifies original agencies.

## Coverage gaps and failures

Missing country/indicator pairs in this attempt: none.

World Bank fetch failures: none.

Catalog fetch failures: none. Retained older catalog entries: 0.

During initial source discovery, the ILO main data and concepts pages and the OECD website data page returned HTTP 403; their alternate official explorer / SDMX metadata endpoints were used. The CIMS RBI DBIE path returned HTTP 404. The guessed data.gov.in Government Open Data License path redirected to Page Not Found, so no license is inferred for that catalog. No numbers were scraped from these failed pages.

## Attribution, freshness and safe refresh behavior

Attribute quantitative records to World Bank, World Development Indicators, the indicator code, observation year and retrieval date, with the linked underlying source organization where appropriate. See [World Bank summary terms](https://data.worldbank.org/summary-terms-of-use). Dataset-specific or third-party restrictions may apply; a public URL alone is not a license. Other catalog licenses are left unknown unless independently established.

The 30-day expiresAt is the application's retrieval freshness window, not a claim that annual data becomes false after 30 days. Refresh regularly when using the snapshot for new reports and always display the actual observation year. Registration and payment figures, when fetched separately in future, require their own period, units and definitions.

Requests use a fixed HTTPS hostname allowlist, at most three concurrent requests, manual bounded redirects, a 25-second deadline per request, response type checks and streaming size limits. WDI responses must be a complete single page with correct country, indicator, source and year; numbers must be finite and within applicable domains. A failed indicator fetch, less than 30 observations, missing geography or loss of previous coverage preserves the existing numerical snapshot unchanged. Each JSON/text file is written to a temporary sibling and atomically renamed; the seed array is the application's snapshot boundary. Catalog refresh failures preserve older verified entries with their original timestamps. Review refresh-status.json and process exit status after refreshing.
