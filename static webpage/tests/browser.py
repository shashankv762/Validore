"""Browser acceptance for the standalone landing site. Serve the actual local
files through browser routes, with production headers; no server is required.
Requests to the real app are always intercepted.
Uses the repository's axe-core when available; AXE_SCRIPT_PATH can override it.
"""
from pathlib import Path
import argparse
import json
import mimetypes
import os
from urllib.parse import urlparse, unquote
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--confirm', action='store_true', help='Write a separate final confirmation batch')
parser.add_argument('--http', action='store_true', help='Also drive the real local preview server on port 4174')
ARGS = parser.parse_args()
REPORTS = REPO / 'reports' / 'static-website' / ('brand-confirm' if ARGS.confirm else 'brand-acceptance')
REPORTS.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:4174'
HEALTH = 'https://validore.onrender.com/api/health'
APP = 'https://validore.onrender.com'
PAGES_HEADER_LINES = (ROOT / 'public' / '_headers').read_text(encoding='utf-8').splitlines()
AXE_PATH = os.environ.get('AXE_SCRIPT_PATH')
if not AXE_PATH and (REPO / 'node_modules/axe-core/axe.min.js').exists():
    AXE_PATH = str(REPO / 'node_modules/axe-core/axe.min.js')
RESULTS = {'status': 'running', 'checks': [], 'screenshots': [], 'accessibility': [], 'metrics': {}, 'browsers': [], 'skipped': []}


def record(name):
    RESULTS['checks'].append(name)


def pages_headers(path):
    """Apply the path rules in public/_headers, including asset overrides."""
    headers = {}
    matches = False
    for raw in PAGES_HEADER_LINES:
        line = raw.strip()
        if not line or line.startswith('#'):
            continue
        if not raw[0].isspace():
            matches = path.startswith(line[:-1]) if line.endswith('*') else path == line
        elif matches:
            if line.startswith('!'):
                headers.pop(line[1:].strip().lower(), None)
            else:
                name, value = line.split(':', 1)
                name, value = name.strip().lower(), value.strip()
                headers[name] = f'{headers[name]}, {value}' if name in headers else value
    return headers


def setup_page(browser, width=1440, height=1000, javascript=True, reduced='no-preference', sequence=None, scheme='light', forced='none', legacy_selectors=False, served=False):
    context = browser.new_context(viewport={'width': width, 'height': height}, java_script_enabled=javascript, reduced_motion=reduced, color_scheme=scheme, forced_colors=forced, has_touch=width <= 600)
    page = context.new_page()
    errors, policy_errors, failures, requests, health_requests = [], [], [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda msg: policy_errors.append(msg.text) if 'content security policy' in msg.text.lower() else None)
    page.on('request', lambda request: requests.append(request.url))
    page.on('requestfailed', lambda request: failures.append(request.url) if request.url != HEALTH else None)

    def serve_with_headers(route):
        public = (ROOT / 'public').resolve()
        path = unquote(urlparse(route.request.url).path)
        file = (public / path.lstrip('/')).resolve()
        assert file.is_relative_to(public), 'Asset path escaped public/'
        if file.is_dir():
            file = file / 'index.html'
        status = 200 if file.exists() else 404
        if status == 404:
            file = public / '404.html'
        content_type = {'.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2'}.get(file.suffix) or mimetypes.guess_type(file)[0] or 'application/octet-stream'
        body = file.read_bytes()
        if legacy_selectors and file.name == 'styles.css':
            body = body.replace(b'@supports selector(:has(*))', b'@supports (display: validore-no-has-support)')
        route.fulfill(status=status, body=body, headers={**pages_headers(path), 'content-type': content_type})

    def app_fixture(route):
        if route.request.is_navigation_request() and urlparse(route.request.url).path in ['/', '/demo']:
            route.fulfill(content_type='text/html', body='<main><h1>App navigation fixture</h1></main>')
            return
        assert route.request.url == HEALTH, 'Unexpected app API request: ' + route.request.url
        health_requests.append(route.request)
        step = (sequence or ['ready'])[min(len(health_requests) - 1, len(sequence or ['ready']) - 1)]
        if step == 'network-error':
            route.abort('failed')
        elif step == 'loading-html':
            route.fulfill(status=200, content_type='text/html', body='<h1>Starting your service</h1>', headers={'access-control-allow-origin': BASE})
        else:
            route.fulfill(status=200, content_type='application/json', body=json.dumps({'status': 'ok', 'service': 'validore'}), headers={'access-control-allow-origin': BASE})

    # Fail closed: a new third-party resource must never leave the test browser.
    page.route('**/*', lambda route: route.abort('blockedbyclient'))
    page.route(BASE + '/**', (lambda route: route.continue_()) if served else serve_with_headers)
    page.route(APP + '/**', app_fixture)
    if javascript:
        page.add_init_script("""
          window.__landingMetrics = {cls: 0, lcp: 0};
          const types = PerformanceObserver.supportedEntryTypes;
          if (types.includes('layout-shift')) new PerformanceObserver(list => list.getEntries().forEach(e => { if (!e.hadRecentInput) window.__landingMetrics.cls += e.value; })).observe({type: 'layout-shift', buffered: true});
          if (types.includes('largest-contentful-paint')) new PerformanceObserver(list => list.getEntries().forEach(e => { window.__landingMetrics.lcp = e.startTime; })).observe({type: 'largest-contentful-paint', buffered: true});
        """)
        if legacy_selectors:
            page.add_init_script("""
              const supports = CSS.supports.bind(CSS);
              CSS.supports = (...args) => args[0] === 'selector(:has(*))' ? false : supports(...args);
            """)
    return context, page, errors, policy_errors, failures, requests, health_requests


