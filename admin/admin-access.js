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

  function setMessage(element, text, ok = false) {
    element.textContent = text;
    element.style.color = ok ? '#27ae60' : '#c0392b';
  }

  async function apiJson(url, options = {}) {
    const response = await fetch(url, {
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

  document.getElementById('adminRole').addEventListener('change', syncRoleControls);
  document.getElementById('cancelAdminEdit').addEventListener('click', resetAdminForm);

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
      ? ['blog', 'projects', 'tether', 'users']
      : data.permissions;
    document.querySelectorAll('.admin-tabs [data-panel]').forEach(tab => {
      tab.hidden = !allowed.includes(tab.dataset.panel);
    });
    document.querySelectorAll('.admin-panel').forEach(panel => {
      const name = panel.id.replace(/Panel$/, '');
      panel.hidden = !allowed.includes(name);
    });

    const firstPanel = ['blog', 'projects', 'tether', 'users'].find(name => allowed.includes(name));
    if (!firstPanel) throw new Error('This account has no enabled admin features');
    window.selectAdminPanel(firstPanel);

    const tasks = [];
    if (allowed.includes('tether')) tasks.push(loadTetherRelease());
    if (data.role === 'super') tasks.push(loadAdmins());
    await Promise.all(tasks);
  };

  syncRoleControls();
})();
