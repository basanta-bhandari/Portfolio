const repo = 'basanta-bhandari/Tether';
const status = document.getElementById('release-status');
const cards = [...document.querySelectorAll('[data-asset]')];

function highlightPlatform() {
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const isMac = /mac/i.test(platform);
  const isWindows = /win/i.test(platform);
  const isLinux = /linux/i.test(platform);
  const intelMac = isMac && /intel/i.test(navigator.userAgent);
  const match = cards.find(card => isMac
    ? !intelMac && card.dataset.asset === 'neonet-macos-arm64.zip'
    : isWindows ? card.dataset.asset === 'neonet-windows-x86_64.zip'
      : isLinux && card.dataset.asset === 'neonet-linux-x86_64.AppImage');
  match?.classList.add('suggested');
}

async function loadRelease() {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases?per_page=10`, {
      headers: { Accept: 'application/vnd.github+json' }
    });
    if (!response.ok) throw new Error(`Release API returned ${response.status}`);
    const releases = await response.json();
    const release = Array.isArray(releases) ? releases.find(item => !item.draft && Array.isArray(item.assets)) : null;
    if (!release) throw new Error('No published release');
    if (!Array.isArray(release.assets)) throw new Error('Invalid release data');
    const assets = new Map(release.assets.map(asset => [asset.name, asset]));
    let available = 1; // The Linux package is also hosted directly on this site.
    for (const card of cards) {
      const asset = assets.get(card.dataset.asset);
      if (!asset || !/^https:\/\/github\.com\/basanta-bhandari\/Tether\/releases\/download\//.test(asset.browser_download_url)) continue;
      const link = card.querySelector('.download-link');
      link.href = asset.browser_download_url;
      link.textContent = `Download · ${(asset.size / 1048576).toFixed(1)} MB ↗`;
      link.classList.remove('unavailable');
      link.removeAttribute('aria-disabled');
      link.setAttribute('download', '');
      if (card.dataset.asset !== 'neonet-linux-x86_64.AppImage') available++;
    }
    const checksum = assets.get('SHA256SUMS.txt');
    if (checksum && assets.has('neonet-linux-x86_64.AppImage')) {
      const link = document.getElementById('checksum-link');
      link.href = checksum.browser_download_url;
      link.textContent = 'release checksums';
    }
    if (available) {
      const source = document.getElementById('source-link');
      source.href = release.html_url;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      source.textContent = 'Source & release notes ↗';
    }
    status.textContent = `${release.tag_name} · ${available} build${available === 1 ? '' : 's'} available`;
  } catch {
    status.textContent = 'Linux v0.5.1 available · other platform builds pending.';
  }
}

highlightPlatform();
loadRelease();
