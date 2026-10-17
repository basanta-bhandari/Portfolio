const $ = id => document.getElementById(id);
const defaults = {
  xp: 0, cups: 0, roomTheme: 'real', mood: 'morning', offline: false,
  avatar: { color: '#688b83', accessory: 'none' },
  tasks: [
    { name: 'Ship one small project improvement', xp: 30, done: false, moves: 0 },
    { name: 'Practice a coding problem', xp: 20, done: false, moves: 0 },
    { name: 'Finish an assignment focus block', xp: 25, done: false, moves: 0 }
  ],
  events: [], feed: [], notes: '',
  achievements: [
    { name: 'First quest', description: 'Complete one quest', unlocked: null, autoKey: 'firstQuest' },
    { name: 'Coffee logged', description: 'Log a coffee', unlocked: null, autoKey: 'coffee' },
    { name: 'Level two', description: 'Earn 100 XP', unlocked: null, autoKey: 'levelTwo' }
  ],
  calendarProvider: null,
  mailProvider: null
};
let stored = {};
try { stored = JSON.parse(localStorage.getItem('roomquest-v1')) || {}; } catch (_) {}
let state = { ...defaults, ...stored };
state.tasks = Array.isArray(stored.tasks) ? stored.tasks : defaults.tasks;
state.events = Array.isArray(stored.events) ? stored.events : [];
state.feed = (Array.isArray(stored.feed) ? stored.feed : defaults.feed).filter(item => item !== 'Your refreshed room is ready. Start with one small quest.' && !item.startsWith('Quick problem solved.'));
state.achievements = (Array.isArray(stored.achievements) ? stored.achievements : defaults.achievements).filter(item => item.autoKey !== 'quickProblem');
state.avatar = { ...defaults.avatar, ...(stored.avatar || {}) };
delete state.math;
let calendarCursor = new Date();
calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth(), 1);

function save() {
  state._revision = Number(state._revision || 0) + 1;
  state._savedAt = new Date().toISOString();
  localStorage.setItem('roomquest-v1', JSON.stringify(state));
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function notify(message) {
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => $('toast').classList.add('hidden'), 3000);
}
function addActivity(message) {
  state.feed.unshift(message);
  state.feed = state.feed.slice(0, 6);
  save();
  render();
}

