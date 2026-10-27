(() => {
  document.querySelectorAll('.topnav .links a[href="/chat"], .topnav .links a[href="/chat/"]').forEach(link => {
    link.hidden = true;
    link.setAttribute('aria-hidden', 'true');
  });
  const tetherLinks = [...document.querySelectorAll('.topnav .links a[href="/tether"], .topnav .links a[href="/tether/"]')];
  if (!tetherLinks.length) return;

  fetch('/api/tether-settings', { cache: 'no-store' })
    .then(response => response.ok ? response.json() : null)
    .then(settings => {
      if (settings?.navEnabled === false) {
        tetherLinks.forEach(link => {
          link.hidden = true;
          link.setAttribute('aria-hidden', 'true');
        });
      }
    })
    .catch(() => {});
})();
