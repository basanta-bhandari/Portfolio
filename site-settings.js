(() => {
  const navigation=document.querySelector('.topnav .links');
  if(navigation&&!navigation.querySelector('a[href="/chat"]')){
    const chat=document.createElement('a');chat.href='/chat';chat.textContent='Chat';
    if(location.pathname.startsWith('/chat'))chat.setAttribute('aria-current','page');
    navigation.insertBefore(chat,navigation.querySelector('a[href="/blog"]'));
  }
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