function showPage(id) {
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('hidden', page.id !== id));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.page === id));
  $('sidebar').classList.remove('open');
  if (id === 'daily') renderDailyHistory($('history-date').value);
  if (id === 'problems') refreshAoPSStatus();
  if (id === 'connections') refreshConnectionPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setRoomTheme(theme) {
  const changed = state.roomTheme !== theme;
  state.roomTheme = theme;
  $('scene').classList.remove('theme-real', 'theme-cafe', 'theme-cozy', 'theme-classroom');
  $('scene').classList.add(`theme-${theme}`);
  document.querySelectorAll('.style-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.theme === theme));
  $('room-name').textContent = 'My room';
  if (changed) save();
}
function normalizeMood(mood) { return ({ calm: 'morning', rainy: 'rain', sunny: 'sunset' })[mood] || (['morning', 'rain', 'sunset', 'night'].includes(mood) ? mood : 'morning'); }
function setMood(mood) {
  mood = normalizeMood(mood);
  const changed = state.mood !== mood;
  state.mood = mood;
  $('scene').classList.remove('mood-morning', 'mood-rain', 'mood-sunset', 'mood-night');
  $('scene').classList.add(`mood-${mood}`);
  document.body.classList.remove('mood-morning', 'mood-rain', 'mood-sunset', 'mood-night');
  document.body.classList.add(`mood-${mood}`);
  const themeColors = { morning: '#eef0e9', rain: '#e7edf0', sunset: '#f4efe2', night: '#17211f' };
  document.querySelector('meta[name="theme-color"]').content = themeColors[mood];
  syncRoomMood();
  if (changed) save();
}

function renderQuest(task, index, full) {
  return `<div class="quest ${task.done ? 'done' : ''}">
    <input class="quest-check" type="checkbox" aria-label="Complete ${escapeHtml(task.name)}" ${task.done ? 'checked disabled' : ''} onchange="completeTask(${index})">
    <div class="quest-copy"><b>${escapeHtml(task.name)}</b><small>${task.moves ? `Moved ${task.moves} day${task.moves === 1 ? '' : 's'}` : task.done ? 'Completed' : full ? `${task.xp} XP` : ''}</small></div>
    ${full ? `<div class="quest-actions"><button class="icon-button" onclick="editTask(${index})">Edit</button>${!task.done ? `<button class="icon-button" onclick="moveTask(${index})">Move</button>` : ''}<button class="icon-button" onclick="deleteTask(${index})">Delete</button></div>` : `<span class="quest-xp">${task.xp} XP</span>`}
  </div>`;
}
function render() {
  const done = state.tasks.filter(task => task.done).length;
  $('home-quests').innerHTML = state.tasks.slice(0, 3).map((task, i) => renderQuest(task, i, false)).join('') || '<p class="helper">No quests</p>';
  $('all-quests').innerHTML = state.tasks.map((task, i) => renderQuest(task, i, true)).join('') || '<p class="helper">No quests</p>';
  $('done-count').textContent = `${done} / ${state.tasks.length}`;
  $('nav-count').textContent = state.tasks.filter(task => !task.done).length;
  $('level').textContent = 1 + Math.floor(state.xp / 100);
  $('xpcount').textContent = `${state.xp % 100} / 100 XP`;
  $('xpbar').style.width = `${state.xp % 100}%`;
  $('feed').innerHTML = state.feed.map(item => `<div class="feed-item">${escapeHtml(item)}</div>`).join('');
  renderEvents();
  renderBadges();
  renderProviderStatus();
  renderIntegrations();
  refreshAoPSStatus();
}

function completeTask(index) {
  const task = state.tasks[index];
  if (!task || task.done) return;
  task.done = true;
  task.completedAt = new Date().toISOString();
  state.xp += task.xp;
  addActivity(`Quest complete: ${task.name}`);
  notify(`Quest complete. ${task.xp} XP added`);
}
function moveTask(index) {
  const task = state.tasks[index];
  if (!task) return;
  if (task.moves >= 2) return notify('This quest has already been moved twice');
  task.moves += 1;
  addActivity(`${task.name} moved forward.`);
  notify(`${2 - task.moves} move${2 - task.moves === 1 ? '' : 's'} left`);
}
function deleteTask(index) { state.tasks.splice(index, 1); save(); render(); notify('Quest removed'); }
function addTask(event) {
  event.preventDefault();
  const input = $('new-quest');
  const name = input.value.trim();
  if (!name) return;
  const xp = Math.max(0, Math.min(1000, Number($('new-quest-xp').value || 0)));
  state.tasks.push({ name, xp, done: false, moves: 0 });
  input.value = '';
  save(); render(); notify('Quest added');
}
function editTask(index) {
  const task = state.tasks[index];
  if (!task) return;
  openModal('Quest', 'Edit quest', `<label class="field-label">Name<input id="edit-quest-name" value="${escapeHtml(task.name)}"></label><label class="field-label">XP<input id="edit-quest-xp" type="number" min="0" max="1000" value="${Number(task.xp) || 0}"></label><label class="check-label"><input id="edit-quest-done" type="checkbox" ${task.done ? 'checked' : ''}> Completed</label>`);
  setModalAction('Save', () => saveTaskEdit(index));
}
function saveTaskEdit(index) {
  const task = state.tasks[index];
  if (!task) return closeModal();
  const name = $('edit-quest-name').value.trim();
  if (!name) return notify('Quest name is required');
  task.name = name;
  task.xp = Math.max(0, Math.min(1000, Number($('edit-quest-xp').value || 0)));
  task.done = $('edit-quest-done').checked;
  if (task.done && !task.completedAt) task.completedAt = new Date().toISOString();
  if (!task.done) delete task.completedAt;
  save(); render(); closeModal(); notify('Quest updated');
}

function eventsForDay(date) { return state.events.filter(item => item.date?.slice(0, 10) === date); }
function renderEvents() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  $('calendar-month').textContent = calendarCursor.toLocaleDateString([], { month: 'long', year: 'numeric' });
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  const today = localDay();
  const cells = [];
  for (let offset = 0; offset < 42; offset += 1) {
    const day = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + offset);
    const key = localDay(day);
    const dayEvents = eventsForDay(key);
    const previews = dayEvents.slice(0, 2).map(item => `<span class="calendar-event">${escapeHtml(item.name)}</span>`).join('');
    const more = dayEvents.length > 2 ? `<span class="calendar-more">+${dayEvents.length - 2} more</span>` : '';
    const classes = ['calendar-day', day.getMonth() === month ? '' : 'outside', key === today ? 'today' : ''].filter(Boolean).join(' ');
    const label = `${day.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`;
    cells.push(`<button type="button" class="${classes}" aria-label="${escapeHtml(label)}" onclick="openCalendarDay('${key}')"><span class="calendar-number">${day.getDate()}</span><span class="calendar-events">${previews}${more}</span></button>`);
  }
  $('events').innerHTML = cells.join('');
}
function changeCalendarMonth(amount) {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + amount, 1);
  renderEvents();
}
function goToCurrentMonth() {
  const now = new Date();
  calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1);
  renderEvents();
}
async function openCalendarDay(date) {
  const [journal, coffee, sessions, coding] = await Promise.all([roomDB.get('journals', date), roomDB.getAll('coffee'), roomDB.getAll('problemSessions'), roomDB.setting(`coding-${date}`)]);
  const dayEvents = eventsForDay(date);
  const coffees = coffee.filter(item => item.date === date);
  const attempts = sessions.filter(item => item.date === date);
  const quests = state.tasks.filter(task => task.completedAt?.slice(0, 10) === date);
  const eventRows = dayEvents.map(item => {
    const index = state.events.indexOf(item);
    const time = new Date(item.date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `<div class="calendar-detail-row"><span><b>${escapeHtml(item.name)}</b><small>${time}, ${Number(item.duration) || 60} minutes</small></span><span class="device-actions"><button onclick="addEventToProvider(${index})">Send</button><button onclick="deleteEvent(${index}, '${date}')">Delete</button></span></div>`;
  }).join('') || '<p class="helper">No events scheduled.</p>';
  const details = `<div class="calendar-detail">${eventRows}<div class="calendar-day-summary"><span><b>${coffees.length}/2</b> coffee</span><span><b>${attempts.filter(item => item.solved).length}</b> problems solved</span><span><b>${quests.length}</b> quests completed</span><span><b>${Number(coding?.minutes) || 0}</b> coding minutes</span></div>${journal ? `<div class="calendar-journal"><b>${escapeHtml(journal.title || 'Journal entry')}</b><p>${escapeHtml(journal.text || '').replace(/\n/g, '<br>')}</p></div>` : '<p class="helper">No journal entry.</p>'}<div class="action-row"><button class="primary" onclick="prefillEventForDay('${date}')">Add event</button><button onclick="openHistoryFromCalendar('${date}')">Open daily history</button></div></div>`;
  openModal('Calendar', new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }), details);
}
function prefillEventForDay(date) {
  closeModal();
  $('event-date').value = `${date}T09:00`;
  $('event-name').focus();
}
function openHistoryFromCalendar(date) {
  closeModal();
  $('history-date').value = date;
  showPage('daily');
  renderDailyHistory(date);
}
function addEvent(event) {
  event.preventDefault();
  const name = $('event-name').value.trim();
  const date = $('event-date').value;
  if (!name || !date) return notify('Add both a name and a time.');
  const duration = Math.max(5, Number($('event-duration').value || 60));
  state.events.push({ id: makeId(), name, date, duration, updatedAt: new Date().toISOString() });
  state.events.sort((a, b) => a.date.localeCompare(b.date));
  const added = new Date(date);
  calendarCursor = new Date(added.getFullYear(), added.getMonth(), 1);
  $('event-name').value = ''; $('event-date').value = '';
  save(); render(); notify('Focus block saved');
}
function deleteEvent(index, reopenDate = '') {
  state.events.splice(index, 1); save(); render();
  if (reopenDate) openCalendarDay(reopenDate);
}

