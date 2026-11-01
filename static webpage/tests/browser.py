"""Browser acceptance for the standalone landing site. Start the documented
localhost:4174 preview first. Requests to the real app are always intercepted.
Optional axe audit: set AXE_SCRIPT_PATH to a local copy of axe.min.js.
"""
from pathlib import Path
import json
import os
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
REPORTS = REPO / 'reports' / 'static-website'
REPORTS.mkdir(parents=True, exist_ok=True)
BASE = 'http://127.0.0.1:4174'
HEALTH = 'https://validore.onrender.com/api/health'
APP = 'https://validore.onrender.com'
CONFIG = json.loads((ROOT / 'vercel.json').read_text(encoding='utf-8'))
HEADERS = {item['key'].lower(): item['value'] for item in CONFIG['headers'][0]['headers']}
AXE_PATH = os.environ.get('AXE_SCRIPT_PATH')
RESULTS = {'status': 'running', 'checks': [], 'screenshots': [], 'accessibility': [], 'metrics': {}}


def record(name):
    RESULTS['checks'].append(name)


def setup_page(browser, width=1440, height=1000, javascript=True, reduced='no-preference', sequence=None):
    context = browser.new_context(viewport={'width': width, 'height': height}, java_script_enabled=javascript, reduced_motion=reduced)
    page = context.new_page()
    errors, policy_errors, failures, requests, health_requests = [], [], [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda msg: policy_errors.append(msg.text) if 'content security policy' in msg.text.lower() else None)
    page.on('request', lambda request: requests.append(request.url))
    page.on('requestfailed', lambda request: failures.append(request.url) if request.url != HEALTH else None)

    def serve_with_headers(route):
        response = route.fetch()
        route.fulfill(response=response, headers={**response.headers, **HEADERS})

    def app_fixture(route):
        assert route.request.url == HEALTH, 'Unexpected app API request: ' + route.request.url
        health_requests.append(route.request)
        step = (sequence or ['ready'])[min(len(health_requests) - 1, len(sequence or ['ready']) - 1)]
        if step == 'network-error':
            route.abort('failed')
        elif step == 'loading-html':
            route.fulfill(status=200, content_type='text/html', body='<h1>Starting your service</h1>', headers={'access-control-allow-origin': BASE})
        else:
            route.fulfill(status=200, content_type='application/json', body=json.dumps({'status': 'ok', 'service': 'validore'}), headers={'access-control-allow-origin': BASE})

    page.route(BASE + '/**', serve_with_headers)
    page.route(APP + '/**', app_fixture)
    if javascript:
        page.add_init_script("""
          window.__landingMetrics = {cls: 0, lcp: 0};
          new PerformanceObserver(list => list.getEntries().forEach(e => { if (!e.hadRecentInput) window.__landingMetrics.cls += e.value; })).observe({type: 'layout-shift', buffered: true});
          new PerformanceObserver(list => list.getEntries().forEach(e => { window.__landingMetrics.lcp = e.startTime; })).observe({type: 'largest-contentful-paint', buffered: true});
        """)
    return context, page, errors, policy_errors, failures, requests, health_requests


def save_image(page, filename, full=False):
    page.screenshot(path=str(REPORTS / filename), full_page=full)
    RESULTS['screenshots'].append(filename)


def audit(page, label):
    if not AXE_PATH:
        return
    page.evaluate(Path(AXE_PATH).read_text(encoding='utf-8'))
    violations = page.evaluate("""async () => (await axe.run(document, {runOnly: {type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']}})).violations.map(v => ({id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.map(n => ({target: n.target, summary: n.failureSummary}))}))""")
    RESULTS['accessibility'].append({'view': label, 'violations': violations})
    assert not violations, 'Accessibility violations in ' + label + ': ' + json.dumps(violations)


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        for name, width, height in [('desktop', 1440, 1000), ('tablet', 768, 1024), ('laptop', 1024, 800), ('mobile', 390, 844), ('small-mobile', 320, 740)]:
            ctx, page, errors, policy_errors, failures, requests, health_requests = setup_page(browser, width, height)
            page.goto(BASE + '/', wait_until='networkidle')
            expect(page.locator('body')).to_have_attribute('data-wake', 'ready')
            page.wait_for_timeout(1300)
            assert not page.evaluate('document.documentElement.scrollWidth > innerWidth'), name + ' has horizontal overflow'
            assert page.evaluate("Array.from(document.querySelectorAll('.orbit-label')).every(e => {const r=e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth;})"), name + ' has clipped sculpture labels'
            expect(page.get_by_role('heading', level=1)).to_have_text('Know it’s goldbefore you dig.')
            links = page.locator('a[href="https://validore.onrender.com"]').all()
            assert len(links) >= 3 and all(link.get_attribute('aria-disabled') != 'true' for link in links)
            assert page.locator('a[href="https://github.com/shashankv762/Validore"]').count() >= 2
            expect(page.locator('#sample-overview')).to_be_visible()
            page.locator('#risks-label').click()
            expect(page.locator('#sample-risks')).to_be_visible()
            expect(page.locator('#sample-overview')).to_be_hidden()
            page.locator('#view-risks').focus()
            page.keyboard.press('ArrowRight')
            expect(page.locator('#view-experiment')).to_be_checked()
            expect(page.locator('#sample-experiment')).to_be_visible()
            page.locator('#overview-label').click()
            page.locator('.question-list summary').nth(3).click()
            expect(page.locator('.question-list details').nth(3)).to_have_attribute('open', '')
            page.locator('.question-list summary').nth(3).click()
            if name in ['desktop', 'mobile']:
                page.evaluate('scrollTo({top: 0, behavior: "instant"})')
                page.wait_for_timeout(200)
                save_image(page, name + '-hero.png')
                save_image(page, name + '-full.png', True)
                page.locator('#report').scroll_into_view_if_needed()
                page.wait_for_timeout(200)
                save_image(page, name + '-report.png')
                audit(page, name)
            assert not errors, errors
            assert not policy_errors, policy_errors
            assert not failures, failures
            assert all(urlparse(url).hostname in ['127.0.0.1', 'validore.onrender.com'] for url in requests), requests
            assert len(health_requests) == 1
            assert 'cookie' not in health_requests[0].headers
            record(name + ': layout, live links, report selection, native keyboard controls, FAQ, CSP, no tracking')
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
        assert not health_requests
        assert page.locator('.ore-float').evaluate('(e) => getComputedStyle(e).animationPlayState') == 'paused'
        record('without JavaScript: readable page, interactive sample/FAQ, usable launch and static artwork')
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
        RESULTS['status'] = 'passed'
    except Exception as error:
        RESULTS['status'] = 'failed'
        RESULTS['error'] = str(error)
        raise
    finally:
        browser.close()
        (REPORTS / 'results.json').write_text(json.dumps(RESULTS, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'status': RESULTS['status'], 'checks': len(RESULTS['checks']), 'accessibilityAudits': len(RESULTS['accessibility']), 'report': str(REPORTS / 'results.json')}))
