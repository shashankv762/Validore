import { startWakeCheck } from './wake.js';

const wakeMessages = {
  waking: ['Preparing your workspace…', 'The app may take about a minute to start. You can open it at any time.'],
  ready: ['The workspace is responding.', 'You’re ready to continue to Validore.'],
  unconfirmed: ['Open the app to continue.', 'We couldn’t confirm its current status. If it’s still starting, allow another moment.'],
  offline: ['You’re offline.', 'Reconnect to the internet, then open Validore.'],
};
let pageActive = true;
const wake = startWakeCheck({
  isVisible: () => pageActive && document.visibilityState === 'visible',
  isOnline: () => navigator.onLine,
  onStatus(status) {
    document.body.dataset.wake = status;
    const [label, detail] = wakeMessages[status];
    document.querySelectorAll('[data-wake-label]').forEach(node => { node.textContent = label; });
    document.querySelectorAll('[data-wake-detail]').forEach(node => { node.textContent = detail; });
  },
});

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

document.addEventListener('visibilitychange', () => { wake.sync(); syncMotion(); });
window.addEventListener('offline', () => wake.sync());
window.addEventListener('online', () => wake.sync());
window.addEventListener('pagehide', () => { pageActive = false; wake.sync(); syncMotion(); });
window.addEventListener('pageshow', () => { pageActive = true; wake.sync(); syncMotion(); });
document.querySelectorAll('[data-year]').forEach(node => { node.textContent = String(new Date().getFullYear()); });
