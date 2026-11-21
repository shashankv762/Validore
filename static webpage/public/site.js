const wakeMessages = {
  waking: ['Preparing your workspace…', 'The app may take about a minute to start. You can open it at any time.'],
  ready: ['The workspace is responding.', 'You’re ready to continue to Validore.'],
  unconfirmed: ['Open the app to continue.', 'We couldn’t confirm its current status. If it’s still starting, allow another moment.'],
  offline: ['You’re offline.', 'Reconnect to the internet, then open Validore.'],
};
let pageActive = true;
let wake;
function showWakeStatus(status) {
  document.body.dataset.wake = status;
  const [label, detail] = wakeMessages[status];
  document.querySelectorAll('[data-wake-label]').forEach(node => { node.textContent = label; });
  document.querySelectorAll('[data-wake-detail]').forEach(node => { node.textContent = detail; });
}

// A classic deferred script also works in a file preview. Only hosted pages
// import the network check, so opening index.html never causes module/CORS errors.
if (location.protocol === 'https:' || location.protocol === 'http:') {
  import('./wake.js').then(({ startWakeCheck }) => {
    wake = startWakeCheck({
      isVisible: () => pageActive && document.visibilityState === 'visible',
      isOnline: () => navigator.onLine,
      onStatus: showWakeStatus,
    });
  }).catch(() => showWakeStatus(navigator.onLine ? 'unconfirmed' : 'offline'));
}

const sculpture = document.querySelector('.idea-sculpture');
const motionButton = document.querySelector('.motion-control');
const motionLabel = document.querySelector('[data-motion-label]');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let userPaused = false;
let sculptureVisible = true;

function syncMotion() {
  const paused = userPaused || reducedMotion.matches;
  document.body.classList.toggle('motion-paused', paused);
  sculpture?.classList.toggle('sculpture-paused', !pageActive || !sculptureVisible || document.visibilityState !== 'visible');
  motionButton?.setAttribute('aria-pressed', String(paused));
  if (motionLabel) motionLabel.textContent = paused ? 'Play motion' : 'Pause motion';
}

if (sculpture && motionButton) {
  motionButton.hidden = false;
  motionButton.addEventListener('click', () => { userPaused = !userPaused; syncMotion(); });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      sculptureVisible = entries[0].isIntersecting;
      syncMotion();
    }, { rootMargin: '40px' });
    observer.observe(sculpture);
  }
}
reducedMotion.addEventListener('change', syncMotion);
syncMotion();
document.body.classList.add('motion-ready');

document.addEventListener('visibilitychange', () => { wake?.sync(); syncMotion(); });
window.addEventListener('offline', () => wake?.sync());
window.addEventListener('online', () => wake?.sync());
window.addEventListener('pagehide', () => { pageActive = false; wake?.sync(); syncMotion(); });
window.addEventListener('pageshow', () => { pageActive = true; wake?.sync(); syncMotion(); });

const menu = document.querySelector('.mobile-menu');
const menuSummary = menu?.querySelector('summary');
function closeMenu(restoreFocus = false) {
  if (!menu?.open) return;
  menu.open = false;
  if (restoreFocus) menuSummary?.focus();
}
menu?.addEventListener('toggle', () => {
  menuSummary?.setAttribute('aria-label', menu.open ? 'Close navigation menu' : 'Open navigation menu');
});
menu?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => closeMenu()));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu?.open) {
    event.preventDefault();
    closeMenu(true);
  }
});
document.addEventListener('click', event => {
  if (menu?.open && !menu.contains(event.target)) closeMenu();
});
matchMedia('(max-width: 900px)').addEventListener('change', event => {
  if (!event.matches) closeMenu();
});

// Older browsers keep all sample content readable without CSS :has(). With JS,
// give them the same native-radio selection behavior as modern browsers.
if (!CSS.supports('selector(:has(*))')) {
  for (const group of ['sample-view', 'research-angle']) {
    const inputs = [...document.querySelectorAll(`input[name="${group}"]`)];
    const selectPanel = () => inputs.forEach(input => {
      const panel = document.getElementById(input.getAttribute('aria-controls'));
      if (panel) panel.hidden = !input.checked;
    });
    inputs.forEach(input => input.addEventListener('change', selectPanel));
    selectPanel();
  }
}
document.querySelectorAll('[data-year]').forEach(node => { node.textContent = String(new Date().getFullYear()); });
