"""Render brand PNGs from the website's actual CSS, Geist font, and SVG artwork.

Developer-only: requires Python Playwright and its Chromium browser. All browser
requests are fulfilled from public/; no production app or external service is used.
The published website still has no dependencies or build step.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import unquote, urlparse
import argparse
import json
import mimetypes
import re
import struct

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / 'public'
ORIGIN = 'http://127.0.0.1:4174'

SOCIAL_STYLES = """
.social-artwork { width: 1200px; height: 630px; padding: 42px 56px 28px; display: flex; flex-direction: column; background: var(--navy); color: var(--cream); }
.social-brand { flex: none; }
.social-brand img { width: 177px; height: 38px; }
.social-layout { flex: 1; display: grid; grid-template-columns: 1.18fr 1fr; gap: 28px; align-items: center; min-height: 0; }
.social-copy { min-width: 0; }
.social-copy .hero-intro { margin-bottom: 24px; font-size: 14px; }
.social-copy h1 { font-size: 73.6px; font-weight: 430; line-height: 1.08; letter-spacing: -.055em; }
.social-description { font-size: 18px; line-height: 1.8; color: var(--muted); margin-top: 26px; }
.social-layout .idea-sculpture { width: 100%; max-width: none; margin: 0; animation: none; }
.social-layout figcaption, .social-layout .motion-control { display: none; }
.social-layout .ore-float, .social-layout .orbit-track { animation: none; }
.social-footer { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 24px; border-top: 1px solid var(--line-dark); padding-top: 17px; font-size: 13px; color: var(--muted); }
.social-footer > span:first-child { color: var(--gold-light); }
.icon-artwork { width: 180px; height: 180px; display: grid; place-items: center; background: var(--navy); }
.icon-artwork img { width: 144px; height: 144px; }
"""


def extract(pattern, html, label):
    match = re.search(pattern, html, flags=re.S)
    if not match:
        raise ValueError('Cannot find the website ' + label)
    return match.group(1)


def render_assets(output):
    html = (PUBLIC / 'index.html').read_text(encoding='utf-8')
    title = extract(r'<h1 id="hero-title">(.*?)</h1>', html, 'headline')
    intro = extract(r'<p class="hero-intro">(.*?)</p>', html, 'introduction')
    sculpture = extract(r'(<figure class="idea-sculpture".*?</figure>)', html, 'original ore artwork')
    social = f'''<main class="social-artwork">
      <div class="social-brand"><img src="./assets/validore-logo-dark.svg" width="177" height="38" alt="Validore"></div>
      <div class="social-layout"><div class="social-copy"><p class="hero-intro">{intro}</p><h1>{title}</h1>
        <p class="social-description">Research your market. Challenge your assumptions.<br>Find your next move.</p></div>{sculpture}</div>
      <p class="social-footer"><span>validore.tech</span><span>Free to start. No payment card needed.</span></p>
    </main>'''
    icon = '<main class="icon-artwork"><img src="./assets/validore-icon.svg" width="144" height="144" alt="Validore"></main>'
    documents = {'/social-preview.html': social, '/icon-preview.html': icon}
    requests, errors = [], []
    results = []
    with TemporaryDirectory(prefix='validore-brand-assets-') as temporary, sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            context = browser.new_context(java_script_enabled=False, reduced_motion='reduce', color_scheme='dark', device_scale_factor=1)
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('requestfailed', lambda request: errors.append(request.url))

            def serve(route):
                url = urlparse(route.request.url)
                if url.scheme + '://' + url.netloc != ORIGIN:
                    errors.append('Unexpected external request: ' + route.request.url)
                    route.abort()
                    return
                requests.append(url.path)
                if url.path in documents:
                    body = '<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="./styles.css"><link rel="stylesheet" href="./brand-preview.css"><title>Validore brand artwork</title></head><body>' + documents[url.path] + '</body></html>'
                    route.fulfill(content_type='text/html', body=body)
                elif url.path == '/brand-preview.css':
                    route.fulfill(content_type='text/css', body=SOCIAL_STYLES)
                else:
                    file = (PUBLIC / unquote(url.path).lstrip('/')).resolve()
                    if not file.is_relative_to(PUBLIC.resolve()) or not file.is_file():
                        errors.append('Missing or invalid local asset: ' + url.path)
                        route.abort()
                        return
                    content_type = {'.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml'}.get(file.suffix) or mimetypes.guess_type(file)[0] or 'application/octet-stream'
                    route.fulfill(content_type=content_type, body=file.read_bytes())

            page.route('**/*', serve)
            for route, filename, width, height in [
                ('/social-preview.html', 'social.png', 1200, 630),
                ('/icon-preview.html', 'apple-touch-icon.png', 180, 180),
            ]:
                page.set_viewport_size({'width': width, 'height': height})
                page.goto(ORIGIN + route, wait_until='networkidle')
                page.evaluate('document.fonts.ready')
                assert page.locator('main').evaluate('(e) => getComputedStyle(e).backgroundColor') == 'rgb(11, 14, 19)', 'Artwork background must match app ink'
                assert page.evaluate('[...document.images].every(image => image.complete && image.naturalWidth > 0)'), 'A brand image did not load'
                assert not page.evaluate('document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight'), 'Brand artwork overflows its frame'
                if filename == 'social.png':
                    assert page.evaluate('[...document.fonts].some(font => font.family === "Geist" && font.status === "loaded")'), 'Social preview must use the self-hosted Geist font'
                    assert '/assets/validore-icon.svg' in requests, 'Social preview must use the original ore mark'
                    assert page.locator('h1').evaluate('(e) => getComputedStyle(e).fontWeight') == '430', 'Social typography differs from the app'
                assert not errors, errors
                destination = Path(temporary) / filename
                page.screenshot(path=str(destination))
                data = destination.read_bytes()
                assert data[:8] == b'\x89PNG\r\n\x1a\n' and struct.unpack('>II', data[16:24]) == (width, height)
                results.append({'file': filename, 'width': width, 'height': height, 'bytes': len(data)})
            # Only replace the published assets after both renders have passed.
            output.mkdir(parents=True, exist_ok=True)
            for result in results:
                (output / result['file']).write_bytes((Path(temporary) / result['file']).read_bytes())
        finally:
            browser.close()
    print(json.dumps({'status': 'passed', 'output': str(output), 'assets': results, 'externalRequests': 0}, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=PUBLIC / 'assets', help='Destination for the two generated PNGs')
    render_assets(parser.parse_args().output.resolve())
