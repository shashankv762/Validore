/** A separate document keeps the ad SDK out of the workspace bundle and
 * destroys its scripts, timers and player when the user closes the frame. */
export function rewardedPlayerDocument(apiKey: string, sessionId: string, nonce: string) {
  const context = JSON.stringify({ apiKey, sessionId }).replaceAll('<', '\\u003c')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Watch a rewarded ad</title><style>body{margin:0;font:14px system-ui;background:#fff;color:#141923}#ad-status{padding:16px}#validore-ad-player{width:100%;min-height:320px}</style></head>
<body><p id="ad-status" role="status">Loading your ad…</p><div id="validore-ad-player"></div>
<script nonce="${nonce}">
(() => {
  const context = ${context};
  let settled = false;
  let loadTimer;
  const finish = (event) => {
    if (settled) return;
    settled = true;
    clearTimeout(loadTimer);
    document.getElementById('ad-status').textContent = event === 'complete' ? 'Ad complete. Checking your reward…' : 'No completed ad. You can close this window.';
    window.parent.postMessage({ type: 'validore:rewarded-ad', sessionId: context.sessionId, event }, window.location.origin);
  };
  const script = document.createElement('script');
  script.src = 'https://cdn.applixir.com/applixir.app.v6.1.0.js';
  script.nonce = '${nonce}';
  script.async = true;
  script.onerror = () => finish('unavailable');
  script.onload = () => {
    if (settled) return;
    if (typeof window.initializeAndOpenPlayer !== 'function') return finish('unavailable');
    try {
      Promise.resolve(window.initializeAndOpenPlayer({
        apiKey: context.apiKey, userId: context.sessionId, injectionElementId: 'validore-ad-player',
        adStatusCallbackFn: (status) => {
          if (status?.type === 'started') { clearTimeout(loadTimer); document.getElementById('ad-status').textContent = 'Finish the ad to earn 10 credits.'; }
          if (status?.type === 'complete') finish('complete');
          else if (['skipped', 'manuallyEnded', 'consentDeclined'].includes(status?.type)) finish('closed');
          else if (status?.type === 'allAdsCompleted') finish('unavailable');
        },
        adErrorCallbackFn: () => finish('unavailable')
      })).catch(() => finish('unavailable'));
    } catch { finish('unavailable'); }
  };
  loadTimer = setTimeout(() => finish('unavailable'), 45000);
  document.head.appendChild(script);
})();
</script></body></html>`
}

export function rewardedPlayerPolicy(nonce: string) {
  // Programmatic video assets and demand frames have variable HTTPS origins.
  // This policy applies only to the authenticated, short-lived player document.
  return ["default-src 'none'", `script-src 'nonce-${nonce}' 'strict-dynamic'`, "style-src 'unsafe-inline' https:",
    'img-src https: data: blob:', 'connect-src https:', 'media-src https: blob:', 'frame-src https:',
    'font-src https: data:', "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'self'"].join('; ')
}
