(() => {
  const $ = id => document.getElementById(id);
  const output = $('terminalOutput');
  const input = $('commandInput');
  const scroll = $('terminalScroll');
  const monitor = $('monitor');
  function syncTheme() { monitor.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'; }
  syncTheme();
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  const base = 'https://api.github.com/repos/basanta-bhandari/Portfolio';
  const commands = ['help', 'stats', 'github', 'vercel', 'languages', 'whoami', 'ls', 'cat', 'clear', 'refresh'];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const history = [];
  let historyIndex = 0;
  let powered = true;
  let pending = null;
  let snapshot = null;
  const ttl = 5 * 60 * 1000;
  const storageKey = 'portfolio-terminal-stats-v1';

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function print(text, parent = output, className = '') {
    const node = element('p', text, `terminal-output ${className}`);
    parent.append(node);
    return node;
  }
  function link(parent, text, url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return;
      const node = element('a', text);
      node.href = parsed.href;
      node.target = '_blank';
      node.rel = 'noopener noreferrer';
      parent.append(node);
    } catch { /* Missing upstream links do not prevent text output. */ }
  }
  function date(value) {
    const parsed = new Date(value);
    return value && Number.isFinite(parsed.getTime()) ? parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'Unavailable';
  }
  function number(value) { return Number.isFinite(value) ? value.toLocaleString() : 'Unavailable'; }
  function section(parent, title) {
    const node = element('section', undefined, 'readout');
    node.append(element('h2', title, 'stats-heading'));
    parent.append(node);
    return node;
  }
  function rows(parent, values) {
    const list = element('dl');
    for (const [label, value] of values) list.append(element('dt', label), element('dd', value));
    parent.append(list);
  }

  async function get(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`${base}${path}`, {
        headers: { Accept: 'application/vnd.github+json' }, signal: controller.signal
      });
      if (!response.ok) {
        if (response.status === 403 || response.status === 429) throw new Error('GitHub request limit reached. Try again later.');
        throw new Error(`GitHub returned ${response.status}. Try refresh later.`);
      }
      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('Connection timed out. Try refresh.');
      throw error;
    } finally { clearTimeout(timer); }
  }
  function connection(data) {
    const failed = Object.keys(data.errors).length;
    $('connectionStatus').textContent = failed === 3 ? 'DATA UNAVAILABLE' : failed ? 'PARTIAL DATA' : 'PUBLIC DATA / CONNECTED';
  }
  async function load(force = false) {
    if (pending) return pending;
    if (!force && snapshot && Date.now() - snapshot.at < ttl) return snapshot;
    if (!force && !snapshot) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(storageKey));
        if (stored && typeof stored.at === 'number' && stored.errors && Date.now() - stored.at < ttl) {
          snapshot = stored;
          connection(stored);
          return stored;
        }
      } catch { /* Storage may be disabled. Live data remains available. */ }
    }
    if (force && snapshot && Date.now() - snapshot.at < 30000) return snapshot;
    $('connectionStatus').textContent = 'CONNECTING';
    pending = (async () => {
      const [repo, languages, deployment] = await Promise.allSettled([
        get(''), get('/languages'),
        get('/commits?per_page=1').then(async commits => {
          const commit = commits[0];
          if (!commit || !/^[a-f0-9]{40}$/i.test(commit.sha)) throw new Error('No commit data available.');
          const checks = await get(`/commits/${commit.sha}/status`);
          return { commit, status: (checks.statuses || []).find(item => /vercel/i.test(item.context)) || null };
        })
      ]);
      const data = { at: Date.now(), errors: {} };
      for (const [name, result] of [['repo', repo], ['languages', languages], ['deployment', deployment]]) {
        if (result.status === 'fulfilled') data[name] = result.value;
        else data.errors[name] = result.reason?.message || 'Connection unavailable.';
      }
      snapshot = data;
      connection(data);
      if (!Object.keys(data.errors).length) {
        try { sessionStorage.setItem(storageKey, JSON.stringify(data)); } catch { /* Optional cache. */ }
      }
      return data;
    })().finally(() => { pending = null; });
    return pending;
  }

  function github(parent, data) {
    const node = section(parent, '01 / GITHUB');
    if (!data.repo) return print(data.errors.repo, node, 'terminal-error');
    const repo = data.repo;
    rows(node, [['Stars', number(repo.stargazers_count)], ['Forks', number(repo.forks_count)], ['Issues + PRs', number(repo.open_issues_count)], ['Watchers', number(repo.subscribers_count)], ['Branch', repo.default_branch], ['Last push', date(repo.pushed_at)]]);
    link(node, 'Open repository', repo.html_url);
  }
  function vercel(parent, data) {
    const node = section(parent, '02 / VERCEL');
    if (!data.deployment) return print(data.errors.deployment, node, 'terminal-error');
    const { commit, status } = data.deployment;
    rows(node, [['Latest check', status ? String(status.state).toUpperCase() : 'NO CHECK'], ['Commit', commit.sha.slice(0, 8)], ['Check updated', status ? date(status.updated_at) : 'Unavailable']]);
    print(status?.description || 'No Vercel check is attached to this commit yet.', node, 'terminal-muted');
    if (status?.target_url) link(node, 'View deployment', status.target_url);
    print('Source: Vercel checks on GitHub. Traffic and usage are not included.', node, 'terminal-muted');
  }
  function languages(parent, data) {
    const node = section(parent, '03 / SOURCE LANGUAGES');
    if (!data.languages) return print(data.errors.languages, node, 'terminal-error');
    const entries = Object.entries(data.languages).filter(([, bytes]) => Number.isFinite(bytes) && bytes > 0).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
    if (!total) return print('No language breakdown available.', node);
    for (const [name, bytes] of entries) {
      const percent = bytes / total * 100;
      const row = element('div', undefined, 'language-row');
      const track = element('div', undefined, 'language-track');
      track.setAttribute('aria-hidden', 'true');
      const fill = element('div', undefined, 'language-fill');
      fill.style.width = `${percent}%`;
      track.append(fill);
      row.append(element('span', name), track, element('b', `${percent.toFixed(1)}%`));
      node.append(row);
    }
  }
  function boot() {
    const heading = element('div', undefined, 'boot');
    heading.append(element('p', 'BASANTA / STATS', 'boot-title'), element('p', 'PERSONAL SYSTEM 86 // PUBLIC ACCESS', 'boot-subtitle'));
    output.append(heading);
    print("Type 'help' to get started.", output, 'terminal-muted');
  }
  function syncCursor() {
    $('cursorPrefix').textContent = input.value.slice(0, input.selectionStart ?? input.value.length);
    $('cursorPrefix').parentElement.style.transform = `translateX(${-input.scrollLeft}px)`;
  }
  async function reveal(result, block) {
    // Reveal actual text rows; data is fetched first, never invented for the animation.
    result.querySelectorAll('p').forEach(paragraph => {
      const lines = paragraph.textContent.split('\n');
      paragraph.replaceChildren(...lines.map(line => element('span', line || ' ', 'reveal-line')));
    });
    const groups = [];
    result.querySelectorAll('.reveal-line, h2, dt, a, .language-row').forEach(node => {
      groups.push(node.tagName === 'DT' ? [node, node.nextElementSibling] : [node]);
    });
    if (!reducedMotion.matches) groups.flat().forEach(node => { node.style.display = 'none'; });
    block.append(result);
    for (const group of groups) {
      if (!block.isConnected) return;
      const follow = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 65;
      group.forEach(node => { node.style.display = ''; });
      if (follow) scroll.scrollTop = scroll.scrollHeight;
      if (!reducedMotion.matches) await new Promise(resolve => setTimeout(resolve, 55));
    }
  }
  async function run(raw, { initial = false } = {}) {
    if (!powered) setPower(true);
    const command = raw.trim().toLowerCase();
    if (!command) return;
    if (!initial) {
      history.push(raw.trim());
      if (history.length > 50) history.shift();
      historyIndex = history.length;
    }
    input.value = '';
    syncCursor();
    if (command === 'clear') { output.replaceChildren(); input.focus({ preventScroll: true }); return; }
    const block = element('div');
    output.append(block);
    print(`guest@basanta:~$ ${raw.trim()}`, block, 'command-echo');
    scroll.scrollTop = scroll.scrollHeight;
    const result = element('div');
    const aliases = { 'cat github': 'github', 'cat github.txt': 'github', 'cat vercel': 'vercel', 'cat vercel.txt': 'vercel', 'cat languages': 'languages', 'cat languages.txt': 'languages', 'stats --live': 'refresh' };
    const selected = aliases[command] || command;
    if (selected === 'help') {
      print('AVAILABLE COMMANDS\n\nhelp\n  Show all commands and examples. Example: help\nstats\n  GitHub + Vercel overview. Example: stats\ngithub\n  Repository numbers and last push. Example: github\nvercel\n  Latest Vercel check on GitHub. Example: vercel\nlanguages\n  Source code breakdown. Example: languages\nwhoami\n  About this public terminal. Example: whoami\nls\n  List the available data files. Example: ls\ncat <file>\n  Read a data file. Example: cat github.txt\nrefresh\n  Fetch fresh data (30-second cooldown). Example: refresh\nclear\n  Clear terminal output. Example: clear\n\nAliases: cat github, cat vercel, cat languages.\nstats --live is an alias for refresh.\nUp / Down: history. Tab: autocomplete.\nCommands are case-insensitive. Press Enter to run.\nNo commands change your computer or the site.', result);
    } else if (selected === 'ls' || selected === 'cat') {
      print('AVAILABLE DATA FILES\n\ngithub.txt     Repository statistics\nvercel.txt     Latest deployment check\nlanguages.txt  Source language breakdown\n\nRead a file with: cat github.txt', result);
    } else if (selected === 'whoami') {
      print('You are a guest at Basanta\'s workstation.\nThis terminal reads public data for basanta-bhandari/Portfolio.\nUse stats to see the repository and its latest Vercel check.', result);
    } else if (['stats', 'github', 'vercel', 'languages', 'refresh'].includes(selected)) {
      const loading = print('[|] Reading public data...', block, 'loading-output');
      loading.setAttribute('role', 'status');
      let frame = 0;
      const frames = ['|', '/', '—', '\\'];
      const timer = reducedMotion.matches ? null : setInterval(() => { loading.textContent = `[${frames[++frame % frames.length]}] Reading public data...`; }, 140);
      let data;
      try { data = await load(selected === 'refresh'); }
      finally { clearInterval(timer); loading.remove(); }
      if (!block.isConnected) return;
      if (selected === 'stats' || selected === 'refresh') {
        const columns = element('div', undefined, 'stat-columns');
        result.append(columns);
        github(columns, data); vercel(columns, data);
        languages(result, data);
      } else if (selected === 'github') github(result, data);
      else if (selected === 'vercel') vercel(result, data);
      else languages(result, data);
      print(`Snapshot: ${date(data.at)}. Refresh available every 30 seconds.`, result, 'terminal-muted');
    } else {
      print(`Unknown command: ${raw.trim()}\nType help to see available commands.`, result, 'terminal-error');
    }
    await reveal(result, block);
    while (output.children.length > 35) output.firstElementChild.remove();
    if (initial) scroll.scrollTop = 0;
  }
  function setPower(value) {
    powered = value;
    $('monitor').classList.toggle('power-off', !powered);
    $('screen').inert = !powered;
    $('powerToggle').setAttribute('aria-pressed', String(powered));
    $('powerToggle').setAttribute('aria-label', powered ? 'Turn monitor off' : 'Turn monitor on');
  }
  $('powerToggle').addEventListener('click', () => setPower(!powered));
  $('glowToggle').addEventListener('click', event => {
    const disabled = $('monitor').classList.toggle('no-glow');
    event.currentTarget.setAttribute('aria-pressed', String(!disabled));
  });
  $('commandForm').addEventListener('submit', event => { event.preventDefault(); run(input.value); });
  document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => run(button.dataset.command)));
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      historyIndex = Math.max(0, Math.min(history.length, historyIndex + (event.key === 'ArrowUp' ? -1 : 1)));
      input.value = history[historyIndex] || '';
    } else if (event.key === 'Tab' && input.value) {
      const matches = commands.filter(command => command.startsWith(input.value.toLowerCase()));
      if (matches.length === 1) { event.preventDefault(); input.value = matches[0]; }
    }
    requestAnimationFrame(syncCursor);
  });
  ['input', 'click', 'keyup', 'select', 'scroll'].forEach(name => input.addEventListener(name, syncCursor));
  function clock() { $('terminalClock').textContent = new Date().toLocaleTimeString([], { hour12: false }); }
  clock(); setInterval(clock, 1000);
  boot(); syncCursor();
})();
