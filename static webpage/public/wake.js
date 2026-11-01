// A bounded, visitor-triggered liveness check. This never runs as a keep-alive.
// The response confirms only that the web process is serving, not DB/AI health.
export const HEALTH_URL = 'https://validore.onrender.com/api/health';
export const WAKE_WINDOW_MS = 90_000;
export const REQUEST_TIMEOUT_MS = 8_000;
export const RETRY_DELAY_MS = 10_000;
export const MAX_ATTEMPTS = 9;

/**
 * @param {{onStatus: (status: 'waking'|'ready'|'unconfirmed'|'offline') => void,
 *   isVisible?: () => boolean, isOnline?: () => boolean}} options
 */
export function startWakeCheck({ onStatus, isVisible = () => true, isOnline = () => true }) {
  const startedAt = Date.now();
  let attempts = 0;
  let settled = false;
  let disposed = false;
  let lastStatus;
  let retryTimer;
  let requestTimer;
  let request;

  const publish = status => {
    if (lastStatus !== status && !disposed) {
      lastStatus = status;
      onStatus(status);
    }
  };
  const clearRetry = () => {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  };
  const cancelRequest = () => {
    clearTimeout(requestTimer);
    request?.abort();
  };
  const finish = status => {
    settled = true;
    clearTimeout(deadlineTimer);
    clearRetry();
    cancelRequest();
    publish(status);
  };
  const deadlineTimer = setTimeout(() => finish(isOnline() ? 'unconfirmed' : 'offline'), WAKE_WINDOW_MS);

  async function probe() {
    if (disposed || settled || request || !isVisible() || !isOnline()) return;
    const remaining = WAKE_WINDOW_MS - (Date.now() - startedAt);
    if (remaining <= 0 || attempts >= MAX_ATTEMPTS) {
      finish('unconfirmed');
      return;
    }
    attempts += 1;
    const controller = new AbortController();
    request = controller;
    publish('waking');
    requestTimer = setTimeout(() => controller.abort(), Math.min(REQUEST_TIMEOUT_MS, remaining));
    try {
      // No cookies, custom headers, query data, API keys or authenticated calls.
      // CORS failures during Render's HTML startup response are expected.
      const response = await fetch(HEALTH_URL, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      });
      if (!response.ok || response.redirected || !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) return;
      const body = await response.json();
      if (!controller.signal.aborted && !disposed && !settled && isVisible() && isOnline()
        && body?.status === 'ok' && body?.service === 'validore') finish('ready');
    } catch {
      // Network failure, cold start, offline and blocked cross-origin responses
      // all remain unconfirmed; none should interrupt a real launch link.
    } finally {
      clearTimeout(requestTimer);
      request = undefined;
      if (!disposed && !settled && isVisible() && isOnline()) {
        const remaining = WAKE_WINDOW_MS - (Date.now() - startedAt);
        if (remaining <= 0 || attempts >= MAX_ATTEMPTS) finish('unconfirmed');
        else retryTimer = setTimeout(() => {
          retryTimer = undefined;
          void probe();
        }, Math.min(RETRY_DELAY_MS, remaining));
      }
    }
  }

  function sync() {
    if (disposed) return;
    if (settled) {
      // A page restored from the back/forward cache must not retain stale readiness.
      if (!isOnline()) publish('offline');
      else if (lastStatus === 'offline' || (lastStatus === 'ready' && Date.now() - startedAt >= WAKE_WINDOW_MS)) publish('unconfirmed');
      return;
    }
    if (Date.now() - startedAt >= WAKE_WINDOW_MS) {
      finish(isOnline() ? 'unconfirmed' : 'offline');
      return;
    }
    if (!isVisible() || !isOnline()) {
      clearRetry();
      cancelRequest();
      if (!isOnline()) publish('offline');
      return;
    }
    if (!request && !retryTimer) void probe();
  }

  sync();
  return {
    sync,
    dispose() {
      disposed = true;
      clearTimeout(deadlineTimer);
      clearRetry();
      cancelRequest();
    },
  };
}