const calendarProviderURLs = {
  google: 'https://calendar.google.com/calendar/u/0/r',
  outlook: 'https://outlook.live.com/calendar/0/view/month',
  icloud: 'https://www.icloud.com/calendar/'
};
function openCalendarSetup() {
  const current = state.calendarProvider || {};
  openModal('Calendar', 'Add calendar provider', `<label class="field-label">Provider<select id="calendar-provider"><option value="google">Google Calendar</option><option value="outlook">Outlook Calendar</option><option value="icloud">Apple Calendar</option><option value="other">Other</option></select></label><label class="field-label">Provider URL<input id="calendar-provider-url" type="url" placeholder="https://"></label>`);
  $('calendar-provider').value = current.type || 'google';
  $('calendar-provider-url').value = current.url || '';
  setModalAction('Save', saveCalendarProvider);
}
function saveCalendarProvider() {
  const type = $('calendar-provider').value;
  const customURL = $('calendar-provider-url').value.trim();
  if (type === 'other' && !isSafeWebURL(customURL)) return notify('Add a valid HTTPS provider URL');
  state.calendarProvider = { type, url: type === 'other' ? customURL : calendarProviderURLs[type] };
  save(); renderProviderStatus(); closeModal(); notify('Calendar provider saved');
}
function renderProviderStatus() {
  const labels = { google: 'Google Calendar', outlook: 'Outlook Calendar', icloud: 'Apple Calendar', other: 'Other calendar' };
  $('calendar-provider-status').textContent = state.calendarProvider ? labels[state.calendarProvider.type] : 'No provider';
}
function openCalendarProvider() {
  if (!state.calendarProvider) return openCalendarSetup();
  openExternal(state.calendarProvider.url);
}
function formatCalendarDate(date) {
  return new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
function eventICS(event) {
  const start = new Date(event.date);
  const end = new Date(start.getTime() + (Number(event.duration) || 60) * 60000);
  const clean = value => String(value).replace(/[\\;,\n]/g, character => `\\${character}`);
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Room Quest//EN\r\nBEGIN:VEVENT\r\nUID:${makeId()}@roomquest.local\r\nDTSTAMP:${formatCalendarDate(new Date())}\r\nDTSTART:${formatCalendarDate(start)}\r\nDTEND:${formatCalendarDate(end)}\r\nSUMMARY:${clean(event.name)}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
}
function downloadText(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadEventICS(index) {
  const event = state.events[index];
  if (event) downloadText(`${event.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'event'}.ics`, eventICS(event), 'text/calendar');
}
function exportCalendar() {
  if (!state.events.length) return notify('No events to export');
  const bodies = state.events.map(event => eventICS(event).split('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Room Quest//EN\r\n')[1].replace('END:VCALENDAR\r\n', '')).join('');
  downloadText('room-quest-calendar.ics', `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Room Quest//EN\r\n${bodies}END:VCALENDAR\r\n`, 'text/calendar');
}
function addEventToProvider(index) {
  const event = state.events[index];
  if (!event) return;
  if (!state.calendarProvider) return openCalendarSetup();
  const start = new Date(event.date);
  const end = new Date(start.getTime() + (Number(event.duration) || 60) * 60000);
  const type = state.calendarProvider.type;
  if (type === 'google') return openExternal(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.name)}&dates=${formatCalendarDate(start)}/${formatCalendarDate(end)}`);
  if (type === 'outlook') return openExternal(`https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(event.name)}&startdt=${encodeURIComponent(start.toISOString())}&enddt=${encodeURIComponent(end.toISOString())}`);
  downloadEventICS(index);
}

function renderBadges() {
  const automatic = { firstQuest: state.tasks.some(task => task.done), coffee: state.cups > 0, levelTwo: state.xp >= 100 };
  $('badges').innerHTML = state.achievements.map((achievement, index) => {
    const unlocked = typeof achievement.unlocked === 'boolean' ? achievement.unlocked : Boolean(automatic[achievement.autoKey]);
    return `<article class="keepsake ${unlocked ? '' : 'locked'}"><h2>${escapeHtml(achievement.name)}</h2><p class="helper">${escapeHtml(achievement.description || '')}</p><div class="action-row"><button onclick="editAchievement(${index})">Edit</button><button onclick="toggleAchievement(${index})">${unlocked ? 'Lock' : 'Unlock'}</button><button onclick="deleteAchievement(${index})">Delete</button></div></article>`;
  }).join('') || '<div class="card"><p>No achievements</p></div>';
}
function addAchievement(event) {
  event.preventDefault();
  const name = $('achievement-name').value.trim();
  if (!name) return notify('Achievement name is required');
  state.achievements.push({ name, description: $('achievement-description').value.trim(), unlocked: false });
  $('achievement-name').value = ''; $('achievement-description').value = '';
  save(); renderBadges(); notify('Achievement added');
}
function editAchievement(index) {
  const achievement = state.achievements[index];
  if (!achievement) return;
  const automatic = { firstQuest: state.tasks.some(task => task.done), coffee: state.cups > 0, levelTwo: state.xp >= 100 };
  const unlocked = typeof achievement.unlocked === 'boolean' ? achievement.unlocked : Boolean(automatic[achievement.autoKey]);
  openModal('Achievement', 'Edit achievement', `<label class="field-label">Name<input id="edit-achievement-name" value="${escapeHtml(achievement.name)}"></label><label class="field-label">Description<input id="edit-achievement-description" value="${escapeHtml(achievement.description || '')}"></label><label class="check-label"><input id="edit-achievement-unlocked" type="checkbox" ${unlocked ? 'checked' : ''}> Unlocked</label>`);
  setModalAction('Save', () => saveAchievementEdit(index));
}
function saveAchievementEdit(index) {
  const achievement = state.achievements[index];
  const name = $('edit-achievement-name').value.trim();
  if (!achievement || !name) return notify('Achievement name is required');
  achievement.name = name;
  achievement.description = $('edit-achievement-description').value.trim();
  achievement.unlocked = $('edit-achievement-unlocked').checked;
  save(); renderBadges(); closeModal(); notify('Achievement updated');
}
function toggleAchievement(index) {
  const achievement = state.achievements[index];
  if (!achievement) return;
  const automatic = { firstQuest: state.tasks.some(task => task.done), coffee: state.cups > 0, levelTwo: state.xp >= 100 };
  const unlocked = typeof achievement.unlocked === 'boolean' ? achievement.unlocked : Boolean(automatic[achievement.autoKey]);
  achievement.unlocked = !unlocked;
  save(); renderBadges();
}
function deleteAchievement(index) {
  state.achievements.splice(index, 1);
  save(); renderBadges(); notify('Achievement deleted');
}

function logCoffee() { openCoffeeDialog(); }
function deviceInfo(name) {
  if (name === 'Mac') return openSSHSetup();
  if (name === 'Laptop') return openCodingSetup();
  openMailSetup();
}
function avatarMarkup() {
  const colors = ['#688b83', '#7f6f9a', '#c47b67', '#6d839f', '#8b9363'];
  const color = colors.includes(state.avatar.color) ? state.avatar.color : colors[0];
  const extras = { none: '', beanie: '<path d="M-12-38 Q0-53 12-38Z" fill="#d08a68" stroke="#504c5b" stroke-width="2"/>', scarf: '<path d="M-12-25 Q0-18 12-25 L10-18 Q0-12-10-18Z" fill="#d8ad6d"/>' };
  return `<ellipse cy="-3" rx="14" ry="5" fill="#3b3548" opacity=".2"/><path d="M-13-23 Q0-33 13-23 L10-5 H-10Z" fill="${color}" stroke="#504c5b" stroke-width="2"/><circle cy="-36" r="11" fill="#e4b996" stroke="#504c5b" stroke-width="2"/>${extras[state.avatar.accessory] || ''}`;
}
function roomAPI() { return $('little-room-frame')?.contentWindow?.LittleRoom; }
function syncRoomMood() { const room = roomAPI(); if (room) room.render(normalizeMood(state.mood)); }
function syncAvatar() { const room = roomAPI(); if (room) room.setAvatar({ x: 5.2, y: 5.4, markup: avatarMarkup() }); }
function setupRoom() { const room = roomAPI(); if (!room) return; room.onObjectActivate = handleRoomObject; syncRoomMood(); syncAvatar(); }
function handleRoomObject(id) {
  if (id === 'wardrobe') return openAvatarCustomization();
  if (id === 'macbook') return openSSHDevice('MacBook');
  if (id === 'miniPc') return openSSHSetup('Mini PC');
  if (id === 'mokaPot') return openCoffeeStation();
  if (id === 'bed') return openOfflineDialog();
  if (id === 'bookTable' || id === 'books') return openStudyStation();
}
function openAvatarCustomization() {
  openModal('Avatar', 'Customize bean', '<label class="field-label">Color<select id="avatar-color"><option value="#688b83">Sage</option><option value="#7f6f9a">Plum</option><option value="#c47b67">Clay</option><option value="#6d839f">Blue</option><option value="#8b9363">Olive</option></select></label><label class="field-label">Accessory<select id="avatar-accessory"><option value="none">None</option><option value="beanie">Beanie</option><option value="scarf">Scarf</option></select></label>');
  $('avatar-color').value = state.avatar.color; $('avatar-accessory').value = state.avatar.accessory; setModalAction('Save', saveAvatar);
}
function saveAvatar() { state.avatar = { color: $('avatar-color').value, accessory: $('avatar-accessory').value }; save(); syncAvatar(); closeModal(); notify('Avatar updated'); }
async function openCoffeeStation() {
  const entries = (await roomDB.getAll('coffee')).filter(item => item.date === localDay());
  const rows = entries.map(item => `<p><b>${escapeHtml(item.drink)}</b><br><span class="muted">${new Date(item.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></p>`).join('') || '<p class="muted">No coffee logged today.</p>';
  openModal('Coffee', `Coffee station ${entries.length}/2`, `${rows}<div class="action-row"><button class="primary" onclick="openCoffeeFromStation()">Log coffee</button><button onclick="closeModal();showPage('daily')">Daily history</button></div>`);
}
function openCoffeeFromStation() { closeModal(); openCoffeeDialog(); }
function openStudyStation() { openModal('Study', 'AoPS Alcumus', `<p class="muted">${state.aopsAccount?.username ? escapeHtml(state.aopsAccount.username) : 'No AoPS account saved'}</p><div class="action-row"><button class="primary" onclick="openAlcumus()">Open Alcumus</button><button onclick="openAoPSSetup()">Account settings</button><button onclick="closeModal();showPage('problems')">Study desk</button></div>`); }
function openOfflineDialog() { openModal('Dashboard', state.offline ? 'Resume dashboard' : 'Go offline', `<p class="muted">${state.offline ? 'External providers and sync are paused.' : 'Local notes, quests, coffee logs, and history remain available.'}</p>`); setModalAction(state.offline ? 'Resume' : 'Go offline', () => setDashboardOffline(!state.offline)); }
function setDashboardOffline(value) { state.offline = Boolean(value); save(); applyOfflineState(); closeModal(); notify(state.offline ? 'Dashboard offline' : 'Dashboard online'); }
function applyOfflineState() { document.body.classList.toggle('dashboard-offline', state.offline); $('offline-banner').classList.toggle('hidden', !state.offline); }
function openModal(label, title, body) {
  $('modal-label').textContent = label; $('modal-title').textContent = title; $('modal-body').innerHTML = body; if (!$('modal').open) $('modal').showModal();
  setModalAction('Done', closeModal);
}
function closeModal() { $('modal').close(); }
function setModalAction(label, handler) {
  const button = $('modal-action');
  button.textContent = label;
  button.onclick = handler;
}
const integrations = [
  ['SSH', 'SSH terminal'],
  ['Calendar', 'Calendar provider'],
  ['Mail', 'Mail provider'],
  ['AoPS', 'AoPS Alcumus'],
  ['Coding', 'Coding activity'],
  ['Weather', 'Weather']
];
function renderIntegrations() {
  $('integrations').innerHTML = integrations.map(([shortName, name]) => `<div class="integration"><span class="integration-icon">${shortName}</span><span><b>${name}</b><small>${integrationStatus(name)}</small></span><button onclick="openIntegration('${name}')">Set up</button></div>`).join('');
}
function integrationStatus(name) {
  if (name === 'Calendar provider') return state.calendarProvider?.type || 'Not set';
  if (name === 'Mail provider') return state.mailProvider?.type || 'Not set';
  if (name === 'AoPS Alcumus') return state.aopsAccount?.username || 'Not set';
  return 'Local settings';
}
function openIntegration(name) {
  if (name === 'Weather') return openWeatherSetup();
  if (name === 'Coding activity') return openCodingSetup();
  if (name === 'SSH terminal') return openSSHSetup();
  if (name === 'Calendar provider') return openCalendarSetup();
  if (name === 'Mail provider') return openMailSetup();
  if (name === 'AoPS Alcumus') return openAoPSSetup();
}

function isSafeWebURL(value) {
  try { return new URL(value).protocol === 'https:'; } catch (_) { return false; }
}
function openExternal(url) {
  if (state.offline) return notify('Dashboard is offline');
  if (!isSafeWebURL(url)) return notify('Invalid provider URL');
  window.open(url, '_blank', 'noopener,noreferrer');
}

const mailProviderURLs = {
  gmail: { inbox: 'https://mail.google.com/', compose: 'https://mail.google.com/mail/?view=cm&fs=1' },
  outlook: { inbox: 'https://outlook.office.com/mail/', compose: 'https://outlook.office.com/mail/deeplink/compose' },
  yahoo: { inbox: 'https://mail.yahoo.com/', compose: 'https://compose.mail.yahoo.com/' },
  proton: { inbox: 'https://mail.proton.me/', compose: 'https://mail.proton.me/u/0/inbox' }
};
function openMailSetup() {
  const current = state.mailProvider || {};
  openModal('Mail', 'Add mail provider', `<label class="field-label">Provider<select id="mail-provider"><option value="gmail">Gmail</option><option value="outlook">Outlook</option><option value="yahoo">Yahoo Mail</option><option value="proton">Proton Mail</option><option value="other">Other</option></select></label><label class="field-label">Email address<input id="mail-address" type="email" autocomplete="email"></label><label class="field-label">Provider URL<input id="mail-provider-url" type="url" placeholder="https://"></label><div class="action-row"><button onclick="openMailProvider('inbox')">Open inbox</button><button onclick="openMailProvider('compose')">Compose</button></div>`);
  $('mail-provider').value = current.type || 'gmail';
  $('mail-address').value = current.address || '';
  $('mail-provider-url').value = current.url || '';
  setModalAction('Save', saveMailProvider);
}
function saveMailProvider() {
  const type = $('mail-provider').value;
  const customURL = $('mail-provider-url').value.trim();
  if (type === 'other' && !isSafeWebURL(customURL)) return notify('Add a valid HTTPS provider URL');
  state.mailProvider = { type, address: $('mail-address').value.trim(), url: type === 'other' ? customURL : mailProviderURLs[type].inbox };
  save(); renderIntegrations(); closeModal(); notify('Mail provider saved');
}
function openMailProvider(action = 'inbox') {
  const provider = state.mailProvider || { type: $('mail-provider')?.value || 'gmail', url: $('mail-provider-url')?.value || '' };
  if (provider.type === 'other') return openExternal(provider.url);
  openExternal(mailProviderURLs[provider.type][action]);
}

function openAoPSSetup() {
  const current = state.aopsAccount || {};
  openModal('AoPS', 'Alcumus settings', `<label class="field-label">AoPS username<input id="aops-username" value="${escapeHtml(current.username || '')}"></label><label class="field-label">Current topic<input id="aops-topic" value="${escapeHtml(current.topic || '')}" placeholder="Geometry, Algebra, Number Theory"></label><div class="action-row"><button onclick="openAlcumus()">Open Alcumus</button></div>`);
  setModalAction('Save', saveAoPSSettings);
}
function saveAoPSSettings() {
  state.aopsAccount = { username: $('aops-username').value.trim(), topic: $('aops-topic').value.trim() };
  save(); refreshAoPSStatus(); renderIntegrations(); closeModal(); notify('AoPS settings saved');
}
function refreshAoPSStatus() {
  const status = $('aops-status');
  if (status) status.textContent = state.aopsAccount?.username ? `${state.aopsAccount.username}${state.aopsAccount.topic ? `, ${state.aopsAccount.topic}` : ''}` : 'No account saved';
}
function openAlcumus() { openExternal('https://artofproblemsolving.com/alcumus'); }
async function recordAlcumusResult(solved) {
  await roomDB.put('problemSessions', { id: makeId(), problemId: 'alcumus', title: state.aopsAccount?.topic || 'Alcumus', date: localDay(), at: new Date().toISOString(), solved, work: '' });
  if (solved) { state.xp += 20; addActivity('Alcumus problem solved. 20 XP added'); }
  notify(solved ? 'Solved problem recorded' : 'Attempt recorded');
}

const localDay = date => {
  const value = date || new Date();
  const shifted = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
};
const localDateTime = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const makeId = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function showNoteTab(tab) {
  document.querySelectorAll('[data-note-tab]').forEach(button => button.classList.toggle('active', button.dataset.noteTab === tab));
  document.querySelectorAll('.note-panel').forEach(panel => panel.classList.add('hidden'));
  $(`note-${tab}`).classList.remove('hidden');
  if (tab === 'vault') refreshVault();
}
async function loadJournal(date) {
  const entry = await roomDB.get('journals', date);
  $('journal-title').value = entry?.title || '';
  $('journal-text').value = entry?.text || '';
  $('save-state').textContent = entry ? 'Saved locally' : 'New local entry';
}
async function saveJournal() {
  const date = $('journal-date').value || localDay();
  const entry = { date, title: $('journal-title').value.trim(), text: $('journal-text').value, updatedAt: new Date().toISOString() };
  await roomDB.put('journals', entry);
  let vaultCopy = false;
  const vault = await roomDB.setting('vaultHandle');
  if (vault) {
    try {
      let permission = await vault.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') permission = await vault.requestPermission({ mode: 'readwrite' });
      if (permission === 'granted') {
        const folder = await vault.getDirectoryHandle('Room Quest Journal', { create: true });
        const file = await folder.getFileHandle(`${date}.md`, { create: true });
        const writer = await file.createWritable();
        await writer.write(`# ${entry.title || date}\n\n${entry.text}\n`);
        await writer.close();
        vaultCopy = true;
      }
    } catch (error) { console.warn('Vault journal copy was not written', error); }
  }
  $('save-state').textContent = vaultCopy ? 'Saved locally + vault' : 'Saved locally';
  notify(vaultCopy ? 'Journal saved here and in Obsidian' : 'Journal saved on this device');
}
async function connectVault() {
  if (!window.showDirectoryPicker) return notify('Folder access is not supported in this browser. Journals still save locally.');
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await roomDB.setSetting('vaultHandle', handle);
    await refreshVault();
    notify('Vault folder connected locally');
  } catch (error) { if (error.name !== 'AbortError') notify('Could not open that folder'); }
}
async function forgetVault() {
  await roomDB.delete('settings', 'vaultHandle');
  $('vault-status').textContent = 'No vault connected';
  $('vault-files').innerHTML = '';
  notify('Vault folder forgotten by Room Quest');
}
async function refreshVault() {
  const handle = await roomDB.setting('vaultHandle');
  if (!handle) { $('vault-status').textContent = 'No vault connected'; $('vault-files').innerHTML = ''; return; }
  $('vault-status').textContent = `Connected: ${handle.name}`;
  try {
    const names = [];
    for await (const entry of handle.values()) if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.md')) names.push(entry.name);
    $('vault-files').innerHTML = names.slice(0, 30).map(name => `<div class="vault-file">${escapeHtml(name)}</div>`).join('') || '<p class="helper">No Markdown files at the vault root. New journals will go into Room Quest Journal.</p>';
  } catch (_) { $('vault-files').innerHTML = '<p class="helper">Click “Choose vault folder” again to renew access.</p>'; }
}