def save_image(page, filename, full=False):
    page.screenshot(path=str(REPORTS / filename), full_page=full, animations='disabled')
    RESULTS['screenshots'].append(filename)


def assert_brand(page, width):
    styles = page.evaluate("""async () => {
      await document.fonts.ready;
      await document.fonts.load('12px "Geist Mono"');
      const root = getComputedStyle(document.documentElement);
      const style = selector => getComputedStyle(document.querySelector(selector));
      const title = style('h1');
      const button = style('.hero .button-gold');
      return {
        tokens: Object.fromEntries(['navy', 'gold', 'gold-light', 'gold-dark', 'cream', 'ivory', 'workspace-ink', 'workspace-muted', 'workspace-paper', 'workspace-rule'].map(name => [name, root.getPropertyValue('--' + name).trim().toLowerCase()])),
        fonts: [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family.replace(/['"]/g, '')),
        family: style('body').fontFamily,
        title: {size: parseFloat(title.fontSize), weight: title.fontWeight, leading: parseFloat(title.lineHeight) / parseFloat(title.fontSize)},
        button: {background: button.backgroundColor, corners: button.borderRadius, minimum: button.minHeight},
        header: style('.site-header').backgroundColor,
        paper: style('.sample-window').backgroundColor,
        workspace: style('.canvas-preview').backgroundColor,
        closing: style('.launch-layout').backgroundColor,
        footer: style('.site-footer').backgroundColor,
        score: style('.score-filled').stroke,
        bar: style('.dimension-track span').backgroundColor,
        menuIcon: document.querySelector('.mobile-menu .menu-open-icon use').getAttribute('href'),
        documentIcon: document.querySelector('.sample-toolbar .icon use').getAttribute('href'),
        faqIcon: document.querySelector('.question-list summary .icon use').getAttribute('href'),
        footerLogo: document.querySelector('.footer-top .brand img').getAttribute('src'),
        loadedImages: [...document.images].filter(image => image.loading !== 'lazy').every(image => image.complete && image.naturalWidth > 0),
        logoWidth: document.querySelector('.site-header .brand img').getBoundingClientRect().width,
      };
    }""")
    assert styles['tokens'] == {
        'navy': '#0b0e13', 'gold': '#e0a526', 'gold-light': '#f0c04e', 'gold-dark': '#a86a0a',
        'cream': '#f4efe6', 'ivory': '#fafaf7', 'workspace-ink': '#141923',
        'workspace-muted': '#657081', 'workspace-paper': '#f7f8fa', 'workspace-rule': '#e5e7eb',
    }, styles
    assert {'Geist', 'Geist Mono'}.issubset(styles['fonts']), styles
    assert styles['family'].startswith('Geist,'), styles
    expected_size = min(60.8, max(42.4, width * .1)) if width <= 600 else min(72, max(52, width * .08)) if width <= 900 else min(73.6, max(49.6, width * .052))
    assert abs(styles['title']['size'] - expected_size) < .02 and styles['title']['weight'] == '430', styles
    assert abs(styles['title']['leading'] - 1.08) < .001, styles
    assert styles['button'] == {'background': 'rgb(224, 165, 38)', 'corners': '4px 11px', 'minimum': '48px'}, styles
    assert styles['header'] == styles['closing'] == 'rgb(11, 14, 19)', styles
    assert styles['paper'] == styles['footer'] == 'rgb(250, 250, 247)', styles
    assert styles['workspace'] == 'rgb(247, 248, 250)', styles
    assert styles['score'] == 'rgb(170, 135, 59)' and styles['bar'] == 'rgb(186, 161, 106)', styles
    assert styles['logoWidth'] == (144 if width <= 600 else 177), styles
    assert (styles['menuIcon'], styles['documentIcon'], styles['faqIcon']) == ('#icon-menu', '#icon-document', '#icon-plus'), styles
    assert styles['footerLogo'] == './assets/validore-logo-light.svg' and styles['loadedImages'], styles
    expect(page.get_by_role('navigation', name='Footer navigation').get_by_role('link', name='Cookies')).to_have_attribute('href', APP + '/legal/cookies')
    expect(page.get_by_role('navigation', name='Footer navigation').get_by_role('link', name='Refunds')).to_have_attribute('href', APP + '/legal/refund')
    expect(page.locator('meta[name="theme-color"]')).to_have_attribute('content', '#0B0E13')
    expect(page.locator('.ore-main')).to_have_attribute('href', './assets/validore-icon.svg')
    expect(page.locator('.footer-wordmark img')).to_have_attribute('src', './assets/validore-logo-light.svg')
    record(str(width) + 'px: app palette, Geist Sans/Mono, heading scale, button geometry, original SVG branding')


