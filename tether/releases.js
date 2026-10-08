const status = document.getElementById('release-status');
const cards = [...document.querySelectorAll('[data-asset]')];

function highlightPlatform() {
  const platform = navigator.userAgentData?.platform || navigator.platform || '';
  const isMac = /mac/i.test(platform);
  const isWindows = /win/i.test(platform);
  const isLinux = /linux/i.test(platform);
  const match = cards.find(card => isMac
    ? card.dataset.asset === 'neonet-macos-arm64.zip'
    : isWindows ? card.dataset.asset === 'neonet-windows-x86_64.zip'
      : isLinux && card.dataset.asset === 'neonet-linux-x86_64.AppImage');
  match?.classList.add('suggested');
}

async function loadRelease() {
  try {
    const response = await fetch('/tether/downloads/latest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Release manifest returned ${response.status}`);
    const release = await response.json();
    if (!/^\d+\.\d+\.\d+$/.test(release.version)) throw new Error('Invalid version');
    const platforms = [
      ['linux_x86_64', 'neonet-linux-x86_64.AppImage', 'AppImage'],
      ['windows_x86_64', 'neonet-windows-x86_64.zip', 'ZIP'],
      ['macos_arm64', 'neonet-macos-arm64.zip', 'ZIP']
    ];
    let available = 0;
    for (const [key, filename, format] of platforms) {
      const asset = release[key];
      if (!asset || !Number.isSafeInteger(asset.size) || asset.size <= 0 ||
          !/^[a-f0-9]{64}$/i.test(asset.sha256)) continue;
      const card = cards.find(item => item.dataset.asset === filename);
      if (!card) continue;
      const link = card.querySelector('.download-link');
      link.href = `/tether/downloads/${filename.replace('.', `-v${release.version}.`)}`;
      link.textContent = `Download ${format} · ${(asset.size / 1048576).toFixed(1)} MB ↗`;
      link.classList.remove('unavailable');
      link.removeAttribute('aria-disabled');
      link.setAttribute('download', '');
      available++;
    }
    status.textContent = `v${release.version} · ${available} build${available === 1 ? '' : 's'} available`;
  } catch {
    status.textContent = 'Linux v0.5.2 available · other platform builds pending.';
  }
}

highlightPlatform();
loadRelease();