function openCoffeeDialog() {
  $('coffee-time').value = localDateTime();
  $('coffee-drink').value = '';
  $('coffee-photo').value = '';
  $('coffee-preview').innerHTML = '';
  $('coffee-dialog').showModal();
}
function closeCoffeeDialog() { $('coffee-dialog').close(); }
async function compressPhoto(file) {
  if (!file) return null;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .82));
}
async function saveCoffee(event) {
  event.preventDefault();
  const timestamp = $('coffee-time').value;
  const date = timestamp.slice(0, 10);
  const entries = (await roomDB.getAll('coffee')).filter(item => item.date === date);
  if (entries.length >= 2) return notify('Two coffees are already logged for this day. Limit reached.');
  const photo = await compressPhoto($('coffee-photo').files[0]);
  await roomDB.put('coffee', { id: makeId(), date, timestamp, drink: $('coffee-drink').value.trim(), photo, createdAt: new Date().toISOString() });
  state.cups += 1; state.xp += 5; addActivity(`Coffee logged: ${$('coffee-drink').value.trim()}. +5 XP`);
  closeCoffeeDialog();
  await refreshCoffeeStatus();
  notify('Coffee saved locally');
}
async function refreshCoffeeStatus() {
  const today = localDay();
  const entries = (await roomDB.getAll('coffee')).filter(item => item.date === today);
  $('cups').textContent = `${entries.length} of 2 today${entries.length === 2 ? ', limit reached' : ''}`;
}

