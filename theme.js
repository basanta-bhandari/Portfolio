(() => {
  const storageKey = 'portfolio-theme';

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const next = theme === 'dark' ? 'Light' : 'Dark';
      button.setAttribute('aria-label', `Switch to ${next.toLowerCase()} mode`);
      button.setAttribute('title', `Switch to ${next.toLowerCase()} mode`);
    });
  }

  let savedTheme;
  try { savedTheme = localStorage.getItem(storageKey); } catch { /* The switch still works when storage is blocked. */ }
  applyTheme(savedTheme === 'dark' ? 'dark' : 'light');

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(document.documentElement.dataset.theme || 'light');
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem(storageKey, next); } catch { /* Keep the current-page preference. */ }
        applyTheme(next);
      });
    });
  });
})();
