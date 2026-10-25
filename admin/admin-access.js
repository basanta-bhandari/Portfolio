(() => {
  const permissionLabels = {
    blog: 'Blog posts',
    projects: 'Projects',
    tether: 'Tether / NeoNet downloads'
  };
  const platformBuilds = [
    ['linux_x86_64', 'Linux x86-64', 'neonet-linux-x86_64', 'AppImage'],
    ['windows_x86_64', 'Windows x86-64', 'neonet-windows-x86_64', 'zip'],
    ['macos_arm64', 'macOS Apple Silicon', 'neonet-macos-arm64', 'zip']
  ];

  let session = null;
  let admins = [];
  let editingAdminId = null;
  let presenceTimer = null;
  let chatTimer = null;
  let chatLoading = false;
  let renderedMessageIds = '';
  let chatMessages = [];
  const DEFAULT_TETHER_BRIDGE_PORT = 7331;
  const sessionStore = {
    getItem(key) { try { return window.sessionStorage.getItem(key); } catch { return null; } },
    setItem(key, value) { try { window.sessionStorage.setItem(key, value); } catch { /* The current connection still works. */ } },
    removeItem(key) { try { window.sessionStorage.removeItem(key); } catch { /* Nothing persisted. */ } }
  };
  const launchFragment = new URLSearchParams(window.location.hash.slice(1));
  const launchToken = launchFragment.get('tether-token') || '';
  const launchPort = Number.parseInt(launchFragment.get('tether-port') || '', 10);
  const storedPort = Number.parseInt(sessionStore.getItem('tetherBridgePort') || '', 10);
  const validPort = port => Number.isInteger(port) && port >= 1024 && port <= 65535;
  let bridgePort = validPort(launchPort)
    ? launchPort
    : (validPort(storedPort) ? storedPort : DEFAULT_TETHER_BRIDGE_PORT);
  let bridgeToken = launchToken || sessionStore.getItem('tetherBridgeToken') || '';
  let bridgeAutoEnable = Boolean(launchToken);
  let bridgeStatus = null;
  if (launchToken) {
    sessionStore.setItem('tetherBridgeToken', launchToken);
    sessionStore.setItem('tetherBridgePort', String(bridgePort));
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function setMessage(element, text, ok = false) {
    element.textContent = text;
    element.style.color = ok ? '#27ae60' : '#c0392b';
  }

  async function apiJson(url, options = {}) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      credentials: 'include',
      ...options,
      headers: options.body
        ? { 'Content-Type': 'application/json', ...(options.headers || {}) }
        : options.headers
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  function selectedPermissions() {
    return [...document.querySelectorAll('input[name="adminPermission"]:checked')]
      .map(input => input.value);
  }

  function syncRoleControls() {
    const isSuper = document.getElementById('adminRole').value === 'super';
    const fieldset = document.getElementById('adminPermissions');
    fieldset.disabled = isSuper;
    fieldset.style.opacity = isSuper ? '.45' : '1';
  }

  function resetAdminForm() {
    editingAdminId = null;
    const form = document.getElementById('adminUserForm');
    form.reset();
    document.getElementById('adminPassword').required = true;
    document.getElementById('adminPasswordHint').textContent = '(minimum 10 characters)';
    document.getElementById('adminUserFormHeading').textContent = 'Create admin account';
    document.getElementById('adminUserSubmit').textContent = 'Create account';
    document.getElementById('cancelAdminEdit').hidden = true;
    document.getElementById('adminUserMsg').textContent = '';
    syncRoleControls();
  }

  function editAdmin(admin) {
    editingAdminId = admin.id;
    document.getElementById('adminUsername').value = admin.username;
    document.getElementById('adminPassword').value = '';
    document.getElementById('adminPassword').required = false;
    document.getElementById('adminPasswordHint').textContent = '(leave blank to keep it)';
    document.getElementById('adminRole').value = admin.role;
    document.querySelectorAll('input[name="adminPermission"]').forEach(input => {
      input.checked = admin.permissions.includes(input.value);
    });
    document.getElementById('adminUserFormHeading').textContent = 'Edit admin account';
    document.getElementById('adminUserSubmit').textContent = 'Save account';
    document.getElementById('cancelAdminEdit').hidden = false;
    document.getElementById('adminUserMsg').textContent = '';
    syncRoleControls();
    document.getElementById('adminUserForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function updateAdminState(admin, active) {
    await apiJson('/api/admin-users/' + admin.id, {
      method: 'PUT',
      body: JSON.stringify({
        username: admin.username,
        role: admin.role,
        permissions: admin.permissions,
        active
      })
    });
    await loadAdmins();
  }

  function renderAdmins() {
    const list = document.getElementById('adminUsersList');
    list.replaceChildren();
    admins.forEach(admin => {
      const row = document.createElement('div');
      row.className = 'post-row';

      const label = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = admin.username;
      const role = document.createElement('span');
      role.className = 'status-pill' + (admin.active ? '' : ' inactive');
      role.textContent = admin.active ? (admin.role === 'super' ? 'super admin' : 'normal admin') : 'disabled';
      label.append(name, role);
      const detail = document.createElement('small');
      detail.style.cssText = 'display:block;color:var(--muted);margin-top:5px;';
      detail.textContent = admin.role === 'super'
        ? 'All features'
        : admin.permissions.map(permission => permissionLabels[permission]).filter(Boolean).join(', ');
      label.appendChild(detail);

      const actions = document.createElement('div');
      actions.className = 'post-actions';
      const edit = document.createElement('button');
      edit.className = 'edit-btn';
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.addEventListener('click', () => editAdmin(admin));

      const toggle = document.createElement('button');
      toggle.className = 'edit-btn';
      toggle.type = 'button';
      toggle.textContent = admin.active ? 'Disable' : 'Enable';
      toggle.disabled = admin.id === session.id;
      toggle.addEventListener('click', () => updateAdminState(admin, !admin.active).catch(error => alert(error.message)));

      const remove = document.createElement('button');
      remove.className = 'delete-btn';
      remove.type = 'button';
      remove.textContent = 'Delete';
      remove.disabled = admin.id === session.id;
      remove.addEventListener('click', async () => {
        if (!confirm('Delete admin account "' + admin.username + '"?')) return;
        try {
          await apiJson('/api/admin-users/' + admin.id, { method: 'DELETE' });
          await loadAdmins();
        } catch (error) {
          alert(error.message);
        }
      });
      actions.append(edit, toggle, remove);
      row.append(label, actions);
      list.appendChild(row);
    });
  }

  async function loadAdmins() {
    try {
      admins = await apiJson('/api/admin-users');
      renderAdmins();
    } catch (error) {
      setMessage(document.getElementById('adminUserMsg'), error.message);
    }
  }

  async function loadPublicTetherSettings() {
    try {
      const settings = await apiJson('/api/tether-settings');
      document.getElementById('tetherPageEnabled').checked = settings.pageEnabled !== false;
      document.getElementById('tetherNavEnabled').checked = settings.navEnabled !== false;
      document.getElementById('tetherDownloadsEnabled').checked = settings.downloadsEnabled !== false;
      document.getElementById('tetherSettingsControls').hidden = false;
    } catch (error) {
      setMessage(document.getElementById('tetherSettingsMsg'), error.message);
    }
  }

  async function savePublicTetherSettings() {
    const message = document.getElementById('tetherSettingsMsg');
    try {
      await apiJson('/api/tether-settings', {
        method: 'PUT',
        body: JSON.stringify({
          pageEnabled: document.getElementById('tetherPageEnabled').checked,
          navEnabled: document.getElementById('tetherNavEnabled').checked,
          downloadsEnabled: document.getElementById('tetherDownloadsEnabled').checked
        })
      });
      setMessage(message, 'Tether settings saved.', true);
    } catch (error) {
      setMessage(message, error.message);
    }
  }

  async function loadTetherRelease() {
    const list = document.getElementById('tetherReleaseList');
    try {
      const response = await fetch('/tether/downloads/latest.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('Release manifest is unavailable');
      const release = await response.json();
      list.replaceChildren();

      const heading = document.createElement('p');
      const strong = document.createElement('strong');
      strong.textContent = 'Current release: v' + release.version;
      heading.appendChild(strong);
      list.appendChild(heading);

      let available = 0;
      for (const [key, label, filename, extension] of platformBuilds) {
        const asset = release[key];
        if (!asset?.size) continue;
        available++;
        const row = document.createElement('div');
        row.className = 'post-row';
        const description = document.createElement('span');
        description.textContent = label + ' - ' + (asset.size / 1048576).toFixed(1) + ' MB';
        const links = document.createElement('div');
        links.className = 'release-links';
        const download = document.createElement('a');
        download.href = '/tether/downloads/' + filename + '-v' + release.version + '.' + extension;
        download.download = '';
        download.textContent = 'Download';
        links.appendChild(download);
        row.append(description, links);
        list.appendChild(row);
      }
      if (!available) {
        const empty = document.createElement('p');
        empty.style.color = 'var(--muted)';
        empty.textContent = 'No downloadable builds are listed in the current manifest.';
        list.appendChild(empty);
      }
    } catch (error) {
      list.replaceChildren();
      const message = document.createElement('p');
      message.style.color = '#c0392b';
      message.textContent = error.message;
      list.appendChild(message);
    }
  }

  function renderPresence(adminList) {
    const list = document.getElementById('presenceList');
    list.replaceChildren();
    adminList.forEach(admin => {
      const person = document.createElement('div');
      person.className = 'presence-person' + (admin.online ? ' online' : '');
      const dot = document.createElement('span');
      dot.className = 'presence-dot';
      dot.setAttribute('aria-hidden', 'true');
      const details = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = admin.username + (admin.id === session.id ? ' (you)' : '');
      const status = document.createElement('small');
      status.textContent = admin.online
        ? 'Online now'
        : admin.lastSeen
          ? 'Offline, last seen ' + new Date(admin.lastSeen).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
          : 'Offline';
      details.append(name, status);
      person.append(dot, details);
      list.appendChild(person);
    });
  }

  async function refreshPresence(showError = false) {
    if (document.visibilityState === 'hidden') return;
    try {
      const data = await apiJson('/api/session', { method: 'POST' });
      renderPresence(data.admins || []);
    } catch (error) {
      if (showError) setMessage(document.getElementById('chatMsg'), error.message);
    }
  }

  async function bridgeJson(path, options = {}) {
    if (!bridgeToken) throw new Error('Enter the token shown by the local Tether bridge');
    const request = {
      mode: 'cors',
      cache: 'no-store',
      targetAddressSpace: 'loopback',
      ...options,
      headers: {
        'X-Tether-Bridge-Token': bridgeToken,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    };
    const response = await fetch(`http://127.0.0.1:${bridgePort}${path}`, request);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Local Tether bridge request failed');
    return data;
  }

  function showBridgeSetup(message = '') {
    bridgeStatus = null;
    document.getElementById('chatBridgeSetup').hidden = false;
    document.getElementById('chatBridgeConnected').hidden = true;
    if (message) setMessage(document.getElementById('chatBridgeMsg'), message);
  }

  function showBridgeConnected(status) {
    bridgeStatus = status;
    document.getElementById('chatBridgeSetup').hidden = true;
    document.getElementById('chatBridgeConnected').hidden = false;
    const running = status.background?.running;
    const version = status.tetherVersion ? 'Tether ' + status.tetherVersion : 'Tether';
    document.getElementById('chatBridgeStatus').textContent =
      version + (running ? ' node online' : ' connected locally');
    checkBridgeRelease(status.tetherVersion);

    const select = document.getElementById('chatDevice');
    const previous = select.value || window.localStorage.getItem('tetherChatDevice') || '';
    select.replaceChildren(new Option('Choose a paired device', ''));
    for (const device of status.devices || []) {
      const option = new Option(device.alias + ' (' + device.fingerprint.slice(0, 10) + ')', device.fingerprint);
      select.appendChild(option);
    }
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
    if (!select.value && status.devices?.length === 1) select.value = status.devices[0].fingerprint;
    if (select.value) {
      window.localStorage.setItem('tetherChatDevice', select.value);
      loadChat(true);
    } else {
      chatMessages = [];
      renderedMessageIds = '';
      renderChat();
    }
  }

  async function checkBridgeRelease(currentVersion) {
    if (!currentVersion) return;
    try {
      const response = await fetch('/tether/downloads/latest.json', { cache: 'no-store' });
      if (!response.ok) return;
      const release = await response.json();
      if (release.version && release.version !== currentVersion) {
        document.getElementById('chatBridgeStatus').textContent +=
          ' · update v' + release.version + ' available on the Tether tab';
      }
    } catch {
      // Messaging must continue even if the static release manifest is unavailable.
    }
  }

  async function connectBridge(enableNode = false) {
    const status = enableNode
      ? await bridgeJson('/v1/enable', { method: 'POST', body: '{}' })
      : await bridgeJson('/v1/status');
    if (!status.tetherVersion && enableNode) {
      const refreshed = await bridgeJson('/v1/status');
      showBridgeConnected(refreshed);
    } else {
      showBridgeConnected(status);
    }
  }

  function renderChat() {
    const log = document.getElementById('chatLog');
    const query = document.getElementById('chatSearch').value.trim().toLocaleLowerCase();
    const messages = query
      ? chatMessages.filter(message =>
          message.username.toLocaleLowerCase().includes(query) ||
          message.message.toLocaleLowerCase().includes(query))
      : chatMessages;
    const messageIds = query + ':' + messages.map(message => message.id).join(',');
    if (messageIds === renderedMessageIds) return;
    const keepAtBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 70;
    renderedMessageIds = messageIds;
    log.replaceChildren();
    if (!messages.length) {
      const empty = document.createElement('p');
      empty.className = 'chat-empty';
      empty.textContent = query
        ? 'No messages match that search.'
        : document.getElementById('chatDevice').value
          ? 'No messages in the last 24 hours. Say hello.'
          : 'Choose a paired Tether device.';
      log.appendChild(empty);
      return;
    }
    messages.forEach(message => {
      const item = document.createElement('article');
      item.className = 'chat-message' + (message.direction === 'outgoing' ? ' own' : '');
      const head = document.createElement('div');
      head.className = 'chat-message-head';
      const author = document.createElement('strong');
      author.textContent = message.username;
      const time = document.createElement('time');
      const sentAt = new Date(Number(message.createdAt) * 1000);
      time.dateTime = sentAt.toISOString();
      time.textContent = sentAt.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      const body = document.createElement('p');
      body.textContent = message.message;
      head.append(author, time);
      item.append(head, body);
      log.appendChild(item);
    });
    if (keepAtBottom) log.scrollTop = log.scrollHeight;
  }

  async function loadChat(showError = false) {
    const device = document.getElementById('chatDevice').value;
    if (!bridgeStatus || !device || chatLoading || document.visibilityState === 'hidden') return;
    chatLoading = true;
    try {
      const data = await bridgeJson('/v1/messages?device=' + encodeURIComponent(device));
      chatMessages = data.messages || [];
      renderChat();
      document.getElementById('chatMsg').textContent = '';
    } catch (error) {
      if (showError) setMessage(document.getElementById('chatMsg'), error.message);
    } finally {
      chatLoading = false;
    }
  }

  function stopChatPolling() {
    if (chatTimer) window.clearInterval(chatTimer);
    chatTimer = null;
  }

  function startChatPolling() {
    stopChatPolling();
    refreshPresence(true);
    if (bridgeToken) {
      connectBridge(bridgeAutoEnable)
        .then(() => { bridgeAutoEnable = false; })
        .catch(error => showBridgeSetup(error.message));
    } else {
      showBridgeSetup();
    }
    chatTimer = window.setInterval(() => loadChat(false), 6000);
  }

  function startPresenceHeartbeat() {
    if (presenceTimer) window.clearInterval(presenceTimer);
    refreshPresence(true);
    presenceTimer = window.setInterval(() => refreshPresence(false), 25000);
  }

  window.onAdminPanelSelected = name => {
    if (name === 'chat') startChatPolling();
    else stopChatPolling();
  };

  document.getElementById('adminRole').addEventListener('change', syncRoleControls);
  document.getElementById('cancelAdminEdit').addEventListener('click', resetAdminForm);
  document.getElementById('saveTetherSettings').addEventListener('click', savePublicTetherSettings);
  document.getElementById('chatBridgeConnect').addEventListener('click', async () => {
    const message = document.getElementById('chatBridgeMsg');
    message.textContent = '';
    bridgeToken = document.getElementById('chatBridgeToken').value.trim();
    if (!bridgeToken) {
      setMessage(message, 'Enter the bridge token shown in the terminal.');
      return;
    }
    try {
      await connectBridge(true);
      sessionStore.setItem('tetherBridgeToken', bridgeToken);
    } catch (error) {
      setMessage(message, error.message + ' Make sure the bridge is running and allow local network access if your browser asks.');
    }
  });
  document.getElementById('chatBridgeDisconnect').addEventListener('click', () => {
    bridgeToken = '';
    bridgePort = DEFAULT_TETHER_BRIDGE_PORT;
    bridgeStatus = null;
    chatMessages = [];
    sessionStore.removeItem('tetherBridgeToken');
    sessionStore.removeItem('tetherBridgePort');
    document.getElementById('chatBridgeToken').value = '';
    showBridgeSetup();
  });
  document.getElementById('chatDevice').addEventListener('change', event => {
    chatMessages = [];
    renderedMessageIds = '';
    if (event.target.value) window.localStorage.setItem('tetherChatDevice', event.target.value);
    loadChat(true);
  });
  document.getElementById('chatForm').addEventListener('submit', async event => {
    event.preventDefault();
    const input = document.getElementById('chatInput');
    const button = document.getElementById('chatSendBtn');
    const message = input.value.trim();
    if (!message) return;
    const device = document.getElementById('chatDevice').value;
    if (!device) {
      setMessage(document.getElementById('chatMsg'), 'Choose a paired Tether device first.');
      return;
    }
    button.disabled = true;
    try {
      await bridgeJson('/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ device, username: session.username, message })
      });
      input.value = '';
      renderedMessageIds = '';
      await loadChat(true);
    } catch (error) {
      setMessage(document.getElementById('chatMsg'), error.message);
    } finally {
      button.disabled = false;
      input.focus();
    }
  });
  document.getElementById('chatInput').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      document.getElementById('chatForm').requestSubmit();
    }
  });
  document.getElementById('chatSearch').addEventListener('input', () => {
    renderedMessageIds = '';
    renderChat();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    refreshPresence(false);
    if (document.getElementById('chatTab').getAttribute('aria-selected') === 'true') loadChat(false);
  });

  document.getElementById('adminUserForm').addEventListener('submit', async event => {
    event.preventDefault();
    const message = document.getElementById('adminUserMsg');
    message.textContent = '';
    const payload = {
      username: document.getElementById('adminUsername').value.trim(),
      password: document.getElementById('adminPassword').value,
      role: document.getElementById('adminRole').value,
      permissions: selectedPermissions()
    };
    try {
      const wasEditing = Boolean(editingAdminId);
      if (wasEditing) {
        const existing = admins.find(admin => admin.id === editingAdminId);
        payload.active = existing?.active !== false;
        await apiJson('/api/admin-users/' + editingAdminId, {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
      } else {
        await apiJson('/api/admin-users', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
      resetAdminForm();
      setMessage(message, wasEditing ? 'Account updated.' : 'Account created.', true);
      await loadAdmins();
    } catch (error) {
      setMessage(message, error.message);
    }
  });

  document.getElementById('passwordForm').addEventListener('submit', async event => {
    event.preventDefault();
    const message = document.getElementById('passwordMsg');
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmation = document.getElementById('confirmPassword').value;
    if (newPassword !== confirmation) {
      setMessage(message, 'The new passwords do not match.');
      return;
    }
    try {
      await apiJson('/api/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      event.target.reset();
      setMessage(message, 'Password changed. Sign in again with the new password.', true);
      window.setTimeout(() => window.location.replace('/login/'), 900);
    } catch (error) {
      setMessage(message, error.message);
    }
  });

  window.configureAdminAccess = async data => {
    session = data;
    document.getElementById('accountLabel').textContent =
      data.username + ' / ' + (data.role === 'super' ? 'super admin' : 'normal admin');

    const allowed = data.role === 'super'
      ? ['blog', 'projects', 'tether', 'chat', 'users']
      : [...new Set([...data.permissions, 'chat'])];
    document.querySelectorAll('.admin-tabs [data-panel]').forEach(tab => {
      tab.hidden = !allowed.includes(tab.dataset.panel);
    });
    document.querySelectorAll('.admin-panel').forEach(panel => {
      const name = panel.id.replace(/Panel$/, '');
      panel.hidden = !allowed.includes(name);
    });

    const firstPanel = bridgeAutoEnable && allowed.includes('chat')
      ? 'chat'
      : ['blog', 'projects', 'tether', 'chat', 'users'].find(name => allowed.includes(name));
    if (!firstPanel) throw new Error('This account has no enabled admin features');
    window.selectAdminPanel(firstPanel);

    const tasks = [];
    if (allowed.includes('tether')) tasks.push(loadTetherRelease());
    if (data.role === 'super') {
      tasks.push(loadAdmins());
      tasks.push(loadPublicTetherSettings());
    }
    await Promise.all(tasks);
    startPresenceHeartbeat();
  };

  syncRoleControls();
})();