let studyDocumentURL = null;
async function openStudyDocument(files) {
  const file = files?.[0];
  if (!file) return;
  clearStudyDocument(false);
  $('document-name').textContent = file.name;
  const extension = file.name.split('.').pop().toLowerCase();
  if (file.type.startsWith('image/')) {
    studyDocumentURL = URL.createObjectURL(file);
    $('document-viewer').innerHTML = `<img src="${studyDocumentURL}" alt="${escapeHtml(file.name)}">`;
    return;
  }
  if (['txt', 'md', 'html'].includes(extension) || file.type.startsWith('text/')) {
    $('document-viewer').innerHTML = `<pre>${escapeHtml(await file.text())}</pre>`;
    return;
  }
  studyDocumentURL = URL.createObjectURL(file);
  $('document-viewer').innerHTML = `<iframe src="${studyDocumentURL}" title="${escapeHtml(file.name)}"></iframe>`;
}
function clearStudyDocument(resetInput = true) {
  if (studyDocumentURL) URL.revokeObjectURL(studyDocumentURL);
  studyDocumentURL = null;
  $('document-viewer').innerHTML = '';
  $('document-name').textContent = '';
  if (resetInput) $('study-document').value = '';
}

async function renderDailyHistory(date = localDay()) {
  date = date || localDay();
  $('history-date').value = date;
  const [journal, coffee, sessions, coding] = await Promise.all([roomDB.get('journals', date), roomDB.getAll('coffee'), roomDB.getAll('problemSessions'), roomDB.setting(`coding-${date}`)]);
  const coffees = coffee.filter(item => item.date === date);
  const attempts = sessions.filter(item => item.date === date);
  const quests = state.tasks.filter(task => task.completedAt?.slice(0, 10) === date);
  const coffeeHtml = coffees.length ? `<div class="coffee-gallery">${coffees.map(item => `<div class="coffee-entry">${item.photo ? `<img src="${URL.createObjectURL(item.photo)}" alt="${escapeHtml(item.drink)}">` : ''}<b>${escapeHtml(item.drink)}</b><small>${new Date(item.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</small></div>`).join('')}</div>` : '<p class="helper">No coffee logged.</p>';
  $('daily-summary').innerHTML = `<article class="daily-card"><h2>Journal</h2>${journal ? `<b>${escapeHtml(journal.title || 'Journal entry')}</b><p>${escapeHtml(journal.text).replace(/\n/g, '<br>')}</p>` : '<p class="helper">No journal entry</p>'}</article><article class="daily-card"><h2>Coffee ${coffees.length}/2</h2>${coffeeHtml}</article><article class="daily-card"><h2>Problems</h2><p><b>${attempts.filter(item => item.solved).length}</b> solved, ${attempts.length} attempts</p>${attempts.map(item => `<p class="helper">${item.solved ? 'Solved' : 'Attempted'}: ${escapeHtml(item.title)}</p>`).join('')}</article><article class="daily-card"><h2>Coding</h2><p>${coding ? `<b>${Number(coding.minutes) || 0} minutes</b><br><span class="helper">${escapeHtml(coding.provider || 'Manual')}</span>` : '<span class="helper">No coding data</span>'}</p></article><article class="daily-card full"><h2>Completed quests</h2>${quests.length ? quests.map(task => `<p>${escapeHtml(task.name)}</p>`).join('') : '<p class="helper">No completed quests</p>'}</article>`;
}

function openWeatherSetup() {
  openModal('Weather', 'Weather source', '<div class="action-row"><button onclick="useBrowserWeather()">Browser location</button><button onclick="useIPWeather()">IP estimate</button></div>');
}
async function useBrowserWeather() {
  if (state.offline) return notify('Dashboard is offline');
  if (!navigator.geolocation) return notify('Location is not supported in this browser.');
  navigator.geolocation.getCurrentPosition(position => fetchWeather(position.coords.latitude, position.coords.longitude, 'browser location'), () => notify('Location permission was not granted.'));
}
async function useIPWeather() {
  if (state.offline) return notify('Dashboard is offline');
  try { const place = await (await fetch('https://ipapi.co/json/')).json(); await fetchWeather(place.latitude, place.longitude, `IP estimate, ${place.city || 'nearby'}`); }
  catch (_) { notify('Could not estimate location from IP.'); }
}
async function fetchWeather(latitude, longitude, source) {
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&current=temperature_2m,weather_code,is_day&timezone=auto`);
    const weather = await response.json();
    await roomDB.setSetting('weather', { source, latitude, longitude, current: weather.current, updatedAt: new Date().toISOString() });
    const rainy = [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(weather.current.weather_code);
    setMood(weather.current.is_day ? (rainy ? 'rain' : 'morning') : 'night');
    $('speech').querySelector('span').textContent = `${Math.round(weather.current.temperature_2m)} degrees, ${source}`;
    notify('Window weather updated');
  } catch (_) { notify('Weather service could not be reached.'); }
}

async function openCodingSetup() {
  const embed = await roomDB.setting('wakatimeEmbed', '');
  const companion = await roomDB.setting('hackatimeCompanion', '');
  const today = await roomDB.setting(`coding-${localDay()}`, null);
  openModal('Coding', 'Coding activity', `<label class="field-label">WakaTime share JSON URL<input id="waka-embed" value="${escapeHtml(embed)}" placeholder="https://wakatime.com/share/user/id.json"></label><label class="field-label">Hackatime companion WSS URL<input id="hackatime-companion" value="${escapeHtml(companion)}" placeholder="wss://"></label><label class="field-label">Minutes today<input id="coding-minutes" type="number" min="0" step="1" value="${Number(today?.minutes) || 0}"></label>`);
  setModalAction('Save', saveCodingSettings);
}
async function saveCodingSettings() {
  const embed = $('waka-embed').value.trim();
  const companion = $('hackatime-companion').value.trim();
  if (embed) await roomDB.setSetting('wakatimeEmbed', embed);
  if (companion) await roomDB.setSetting('hackatimeCompanion', companion);
  const minutes = Number($('coding-minutes').value || 0);
  if (minutes) await roomDB.setSetting(`coding-${localDay()}`, { minutes, provider: embed ? 'WakaTime' : companion ? 'Hackatime companion' : 'Manual' });
  closeModal(); notify('Coding settings saved');
}

function openSSHSetup(defaultName = '') {
  openModal('SSH', 'SSH preset', '<label class="field-label">Preset name<input id="ssh-name" placeholder="Mac"></label><label class="field-label">Host or IP<input id="ssh-host" placeholder="192.168.1.20"></label><label class="field-label">Username<input id="ssh-user"></label><label class="field-label">Port<input id="ssh-port" type="number" value="22"></label><label class="field-label">Password<input id="ssh-password" type="password" autocomplete="new-password"></label><label class="field-label">Encryption passphrase<input id="ssh-passphrase" type="password" autocomplete="new-password"></label><label class="field-label">Companion WSS URL<input id="ssh-companion" placeholder="wss://"></label>');
  setModalAction('Save', saveSSHPreset);
  $('ssh-name').value = defaultName;
}
async function openSSHDevice(name) {
  const presets = await roomDB.setting('sshPresets', []);
  const index = presets.findIndex(item => item.name.toLowerCase() === name.toLowerCase());
  if (index < 0) return openSSHSetup(name);
  const preset = presets[index];
  openModal('SSH', preset.name, `<p><b>${escapeHtml(preset.user)}@${escapeHtml(preset.host)}</b><br><span class="muted">Port ${Number(preset.port) || 22}</span></p>`);
  setModalAction('Copy command', () => copySSHCommand(index));
}
const bytesToBase64 = bytes => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
};
async function encryptLocalSecret(secret, passphrase) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(secret)));
  return { salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
}
async function saveSSHPreset() {
  const password = $('ssh-password').value;
  const passphrase = $('ssh-passphrase').value;
  if (password && !passphrase) return notify('Add a local passphrase to encrypt the password.');
  const preset = { id: makeId(), name: $('ssh-name').value.trim() || 'Mac', host: $('ssh-host').value.trim(), user: $('ssh-user').value.trim(), port: Number($('ssh-port').value || 22), companion: $('ssh-companion').value.trim(), encryptedPassword: password ? await encryptLocalSecret(password, passphrase) : null, createdAt: new Date().toISOString() };
  if (!preset.host || !preset.user) return notify('Host and username are required.');
  const presets = await roomDB.setting('sshPresets', []); presets.push(preset); await roomDB.setSetting('sshPresets', presets);
  closeModal(); renderSSHPresets(); notify('SSH preset saved');
}

async function renderSSHPresets() {
  const root = $('ssh-presets');
  if (!root) return;
  const presets = await roomDB.setting('sshPresets', []);
  root.innerHTML = presets.length ? presets.map((preset, index) => `<div class="device-row"><span><b>${escapeHtml(preset.name)}</b><small>${escapeHtml(preset.user)}@${escapeHtml(preset.host)}:${Number(preset.port) || 22}${preset.encryptedPassword ? ', encrypted password stored locally' : ''}</small></span><span class="device-actions"><button onclick="copySSHCommand(${index})">Copy command</button><button onclick="deleteSSHPreset(${index})">Delete</button></span></div>`).join('') : '<p class="muted">No SSH devices saved.</p>';
}
async function copySSHCommand(index) {
  const presets = await roomDB.setting('sshPresets', []);
  const preset = presets[index];
  if (!preset) return;
  const command = `ssh -p ${Number(preset.port) || 22} ${preset.user}@${preset.host}`;
  try { await navigator.clipboard.writeText(command); notify('SSH command copied'); }
  catch (_) { notify(command); }
}
async function deleteSSHPreset(index) {
  const presets = await roomDB.setting('sshPresets', []);
  presets.splice(index, 1);
  await roomDB.setSetting('sshPresets', presets);
  renderSSHPresets();
}

const SYNC_STORES = ['journals', 'coffee', 'problems', 'problemSessions', 'settings'];
const SYNC_PRIVATE_SETTINGS = new Set(['vaultHandle', 'sshPresets', 'syncConfig']);
const base64ToBytes = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
const blobToDataURL = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
async function dataURLToBlob(value) { return value ? (await fetch(value)).blob() : null; }

function normalizeSyncEndpoint(value) {
  try {
    const url = new URL(value.trim());
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return null;
    return url.origin;
  } catch (_) { return null; }
}
function setSyncStatus(message, kind = '') {
  const badge = $('sync-status');
  if (!badge) return;
  badge.textContent = message;
  badge.className = `status-badge ${kind}`.trim();
}
async function getSyncConfig() {
  const saved = await roomDB.setting('syncConfig', {});
  return {
    endpoint: saved.endpoint || '', token: saved.token || '', name: saved.name || '',
    deviceId: saved.deviceId || `device_${makeId().replace(/[^a-zA-Z0-9_-]/g, '')}`,
    serverId: saved.serverId || '', serverName: saved.serverName || '',
    revision: Number(saved.revision || 0), lastSyncAt: saved.lastSyncAt || null
  };
}
async function saveSyncSettings(silent = false) {
  const current = await getSyncConfig();
  const endpoint = normalizeSyncEndpoint($('sync-endpoint').value);
  const token = $('sync-token').value.trim();
  const name = $('sync-device-name').value.trim();
  if (!endpoint) return notify('Use an HTTPS Tailscale companion URL');
  if (token.length < 24) return notify('The access token must contain at least 24 characters');
  if (!name) return notify('Name this device');
  const config = { ...current, endpoint, token, name };
  await roomDB.setSetting('syncConfig', config);
  if (!silent) notify('Sync settings saved on this device');
  return config;
}
async function syncRequest(config, path, options = {}) {
  const response = await fetch(`${config.endpoint}${path}`, {
    ...options,
    headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json', ...(options.headers || {}) },
    cache: 'no-store'
  });
  let body = {};
  try { body = await response.json(); } catch (_) {}
  if (!response.ok) throw Object.assign(new Error(body.error || `Sync request failed (${response.status})`), { status: response.status, body });
  return body;
}
async function loadSyncSettings() {
  const config = await getSyncConfig();
  $('sync-endpoint').value = config.endpoint;
  $('sync-token').value = config.token;
  $('sync-device-name').value = config.name || (/iPhone|Android/i.test(navigator.userAgent) ? 'Phone' : navigator.platform || 'Device');
  $('sync-seed').textContent = config.serverId ? `Trusted seed: ${config.serverName || 'Room Quest companion'} (${config.serverId.slice(0, 12)})` : 'No sync seed trusted.';
  setSyncStatus(config.lastSyncAt ? `Synced ${new Date(config.lastSyncAt).toLocaleString()}` : 'Not connected', config.lastSyncAt ? 'online' : '');
}
function pinSyncSeed(config, manifest) {
  if (!manifest?.nodeId || !/^rq_[a-zA-Z0-9_-]{12,80}$/.test(manifest.nodeId)) throw new Error('The companion did not provide a valid seed identity');
  if (config.serverId && config.serverId !== manifest.nodeId) throw new Error('Sync seed identity changed. Check the URL before trusting it again.');
  return { ...config, serverId: manifest.nodeId, serverName: String(manifest.nodeName || 'Room Quest companion').slice(0, 80) };
}
async function testSyncConnection() {
  if (state.offline) return notify('Dashboard is offline');
  let config = await saveSyncSettings(true);
  if (!config) return;
  setSyncStatus('Testing');
  try {
    config = pinSyncSeed(config, await syncRequest(config, '/health'));
    await roomDB.setSetting('syncConfig', config);
    const result = await syncRequest(config, '/api/snapshots');
    renderSyncDevices(result.snapshots || []);
    $('sync-seed').textContent = `Trusted seed: ${config.serverName} (${config.serverId.slice(0, 12)})`;
    setSyncStatus('Connected', 'online');
    notify('Tailscale companion connected');
  } catch (error) { setSyncStatus('Connection failed', 'error'); notify(error.message); }
}
function renderSyncDevices(snapshots) {
  const root = $('sync-devices');
  if (!root) return;
  root.innerHTML = snapshots.length ? snapshots.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(item => `<div class="device-row"><span><b>${escapeHtml(item.name || 'Device')}</b><small>${escapeHtml(item.platform || 'Unknown platform')} · revision ${Number(item.revision) || 0} · ${new Date(item.updatedAt).toLocaleString()}</small></span><span class="status-badge online">Recognized</span></div>`).join('') : '<p class="muted">No devices have synced yet.</p>';
}
async function exportRoomSnapshot(sync = {}) {
  const stores = {};
  for (const store of SYNC_STORES) {
    let records = await roomDB.getAll(store);
    if (store === 'settings') records = records.filter(row => !SYNC_PRIVATE_SETTINGS.has(row.key));
    if (store === 'coffee') records = await Promise.all(records.map(async row => ({ ...row, photo: row.photo instanceof Blob ? await blobToDataURL(row.photo) : row.photo || null })));
    stores[store] = records;
  }
  return { schema: 1, savedAt: state._savedAt || new Date(0).toISOString(), sync: { author: sync.author || '', revision: Number(sync.revision || 0) }, state: JSON.parse(JSON.stringify(state)), stores };
}
function recordTime(record) {
  const value = record.updatedAt || record.createdAt || record.timestamp || record.at || '';
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
function mergeRoomSnapshots(snapshots) {
  const ordered = snapshots.filter(item => item?.schema === 1).sort((a, b) => {
    const revision = Number(a.sync?.revision || 0) - Number(b.sync?.revision || 0);
    if (revision) return revision;
    const author = String(a.sync?.author || '').localeCompare(String(b.sync?.author || ''));
    return author || Date.parse(a.savedAt || 0) - Date.parse(b.savedAt || 0);
  });
  const newest = ordered[ordered.length - 1];
  if (!newest) throw new Error('No readable Room Quest snapshots');
  const merged = { schema: 1, savedAt: new Date().toISOString(), sync: newest.sync || { author: '', revision: 0 }, state: newest.state, stores: {} };
  for (const store of SYNC_STORES) {
    const keyName = store === 'journals' ? 'date' : store === 'settings' ? 'key' : 'id';
    const records = new Map();
    for (const snapshot of ordered) for (const record of snapshot.stores?.[store] || []) {
      const key = record[keyName];
      if (key == null || (store === 'settings' && SYNC_PRIVATE_SETTINGS.has(key))) continue;
      const previous = records.get(key);
      if (!previous || recordTime(record) >= recordTime(previous)) records.set(key, record);
    }
    merged.stores[store] = [...records.values()];
  }
  merged.state._savedAt = merged.savedAt;
  merged.state._revision = Math.max(...ordered.map(item => Number(item.state?._revision || 0))) + 1;
  return merged;
}
async function deriveSyncKey(passphrase, salt, usage) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, [usage]);
}
async function encryptSyncSnapshot(snapshot, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveSyncKey(passphrase, salt, 'encrypt');
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  return { schema: 1, cipher: 'AES-GCM-256', kdf: 'PBKDF2-SHA256', iterations: 310000, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) };
}
async function decryptSyncSnapshot(envelope, passphrase) {
  if (!envelope || envelope.schema !== 1 || envelope.iterations !== 310000) throw new Error('Unsupported sync envelope');
  const salt = base64ToBytes(envelope.salt); const iv = base64ToBytes(envelope.iv);
  const key = await deriveSyncKey(passphrase, salt, 'decrypt');
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, base64ToBytes(envelope.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
async function importRoomSnapshot(snapshot) {
  const privateRows = (await roomDB.getAll('settings')).filter(row => SYNC_PRIVATE_SETTINGS.has(row.key));
  for (const store of SYNC_STORES) {
    let records = snapshot.stores[store] || [];
    if (store === 'coffee') records = await Promise.all(records.map(async row => ({ ...row, photo: typeof row.photo === 'string' ? await dataURLToBlob(row.photo) : null })));
    if (store === 'settings') records = [...records, ...privateRows];
    await roomDB.replaceAll(store, records);
  }
  localStorage.setItem('roomquest-v1', JSON.stringify(snapshot.state));
}
async function syncNow() {
  if (state.offline) return notify('Dashboard is offline');
  let config = await saveSyncSettings(true);
  const passphrase = $('sync-passphrase').value;
  if (!config || passphrase.length < 10) return notify('Enter a shared encryption passphrase with at least 10 characters');
  const card = document.querySelector('.sync-card');
  card?.classList.add('sync-progress'); setSyncStatus('Syncing');
  try {
    config = pinSyncSeed(config, await syncRequest(config, '/health'));
    const remote = await syncRequest(config, '/api/snapshots');
    renderSyncDevices(remote.snapshots || []);
    const decoded = [];
    for (const item of remote.snapshots || []) {
      const snapshot = await decryptSyncSnapshot(item.envelope, passphrase);
      snapshot.sync = { author: item.deviceId, revision: Number(item.revision || 0) };
      decoded.push(snapshot);
    }
    const revision = Math.max(config.revision, ...(remote.snapshots || []).map(item => Number(item.revision || 0)), 0) + 1;
    decoded.push(await exportRoomSnapshot({ author: config.deviceId, revision }));
    const merged = mergeRoomSnapshots(decoded);
    merged.sync = { author: config.deviceId, revision };
    const envelope = await encryptSyncSnapshot(merged, passphrase);
    await syncRequest(config, `/api/snapshots/${encodeURIComponent(config.deviceId)}`, { method: 'PUT', body: JSON.stringify({ name: config.name, platform: navigator.userAgent.slice(0, 120), revision, envelope }) });
    await importRoomSnapshot(merged);
    await roomDB.setSetting('syncConfig', { ...config, revision, lastSyncAt: new Date().toISOString() });
    setSyncStatus('Synced', 'online'); notify('Room Quest data synced');
    setTimeout(() => location.reload(), 700);
  } catch (error) {
    console.error(error); setSyncStatus('Sync failed', 'error');
    notify(error.name === 'OperationError' ? 'Could not decrypt. Check the shared passphrase.' : error.message);
  } finally { card?.classList.remove('sync-progress'); }
}
async function refreshConnectionPage() { await Promise.all([loadSyncSettings(), renderSSHPresets()]); }

let timerSeconds = 1500;
let timerInterval = null;
function updateClock() {
  $('clock').textContent = `${String(Math.floor(timerSeconds / 60)).padStart(2, '0')}:${String(timerSeconds % 60).padStart(2, '0')}`;
  $('timer-ring').style.setProperty('--timer-progress', `${((1500 - timerSeconds) / 1500) * 100}%`);
}
function toggleTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; $('timer-button').textContent = 'Resume'; return; }
  $('timer-button').textContent = 'Pause';
  timerInterval = setInterval(() => {
    timerSeconds -= 1; updateClock();
    if (timerSeconds <= 0) {
      clearInterval(timerInterval); timerInterval = null; state.xp += 25; timerSeconds = 1500; updateClock();
      $('timer-button').textContent = 'Start'; addActivity('Focus session complete. 25 XP added'); notify('Focus session complete');
    }
  }, 1000);
}
function resetTimer() { clearInterval(timerInterval); timerInterval = null; timerSeconds = 1500; updateClock(); $('timer-button').textContent = 'Start'; }

$('mobile-menu').addEventListener('click', () => $('sidebar').classList.toggle('open'));
$('notepad').value = state.notes;
$('notepad').addEventListener('input', () => { state.notes = $('notepad').value; save(); $('save-state').textContent = 'Saved just now'; });
$('journal-date').value = localDay();
$('journal-date').addEventListener('change', () => loadJournal($('journal-date').value));
$('history-date').value = localDay();
$('coffee-photo').addEventListener('change', event => {
  const file = event.target.files[0];
  $('coffee-preview').innerHTML = file ? `<img src="${URL.createObjectURL(file)}" alt="Coffee preview">` : '';
});
state.mood = normalizeMood(state.mood);
$('mood').value = state.mood;
$('today-label').textContent = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
$('daily-line').textContent = '';
if (!stored.roomLayoutVersion) { state.roomTheme = 'real'; state.roomLayoutVersion = 2; save(); }
setRoomTheme(state.roomTheme || 'real');
setMood(state.mood || 'morning');
applyOfflineState();
$('little-room-frame').addEventListener('load', setupRoom);
if (roomAPI()) setupRoom();
updateClock();
render();
loadJournal(localDay());
refreshCoffeeStatus();
renderProviderStatus();
renderIntegrations();
refreshAoPSStatus();
refreshConnectionPage();
