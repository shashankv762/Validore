import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = resolve(root, 'public');
let references = 0;

function checkAsset(value, file) {
  if (/^(?:https?:|mailto:|data:|#)/.test(value)) return;
  const asset = resolve(publicRoot, value.replace(/^\//, '').split(/[?#]/)[0]);
  assert(!relative(publicRoot, asset).startsWith('..'), `${file}: asset escapes public/: ${value}`);
  assert(existsSync(asset), `${file}: missing asset ${value}`);
  references++;
}

for (const filename of ['index.html', '404.html']) {
  const html = readFileSync(resolve(publicRoot, filename), 'utf8');
  assert(!html.includes('\ufffd'), `${filename}: invalid text encoding`);
  assert.equal((html.match(/<h1\b/g) || []).length, 1, `${filename}: expected one main heading`);
  assert.match(html, /<meta name="theme-color" content="#0B0E13">/i, `${filename}: browser theme differs from the app`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${filename}: duplicate element IDs`);
  for (const [, href] of html.matchAll(/\bhref="([^"]+)"/g)) {
    if (href.startsWith('#') && href.length > 1) assert(ids.includes(href.slice(1)), `${filename}: broken anchor ${href}`);
  }
  for (const [, value] of html.matchAll(/\b(?:src|href)="([^"]+)"/g)) checkAsset(value, filename);
  for (const [, value] of html.matchAll(/\baria-(?:controls|labelledby)="([^"]+)"/g)) {
    for (const id of value.split(/\s+/)) assert(ids.includes(id), `${filename}: missing accessible target ${id}`);
  }
  assert(!/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html), `${filename}: inline script conflicts with CSP`);
}

const css = readFileSync(resolve(publicRoot, 'styles.css'), 'utf8');
const brandTokens = {
  navy: '#0B0E13', gold: '#E0A526', 'gold-light': '#F0C04E', 'gold-dark': '#A86A0A',
  cream: '#F4EFE6', ivory: '#FAFAF7', 'border-subtle': '#E8E0D0',
  'workspace-ink': '#141923', 'workspace-muted': '#657081',
  'workspace-paper': '#F7F8FA', 'workspace-rule': '#E5E7EB',
};
for (const [name, value] of Object.entries(brandTokens)) {
  assert.match(css, new RegExp(`--${name}:\\s*${value}\\s*;`, 'i'), `Brand token ${name} differs from the app`);
}
for (const [, value] of css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) checkAsset(value, 'styles.css');
assert(css.includes('prefers-reduced-motion'), 'Missing reduced-motion support');
assert(css.includes(':focus-visible'), 'Missing visible keyboard focus');

function pagesRuleLines(filename) {
  return readFileSync(resolve(publicRoot, filename), 'utf8').split(/\r?\n/)
    .filter(line => line.trim() && !line.trimStart().startsWith('#'));
}

const renderOrigin = 'https://validore.onrender.com';
const headerBlocks = new Map();
let directives;
for (const line of pagesRuleLines('_headers')) {
  if (/^\S/.test(line)) {
    const path = line.trim();
    assert(!headerBlocks.has(path), `_headers: duplicate rule for ${path}`);
    directives = [];
    headerBlocks.set(path, directives);
  } else {
    assert(directives, '_headers: header directive has no path rule');
    directives.push(line.trim());
  }
}
assert.deepEqual([...headerBlocks.keys()], ['/*', '/assets/*'], '_headers: expected site-wide and asset rules in order');
assert.deepEqual(headerBlocks.get('/*').sort(), [
  'X-Content-Type-Options: nosniff',
  'X-Frame-Options: DENY',
  'Referrer-Policy: strict-origin-when-cross-origin',
  'Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
  'Strict-Transport-Security: max-age=31536000',
  `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src ${renderOrigin}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; upgrade-insecure-requests`,
  'Cache-Control: public, max-age=0, must-revalidate',
].sort(), '_headers: site-wide security or cache policy changed');
assert.deepEqual(headerBlocks.get('/assets/*'), [
  '! Cache-Control',
  'Cache-Control: public, max-age=86400, stale-while-revalidate=604800',
], '_headers: assets must replace the site-wide cache policy');

// Pages applies the first matching redirect. Check the complete ordered list so
// no other rule can shadow a forward or redirect the static landing page.
assert.deepEqual(pagesRuleLines('_redirects').map(line => line.trim().split(/\s+/)), [
  ['/auth/*', `${renderOrigin}/auth/:splat`, '302'],
  ['/dashboard', `${renderOrigin}/dashboard`, '302'],
  ['/dashboard/*', `${renderOrigin}/dashboard/:splat`, '302'],
  ['/legal/*', `${renderOrigin}/legal/:splat`, '302'],
  ['/demo', `${renderOrigin}/demo`, '302'],
], '_redirects: expected temporary app route forwards to Render with paths preserved');
for (const [filename, width, height] of [['social.png', 1200, 630], ['apple-touch-icon.png', 180, 180]]) {
  const image = readFileSync(resolve(publicRoot, 'assets', filename));
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${filename}: invalid PNG signature`);
  assert.equal(image.readUInt32BE(16), width, `${filename}: expected ${width}px width`);
  assert.equal(image.readUInt32BE(20), height, `${filename}: expected ${height}px height`);
}
for (const filename of ['geist-latin.woff2', 'geist-mono-latin.woff2']) {
  const font = readFileSync(resolve(publicRoot, 'assets', filename));
  assert.equal(font.toString('ascii', 0, 4), 'wOF2', `${filename}: invalid font signature`);
  assert.equal(font.readUInt32BE(8), statSync(resolve(publicRoot, 'assets', filename)).size, `${filename}: invalid font length`);
  assert(font.length > 1000, `${filename}: font file is empty`);
}
assert(existsSync(resolve(publicRoot, 'assets/OFL.txt')), 'Font license missing');
assert(existsSync(resolve(publicRoot, 'assets/LUCIDE-LICENSE.txt')), 'Icon license missing');
// Verify against the live app source, not just another hard-coded palette.
// These extra checks are optional when this standalone folder is copied out of
// the repository; the public-file checks above still run without dependencies.
const repo = resolve(root, '..');
function rule(source, selector, requiredProperty) {
  const clean = source.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [, selectors, declarations] of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.split(',').map(value => value.trim()).includes(selector)) {
      const properties = Object.fromEntries([...declarations.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map(([, property, value]) => [property, value.trim()]));
      // A reset such as `h1, h2 { margin: 0 }` is not the type definition.
      if (!requiredProperty || requiredProperty in properties) return properties;
    }
  }
  throw new Error(`Missing design-system selector: ${selector}`);
}
function normalize(value, tokens, depth = 0) {
  assert.equal(typeof value, 'string', 'Missing design-system declaration');
  assert(depth < 10, 'Circular design token');
  return value.replace(/var\((--[\w-]+)\)/g, (original, name) => tokens[name] ? normalize(tokens[name], tokens, depth + 1) : original)
    .replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').replace(/(^|[\s,(])0\./g, '$1.').trim().toLowerCase();
}
let appChecks = 0;
const appGlobalsPath = resolve(repo, 'src/app/globals.css');
if (existsSync(appGlobalsPath)) {
  const globals = readFileSync(appGlobalsPath, 'utf8');
  const landing = readFileSync(resolve(repo, 'src/app/landing.css'), 'utf8');
  const workspace = readFileSync(resolve(repo, 'src/app/dashboard/workspace.css'), 'utf8');
  const appTokens = rule(globals, ':root');
  const siteTokens = rule(css, ':root');
  const workspaceTokens = rule(workspace, '.workspace-shell');
  for (const name of ['navy', 'gold', 'gold-light', 'gold-dark', 'charcoal', 'cream', 'ivory', 'border-subtle', 'ease-out']) {
    assert.equal(normalize(siteTokens['--' + name], siteTokens), normalize(appTokens['--' + name], appTokens), `--${name} drifted from src/app/globals.css`);
    appChecks++;
  }
  for (const name of ['workspace-ink', 'workspace-muted', 'workspace-rule']) {
    assert.equal(normalize(siteTokens['--' + name], siteTokens), normalize(workspaceTokens['--' + name], workspaceTokens), `--${name} drifted from the workspace`);
    appChecks++;
  }
  assert.equal(normalize(siteTokens['--workspace-paper'], siteTokens), normalize(workspaceTokens.background, workspaceTokens), 'Workspace paper drifted from the app');
  appChecks++;
  for (const [folder, filename] of [
    ['fonts', 'geist-latin.woff2'], ['fonts', 'geist-mono-latin.woff2'], ['fonts', 'OFL.txt'],
    ['logo', 'validore-logo-dark.svg'], ['logo', 'validore-logo-light.svg'], ['logo', 'validore-icon.svg'],
  ]) {
    assert(readFileSync(resolve(publicRoot, 'assets', filename)).equals(readFileSync(resolve(repo, 'public', folder, filename))), `${filename}: must be an unchanged copy of the app asset`);
    appChecks++;
  }
  for (const [siteSelector, appSource, appSelector, properties] of [
    ['.button', globals, '.button', ['min-height', 'padding', 'border-radius', 'font-size', 'font-weight', 'line-height', 'text-align', 'transition']],
    ['.brand img', globals, '.brand-artwork', ['width', 'height', 'object-fit']],
    ['.container', landing, '.landing-container', ['width', 'margin-inline']],
    ['.hero-layout', landing, '.hero-layout', ['grid-template-columns', 'gap', 'padding-block']],
    ['h1', landing, '.landing-hero h1', ['font-size', 'font-weight', 'line-height', 'letter-spacing']],
    ['h2', landing, '.landing h2', ['font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-wrap']],
    ['.sample-window', landing, '.report-preview', ['background', 'color', 'border', 'border-radius', 'box-shadow']],
    ['.sample-title-row h3', landing, '.preview-title h2', ['font-size', 'font-weight', 'line-height', 'letter-spacing']],
    ['.sample-score .score-filled', landing, '.score-value', ['stroke', 'stroke-linecap']],
    ['.dimension-track span', landing, '.dimension-track span', ['background', 'transform-origin']],
    ['.launch-layout', landing, '.closing-section', ['background', 'border-radius']],
  ]) {
    const siteRule = rule(css, siteSelector, properties[0]);
    const appRule = rule(appSource, appSelector, properties[0]);
    for (const property of properties) {
      assert.equal(normalize(siteRule[property], siteTokens), normalize(appRule[property], appTokens), `${siteSelector} ${property} differs from app ${appSelector}`);
      appChecks++;
    }
  }
} else {
  console.log('App-source parity skipped: this standalone folder has no sibling src/app.');
}

let lucideChecks = 0;
const iconDirectory = resolve(repo, 'node_modules/lucide-react/dist/esm/icons');
if (existsSync(iconDirectory)) {
  const html = readFileSync(resolve(publicRoot, 'index.html'), 'utf8');
  for (const [, name, contents] of html.matchAll(/<symbol\b[^>]*data-lucide="([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/symbol>/g)) {
    const { __iconData } = await import(pathToFileURL(resolve(iconDirectory, name + '.mjs')).href);
    const nodes = [...contents.matchAll(/<(path|circle|line|polyline|polygon|rect|ellipse)\b([^>]*?)\/>/g)].map(([, tag, attributes]) => [tag, Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]))]);
    const expected = __iconData.node.map(([tag, attributes]) => [tag, Object.fromEntries(Object.entries(attributes).filter(([key]) => key !== 'key').map(([key, value]) => [key, String(value)]))]);
    assert.deepEqual(nodes, expected, `${name}: icon paths differ from the app's Lucide version`);
    lucideChecks++;
  }
}
console.log(`Static release checks passed: ${references} local asset references, ${appChecks} app-source parity checks, ${lucideChecks} exact Lucide icons, both Geist fonts, anchors, accessibility targets, PNG artwork, Pages headers and Render redirects.`);
