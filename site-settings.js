(() => {
  const tetherLinks = [...document.querySelectorAll('.topnav .links a[href="/tether"], .topnav .links a[href="/tether/"]')];
  if (!tetherLinks.length) return;

  // The setting rarely changes, so remember it for this tab instead of calling the
  // database-backed settings function on every page view.
  const CACHE_KEY = 'portfolio.tether-nav.v1';
  const FRESH_MS = 10 * 60 * 1000;
  const apply = enabled => tetherLinks.forEach(link => {
    link.hidden = !enabled;
    if (enabled) link.removeAttribute('aria-hidden');
    else link.setAttribute('aria-hidden', 'true');
  });

  let cached = null;
  try { cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) || 'null'); } catch { /* Storage is optional. */ }
  if (cached && typeof cached.enabled === 'boolean') apply(cached.enabled);
  if (cached && Date.now() - cached.at >= 0 && Date.now() - cached.at < FRESH_MS) return;

  fetch('/api/tether-settings', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(settings => {
      if (!settings) return;
      const enabled = settings.navEnabled !== false;
      apply(enabled);
      try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ enabled, at: Date.now() })); } catch { /* Storage is optional. */ }
    })
    .catch(() => {});
})();