def audit(page, label):
    if not AXE_PATH:
        RESULTS['skipped'].append('Axe accessibility audit (' + label + '): axe-core not installed and AXE_SCRIPT_PATH unset')
        return
    page.evaluate(Path(AXE_PATH).read_text(encoding='utf-8'))
    violations = page.evaluate("""async () => (await axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']}})).violations.map(v => ({id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.map(n => ({target: n.target, summary: n.failureSummary}))}))""")
    RESULTS['accessibility'].append({'view': label, 'violations': violations})
    assert not violations, 'Accessibility violations in ' + label + ': ' + json.dumps(violations)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    RESULTS['browsers'].append({'name': 'chromium', 'version': browser.version})
    try:
        for name, width, height in [('desktop', 1440, 1000), ('wide-desktop', 1920, 1080), ('tablet', 768, 1024), ('laptop', 1024, 800), ('desktop-breakpoint', 901, 900), ('menu-breakpoint', 900, 900), ('mobile', 390, 844), ('small-mobile', 320, 740)]:
            ctx, page, errors, policy_errors, failures, requests, health_requests = setup_page(browser, width, height)
            page.goto(BASE + '/', wait_until='networkidle')
            expect(page.locator('body')).to_have_attribute('data-wake', 'ready')
            assert_brand(page, width)
            page.wait_for_timeout(1300)
            if page.evaluate('document.documentElement.scrollWidth > innerWidth'):
                save_image(page, name + '-overflow.png', True)
                overflowing = page.evaluate("""[...document.querySelectorAll('body *')].filter(e => {const r=e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1) && getComputedStyle(e).position !== 'fixed';}).map(e => ({tag:e.tagName, class:e.className.baseVal ?? e.className, width:e.getBoundingClientRect().width, right:e.getBoundingClientRect().right})).slice(0,20)""")
                raise AssertionError(name + ' has horizontal overflow: ' + json.dumps(overflowing))
            assert page.evaluate("Array.from(document.querySelectorAll('.orbit-label')).every(e => {const r=e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth;})"), name + ' has clipped sculpture labels'
            expect(page.get_by_role('heading', level=1)).to_have_text('Know it’s goldbefore you dig.')
            links = page.locator('a[href="https://validore.onrender.com"]').all()
            assert len(links) >= 3 and all(link.get_attribute('aria-disabled') != 'true' for link in links)
            assert page.locator('a[href="https://github.com/shashankv762/Validore"]').count() >= 2
            if width <= 900:
                page.get_by_label('Open navigation menu', exact=True).click()
                expect(page.get_by_role('navigation', name='Mobile navigation')).to_be_visible()
                page.keyboard.press('Escape')
                expect(page.locator('.mobile-menu')).not_to_have_attribute('open', '')
                expect(page.locator('.mobile-menu summary')).to_be_focused()
                page.get_by_label('Open navigation menu', exact=True).click()
                page.get_by_role('navigation', name='Mobile navigation').get_by_role('link', name='The report', exact=True).click()
                expect(page.locator('.mobile-menu')).not_to_have_attribute('open', '')
            page.locator('#market-label').click()
            expect(page.locator('#angle-market-panel')).to_be_visible()
            expect(page.locator('#angle-problem-panel')).to_be_hidden()
            page.locator('#angle-market').focus()
            page.keyboard.press('ArrowRight')
            expect(page.locator('#angle-customer')).to_be_checked()
            expect(page.locator('#angle-customer-panel')).to_be_visible()
            page.locator('#problem-label').click()
            expect(page.locator('#sample-overview')).to_be_visible()
            report_height = page.locator('.sample-window').bounding_box()['height']
            page.locator('#risks-label').click()
            expect(page.locator('#sample-risks')).to_be_visible()
            expect(page.locator('#sample-overview')).to_be_hidden()
            page.locator('#view-risks').focus()
            page.keyboard.press('ArrowRight')
            expect(page.locator('#view-experiment')).to_be_checked()
            expect(page.locator('#sample-experiment')).to_be_visible()
            page.keyboard.press('Tab')
            expect(page.locator('#sample-experiment')).to_be_focused()
            page.locator('#evidence-label').click()
            expect(page.locator('#sample-evidence')).to_be_visible()
            assert abs(page.locator('.sample-window').bounding_box()['height'] - report_height) < 2, name + ' report jumps when switching sections'
            page.locator('#overview-label').click()
            page.locator('.question-list summary').nth(3).click()
            expect(page.locator('.question-list details').nth(3)).to_have_attribute('open', '')
            page.locator('.question-list summary').nth(3).click()
            if name in ['desktop', 'mobile', 'small-mobile']:
                page.evaluate('scrollTo({top: 0, behavior: "instant"})')
                page.wait_for_timeout(200)
                save_image(page, name + '-hero.png')
                save_image(page, name + '-full.png', True)
                page.locator('#report').scroll_into_view_if_needed()
                page.wait_for_timeout(200)
                save_image(page, name + '-report.png')
                for label in ['overview', 'risks', 'experiment', 'evidence']:
                    page.locator('#' + label + '-label').click()
                    audit(page, name + '-report-' + label)
                page.locator('#overview-label').click()
                if name == 'mobile':
                    page.get_by_label('Open navigation menu', exact=True).click()
                    audit(page, 'mobile-navigation-open')
                    page.keyboard.press('Escape')
            assert not errors, errors
            assert not policy_errors, policy_errors
            assert not failures, failures
            assert all(urlparse(url).hostname in ['127.0.0.1', 'validore.onrender.com'] for url in requests), requests
            assert len(health_requests) == 1
            assert 'cookie' not in health_requests[0].headers
            record(name + ': layout, menu, research angles, stable report sections, native keyboard controls, FAQ, CSP, no tracking')
            if name == 'desktop':
                page.evaluate('scrollTo({top: 0, behavior: "instant"})')
                page.wait_for_timeout(200)
                pause = page.get_by_role('button', name='Pause motion')
                pause.click()
                expect(page.locator('.motion-control')).to_have_attribute('aria-pressed', 'true')
                assert page.locator('.ore-float').evaluate('(e) => getComputedStyle(e).animationPlayState') == 'paused'
                page.get_by_role('button', name='Play motion').click()
                assert page.locator('.ore-float').evaluate('(e) => getComputedStyle(e).animationPlayState') == 'running'
                page.locator('#launch').scroll_into_view_if_needed()
                page.wait_for_timeout(200)
                assert page.locator('.ore-float').evaluate('(e) => getComputedStyle(e).animationPlayState') == 'paused'
                ctx.set_offline(True)
                expect(page.locator('body')).to_have_attribute('data-wake', 'offline')
                ctx.set_offline(False)
                expect(page.locator('body')).to_have_attribute('data-wake', 'unconfirmed')
                assert len(health_requests) == 1
                RESULTS['metrics']['desktopLocalLab'] = page.evaluate('window.__landingMetrics')
                record('pause/play, offscreen suspension, and connectivity changes after readiness')
            ctx.close()

        ctx, page, errors, policy_errors, failures, requests, health_requests = setup_page(browser, reduced='reduce')
        page.goto(BASE, wait_until='networkidle')
        for width in [360, 375, 380, 381, 414, 600, 601, 1100, 1101, 1280]:
            page.set_viewport_size({'width': width, 'height': 900})
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), str(width) + 'px breakpoint has horizontal overflow'
            assert page.locator('.nav-row').evaluate('e => [...e.children].filter(n => getComputedStyle(n).display !== "none").every(n => {const r = n.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth})'), str(width) + 'px header has clipped controls'
        record('Ten additional widths: narrow headers and both sides of 380/600/1100px breakpoints')
        graphics = page.evaluate("""async () => {
          const palette = {ink: [11,14,19], gold: [224,165,38], light: [240,192,78], deep: [168,106,10], highlight: [248,222,149], oldNavy: [11,33,50]};
          const results = [];
          for (const filename of ['social.png', 'apple-touch-icon.png']) {
            const image = new Image();
            image.src = './assets/' + filename;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
            const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
            const counts = Object.fromEntries(Object.keys(palette).map(name => [name, 0]));
            for (let i = 0; i < pixels.length; i += 4) {
              for (const [name, rgb] of Object.entries(palette)) if (rgb.every((value, channel) => pixels[i + channel] === value)) counts[name]++;
            }
            results.push({filename, width: canvas.width, height: canvas.height, corner: [...pixels.slice(0,4)], counts});
          }
          return results;
        }""")
        for image in graphics:
            assert image['corner'] == [11, 14, 19, 255] and image['counts']['oldNavy'] == 0, image
            assert all(image['counts'][name] > 100 for name in ['ink', 'gold', 'light', 'deep', 'highlight']), image
        RESULTS['metrics']['brandGraphics'] = graphics
        record('Social and Apple artwork: exact app ink background and all four original ore facets')
        assert not errors and not policy_errors and not failures
        ctx.close()

        for scheme in ['light', 'dark']:
            ctx, page, errors, policy_errors, failures, requests, health_requests = setup_page(browser, scheme=scheme, reduced='reduce')
            page.goto(BASE, wait_until='networkidle')
            assert_brand(page, 1440)
            assert not errors and not policy_errors and not failures
            record('OS ' + scheme + ' mode: app ink, cream and paper surfaces remain consistent')
            ctx.close()

        ctx, page, errors, policy_errors, failures, requests, health_requests = setup_page(browser, width=390, height=844, forced='active', reduced='reduce')
        page.goto(BASE, wait_until='networkidle')
        expect(page.locator('.site-header .brand')).to_have_css('background-color', 'rgb(11, 14, 19)')
        expect(page.locator('.site-footer .brand')).to_have_css('background-color', 'rgb(250, 250, 247)')
        page.locator('#angle-problem').focus()
        page.keyboard.press('ArrowRight')
        expect(page.locator('#angle-market')).to_be_checked()
        expect(page.locator('#angle-market-panel')).to_be_visible()
        assert page.locator('#market-label span').evaluate('(e) => getComputedStyle(e).outlineStyle') == 'solid'
        page.locator('#view-overview').focus()
        page.keyboard.press('ArrowRight')
        expect(page.locator('#sample-risks')).to_be_visible()
        assert page.locator('#risks-label span').evaluate('(e) => getComputedStyle(e).borderBottomStyle') == 'solid'
        page.keyboard.press('Tab')
        expect(page.locator('#sample-risks')).to_be_focused()
        save_image(page, 'windows-high-contrast-report.png')
        assert not errors and not policy_errors and not failures
        record('Windows high-contrast: visible selection, keyboard focus and readable report panels')
        ctx.close()

        ctx, page, errors, policy_errors, failures, requests, health_requests = setup_page(browser, legacy_selectors=True)
        page.goto(BASE, wait_until='networkidle')
        page.locator('#market-label').click()
        expect(page.locator('#angle-market-panel')).to_be_visible()
        expect(page.locator('#angle-problem-panel')).to_be_hidden()
        expect(page.locator('#market-label span')).to_have_css('background-color', 'rgb(224, 165, 38)')
        page.locator('#risks-label').click()
        expect(page.locator('#sample-risks')).to_be_visible()
        expect(page.locator('#sample-overview')).to_be_hidden()
        page.locator('#view-risks').focus()
        page.keyboard.press('ArrowRight')
        expect(page.locator('#sample-experiment')).to_be_visible()
        expect(page.locator('#experiment-label span')).to_have_css('outline-style', 'solid')
        assert not errors and not policy_errors and not failures
        record('Without CSS :has(): fallback panels, selected labels and keyboard focus')
        ctx.close()

        ctx, page, errors, policy_errors, failures, requests, health_requests = setup_page(browser, reduced='reduce')
        page.goto(BASE, wait_until='networkidle')
        assert page.locator('.ore-float').evaluate('(e) => getComputedStyle(e).animationName') == 'none'
        assert page.evaluate('getComputedStyle(document.documentElement).scrollBehavior') == 'auto'
        expect(page.locator('.motion-control')).to_be_hidden()
        page.keyboard.press('Tab')
        expect(page.locator('.skip-link')).to_be_focused()
        page.keyboard.press('Enter')
        expect(page.locator('#main')).to_be_focused()
        record('system reduced motion and keyboard skip link')
        ctx.close()

        ctx, page, errors, policy_errors, failures, requests, health_requests = setup_page(browser, javascript=False, width=390, height=844)
        page.goto(BASE, wait_until='networkidle')
        page.locator('#risks-label').click()
        expect(page.locator('#sample-risks')).to_be_visible()
        page.locator('.question-list summary').first.click()
        expect(page.locator('.question-list details').first).to_have_attribute('open', '')
        expect(page.locator('#launch a.button')).to_have_attribute('href', APP)
        expect(page.locator('noscript')).to_be_visible()
        page.locator('#market-label').click()
        expect(page.locator('#angle-market-panel')).to_be_visible()
        page.locator('.mobile-menu summary').click()
        expect(page.get_by_role('navigation', name='Mobile navigation')).to_be_visible()
        assert not health_requests
        assert page.locator('.ore-float').evaluate('(e) => getComputedStyle(e).animationPlayState') == 'paused'
        record('without JavaScript: navigation, research angles, sample, FAQ, usable launch and static artwork')
        ctx.close()

        ctx = browser.new_context(viewport={'width': 390, 'height': 844})
        page = ctx.new_page()
        file_errors = []
        page.on('pageerror', lambda error: file_errors.append(str(error)))
        page.on('requestfailed', lambda request: file_errors.append(request.url))
        page.route('http://**/*', lambda route: route.abort('blockedbyclient'))
        page.route('https://**/*', lambda route: route.abort('blockedbyclient'))
        page.goto((ROOT / 'public/index.html').as_uri(), wait_until='networkidle')
        assert page.locator('h1').evaluate('(e) => getComputedStyle(e).fontSize') != '32px', 'File preview lost its stylesheet'
        assert page.locator('.brand img').first.evaluate('(e) => e.complete && e.naturalWidth > 0'), 'File preview lost its logo'
        assert page.evaluate("[...document.fonts].some(font => font.family === 'Geist' && font.status === 'loaded')"), 'File preview lost its font'
        page.get_by_label('Open navigation menu', exact=True).click()
        expect(page.get_by_role('navigation', name='Mobile navigation')).to_be_visible()
        page.keyboard.press('Escape')
        page.locator('#evidence-label').click()
        expect(page.locator('#sample-evidence')).to_be_visible()
        assert not file_errors, file_errors
        record('direct index.html preview: local styles, font, artwork, navigation and sample')
        ctx.close()

        ctx, page, errors, policy_errors, failures, requests, health_requests = setup_page(browser, width=640, height=900)
        page.goto(BASE, wait_until='networkidle')
        assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), '200% desktop equivalent overflows'
        audit(page, 'zoomed-desktop')
        page.goto(BASE + '/404.html', wait_until='networkidle')
        expect(page.get_by_role('heading', level=1)).to_have_text('This idea leadssomewhere else.')
        expect(page.get_by_role('link', name='Back to the website')).to_have_attribute('href', '/')
        page.goto(BASE + '/missing/deep/page', wait_until='networkidle')
        expect(page.get_by_role('heading', level=1)).to_have_text('This idea leadssomewhere else.')
        assert page.locator('.brand img').evaluate('(e) => e.complete && e.naturalWidth > 0')
        assert not errors and not policy_errors and not failures
        audit(page, 'branded-404')
        record('200% desktop equivalent and branded 404 recovery')
        ctx.close()

        ctx, page, errors, policy_errors, failures, requests, health_requests = setup_page(browser, reduced='reduce')
        page.goto(BASE, wait_until='networkidle')
        page.get_by_role('link', name='Explore a sample report', exact=True).click()
        expect(page).to_have_url(BASE + '/#report')
        page.locator('.sample-footer a').click()
        expect(page).to_have_url(APP + '/demo')
        expect(page.get_by_role('heading', name='App navigation fixture')).to_be_visible()
        page.goto(BASE, wait_until='networkidle')
        page.locator('#launch a.button').click()
        expect(page).to_have_url(APP + '/')
        expect(page.get_by_role('heading', name='App navigation fixture')).to_be_visible()
        record('Real anchor navigation: sample section, full demo and app launch (destinations intercepted)')
        ctx.close()

        ctx, page, errors, policy_errors, failures, requests, health_requests = setup_page(browser, sequence=['loading-html', 'network-error', 'ready'])
        page.clock.install()
        page.goto(BASE, wait_until='networkidle')
        expect(page.locator('body')).to_have_attribute('data-wake', 'waking')
        expect(page.locator('#launch a.button')).to_have_attribute('href', APP)
        page.clock.run_for(10_100)
        page.wait_for_timeout(50)
        expect(page.locator('body')).to_have_attribute('data-wake', 'waking')
        page.clock.run_for(10_100)
        expect(page.locator('body')).to_have_attribute('data-wake', 'ready')
        page.clock.run_for(100_000)
        assert len(health_requests) == 3
        assert not errors and not policy_errors
        record('browser cold start: HTML, network failure, genuine JSON success, then no more polling')
        ctx.close()

        ctx, page, errors, policy_errors, failures, requests, health_requests = setup_page(browser, sequence=['loading-html'])
        page.clock.install()
        page.goto(BASE, wait_until='networkidle')
        for _ in range(10):
            page.clock.run_for(10_000)
            page.wait_for_timeout(30)
        expect(page.locator('body')).to_have_attribute('data-wake', 'unconfirmed')
        count = len(health_requests)
        assert count <= 9
        page.clock.run_for(15 * 60_000)
        assert len(health_requests) == count
        expect(page.locator('#launch a.button')).to_have_attribute('href', APP)
        record('browser timeout: bounded checks, honest status, immediate launch remains available')
        ctx.close()

        for engine in [p.firefox, p.webkit]:
            if not Path(engine.executable_path).exists():
                RESULTS['skipped'].append(engine.name + ': Playwright browser is not installed')
                continue
            other_browser = engine.launch(headless=True)
            RESULTS['browsers'].append({'name': engine.name, 'version': other_browser.version})
            try:
                for width in [1440, 390]:
                    ctx, page, errors, policy_errors, failures, requests, health_requests = setup_page(other_browser, width=width, reduced='reduce')
                    page.goto(BASE, wait_until='networkidle')
                    assert_brand(page, width)
                    assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), engine.name + ' layout overflow'
                    page.locator('#evidence-label').click()
                    expect(page.locator('#sample-evidence')).to_be_visible()
                    page.locator('#angle-market').focus()
                    page.keyboard.press('ArrowRight')
                    expect(page.locator('#angle-customer-panel')).to_be_visible()
                    page.locator('.question-list summary').first.click()
                    expect(page.locator('.question-list details').first).to_have_attribute('open', '')
                    if width == 390:
                        page.get_by_label('Open navigation menu', exact=True).click()
                        expect(page.get_by_role('navigation', name='Mobile navigation')).to_be_visible()
                        page.keyboard.press('Escape')
                        expect(page.locator('.mobile-menu summary')).to_be_focused()
                    audit(page, engine.name + '-' + str(width))
                    assert not errors and not policy_errors and not failures, (errors, policy_errors, failures)
                    record(engine.name + ' ' + str(width) + 'px: app branding, report, radio keyboard controls, FAQ and navigation')
                    ctx.close()
            finally:
                other_browser.close()

        if ARGS.http:
            for width, height in [(1440, 1000), (390, 844)]:
                ctx, page, errors, policy_errors, failures, requests, health_requests = setup_page(browser, width=width, height=height, reduced='reduce', served=True)
                page.goto(BASE, wait_until='networkidle')
                assert_brand(page, width)
                if width == 390:
                    page.get_by_label('Open navigation menu', exact=True).click()
                    page.get_by_role('navigation', name='Mobile navigation').get_by_role('link', name='The report', exact=True).click()
                else:
                    page.get_by_role('link', name='Explore a sample report', exact=True).click()
                page.locator('#evidence-label').click()
                expect(page.locator('#sample-evidence')).to_be_visible()
                save_image(page, 'http-' + str(width) + '-report.png')
                assert not errors and not policy_errors and not failures, (errors, policy_errors, failures)
                record('Actual HTTP preview ' + str(width) + 'px: fonts, artwork, navigation and interactive evidence panel')
                ctx.close()
        RESULTS['status'] = 'passed'
    except Exception as error:
        RESULTS['status'] = 'failed'
        RESULTS['error'] = str(error)
        raise
    finally:
        browser.close()
        (REPORTS / 'results.json').write_text(json.dumps(RESULTS, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'status': RESULTS['status'], 'checks': len(RESULTS['checks']), 'accessibilityAudits': len(RESULTS['accessibility']), 'report': str(REPORTS / 'results.json')}))
