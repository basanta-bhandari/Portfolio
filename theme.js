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

  const savedTheme = localStorage.getItem(storageKey);
  applyTheme(savedTheme === 'dark' ? 'dark' : 'light');

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(document.documentElement.dataset.theme || 'light');
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem(storageKey, next);
        applyTheme(next);
      });
    });
  });
})();
